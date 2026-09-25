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
  /**
   * Menor e maior valor (com sinal) por medida, entre as mesmas células de
   * `measureRange`. Escala do heatmap: medidas de faixa estreita (ex.: CM%
   * entre 29% e 32%) ficavam todas com a mesma cor numa escala 0→máximo.
   */
  measureMin: Record<string, number>;
  measureMax: Record<string, number>;
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

const MES_ORDER: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

function mesLabelKey(v: string): number {
  const m = v.match(/^([A-Za-zçÇ]{3})\/(\d{2,4})$/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  const mn = MES_ORDER[m[1].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")];
  if (!mn) return Number.MAX_SAFE_INTEGER;
  const yr = parseInt(m[2], 10);
  const yyyy = yr < 100 ? 2000 + yr : yr;
  return yyyy * 100 + mn;
}

// Mesmo resultado de localeCompare(b, "pt-BR", { numeric: true }), sem
// recriar as regras de collation a cada comparação.
const PT_BR_COLLATOR = new Intl.Collator("pt-BR", { numeric: true });

function compareDimValues(dim: string, av: string, bv: string): number {
  if (dim === "mesLabel") return mesLabelKey(av) - mesLabelKey(bv);
  return PT_BR_COLLATOR.compare(av, bv);
}

function sortedHeaders(valuesByKey: Map<string, string[]>, dims: string[]): PivotRowHeader[] {
  return Array.from(valuesByKey.entries())
    .sort(([, a], [, b]) => {
      for (let i = 0; i < a.length; i++) {
        const cmp = compareDimValues(dims[i], a[i], b[i]);
        if (cmp !== 0) return cmp;
      }
      return 0;
    })
    .map(([key, values]) => ({ key, values, depth: 0, isLeaf: true }));
}

function keyFor(row: Record<string, unknown>, dims: string[]): string {
  if (dims.length === 0) return "__all__";
  let key = dimVal(row, dims[0]);
  for (let i = 1; i < dims.length; i++) key += SEP + dimVal(row, dims[i]);
  return key;
}

function activeFilterSets(filters: Record<string, string[]>): Array<[string, Set<string>]> {
  const out: Array<[string, Set<string>]> = [];
  for (const [dim, allowed] of Object.entries(filters)) {
    if (allowed && allowed.length > 0) out.push([dim, new Set(allowed)]);
  }
  return out;
}

function passesFilters(row: Record<string, unknown>, filters: Array<[string, Set<string>]>): boolean {
  for (const [dim, allowed] of filters) {
    if (!allowed.has(dimVal(row, dim))) return false;
  }
  return true;
}

/**
 * Passada única sobre as linhas: filtra (com Set, não Array.includes) e
 * calcula as chaves de linha/coluna/grupo de cada registro uma única vez.
 * Estimativa de tamanho e agregação reaproveitam o mesmo índice — antes,
 * cada chave era recalculada em até 4 passadas (estimativa, cabeçalhos de
 * linha, de coluna e agregação).
 */
interface PivotIndex {
  rows: Record<string, unknown>[];
  rowKeys: string[];
  colKeys: string[];
  groupKeys: (string | null)[];
  rowValues: Map<string, string[]>;
  colValues: Map<string, string[]>;
  groupCount: number;
  observedCellCount: number;
}

function indexPivotRows(
  rows: Record<string, unknown>[],
  config: Pick<PivotConfig, "rows" | "cols" | "filters">,
  observedCellCap: number | null,
): PivotIndex {
  const filters = activeFilterSets(config.filters);
  const rowDims = config.rows;
  const colDims = config.cols;
  const grouped = rowDims.length > 1;
  const index: PivotIndex = {
    rows: [],
    rowKeys: [],
    colKeys: [],
    groupKeys: [],
    rowValues: new Map(),
    colValues: new Map(),
    groupCount: 0,
    observedCellCount: 0,
  };
  const groups = grouped ? new Set<string>() : null;
  const observedCells = observedCellCap === null ? null : new Set<string>();

  for (const row of rows) {
    if (filters.length > 0 && !passesFilters(row, filters)) continue;
    const rk = keyFor(row, rowDims);
    const ck = keyFor(row, colDims);
    if (rowDims.length > 0 && !index.rowValues.has(rk)) {
      index.rowValues.set(rk, rowDims.map((dim) => dimVal(row, dim)));
    }
    if (colDims.length > 0 && !index.colValues.has(ck)) {
      index.colValues.set(ck, colDims.map((dim) => dimVal(row, dim)));
    }
    const gk = grouped ? dimVal(row, rowDims[0]) : null;
    if (groups && gk !== null) groups.add(gk);
    if (observedCells && observedCellCap !== null && observedCells.size <= observedCellCap) {
      observedCells.add(`${rk}${SEP}${ck}`);
    }
    index.rows.push(row);
    index.rowKeys.push(rk);
    index.colKeys.push(ck);
    index.groupKeys.push(gk);
  }

  index.groupCount = groups?.size ?? 0;
  index.observedCellCount = observedCells?.size ?? 0;
  return index;
}

function estimateFromIndex(index: PivotIndex, config: Pick<PivotConfig, "rows" | "cols" | "values">): PivotSizeEstimate {
  const filteredRowCount = index.rows.length;
  const leafRowCount = config.rows.length === 0 ? (filteredRowCount > 0 ? 1 : 0) : index.rowValues.size;
  const rowHeaderCount = config.rows.length > 1 ? leafRowCount + index.groupCount : leafRowCount;
  const colHeaderCount = config.cols.length === 0 ? (filteredRowCount > 0 ? 1 : 0) : index.colValues.size;
  const measureCount = Math.max(1, config.values.length);
  return {
    filteredRowCount,
    rowHeaderCount,
    leafRowCount,
    colHeaderCount,
    observedCellCount: index.observedCellCount,
    visibleValueCellCount: rowHeaderCount * Math.max(1, colHeaderCount) * measureCount,
    measureCount,
  };
}

export function estimatePivotSize(
  rows: Record<string, unknown>[],
  config: Pick<PivotConfig, "rows" | "cols" | "values" | "filters">,
  options: { observedCellCap?: number } = {},
): PivotSizeEstimate {
  const index = indexPivotRows(rows, config, options.observedCellCap ?? Number.POSITIVE_INFINITY);
  return estimateFromIndex(index, config);
}

function buildRowHeaderTree(
  index: PivotIndex,
  dims: string[],
): { headers: PivotRowHeader[]; leafHeaders: PivotRowHeader[] } {
  if (dims.length === 0) {
    const all: PivotRowHeader[] = [{ key: "__all__", values: [], depth: 0, isLeaf: true }];
    return { headers: all, leafHeaders: all };
  }
  const leafHeaders = sortedHeaders(index.rowValues, dims);
  if (dims.length === 1) return { headers: leafHeaders, leafHeaders };

  const childrenByGroup = new Map<string, PivotRowHeader[]>();
  for (const leaf of leafHeaders) {
    const groupKey = leaf.values[0] ?? EMPTY;
    const children = childrenByGroup.get(groupKey);
    const groupedLeaf = { ...leaf, depth: 1, parentKey: groupKey };
    if (children) children.push(groupedLeaf);
    else childrenByGroup.set(groupKey, [groupedLeaf]);
  }

  const headers: PivotRowHeader[] = [];
  for (const [groupKey, children] of childrenByGroup) {
    headers.push({
      key: groupKey,
      values: [groupKey],
      depth: 0,
      isLeaf: false,
      childrenKeys: children.map((child) => child.key),
    });
    headers.push(...children);
  }
  return { headers, leafHeaders: headers.filter((header) => header.isLeaf) };
}

function aggregateIndex(index: PivotIndex, config: PivotConfig): PivotResult {
  const { headers: rowHeaders, leafHeaders: leafRowHeaders } = buildRowHeaderTree(index, config.rows);
  const colHeaders: PivotColHeader[] = config.cols.length === 0
    ? [{ key: "__all__", values: [], depth: 0, isLeaf: true }]
    : sortedHeaders(index.colValues, config.cols);

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

  const directFieldSet = new Set<string>();
  for (const m of effectiveValues) {
    if (!m.derive) directFieldSet.add(m.field);
  }
  const directFields = Array.from(directFieldSet);

  const pushBucket = (b: Bucket, field: string, val: number) => {
    const acc = b[field];
    if (!acc) b[field] = createAccumulator(val);
    else addToAccumulator(acc, val);
  };
  const bucketIn = (map: Map<string, Bucket>, key: string): Bucket => {
    let bucket = map.get(key);
    if (!bucket) {
      bucket = {};
      map.set(key, bucket);
    }
    return bucket;
  };
  const cellBucketIn = (rowKey: string, colKey: string): Bucket => {
    let byCol = cellBuckets.get(rowKey);
    if (!byCol) {
      byCol = new Map();
      cellBuckets.set(rowKey, byCol);
    }
    return bucketIn(byCol, colKey);
  };

  for (let i = 0; i < index.rows.length; i++) {
    const r = index.rows[i];
    const rk = index.rowKeys[i];
    const ck = index.colKeys[i];
    const gk = index.groupKeys[i];
    const cell = cellBucketIn(rk, ck);
    const rb = bucketIn(rowBuckets, rk);
    const cb = bucketIn(colBuckets, ck);
    const hasGroup = gk !== null && gk !== rk;
    const groupCell = hasGroup ? cellBucketIn(gk, ck) : null;
    const groupRow = hasGroup ? bucketIn(rowBuckets, gk) : null;

    for (let f = 0; f < directFields.length; f++) {
      const field = directFields[f];
      const raw = getField(r, field);
      const num = typeof raw === "number" ? raw : Number(raw);
      if (!isFinite(num)) continue;
      pushBucket(cell, field, num);
      pushBucket(rb, field, num);
      if (groupCell) pushBucket(groupCell, field, num);
      if (groupRow) pushBucket(groupRow, field, num);
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
  const measureMin: Record<string, number> = {};
  const measureMax: Record<string, number> = {};
  // Subtotais de grupo ficam fora da escala: somam as linhas do grupo e
  // desbotariam todas as outras células.
  const groupRowKeys = new Set<string>();
  for (const header of rowHeaders) if (!header.isLeaf) groupRowKeys.add(header.key);
  for (const [rk, cmap] of cellBuckets) {
    const inner = new Map<string, Record<string, number | null>>();
    const inScale = !groupRowKeys.has(rk);
    for (const [ck, b] of cmap) {
      const reduced = reduce(b);
      inner.set(ck, reduced);
      if (!inScale) continue;
      for (const [measureId, v] of Object.entries(reduced)) {
        if (v == null || !isFinite(v)) continue;
        const abs = Math.abs(v);
        if (abs > (measureRange[measureId] ?? 0)) measureRange[measureId] = abs;
        if (!(measureId in measureMin) || v < measureMin[measureId]) measureMin[measureId] = v;
        if (!(measureId in measureMax) || v > measureMax[measureId]) measureMax[measureId] = v;
      }
    }
    cells.set(rk, inner);
  }
  const rowTotals = new Map<string, Record<string, number | null>>();
  for (const [rk, b] of rowBuckets) rowTotals.set(rk, reduce(b));
  const colTotals = new Map<string, Record<string, number | null>>();
  for (const [ck, b] of colBuckets) colTotals.set(ck, reduce(b));
  const grandTotal = reduce(grandBucket);

  return {
    rowHeaders,
    leafRowHeaders,
    colHeaders,
    cells,
    drillRows: new Map(),
    rowTotals,
    colTotals,
    grandTotal,
    measureRange,
    measureMin,
    measureMax,
  };
}

export function computePivot(
  rows: Record<string, unknown>[],
  config: PivotConfig,
): PivotResult {
  return aggregateIndex(indexPivotRows(rows, config, null), config);
}

export interface PivotLimits {
  maxRowHeaders: number;
  maxColHeaders: number;
  maxObservedCells: number;
  maxVisibleValueCells: number;
}

export function exceedsPivotLimits(estimate: PivotSizeEstimate, limits: PivotLimits): boolean {
  return estimate.rowHeaderCount > limits.maxRowHeaders
    || estimate.colHeaderCount > limits.maxColHeaders
    || estimate.observedCellCount > limits.maxObservedCells
    || estimate.visibleValueCellCount > limits.maxVisibleValueCells;
}

export interface GuardedPivotResult {
  estimate: PivotSizeEstimate;
  /** null quando a estimativa passa dos limites — o pivot não é materializado. */
  result: PivotResult | null;
}

/**
 * Estima e, se couber nos limites, agrega — tudo sobre o mesmo índice, numa
 * única passada de chaveamento. Pensado pra rodar no worker: antes a
 * estimativa rodava à parte no thread principal a cada mudança de config.
 */
export function computePivotGuarded(
  rows: Record<string, unknown>[],
  config: PivotConfig,
  limits: PivotLimits,
): GuardedPivotResult {
  const index = indexPivotRows(rows, config, limits.maxObservedCells);
  const estimate = estimateFromIndex(index, config);
  if (exceedsPivotLimits(estimate, limits)) return { estimate, result: null };
  return { estimate, result: aggregateIndex(index, config) };
}

export function getDrillRowsForCell(
  rows: Record<string, unknown>[],
  config: PivotConfig,
  rowKey: string,
  colKey: string,
): number[] {
  const filters = activeFilterSets(config.filters);
  const grouped = config.rows.length > 1;
  const indexes: number[] = [];

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (filters.length > 0 && !passesFilters(row, filters)) continue;
    const leafKey = keyFor(row, config.rows);
    const groupKey = grouped ? dimVal(row, config.rows[0]) : null;
    const matchesRow = leafKey === rowKey || (groupKey != null && groupKey === rowKey);
    if (!matchesRow) continue;
    if (keyFor(row, config.cols) !== colKey) continue;
    indexes.push(index);
  }

  return indexes;
}
