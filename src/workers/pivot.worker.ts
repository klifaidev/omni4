import { computePivot, type PivotConfig, type PivotMeasure } from "@/lib/pivot";

type SerializablePivotMeasure = Omit<PivotMeasure, "derive"> & {
  deriveId?: string;
};

type PivotWorkerConfig = Omit<PivotConfig, "values" | "measureCatalog"> & {
  values: SerializablePivotMeasure[];
  measureCatalog?: SerializablePivotMeasure[];
};

type PivotWorkerRequest = {
  id: number;
  rowsKey: string;
  rows?: Record<string, unknown>[];
  config: PivotWorkerConfig;
};

type PivotWorkerReleaseRequest = {
  type: "releaseRows";
  rowsKey?: string;
};

const rowsByKey = new Map<string, Record<string, unknown>[]>();

function rowsFor(request: PivotWorkerRequest): Record<string, unknown>[] {
  if (request.rows) rowsByKey.set(request.rowsKey, request.rows);
  const rows = rowsByKey.get(request.rowsKey);
  if (!rows) throw new Error("Rows not registered in pivot worker.");
  return rows;
}

function deriveFor(id: string): PivotMeasure["derive"] {
  switch (id) {
    case "cm_pct_real":
      return (a) => {
        if (a.rol_real == null || a.cm_real == null) return null;
        return a.rol_real > 0 ? a.cm_real / a.rol_real : 0;
      };
    case "mb_pct_real":
      return (a) => {
        if (a.rol_real == null || a.mb_real == null) return null;
        return a.rol_real > 0 ? a.mb_real / a.rol_real : 0;
      };
    case "rol_kg_real":
      return (a) => {
        if (a.vol_real == null || a.rol_real == null) return null;
        return a.vol_real > 0 ? a.rol_real / a.vol_real : 0;
      };
    case "cm_kg_real":
      return (a) => {
        if (a.vol_real == null || a.cm_real == null) return null;
        return a.vol_real > 0 ? a.cm_real / a.vol_real : 0;
      };
    case "com_pct_real":
      return (a) => {
        if (a.rol_real == null || a.com_real == null) return null;
        return a.rol_real > 0 ? a.com_real / a.rol_real : 0;
      };
    case "cm_pct_budget":
      return (a) => {
        if (a.rol_budget == null || a.cm_budget == null) return null;
        return a.rol_budget > 0 ? a.cm_budget / a.rol_budget : 0;
      };
    case "rol_delta":
      return (a) => {
        if (a.rol_real == null || a.rol_budget == null) return null;
        return a.rol_real - a.rol_budget;
      };
    case "rol_delta_pct":
      return (a) => {
        if (a.rol_real == null || a.rol_budget == null) return null;
        return a.rol_budget !== 0 ? (a.rol_real - a.rol_budget) / Math.abs(a.rol_budget) : null;
      };
    case "cm_delta":
      return (a) => {
        if (a.cm_real == null || a.cm_budget == null) return null;
        return a.cm_real - a.cm_budget;
      };
    default:
      throw new Error(`Unsupported derived pivot measure: ${id}`);
  }
}

function hydrateConfig(config: PivotWorkerConfig): PivotConfig {
  const hydrateMeasure = (measure: SerializablePivotMeasure): PivotMeasure => {
    const { deriveId, ...base } = measure;
    return deriveId ? { ...base, derive: deriveFor(deriveId) } : base;
  };
  return {
    rows: config.rows,
    cols: config.cols,
    filters: config.filters,
    values: config.values.map(hydrateMeasure),
    measureCatalog: config.measureCatalog?.map(hydrateMeasure),
  };
}

self.onmessage = (event: MessageEvent<PivotWorkerRequest | PivotWorkerReleaseRequest>) => {
  const request = event.data;
  if ("type" in request && request.type === "releaseRows") {
    if (request.rowsKey) rowsByKey.delete(request.rowsKey);
    else rowsByKey.clear();
    return;
  }

  try {
    const rows = rowsFor(request);
    const result = computePivot(rows, hydrateConfig(request.config));
    self.postMessage({ id: request.id, ok: true, result });
  } catch (error) {
    self.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : "Erro ao calcular tabela dinâmica no worker.",
    });
  }
};
