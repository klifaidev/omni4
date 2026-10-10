// Métricas operacionais de ruptura sobre o modelo consolidado.
//
// Unidade de contagem: a avaliação consolidada (mês × loja × SKU). Assim uma
// loja com dez SKUs ausentes é UMA loja afetada e DEZ ocorrências, e três
// pesquisas da mesma loja × SKU no mês são UMA ocorrência.
//
// Taxa de ruptura = ocorrências ÷ avaliações (Sim + Não). Só existe quando
// todos os meses do recorte têm respostas "Não" na base — sem elas o
// denominador seria só de rupturas e a taxa daria 100% falsos.

import { RUPTURA_DIMS, type RupturaDim, type RupturaModel } from "./types";

export type RupturaFilters = Partial<Record<RupturaDim, string[]>>;

/** Intervalo de meses (índices em model.months), inclusivo. */
export interface RupturaPeriod {
  from: number;
  to: number;
}

export interface RupturaMetrics {
  /** Avaliações consolidadas (Sim + Não). */
  evaluations: number;
  /** Avaliações consolidadas com ruptura (loja × SKU × mês). */
  occurrences: number;
  /** occurrences ÷ evaluations, ou null quando não há respostas "Não" no recorte. */
  rate: number | null;
  /** Lojas com alguma avaliação no recorte. */
  storesSurveyed: number;
  /** Lojas com ao menos um SKU em ruptura. */
  storesAffected: number;
  skusAffected: number;
  redesAffected: number;
  redesSurveyed: number;
  /** Pesquisas brutas (antes da consolidação) somadas no recorte. */
  rawEvaluations: number;
}

type Accessor = (cell: number) => number;

export function dimAccessor(model: RupturaModel, dim: RupturaDim): Accessor {
  const { cells, skus, stores } = model;
  switch (dim) {
    case "sku":
      return (i) => cells.sku[i];
    case "marca":
    case "categoria":
    case "linha": {
      const attr = skus[dim];
      return (i) => attr[cells.sku[i]];
    }
    default: {
      const attr = stores[dim];
      return (i) => attr[cells.store[i]];
    }
  }
}

export type CellPredicate = (cell: number) => boolean;

/**
 * Compila filtros + período num predicado por avaliação. `exclude` ignora uma
 * dimensão (para montar as opções em cascata do próprio filtro).
 */
export function compileFilter(
  model: RupturaModel,
  filters: RupturaFilters,
  period: RupturaPeriod | null,
  exclude?: RupturaDim,
): CellPredicate {
  const checks: Array<{ allowed: Uint8Array; get: Accessor }> = [];
  for (const dim of RUPTURA_DIMS) {
    if (dim === exclude) continue;
    const selected = filters[dim];
    if (!selected || selected.length === 0) continue;
    const labels = model.dict[dim];
    const allowed = new Uint8Array(labels.length);
    const wanted = new Set(selected);
    for (let i = 0; i < labels.length; i++) if (wanted.has(labels[i])) allowed[i] = 1;
    checks.push({ allowed, get: dimAccessor(model, dim) });
  }
  const months = model.cells.month;
  const from = period?.from ?? 0;
  const to = period?.to ?? model.months.length - 1;
  return (i) => {
    const m = months[i];
    if (m < from || m > to) return false;
    for (const check of checks) if (!check.allowed[check.get(i)]) return false;
    return true;
  };
}

/** A taxa só é confiável se todo mês do período tem respostas "Não". */
export function rateAvailable(model: RupturaModel, period: RupturaPeriod | null): boolean {
  const withNeg = new Set(model.quality.monthsWithNegatives);
  if (withNeg.size === 0) return false;
  const from = period?.from ?? 0;
  const to = period?.to ?? model.months.length - 1;
  for (let m = from; m <= to; m++) if (!withNeg.has(m)) return false;
  return true;
}

