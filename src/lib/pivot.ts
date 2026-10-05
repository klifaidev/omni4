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
  /**
   * Campo calculado pela pessoa: fórmula canônica ("[rol_real] / [vol_real]").
   * Serializável — o worker recompila `derive` a partir dela.
   */
  formula?: string;
}

export interface PivotConfig {
  rows: string[];      // dimensões em linhas
  cols: string[];      // dimensões em colunas
  values: PivotMeasure[];
  measureCatalog?: PivotMeasure[];
  filters: Record<string, string[]>; // {dim: allowed values}
  /**
   * Acima de `threshold` colunas, mantém só as `top` maiores (pela 1ª medida)
   * e soma o resto numa coluna "Outros" — agregada a partir das linhas, então
   * medidas derivadas (CM%, R$/kg) saem certas, não somadas.
   */
  colLimit?: PivotColLimit | null;
}

export interface PivotColLimit {
  top: number;
  threshold: number;
}

/** Chave da coluna "Outros" criada por `colLimit`. */
export const PIVOT_OTHERS_COL_KEY = "__outros__";

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
  /** Colunas somadas em "Outros" por `colLimit` (0 quando não aplicou). */
  hiddenColCount: number;
  /** Medida usada pra escolher as maiores colunas, quando `colLimit` aplicou. */
  colLimitMeasureId: string | null;
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
  // "—" (valor vazio na base) vai sempre por último: pelo agrupamento de
  // texto ele vinha antes de qualquer letra e abria toda tabela com uma
  // linha sem nome.
  if (av === EMPTY || bv === EMPTY) return av === bv ? 0 : av === EMPTY ? 1 : -1;
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
const NO_GROUP_KEYS: string[] = [];

interface PivotIndex {
  rows: Record<string, unknown>[];
  rowKeys: string[];
  colKeys: string[];
  /** Chave de cada grupo-ancestral da linha, do 1º nível ao penúltimo. */
  groupKeys: string[][];
  rowValues: Map<string, string[]>;
  colValues: Map<string, string[]>;
  groupCount: number;
  observedCellCount: number;
  hiddenColCount: number;
  colLimitMeasureId: string | null;
}

type IndexConfig = Pick<PivotConfig, "rows" | "cols" | "filters"> &
  Partial<Pick<PivotConfig, "values" | "measureCatalog" | "colLimit">>;

/**
 * Campo usado pra ranquear as colunas no `colLimit`: o da 1ª medida visível;
 * se ela for derivada (CM%), o da 1ª medida direta de que ela depende.
 */
function colRankingField(config: IndexConfig): { measureId: string; field: string } | null {
  const byId = new Map<string, PivotMeasure>();
  for (const m of [...(config.measureCatalog ?? []), ...(config.values ?? [])]) byId.set(m.id, m);
  for (const m of config.values ?? []) {
    if (!m.derive) return { measureId: m.id, field: m.field };
    for (const depId of m.dependsOn ?? []) {
      const dep = byId.get(depId);
      if (dep && !dep.derive) return { measureId: dep.id, field: dep.field };
    }
  }
  return null;
}

/** Mantém as `top` maiores colunas e remapeia o resto pra "Outros". */
function applyColLimit(index: PivotIndex, config: IndexConfig): boolean {
  const limit = config.colLimit;
  if (!limit || config.cols.length === 0 || index.colValues.size <= limit.threshold) return false;
  const ranking = colRankingField(config);
  if (!ranking) return false;
  const totals = new Map<string, number>();
  for (let i = 0; i < index.rows.length; i++) {
    const raw = index.rows[i][ranking.field];
    const num = typeof raw === "number" ? raw : Number(raw);
    if (!isFinite(num)) continue;
    const ck = index.colKeys[i];
    totals.set(ck, (totals.get(ck) ?? 0) + num);
  }
  const ranked = Array.from(index.colValues.keys()).sort(
    (a, b) => Math.abs(totals.get(b) ?? 0) - Math.abs(totals.get(a) ?? 0),
  );
  const keep = new Set(ranked.slice(0, limit.top));
  const hidden = ranked.length - keep.size;
  if (hidden <= 0) return false;
  for (let i = 0; i < index.colKeys.length; i++) {
    if (!keep.has(index.colKeys[i])) index.colKeys[i] = PIVOT_OTHERS_COL_KEY;
  }
  for (const key of ranked.slice(limit.top)) index.colValues.delete(key);
  index.colValues.set(PIVOT_OTHERS_COL_KEY, [`Outros (${hidden.toLocaleString("pt-BR")})`]);
  index.hiddenColCount = hidden;
  index.colLimitMeasureId = ranking.measureId;
  return true;
}

