// Pivot Table engine — agrega linhas por dimensões em "rows" e "cols",
// computa medidas em "values" e suporta filtros internos.
// Genérico o suficiente para Real, Budget e Comparativo.

/**
 * `avg` calcula média aritmética simples dos valores linha a linha.
 *
 * Não use `avg` para medidas de razão/proporção como preço médio, margem %,
 * R$/Kg ou qualquer indicador calculado por divisão entre duas grandezas.
 * Nesses casos, agregue numerador e denominador com `sum` e calcule o resultado
 * em `derive` (ex.: soma ROL / soma Volume). Usar `avg` sobre uma razão
 * pré-calculada por linha gera média de médias, que fica estatisticamente
 * incorreta quando volume, quantidade ou peso variam entre itens agregados.
 */
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
  format: "currency" | "number" | "percent" | "tons" | "kg";
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
  /** índices das linhas originais que compõem cada célula: drillRows[rowKey][colKey] */
  drillRows: Map<string, Map<string, number[]>>;
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

interface FieldAccumulator {
  sum: number;
  count: number;
  min: number;
  max: number;
}

function createAccumulator(value: number): FieldAccumulator {
  return {
    sum: value,
    count: 1,
    min: value,
    max: value,
  };
}

function addToAccumulator(acc: FieldAccumulator, value: number): void {
  acc.sum += value;
  acc.count += 1;
  if (value < acc.min) acc.min = value;
  if (value > acc.max) acc.max = value;
}

function aggregate(acc: FieldAccumulator | undefined, fn: AggFn): number | null {
  if (!acc || acc.count === 0) return null;
  switch (fn) {
    case "sum":
      return acc.sum;
    case "avg":
      return acc.sum / acc.count;
    case "count":
      return acc.count;
    case "min":
      return acc.min;
    case "max":
      return acc.max;
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
  let filtered = rows.map((row, index) => ({ row, index }));
  for (const [dim, allowed] of Object.entries(config.filters)) {
    if (!allowed || allowed.length === 0) continue;
    filtered = filtered.filter(({ row }) => allowed.includes(dimVal(row, dim)));
  }
  const filteredRows = filtered.map(({ row }) => row);

  const { headers: rowHeaders, keyOf: rowKeyOf } = buildHeaders(filteredRows, config.rows);
  const { headers: colHeaders, keyOf: colKeyOf } = buildHeaders(filteredRows, config.cols);

  // Buckets de acumuladores incrementais por (rowKey, colKey, measureField).
  // Evita manter listas completas de valores brutos em memória.
  type Bucket = Record<string, FieldAccumulator>;
  const cellBuckets = new Map<string, Map<string, Bucket>>();
  const drillRows = new Map<string, Map<string, number[]>>();
  const rowBuckets = new Map<string, Bucket>();
  const colBuckets = new Map<string, Bucket>();
  const grandBucket: Bucket = {};

  const directFields = new Set<string>();
  for (const m of config.values) {
    if (!m.derive) directFields.add(m.field);
  }

  function pushBucket(b: Bucket, field: string, val: number) {
    if (!b[field]) b[field] = createAccumulator(val);
    else addToAccumulator(b[field], val);
  }

  for (const { row: r, index } of filtered) {
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
    let drillMap = drillRows.get(rk);
    if (!drillMap) {
      drillMap = new Map();
      drillRows.set(rk, drillMap);
    }
    let drill = drillMap.get(ck);
    if (!drill) {
      drill = [];
      drillMap.set(ck, drill);
    }
    drill.push(index);
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
      out[m.id] = aggregate(b[m.field], m.agg);
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

  return { rowHeaders, colHeaders, cells, drillRows, rowTotals, colTotals, grandTotal };
}
