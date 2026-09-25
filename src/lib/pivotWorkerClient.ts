import {
  computePivotGuarded,
  type GuardedPivotResult,
  type PivotConfig,
  type PivotLimits,
  type PivotMeasure,
  type PivotResult,
} from "@/lib/pivot";

type SerializablePivotMeasure = Omit<PivotMeasure, "derive"> & {
  deriveId?: string;
};

type PivotWorkerConfig = Omit<PivotConfig, "values" | "measureCatalog"> & {
  values: SerializablePivotMeasure[];
  measureCatalog?: SerializablePivotMeasure[];
};

type PivotWorkerResponse = {
  id: number;
  ok: boolean;
  estimate?: GuardedPivotResult["estimate"];
  result?: PivotResult | null;
  error?: string;
};

type Pending = {
  resolve: (value: GuardedPivotResult) => void;
  reject: (error: Error) => void;
};

const SUPPORTED_DERIVE_IDS = new Set([
  "cm_pct_real",
  "mb_pct_real",
  "rol_kg_real",
  "cm_kg_real",
  "com_pct_real",
  "cm_pct_budget",
  "rol_delta",
  "rol_delta_pct",
  "cm_delta",
]);

let worker: Worker | null = null;
let requestId = 0;
let rowsSequence = 0;
const pending = new Map<number, Pending>();
const rowsKeys = new WeakMap<Record<string, unknown>[], string>();
const registeredRows = new Set<string>();
let activeRowsKey: string | null = null;

export function createEmptyPivotResult(): PivotResult {
  return {
    rowHeaders: [],
    leafRowHeaders: [],
    colHeaders: [],
    cells: new Map(),
    drillRows: new Map(),
    rowTotals: new Map(),
    colTotals: new Map(),
    grandTotal: {},
    measureRange: {},
  };
}

function getRowsKey(rows: Record<string, unknown>[]): string {
  const existing = rowsKeys.get(rows);
  if (existing) return existing;
  const key = `pivot-rows-${++rowsSequence}`;
  rowsKeys.set(rows, key);
  return key;
}

function rowsPayload(rowsKey: string, rows: Record<string, unknown>[]): Record<string, unknown>[] | undefined {
  if (registeredRows.has(rowsKey)) return undefined;
  registeredRows.add(rowsKey);
  return rows;
}

function toWorkerConfig(config: PivotConfig): PivotWorkerConfig {
  const serializeMeasure = (measure: PivotMeasure): SerializablePivotMeasure => {
    const { derive: _derive, ...serializable } = measure;
    return measure.derive ? { ...serializable, deriveId: measure.id } : serializable;
  };
  return {
    rows: config.rows,
    cols: config.cols,
    filters: config.filters,
    values: config.values.map(serializeMeasure),
    measureCatalog: config.measureCatalog?.map(serializeMeasure),
  };
}

function canUseWorker(config: PivotConfig): boolean {
  return config.values.every((measure) => !measure.derive || SUPPORTED_DERIVE_IDS.has(measure.id));
}

function getWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("../workers/pivot.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<PivotWorkerResponse>) => {
      const message = event.data;
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      if (message.ok && message.estimate) entry.resolve({ estimate: message.estimate, result: message.result ?? null });
      else entry.reject(new Error(message.error ?? "Erro no worker da tabela dinâmica."));
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || "Erro no worker da tabela dinâmica.");
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

function postToWorker(
  rows: Record<string, unknown>[],
  config: PivotConfig,
  limits: PivotLimits,
): Promise<GuardedPivotResult> {
  const instance = getWorker();
  if (!instance) return Promise.reject(new Error("Worker indisponível."));
  const rowsKey = getRowsKey(rows);
  if (activeRowsKey && activeRowsKey !== rowsKey) releasePivotRows(activeRowsKey);
  activeRowsKey = rowsKey;
  const id = ++requestId;
  return new Promise<GuardedPivotResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    instance.postMessage({
      id,
      rowsKey,
      rows: rowsPayload(rowsKey, rows),
      config: toWorkerConfig(config),
      limits,
    });
  });
}

export function releasePivotRows(rowsKey?: string): void {
  if (rowsKey) registeredRows.delete(rowsKey);
  else registeredRows.clear();
  if (rowsKey && activeRowsKey === rowsKey) activeRowsKey = null;
  if (!rowsKey) activeRowsKey = null;
  try {
    worker?.postMessage({ type: "releaseRows", rowsKey });
  } catch {
    // Se o worker ja foi encerrado, a memoria dele tambem ja foi liberada.
  }
}

function abortError(message: string): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

// Só o pedido mais recente é calculado. O worker processa um pedido por vez;
// enquanto ele está ocupado, pedidos novos substituem o que estava na espera
// (o substituído é rejeitado como AbortError). Sem isso, arrastar 3 campos em
// sequência enfileirava 3 cálculos completos, 2 deles já obsoletos.
type QueuedJob = {
  rows: Record<string, unknown>[];
  config: PivotConfig;
  limits: PivotLimits;
  resolve: (value: GuardedPivotResult) => void;
  reject: (error: Error) => void;
};
let jobInFlight = false;
let queuedJob: QueuedJob | null = null;

function runJob(job: QueuedJob): void {
  jobInFlight = true;
  const compute = canUseWorker(job.config)
    ? postToWorker(job.rows, job.config, job.limits).catch((error) => {
        if (error instanceof Error && error.name === "AbortError") throw error;
        return computePivotGuarded(job.rows, job.config, job.limits);
      })
    : Promise.resolve().then(() => computePivotGuarded(job.rows, job.config, job.limits));
  compute
    .then(job.resolve, job.reject)
    .finally(() => {
      jobInFlight = false;
      const next = queuedJob;
      queuedJob = null;
      if (next) runJob(next);
    });
}

export function disposePivotWorker(): void {
  const error = abortError("Calculo da tabela dinamica cancelado porque a pagina foi fechada.");
  queuedJob?.reject(error);
  queuedJob = null;
  pending.forEach((entry) => entry.reject(error));
  pending.clear();
  registeredRows.clear();
  activeRowsKey = null;
  worker?.terminate();
  worker = null;
}

/**
 * Estima o tamanho e, se couber nos limites, calcula o pivot — no worker.
 * `result` vem null quando a configuração estoura os limites.
 */
export function computePivotGuardedAsync(
  rows: Record<string, unknown>[],
  config: PivotConfig,
  limits: PivotLimits,
): Promise<GuardedPivotResult> {
  return new Promise<GuardedPivotResult>((resolve, reject) => {
    const job: QueuedJob = { rows, config, limits, resolve, reject };
    if (!jobInFlight) {
      runJob(job);
      return;
    }
    queuedJob?.reject(abortError("Substituido por um calculo mais recente."));
    queuedJob = job;
  });
}
