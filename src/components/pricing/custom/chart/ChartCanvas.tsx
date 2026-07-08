// ChartCanvas â€” single Recharts-based renderer for every ChartBlock variant.
// Reads the unified ChartStyle so the inspector can drive every visual knob.

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, LineChart, BarChart, AreaChart,
  PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis, Sector,
  Line, Bar, Area, XAxis, YAxis, CartesianGrid, Legend, Tooltip, LabelList,
  Treemap, Customized,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ReferenceLine, ReferenceArea,
} from "recharts";
import type { ChartBlock, KpiMeasureId } from "@/lib/customSlide";
import { KPI_MEASURES, isMeasureAvailable } from "@/lib/customSlide";
import type { PricingRow } from "@/lib/types";
import { applyFilters, calcPVM } from "@/lib/analytics";
import { dataSourceLabel } from "@/lib/slideDataSourceTheme";
import { SLIDE_HEX, SLIDE_RGBA } from "@/lib/slideDesignTokens";

const KPI_MEASURES_LABEL: Record<string, string> = Object.fromEntries(
  KPI_MEASURES.map((m) => [m.id, m.label]),
);

function fallbackMeasureForSource(dataSource: ChartBlock["dataSource"]): KpiMeasureId {
  return dataSource === "forecast" ? "volume" : "rol";
}

function safeMeasureForSource(
  measure: KpiMeasureId | null | undefined,
  dataSource: ChartBlock["dataSource"],
): KpiMeasureId | undefined {
  if (!measure) return undefined;
  return isMeasureAvailable(measure, dataSource) ? measure : undefined;
}
import { usePricing } from "@/store/pricing";
import { useBudget } from "@/store/budget";
import { useForecast } from "@/store/forecast";
import { useRolling } from "@/store/rolling";
import { budgetRowsAsPricingFiltered } from "@/lib/budgetAdapter";
import { forecastRowsAsPricingLatest } from "@/lib/forecastAdapter";
import { rollingRowsAsPricing } from "@/lib/rollingAdapter";
import { aggregateKpi, computeChartSeries, computeTopRanking, formatValue, inferFormat, pickMeasure } from "@/lib/customKpi";
import { resolveChartFit } from "@/lib/customCapacity";
import { useSlideFilters, dimensionLabel, type ActiveFilter } from "../SlideFilterContext";
import { resolveFieldValue } from "./filterHelpers";
import { monthLabel } from "@/lib/format";
import {
  ensureChartStyle, colorForSeries, DEFAULT_PALETTE, type ChartStyle,
} from "./types";
import {
  ChartTooltip, applySort, evalCondColor, renderRefLines,
  linearFit, movingAvg, resolveBridgeColumns, FunnelSVG,
  computeTrendlineSeries, type ChartTooltipPayload,
} from "./chartHelpers";

type PeriodLikeRow = { mes?: number; ano?: number; periodo?: string };
type ChartClickState = {
  nativeEvent?: { stopPropagation?: () => void; shiftKey?: boolean };
  stopPropagation?: () => void;
  shiftKey?: boolean;
  activeLabel?: unknown;
  activePayload?: Array<{ payload?: Record<string, unknown> }>;
};
type ChartMouseEvent = { stopPropagation?: () => void; shiftKey?: boolean };
type RechartsDotProps = {
  key?: string;
  cx?: number;
  cy?: number;
  index?: number;
  payload?: Record<string, unknown>;
};
type RechartsTooltipProps = {
  active?: boolean;
  payload?: ChartTooltipPayload[];
  label?: string;
};
type LabelPointProps = { x?: number; y?: number; value?: unknown };
type PieLabelProps = {
  cx: number; cy: number; midAngle: number; outerRadius: number; innerRadius: number;
  percent: number; value: number; name: string; fill?: string;
};
type TreemapNode = { name?: string };
type TreemapEvent = { stopPropagation?: () => void };
type BoxPlotRow = { q1: number; q3: number };
type BoxPlotShapeProps = {
  x: number; y: number; width: number; height: number;
  payload: { q1: number; q3: number; median: number; min: number; max: number; name: string };
  background?: { y?: number; height?: number };
};

