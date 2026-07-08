// Shared helpers used by ChartCanvas — kept separate to keep the renderer file lean.
// Implements: custom rich tooltip, conditional-formatting evaluator, sort,
// trendline / forecast math, custom Funnel SVG, custom Pie label renderer,
// custom Radar label dot, and Bridge column resolution.

import type { ReactNode } from "react";
import { ReferenceLine } from "recharts";
import type { ChartBlock, KpiMeasureId } from "@/lib/customSlide";
import type { ChartStyle, ConditionalRule, WaterfallColumn } from "./types";
import { formatValue, inferFormat, computeChartSeries } from "@/lib/customKpi";
import type { PricingRow } from "@/lib/types";

export interface ChartTooltipPayload {
  dataKey?: string | number;
  name?: string | number;
  value?: unknown;
  color?: string;
  payload?: Record<string, unknown>;
}

// ---- Conditional formatting ---------------------------------------------
export function evalCondColor(
  v: number,
  rules: ConditionalRule[] | undefined,
  fallback: string,
): string {
  if (!rules || rules.length === 0) return fallback;
  for (const r of rules) {
    if (r.op === ">" && v > r.threshold) return r.color;
    if (r.op === "<" && v < r.threshold) return r.color;
    if (r.op === "=" && v === r.threshold) return r.color;
    if (r.op === "between" && r.threshold2 != null
        && v >= Math.min(r.threshold, r.threshold2)
        && v <= Math.max(r.threshold, r.threshold2)) return r.color;
  }
  return fallback;
}

// ---- Sort applied to {periodos, series} ---------------------------------
export function applySort(
  periodos: { label: string }[],
  series: { name: string; values: number[] }[],
  sort: ChartBlock["sortConfig"],
): { periodos: { label: string }[]; series: { name: string; values: number[] }[] } {
  if (!sort) return { periodos, series };
  if (sort.field === "name") {
    const sorted = [...series].sort((a, b) =>
      sort.dir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));
    return { periodos, series: sorted };
  }
  if (sort.field === "value") {
    const sumOf = (s: { values: number[] }) => s.values.reduce((x, y) => x + (y || 0), 0);
    const sorted = [...series].sort((a, b) =>
      sort.dir === "asc" ? sumOf(a) - sumOf(b) : sumOf(b) - sumOf(a));
    return { periodos, series: sorted };
  }
  // period (reorder all rows)
  const idx = periodos.map((_, i) => i);
  idx.sort((a, b) =>
    sort.dir === "asc"
      ? periodos[a].label.localeCompare(periodos[b].label)
      : periodos[b].label.localeCompare(periodos[a].label));
  return {
    periodos: idx.map((i) => periodos[i]),
    series: series.map((s) => ({ name: s.name, values: idx.map((i) => s.values[i] ?? 0) })),
  };
}

// ---- Trendline / forecast -----------------------------------------------
export function linearFit(ys: number[]): { m: number; b: number; r2: number } {
  const n = ys.length;
  if (n < 2) return { m: 0, b: ys[0] ?? 0, r2: 0 };
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += i; sy += ys[i]; sxx += i * i; sxy += i * ys[i]; }
  const m = (n * sxy - sx * sy) / Math.max(1e-9, n * sxx - sx * sx);
  const b = (sy - m * sx) / n;
  const meanY = sy / n;
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    const yhat = m * i + b;
    ssRes += (ys[i] - yhat) ** 2;
    ssTot += (ys[i] - meanY) ** 2;
  }
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
  return { m, b, r2 };
}

export function movingAvg(ys: number[], window: number): (number | null)[] {
  const w = Math.max(2, Math.min(12, window));
  const out: (number | null)[] = [];
  for (let i = 0; i < ys.length; i++) {
    if (i < w - 1) { out.push(null); continue; }
    let s = 0;
    for (let k = 0; k < w; k++) s += ys[i - k] ?? 0;
    out.push(s / w);
  }
  return out;
}

/**
 * Compute trendline + forecast values per row.
 * Returns one value per (existing periods + forecast periods) for each series row.
 * The output rows are merged into the chart data with synthetic future labels.
 */
