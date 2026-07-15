import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, TrendingUp, UserCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { EmptyState } from "@/components/pricing/EmptyState";
import { SendToSlideHover } from "@/components/pricing/SendToSlideHover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePageTitle } from "@/hooks/use-page-title";
import { formatNum } from "@/lib/format";
import {
  buildPositivacaoSeries,
  buildPositivacaoTotal,
  POSITIVACAO_DIMS,
  type PositivacaoDim,
  type PositivacaoSeries,
} from "@/lib/positivacao";
import { cn } from "@/lib/utils";
import { usePricing } from "@/store/pricing";

const PALETTE = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "#22d3ee",
  "#a78bfa",
  "#f472b6",
];

function dimLabel(dim: PositivacaoDim) {
  return POSITIVACAO_DIMS.find((d) => d.key === dim)?.label ?? dim;
}

export default function Positivacao() {
  usePageTitle("Positivação");
  const rows = usePricing((s) => s.rows);
  const [chartDim, setChartDim] = useState<PositivacaoDim>("categoria");

  const allSeries = useMemo(() => {
    const out = {} as Record<PositivacaoDim, PositivacaoSeries>;
    for (const dim of POSITIVACAO_DIMS) out[dim.key] = buildPositivacaoSeries(rows, dim.key, 13);
    return out;
  }, [rows]);
  const totalSeries = useMemo(() => buildPositivacaoTotal(rows, 13), [rows]);

  const selectedSeries = allSeries[chartDim];
  const lastMonth = totalSeries[totalSeries.length - 1];
  const prevMonth = totalSeries[totalSeries.length - 2];
  const totalLast = lastMonth?.clientes ?? 0;
  const totalPrev = prevMonth?.clientes ?? 0;
  const activeGroups = selectedSeries?.table.filter((r) => r.ultimo > 0).length ?? 0;

  if (rows.length === 0) {
    return (
      <>
        <Topbar title="Positivação" />
        <div className="px-8 py-6">
          <EmptyState
            title="Positivação da base Real"
            message="Carregue a base Real para acompanhar clientes ativos por categoria, marca, canal ajustado e gestor responsável."
            actionLabel="Carregar dados"
            actionTo="/upload"
          />
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Positivação" subtitle="Evolução de clientes ativos nos últimos 13 meses" />
      <div className="space-y-6 px-8 py-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <KpiCard
            icon={Users}
            label="Positivação atual"
            value={formatNum(totalLast, 0)}
            sub={lastMonth ? `Clientes únicos ativos em ${lastMonth.label}` : "Sem mês disponível"}
          />
          <KpiCard
            icon={TrendingUp}
            label="Variação vs mês anterior"
            value={`${totalLast - totalPrev >= 0 ? "+" : ""}${formatNum(totalLast - totalPrev, 0)}`}
            sub={`Anterior: ${formatNum(totalPrev, 0)}`}
            tone={totalLast >= totalPrev ? "success" : "danger"}
          />
          <KpiCard
            icon={UserCheck}
            label={`Aberturas ativas por ${dimLabel(chartDim)}`}
            value={formatNum(activeGroups, 0)}
            sub="Grupos com pelo menos 1 cliente ativo no último mês"
            tone="accent"
          />
        </div>

        <SendToSlideHover
          payload={{
            source: { page: "Positivação", visualization: "Evolutivo de positivação" },
            target: { blockKind: "omni_positivacao", blockLabel: "Positivação" },
            config: { chartType: "line", dim: chartDim, topN: 8, dataSource: "ke30" },
          }}
        >
        <GlassCard glow="blue">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Evolutivo de positivação</h2>
              <p className="text-xs text-muted-foreground">
                Clientes únicos ativos por mês · top 8 de {dimLabel(chartDim)}
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              {POSITIVACAO_DIMS.map((d) => (
                <Button
                  key={d.key}
                  size="sm"
                  variant={chartDim === d.key ? "default" : "outline"}
                  className="h-8 px-3 text-xs"
                  onClick={() => setChartDim(d.key)}
                >
                  {d.label}
                </Button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={360}>
            <LineChart data={selectedSeries.chartData} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
              <CartesianGrid stroke="hsl(var(--border) / 0.4)" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} allowDecimals={false} />
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
                            <span className="tabular-nums text-foreground">{formatNum(Number(p.value), 0)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {selectedSeries.chartKeys.map((key, i) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={PALETTE[i % PALETTE.length]}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </GlassCard>
        </SendToSlideHover>

        <div className="space-y-6">
          {POSITIVACAO_DIMS.map((dim) => (
            <SendToSlideHover
              key={dim.key}
              payload={{
                source: { page: "Positivação", visualization: `Tabela de positivação - ${dim.label}` },
                target: { blockKind: "table", blockLabel: "Tabela" },
                config: { table: "positivacao", dimension: dim.key, dataSource: "ke30" },
              }}
            >
              <PositivacaoTable title={dim.label} series={allSeries[dim.key]} />
            </SendToSlideHover>
          ))}
        </div>
      </div>
    </>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "primary",
}: {
  icon: typeof Users;
  label: string;
  value: string;
  sub: string;
  tone?: "primary" | "success" | "danger" | "accent";
}) {
  const toneClass =
    tone === "success" ? "text-success bg-success/10" :
    tone === "danger" ? "text-destructive bg-destructive/10" :
    tone === "accent" ? "text-accent bg-accent/10" :
    "text-primary bg-primary/10";
  return (
    <GlassCard className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
          <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
        </div>
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", toneClass)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </GlassCard>
  );
}

function PositivacaoTable({ title, series }: { title: string; series: PositivacaoSeries }) {
  const fileName = `positivacao_${title.toLowerCase().replace(/[^a-z0-9]+/gi, "_")}.csv`;

  function exportCsv() {
    const header = ["Abertura", ...series.months.map((m) => m.label), "Último", "Média 13m", "Δ mês"];
    const lines = [header, ...series.table.map((r) => [
      r.key,
      ...series.months.map((m) => r.months[m.periodo] ?? 0),
      r.ultimo,
      r.media.toFixed(1),
      r.delta,
    ])];
    const csv = lines.map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Tabela de ${title} exportada.`);
  }

  return (
    <GlassCard className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-[11px] text-muted-foreground">Evolutivo de positivação dos últimos 13 meses</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={exportCsv}>
          <Download className="h-4 w-4" />
          Exportar CSV
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="sticky left-0 z-10 bg-muted px-4 py-3 text-left">{title}</th>
              {series.months.map((m) => (
                <th key={m.periodo} className="px-3 py-3 text-right">{m.label}</th>
              ))}
              <th className="px-3 py-3 text-right">Último</th>
              <th className="px-3 py-3 text-right">Média</th>
              <th className="px-4 py-3 text-right">Δ mês</th>
            </tr>
          </thead>
          <tbody>
            {series.table.map((r) => (
              <tr key={r.key} className="border-t border-border/40">
                <td className="sticky left-0 z-10 max-w-[280px] bg-card px-4 py-3 font-medium">
                  <div className="truncate">{r.key}</div>
                </td>
                {series.months.map((m) => (
                  <td key={m.periodo} className="px-3 py-3 text-right tabular-nums">
                    {formatNum(r.months[m.periodo] ?? 0, 0)}
                  </td>
                ))}
                <td className="px-3 py-3 text-right font-semibold tabular-nums">{formatNum(r.ultimo, 0)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatNum(r.media, 1)}</td>
                <td className="px-4 py-3 text-right">
                  <Badge
                    variant="outline"
                    className={cn(
                      "tabular-nums",
                      r.delta > 0 && "border-success/30 bg-success/10 text-success",
                      r.delta < 0 && "border-destructive/30 bg-destructive/10 text-destructive",
                      r.delta === 0 && "border-border/60 bg-muted/40 text-muted-foreground",
                    )}
                  >
                    {r.delta >= 0 ? "+" : ""}
                    {formatNum(r.delta, 0)}
                  </Badge>
                </td>
              </tr>
            ))}
            {series.table.length === 0 && (
              <tr>
                <td colSpan={series.months.length + 4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Sem clientes ativos para esta abertura.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}