// -- helpers ---------------------------------------------------------------
function fmtVal(v: number, style: ChartStyle, fallback: ReturnType<typeof inferFormat>) {
  const f = style.dataLabels.format === "auto" ? fallback : style.dataLabels.format;
  return formatValue(v, f, "rol", style.dataLabels.decimals);
}
function axisFmt(ax: { format: string; decimals: number }, fallback: ReturnType<typeof inferFormat>) {
  return (v: number) => {
    if (!isFinite(v)) return "";
    const f = ax.format === "auto" ? fallback : ax.format;
    return formatValue(v, f as never, "rol", ax.decimals);
  };
}
function dashArr(s?: "solid" | "dashed" | "dotted") {
  return s === "dashed" ? "5 5" : s === "dotted" ? "2 4" : "0";
}
function signedPt(value: number, digits = 0) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}
function compactGapLabel(value: number, measure: ChartBlock["measure"]) {
  if (measure === "volume") return `${signedPt(value, 0)} Tons`;
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${signedPt(value / 1_000_000, 0)} Mi`;
  if (abs >= 1_000) return `${signedPt(value / 1_000, 0)} mil`;
  return signedPt(value, 0);
}

// Auto-contrast text color from background hex
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  if (h.length < 6) return 1;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Custom data-label content factory â€” supports bg, border, autoContrast, showSeries/Category
function makeLabelContent(opts: {
  style: ChartStyle;
  measureFmt: ReturnType<typeof inferFormat>;
  seriesName?: string;
  categories?: string[];
  customFmt?: (v: number | string) => string;
  anchor?: "middle" | "start" | "end";
  seriesColor?: string;
  /** Hide label when bar/slice pixel size is below this threshold. */
  minSlicePx?: number;
}) {
  const { style: cs, measureFmt, seriesName, categories, customFmt, anchor = "middle", seriesColor } = opts;
  const dl = cs.dataLabels;
  return (props: {
    x?: number; y?: number; cx?: number; cy?: number; width?: number; height?: number;
    viewBox?: { x?: number; y?: number; width?: number; height?: number; cx?: number; cy?: number };
    position?: string; offset?: number; value?: number | string; index?: number;
  }) => {
    if (props.value == null) return null;
    let text: string;
    if (customFmt) {
      text = customFmt(props.value as number | string);
    } else {
      const num = typeof props.value === "number" ? props.value : Number(props.value);
      if (!isFinite(num)) return null;
      text = fmtVal(num, cs, measureFmt);
    }
    const prefix: string[] = [];
    if (dl.showSeries && seriesName) prefix.push(seriesName);
    if (dl.showCategory && categories && props.index != null) {
      const c = categories[props.index];
      if (c) prefix.push(c);
    }
    if (prefix.length) text = `${prefix.join(" Â· ")}: ${text}`;
    let color = dl.color;
    // FIX 11 â€” auto-contrast works even without explicit bg
    if (dl.autoContrast) {
      const insidePos = ["inside-end", "inside-base", "center", "inside"].includes(dl.position);
      const bgRef = (cs.general?.background && cs.general.background !== "transparent")
        ? cs.general.background : SLIDE_HEX.white;
      const ref = dl.bgOpacity > 0
        ? dl.bgColor
        : insidePos && seriesColor
          ? seriesColor
          : bgRef;
      color = luminance(ref) > 0.55 ? SLIDE_HEX.black : SLIDE_HEX.white;
    }
    const fs = dl.size;
    const padX = 3, padY = 2;
    const approxW = text.length * fs * 0.55 + padX * 2;
    const approxH = fs + padY * 2;
    const vb = props.viewBox ?? {};
    const x = Number(vb.x ?? props.x ?? vb.cx ?? props.cx ?? 0);
    const y = Number(vb.y ?? props.y ?? vb.cy ?? props.cy ?? 0);
    const w = Number(vb.width ?? props.width ?? 0);
    const h = Number(vb.height ?? props.height ?? 0);
    const off = props.offset ?? 5;
    if (opts.minSlicePx !== undefined) {
      const sliceSize = Math.max(Math.abs(h), Math.abs(w));
      if (sliceSize > 0 && sliceSize < opts.minSlicePx) return null;
    }
    const pos = props.position ?? "top";
    const verticalSign = h >= 0 ? 1 : -1;
    const horizontalSign = w >= 0 ? 1 : -1;
    let tx = x + w / 2;
    let ty = y - verticalSign * off;
    let textAnchor: "middle" | "start" | "end" = "middle";
    let baseline: "central" | "hanging" | "auto" = verticalSign > 0 ? "auto" : "hanging";
    if (pos === "bottom") { ty = y + h + verticalSign * off; baseline = verticalSign > 0 ? "hanging" : "auto"; }
    else if (pos === "left") { tx = x - horizontalSign * off; ty = y + h / 2; textAnchor = horizontalSign > 0 ? "end" : "start"; baseline = "central"; }
    else if (pos === "right") { tx = x + w + horizontalSign * off; ty = y + h / 2; textAnchor = horizontalSign > 0 ? "start" : "end"; baseline = "central"; }
    else if (pos === "insideLeft") { tx = x + horizontalSign * off; ty = y + h / 2; textAnchor = horizontalSign > 0 ? "start" : "end"; baseline = "central"; }
    else if (pos === "insideRight") { tx = x + w - horizontalSign * off; ty = y + h / 2; textAnchor = horizontalSign > 0 ? "end" : "start"; baseline = "central"; }
    else if (pos === "insideTop") { tx = x + w / 2; ty = y + verticalSign * off; baseline = verticalSign > 0 ? "hanging" : "auto"; }
    else if (pos === "insideBottom") { tx = x + w / 2; ty = y + h - verticalSign * off; baseline = verticalSign > 0 ? "auto" : "hanging"; }
    else if (pos === "center") { tx = x + w / 2; ty = y + h / 2; baseline = "central"; }
    else if (w === 0 && h === 0 && anchor !== "middle") textAnchor = anchor;
    const rx = textAnchor === "middle" ? tx - approxW / 2
      : textAnchor === "end" ? tx - approxW : tx;
    const ry = baseline === "central" ? ty - approxH / 2 : baseline === "hanging" ? ty - padY : ty - approxH + padY;
    const showBg = dl.bgOpacity > 0 || dl.borderWidth > 0;
    return (
      <g>
        {showBg && (
          <rect x={rx} y={ry} width={approxW} height={approxH} rx={2}
            fill={dl.bgColor} fillOpacity={dl.bgOpacity}
            stroke={dl.borderColor} strokeWidth={dl.borderWidth} />
        )}
        <text x={tx} y={ty}
          fontSize={fs} fill={color}
          textAnchor={textAnchor}
          dominantBaseline={baseline}
          fontWeight={dl.bold ? 700 : 400}
          fontStyle={dl.italic ? "italic" : "normal"}>{text}</text>
      </g>
    );
  };
}

// Map our generic dataLabels.position â†’ recharts position per chart family
type Family = "line" | "area" | "bar-vertical" | "bar-horizontal" | "pie" | "scatter";
function mapPos(family: Family, p: string): string {
  if (family === "line" || family === "scatter") {
    switch (p) {
      case "below": return "bottom";
      case "left": return "left";
      case "right": return "right";
      case "above":
      default: return "top";
    }
  }
  if (family === "area") {
    return p === "below" ? "bottom" : p === "left" ? "left" : p === "right" ? "right" : "top";
  }
  if (family === "bar-vertical") {
    switch (p) {
      case "inside-end": return "insideTop";
      case "inside-base": return "insideBottom";
      case "center": return "center";
      case "below": return "bottom";
      case "above":
      default: return "top";
    }
  }
  if (family === "bar-horizontal") {
    switch (p) {
      case "inside-end": return "insideRight";
      case "inside-base": return "insideLeft";
      case "center": return "center";
      case "left": return "left";
      case "right":
      default: return "right";
    }
  }
  if (family === "pie") {
    if (p === "inside") return "inside";
    return "outside";
  }
  return "top";
}

// -- main ------------------------------------------------------------------
export const ChartCanvas = React.memo(function ChartCanvas({ block }: { block: ChartBlock }) {
  const style = useMemo(() => ensureChartStyle(block.style), [block.style]);
  const effectiveMeasure = safeMeasureForSource(block.measure, block.dataSource)
    ?? fallbackMeasureForSource(block.dataSource);
  const safeMeasureLine = safeMeasureForSource(style.measureLine, block.dataSource);
  const safeMeasureX = safeMeasureForSource(style.measureX, block.dataSource);
  const safeMeasureY = safeMeasureForSource(style.measureY, block.dataSource);
  const safeTooltipMeasure = safeMeasureForSource(block.fieldWells?.tooltipMeasure ?? undefined, block.dataSource);
  const measureFmt = inferFormat(effectiveMeasure);

  const pricing = usePricing((s) => s.rows);
  const budget = useBudget((s) => s.rows);
  const forecast = useForecast((s) => s.rows);
  const rolling = useRolling((s) => s.rows);
  const rawDsRows = useMemo(() => {
    if (block.dataSource === "budget") return budgetRowsAsPricingFiltered(budget, "budget");
    if (block.dataSource === "budget_real") return budgetRowsAsPricingFiltered(budget, "real");
    if (block.dataSource === "forecast") return forecastRowsAsPricingLatest(forecast);
    if (block.dataSource === "rolling") return rollingRowsAsPricing(rolling);
    return pricing;
  }, [block.dataSource, pricing, budget, forecast, rolling]);
  const xDim = block.fieldWells?.xDim ?? null;
  // C1 â€” colorDim overrides breakdown as series-key generator
  const seriesDim = block.fieldWells?.colorDim ?? block.breakdown;

  // ---- Cross-filter (Part B.6) ----
  const cf = useSlideFilters();
  const participates = block.participatesInCrossFilter !== false;
  const emits = block.emitsCrossFilter !== false;
  // Block's own emitted filter (drives dimming, not row filtering on self)
  const ownFilter = useMemo(
    () => cf.filters.find((f) => f.sourceBlockId === block.id) ?? null,
    [cf.filters, block.id],
  );
  // Incoming filters from other blocks; matched by dim against this block's xDim/colorDim/breakdown.
  const myDims = useMemo(() => {
    const set = new Set<string>();
    if (xDim) set.add(xDim);
    if (block.fieldWells?.colorDim) set.add(block.fieldWells.colorDim);
    if (block.breakdown) set.add(block.breakdown);
    return set;
  }, [xDim, block.fieldWells?.colorDim, block.breakdown]);
  const incoming = useMemo(() => {
    if (!participates) return [];
    return cf.filters.filter(
      (f) => f.sourceBlockId !== block.id && (myDims.has(f.dimension) || f.dimension === "period")
    );
  }, [cf.filters, participates, block.id, myDims]);
  // Apply incoming filters to dsRows
  const dsRows = useMemo(() => {
    if (incoming.length === 0) return rawDsRows;
    return rawDsRows.filter((r) => {
      for (const f of incoming) {
        if (f.dimension === "period") {
          const row = r as PeriodLikeRow;
          const lbl = monthLabel(row.mes ?? 0, row.ano ?? 0);
          if (!f.values.includes(lbl) && !f.values.includes(String(row.periodo))) return false;
        } else {
          const v = resolveFieldValue(r as unknown as Record<string, unknown>, f.dimension);
          if (!f.values.includes(v)) return false;
        }
      }
      return true;
    });
  }, [rawDsRows, incoming]);
  const rowsForDataSource = useMemo(() => {
    const sourceRows = (dataSource: ChartBlock["dataSource"]) => {
      if (dataSource === "budget") return budgetRowsAsPricingFiltered(budget, "budget");
      if (dataSource === "budget_real") return budgetRowsAsPricingFiltered(budget, "real");
      if (dataSource === "forecast") return forecastRowsAsPricingLatest(forecast);
      if (dataSource === "rolling") return rollingRowsAsPricing(rolling);
      return pricing;
    };
    const applyIncoming = (base: PricingRow[]) => {
      if (incoming.length === 0) return base;
      return base.filter((r) => {
        for (const f of incoming) {
          if (f.dimension === "period") {
            const row = r as PeriodLikeRow;
            const lbl = monthLabel(row.mes ?? 0, row.ano ?? 0);
            if (!f.values.includes(lbl) && !f.values.includes(String(row.periodo))) return false;
          } else {
            const v = resolveFieldValue(r as unknown as Record<string, unknown>, f.dimension);
            if (!f.values.includes(v)) return false;
          }
        }
        return true;
      });
    };
    return (dataSource: ChartBlock["dataSource"]) => applyIncoming(sourceRows(dataSource));
  }, [pricing, budget, forecast, rolling, incoming]);

  // Determine the dimension this block emits
  const emitDim: string = (xDim && xDim !== "period" ? xDim
    : block.breakdown ?? "period");
  // Legend-click filter dimension (series dimension, not axis)
  const legendDim: string | null = block.fieldWells?.colorDim ?? block.breakdown ?? null;

  // Core emit â€” takes an explicit dimension so callers can disambiguate
  // between the X-axis click (period on a temporal line chart) and the
  // legend/series click (colorDim/breakdown).
  const handleEmitOn = (dimension: string, rawValue: unknown, opts?: { shift?: boolean }) => {
    if (!emits) return;
    const v = String(rawValue ?? "");
    if (!v) return;
    const filter = { sourceBlockId: block.id, dimension, values: [v] };
    if (opts?.shift) cf.toggleFilter(filter);
    else {
      if (ownFilter && ownFilter.dimension === dimension
          && ownFilter.values.length === 1 && ownFilter.values[0] === v) {
        cf.clearFilter(block.id);
      } else {
        cf.setFilter(filter);
      }
    }
  };

  // Click handler â€” emits/toggles a filter on this block's emit dimension
  const handleEmit = (rawValue: unknown, opts?: { shift?: boolean }) => {
    handleEmitOn(emitDim, rawValue, opts);
  };

  // Legend click â€” emits filter on the series dimension (not the X-axis dim)
  const handleLegendEmit = (value: string, shift: boolean) => {
    if (!legendDim) return;
    handleEmitOn(legendDim, value, { shift });
  };

  // Helper for Recharts top-level onClick (point/bar payload).
  // When the chart has an X-axis dimension (e.g. "period" on a temporal
  // line chart) we emit on that dim so the click semantics match what the
  // user actually clicked, even when the chart is broken down by another
  // dimension (colorDim/breakdown).
  const chartOnClick = (e: ChartClickState, nativeEvent?: ChartMouseEvent) => {
    e?.nativeEvent?.stopPropagation?.();
    e?.stopPropagation?.();
    nativeEvent?.stopPropagation?.();
    if (!emits) return;
    const label = e?.activeLabel ?? e?.activePayload?.[0]?.payload?.__period
      ?? e?.activePayload?.[0]?.payload?.name;
    if (label == null) return;
    const dim = xDim ?? emitDim;
    // Recharts passes (state, event) â€” shiftKey lives on the native event.
    // Fall back to e.shiftKey for callers (Pie/Scatter) that pass a synthetic event directly.
    const shift = !!(nativeEvent?.shiftKey ?? e?.shiftKey);
    handleEmitOn(dim, label, { shift });
  };

  // Active period values from any source (own or incoming) â€” used by the
  // line/area branch to render vertical highlight bands.
  const activePeriods = useMemo(() => {
    const s = new Set<string>();
    for (const f of cf.filters) {
      if (f.dimension === "period" || f.dimension === "periodo") {
        f.values.forEach((v) => s.add(v));
      }
    }
    return s;
  }, [cf.filters]);
  // Active values on this chart's legend/series dimension (own or incoming).
  const activeLegendValues = useMemo(() => {
    if (!legendDim) return new Set<string>();
    const s = new Set<string>();
    for (const f of cf.filters) {
      if (f.dimension === legendDim) f.values.forEach((v) => s.add(v));
    }
    return s;
  }, [cf.filters, legendDim]);
  const hasPeriodFilter = activePeriods.size > 0;
  const hasLegendFilter = activeLegendValues.size > 0;

  // (Cross-filter highlighted segments are now drawn by <SegmentOverlay>
  // via Recharts <Customized>, no ref/state plumbing needed.)


  // Should a value be dimmed (own filter active and value not selected)?
  const isDimmed = (value: string) => {
    if (!ownFilter) return false;
    if (ownFilter.dimension !== emitDim) return false;
    return !ownFilter.values.includes(value);
  };
  // Active own-emitted filter on the row-level dim (used for per-Cell dimming on bars/columns/hbars)
  const ownFilterOnRowDim = !!ownFilter && ownFilter.dimension === emitDim;
  const cellFillOpacity = (rowName: string) =>
    ownFilterOnRowDim && !ownFilter!.values.includes(rowName) ? 0.4 : 1;
  // Series-level dim for line/area (by series.name = colorDim/breakdown value)
  const seriesDim_ = block.fieldWells?.colorDim ?? block.breakdown ?? null;
  const seriesDimmed = (seriesName: string) => {
    if (!ownFilter) return false;
    // Only dim series when filter dimension targets the series dimension
    if (!seriesDim_) return false;
    if (ownFilter.dimension !== seriesDim_) return false;
    return !ownFilter.values.includes(seriesName);
  };

  const manualComboRaw = useMemo(() => {
    if (block.chartType !== "combo" || !block.comboSeries?.length) return null;
    const defs = block.comboSeries
      .map((s) => {
        const measure = safeMeasureForSource(s.measure, s.dataSource);
        return measure ? { ...s, measure } : null;
      })
      .filter((s): s is NonNullable<typeof s> => !!s);
    if (!defs.length) return null;

    const periodInfo = new Map<string, { label: string; mes: number; ano: number }>();
    const valuesBySeries = new Map<string, Map<string, number>>();

    for (const def of defs) {
      const computed = computeChartSeries(
        rowsForDataSource(def.dataSource),
        block.filters,
        def.measure,
        null,
        xDim,
      );
      const key = def.name?.trim() || `${dataSourceLabel(def.dataSource)} - ${KPI_MEASURES_LABEL[def.measure] ?? def.measure}`;
      const valueMap = new Map<string, number>();
      computed.periodos.forEach((p, i) => {
        const [mesRaw, anoRaw] = p.key.split(".");
        const mes = Number(mesRaw) || i + 1;
        const ano = Number(anoRaw) || 0;
        periodInfo.set(p.key, { label: p.label, mes, ano });
        valueMap.set(p.key, computed.series.reduce((sum, ser) => sum + (ser.values[i] ?? 0), 0));
      });
      valuesBySeries.set(key, valueMap);
    }

    const periodos = Array.from(periodInfo.entries())
      .sort((a, b) => a[1].ano - b[1].ano || a[1].mes - b[1].mes)
      .map(([key, info]) => ({ key, label: info.label }));
    const series = Array.from(valuesBySeries.entries()).map(([name, map]) => ({
      name,
      values: periodos.map((p) => map.get(p.key) ?? 0),
    }));
    return { periodos, series };
  }, [block.chartType, block.comboSeries, block.filters, rowsForDataSource, xDim]);

  const raw = useMemo(
    () => manualComboRaw ?? computeChartSeries(dsRows, block.filters, effectiveMeasure, seriesDim, xDim),
    [manualComboRaw, dsRows, block.filters, effectiveMeasure, seriesDim, xDim],
  );
  const data = useMemo(() => {
    const seriesSum = (ser: (typeof raw.series)[number]) =>
      ser.values.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
    const ranked = [...raw.series].sort((a, z) =>
      Math.abs(seriesSum(z)) - Math.abs(seriesSum(a))
    );
    const fit = resolveChartFit(block, ranked.length);
    const visible = ranked.slice(0, fit.shown);
    const hidden = ranked.slice(fit.shown);
    if (block.showOthers && hidden.length > 0) {
      visible.push({
        name: `Outros (${hidden.length})`,
        values: raw.periodos.map((_, i) =>
          hidden.reduce((s, ser) => s + (ser.values[i] || 0), 0)),
      });
    }
    // B.5 â€” apply user-defined sort
    return applySort(raw.periodos, visible, block.sortConfig);
  }, [raw, block.h, block.w, block.autoFit, block.maxSeries, block.showOthers, block.sortConfig]);

  // Tooltip lookup tables â€” previous period delta + YoY (best-effort heuristic on label match)
  const tooltipMaps = useMemo(() => {
    const prev = new Map<string, Map<string, number>>();
    const yoy = new Map<string, Map<string, number>>();
    data.series.forEach((s) => {
      const pmap = new Map<string, number>(); const ymap = new Map<string, number>();
      data.periodos.forEach((p, i) => {
        if (i > 0) pmap.set(p.label, s.values[i - 1] ?? 0);
        if (i >= 12) ymap.set(p.label, s.values[i - 12] ?? 0);
      });
      prev.set(s.name, pmap); yoy.set(s.name, ymap);
    });
    return { prev, yoy };
  }, [data]);

  // C2 â€” tooltipMeasure: extra measure value per X label
  const tooltipExtra = useMemo(() => {
    const tm = safeTooltipMeasure;
    if (!tm) return null;
    try {
      const r = computeChartSeries(dsRows, block.filters, tm, null, xDim);
      const map = new Map<string, number>();
      r.periodos.forEach((p, i) => {
        const total = r.series.reduce((s, ser) => s + (ser.values[i] ?? 0), 0);
        map.set(p.label, total);
      });
      const label = KPI_MEASURES_LABEL[tm] ?? tm;
      const fmt = inferFormat(tm);
      return { map, label, fmt, measure: tm };
    } catch { return null; }
  }, [safeTooltipMeasure, dsRows, block.filters, xDim]);

  // Combo: optional second measure for line series
  const lineSeriesData = useMemo(() => {
    if (manualComboRaw || block.chartType !== "combo" || !safeMeasureLine) return null;
    try {
      return computeChartSeries(dsRows, block.filters, safeMeasureLine, seriesDim);
    } catch {
      return null;
    }
  }, [manualComboRaw, block.chartType, safeMeasureLine, dsRows, block.filters, seriesDim]);

  const budgetGap = useMemo(() => {
    if (!block.budgetGap?.enabled || block.dataSource !== "budget_real") return null;
    const measure = safeMeasureForSource(block.budgetGap.measure ?? effectiveMeasure, block.dataSource)
      ?? effectiveMeasure;
    const realRows = applyFilters(budgetRowsAsPricingFiltered(budget, "real"), block.filters ?? {}, null);
    const realizedPeriods = new Set(realRows
      .filter((r) => Math.abs(pickMeasure(aggregateKpi([r]), measure)) > 0)
      .map((r) => r.periodo));
    if (realizedPeriods.size === 0) return null;
    const budgetRows = applyFilters(budgetRowsAsPricingFiltered(budget, "budget"), block.filters ?? {}, null)
      .filter((r) => realizedPeriods.has(r.periodo));
    const realValue = pickMeasure(aggregateKpi(realRows.filter((r) => realizedPeriods.has(r.periodo))), measure);
    const budgetValue = pickMeasure(aggregateKpi(budgetRows), measure);
    const gap = realValue - budgetValue;
    return {
      value: gap,
      text: block.budgetGap.label ?? compactGapLabel(gap, measure),
    };
  }, [block.budgetGap, block.dataSource, block.filters, effectiveMeasure, budget]);

  // ---- ranking-style data for pie/donut/bubble/scatter/funnel/treemap ----
  const rankingTypes = ["pie", "donut", "bubble", "scatter", "funnel", "treemap"];
  const ranking = useMemo(() => {
    if (!rankingTypes.includes(block.chartType)) return [];
    const base = computeTopRanking(
      dsRows, block.filters,
      seriesDim ?? "marca",
      effectiveMeasure, 50, "all", null,
    );
    // FIX 2 â€” apply sortConfig to ranking (pie/donut/funnel/treemap/bubble/scatter)
    const sc = block.sortConfig;
    if (!sc) return base;
    if (sc.field === "name") {
      return [...base].sort((a, b) => sc.dir === "asc"
        ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));
    }
    if (sc.field === "value") {
      return sc.dir === "asc" ? [...base].reverse() : base;
    }
    return base;
  }, [dsRows, block.filters, seriesDim, effectiveMeasure, block.chartType, block.sortConfig, block.fieldWells?.colorDim]);

  // ---- empty states ----
  const seriesEmpty = data.periodos.length === 0 || data.series.length === 0;
  const rankingEmpty = ranking.length === 0;
  const isRankingChart = rankingTypes.includes(block.chartType);
  // Bridge PVM has its own data path (calcPVM) and own empty state.
  const isPvmBridge = block.chartType === "waterfall"
    && (style.waterfall.mode ?? "pvm") === "pvm";

  if (!isPvmBridge && ((isRankingChart && rankingEmpty) || (!isRankingChart && seriesEmpty))) {
    // Distinguish "no data because of incoming filter" vs "no data at all"
    const filteredOut = incoming.length > 0 && rawDsRows.length > 0 && dsRows.length === 0;
    return (
      <Wrapper style={style} hasIncoming={incoming.length > 0}>
        {filteredOut ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", height: "100%", gap: 6, opacity: 0.45,
            color: SLIDE_HEX.blueDark,
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              <path d="M11 8v3m0 3h.01" strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: 12, fontFamily: "Calibri,sans-serif" }}>
              Sem dados para o filtro ativo
            </span>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Sem dados para os filtros escolhidos
          </div>
        )}
      </Wrapper>
    );
  }

  // ---- pivot to recharts row format ----
  let rows = data.periodos.map((p, i) => {
    const r: Record<string, number | string> = { __period: p.label };
    data.series.forEach((s) => { r[s.name] = s.values[i] ?? 0; });
    if (lineSeriesData) {
      lineSeriesData.series.forEach((s) => { r[`__line_${s.name}`] = s.values[i] ?? 0; });
    }
    return r;
  });

  // 1.4 stacked100 â€” normalize each row to percentage of total
  const ct = block.chartType;
  const isStack100 = (ct === "bar" || ct === "column" || ct === "hbar" || ct === "stackedColumn" || ct === "stackedBar")
    && style.bar.mode === "stacked100";
  if (isStack100) {
    rows = rows.map((r) => {
      const total = data.series.reduce((s, ser) => s + (Number(r[ser.name]) || 0), 0);
      const out: Record<string, number | string> = { __period: r.__period };
      data.series.forEach((ser) => {
        out[ser.name] = total > 0 ? (Number(r[ser.name]) || 0) / total * 100 : 0;
      });
      return out;
    });
  }

  const legendVerticalAlign = style.general.legendPos === "top" ? "top"
    : style.general.legendPos === "bottom" ? "bottom" : "middle";
  const legendAlign = style.general.legendPos === "left" ? "left"
    : style.general.legendPos === "right" ? "right" : "center";
  const legendLayout = (style.general.legendPos === "left" || style.general.legendPos === "right")
    ? "vertical" : "horizontal";

  // Build a nameâ†’color map from the actual series we render so the legend
  // can fall back to a guaranteed-contrast palette color when Recharts'
  // payload reports a missing/transparent/near-white swatch (which can
  // happen when colorDim switches and series defs are partially stale).
  const seriesColorMap = useMemo(() => {
    const m = new Map<string, string>();
    data.series.forEach((s, i) => {
      m.set(s.name, colorForSeries(style, s.name, i));
    });
    return m;
  }, [data.series, style]);

  const renderLegend = style.general.legendShow ? (
    <Legend verticalAlign={legendVerticalAlign} align={legendAlign} layout={legendLayout}
      wrapperStyle={{ fontSize: 11, color: SLIDE_HEX.chart2 }}
      content={legendDim ? (
        <CustomLegend
          ownFilter={ownFilter}
          legendDim={legendDim}
          onLegendClick={handleLegendEmit}
          emits={emits}
          colorMap={seriesColorMap}
        />
      ) : undefined} />
  ) : null;

  const renderGrid = style.grid.show && !["pie", "donut", "radar"].includes(ct) ? (
    <CartesianGrid stroke={style.grid.color}
      strokeDasharray={style.grid.style === "dashed" ? "3 3" : "0"} />
  ) : null;

  const xAx = style.xAxis;
  const yAx = style.yAxis;
  const yAx2 = style.yAxis2 ?? yAx;

  // 1.2 X axis min/max â€” apply when numeric (scatter/bubble/hbar)
  const xDomain: [number | string, number | string] = [
    xAx.min ?? "auto", xAx.max ?? "auto",
  ];

  const xAxis = xAx.show ? (
    <XAxis
      dataKey="__period"
      interval={0}
      height={Math.max(30, (xAx.labelSize ?? 11) + 22)}
      tick={
        <ActivePeriodTick
          activePeriods={activePeriods}
          labelColor={xAx.labelColor}
          labelSize={xAx.labelSize}
        />
      }
      stroke={xAx.lineColor} tickLine={xAx.ticks}
      strokeWidth={xAx.lineWidth}
      label={xAx.titleText ? { value: xAx.titleText, position: "insideBottom",
        offset: -2, style: { fontSize: xAx.titleSize, fill: xAx.titleColor } } : undefined}
    />
  ) : <XAxis hide />;
  const yAxis = yAx.show ? (
    <YAxis
      yAxisId="left"
      tick={{ fontSize: yAx.labelSize, fill: yAx.labelColor }}
      stroke={yAx.lineColor} tickLine={yAx.ticks}
      strokeWidth={yAx.lineWidth}
      domain={[yAx.min ?? "auto", yAx.max ?? "auto"]}
      tickFormatter={isStack100 ? (v: number) => `${v.toFixed(0)}%` : axisFmt(yAx, measureFmt)}
      label={yAx.titleText ? { value: yAx.titleText, angle: -90, position: "insideLeft",
        style: { fontSize: yAx.titleSize, fill: yAx.titleColor } } : undefined}
    />
  ) : <YAxis yAxisId="left" hide />;

  // 1.3 Secondary Y axis for combo
  const hasSecondary = ct === "combo"
    && (style.series.some((s) => s.secondaryAxis)
      || block.comboSeries?.some((s) => s.secondaryAxis)
      || !!safeMeasureLine);
  const yAxisRight = hasSecondary ? (
    <YAxis
      yAxisId="right" orientation="right"
      tick={{ fontSize: yAx2.labelSize, fill: yAx2.labelColor }}
      stroke={yAx2.lineColor} tickLine={yAx2.ticks}
      strokeWidth={yAx2.lineWidth}
      domain={[yAx2.min ?? "auto", yAx2.max ?? "auto"]}
      tickFormatter={axisFmt(yAx2, measureFmt)}
      label={yAx2.titleText ? { value: yAx2.titleText, angle: 90, position: "insideRight",
        style: { fontSize: yAx2.titleSize, fill: yAx2.titleColor } } : undefined}
    />
  ) : null;

  const labelStyle = { fontSize: style.dataLabels.size, fill: style.dataLabels.color,
    fontWeight: style.dataLabels.bold ? 700 : 400,
    fontStyle: style.dataLabels.italic ? "italic" : "normal" };
  const dlPos = style.dataLabels.position;

  // Reserve extra padding around the plot area so the first/last data labels
  // (and rotated axis ticks) never get clipped at the chart edges. Scales
  // gently with the data-label font size when labels are visible.
  const dlOn = !!style.dataLabels.show;
  const dlSize = Math.max(10, style.dataLabels.size || 12);
  const sideRoom = dlOn ? Math.round(dlSize * 2.4) : 12;
  const topRoom = dlOn ? Math.round(dlSize * 1.6) : 12;
  const chartMargin = { top: topRoom + (budgetGap ? 18 : 0), right: sideRoom, left: sideRoom, bottom: 8 };
  const hbarMargin = { top: 12, right: dlOn ? Math.round(dlSize * 3) : 24, left: 8, bottom: 8 };

  // ---- renderers per chart type ----
  let chart: React.ReactNode = null;
  const forceStack = ct === "stackedColumn" || ct === "stackedBar" || ct === "stackedArea";
  const cats = data.periodos.map((p) => p.label);
  const stack100Fmt = (v: number) => `${(v as number).toFixed(0)}%`;

  if (ct === "line" || ct === "area" || ct === "stackedArea" || ct === "combo") {
    // C2 â€” trendline + forecast overlay
    const trendCfg = style.analytics?.trendline;
    const fcCfg = style.analytics?.forecast;
    const trendOn = !!trendCfg?.enabled;
    const bandOn = trendOn && !!fcCfg?.enabled && !!fcCfg?.band;
    // FIX 3 â€” band needs Area children; switch lineâ†’ComposedChart when band on
    const Comp = (ct === "area" || ct === "stackedArea") ? AreaChart
      : ct === "combo" ? ComposedChart
      : (bandOn ? ComposedChart : LineChart);

    const trendOut = trendOn ? computeTrendlineSeries(
      data.series, cats,
      { enabled: true, type: trendCfg!.type, maWindow: trendCfg!.maWindow },
      { enabled: !!fcCfg?.enabled, periods: fcCfg?.periods ?? 0 },
    ) : null;
    let chartRows = rows as Record<string, number | string | null | [number, number]>[];
    if (trendOut && trendOut.rows.length > 0) {
      const merged: Record<string, number | string | null | [number, number]>[] = rows.map((r) => ({ ...r }));
      const fwd = (fcCfg?.enabled ? Math.max(0, Math.min(6, fcCfg.periods ?? 0)) : 0);
      for (let i = 0; i < fwd; i++) merged.push({ __period: `+${i + 1}` });
      trendOut.rows.forEach((tr, i) => {
        Object.keys(tr).forEach((k) => {
          if (k === "__period") return;
          if (merged[i]) merged[i][k] = tr[k] as never;
        });
      });
      // FIX 3 â€” confidence band: per-series [lo, up] for each forecast index
      if (bandOn) {
        const startIdx = trendOut.forecastStartIdx;
        data.series.forEach((s) => {
          const tk = trendOut.trendKey(s.name);
          merged.forEach((r, i) => {
            if (i >= startIdx) {
              const tv = Number(r[tk]) || 0;
              const dist = i - startIdx + 1;
              const u = 0.03 * dist;
              r[`__band_${s.name}`] = [tv * (1 - u), tv * (1 + u)];
            } else {
              r[`__band_${s.name}`] = null;
            }
          });
        });
      }
      chartRows = merged;
    }
    const trendDash = (s?: "solid" | "dashed" | "dotted") => dashArr(s);

    chart = (
      <Comp data={chartRows} onClick={chartOnClick} margin={chartMargin}>
        {renderGrid}{xAxis}{yAxis}{yAxisRight}
        <Tooltip content={(p: RechartsTooltipProps) => <ChartTooltip {...p} style={style} measureFmt={measureFmt} prevPeriodMap={tooltipMaps.prev} yoyMap={tooltipMaps.yoy} additionalRow={tooltipExtra ?? undefined} />} />
        {renderRefLines(style)}
        {/* Cross-filter: vertical highlight bands for active period selections */}
        {hasPeriodFilter && Array.from(activePeriods)
          .filter((p) => chartRows.some((r) => String(r.__period) === p))
          .map((p) => (
            <ReferenceArea key={`__pf_${p}`} x1={p} x2={p} yAxisId="left"
              fill={SLIDE_HEX.blue} fillOpacity={0.10}
              stroke={SLIDE_HEX.blue} strokeOpacity={0.35} strokeDasharray="3 3"
              ifOverflow="extendDomain" />
          ))}
        {renderLegend}
        {data.series.map((s, i) => {
          const comboCfg = block.comboSeries?.find((item) => item.name === s.name);
          const cfg = style.series.find((x) => x.key === s.name);
          const color = cfg?.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length];
          const dash = dashArr(cfg?.lineStyle);
          const asLine = comboCfg?.asLine ?? cfg?.asLine ?? true;
          const secondaryAxis = comboCfg?.secondaryAxis ?? cfg?.secondaryAxis ?? false;
          const renderAsBar = ct === "combo" && !asLine;
          const yAxisId = ct === "combo" && secondaryAxis ? "right" : "left";
          // Series-level dim: own-emitted legend filter OR cross-block legend filter.
          const seriesNotMatched = hasLegendFilter && !activeLegendValues.has(s.name);
          const sDim = seriesDimmed(s.name) || seriesNotMatched;
          const sStrokeOp = sDim ? (hasLegendFilter && hasPeriodFilter ? 0.1 : 0.2) : 1;
          const sFillOp = sDim ? 0.1 : undefined;
          // Crossing-dot highlight: enlarge/colorize dots that fall on
          // active period filters. When a legend filter is also active, only
          // the matched series receives the highlight; other series remain dim.
          const showCrossing = hasPeriodFilter && !seriesNotMatched;
          const markerOn = cfg?.marker?.show !== false;
          const baseR = cfg?.marker?.size ?? 3;
          const dotFill = cfg?.marker?.fill ?? color;
          const dotStroke = cfg?.marker?.border ?? color;
          const dotProp: boolean | ((dp: RechartsDotProps) => JSX.Element) = markerOn
            ? (showCrossing
              ? (dp: RechartsDotProps) => (
                  <CrossingDot
                    key={dp.key}
                    {...dp}
                    activePeriods={activePeriods}
                    baseR={baseR}
                    dotFill={dotFill}
                    dotStroke={dotStroke}
                    strokeOpacity={sStrokeOp}
                  />
                )
              : { r: baseR, fill: dotFill, stroke: dotStroke, fillOpacity: sStrokeOp })
            : false;
          if (renderAsBar) {
            return (
              <Bar key={s.name} isAnimationActive={false} dataKey={s.name}
                fill={color} yAxisId={yAxisId}
                radius={style.bar.cornerRadius}
                fillOpacity={sFillOp}
                stroke={style.bar.borderColor} strokeWidth={style.bar.borderWidth}>
                {style.dataLabels.show && (
                  <LabelList dataKey={s.name} position={mapPos("bar-vertical", dlPos) as never}
                    content={makeLabelContent({ style, measureFmt, seriesName: s.name, categories: cats, seriesColor: color }) as never} />
                )}
              </Bar>
            );
          }
          return (
            <Line key={s.name} isAnimationActive={false} dataKey={s.name}
              type={cfg?.smooth ? "monotone" : "linear"}
              stroke={color} strokeWidth={cfg?.thickness ?? 2.5}
              strokeOpacity={sStrokeOp}
              strokeDasharray={dash}
              yAxisId={yAxisId}
              dot={dotProp}
              connectNulls>
              {style.dataLabels.show && (
                <LabelList dataKey={s.name} position={mapPos("line", dlPos) as never}
                  content={makeLabelContent({ style, measureFmt, seriesName: s.name, categories: cats, seriesColor: color }) as never} />
              )}
            </Line>
          );
        })}
        {/* C2 â€” trendline overlay (one Line per series) */}
        {trendOut && data.series.map((s) => {
          const tk = trendOut.trendKey(s.name);
          const tcolor = trendCfg!.color;
          const r2 = trendOut.r2ByName[s.name];
          const showR2 = trendCfg!.showR2 && isFinite(r2);
          return (
            <Line key={tk} isAnimationActive={false} dataKey={tk}
              name={showR2 ? `${s.name} (tend. RÂ²=${r2.toFixed(2)})` : `${s.name} (tendÃªncia)`}
              type="monotone" stroke={tcolor}
              strokeWidth={trendCfg!.thickness}
              strokeDasharray={trendDash(trendCfg!.style)}
              dot={false} connectNulls
              yAxisId="left" />
          );
        })}
        {/* FIX 3 â€” forecast confidence band (Area between [lo, up]) */}
        {bandOn && trendOut && data.series.map((s) => (
          <Area key={`band_${s.name}`} isAnimationActive={false}
            dataKey={`__band_${s.name}`}
            stroke="none" fill={trendCfg!.color} fillOpacity={0.2}
            connectNulls yAxisId="left"
            legendType="none" />
        ))}
        {/* Combo: line series from second measure */}
        {ct === "combo" && lineSeriesData && lineSeriesData.series.map((s, i) => {
          const color = DEFAULT_PALETTE[(data.series.length + i) % DEFAULT_PALETTE.length];
          return (
            <Line key={`__line_${s.name}`} isAnimationActive={false}
              dataKey={`__line_${s.name}`} name={`${s.name} (linha)`}
              type="monotone" stroke={color} strokeWidth={2.5}
              yAxisId="right" dot={{ r: 3, fill: color }}>
              {style.dataLabels.show && (
                <LabelList dataKey={`__line_${s.name}`} position={mapPos("line", dlPos) as never}
                  content={makeLabelContent({ style, measureFmt, seriesName: s.name, categories: cats, seriesColor: color }) as never} />
              )}
            </Line>
          );
        })}
        {hasPeriodFilter && (
          <Customized component={SegmentOverlay as unknown as React.ComponentType<SegmentOverlayProps>} activePeriods={activePeriods} />
        )}
      </Comp>
    );
  } else if (ct === "bar" || ct === "column" || ct === "stackedColumn") {
    const stacked = forceStack || style.bar.mode === "stacked" || style.bar.mode === "stacked100";
    const estBarWidthPx = rows.length > 0
      ? (block.w * 0.70) / (rows.length * (stacked ? 1 : Math.max(1, data.series.length))) : 999;
    const showDlBar = dlOn && estBarWidthPx >= dlSize + 4;
    const minSlicePxBar = stacked ? dlSize * 2.5 : undefined;
    chart = (
      <BarChart data={rows} layout="horizontal" onClick={chartOnClick} margin={chartMargin}
        barCategoryGap={`${style.bar.gapPct}%`}>
        {renderGrid}{xAxis}{yAxis}
        <Tooltip content={(p: RechartsTooltipProps) => <ChartTooltip {...p} style={style} measureFmt={measureFmt} prevPeriodMap={tooltipMaps.prev} yoyMap={tooltipMaps.yoy} additionalRow={tooltipExtra ?? undefined} />} />
        {renderRefLines(style)}
        {renderLegend}
        {data.series.map((s, i) => {
          const color = colorForSeries(style, s.name, i);
          return (
            <Bar key={s.name} isAnimationActive={false} dataKey={s.name} fill={color}
              stackId={stacked ? "stack" : undefined}
              yAxisId="left"
              radius={style.bar.cornerRadius}
              stroke={style.bar.borderColor} strokeWidth={style.bar.borderWidth}>
              {/* C1 â€” conditional formatting + per-row dim cells */}
              {((style.conditionalRules?.length ?? 0) > 0 || ownFilterOnRowDim) && rows.map((r, ri) => {
                const baseFill = (style.conditionalRules?.length ?? 0) > 0
                  ? evalCondColor(Number(r[s.name]) || 0, style.conditionalRules, style.conditionalDefault || color)
                  : color;
                return <Cell key={`${s.name}-${ri}`} fill={baseFill} fillOpacity={cellFillOpacity(String(r.__period ?? ""))} />;
              })}
              {showDlBar && (
                <LabelList dataKey={s.name} position={mapPos("bar-vertical", dlPos) as never}
                  content={makeLabelContent({
                    style, measureFmt, seriesName: s.name, categories: cats,
                    customFmt: isStack100 ? stack100Fmt : undefined, seriesColor: color,
                    minSlicePx: minSlicePxBar,
                  }) as never} />
              )}
            </Bar>
          );
        })}
      </BarChart>
    );
  } else if (ct === "hbar" || ct === "stackedBar") {
    const stacked = forceStack || style.bar.mode === "stacked" || style.bar.mode === "stacked100";
    const estBarHeightPx = rows.length > 0 ? (block.h * 0.72) / rows.length : 999;
    const showDlHBar = dlOn && estBarHeightPx >= dlSize + 4;
    const minSlicePxHBar = stacked ? dlSize * 2.5 : undefined;
    chart = (
      <BarChart data={rows} layout="vertical" onClick={chartOnClick} margin={hbarMargin}
        barCategoryGap={`${style.bar.gapPct}%`}>
        {renderGrid}
        <XAxis type="number" tick={{ fontSize: xAx.labelSize, fill: xAx.labelColor }}
          stroke={xAx.lineColor} strokeWidth={xAx.lineWidth}
          domain={xDomain}
          tickFormatter={isStack100 ? stack100Fmt : axisFmt(xAx, measureFmt)}
          label={xAx.titleText ? { value: xAx.titleText, position: "insideBottom", offset: -5,
            style: { fontSize: xAx.titleSize, fill: xAx.titleColor } } : undefined} />
        <YAxis type="category" dataKey="__period"
          tick={{ fontSize: yAx.labelSize, fill: yAx.labelColor }}
          stroke={yAx.lineColor} strokeWidth={yAx.lineWidth}
          label={yAx.titleText ? { value: yAx.titleText, angle: -90, position: "insideLeft",
            style: { fontSize: yAx.titleSize, fill: yAx.titleColor } } : undefined} />
        <Tooltip content={(p: RechartsTooltipProps) => <ChartTooltip {...p} style={style} measureFmt={measureFmt} prevPeriodMap={tooltipMaps.prev} yoyMap={tooltipMaps.yoy} additionalRow={tooltipExtra ?? undefined} />} />
        {renderRefLines(style)}
        {renderLegend}
        {data.series.map((s, i) => {
          const color = colorForSeries(style, s.name, i);
          return (
            <Bar key={s.name} isAnimationActive={false} dataKey={s.name} fill={color}
              stackId={stacked ? "stack" : undefined}
              radius={style.bar.cornerRadius}
              stroke={style.bar.borderColor} strokeWidth={style.bar.borderWidth}>
              {((style.conditionalRules?.length ?? 0) > 0 || ownFilterOnRowDim) && rows.map((r, ri) => {
                const baseFill = (style.conditionalRules?.length ?? 0) > 0
                  ? evalCondColor(Number(r[s.name]) || 0, style.conditionalRules, style.conditionalDefault || color)
                  : color;
                return <Cell key={`${s.name}-${ri}`} fill={baseFill} fillOpacity={cellFillOpacity(String(r.__period ?? ""))} />;
              })}
              {showDlHBar && (
                <LabelList dataKey={s.name} position={mapPos("bar-horizontal", dlPos) as never}
                  content={makeLabelContent({
                    style, measureFmt, seriesName: s.name, categories: cats,
                    customFmt: isStack100 ? stack100Fmt : undefined, anchor: "start", seriesColor: color,
                    minSlicePx: minSlicePxHBar,
                  }) as never} />
              )}
            </Bar>
          );
        })}
      </BarChart>
    );
  } else if (ct === "pie" || ct === "donut") {
    const inner = ct === "donut"
      ? `${Math.max(0, Math.min(80, style.pie.donutHolePct))}%` : 0;
    const labelKey = style.pie.labelMode;
    const labelMode = mapPos("pie", dlPos); // "inside" | "outside"
    const isCallout = dlPos === "callout";
    // A.9 â€” per-slice explosion via custom shape
    const renderPieShape = (props: {
      cx: number; cy: number; midAngle: number;
      innerRadius: number; outerRadius: number;
      startAngle: number; endAngle: number; fill: string;
      payload: { name: string };
    }) => {
      const sliceCfg = style.pie.slices[props.payload.name];
      const explodePct = (sliceCfg?.explode ?? style.pie.explodePct ?? 0) / 100;
      const RAD = Math.PI / 180;
      const off = props.outerRadius * explodePct * 0.4;
      const dx = Math.cos(-props.midAngle * RAD) * off;
      const dy = Math.sin(-props.midAngle * RAD) * off;
      return (
        <Sector cx={props.cx + dx} cy={props.cy + dy}
          innerRadius={props.innerRadius} outerRadius={props.outerRadius}
          startAngle={props.startAngle} endAngle={props.endAngle}
          fill={props.fill} />
      );
    };
    const dl = style.dataLabels;
    const pieTotal = ranking.reduce((s, r) => s + Math.abs(r.value), 0) || 1;
    // FIX 5 â€” fully-styled pie label honoring size/color/bold/italic/format/position/showCategory
    const pieLabel = dl.show ? (props: PieLabelProps) => {
      const { cx, cy, midAngle, outerRadius, innerRadius, percent, value, name } = props;
      const RAD = Math.PI / 180;
      const inside = labelMode === "inside";
      const r = inside
        ? innerRadius + (outerRadius - innerRadius) * 0.55
        : outerRadius + (isCallout ? 24 : 12);
      const x = cx + r * Math.cos(-midAngle * RAD);
      const y = cy + r * Math.sin(-midAngle * RAD);
      const pct = (percent * 100).toFixed(dl.decimals ?? 1) + "%";
      const fmt = dl.format === "auto" ? measureFmt : dl.format;
      const valStr = formatValue(value, fmt, "rol", dl.decimals);
      let body: string;
      switch (labelKey) {
        case "value": body = valStr; break;
        case "percent": body = pct; break;
        case "name": body = name; break;
        case "name-value": body = `${name}: ${valStr}`; break;
        default: body = `${name}: ${pct}`;
      }
      const text = dl.showCategory ? `${name} Â· ${body}` : body;
      const anchor: "start" | "end" | "middle" = inside ? "middle" : (x > cx ? "start" : "end");
      let color = dl.color;
      if (dl.autoContrast) {
        const sb = (style.general?.background && style.general.background !== "transparent") ? style.general.background : SLIDE_HEX.white;
        const ref = dl.bgOpacity > 0 ? dl.bgColor : (inside ? (props.fill ?? SLIDE_HEX.white) : sb);
        color = luminance(ref) > 0.55 ? SLIDE_HEX.black : SLIDE_HEX.white;
      }
      const padX = 3, padY = 2;
      const approxW = text.length * dl.size * 0.55 + padX * 2;
      const approxH = dl.size + padY * 2;
      const rx = anchor === "middle" ? x - approxW / 2 : anchor === "end" ? x - approxW : x;
      const ry = y - approxH / 2;
      const showBg = dl.bgOpacity > 0 || dl.borderWidth > 0;
      return (
        <g>
          {showBg && (
            <rect x={rx} y={ry} width={approxW} height={approxH} rx={2}
              fill={dl.bgColor} fillOpacity={dl.bgOpacity}
              stroke={dl.borderColor} strokeWidth={dl.borderWidth} />
          )}
          <text x={x} y={y} fill={color}
            fontSize={dl.size}
            fontWeight={dl.bold ? 700 : 400}
            fontStyle={dl.italic ? "italic" : "normal"}
            textAnchor={anchor}
            dominantBaseline="central">{text}</text>
        </g>
      );
    } : false;
    chart = (
      <PieChart onClick={chartOnClick}>
        <Tooltip content={(p: RechartsTooltipProps) => (
          <ChartTooltip {...p} style={style} measureFmt={measureFmt} variant="pie" pieTotal={pieTotal} additionalRow={tooltipExtra ?? undefined} />
        )} />
        {renderLegend}
        <Pie data={ranking} isAnimationActive={false} dataKey="value" nameKey="name"
          startAngle={style.pie.startAngle}
          endAngle={style.pie.startAngle + 360}
          innerRadius={inner} outerRadius="80%"
          labelLine={!!pieLabel && (labelMode === "outside" || isCallout)}
          activeIndex={ranking.map((_, i) => i)}
          activeShape={renderPieShape as never}
          label={pieLabel as never}
          onClick={(_d: unknown, idx: number, e: ChartMouseEvent) => {
            e?.stopPropagation?.();
            handleEmit(ranking[idx]?.name, { shift: !!e?.shiftKey });
          }}
        >
          {ranking.map((r, i) => {
            const sl = style.pie.slices[r.name];
            const color = sl?.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length];
            const op = isDimmed(r.name) ? 0.4 : 1;
            return <Cell key={r.name} fill={color} fillOpacity={op} />;
          })}
        </Pie>
      </PieChart>
    );
  } else if (ct === "bubble" || ct === "scatter") {
    // A.4 â€” bubble/scatter use measureX/measureY/measure(size) when set
    const dim = seriesDim ?? "marca";
    const sizeRanking = ranking; // ranks by primary measure (drives size)
    const xRanking = safeMeasureX
      ? computeTopRanking(dsRows, block.filters, dim, safeMeasureX, 50, "all", null)
      : null;
    const yRanking = safeMeasureY
      ? computeTopRanking(dsRows, block.filters, dim, safeMeasureY, 50, "all", null)
      : null;
    const xByName = new Map(xRanking?.map((r) => [r.name, r.value]) ?? []);
    const yByName = new Map(yRanking?.map((r) => [r.name, r.value]) ?? []);
    // C3 â€” labelDim: pick representative dimension value per point
    const labelDim = block.fieldWells?.labelDim ?? null;
    const labelByName = new Map<string, string>();
    if (labelDim) {
      for (const r of dsRows) {
        const k = String((r as unknown as Record<string, unknown>)[dim] ?? "â€”");
        if (labelByName.has(k)) continue;
        const lv = String((r as unknown as Record<string, unknown>)[labelDim] ?? "");
        if (lv) labelByName.set(k, lv);
      }
    }
    const points = sizeRanking.map((r, i) => ({
      x: xRanking ? (xByName.get(r.name) ?? 0) : (i + 1),
      y: yRanking ? (yByName.get(r.name) ?? 0) : r.value,
      z: r.value,
      name: r.name,
      __label: labelDim ? (labelByName.get(r.name) ?? "") : "",
    }));
    const xLabel = style.measureX
      ? KPI_MEASURES_LABEL[style.measureX] : "Ãndice";
    const yLabel = style.measureY
      ? KPI_MEASURES_LABEL[style.measureY] : KPI_MEASURES_LABEL[block.measure];
    const xFmt = style.measureX ? inferFormat(style.measureX) : measureFmt;
    const yFmt = style.measureY ? inferFormat(style.measureY) : measureFmt;
    const xLabelSafe = safeMeasureX ? KPI_MEASURES_LABEL[safeMeasureX] : xLabel;
    const yLabelSafe = safeMeasureY ? KPI_MEASURES_LABEL[safeMeasureY] : KPI_MEASURES_LABEL[effectiveMeasure];
    const xFmtSafe = safeMeasureX ? inferFormat(safeMeasureX) : xFmt;
    const yFmtSafe = safeMeasureY ? inferFormat(safeMeasureY) : yFmt;
    chart = (
      <ScatterChart onClick={chartOnClick} margin={chartMargin}>
        {renderGrid}
        <XAxis type="number" dataKey="x" name={xLabelSafe}
          domain={xDomain}
          tick={{ fontSize: xAx.labelSize, fill: xAx.labelColor }}
          tickFormatter={safeMeasureX ? axisFmt({ ...xAx, format: xAx.format }, xFmtSafe) : undefined}
          label={(xAx.titleText || safeMeasureX) ? {
            value: xAx.titleText || xLabelSafe, position: "insideBottom", offset: -5,
            style: { fontSize: xAx.titleSize, fill: xAx.titleColor },
          } : undefined} />
        <YAxis type="number" dataKey="y" name={yLabelSafe}
          domain={[yAx.min ?? "auto", yAx.max ?? "auto"]}
          tick={{ fontSize: yAx.labelSize, fill: yAx.labelColor }}
          tickFormatter={axisFmt({ ...yAx, format: yAx.format }, yFmtSafe)}
          label={(yAx.titleText || safeMeasureY) ? {
            value: yAx.titleText || yLabelSafe, angle: -90, position: "insideLeft",
            style: { fontSize: yAx.titleSize, fill: yAx.titleColor },
          } : undefined} />
        {ct === "bubble" && (
          <ZAxis type="number" dataKey="z" range={[style.bubble.minSize, style.bubble.maxSize]} />
        )}
        <Tooltip cursor={{ strokeDasharray: "3 3" }}
          content={(p: RechartsTooltipProps) => <ChartTooltip {...p} style={style} measureFmt={measureFmt} variant={ct === "bubble" ? "bubble" : "scatter"} additionalRow={tooltipExtra ?? undefined} />} />
        {renderLegend}
        <Scatter data={points} isAnimationActive={false} fill={DEFAULT_PALETTE[0]}
          fillOpacity={style.bubble.fillOpacity}
          stroke={style.bubble.borderColor} strokeWidth={style.bubble.borderWidth}>
          {points.map((p, i) => (
            <Cell key={p.name} fill={DEFAULT_PALETTE[i % DEFAULT_PALETTE.length]}
              fillOpacity={isDimmed(p.name) ? 0.4 : (style.bubble.fillOpacity ?? 1)} />
          ))}
          {style.dataLabels.show && (
            <LabelList dataKey="z" position={mapPos("scatter", dlPos) as never}
              content={makeLabelContent({ style, measureFmt,
                categories: points.map((p) => p.name) }) as never} />
          )}
          {ct === "bubble" && style.bubble.showSizeLabel && (
            <LabelList dataKey="z" position="top"
              content={makeLabelContent({ style, measureFmt }) as never} />
          )}
          {/* C3 â€” labelDim renders dimension value next to each point */}
          {labelDim && (
            <LabelList dataKey="__label"
              content={(p: LabelPointProps) => {
                if (p.x == null || p.y == null || !p.value) return null;
                return (
                  <text x={p.x + 8} y={p.y - 8}
                    fontSize={style.dataLabels.size}
                    fill={style.dataLabels.color}
                    fontWeight={style.dataLabels.bold ? 700 : 400}
                    fontStyle={style.dataLabels.italic ? "italic" : "normal"}>
                    {String(p.value)}
                  </text>
                );
              }} />
          )}
        </Scatter>
      </ScatterChart>
    );
  } else if (ct === "waterfall") {
    chart = (
      <WaterfallChart
        block={block}
        style={style}
        rows={rows}
        series={data.series}
        dsRows={dsRows}
      />
    );
  } else if (ct === "funnel") {
    // FIX 3 â€” replace recharts Funnel (broken triangles) with custom SVG trapezoids
    const fdata = ranking.map((r, i) => ({
      name: r.name, value: r.value,
      color: style.funnel.slices[r.name]?.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length],
    }));
    chart = (
      <FunnelSVG data={fdata} style={style} measureFmt={measureFmt}
        onSliceClick={(name, e) => { e?.stopPropagation?.(); handleEmit(name, { shift: !!e.shiftKey }); }}
        dimmedNames={ownFilter && ownFilter.dimension === emitDim
          ? new Set(fdata.map(d => d.name).filter(n => !ownFilter.values.includes(n))) : null} />
    ) as React.ReactElement;
  } else if (ct === "treemap") {
    const total = ranking.reduce((s, r) => s + Math.abs(r.value), 0) || 1;
    const tdata = ranking.map((r, i) => {
      let fill: string;
      if (style.treemap.colorScheme === "gradient") {
        const t = ranking.length > 1 ? i / (ranking.length - 1) : 0;
        fill = mixHex(style.treemap.gradientFrom, style.treemap.gradientTo, t);
      } else {
        fill = DEFAULT_PALETTE[i % DEFAULT_PALETTE.length];
      }
      // C1 â€” conditional formatting overrides palette/gradient
      if ((style.conditionalRules?.length ?? 0) > 0) {
        fill = evalCondColor(r.value, style.conditionalRules, style.conditionalDefault || fill);
      }
      return { name: r.name, size: Math.abs(r.value), value: r.value, pct: (Math.abs(r.value) / total) * 100, fill };
    });
    chart = (
      <Treemap data={tdata} isAnimationActive={false} dataKey="size" nameKey="name"
        stroke={style.treemap.borderColor}
        aspectRatio={4 / 3}
        onClick={((node: TreemapNode, _idx?: number, e?: TreemapEvent) => { e?.stopPropagation?.(); handleEmit(node?.name); }) as never}
        content={<TreemapTile cfg={style.treemap} dl={style.dataLabels} fmt={measureFmt} dimmedNames={ownFilter && ownFilter.dimension === emitDim ? new Set(ranking.map(r => r.name).filter(n => !ownFilter.values.includes(n))) : null} />} />
    );
  } else if (ct === "radar") {
    const polarGrid = (
      <PolarGrid stroke={style.radar.gridColor}
        gridType={style.radar.gridShape === "circle" ? "circle" : "polygon"} />
    );
    chart = (
      <RadarChart data={rows} outerRadius="80%" onClick={chartOnClick}>
        {polarGrid}
        <PolarAngleAxis dataKey="__period"
          tick={{ fontSize: style.radar.axisLabelSize, fill: style.radar.axisLabelColor }} />
        <PolarRadiusAxis tick={{ fontSize: style.radar.axisLabelSize, fill: style.radar.axisLabelColor }}
          tickFormatter={axisFmt(yAx, measureFmt)} />
        <Tooltip content={(p: RechartsTooltipProps) => <ChartTooltip {...p} style={style} measureFmt={measureFmt} prevPeriodMap={tooltipMaps.prev} yoyMap={tooltipMaps.yoy} additionalRow={tooltipExtra ?? undefined} />} />
        {renderRefLines(style)}
        {renderLegend}
        {data.series.map((s, i) => {
          const cfg = style.series.find((x) => x.key === s.name);
          const color = cfg?.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length];
          // FIX 7b â€” radar custom data labels via dot prop
          const dl = style.dataLabels;
          const dotRenderer = dl.show ? (props: LabelPointProps) => {
            const { cx, cy, value } = props;
            if (cx == null || cy == null) return <g />;
            const pos = dl.position;
            let dx = 0, dy = -8;
            let anchor: "middle" | "start" | "end" = "middle";
            if (pos === "below") { dx = 0; dy = 12; anchor = "middle"; }
            else if (pos === "left") { dx = -8; dy = 4; anchor = "end"; }
            else if (pos === "right") { dx = 8; dy = 4; anchor = "start"; }
            const fmt = dl.format === "auto" ? measureFmt : dl.format;
            return (
              <g>
                <circle cx={cx} cy={cy} r={2.5} fill={color} />
                <text x={cx + dx} y={cy + dy} fontSize={dl.size} fill={dl.color}
                  fontWeight={dl.bold ? 700 : 400}
                  fontStyle={dl.italic ? "italic" : "normal"}
                  textAnchor={anchor}>
                  {formatValue(Number(value) || 0, fmt, "rol", dl.decimals)}
                </text>
              </g>
            );
          } : { r: 2.5, fill: color };
          return (
            <Radar key={s.name} isAnimationActive={false} dataKey={s.name}
              stroke={color} strokeWidth={cfg?.thickness ?? 2}
              strokeDasharray={dashArr(cfg?.lineStyle)}
              fill={color}
              fillOpacity={style.radar.fillArea ? style.radar.fillOpacity : 0}
              dot={dotRenderer as never} />
          );
        })}
      </RadarChart>
    );
  } else if (ct === "histogram") {
    // A.10 â€” when breakdown set, one histogram series per breakdown
    const seriesList = data.series.length > 0 ? data.series : [{ name: "Total", values: [] as number[] }];
    const allFlat: number[] = [];
    seriesList.forEach((s) => s.values.forEach((v) => { if (isFinite(v)) allFlat.push(v); }));
    const min = allFlat.length ? allFlat.reduce((a, b) => a < b ? a : b, Infinity) : 0;
    const max = allFlat.length ? allFlat.reduce((a, b) => a > b ? a : b, -Infinity) : 1;
    if (min === max && allFlat.length > 0) {
      chart = (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 13, color: SLIDE_HEX.slate400 }}>
          Sem variaÃ§Ã£o nos dados
        </div>
      );
    } else {
    const bins = Math.max(2, Math.min(100, style.histogram.bins || 10));
    const w = style.histogram.binWidth && style.histogram.binWidth > 0
      ? style.histogram.binWidth
      : ((max - min) / bins) || 1;
    const nBuckets = style.histogram.binWidth ? Math.max(1, Math.ceil((max - min) / w)) : bins;
    const buckets: Record<string, number | string>[] = Array.from({ length: nBuckets }, (_, i) => ({
      bin: `${(min + i * w).toFixed(1)}`,
    }));
    seriesList.forEach((s) => {
      buckets.forEach((b) => { b[s.name] = 0; });
      s.values.forEach((v) => {
        if (!isFinite(v)) return;
        const idx = Math.min(nBuckets - 1, Math.max(0, Math.floor((v - min) / w)));
        buckets[idx][s.name] = (Number(buckets[idx][s.name]) || 0) + 1;
      });
    });
    if (style.histogram.cumulative) {
      seriesList.forEach((s) => {
        let acc = 0;
        buckets.forEach((b) => { acc += Number(b[s.name]) || 0; b[`__cum_${s.name}`] = acc; });
      });
    }
    chart = (
      <ComposedChart data={buckets} barCategoryGap="2%" margin={{ top: 24, right: 24, left: 8, bottom: 8 }}>
        {renderGrid}
        <XAxis dataKey="bin" tick={{ fontSize: xAx.labelSize, fill: xAx.labelColor }} />
        <YAxis yAxisId="left" tick={{ fontSize: yAx.labelSize, fill: yAx.labelColor }} />
        {style.histogram.cumulative && (
          <YAxis yAxisId="right" orientation="right"
            tick={{ fontSize: yAx.labelSize, fill: yAx.labelColor }} />
        )}
        <Tooltip content={(p: RechartsTooltipProps) => <ChartTooltip {...p} style={style} measureFmt={measureFmt} prevPeriodMap={tooltipMaps.prev} yoyMap={tooltipMaps.yoy} additionalRow={tooltipExtra ?? undefined} />} />
        {renderRefLines(style)}
        {renderLegend}
        {seriesList.map((s, i) => {
          const color = colorForSeries(style, s.name, i) ?? style.histogram.barColor;
          return (
            <Bar key={s.name} yAxisId="left" isAnimationActive={false}
              dataKey={s.name} name={s.name}
              fill={seriesList.length === 1 ? style.histogram.barColor : color}
              fillOpacity={seriesList.length > 1 ? 0.55 : 1}
              stroke={style.histogram.borderColor}
              strokeWidth={style.histogram.borderWidth}>
              {/* FIX 6 â€” histogram data labels (always above) */}
              {style.dataLabels.show && (
                <LabelList dataKey={s.name} position="top"
                  content={makeLabelContent({ style, measureFmt,
                    customFmt: (v) => { const n = Number(v); return Number.isInteger(n) ? String(n) : n.toFixed(0); } }) as never} />
              )}
            </Bar>
          );
        })}
        {style.histogram.cumulative && seriesList.map((s, i) => (
          <Line key={`cum_${s.name}`} yAxisId="right" isAnimationActive={false}
            dataKey={`__cum_${s.name}`} name={`${s.name} (acum.)`}
            type="monotone"
            stroke={DEFAULT_PALETTE[(i + 1) % DEFAULT_PALETTE.length]}
            strokeWidth={2} dot={false} />
        ))}
      </ComposedChart>
    );
    } // close else (min !== max)
  } else if (ct === "boxplot") {
    chart = <BoxPlot block={block} style={style} series={data.series} />;
  }

  return (
    <Wrapper style={style} hasIncoming={incoming.length > 0}>
      {/* Incoming filter badges (top-left, informational) */}
      <div style={{ position: "absolute", top: 4, left: 4, zIndex: 5,
        display: "flex", flexDirection: "column", gap: 2, pointerEvents: "none" }}>
        {incoming.map((f) => (
          <span key={f.sourceBlockId + f.dimension} style={{
            background: SLIDE_RGBA.incomingBadgeBg, color: SLIDE_HEX.white, fontSize: 10,
            padding: "2px 6px", borderRadius: 9999, fontWeight: 600,
          }}>
            {dimensionLabel(f.dimension)}: {f.values.join(", ")}
          </span>
        ))}
        {!participates && (
          <span style={{ background: SLIDE_HEX.slate, color: SLIDE_HEX.white, fontSize: 9,
            padding: "1px 5px", borderRadius: 4 }}>ðŸ”’ sem filtro</span>
        )}
      </div>
      {/* Active emitted filter pill (top-right, click to clear) */}
      {ownFilter && emits && (
        <div
          style={{
            position: "absolute", top: 4, right: 4, zIndex: 10,
            display: "flex", alignItems: "center", gap: 4,
            background: SLIDE_RGBA.editorSelectionPillBg,
            border: `1px solid ${SLIDE_RGBA.editorSelectionPillBorder}`,
            borderRadius: 20, padding: "2px 8px",
            fontSize: 10, fontFamily: "Calibri,sans-serif",
            color: SLIDE_HEX.blueDark, cursor: "pointer",
            backdropFilter: "blur(2px)",
          }}
          onClick={(e) => { e.stopPropagation(); cf.clearFilter(block.id); }}
          title="Clique para limpar o filtro"
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: SLIDE_HEX.blue }} />
          {ownFilter.values.length === 1 ? ownFilter.values[0] : `${ownFilter.values.length} selecionados`}
          <span style={{ marginLeft: 2, opacity: 0.7 }}>Ã—</span>
        </div>
      )}
      {style.general.titleShow && block.title && (
        <div style={{
          fontSize: style.general.titleSize, color: style.general.titleColor,
          fontWeight: style.general.titleBold ? 700 : 500,
          fontStyle: style.general.titleItalic ? "italic" : "normal",
          padding: "4px 8px",
        }}>{block.title}</div>
      )}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {budgetGap && (
          <div style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 6,
            textAlign: "center",
            fontFamily: "Calibri, sans-serif",
            fontSize: 12,
            fontWeight: 700,
            color: budgetGap.value >= 0 ? SLIDE_HEX.chart7 : SLIDE_HEX.chart1,
            pointerEvents: "none",
            lineHeight: 1,
          }}>
            {budgetGap.text}
          </div>
        )}
        {ct === "waterfall" ? chart as React.ReactElement : (
          <ResponsiveContainer width="100%" height="100%">
            {chart as React.ReactElement}
          </ResponsiveContainer>
        )}
      </div>
    </Wrapper>
  );
}, (prev, next) => prev.block === next.block);

function Wrapper({ children, style, hasIncoming }: {
  children: React.ReactNode; style: ChartStyle; hasIncoming?: boolean;
}) {
  const userBorder = style.general.borderWidth > 0
    ? `${style.general.borderWidth}px solid ${style.general.borderColor}`
    : undefined;
  // Subtle blue border when this chart is receiving filters from another block.
  // Honors any user-defined border first.
  const incomingBorder = hasIncoming ? "1.5px solid hsl(var(--editor-selection) / 0.4)" : undefined;
  return (
    <div
      data-chart-canvas=""
      style={{
      width: "100%", height: "100%", display: "flex", flexDirection: "column",
      background: style.general.background === "transparent" ? "transparent" : style.general.background,
      border: userBorder ?? incomingBorder ?? "1.5px solid transparent",
      padding: style.general.padding,
      fontFamily: "Calibri, sans-serif", overflow: "hidden",
      position: "relative",
      transition: "border-color 0.2s",
    }}>
      {children}
    </div>
  );
}

// -- Custom legend with click-to-filter on series dimension ----------------
interface CustomLegendProps {
  payload?: Array<{ value: string; color: string }>;
  ownFilter: ActiveFilter | null;
  legendDim: string;
  onLegendClick: (value: string, shift: boolean) => void;
  emits: boolean;
  colorMap?: Map<string, string>;
}
// Treat near-white / transparent / missing as invalid â€” fall back to palette.
function isUsableSwatch(c?: string): boolean {
  if (!c) return false;
  const v = c.trim().toLowerCase();
  if (!v || v === "transparent" || v === "none" || v === "currentcolor") return false;
  if (v === "#fff" || v === "#ffffff" || v === "white" || v === "#fefefe") return false;
  // rgb/rgba white-ish
  if (/^rgba?\(\s*255\s*,\s*255\s*,\s*255/.test(v)) return false;
  return true;
}

// Custom X-axis tick that renders a red pill around the value when the period
// is part of the active cross-filter selection. Stringifies both sides of the
// comparison so numeric tick payloads still match string filter values.
function ActivePeriodTick(props: { x?: number; y?: number; payload?: { value?: unknown }; activePeriods?: Set<string>; labelColor?: string; labelSize?: number }) {
  const { x, y, payload, activePeriods, labelColor, labelSize } = props;
  const text = String(payload?.value ?? "");
  const isActive = activePeriods instanceof Set && activePeriods.has(text);
  if (!isActive) {
    return (
      <text x={x} y={y} dy={16} textAnchor="middle" fill={labelColor} fontSize={labelSize}>
        {text}
      </text>
    );
  }
  const fs = labelSize ?? 11;
  const approxW = Math.max(28, text.length * (fs * 0.6) + 14);
  const h = fs + 8;
  const rx = h / 2;
  return (
    <g>
      <rect
        x={x - approxW / 2}
        y={y + 4}
        width={approxW}
        height={h}
        rx={rx}
        ry={rx}
        fill={SLIDE_HEX.chart1}
      />
      <text
        x={x}
        y={y + 4 + h / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill={SLIDE_HEX.white}
        fontSize={fs}
        fontWeight={600}
      >
        {text}
      </text>
    </g>
  );
}

interface CrossingDotProps {
  cx?: number; cy?: number; index?: number;
  payload?: Record<string, unknown>;
  activePeriods: Set<string>;
  baseR: number; dotFill: string; dotStroke: string;
  strokeOpacity: number;
}

function CrossingDot(props: CrossingDotProps) {
  const { cx, cy, index, activePeriods, baseR,
    dotFill, dotStroke, strokeOpacity } = props;
  if (cx == null || cy == null || index == null) return null;
  const period = String(props.payload?.__period ?? "");
  const isCross = activePeriods.has(period);
  const HIGHLIGHT = SLIDE_HEX.chart1;
  const r = isCross ? Math.max(baseR + 3, 6) : baseR;
  return (
    <circle cx={cx} cy={cy} r={r}
      fill={isCross ? HIGHLIGHT : dotFill}
      stroke={isCross ? HIGHLIGHT : dotStroke}
      strokeWidth={isCross ? 2 : 1}
      fillOpacity={isCross ? 1 : strokeOpacity}
      style={isCross
        ? { filter: `drop-shadow(0 0 4px ${SLIDE_RGBA.haraldGlow})` }
        : undefined} />
  );
}

// Recharts v2 only injects formattedGraphicalItems into class components
// passed via <Customized component={...} />. This draws the highlighted
// segments (prevâ†’active and activeâ†’next) on top of every Line/Area series.
interface SegmentOverlayProps {
  activePeriods: Set<string>;
  highlightColor?: string;
  formattedGraphicalItems?: Array<{ props?: { points?: Array<{ x: number; y: number; payload?: Record<string, unknown> }>; stroke?: string; dataKey?: string } }>;
}
class SegmentOverlay extends React.Component<SegmentOverlayProps> {
  render() {
    const { activePeriods, formattedGraphicalItems = [],
            highlightColor = SLIDE_HEX.chart1 } = this.props;
    if (!activePeriods || activePeriods.size === 0) return null;
    const segW = 4;
    const lines: JSX.Element[] = [];
    for (const item of formattedGraphicalItems) {
      // Identifica Line/Area: tem points com x/y numÃ©ricos e prop stroke
      const points: Array<{ x: number; y: number; payload?: Record<string, unknown> }> =
        item?.props?.points ?? [];
      if (points.length === 0) continue;
      const firstValid = points.find(p => p?.x != null && p?.y != null && !isNaN(p.y));
      if (!firstValid) continue;
      const hasStroke = item?.props?.stroke != null;
      if (!hasStroke) continue;
      const dataKey = item?.props?.dataKey ?? "k";
      for (let i = 0; i < points.length; i++) {
        const pt = points[i];
        if (!pt || pt.x == null || pt.y == null || isNaN(pt.y)) continue;
        const period = String(pt.payload?.__period ?? "");
        if (!activePeriods.has(period)) continue;
        if (i > 0) {
          const prev = points[i - 1];
          if (prev && prev.x != null && prev.y != null && !isNaN(prev.y)) {
            lines.push(
              <line key={`${dataKey}-L${i}`}
                x1={prev.x} y1={prev.y} x2={pt.x} y2={pt.y}
                stroke={highlightColor} strokeWidth={segW}
                strokeOpacity={0.9} strokeLinecap="round"
                style={{ filter: `drop-shadow(0 0 4px ${highlightColor}88)` }} />
            );
          }
        }
        if (i < points.length - 1) {
          const next = points[i + 1];
          if (next && next.x != null && next.y != null && !isNaN(next.y)) {
            lines.push(
              <line key={`${dataKey}-R${i}`}
                x1={pt.x} y1={pt.y} x2={next.x} y2={next.y}
                stroke={highlightColor} strokeWidth={segW}
                strokeOpacity={0.9} strokeLinecap="round"
                style={{ filter: `drop-shadow(0 0 4px ${highlightColor}88)` }} />
            );
          }
        }
      }
    }
    return <g className="segment-overlay" style={{ pointerEvents: "none" }}>{lines}</g>;
  }
}

function CustomLegend({ payload, ownFilter, legendDim, onLegendClick, emits, colorMap }: CustomLegendProps) {
  if (!payload?.length) return null;
  const isFilterDim = ownFilter?.dimension === legendDim;
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: 6,
      justifyContent: "center", padding: "4px 0 0",
    }}>
      {payload.map((entry, i) => {
        const isActive = !isFilterDim || ownFilter!.values.includes(entry.value);
        const fallback = colorMap?.get(entry.value) ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length];
        const swatchColor = isUsableSwatch(entry.color) ? entry.color : fallback;
        return (
          <button
            key={entry.value}
            type="button"
            aria-label={emits ? `Filtrar sÃ©rie ${entry.value}` : `SÃ©rie ${entry.value}`}
            aria-pressed={emits && isFilterDim ? isActive : undefined}
            disabled={!emits}
            onClick={(e) => { e.stopPropagation(); if (emits) onLegendClick(entry.value, e.shiftKey); }}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "2px 8px", borderRadius: 20,
              border: isFilterDim && isActive
                ? `1.5px solid ${swatchColor}`
                : "1.5px solid transparent",
              background: isFilterDim && isActive ? `${swatchColor}18` : "transparent",
              opacity: isActive ? 1 : 0.3,
              cursor: emits ? "pointer" : "default",
              transition: "opacity 0.15s, border-color 0.15s, background 0.15s",
              fontSize: 11, fontFamily: "Calibri, sans-serif",
              color: SLIDE_HEX.chart2,
            }}
          >
            <span style={{
              width: 10, height: 10, borderRadius: "50%",
              background: swatchColor, flexShrink: 0,
              border: "1px solid rgba(0,0,0,0.15)",
            }} />
            {entry.value}
          </button>
        );
      })}
    </div>
  );
}

// -- Treemap tile renderer (A.7 â€” honors dataLabels) ---------------------
function TreemapTile({ cfg, dl, fmt, dimmedNames, ...props }: {
  cfg: ChartStyle["treemap"];
  dl: ChartStyle["dataLabels"];
  fmt: ReturnType<typeof inferFormat>;
  dimmedNames: Set<string> | null;
  x?: number; y?: number; width?: number; height?: number; name?: string; value?: number; fill?: string;
}) {
  const { x, y, width, height, name, value, fill } = props;
  if (width < 2 || height < 2) return null;
  // FIX 5 â€” dl.show is master gate; when off, render only the rect
  if (dl && !dl.show) {
    const op = dimmedNames && dimmedNames.has(name) ? 0.4 : 1;
    return (
      <g opacity={op}>
        <rect x={x} y={y} width={width} height={height}
          style={{ fill, stroke: cfg.borderColor, strokeWidth: cfg.borderWidth }} />
      </g>
    );
  }
  const showCat = cfg.showCategoryLabel && width > 40 && height > 20;
  const showVal = cfg.showValueLabel && width > 60 && height > 32;
  const valStr = formatValue(
    value ?? 0,
    dl?.format && dl.format !== "auto" ? dl.format : fmt,
    "rol",
    dl?.decimals,
  );
  const fontWeight = dl?.bold ? 700 : 400;
  const fontStyle = dl?.italic ? "italic" : "normal";
  const fs = dl?.size ?? 11;
  const fc = dl?.color ?? SLIDE_HEX.white;
  const op = dimmedNames && dimmedNames.has(name) ? 0.4 : 1;
  return (
    <g opacity={op}>
      <rect x={x} y={y} width={width} height={height}
        style={{ fill, stroke: cfg.borderColor, strokeWidth: cfg.borderWidth }} />
      {showCat && (
        <text x={x + 4} y={y + fs + 2}
          fontSize={fs} fill={fc}
          fontWeight={fontWeight} fontStyle={fontStyle}>{name}</text>
      )}
      {showVal && (
        <text x={x + 4} y={y + fs * 2 + 6}
          fontSize={fs - 1} fill={fc}
          fontWeight={fontWeight} fontStyle={fontStyle}>
          {valStr}
        </text>
      )}
    </g>
  );
}

// -- Color blend (hex) -----------------------------------------------------
function mixHex(a: string, b: string, t: number): string {
  const pa = a.replace("#", ""); const pb = b.replace("#", "");
  const ra = parseInt(pa.slice(0, 2), 16), ga = parseInt(pa.slice(2, 4), 16), ba = parseInt(pa.slice(4, 6), 16);
  const rb = parseInt(pb.slice(0, 2), 16), gb = parseInt(pb.slice(2, 4), 16), bb = parseInt(pb.slice(4, 6), 16);
  const r = Math.round(ra + (rb - ra) * t);
  const g = Math.round(ga + (gb - ga) * t);
  const bl = Math.round(ba + (bb - ba) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`;
}

