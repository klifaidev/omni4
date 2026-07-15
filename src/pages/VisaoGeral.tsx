import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { KpiCard } from "@/components/pricing/KpiCard";
import { SendToSlideHover } from "@/components/pricing/SendToSlideHover";
import { AbcBar } from "@/components/pricing/AbcBar";
import { DataTable } from "@/components/pricing/DataTable";
import { EmptyState } from "@/components/pricing/EmptyState";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { exportTableCsv } from "@/lib/exportCsv";
import { usePricing } from "@/store/pricing";
import {
  aggregateBy,
  applyFilters,
  computeKPIs,
  computeKPIComparison,
  getKpiComparisonContext,
  computeCanalTrend,
} from "@/lib/analytics";
import { formatBRL, formatNum, formatPct, formatTon } from "@/lib/format";
import { useMemo, useState } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { usePageTitle } from "@/hooks/use-page-title";

type PerfBy = "categoria" | "subcategoria" | "sku";
type HeatMetric = "cm" | "mb";

// FY runs April–March; column order:
const FY_MONTH_ORDER = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];

const MES_NOMES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

function formatPeriodo(p: string): string {
  // Aceita "MM.YYYY", "MMM.YYYY" (ex.: 005.2025), "YYYY-MM", "YYYYMM"
  let mes = 0;
  let ano = 0;
  let m = p.match(/^0*(\d{1,2})[./-](\d{4})$/);
  if (m) { mes = parseInt(m[1], 10); ano = parseInt(m[2], 10); }
  else if ((m = p.match(/^(\d{4})[-/.]?(\d{2})$/))) { ano = parseInt(m[1], 10); mes = parseInt(m[2], 10); }
  if (!mes || !ano) return p;
  return `${MES_NOMES[mes - 1] ?? mes}/${String(ano).slice(-2)}`;
}

function periodoLabel(selected: string[] | null, allPeriods: string[]): string {
  if (!selected || selected.length === 0 || selected.length === allPeriods.length) {
    if (allPeriods.length === 0) return "Sem períodos";
    const first = formatPeriodo(allPeriods[0]);
    const last = formatPeriodo(allPeriods[allPeriods.length - 1]);
    return `Todos os meses do histórico (${first} – ${last})`;
  }
  if (selected.length === 1) return `Mês selecionado: ${formatPeriodo(selected[0])}`;
  const sorted = [...selected].sort();
  return `${sorted.length} meses selecionados (${formatPeriodo(sorted[0])} – ${formatPeriodo(sorted[sorted.length - 1])})`;
}

