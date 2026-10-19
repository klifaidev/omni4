import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { KpiCard } from "@/components/pricing/KpiCard";
import { EmptyState } from "@/components/pricing/EmptyState";
import { SendToSlideHover } from "@/components/pricing/SendToSlideHover";
import { PrecoDecompVisual, PrecoEvolucaoVisual, PrecoRankingVisual } from "@/components/pricing/tabVisuals/PrecoVisuals";
import { UfFocusCard, UfLegend, UfMapSvg, UfRanking } from "@/components/pricing/tabVisuals/UfMapVisuals";
import { computeUfMap } from "@/components/pricing/tabVisuals/ufMapData";
import { computePriceEvolution, computePriceRanking } from "@/components/pricing/tabVisuals/precoData";
import { TAB_VISUAL_IDS } from "@/components/pricing/tabVisuals/registry";
import { tabVisualPayload } from "@/lib/sendToSlide";
import { sortedPeriodsOf } from "@/lib/tabVisualPeriod";
import { getDeckPricingRows } from "@/hooks/useDeckRows";
import { DataTable, type DataTableColumn } from "@/components/pricing/DataTable";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { usePricing } from "@/store/pricing";
import { useFyList, useMonthsInfo } from "@/store/selectors";
import {
  applyFilters,
  computePriceDecomposition,
  uniqueValues,
  type PriceDecompositionResult,
  type PriceDecompositionSku,
} from "@/lib/analytics";
import { formatBRL, formatPct, formatNum } from "@/lib/format";
import { MultiSelectFilter } from "@/components/pricing/MultiSelectFilter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  ArrowRight,
  BookOpen,
  Calendar,
  CalendarDays,
  Filter,
  Info,
  MapPin,
  TrendingUp,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { usePageTitle } from "@/hooks/use-page-title";
import type { FilterKey, PricingRow } from "@/lib/types";

type PeriodMode = "month" | "fy";
type RankingMetric = "preco" | "mix" | "total";
type EvolDim = "total" | "marca" | "canal";

const fmtRsKg = (v: number) => formatBRL(v, { digits: 2 });

const PRODUCT_FILTER_FIELDS: { key: FilterKey; label: string }[] = [
  { key: "categoria", label: "Categoria" },
  { key: "subcategoria", label: "Subcategoria" },
  { key: "marca", label: "Marca" },
  { key: "formato", label: "Formato" },
  { key: "sku", label: "SKU" },
];

