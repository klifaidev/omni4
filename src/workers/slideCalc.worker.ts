import { applyFilters, calcPVM } from "@/lib/analytics";
import { computeChartSeries, computeTopRanking } from "@/lib/customKpi";
import type { Filters, PricingRow } from "@/lib/types";
import type { KpiMeasureId, KpiPeriodMode } from "@/lib/customSlide";

type ChartSeriesRequest = {
  id: number;
  type: "chartSeries";
  rowsKey: string;
  rows?: PricingRow[];
  filters: Filters;
  measure: KpiMeasureId;
  breakdown: string | null;
  xDim?: string | null;
};

type TopRankingRequest = {
  id: number;
  type: "topRanking";
  rowsKey: string;
  rows?: PricingRow[];
  filters: Filters;
  dim: string;
  measure: KpiMeasureId;
  topN: number;
  periodMode: KpiPeriodMode;
  periodValue?: string | null;
};

type PvmRequest = {
  id: number;
  type: "pvm";
  rowsKey: string;
  rows?: PricingRow[];
  filters: Filters;
  metric: "cm" | "mb";
  base: string;
  comp: string;
  mode: "month" | "fy";
  labels?: { base: string; comp: string };
};

type WorkerRequest = ChartSeriesRequest | TopRankingRequest | PvmRequest;

const rowsByKey = new Map<string, PricingRow[]>();

function rowsFor(request: WorkerRequest): PricingRow[] {
  if (request.rows) rowsByKey.set(request.rowsKey, request.rows);
  const rows = rowsByKey.get(request.rowsKey);
  if (!rows) throw new Error("Rows not registered in worker.");
  return rows;
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    const rows = rowsFor(request);
    if (request.type === "chartSeries") {
      const result = computeChartSeries(rows, request.filters, request.measure, request.breakdown, request.xDim);
      self.postMessage({ id: request.id, ok: true, result });
      return;
    }
    if (request.type === "topRanking") {
      const result = computeTopRanking(
        rows,
        request.filters,
        request.dim,
        request.measure,
        request.topN,
        request.periodMode,
        request.periodValue,
      );
      self.postMessage({ id: request.id, ok: true, result });
      return;
    }
    const filtered = applyFilters(rows, request.filters, null);
    const result = calcPVM(filtered, request.metric, request.base, request.comp, request.mode, request.labels);
    self.postMessage({ id: request.id, ok: true, result });
  } catch (error) {
    self.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : "Erro ao calcular no worker.",
    });
  }
};
