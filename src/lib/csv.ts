import Papa from "papaparse";
import type { LoadedFile, PricingRow } from "./types";
import { normHeader, parseDecimal, parsePeriod } from "./format";
import { getDeParaBySku, getMissingDeParaFields, type DeParaEntry } from "./depara";
import { getInovacao, getLegado } from "./deparaInovacao";
import {
  getCanalAjustado,
  getUfFromRegiao,
  getMercadoAjustadoFromRegiao,
  getRegionalFromUf,
} from "./deparaComercial";
import { createStringInterner, internTrimmed } from "./stringIntern";
import { REAL_HEADER_MAP as HEADER_MAP } from "./intake/headerMaps";


const GENERIC_UNIT_HEADERS = new Set(["1000", "1000kg", "1000brl"]);

function detectDelimiter(sample: string): string {
  const counts = [";", ",", "\t", "|"].map((d) => ({
    d,
    n: (sample.match(new RegExp(`\\${d}`, "g")) || []).length,
  }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].d || ";";
}

function canonicalHeaderScore(cells: string[]): number {
  let score = 0;
  for (const cell of cells) {
    const canonical = HEADER_MAP[normHeader(cell)];
    if (canonical && canonical !== "ignore") {
      score++;
      if (canonical === "periodo") score += 100;
      if (canonical === "sku" || canonical === "cliente" || canonical === "canal") score += 10;
    }
  }
  return score;
}

function prepareCsvForParsing(text: string, delimiter: string): string {
  const preview = Papa.parse<string[]>(text, {
    delimiter,
    header: false,
    skipEmptyLines: true,
    preview: 20,
  });
  const rows = preview.data;
  let headerIndex = 0;
  let bestScore = -1;

  for (let index = 0; index < rows.length; index++) {
    const score = canonicalHeaderScore(rows[index]);
    if (score > bestScore) {
      bestScore = score;
      headerIndex = index;
    }
  }

  if (headerIndex === 0) return text;

  const header = [...rows[headerIndex]];
  for (let col = 0; col < header.length; col++) {
    const key = normHeader(header[col] ?? "");
    if (HEADER_MAP[key] && !GENERIC_UNIT_HEADERS.has(key)) continue;

    for (let row = headerIndex - 1; row >= 0; row--) {
      const candidate = rows[row]?.[col];
      const candidateKey = normHeader(candidate ?? "");
      if (candidate && HEADER_MAP[candidateKey] && candidateKey !== "real") {
        header[col] = candidate;
        break;
      }
    }
  }

  const lines = text.split(/\r?\n/);
  return `${Papa.unparse([header], { delimiter })}\n${lines.slice(headerIndex + 1).join("\n")}`;
}

export interface MissingSkuItem {
  sku: string;
  descricao?: string;
  /** Entry do De Para (parcial) — vazio quando o SKU nem existe no De Para. */
  entry?: Partial<DeParaEntry>;
  /** Campos do De Para que estão vazios para esse SKU. */
  missingFields: (keyof DeParaEntry)[];
}

export interface MissingMappings {
  /** SKUs com qualquer campo do De Para faltando (ausentes ou parcialmente preenchidos). */
  skus: MissingSkuItem[];
  canais: string[];           // Canal distrib. sem De Para Comercial
  regioes: string[];          // Região sem De Para (UF/Mercado Ajustado)
  ufs: string[];              // UF sem De Para Regional
}

export interface ParsedCsv {
  rows: PricingRow[];
  file: LoadedFile;
  warnings: string[];
  missing: MissingMappings;
}

export async function parseCsvFile(file: File): Promise<ParsedCsv> {
  // Try UTF-8 first; fallback to Windows-1252 if replacement char detected
  let text = await file.text();
  if (text.includes("\uFFFD")) {
    try {
      const buf = await file.arrayBuffer();
      text = new TextDecoder("windows-1252").decode(buf);
    } catch {
      /* keep utf-8 */
    }
  }

  const sample = text.split("\n").slice(0, 5).join("\n");
  const delimiter = detectDelimiter(sample);
  const parseText = prepareCsvForParsing(text, delimiter);

  const result = Papa.parse<string[]>(parseText, {
    header: false,
    delimiter,
    skipEmptyLines: true,
  });
  const [headerRow = [], ...dataRows] = result.data;
  if (result.errors.length) {
    // eslint-disable-next-line no-console
    console.log(`[CSV] ${file.name} — erros do parser:`, result.errors.slice(0, 5));
  }
  return parseRealTable(headerRow.map((h) => String(h ?? "").trim()), dataRows, file.name, { delimiter });
}

/**
 * Coluna → campo do app. Mesma regra para CSV e planilha: cabeçalhos com o
 * MESMO texto valem pela primeira ocorrência (como o leitor de CSV sempre
 * fez); nomes diferentes que caem no mesmo campo valem pela última.
 */
export function mapRealColumns(headers: string[]): { colMap: Map<number, keyof PricingRow>; unmapped: string[] } {
  const colMap = new Map<number, keyof PricingRow>();
  const unmapped: string[] = [];
  const seenText = new Set<string>();
  const fieldCol = new Map<keyof PricingRow, number>();
  headers.forEach((rawHeader, index) => {
    const text = String(rawHeader ?? "").trim();
    const canonical = HEADER_MAP[normHeader(text)];
    if (!canonical || canonical === "ignore") {
      unmapped.push(text);
      return;
    }
    if (seenText.has(text)) return;
    seenText.add(text);
    const previous = fieldCol.get(canonical);
    if (previous !== undefined) colMap.delete(previous);
    fieldCol.set(canonical, index);
    colMap.set(index, canonical);
  });
  return { colMap, unmapped };
}

/** Índice da coluna de período da base Real (ou -1). */
export function realPeriodColumn(headers: string[]): number {
  for (const [index, field] of mapRealColumns(headers).colMap) if (field === "periodo") return index;
  return -1;
}

const REAL_NUMERIC_FIELDS = new Set<keyof PricingRow>([
  "rol", "volumeKg", "cogs", "margemBruta", "contribMarginal",
  "frete", "comissao", "materiaPrima", "embalagem", "mod", "cif",
]);

/**
 * Lê a base Real a partir de uma tabela (cabeçalho + linhas). Usado pelo CSV
 * do KE30 e pelas abas de planilha (Base One) — as duas fontes geram
 * exatamente as mesmas linhas.
 */
export function parseRealTable(
  headers: string[],
  dataRows: ArrayLike<unknown>[],
  fileName: string,
  diagnostics: { delimiter?: string } = {},
): ParsedCsv {
  const intern = createStringInterner();
  const warnings: string[] = [];
  const rows: PricingRow[] = [];
  const monthsSet = new Set<string>();

  // Tracking de valores ausentes nos De Paras
  // SKUs pendentes (ausentes OU parcialmente preenchidos no De Para)
  const missingSkus = new Map<string, MissingSkuItem>();
  const missingCanais = new Set<string>();
  const missingRegioes = new Set<string>();
  const missingUfs = new Set<string>();

  const { colMap, unmapped } = mapRealColumns(headers);
  const columns = Array.from(colMap.entries());

  // Diagnostics counters
  let rejectedNoPeriod = 0;
  let firstFailureSample: ArrayLike<unknown> | null = null;

  // Detect missing critical columns
  const mappedFields = new Set(colMap.values());
  if (!mappedFields.has("periodo")) {
    warnings.push(
      `Coluna de período não encontrada. Headers detectados: ${headers.join(", ") || "(nenhum)"}.`,
    );
  }
  if (!mappedFields.has("rol")) {
    warnings.push(
      `Coluna de receita (ROL) não encontrada. Headers detectados: ${headers.join(", ") || "(nenhum)"}.`,
    );
  }

  for (const raw of dataRows) {
    if (!raw) continue;
    const obj: Partial<PricingRow> = {};
    for (const [index, dest] of columns) {
      const val = raw[index];
      if (REAL_NUMERIC_FIELDS.has(dest)) {
        (obj as Record<string, number>)[dest] = parseDecimal(val);
      } else {
        (obj as Record<string, string>)[dest] = internTrimmed(val, intern);
      }
    }

    // Split "Artigo (SKU)" — ex.: "100009 CHOC LEITE MELKEN 1X"
    // → sku: "100009", skuDesc: "CHOC LEITE MELKEN 1X"
    if (obj.sku) {
      const m = obj.sku.match(/^\s*(\d{3,})\s*[-–—:.\s]+\s*(.+?)\s*$/);
      if (m) {
        obj.sku = intern(m[1]);
        if (!obj.skuDesc) obj.skuDesc = intern(m[2]);
      }
    }

    // De Para — sobrescreve atributos do SKU com a fonte de verdade.
    // Mesmo que a base tenha os campos preenchidos, o De Para tem prioridade.
    const dp = getDeParaBySku(obj.sku);
    if (dp) {
      obj.categoria = dp.categoria ? intern(dp.categoria) : obj.categoria;
      obj.subcategoria = dp.subcategoria ? intern(dp.subcategoria) : obj.subcategoria;
      obj.formato = dp.formato ? intern(dp.formato) : obj.formato;
      obj.marca = dp.marca ? intern(dp.marca) : obj.marca;
      obj.tecnologia = dp.tecnologia ? intern(dp.tecnologia) : obj.tecnologia;
      obj.mercado = dp.mercado ? intern(dp.mercado) : obj.mercado;
      obj.faixaPeso = dp.faixaPeso ? intern(dp.faixaPeso) : obj.faixaPeso;
      obj.sabor = dp.sabor ? intern(dp.sabor) : obj.sabor;
      obj.skuDesc = dp.skuDesc ? intern(dp.skuDesc) : obj.skuDesc;
    }
    // SKU pendente: ausente OU presente com algum campo vazio.
    if (obj.sku) {
      const missingFields = getMissingDeParaFields(obj.sku);
      if (missingFields.length > 0 && !missingSkus.has(obj.sku)) {
        missingSkus.set(obj.sku, {
          sku: obj.sku,
          descricao: obj.skuDesc,
          entry: dp ?? undefined,
          missingFields,
        });
      }
    }

    // De Para Comercial — Canal Ajustado, UF, Mercado Ajustado, Regional.
    // Sempre tem prioridade sobre o que veio do CSV.
    if (obj.canal) {
      const canalAj = getCanalAjustado(obj.canal);
      if (canalAj) obj.canalAjustado = intern(canalAj);
      else missingCanais.add(obj.canal);
    }

    if (obj.regiao) {
      const uf = getUfFromRegiao(obj.regiao);
      const mercadoAj = getMercadoAjustadoFromRegiao(obj.regiao);
      if (uf) obj.uf = intern(uf);
      if (mercadoAj) obj.mercadoAjustado = intern(mercadoAj);
      if (!uf && !mercadoAj) missingRegioes.add(obj.regiao);
    }

    if (obj.uf) {
      const regional = getRegionalFromUf(obj.uf);
      if (regional) obj.regional = intern(regional);
      else missingUfs.add(obj.uf);
    }

    // De Para de Inovação — classifica SKU como "Inovação" ou "Regular" + legado.
    obj.inovacao = intern(getInovacao(obj.sku));
    const legado = getLegado(obj.sku);
    obj.legado = legado ? intern(legado) : legado;


    const period = parsePeriod(obj.periodo as string);
    if (!period) {
      rejectedNoPeriod++;
      if (!firstFailureSample) firstFailureSample = raw;
      continue;
    }
    obj.periodo = intern(period.periodo);
    obj.mes = period.mes;
    obj.ano = period.ano;
    obj.fy = intern(period.fy);
    obj.fyNum = period.fyNum;

    obj.rol = obj.rol ?? 0;
    obj.volumeKg = obj.volumeKg ?? 0;
    obj.materiaPrima = obj.materiaPrima ?? 0;
    obj.embalagem = obj.embalagem ?? 0;
    obj.mod = obj.mod ?? 0;
    obj.cif = obj.cif ?? 0;
    obj.custoVariavel = (obj.materiaPrima ?? 0) + (obj.embalagem ?? 0);
    obj.custoFixo = (obj.mod ?? 0) + (obj.cif ?? 0);
    obj.cogs = obj.custoVariavel ?? 0;
    obj.margemBruta = obj.margemBruta ?? (obj.rol! - obj.cogs!);
    obj.frete = obj.frete ?? 0;
    obj.comissao = obj.comissao ?? 0;
    obj.contribMarginal = obj.contribMarginal ?? (obj.margemBruta! - obj.frete! - obj.comissao!);

    // Importa TODAS as linhas com período válido — inclusive negativos
    // (devoluções, abatimentos) e linhas integralmente zeradas.
    monthsSet.add(period.periodo);
    rows.push(obj as PricingRow);
  }

  // Diagnostics output
  // eslint-disable-next-line no-console
  console.groupCollapsed(`[Real] ${fileName} — diagnóstico`);
  if (diagnostics.delimiter) console.log("Delimitador detectado:", JSON.stringify(diagnostics.delimiter));
  console.log("Total de linhas brutas:", dataRows.length);
  console.log("Headers brutos:", headers);
  console.log("Mapeamento aplicado:", Object.fromEntries(columns.map(([i, f]) => [headers[i], f])));
  console.log("Headers ignorados (sem mapeamento):", unmapped);
  console.log("Rejeitadas (período inválido):", rejectedNoPeriod);
  console.log("Linhas importadas:", rows.length);
  if (firstFailureSample) console.log("Exemplo de linha rejeitada:", Array.from(firstFailureSample));
  console.groupEnd();

  if (rows.length === 0) {
    const reasons: string[] = [];
    if (!mappedFields.has("periodo")) reasons.push("coluna de período não encontrada");
    if (!mappedFields.has("rol")) reasons.push("coluna de receita não encontrada");
    if (rejectedNoPeriod > 0) reasons.push(`${rejectedNoPeriod} linhas com período inválido`);
    warnings.push(
      `Nenhuma linha válida. ${reasons.join("; ") || "Verifique o formato."}. Veja o console para detalhes.`,
    );
  }

  return {
    rows,
    file: {
      name: fileName,
      rowCount: rows.length,
      months: Array.from(monthsSet).sort(),
    },
    warnings,
    missing: {
      skus: Array.from(missingSkus.values()).sort((a, b) => a.sku.localeCompare(b.sku)),
      canais: Array.from(missingCanais).sort(),
      regioes: Array.from(missingRegioes).sort(),
      ufs: Array.from(missingUfs).sort(),
    },
  };
}
