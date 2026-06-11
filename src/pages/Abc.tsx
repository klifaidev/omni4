import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { EmptyState } from "@/components/pricing/EmptyState";
import { PortfolioMatrix, classifyQuadrant, portfolioMedians } from "@/components/pricing/PortfolioMatrix";
import { AbcPareto, classifyAbc } from "@/components/pricing/AbcPareto";
import { Badge } from "@/components/ui/badge";
import { usePricing } from "@/store/pricing";
import { aggregateBy, applyFilters, getKpiComparisonContext } from "@/lib/analytics";
import { formatBRL, formatPct } from "@/lib/format";
import { useMemo } from "react";
import { AlertTriangle, Download, TrendingDown, TrendingUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { exportTableCsv } from "@/lib/exportCsv";
import { cn } from "@/lib/utils";
import { PricingSimulator } from "@/components/pricing/PricingSimulator";
import { usePageTitle } from "@/hooks/use-page-title";

interface Alert {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  type: "risco" | "descontinuar" | "escalar" | "atencao";
  label: string;
  badgeClass: string;
  sku: string;
  description: string;
  metric: string;
}

export default function Abc() {
  usePageTitle("Portfólio de SKUs");
  const rows = usePricing((s) => s.rows);
  const metric = usePricing((s) => s.metric);
  const filters = usePricing((s) => s.filters);
  const selected = usePricing((s) => s.selectedPeriods);

  const filtered = useMemo(() => applyFilters(rows, filters, selected), [rows, filters, selected]);
  const bySku = useMemo(() => aggregateBy(filtered, metric, (r) => r.skuDesc || r.sku || "—"), [filtered, metric]);

  const previousCtx = useMemo(() => getKpiComparisonContext(rows, filters, selected), [rows, filters, selected]);
  const bySkuPrev = useMemo(
    () => (previousCtx ? aggregateBy(previousCtx.previousRows, metric, (r) => r.skuDesc || r.sku || "—") : []),
    [previousCtx, metric],
  );
  const prevMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of bySkuPrev) m.set(r.key, r.margemPct);
    return m;
  }, [bySkuPrev]);

  const alerts = useMemo<Alert[]>(() => {
    if (bySku.length === 0) return [];
    const { medVol, medMargem } = portfolioMedians(bySku);
    const classified = classifyAbc(bySku);
    const classeMap = new Map(classified.map((c) => [c.key, c.classe]));
    const totalRol = bySku.reduce((s, r) => s + r.rol, 0) || 1;
    const margens = bySku.filter((r) => r.rol > 0).map((r) => r.margemPct).sort((a, b) => a - b);
    const medGlobal = margens.length ? margens[Math.floor(margens.length / 2)] : 0;

    const out: Alert[] = [];
    for (const r of bySku) {
      const classe = classeMap.get(r.key);
      const quad = classifyQuadrant(r.volumeKg, r.margemPct, medVol, medMargem);

      // Classe A com margem abaixo da mediana → "Em risco"
      if (classe === "A" && r.margemPct < medGlobal) {
        out.push({
          id: `risco-${r.key}`,
          icon: TrendingDown,
          type: "risco",
          label: "Em risco",
          badgeClass: "bg-destructive/15 text-destructive border border-destructive/30",
          sku: r.key,
          description: "SKU classe A com margem abaixo da mediana do portfólio",
          metric: `Margem: ${formatPct(r.margemPct)} (mediana ${formatPct(medGlobal)})`,
        });
      }

      // Abacaxi com ROL relevante
      if (quad === "abacaxi" && r.rol / totalRol > 0.005) {
        out.push({
          id: `desc-${r.key}`,
          icon: Trash2,
          type: "descontinuar",
          label: "Avaliar descontinuação",
          badgeClass: "bg-orange-500/15 text-orange-400 border border-orange-500/30",
          sku: r.key,
          description: "Quadrante Abacaxis com participação relevante no ROL",
          metric: `ROL: ${formatBRL(r.rol, { compact: true })} (${formatPct(r.rol / totalRol)} do total)`,
        });
      }

      // Oportunidade com margem >= 1.5x mediana
      if (quad === "oportunidade" && r.margemPct >= 1.5 * medGlobal && medGlobal > 0) {
        out.push({
          id: `escalar-${r.key}`,
          icon: TrendingUp,
          type: "escalar",
          label: "Escalar",
          badgeClass: "bg-primary/15 text-primary border border-primary/30",
          sku: r.key,
          description: "Quadrante Oportunidades com margem muito acima da mediana",
          metric: `Margem: ${formatPct(r.margemPct)} (1,5× mediana)`,
        });
      }

      // Classe A com queda de margem > 3pp vs período anterior
      if (classe === "A" && prevMap.has(r.key)) {
        const prev = prevMap.get(r.key)!;
        const delta = r.margemPct - prev;
        if (delta < -0.03) {
          out.push({
            id: `atencao-${r.key}`,
            icon: AlertTriangle,
            type: "atencao",
            label: "Atenção",
            badgeClass: "bg-warning/15 text-warning border border-warning/30",
            sku: r.key,
            description: "Classe A com queda relevante de margem vs. período anterior",
            metric: `Δ Margem: ${(delta * 100).toFixed(1)}pp (${formatPct(prev)} → ${formatPct(r.margemPct)})`,
          });
        }
      }
    }
    return out;
  }, [bySku, prevMap]);

  if (rows.length === 0)
    return (
      <>
        <Topbar title="Portfólio de SKUs" />
        <div className="px-8 py-6"><EmptyState
          title="Análise de portfólio de SKUs"
          message="Carregue dados para ver a Matriz BCG adaptada, curva ABC com Pareto e alertas automáticos de portfólio."
          actionLabel="Carregar dados"
          actionTo="/upload"
        /></div>
      </>
    );

  const metricLabel = metric === "cm" ? "CM" : "MB";

  return (
    <>
      <Topbar title="Portfólio de SKUs" subtitle="Matriz estratégica, curva ABC e alertas automáticos" />
      <div className="space-y-6 px-8 py-6">
        <GlassCard glow="blue" className="animate-fade-up">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">Matriz de portfólio</h3>
              <p className="text-xs text-muted-foreground">Volume × Margem % — tamanho do círculo proporcional ao ROL</p>
            </div>
          </div>
          <PortfolioMatrix rows={bySku} metricLabel={metricLabel} />
        </GlassCard>

        <GlassCard className="animate-fade-up animation-delay-150">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium">Curva ABC (Pareto)</h3>
              <p className="text-xs text-muted-foreground">Classes A (≤80% ROL acumulado) · B (80–95%) · C (&gt;95%)</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                const classified = classifyAbc(bySku).map((r) => ({
                  sku: r.key,
                  rol: r.rol,
                  cumulPct: r.cumulPct,
                  classe: r.classe,
                  margemPct: r.margemPct,
                  volumeKg: r.volumeKg,
                }));
                exportTableCsv(
                  classified as unknown as Record<string, unknown>[],
                  [
                    { key: "sku", label: "SKU" },
                    { key: "rol", label: "ROL" },
                    { key: "cumulPct", label: "ROL Acumulado %" },
                    { key: "classe", label: "Classe" },
                    { key: "margemPct", label: "Margem %" },
                    { key: "volumeKg", label: "Volume (kg)" },
                  ],
                  "curva_abc",
                );
                toast.success("Arquivo exportado.");
              }}
            >
              <Download className="h-4 w-4" />
              Exportar CSV
            </Button>
          </div>
          <AbcPareto rows={bySku} />
        </GlassCard>

        <GlassCard className="animate-fade-up animation-delay-300">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">Alertas de portfólio</h3>
              <p className="text-xs text-muted-foreground">{alerts.length} insight{alerts.length === 1 ? "" : "s"} gerado{alerts.length === 1 ? "" : "s"} automaticamente</p>
            </div>
          </div>
          {alerts.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Nenhum alerta no momento. 🎉</div>
          ) : (
            <ul className="space-y-2">
              {alerts.map((a) => {
                const Icon = a.icon;
                return (
                  <li
                    key={a.id}
                    className="flex items-start gap-3 rounded-xl border border-border/40 bg-card/40 p-3 transition-colors hover:bg-card/60"
                  >
                    <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", a.badgeClass)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className={cn("px-1.5 text-[10px] font-bold", a.badgeClass)}>
                          {a.label}
                        </Badge>
                        <span className="truncate text-xs font-medium">{a.sku}</span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{a.description}</div>
                    </div>
                    <div className="shrink-0 self-center text-right text-xs font-semibold tabular-nums text-foreground">
                      {a.metric}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </GlassCard>

        <GlassCard>
          <header className="mb-4">
            <h3 className="text-sm font-medium">Simulador de Pricing</h3>
            <p className="text-xs text-muted-foreground">
              Ajuste preço, custo e volume de um SKU e veja o impacto projetado na {metricLabel} total em tempo real.
            </p>
          </header>
          <PricingSimulator rows={filtered} metric={metric} />
          <p className="mt-4 text-[11px] italic text-muted-foreground">
            Simulação baseada nos dados históricos carregados. Não considera elasticidade de demanda ou restrições de mercado.
          </p>
        </GlassCard>
      </div>
    </>
  );
}
