import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { DataTable } from "@/components/pricing/DataTable";
import { EmptyState } from "@/components/pricing/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePricing } from "@/store/pricing";
import {
  aggregateBy,
  applyFilters,
  computeCanalTrend,
  getKpiComparisonContext,
  type CanalTrendPoint,
} from "@/lib/analytics";
import { formatBRL, formatPct, formatTon } from "@/lib/format";
import { useMemo, useState } from "react";
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
import { ArrowDown, ArrowUp, Crown, Download, Lightbulb, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { exportTableCsv } from "@/lib/exportCsv";
import { cn } from "@/lib/utils";
import { usePageTitle } from "@/hooks/use-page-title";

type ChartMetric = "margemPct" | "rol" | "volumeKg";

const PALETTE = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "#a78bfa",
  "#22d3ee",
  "#f472b6",
  "#94a3b8",
];

// ---------- helpers ----------

function linRegSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const xs = values.map((_, i) => i);
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = values.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (values[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

function classifyTrend(slope: number): "Crescendo" | "Estável" | "Deteriorando" {
  // slope is in margemPct units per month (e.g. 0.005 = +0.5pp/mês)
  if (slope > 0.002) return "Crescendo";
  if (slope < -0.002) return "Deteriorando";
  return "Estável";
}

function Sparkline({ values, positive }: { values: number[]; positive: boolean }) {
  if (values.length < 2) return <span className="text-[10px] text-muted-foreground">—</span>;
  const w = 80, h = 24, pad = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = pad + (i * (w - pad * 2)) / (values.length - 1);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return [x, y] as const;
  });
  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const stroke = positive ? "hsl(var(--success))" : "hsl(var(--destructive))";
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} className="inline-block align-middle">
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={2} fill={stroke} />
    </svg>
  );
}

interface CanalRow {
  key: string;
  rol: number;
  margem: number;
  margemPct: number;
  volumeKg: number;
  rolPorKg: number;
  deltaPp: number;
  spark: number[];
  trendClass: "Crescendo" | "Estável" | "Deteriorando";
  slope: number;
}

// ---------- page ----------

