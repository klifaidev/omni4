// Sugestão de classificação de SKU, campo a campo, a partir dos SKUs já
// classificados. Cada sugestão diz de onde veio, para a pessoa confiar (ou não):
//
// - "base": a própria base (KE30) já traz um valor que existe no De/Para;
// - "peso": a faixa de peso sai do peso unitário escrito na descrição
//   ("12X400G" → 400 g → "201 - 999g");
// - "parecidos": voto dos SKUs com descrição mais parecida, somado ao que cada
//   palavra da descrição costuma indicar ("BRANCO" → sabor Branco em 97% dos
//   SKUs que têm essa palavra). Palavras raras pesam mais que as comuns.
//
// A subcategoria só é sugerida entre as que existem na categoria escolhida.
import { completeDeParaEntries, getDeParaFieldOptions, type DeParaEntry } from "@/lib/depara";
import { descTokens } from "@/lib/deparaSuggest";

export type HierField = Exclude<keyof DeParaEntry, "skuDesc">;

export const HIER_FIELDS: HierField[] = [
  "categoria",
  "subcategoria",
  "marca",
  "tecnologia",
  "formato",
  "mercado",
  "faixaPeso",
  "sabor",
];

export const DEPARA_FIELD_LABEL: Record<keyof DeParaEntry, string> = {
  categoria: "Categoria",
  subcategoria: "Subcategoria",
  marca: "Marca",
  tecnologia: "Tecnologia",
  formato: "Formato",
  mercado: "Mercado",
  faixaPeso: "Faixa de peso",
  sabor: "Sabor",
  skuDesc: "Descrição",
};

/** Faixa de confiança para mostrar à pessoa (medida: "alta" acerta ~97%). */
export function confidenceLevel(confidence: number): "alta" | "media" | "baixa" {
  return confidence >= 0.7 ? "alta" : confidence >= 0.45 ? "media" : "baixa";
}

export interface SkuNeighbor {
  sku: string;
  entry: DeParaEntry;
  /** 0–1. */
  score: number;
  /** Palavras da descrição em comum. */
  shared: string[];
}

export type SuggestionSource = "base" | "peso" | "parecidos";

export interface FieldSuggestion {
  value: string;
  /** 0–1: quanto dos sinais aponta para este valor. */
  confidence: number;
  source: SuggestionSource;
  reason: string;
  /** Outros valores possíveis, do mais para o menos provável. */
  alternatives: Array<{ value: string; share: number }>;
}

export interface SkuClassification {
  neighbors: SkuNeighbor[];
  /**
   * "descricao": parecidos pela descrição. "campos": sem descrição útil, os
   * SKUs com os mesmos campos já preenchidos (ex.: mesma categoria e
   * subcategoria); `basisLabel` diz quais.
   */
  basis: "descricao" | "campos";
  basisLabel?: string;
  fields: Partial<Record<HierField, FieldSuggestion>>;
}

export interface ClassifyInput {
  sku: string;
  description?: string;
  /** O que o SKU já tem (ou o que a pessoa já escolheu): não é sugerido de novo e orienta o resto. */
  known?: Partial<DeParaEntry>;
  /** Valores que a própria base traz para o SKU (KE30). */
  baseValues?: Partial<Record<HierField, string>>;
  /** Muda a cada correção: reaproveita o índice enquanto o De/Para não muda. */
  stamp?: number;
}

const isBlank = (v?: string) => {
  const s = (v ?? "").trim();
  return !s || s.toUpperCase() === "TBD";
};

const fold = (v: string) =>
  v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// ── Índice dos SKUs completos ────────────────────────────────────────────

interface Doc {
  sku: string;
  entry: DeParaEntry;
  tokens: string[];
  set: Set<string>;
}

interface Index {
  docs: Doc[];
  idf: Map<string, number>;
  /** Documentos que têm cada palavra. */
  byToken: Map<string, number[]>;
  /** Subcategorias de cada categoria. */
  subsByCat: Map<string, Set<string>>;
}

let cached: { stamp: number; index: Index } | null = null;

function buildIndex(): Index {
  const docs: Doc[] = completeDeParaEntries().map(({ sku, entry }) => {
    const tokens = descTokens(entry.skuDesc);
    return { sku, entry, tokens, set: new Set(tokens) };
  });
  const byToken = new Map<string, number[]>();
  docs.forEach((d, i) => {
    for (const t of d.set) {
      const list = byToken.get(t);
      if (list) list.push(i);
      else byToken.set(t, [i]);
    }
  });
  const n = Math.max(1, docs.length);
  const idf = new Map<string, number>();
  for (const [t, list] of byToken) idf.set(t, Math.log(1 + n / list.length));
  const subsByCat = new Map<string, Set<string>>();
  for (const d of docs) {
    const set = subsByCat.get(d.entry.categoria) ?? new Set<string>();
    set.add(d.entry.subcategoria);
    subsByCat.set(d.entry.categoria, set);
  }
  return { docs, idf, byToken, subsByCat };
}

