import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { DataTable, type DataTableColumn } from "@/components/pricing/DataTable";
import { EmptyState } from "@/components/pricing/EmptyState";
import { SendToSlideHover } from "@/components/pricing/SendToSlideHover";
import { Badge } from "@/components/ui/badge";
import { applyFilters, computeKPIs, getKpiComparisonContext, measureOf } from "@/lib/analytics";
import { formatBRL, formatNum, formatPct, formatTon } from "@/lib/format";
import type { PricingRow } from "@/lib/types";
import { usePageTitle } from "@/hooks/use-page-title";
import { useInovacaoDepara } from "@/store/inovacaoDepara";
import { usePricing } from "@/store/pricing";
import { Lightbulb, PackageCheck, Percent, Scale, Sparkles } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface InnovationSummaryRow extends Record<string, unknown> {
  classificacao: string;
  rol: number;
  volumeKg: number;
  margemPct: number;
  skus: number;
  mixRol: number;
  mixVolume: number;
}

interface InnovationMixPoint {
  periodo: string;
  label: string;
  innovationVolumeKg: number;
  regularVolumeKg: number;
  innovation: number;
  regular: number;
}

interface MarginBridgeStep {
  label: string;
  value: number;
  start: number;
  end: number;
  total: boolean;
  color: string;
}

interface CohortPoint {
  monthIndex: number;
  label: string;
  [safra: string]: number | string;
}

interface LegacyPairPoint {
  periodo: string;
  label: string;
  innovationTon: number;
  legacyTon: number;
}

interface LegacyPairAnalysis {
  legado: string;
  launchLabel: string;
  innovationVolumeKg: number;
  substitutionKg: number;
  incrementalKg: number;
  substitutionPct: number;
  incrementalPct: number;
  legacyBeforeAvgKg: number;
  legacyAfterAvgKg: number;
  hasLegacyRows: boolean;
  classification: "Substituição" | "Incremental" | "Misto";
  series: LegacyPairPoint[];
}

interface HeroVillainRow {
  sku: string;
  label: string;
  volumeKg: number;
  volumeDeltaKg: number;
  margemPct: number;
  margemDeltaPp: number;
  rol: number;
}

interface ChannelMixRow {
  canal: string;
  innovationVolumeKg: number;
  regularVolumeKg: number;
  innovationPenetration: number;
  regularPenetration: number;
  innovationMix: number;
}

const PALETTE = [
  "hsl(var(--primary))",
  "hsl(var(--muted-foreground))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "hsl(var(--accent))",
];

function isInnovationRow(row: PricingRow): boolean {
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

function periodRankFromParts(ano: number, mes: number): number {
  return ano * 12 + mes;
}

function formatPp(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}pp`;
}

function parseLaunchYear(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const match = String(value).match(/\d{4}/);
  if (!match) return null;
  const year = Number(match[0]);
  return Number.isFinite(year) && year >= 2000 && year <= 2099 ? year : null;
}

function KpiTile({
  label,
  value,
  helper,
  icon,
  tone = "primary",
}: {
  label: string;
  value: string;
  helper: string;
  icon: ReactNode;
  tone?: "primary" | "success" | "warning" | "destructive";
}) {
  const toneClass = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    destructive: "bg-destructive/10 text-destructive",
  }[tone];

  return (
    <GlassCard className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneClass}`}>
          {icon}
        </div>
      </div>
    </GlassCard>
  );
}