export default function Canais() {
  usePageTitle("Canais");
  const rows = usePricing((s) => s.rows);
  const metric = usePricing((s) => s.metric);
  const filters = usePricing((s) => s.filters);
  const selected = usePricing((s) => s.selectedPeriods);

  const [chartMetric, setChartMetric] = useState<ChartMetric>("margemPct");

  // Current period rows (respect selected period filter)
  const filtered = useMemo(() => applyFilters(rows, filters, selected), [rows, filters, selected]);
  // Full-history rows (respect dimension filters but ignore period selection) — for trend lines & sparklines
  const allHistory = useMemo(() => applyFilters(rows, filters, null), [rows, filters]);

  const byCanal = useMemo(
    () => aggregateBy(filtered, metric, (r) => r.canalAjustado || "Sem canal"),
    [filtered, metric],
  );

  // Previous period (vs. selected) for KPI deltas
  const prevCtx = useMemo(() => getKpiComparisonContext(rows, filters, selected), [rows, filters, selected]);
  const byCanalPrev = useMemo(
    () => (prevCtx ? aggregateBy(prevCtx.previousRows, metric, (r) => r.canalAjustado || "Sem canal") : []),
    [prevCtx, metric],
  );
  const prevMap = useMemo(() => new Map(byCanalPrev.map((c) => [c.key, c])), [byCanalPrev]);

  // List of canais (top 8 by ROL; remainder grouped as "Outros")
  const { topCanais, allMonths, seriesPerCanal, mixData } = useMemo(() => {
    const canalAggHist = aggregateBy(allHistory, metric, (r) => r.canalAjustado || "Sem canal");
    const sorted = [...canalAggHist].sort((a, b) => b.rol - a.rol);
    const top = sorted.slice(0, 8).map((c) => c.key);
    const others = sorted.slice(8).map((c) => c.key);

    // collect all periods sorted
    const periodMeta = new Map<string, { ano: number; mes: number; label: string }>();
    for (const r of allHistory) {
      if (!periodMeta.has(r.periodo)) {
        periodMeta.set(r.periodo, {
          ano: r.ano,
          mes: r.mes,
          label: `${String(r.mes).padStart(2, "0")}/${String(r.ano).slice(-2)}`,
        });
      }
    }
    const months = Array.from(periodMeta.entries())
      .sort(([, a], [, b]) => a.ano - b.ano || a.mes - b.mes)
      .map(([periodo, m]) => ({ periodo, label: m.label }));

    // series per canal (top + Outros)
    const series = new Map<string, Map<string, CanalTrendPoint>>();
    for (const c of top) {
      const t = computeCanalTrend(allHistory, c, metric);
      series.set(c, new Map(t.map((p) => [p.periodo, p])));
    }
    if (others.length > 0) {
      const othersRows = allHistory.filter((r) => others.includes(r.canalAjustado || "Sem canal"));
      const t = computeCanalTrend(othersRows, null, metric);
      series.set("Outros", new Map(t.map((p) => [p.periodo, p])));
    }

    // mix data: for each month, % do ROL por canal (top + Outros)
    const allCanaisDisplay = others.length > 0 ? [...top, "Outros"] : top;
    const mix = months.map(({ periodo, label }) => {
      const totalRol = allCanaisDisplay.reduce(
        (s, c) => s + (series.get(c)?.get(periodo)?.rol ?? 0),
        0,
      );
      const row: Record<string, number | string> = { label };
      for (const c of allCanaisDisplay) {
        const r = series.get(c)?.get(periodo)?.rol ?? 0;
        row[c] = totalRol > 0 ? (r / totalRol) * 100 : 0;
      }
      return row;
    });

    return { topCanais: allCanaisDisplay, allMonths: months, seriesPerCanal: series, mixData: mix };
  }, [allHistory, metric]);

  // Build evolution chart data
  const evolutionData = useMemo(() => {
    return allMonths.map(({ periodo, label }) => {
      const row: Record<string, number | string> = { label };
      for (const c of topCanais) {
        const p = seriesPerCanal.get(c)?.get(periodo);
        if (!p) { row[c] = NaN; continue; }
        row[c] =
          chartMetric === "margemPct" ? p.margemPct * 100 :
          chartMetric === "rol" ? p.rol :
          p.volumeKg;
      }
      return row;
    });
  }, [allMonths, topCanais, seriesPerCanal, chartMetric]);

  // Build the ranking rows with sparkline + slope classification (using selected period as "atual")
  const rankingRows = useMemo<CanalRow[]>(() => {
    return byCanal.map((c) => {
      const histSeries = computeCanalTrend(allHistory, c.key, metric);
      const last6 = histSeries.slice(-6).map((p) => p.margemPct);
      const slope = linRegSlope(last6);
      const prev = prevMap.get(c.key);
      const deltaPp = prev ? c.margemPct - prev.margemPct : 0;
      return {
        key: c.key,
        rol: c.rol,
        margem: c.margem,
        margemPct: c.margemPct,
        volumeKg: c.volumeKg,
        rolPorKg: c.rolPorKg,
        deltaPp,
        spark: last6,
        slope,
        trendClass: classifyTrend(slope),
      };
    });
  }, [byCanal, allHistory, metric, prevMap]);

  // KPI cards: 1) maior crescimento de margem%, 2) maior queda, 3) líder em ROL
  const kpiCards = useMemo(() => {
    if (byCanal.length === 0 || prevMap.size === 0) {
      // Without previous period, only "líder" makes sense
      const leader = [...byCanal].sort((a, b) => b.rol - a.rol)[0];
      return { up: null, down: null, leader: leader ?? null };
    }
    const withDelta = byCanal
      .map((c) => {
        const p = prevMap.get(c.key);
        return p ? { canal: c, deltaPp: c.margemPct - p.margemPct } : null;
      })
      .filter((x): x is { canal: typeof byCanal[number]; deltaPp: number } => x !== null);
    const sorted = [...withDelta].sort((a, b) => b.deltaPp - a.deltaPp);
    const up = sorted[0] ?? null;
    const down = sorted[sorted.length - 1] ?? null;
    const leader = [...byCanal].sort((a, b) => b.rol - a.rol)[0] ?? null;
    return { up, down, leader };
  }, [byCanal, prevMap]);

  // Diagnostics
  const diagnostics = useMemo<Array<{ icon: typeof TrendingUp; tone: string; text: React.ReactNode }>>(() => {
    const out: Array<{ icon: typeof TrendingUp; tone: string; text: React.ReactNode }> = [];
    if (byCanal.length === 0) return out;

    const totalVol = byCanal.reduce((s, c) => s + c.volumeKg, 0) || 1;
    const margens = byCanal.filter((c) => c.rol > 0).map((c) => c.margemPct).sort((a, b) => a - b);
    const med = margens.length ? margens[Math.floor(margens.length / 2)] : 0;

    // 1. Maior volume com margem abaixo da mediana
    const byVol = [...byCanal].sort((a, b) => b.volumeKg - a.volumeKg);
    const heavy = byVol.find((c) => c.margemPct < med);
    if (heavy) {
      out.push({
        icon: TrendingDown,
        tone: "text-warning border-warning/30 bg-warning/10",
        text: (
          <>
            Canal <strong>{heavy.key}</strong> representa{" "}
            <strong>{formatPct(heavy.volumeKg / totalVol)}</strong> do volume mas opera com margem{" "}
            <strong>{formatPct(heavy.margemPct)}</strong>, abaixo da mediana ({formatPct(med)}). Investigar mix de SKU
            ou política de preço.
          </>
        ),
      });
    }

    // 2. Maior deterioração nos últimos 3 meses consecutivos
    let worst: { canal: string; drop: number; n: number } | null = null;
    for (const c of byCanal) {
      const series = computeCanalTrend(allHistory, c.key, metric)
        .slice(-3)
        .map((p) => p.margemPct);
      if (series.length < 2) continue;
      let consecutive = true;
      for (let i = 1; i < series.length; i++) {
        if (series[i] >= series[i - 1]) { consecutive = false; break; }
      }
      const drop = series[series.length - 1] - series[0];
      if (consecutive && drop < 0 && (!worst || drop < worst.drop)) {
        worst = { canal: c.key, drop, n: series.length };
      }
    }
    if (worst) {
      out.push({
        icon: TrendingDown,
        tone: "text-destructive border-destructive/30 bg-destructive/10",
        text: (
          <>
            Canal <strong>{worst.canal}</strong> apresenta queda consecutiva de margem nos últimos{" "}
            <strong>{worst.n}</strong> meses (<strong>{(worst.drop * 100).toFixed(1)}pp</strong>).
          </>
        ),
      });
    }

    // 3. Maior crescimento de margem (slope positivo)
    let best: { canal: string; deltaPp: number } | null = null;
    for (const c of byCanal) {
      const series = computeCanalTrend(allHistory, c.key, metric).slice(-6).map((p) => p.margemPct);
      if (series.length < 2) continue;
      const deltaPp = series[series.length - 1] - series[0];
      if (deltaPp > 0 && (!best || deltaPp > best.deltaPp)) {
        best = { canal: c.key, deltaPp };
      }
    }
    if (best) {
      out.push({
        icon: TrendingUp,
        tone: "text-success border-success/30 bg-success/10",
        text: (
          <>
            Canal <strong>{best.canal}</strong> cresceu{" "}
            <strong>+{(best.deltaPp * 100).toFixed(1)}pp</strong> de margem nos últimos meses — oportunidade de
            expansão de volume.
          </>
        ),
      });
    }

    return out.slice(0, 3);
  }, [byCanal, allHistory, metric]);

  if (rows.length === 0)
    return (
      <>
        <Topbar title="Canais" />
        <div className="px-8 py-6"><EmptyState
          title="Performance por canal"
          message="Carregue dados para comparar margem, volume e mix entre seus canais de venda."
          actionLabel="Carregar dados"
          actionTo="/upload"
        /></div>
      </>
    );

  const metricLabel = metric === "cm" ? "CM" : "MB";

  return (
    <>
      <Topbar title="Canais" subtitle="Tendência, diagnóstico e ranking por canal" />
      <div className="space-y-6 px-8 py-6">

        {/* ---------- KPI cards ---------- */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <KpiChannelCard
            badgeLabel="Em alta"
            badgeClass="bg-success/15 text-success border border-success/30"
            icon={<TrendingUp className="h-4 w-4 text-success" />}
            title="Maior crescimento de margem"
            canal={kpiCards.up?.canal.key ?? "—"}
            value={kpiCards.up ? `${kpiCards.up.deltaPp >= 0 ? "+" : ""}${(kpiCards.up.deltaPp * 100).toFixed(1)}pp` : "—"}
            sub={kpiCards.up ? `Margem atual ${formatPct(kpiCards.up.canal.margemPct)}` : prevCtx ? "Sem dados suficientes" : "Sem período anterior"}
            valueClass="text-success"
          />
          <KpiChannelCard
            badgeLabel="Em queda"
            badgeClass="bg-destructive/15 text-destructive border border-destructive/30"
            icon={<TrendingDown className="h-4 w-4 text-destructive" />}
            title="Maior queda de margem"
            canal={kpiCards.down?.canal.key ?? "—"}
            value={kpiCards.down ? `${kpiCards.down.deltaPp >= 0 ? "+" : ""}${(kpiCards.down.deltaPp * 100).toFixed(1)}pp` : "—"}
            sub={kpiCards.down ? `Margem atual ${formatPct(kpiCards.down.canal.margemPct)}` : prevCtx ? "Sem dados suficientes" : "Sem período anterior"}
            valueClass="text-destructive"
          />
          <KpiChannelCard
            badgeLabel="Líder"
            badgeClass="bg-primary/15 text-primary border border-primary/30"
            icon={<Crown className="h-4 w-4 text-primary" />}
            title="Maior participação no ROL"
            canal={kpiCards.leader?.key ?? "—"}
            value={kpiCards.leader ? formatBRL(kpiCards.leader.rol, { compact: true }) : "—"}
            sub={
              kpiCards.leader
                ? `${formatPct(kpiCards.leader.rol / (byCanal.reduce((s, c) => s + c.rol, 0) || 1))} do total`
                : "—"
            }
            valueClass="text-primary"
          />
        </div>

        {/* ---------- Evolution chart ---------- */}
        <GlassCard glow="blue">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium">Evolução temporal por canal</h2>
              <p className="text-xs text-muted-foreground">Top 8 canais por ROL{topCanais.includes("Outros") ? " · demais agrupados em Outros" : ""}</p>
            </div>
            <div className="flex gap-1">
              {(["margemPct", "rol", "volumeKg"] as ChartMetric[]).map((m) => (
                <Button
                  key={m}
                  size="sm"
                  variant={chartMetric === m ? "default" : "outline"}
                  className="h-7 px-3 text-xs"
                  onClick={() => setChartMetric(m)}
                >
                  {m === "margemPct" ? `${metricLabel} %` : m === "rol" ? "ROL" : "Volume"}
                </Button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={evolutionData} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
              <CartesianGrid stroke="hsl(var(--border) / 0.4)" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
              <YAxis
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                tickFormatter={(v) =>
                  chartMetric === "margemPct"
                    ? `${Number(v).toFixed(0)}%`
                    : chartMetric === "rol"
                    ? formatBRL(Number(v), { compact: true })
                    : formatTon(Number(v))
                }
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const sorted = [...payload].sort((a, b) => Number(b.value) - Number(a.value));
                  return (
                    <div className="rounded-lg border border-border/60 bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
                      <div className="mb-1 font-semibold">{label}</div>
                      <div className="space-y-0.5">
                        {sorted.map((p) => (
                          <div key={String(p.dataKey)} className="flex items-center justify-between gap-4">
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
                              {String(p.dataKey)}
                            </span>
                            <span className="tabular-nums text-foreground">
                              {chartMetric === "margemPct"
                                ? `${Number(p.value).toFixed(1)}%`
                                : chartMetric === "rol"
                                ? formatBRL(Number(p.value), { compact: true })
                                : formatTon(Number(p.value))}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {topCanais.map((c, i) => (
                <Line
                  key={c}
                  type="monotone"
                  dataKey={c}
                  stroke={PALETTE[i % PALETTE.length]}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </GlassCard>

        {/* ---------- Ranking table ---------- */}
        <GlassCard>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium">Ranking de canais</h3>
              <p className="text-xs text-muted-foreground">Período atual com Δ vs. anterior · sparkline dos últimos 6 meses</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                exportTableCsv(
                  rankingRows as unknown as Record<string, unknown>[],
                  [
                    { key: "key", label: "Canal" },
                    { key: "rol", label: "ROL" },
                    { key: "margemPct", label: `${metricLabel} %` },
                    { key: "volumeKg", label: "Volume (kg)" },
                    { key: "rolPorKg", label: "ROL/kg" },
                    { key: "trendClass", label: "Tendência" },
                  ],
                  "ranking_canais",
                );
                toast.success("Arquivo exportado.");
              }}
            >
              <Download className="h-4 w-4" />
              Exportar CSV
            </Button>
          </div>
          <DataTable
            rows={rankingRows as unknown as Record<string, unknown>[]}
            columns={[
              { key: "key", label: "Canal", align: "left", format: (v) => <span className="font-medium">{String(v)}</span> },
              { key: "rol", label: "ROL", align: "right", format: (v) => formatBRL(Number(v), { compact: true }) },
              {
                key: "margemPct",
                label: `${metricLabel} %`,
                align: "right",
                format: (v, row) => {
                  const r = row as unknown as CanalRow;
                  const hasDelta = prevMap.has(r.key);
                  return (
                    <div className="flex items-center justify-end gap-2">
                      <span className="tabular-nums">{formatPct(Number(v))}</span>
                      {hasDelta && (
                        <Badge
                          variant="secondary"
                          className={cn(
                            "h-5 gap-0.5 px-1.5 text-[10px] font-semibold tabular-nums",
                            r.deltaPp > 0
                              ? "bg-success/15 text-success border border-success/30"
                              : r.deltaPp < 0
                              ? "bg-destructive/15 text-destructive border border-destructive/30"
                              : "bg-muted text-muted-foreground border border-border/40",
                          )}
                        >
                          {r.deltaPp > 0 ? <ArrowUp className="h-2.5 w-2.5" /> : r.deltaPp < 0 ? <ArrowDown className="h-2.5 w-2.5" /> : null}
                          {r.deltaPp >= 0 ? "+" : ""}
                          {(r.deltaPp * 100).toFixed(1)}pp
                        </Badge>
                      )}
                    </div>
                  );
                },
              },
              { key: "volumeKg", label: "Volume", align: "right", format: (v) => formatTon(Number(v)) },
              { key: "rolPorKg", label: "ROL/kg", align: "right", format: (v) => formatBRL(Number(v), { digits: 2 }) },
              {
                key: "spark",
                label: "Tendência",
                align: "right",
                sortable: false,
                format: (_v, row) => {
                  const r = row as unknown as CanalRow;
                  return <Sparkline values={r.spark} positive={r.slope >= 0} />;
                },
              },
              {
                key: "trendClass",
                label: "Classificação",
                align: "right",
                format: (_v, row) => {
                  const r = row as unknown as CanalRow;
                  return (
                    <Badge
                      variant="secondary"
                      className={cn(
                        "px-2 text-[10px] font-bold",
                        r.trendClass === "Crescendo" && "bg-success/15 text-success border border-success/30",
                        r.trendClass === "Estável" && "bg-muted text-muted-foreground border border-border/40",
                        r.trendClass === "Deteriorando" && "bg-destructive/15 text-destructive border border-destructive/30",
                      )}
                    >
                      {r.trendClass}
                    </Badge>
                  );
                },
              },
            ]}
          />
        </GlassCard>

        {/* ---------- Mix evolution ---------- */}
        <GlassCard>
          <div className="mb-3">
            <h3 className="text-sm font-medium">Análise de mix</h3>
            <p className="text-xs text-muted-foreground">Composição do ROL por canal (% mensal)</p>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={mixData} margin={{ top: 8, right: 24, bottom: 8, left: 8 }} stackOffset="expand">
              <CartesianGrid stroke="hsl(var(--border) / 0.4)" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={(v) => `${Number(v).toFixed(0)}%`} domain={[0, 100]} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const sorted = [...payload].sort((a, b) => Number(b.value) - Number(a.value));
                  return (
                    <div className="rounded-lg border border-border/60 bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
                      <div className="mb-1 font-semibold">{label}</div>
                      {sorted.map((p) => (
                        <div key={String(p.dataKey)} className="flex items-center justify-between gap-4">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: p.color }} />
                            {String(p.dataKey)}
                          </span>
                          <span className="tabular-nums text-foreground">{Number(p.value).toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {topCanais.map((c, i) => (
                <Bar key={c} dataKey={c} stackId="mix" fill={PALETTE[i % PALETTE.length]} fillOpacity={0.85} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>

        {/* ---------- Diagnostics ---------- */}
        <GlassCard>
          <div className="mb-3 flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-accent" />
            <h3 className="text-sm font-medium">Diagnóstico de canais</h3>
          </div>
          {diagnostics.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Sem insights disponíveis.</div>
          ) : (
            <ul className="space-y-2">
              {diagnostics.map((d, i) => {
                const Icon = d.icon;
                return (
                  <li key={i} className={cn("flex items-start gap-3 rounded-xl border p-3 text-xs", d.tone)}>
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="flex-1 leading-relaxed text-foreground/90">{d.text}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </GlassCard>

      </div>
    </>
  );
}

// ---------- KPI card subcomponent ----------

function KpiChannelCard({
  badgeLabel,
  badgeClass,
  icon,
  title,
  canal,
  value,
  sub,
  valueClass,
}: {
  badgeLabel: string;
  badgeClass: string;
  icon: React.ReactNode;
  title: string;
  canal: string;
  value: string;
  sub: string;
  valueClass?: string;
}) {
  return (
    <GlassCard hoverable className="p-5">
      <div className="mb-2 flex items-center justify-between">
        <Badge variant="secondary" className={cn("px-2 text-[10px] font-bold", badgeClass)}>
          {badgeLabel}
        </Badge>
        {icon}
      </div>
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="mt-1 truncate text-base font-semibold">{canal}</div>
      <div className={cn("mt-1 text-xl font-bold tabular-nums", valueClass)}>{value}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>
    </GlassCard>
  );
}