export default function Preco() {
  usePageTitle("Análise de Preço");

  const rows = usePricing((s) => s.rows);
  const filters = usePricing((s) => s.filters);
  const setFilter = usePricing((s) => s.setFilter);
  const selectedPeriods = usePricing((s) => s.selectedPeriods);
  const fyList = useFyList();
  const months = useMonthsInfo();

  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
  const [base, setBase] = useState<string | null>(null);
  const [comp, setComp] = useState<string | null>(null);
  const [rankingMetric, setRankingMetric] = useState<RankingMetric>("preco");
  const [evolDim, setEvolDim] = useState<EvolDim>("total");
  const [selectedUf, setSelectedUf] = useState<string | null>(null);
  const [showFilterNote, setShowFilterNote] = useState(true);

  const options = useMemo(
    () =>
      periodMode === "fy"
        ? fyList.map((fy) => ({ value: fy, label: fy }))
        : months.map((m) => ({ value: m.periodo, label: m.label })),
    [periodMode, fyList, months],
  );

  useEffect(() => {
    if (options.length < 2) return;
    const values = new Set(options.map((o) => o.value));
    const baseOk = base && values.has(base);
    const compOk = comp && values.has(comp);
    if (!baseOk || !compOk) {
      // Default = os dois períodos mais recentes disponíveis (M-2 vs M-1),
      // não o histórico inteiro (mais antigo vs mais novo). Trabalhamos com
      // fechamento mensal, então "M-1" na prática é o período mais recente
      // já carregado, não o mês corrente do calendário.
      setBase(options[options.length - 2].value);
      setComp(options[options.length - 1].value);
    }
  }, [options, base, comp]);

  // Períodos são controlados exclusivamente pelos seletores base/comp desta página.
  // O selectedPeriods global é ignorado aqui para não bloquear silenciosamente a análise.
  const filtered = useMemo(
    () => applyFilters(rows, filters, null),
    [rows, filters],
  );

  // Último mês que o deck de Slides enxerga: a referência para a base e a
  // comparação avançarem junto no slide.
  const deckAnchor = sortedPeriodsOf(getDeckPricingRows()).at(-1) ?? null;

  const result = useMemo(() => {
    if (!base || !comp || base === comp) return null;
    const labels =
      periodMode === "month"
        ? {
            base: months.find((m) => m.periodo === base)?.label ?? base,
            comp: months.find((m) => m.periodo === comp)?.label ?? comp,
          }
        : { base, comp };
    return computePriceDecomposition(filtered, base, comp, periodMode, labels);
  }, [filtered, base, comp, periodMode, months]);

  if (rows.length === 0) {
    return (
      <>
        <Topbar title="Análise de Preço" />
        <div className="px-8 py-6">
          <EmptyState
            title="Sem dados para análise de preço"
            message="Carregue ao menos dois períodos para decompor a variação de preço médio em efeito preço puro vs. mix de SKUs."
            actionLabel="Ir para Upload"
            actionTo="/upload"
          />
        </div>
      </>
    );
  }

  const notEnough =
    (periodMode === "fy" && fyList.length < 2) || (periodMode === "month" && months.length < 2);

  return (
    <>
      <Topbar
        title="Análise de Preço"
        subtitle="Decomposição da variação de preço médio em efeito puro vs. mix"
      />
      <div className="space-y-6 px-8 py-6">
        <GlassCard className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Comparar por
              </div>
              <ToggleGroup
                type="single"
                value={periodMode}
                onValueChange={(v) => v && setPeriodMode(v as PeriodMode)}
                className="mt-1.5 inline-flex rounded-full border border-border/50 bg-secondary/30 p-1"
              >
                <ToggleGroupItem
                  value="fy"
                  className="h-8 gap-1.5 rounded-full px-4 text-xs data-[state=on]:bg-primary/20 data-[state=on]:text-primary data-[state=on]:shadow-sm"
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  Ano Fiscal
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="month"
                  className="h-8 gap-1.5 rounded-full px-4 text-xs data-[state=on]:bg-primary/20 data-[state=on]:text-primary data-[state=on]:shadow-sm"
                >
                  <Calendar className="h-3.5 w-3.5" />
                  Mês
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>

          {notEnough ? (
            <p className="text-sm text-muted-foreground">
              {periodMode === "fy"
                ? `Carregue ao menos dois anos fiscais. Você tem: ${fyList.join(", ") || "—"}`
                : `Carregue ao menos dois meses para comparar.`}
            </p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <PeriodSelect
                label={periodMode === "fy" ? "Base (FY)" : "Período base"}
                value={base}
                onChange={(v) => setBase(v)}
                options={options}
              />
              <div className="flex h-10 items-center text-primary/60">
                <ArrowRight className="h-5 w-5" />
              </div>
              <PeriodSelect
                label={periodMode === "fy" ? "Comparação (FY)" : "Período de comparação"}
                value={comp}
                onChange={(v) => setComp(v)}
                options={options}
                excludeValue={base}
              />
              {base && comp && base === comp && (
                <p className="pb-2.5 text-xs text-warning">Selecione períodos diferentes.</p>
              )}
            </div>
          )}
        </GlassCard>

        {selectedPeriods !== null && showFilterNote && (
          <Alert className="relative border-primary/30 bg-primary/5 text-foreground">
            <Info className="h-4 w-4 text-primary" />
            <AlertDescription className="pr-8 text-sm">
              Os filtros de período do Topbar não afetam a Análise de Preço. Use os seletores de período acima.
            </AlertDescription>
            <button
              type="button"
              onClick={() => setShowFilterNote(false)}
              className="absolute right-2 top-2 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Fechar aviso"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </Alert>
        )}

        {!result ? (
          <GlassCard className="py-12 text-center text-sm text-muted-foreground">
            {base && comp && base !== comp
              ? "Sem dados para os períodos selecionados. Verifique se os filtros dimensionais não estão excluindo todos os dados."
              : "Configure os períodos base e comparação para visualizar a decomposição."}
          </GlassCard>
        ) : (
          <>
            <DecompositionKpis result={result} />
            <SendToSlideHover
              payload={tabVisualPayload({
                page: "Análise de Preço",
                visualization: `Decomposição de Preço — ${result.baseLabel} × ${result.compLabel}`,
                visualId: TAB_VISUAL_IDS.precoDecomp,
                params: { base, comp, periodMode, anchor: deckAnchor, follow: "live" },
                filters,
                selectedPeriods: null,
              })}
            >
              {/* Mesmo componente que o slide desenha ao receber este visual. */}
              <PrecoDecompVisual data={result} />
            </SendToSlideHover>
            <ReadingCard result={result} />
            <SendToSlideHover
              payload={tabVisualPayload({
                page: "Análise de Preço",
                visualization: `Margem por UF — ${result.compLabel}`,
                visualId: TAB_VISUAL_IDS.ufMapa,
                params: { base, comp, periodMode, anchor: deckAnchor, follow: "live", uf: selectedUf ?? "none" },
                filters,
                selectedPeriods: null,
              })}
            >
              <PriceUfMapSection
                rows={filtered}
                base={base}
                comp={comp}
                periodMode={periodMode}
                filters={filters}
                selectedUf={selectedUf}
                onSelectedUfChange={setSelectedUf}
                onApplyUfFilter={(values) => setFilter("uf", values)}
                onProductFilterChange={setFilter}
              />
            </SendToSlideHover>
            <SendToSlideHover
              payload={tabVisualPayload({
                page: "Análise de Preço",
                visualization: `Ranking de SKUs por variação de preço — ${result.baseLabel} × ${result.compLabel}`,
                visualId: TAB_VISUAL_IDS.precoRanking,
                params: { base, comp, periodMode, anchor: deckAnchor, follow: "live", metric: rankingMetric },
                filters,
                selectedPeriods: null,
              })}
            >
              <RankingSection
                result={result}
                metric={rankingMetric}
                onMetricChange={setRankingMetric}
              />
            </SendToSlideHover>
            <SendToSlideHover
              payload={tabVisualPayload({
                page: "Análise de Preço",
                visualization: "Evolução do preço médio",
                visualId: TAB_VISUAL_IDS.precoEvolucao,
                params: { dim: evolDim },
                filters,
                selectedPeriods: null,
              })}
            >
              <EvolutionSection rows={filtered} dim={evolDim} onDimChange={setEvolDim} />
            </SendToSlideHover>
          </>
        )}
      </div>
    </>
  );
}

