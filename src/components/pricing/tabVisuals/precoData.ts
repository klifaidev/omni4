// Dados dos visuais da Análise de Preço, usados pela aba e pelo slide. A aba
// ignora os meses do filtro global: a decomposição usa os períodos base e
// comparação escolhidos nela, e a evolução mostra o histórico.
import { computePriceDecomposition, type PriceDecompositionResult, type PriceDecompositionSku } from "@/lib/analytics";
import { parsePeriodo, shiftPeriodo } from "@/lib/deckPeriod";
import { monthLabel } from "@/lib/format";
import { sortedPeriodsOf } from "@/lib/tabVisualPeriod";
import type { PricingRow } from "@/lib/types";
import { memoizeByRows } from "@/lib/derivedCache";

export type PricePeriodMode = "month" | "fy";
export type PriceRankingMetric = "preco" | "mix" | "total";
export type PriceEvolDim = "total" | "marca" | "canal";

function periodLabel(periodo: string): string {
  const p = parsePeriodo(periodo);
  return p ? monthLabel(p.mes, p.ano) : periodo;
}

function monthIndex(periodo: string | null | undefined): number | null {
  const p = parsePeriodo(periodo);
  return p ? p.ano * 12 + p.mes - 1 : null;
}

export function computePriceResult(
  rows: PricingRow[],
  base: string | null,
  comp: string | null,
  periodMode: PricePeriodMode,
): PriceDecompositionResult | null {
  if (!base || !comp || base === comp) return null;
  const labels = periodMode === "month" ? { base: periodLabel(base), comp: periodLabel(comp) } : { base, comp };
  return computePriceDecomposition(rows, base, comp, periodMode, labels);
}

/**
 * Base e comparação no slide. "Acompanhando" (padrão, só em meses): os dois
 * andam junto com o mês de referência do deck — `anchor` é o último mês do
 * deck quando foi enviado, e a diferença até o último mês de agora desloca
 * os dois períodos. "Fixos": exatamente os escolhidos.
 */
export function resolvePricePeriods(
  params: Record<string, unknown>,
  deckRows: PricingRow[],
): { base: string | null; comp: string | null; periodMode: PricePeriodMode } {
  const periodMode: PricePeriodMode = params.periodMode === "fy" ? "fy" : "month";
  const base = typeof params.base === "string" ? params.base : null;
  const comp = typeof params.comp === "string" ? params.comp : null;
  if (periodMode !== "month" || params.follow === "fixed") return { base, comp, periodMode };
  const anchor = monthIndex(typeof params.anchor === "string" ? params.anchor : null);
  const all = sortedPeriodsOf(deckRows);
  const now = monthIndex(all[all.length - 1]);
  if (anchor == null || now == null || anchor === now) return { base, comp, periodMode };
  const shift = now - anchor;
  const findPeriod = (p: string | null) => {
    if (!p) return null;
    const shifted = shiftPeriodo(p, shift);
    const target = monthIndex(shifted);
    return all.find((x) => monthIndex(x) === target) ?? shifted;
  };
  return { base: findPeriod(base), comp: findPeriod(comp), periodMode };
}

/** Os dois meses mais recentes do deck (base = penúltimo, comparação = último) — o padrão da aba. */
export function defaultPriceParams(deckRows: PricingRow[]): Record<string, unknown> {
  const all = sortedPeriodsOf(deckRows);
  return {
    base: all.length >= 2 ? all[all.length - 2] : null,
    comp: all.length >= 1 ? all[all.length - 1] : null,
    periodMode: "month",
    anchor: all.at(-1) ?? null,
    follow: "live",
  };
}

export interface PriceRankingData {
  top10: { name: string; fullName: string; value: number }[];
}

export function computePriceRanking(result: PriceDecompositionResult | null, metric: PriceRankingMetric): PriceRankingData {
  if (!result) return { top10: [] };
  const valueOf = (s: PriceDecompositionSku) =>
    metric === "preco" ? s.deltaPrecoRs : metric === "mix" ? s.efeitoMixRs : s.deltaPrecoRs + s.efeitoMixRs;
  return {
    top10: [...result.skus]
      .filter((s) => valueOf(s) !== 0)
      .sort((a, b) => Math.abs(valueOf(b)) - Math.abs(valueOf(a)))
      .slice(0, 10)
      .map((s) => ({ name: (s.skuDesc || s.sku).slice(0, 20), fullName: s.skuDesc || s.sku, value: valueOf(s) })),
  };
}

export interface PriceEvolutionData {
  data: Record<string, number | string>[];
  keys: string[];
}

/** Preço médio (ROL / volume) por mês, total ou top 6 marcas/canais por volume. */
/** Evolução de preço por dimensão. Memorizado por base (lib/derivedCache): refeito a cada visita à tela; o resultado é compartilhado, não alterar. */
export const computePriceEvolution = memoizeByRows(computePriceEvolutionUncached, 6);

function computePriceEvolutionUncached(rows: PricingRow[], dim: PriceEvolDim): PriceEvolutionData {
  // Ordem cronológica (antes era alfabética: "001.2026" vinha antes de "010.2025").
  const periods = Array.from(new Set(rows.map((r) => r.periodo)))
    .sort((a, b) => (monthIndex(a) ?? 0) - (monthIndex(b) ?? 0) || a.localeCompare(b));
  const byPeriod = new Map<string, Map<string, { rol: number; vol: number }>>();
  const seriesSet = new Set<string>();
  for (const r of rows) {
    const seriesKey = dim === "total" ? "Total" : (dim === "marca" ? r.marca : r.canal) || "—";
    seriesSet.add(seriesKey);
    const p = byPeriod.get(r.periodo) ?? new Map();
    const cur = p.get(seriesKey) ?? { rol: 0, vol: 0 };
    cur.rol += r.rol;
    cur.vol += r.volumeKg;
    p.set(seriesKey, cur);
    byPeriod.set(r.periodo, p);
  }
  let keys = Array.from(seriesSet);
  if (dim !== "total") {
    const totals = new Map<string, number>();
    for (const p of byPeriod.values()) {
      for (const [k, v] of p) totals.set(k, (totals.get(k) ?? 0) + v.vol);
    }
    keys = keys.sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0)).slice(0, 6);
  }
  const data = periods.map((per) => {
    const m = byPeriod.get(per) ?? new Map();
    const row: Record<string, number | string> = { period: periodLabel(per) };
    for (const k of keys) {
      const v = m.get(k);
      row[k] = v && v.vol > 0 ? v.rol / v.vol : 0;
    }
    return row;
  });
  return { data, keys };
}
