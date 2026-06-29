// Cálculo dinâmico de KPIs e séries para os blocos do Slide Personalizado.
// Reutiliza filtros e dados do store sem trazer regras novas de negócio.

import type { PricingRow, Filters } from "./types";
import { applyFilters } from "./analytics";
import { clienteId } from "./farol";
import type { KpiBlock, KpiMeasureId, KpiPeriodMode, KpiFormat } from "./customSlide";
import { formatBRL, formatNum, formatPct, monthLabel } from "./format";
import { POSITIVACAO_DIMS } from "./positivacao";

function periodFilter(rows: PricingRow[], mode: KpiPeriodMode, value?: string | null): PricingRow[] {
  if (mode === "all" || !value) return rows;
  if (mode === "fy") return rows.filter((r) => r.fy === value);
  if (mode === "month") return rows.filter((r) => r.periodo === value);
  return rows;
}

export interface KpiAgg {
  rol: number;
  volume: number;
  cm: number;
  mb: number;
  cv: number;
  frete: number;
  comissao: number;
  clientesPositivados: Set<string>;
}

export function aggregateKpi(rows: PricingRow[]): KpiAgg {
  const acc = emptyKpiAgg();
  for (const r of rows) {
    addToKpiAgg(acc, r);
  }
  return acc;
}

function emptyKpiAgg(): KpiAgg {
  return {
    rol: 0,
    volume: 0,
    cm: 0,
    mb: 0,
    cv: 0,
    frete: 0,
    comissao: 0,
    clientesPositivados: new Set<string>(),
  };
}

function addToKpiAgg(acc: KpiAgg, r: PricingRow) {
  acc.rol += r.rol;
  acc.volume += r.volumeKg;
  acc.cm += r.contribMarginal;
  acc.mb += r.margemBruta;
  acc.cv += r.custoVariavel;
  acc.frete += r.frete;
  acc.comissao += r.comissao;
  if ((r.volumeKg ?? 0) > 0 || (r.rol ?? 0) > 0) {
    const cliente = clienteId(r.cliente);
    if (cliente) acc.clientesPositivados.add(cliente);
  }
}

function dimValue(row: PricingRow, dim: string): string {
  const value = (row as unknown as Record<string, unknown>)[dim];
  if (typeof value === "string" && value.trim()) return value.trim();
  const meta = POSITIVACAO_DIMS.find((d) => d.key === dim);
  return meta?.emptyLabel ?? "—";
}

export function pickMeasure(agg: KpiAgg, measure: KpiMeasureId): number {
  switch (measure) {
    case "rol": return agg.rol;
    case "volume": return agg.volume;
    case "cm": return agg.cm;
    case "mb": return agg.mb;
    case "cv": return agg.cv;
    case "frete": return agg.frete;
    case "comissao": return agg.comissao;
    case "cmPct": return agg.rol > 0 ? agg.cm / agg.rol : 0;
    case "mbPct": return agg.rol > 0 ? agg.mb / agg.rol : 0;
    case "precoMedio": return agg.volume > 0 ? agg.rol / agg.volume : 0;
    case "positivacao": return agg.clientesPositivados.size;
    case "ticketMedio": return agg.clientesPositivados.size > 0 ? agg.volume / agg.clientesPositivados.size : 0;
  }
}

export function inferFormat(measure: KpiMeasureId): Exclude<KpiFormat, "auto"> {
  if (measure === "cmPct" || measure === "mbPct") return "percent";
  if (measure === "volume") return "tons";
  if (measure === "positivacao" || measure === "ticketMedio") return "number";
  return "currency";
}

export function formatValue(
  v: number, format: KpiFormat, measure: KpiMeasureId, decimals?: number,
): string {
  if (!isFinite(v)) return "—";
  const f = format === "auto" ? inferFormat(measure) : format;
  if (f === "currency") return formatBRL(v, { digits: decimals ?? 0 });
  if (f === "percent") return formatPct(v, decimals ?? 1);
  if (f === "tons") return `${formatNum(v / 1000, decimals ?? 1)} t`;
  if (measure === "ticketMedio") return `${formatNum(v, decimals ?? 1)} kg/cliente`;
  return formatNum(v, decimals ?? 0);
}

