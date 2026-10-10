// Leitura da base de pesquisas de ruptura e consolidação por mês × loja × SKU.
//
// Política de consolidação (documentada na tela de qualidade dos dados):
// - a loja é Rede + Bandeira + PDV + Cidade + Estado — a base não traz código
//   de estabelecimento, então o nome do PDV sozinho nunca é usado como chave;
// - várias pesquisas da mesma loja × SKU no mesmo mês viram UMA avaliação, com
//   o resultado da pesquisa mais recente (empate de horário: vale a última
//   linha do arquivo);
// - resposta vazia ou fora de Sim/Não é descartada e contada — nunca vira
//   "produto presente".

import { normHeader } from "@/lib/format";
import { ufFromEstado } from "./uf";
import {
  RUPTURA_DIMS,
  RUPTURA_MODEL_VERSION,
  type RupturaDim,
  type RupturaModel,
  type RupturaQuality,
} from "./types";

type Field =
  | "survey"
  | "marca"
  | "categoria"
  | "linha"
  | "sku"
  | "rede"
  | "bandeira"
  | "canal"
  | "pdv"
  | "estado"
  | "cidade"
  | "regional"
  | "dataHora"
  | "result"
  | "data"
  | "anoMes";

const FIELD_ALIASES: Record<Field, string[]> = {
  survey: ["ID da Pesquisa", "ID Pesquisa", "Pesquisa", "Código da Pesquisa"],
  marca: ["Marca"],
  categoria: ["Categoria do Produto", "Categoria"],
  linha: ["Linha de produto", "Linha"],
  sku: ["Produto (SKU)", "SKU", "Produto"],
  rede: ["Rede"],
  bandeira: ["Bandeira"],
  canal: ["Canal PDV", "Canal"],
  pdv: ["PDV", "Loja", "Ponto de venda"],
  estado: ["Estado", "UF"],
  cidade: ["Cidade", "Município", "Municipio"],
  regional: ["Regional"],
  dataHora: ["Data e hora da pesquisa", "Data e hora", "Data/hora"],
  result: ["Produto em Ruptura", "Ruptura", "Em ruptura"],
  data: ["Data", "Data da pesquisa"],
  anoMes: ["Ano-Mês", "Ano Mês", "AnoMes", "Mês", "Mes"],
};

const REQUIRED: Field[] = ["sku", "pdv", "result"];

export type RupturaColumns = Partial<Record<Field, number>>;

export interface RupturaHeader {
  headerRow: number;
  columns: RupturaColumns;
}

/** Procura o cabeçalho nas primeiras linhas. Erro descreve o que faltou. */
export function detectRupturaHeader(rows: unknown[][]): RupturaHeader | { error: string } {
  const limit = Math.min(rows.length, 30);
  let best: { row: number; columns: RupturaColumns; hits: number } | null = null;
  for (let r = 0; r < limit; r++) {
    const row = rows[r] ?? [];
    const normalized = row.map((v) => normHeader(String(v ?? "")));
    const columns: RupturaColumns = {};
    let hits = 0;
    for (const field of Object.keys(FIELD_ALIASES) as Field[]) {
      for (const alias of FIELD_ALIASES[field]) {
        const idx = normalized.indexOf(normHeader(alias));
        if (idx >= 0 && !Object.values(columns).includes(idx)) {
          columns[field] = idx;
          hits++;
          break;
        }
      }
    }
    if (!best || hits > best.hits) best = { row: r, columns, hits };
  }
  if (!best) return { error: "A planilha está vazia." };
  const missing = REQUIRED.filter((f) => best!.columns[f] === undefined);
  const hasMonth = ["anoMes", "data", "dataHora"].some((f) => best!.columns[f as Field] !== undefined);
  if (missing.length || !hasMonth) {
    const names = missing.map((f) => FIELD_ALIASES[f][0]);
    if (!hasMonth) names.push("Data ou Ano-Mês");
    return { error: `Faltam colunas na base de ruptura: ${names.join(", ")}.` };
  }
  return { headerRow: best.row, columns: best.columns };
}