class Accumulator {
  evaluations = 0;
  occurrences = 0;
  rawEvaluations = 0;
  readonly stores = new Set<number>();
  readonly storesAffected = new Set<number>();
  readonly skusAffected = new Set<number>();
  readonly redes = new Set<number>();
  readonly redesAffected = new Set<number>();

  add(model: RupturaModel, i: number) {
    const { cells, stores } = model;
    const store = cells.store[i];
    const rede = stores.rede[store];
    this.evaluations++;
    this.rawEvaluations += cells.evals[i];
    this.stores.add(store);
    this.redes.add(rede);
    if (cells.result[i] === 1) {
      this.occurrences++;
      this.storesAffected.add(store);
      this.skusAffected.add(cells.sku[i]);
      this.redesAffected.add(rede);
    }
  }

  metrics(withRate: boolean): RupturaMetrics {
    return {
      evaluations: this.evaluations,
      occurrences: this.occurrences,
      rate: withRate && this.evaluations > 0 ? this.occurrences / this.evaluations : null,
      storesSurveyed: this.stores.size,
      storesAffected: this.storesAffected.size,
      skusAffected: this.skusAffected.size,
      redesAffected: this.redesAffected.size,
      redesSurveyed: this.redes.size,
      rawEvaluations: this.rawEvaluations,
    };
  }
}

export function aggregate(model: RupturaModel, predicate: CellPredicate, withRate: boolean): RupturaMetrics {
  const acc = new Accumulator();
  const n = model.cells.month.length;
  for (let i = 0; i < n; i++) if (predicate(i)) acc.add(model, i);
  return acc.metrics(withRate);
}

export interface RupturaGroupRow extends RupturaMetrics {
  key: number;
  label: string;
  /** Participação nas ocorrências do recorte (0–1). */
  share: number;
  /** Participação acumulada após ordenar por ocorrências (Pareto). */
  cumShare: number;
}

/** Agrupa por uma dimensão. Ordena por ocorrências e calcula Pareto. */
export function groupBy(
  model: RupturaModel,
  predicate: CellPredicate,
  dim: RupturaDim,
  withRate: boolean,
): RupturaGroupRow[] {
  const get = dimAccessor(model, dim);
  return groupByKey(model, predicate, get, (k) => model.dict[dim][k] ?? "—", withRate);
}

export function groupByKey(
  model: RupturaModel,
  predicate: CellPredicate,
  keyOf: Accessor,
  labelOf: (key: number) => string,
  withRate: boolean,
): RupturaGroupRow[] {
  const groups = new Map<number, Accumulator>();
  const n = model.cells.month.length;
  for (let i = 0; i < n; i++) {
    if (!predicate(i)) continue;
    const key = keyOf(i);
    let acc = groups.get(key);
    if (!acc) groups.set(key, (acc = new Accumulator()));
    acc.add(model, i);
  }
  const rows = [...groups].map(([key, acc]) => ({ key, label: labelOf(key), share: 0, cumShare: 0, ...acc.metrics(withRate) }));
  return withPareto(rows);
}

/** Ordena por ocorrências (desc) e preenche participação e acumulada. */
export function withPareto<T extends { occurrences: number; label: string; share: number; cumShare: number }>(rows: T[]): T[] {
  const total = rows.reduce((s, r) => s + r.occurrences, 0);
  const sorted = [...rows].sort((a, b) => b.occurrences - a.occurrences || a.label.localeCompare(b.label, "pt-BR"));
  let cum = 0;
  for (const row of sorted) {
    row.share = total > 0 ? row.occurrences / total : 0;
    cum += row.occurrences;
    row.cumShare = total > 0 ? cum / total : 0;
  }
  return sorted;
}

/** Quantos itens do topo somam `threshold` (0–1) das ocorrências. */
export function paretoCount(rows: Array<{ cumShare: number }>, threshold = 0.8): number {
  const idx = rows.findIndex((r) => r.cumShare >= threshold - 1e-9);
  return idx < 0 ? rows.length : idx + 1;
}

export interface RupturaMonthPoint extends RupturaMetrics {
  month: number;
  key: string;
  /** Lojas com registro mudaram ≥ 15% sobre o mês anterior — tendência pede cautela. */
  coverageShift: boolean;
}