export function computeTrendlineSeries(
  series: { name: string; values: number[] }[],
  periodLabels: string[],
  trend: { enabled: boolean; type: "linear" | "exp" | "ma"; maWindow: number },
  forecast: { enabled: boolean; periods: number },
): {
  rows: Record<string, number | string | null>[];
  r2ByName: Record<string, number>;
  forecastStartIdx: number;
  trendKey: (name: string) => string;
} {
  const trendKey = (name: string) => `__trend_${name}`;
  const r2ByName: Record<string, number> = {};
  if (!trend.enabled) {
    return { rows: [], r2ByName, forecastStartIdx: periodLabels.length, trendKey };
  }
  const fwd = forecast.enabled ? Math.max(1, Math.min(6, forecast.periods)) : 0;
  const allLabels = [...periodLabels];
  for (let i = 1; i <= fwd; i++) allLabels.push(`+${i}`);
  const rows: Record<string, number | string | null>[] = allLabels.map((lb) => ({ __period: lb }));

  for (const s of series) {
    if (trend.type === "ma") {
      const ma = movingAvg(s.values, trend.maWindow);
      ma.forEach((v, i) => { rows[i][trendKey(s.name)] = v; });
      // no native forecast for MA — extend using last value
      if (fwd > 0) {
        const last = ma[ma.length - 1] ?? s.values[s.values.length - 1] ?? 0;
        for (let i = 0; i < fwd; i++) rows[periodLabels.length + i][trendKey(s.name)] = last;
      }
      r2ByName[s.name] = NaN;
      continue;
    }
    if (trend.type === "exp") {
      // log-linear regression: y = a * exp(b*x) -> ln(y) = ln(a) + b*x ; ignore non-positive
      const ys: number[] = s.values.map((v) => v > 0 ? Math.log(v) : NaN);
      const valid = ys.map((y, i) => ({ x: i, y })).filter((p) => isFinite(p.y));
      if (valid.length < 2) { r2ByName[s.name] = 0; continue; }
      const fit = linearFit(valid.map((p) => p.y));
      // refit using mapped indices
      const meanX = valid.reduce((s2, p) => s2 + p.x, 0) / valid.length;
      const meanY = valid.reduce((s2, p) => s2 + p.y, 0) / valid.length;
      let num = 0, den = 0;
      for (const p of valid) { num += (p.x - meanX) * (p.y - meanY); den += (p.x - meanX) ** 2; }
      const b = den === 0 ? 0 : num / den;
      const a = meanY - b * meanX;
      let ssRes = 0, ssTot = 0;
      for (const p of valid) {
        ssRes += (p.y - (a + b * p.x)) ** 2;
        ssTot += (p.y - meanY) ** 2;
      }
      r2ByName[s.name] = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
      void fit;
      for (let i = 0; i < allLabels.length; i++) rows[i][trendKey(s.name)] = Math.exp(a + b * i);
    } else {
      // linear
      const fit = linearFit(s.values);
      r2ByName[s.name] = fit.r2;
      for (let i = 0; i < allLabels.length; i++) rows[i][trendKey(s.name)] = fit.m * i + fit.b;
    }
  }
  return { rows, r2ByName, forecastStartIdx: periodLabels.length, trendKey };
}

// ---- Reference lines renderer (recharts <ReferenceLine />) ---------------
export function renderRefLines(style: ChartStyle, yAxisId = "left"): ReactNode {
  const lines = style.analytics?.refLines ?? [];
  if (!lines.length) return null;
  return lines.map((rl) => (
    <ReferenceLine key={rl.id} y={rl.value} yAxisId={yAxisId}
      stroke={rl.color} strokeWidth={rl.thickness}
      strokeDasharray={rl.style === "dashed" ? "5 5" : rl.style === "dotted" ? "2 4" : "0"}
      label={{ value: rl.label, fill: rl.color, fontSize: 10, position: "insideTopRight" }} />
  ));
}