// ── Datas ────────────────────────────────────────────────────────────────
// Trabalhamos com "horário de parede" (UTC ingênuo): a data que a pessoa vê
// na planilha, sem conversão de fuso.

const EXCEL_EPOCH_OFFSET_DAYS = 25569; // 1970-01-01 no serial do Excel

export function parseWallClock(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    return Math.round((value - EXCEL_EPOCH_OFFSET_DAYS) * 86_400_000);
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate(), value.getHours(), value.getMinutes(), value.getSeconds());
  }
  const text = String(value).trim();
  let m = text.match(/^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    return Date.UTC(+m[1], +m[2] - 1, m[3] ? +m[3] : 1, m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);
  }
  m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return Date.UTC(year, +m[2] - 1, +m[1], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);
  }
  m = text.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return Date.UTC(+m[2], +m[1] - 1, 1);
  return null;
}

function monthKeyOf(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function isoOf(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

/** "Sim" → 1, "Não" → 0, qualquer outra coisa → null (descartada). */
export function parseRupturaResult(value: unknown): 0 | 1 | null {
  if (value === true || value === 1) return 1;
  if (value === false || value === 0) return 0;
  const text = normHeader(String(value ?? ""));
  if (text === "sim" || text === "s" || text === "yes" || text === "y" || text === "1" || text === "true") return 1;
  if (text === "nao" || text === "n" || text === "no" || text === "0" || text === "false") return 0;
  return null;
}

// ── Consolidação ─────────────────────────────────────────────────────────

const EMPTY_LABEL: Record<RupturaDim, string> = {
  marca: "(sem marca)",
  categoria: "(sem categoria)",
  linha: "(sem linha)",
  sku: "(sem SKU)",
  rede: "(sem rede)",
  bandeira: "(sem bandeira)",
  pdv: "(sem PDV)",
  canal: "(sem canal)",
  regional: "(sem regional)",
  estado: "(sem estado)",
  cidade: "(sem cidade)",
};

function cleanText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function keyText(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

class Interner {
  readonly labels: string[] = [];
  private readonly index = new Map<string, number>();
  constructor(private readonly empty: string) {}
  id(raw: unknown): number {
    const text = cleanText(raw);
    const label = text || this.empty;
    const key = keyText(label);
    let id = this.index.get(key);
    if (id === undefined) {
      id = this.labels.length;
      this.labels.push(label);
      this.index.set(key, id);
    }
    return id;
  }
}

export interface BuildRupturaOptions {
  fileName: string;
  sheetName: string;
  onProgress?: (done: number, total: number) => void;
}

export function buildRupturaModel(rows: unknown[][], header: RupturaHeader, opts: BuildRupturaOptions): RupturaModel {
  const c = header.columns;
  const get = (row: unknown[], field: Field): unknown => (c[field] === undefined ? undefined : row[c[field]!]);

  const interners = Object.fromEntries(RUPTURA_DIMS.map((d) => [d, new Interner(EMPTY_LABEL[d])])) as Record<RupturaDim, Interner>;
  const monthIndex = new Map<string, number>();
  const monthKeys: string[] = [];

  const skuAttr = { marca: [] as number[], categoria: [] as number[], linha: [] as number[] };
  const storeAttr = {
    rede: [] as number[], bandeira: [] as number[], pdv: [] as number[], canal: [] as number[],
    regional: [] as number[], estado: [] as number[], cidade: [] as number[], uf: [] as (string | null)[],
  };
  const storeIndex = new Map<string, number>();
  const pdvStores = new Map<number, Set<number>>();
  const surveyStore = new Map<string, number>();
  const surveysInManyStores = new Set<string>();
  const surveySku = new Set<string>();
  const storesWithManyChannels = new Set<number>();
  const skusWithManyHierarchies = new Set<number>();
  const unknownStates = new Set<string>();
  const monthsWithNegatives = new Set<string>();

  const cellIndex = new Map<string, number>();
  const cells = { month: [] as number[], store: [] as number[], sku: [] as number[], result: [] as number[], evals: [] as number[], sims: [] as number[] };
  const cellTs: number[] = [];

  const quality: RupturaQuality = {
    rawRows: 0, missingKey: 0, invalidResult: 0, sim: 0, nao: 0, mergedDuplicates: 0, exactDuplicates: 0,
    surveys: 0, surveysInManyStores: 0, pdvHomonyms: 0, storesWithManyChannels: 0, skusWithManyHierarchies: 0,
    unknownStates: [], firstDate: null, lastDate: null, monthsWithNegatives: [],
  };
  let minTs = Infinity;
  let maxTs = -Infinity;

  const total = rows.length - header.headerRow - 1;
  for (let r = header.headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((v) => v === null || v === undefined || v === "")) continue;
    quality.rawRows++;
    if (opts.onProgress && quality.rawRows % 50_000 === 0) opts.onProgress(quality.rawRows, total);

    const skuText = cleanText(get(row, "sku"));
    const pdvText = cleanText(get(row, "pdv"));
    const tsDateTime = parseWallClock(get(row, "dataHora"));
    const tsDate = parseWallClock(get(row, "data"));
    const tsMonth = parseWallClock(get(row, "anoMes"));
    const monthTs = tsMonth ?? tsDate ?? tsDateTime;
    if (!skuText || !pdvText || monthTs === null) {
      quality.missingKey++;
      continue;
    }
    const result = parseRupturaResult(get(row, "result"));
    if (result === null) {
      quality.invalidResult++;
      continue;
    }
    const monthKey = monthKeyOf(monthTs);
    if (result === 1) quality.sim++;
    else {
      quality.nao++;
      monthsWithNegatives.add(monthKey);
    }
    const ts = tsDateTime ?? tsDate ?? monthTs;
    if (ts < minTs) minTs = ts;
    if (ts > maxTs) maxTs = ts;

    let month = monthIndex.get(monthKey);
    if (month === undefined) {
      month = monthKeys.length;
      monthKeys.push(monthKey);
      monthIndex.set(monthKey, month);
    }

    // SKU e sua hierarquia de produto.
    const sku = interners.sku.id(skuText);
    const marca = interners.marca.id(get(row, "marca"));
    const categoria = interners.categoria.id(get(row, "categoria"));
    const linha = interners.linha.id(get(row, "linha"));
    if (sku === skuAttr.marca.length) {
      skuAttr.marca.push(marca);
      skuAttr.categoria.push(categoria);
      skuAttr.linha.push(linha);
    } else if (skuAttr.marca[sku] !== marca || skuAttr.categoria[sku] !== categoria || skuAttr.linha[sku] !== linha) {
      skusWithManyHierarchies.add(sku);
    }

    // Loja = Rede + Bandeira + PDV + Cidade + Estado.
    const rede = interners.rede.id(get(row, "rede"));
    const bandeira = interners.bandeira.id(get(row, "bandeira"));
    const pdv = interners.pdv.id(pdvText);
    const cidade = interners.cidade.id(get(row, "cidade"));
    const estado = interners.estado.id(get(row, "estado"));
    const canal = interners.canal.id(get(row, "canal"));
    const storeKey = `${rede}|${bandeira}|${pdv}|${cidade}|${estado}`;
    let store = storeIndex.get(storeKey);
    if (store === undefined) {
      store = storeAttr.rede.length;
      storeIndex.set(storeKey, store);
      const estadoLabel = interners.estado.labels[estado];
      const uf = ufFromEstado(estadoLabel);
      if (!uf) unknownStates.add(estadoLabel);
      storeAttr.rede.push(rede);
      storeAttr.bandeira.push(bandeira);
      storeAttr.pdv.push(pdv);
      storeAttr.canal.push(canal);
      storeAttr.regional.push(interners.regional.id(get(row, "regional")));
      storeAttr.estado.push(estado);
      storeAttr.cidade.push(cidade);
      storeAttr.uf.push(uf);
      let set = pdvStores.get(pdv);
      if (!set) pdvStores.set(pdv, (set = new Set()));
      set.add(store);
    } else if (storeAttr.canal[store] !== canal) {
      storesWithManyChannels.add(store);
    }

    // Pesquisa: uma loja por ID; ID + SKU repetido é linha duplicada.
    const surveyText = cleanText(get(row, "survey"));
    if (surveyText) {
      const prev = surveyStore.get(surveyText);
      if (prev === undefined) surveyStore.set(surveyText, store);
      else if (prev !== store) surveysInManyStores.add(surveyText);
      const pairKey = `${surveyText}|${sku}`;
      if (surveySku.has(pairKey)) quality.exactDuplicates++;
      else surveySku.add(pairKey);
    }

    // Consolidação mês × loja × SKU: a pesquisa mais recente vale.
    const cellKey = `${month}|${store}|${sku}`;
    const existing = cellIndex.get(cellKey);
    if (existing === undefined) {
      cellIndex.set(cellKey, cells.month.length);
      cells.month.push(month);
      cells.store.push(store);
      cells.sku.push(sku);
      cells.result.push(result);
      cells.evals.push(1);
      cells.sims.push(result);
      cellTs.push(ts);
    } else {
      quality.mergedDuplicates++;
      cells.evals[existing]++;
      cells.sims[existing] += result;
      if (ts >= cellTs[existing]) {
        cells.result[existing] = result;
        cellTs[existing] = ts;
      }
    }
  }

  for (const set of pdvStores.values()) if (set.size > 1) quality.pdvHomonyms++;
  quality.surveys = surveyStore.size;
  quality.surveysInManyStores = surveysInManyStores.size;
  quality.storesWithManyChannels = storesWithManyChannels.size;
  quality.skusWithManyHierarchies = skusWithManyHierarchies.size;
  quality.unknownStates = [...unknownStates].sort();
  quality.firstDate = Number.isFinite(minTs) ? isoOf(minTs) : null;
  quality.lastDate = Number.isFinite(maxTs) ? isoOf(maxTs) : null;

  // Meses em ordem cronológica; remapeia os índices das avaliações.
  const sortedMonths = [...monthKeys].sort();
  const remap = monthKeys.map((key) => sortedMonths.indexOf(key));
  for (let i = 0; i < cells.month.length; i++) cells.month[i] = remap[cells.month[i]];
  quality.monthsWithNegatives = sortedMonths
    .map((key, i) => (monthsWithNegatives.has(key) ? i : -1))
    .filter((i) => i >= 0);

  return {
    version: RUPTURA_MODEL_VERSION,
    fileName: opts.fileName,
    sheetName: opts.sheetName,
    months: sortedMonths,
    dict: Object.fromEntries(RUPTURA_DIMS.map((d) => [d, interners[d].labels])) as Record<RupturaDim, string[]>,
    skus: skuAttr,
    stores: storeAttr,
    cells,
    quality,
  };
}

/** Escolhe a aba: "Base de Dados" se existir, senão a primeira com cabeçalho reconhecível. */
export function pickRupturaSheet(
  sheetNames: string[],
  previewRows: (name: string) => unknown[][],
): { sheetName: string; header: RupturaHeader } | { error: string } {
  const ordered = [
    ...sheetNames.filter((n) => normHeader(n) === "basededados"),
    ...sheetNames.filter((n) => normHeader(n) !== "basededados"),
  ];
  let firstError: string | null = null;
  for (const name of ordered) {
    const header = detectRupturaHeader(previewRows(name));
    if ("error" in header) {
      firstError ??= header.error;
      continue;
    }
    return { sheetName: name, header };
  }
  return { error: firstError ?? "Nenhuma aba com a base de ruptura foi encontrada." };
}

/** Confere se um objeto vindo do cache tem a forma do modelo atual. */
export function isRupturaModel(value: unknown): value is RupturaModel {
  const m = value as Partial<RupturaModel> | null;
  return (
    !!m &&
    m.version === RUPTURA_MODEL_VERSION &&
    Array.isArray(m.months) &&
    !!m.dict &&
    !!m.cells &&
    Array.isArray(m.cells.month) &&
    m.cells.month.length === m.cells.result?.length &&
    !!m.quality
  );
}
