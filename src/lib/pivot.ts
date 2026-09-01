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
  dependsOn?: string[];
}

export interface PivotConfig {
  rows: string[];      // dimensões em linhas
  cols: string[];      // dimensões em colunas
  values: PivotMeasure[];
  measureCatalog?: PivotMeasure[];
  filters: Record<string, string[]>; // {dim: allowed values}
}

export interface PivotResult {
  /** árvore de linhas: array de {keys, isTotal, depth, cells: {colKey: {measureId: number}}} */
  rowHeaders: PivotRowHeader[];
  /** Apenas folhas de linha, preservando a lista plana usada antes da hierarquia expansível. */
  leafRowHeaders: PivotRowHeader[];
  /** árvore de colunas */
  colHeaders: PivotColHeader[];
  /** célula: cells[rowKey][colKey][measureId] */
  cells: Map<string, Map<string, Record<string, number | null>>>;
  /**
   * Mantido vazio por compatibilidade. Drill-through agora é calculado sob demanda
   * por getDrillRowsForCell para não materializar todas as combinações na abertura.
   */
  drillRows: Map<string, Map<string, number[]>>;
  /** totais por linha */
  rowTotals: Map<string, Record<string, number | null>>;
  /** totais por coluna */
  colTotals: Map<string, Record<string, number | null>>;
  /** total geral */
  grandTotal: Record<string, number | null>;
  /**
   * Maior valor absoluto por medida, entre todas as células (linha×coluna,
   * incluindo linhas de grupo/subtotal). Calculado aqui — no mesmo passe que
   * já monta `cells` — pra alimentar o heatmap sem precisar de um segundo
   * loop completo no componente (achado 04 da análise de UX/UI: antes disso,
   * `maxByMeasure` refazia essa varredura inteira, síncrona, no cliente).
   */
  measureRange: Record<string, number>;
}

export interface PivotSizeEstimate {
  filteredRowCount: number;
  rowHeaderCount: number;
  leafRowCount: number;
  colHeaderCount: number;
  observedCellCount: number;
  visibleValueCellCount: number;
  measureCount: number;
}

