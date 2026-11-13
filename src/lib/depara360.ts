// De/Para 360 — todos os De/Paras do app num xlsx só, para circular no time.
//
// O arquivo é o mesmo que a Central baixa (uma aba por De/Para). Ao anexar,
// cada aba é reconhecida pelas colunas, não pelo nome nem pela posição, e o
// app compara com o que já usa: só o que muda vira correção. Célula vazia no
// arquivo não apaga nada do app.
import { normHeader } from "./format";
import { DEPARA_FIELDS, getDeParaBySku, type DeParaEntry, type DeParaOverrideEntry } from "./depara";
import { COMERCIAL_MAP_IDS, getComercialEntries, normComercialKey, type ComercialMapId } from "./deparaComercial";
import { getInovacaoMap, type InovacaoEntry } from "./deparaInovacao";
import { normalizeClassificacao, normalizeSku } from "./parseDeparaInovacao";

type SheetKind = "hierarquia" | "inovacao" | ComercialMapId;

const SKU_FIELD_HEADERS: Record<keyof DeParaEntry, string[]> = {
  skuDesc: ["Descrição", "Descricao", "Descrição SKU", "Desc SKU"],
  // "PARA - 01 Categoria": layout DE/PARA da planilha do time (e do arquivo baixado).
  categoria: ["Categoria", "PARA - 01 Categoria"],
  subcategoria: ["Subcategoria", "PARA - Subcategoria"],
  marca: ["Marca", "PARA - 02 Marca"],
  tecnologia: ["Tecnologia", "PARA - 03 Tecnologia", "PARA - 03 Família"],
  formato: ["Formato", "PARA - 04 Formato"],
  mercado: ["Mercado", "PARA - 05 Mercado"],
  faixaPeso: ["Faixa de Peso", "Faixa Peso", "PARA - 06 Faixa de Peso"],
  sabor: ["Sabor", "PARA - 07 Sabor"],
};

const SKU_HEADERS = ["SKU", "Artigo", "Cod Material", "Código Material", "Codigo Material", "Material"];

const COMERCIAL_HEADERS: Record<ComercialMapId, { from: string[]; to: string[] }> = {
  canalToCanalAjustado: { from: ["Canal Origem", "Canal"], to: ["Canal Ajustado"] },
  regiaoToMercadoAjustado: { from: ["Região Origem", "Regiao Origem", "Região", "Regiao"], to: ["Mercado Ajustado"] },
  regiaoToUf: { from: ["Região Origem", "Regiao Origem", "Região", "Regiao"], to: ["UF"] },
  ufToRegional: { from: ["UF"], to: ["Regional"] },
};

function col(headers: string[], aliases: string[]): number {
  const wanted = new Set(aliases.map(normHeader));
  return headers.findIndex((h) => wanted.has(h));
}

function classify(headers: string[]): SheetKind | null {
  const has = (aliases: string[]) => col(headers, aliases) >= 0;
  if (has(SKU_HEADERS) && has(SKU_FIELD_HEADERS.categoria)) return "hierarquia";
  if (has(SKU_HEADERS) && has(["Classificação", "Classificacao"])) return "inovacao";
  // Região → Mercado antes de Região → UF: as duas começam pela região.
  for (const id of ["canalToCanalAjustado", "regiaoToMercadoAjustado", "regiaoToUf", "ufToRegional"] as ComercialMapId[]) {
    const { from, to } = COMERCIAL_HEADERS[id];
    if (has(from) && has(to)) {
      if (id === "regiaoToUf" && has(COMERCIAL_HEADERS.regiaoToMercadoAjustado.to)) continue;
      if (id === "ufToRegional" && has(COMERCIAL_HEADERS.regiaoToUf.from)) continue;
      return id;
    }
  }
  return null;
}

const text = (v: unknown) => String(v ?? "").trim();
const isBlank = (v: string) => !v || v.toUpperCase() === "TBD";

/**
 * Na planilha DE/PARA do time os valores vêm com o código da hierarquia
 * ("A3 Decoração", "B1 Top"); o app guarda só o nome ("Decoração", "Top").
 */
export function stripHierarchyCode(value: string): string {
  return value.replace(/^[A-Z]{1,2}\d{1,3}\s+(?=\S)/, "");
}

export interface DePara360 {
  fileName: string;
  /** Abas reconhecidas no arquivo. */
  found: SheetKind[];
  sku: Record<string, DeParaOverrideEntry>;
  inovacao: Record<string, InovacaoEntry> | null;
  comercial: Record<ComercialMapId, Record<string, string>>;
}

