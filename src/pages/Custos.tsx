import { useMemo } from "react";
import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { KpiCard } from "@/components/pricing/KpiCard";
import { DataTable } from "@/components/pricing/DataTable";
import { EmptyState } from "@/components/pricing/EmptyState";
import { SendToSlideHover } from "@/components/pricing/SendToSlideHover";
import { CustoComposicaoVisual, CustoKgVisual, CustoPressaoVisual } from "@/components/pricing/tabVisuals/CustosVisuals";
import { buildComposition, compositionTotals, hasCompositionData } from "@/components/pricing/tabVisuals/custosData";
import { TAB_VISUAL_IDS } from "@/components/pricing/tabVisuals/registry";
import { tabVisualPayload } from "@/lib/sendToSlide";
import { applyFilters, computeCostEvolution } from "@/lib/analytics";
import { formatBRL, formatPct, formatTon } from "@/lib/format";
import { usePricing } from "@/store/pricing";
import { usePageTitle } from "@/hooks/use-page-title";

export default function Custos() {
  usePageTitle("Custos");
  const rows = usePricing((s) => s.rows);
  const filters = usePricing((s) => s.filters);
  const selected = usePricing((s) => s.selectedPeriods);

  const filtered = useMemo(() => applyFilters(rows, filters, selected), [rows, filters, selected]);
  // Gráficos e tabelas desta página mostram um histórico — o filtro de
  // período (que recorta pra 1 ou poucos meses) não deve afetá-los, só os
  // demais filtros (Marca, Canal etc.) continuam valendo. Só os KPIs de
  // resumo no topo (que respondem "quanto custou no período selecionado")
  // usam `filtered`.
  const filteredHistory = useMemo(() => applyFilters(rows, filters, null), [rows, filters]);

  const kpiEvolution = useMemo(() => computeCostEvolution(filtered), [filtered]);
  const evolution = useMemo(() => computeCostEvolution(filteredHistory), [filteredHistory]);

  // Composição do custo variável — histórico completo, pro gráfico/tabela.
  const composition = useMemo(() => buildComposition(filteredHistory), [filteredHistory]);
  // Mesma composição, mas respeitando o período selecionado — só pros KPIs de resumo.
  const kpiComposition = useMemo(() => buildComposition(filtered), [filtered]);

  const compTotals = useMemo(() => compositionTotals(composition), [composition]);
  const kpiCompTotals = useMemo(() => compositionTotals(kpiComposition), [kpiComposition]);
  const compositionData = useMemo(() => ({ composition, totals: compTotals }), [composition, compTotals]);

  const showComposition = hasCompositionData(compTotals);

  const totals = useMemo(() => {
    return kpiEvolution.reduce(
      (acc, row) => {
        acc.rol += row.rol;
        acc.volumeKg += row.volumeKg;
        acc.custoVariavel += row.custoVariavel;
        return acc;
      },
      { rol: 0, volumeKg: 0, custoVariavel: 0 },
    );
  }, [kpiEvolution]);

  const custoVariavelPct = totals.rol > 0 ? totals.custoVariavel / totals.rol : 0;
  const mpPctRol = totals.rol > 0 ? kpiCompTotals.materiaPrima / totals.rol : 0;
  const embPctRol = totals.rol > 0 ? kpiCompTotals.embalagem / totals.rol : 0;

  if (rows.length === 0) {
    return (
      <>
        <Topbar title="Custos" />
        <div className="px-8 py-6"><EmptyState
          title="Estrutura de custos"
          message="Carregue dados para analisar CPV, frete, comissões e demais componentes do custo variável."
          actionLabel="Carregar dados"
          actionTo="/upload"
        /></div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Custos" subtitle="Evolutivo de custo variável e fixo com leitura analítica por ROL e por Kg" />
      <div className="space-y-6 px-8 py-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Custo Variável" value={formatBRL(totals.custoVariavel, { compact: true })} subValue={formatPct(custoVariavelPct)} accent="amber" />
          <KpiCard label="Volume filtrado" value={formatTon(totals.volumeKg)} subValue={`${kpiEvolution.length} período(s)`} accent="green" />
          {kpiCompTotals.hasMP && kpiCompTotals.materiaPrima !== 0 && (
            <KpiCard label="Matéria Prima / ROL" value={formatPct(mpPctRol)} subValue={formatBRL(kpiCompTotals.materiaPrima, { compact: true })} accent="blue" />
          )}
          {kpiCompTotals.hasEmb && kpiCompTotals.embalagem !== 0 && (
            <KpiCard label="Embalagem / ROL" value={formatPct(embPctRol)} subValue={formatBRL(kpiCompTotals.embalagem, { compact: true })} accent="amber" />
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <SendToSlideHover
            payload={tabVisualPayload({
              page: "Custos",
              visualization: "Eficiência por Kg",
              visualId: TAB_VISUAL_IDS.custoKg,
              params: {},
              filters,
              selectedPeriods: selected,
            })}
          >
          <GlassCard>
            <header className="mb-4">
              <h2 className="text-lg font-medium">Eficiência por Kg</h2>
              <p className="text-xs text-muted-foreground">Leitura mensal do custo unitário para separar efeito de diluição e pressão estrutural.</p>
            </header>
            {/* Mesmo componente que o slide desenha ao receber este visual. */}
            <div className="h-[320px] w-full"><CustoKgVisual data={evolution} variant="tab" /></div>
          </GlassCard>
          </SendToSlideHover>

          <SendToSlideHover
            payload={tabVisualPayload({
              page: "Custos",
              visualization: "Pressão de custo sobre a receita",
              visualId: TAB_VISUAL_IDS.custoPressao,
              params: {},
              filters,
              selectedPeriods: selected,
            })}
          >
          <GlassCard>
            <header className="mb-4">
              <h2 className="text-lg font-medium">Pressão de custo sobre a receita</h2>
              <p className="text-xs text-muted-foreground">Percentual do ROL consumido por custo variável e fixo em cada período.</p>
            </header>
            <div className="h-[320px] w-full"><CustoPressaoVisual data={evolution} variant="tab" /></div>
          </GlassCard>
          </SendToSlideHover>
        </div>

        {showComposition && (
          <SendToSlideHover
            payload={tabVisualPayload({
              page: "Custos",
              visualization: "Composição do custo variável",
              visualId: TAB_VISUAL_IDS.custoComposicao,
              params: {},
              filters,
              selectedPeriods: selected,
            })}
          >
          <GlassCard>
            <header className="mb-4">
              <h2 className="text-lg font-medium">Composição do custo variável</h2>
              <p className="text-xs text-muted-foreground">Decomposição mensal por componente: Matéria Prima, Embalagem, MOD e CIF.</p>
            </header>
            <div className="h-[340px] w-full"><CustoComposicaoVisual data={compositionData} variant="tab" /></div>

            <div className="mt-6">
              <DataTable
                rows={composition.map((c) => ({
                  label: c.label,
                  mpPctRol: c.rol > 0 ? c.materiaPrima / c.rol : 0,
                  embPctRol: c.rol > 0 ? c.embalagem / c.rol : 0,
                  modPctRol: c.rol > 0 ? c.mod / c.rol : 0,
                  cifPctRol: c.rol > 0 ? c.cif / c.rol : 0,
                })) as unknown as Record<string, unknown>[]}
                columns={[
                  { key: "label", label: "Período", align: "left", format: (v) => <span className="font-medium">{String(v)}</span> },
                  ...(compTotals.hasMP ? [{ key: "mpPctRol", label: "MP / ROL", align: "right" as const, format: (v: unknown) => formatPct(Number(v)) }] : []),
                  ...(compTotals.hasEmb ? [{ key: "embPctRol", label: "Embalagem / ROL", align: "right" as const, format: (v: unknown) => formatPct(Number(v)) }] : []),
                  ...(compTotals.hasMod ? [{ key: "modPctRol", label: "MOD / ROL", align: "right" as const, format: (v: unknown) => formatPct(Number(v)) }] : []),
                  ...(compTotals.hasCif ? [{ key: "cifPctRol", label: "CIF / ROL", align: "right" as const, format: (v: unknown) => formatPct(Number(v)) }] : []),
                ]}
              />
            </div>
          </GlassCard>
          </SendToSlideHover>
        )}

        <SendToSlideHover
          payload={{
            source: { page: "Custos", visualization: "Detalhe mensal de custos" },
            target: { blockKind: "table", blockLabel: "Tabela" },
            config: { table: "detalhe_mensal_custos", filters, selectedPeriods: selected },
          }}
        >
        <GlassCard>
          <header className="mb-4">
            <h2 className="text-lg font-medium">Detalhe mensal de custos</h2>
            <p className="text-xs text-muted-foreground">Tabela de auditoria para validar composição, peso sobre a receita e custo unitário.</p>
          </header>
          <DataTable
            rows={evolution as unknown as Record<string, unknown>[]}
            columns={[
              { key: "label", label: "Período", align: "left", format: (v) => <span className="font-medium">{String(v)}</span> },
              { key: "custoVariavel", label: "Custo Var.", align: "right", format: (v) => formatBRL(Number(v), { compact: true }) },
              { key: "custoFixo", label: "Custo Fixo", align: "right", format: (v) => formatBRL(Number(v), { compact: true }) },
              { key: "custoTotal", label: "Custo Total", align: "right", format: (v) => formatBRL(Number(v), { compact: true }) },
              { key: "custoVariavelPctRol", label: "CV / ROL", align: "right", format: (v) => formatPct(Number(v)) },
              { key: "custoFixoPctRol", label: "CF / ROL", align: "right", format: (v) => formatPct(Number(v)) },
              { key: "custoTotalPorKg", label: "Custo Total / Kg", align: "right", format: (v) => formatBRL(Number(v), { digits: 2 }) },
            ]}
          />
        </GlassCard>
        </SendToSlideHover>
      </div>
    </>
  );
}