export function computeKpiBlock(rows: PricingRow[], block: KpiBlock): string {
  if (block.source === "manual") return block.manualValue ?? "—";
  const measure = block.measure ?? "rol";
  const filtered = periodFilter(
    applyFilters(rows, block.filters ?? {}, null),
    block.periodMode ?? "all",
    block.periodValue,
  );
  const agg = aggregateKpi(filtered);
  return formatValue(pickMeasure(agg, measure), block.format ?? "auto", measure);
}

// ---------------------------------------------------------------------------
// Séries para Chart/TopSku
// ---------------------------------------------------------------------------
export function computeChartSeries(
  rows: PricingRow[],
  filters: Filters,
  measure: KpiMeasureId,
  breakdown: string | null,
  xDim?: string | null,
): { periodos: { key: string; label: string }[]; series: { name: string; values: number[] }[] } {
  const filtered = applyFilters(rows, filters, null);

  // Part B.1 / C3 — When xDim is set and not "period", group X axis by dimension.
  if (xDim && xDim !== "period") {
    const xMap = new Map<string, { ord: number }>();
    const seriesMap = new Map<string, Map<string, KpiAgg>>();
    let ord = 0;
    for (const r of filtered) {
      const xKey = dimValue(r, xDim);
      if (!xMap.has(xKey)) xMap.set(xKey, { ord: ord++ });
      const seriesName = breakdown
        ? dimValue(r, breakdown)
        : "Total";
      let pm = seriesMap.get(seriesName);
      if (!pm) { pm = new Map(); seriesMap.set(seriesName, pm); }
      let a = pm.get(xKey);
      if (!a) { a = emptyKpiAgg(); pm.set(xKey, a); }
      addToKpiAgg(a, r);
    }
    const xs = Array.from(xMap.entries())
      .sort((a, b) => a[1].ord - b[1].ord)
      .map(([k]) => ({ key: k, label: k }));
    const series = Array.from(seriesMap.entries()).map(([name, pm]) => ({
      name,
      values: xs.map((p) => {
        const a = pm.get(p.key);
        return a ? pickMeasure(a, measure) : 0;
      }),
    }));
    return { periodos: xs, series };
  }

  // group by periodo + breakdown
  const periodoMap = new Map<string, { mes: number; ano: number }>();
  const seriesMap = new Map<string, Map<string, KpiAgg>>(); // seriesName → periodo → agg

  for (const r of filtered) {
    if (!periodoMap.has(r.periodo)) periodoMap.set(r.periodo, { mes: r.mes, ano: r.ano });
    const seriesName = breakdown
      ? dimValue(r, breakdown)
      : "Total";
    let pm = seriesMap.get(seriesName);
    if (!pm) { pm = new Map(); seriesMap.set(seriesName, pm); }
    let a = pm.get(r.periodo);
    if (!a) { a = emptyKpiAgg(); pm.set(r.periodo, a); }
    addToKpiAgg(a, r);
  }

  const periodos = Array.from(periodoMap.entries())
    .map(([key, v]) => ({ key, label: monthLabel(v.mes, v.ano), mes: v.mes, ano: v.ano }))
    .sort((a, b) => a.ano - b.ano || a.mes - b.mes);

  const series = Array.from(seriesMap.entries()).map(([name, pm]) => ({
    name,
    values: periodos.map((p) => {
      const a = pm.get(p.key);
      return a ? pickMeasure(a, measure) : 0;
    }),
  }));

  return { periodos: periodos.map((p) => ({ key: p.key, label: p.label })), series };
}

export function computeTopRanking(
  rows: PricingRow[],
  filters: Filters,
  dim: string,
  measure: KpiMeasureId,
  topN: number,
  periodMode: KpiPeriodMode,
  periodValue?: string | null,
): { name: string; value: number; share: number }[] {
  const filtered = periodFilter(applyFilters(rows, filters, null), periodMode, periodValue);
  const map = new Map<string, KpiAgg>();
  for (const r of filtered) {
    const k = dimValue(r, dim);
    let a = map.get(k);
    if (!a) { a = emptyKpiAgg(); map.set(k, a); }
    addToKpiAgg(a, r);
  }
  const entries = Array.from(map.entries()).map(([name, agg]) => ({
    name, value: pickMeasure(agg, measure),
  }));
  entries.sort((a, b) => b.value - a.value);
  const top = entries.slice(0, topN);
  const total = entries.reduce((s, e) => s + e.value, 0);
  return top.map((e) => ({ ...e, share: total !== 0 ? e.value / total : 0 }));
}