function MarginBridge({ steps }: { steps: MarginBridgeStep[] }) {
  const values = steps.flatMap((step) => [step.start, step.end, 0]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = Math.max(1, range * 0.16);
  const yMin = min - pad;
  const yMax = max + pad;
  const W = 900;
  const H = 260;
  const padL = 56;
  const padR = 28;
  const padT = 28;
  const padB = 58;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const xStep = innerW / steps.length;
  const barW = xStep * 0.52;
  const yOf = (value: number) => padT + (1 - (value - yMin) / (yMax - yMin || 1)) * innerH;
  const zeroY = yOf(0);
  const ticks = [yMin, yMin + (yMax - yMin) / 2, yMax];

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Bridge de margem de inovação">
        {ticks.map((tick, index) => (
          <g key={index}>
            <line
              x1={padL}
              x2={W - padR}
              y1={yOf(tick)}
              y2={yOf(tick)}
              stroke="hsl(var(--border))"
              strokeOpacity={0.32}
              strokeDasharray={Math.abs(tick) < 0.001 ? "" : "3 4"}
            />
            <text x={padL - 8} y={yOf(tick) + 4} textAnchor="end" fontSize="10" fill="hsl(var(--muted-foreground))">
              {tick.toFixed(1)}%
            </text>
          </g>
        ))}

        {steps.slice(0, -1).map((step, index) => {
          const next = steps[index + 1];
          if (next.total) return null;
          const x1 = padL + index * xStep + xStep / 2 + barW / 2;
          const x2 = padL + (index + 1) * xStep + xStep / 2 - barW / 2;
          return (
            <line
              key={`connector-${step.label}`}
              x1={x1}
              x2={x2}
              y1={yOf(step.end)}
              y2={yOf(next.start)}
              stroke="hsl(var(--muted-foreground))"
              strokeOpacity={0.38}
              strokeDasharray="3 3"
            />
          );
        })}

        {steps.map((step, index) => {
          const x = padL + index * xStep + (xStep - barW) / 2;
          const top = yOf(Math.max(step.start, step.end));
          const height = Math.max(3, Math.abs(yOf(step.end) - yOf(step.start)));
          const rectY = step.total ? Math.min(zeroY, yOf(step.end)) : top;
          const rectH = step.total ? Math.max(3, Math.abs(yOf(step.end) - zeroY)) : height;
          const labelY = H - padB + 20;
          return (
            <g key={step.label}>
              <rect x={x} y={rectY} width={barW} height={rectH} rx={5} fill={step.color} opacity={step.total ? 0.92 : 0.82} />
              <text x={x + barW / 2} y={rectY - 8} textAnchor="middle" fontSize="11" fontWeight={700} fill="hsl(var(--foreground))">
                {step.total ? `${step.end.toFixed(1)}%` : formatPp(step.value)}
              </text>
              <text x={x + barW / 2} y={labelY} textAnchor="middle" fontSize="11" fill="hsl(var(--muted-foreground))">
                {step.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const summaryColumns: DataTableColumn<InnovationSummaryRow>[] = [
  {
    key: "classificacao",
    label: "Grupo",
    sortable: true,
    format: (value) => (
      <Badge variant={String(value) === "Inovação" ? "default" : "outline"}>{String(value)}</Badge>
    ),
  },
  { key: "rol", label: "ROL", align: "right", sortable: true, format: (value) => formatBRL(Number(value), { compact: true }) },
  { key: "volumeKg", label: "Volume", align: "right", sortable: true, format: (value) => formatTon(Number(value) / 1000) },
  { key: "margemPct", label: "Margem %", align: "right", sortable: true, format: (value) => formatPct(Number(value)) },
  { key: "skus", label: "SKUs ativos", align: "right", sortable: true, format: (value) => formatNum(Number(value)) },
  { key: "mixRol", label: "Mix ROL", align: "right", sortable: true, format: (value) => formatPct(Number(value)) },
  { key: "mixVolume", label: "Mix volume", align: "right", sortable: true, format: (value) => formatPct(Number(value)) },
];

export default function Inovacao() {
  usePageTitle("Inovação");
  const rows = usePricing((s) => s.rows);
  const metric = usePricing((s) => s.metric);
  const filters = usePricing((s) => s.filters);
  const selected = usePricing((s) => s.selectedPeriods);
  const innovationMap = useInovacaoDepara((s) => s.map);

  const filtered = useMemo(() => applyFilters(rows, filters, selected), [rows, filters, selected]);
  const innovationRows = useMemo(() => filtered.filter(isInnovationRow), [filtered]);
  const regularRows = useMemo(() => filtered.filter((row) => !isInnovationRow(row)), [filtered]);

  const totalKpis = useMemo(() => computeKPIs(filtered, metric), [filtered, metric]);
  const innovationKpis = useMemo(() => computeKPIs(innovationRows, metric), [innovationRows, metric]);
  const regularKpis = useMemo(() => computeKPIs(regularRows, metric), [regularRows, metric]);

  const summaryRows = useMemo<InnovationSummaryRow[]>(() => {
    const toRow = (classificacao: string, source: typeof innovationKpis): InnovationSummaryRow => ({
      classificacao,
      rol: source.rol,
      volumeKg: source.volumeKg,
      margemPct: source.margemPct,
      skus: source.skus,
      mixRol: totalKpis.rol > 0 ? source.rol / totalKpis.rol : 0,
      mixVolume: totalKpis.volumeKg > 0 ? source.volumeKg / totalKpis.volumeKg : 0,
    });

    return [
      toRow("Inovação", innovationKpis),
      toRow("Regular", regularKpis),
    ].filter((row) => row.rol !== 0 || row.volumeKg !== 0 || row.skus !== 0);
  }, [innovationKpis, regularKpis, totalKpis]);

  const monthlyMix = useMemo<InnovationMixPoint[]>(() => {
    const byPeriod = new Map<string, {
      label: string;
      ano: number;
      mes: number;
      innovationVolumeKg: number;
      regularVolumeKg: number;
    }>();

    for (const row of filtered) {
      const current = byPeriod.get(row.periodo) ?? {
        label: monthLabel(row),
        ano: row.ano,
        mes: row.mes,
        innovationVolumeKg: 0,
        regularVolumeKg: 0,
      };
      if (isInnovationRow(row)) current.innovationVolumeKg += row.volumeKg;
      else current.regularVolumeKg += row.volumeKg;
      byPeriod.set(row.periodo, current);
    }

    return Array.from(byPeriod.entries())
      .sort(([, a], [, b]) => a.ano - b.ano || a.mes - b.mes)
      .map(([periodo, value]) => {
        const totalVolume = value.innovationVolumeKg + value.regularVolumeKg;
        const innovation = totalVolume > 0 ? (value.innovationVolumeKg / totalVolume) * 100 : 0;
        return {
          periodo,
          label: value.label,
          innovationVolumeKg: value.innovationVolumeKg,
          regularVolumeKg: value.regularVolumeKg,
          innovation,
          regular: totalVolume > 0 ? (value.regularVolumeKg / totalVolume) * 100 : 0,
        };
      });
  }, [filtered]);

  const mixTrend = useMemo(() => {
    const points = monthlyMix.filter((point) => Number.isFinite(point.innovation));
    const slope = linRegSlope(points.map((point) => point.innovation));
    const first = points[0]?.innovation ?? 0;
    const last = points[points.length - 1]?.innovation ?? 0;
    return {
      label: classifyTrend(slope),
      first,
      last,
      deltaPp: last - first,
      months: points.length,
    };
  }, [monthlyMix]);

  const maturity = useMemo(() => {
    const firstSeenBySku = new Map<string, { ano: number; mes: number }>();
    const launchMonthBySku = new Map<string, { ano: number; mes: number; safra: string }>();

    for (const row of rows) {
      const sku = row.sku?.trim();
      if (!sku) continue;
      const current = firstSeenBySku.get(sku);
      if (!current || row.ano < current.ano || (row.ano === current.ano && row.mes < current.mes)) {
        firstSeenBySku.set(sku, { ano: row.ano, mes: row.mes });
      }
    }

    for (const row of rows) {
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
  }, [filtered, innovationMap, rows]);

  const legacyImpact = useMemo(() => {
    const historyRows = applyFilters(rows, filters, null);
    const firstSeenBySku = new Map<string, { ano: number; mes: number }>();
    const skuToLegacy = new Map<string, string>();
    const skuToLaunch = new Map<string, { ano: number; mes: number }>();

    for (const row of rows) {
      const sku = row.sku?.trim();
      if (!sku) continue;
      const current = firstSeenBySku.get(sku);
      if (!current || periodRankFromParts(row.ano, row.mes) < periodRankFromParts(current.ano, current.mes)) {
        firstSeenBySku.set(sku, { ano: row.ano, mes: row.mes });
      }
    }

    for (const [sku, entry] of Object.entries(innovationMap)) {
      if (!/inova/i.test(entry.classificacao ?? "")) continue;
      const legacy = String(entry.legado ?? "").trim();
      if (legacy) skuToLegacy.set(sku, legacy);
    }

    for (const row of rows) {
      const sku = row.sku?.trim();
      if (!sku || !skuToLegacy.has(sku)) continue;
      const launchYear = parseLaunchYear(innovationMap[sku]?.anoLancamento);
      if (!launchYear || row.ano !== launchYear) continue;
      const current = skuToLaunch.get(sku);
      if (!current || row.mes < current.mes) skuToLaunch.set(sku, { ano: launchYear, mes: row.mes });
    }

    for (const [sku] of skuToLegacy.entries()) {
      if (!skuToLaunch.has(sku)) {
        const firstSeen = firstSeenBySku.get(sku);
        if (firstSeen) skuToLaunch.set(sku, firstSeen);
      }
    }

    const noLegacyInnovationKg = innovationRows.reduce((sum, row) => {
      const sku = row.sku?.trim();
      return sum + (sku && skuToLegacy.has(sku) ? 0 : row.volumeKg);
    }, 0);

    const pairCodes = Array.from(new Set(Array.from(skuToLegacy.values()))).sort();
    const pairs: LegacyPairAnalysis[] = [];

    for (const legacyCode of pairCodes) {
      const skus = Array.from(skuToLegacy.entries())
        .filter(([, legacy]) => legacy === legacyCode)
        .map(([sku]) => sku);
      const skuSet = new Set(skus);
      const launches = skus.map((sku) => skuToLaunch.get(sku)).filter(Boolean) as { ano: number; mes: number }[];
      if (launches.length === 0) continue;
      const launch = launches.sort((a, b) => periodRankFromParts(a.ano, a.mes) - periodRankFromParts(b.ano, b.mes))[0];
      const launchRank = periodRankFromParts(launch.ano, launch.mes);

      const selectedInnovationKg = filtered.reduce((sum, row) => {
        const sku = row.sku?.trim();
        return sum + (sku && skuSet.has(sku) ? row.volumeKg : 0);
      }, 0);
      if (selectedInnovationKg <= 0) continue;

      const monthMap = new Map<string, { ano: number; mes: number; label: string; innovationKg: number; legacyKg: number }>();
      for (const row of historyRows) {
        const sku = row.sku?.trim();
        if (!sku) continue;
        const isPairInnovation = skuSet.has(sku);
        const isPairLegacy = !isInnovationRow(row) && (row.legado === legacyCode || row.sku === legacyCode);
        if (!isPairInnovation && !isPairLegacy) continue;
        const current = monthMap.get(row.periodo) ?? {
          ano: row.ano,
          mes: row.mes,
          label: monthLabel(row),
          innovationKg: 0,
          legacyKg: 0,
        };
        if (isPairInnovation) current.innovationKg += row.volumeKg;
        if (isPairLegacy) current.legacyKg += row.volumeKg;
        monthMap.set(row.periodo, current);
      }

      const months = Array.from(monthMap.entries())
        .sort(([, a], [, b]) => periodRankFromParts(a.ano, a.mes) - periodRankFromParts(b.ano, b.mes));
      const before = months.filter(([, value]) => periodRankFromParts(value.ano, value.mes) < launchRank);
      const afterSelected = applyFilters(rows, filters, selected).filter((row) => {
        const rowRank = periodRankFromParts(row.ano, row.mes);
        return rowRank >= launchRank && !isInnovationRow(row) && (row.legado === legacyCode || row.sku === legacyCode);
      });
      const selectedPeriodsForPair = new Set(filtered
        .filter((row) => {
          const sku = row.sku?.trim();
          return sku && skuSet.has(sku);
        })
        .map((row) => row.periodo));

      const beforeAvgKg = before.length > 0
        ? before.reduce((sum, [, value]) => sum + value.legacyKg, 0) / before.length
        : 0;
      const afterLegacyKg = afterSelected.reduce((sum, row) => sum + row.volumeKg, 0);
      const comparableMonths = Math.max(1, selectedPeriodsForPair.size);
      const expectedLegacyKg = beforeAvgKg * comparableMonths;
      const legacyDropKg = Math.max(0, expectedLegacyKg - afterLegacyKg);
      const substitutionKg = Math.min(selectedInnovationKg, legacyDropKg);
      const incrementalKg = Math.max(0, selectedInnovationKg - substitutionKg);
      const substitutionPct = selectedInnovationKg > 0 ? substitutionKg / selectedInnovationKg : 0;
      const incrementalPct = selectedInnovationKg > 0 ? incrementalKg / selectedInnovationKg : 0;
      const hasLegacyRows = months.some(([, value]) => value.legacyKg > 0);
      const classification = substitutionPct >= 0.65 ? "Substituição" : incrementalPct >= 0.65 ? "Incremental" : "Misto";

      const series = months
        .filter(([, value]) => {
          const rank = periodRankFromParts(value.ano, value.mes);
          return rank >= launchRank - 6 && rank <= launchRank + 18;
        })
        .map(([periodo, value]) => ({
          periodo,
          label: value.label,
          innovationTon: value.innovationKg / 1000,
          legacyTon: value.legacyKg / 1000,
        }));

      pairs.push({
        legado: legacyCode,
        launchLabel: `${String(launch.mes).padStart(2, "0")}/${String(launch.ano).slice(-2)}`,
        innovationVolumeKg: selectedInnovationKg,
        substitutionKg,
        incrementalKg,
        substitutionPct,
        incrementalPct,
        legacyBeforeAvgKg: beforeAvgKg,
        legacyAfterAvgKg: afterLegacyKg / comparableMonths,
        hasLegacyRows,
        classification,
        series,
      });
    }

    const sortedPairs = pairs.sort((a, b) => b.innovationVolumeKg - a.innovationVolumeKg);
    const substitutionKg = sortedPairs.reduce((sum, pair) => sum + pair.substitutionKg, 0);
    const incrementalKg = sortedPairs.reduce((sum, pair) => sum + pair.incrementalKg, 0) + noLegacyInnovationKg;
    const totalInnovationKg = substitutionKg + incrementalKg;

    return {
      pairs: sortedPairs,
      featured: sortedPairs[0] ?? null,
      noLegacyInnovationKg,
      substitutionKg,
      incrementalKg,
      substitutionPct: totalInnovationKg > 0 ? substitutionKg / totalInnovationKg : 0,
      incrementalPct: totalInnovationKg > 0 ? incrementalKg / totalInnovationKg : 0,
      totalInnovationKg,
    };
  }, [filtered, filters, innovationMap, innovationRows, rows, selected]);

  const heroesOffenders = useMemo(() => {
    const prevCtx = getKpiComparisonContext(rows, filters, selected);
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
    for (const row of innovationRows) {
      const key = row.sku || row.skuDesc || "—";
      const current = currentBySku.get(key) ?? {
        sku: key,
        label: row.skuDesc || row.sku || "—",
        volumeKg: 0,
        volumeDeltaKg: 0,
        margemPct: 0,
        margemDeltaPp: 0,
        rol: 0,
      };
      current.volumeKg += row.volumeKg;
      current.rol += row.rol;
      current.margemPct += measureOf(row, metric);
      currentBySku.set(key, current);
    }

    const rowsBySku = Array.from(currentBySku.values()).map((item) => {
      const prev = previousBySku.get(item.sku);
      const margemAbs = item.margemPct;
      const currentMarginPct = item.rol > 0 ? margemAbs / item.rol : 0;
      const prevMarginPct = prev && prev.rol > 0 ? prev.margem / prev.rol : 0;
      return {
        ...item,
        margemPct: currentMarginPct,
        margemDeltaPp: currentMarginPct - prevMarginPct,
        volumeDeltaKg: item.volumeKg - (prev?.volumeKg ?? 0),
      };
    });

    const minVolumeKg = Math.max(1, innovationKpis.volumeKg * 0.005);
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
  }, [filters, innovationKpis.volumeKg, innovationRows, metric, rows, selected]);

  const priceComparison = useMemo(() => {
    const innovationPrice = innovationKpis.volumeKg > 0 ? innovationKpis.rol / innovationKpis.volumeKg : 0;
    const regularPrice = regularKpis.volumeKg > 0 ? regularKpis.rol / regularKpis.volumeKg : 0;
    const delta = innovationPrice - regularPrice;
    const deltaPct = regularPrice > 0 ? delta / regularPrice : 0;
    return {
      innovationPrice,
      regularPrice,
      delta,
      deltaPct,
      data: [
        { name: "Inovação", value: innovationPrice },
        { name: "Regular", value: regularPrice },
      ],
    };
  }, [innovationKpis, regularKpis]);

  const channelMix = useMemo<ChannelMixRow[]>(() => {
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
          innovationMix: innovationKpis.volumeKg > 0 ? value.innovationVolumeKg / innovationKpis.volumeKg : 0,
        };
      })
      .filter((item) => item.innovationVolumeKg > 0 || item.regularVolumeKg > 0)
      .sort((a, b) => b.innovationVolumeKg - a.innovationVolumeKg)
      .slice(0, 8);
  }, [filtered, innovationKpis.volumeKg]);

  if (rows.length === 0) {
    return (
      <>
        <Topbar title="Inovação" />
        <div className="px-8 py-6">
          <EmptyState
            title="Análise de inovação"
            message="Carregue dados para medir a participação de SKUs de inovação no volume, ROL e margem."
            actionLabel="Carregar dados"
            actionTo="/upload"
            icon={Sparkles}
          />
        </div>
      </>
    );
  }

  if (filtered.length === 0) {
    return (
      <>
        <Topbar title="Inovação" subtitle="Participação de SKUs de inovação no resultado" />
        <div className="px-8 py-6">
          <EmptyState
            title="Nenhum resultado"
            message="Não há dados para os filtros e períodos selecionados."
            icon={Sparkles}
          />
        </div>
      </>
    );
  }

  if (innovationRows.length === 0) {
    return (
      <>
        <Topbar title="Inovação" subtitle="Participação de SKUs de inovação no resultado" />
        <div className="px-8 py-6">
          <EmptyState
            title="Sem SKUs de inovação no recorte"
            message="Nenhum SKU classificado como Inovação foi encontrado no período e nos filtros atuais."
            icon={Lightbulb}
          />
        </div>
      </>
    );
  }

  const volumeMix = totalKpis.volumeKg > 0 ? innovationKpis.volumeKg / totalKpis.volumeKg : 0;
  const rolMix = totalKpis.rol > 0 ? innovationKpis.rol / totalKpis.rol : 0;
  const marginDiffPp = (innovationKpis.margemPct - regularKpis.margemPct) * 100;
  const innovationRolShare = totalKpis.rol > 0 ? innovationKpis.rol / totalKpis.rol : 0;
  const innovationMixEffectPp = innovationRolShare * marginDiffPp;
  const metricLabel = metric === "cm" ? "CM" : "MB";
  const marginBridgeSteps: MarginBridgeStep[] = [
    {
      label: "Regular",
      value: regularKpis.margemPct * 100,
      start: 0,
      end: regularKpis.margemPct * 100,
      total: true,
      color: "hsl(var(--muted-foreground))",
    },
    {
      label: "Efeito mix inovação",
      value: innovationMixEffectPp,
      start: regularKpis.margemPct * 100,
      end: regularKpis.margemPct * 100 + innovationMixEffectPp,
      total: false,
      color: innovationMixEffectPp >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))",
    },
    {
      label: "Total",
      value: totalKpis.margemPct * 100,
      start: 0,
      end: totalKpis.margemPct * 100,
      total: true,
      color: "hsl(var(--primary))",
    },
  ];

  return (
    <>
      <Topbar title="Inovação" subtitle="Participação de SKUs de inovação no resultado" />
      <div className="space-y-6 px-8 py-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiTile
            label="% do volume em inovação"
            value={formatPct(volumeMix)}
            helper={`${formatTon(innovationKpis.volumeKg / 1000)} de ${formatTon(totalKpis.volumeKg / 1000)}`}
            icon={<Scale className="h-5 w-5" />}
            tone="primary"
          />
          <KpiTile
            label="% do ROL em inovação"
            value={formatPct(rolMix)}
            helper={`${formatBRL(innovationKpis.rol, { compact: true })} de ${formatBRL(totalKpis.rol, { compact: true })}`}
            icon={<Sparkles className="h-5 w-5" />}
            tone="success"
          />
          <KpiTile
            label={`Diferença de ${metricLabel} %`}
            value={formatPp(marginDiffPp)}
            helper={`Inovação ${formatPct(innovationKpis.margemPct)} vs Regular ${formatPct(regularKpis.margemPct)}`}
            icon={<Percent className="h-5 w-5" />}
            tone={marginDiffPp >= 0 ? "success" : "destructive"}
          />
          <KpiTile
            label="SKUs de inovação ativos"
            value={formatNum(innovationKpis.skus)}
            helper="SKUs com venda no período/filtro atual"
            icon={<PackageCheck className="h-5 w-5" />}
            tone="warning"
          />
        </div>

        <SendToSlideHover
          payload={{
            source: { page: "Inovação", visualization: "Participação mensal de volume" },
            target: { blockKind: "chart", blockLabel: "Gráfico" },
            config: {
              chartType: "stackedColumn",
              measure: "volume",
              dimension: "inovacao",
              filters,
              selectedPeriods: selected,
              view: "innovation_volume_mix_monthly",
            },
          }}
        >
          <GlassCard>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium">Participação mensal de volume</h2>
                <p className="text-xs text-muted-foreground">
                  Inovação vs Regular como percentual do volume total mês a mês.
                </p>
              </div>
              <Badge
                variant="outline"
                className={
                  mixTrend.label === "Crescendo"
                    ? "border-success/30 bg-success/10 text-success"
                    : mixTrend.label === "Deteriorando"
                      ? "border-destructive/30 bg-destructive/10 text-destructive"
                      : "border-border/60 bg-secondary/40 text-muted-foreground"
                }
              >
                {mixTrend.label}
              </Badge>
            </div>
            <p className="mb-4 text-xs text-muted-foreground">
              Mix de inovação saiu de <span className="font-semibold text-foreground">{mixTrend.first.toFixed(1)}%</span> para{" "}
              <span className="font-semibold text-foreground">{mixTrend.last.toFixed(1)}%</span>
              {mixTrend.months > 1 && (
                <>
                  {" "}no período analisado ({formatPp(mixTrend.deltaPp)}).
                </>
              )}
            </p>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={monthlyMix} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
                <CartesianGrid stroke="hsl(var(--border) / 0.4)" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <YAxis
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  tickFormatter={(value) => `${Number(value).toFixed(0)}%`}
                  domain={[0, 100]}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="rounded-lg border border-border/60 bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
                        <div className="mb-1 font-semibold">{label}</div>
                        {payload.map((entry) => {
                          const name = entry.dataKey === "innovation" ? "Inovação" : "Regular";
                          const volume = entry.dataKey === "innovation"
                            ? (entry.payload as InnovationMixPoint).innovationVolumeKg
                            : (entry.payload as InnovationMixPoint).regularVolumeKg;
                          return (
                            <div key={String(entry.dataKey)} className="flex items-center justify-between gap-4">
                              <span className="flex items-center gap-1.5 text-muted-foreground">
                                <span className="inline-block h-2 w-2 rounded-sm" style={{ background: entry.color }} />
                                {name}
                              </span>
                              <span className="tabular-nums text-foreground">
                                {Number(entry.value).toFixed(1)}% · {formatTon(volume / 1000)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar name="Inovação" dataKey="innovation" stackId="volumeMix" fill={PALETTE[0]} fillOpacity={0.9} />
                <Bar name="Regular" dataKey="regular" stackId="volumeMix" fill={PALETTE[1]} fillOpacity={0.55} />
              </BarChart>
            </ResponsiveContainer>
          </GlassCard>
        </SendToSlideHover>

        <SendToSlideHover
          payload={{
            source: { page: "Inovação", visualization: "Margem Inovação vs Regular" },
            target: { blockKind: "chart", blockLabel: "Gráfico" },
            config: {
              chartType: "waterfall",
              measure: metric,
              dimension: "inovacao",
              filters,
              selectedPeriods: selected,
              view: "innovation_margin_bridge",
            },
          }}
        >
          <GlassCard>
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium">Margem Inovação vs Regular</h2>
                <p className="text-xs text-muted-foreground">
                  Comparativo de {metricLabel} % e efeito do mix de inovação na margem consolidada.
                </p>
              </div>
              <Badge
                variant="outline"
                className={innovationMixEffectPp >= 0 ? "border-success/30 bg-success/10 text-success" : "border-destructive/30 bg-destructive/10 text-destructive"}
              >
                {formatPp(innovationMixEffectPp)} no total
              </Badge>
            </div>

            <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-border/50 bg-secondary/30 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Inovação</p>
                <p className="mt-2 text-2xl font-semibold">{formatPct(innovationKpis.margemPct)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatPct(innovationRolShare)} do ROL filtrado</p>
              </div>
              <div className="rounded-xl border border-border/50 bg-secondary/30 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Regular</p>
                <p className="mt-2 text-2xl font-semibold">{formatPct(regularKpis.margemPct)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatPct(1 - innovationRolShare)} do ROL filtrado</p>
              </div>
              <div className="rounded-xl border border-border/50 bg-secondary/30 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Prêmio de margem</p>
                <p className={`mt-2 text-2xl font-semibold ${marginDiffPp >= 0 ? "text-success" : "text-destructive"}`}>
                  {formatPp(marginDiffPp)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Diferença Inovação - Regular</p>
              </div>
            </div>

            <MarginBridge steps={marginBridgeSteps} />
            <p className="mt-3 text-xs text-muted-foreground">
              Leitura: se os SKUs de inovação tivessem a margem da linha Regular, a margem consolidada partiria de{" "}
              <span className="font-semibold text-foreground">{formatPct(regularKpis.margemPct)}</span>. O mix de inovação adiciona{" "}
              <span className={innovationMixEffectPp >= 0 ? "font-semibold text-success" : "font-semibold text-destructive"}>{formatPp(innovationMixEffectPp)}</span>{" "}
              e leva o total para <span className="font-semibold text-foreground">{formatPct(totalKpis.margemPct)}</span>.
            </p>
          </GlassCard>
        </SendToSlideHover>

        <SendToSlideHover
          payload={{
            source: { page: "Inovação", visualization: "Curva de maturação por safra" },
            target: { blockKind: "chart", blockLabel: "Gráfico" },
            config: {
              chartType: "line",
              measure: "volume",
              dimension: "anoLancamento",
              filters,
              selectedPeriods: selected,
              view: "innovation_cohort_maturity",
            },
          }}
        >
          <GlassCard>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium">Curva de maturação por safra</h2>
                <p className="text-xs text-muted-foreground">
                  Volume por ano de lançamento, alinhado por meses desde o lançamento do SKU.
                </p>
              </div>
              <Badge variant="outline">
                {maturity.cohorts.length} safra{maturity.cohorts.length === 1 ? "" : "s"}
              </Badge>
            </div>

            {maturity.cohorts.length < 2 ? (
              <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-dashed border-border/60 bg-secondary/20 px-6 text-center">
                <div>
                  <p className="text-sm font-medium">Dados insuficientes para comparar safras</p>
                  <p className="mt-1 max-w-md text-xs text-muted-foreground">
                    A curva aparece quando pelo menos duas safras de inovação têm volume no recorte atual.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={330}>
                  <LineChart data={maturity.data} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
                    <CartesianGrid stroke="hsl(var(--border) / 0.4)" strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    <YAxis
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                      tickFormatter={(value) => formatTon(Number(value))}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="rounded-lg border border-border/60 bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
                            <div className="mb-1 font-semibold">{label}</div>
                            {payload.map((entry) => (
                              <div key={String(entry.dataKey)} className="flex items-center justify-between gap-4">
                                <span className="flex items-center gap-1.5 text-muted-foreground">
                                  <span className="inline-block h-2 w-2 rounded-sm" style={{ background: entry.color }} />
                                  Safra {String(entry.dataKey)}
                                </span>
                                <span className="tabular-nums text-foreground">{formatTon(Number(entry.value))}</span>
                              </div>
                            ))}
                          </div>
                        );
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} formatter={(value) => `Safra ${value}`} />
                    {maturity.cohorts.map((cohort, index) => (
                      <Line
                        key={cohort.safra}
                        type="monotone"
                        name={cohort.safra}
                        dataKey={cohort.safra}
                        stroke={PALETTE[index % PALETTE.length]}
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                        connectNulls={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
                <p className="mt-3 text-xs text-muted-foreground">
                  Cada linha usa o primeiro mês vendido do SKU como M+1. Safras recentes podem parar antes das demais por ainda não terem meses suficientes.
                </p>
              </>
            )}
          </GlassCard>
        </SendToSlideHover>

        <SendToSlideHover
          payload={{
            source: { page: "Inovação", visualization: "Substituição vs incremental" },
            target: { blockKind: "chart", blockLabel: "Gráfico" },
            config: {
              chartType: "combo",
              measure: "volume",
              dimension: "legado",
              filters,
              selectedPeriods: selected,
              view: "innovation_legacy_incrementality",
            },
          }}
        >
          <GlassCard>
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium">Substituição de legado vs crescimento incremental</h2>
                <p className="text-xs text-muted-foreground">
                  Estimativa do volume de inovação que substitui produtos legado versus volume líquido adicional.
                </p>
              </div>
              <Badge variant="outline">
                {legacyImpact.pairs.length} legado{legacyImpact.pairs.length === 1 ? "" : "s"} analisado{legacyImpact.pairs.length === 1 ? "" : "s"}
              </Badge>
            </div>

            <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-border/50 bg-secondary/30 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Substituição estimada</p>
                <p className="mt-2 text-2xl font-semibold text-warning">{formatPct(legacyImpact.substitutionPct)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatTon(legacyImpact.substitutionKg / 1000)} do volume de inovação</p>
              </div>
              <div className="rounded-xl border border-border/50 bg-secondary/30 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Incremental líquido</p>
                <p className="mt-2 text-2xl font-semibold text-success">{formatPct(legacyImpact.incrementalPct)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatTon(legacyImpact.incrementalKg / 1000)} estimado como volume novo</p>
              </div>
              <div className="rounded-xl border border-border/50 bg-secondary/30 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sem legado associado</p>
                <p className="mt-2 text-2xl font-semibold">{formatTon(legacyImpact.noLegacyInnovationKg / 1000)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Tratado como 100% incremental por definição</p>
              </div>
            </div>

            {legacyImpact.featured ? (
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-medium">Par em destaque: Legado {legacyImpact.featured.legado}</h3>
                      <p className="text-xs text-muted-foreground">
                        Lançamento observado em {legacyImpact.featured.launchLabel}. Linhas em toneladas.
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        legacyImpact.featured.classification === "Substituição"
                          ? "border-warning/30 bg-warning/10 text-warning"
                          : legacyImpact.featured.classification === "Incremental"
                            ? "border-success/30 bg-success/10 text-success"
                            : "border-primary/30 bg-primary/10 text-primary"
                      }
                    >
                      {legacyImpact.featured.classification}
                    </Badge>
                  </div>
                  {legacyImpact.featured.series.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={legacyImpact.featured.series} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
                        <CartesianGrid stroke="hsl(var(--border) / 0.4)" strokeDasharray="3 3" />
                        <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                        <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={(value) => formatTon(Number(value))} />
                        <Tooltip
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            return (
                              <div className="rounded-lg border border-border/60 bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
                                <div className="mb-1 font-semibold">{label}</div>
                                {payload.map((entry) => (
                                  <div key={String(entry.dataKey)} className="flex items-center justify-between gap-4">
                                    <span className="flex items-center gap-1.5 text-muted-foreground">
                                      <span className="inline-block h-2 w-2 rounded-sm" style={{ background: entry.color }} />
                                      {entry.dataKey === "innovationTon" ? "Inovação" : "Legado"}
                                    </span>
                                    <span className="tabular-nums text-foreground">{formatTon(Number(entry.value))}</span>
                                  </div>
                                ))}
                              </div>
                            );
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line type="monotone" name="Inovação" dataKey="innovationTon" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3 }} />
                        <Line type="monotone" name="Legado" dataKey="legacyTon" stroke="hsl(var(--muted-foreground))" strokeWidth={2.5} strokeDasharray="5 4" dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-dashed border-border/60 bg-secondary/20 px-6 text-center">
                      <p className="text-sm text-muted-foreground">Sem série mensal suficiente para o par em destaque.</p>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {legacyImpact.pairs.slice(0, 3).map((pair) => (
                    <div key={pair.legado} className="rounded-xl border border-border/50 bg-secondary/25 p-3">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">Legado {pair.legado}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {pair.hasLegacyRows ? `Baseline legado ${formatTon(pair.legacyBeforeAvgKg / 1000)}/mês` : "Sem volume de legado observado"}
                          </p>
                        </div>
                        <Badge variant="outline" className="shrink-0">{pair.classification}</Badge>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-warning" style={{ width: `${Math.min(100, pair.substitutionPct * 100)}%` }} />
                      </div>
                      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
                        <span>{formatPct(pair.substitutionPct)} substituição</span>
                        <span>{formatPct(pair.incrementalPct)} incremental</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-dashed border-border/60 bg-secondary/20 px-6 text-center">
                <div>
                  <p className="text-sm font-medium">Sem pares legado/inovação no recorte</p>
                  <p className="mt-1 max-w-md text-xs text-muted-foreground">
                    As inovações sem legado associado continuam classificadas como 100% incrementais.
                  </p>
                </div>
              </div>
            )}
          </GlassCard>
        </SendToSlideHover>

        <SendToSlideHover
          payload={{
            source: { page: "Inovação", visualization: "Heróis e ofensores de inovação" },
            target: { blockKind: "omni_herois_ofensores", blockLabel: "Heróis e Ofensores" },
            config: {
              metric,
              filters,
              selectedPeriods: selected,
              scope: "inovacao",
              view: "innovation_heroes_offenders",
            },
          }}
        >
          <GlassCard>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium">Heróis e ofensores de inovação</h2>
                <p className="text-xs text-muted-foreground">
                  Maiores altas e quedas entre SKUs de inovação ({heroesOffenders.comparisonLabel}).
                </p>
              </div>
              <Badge variant="outline">{metricLabel}</Badge>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="rounded-xl border border-success/25 bg-success/5 p-4">
                <h3 className="mb-3 text-sm font-medium text-success">Heróis</h3>
                <div className="space-y-2">
                  {heroesOffenders.heroes.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sem altas relevantes no recorte.</p>
                  ) : (
                    heroesOffenders.heroes.map((item) => (
                      <div key={item.sku} className="rounded-lg border border-border/50 bg-background/40 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{item.label}</p>
                            <p className="text-[11px] text-muted-foreground">{item.sku}</p>
                          </div>
                          <span className="shrink-0 text-sm font-semibold text-success">{formatTon(item.volumeDeltaKg / 1000)}</span>
                        </div>
                        <div className="mt-2 flex justify-between gap-3 text-[11px] text-muted-foreground">
                          <span>Volume atual {formatTon(item.volumeKg / 1000)}</span>
                          <span>{formatPp(item.margemDeltaPp * 100)} margem</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-4">
                <h3 className="mb-3 text-sm font-medium text-destructive">Ofensores</h3>
                <div className="space-y-2">
                  {heroesOffenders.offenders.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sem quedas relevantes no recorte.</p>
                  ) : (
                    heroesOffenders.offenders.map((item) => (
                      <div key={item.sku} className="rounded-lg border border-border/50 bg-background/40 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{item.label}</p>
                            <p className="text-[11px] text-muted-foreground">{item.sku}</p>
                          </div>
                          <span className="shrink-0 text-sm font-semibold text-destructive">{formatTon(item.volumeDeltaKg / 1000)}</span>
                        </div>
                        <div className="mt-2 flex justify-between gap-3 text-[11px] text-muted-foreground">
                          <span>Volume atual {formatTon(item.volumeKg / 1000)}</span>
                          <span>{formatPp(item.margemDeltaPp * 100)} margem</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </GlassCard>
        </SendToSlideHover>

        <SendToSlideHover
          payload={{
            source: { page: "Inovação", visualization: "Preço médio Inovação vs Regular" },
            target: { blockKind: "chart", blockLabel: "Gráfico" },
            config: {
              chartType: "column",
              measure: "precoMedio",
              dimension: "inovacao",
              filters,
              selectedPeriods: selected,
              view: "innovation_price_comparison",
            },
          }}
        >
          <GlassCard>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium">Preço médio Inovação vs Regular</h2>
                <p className="text-xs text-muted-foreground">Comparação de ROL/kg no período filtrado.</p>
              </div>
              <Badge
                variant="outline"
                className={priceComparison.delta >= 0 ? "border-success/30 bg-success/10 text-success" : "border-destructive/30 bg-destructive/10 text-destructive"}
              >
                {priceComparison.delta >= 0 ? "+" : ""}
                {formatBRL(priceComparison.delta, { digits: 2 })}/kg
              </Badge>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
              <div className="grid grid-cols-1 gap-3">
                <div className="rounded-xl border border-border/50 bg-secondary/30 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Inovação</p>
                  <p className="mt-2 text-2xl font-semibold">{formatBRL(priceComparison.innovationPrice, { digits: 2 })}/kg</p>
                </div>
                <div className="rounded-xl border border-border/50 bg-secondary/30 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Regular</p>
                  <p className="mt-2 text-2xl font-semibold">{formatBRL(priceComparison.regularPrice, { digits: 2 })}/kg</p>
                </div>
              </div>

              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={priceComparison.data} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
                  <CartesianGrid stroke="hsl(var(--border) / 0.4)" strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <YAxis
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    tickFormatter={(value) => formatBRL(Number(value), { digits: 2 })}
                  />
                  <Tooltip formatter={(value) => [`${formatBRL(Number(value), { digits: 2 })}/kg`, "Preço médio"]} />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              Diferença relativa: {formatPct(priceComparison.deltaPct)} vs. Regular.
            </p>
          </GlassCard>
        </SendToSlideHover>

        <SendToSlideHover
          payload={{
            source: { page: "Inovação", visualization: "Mix de inovação por canal" },
            target: { blockKind: "omni_canal_mix", blockLabel: "Mix por Canal" },
            config: {
              measure: "volume",
              dimension: "canalAjustado",
              filters,
              selectedPeriods: selected,
              scope: "inovacao",
              view: "innovation_channel_mix",
            },
          }}
        >
          <GlassCard>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium">Mix de inovação por canal</h2>
                <p className="text-xs text-muted-foreground">
                  Penetração da inovação dentro de cada canal, comparada à linha Regular.
                </p>
              </div>
              <Badge variant="outline">Top {channelMix.length}</Badge>
            </div>

            {channelMix.length === 0 ? (
              <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-border/60 bg-secondary/20 px-6 text-center">
                <p className="text-sm text-muted-foreground">Sem canais com volume no recorte atual.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={channelMix} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 96 }}>
                  <CartesianGrid stroke="hsl(var(--border) / 0.35)" strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    domain={[0, 1]}
                    tickFormatter={(value) => `${(Number(value) * 100).toFixed(0)}%`}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  />
                  <YAxis type="category" dataKey="canal" width={92} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const row = payload[0].payload as ChannelMixRow;
                      return (
                        <div className="rounded-lg border border-border/60 bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
                          <div className="mb-1 font-semibold">{label}</div>
                          <div className="space-y-1">
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">Penetração Inovação</span>
                              <span>{formatPct(row.innovationPenetration)}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">Penetração Regular</span>
                              <span>{formatPct(row.regularPenetration)}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">Volume Inovação</span>
                              <span>{formatTon(row.innovationVolumeKg / 1000)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar name="Inovação" dataKey="innovationPenetration" stackId="penetration" fill="hsl(var(--primary))" fillOpacity={0.9} />
                  <Bar name="Regular" dataKey="regularPenetration" stackId="penetration" fill="hsl(var(--muted-foreground))" fillOpacity={0.45} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </GlassCard>
        </SendToSlideHover>

        <SendToSlideHover
          payload={{
            source: { page: "Inovação", visualization: "Resumo executivo de inovação" },
            target: { blockKind: "table", blockLabel: "Tabela" },
            config: { metric, filters, selectedPeriods: selected, view: "innovation_summary" },
          }}
        >
          <GlassCard>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium">Resumo Inovação x Regular</h2>
                <p className="text-xs text-muted-foreground">
                  Números calculados com os filtros globais e períodos ativos.
                </p>
              </div>
              <Badge variant="outline">{metricLabel}</Badge>
            </div>
            <DataTable
              rows={summaryRows}
              columns={summaryColumns}
              maxRows={10}
              emptyMessage="Sem dados de inovação para exibir."
            />
          </GlassCard>
        </SendToSlideHover>
      </div>
    </>
  );
}
