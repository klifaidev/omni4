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

interface InnovationSummaryRow extends Record<string, unknown> {
  classificacao: string;
  rol: number;
  volumeKg: number;
  margemPct: number;
  skus: number;
  mixRol: number;
  mixVolume: number;
}

function isInnovationRow(row: PricingRow): boolean {
  return /inova/i.test(row.inovacao ?? "");
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
