// Pivot Table engine — agrega linhas por dimensões em "rows" e "cols",
// computa medidas em "values" e suporta filtros internos.
// Genérico o suficiente para Real, Budget e Comparativo.

export type AggFn = "sum" | "avg" | "count" | "min" | "max";

export interface PivotMeasure {
  /** id único; ex: "rol_real" */
  id: string;
  /** label visível */
  label: string;
  /** caminho do campo numérico na linha unificada */
  field: string;
  agg: AggFn;
  /** formato de exibição */
  format: "currency" | "number" | "percent" | "tons";
  /** classes opcionais para destacar (Real/Budget/delta) */
  tone?: "real" | "budget" | "delta" | "neutral";
  /** cálculo derivado a partir de outras medidas após agregação */
  derive?: (acc: Record<string, number | null>) => number | null;
}

export interface PivotConfig {
  rows: string[];      // dimensões em linhas
  cols: string[];      // dimensões em colunas
  values: PivotMeasure[];
  filters: Record<string, string[]>; // {dim: allowed values}
}

export interface PivotResult {
  /** árvore de linhas: array de {keys, isTotal, depth, cells: {colKey: {measureId: number}}} */
  rowHeaders: PivotRowHeader[];
  /** árvore de colunas */
  colHeaders: PivotColHeader[];
  /** célula: cells[rowKey][colKey][measureId] */
  cells: Map<string, Map<string, Record<string, number | null>>>;
  /** totais por linha */
  rowTotals: Map<string, Record<string, number | null>>;
  /** totais por coluna */
  colTotals: Map<string, Record<string, number | null>>;
  /** total geral */
  grandTotal: Record<string, number | null>;
}

export interface PivotRowHeader {
  key: string;          // chave única da linha (concat dos values)
  values: string[];     // valor por dimensão
  // TODO: computar quando rowDims.length > 1. Reservado para hierarquia multi-nível. Atualmente sempre 0 — não usar em lógica de negócio.
  depth: number;
  // Reservado para hierarquia multi-nível. Atualmente sempre true — não usar em lógica de negócio.
  isLeaf: boolean;
}

export interface PivotColHeader {
  key: string;
  values: string[];
  // TODO: computar quando colDims.length > 1. Reservado para hierarquia multi-nível. Atualmente sempre 0 — não usar em lógica de negócio.
  depth: number;
  // Reservado para hierarquia multi-nível. Atualmente sempre true — não usar em lógica de negócio.
  isLeaf: boolean;
}

const EMPTY = "—";
// U+001F (Unit Separator) — nunca aparece em strings de texto de negócio
const SEP = "";

function getField(row: Record<string, unknown>, field: string): unknown {
  return row[field];
}

function dimVal(row: Record<string, unknown>, dim: string): string {
  const v = getField(row, dim);
  if (v == null || v === "") return EMPTY;
  return String(v);
}

function aggregate(values: number[], fn: AggFn): number | null {
  if (values.length === 0) return null;
  switch (fn) {
    case "sum":
      return values.reduce((a, b) => a + b, 0);
    case "avg":
      return values.reduce((a, b) => a + b, 0) / values.length;
    case "count":
      return values.length;
    case "min":
      return values.reduce((a, b) => a < b ? a : b, Infinity);
    case "max":
      return values.reduce((a, b) => a > b ? a : b, -Infinity);
  }
}

