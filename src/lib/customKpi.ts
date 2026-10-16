// Cálculo dinâmico de KPIs e séries para os blocos do Slide Personalizado.
// Reutiliza filtros e dados do store sem trazer regras novas de negócio.

import type { PricingRow, Filters } from "./types";
import { applyFilters } from "./analytics";
import { clienteId } from "./farol";
import type { KpiBlock, KpiMeasureId, KpiPeriodMode, KpiFormat } from "./customSlide";
import { formatBRL, formatNum, formatNumFit, formatPct, monthLabel } from "./format";
import { detectVolumeUnit } from "./volumeUnit";
import { POSITIVACAO_DIMS } from "./positivacao";
import { resolvePeriodValue, type PeriodSelectionMode, type RelativePeriodPreset } from "./relativePeriods";

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
  /** 1000 quando a base traz o volume em toneladas e `volume` já foi convertido para kg. */
  volumeScale: number;
}

/**
 * `volumeMultiplier`: 1 quando a coluna de volume da base já está em Kg;
 * 1000 quando ela vem em toneladas (ver `volumeScaleFor`). A multiplicação
 * acontece aqui, uma única vez, antes de qualquer medida (Volume, Ticket
 * Médio, Preço Médio) usar o total agregado — `agg.volume` é sempre kg reais.
 */
export function aggregateKpi(rows: PricingRow[], volumeMultiplier = 1): KpiAgg {
  const acc = emptyKpiAgg();
  acc.volumeScale = volumeMultiplier;
  for (const r of rows) {
    addToKpiAgg(acc, r, volumeMultiplier);
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
    volumeScale: 1,
  };
}

function addToKpiAgg(acc: KpiAgg, r: PricingRow, volumeMultiplier = 1) {
  const volumeKg = (r.volumeKg ?? 0) * volumeMultiplier;
  acc.rol += r.rol;
  acc.volume += volumeKg;
  acc.cm += r.contribMarginal;
  acc.mb += r.margemBruta;
  acc.cv += r.custoVariavel;
  acc.frete += r.frete;
  acc.comissao += r.comissao;
  if (volumeKg > 0 || (r.rol ?? 0) > 0) {
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
    // Bases em toneladas vêm com o R$ em milhares ("1.000 BRL"): ROL/volume
    // nas unidades originais já é R$/kg. Por isso o volume convertido volta à
    // escala da base aqui — o preço não muda com a conversão do volume.
    case "precoMedio": return agg.volume > 0 ? agg.rol / (agg.volume / agg.volumeScale) : 0;
    case "positivacao": return agg.clientesPositivados.size;
    case "ticketMedio": return agg.clientesPositivados.size > 0 ? agg.volume / agg.clientesPositivados.size : 0;
  }
}

const scaleCache = new WeakMap<object, number>();

/**
 * Fator que leva o volume da base a kg: 1000 quando ela parece vir em
 * toneladas (export do SAP em "1.000 KG"), 1 caso contrário. Calculado sobre a
 * base inteira — nunca sobre um recorte filtrado, que mudaria de opinião a
 * cada filtro — e guardado por array.
 */
export function volumeScaleFor(rows: ReadonlyArray<{ volumeKg?: number }>): number {
  const cached = scaleCache.get(rows);
  if (cached !== undefined) return cached;
  const scale = detectVolumeUnit(rows).guess === "ton" ? 1000 : 1;
  scaleCache.set(rows, scale);
  return scale;
}

export type VolumeDisplay = "kg" | "ton";
const VOLUME_FAMILY: readonly KpiMeasureId[] = ["volume", "ticketMedio", "precoMedio"];

export function isVolumeMeasure(measure: KpiMeasureId): boolean {
  return VOLUME_FAMILY.includes(measure);
}

/** Unidade em que o cartão mostra o volume (a escolha da pessoa, ou o padrão da medida). */
export function volumeDisplayOf(block: Pick<KpiBlock, "volumeDisplay" | "format" | "measure">): VolumeDisplay {
  if (block.volumeDisplay) return block.volumeDisplay;
  if (block.format === "tons") return "ton";
  return (block.measure ?? "rol") === "volume" ? "ton" : "kg";
}