function indexPivotRows(
  rows: Record<string, unknown>[],
  config: IndexConfig,
  observedCellCap: number | null,
): PivotIndex {
  const filters = activeFilterSets(config.filters);
  const rowDims = config.rows;
  const colDims = config.cols;
  // Hierarquia: com N dimensões de linha, cada prefixo (1ª; 1ª+2ª; ...; até
  // N-1) é um grupo com subtotal. Antes só a 1ª dimensão agrupava.
  const groupLevels = Math.max(0, rowDims.length - 1);
  const index: PivotIndex = {
    rows: [],
    rowKeys: [],
    colKeys: [],
    groupKeys: [],
    rowValues: new Map(),
    colValues: new Map(),
    groupCount: 0,
    observedCellCount: 0,
    hiddenColCount: 0,
    colLimitMeasureId: null,
  };
  const groupSets = Array.from({ length: groupLevels }, () => new Set<string>());
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
    let prefixes = NO_GROUP_KEYS;
    if (groupLevels > 0) {
      prefixes = new Array<string>(groupLevels);
      let key = dimVal(row, rowDims[0]);
      for (let level = 0; level < groupLevels; level++) {
        if (level > 0) key += SEP + dimVal(row, rowDims[level]);
        prefixes[level] = key;
        groupSets[level].add(key);
      }
    }
    if (observedCells && observedCellCap !== null && observedCells.size <= observedCellCap) {
      observedCells.add(`${rk}${SEP}${ck}`);
    }
    index.rows.push(row);
    index.rowKeys.push(rk);
    index.colKeys.push(ck);
    index.groupKeys.push(prefixes);
  }

  index.groupCount = groupSets.reduce((sum, set) => sum + set.size, 0);
  if (applyColLimit(index, config) && observedCells && observedCellCap !== null) {
    // As combinações linha×coluna mudam com o "Outros" — reconta.
    observedCells.clear();
    for (let i = 0; i < index.rows.length && observedCells.size <= observedCellCap; i++) {
      observedCells.add(`${index.rowKeys[i]}${SEP}${index.colKeys[i]}`);
    }
  }
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
    hiddenColCount: index.hiddenColCount,
    colLimitMeasureId: index.colLimitMeasureId,
  };
}

export function estimatePivotSize(
  rows: Record<string, unknown>[],
  config: Pick<PivotConfig, "rows" | "cols" | "values" | "filters"> & Partial<Pick<PivotConfig, "measureCatalog" | "colLimit">>,
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

  // As folhas já vêm ordenadas dimensão a dimensão, então cada grupo é um
  // trecho contíguo: abre um cabeçalho de grupo sempre que o prefixo de um
  // nível muda (ordem de profundidade: grupo, subgrupos, folhas).
  const levels = dims.length - 1;
  const open: Array<PivotRowHeader | null> = new Array(levels).fill(null);
  const headers: PivotRowHeader[] = [];
  const groupedLeaves: PivotRowHeader[] = [];
  for (const leaf of leafHeaders) {
    let prefix = "";
    let parent: PivotRowHeader | null = null;
    for (let level = 0; level < levels; level++) {
      prefix = level === 0 ? (leaf.values[0] ?? EMPTY) : `${prefix}${SEP}${leaf.values[level] ?? EMPTY}`;
      let group = open[level];
      if (!group || group.key !== prefix) {
        group = {
          key: prefix,
          values: leaf.values.slice(0, level + 1),
          depth: level,
          isLeaf: false,
          parentKey: parent?.key,
          childrenKeys: [],
        };
        headers.push(group);
        parent?.childrenKeys!.push(prefix);
        open[level] = group;
        for (let deeper = level + 1; deeper < levels; deeper++) open[deeper] = null;
      }
      parent = group;
    }
    const groupedLeaf: PivotRowHeader = { ...leaf, depth: levels, parentKey: parent!.key };
    parent!.childrenKeys!.push(leaf.key);
    headers.push(groupedLeaf);
    groupedLeaves.push(groupedLeaf);
  }
  return { headers, leafHeaders: groupedLeaves };
}