function PeriodSelect({
  label,
  value,
  onChange,
  options,
  excludeValue,
}: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  excludeValue?: string | null;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <Select value={value ?? undefined} onValueChange={onChange}>
        <SelectTrigger className="h-10 w-48 border-border/50 bg-secondary/40 text-sm">
          <SelectValue placeholder="Escolha..." />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} disabled={o.value === excludeValue}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DecompositionKpis({ result }: { result: PriceDecompositionResult }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <KpiCard
        label={`Preço médio • ${result.baseLabel}`}
        value={`${fmtRsKg(result.precoMedioBase)}/kg`}
        accent="violet"
      />
      <KpiCard
        label={`Preço médio • ${result.compLabel}`}
        value={`${fmtRsKg(result.precoMedioComp)}/kg`}
        accent="blue"
        delta={result.variacaoPct}
        deltaLabel={`vs. ${result.baseLabel}`}
      />
      <KpiCard
        label="Variação total"
        value={`${result.variacaoTotal >= 0 ? "+" : "−"}${fmtRsKg(Math.abs(result.variacaoTotal))}/kg`}
        subValue={formatPct(result.variacaoPct)}
        accent={result.variacaoTotal >= 0 ? "green" : "red"}
      />
    </div>
  );
}

function ReadingCard({ result }: { result: PriceDecompositionResult }) {
  const sentences: React.ReactNode[] = [];
  const sign = result.variacaoTotal >= 0 ? "cresceu" : "recuou";
  const tone = result.variacaoTotal >= 0 ? "text-success" : "text-destructive";
  sentences.push(
    <>
      O preço médio <span className={`font-semibold ${tone}`}>{sign}</span>{" "}
      <span className="font-semibold">
        {fmtRsKg(Math.abs(result.variacaoTotal))}/kg ({formatPct(Math.abs(result.variacaoPct))})
      </span>{" "}
      de <span className="font-semibold">{result.baseLabel}</span> para{" "}
      <span className="font-semibold">{result.compLabel}</span>.
    </>,
  );

  const absPreco = Math.abs(result.pctPreco);
  const absMix = Math.abs(result.pctMix);
  if (absPreco > 0.6) {
    sentences.push(
      <>
        A variação foi predominantemente explicada por mudança de{" "}
        <span className="font-semibold text-primary">preço real</span> (
        {formatPct(absPreco)}), indicando{" "}
        {result.efeitoPrecoRs >= 0 ? "aumento" : "redução"} efetivo nos preços praticados.
      </>,
    );
  } else if (absMix > 0.6) {
    sentences.push(
      <>
        A variação foi predominantemente explicada por mudança no{" "}
        <span className="font-semibold text-primary">mix de SKUs</span> (
        {formatPct(absMix)}), com pouca alteração nos preços reais praticados.
      </>,
    );
  } else {
    sentences.push(
      <>
        A variação foi causada por uma combinação de{" "}
        <span className="font-semibold text-primary">preço real</span> ({formatPct(absPreco)}) e{" "}
        <span className="font-semibold text-primary">mix</span> ({formatPct(absMix)}).
      </>,
    );
  }

  const top = [...result.skus].sort(
    (a, b) => Math.abs(b.deltaPrecoRs) - Math.abs(a.deltaPrecoRs),
  )[0];
  if (top && top.deltaPrecoRs !== 0) {
    sentences.push(
      <>
        O SKU mais impactante no efeito preço foi{" "}
        <span className="font-semibold">{top.skuDesc}</span> com{" "}
        <span className="font-semibold">
          {top.deltaPreco >= 0 ? "+" : "−"}
          {fmtRsKg(Math.abs(top.deltaPreco))}/kg
        </span>{" "}
        de variação e impacto total de{" "}
        <span
          className={`font-semibold ${
            top.deltaPrecoRs >= 0 ? "text-success" : "text-destructive"
          }`}
        >
          {top.deltaPrecoRs >= 0 ? "+" : "−"}
          {formatBRL(Math.abs(top.deltaPrecoRs), { compact: true })}
        </span>
        .
      </>,
    );
  }

  return (
    <GlassCard className="space-y-3">
      <header className="flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-primary" />
        <h2 className="text-base font-medium">Leitura automática</h2>
      </header>
      <div className="space-y-2 text-sm leading-relaxed text-foreground">
        {sentences.map((s, i) => (
          <p key={i}>{s}</p>
        ))}
      </div>
    </GlassCard>
  );
}