// -- Waterfall (custom Recharts composition) -------------------------------
// FIX 1+2 â€” supports both legacy per-period mode AND smart column-builder mode.
function WaterfallChart({
  block, style, series, dsRows: dsRowsProp,
}: {
  block: ChartBlock;
  style: ChartStyle;
  rows: Record<string, number | string>[];
  series: { name: string; values: number[] }[];
  dsRows?: PricingRow[];
}) {
  const effectiveMeasure = safeMeasureForSource(block.measure, block.dataSource)
    ?? fallbackMeasureForSource(block.dataSource);
  const measureFmt = inferFormat(effectiveMeasure);
  const pricing = usePricing((s) => s.rows);
  const metric = usePricing((s) => s.metric);
  const budget = useBudget((s) => s.rows);
  const forecast = useForecast((s) => s.rows);
  const rolling = useRolling((s) => s.rows);
  const dsRows = dsRowsProp
    ?? (block.dataSource === "budget" ? budgetRowsAsPricingFiltered(budget, "budget")
      : block.dataSource === "budget_real" ? budgetRowsAsPricingFiltered(budget, "real")
      : block.dataSource === "forecast" ? forecastRowsAsPricingLatest(forecast)
      : block.dataSource === "rolling" ? rollingRowsAsPricing(rolling)
      : pricing);

  const wfMode = style.waterfall.mode ?? "pvm";
  const pvmCfg = style.waterfall.pvm ?? { base: null, comp: null, periodMode: "month" as const, decomposition: "effects", topN: 6, comparisonMode: "prev-month" as const };
  const VALID_DECOMPOSITIONS = new Set([
    "marca", "categoria", "subcategoria", "formato",
    "canal", "canalAjustado", "mercado", "regional", "uf",
    "sku", "skuDesc",
  ]);
  const decomposition = VALID_DECOMPOSITIONS.has(pvmCfg.decomposition ?? "")
    ? pvmCfg.decomposition!
    : "effects";
  const topN = pvmCfg.topN ?? 6;
  const comparisonMode = pvmCfg.comparisonMode ?? "prev-month";

  // PVM mode â€” decomposiÃ§Ã£o igual Ã  aba Bridge (com auto-default de base/comp)
  const pvmItems = useMemo(() => {
    if (wfMode !== "pvm") return null;
    const filtered = applyFilters(dsRows, block.filters, null);
    if (filtered.length === 0) return [];

    let baseKey = pvmCfg.base;
    let compKey = pvmCfg.comp;

    // FIX 2 â€” PerÃ­odo de comparaÃ§Ã£o automÃ¡tico
    if (comparisonMode !== "manual" && pvmCfg.periodMode === "month") {
      const periods = Array.from(
        new Map(filtered.map((r) => [r.periodo, { mes: r.mes, ano: r.ano }])).entries(),
      ).sort((a, b) => a[1].ano - b[1].ano || a[1].mes - b[1].mes);
      if (periods.length === 0) return [];
      const latest = periods[periods.length - 1];
      compKey = latest[0];
      if (comparisonMode === "prev-month") {
        baseKey = periods.length >= 2 ? periods[periods.length - 2][0] : null;
      } else if (comparisonMode === "prev-year-month") {
        const targetMes = latest[1].mes;
        const targetAno = latest[1].ano - 1;
        const found = periods.find(([, v]) => v.mes === targetMes && v.ano === targetAno);
        baseKey = found ? found[0] : null;
      } else if (comparisonMode === "bench") {
        // Best CM month in the last 24 periods (excluding the comp/latest period itself)
        const last24 = periods.slice(-25, -1);
        const cmByPeriod = new Map<string, number>();
        for (const r of filtered) {
          const m = metric === "cm" ? r.contribMarginal : r.margemBruta;
          cmByPeriod.set(r.periodo, (cmByPeriod.get(r.periodo) ?? 0) + m);
        }
        let best: { p: string; v: number } | null = null;
        for (const [p] of last24) {
          const v = cmByPeriod.get(p) ?? 0;
          if (!best || Math.abs(v) > Math.abs(best.v)) best = { p, v };
        }
        baseKey = best?.p ?? null;
      }
    }

    // Auto-default base/comp: primeiro e Ãºltimo perÃ­odo disponÃ­veis (manual sem seleÃ§Ã£o)
    if (!baseKey || !compKey || baseKey === compKey) {
      if (pvmCfg.periodMode === "fy") {
        const fys = Array.from(new Set(filtered.map((r) => r.fy))).sort();
        if (fys.length < 2) return [];
        baseKey = fys[0];
        compKey = fys[fys.length - 1];
      } else {
        const periods = Array.from(
          new Map(filtered.map((r) => [r.periodo, { mes: r.mes, ano: r.ano }])).entries(),
        ).sort((a, b) => a[1].ano - b[1].ano || a[1].mes - b[1].mes);
        if (periods.length < 2) return [];
        baseKey = periods[0][0];
        compKey = periods[periods.length - 1][0];
      }
    }

    const labels = pvmCfg.periodMode === "month" ? {
      base: (() => { const r = filtered.find((x) => x.periodo === baseKey); return r ? monthLabel(r.mes, r.ano) : baseKey!; })(),
      comp: (() => { const r = filtered.find((x) => x.periodo === compKey); return r ? monthLabel(r.mes, r.ano) : compKey!; })(),
    } : undefined;

    try {
      const r = calcPVM(filtered, metric, baseKey!, compKey!, pvmCfg.periodMode, labels);
      const t = (v: number): "positive" | "negative" => v >= 0 ? "positive" : "negative";

      // ---- DecomposiÃ§Ã£o por dimensÃ£o (Marca, Categoria, etc.) ----
      if (decomposition && decomposition !== "effects") {
        const keyOf = (row: PricingRow) => (pvmCfg.periodMode === "fy" ? row.fy : row.periodo);
        const margemOf = (row: PricingRow) =>
          metric === "cm" ? row.contribMarginal : row.margemBruta;
        const baseAgg = new Map<string, number>();
        const compAgg = new Map<string, number>();
        for (const row of filtered) {
          const rawVal = (row as unknown as Record<string, unknown>)[decomposition];
          if (typeof rawVal === "number") continue;
          const dimVal = (typeof rawVal === "string" && rawVal.trim()) ? rawVal.trim() : "â€”";
          const k = keyOf(row);
          if (k === baseKey) baseAgg.set(dimVal, (baseAgg.get(dimVal) ?? 0) + margemOf(row));
          else if (k === compKey) compAgg.set(dimVal, (compAgg.get(dimVal) ?? 0) + margemOf(row));
        }
        const allDims = new Set([...baseAgg.keys(), ...compAgg.keys()]);
        const deltas = Array.from(allDims).map((d) => ({
          name: d,
          delta: (compAgg.get(d) ?? 0) - (baseAgg.get(d) ?? 0),
        })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

        const top = deltas.slice(0, topN);
        const rest = deltas.slice(topN);
        const restSum = rest.reduce((s, x) => s + x.delta, 0);

        const items: { label: string; value: number; type: "start" | "positive" | "negative" | "total" }[] = [
          { label: r.baseLabel, value: r.base, type: "start" },
          ...top.map((x) => ({ label: x.name, value: x.delta, type: t(x.delta) })),
        ];
        if (rest.length > 0) {
          items.push({ label: `Outros (${rest.length})`, value: restSum, type: t(restSum) });
        }
        items.push({ label: r.currentLabel, value: r.current, type: "total" });
        return items;
      }

      // ---- DecomposiÃ§Ã£o padrÃ£o por efeitos PVM ----
      return [
        { label: r.baseLabel,    value: r.base,       type: "start" as const },
        { label: "Volume",       value: r.volume,     type: t(r.volume) },
        { label: "PreÃ§o",        value: r.price,      type: t(r.price) },
        { label: "Custo",        value: r.cost,       type: t(r.cost) },
        { label: "Frete",        value: r.freight,    type: t(r.freight) },
        { label: "ComissÃ£o",     value: r.commission, type: t(r.commission) },
        { label: "Outros",       value: r.others,     type: t(r.others) },
        { label: r.currentLabel, value: r.current,    type: "total" as const },
      ];
    } catch { return []; }
  }, [wfMode, pvmCfg.base, pvmCfg.comp, pvmCfg.periodMode, comparisonMode, decomposition, topN, dsRows, block.filters, metric]);

  // Smart column / fallback (modo manual)
  const cols = style.waterfall.columns;
  const items = useMemo(() => {
    if (wfMode === "pvm") return pvmItems ?? [];
    if (cols && cols.length > 0) {
      const resolved = resolveBridgeColumns(cols, dsRows, block.filters, effectiveMeasure);
      return resolved.map((r) => ({ label: r.label, value: r.value, type: r.type }));
    }
    const s0 = series[0];
    if (!s0) return [];
    return s0.values.map((v, i) => ({
      label: `P${i + 1}`,
      value: v,
      type: (style.waterfall.classify[`P${i + 1}`] ?? (v >= 0 ? "positive" : "negative")) as
        "start" | "positive" | "negative" | "total" | "subtotal",
    }));
  }, [wfMode, pvmItems, cols, dsRows, block.filters, effectiveMeasure, series, style.waterfall.classify]);

  const wfRows = useMemo(() => {
    let acc = 0;
    return items.map((it) => {
      let base: number, delta: number, end: number, signed: number;
      if (it.type === "start" || it.type === "total" || it.type === "subtotal") {
        const target = it.type === "start" ? it.value
          : it.type === "subtotal" ? acc
          : it.value;
        base = Math.min(0, target);
        delta = Math.abs(target);
        end = target;
        signed = target;
        acc = target;
      } else {
        const v = it.type === "negative" ? -Math.abs(it.value) : Math.abs(it.value);
        const next = acc + v;
        base = Math.min(acc, next);
        delta = Math.max(0.0001, Math.abs(v)); // ensure non-zero so bar is visible
        end = next;
        signed = v;
        acc = next;
      }
      return { label: it.label, base, delta, end, signed, type: it.type };
    });
  }, [items]);

  const colorOf = (t: string) =>
    t === "positive" ? style.waterfall.positiveColor
    : t === "negative" ? style.waterfall.negativeColor
    : style.waterfall.totalColor;

  // The inspector now exposes Waterfall label position through the generic Data Labels control.
  const effectiveWfPos = String(style.dataLabels.position ?? style.waterfall.labelPos ?? "above");
  const labelPos = effectiveWfPos === "inside" || effectiveWfPos === "center" ? "center"
    : effectiveWfPos === "below" || effectiveWfPos === "bottom" || effectiveWfPos === "inside-base" ? "bottom" : "top";

  return (
    <FluidSvg>
      {(W, H) => {
        if (wfMode === "pvm" && wfRows.length === 0) {
          return (
            <svg width={W} height={H}>
              <line x1="35" y1={H / 2} x2={W - 35} y2={H / 2} stroke={style.grid.color} strokeWidth="1" />
              <text x={W / 2} y={H / 2 + 16} textAnchor="middle" fontSize="12" fill={style.xAxis.labelColor}>
                Sem dados suficientes para a Bridge
              </text>
            </svg>
          );
        }

        const allEnds = wfRows.flatMap((r) => [r.base, r.base + r.delta, r.end]);
        const yMin = style.yAxis.min ?? Math.min(0, ...allEnds);
        const yMax = style.yAxis.max ?? Math.max(0, ...allEnds);

        // Use user-configured font sizes directly so labels stay visually fixed
        const labelFs = style.xAxis.labelSize;
        const dlFs = style.dataLabels.size;
        const m = {
          top: Math.max(20, H * 0.08),
          right: Math.max(16, W * 0.025),
          bottom: Math.max(40, H * 0.16),
          left: style.yAxis.show ? Math.max(56, W * 0.07) : Math.max(16, W * 0.025),
        };
        const plotW = Math.max(10, W - m.left - m.right);
        const plotH = Math.max(10, H - m.top - m.bottom);
        const range = yMax - yMin || 1;
        const yOf = (v: number) => m.top + (1 - (v - yMin) / range) * plotH;
        const slot = plotW / Math.max(1, wfRows.length);
        const barW = Math.max(6, Math.min(slot * 0.9, slot * (1 - style.waterfall.gapPct / 120)));
        const zeroY = yOf(0);
        const valFmt = (v: number) => formatValue(v, style.dataLabels.format === "auto" ? measureFmt : style.dataLabels.format, "rol", style.dataLabels.decimals);
        const truncLabel = (lbl: string) => {
          const maxChars = Math.max(4, Math.floor(slot / (labelFs * 0.6)));
          return lbl.length > maxChars ? `${lbl.slice(0, Math.max(1, maxChars - 1))}â€¦` : lbl;
        };

        return (
          <svg width={W} height={H}>
            {style.grid.show && [0, 0.25, 0.5, 0.75, 1].map((t) => {
              const y = m.top + t * plotH;
              return <line key={t} x1={m.left} y1={y} x2={W - m.right} y2={y} stroke={style.grid.color} strokeDasharray={style.grid.style === "dashed" ? "5 5" : undefined} />;
            })}
            {style.xAxis.show && <line x1={m.left} y1={zeroY} x2={W - m.right} y2={zeroY} stroke={style.xAxis.lineColor} strokeWidth={style.xAxis.lineWidth} />}
            {style.yAxis.show && <line x1={m.left} y1={m.top} x2={m.left} y2={m.top + plotH} stroke={style.yAxis.lineColor} strokeWidth={style.yAxis.lineWidth} />}
            {style.yAxis.show && [yMin, (yMin + yMax) / 2, yMax].map((v) => (
              <text key={v} x={m.left - 8} y={yOf(v) + 4} textAnchor="end" fontSize={style.yAxis.labelSize} fill={style.yAxis.labelColor}>{formatValue(v, measureFmt, "rol")}</text>
            ))}
            {style.waterfall.connectors && wfRows.slice(0, -1).map((r, i) => {
              const x1 = m.left + slot * i + slot / 2 + barW / 2;
              const x2 = m.left + slot * (i + 1) + slot / 2 - barW / 2;
              return <line key={`c-${i}`} x1={x1} y1={yOf(r.end)} x2={x2} y2={yOf(r.end)} stroke={style.waterfall.connectorColor} strokeDasharray={dashArr(style.waterfall.connectorStyle)} />;
            })}
            {wfRows.map((r, i) => {
              const cx = m.left + slot * i + slot / 2;
              const x = cx - barW / 2;
              const y0 = yOf(r.base);
              const y1 = yOf(r.base + r.delta);
              const y = Math.min(y0, y1);
              const h = Math.max(2, Math.abs(y1 - y0));
              const fill = evalCondColor(r.signed, style.conditionalRules, colorOf(r.type));
              const labelY = labelPos === "center" ? y + h / 2 : labelPos === "bottom" ? Math.max(y0, y1) + dlFs + 2 : y - 6;
              // Start/Total/Subtotal show absolute end value; intermediate bars show signed delta (variance).
              const isAnchorBar = r.type === "start" || r.type === "total" || r.type === "subtotal";
              const labelVal = isAnchorBar ? r.end : r.signed;
              const labelTxt = isAnchorBar ? valFmt(labelVal) : (labelVal >= 0 ? `+${valFmt(labelVal)}` : valFmt(labelVal));
              return (
                <g key={r.label}>
                  <rect x={x} y={y} width={barW} height={h} fill={fill} rx="2" />
                  {style.dataLabels.show && <text x={cx} y={labelY} textAnchor="middle" fontSize={dlFs} fill={style.dataLabels.color} fontWeight={style.dataLabels.bold ? 700 : 400} fontStyle={style.dataLabels.italic ? "italic" : "normal"}>{labelTxt}</text>}
                  <text x={cx} y={H - Math.max(12, m.bottom * 0.45)} textAnchor="middle" fontSize={labelFs} fill={style.xAxis.labelColor}>{truncLabel(r.label)}</text>
                </g>
              );
            })}
            {style.waterfall.showRunningTotal && <polyline points={wfRows.map((r, i) => `${m.left + slot * i + slot / 2},${yOf(r.end)}`).join(" ")} fill="none" stroke={style.waterfall.totalColor} strokeWidth="2" />}
          </svg>
        );
      }}
    </FluidSvg>
  );
}

// Measures its container and renders an SVG at the actual pixel size,
// so the Bridge reflows fluidly (like Recharts' ResponsiveContainer does).
function FluidSvg({ children }: { children: (w: number, h: number) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ width: "100%", height: "100%" }}>
      {size.w > 0 && size.h > 0 ? children(size.w, size.h) : null}
    </div>
  );
}

