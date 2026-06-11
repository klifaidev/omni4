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

// Map of normalized header → canonical field
// Keys are normalized via normHeader (lowercase, no accents/spaces/punct).
const HEADER_MAP: Record<string, keyof PricingRow | "ignore"> = {
  // period
  periodo: "periodo",
  periodoano: "periodo",          // "Período/ano"
  mes: "periodo",
  mesano: "periodo",
  anomes: "periodo",
  competencia: "periodo",
  data: "periodo",
  // dims — marca
  marca: "marca",
  "02marca": "marca",
  brand: "marca",
  // canal
  canal: "canal",
  canalvenda: "canal",
  canaldevenda: "canal",
  canaldistrib: "canal",          // "Canal distrib."
  canaldistribuicao: "canal",
  channel: "canal",
  // categoria
  categoria: "categoria",
  "01categoria": "categoria",
  category: "categoria",
  familia: "categoria",
  "03familia": "categoria",
  // subcategoria / formato
  subcategoria: "subcategoria",
  "04formato": "subcategoria",
  formato: "subcategoria",
  subcategory: "subcategoria",
  // sku / artigo
  sku: "sku",
  artigo: "sku",
  codsku: "sku",
  codigosku: "sku",
  codigo: "sku",
  cdsku: "sku",
  // descrição produto
  descricaosku: "skuDesc",
  descricao: "skuDesc",
  descsku: "skuDesc",
  produto: "skuDesc",
  product: "skuDesc",
  item: "skuDesc",
  // cliente
  cliente: "cliente",
  client: "cliente",
  customer: "cliente",
  razaosocial: "cliente",
  // região
  regiao: "regiao",
  uf: "regiao",
  estado: "regiao",
  region: "regiao",
  // mercado
  mercado: "mercado",
  "05mercado": "mercado",
  market: "mercado",
  // sabor
  sabor: "sabor",
  "07sabor": "sabor",
  flavor: "sabor",
  // tecnologia
  tecnologia: "tecnologia",
  technology: "tecnologia",
  // faixa peso
  faixapeso: "faixaPeso",
  faixadepeso: "faixaPeso",
  "06faixadepeso": "faixaPeso",
  weightrange: "faixaPeso",
  // measures — receita
  rol: "rol",
  receita: "rol",
  receitaliquida: "rol",
  recliquida: "rol",              // "Rec. Líquida"
  receitaoperacionalliquida: "rol",
  netrevenue: "rol",
  netsales: "rol",
  faturamento: "rol",
  faturamentoliquido: "rol",
  vendaliquida: "rol",
  // volume
  volume: "volumeKg",
  volumekg: "volumeKg",
  kg: "volumeKg",
  pesoliquido: "volumeKg",        // "Peso líquido"
  qtdkg: "volumeKg",
  quantidade: "volumeKg",
  qtde: "volumeKg",
  // custo
  cogs: "cogs",
  cmv: "cogs",
  cpv: "cogs",                    // "CPV"
  custo: "cogs",
  custototal: "cogs",
  custovariavel: "cogs",
  // margem bruta
  margembruta: "margemBruta",
  mb: "margemBruta",
  grossmargin: "margemBruta",
  // contribuição marginal
  contribuicaomarginal: "contribMarginal",
  contribmarginal: "contribMarginal",
  cm: "contribMarginal",
  margemcontribuicao: "contribMarginal",
  // frete sobre vendas
  frete: "frete",
  fretesobrevendas: "frete",
  fretevendas: "frete",
  freight: "frete",
  // comissão
  comissao: "comissao",
  comissaorepres: "comissao",
  comissaorepresentante: "comissao",
  comissaorepresentantes: "comissao",
  commission: "comissao",
  // CPV components (Matéria Prima e Embalagem) — exibidos no DRE
  materiaprima: "materiaPrima",
  materiaprimaajustado: "materiaPrima",
  materiaprimaajust: "materiaPrima",
  mp: "materiaPrima",
  rawmaterial: "materiaPrima",
  embalagem: "embalagem",
  embalagemajustado: "embalagem",
  embalagemajust: "embalagem",
  packaging: "embalagem",
  // custo fixo components (MOD e CIF)
  mod: "mod",
  modajustado: "mod",
  maodeobra: "mod",
  maodeobraajustado: "mod",
  cif: "cif",
  cifajustado: "cif",
  // STATUS é apenas ignorada aqui (a separação Real/Budget acontece na aba Budget,
  // a partir do XLSX de Budget — o CSV Real importa todas as linhas).
  status: "ignore",
  // explicit ignores (avoid noise in unmapped list)
  ctbmg: "ignore",                // "Ctb. Mg. %"
  gestorresp: "ignore",
  centro: "ignore",
};

