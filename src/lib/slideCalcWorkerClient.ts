import { applyFilters, calcPVM, type PVMResult } from "@/lib/analytics";
import { computeChartSeries, computeTopRanking } from "@/lib/customKpi";
import type { KpiMeasureId, KpiPeriodMode } from "@/lib/customSlide";
import type { Filters, PricingRow } from "@/lib/types";
import { markSlidePerf, measureSlidePerf, recordSlidePerfEvent } from "@/lib/slidesPerfCounters";
import {
  getCachedRowsSignature,
  getSlideCalcCacheValue,
  setSlideCalcCacheValue,
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

// ---------------------------------------------------------------------------
// Memória do worker dos Slides
//
// O worker guarda uma CÓPIA das linhas que recebe (o envio clona tudo). Antes
// nenhuma cópia era liberada: cada base nova, mês de referência, fonte Budget
// ou recorte de filtro cruzado virava mais ~1 milhão de linhas presas no
// worker até o processo da tela estourar e cair (crash ao abrir a esteira).
// Agora: teto por soma de linhas (as menos usadas saem primeiro), recortes
// pequenos calculam na hora sem cópia, e o guarda de memória pode esvaziar
// tudo de uma vez.
// ---------------------------------------------------------------------------

/**
 * Soma máxima de linhas mantidas no worker: cabe uma base KE30 grande
 * (~1,2 milhão de linhas, mais de 1 GB copiado) + o Budget. Uma base nova ou
 * outro mês de referência substitui a cópia antiga em vez de somar.
 */
export const WORKER_ROWS_BUDGET = 1_600_000;
/** Abaixo disso calcula na hora, na própria tela — copiar para o worker custa mais. */
export const SMALL_ROWS_INLINE = 20_000;

let worker: Worker | null = null;
let requestId = 0;
const pending = new Map<number, Pending<unknown>>();
/** Conjuntos de linhas no worker, do menos ao mais recentemente usado. */
const registeredRows = new Map<string, number>();

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

/** Libera do worker os conjuntos menos usados até caber no teto (nunca o `keep`). */
function evictRows(keep: string) {
  let total = 0;
  for (const n of registeredRows.values()) total += n;
  for (const [key, n] of registeredRows) {
    if (total <= WORKER_ROWS_BUDGET) break;
    if (key === keep) continue;
    registeredRows.delete(key);
    total -= n;
    worker?.postMessage({ type: "release", rowsKey: key });
    recordSlidePerfEvent("slides.calc.workerRelease", { rows: n });
  }
}

/** Linhas a enviar junto do pedido (undefined = o worker já tem a cópia). */
function rowsPayload(rowsKey: string, rows: PricingRow[]): PricingRow[] | undefined {
  const known = registeredRows.get(rowsKey);
  if (known !== undefined) {
    registeredRows.delete(rowsKey);
    registeredRows.set(rowsKey, known); // vira o mais recente
    return undefined;
  }
  registeredRows.set(rowsKey, rows.length);
  evictRows(rowsKey);
  return rows;
}

/** Quantas linhas o worker guarda agora (diagnóstico e guarda de memória). */
export function slideWorkerRowsHeld(): number {
  let total = 0;
  for (const n of registeredRows.values()) total += n;
  return total;
}

/**
 * Esvazia o worker por completo (o guarda de memória chama isto quando a
 * memória da tela passa do limite). Os cálculos seguintes reenviam o que
 * precisarem; o resultado já calculado continua no cache da tela.
 */
export function releaseAllSlideWorkerRows(): void {
  if (worker) {
    pending.forEach((entry) => entry.reject(new Error("Worker reiniciado para liberar memória.")));
    pending.clear();
    worker.terminate();
    worker = null;
  }
  registeredRows.clear();
}

/** Só para testes. */
export function getRegisteredRowKeysForTest(): string[] {
  return [...registeredRows.keys()];
}
export function registerRowsForTest(rowsKey: string, count: number): boolean {
  return rowsPayload(rowsKey, { length: count } as unknown as PricingRow[]) !== undefined;
}
export function resetSlideWorkerForTest(): void {
  registeredRows.clear();
}

async function computeWithWorker<T>(
  cacheInput: SlideCalcCacheKeyInput,
  rows: PricingRow[],
  rowsKey: string,
  buildPayload: (rowsToSend: PricingRow[] | undefined) => Record<string, unknown>,
  fallback: () => T,
): Promise<T> {
  const cached = getSlideCalcCacheValue<T>(cacheInput);
  if (cached !== undefined) {
    recordSlidePerfEvent("slides.calc.cacheHit", {
      op: cacheInput.op,
      slideId: cacheInput.slideId,
      blockId: cacheInput.blockId,
    });
    return cached;
  }
  // Recorte pequeno (ex.: filtro cruzado): calcular aqui é instantâneo e não
  // deixa mais uma cópia de linhas no worker.
  if (rows.length <= SMALL_ROWS_INLINE) {
    const result = fallback();
    setSlideCalcCacheValue(cacheInput, result);
    return result;
  }
  const startMark = `slides:workerClient:${cacheInput.op}:${cacheInput.blockId ?? "unknown"}:${performance.now()}`;
  markSlidePerf(startMark);
  recordSlidePerfEvent("slides.calc.workerDispatch", {
    op: cacheInput.op,
    slideId: cacheInput.slideId,
    blockId: cacheInput.blockId,
  });
  try {
    let result: T;
    try {
      result = await postToWorker<T>(buildPayload(rowsPayload(rowsKey, rows)));
    } catch (error) {
      // O worker pode ter liberado (ou perdido, ao reiniciar) a cópia: reenvia uma vez.
      if (!(error instanceof Error) || !/not registered/i.test(error.message)) throw error;
      registeredRows.delete(rowsKey);
      result = await postToWorker<T>(buildPayload(rowsPayload(rowsKey, rows)));
    }
    measureSlidePerf("slides.calc.workerClient", startMark, undefined, {
      op: cacheInput.op,
      slideId: cacheInput.slideId,
      blockId: cacheInput.blockId,
      path: "worker",
    });
    setSlideCalcCacheValue(cacheInput, result);
    return result;
  } catch {
    measureSlidePerf("slides.calc.workerClient", startMark, undefined, {
      op: cacheInput.op,
      slideId: cacheInput.slideId,
      blockId: cacheInput.blockId,
      path: "fallback",
    });
    recordSlidePerfEvent("slides.calc.workerFallback", {
      op: cacheInput.op,
      slideId: cacheInput.slideId,
      blockId: cacheInput.blockId,
    });
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
  const rowsKey = params.cache.dataSignature ?? getCachedRowsSignature(params.rows);
  return computeWithWorker(
    params.cache,
    params.rows,
    rowsKey,
    (rows) => ({
      type: "chartSeries",
      rowsKey,
      rows,
      filters: params.filters,
      measure: params.measure,
      breakdown: params.breakdown,
      xDim: params.xDim,
    }),
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
  const rowsKey = params.cache.dataSignature ?? getCachedRowsSignature(params.rows);
  return computeWithWorker(
    params.cache,
    params.rows,
    rowsKey,
    (rows) => ({
      type: "topRanking",
      rowsKey,
      rows,
      filters: params.filters,
      dim: params.dim,
      measure: params.measure,
      topN: params.topN,
      periodMode: params.periodMode,
      periodValue: params.periodValue,
    }),
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
  mode: "month" | "fy" | "ytd";
  labels?: { base: string; comp: string };
}): Promise<PVMResult> {
  const rowsKey = params.cache.dataSignature ?? getCachedRowsSignature(params.rows);
  return computeWithWorker(
    params.cache,
    params.rows,
    rowsKey,
    (rows) => ({
      type: "pvm",
      rowsKey,
      rows,
      filters: params.filters,
      metric: params.metric,
      base: params.base,
      comp: params.comp,
      mode: params.mode,
      labels: params.labels,
    }),
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
