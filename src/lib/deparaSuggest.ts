// Sugestões para pendências de De/Para — a pessoa confirma com um clique em
// vez de preencher do zero. Cada sugestão diz de onde veio.
//
// - SKU: hierarquia do SKU mais parecido pela descrição (palavras em comum);
// - Canal: o grupo do código do canal ("4.2" → grupo 4) manda — os canais do
//   mesmo grupo já mapeados dizem o Canal Ajustado;
// - Região → UF: o próprio texto traz o estado ("BR /MG  Minas Gerais");
// - Região → Mercado: regiões com o mesmo prefixo de país ("BR /…");
// - UF → Regional: a macrorregião do estado, se ela existir entre as regionais.
import { completeDeParaEntries, type DeParaEntry } from "@/lib/depara";
import {
  getComercialEntries,
  getComercialValueOptions,
  normComercialKey,
  type ComercialMapId,
} from "@/lib/deparaComercial";

export interface SkuSuggestion {
  sku: string;
  entry: DeParaEntry;
  /** 0–1. */
  score: number;
}

export interface ValueSuggestion {
  value: string;
  reason: string;
}

const STOP = new Set(["DE", "DA", "DO", "E", "C", "COM", "X"]);

export function descTokens(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((t) => t.length >= 2 && !/^\d+$/.test(t) && !STOP.has(t));
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

/** SKUs completos mais parecidos com a descrição (para copiar a hierarquia). */
export function suggestSkuHierarchy(sku: string, description: string | undefined, limit = 3): SkuSuggestion[] {
  const tokens = descTokens(description);
  if (tokens.length === 0) return [];
  const scored: SkuSuggestion[] = [];
  for (const candidate of completeDeParaEntries()) {
    if (candidate.sku === sku) continue;
    const other = descTokens(candidate.entry.skuDesc);
    let score = jaccard(tokens, other);
    // A primeira palavra costuma ser o tipo de produto (COB, CHOC, RECHEIO…).
    if (other[0] && other[0] === tokens[0]) score += 0.15;
    if (score >= 0.3) scored.push({ ...candidate, score: Math.min(1, score) });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Campos da hierarquia sugerida (sem a descrição, que é do próprio SKU). */
export function hierarchyFromSuggestion(entry: DeParaEntry): Partial<DeParaEntry> {
  const { skuDesc: _desc, ...rest } = entry;
  return rest;
}

function majority(values: string[]): string | null {
  const count = new Map<string, number>();
  for (const v of values) count.set(v, (count.get(v) ?? 0) + 1);
  let best: string | null = null;
  let max = 0;
  for (const [v, n] of count) if (n > max) [best, max] = [v, n];
  return best;
}

const CANAL_CODE = /(\d+)\.(\d+)/;

const STATE_REGION: Record<string, string> = {
  acre: "NORTE", amapa: "NORTE", amazonas: "NORTE", para: "NORTE", rondonia: "NORTE", roraima: "NORTE", tocantins: "NORTE",
  alagoas: "NORDESTE", bahia: "NORDESTE", ceara: "NORDESTE", maranhao: "NORDESTE", paraiba: "NORDESTE", pernambuco: "NORDESTE",
  piaui: "NORDESTE", "rio grande do norte": "NORDESTE", sergipe: "NORDESTE",
  "distrito federal": "CENTRO-OESTE", goias: "CENTRO-OESTE", "mato grosso": "CENTRO-OESTE", "mato grosso do sul": "CENTRO-OESTE",
  "espirito santo": "SUDESTE", "minas gerais": "SUDESTE", "rio de janeiro": "SUDESTE", "sao paulo": "SUDESTE",
  parana: "SUL", "rio grande do sul": "SUL", "santa catarina": "SUL",
};

const compact = (s: string) => normComercialKey(s).replace(/[^a-z0-9]/g, "");

export function suggestComercial(map: ComercialMapId, key: string): ValueSuggestion | null {
  const entries = getComercialEntries(map);
  const options = getComercialValueOptions(map);

  if (map === "canalToCanalAjustado") {
    // Canal já quase ajustado, com outra grafia ("INDUSTRIAL" → "INDUSTRIA").
    const k = compact(key);
    const near = options.find((o) => {
      const v = compact(o);
      return v.length >= 5 && k.length >= 5 && (k.startsWith(v) || v.startsWith(k));
    });
    if (near) return { value: near, reason: `mesma palavra do canal ajustado “${near}”` };
    const code = key.match(CANAL_CODE);
    if (code) {
      const group = code[1];
      const sameGroup = entries.filter((e) => e.key.match(CANAL_CODE)?.[1] === group).map((e) => e.value);
      const value = majority(sameGroup);
      if (value) return { value, reason: `mesmo grupo ${group}.x dos canais já mapeados` };
    }
    const tokens = descTokens(key.replace(/^\s*\d+\s+/, ""));
    let best: { value: string; score: number; from: string } | null = null;
    for (const e of entries) {
      const score = jaccard(tokens, descTokens(e.key.replace(/^\s*\d+\s+/, "")));
      if (score > (best?.score ?? 0.34)) best = { value: e.value, score, from: e.key };
    }
    return best ? { value: best.value, reason: `parecido com “${best.from.trim()}”` } : null;
  }

  if (map === "regiaoToUf") {
    const m = key.match(/\/\s*[A-Z]{2}\s+(.+)$/);
    if (m) {
      const name = m[1].trim();
      const known = options.find((o) => compact(o) === compact(name));
      return { value: known ?? name, reason: "o estado já vem escrito na região" };
    }
    return null;
  }

  if (map === "regiaoToMercadoAjustado") {
    const prefix = key.split("/")[0]?.trim();
    if (!prefix) return null;
    const value = majority(entries.filter((e) => e.key.split("/")[0]?.trim() === prefix).map((e) => e.value));
    return value ? { value, reason: `outras regiões “${prefix} /…” já são ${value}` } : null;
  }

  const region = STATE_REGION[normComercialKey(key)];
  if (!region) return null;
  const known = options.find((o) => compact(o) === compact(region));
  return known ? { value: known, reason: `${key} fica na região ${known.toLowerCase()}` } : null;
}