function detectDelimiter(sample: string): string {
  const counts = [";", ",", "\t", "|"].map((d) => ({
    d,
    n: (sample.match(new RegExp(`\\${d}`, "g")) || []).length,
  }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].d || ";";
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

  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    delimiter,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const warnings: string[] = [];
  const rows: PricingRow[] = [];
  const monthsSet = new Set<string>();

  // Tracking de valores ausentes nos De Paras
  // SKUs pendentes (ausentes OU parcialmente preenchidos no De Para)
  const missingSkus = new Map<string, MissingSkuItem>();
  const missingCanais = new Set<string>();
  const missingRegioes = new Set<string>();
  const missingUfs = new Set<string>();

  // Build column map
  const sampleRow = result.data[0] ?? {};
  const allHeaders = Object.keys(sampleRow);
  const colMap: Record<string, keyof PricingRow> = {};
  const unmapped: string[] = [];
  for (const rawHeader of allHeaders) {
    const key = normHeader(rawHeader);
    const canonical = HEADER_MAP[key];
    if (canonical && canonical !== "ignore") {
      colMap[rawHeader] = canonical as keyof PricingRow;
    } else {
      unmapped.push(rawHeader);
    }
  }

  // Diagnostics counters
  let rejectedNoPeriod = 0;
  let firstFailureSample: Record<string, unknown> | null = null;

  // Detect missing critical columns
  const mappedFields = new Set(Object.values(colMap));
  if (!mappedFields.has("periodo")) {
    warnings.push(
      `Coluna de período não encontrada. Headers detectados: ${allHeaders.join(", ") || "(nenhum)"}.`,
    );
  }
  if (!mappedFields.has("rol")) {
    warnings.push(
      `Coluna de receita (ROL) não encontrada. Headers detectados: ${allHeaders.join(", ") || "(nenhum)"}.`,
    );
  }

  for (const raw of result.data) {
    const obj: Partial<PricingRow> = {};
    for (const [src, dest] of Object.entries(colMap)) {
      const val = raw[src];
      if (
        dest === "rol" || dest === "volumeKg" || dest === "cogs" ||
        dest === "margemBruta" || dest === "contribMarginal" ||
        dest === "frete" || dest === "comissao" ||
        dest === "materiaPrima" || dest === "embalagem" ||
        dest === "mod" || dest === "cif"
      ) {
        (obj as Record<string, number>)[dest] = parseDecimal(val);
      } else {
        (obj as Record<string, string>)[dest] = (val ?? "").toString().trim();
      }
    }

    // Split "Artigo (SKU)" — ex.: "100009 CHOC LEITE MELKEN 1X"
    // → sku: "100009", skuDesc: "CHOC LEITE MELKEN 1X"
    if (obj.sku) {
      const m = obj.sku.match(/^\s*(\d{3,})\s*[-–—:.\s]+\s*(.+?)\s*$/);
      if (m) {
        obj.sku = m[1];
        if (!obj.skuDesc) obj.skuDesc = m[2];
      }
    }

    // De Para — sobrescreve atributos do SKU com a fonte de verdade.
    // Mesmo que a base tenha os campos preenchidos, o De Para tem prioridade.
    const dp = getDeParaBySku(obj.sku);
    if (dp) {
      obj.categoria = dp.categoria || obj.categoria;
      obj.subcategoria = dp.subcategoria || obj.subcategoria;
      obj.formato = dp.formato || obj.formato;
      obj.marca = dp.marca || obj.marca;
      obj.tecnologia = dp.tecnologia || obj.tecnologia;
      obj.mercado = dp.mercado || obj.mercado;
      obj.faixaPeso = dp.faixaPeso || obj.faixaPeso;
      obj.sabor = dp.sabor || obj.sabor;
      obj.skuDesc = dp.skuDesc || obj.skuDesc;
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
      if (canalAj) obj.canalAjustado = canalAj;
      else missingCanais.add(obj.canal);
    }

    if (obj.regiao) {
      const uf = getUfFromRegiao(obj.regiao);
      const mercadoAj = getMercadoAjustadoFromRegiao(obj.regiao);
      if (uf) obj.uf = uf;
      if (mercadoAj) obj.mercadoAjustado = mercadoAj;
      if (!uf && !mercadoAj) missingRegioes.add(obj.regiao);
    }

    if (obj.uf) {
      const regional = getRegionalFromUf(obj.uf);
      if (regional) obj.regional = regional;
      else missingUfs.add(obj.uf);
    }

    // De Para de Inovação — classifica SKU como "Inovação" ou "Regular" + legado.
    obj.inovacao = getInovacao(obj.sku);
    obj.legado = getLegado(obj.sku);


    const period = parsePeriod(obj.periodo as string);
    if (!period) {
      rejectedNoPeriod++;
      if (!firstFailureSample) firstFailureSample = raw;
      continue;
    }
    obj.periodo = period.periodo;
    obj.mes = period.mes;
    obj.ano = period.ano;
    obj.fy = period.fy;
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
  console.groupCollapsed(`[CSV] ${file.name} — diagnóstico`);
  console.log("Delimitador detectado:", JSON.stringify(delimiter));
  console.log("Total de linhas brutas:", result.data.length);
  console.log("Headers brutos:", allHeaders);
  console.log("Mapeamento aplicado:", colMap);
  console.log("Headers ignorados (sem mapeamento):", unmapped);
  console.log("Rejeitadas (período inválido):", rejectedNoPeriod);
  console.log("Linhas importadas:", rows.length);
  if (firstFailureSample) console.log("Exemplo de linha rejeitada:", firstFailureSample);
  if (result.errors.length) console.log("Erros do parser:", result.errors.slice(0, 5));
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
      name: file.name,
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