function buildHeaders(
  rows: Record<string, unknown>[],
  dims: string[],
): { headers: PivotRowHeader[]; keyOf: (r: Record<string, unknown>) => string } {
  if (dims.length === 0) {
    return {
      headers: [{ key: "__all__", values: [], depth: 0, isLeaf: true }],
      keyOf: () => "__all__",
    };
  }
  // Coletar combinações únicas (somente nós-folha; UI cuida de hierarquia visual)
  const set = new Map<string, string[]>();
  for (const r of rows) {
    const vals = dims.map((d) => dimVal(r, d));
    const key = vals.join(SEP);
    if (!set.has(key)) set.set(key, vals);
  }
  // ordenar por valores (com ordenação cronológica para dimensões temporais)
  const MES_ORDER: Record<string, number> = {
    jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
    jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
  };
  const mesLabelKey = (v: string): number => {
    const m = v.match(/^([A-Za-zçÇ]{3})\/(\d{2,4})$/);
    if (!m) return Number.MAX_SAFE_INTEGER;
    const mn = MES_ORDER[m[1].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")];
    if (!mn) return Number.MAX_SAFE_INTEGER;
    const yr = parseInt(m[2], 10);
    const yyyy = yr < 100 ? 2000 + yr : yr;
    return yyyy * 100 + mn;
  };
  const cmpAt = (dim: string, av: string, bv: string): number => {
    if (dim === "mesLabel") {
      return mesLabelKey(av) - mesLabelKey(bv);
    }
    return av.localeCompare(bv, "pt-BR", { numeric: true });
  };
  const sorted = Array.from(set.entries()).sort(([, a], [, b]) => {
    for (let i = 0; i < a.length; i++) {
      const cmp = cmpAt(dims[i], a[i], b[i]);
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
  const headers: PivotRowHeader[] = sorted.map(([key, values]) => ({
    key,
    values,
    depth: 0,
    isLeaf: true,
  }));
  return {
    headers,
    keyOf: (r) => dims.map((d) => dimVal(r, d)).join(SEP),
  };
}

export function computePivot(
  rows: Record<string, unknown>[],
  config: PivotConfig,
): PivotResult {
  // Aplicar filtros
  let filtered = rows;
  for (const [dim, allowed] of Object.entries(config.filters)) {
    if (!allowed || allowed.length === 0) continue;
    filtered = filtered.filter((r) => allowed.includes(dimVal(r, dim)));
  }

  const { headers: rowHeaders, keyOf: rowKeyOf } = buildHeaders(filtered, config.rows);
  const { headers: colHeaders, keyOf: colKeyOf } = buildHeaders(filtered, config.cols);

  // Buckets de valores brutos por (rowKey, colKey, measureField)
  type Bucket = Record<string, number[]>;
  const cellBuckets = new Map<string, Map<string, Bucket>>();
  const rowBuckets = new Map<string, Bucket>();
  const colBuckets = new Map<string, Bucket>();
  const grandBucket: Bucket = {};

  const directFields = new Set<string>();
  for (const m of config.values) {
    if (!m.derive) directFields.add(m.field);
  }

  function pushBucket(b: Bucket, field: string, val: number) {
    if (!b[field]) b[field] = [];
    b[field].push(val);
  }

  for (const r of filtered) {
    const rk = rowKeyOf(r);
    const ck = colKeyOf(r);

    let cellMap = cellBuckets.get(rk);
    if (!cellMap) {
      cellMap = new Map();
      cellBuckets.set(rk, cellMap);
    }
    let cell = cellMap.get(ck);
    if (!cell) {
      cell = {};
      cellMap.set(ck, cell);
    }
    let rb = rowBuckets.get(rk);
    if (!rb) { rb = {}; rowBuckets.set(rk, rb); }
    let cb = colBuckets.get(ck);
    if (!cb) { cb = {}; colBuckets.set(ck, cb); }

    for (const field of directFields) {
      const raw = getField(r, field);
      const num = typeof raw === "number" ? raw : Number(raw);
      if (!isFinite(num)) continue;
      pushBucket(cell, field, num);
      pushBucket(rb, field, num);
      pushBucket(cb, field, num);
      pushBucket(grandBucket, field, num);
    }
  }

  // Reduce buckets → measures
  function reduce(b: Bucket): Record<string, number | null> {
    const out: Record<string, number | null> = {};
    // primeiro, agregações diretas
    for (const m of config.values) {
      if (m.derive) continue;
      out[m.id] = aggregate(b[m.field] ?? [], m.agg);
    }
    // depois, derivadas
    for (const m of config.values) {
      if (!m.derive) continue;
      out[m.id] = m.derive(out);
    }
    return out;
  }

  const cells = new Map<string, Map<string, Record<string, number | null>>>();
  for (const [rk, cmap] of cellBuckets) {
    const inner = new Map<string, Record<string, number | null>>();
    for (const [ck, b] of cmap) {
      inner.set(ck, reduce(b));
    }
    cells.set(rk, inner);
  }
  const rowTotals = new Map<string, Record<string, number | null>>();
  for (const [rk, b] of rowBuckets) rowTotals.set(rk, reduce(b));
  const colTotals = new Map<string, Record<string, number | null>>();
  for (const [ck, b] of colBuckets) colTotals.set(ck, reduce(b));
  const grandTotal = reduce(grandBucket);

  return { rowHeaders, colHeaders, cells, rowTotals, colTotals, grandTotal };
}