/** Lê o xlsx do De/Para 360. Lança erro se nenhuma aba for reconhecida. */
export async function parseDePara360(file: File): Promise<DePara360> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const out: DePara360 = {
    fileName: file.name,
    found: [],
    sku: {},
    inovacao: null,
    comercial: Object.fromEntries(COMERCIAL_MAP_IDS.map((id) => [id, {}])) as DePara360["comercial"],
  };

  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: "" });
    let headerAt = -1;
    let kind: SheetKind | null = null;
    for (let i = 0; i < Math.min(rows.length, 10) && !kind; i++) {
      kind = classify(rows[i].map((h) => normHeader(text(h))));
      if (kind) headerAt = i;
    }
    if (!kind || out.found.includes(kind)) continue;
    out.found.push(kind);
    const headers = rows[headerAt].map((h) => normHeader(text(h)));
    const body = rows.slice(headerAt + 1);

    if (kind === "hierarquia") {
      const skuCol = col(headers, SKU_HEADERS);
      const fieldCols = DEPARA_FIELDS.map((f) => [f, col(headers, SKU_FIELD_HEADERS[f])] as const).filter(([, c]) => c >= 0);
      const deParaLayout = headers.some((h) => /^para\d/.test(h));
      for (const row of body) {
        const sku = normalizeSku(row[skuCol]);
        if (!sku) continue;
        const entry: DeParaOverrideEntry = {};
        for (const [field, c] of fieldCols) {
          const raw = text(row[c]);
          const value = deParaLayout && field !== "skuDesc" ? stripHierarchyCode(raw) : raw;
          if (!isBlank(value)) entry[field] = value;
        }
        if (Object.keys(entry).length) out.sku[sku] = { ...(out.sku[sku] ?? {}), ...entry };
      }
    } else if (kind === "inovacao") {
      const skuCol = col(headers, SKU_HEADERS);
      const classCol = col(headers, ["Classificação", "Classificacao"]);
      const anoCol = col(headers, ["Ano de Lançamento", "Ano de Lancamento", "Ano Lancamento", "Lançamento"]);
      const legadoCol = col(headers, ["Legado"]);
      const map: Record<string, InovacaoEntry> = {};
      for (const row of body) {
        const sku = normalizeSku(row[skuCol]);
        if (!sku) continue;
        const ano = anoCol >= 0 ? text(row[anoCol]) : "";
        const legado = legadoCol >= 0 ? text(row[legadoCol]) : "";
        map[sku] = { classificacao: normalizeClassificacao(row[classCol]), anoLancamento: ano || null, legado: legado || null };
      }
      if (Object.keys(map).length) out.inovacao = map;
    } else {
      const fromCol = col(headers, COMERCIAL_HEADERS[kind].from);
      const toCol = col(headers, COMERCIAL_HEADERS[kind].to);
      for (const row of body) {
        const key = text(row[fromCol]);
        const value = text(row[toCol]);
        if (key && !isBlank(value)) out.comercial[kind][key] = value;
      }
    }
  }

  if (out.found.length === 0) {
    throw new Error("Nenhuma aba de De/Para reconhecida. Use o arquivo baixado em “Baixar De/Para 360”.");
  }
  return out;
}

export interface DePara360Plan {
  /** Só os campos que mudam em cada SKU. */
  sku: Record<string, DeParaOverrideEntry>;
  /** Só as chaves que mudam em cada De/Para comercial. */
  comercial: Record<ComercialMapId, Record<string, string>>;
  /** Mapa de Inovação novo (substitui o atual), ou null se não mudou. */
  inovacao: Record<string, InovacaoEntry> | null;
  counts: { sku: number; comercial: number; inovacao: number };
}

function sameInovacao(a?: InovacaoEntry, b?: InovacaoEntry): boolean {
  if (!a || !b) return a === b;
  return /inova/i.test(a.classificacao) === /inova/i.test(b.classificacao)
    && text(a.anoLancamento) === text(b.anoLancamento)
    && text(a.legado) === text(b.legado);
}

/** Compara o arquivo com o que o app usa hoje e separa o que muda. */
export function planDePara360(file: DePara360): DePara360Plan {
  const sku: DePara360Plan["sku"] = {};
  for (const [code, entry] of Object.entries(file.sku)) {
    const current = getDeParaBySku(code);
    const patch: DeParaOverrideEntry = {};
    for (const [field, value] of Object.entries(entry) as [keyof DeParaEntry, string][]) {
      if (!current || text(current[field]) !== value) patch[field] = value;
    }
    if (Object.keys(patch).length) sku[code] = patch;
  }

  const comercial = Object.fromEntries(COMERCIAL_MAP_IDS.map((id) => [id, {}])) as DePara360Plan["comercial"];
  let comercialCount = 0;
  for (const id of COMERCIAL_MAP_IDS) {
    const current = new Map(getComercialEntries(id).map((e) => [normComercialKey(e.key), e.value.trim()]));
    for (const [key, value] of Object.entries(file.comercial[id])) {
      if (current.get(normComercialKey(key)) === value) continue;
      comercial[id][key] = value;
      comercialCount += 1;
    }
  }

  let inovacao: DePara360Plan["inovacao"] = null;
  let inovacaoCount = 0;
  if (file.inovacao) {
    const current = getInovacaoMap();
    for (const code of new Set([...Object.keys(current), ...Object.keys(file.inovacao)])) {
      if (!sameInovacao(current[code], file.inovacao[code])) inovacaoCount += 1;
    }
    if (inovacaoCount > 0) inovacao = file.inovacao;
  }

  return { sku, comercial, inovacao, counts: { sku: Object.keys(sku).length, comercial: comercialCount, inovacao: inovacaoCount } };
}
