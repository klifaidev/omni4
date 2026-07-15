import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { DataTable, type DataTableColumn } from "@/components/pricing/DataTable";
import { EmptyState } from "@/components/pricing/EmptyState";
import { SendToSlideHover } from "@/components/pricing/SendToSlideHover";
import { Badge } from "@/components/ui/badge";
import { applyFilters, computeKPIs } from "@/lib/analytics";
import { formatBRL, formatNum, formatPct, formatTon } from "@/lib/format";
import type { PricingRow } from "@/lib/types";
import { usePageTitle } from "@/hooks/use-page-title";
import { usePricing } from "@/store/pricing";
import { Lightbulb, PackageCheck, Percent, Scale, Sparkles } from "lucide-react";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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

const PALETTE = [
  "hsl(var(--primary))",
  "hsl(var(--muted-foreground))",
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
  icon: React.ReactNode;
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
  const metricLabel = metric === "cm" ? "CM" : "MB";

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
            value={`${marginDiffPp >= 0 ? "+" : ""}${marginDiffPp.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}pp`}
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
                  {" "}no período analisado ({mixTrend.deltaPp >= 0 ? "+" : ""}
                  {mixTrend.deltaPp.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}pp).
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
