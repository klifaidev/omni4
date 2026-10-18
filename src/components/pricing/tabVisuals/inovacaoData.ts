// Dados dos visuais da aba Inovação, usados pela aba e pelo slide.
//
// `filtered` = linhas com filtros e meses aplicados; `allRows` = a base
// inteira (no slide, a do deck, até o mês de referência) — a maturação usa a
// primeira venda de cada SKU, os heróis/ofensores comparam com o período
// anterior e o mix por canal olha os últimos 13 meses.
import { applyFilters, computeKPIs, getKpiComparisonContext, measureOf, type KPI } from "@/lib/analytics";
import type { Filters, Metric, PricingRow } from "@/lib/types";

export const INOV_PALETTE = [
  "hsl(var(--primary))",
  "hsl(var(--muted-foreground))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "hsl(var(--accent))",
];

export function isInnovationRow(row: PricingRow): boolean {
  return /inova/i.test(row.inovacao ?? "");
}

function linRegSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const xs = values.map((_, i) => i);
  const mx = xs.reduce((sum, value) => sum + value, 0) / n;
  const my = values.reduce((sum, value) => sum + value, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (xs[i] - mx) * (values[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

function classifyTrend(slope: number): "Crescendo" | "Estável" | "Deteriorando" {
  if (slope > 0.2) return "Crescendo";
  if (slope < -0.2) return "Deteriorando";
  return "Estável";
}

function monthLabel(row: PricingRow): string {
  return `${String(row.mes).padStart(2, "0")}/${String(row.ano).slice(-2)}`;
}

export function formatPp(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}pp`;
}

function parseLaunchYear(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const match = String(value).match(/\d{4}/);
  if (!match) return null;
  const year = Number(match[0]);
  return Number.isFinite(year) && year >= 2000 && year <= 2099 ? year : null;
}

export interface InnovationBase {
  innovationRows: PricingRow[];
  regularRows: PricingRow[];
  totalKpis: KPI;
  innovationKpis: KPI;
  regularKpis: KPI;
}

export function computeInnovationBase(filtered: PricingRow[], metric: Metric): InnovationBase {
  const innovationRows = filtered.filter(isInnovationRow);
  const regularRows = filtered.filter((row) => !isInnovationRow(row));
  return {
    innovationRows,
    regularRows,
    totalKpis: computeKPIs(filtered, metric),
    innovationKpis: computeKPIs(innovationRows, metric),
    regularKpis: computeKPIs(regularRows, metric),
  };
}

// ---- Participação mensal de volume ----
export interface InnovationMixPoint {
  periodo: string;
  label: string;
  innovationVolumeKg: number;
  regularVolumeKg: number;
  innovation: number;
  regular: number;
}

export interface InnovationMixData {
  monthlyMix: InnovationMixPoint[];
  trend: { label: "Crescendo" | "Estável" | "Deteriorando"; first: number; last: number; deltaPp: number; months: number };
}

export function computeInnovationMix(filtered: PricingRow[]): InnovationMixData {
  const byPeriod = new Map<string, { label: string; ano: number; mes: number; innovationVolumeKg: number; regularVolumeKg: number }>();
  for (const row of filtered) {
    const current = byPeriod.get(row.periodo) ?? {
      label: monthLabel(row), ano: row.ano, mes: row.mes, innovationVolumeKg: 0, regularVolumeKg: 0,
    };
    if (isInnovationRow(row)) current.innovationVolumeKg += row.volumeKg;
    else current.regularVolumeKg += row.volumeKg;
    byPeriod.set(row.periodo, current);
  }
  const monthlyMix = Array.from(byPeriod.entries())
    .sort(([, a], [, b]) => a.ano - b.ano || a.mes - b.mes)
    .map(([periodo, value]) => {
      const totalVolume = value.innovationVolumeKg + value.regularVolumeKg;
      return {
        periodo,
        label: value.label,
        innovationVolumeKg: value.innovationVolumeKg,
        regularVolumeKg: value.regularVolumeKg,
        innovation: totalVolume > 0 ? (value.innovationVolumeKg / totalVolume) * 100 : 0,
        regular: totalVolume > 0 ? (value.regularVolumeKg / totalVolume) * 100 : 0,
      };
    });
  const points = monthlyMix.filter((point) => Number.isFinite(point.innovation));
  const slope = linRegSlope(points.map((point) => point.innovation));
  const first = points[0]?.innovation ?? 0;
  const last = points[points.length - 1]?.innovation ?? 0;
  return {
    monthlyMix,
    trend: { label: classifyTrend(slope), first, last, deltaPp: last - first, months: points.length },
  };
}

// ---- Margem Inovação vs Regular ----
export interface MarginBridgeStep {
  label: string;
  value: number;
  start: number;
  end: number;
  total: boolean;
  color: string;
}

export interface InnovationMarginData {
  metric: Metric;
  innovationMarginPct: number;
  regularMarginPct: number;
  totalMarginPct: number;
  innovationRolShare: number;
  marginDiffPp: number;
  innovationMixEffectPp: number;
  steps: MarginBridgeStep[];
}

export function computeInnovationMargin(base: InnovationBase, metric: Metric): InnovationMarginData {
  const { innovationKpis, regularKpis, totalKpis } = base;
  const marginDiffPp = (innovationKpis.margemPct - regularKpis.margemPct) * 100;
  const innovationRolShare = totalKpis.rol > 0 ? innovationKpis.rol / totalKpis.rol : 0;
  const innovationMixEffectPp = innovationRolShare * marginDiffPp;
  return {
    metric,
    innovationMarginPct: innovationKpis.margemPct,
    regularMarginPct: regularKpis.margemPct,
    totalMarginPct: totalKpis.margemPct,
    innovationRolShare,
    marginDiffPp,
    innovationMixEffectPp,
    steps: [
      { label: "Regular", value: regularKpis.margemPct * 100, start: 0, end: regularKpis.margemPct * 100, total: true, color: "hsl(var(--muted-foreground))" },
      {
        label: "Efeito mix inovação",
        value: innovationMixEffectPp,
        start: regularKpis.margemPct * 100,
        end: regularKpis.margemPct * 100 + innovationMixEffectPp,
        total: false,
        color: innovationMixEffectPp >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))",
      },
      { label: "Total", value: totalKpis.margemPct * 100, start: 0, end: totalKpis.margemPct * 100, total: true, color: "hsl(var(--primary))" },
    ],
  };
}

// ---- Curva de maturação por safra ----
export interface CohortPoint {
  monthIndex: number;
  label: string;
  [safra: string]: number | string;
}

export interface MaturityData {
  cohorts: { safra: string; total: number; months: number; byMonth: Map<number, number> }[];
  data: CohortPoint[];
}

export type InnovationMap = Record<string, { classificacao?: string; anoLancamento?: unknown } | undefined>;

export function computeMaturity(allRows: PricingRow[], filtered: PricingRow[], innovationMap: InnovationMap): MaturityData {
  const firstSeenBySku = new Map<string, { ano: number; mes: number }>();
  const launchMonthBySku = new Map<string, { ano: number; mes: number; safra: string }>();

  for (const row of allRows) {
    const sku = row.sku?.trim();
    if (!sku) continue;
    const current = firstSeenBySku.get(sku);
    if (!current || row.ano < current.ano || (row.ano === current.ano && row.mes < current.mes)) {
      firstSeenBySku.set(sku, { ano: row.ano, mes: row.mes });
    }
  }

  for (const row of allRows) {
    const sku = row.sku?.trim();
    if (!sku) continue;
    const entry = innovationMap[sku];
    if (!entry || !/inova/i.test(entry.classificacao ?? "")) continue;
    const launchYear = parseLaunchYear(entry.anoLancamento);
    if (!launchYear) continue;
    if (row.ano !== launchYear) continue;
    const current = launchMonthBySku.get(sku);
    if (!current || row.mes < current.mes) {
      launchMonthBySku.set(sku, { ano: launchYear, mes: row.mes, safra: String(launchYear) });
    }
  }

  for (const [sku, firstSeen] of firstSeenBySku.entries()) {
    if (launchMonthBySku.has(sku)) continue;
    const entry = innovationMap[sku];
    if (!entry || !/inova/i.test(entry.classificacao ?? "")) continue;
    const launchYear = parseLaunchYear(entry.anoLancamento);
    if (!launchYear) continue;
    launchMonthBySku.set(sku, { ano: firstSeen.ano, mes: firstSeen.mes, safra: String(launchYear) });
  }

  const acc = new Map<string, Map<number, number>>();
  for (const row of filtered) {
    const sku = row.sku?.trim();
    if (!sku) continue;
    const launch = launchMonthBySku.get(sku);
    if (!launch) continue;
    const monthIndex = (row.ano - launch.ano) * 12 + (row.mes - launch.mes) + 1;
    if (monthIndex < 1 || monthIndex > 36) continue;
    const byMonth = acc.get(launch.safra) ?? new Map<number, number>();
    byMonth.set(monthIndex, (byMonth.get(monthIndex) ?? 0) + row.volumeKg);
    acc.set(launch.safra, byMonth);
  }

  const cohorts = Array.from(acc.entries())
    .map(([safra, byMonth]) => ({
      safra,
      total: Array.from(byMonth.values()).reduce((sum, value) => sum + value, 0),
      months: byMonth.size,
      byMonth,
    }))
    .filter((cohort) => cohort.total > 0)
    .sort((a, b) => Number(b.safra) - Number(a.safra) || b.total - a.total)
    .slice(0, 4);

  const maxMonth = Math.max(0, ...cohorts.flatMap((cohort) => Array.from(cohort.byMonth.keys())));
  const data: CohortPoint[] = Array.from({ length: maxMonth }, (_, index) => {
    const monthIndex = index + 1;
    const point: CohortPoint = { monthIndex, label: `M+${monthIndex}` };
    for (const cohort of cohorts) {
      if (cohort.byMonth.has(monthIndex)) point[cohort.safra] = cohort.byMonth.get(monthIndex)! / 1000;
    }
    return point;
  });

  return { cohorts, data };
}

// ---- Heróis e ofensores de inovação ----
export interface HeroVillainRow {
  sku: string;
  label: string;
  volumeKg: number;
  volumeDeltaKg: number;
  margemPct: number;
  margemDeltaPp: number;
  rol: number;
}

export interface InnovationHeroesData {
  heroes: HeroVillainRow[];
  offenders: HeroVillainRow[];
  comparisonLabel: string;
}

export function computeInnovationHeroes(
  allRows: PricingRow[],
  filters: Filters,
  selected: string[] | null,
  base: InnovationBase,
  metric: Metric,
): InnovationHeroesData {
  const prevCtx = getKpiComparisonContext(allRows, filters, selected);
  const previousInnovationRows = prevCtx ? prevCtx.previousRows.filter(isInnovationRow) : [];
  const previousBySku = new Map<string, { volumeKg: number; margem: number; rol: number }>();
  for (const row of previousInnovationRows) {
    const key = row.sku || row.skuDesc || "—";
    const current = previousBySku.get(key) ?? { volumeKg: 0, margem: 0, rol: 0 };
    current.volumeKg += row.volumeKg;
    current.margem += measureOf(row, metric);
    current.rol += row.rol;
    previousBySku.set(key, current);
  }

  const currentBySku = new Map<string, HeroVillainRow>();
  for (const row of base.innovationRows) {
    const key = row.sku || row.skuDesc || "—";
    const current = currentBySku.get(key) ?? {
      sku: key, label: row.skuDesc || row.sku || "—", volumeKg: 0, volumeDeltaKg: 0, margemPct: 0, margemDeltaPp: 0, rol: 0,
    };
    current.volumeKg += row.volumeKg;
    current.rol += row.rol;
    current.margemPct += measureOf(row, metric);
    currentBySku.set(key, current);
  }

  const rowsBySku = Array.from(currentBySku.values()).map((item) => {
    const prev = previousBySku.get(item.sku);
    const currentMarginPct = item.rol > 0 ? item.margemPct / item.rol : 0;
    const prevMarginPct = prev && prev.rol > 0 ? prev.margem / prev.rol : 0;
    return {
      ...item,
      margemPct: currentMarginPct,
      margemDeltaPp: currentMarginPct - prevMarginPct,
      volumeDeltaKg: item.volumeKg - (prev?.volumeKg ?? 0),
    };
  });

  const minVolumeKg = Math.max(1, base.innovationKpis.volumeKg * 0.005);
  const eligible = rowsBySku.filter((item) => item.volumeKg >= minVolumeKg || Math.abs(item.volumeDeltaKg) >= minVolumeKg);
  return {
    heroes: [...eligible]
      .filter((item) => item.volumeDeltaKg > 0 || item.margemDeltaPp > 0)
      .sort((a, b) => (b.volumeDeltaKg - a.volumeDeltaKg) || (b.margemDeltaPp - a.margemDeltaPp))
      .slice(0, 5),
    offenders: [...eligible]
      .filter((item) => item.volumeDeltaKg < 0 || item.margemDeltaPp < 0)
      .sort((a, b) => (a.volumeDeltaKg - b.volumeDeltaKg) || (a.margemDeltaPp - b.margemDeltaPp))
      .slice(0, 5),
    comparisonLabel: prevCtx?.label ?? "sem período anterior comparável",
  };
}

// ---- Preço médio Inovação vs Regular ----
export interface InnovationPriceData {
  innovationPrice: number;
  regularPrice: number;
  delta: number;
  deltaPct: number;
  monthly: { periodo: string; label: string; innovationPrice: number | null; regularPrice: number | null }[];
}

export function computeInnovationPrice(filtered: PricingRow[], base: InnovationBase): InnovationPriceData {
  const { innovationKpis, regularKpis } = base;
  const innovationPrice = innovationKpis.volumeKg > 0 ? innovationKpis.rol / innovationKpis.volumeKg : 0;
  const regularPrice = regularKpis.volumeKg > 0 ? regularKpis.rol / regularKpis.volumeKg : 0;
  const delta = innovationPrice - regularPrice;
  const deltaPct = regularPrice > 0 ? delta / regularPrice : 0;
  const byPeriod = new Map<string, {
    label: string; ano: number; mes: number;
    innovationRol: number; innovationVolumeKg: number; regularRol: number; regularVolumeKg: number;
  }>();
  for (const row of filtered) {
    const current = byPeriod.get(row.periodo) ?? {
      label: monthLabel(row), ano: row.ano, mes: row.mes,
      innovationRol: 0, innovationVolumeKg: 0, regularRol: 0, regularVolumeKg: 0,
    };
    if (isInnovationRow(row)) { current.innovationRol += row.rol; current.innovationVolumeKg += row.volumeKg; }
    else { current.regularRol += row.rol; current.regularVolumeKg += row.volumeKg; }
    byPeriod.set(row.periodo, current);
  }
  const monthly = Array.from(byPeriod.entries())
    .sort(([, a], [, b]) => a.ano - b.ano || a.mes - b.mes)
    .map(([periodo, value]) => ({
      periodo,
      label: value.label,
      innovationPrice: value.innovationVolumeKg > 0 ? value.innovationRol / value.innovationVolumeKg : null,
      regularPrice: value.regularVolumeKg > 0 ? value.regularRol / value.regularVolumeKg : null,
    }));
  return { innovationPrice, regularPrice, delta, deltaPct, monthly };
}

// ---- Mix de inovação por canal ----
export interface ChannelMixRow {
  canal: string;
  innovationVolumeKg: number;
  regularVolumeKg: number;
  innovationPenetration: number;
  regularPenetration: number;
  innovationMix: number;
}

export function computeChannelMix(filtered: PricingRow[], innovationVolumeKg: number): ChannelMixRow[] {
  const map = new Map<string, { innovationVolumeKg: number; regularVolumeKg: number }>();
  for (const row of filtered) {
    const canal = row.canalAjustado || row.canal || "Sem canal";
    const current = map.get(canal) ?? { innovationVolumeKg: 0, regularVolumeKg: 0 };
    if (isInnovationRow(row)) current.innovationVolumeKg += row.volumeKg;
    else current.regularVolumeKg += row.volumeKg;
    map.set(canal, current);
  }
  return Array.from(map.entries())
    .map(([canal, value]) => {
      const total = value.innovationVolumeKg + value.regularVolumeKg;
      return {
        canal,
        innovationVolumeKg: value.innovationVolumeKg,
        regularVolumeKg: value.regularVolumeKg,
        innovationPenetration: total > 0 ? value.innovationVolumeKg / total : 0,
        regularPenetration: total > 0 ? value.regularVolumeKg / total : 0,
        innovationMix: innovationVolumeKg > 0 ? value.innovationVolumeKg / innovationVolumeKg : 0,
      };
    })
    .filter((item) => item.innovationVolumeKg > 0 || item.regularVolumeKg > 0)
    .sort((a, b) => b.innovationVolumeKg - a.innovationVolumeKg)
    .slice(0, 8);
}

export interface ChannelMixMonthlyData {
  canais: string[];
  data: Record<string, unknown>[];
}

/** Penetração da inovação por canal nos últimos 13 meses (histórico, não o
 *  mês escolhido — "últimos 13 meses" não faria sentido com 1 mês filtrado). */
export function computeChannelMixMonthly(allRows: PricingRow[], filters: Filters, channelMix: ChannelMixRow[]): ChannelMixMonthlyData {
  const history = applyFilters(allRows, filters, null);
  const topCanais = channelMix.map((c) => c.canal);
  if (topCanais.length === 0) return { canais: [], data: [] };
  const topSet = new Set(topCanais);
  const byPeriod = new Map<string, {
    label: string; ano: number; mes: number;
    byCanal: Map<string, { innovationVolumeKg: number; regularVolumeKg: number }>;
  }>();
  for (const row of history) {
    const canal = row.canalAjustado || row.canal || "Sem canal";
    if (!topSet.has(canal)) continue;
    const period = byPeriod.get(row.periodo) ?? { label: monthLabel(row), ano: row.ano, mes: row.mes, byCanal: new Map() };
    const current = period.byCanal.get(canal) ?? { innovationVolumeKg: 0, regularVolumeKg: 0 };
    if (isInnovationRow(row)) current.innovationVolumeKg += row.volumeKg;
    else current.regularVolumeKg += row.volumeKg;
    period.byCanal.set(canal, current);
    byPeriod.set(row.periodo, period);
  }
  const data = Array.from(byPeriod.entries())
    .sort(([, a], [, b]) => a.ano - b.ano || a.mes - b.mes)
    .slice(-13)
    .map(([periodo, value]) => {
      const point: Record<string, unknown> = { periodo, label: value.label };
      for (const canal of topCanais) {
        const c = value.byCanal.get(canal);
        const total = c ? c.innovationVolumeKg + c.regularVolumeKg : 0;
        point[canal] = total > 0 && c ? c.innovationVolumeKg / total : null;
      }
      return point;
    });
  return { canais: topCanais, data };
}
