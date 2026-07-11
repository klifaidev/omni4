import { applyFilters, calcPVM, type PVMResult } from "@/lib/analytics";
import { computeChartSeries, computeTopRanking } from "@/lib/customKpi";
import type { KpiMeasureId, KpiPeriodMode } from "@/lib/customSlide";
import type { Filters, PricingRow } from "@/lib/types";
import {
  getSlideCalcCacheValue,
  setSlideCalcCacheValue,
  slideDataSignature,
  type SlideCalcCacheKeyInput,
} from "@/lib/slideCalcCache";

export type ChartSeriesResult = ReturnType<typeof computeChartSeries>;
export type TopRankingResult = ReturnType<typeof computeTopRanking>;

type WorkerResponse<T> = {
  id: number;
  ok: boolean;
  result?: T;
  error?: string;
};

type Pending<T> = {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
};

let worker: Worker | null = null;
let requestId = 0;
const pending = new Map<number, Pending<unknown>>();
const registeredRows = new Set<string>();

function getWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("../workers/slideCalc.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerResponse<unknown>>) => {
      const message = event.data;
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      if (message.ok) entry.resolve(message.result);
      else entry.reject(new Error(message.error ?? "Erro no worker de slides."));
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || "Erro no worker de slides.");
      pending.forEach((entry) => entry.reject(error));
      pending.clear();
      worker?.terminate();
      worker = null;
      registeredRows.clear();
    };
    return worker;
  } catch {
    worker = null;
    return null;
  }
}

function postToWorker<T>(message: Record<string, unknown>): Promise<T> {
  const instance = getWorker();
  if (!instance) return Promise.reject(new Error("Worker indisponivel."));
  const id = ++requestId;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    instance.postMessage({ id, ...message });
  });
}

function rowsPayload(rowsKey: string, rows: PricingRow[]): PricingRow[] | undefined {
  if (registeredRows.has(rowsKey)) return undefined;
  registeredRows.add(rowsKey);
  return rows;
}

async function computeWithWorker<T>(
  cacheInput: SlideCalcCacheKeyInput,
  workerPayload: Record<string, unknown>,
  fallback: () => T,
): Promise<T> {
  const cached = getSlideCalcCacheValue<T>(cacheInput);
  if (cached !== undefined) return cached;
  try {
    const result = await postToWorker<T>(workerPayload);
    setSlideCalcCacheValue(cacheInput, result);
    return result;
  } catch {
    const result = fallback();
    setSlideCalcCacheValue(cacheInput, result);
    return result;
  }
}

export function computeChartSeriesAsync(params: {
  cache: SlideCalcCacheKeyInput;
  rows: PricingRow[];
  filters: Filters;
  measure: KpiMeasureId;
  breakdown: string | null;
  xDim?: string | null;
}): Promise<ChartSeriesResult> {
  const rowsKey = params.cache.dataSignature ?? slideDataSignature(params.rows);
  return computeWithWorker(
    params.cache,
    {
      type: "chartSeries",
      rowsKey,
      rows: rowsPayload(rowsKey, params.rows),
      filters: params.filters,
      measure: params.measure,
      breakdown: params.breakdown,
      xDim: params.xDim,
    },
    () => computeChartSeries(params.rows, params.filters, params.measure, params.breakdown, params.xDim),
  );
}

export function computeTopRankingAsync(params: {
  cache: SlideCalcCacheKeyInput;
  rows: PricingRow[];
  filters: Filters;
  dim: string;
  measure: KpiMeasureId;
  topN: number;
  periodMode: KpiPeriodMode;
  periodValue?: string | null;
}): Promise<TopRankingResult> {
  const rowsKey = params.cache.dataSignature ?? slideDataSignature(params.rows);
  return computeWithWorker(
    params.cache,
    {
      type: "topRanking",
      rowsKey,
      rows: rowsPayload(rowsKey, params.rows),
      filters: params.filters,
      dim: params.dim,
      measure: params.measure,
      topN: params.topN,
      periodMode: params.periodMode,
      periodValue: params.periodValue,
    },
    () => computeTopRanking(
      params.rows,
      params.filters,
      params.dim,
      params.measure,
      params.topN,
      params.periodMode,
      params.periodValue,
    ),
  );
}

export function calcPvmAsync(params: {
  cache: SlideCalcCacheKeyInput;
  rows: PricingRow[];
  filters: Filters;
  metric: "cm" | "mb";
  base: string;
  comp: string;
  mode: "month" | "fy";
  labels?: { base: string; comp: string };
}): Promise<PVMResult> {
  const rowsKey = params.cache.dataSignature ?? slideDataSignature(params.rows);
  return computeWithWorker(
    params.cache,
    {
      type: "pvm",
      rowsKey,
      rows: rowsPayload(rowsKey, params.rows),
      filters: params.filters,
      metric: params.metric,
      base: params.base,
      comp: params.comp,
      mode: params.mode,
      labels: params.labels,
    },
    () => calcPVM(
      applyFilters(params.rows, params.filters, null),
      params.metric,
      params.base,
      params.comp,
      params.mode,
      params.labels,
    ),
  );
}
