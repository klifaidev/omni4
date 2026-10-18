import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { DataTable, type DataTableColumn } from "@/components/pricing/DataTable";
import { EmptyState } from "@/components/pricing/EmptyState";
import { SendToSlideHover } from "@/components/pricing/SendToSlideHover";
import {
  InovCanalMixVisual, InovHeroisVisual, InovMaturidadeVisual, InovMargemVisual, InovMixVisual, InovPrecoVisual,
} from "@/components/pricing/tabVisuals/InovacaoVisuals";
import {
  computeChannelMix, computeChannelMixMonthly, computeInnovationHeroes, computeInnovationMargin, computeInnovationMix,
  computeInnovationPrice, computeMaturity, formatPp, isInnovationRow,
} from "@/components/pricing/tabVisuals/inovacaoData";
import { TAB_VISUAL_IDS } from "@/components/pricing/tabVisuals/registry";
import { tabVisualPayload } from "@/lib/sendToSlide";
import { Badge } from "@/components/ui/badge";
import { applyFilters, computeKPIs } from "@/lib/analytics";
import { formatBRL, formatNum, formatPct, formatTon } from "@/lib/format";
import { usePageTitle } from "@/hooks/use-page-title";
import { useInovacaoDepara } from "@/store/inovacaoDepara";
import { usePricing } from "@/store/pricing";
import { Lightbulb, PackageCheck, Percent, Scale, Sparkles } from "lucide-react";
import { useMemo, type ReactNode } from "react";

interface InnovationSummaryRow extends Record<string, unknown> {
  classificacao: string;
  rol: number;
  volumeKg: number;
  margemPct: number;
  skus: number;
  mixRol: number;
  mixVolume: number;
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

  const innovationBase = useMemo(
    () => ({ innovationRows, regularRows, totalKpis, innovationKpis, regularKpis }),
    [innovationRows, regularRows, totalKpis, innovationKpis, regularKpis],
  );
  // As contas abaixo são as mesmas que o slide faz (tabVisuals/inovacaoData).
  const mixData = useMemo(() => computeInnovationMix(filtered), [filtered]);
  const mixTrend = mixData.trend;

  const maturity = useMemo(() => computeMaturity(rows, filtered, innovationMap), [filtered, innovationMap, rows]);

  const heroesOffenders = useMemo(
    () => computeInnovationHeroes(rows, filters, selected, innovationBase, metric),
    [rows, filters, selected, innovationBase, metric],
  );

  const priceComparison = useMemo(() => computeInnovationPrice(filtered, innovationBase), [filtered, innovationBase]);

  const channelMix = useMemo(() => computeChannelMix(filtered, innovationKpis.volumeKg), [filtered, innovationKpis.volumeKg]);

  // Histórico mês a mês (últimos 13 meses) do mix de inovação por canal —
  // não fica preso ao filtro de período selecionado.
  const channelMixMonthly = useMemo(() => computeChannelMixMonthly(rows, filters, channelMix), [rows, filters, channelMix]);
  const marginData = useMemo(() => computeInnovationMargin(innovationBase, metric), [innovationBase, metric]);

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
  const marginDiffPp = marginData.marginDiffPp;
  const innovationMixEffectPp = marginData.innovationMixEffectPp;
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
          payload={tabVisualPayload({
            page: "Inovação",
            visualization: "Participação mensal de volume",
            visualId: TAB_VISUAL_IDS.inovMix,
            params: {},
            filters,
            selectedPeriods: selected,
          })}
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
            {/* Mesmo componente que o slide desenha ao receber este visual. */}
            <div className="h-[356px]">
              <InovMixVisual data={mixData} variant="tab" />
            </div>
          </GlassCard>
        </SendToSlideHover>

        <SendToSlideHover
          payload={tabVisualPayload({
            page: "Inovação",
            visualization: "Margem Inovação vs Regular",
            visualId: TAB_VISUAL_IDS.inovMargem,
            params: { metric },
            filters,
            selectedPeriods: selected,
          })}
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

            <InovMargemVisual data={marginData} />
          </GlassCard>
        </SendToSlideHover>

        <SendToSlideHover
          payload={tabVisualPayload({
            page: "Inovação",
            visualization: "Curva de maturação por safra",
            visualId: TAB_VISUAL_IDS.inovMaturidade,
            params: {},
            filters,
            selectedPeriods: selected,
          })}
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

            <div className={maturity.cohorts.length < 2 ? undefined : "h-[380px]"}>
              <InovMaturidadeVisual data={maturity} variant="tab" />
            </div>
          </GlassCard>
        </SendToSlideHover>

        <SendToSlideHover
          payload={tabVisualPayload({
            page: "Inovação",
            visualization: "Heróis e ofensores de inovação",
            visualId: TAB_VISUAL_IDS.inovHerois,
            params: { metric },
            filters,
            selectedPeriods: selected,
          })}
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

            <InovHeroisVisual data={heroesOffenders} hideIntro />
          </GlassCard>
        </SendToSlideHover>

        <SendToSlideHover
          payload={tabVisualPayload({
            page: "Inovação",
            visualization: "Preço médio Inovação vs Regular",
            visualId: TAB_VISUAL_IDS.inovPreco,
            params: {},
            filters,
            selectedPeriods: selected,
          })}
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

            <InovPrecoVisual data={priceComparison} variant="tab" />
          </GlassCard>
        </SendToSlideHover>

        <SendToSlideHover
          payload={tabVisualPayload({
            page: "Inovação",
            visualization: "Mix de inovação por canal",
            visualId: TAB_VISUAL_IDS.inovCanalMix,
            params: {},
            filters,
            selectedPeriods: selected,
          })}
        >
          <GlassCard>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium">Mix de inovação por canal</h2>
                <p className="text-xs text-muted-foreground">
                  Penetração da inovação dentro de cada canal (% do volume do canal), últimos {channelMixMonthly.data.length} meses.
                </p>
              </div>
              <Badge variant="outline">Top {channelMixMonthly.canais.length}</Badge>
            </div>

            <div className={channelMixMonthly.canais.length === 0 ? undefined : "h-[340px]"}>
              <InovCanalMixVisual data={channelMixMonthly} variant="tab" />
            </div>
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
