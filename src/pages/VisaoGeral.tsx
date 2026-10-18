import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { KpiCard } from "@/components/pricing/KpiCard";
import { SendToSlideHover } from "@/components/pricing/SendToSlideHover";
import { EvolucaoMensalVisual } from "@/components/pricing/tabVisuals/EvolucaoMensalVisual";
import { HeroisVisual } from "@/components/pricing/tabVisuals/HeroisVisual";
import { SazonalidadeVisual } from "@/components/pricing/tabVisuals/SazonalidadeVisual";
import { computeSazonalidade } from "@/components/pricing/tabVisuals/visaoGeralData";
import { computeEvolucaoMensal } from "@/components/pricing/tabVisuals/evolucaoMensal";
import { TAB_VISUAL_IDS } from "@/components/pricing/tabVisuals/registry";
import { tabVisualPayload } from "@/lib/sendToSlide";
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
} from "@/lib/analytics";
import { formatBRL, formatNum, formatPct, formatTon } from "@/lib/format";
import { useMemo, useState } from "react";
import { usePageTitle } from "@/hooks/use-page-title";

type PerfBy = "categoria" | "subcategoria" | "sku";
type HeatMetric = "cm" | "mb";

const MES_NOMES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

function parsePeriodo(p: string): { mes: number; ano: number } | null {
  // Aceita "MM.YYYY", "MMM.YYYY" (ex.: 005.2025), "YYYY-MM", "YYYYMM"
  let mes = 0;
  let ano = 0;
  let m = p.match(/^0*(\d{1,2})[./-](\d{4})$/);
  if (m) { mes = parseInt(m[1], 10); ano = parseInt(m[2], 10); }
  else if ((m = p.match(/^(\d{4})[-/.]?(\d{2})$/))) { ano = parseInt(m[1], 10); mes = parseInt(m[2], 10); }
  if (!mes || !ano) return null;
  return { mes, ano };
}

function formatPeriodo(p: string): string {
  const parsed = parsePeriodo(p);
  if (!parsed) return p;
  return `${MES_NOMES[parsed.mes - 1] ?? parsed.mes}/${String(parsed.ano).slice(-2)}`;
}

/**
 * Chave numérica cronológica (ano*100+mês) pra ordenar períodos — usar
 * `.sort()` puro numa string tipo "MM.YYYY" ordena por mês primeiro (achado
 * do usuário: "Jan/26 – Dez/25" aparecia com o mês mais novo primeiro).
 */
function periodoSortKey(p: string): number {
  const parsed = parsePeriodo(p);
  return parsed ? parsed.ano * 100 + parsed.mes : 0;
}

function periodoLabel(selected: string[] | null, allPeriods: string[]): string {
  if (!selected || selected.length === 0 || selected.length === allPeriods.length) {
    if (allPeriods.length === 0) return "Sem períodos";
    const first = formatPeriodo(allPeriods[0]);
    const last = formatPeriodo(allPeriods[allPeriods.length - 1]);
    return `Todos os meses do histórico (${first} – ${last})`;
  }
  if (selected.length === 1) return `Mês selecionado: ${formatPeriodo(selected[0])}`;
  const sorted = [...selected].sort((a, b) => periodoSortKey(a) - periodoSortKey(b));
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
    () => Array.from(new Set(rows.map((r) => r.periodo))).sort((a, b) => periodoSortKey(a) - periodoSortKey(b)),
    [rows],
  );
  const periodoInfo = useMemo(() => periodoLabel(selected, allPeriods), [selected, allPeriods]);

  const monthlyTrend = useMemo(() => computeEvolucaoMensal(filtered, { metric }), [filtered, metric]);

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
  const heroisData = useMemo(() => ({ bySku, minRolForPct }), [bySku, minRolForPct]);

  // ===== Heatmap de sazonalidade =====
  const heatmap = useMemo(() => computeSazonalidade(filtered, heatMetric), [filtered, heatMetric]);


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

        {/* Roteiro Visual, item 2.3: ROL Total vira o número âncora da tela
            (hero), em vez de competir em tamanho igual com os outros 3 KPIs
            numa grade uniforme. */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
          <KpiCard
            size="hero"
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-1">
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
        </div>

        <SendToSlideHover
          payload={tabVisualPayload({
            page: "Visão Geral",
            visualization: "Evolução mensal — ROL, Margem % e Volume",
            visualId: TAB_VISUAL_IDS.evolucaoMensal,
            params: { metric },
            filters,
            selectedPeriods: selected,
          })}
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
            // Mesmo componente que o slide desenha ao receber este visual.
            <div className="h-[320px]">
              <EvolucaoMensalVisual data={monthlyTrend} variant="tab" />
            </div>
          )}
        </GlassCard>
        </SendToSlideHover>

        <SendToSlideHover
          payload={tabVisualPayload({
            page: "Visão Geral",
            visualization: "Sazonalidade — Margem % por mês × ano fiscal",
            visualId: TAB_VISUAL_IDS.sazonalidade,
            params: { metric: heatMetric },
            filters,
            selectedPeriods: selected,
          })}
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
            // Mesmo componente que o slide desenha ao receber este visual.
            <SazonalidadeVisual data={heatmap} variant="tab" />
          )}
        </GlassCard>
        </SendToSlideHover>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SendToSlideHover
            payload={tabVisualPayload({
              page: "Visão Geral",
              visualization: "Heróis — Top 5 SKUs por Margem %",
              visualId: TAB_VISUAL_IDS.herois,
              params: { variant: "hero", metric },
              filters,
              selectedPeriods: selected,
            })}
          >
          <GlassCard glow="green">
            <h3 className="mb-1 text-sm font-medium text-success">🏆 Heróis (Top 5 SKUs por Margem %)</h3>
            <HeroisVisual data={heroisData} params={{ variant: "hero" }} />
          </GlassCard>
          </SendToSlideHover>
          <SendToSlideHover
            payload={tabVisualPayload({
              page: "Visão Geral",
              visualization: "Ofensores — Top 5 SKUs por Margem %",
              visualId: TAB_VISUAL_IDS.herois,
              params: { variant: "villain", metric },
              filters,
              selectedPeriods: selected,
            })}
          >
          <GlassCard glow="red" className="border border-destructive/25">
            <h3 className="mb-1 text-sm font-medium text-destructive">⚠️ Ofensores (Top 5 SKUs por Margem %)</h3>
            <HeroisVisual data={heroisData} params={{ variant: "villain" }} />
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