function getIndex(stamp?: number): Index {
  if (stamp === undefined) return buildIndex();
  if (!cached || cached.stamp !== stamp) cached = { stamp, index: buildIndex() };
  return cached.index;
}

/** Palavra que o índice nunca viu pesa como uma palavra rara. */
function idfOf(index: Index, token: string): number {
  return index.idf.get(token) ?? Math.log(1 + index.docs.length);
}

// ── Peso unitário → faixa de peso ────────────────────────────────────────

/** Peso de uma unidade em gramas, lido do fim da descrição ("10X1KG", "24X150G", "4KG"). */
export function unitWeightGrams(description: string | undefined): number | null {
  if (!description) return null;
  const matches = [...description.toUpperCase().matchAll(/(\d+(?:[.,]\d+)?)\s*(KG|G)\b/g)];
  const last = matches.at(-1);
  if (!last) return null;
  const value = Number(last[1].replace(",", "."));
  if (!isFinite(value) || value <= 0) return null;
  return last[2] === "KG" ? value * 1000 : value;
}

/** Faixa em gramas de um rótulo como "2 - 4,99kg", "201 - 999g" ou "20KG e acima". */
export function parseWeightRange(label: string): { min: number; max: number } | null {
  const text = label.toLowerCase().replace(/\s+/g, " ");
  const unit = /kg/.test(text) ? 1000 : /g\b|g$/.test(text) ? 1 : null;
  if (unit === null) return null;
  const nums = [...text.matchAll(/(\d+(?:[.,]\d+)?)/g)].map((m) => Number(m[1].replace(",", ".")) * unit);
  if (nums.length === 0) return null;
  if (/acima|\+|mais/.test(text) || nums.length === 1) return { min: nums[0], max: Infinity };
  return { min: nums[0], max: nums[1] };
}

function faixaFromWeight(grams: number, options: string[]): string | null {
  // As faixas terminam em ",99": um peso de 4,995 kg ainda é "2 - 4,99kg".
  for (const option of options) {
    const range = parseWeightRange(option);
    if (range && grams >= range.min && grams < Math.floor(range.max) + 1) return option;
  }
  return null;
}

function weightLabel(grams: number): string {
  const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(v);
  return grams >= 1000 ? `${fmt(grams / 1000)} kg` : `${fmt(grams)} g`;
}

// ── Classificação ────────────────────────────────────────────────────────

const MAX_NEIGHBORS = 6;
/**
 * Peso do voto dos SKUs parecidos (o resto vem das palavras). Medido testando
 * cada SKU já classificado como se fosse novo: categoria e formato seguem o
 * produto parecido; sabor e marca seguem a palavra ("BRANCO", "MELKEN").
 */
const NEIGHBOR_WEIGHT: Record<HierField, number> = {
  categoria: 0.65,
  subcategoria: 0.65,
  tecnologia: 0.65,
  formato: 0.65,
  faixaPeso: 0.55,
  marca: 0.45,
  mercado: 0.45,
  sabor: 0.35,
};
const MIN_NEIGHBOR_SCORE = 0.2;
const CAMPOS_DISCOUNT = 0.75;

function findNeighbors(index: Index, sku: string, tokens: string[], known: Partial<DeParaEntry>): SkuNeighbor[] {
  if (tokens.length === 0) return [];
  const query = new Set(tokens);
  const queryWeight = [...query].reduce((sum, t) => sum + idfOf(index, t), 0);
  const candidates = new Set<number>();
  for (const t of query) for (const i of index.byToken.get(t) ?? []) candidates.add(i);

  const knownFields = HIER_FIELDS.filter((f) => !isBlank(known[f]));
  const out: SkuNeighbor[] = [];
  for (const i of candidates) {
    const doc = index.docs[i];
    if (doc.sku === sku) continue;
    let shared = 0;
    let docOnly = 0;
    const sharedTokens: string[] = [];
    for (const t of doc.set) {
      if (query.has(t)) {
        shared += idfOf(index, t);
        sharedTokens.push(t);
      } else docOnly += idfOf(index, t);
    }
    let score = shared / (queryWeight + docOnly);
    // A primeira palavra costuma ser o tipo de produto (COB, CHOC, GRANUL…).
    if (doc.tokens[0] && doc.tokens[0] === tokens[0]) score += 0.08;
    for (const f of knownFields) {
      if (fold(doc.entry[f]) === fold(known[f]!)) score += 0.05;
      else if (f === "categoria" || f === "marca") score -= 0.08;
    }
    if (score >= MIN_NEIGHBOR_SCORE) {
      out.push({ sku: doc.sku, entry: doc.entry, score: Math.min(1, score), shared: sharedTokens });
    }
  }
  return out.sort((a, b) => b.score - a.score || a.sku.localeCompare(b.sku)).slice(0, MAX_NEIGHBORS);
}