// ---- Rich tooltip -------------------------------------------------------
export function ChartTooltip(props: {
  active?: boolean;
  payload?: ChartTooltipPayload[];
  label?: string;
  style: ChartStyle;
  measureFmt: ReturnType<typeof inferFormat>;
  prevPeriodMap?: Map<string, Map<string, number>>; // series->period->value
  yoyMap?: Map<string, Map<string, number>>;
  variant?: "default" | "bubble" | "scatter" | "pie" | "funnel" | "waterfall";
  pieTotal?: number;
  funnelStages?: { name: string; value: number }[];
  /** C2 — extra row appended to the tooltip body */
  additionalRow?: { label: string; map: Map<string, number>; fmt: ReturnType<typeof inferFormat>; measure: KpiMeasureId };
}) {
  const { active, payload, label, style, measureFmt, variant = "default", additionalRow } = props;
  if (!active || !payload || payload.length === 0) return null;
  const fmt = (v: number) => formatValue(v, style.dataLabels.format === "auto"
    ? measureFmt : style.dataLabels.format, "rol", style.dataLabels.decimals);

  const card = {
    background: "#0F172A", color: "#F8FAFC",
    border: "1px solid #334155", borderRadius: 6,
    padding: "8px 10px", fontSize: 11, lineHeight: 1.45,
    boxShadow: "0 4px 12px rgba(0,0,0,0.35)", minWidth: 140,
  } as const;

  const extraLine = additionalRow && label != null ? (() => {
    const v = additionalRow.map.get(String(label));
    if (v == null) return null;
    return (
      <div style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid #334155", opacity: 0.85 }}>
        {additionalRow.label}: {formatValue(v, additionalRow.fmt, additionalRow.measure)}
      </div>
    );
  })() : null;

  if (variant === "pie") {
    const p = payload[0];
    const v = Number(p?.value) || 0;
    const total = props.pieTotal ?? 1;
    return (
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{p?.name}</div>
        <div>{fmt(v)} <span style={{ opacity: 0.7 }}>({((v / total) * 100).toFixed(1)}%)</span></div>
        {extraLine}
      </div>
    );
  }
  if (variant === "funnel") {
    const p = payload[0];
    if (p?.payload?.__spacer) return null;
    const stages = props.funnelStages ?? [];
    const idx = stages.findIndex((s) => s.name === p?.name);
    const first = stages[0]?.value ?? 1;
    const prev = idx > 0 ? stages[idx - 1].value : null;
    const v = Number(p?.value) || 0;
    return (
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{p?.name}</div>
        <div>{fmt(v)}</div>
        <div style={{ opacity: 0.75 }}>{((v / first) * 100).toFixed(1)}% do total</div>
        {prev != null && prev !== 0 && (
          <div style={{ opacity: 0.75 }}>{((v / prev) * 100).toFixed(1)}% do anterior</div>
        )}
        {extraLine}
      </div>
    );
  }
  if (variant === "bubble" || variant === "scatter") {
    const p = payload[0]?.payload;
    return (
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{p?.name}</div>
        <div>X: {fmt(p?.x ?? 0)}</div>
        <div>Y: {fmt(p?.y ?? 0)}</div>
        {variant === "bubble" && <div>Tamanho: {fmt(p?.z ?? 0)}</div>}
        {extraLine}
      </div>
    );
  }
  if (variant === "waterfall") {
    const p = payload.find((x) => x.dataKey === "delta") ?? payload[0];
    const r = p?.payload ?? {};
    return (
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{label ?? r.label}</div>
        <div>Δ {fmt(r.signed ?? r.delta ?? 0)}</div>
        <div style={{ opacity: 0.75 }}>Acumulado: {fmt(r.end ?? 0)}</div>
        {extraLine}
      </div>
    );
  }

  // default — line / bar / area / radar / etc.
  return (
    <div style={card}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {payload.filter((p) => !String(p.dataKey ?? "").startsWith("__"))
        .map((p) => {
          const v = Number(p.value) || 0;
          const prev = props.prevPeriodMap?.get(String(p.dataKey))?.get(String(label));
          const yoy = props.yoyMap?.get(String(p.dataKey))?.get(String(label));
          return (
            <div key={p.dataKey} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
              <span style={{ flex: 1 }}>{p.name ?? p.dataKey}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(v)}</span>
              {prev != null && prev !== 0 && (
                <span style={{
                  color: v - prev >= 0 ? "#86efac" : "#fca5a5", fontSize: 10,
                }}>
                  {v - prev >= 0 ? "▲" : "▼"} {(((v - prev) / Math.abs(prev)) * 100).toFixed(1)}%
                </span>
              )}
              {yoy != null && yoy !== 0 && (
                <span style={{
                  color: v - yoy >= 0 ? "#86efac" : "#fca5a5", fontSize: 10, opacity: 0.85,
                }}>
                  YoY {v - yoy >= 0 ? "▲" : "▼"} {(((v - yoy) / Math.abs(yoy)) * 100).toFixed(0)}%
                </span>
              )}
            </div>
          );
        })}
      {extraLine}
    </div>
  );
}

