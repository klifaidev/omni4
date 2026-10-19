// Recorte (filtros + período) da Ruptura e os totais dele, sem depender de
// React nem da store: a aba e os slides montam o mesmo recorte por aqui.
import {
  aggregate,
  compileFilter,
  previousPeriod,
  rateAvailable,
  type CellPredicate,
  type RupturaFilters,
  type RupturaMetrics,
  type RupturaPeriod,
} from "./metrics";
import type { RupturaModel } from "./types";

export interface RupturaView {
  model: RupturaModel;
  period: RupturaPeriod;
  predicate: CellPredicate;
  withRate: boolean;
  totals: RupturaMetrics;
  previous: { period: RupturaPeriod; totals: RupturaMetrics } | null;
}

export function makeRupturaView(model: RupturaModel, filters: RupturaFilters, period: RupturaPeriod): RupturaView {
  const withRate = rateAvailable(model, period);
  const predicate = compileFilter(model, filters, period);
  const totals = aggregate(model, predicate, withRate);
  const prev = previousPeriod(period);
  const previous = prev
    ? { period: prev, totals: aggregate(model, compileFilter(model, filters, prev), rateAvailable(model, prev)) }
    : null;
  return { model, period, predicate, withRate, totals, previous };
}