/** Toneladas com 2 dígitos significativos: 354 kg → "0,35 t", 5,9 kg → "0,0059 t". */
function formatTons(tons: number, decimals?: number): string {
  if (decimals !== undefined) return formatNumFit(tons, decimals);
  const abs = Math.abs(tons);
  if (abs === 0) return "0";
  const auto = abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : Math.min(5, 1 - Math.floor(Math.log10(abs)));
  return formatNumFit(tons, auto);
}

/** `v` chega em kg (ou R$/kg no preço); o texto sai na unidade escolhida. */
export function formatVolumeMeasure(
  v: number, measure: KpiMeasureId, display: VolumeDisplay, decimals?: number,
): string {
  if (!isFinite(v)) return "—";
  const ton = display === "ton";
  switch (measure) {
    case "volume":
      return ton ? `${formatTons(v / 1000, decimals)} t` : `${formatNumFit(v, decimals ?? 0)} kg`;
    case "ticketMedio":
      return ton ? `${formatTons(v / 1000, decimals)} t/cliente` : `${formatNumFit(v, decimals ?? 1)} kg/cliente`;
    case "precoMedio":
      return ton ? `${formatBRL(v * 1000, { digits: decimals ?? 2 })}/t` : `${formatBRL(v, { digits: decimals ?? 2 })}/kg`;
    default:
      return formatNum(v, decimals ?? 0);
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
  if (f === "tons") return `${formatNumFit(v / 1000, decimals ?? 1)} t${measure === "ticketMedio" ? "/cliente" : ""}`;
  if (measure === "ticketMedio") return `${formatNumFit(v, decimals ?? 1)} kg/cliente`;
  return formatNum(v, decimals ?? 0);
}

/**
 * `volumeScale`: passe o fator da base INTEIRA (`volumeScaleFor(baseRows)`)
 * quando `rows` já é um recorte; sem ele, é calculado sobre `rows`.
 */
export function computeKpiBlock(rows: PricingRow[], block: KpiBlock, volumeScale?: number): string {
  if (block.source === "manual") return block.manualValue ?? "—";
  const measure = block.measure ?? "rol";
  const mode = block.periodMode ?? "all";
  const value = resolvePeriodValue(rows, mode, block.periodValue, block.periodSelectionMode, block.relativePeriod);
  const filtered = periodFilter(
    applyFilters(rows, block.filters ?? {}, null),
    mode,
    value,
  );
  const agg = aggregateKpi(filtered, volumeScale ?? volumeScaleFor(rows));
  const measured = pickMeasure(agg, measure);
  if (isVolumeMeasure(measure)) return formatVolumeMeasure(measured, measure, volumeDisplayOf({ ...block, measure }));
  return formatValue(measured, block.format ?? "auto", measure);
}

// ---------------------------------------------------------------------------
// Comparação do KPI (vs mês anterior / ano anterior / Budget)
// ---------------------------------------------------------------------------

export type KpiCompareMode = "none" | "prevMonth" | "prevYear" | "budget";

export interface KpiComparison {
  mode: Exclude<KpiCompareMode, "none">;
  /** Variação relativa (0.052 = +5,2%) ou, em medidas de %, pontos percentuais. */
  delta: number;
  pp: boolean;
  direction: "up" | "down" | "flat";
  /** true = melhorou, false = piorou, null = estável. */
  good: boolean | null;
  /** O período (ou "Budget") contra o qual se comparou. */
  referenceLabel: string;
}

/** Medidas de custo: cair é bom. */
const LOWER_IS_BETTER: readonly KpiMeasureId[] = ["cv", "frete", "comissao"];
/** O que a base Budget não tem (custos detalhados, clientes). */
const NOT_IN_BUDGET: readonly KpiMeasureId[] = ["mb", "mbPct", "frete", "comissao", "positivacao", "ticketMedio"];

function referencePeriod(
  rows: readonly PricingRow[],
  periodMode: "month" | "fy",
  current: string,
  mode: "prevMonth" | "prevYear",
): { value: string; label: string } | null {
  if (periodMode === "fy") {
    if (mode !== "prevYear") return null;
    const m = current.match(/(\d{2})\/(\d{2})/);
    if (!m) return null;
    const pad = (n: number) => String(n).padStart(2, "0");
    const value = current.replace(m[0], `${pad(Number(m[1]) - 1)}/${pad(Number(m[2]) - 1)}`);
    return rows.some((r) => r.fy === value) ? { value, label: value } : null;
  }
  const cur = rows.find((r) => r.periodo === current);
  if (!cur) return null;
  let mes = cur.mes;
  let ano = cur.ano;
  if (mode === "prevMonth") {
    mes -= 1;
    if (mes === 0) { mes = 12; ano -= 1; }
  } else {
    ano -= 1;
  }
  const ref = rows.find((r) => r.mes === mes && r.ano === ano);
  return ref ? { value: ref.periodo, label: monthLabel(mes, ano) } : null;
}

/** Null quando a comparação não se aplica (sem período, sem dado de
 *  referência, medida que o Budget não tem…) — o card simplesmente não
 *  mostra a linha de comparação. */
export function computeKpiComparison(
  rows: PricingRow[],
  block: KpiBlock,
  budgetRows?: PricingRow[],
  volumeScale?: number,
): KpiComparison | null {
  const mode = block.compare ?? "none";
  if (block.source !== "dynamic" || mode === "none") return null;
  const periodMode = block.periodMode ?? "all";
  if (periodMode === "all") return null;
  const measure = block.measure ?? "rol";
  const current = resolvePeriodValue(rows, periodMode, block.periodValue, block.periodSelectionMode, block.relativePeriod);
  if (!current) return null;

  const filtered = applyFilters(rows, block.filters ?? {}, null);
  let refRows: PricingRow[];
  let referenceLabel: string;
  if (mode === "budget") {
    if (!budgetRows?.length || NOT_IN_BUDGET.includes(measure)) return null;
    refRows = periodFilter(applyFilters(budgetRows, block.filters ?? {}, null), periodMode, current);
    referenceLabel = "Budget";
  } else {
    const ref = referencePeriod(rows, periodMode, current, mode);
    if (!ref) return null;
    refRows = periodFilter(filtered, periodMode, ref.value);
    referenceLabel = ref.label;
  }
  if (refRows.length === 0) return null;

  // O Budget é outra base: tem a própria unidade de volume.
  const nowScale = volumeScale ?? volumeScaleFor(rows);
  const refScale = mode === "budget" && budgetRows ? volumeScaleFor(budgetRows) : nowScale;
  const now = pickMeasure(aggregateKpi(periodFilter(filtered, periodMode, current), nowScale), measure);
  const before = pickMeasure(aggregateKpi(refRows, refScale), measure);
  const pp = measure === "cmPct" || measure === "mbPct";
  const delta = pp ? now - before : before !== 0 ? (now - before) / Math.abs(before) : NaN;
  if (!Number.isFinite(delta)) return null;
  const direction = Math.abs(delta) < 0.0005 ? "flat" : delta > 0 ? "up" : "down";
  const lowerIsBetter = (block.compareGoodWhen ?? (LOWER_IS_BETTER.includes(measure) ? "down" : "up")) === "down";
  return {
    mode,
    delta,
    pp,
    direction,
    good: direction === "flat" ? null : (direction === "up") !== lowerIsBetter,
    referenceLabel,
  };
}

/** "+5,2%" ou "−1,3 p.p." */
export function formatKpiDelta(c: Pick<KpiComparison, "delta" | "pp">): string {
  const sign = c.delta > 0 ? "+" : c.delta < 0 ? "−" : "";
  const abs = Math.abs(c.delta) * 100;
  const n = abs.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return c.pp ? `${sign}${n} p.p.` : `${sign}${n}%`;
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
  periodSelectionMode?: PeriodSelectionMode,
  relativePeriod?: RelativePeriodPreset,
): { name: string; value: number; share: number }[] {
  const resolvedPeriodValue = resolvePeriodValue(rows, periodMode, periodValue, periodSelectionMode, relativePeriod);
  const filtered = periodFilter(applyFilters(rows, filters, null), periodMode, resolvedPeriodValue);
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