export const COVERAGE_SHIFT_THRESHOLD = 0.15;

/**
 * Série mensal. Com `constantStores`, conta só as lojas que têm registro em
 * TODOS os meses do período — compara o mesmo conjunto de lojas.
 */
export function monthlySeries(
  model: RupturaModel,
  filters: RupturaFilters,
  period: RupturaPeriod,
  opts: { constantStores?: boolean } = {},
): RupturaMonthPoint[] {
  const base = compileFilter(model, filters, period);
  const { cells } = model;
  const n = cells.month.length;
  let storeOk: Uint8Array | null = null;
  if (opts.constantStores) {
    const span = period.to - period.from + 1;
    const seen = new Map<number, Set<number>>();
    for (let i = 0; i < n; i++) {
      if (!base(i)) continue;
      const s = cells.store[i];
      let set = seen.get(s);
      if (!set) seen.set(s, (set = new Set()));
      set.add(cells.month[i]);
    }
    storeOk = new Uint8Array(model.stores.rede.length);
    for (const [s, set] of seen) if (set.size === span) storeOk[s] = 1;
  }
  const accs = new Map<number, Accumulator>();
  for (let i = 0; i < n; i++) {
    if (!base(i)) continue;
    if (storeOk && !storeOk[cells.store[i]]) continue;
    const m = cells.month[i];
    let acc = accs.get(m);
    if (!acc) accs.set(m, (acc = new Accumulator()));
    acc.add(model, i);
  }
  const negatives = new Set(model.quality.monthsWithNegatives);
  const out: RupturaMonthPoint[] = [];
  for (let m = period.from; m <= period.to; m++) {
    const acc = accs.get(m) ?? new Accumulator();
    const point = { month: m, key: model.months[m], coverageShift: false, ...acc.metrics(negatives.has(m)) };
    const prev = out[out.length - 1];
    if (prev && prev.storesSurveyed > 0) {
      point.coverageShift = Math.abs(point.storesSurveyed - prev.storesSurveyed) / prev.storesSurveyed >= COVERAGE_SHIFT_THRESHOLD;
    }
    out.push(point);
  }
  return out;
}

/** Período anterior de mesmo tamanho, ou null se a base não o cobre inteiro. */
export function previousPeriod(period: RupturaPeriod): RupturaPeriod | null {
  const span = period.to - period.from + 1;
  const from = period.from - span;
  if (from < 0) return null;
  return { from, to: period.from - 1 };
}

/** Variação relativa (fração) ou null quando a base anterior é zero/ausente. */
export function relativeDelta(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined || previous === 0) return null;
  return (current - previous) / previous;
}

/** Variação em pontos percentuais (fração: 0,012 = 1,2 p.p.). */
export function pointDelta(current: number | null, previous: number | null | undefined): number | null {
  if (current === null || previous === null || previous === undefined) return null;
  return current - previous;
}

/** "2026-09" → "Set/26". */
export function monthKeyLabel(key: string): string {
  const [y, m] = key.split("-");
  const names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${names[Number(m) - 1] ?? m}/${y.slice(-2)}`;
}

/** Opções de um filtro em cascata: valores presentes dados os OUTROS filtros. */
export function filterOptions(
  model: RupturaModel,
  filters: RupturaFilters,
  period: RupturaPeriod | null,
  dim: RupturaDim,
): string[] {
  const predicate = compileFilter(model, filters, period, dim);
  const get = dimAccessor(model, dim);
  const seen = new Uint8Array(model.dict[dim].length);
  const n = model.cells.month.length;
  for (let i = 0; i < n; i++) if (predicate(i)) seen[get(i)] = 1;
  // Mantém visíveis os valores já marcados mesmo sem dados no recorte.
  const selected = new Set(filters[dim] ?? []);
  const labels = model.dict[dim];
  return labels
    .filter((label, idx) => seen[idx] || selected.has(label))
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}