function PriceUfMapSection({
  rows,
  base,
  comp,
  periodMode,
  filters,
  selectedUf,
  onSelectedUfChange,
  onApplyUfFilter,
  onProductFilterChange,
}: {
  rows: ReturnType<typeof applyFilters>;
  base: string | null;
  comp: string | null;
  periodMode: PeriodMode;
  filters: Partial<Record<FilterKey, string[]>>;
  selectedUf: string | null;
  onSelectedUfChange: (uf: string | null) => void;
  onApplyUfFilter: (values: string[]) => void;
  onProductFilterChange: (key: FilterKey, values: string[]) => void;
}) {
  const months = useMonthsInfo();

  const productFilterOptions = useMemo(() => {
    const bySkuDesc = new Map<string, string>();
    for (const row of rows) {
      if (row.sku && row.skuDesc && !bySkuDesc.has(row.sku)) bySkuDesc.set(row.sku, row.skuDesc);
    }
    return Object.fromEntries(
      PRODUCT_FILTER_FIELDS.map((field) => {
        const values = uniqueValues(rows, field.key as keyof PricingRow);
        const options = values
          .map((value) => ({
            value,
            label: field.key === "sku" && bySkuDesc.get(value) ? `${value} - ${bySkuDesc.get(value)}` : value,
          }))
          .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
        return [field.key, options];
      }),
    ) as Record<FilterKey, { value: string; label: string }[]>;
  }, [rows]);

  // Mesma conta que o slide faz (tabVisuals/ufMapData).
  const map = useMemo(() => computeUfMap(rows, base, comp, periodMode), [rows, base, comp, periodMode]);
  const { active: activeData, minMargin, maxMargin } = map;
  const explicitSelection = activeData.find((point) => point.uf === selectedUf) ?? null;
  const selected = explicitSelection ?? [...activeData].sort((a, b) => b.volumeKg - a.volumeKg)[0] ?? null;

  const trendData = useMemo(() => {
    const byPeriod = new Map<string, { rol: number; volumeKg: number; contribMarginal: number }>();
    for (const row of rows) {
      const cur = byPeriod.get(row.periodo) ?? { rol: 0, volumeKg: 0, contribMarginal: 0 };
      cur.rol += row.rol;
      cur.volumeKg += row.volumeKg;
      cur.contribMarginal += row.contribMarginal;
      byPeriod.set(row.periodo, cur);
    }

    return months
      .filter((month) => byPeriod.has(month.periodo))
      .map((month) => {
        const cur = byPeriod.get(month.periodo)!;
        return {
          periodo: month.label,
          precoMedio: cur.volumeKg > 0 ? cur.rol / cur.volumeKg : 0,
          margemPct: cur.rol > 0 ? (cur.contribMarginal / cur.rol) * 100 : 0,
          volumeT: cur.volumeKg / 1000,
        };
      });
  }, [months, rows]);

  return (
    <GlassCard className="space-y-5 overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MapPin className="h-4 w-4" />
            </span>
            <h2 className="text-lg font-medium">Margem por UF</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Cor = Contrib. Marginal %. Vermelho indica margem baixa; azul indica margem alta.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MapPill label="Cor" value="CM %" />
          <MapPill label="Rótulo" value="UF" />
          {explicitSelection && (
            <button
              type="button"
              onClick={() => onSelectedUfChange(null)}
              className="rounded-full border border-border/60 px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            >
              Limpar seleção
            </button>
          )}
        </div>
      </header>

      {activeData.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/70 px-4 py-10 text-center text-sm text-muted-foreground">
          Não há UF com volume no período selecionado para montar o mapa.
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(330px,0.5fr)]">
          <div className="space-y-3 rounded-lg border border-border/50 bg-[radial-gradient(circle_at_50%_15%,hsl(var(--primary)/0.08),transparent_34%),linear-gradient(180deg,hsl(var(--secondary)/0.24),hsl(var(--background)/0.14))] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/35 px-3 py-2 text-xs">
              <div>
                <span className="font-medium text-foreground">Mapa do Brasil</span>
                <span className="ml-2 text-muted-foreground">Contribuição Marginal % por UF no período de comparação</span>
              </div>
              <span className="text-muted-foreground">Cinza = UF sem volume no período</span>
            </div>

            {/* Mesmo componente que o slide desenha ao receber este visual. */}
            <UfMapSvg map={map} selectedUf={explicitSelection?.uf ?? null} onSelect={onSelectedUfChange} />

            <UfLegend map={map} />
            <ProductFiltersPanel
              filters={filters}
              optionsByKey={productFilterOptions}
              onChange={onProductFilterChange}
            />
            <UfTrendChart data={trendData} />
          </div>

          <aside className="space-y-4">
            {selected && (
              <UfFocusCard
                selected={selected}
                onApplyFilter={() => onApplyUfFilter(selected.filterValues.length ? selected.filterValues : [selected.label])}
              />
            )}
            <UfRanking map={map} onSelect={onSelectedUfChange} />
          </aside>
        </div>
      )}
    </GlassCard>
  );
}

function MapPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-secondary/35 px-3 py-1.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </span>
  );
}

function ProductFiltersPanel({
  filters,
  optionsByKey,
  onChange,
}: {
  filters: Partial<Record<FilterKey, string[]>>;
  optionsByKey: Record<FilterKey, { value: string; label: string }[]>;
  onChange: (key: FilterKey, values: string[]) => void;
}) {
  return (
    <section className="rounded-lg border border-border/40 bg-background/35 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-primary" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Filtros de Produto
        </h3>
        <div className="h-px flex-1 bg-border/40" />
      </div>
      <div className="grid gap-2 md:grid-cols-5">
        {PRODUCT_FILTER_FIELDS.map((field) => {
          const options = optionsByKey[field.key] ?? [];
          if (options.length === 0) return null;
          return (
            <div key={field.key}>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {field.label}
              </label>
              <MultiSelectFilter
                options={options}
                selected={filters[field.key] ?? []}
                onChange={(values) => onChange(field.key, values)}
                placeholder="Todos"
                variant="sku"
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function UfTrendChart({
  data,
}: {
  data: { periodo: string; precoMedio: number; margemPct: number; volumeT: number }[];
}) {
  return (
    <section className="rounded-lg border border-border/40 bg-background/35 p-3">
      <div className="mb-2 flex items-center gap-2">
        <TrendingUp className="h-3.5 w-3.5 text-primary" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Evolutivo da visão atual
        </h3>
        <div className="h-px flex-1 bg-border/40" />
      </div>
      {data.length === 0 ? (
        <div className="flex h-[210px] items-center justify-center rounded-md border border-dashed border-border/50 text-sm text-muted-foreground">
          Sem dados mensais para o gráfico.
        </div>
      ) : (
        <div className="h-[230px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 12, right: 16, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.28} />
              <XAxis
                dataKey="periodo"
                stroke="hsl(var(--muted-foreground))"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="volume"
                stroke="hsl(var(--muted-foreground))"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => formatNum(Number(v), 0)}
              />
              <YAxis
                yAxisId="value"
                orientation="right"
                stroke="hsl(var(--muted-foreground))"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => formatNum(Number(v), 0)}
              />
              <RTooltip
                cursor={{ fill: "hsl(var(--secondary) / 0.35)" }}
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value: number, name: string) => {
                  if (name === "Volume (t)") return [`${formatNum(Number(value), 1)} t`, name];
                  if (name === "Preço médio") return [`${formatBRL(Number(value), { digits: 2 })}/kg`, name];
                  return [`${formatNum(Number(value), 1)}%`, name];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar
                yAxisId="volume"
                dataKey="volumeT"
                name="Volume (t)"
                fill="hsl(var(--primary) / 0.26)"
                radius={[4, 4, 0, 0]}
              />
              <Line
                yAxisId="value"
                type="monotone"
                dataKey="precoMedio"
                name="Preço médio"
                stroke="hsl(var(--primary))"
                strokeWidth={2.4}
                dot={{ r: 2.4, strokeWidth: 1 }}
              />
              <Line
                yAxisId="value"
                type="monotone"
                dataKey="margemPct"
                name="Margem %"
                stroke="hsl(var(--success))"
                strokeWidth={2.4}
                dot={{ r: 2.4, strokeWidth: 1 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function RankingSection({
  result,
  metric,
  onMetricChange,
}: {
  result: PriceDecompositionResult;
  metric: RankingMetric;
  onMetricChange: (m: RankingMetric) => void;
}) {
  const valueOf = (s: PriceDecompositionSku) =>
    metric === "preco"
      ? s.deltaPrecoRs
      : metric === "mix"
      ? s.efeitoMixRs
      : s.deltaPrecoRs + s.efeitoMixRs;

  const rankingData = useMemo(() => computePriceRanking(result, metric), [result, metric]);

  const tableRows = useMemo(
    () =>
      [...result.skus]
        .sort((a, b) => Math.abs(b.deltaPrecoRs) - Math.abs(a.deltaPrecoRs))
        .map((s) => ({
          ...s,
          skuLabel: s.skuDesc || s.sku,
          volBaseKg: s.volumeBase,
          volCompKg: s.volumeComp,
          mixBasePct: s.shareBase * 100,
          mixCompPct: s.shareComp * 100,
        })),
    [result.skus],
  );

  type Row = (typeof tableRows)[number];
  const columns: DataTableColumn<Row>[] = [
    { key: "skuLabel", label: "SKU", align: "left" },
    { key: "volBaseKg", label: "Vol Base (Kg)", align: "right", format: (v) => formatNum(Number(v), 0, true) },
    { key: "volCompKg", label: "Vol Comp (Kg)", align: "right", format: (v) => formatNum(Number(v), 0, true) },
    { key: "precoBase", label: "Preço Base", align: "right", format: (v) => fmtRsKg(Number(v)) },
    { key: "precoComp", label: "Preço Comp", align: "right", format: (v) => fmtRsKg(Number(v)) },
    {
      key: "deltaPreco",
      label: "Δ Preço (R$/kg)",
      align: "right",
      format: (v) => {
        const n = Number(v);
        return (
          <span className={n >= 0 ? "text-success" : "text-destructive"}>
            {n >= 0 ? "+" : "−"}
            {fmtRsKg(Math.abs(n))}
          </span>
        );
      },
    },
    { key: "cmCompPct", label: "CM %", align: "right", format: (v) => formatPct(Number(v)) },
    {
      key: "deltaPrecoRs",
      label: "Efeito Preço (R$)",
      align: "right",
      format: (v) => {
        const n = Number(v);
        return (
          <span className={n >= 0 ? "text-success" : "text-destructive"}>
            {formatBRL(n, { compact: true })}
          </span>
        );
      },
    },
    { key: "mixBasePct", label: "Mix Base", align: "right", format: (v) => `${formatNum(Number(v), 2)}%` },
    { key: "mixCompPct", label: "Mix Comp", align: "right", format: (v) => `${formatNum(Number(v), 2)}%` },
    {
      key: "efeitoMixRs",
      label: "Efeito Mix (R$)",
      align: "right",
      format: (v) => {
        const n = Number(v);
        return (
          <span className={n >= 0 ? "text-success" : "text-destructive"}>
            {formatBRL(n, { compact: true })}
          </span>
        );
      },
    },
  ];

  return (
    <GlassCard className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Ranking de SKUs por variação de preço</h2>
          <p className="text-xs text-muted-foreground">
            Top 10 SKUs por impacto absoluto. Use o seletor para mudar a métrica.
          </p>
        </div>
        <ToggleGroup
          type="single"
          value={metric}
          onValueChange={(v) => v && onMetricChange(v as RankingMetric)}
          className="inline-flex rounded-full border border-border/50 bg-secondary/30 p-1"
        >
          <ToggleGroupItem
            value="preco"
            className="h-8 rounded-full px-3 text-xs data-[state=on]:bg-primary/20 data-[state=on]:text-primary"
          >
            Preço Puro
          </ToggleGroupItem>
          <ToggleGroupItem
            value="mix"
            className="h-8 rounded-full px-3 text-xs data-[state=on]:bg-primary/20 data-[state=on]:text-primary"
          >
            Mix
          </ToggleGroupItem>
          <ToggleGroupItem
            value="total"
            className="h-8 rounded-full px-3 text-xs data-[state=on]:bg-primary/20 data-[state=on]:text-primary"
          >
            Impacto Total
          </ToggleGroupItem>
        </ToggleGroup>
      </header>

      <div className="h-[360px] w-full">
        <PrecoRankingVisual data={rankingData} variant="tab" />
      </div>

      <DataTable
        rows={tableRows}
        columns={columns}
        searchable
        searchKeys={["skuLabel"]}
        pageSize={20}
      />
    </GlassCard>
  );
}

function EvolutionSection({
  rows,
  dim,
  onDimChange,
}: {
  rows: ReturnType<typeof applyFilters>;
  dim: EvolDim;
  onDimChange: (d: EvolDim) => void;
}) {
  const evolution = useMemo(() => computePriceEvolution(rows, dim), [rows, dim]);

  return (
    <GlassCard className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Evolução do preço médio</h2>
          <p className="text-xs text-muted-foreground">
            Preço médio (R$/kg) por período = ROL / Volume.
          </p>
        </div>
        <ToggleGroup
          type="single"
          value={dim}
          onValueChange={(v) => v && onDimChange(v as EvolDim)}
          className="inline-flex rounded-full border border-border/50 bg-secondary/30 p-1"
        >
          <ToggleGroupItem
            value="total"
            className="h-8 rounded-full px-3 text-xs data-[state=on]:bg-primary/20 data-[state=on]:text-primary"
          >
            Total
          </ToggleGroupItem>
          <ToggleGroupItem
            value="marca"
            className="h-8 rounded-full px-3 text-xs data-[state=on]:bg-primary/20 data-[state=on]:text-primary"
          >
            Por Marca
          </ToggleGroupItem>
          <ToggleGroupItem
            value="canal"
            className="h-8 rounded-full px-3 text-xs data-[state=on]:bg-primary/20 data-[state=on]:text-primary"
          >
            Por Canal
          </ToggleGroupItem>
        </ToggleGroup>
      </header>

      <div className="h-[340px] w-full">
        <PrecoEvolucaoVisual data={evolution} variant="tab" />
      </div>
    </GlassCard>
  );
}
