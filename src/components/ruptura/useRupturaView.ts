import { useMemo } from "react";
import {
  aggregate,
  compileFilter,
  previousPeriod,
  rateAvailable,
  type CellPredicate,
  type RupturaMetrics,
  type RupturaPeriod,
} from "@/lib/ruptura/metrics";
import type { RupturaModel } from "@/lib/ruptura/types";
import { useRuptura } from "@/store/ruptura";

export interface RupturaView {
  model: RupturaModel;
  period: RupturaPeriod;
  predicate: CellPredicate;
  withRate: boolean;
  totals: RupturaMetrics;
  previous: { period: RupturaPeriod; totals: RupturaMetrics } | null;
}

/** Recorte atual (filtros + período) compartilhado por todos os blocos da aba. */
export function useRupturaView(model: RupturaModel): RupturaView {
  const filters = useRuptura((s) => s.filters);
  const storedPeriod = useRuptura((s) => s.period);
  const period = useMemo<RupturaPeriod>(
    () => storedPeriod ?? { from: 0, to: model.months.length - 1 },
    [storedPeriod, model],
  );
  const withRate = rateAvailable(model, period);
  const predicate = useMemo(() => compileFilter(model, filters, period), [model, filters, period]);
  const totals = useMemo(() => aggregate(model, predicate, withRate), [model, predicate, withRate]);
  const previous = useMemo(() => {
    const prev = previousPeriod(period);
    if (!prev) return null;
    const prevTotals = aggregate(model, compileFilter(model, filters, prev), rateAvailable(model, prev));
    return { period: prev, totals: prevTotals };
  }, [model, filters, period]);
  return { model, period, predicate, withRate, totals, previous };
}
