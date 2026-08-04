import { computePivot, type PivotConfig, type PivotMeasure, type PivotResult } from "@/lib/pivot";

type SerializablePivotMeasure = Omit<PivotMeasure, "derive"> & {
  deriveId?: string;
};

type PivotWorkerConfig = Omit<PivotConfig, "values"> & {
  values: SerializablePivotMeasure[];
};

type PivotWorkerResponse = {
  id: number;
  ok: boolean;
  result?: PivotResult;
  error?: string;
};

type Pending = {
  resolve: (value: PivotResult) => void;
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

export function createEmptyPivotResult(): PivotResult {
  return {
    rowHeaders: [],
    colHeaders: [],
    cells: new Map(),
    drillRows: new Map(),
    rowTotals: new Map(),
    colTotals: new Map(),
    grandTotal: {},
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
  return {
    rows: config.rows,
    cols: config.cols,
    filters: config.filters,
    values: config.values.map((measure) => {
      const { derive: _derive, ...serializable } = measure;
      return measure.derive ? { ...serializable, deriveId: measure.id } : serializable;
    }),
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
      if (message.ok && message.result) entry.resolve(message.result);
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
): Promise<PivotResult> {
  const instance = getWorker();
  if (!instance) return Promise.reject(new Error("Worker indisponível."));
  const rowsKey = getRowsKey(rows);
  const id = ++requestId;
  return new Promise<PivotResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    instance.postMessage({
      id,
      rowsKey,
      rows: rowsPayload(rowsKey, rows),
      config: toWorkerConfig(config),
    });
  });
}

export async function computePivotAsync(
  rows: Record<string, unknown>[],
  config: PivotConfig,
): Promise<PivotResult> {
  if (!canUseWorker(config)) return computePivot(rows, config);
  try {
    return await postToWorker(rows, config);
  } catch {
    return computePivot(rows, config);
  }
}