export interface PivotRowHeader {
  key: string;          // chave única da linha (concat dos values)
  values: string[];     // valor por dimensão
  depth: number;
  isLeaf: boolean;
  parentKey?: string;
  childrenKeys?: string[];
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

function buildRowHeaders(
  rows: Record<string, unknown>[],
  dims: string[],
): {
  headers: PivotRowHeader[];
  leafHeaders: PivotRowHeader[];
  keyOf: (r: Record<string, unknown>) => string;
  groupKeyOf: (r: Record<string, unknown>) => string | null;
} {
  const flat = buildHeaders(rows, dims);
  const leafHeaders = flat.headers.map((header) => ({ ...header, isLeaf: true }));
  if (dims.length <= 1) {
    return {
      headers: leafHeaders,
      leafHeaders,
      keyOf: flat.keyOf,
      groupKeyOf: () => null,
    };
  }

  const childrenByGroup = new Map<string, PivotRowHeader[]>();
  const groupValues = new Map<string, string>();
  for (const leaf of leafHeaders) {
    const groupValue = leaf.values[0] ?? EMPTY;
    const groupKey = groupValue;
    const groupedLeaf = { ...leaf, depth: 1, parentKey: groupKey };
    if (!childrenByGroup.has(groupKey)) childrenByGroup.set(groupKey, []);
    childrenByGroup.get(groupKey)!.push(groupedLeaf);
    groupValues.set(groupKey, groupValue);
  }

  const headers: PivotRowHeader[] = [];
  for (const [groupKey, children] of childrenByGroup) {
    headers.push({
      key: groupKey,
      values: [groupValues.get(groupKey) ?? EMPTY],
      depth: 0,
      isLeaf: false,
      childrenKeys: children.map((child) => child.key),
    });
    headers.push(...children);
  }

  return {
    headers,
    leafHeaders: headers.filter((header) => header.isLeaf),
    keyOf: flat.keyOf,
    groupKeyOf: (r) => dimVal(r, dims[0]),
  };
}

export function estimatePivotSize(
  rows: Record<string, unknown>[],
  config: Pick<PivotConfig, "rows" | "cols" | "values" | "filters">,
  options: { observedCellCap?: number } = {},
): PivotSizeEstimate {
  const activeFilters = Object.entries(config.filters).filter(([, allowed]) => allowed && allowed.length > 0);
  const rowKeys = new Set<string>();
  const rowGroups = new Set<string>();
  const colKeys = new Set<string>();
  const observedCells = new Set<string>();
  const observedCellCap = options.observedCellCap ?? Number.POSITIVE_INFINITY;
  let filteredRowCount = 0;

  for (const row of rows) {
    let matches = true;
    for (const [dim, allowed] of activeFilters) {
      if (!allowed.includes(dimVal(row, dim))) {
        matches = false;
        break;
      }
    }
    if (!matches) continue;

    filteredRowCount += 1;
    const rowValues = config.rows.map((dim) => dimVal(row, dim));
    const rowKey = config.rows.length === 0 ? "__all__" : rowValues.join(SEP);
    const colKey = config.cols.length === 0 ? "__all__" : config.cols.map((dim) => dimVal(row, dim)).join(SEP);
    rowKeys.add(rowKey);
    if (config.rows.length > 1) rowGroups.add(rowValues[0] ?? EMPTY);
    colKeys.add(colKey);
    if (observedCells.size <= observedCellCap) observedCells.add(`${rowKey}${SEP}${colKey}`);
  }

  const leafRowCount = config.rows.length === 0 ? (filteredRowCount > 0 ? 1 : 0) : rowKeys.size;
  const rowHeaderCount = config.rows.length > 1 ? leafRowCount + rowGroups.size : leafRowCount;
  const colHeaderCount = config.cols.length === 0 ? (filteredRowCount > 0 ? 1 : 0) : colKeys.size;
  const measureCount = Math.max(1, config.values.length);

  return {
    filteredRowCount,
    rowHeaderCount,
    leafRowCount,
    colHeaderCount,
    observedCellCount: observedCells.size,
    visibleValueCellCount: rowHeaderCount * Math.max(1, colHeaderCount) * measureCount,
    measureCount,
  };
}

export function computePivot(
  rows: Record<string, unknown>[],
  config: PivotConfig,
): PivotResult {
  // Aplicar filtros
  let filteredRows = rows;
  for (const [dim, allowed] of Object.entries(config.filters)) {
    if (!allowed || allowed.length === 0) continue;
    filteredRows = filteredRows.filter((row) => allowed.includes(dimVal(row, dim)));
  }

  const { headers: rowHeaders, leafHeaders: leafRowHeaders, keyOf: rowKeyOf, groupKeyOf } = buildRowHeaders(filteredRows, config.rows);
  const { headers: colHeaders, keyOf: colKeyOf } = buildHeaders(filteredRows, config.cols);

  // Buckets de acumuladores incrementais por (rowKey, colKey, measureField).
  // Evita manter listas completas de valores brutos em memória.
  type Bucket = Record<string, FieldAccumulator>;
  const cellBuckets = new Map<string, Map<string, Bucket>>();
  const rowBuckets = new Map<string, Bucket>();
  const colBuckets = new Map<string, Bucket>();
  const grandBucket: Bucket = {};

  const visibleMeasureIds = new Set(config.values.map((measure) => measure.id));
  const measureById = new Map<string, PivotMeasure>();
  for (const measure of [...(config.measureCatalog ?? []), ...config.values]) {
    measureById.set(measure.id, measure);
  }
  const effectiveMeasureIds = new Set<string>();
  const visitMeasure = (measure: PivotMeasure) => {
    if (effectiveMeasureIds.has(measure.id)) return;
    for (const depId of measure.dependsOn ?? []) {
      const dep = measureById.get(depId);
      if (dep) visitMeasure(dep);
    }
    effectiveMeasureIds.add(measure.id);
  };
  config.values.forEach(visitMeasure);
  const effectiveValues = Array.from(effectiveMeasureIds)
    .map((id) => measureById.get(id))
    .filter((measure): measure is PivotMeasure => !!measure);

  const directFields = new Set<string>();
  for (const m of effectiveValues) {
    if (!m.derive) directFields.add(m.field);
  }

  function pushBucket(b: Bucket, field: string, val: number) {
    if (!b[field]) b[field] = createAccumulator(val);
    else addToAccumulator(b[field], val);
  }

  for (const r of filteredRows) {
    const rk = rowKeyOf(r);
    const gk = groupKeyOf(r);
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
    const groupCell = gk && gk !== rk ? (() => {
      let groupCellMap = cellBuckets.get(gk);
      if (!groupCellMap) {
        groupCellMap = new Map();
        cellBuckets.set(gk, groupCellMap);
      }
      let bucket = groupCellMap.get(ck);
      if (!bucket) {
        bucket = {};
        groupCellMap.set(ck, bucket);
      }
      return bucket;
    })() : null;
    const groupRowBucket = gk && gk !== rk ? (() => {
      let bucket = rowBuckets.get(gk);
      if (!bucket) {
        bucket = {};
        rowBuckets.set(gk, bucket);
      }
      return bucket;
    })() : null;
    let cb = colBuckets.get(ck);
    if (!cb) { cb = {}; colBuckets.set(ck, cb); }

    for (const field of directFields) {
      const raw = getField(r, field);
      const num = typeof raw === "number" ? raw : Number(raw);
      if (!isFinite(num)) continue;
      pushBucket(cell, field, num);
      pushBucket(rb, field, num);
      if (groupCell) pushBucket(groupCell, field, num);
      if (groupRowBucket) pushBucket(groupRowBucket, field, num);
      pushBucket(cb, field, num);
      pushBucket(grandBucket, field, num);
    }
  }

  // Reduce buckets → measures
  function reduce(b: Bucket): Record<string, number | null> {
    const out: Record<string, number | null> = {};
    // primeiro, agregações diretas
    for (const m of effectiveValues) {
      if (m.derive) continue;
      out[m.id] = aggregate(b[m.field], m.agg);
    }
    // depois, derivadas
    for (const m of effectiveValues) {
      if (!m.derive) continue;
      out[m.id] = m.derive(out);
    }
    return Object.fromEntries(
      Object.entries(out).filter(([measureId]) => visibleMeasureIds.has(measureId)),
    );
  }

  const cells = new Map<string, Map<string, Record<string, number | null>>>();
  const measureRange: Record<string, number> = {};
  for (const [rk, cmap] of cellBuckets) {
    const inner = new Map<string, Record<string, number | null>>();
    for (const [ck, b] of cmap) {
      const reduced = reduce(b);
      inner.set(ck, reduced);
      for (const [measureId, v] of Object.entries(reduced)) {
        if (v == null || !isFinite(v)) continue;
        const abs = Math.abs(v);
        if (abs > (measureRange[measureId] ?? 0)) measureRange[measureId] = abs;
      }
    }
    cells.set(rk, inner);
  }
  const rowTotals = new Map<string, Record<string, number | null>>();
  for (const [rk, b] of rowBuckets) rowTotals.set(rk, reduce(b));
  const colTotals = new Map<string, Record<string, number | null>>();
  for (const [ck, b] of colBuckets) colTotals.set(ck, reduce(b));
  const grandTotal = reduce(grandBucket);

  return { rowHeaders, leafRowHeaders, colHeaders, cells, drillRows: new Map(), rowTotals, colTotals, grandTotal, measureRange };
}

export function getDrillRowsForCell(
  rows: Record<string, unknown>[],
  config: PivotConfig,
  rowKey: string,
  colKey: string,
): number[] {
  const activeFilters = Object.entries(config.filters).filter(([, allowed]) => allowed && allowed.length > 0);
  const { keyOf: rowKeyOf, groupKeyOf } = buildRowHeaders([], config.rows);
  const { keyOf: colKeyOf } = buildHeaders([], config.cols);
  const indexes: number[] = [];

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    let matchesFilters = true;
    for (const [dim, allowed] of activeFilters) {
      if (!allowed.includes(dimVal(row, dim))) {
        matchesFilters = false;
        break;
      }
    }
    if (!matchesFilters) continue;

    const leafKey = rowKeyOf(row);
    const groupKey = groupKeyOf(row);
    const matchesRow = leafKey === rowKey || (groupKey != null && groupKey === rowKey);
    if (!matchesRow) continue;
    if (colKeyOf(row) !== colKey) continue;

    indexes.push(index);
  }

  return indexes;
}