function aggregateIndex(index: PivotIndex, config: PivotConfig): PivotResult {
  const { headers: rowHeaders, leafHeaders: leafRowHeaders } = buildRowHeaderTree(index, config.rows);
  // "Outros" (colLimit) fica sempre por último, fora da ordenação natural.
  const othersValues = index.colValues.get(PIVOT_OTHERS_COL_KEY);
  const regularColValues = othersValues
    ? new Map(Array.from(index.colValues).filter(([key]) => key !== PIVOT_OTHERS_COL_KEY))
    : index.colValues;
  const colHeaders: PivotColHeader[] = config.cols.length === 0
    ? [{ key: "__all__", values: [], depth: 0, isLeaf: true }]
    : sortedHeaders(regularColValues, config.cols);
  if (config.cols.length > 0 && othersValues) {
    colHeaders.push({ key: PIVOT_OTHERS_COL_KEY, values: othersValues, depth: 0, isLeaf: true });
  }

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
    const prefixes = index.groupKeys[i];
    const cell = cellBucketIn(rk, ck);
    const rb = bucketIn(rowBuckets, rk);
    const cb = bucketIn(colBuckets, ck);
    // Subtotais de cada grupo-ancestral (todos os níveis da hierarquia).
    const groupCells = prefixes.length ? prefixes.map((gk) => cellBucketIn(gk, ck)) : null;
    const groupRows = prefixes.length ? prefixes.map((gk) => bucketIn(rowBuckets, gk)) : null;

    for (let f = 0; f < directFields.length; f++) {
      const field = directFields[f];
      const raw = getField(r, field);
      const num = typeof raw === "number" ? raw : Number(raw);
      if (!isFinite(num)) continue;
      pushBucket(cell, field, num);
      pushBucket(rb, field, num);
      if (groupCells) for (let g = 0; g < groupCells.length; g++) pushBucket(groupCells[g], field, num);
      if (groupRows) for (let g = 0; g < groupRows.length; g++) pushBucket(groupRows[g], field, num);
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

/**
 * `explicitColKeys`: colunas mostradas uma a uma — necessárias pra célula
 * "Outros" (colLimit), que reúne toda linha cuja coluna NÃO está nesse conjunto.
 */
export function getDrillRowsForCell(
  rows: Record<string, unknown>[],
  config: PivotConfig,
  rowKey: string,
  colKey: string,
  explicitColKeys?: Set<string>,
): number[] {
  const filters = activeFilterSets(config.filters);
  const groupLevels = Math.max(0, config.rows.length - 1);
  const indexes: number[] = [];
  const isOthers = colKey === PIVOT_OTHERS_COL_KEY && !!explicitColKeys;

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (filters.length > 0 && !passesFilters(row, filters)) continue;
    // A linha bate com a folha ou com qualquer grupo-ancestral (subtotal).
    let matchesRow = false;
    let prefix = "";
    for (let level = 0; level < groupLevels && !matchesRow; level++) {
      prefix = level === 0 ? dimVal(row, config.rows[0]) : `${prefix}${SEP}${dimVal(row, config.rows[level])}`;
      if (prefix === rowKey) matchesRow = true;
    }
    if (!matchesRow) matchesRow = keyFor(row, config.rows) === rowKey;
    if (!matchesRow) continue;
    const rowColKey = keyFor(row, config.cols);
    if (isOthers ? explicitColKeys!.has(rowColKey) : rowColKey !== colKey) continue;
    indexes.push(index);
  }

  return indexes;
}