// ---- Smart Bridge: resolve column values --------------------------------
export function resolveBridgeColumns(
  cols: WaterfallColumn[],
  rows: PricingRow[],
  filters: ChartBlock["filters"],
  fallbackMeasure: KpiMeasureId,
): { label: string; type: WaterfallColumn["type"]; value: number; id: string }[] {
  return cols.map((c) => {
    let value = 0;
    if (c.manualValue != null && !Number.isNaN(c.manualValue)) {
      value = c.manualValue;
    } else {
      const m = c.measure ?? fallbackMeasure;
      const f = { ...filters };
      if (c.filterDim && c.filterValue) {
        // shallow add: assumes filters obj allows arbitrary dim arrays
        (f as Record<string, string[]>)[c.filterDim] = [c.filterValue];
      }
      try {
        const r = computeChartSeries(rows, f, m, null);
        value = r.series[0]?.values.reduce((a, b) => a + (b || 0), 0) ?? 0;
      } catch {
        value = 0;
      }
    }
    return { label: c.label || "—", type: c.type, value, id: c.id };
  });
}

// ---- Custom Funnel SVG (proper trapezoids) ------------------------------
export function FunnelSVG({
  data, style, measureFmt, width = 400, height = 300,
  onSliceClick, dimmedNames,
}: {
  data: { name: string; value: number; color: string }[];
  style: ChartStyle;
  measureFmt: ReturnType<typeof inferFormat>;
  width?: number; height?: number;
  onSliceClick?: (name: string, e: React.MouseEvent) => void;
  dimmedNames?: Set<string> | null;
}) {
  if (data.length === 0) return null;
  const ordered = style.funnel.direction === "btt" ? [...data].reverse() : data;
  const maxVal = Math.max(...ordered.map((d) => Math.abs(d.value)), 1);
  const padX = 8;
  const usableW = width - padX * 2;
  const gapPx = (height * (style.funnel.gapPct ?? 0)) / 100;
  const stageH = (height - gapPx * (ordered.length - 1)) / ordered.length;
  const cx = width / 2;
  const dl = style.dataLabels;
  const fmt = (v: number) => formatValue(v, dl.format === "auto" ? measureFmt : dl.format, "rol", dl.decimals);

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
      {ordered.map((d, i) => {
        const wTop = (Math.abs(d.value) / maxVal) * usableW;
        const next = ordered[i + 1];
        const wBot = next ? (Math.abs(next.value) / maxVal) * usableW : wTop * 0.6;
        const y0 = i * (stageH + gapPx);
        const y1 = y0 + stageH;
        const xTL = cx - wTop / 2, xTR = cx + wTop / 2;
        const xBL = cx - wBot / 2, xBR = cx + wBot / 2;
        const path = `M${xTL},${y0} L${xTR},${y0} L${xBR},${y1} L${xBL},${y1} Z`;
        // label position
        let lx = cx, anchor: "middle" | "start" | "end" = "middle";
        if (style.funnel.labelPos === "left") { lx = padX; anchor = "start"; }
        else if (style.funnel.labelPos === "right") { lx = width - padX; anchor = "end"; }
        const ly = y0 + stageH / 2;
        const labelText = (() => {
          const total = ordered.reduce((s, x) => s + Math.abs(x.value), 0) || 1;
          const pct = ((Math.abs(d.value) / total) * 100).toFixed(dl.decimals ?? 1) + "%";
          switch (style.funnel.labelMode) {
            case "value": return fmt(d.value);
            case "percent": return pct;
            case "name": return d.name;
            default: return `${d.name}: ${pct}`;
          }
        })();
        // conversion vs previous
        const prev = i > 0 ? ordered[i - 1].value : null;
        const conv = prev && prev !== 0 ? `▼ ${((d.value / prev) * 100).toFixed(0)}%` : null;
        return (
          <g key={`${d.name}-${i}`}
            opacity={dimmedNames && dimmedNames.has(d.name) ? 0.4 : 1}
            style={{ cursor: onSliceClick ? "pointer" : undefined }}
            onClick={(e) => onSliceClick?.(d.name, e)}>
            <path d={path} fill={d.color} />
            {/* FIX 2 — gate label rendering on dl.show */}
            {dl.show && (
              <text x={lx} y={ly + dl.size / 3} fontSize={dl.size} fill={dl.color}
                fontWeight={dl.bold ? 700 : 400}
                fontStyle={dl.italic ? "italic" : "normal"}
                textAnchor={anchor}>{labelText}</text>
            )}
            {dl.show && conv && dl.showCategory && i > 0 && (
              <text x={cx} y={y0 - 2} fontSize={dl.size - 1} fill="#64748B"
                textAnchor="middle">{conv}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