interface Vote {
  value: string;
  share: number;
}

function normalize(scores: Map<string, number>): Map<string, number> {
  let total = 0;
  for (const v of scores.values()) total += v;
  if (total <= 0) return new Map();
  return new Map([...scores].map(([k, v]) => [k, v / total]));
}

/** O que cada palavra da descrição costuma indicar para o campo. */
function tokenVotes(index: Index, selfSku: string, tokens: string[], field: HierField, allowed: Set<string> | null) {
  const scores = new Map<string, number>();
  let strongest: { token: string; value: string; purity: number; df: number; weight: number } | null = null;
  for (const t of new Set(tokens)) {
    const docs = index.byToken.get(t);
    if (!docs || docs.length < 2) continue;
    const counts = new Map<string, number>();
    let df = 0;
    for (const i of docs) {
      if (index.docs[i].sku === selfSku) continue;
      const value = index.docs[i].entry[field];
      if (allowed && !allowed.has(value)) continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
      df++;
    }
    if (df < 2) continue;
    const idf = idfOf(index, t);
    for (const [value, n] of counts) {
      const purity = n / df;
      // Ao quadrado: palavra que indica sempre a mesma coisa pesa muito mais
      // que palavra que aparece em tudo.
      scores.set(value, (scores.get(value) ?? 0) + idf * purity * purity);
      const weight = idf * purity * Math.min(1, df / 5);
      if (purity >= 0.85 && df >= 3 && (!strongest || weight > strongest.weight)) {
        strongest = { token: t, value, purity, df, weight };
      }
    }
  }
  return { scores: normalize(scores), strongest };
}

function neighborVotes(neighbors: SkuNeighbor[], field: HierField, allowed: Set<string> | null) {
  const scores = new Map<string, number>();
  for (const n of neighbors) {
    const value = n.entry[field];
    if (allowed && !allowed.has(value)) continue;
    scores.set(value, (scores.get(value) ?? 0) + n.score * n.score);
  }
  return normalize(scores);
}

function ranked(scores: Map<string, number>): Vote[] {
  return [...scores].map(([value, share]) => ({ value, share })).sort((a, b) => b.share - a.share);
}

