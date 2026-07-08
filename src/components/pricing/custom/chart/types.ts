// Chart style schema — applies to every ChartBlock.
// All design knobs the inspector and renderer share live here.

import type { KpiMeasureId } from "@/lib/customSlide";

export type ChartType =
  | "line" | "bar" | "column" | "hbar"
  | "stackedColumn" | "stackedBar" | "stackedArea"
  | "pie" | "donut" | "bubble" | "area"
  | "scatter" | "combo" | "waterfall"
  | "funnel" | "treemap" | "radar" | "histogram" | "boxplot";

export type LineStyle = "solid" | "dashed" | "dotted";
export type GridStyle = "solid" | "dashed";
export type LegendPos = "top" | "bottom" | "left" | "right";
export type AxisFormat = "auto" | "currency" | "percent" | "number" | "tons";
export type MarkerShape = "circle" | "square" | "diamond" | "triangle";
export type DataLabelPos =
  | "above" | "below" | "inside-end" | "inside-base" | "center"
  | "left" | "right" | "inside" | "outside" | "callout";
export type BarMode = "grouped" | "stacked" | "stacked100";

export interface AxisStyle {
  show: boolean;
  labelSize: number;
  labelColor: string;
  titleText: string;
  titleSize: number;
  titleColor: string;
  ticks: boolean;
  lineColor: string;
  lineWidth: number;
  min: number | null;
  max: number | null;
  format: AxisFormat;
  decimals: number;
}

export interface GeneralStyle {
  titleShow: boolean;
  titleSize: number;
  titleColor: string;
  titleBold: boolean;
  titleItalic: boolean;
  background: string;
  borderColor: string;
  borderWidth: number;
  padding: number;
  legendShow: boolean;
  legendPos: LegendPos;
}

export interface GridStyleCfg {
  show: boolean;
  color: string;
  style: GridStyle;
}

export interface DataLabelStyle {
  show: boolean;
  position: DataLabelPos;
  size: number;
  color: string;
  autoContrast: boolean;
  bold: boolean;
  italic: boolean;
  format: AxisFormat;
  decimals: number;
  showSeries: boolean;
  showCategory: boolean;
  bgColor: string;
  bgOpacity: number; // 0..1
  borderColor: string;
  borderWidth: number;
}

export interface SeriesStyle {
  /** série/categoria identificador (matched by index when name unknown) */
  key: string;
  color?: string;
  /** line/area */
  lineStyle?: LineStyle;
  thickness?: number;
  smooth?: boolean;
  areaFill?: boolean;
  areaOpacity?: number;
  /** marker for line/scatter */
  marker?: { show: boolean; shape: MarkerShape; size: number; fill?: string; border?: string };
  /** for combo */
  asLine?: boolean;
  secondaryAxis?: boolean;
}

export interface BarStyleCfg {
  mode: BarMode;
  gapPct: number;       // 0..100
  cornerRadius: number; // px
  borderColor: string;
  borderWidth: number;
}

export interface PieStyleCfg {
  donutHolePct: number; // 0..80
  startAngle: number;   // degrees
  explodePct: number;   // 0..30 — applies to all when no per-slice override
  labelMode: "value" | "percent" | "name" | "name-percent" | "name-value";
  /** per slice: { key: { color, explode } } */
  slices: Record<string, { color?: string; explode?: number }>;
}

export interface BubbleStyleCfg {
  minSize: number; // px
  maxSize: number; // px
  fillOpacity: number; // 0..1
  borderColor: string;
  borderWidth: number;
  showSizeLabel: boolean;
}

export interface AreaStyleCfg {
  stacked: boolean;
  lineOnTop: boolean;
}

export type WaterfallColumnType = "start" | "positive" | "negative" | "total" | "subtotal";

export interface WaterfallColumn {
  id: string;
  label: string;
  type: WaterfallColumnType;
  /** Optional measure id (KpiMeasureId). When omitted, manualValue is used. */
  measure?: KpiMeasureId;
  manualValue?: number;
  /** Optional dimension filter applied just to this column (e.g. brand=Melken) */
  filterDim?: string | null;
  filterValue?: string | null;
}

export interface WaterfallStyleCfg {
  positiveColor: string;
  negativeColor: string;
  totalColor: string;
  connectors: boolean;
  connectorColor: string;
  connectorStyle: LineStyle;
  showRunningTotal: boolean;
  labelPos: "above" | "inside" | "below";
  gapPct: number;
  /** per category override: positive | negative | total */
  classify: Record<string, "positive" | "negative" | "total">;
  /** Smart bridge: explicit column list overrides automatic series */
  columns?: WaterfallColumn[];
  /** Bridge mode — "pvm" decompõe Δ entre dois períodos (igual aba Bridge); "manual" usa columns. Default "pvm". */
  mode?: "pvm" | "manual";
  /** Configuração da decomposição PVM. */
  pvm?: {
    base: string | null;
    comp: string | null;
    periodMode: "fy" | "month";
    /** "effects" = Volume/Preço/Custo/...; ou nome de uma dimensão (marca, categoria, etc.) */
    decomposition?: string;
    /** Top N itens quando decomposition é uma dimensão (resto vira "Outros"). */
    topN?: number;
    /** Período de comparação automático. "manual" usa base/comp manualmente. Default "prev-month". */
    comparisonMode?: "prev-month" | "prev-year-month" | "bench" | "manual";
  };
}

