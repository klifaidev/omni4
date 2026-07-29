import type { BudgetRow } from "./budget";
import type { Filters, Metric, PricingRow } from "./types";
import { applyFilters, calcPVMFromRows, type PVMResult } from "./analytics";
import { budgetRowsAsPricingFiltered } from "./budgetAdapter";
import { monthLabel } from "./format";

export interface BridgeYtdBudgetResult {
  result: PVMResult;
  baseRows: PricingRow[];
  compRows: PricingRow[];
  fy: string;
  periods: string[];
  latestPeriodLabel: string;
}

function periodSortValue(row: Pick<PricingRow, "ano" | "mes">): number {
  return row.ano * 100 + row.mes;
}

function latestRealYtdPeriods(realRows: PricingRow[]): { fy: string; periods: string[]; latestLabel: string } | null {
  const realWithVolume = realRows.filter((row) => (row.volumeKg ?? 0) > 0 || (row.rol ?? 0) > 0 || (row.contribMarginal ?? 0) !== 0);
  if (realWithVolume.length === 0) return null;

  const latest = [...realWithVolume].sort((a, b) => periodSortValue(b) - periodSortValue(a))[0];
  const periodMap = new Map<string, PricingRow>();
  for (const row of realWithVolume) {
    if (row.fy !== latest.fy) continue;
    if (periodSortValue(row) > periodSortValue(latest)) continue;
    if (!periodMap.has(row.periodo)) periodMap.set(row.periodo, row);
  }

  const periods = [...periodMap.values()]
    .sort((a, b) => periodSortValue(a) - periodSortValue(b))
    .map((row) => row.periodo);

  return {
    fy: latest.fy,
    periods,
    latestLabel: monthLabel(latest.mes, latest.ano),
  };
}

export function computeBridgeYtdRealVsBudget(
  budgetRows: BudgetRow[],
  realPricingRows: PricingRow[],
  filters: Filters,
  metric: Metric,
): BridgeYtdBudgetResult | null {
  const effectiveMetric: Metric = metric === "mb" ? "cm" : metric;
  const budgetPlanRows = budgetRowsAsPricingFiltered(budgetRows, "budget");
  const ytd = latestRealYtdPeriods(realPricingRows);
  if (!ytd || ytd.periods.length === 0) return null;

  const periodSet = new Set(ytd.periods);
  const baseRows = applyFilters(
    budgetPlanRows.filter((row) => row.fy === ytd.fy && periodSet.has(row.periodo)),
    filters,
    null,
  );
  const compRows = applyFilters(
    realPricingRows.filter((row) => row.fy === ytd.fy && periodSet.has(row.periodo)),
    filters,
    null,
  );
  if (baseRows.length === 0 || compRows.length === 0) return null;

  return {
    result: calcPVMFromRows(baseRows, compRows, effectiveMetric, {
      base: `Budget YTD ${ytd.fy}`,
      comp: `Real YTD ate ${ytd.latestLabel}`,
    }),
    baseRows,
    compRows,
    fy: ytd.fy,
    periods: ytd.periods,
    latestPeriodLabel: ytd.latestLabel,
  };
}