export default function VisaoGeral() {
  usePageTitle("Visão Geral");
  const rows = usePricing((s) => s.rows);
  const metric = usePricing((s) => s.metric);
  const filters = usePricing((s) => s.filters);
  const selected = usePricing((s) => s.selectedPeriods);

  const [perfBy, setPerfBy] = useState<PerfBy>("categoria");
  const heatMetric: HeatMetric = metric;
  const heatMetricLabel = heatMetric === "cm" ? "Margem de Contribuição %" : "Margem Bruta %";

  const filtered = useMemo(() => applyFilters(rows, filters, selected), [rows, filters, selected]);
  const kpis = useMemo(() => computeKPIs(filtered, metric), [filtered, metric]);

  const comparison = useMemo(() => {
    const ctx = getKpiComparisonContext(rows, filters, selected);
    if (!ctx) return null;
    const cmp = computeKPIComparison(filtered, ctx.previousRows, metric);
    return { ...cmp, label: ctx.label };
  }, [rows, filters, selected, filtered, metric]);

  const allPeriods = useMemo(
    () => Array.from(new Set(rows.map((r) => r.periodo))).sort(),
    [rows],
  );
  const periodoInfo = useMemo(() => periodoLabel(selected, allPeriods), [selected, allPeriods]);

  const monthlyTrend = useMemo(
    () =>
      computeCanalTrend(filtered, null, metric).map((p) => ({
        ...p,
        margemPctNum: p.margemPct * 100,
      })),
    [filtered, metric],
  );

  const bySku = useMemo(
    () => aggregateBy(filtered, metric, (r) => r.skuDesc || r.sku || "—"),
    [filtered, metric],
  );

  const byPerf = useMemo(
    () =>
      aggregateBy(filtered, metric, (r) => {
        if (perfBy === "categoria") return r.categoria || "Sem categoria";
        if (perfBy === "subcategoria") return r.subcategoria || "Sem subcategoria";
        return r.skuDesc || r.sku || "—";
      }),
    [filtered, metric, perfBy],
  );

  // Threshold para ranking de margem %: 1% do ROL total (filtra ruído de SKUs minúsculos)
  const minRolForPct = useMemo(() => kpis.rol * 0.01, [kpis.rol]);

  // ===== Heatmap de sazonalidade =====
  const heatmap = useMemo(() => {
    const acc = new Map<string, Map<number, { margem: number; rol: number }>>();
    const fySet = new Set<string>();
    const fyNumMap = new Map<string, number>();
    for (const r of filtered) {
      const margem = heatMetric === "cm" ? r.contribMarginal : r.margemBruta;
      const rol = r.rol;
      if (!Number.isFinite(margem) || !Number.isFinite(rol)) continue;
      fySet.add(r.fy);
      fyNumMap.set(r.fy, r.fyNum);
      let byMonth = acc.get(r.fy);
      if (!byMonth) {
        byMonth = new Map();
        acc.set(r.fy, byMonth);
      }
      const cell = byMonth.get(r.mes) ?? { margem: 0, rol: 0 };
      cell.margem += margem;
      cell.rol += rol;
      byMonth.set(r.mes, cell);
    }
    const fys = Array.from(fySet).sort((a, b) => (fyNumMap.get(a) ?? 0) - (fyNumMap.get(b) ?? 0));
    const matrix: { fy: string; cells: (number | null)[] }[] = fys.map((fy) => {
      const byMonth = acc.get(fy)!;
      const cells = FY_MONTH_ORDER.map((m) => {
        const c = byMonth.get(m);
        if (!c || c.rol === 0) return null;
        return c.margem / c.rol;
      });
      return { fy, cells };
    });
    const allVals = matrix.flatMap((r) => r.cells.filter((v): v is number => v !== null));
    const min = allVals.length ? Math.min(...allVals) : 0;
    const max = allVals.length ? Math.max(...allVals) : 0;

    // Avg per month across all FYs (weighted by rol)
    const monthAvg = new Map<number, { margem: number; rol: number }>();
    for (const byMonth of acc.values()) {
      for (const [m, c] of byMonth.entries()) {
        const cur = monthAvg.get(m) ?? { margem: 0, rol: 0 };
        cur.margem += c.margem;
        cur.rol += c.rol;
        monthAvg.set(m, cur);
      }
    }
    const monthlyAverages = FY_MONTH_ORDER.map((m) => ({
      mes: m,
      pct: monthAvg.has(m) && monthAvg.get(m)!.rol > 0 ? monthAvg.get(m)!.margem / monthAvg.get(m)!.rol : null,
    })).filter((x) => x.pct !== null) as { mes: number; pct: number }[];

    let best: { mes: number; pct: number } | null = null;
    let worst: { mes: number; pct: number } | null = null;
    for (const m of monthlyAverages) {
      if (!best || m.pct > best.pct) best = m;
      if (!worst || m.pct < worst.pct) worst = m;
    }
    return { matrix, min, max, best, worst, hasData: allVals.length > 0 };
  }, [filtered, heatMetric]);

  function heatColor(v: number | null): { bg: string; color: string } {
    if (v === null) return { bg: "hsl(var(--muted) / 0.4)", color: "hsl(var(--muted-foreground))" };
    const range = heatmap.max - heatmap.min;
    const t = range > 0 ? (v - heatmap.min) / range : 0.5;
    // interpolate hue 0 (red) → 158 (green); s 84→64; l 65→52
    const h = 0 + (158 - 0) * t;
    const s = 84 + (64 - 84) * t;
    const l = 65 + (52 - 65) * t;
    const bg = `hsl(${h.toFixed(0)} ${s.toFixed(0)}% ${l.toFixed(0)}%)`;
    // text: white when l is low, dark otherwise
    const color = l < 58 ? "hsl(0 0% 100%)" : "hsl(220 30% 12%)";
    return { bg, color };
  }

  if (rows.length === 0) {
    return (
      <>
        <Topbar title="Visão Geral" />
        <div className="px-8 py-6">
          <EmptyState
            title="Visão geral do portfólio"
            message="Carregue seus CSVs mensais para ver KPIs, evolução histórica e performance por categoria."
            actionLabel="Carregar dados"
            actionTo="/upload"
          />
        </div>
      </>
    );
  }

  const perfLabel = perfBy === "categoria" ? "Categoria" : perfBy === "subcategoria" ? "Subcategoria" : "SKU";

  return (
    <>
      <Topbar title="Visão Geral" subtitle="Indicadores e composição agregada" />
      <div className="space-y-6 px-8 py-6">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs font-normal">
            📅 {periodoInfo}
          </Badge>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="ROL Total"
            value={formatBRL(kpis.rol, { compact: true })}
            subValue={formatBRL(kpis.rol)}
            accent="blue"
            glow="blue"
            delta={comparison?.deltaPct.rol}
            deltaLabel={comparison?.label}
            sendToSlide={{
              source: { page: "Visão Geral", visualization: "KPI - ROL Total" },
              target: { blockKind: "kpi", blockLabel: "KPI" },
              config: { label: "ROL Total", measure: "rol", dataSource: "ke30", filters, selectedPeriods: selected },
            }}
          />
          <KpiCard
            className="animation-delay-100"
            label={metric === "cm" ? "Contrib. Marginal" : "Margem Bruta"}
            value={formatBRL(kpis.margem, { compact: true })}
            subValue={formatPct(kpis.margemPct)}
            accent="green"
            glow="green"
            delta={comparison?.deltaPct.margem}
            deltaLabel={comparison?.label}
            sendToSlide={{
              source: { page: "Visão Geral", visualization: `KPI - ${metric === "cm" ? "Contrib. Marginal" : "Margem Bruta"}` },
              target: { blockKind: "kpi", blockLabel: "KPI" },
              config: { label: metric === "cm" ? "Contrib. Marginal" : "Margem Bruta", measure: metric, dataSource: "ke30", filters, selectedPeriods: selected },
            }}
          />
          <KpiCard
            className="animation-delay-200"
            label="Volume"
            value={formatTon(kpis.volumeKg)}
            subValue={`${formatNum(kpis.volumeKg)} t`}
            accent="amber"
            delta={comparison?.deltaPct.volumeKg}
            deltaLabel={comparison?.label}
            sendToSlide={{
              source: { page: "Visão Geral", visualization: "KPI - Volume" },
              target: { blockKind: "kpi", blockLabel: "KPI" },
              config: { label: "Volume", measure: "volume", dataSource: "ke30", filters, selectedPeriods: selected },
            }}
          />
          <KpiCard
            className="animation-delay-300"
            label="SKUs ativos"
            value={formatNum(kpis.skus)}
            accent="violet"
            delta={comparison?.deltaPct.skus}
            deltaLabel={comparison?.label}
            sendToSlide={{
              source: { page: "Visão Geral", visualization: "KPI - SKUs ativos" },
              target: { blockKind: "kpi", blockLabel: "KPI" },
              config: { label: "SKUs ativos", measure: "skus", dataSource: "ke30", filters, selectedPeriods: selected },
            }}
          />
        </div>

        <SendToSlideHover
          payload={{
            source: { page: "Visão Geral", visualization: "Evolução mensal - ROL, Margem % e Volume" },
            target: { blockKind: "omni_evolucao_mensal", blockLabel: "Evolução Mensal" },
            config: { metric, breakdown: null, chartType: "line", filters, selectedPeriods: selected },
          }}
        >
        <GlassCard>
          <header className="mb-4">
            <h2 className="text-lg font-medium">Evolução mensal — ROL, Margem % e Volume</h2>
            <p className="text-xs text-muted-foreground">
              Linha do tempo do período carregado — leitura imediata de tendência.
            </p>
          </header>
          {monthlyTrend.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Sem dados mensais para exibir.</div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={monthlyTrend} margin={{ top: 10, right: 24, bottom: 8, left: 8 }}>
                <CartesianGrid stroke="hsl(var(--border) / 0.4)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  tickFormatter={(v) => formatBRL(Number(v), { compact: true })}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover) / 0.95)",
                    border: "1px solid hsl(var(--border) / 0.6)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value: number, name: string) => {
                    if (name === "Margem %") return [`${value.toFixed(1)}%`, name];
                    if (name === "Volume (kg)") return [formatTon(value), name];
                    return [formatBRL(value, { compact: true }), name];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar
                  yAxisId="left"
                  dataKey="volumeKg"
                  name="Volume (kg)"
                  fill="hsl(var(--warning) / 0.35)"
                  stroke="hsl(var(--warning) / 0.6)"
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="rol"
                  name="ROL (R$)"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2.2}
                  dot={{ r: 3 }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="margemPctNum"
                  name="Margem %"
                  stroke="hsl(var(--success))"
                  strokeWidth={2.2}
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </GlassCard>
        </SendToSlideHover>

        <SendToSlideHover
          payload={{
            source: { page: "Visão Geral", visualization: "Sazonalidade - Margem % por mês x ano fiscal" },
            target: { blockKind: "omni_heatmap_sazonalidade", blockLabel: "Heatmap Sazonalidade" },
            config: { metric: heatMetric, filters, selectedPeriods: selected },
          }}
        >
        <GlassCard>
          <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium">Sazonalidade — Margem % por mês × ano fiscal</h2>
              <p className="text-xs text-muted-foreground">
                Identifique padrões sazonais. Cores relativas ao mínimo e máximo do conjunto filtrado.
              </p>
            </div>
            <Badge variant="outline" className="shrink-0">
              {heatMetricLabel}
            </Badge>
          </header>

          {!heatmap.hasData ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Sem dados suficientes para gerar o heatmap.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <div
                  className="grid gap-1 min-w-[640px]"
                  style={{ gridTemplateColumns: `90px repeat(12, minmax(48px, 1fr))` }}
                >
                  <div />
                  {FY_MONTH_ORDER.map((m) => (
                    <div key={m} className="text-center text-[11px] font-medium text-muted-foreground py-1">
                      {MES_NOMES[m - 1]}
                    </div>
                  ))}
                  {heatmap.matrix.map((row) => (
                    <div key={row.fy} className="contents">
                      <div className="flex items-center text-xs font-medium text-muted-foreground pr-2">
                        {row.fy}
                      </div>
                      {row.cells.map((v, idx) => {
                        const { bg, color } = heatColor(v);
                        return (
                          <div
                            key={idx}
                            className="h-12 rounded-md flex items-center justify-center text-xs font-medium tabular-nums"
                            style={{ background: bg, color }}
                            title={`${row.fy} · ${MES_NOMES[FY_MONTH_ORDER[idx] - 1]}: ${v === null ? "sem dados" : formatPct(v)}`}
                          >
                            {v === null ? "—" : formatPct(v)}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              {heatmap.best && heatmap.worst && heatmap.best.mes !== heatmap.worst.mes && (
                <div className="mt-4 rounded-lg border border-border/40 bg-muted/30 px-4 py-3 text-sm">
                  <span className="font-medium">Padrão detectado: </span>
                  Historicamente, <span className="font-semibold text-success">{MES_NOMES[heatmap.best.mes - 1]}</span>{" "}
                  é o melhor mês (média {formatPct(heatmap.best.pct)}) e{" "}
                  <span className="font-semibold text-destructive">{MES_NOMES[heatmap.worst.mes - 1]}</span>{" "}
                  é o mais fraco (média {formatPct(heatmap.worst.pct)}).
                </div>
              )}
            </>
          )}
        </GlassCard>
        </SendToSlideHover>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SendToSlideHover
            payload={{
              source: { page: "Visão Geral", visualization: "Heróis - Top 5 SKUs por Margem %" },
              target: { blockKind: "omni_herois_ofensores", blockLabel: "Heróis e Ofensores" },
              config: { dim: "skuDesc", variant: "hero", sortBy: "margemPct", topN: 5, filters, selectedPeriods: selected },
            }}
          >
          <GlassCard glow="green">
            <h3 className="mb-1 text-sm font-medium text-success">🏆 Heróis (Top 5 SKUs por Margem %)</h3>
            <p className="mb-4 text-[11px] text-muted-foreground">
              Maior margem % — apenas SKUs com ROL ≥ {formatBRL(minRolForPct, { compact: true })}
            </p>
            <AbcBar rows={bySku} variant="hero" sortBy="margemPct" minRolForPct={minRolForPct} />
          </GlassCard>
          </SendToSlideHover>
          <SendToSlideHover
            payload={{
              source: { page: "Visão Geral", visualization: "Ofensores - Top 5 SKUs por Margem %" },
              target: { blockKind: "omni_herois_ofensores", blockLabel: "Heróis e Ofensores" },
              config: { dim: "skuDesc", variant: "villain", sortBy: "margemPct", topN: 5, filters, selectedPeriods: selected },
            }}
          >
          <GlassCard className="border-l-4 border-destructive">
            <h3 className="mb-1 text-sm font-medium text-destructive">⚠️ Ofensores (Top 5 SKUs por Margem %)</h3>
            <p className="mb-4 text-[11px] text-muted-foreground">
              Menor margem % — apenas SKUs com ROL ≥ {formatBRL(minRolForPct, { compact: true })}
            </p>
            <AbcBar rows={bySku} variant="villain" sortBy="margemPct" minRolForPct={minRolForPct} />
          </GlassCard>
          </SendToSlideHover>
        </div>

        <SendToSlideHover
          payload={{
            source: { page: "Visão Geral", visualization: `Performance por ${perfLabel}` },
            target: { blockKind: "table", blockLabel: "Tabela" },
            config: { table: "performance", dimension: perfBy, metric, filters, selectedPeriods: selected },
          }}
        >
        <GlassCard>
          <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-medium">Performance por {perfLabel}</h3>
            <div className="flex flex-wrap items-center gap-2">
              <ToggleGroup
                type="single"
                value={perfBy}
                onValueChange={(v) => v && setPerfBy(v as PerfBy)}
                variant="outline"
                size="sm"
              >
                <ToggleGroupItem value="categoria">Categoria</ToggleGroupItem>
                <ToggleGroupItem value="subcategoria">Subcategoria</ToggleGroupItem>
                <ToggleGroupItem value="sku">SKU</ToggleGroupItem>
              </ToggleGroup>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => {
                  exportTableCsv(
                    byPerf as unknown as Record<string, unknown>[],
                    [
                      { key: "key", label: perfLabel },
                      { key: "rol", label: "ROL" },
                      { key: "margem", label: metric === "cm" ? "CM" : "MB" },
                      { key: "margemPct", label: "Margem %" },
                      { key: "volumeKg", label: "Volume (kg)" },
                      { key: "rolPorKg", label: "ROL/kg" },
                    ],
                    `performance_${perfBy}`,
                  );
                  toast.success("Arquivo exportado.");
                }}
              >
                <Download className="h-4 w-4" />
                Exportar CSV
              </Button>
            </div>
          </header>
          <DataTable
            rows={byPerf as unknown as Record<string, unknown>[]}
            pageSize={50}
            columns={[
              { key: "key", label: perfLabel, align: "left", format: (v) => <span className="font-medium">{String(v)}</span> },
              { key: "rol", label: "ROL", align: "right", format: (v) => formatBRL(Number(v), { compact: true }) },
              { key: "margem", label: metric === "cm" ? "CM" : "MB", align: "right", format: (v) => formatBRL(Number(v), { compact: true }) },
              { key: "margemPct", label: "Mg %", align: "right", format: (v) => formatPct(Number(v)) },
              { key: "volumeKg", label: "Volume", align: "right", format: (v) => formatTon(Number(v)) },
              { key: "rolPorKg", label: "ROL/kg", align: "right", format: (v) => formatBRL(Number(v), { digits: 2 }) },
            ]}
          />
        </GlassCard>
        </SendToSlideHover>
      </div>
    </>
  );
}