export interface FunnelStyleCfg {
  direction: "ttb" | "btt";
  gapPct: number;
  labelMode: "value" | "percent" | "name" | "name-percent";
  labelPos: "left" | "right" | "center" | "inside";
  slices: Record<string, { color?: string }>;
}

export interface TreemapStyleCfg {
  colorScheme: "categorical" | "gradient";
  gradientFrom: string;
  gradientTo: string;
  showCategoryLabel: boolean;
  showValueLabel: boolean;
  labelSize: number;
  labelColor: string;
  borderColor: string;
  borderWidth: number;
}

export interface RadarStyleCfg {
  fillArea: boolean;
  fillOpacity: number; // 0..1
  gridShape: "polygon" | "circle";
  gridColor: string;
  axisLabelSize: number;
  axisLabelColor: string;
}

export interface HistogramStyleCfg {
  bins: number;
  binWidth: number | null;
  barColor: string;
  borderColor: string;
  borderWidth: number;
  cumulative: boolean;
}

export interface BoxplotStyleCfg {
  boxFillColor: string;
  whiskerColor: string;
  whiskerWidth: number;
  medianColor: string;
  medianWidth: number;
  showMean: boolean;
  showOutliers: boolean;
}

export type ConditionalOp = ">" | "<" | "=" | "between";
export interface ConditionalRule {
  id: string;
  op: ConditionalOp;
  threshold: number;
  threshold2?: number; // for "between"
  color: string;
}

export interface ReferenceLineCfg {
  id: string;
  value: number;
  label: string;
  color: string;
  style: LineStyle;
  thickness: number;
}

export interface TrendlineCfg {
  enabled: boolean;
  type: "linear" | "exp" | "ma";
  maWindow: number; // 2-12 for moving average
  color: string;
  thickness: number;
  style: LineStyle;
  showR2: boolean;
}

export interface ForecastCfg {
  enabled: boolean;
  periods: number; // 1-6
  band: boolean;
}

export interface AnalyticsCfg {
  refLines: ReferenceLineCfg[];
  trendline: TrendlineCfg;
  forecast: ForecastCfg;
}

export interface SortConfig {
  field: "period" | "value" | "name";
  dir: "asc" | "desc";
}

export interface ChartStyle {
  general: GeneralStyle;
  xAxis: AxisStyle;
  yAxis: AxisStyle;
  yAxis2?: AxisStyle; // combo
  grid: GridStyleCfg;
  dataLabels: DataLabelStyle;
  series: SeriesStyle[];
  bar: BarStyleCfg;
  pie: PieStyleCfg;
  bubble: BubbleStyleCfg;
  area: AreaStyleCfg;
  waterfall: WaterfallStyleCfg;
  funnel: FunnelStyleCfg;
  treemap: TreemapStyleCfg;
  radar: RadarStyleCfg;
  histogram: HistogramStyleCfg;
  boxplot: BoxplotStyleCfg;
  /** Bubble/scatter only — measure on Y axis */
  measureY?: KpiMeasureId;
  /** Bubble/scatter only — measure on X axis */
  measureX?: KpiMeasureId;
  /** Combo only — measure used by line series */
  measureLine?: KpiMeasureId;
  /** Conditional formatting rules (bar/column/hbar/waterfall/treemap) */
  conditionalRules?: ConditionalRule[];
  conditionalDefault?: string;
  /** Analytics overlays (cartesian charts) */
  analytics?: AnalyticsCfg;
}

import { SLIDE_BRAND_COLORS, SLIDE_CHART_PALETTE, SLIDE_HEX } from "@/lib/slideDesignTokens";

export const DEFAULT_PALETTE = SLIDE_CHART_PALETTE;

export const BRAND_COLORS = SLIDE_BRAND_COLORS;

function defaultAxis(title = ""): AxisStyle {
  return {
    show: true, labelSize: 11, labelColor: SLIDE_HEX.slate500,
    titleText: title, titleSize: 12, titleColor: SLIDE_HEX.chart2,
    ticks: true, lineColor: SLIDE_HEX.slate300, lineWidth: 1,
    min: null, max: null, format: "auto", decimals: 0,
  };
}

