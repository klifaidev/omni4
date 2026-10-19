import { useMemo } from "react";
import {
  aggregate,
  compileFilter,
  previousPeriod,
  rateAvailable,
  type RupturaPeriod,
} from "@/lib/ruptura/metrics";
import type { RupturaModel } from "@/lib/ruptura/types";
import type { RupturaView } from "@/lib/ruptura/view";
import { useRuptura } from "@/store/ruptura";

export type { RupturaView };

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