function matchOption(value: string | undefined, options: string[]): string | null {
  if (isBlank(value)) return null;
  const key = fold(value!);
  return options.find((o) => fold(o) === key) ?? null;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function classifySku(input: ClassifyInput): SkuClassification {
  const index = getIndex(input.stamp);
  const known: Partial<DeParaEntry> = { ...(input.known ?? {}) };
  const tokens = descTokens(input.description);
  let neighbors = findNeighbors(index, input.sku, tokens, known);
  let voters = neighbors;
  let basis: SkuClassification["basis"] = "descricao";
  let basisLabel: string | undefined;

  // Sem descrição parecida, mas com campos preenchidos: os SKUs que têm os
  // mesmos valores dizem como costumam ser os outros campos.
  const knownFields = HIER_FIELDS.filter((f) => !isBlank(known[f]));
  if (neighbors.length === 0 && knownFields.length > 0) {
    const same = (fields: HierField[]) =>
      index.docs.filter((d) => d.sku !== input.sku && fields.every((f) => fold(d.entry[f]) === fold(known[f]!)));
    let used = knownFields;
    let pool = same(used);
    if (pool.length < 2 && knownFields.includes("categoria")) {
      used = ["categoria"];
      pool = same(used);
    }
    if (pool.length >= 2) {
      basis = "campos";
      const names = used.map((f) => DEPARA_FIELD_LABEL[f].toLowerCase()).join(", ").replace(/, ([^,]*)$/, " e $1");
      basisLabel = used.length === 1 ? `${names} igual` : `${names} iguais`;
      voters = pool.map((d) => ({ sku: d.sku, entry: d.entry, score: 1, shared: [] }));
      neighbors = voters.slice(0, MAX_NEIGHBORS);
    }
  }
  const fields: Partial<Record<HierField, FieldSuggestion>> = {};

  for (const field of HIER_FIELDS) {
    if (!isBlank(known[field])) continue;
    const options = getDeParaFieldOptions(field);

    // Subcategoria: só as que existem na categoria (já escolhida ou sugerida).
    const categoria = !isBlank(known.categoria) ? known.categoria! : fields.categoria?.value;
    const allowed = field === "subcategoria" && categoria
      ? index.subsByCat.get(matchOption(categoria, [...index.subsByCat.keys()]) ?? categoria) ?? null
      : null;

    const fromNeighbors = neighborVotes(voters, field, allowed);
    const fromTokens = tokenVotes(index, input.sku, tokens, field, allowed);
    const combined = new Map<string, number>();
    const wn = NEIGHBOR_WEIGHT[field];
    for (const [v, s] of fromNeighbors) combined.set(v, (combined.get(v) ?? 0) + s * wn);
    for (const [v, s] of fromTokens.scores) combined.set(v, (combined.get(v) ?? 0) + s * (1 - wn));
    const votes = ranked(normalize(combined));
    const alternativesOf = (value: string) => votes.filter((v) => v.value !== value).slice(0, 3);

    const fromBase = matchOption(input.baseValues?.[field], options);
    if (fromBase && (!allowed || allowed.has(fromBase))) {
      fields[field] = {
        value: fromBase,
        confidence: 0.95,
        source: "base",
        reason: "a própria base já traz esse valor",
        alternatives: alternativesOf(fromBase),
      };
      continue;
    }

    if (field === "faixaPeso") {
      const grams = unitWeightGrams(input.description);
      const faixa = grams !== null ? faixaFromWeight(grams, options) : null;
      if (faixa) {
        fields[field] = {
          value: faixa,
          confidence: 0.95,
          source: "peso",
          reason: `${weightLabel(grams!)} por unidade, pela descrição`,
          alternatives: alternativesOf(faixa),
        };
        continue;
      }
    }

    const best = votes[0];
    if (!best) continue;
    const pool = allowed ? voters.filter((n) => allowed.has(n.entry[field])) : voters;
    const agree = pool.filter((n) => n.entry[field] === best.value).length;
    const strong = fromTokens.strongest?.value === best.value ? fromTokens.strongest : null;
    const reason = strong && (pool.length === 0 || agree / pool.length < strong.purity)
      ? `“${strong.token}” indica ${best.value} em ${pct(strong.purity)} dos ${strong.df} SKUs com essa palavra`
      : pool.length
        ? basis === "campos"
          ? `${agree} de ${pool.length} SKUs com ${basisLabel}`
          : `${agree} de ${pool.length} SKU${pool.length === 1 ? "" : "s"} parecido${pool.length === 1 ? "" : "s"}`
        : "pelas palavras da descrição";
    // Quanto de evidência há por trás do voto: um único SKU pouco parecido
    // não pode dar "confiança alta", mesmo sendo 100% do voto.
    let confidence: number;
    if (basis === "campos") {
      // Sem descrição, o voto dos SKUs da mesma categoria é um palpite mais
      // fraco: medido, ele acerta bem menos que o voto dos parecidos.
      // Poucos SKUs no grupo também valem menos ("3 de 3" não é certeza).
      confidence = best.share * CAMPOS_DISCOUNT * (pool.length / (pool.length + 2));
    } else {
      const mass = pool.reduce((sum, n) => sum + n.score, 0);
      const evidence = Math.max(
        Math.min(1, mass / 1.2),
        strong ? Math.min(1, 0.5 + strong.df / 20) : 0,
        0.35,
      );
      confidence = best.share * (0.5 + 0.5 * evidence);
    }
    // A subcategoria nunca é mais certa que a categoria sugerida.
    if (field === "subcategoria" && isBlank(known.categoria) && fields.categoria) {
      confidence = Math.min(confidence, fields.categoria.confidence);
    }
    fields[field] = {
      value: best.value,
      confidence,
      source: "parecidos",
      reason,
      alternatives: alternativesOf(best.value),
    };
  }

  return { neighbors, fields, basis, basisLabel };
}

/** Subcategorias já usadas numa categoria (para listar primeiro). */
export function subcategoriasOf(categoria: string | undefined, stamp?: number): string[] {
  if (isBlank(categoria)) return [];
  const index = getIndex(stamp);
  const key = matchOption(categoria, [...index.subsByCat.keys()]);
  return key ? [...(index.subsByCat.get(key) ?? [])].sort((a, b) => a.localeCompare(b, "pt-BR")) : [];
}