export function defaultChartStyle(): ChartStyle {
  return {
    general: {
      titleShow: true, titleSize: 16, titleColor: SLIDE_HEX.chart1,
      titleBold: true, titleItalic: false,
      background: SLIDE_HEX.white, borderColor: SLIDE_HEX.grid, borderWidth: 0,
      padding: 8, legendShow: true, legendPos: "bottom",
    },
    xAxis: defaultAxis(),
    yAxis: defaultAxis(),
    yAxis2: defaultAxis(),
    grid: { show: true, color: SLIDE_HEX.grid, style: "dashed" },
    dataLabels: {
      show: false, position: "above", size: 10, color: SLIDE_HEX.chart2,
      autoContrast: false, bold: false, italic: false,
      format: "auto", decimals: 0,
      showSeries: false, showCategory: false,
      bgColor: SLIDE_HEX.white, bgOpacity: 0,
      borderColor: SLIDE_HEX.grid, borderWidth: 0,
    },
    series: [],
    bar: { mode: "grouped", gapPct: 20, cornerRadius: 0,
           borderColor: SLIDE_HEX.white, borderWidth: 0 },
    pie: { donutHolePct: 0, startAngle: 0, explodePct: 0,
           labelMode: "name-percent", slices: {} },
    bubble: { minSize: 60, maxSize: 600, fillOpacity: 0.6,
              borderColor: SLIDE_HEX.chart2, borderWidth: 1, showSizeLabel: false },
    area: { stacked: false, lineOnTop: true },
    waterfall: {
      positiveColor: SLIDE_HEX.chart7, negativeColor: SLIDE_HEX.chart1, totalColor: SLIDE_HEX.chart2,
      connectors: true, connectorColor: SLIDE_HEX.slate400, connectorStyle: "dashed",
      showRunningTotal: false, labelPos: "above", gapPct: 30, classify: {},
      mode: "pvm",
      pvm: { base: null, comp: null, periodMode: "month", decomposition: "effects", topN: 6, comparisonMode: "prev-month" },
    },
    funnel: { direction: "ttb", gapPct: 4, labelMode: "name-percent", labelPos: "right", slices: {} },
    treemap: {
      colorScheme: "categorical",
      gradientFrom: SLIDE_HEX.chart1, gradientTo: SLIDE_HEX.chart2,
      showCategoryLabel: true, showValueLabel: false,
      labelSize: 11, labelColor: SLIDE_HEX.white,
      borderColor: SLIDE_HEX.white, borderWidth: 1,
    },
    radar: {
      fillArea: true, fillOpacity: 0.35,
      gridShape: "polygon", gridColor: SLIDE_HEX.grid,
      axisLabelSize: 11, axisLabelColor: SLIDE_HEX.slate500,
    },
    histogram: {
      bins: 10, binWidth: null,
      barColor: SLIDE_HEX.chart1, borderColor: SLIDE_HEX.white, borderWidth: 0,
      cumulative: false,
    },
    boxplot: {
      boxFillColor: SLIDE_HEX.chart1,
      whiskerColor: SLIDE_HEX.chart2, whiskerWidth: 1.5,
      medianColor: SLIDE_HEX.white, medianWidth: 2,
      showMean: false, showOutliers: true,
    },
    conditionalRules: [],
    conditionalDefault: "",
    analytics: {
      refLines: [],
      trendline: { enabled: false, type: "linear", maWindow: 3,
                   color: SLIDE_HEX.chart6, thickness: 2, style: "dashed", showR2: false },
      forecast: { enabled: false, periods: 3, band: false },
    },
  };
}

/** Ensure a block.style object exists (back-compat for legacy ChartBlocks). */
export function ensureChartStyle(s?: Partial<ChartStyle>): ChartStyle {
  const d = defaultChartStyle();
  if (!s) return d;
  return {
    ...d, ...s,
    general: { ...d.general, ...(s.general ?? {}) },
    xAxis: { ...d.xAxis, ...(s.xAxis ?? {}) },
    yAxis: { ...d.yAxis, ...(s.yAxis ?? {}) },
    yAxis2: { ...d.yAxis2!, ...(s.yAxis2 ?? {}) },
    grid: { ...d.grid, ...(s.grid ?? {}) },
    dataLabels: { ...d.dataLabels, ...(s.dataLabels ?? {}) },
    bar: { ...d.bar, ...(s.bar ?? {}) },
    pie: { ...d.pie, ...(s.pie ?? {}) },
    bubble: { ...d.bubble, ...(s.bubble ?? {}) },
    area: { ...d.area, ...(s.area ?? {}) },
    waterfall: { ...d.waterfall, ...(s.waterfall ?? {}) },
    funnel: { ...d.funnel, ...(s.funnel ?? {}) },
    treemap: { ...d.treemap, ...(s.treemap ?? {}) },
    radar: { ...d.radar, ...(s.radar ?? {}) },
    histogram: { ...d.histogram, ...(s.histogram ?? {}) },
    boxplot: { ...d.boxplot, ...(s.boxplot ?? {}) },
    series: s.series ?? [],
    conditionalRules: s.conditionalRules ?? [],
    conditionalDefault: s.conditionalDefault ?? "",
    analytics: {
      refLines: s.analytics?.refLines ?? [],
      trendline: { ...d.analytics!.trendline, ...(s.analytics?.trendline ?? {}) },
      forecast: { ...d.analytics!.forecast, ...(s.analytics?.forecast ?? {}) },
    },
  };
}

export function colorForSeries(
  style: ChartStyle, key: string, idx: number,
): string {
  const explicit = style.series.find((s) => s.key === key)?.color;
  return explicit ?? DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length];
}