// -- Box & Whisker --------------------------------------------------------
function BoxPlot({
  block, style, series,
}: {
  block: ChartBlock;
  style: ChartStyle;
  series: { name: string; values: number[] }[];
}) {
  const measureFmt = inferFormat(block.measure);
  const stats = series.map((s, idx) => {
    const sorted = [...s.values].filter((v) => isFinite(v)).sort((a, b) => a - b);
    const n = sorted.length;
    const q = (p: number) => sorted[Math.floor((n - 1) * p)] ?? 0;
    const q1 = q(0.25); const q2 = q(0.5); const q3 = q(0.75);
    const iqr = q3 - q1;
    const lowerFence = q1 - 1.5 * iqr;
    const upperFence = q3 + 1.5 * iqr;
    const inFence = sorted.filter((v) => v >= lowerFence && v <= upperFence);
    const outliers = sorted.filter((v) => v < lowerFence || v > upperFence);
    const min = inFence[0] ?? q1;
    const max = inFence[inFence.length - 1] ?? q3;
    const mean = n > 0 ? sorted.reduce((a, b) => a + b, 0) / n : 0;
    const cfg = style.series.find((x) => x.key === s.name);
    return {
      name: s.name, q1, q2, q3, min, max, mean, outliers,
      color: cfg?.color ?? style.boxplot.boxFillColor, idx,
    };
  });

  const all = stats.flatMap((s) => [s.min, s.max, ...s.outliers]);
  // A.12 â€” honor user yAxis.min/max when set
  const yMin = style.yAxis.min ?? (all.length ? all.reduce((a, b) => a < b ? a : b, Infinity) : 0);
  const yMax = style.yAxis.max ?? (all.length ? all.reduce((a, b) => a > b ? a : b, -Infinity) : 1);

  return (
    <ComposedChart data={stats} margin={{ top: 24, right: 24, left: 8, bottom: 8 }}>
      <CartesianGrid stroke={style.grid.color}
        strokeDasharray={style.grid.style === "dashed" ? "3 3" : "0"} />
      <XAxis dataKey="name" tick={{ fontSize: style.xAxis.labelSize, fill: style.xAxis.labelColor }} />
      <YAxis domain={[yMin, yMax]}
        tick={{ fontSize: style.yAxis.labelSize, fill: style.yAxis.labelColor }}
        tickFormatter={(v: number) => formatValue(v, measureFmt, "rol")} />
      <Tooltip content={(p: RechartsTooltipProps) => <ChartTooltip {...p} style={style} measureFmt={measureFmt} />} />
      <Bar dataKey="q1" stackId="bp" fill="transparent" isAnimationActive={false} />
      <Bar dataKey={(r: BoxPlotRow) => r.q3 - r.q1} stackId="bp"
        isAnimationActive={false}
        shape={(props: BoxPlotShapeProps) => {
          const { x, y, width, height, payload } = props;
          const cy = (v: number) => {
            const range = yMax - yMin || 1;
            return y + height - ((v - payload.q1) / (payload.q3 - payload.q1 || 1)) * height;
          };
          // Convert chart-relative coords with same plot
          const plotTop = y; const plotBot = y + height;
          const scale = (v: number) => {
            const range = yMax - yMin || 1;
            return plotBot - ((v - yMin) / range) * (plotBot - plotTop) * 0;
          };
          // Use simple proportional mapping inside the bar's own band
          const yMinBar = y; const yMaxBar = y + height;
          // Recompute proper full-axis mapping: use external yMin/yMax
          const yPx = (v: number) => {
            const top = props.background?.y ?? y;
            const totalH = props.background?.height ?? height;
            const range = yMax - yMin || 1;
            return top + totalH - ((v - yMin) / range) * totalH;
          };
          const yQ1 = yPx(payload.q1);
          const yQ3 = yPx(payload.q3);
          const yMed = yPx(payload.q2);
          const yMn = yPx(payload.min);
          const yMx = yPx(payload.max);
          const yMean = yPx(payload.mean);
          const cx = x + width / 2;
          return (
            <g>
              {/* whisker line */}
              <line x1={cx} x2={cx} y1={yMx} y2={yMn}
                stroke={style.boxplot.whiskerColor} strokeWidth={style.boxplot.whiskerWidth} />
              {/* whisker caps */}
              <line x1={x + width * 0.25} x2={x + width * 0.75} y1={yMx} y2={yMx}
                stroke={style.boxplot.whiskerColor} strokeWidth={style.boxplot.whiskerWidth} />
              <line x1={x + width * 0.25} x2={x + width * 0.75} y1={yMn} y2={yMn}
                stroke={style.boxplot.whiskerColor} strokeWidth={style.boxplot.whiskerWidth} />
              {/* box */}
              <rect x={x} y={yQ3} width={width} height={Math.max(1, yQ1 - yQ3)}
                fill={payload.color} stroke={style.boxplot.whiskerColor} />
              {/* median */}
              <line x1={x} x2={x + width} y1={yMed} y2={yMed}
                stroke={style.boxplot.medianColor} strokeWidth={style.boxplot.medianWidth} />
              {/* mean */}
              {style.boxplot.showMean && (
                <circle cx={cx} cy={yMean} r={3} fill={style.boxplot.medianColor} />
              )}
              {/* outliers */}
              {style.boxplot.showOutliers && payload.outliers.map((o: number, i: number) => (
                <circle key={i} cx={cx} cy={yPx(o)} r={2.5}
                  fill="none" stroke={style.boxplot.whiskerColor} strokeWidth={1} />
              ))}
              {/* FIX 7 â€” data label: median value above whisker top */}
              {style.dataLabels.show && (
                <text x={cx} y={yMx - 6} textAnchor="middle"
                  fontSize={style.dataLabels.size}
                  fill={style.dataLabels.color}
                  fontWeight={style.dataLabels.bold ? 700 : 400}
                  fontStyle={style.dataLabels.italic ? "italic" : "normal"}>
                  {formatValue(payload.q2, style.dataLabels.format === "auto" ? measureFmt : style.dataLabels.format, "rol", style.dataLabels.decimals)}
                </text>
              )}
            </g>
          );
        }}
      />
    </ComposedChart>
  );
}
