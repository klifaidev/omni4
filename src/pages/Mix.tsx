import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, BookOpen, Calendar, CalendarDays, Filter, Layers3, TrendingDown, TrendingUp } from "lucide-react";
import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { EmptyState } from "@/components/pricing/EmptyState";
import { MultiSelectFilter } from "@/components/pricing/MultiSelectFilter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { usePageTitle } from "@/hooks/use-page-title";
import { usePricing } from "@/store/pricing";
import { useFyList, useMonthsInfo } from "@/store/selectors";
import {
  applyFilters,
  calcPVM,
  computePriceDecomposition,
  type PriceDecompositionResult,
  type PVMSkuDetail,
} from "@/lib/analytics";
import { computeAvailableOptionsPerDimension } from "@/lib/filterOptions";
import { buildMixReading, getSkuMixEffect, type MixReadingDriver } from "@/lib/pvmReading";
import { formatBRL, formatNum } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FilterKey, PricingRow } from "@/lib/types";

type PeriodMode = "fy" | "month";
type MixLens = "margin" | "price";
type EvolutionDimension = "categoria" | "canal" | "sku";
type FilterField = { key: FilterKey; label: string; variant?: "sku" | "comercial" | "inovacao" };
type MixSkuRankingItem = {
  sku: string;
  name: string;
  value: number;
  volumeBaseKg: number;
  volumeCompKg: number;
  marginBasePerKg: number | null;
  marginCompPerKg: number | null;
  priceBasePerKg: number | null;
  priceCompPerKg: number | null;
};
type MixTransferDirection = "comparison_to_reference" | "reference_to_comparison";
type SkuMixStats = {
  sku: string;
  name: string;
  volumeKg: number;
  rol: number;
  cost: number;
  margin: number;
  marginPerKg: number;
  pricePerKg: number;
};
type MixConcentration = {
  score: number;
  label: "Baixa" | "Moderada" | "Alta";
  description: string;
};
type MixRiskAlert = {
  sku: string;
  name: string;
  marginPerKg: number;
  shareDropPp: number;
};

const FILTER_FIELDS: FilterField[] = [
  { key: "marca", label: "Marca" },
  { key: "categoria", label: "Categoria" },
  { key: "canalAjustado", label: "Canal Ajustado", variant: "comercial" },
  { key: "regional", label: "Regional", variant: "comercial" },
];

const EVOLUTION_COLORS = ["#2563eb", "#16a34a", "#dc2626", "#9333ea", "#f59e0b", "#0891b2", "#64748b"];

export default function Mix() {
  usePageTitle("Mix");
  const rows = usePricing((state) => state.rows);
  const metric = usePricing((state) => state.metric);
  const filters = usePricing((state) => state.filters);
  const setFilter = usePricing((state) => state.setFilter);
  const fyList = useFyList();
  const months = useMonthsInfo();
  const [mixLens, setMixLens] = useState<MixLens>("margin");
  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
  const [basePeriod, setBasePeriod] = useState<string | null>(null);
  const [compPeriod, setCompPeriod] = useState<string | null>(null);
  const [evolutionDimension, setEvolutionDimension] = useState<EvolutionDimension>("categoria");
  const [selectedEvolutionSkus, setSelectedEvolutionSkus] = useState<string[]>([]);
  const [referenceSku, setReferenceSku] = useState<string | null>(null);
  const [comparisonSku, setComparisonSku] = useState<string | null>(null);
  const [transferDirection, setTransferDirection] = useState<MixTransferDirection>("comparison_to_reference");
  const [transferKg, setTransferKg] = useState(0);
  const evolutionSectionRef = useRef<HTMLDivElement | null>(null);
  const lastAutoPairRef = useRef<{ mode: PeriodMode; base: string; comp: string } | null>(null);

  const periodOptions = useMemo(
    () =>
      periodMode === "fy"
        ? fyList.map((fy) => ({ value: fy, label: fy }))
        : months.map((month) => ({ value: month.periodo, label: month.label })),
    [fyList, months, periodMode],
  );

  const defaultPair = useMemo(() => {
    if (periodOptions.length < 2) return null;
    const baseIndex = periodMode === "month" ? periodOptions.length - 2 : 0;
    return {
      mode: periodMode,
      base: periodOptions[baseIndex].value,
      comp: periodOptions[periodOptions.length - 1].value,
    };
  }, [periodMode, periodOptions]);

  useEffect(() => {
    if (!defaultPair) return;
    const values = new Set(periodOptions.map((option) => option.value));
    const baseOk = basePeriod && values.has(basePeriod);
    const compOk = compPeriod && values.has(compPeriod);
    const previousAutoPair = lastAutoPairRef.current;
    const isCurrentAutoPair =
      previousAutoPair &&
      previousAutoPair.mode === periodMode &&
      previousAutoPair.base === basePeriod &&
      previousAutoPair.comp === compPeriod;

    if (!baseOk || !compOk || isCurrentAutoPair) {
      lastAutoPairRef.current = defaultPair;
      setBasePeriod(defaultPair.base);
      setCompPeriod(defaultPair.comp);
    }
  }, [basePeriod, compPeriod, defaultPair, periodMode, periodOptions]);

  const filterKeys = useMemo(() => FILTER_FIELDS.map((field) => field.key), []);
  const filterOptionsSummary = useMemo(
    () => computeAvailableOptionsPerDimension(rows, filters, null, filterKeys),
    [filterKeys, filters, rows],
  );

  const filteredRows = useMemo(() => applyFilters(rows, filters, null), [filters, rows]);

  const result = useMemo(() => {
    if (!basePeriod || !compPeriod || basePeriod === compPeriod) return null;
    const labels =
      periodMode === "month"
        ? {
            base: months.find((month) => month.periodo === basePeriod)?.label ?? basePeriod,
            comp: months.find((month) => month.periodo === compPeriod)?.label ?? compPeriod,
          }
        : undefined;
    return calcPVM(filteredRows, metric, basePeriod, compPeriod, periodMode, labels);
  }, [basePeriod, compPeriod, filteredRows, metric, months, periodMode]);

  const priceResult = useMemo(() => {
    if (!basePeriod || !compPeriod || basePeriod === compPeriod) return null;
    const labels =
      periodMode === "month"
        ? {
            base: months.find((month) => month.periodo === basePeriod)?.label ?? basePeriod,
            comp: months.find((month) => month.periodo === compPeriod)?.label ?? compPeriod,
          }
        : undefined;
    return computePriceDecomposition(filteredRows, basePeriod, compPeriod, periodMode, labels);
  }, [basePeriod, compPeriod, filteredRows, months, periodMode]);

  const comparisonRows = useMemo(
    () => filteredRows.filter((row) => (periodMode === "fy" ? row.fy : row.periodo) === compPeriod),
    [compPeriod, filteredRows, periodMode],
  );

  const mixTotal = useMemo(
    () => result?.skuDetails.reduce((sum, detail) => sum + getSkuMixEffect(detail), 0) ?? 0,
    [result],
  );
  const comparisonRol = useMemo(
    () => comparisonRows.reduce((sum, row) => sum + row.rol, 0),
    [comparisonRows],
  );
  const mixMarginPp = comparisonRol !== 0 ? (mixTotal / comparisonRol) * 100 : 0;
  const priceMixTotal = priceResult?.efeitoMixRs ?? 0;
  const primaryMixTotal = mixLens === "margin" ? mixTotal : priceMixTotal;
  const secondaryMixTotal = mixLens === "margin" ? priceMixTotal : mixTotal;
  const primaryMixTone = primaryMixTotal > 0 ? "positive" : primaryMixTotal < 0 ? "negative" : "neutral";
  const lowVolumeResidual = useMemo(
    () => result?.skuDetails.reduce((sum, detail) => sum + (detail.lowVolumeResidualEffect ?? 0), 0) ?? 0,
    [result],
  );
  const decomposedMixTotal = mixTotal - lowVolumeResidual;

  const categoryDrivers = useMemo(
    () => (result ? buildDimensionDrivers(result.skuDetails, filteredRows, basePeriod, compPeriod, periodMode, "categoria") : []),
    [basePeriod, compPeriod, filteredRows, periodMode, result],
  );
  const channelDrivers = useMemo(
    () => (result ? buildDimensionDrivers(result.skuDetails, filteredRows, basePeriod, compPeriod, periodMode, "canalAjustado") : []),
    [basePeriod, compPeriod, filteredRows, periodMode, result],
  );
  const narrative = useMemo(
    () =>
      result
        ? buildLensNarrative({
            lens: mixLens,
            marginResult: result,
            priceResult,
            categories: categoryDrivers,
            channels: channelDrivers,
            marginPp: mixMarginPp,
          })
        : [],
    [categoryDrivers, channelDrivers, mixLens, mixMarginPp, priceResult, result],
  );
  const skuMixRanking = useMemo<MixSkuRankingItem[]>(() => {
    if (!result) return [];
    return result.skuDetails
      .map((detail) => {
        const value = detail.mixResidualEffect ?? 0;
        return {
          sku: detail.sku,
          name: detail.skuDesc?.trim() || detail.sku,
          value,
          volumeBaseKg: detail.volA,
          volumeCompKg: detail.volB,
          marginBasePerKg: detail.volA !== 0 ? detail.margemA / detail.volA : null,
          marginCompPerKg: detail.volB !== 0 ? detail.margemB / detail.volB : null,
          priceBasePerKg: detail.volA !== 0 ? detail.rolA / detail.volA : null,
          priceCompPerKg: detail.volB !== 0 ? detail.rolB / detail.volB : null,
        };
      })
      .filter((item) => Math.abs(item.value) >= 1);
  }, [result]);
  const priceSkuMixRanking = useMemo<MixSkuRankingItem[]>(() => {
    if (!priceResult) return [];
    return priceResult.skus
      .filter((detail) => detail.sku !== "__price_decomp_residual__")
      .map((detail) => ({
        sku: detail.sku,
        name: detail.skuDesc?.trim() || detail.sku,
        value: detail.efeitoMixRs,
        volumeBaseKg: detail.volumeBase,
        volumeCompKg: detail.volumeComp,
        marginBasePerKg: null,
        marginCompPerKg: null,
        priceBasePerKg: detail.precoBase,
        priceCompPerKg: detail.precoComp,
      }))
      .filter((item) => Math.abs(item.value) >= 1);
  }, [priceResult]);
  const activeSkuMixRanking = mixLens === "margin" ? skuMixRanking : priceSkuMixRanking;
  const mixOffenders = useMemo(
    () => activeSkuMixRanking.filter((item) => item.value < 0).sort((a, b) => a.value - b.value),
    [activeSkuMixRanking],
  );
  const mixFortresses = useMemo(
    () => activeSkuMixRanking.filter((item) => item.value > 0).sort((a, b) => b.value - a.value),
    [activeSkuMixRanking],
  );
  const evolutionFy = useMemo(() => {
    if (periodMode === "fy") return compPeriod;
    return months.find((month) => month.periodo === compPeriod)?.fy ?? null;
  }, [compPeriod, months, periodMode]);
  const evolutionRows = useMemo(
    () => filteredRows.filter((row) => row.fy === evolutionFy),
    [evolutionFy, filteredRows],
  );
  const skuEvolutionOptions = useMemo(() => buildSkuOptions(evolutionRows), [evolutionRows]);
  const defaultEvolutionSkus = useMemo(() => skuEvolutionOptions.slice(0, 3).map((option) => option.value), [skuEvolutionOptions]);

  useEffect(() => {
    if (evolutionDimension !== "sku") return;
    setSelectedEvolutionSkus((current) => {
      const available = new Set(skuEvolutionOptions.map((option) => option.value));
      const kept = current.filter((sku) => available.has(sku));
      return kept.length > 0 ? kept : defaultEvolutionSkus;
    });
  }, [defaultEvolutionSkus, evolutionDimension, skuEvolutionOptions]);

  const evolutionData = useMemo(
    () =>
      buildEvolutionData(
        evolutionRows,
        months,
        evolutionDimension,
        evolutionDimension === "sku" ? selectedEvolutionSkus : undefined,
        mixLens,
      ),
    [evolutionDimension, evolutionRows, mixLens, months, selectedEvolutionSkus],
  );
  const calculatorSkuOptions = useMemo(() => buildSkuOptions(comparisonRows), [comparisonRows]);
  const calculatorStats = useMemo(() => buildSkuStatsBySku(comparisonRows), [comparisonRows]);
  const referenceStats = referenceSku ? calculatorStats.get(referenceSku) ?? null : null;
  const comparisonStats = comparisonSku ? calculatorStats.get(comparisonSku) ?? null : null;
  const sourceStats = transferDirection === "comparison_to_reference" ? comparisonStats : referenceStats;
  const targetStats = transferDirection === "comparison_to_reference" ? referenceStats : comparisonStats;
  const maxTransferKg = Math.max(0, sourceStats?.volumeKg ?? 0);
  const totalCurrentMargin = useMemo(
    () => comparisonRows.reduce((sum, row) => sum + row.contribMarginal, 0),
    [comparisonRows],
  );
  const totalCurrentRevenue = useMemo(
    () => comparisonRows.reduce((sum, row) => sum + row.rol, 0),
    [comparisonRows],
  );
  const transferImpact = sourceStats && targetStats
    ? ((mixLens === "margin" ? targetStats.marginPerKg : targetStats.pricePerKg) -
        (mixLens === "margin" ? sourceStats.marginPerKg : sourceStats.pricePerKg)) * transferKg
    : 0;
  const transferImpactBase = mixLens === "margin" ? totalCurrentMargin : totalCurrentRevenue;
  const transferImpactPct = transferImpactBase !== 0 ? transferImpact / Math.abs(transferImpactBase) : 0;
  const concentration = useMemo(() => buildMixConcentration(comparisonRows), [comparisonRows]);
  const adjustedMixMargin = result ? result.current - mixTotal : 0;
  const mixRiskAlerts = useMemo(() => buildMixRiskAlerts(evolutionRows, months), [evolutionRows, months]);

  useEffect(() => {
    setTransferKg((current) => Math.min(current, maxTransferKg));
  }, [maxTransferKg]);

  const activeFilterCount = FILTER_FIELDS.reduce((sum, field) => sum + (filters[field.key]?.length ?? 0), 0);
  const notEnough = (periodMode === "fy" && fyList.length < 2) || (periodMode === "month" && months.length < 2);
  const mixTone = primaryMixTone;

  if (rows.length === 0) {
    return (
      <>
        <Topbar title="Mix" />
        <div className="px-8 py-6">
          <EmptyState
            title="Carregue uma base para analisar mix"
            message="A aba Mix usa o mesmo calculo validado da Bridge PVM para isolar quanto a composicao de SKUs ajudou ou pressionou a margem."
            actionLabel="Ir para Upload"
            actionTo="/upload"
          />
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Mix" subtitle="Efeito de composicao sobre a margem" />
      <div className="space-y-6 px-8 py-6">
        <GlassCard className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
                <Layers3 className="h-3.5 w-3.5" />
                Analise dedicada de mix
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Quanto a composicao do portfolio mudou a margem?
              </h1>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Alterne entre mix de margem e mix de preco para separar resultado financeiro direto de sinais de
                posicionamento comercial.
              </p>
            </div>
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="h-7 px-3 text-xs">
                {activeFilterCount} filtro{activeFilterCount === 1 ? "" : "s"} ativo{activeFilterCount === 1 ? "" : "s"}
              </Badge>
            )}
          </div>

          <div className="rounded-2xl border border-primary/25 bg-primary/5 p-2">
            <ToggleGroup
              type="single"
              value={mixLens}
              onValueChange={(value) => value && setMixLens(value as MixLens)}
              className="grid w-full gap-2 sm:grid-cols-2"
            >
              <ToggleGroupItem
                value="margin"
                className="h-auto rounded-xl px-4 py-3 text-left data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                <div>
                  <div className="text-sm font-semibold">Mix Margem</div>
                  <div className="mt-0.5 text-[11px] opacity-80">Migração para SKUs de margem melhor ou pior.</div>
                </div>
              </ToggleGroupItem>
              <ToggleGroupItem
                value="price"
                className="h-auto rounded-xl px-4 py-3 text-left data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                <div>
                  <div className="text-sm font-semibold">Mix Preço</div>
                  <div className="mt-0.5 text-[11px] opacity-80">Migração para SKUs de preço mais alto ou mais baixo.</div>
                </div>
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(320px,0.9fr)_minmax(420px,1.1fr)]">
            <section className="rounded-xl border border-border/40 bg-secondary/20 p-4">
              <div className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Comparar por
              </div>
              <ToggleGroup
                type="single"
                value={periodMode}
                onValueChange={(value) => value && setPeriodMode(value as PeriodMode)}
                className="inline-flex rounded-full border border-border/50 bg-secondary/30 p-1"
              >
                <ToggleGroupItem value="fy" className="h-8 gap-1.5 rounded-full px-4 text-xs data-[state=on]:bg-primary/20 data-[state=on]:text-primary">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Ano Fiscal
                </ToggleGroupItem>
                <ToggleGroupItem value="month" className="h-8 gap-1.5 rounded-full px-4 text-xs data-[state=on]:bg-primary/20 data-[state=on]:text-primary">
                  <Calendar className="h-3.5 w-3.5" />
                  Mes
                </ToggleGroupItem>
              </ToggleGroup>

              {notEnough ? (
                <p className="mt-4 text-sm text-muted-foreground">Carregue ao menos dois periodos para comparar mix.</p>
              ) : (
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <PeriodSelect label={periodMode === "fy" ? "Base (FY)" : "Periodo base"} value={basePeriod} onChange={setBasePeriod} options={periodOptions} />
                  <div className="flex h-10 items-center text-primary/60">
                    <ArrowRight className="h-5 w-5" />
                  </div>
                  <PeriodSelect label={periodMode === "fy" ? "Comparacao (FY)" : "Periodo comparado"} value={compPeriod} onChange={setCompPeriod} options={periodOptions} excludeValue={basePeriod} />
                </div>
              )}
            </section>

            <section className="rounded-xl border border-border/40 bg-secondary/20 p-4">
              <div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <Filter className="h-3.5 w-3.5" />
                Filtros de dimensao
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {FILTER_FIELDS.map((field) => {
                  const options = filterOptionsSummary.optionsByKey.get(field.key) ?? [];
                  if (!filterOptionsSummary.hasValuesByKey.get(field.key)) return null;
                  return (
                    <div key={field.key}>
                      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {field.label}
                      </label>
                      <MultiSelectFilter
                        options={options}
                        selected={filters[field.key] ?? []}
                        onChange={(next) => setFilter(field.key, next)}
                        placeholder="Todos"
                        variant={field.variant}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </GlassCard>

        {result && (
          <>
            <div className="grid gap-4 xl:grid-cols-[minmax(360px,0.8fr)_minmax(520px,1.2fr)]">
              <GlassCard surface="raised" glow={mixTone === "positive" ? "green" : mixTone === "negative" ? "red" : "blue"} className="relative overflow-hidden">
                <div className="absolute right-6 top-6 text-primary/10">
                  <Layers3 className="h-24 w-24" />
                </div>
                <div className="relative space-y-5">
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {mixLens === "margin" ? "Efeito de Mix na Margem" : "Efeito de Mix no Preço"}
                    </span>
                    <div className={cn(
                      "mt-3 text-4xl font-light leading-none tabular-nums",
                      mixTone === "positive" && "text-success",
                      mixTone === "negative" && "text-destructive",
                      mixTone === "neutral" && "text-primary",
                    )}>
                      {primaryMixTotal > 0 ? "+" : ""}{formatBRL(primaryMixTotal, { compact: true })}
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <MetricPill
                      label={mixLens === "margin" ? "Impacto em margem" : "Impacto em R$/kg"}
                      value={
                        mixLens === "margin"
                          ? `${mixMarginPp > 0 ? "+" : ""}${formatNum(mixMarginPp, 1)} p.p.`
                          : `${(priceResult?.efeitoMixRsKg ?? 0) > 0 ? "+" : ""}${formatBRL(priceResult?.efeitoMixRsKg ?? 0, { digits: 2 })}/kg`
                      }
                      tone={mixTone}
                    />
                    <MetricPill
                      label={mixLens === "margin" ? "Mix preço" : "Mix margem"}
                      value={`${secondaryMixTotal > 0 ? "+" : ""}${formatBRL(secondaryMixTotal, { compact: true })}`}
                      tone={secondaryMixTotal > 0 ? "positive" : secondaryMixTotal < 0 ? "negative" : "neutral"}
                    />
                    <MetricPill label="SKUs analisados" value={formatNum(result.skuDetails.length, 0)} tone="neutral" />
                  </div>
                  <div className="rounded-xl border border-border/35 bg-secondary/25 px-3 py-2">
                    <div className="text-xs font-semibold text-foreground">Concentração {concentration.label.toLowerCase()}</div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{concentration.description}</p>
                  </div>
                  {Math.abs(lowVolumeResidual) >= 1 && (
                    <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                      <div className="font-semibold">Abertura do total de Mix Margem</div>
                      <p className="mt-1 leading-relaxed">
                        Do total acima, {formatBRL(decomposedMixTotal, { compact: true })} vem do mix de SKUs
                        comparaveis e {formatBRL(lowVolumeResidual, { compact: true })} vem de SKUs com volume
                        residual insuficiente para decomposicao confiavel.
                      </p>
                    </div>
                  )}
                </div>
              </GlassCard>

              <GlassCard className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <BookOpen className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-foreground">Leitura executiva</h2>
                    <p className="text-xs text-muted-foreground">
                      Narrativa automatica para {result.baseLabel} vs {result.currentLabel}
                    </p>
                  </div>
                </div>
                <ol className="space-y-2.5">
                  {narrative.map((sentence, index) => (
                    <li key={index} className="flex gap-3 rounded-xl border border-border/35 bg-secondary/20 px-3 py-2.5 text-sm leading-relaxed text-foreground">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
                        {index + 1}
                      </span>
                      <span>{sentence}</span>
                    </li>
                  ))}
                </ol>
              </GlassCard>
            </div>

            {mixRiskAlerts.length > 0 && (
              <GlassCard className="border-warning/35 bg-warning/5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning">
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-foreground">Risco proativo de mix</h2>
                      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                        SKUs de margem alta perderam participação por pelo menos três quedas consecutivas no ano fiscal.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {mixRiskAlerts.slice(0, 4).map((alert) => (
                          <Badge key={alert.sku} variant="secondary" className="bg-warning/15 text-warning">
                            {alert.name} · {formatNum(alert.shareDropPp, 1)} p.p.
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEvolutionDimension("sku");
                      setSelectedEvolutionSkus(mixRiskAlerts.slice(0, 4).map((alert) => alert.sku));
                      requestAnimationFrame(() => evolutionSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
                    }}
                  >
                    Investigar na evolução
                  </Button>
                </div>
              </GlassCard>
            )}

            <div className="grid gap-4 xl:grid-cols-2">
              <SkuMixRankingCard
                title="Maiores Ofensores"
                subtitle={
                  mixLens === "margin"
                    ? "SKUs comparaveis que mais prejudicaram a margem por mudanca desfavoravel de mix."
                    : "SKUs comparaveis que mais prejudicaram o preco medio por mudanca desfavoravel de mix."
                }
                items={mixOffenders}
                tone="negative"
                lens={mixLens}
              />
              <SkuMixRankingCard
                title="Maiores Fortalezas"
                subtitle={
                  mixLens === "margin"
                    ? "SKUs comparaveis que mais ajudaram a margem por mudanca favoravel de mix."
                    : "SKUs comparaveis que mais ajudaram o preco medio por mudanca favoravel de mix."
                }
                items={mixFortresses}
                tone="positive"
                lens={mixLens}
              />
            </div>

            <MixAdjustedMarginCard
              actualMargin={result.current}
              adjustedMargin={adjustedMixMargin}
              mixEffect={mixTotal}
              baseLabel={result.baseLabel}
              currentLabel={result.currentLabel}
            />

            <div ref={evolutionSectionRef}>
              <MixEvolutionSection
                dimension={evolutionDimension}
                onDimensionChange={setEvolutionDimension}
                data={evolutionData}
                lens={mixLens}
                skuOptions={skuEvolutionOptions}
                selectedSkus={selectedEvolutionSkus}
                onSelectedSkusChange={setSelectedEvolutionSkus}
                fiscalYear={evolutionFy}
              />
            </div>

            <MixTransferCalculator
              skuOptions={calculatorSkuOptions}
              referenceSku={referenceSku}
              comparisonSku={comparisonSku}
              onReferenceSkuChange={setReferenceSku}
              onComparisonSkuChange={setComparisonSku}
              referenceStats={referenceStats}
              comparisonStats={comparisonStats}
              direction={transferDirection}
              onDirectionChange={setTransferDirection}
              transferKg={transferKg}
              onTransferKgChange={setTransferKg}
              maxTransferKg={maxTransferKg}
              impact={transferImpact}
              impactPct={transferImpactPct}
              lens={mixLens}
              periodLabel={result.currentLabel}
            />

            <div className="grid gap-4 xl:grid-cols-2">
              <DriverCard title="Categorias que explicam o mix" drivers={categoryDrivers} />
              <DriverCard title="Canais que explicam o mix" drivers={channelDrivers} />
            </div>
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
  onChange: (value: string) => void;
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
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} disabled={option.value === excludeValue}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function MetricPill({ label, value, tone }: { label: string; value: string; tone: "positive" | "negative" | "neutral" }) {
  return (
    <div className="rounded-xl border border-border/40 bg-secondary/30 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className={cn(
        "mt-1 text-lg font-semibold tabular-nums",
        tone === "positive" && "text-success",
        tone === "negative" && "text-destructive",
        tone === "neutral" && "text-foreground",
      )}>
        {value}
      </div>
    </div>
  );
}

function buildLensNarrative({
  lens,
  marginResult,
  priceResult,
  categories,
  channels,
  marginPp,
}: {
  lens: MixLens;
  marginResult: NonNullable<ReturnType<typeof calcPVM>>;
  priceResult: PriceDecompositionResult | null;
  categories: MixReadingDriver[];
  channels: MixReadingDriver[];
  marginPp: number;
}) {
  const marginMixTotal = marginResult.skuDetails.reduce((sum, detail) => sum + getSkuMixEffect(detail), 0);
  const secondarySentence = (
    <>
      A outra lente tambem fica visivel: mix de margem{" "}
      <strong className={mixTotalClass(marginMixTotal)}>{marginMixTotal > 0 ? "+" : ""}{formatBRL(marginMixTotal, { compact: true })}</strong>
      {priceResult ? (
        <>
          {" "}e mix de preco{" "}
          <strong className={mixTotalClass(priceResult.efeitoMixRs)}>{priceResult.efeitoMixRs > 0 ? "+" : ""}{formatBRL(priceResult.efeitoMixRs, { compact: true })}</strong>.
        </>
      ) : "."}
    </>
  );

  const diverges = priceResult && marginMixTotal * priceResult.efeitoMixRs < 0;
  const divergenceSentence = diverges ? (
    <>
      As duas lentes apontam em direcoes opostas: isso normalmente indica migracao para SKUs que mudam o preco medio em
      uma direcao, mas possuem margem por kg suficientemente diferente para gerar efeito financeiro contrario.
    </>
  ) : null;

  if (lens === "margin") {
    return [
      ...buildMixReading(marginResult, { categories, channels, marginPp }),
      secondarySentence,
      ...(divergenceSentence ? [divergenceSentence] : []),
    ];
  }

  if (!priceResult) {
    return [
      <>
        Nao ha dados suficientes para calcular o mix de preco nos periodos selecionados.
      </>,
      secondarySentence,
    ];
  }

  const topPositive = [...priceResult.skus]
    .filter((sku) => sku.sku !== "__price_decomp_residual__" && sku.efeitoMixRs > 0)
    .sort((a, b) => b.efeitoMixRs - a.efeitoMixRs)[0];
  const topNegative = [...priceResult.skus]
    .filter((sku) => sku.sku !== "__price_decomp_residual__" && sku.efeitoMixRs < 0)
    .sort((a, b) => a.efeitoMixRs - b.efeitoMixRs)[0];

  return [
    <>
      O mix de preco {priceResult.efeitoMixRs >= 0 ? "ajudou" : "pressionou"} o preco medio em{" "}
      <strong className={mixTotalClass(priceResult.efeitoMixRs)}>
        {priceResult.efeitoMixRs > 0 ? "+" : ""}{formatBRL(priceResult.efeitoMixRs, { compact: true })}
      </strong>
      , equivalente a{" "}
      <strong className={mixTotalClass(priceResult.efeitoMixRsKg)}>
        {priceResult.efeitoMixRsKg > 0 ? "+" : ""}{formatBRL(priceResult.efeitoMixRsKg, { digits: 2 })}/kg
      </strong>
      .
    </>,
    ...(topPositive ? [
      <>
        A maior fortaleza de preco foi <strong className="text-primary">{topPositive.skuDesc}</strong> com{" "}
        <strong className="text-success">+{formatBRL(topPositive.efeitoMixRs, { compact: true })}</strong>.
      </>,
    ] : []),
    ...(topNegative ? [
      <>
        A maior pressao de preco veio de <strong className="text-primary">{topNegative.skuDesc}</strong> com{" "}
        <strong className="text-destructive">{formatBRL(topNegative.efeitoMixRs, { compact: true })}</strong>.
      </>,
    ] : []),
    secondarySentence,
    ...(divergenceSentence ? [divergenceSentence] : []),
  ];
}

function mixTotalClass(value: number) {
  if (value > 0) return "text-success";
  if (value < 0) return "text-destructive";
  return "text-primary";
}

function MixAdjustedMarginCard({
  actualMargin,
  adjustedMargin,
  mixEffect,
  baseLabel,
  currentLabel,
}: {
  actualMargin: number;
  adjustedMargin: number;
  mixEffect: number;
  baseLabel: string;
  currentLabel: string;
}) {
  const maxMagnitude = Math.max(1, Math.abs(actualMargin), Math.abs(adjustedMargin), Math.abs(mixEffect));
  const mixTone = mixEffect > 0 ? "positive" : mixEffect < 0 ? "negative" : "neutral";
  return (
    <GlassCard className="space-y-5">
      <header>
        <h2 className="text-base font-semibold text-foreground">Margem real vs. margem com mix ajustado</h2>
        <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
          Leitura isolada do mix: a margem ajustada remove o efeito de mix calculado pela Bridge PVM entre {baseLabel} e {currentLabel},
          mantendo o patamar real do período atual como referência.
        </p>
      </header>
      <div className="grid gap-3 md:grid-cols-3">
        <MetricPill label="Mix de referência" value={formatBRL(adjustedMargin, { compact: true })} tone="neutral" />
        <MetricPill label="Efeito mix" value={`${mixEffect > 0 ? "+" : ""}${formatBRL(mixEffect, { compact: true })}`} tone={mixTone} />
        <MetricPill label="Margem real" value={formatBRL(actualMargin, { compact: true })} tone={actualMargin >= adjustedMargin ? "positive" : "negative"} />
      </div>
      <div className="space-y-3 rounded-xl border border-border/35 bg-secondary/20 p-4">
        <AdjustedMarginRow label="Margem com mix de referência" value={adjustedMargin} max={maxMagnitude} tone="neutral" />
        <AdjustedMarginRow label="Diferença explicada por mix" value={mixEffect} max={maxMagnitude} tone={mixTone} />
        <AdjustedMarginRow label="Margem real obtida" value={actualMargin} max={maxMagnitude} tone={actualMargin >= adjustedMargin ? "positive" : "negative"} strong />
      </div>
    </GlassCard>
  );
}

function AdjustedMarginRow({
  label,
  value,
  max,
  tone,
  strong = false,
}: {
  label: string;
  value: number;
  max: number;
  tone: "positive" | "negative" | "neutral";
  strong?: boolean;
}) {
  const width = `${Math.max(4, (Math.abs(value) / max) * 100)}%`;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
        <span className={cn(strong ? "font-semibold text-foreground" : "text-muted-foreground")}>{label}</span>
        <span className={cn(
          "font-semibold tabular-nums",
          tone === "positive" && "text-success",
          tone === "negative" && "text-destructive",
          tone === "neutral" && "text-foreground",
        )}>
          {value > 0 && label.includes("Diferen") ? "+" : ""}{formatBRL(value, { compact: true })}
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-muted/60">
        <div
          className={cn(
            "h-full rounded-full",
            tone === "positive" && "bg-success",
            tone === "negative" && "bg-destructive",
            tone === "neutral" && "bg-primary",
          )}
          style={{ width, opacity: strong ? 1 : 0.72 }}
        />
      </div>
    </div>
  );
}

function SkuMixRankingCard({
  title,
  subtitle,
  items,
  tone,
  lens,
}: {
  title: string;
  subtitle: string;
  items: MixSkuRankingItem[];
  tone: "positive" | "negative";
  lens: MixLens;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, 10);
  const maxMagnitude = Math.max(1, ...visible.map((item) => Math.abs(item.value)));
  const Icon = tone === "positive" ? TrendingUp : TrendingDown;

  return (
    <GlassCard className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className={cn(
            "mb-2 inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
            tone === "positive" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
          )}>
            <Icon className="h-3.5 w-3.5" />
            {tone === "positive" ? "Mix favorável" : "Mix desfavorável"} · {lens === "margin" ? "margem" : "preço"}
          </div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="max-w-xl text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <Badge variant="secondary" className="h-6 px-2 text-[11px]">
          {items.length} SKU{items.length === 1 ? "" : "s"}
        </Badge>
      </header>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-secondary/20 px-4 py-8 text-sm text-muted-foreground">
          Sem SKUs com efeito de mix {tone === "positive" ? "positivo" : "negativo"} material neste recorte.
        </div>
      ) : (
        <div className="space-y-2.5">
          {visible.map((item, index) => {
            const width = `${Math.max(7, (Math.abs(item.value) / maxMagnitude) * 100)}%`;
            return (
              <Tooltip key={`${title}-${item.sku}`} delayDuration={120}>
                <TooltipTrigger asChild>
                  <div className="group rounded-xl border border-border/35 bg-secondary/20 px-3 py-2.5 transition-colors hover:bg-secondary/35">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          #{index + 1} · {item.sku}
                        </div>
                        <div className="truncate text-sm font-medium text-foreground" title={item.name}>
                          {item.name}
                        </div>
                      </div>
                      <div className={cn(
                        "shrink-0 text-sm font-semibold tabular-nums",
                        tone === "positive" ? "text-success" : "text-destructive",
                      )}>
                        {item.value > 0 ? "+" : ""}{formatBRL(item.value, { compact: true })}
                      </div>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-muted/60">
                      <div
                        className={cn(
                          "h-full rounded-full transition-[width]",
                          tone === "positive" ? "bg-success" : "bg-destructive",
                        )}
                        style={{ width }}
                      />
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" align="start" className="max-w-xs">
                  <div className="space-y-2 text-xs">
                    <div>
                      <div className="font-semibold text-foreground">{item.name}</div>
                      <div className="text-muted-foreground">{item.sku}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      <span className="text-muted-foreground">Mix</span>
                      <span className={cn("text-right font-semibold", tone === "positive" ? "text-success" : "text-destructive")}>
                        {item.value > 0 ? "+" : ""}{formatBRL(item.value, { compact: true })}
                      </span>
                      <span className="text-muted-foreground">Volume base</span>
                      <span className="text-right">{formatNum(item.volumeBaseKg / 1000, 1)} t</span>
                      <span className="text-muted-foreground">Volume atual</span>
                      <span className="text-right">{formatNum(item.volumeCompKg / 1000, 1)} t</span>
                      <span className="text-muted-foreground">{lens === "margin" ? "Margem/kg base" : "Preço/kg base"}</span>
                      <span className="text-right">
                        {lens === "margin"
                          ? item.marginBasePerKg === null ? "—" : formatBRL(item.marginBasePerKg, { digits: 2 })
                          : item.priceBasePerKg === null ? "—" : formatBRL(item.priceBasePerKg, { digits: 2 })}
                      </span>
                      <span className="text-muted-foreground">{lens === "margin" ? "Margem/kg atual" : "Preço/kg atual"}</span>
                      <span className="text-right">
                        {lens === "margin"
                          ? item.marginCompPerKg === null ? "—" : formatBRL(item.marginCompPerKg, { digits: 2 })
                          : item.priceCompPerKg === null ? "—" : formatBRL(item.priceCompPerKg, { digits: 2 })}
                      </span>
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      )}

      {items.length > 10 && (
        <div className="pt-1">
          <Button variant="outline" size="sm" onClick={() => setExpanded((value) => !value)}>
            {expanded ? "Ver top 10" : `Ver todos (${items.length})`}
          </Button>
        </div>
      )}
    </GlassCard>
  );
}

type EvolutionSeries = {
  key: string;
  label: string;
  color: string;
  falling: boolean;
};

type EvolutionPoint = {
  periodo: string;
  label: string;
  [key: string]: string | number;
};

type EvolutionData = {
  series: EvolutionSeries[];
  points: EvolutionPoint[];
};

function MixEvolutionSection({
  dimension,
  onDimensionChange,
  data,
  lens,
  skuOptions,
  selectedSkus,
  onSelectedSkusChange,
  fiscalYear,
}: {
  dimension: EvolutionDimension;
  onDimensionChange: (dimension: EvolutionDimension) => void;
  data: EvolutionData;
  lens: MixLens;
  skuOptions: { value: string; label: string }[];
  selectedSkus: string[];
  onSelectedSkusChange: (skus: string[]) => void;
  fiscalYear: string | null;
}) {
  const fallingSeries = data.series.filter((series) => series.falling);
  const title =
    dimension === "categoria"
      ? "Evolucao da importancia por categoria"
      : dimension === "canal"
        ? "Evolucao da importancia por canal"
        : "Evolucao da importancia por SKU";

  return (
    <GlassCard className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="max-w-3xl text-xs text-muted-foreground">
            Participacao no volume total mes a mes dentro de {fiscalYear ?? "ano fiscal selecionado"}, com{" "}
            {lens === "margin" ? "margem contribuida" : "receita contribuida"} no tooltip para apoiar a leitura.
          </p>
        </div>
        <ToggleGroup
          type="single"
          value={dimension}
          onValueChange={(value) => value && onDimensionChange(value as EvolutionDimension)}
          className="inline-flex rounded-full border border-border/50 bg-secondary/30 p-1"
        >
          <ToggleGroupItem value="categoria" className="h-8 rounded-full px-3 text-xs data-[state=on]:bg-primary/20 data-[state=on]:text-primary">
            Categoria
          </ToggleGroupItem>
          <ToggleGroupItem value="canal" className="h-8 rounded-full px-3 text-xs data-[state=on]:bg-primary/20 data-[state=on]:text-primary">
            Canal
          </ToggleGroupItem>
          <ToggleGroupItem value="sku" className="h-8 rounded-full px-3 text-xs data-[state=on]:bg-primary/20 data-[state=on]:text-primary">
            SKU
          </ToggleGroupItem>
        </ToggleGroup>
      </header>

      {dimension === "sku" && (
        <div className="max-w-2xl rounded-xl border border-border/35 bg-secondary/20 p-4">
          <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            SKUs para acompanhar
          </label>
          <MultiSelectFilter
            options={skuOptions}
            selected={selectedSkus}
            onChange={onSelectedSkusChange}
            placeholder="Buscar SKUs"
            variant="sku"
          />
        </div>
      )}

      {fallingSeries.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <TrendingDown className="h-4 w-4" />
          <span className="font-semibold">Queda consistente:</span>
          {fallingSeries.slice(0, 4).map((series) => (
            <Badge key={series.key} variant="secondary" className="bg-destructive/15 text-destructive">
              {series.label}
            </Badge>
          ))}
          {fallingSeries.length > 4 && <span>+{fallingSeries.length - 4}</span>}
        </div>
      )}

      {data.series.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-secondary/20 px-4 py-10 text-center text-sm text-muted-foreground">
          Sem dados suficientes para montar a evolucao neste recorte.
        </div>
      ) : (
        <div className="h-[360px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            {dimension === "sku" ? (
              <LineChart data={data.points} margin={{ top: 12, right: 20, bottom: 12, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.45)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(value) => `${formatNum(Number(value), 0)}%`}
                />
                <RechartsTooltip content={<EvolutionTooltip series={data.series} lens={lens} />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {data.series.map((series) => (
                  <Line
                    key={series.key}
                    type="monotone"
                    dataKey={series.key}
                    name={series.label}
                    stroke={series.falling ? "#dc2626" : series.color}
                    strokeWidth={series.falling ? 3 : 2}
                    dot={{ r: series.falling ? 3 : 2 }}
                    activeDot={{ r: 5 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            ) : (
              <AreaChart data={data.points} margin={{ top: 12, right: 20, bottom: 12, left: 0 }} stackOffset="expand">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.45)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(value) => `${formatNum(Number(value) * 100, 0)}%`}
                />
                <RechartsTooltip content={<EvolutionTooltip series={data.series} lens={lens} stacked />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {data.series.map((series) => (
                  <Area
                    key={series.key}
                    type="monotone"
                    dataKey={series.key}
                    name={series.label}
                    stackId="mix-share"
                    stroke={series.falling ? "#dc2626" : series.color}
                    fill={series.falling ? "#dc2626" : series.color}
                    fillOpacity={series.falling ? 0.45 : 0.28}
                    strokeWidth={series.falling ? 2.5 : 1.5}
                  />
                ))}
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </GlassCard>
  );
}

function MixTransferCalculator({
  skuOptions,
  referenceSku,
  comparisonSku,
  onReferenceSkuChange,
  onComparisonSkuChange,
  referenceStats,
  comparisonStats,
  direction,
  onDirectionChange,
  transferKg,
  onTransferKgChange,
  maxTransferKg,
  impact,
  impactPct,
  lens,
  periodLabel,
}: {
  skuOptions: { value: string; label: string }[];
  referenceSku: string | null;
  comparisonSku: string | null;
  onReferenceSkuChange: (sku: string | null) => void;
  onComparisonSkuChange: (sku: string | null) => void;
  referenceStats: SkuMixStats | null;
  comparisonStats: SkuMixStats | null;
  direction: MixTransferDirection;
  onDirectionChange: (direction: MixTransferDirection) => void;
  transferKg: number;
  onTransferKgChange: (kg: number) => void;
  maxTransferKg: number;
  impact: number;
  impactPct: number;
  lens: MixLens;
  periodLabel: string;
}) {
  const source = direction === "comparison_to_reference" ? comparisonStats : referenceStats;
  const target = direction === "comparison_to_reference" ? referenceStats : comparisonStats;
  const canSimulate = !!source && !!target && source.sku !== target.sku && maxTransferKg > 0;
  const transferStep = Math.max(1, Math.round(maxTransferKg / 200));
  const tone = impact > 0 ? "positive" : impact < 0 ? "negative" : "neutral";
  const beforeAfter = useMemo(
    () => buildTransferBars(referenceStats, comparisonStats, direction, transferKg),
    [comparisonStats, direction, referenceStats, transferKg],
  );

  return (
    <GlassCard className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
            <ArrowRight className="h-3.5 w-3.5" />
            Simulacao hipotetica
          </div>
          <h2 className="text-base font-semibold text-foreground">Calculadora de transferencia de mix entre SKUs</h2>
          <p className="max-w-3xl text-xs text-muted-foreground">
            Escolha dois SKUs de {periodLabel}, mova volume entre eles e veja o impacto estimado em{" "}
            {lens === "margin" ? "margem" : "preço médio"}. Nada aqui altera
            a base real do aplicativo.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => onTransferKgChange(0)} disabled={transferKg === 0}>
          Resetar simulacao
        </Button>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(420px,0.95fr)_minmax(460px,1.05fr)]">
        <section className="space-y-4 rounded-xl border border-border/40 bg-secondary/20 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <SkuPicker
              label="SKU de referencia"
              options={skuOptions}
              value={referenceSku}
              onChange={onReferenceSkuChange}
              disabledValue={comparisonSku}
            />
            <SkuPicker
              label="SKU de comparacao"
              options={skuOptions}
              value={comparisonSku}
              onChange={onComparisonSkuChange}
              disabledValue={referenceSku}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <SkuStatCard label="Referencia" stats={referenceStats} />
            <SkuStatCard label="Comparacao" stats={comparisonStats} />
          </div>

          <div className="rounded-xl border border-border/35 bg-background/30 p-4">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Direcao da transferencia
            </div>
            <ToggleGroup
              type="single"
              value={direction}
              onValueChange={(value) => value && onDirectionChange(value as MixTransferDirection)}
              className="inline-flex flex-wrap rounded-full border border-border/50 bg-secondary/30 p-1"
            >
              <ToggleGroupItem value="comparison_to_reference" className="h-8 rounded-full px-3 text-xs data-[state=on]:bg-primary/20 data-[state=on]:text-primary">
                Comparacao → Referencia
              </ToggleGroupItem>
              <ToggleGroupItem value="reference_to_comparison" className="h-8 rounded-full px-3 text-xs data-[state=on]:bg-primary/20 data-[state=on]:text-primary">
                Referencia → Comparacao
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className={cn("rounded-xl border p-4", canSimulate ? "border-primary/25 bg-primary/5" : "border-border/35 bg-background/30")}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Volume deslocado
                </div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                  {formatNum(transferKg / 1000, 1)} t
                </div>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                Limite: {formatNum(maxTransferKg / 1000, 1)} t
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(0, Math.round(maxTransferKg))}
              step={transferStep}
              value={Math.min(transferKg, maxTransferKg)}
              onChange={(event) => onTransferKgChange(Number(event.currentTarget.value))}
              disabled={!canSimulate}
              className="h-2 w-full cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Volume deslocado entre SKUs"
            />
            {!canSimulate && (
              <p className="mt-3 text-xs text-muted-foreground">
                Selecione dois SKUs diferentes com volume no periodo para habilitar a simulacao.
              </p>
            )}
          </div>
        </section>

        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <MetricPill
              label="Impacto estimado"
              value={`${impact > 0 ? "+" : ""}${formatBRL(impact, { compact: true })}`}
              tone={tone}
            />
            <MetricPill
              label={lens === "margin" ? "% da margem atual" : "% da receita atual"}
              value={`${impactPct > 0 ? "+" : ""}${formatNum(impactPct * 100, 2)}%`}
              tone={tone}
            />
          </div>

          <div className="rounded-xl border border-border/40 bg-secondary/20 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Antes e depois da transferencia</h3>
                <p className="text-xs text-muted-foreground">Distribuicao dos dois SKUs selecionados.</p>
              </div>
              <Badge variant="secondary" className={cn(
                "h-6 px-2 text-[11px]",
                tone === "positive" && "bg-success/15 text-success",
                tone === "negative" && "bg-destructive/15 text-destructive",
              )}>
                {tone === "positive" ? "Ganho" : tone === "negative" ? "Pressao" : "Neutro"}
              </Badge>
            </div>
            <div className="space-y-5">
              <TransferBarGroup
                title="Volume"
                unit="t"
                referenceLabel={referenceStats?.name ?? "Referencia"}
                comparisonLabel={comparisonStats?.name ?? "Comparacao"}
                beforeReference={beforeAfter.volume.beforeReference / 1000}
                beforeComparison={beforeAfter.volume.beforeComparison / 1000}
                afterReference={beforeAfter.volume.afterReference / 1000}
                afterComparison={beforeAfter.volume.afterComparison / 1000}
              />
              <TransferBarGroup
                title="Margem"
                unit="brl"
                referenceLabel={referenceStats?.name ?? "Referencia"}
                comparisonLabel={comparisonStats?.name ?? "Comparacao"}
                beforeReference={beforeAfter.margin.beforeReference}
                beforeComparison={beforeAfter.margin.beforeComparison}
                afterReference={beforeAfter.margin.afterReference}
                afterComparison={beforeAfter.margin.afterComparison}
              />
            </div>
          </div>
        </section>
      </div>
    </GlassCard>
  );
}

function SkuPicker({
  label,
  options,
  value,
  onChange,
  disabledValue,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string | null;
  onChange: (sku: string | null) => void;
  disabledValue?: string | null;
}) {
  const pickerOptions = useMemo(
    () => options.filter((option) => option.value !== disabledValue),
    [disabledValue, options],
  );
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <MultiSelectFilter
        options={pickerOptions}
        selected={value ? [value] : []}
        onChange={(next) => onChange(next.length ? next[next.length - 1] : null)}
        placeholder="Buscar SKU"
        variant="sku"
      />
    </div>
  );
}

function SkuStatCard({ label, stats }: { label: string; stats: SkuMixStats | null }) {
  return (
    <div className="rounded-xl border border-border/35 bg-background/30 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      {stats ? (
        <div className="mt-2 space-y-2">
          <div className="truncate text-sm font-semibold text-foreground" title={stats.name}>{stats.name}</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <StatLine label="Volume" value={`${formatNum(stats.volumeKg / 1000, 1)} t`} />
            <StatLine label="ROL" value={formatBRL(stats.rol, { compact: true })} />
            <StatLine label="Custo" value={formatBRL(stats.cost, { compact: true })} />
            <StatLine label="Margem/kg" value={formatBRL(stats.marginPerKg, { digits: 2 })} />
            <StatLine label="Preço/kg" value={formatBRL(stats.pricePerKg, { digits: 2 })} />
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-dashed border-border/50 px-3 py-5 text-xs text-muted-foreground">
          Escolha um SKU.
        </div>
      )}
    </div>
  );
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

function TransferBarGroup({
  title,
  unit,
  referenceLabel,
  comparisonLabel,
  beforeReference,
  beforeComparison,
  afterReference,
  afterComparison,
}: {
  title: string;
  unit: "t" | "brl";
  referenceLabel: string;
  comparisonLabel: string;
  beforeReference: number;
  beforeComparison: number;
  afterReference: number;
  afterComparison: number;
}) {
  const maxValue = Math.max(1, beforeReference, beforeComparison, afterReference, afterComparison);
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{title}</div>
      <TransferBarRow label="Antes · referência" name={referenceLabel} value={beforeReference} max={maxValue} unit={unit} tone="reference" />
      <TransferBarRow label="Antes · comparação" name={comparisonLabel} value={beforeComparison} max={maxValue} unit={unit} tone="comparison" />
      <TransferBarRow label="Depois · referência" name={referenceLabel} value={afterReference} max={maxValue} unit={unit} tone="reference" strong />
      <TransferBarRow label="Depois · comparação" name={comparisonLabel} value={afterComparison} max={maxValue} unit={unit} tone="comparison" strong />
    </div>
  );
}

function TransferBarRow({
  label,
  name,
  value,
  max,
  unit,
  tone,
  strong = false,
}: {
  label: string;
  name: string;
  value: number;
  max: number;
  unit: "t" | "brl";
  tone: "reference" | "comparison";
  strong?: boolean;
}) {
  const width = `${Math.max(4, (Math.max(0, value) / max) * 100)}%`;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-xs">
        <span className="min-w-0 truncate text-muted-foreground" title={`${label}: ${name}`}>{label}</span>
        <span className={cn("shrink-0 tabular-nums", strong ? "font-semibold text-foreground" : "text-muted-foreground")}>
          {unit === "brl" ? formatBRL(value, { compact: true }) : `${formatNum(value, 1)} t`}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted/60">
        <div
          className={cn("h-full rounded-full", tone === "reference" ? "bg-primary" : "bg-accent")}
          style={{ width, opacity: strong ? 1 : 0.48 }}
        />
      </div>
    </div>
  );
}

function EvolutionTooltip({
  active,
  payload,
  label,
  series,
  lens,
  stacked = false,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; value?: number; payload?: Record<string, unknown>; color?: string; name?: string }>;
  label?: string;
  series: EvolutionSeries[];
  lens: MixLens;
  stacked?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const seriesByKey = new Map(series.map((item) => [item.key, item]));
  return (
    <div className="rounded-xl border border-border/60 bg-popover/95 p-3 text-xs shadow-xl backdrop-blur-xl">
      <div className="mb-2 font-semibold text-foreground">{label}</div>
      <div className="space-y-1.5">
        {payload
          .filter((item) => typeof item.dataKey === "string")
          .map((item) => {
            const key = String(item.dataKey);
            const meta = seriesByKey.get(key);
            if (!meta) return null;
            const contribution = Number(item.payload?.[`${key}Margin`] ?? 0);
            const shareValue = Number(item.value ?? 0);
            const share = stacked ? shareValue * 100 : shareValue;
            return (
              <div key={key} className="grid grid-cols-[10px_minmax(120px,1fr)_auto] items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.falling ? "#dc2626" : meta.color }} />
                <span className="truncate text-muted-foreground">{meta.label}</span>
                <span className="font-semibold text-foreground">{formatNum(share, 1)}%</span>
                <span />
                <span className="text-muted-foreground">{lens === "margin" ? "Margem" : "Receita"}</span>
                <span className="text-right font-medium">{formatBRL(contribution, { compact: true })}</span>
              </div>
            );
          })}
      </div>
    </div>
  );
}

function DriverCard({ title, drivers }: { title: string; drivers: MixReadingDriver[] }) {
  const top = [...drivers].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 6);
  return (
    <GlassCard className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">Maiores apoios e pressoes dentro do recorte atual.</p>
        </div>
      </header>
      {top.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-secondary/20 px-4 py-6 text-sm text-muted-foreground">
          Sem efeito de mix material neste recorte.
        </div>
      ) : (
        <div className="space-y-2">
          {top.map((driver, index) => {
            const tone = driver.value > 0 ? "positive" : driver.value < 0 ? "negative" : "neutral";
            return (
              <div key={driver.label} className="flex items-center justify-between gap-3 rounded-xl border border-border/35 bg-secondary/20 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">#{index + 1}</div>
                  <div className="truncate text-sm font-medium text-foreground" title={driver.label}>{driver.label}</div>
                </div>
                <div className={cn(
                  "inline-flex items-center gap-1.5 text-sm font-semibold tabular-nums",
                  tone === "positive" && "text-success",
                  tone === "negative" && "text-destructive",
                  tone === "neutral" && "text-muted-foreground",
                )}>
                  {tone === "positive" && <TrendingUp className="h-3.5 w-3.5" />}
                  {tone === "negative" && <TrendingDown className="h-3.5 w-3.5" />}
                  {driver.value > 0 ? "+" : ""}{formatBRL(driver.value, { compact: true })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}

function buildDimensionDrivers(
  details: PVMSkuDetail[],
  rows: PricingRow[],
  basePeriod: string | null,
  compPeriod: string | null,
  periodMode: PeriodMode,
  dimension: keyof Pick<PricingRow, "categoria" | "canalAjustado">,
): MixReadingDriver[] {
  const dimensionBySku = new Map<string, string>();
  const isRelevant = (row: PricingRow) => {
    const key = periodMode === "fy" ? row.fy : row.periodo;
    return key === compPeriod || key === basePeriod;
  };

  for (const row of rows) {
    if (!isRelevant(row)) continue;
    const sku = row.sku || row.skuDesc;
    if (!sku || dimensionBySku.has(sku)) continue;
    const value = row[dimension];
    dimensionBySku.set(sku, typeof value === "string" && value.trim() ? value.trim() : "Sem classificacao");
  }

  const grouped = new Map<string, number>();
  for (const detail of details) {
    const impact = getSkuMixEffect(detail);
    if (Math.abs(impact) < 1) continue;
    const label = dimensionBySku.get(detail.sku) ?? "Sem classificacao";
    grouped.set(label, (grouped.get(label) ?? 0) + impact);
  }

  return Array.from(grouped, ([label, value]) => ({ label, value }));
}

function buildSkuOptions(rows: PricingRow[]): { value: string; label: string }[] {
  const options = new Map<string, string>();
  for (const row of rows) {
    const sku = row.sku?.trim();
    if (!sku || options.has(sku)) continue;
    const desc = row.skuDesc?.trim();
    options.set(sku, desc ? `${sku} - ${desc}` : sku);
  }
  return Array.from(options, ([value, label]) => ({ value, label })).sort((a, b) =>
    a.value.localeCompare(b.value, "pt-BR"),
  );
}

function buildSkuStatsBySku(rows: PricingRow[]): Map<string, SkuMixStats> {
  const map = new Map<string, SkuMixStats>();
  for (const row of rows) {
    const sku = row.sku?.trim();
    if (!sku) continue;
    const current = map.get(sku) ?? {
      sku,
      name: row.skuDesc?.trim() || sku,
      volumeKg: 0,
      rol: 0,
      cost: 0,
      margin: 0,
      marginPerKg: 0,
      pricePerKg: 0,
    };
    current.volumeKg += row.volumeKg;
    current.rol += row.rol;
    current.cost += row.cogs;
    current.margin += row.contribMarginal;
    if (!current.name || current.name === sku) current.name = row.skuDesc?.trim() || sku;
    map.set(sku, current);
  }

  for (const stats of map.values()) {
    stats.marginPerKg = stats.volumeKg !== 0 ? stats.margin / stats.volumeKg : 0;
    stats.pricePerKg = stats.volumeKg !== 0 ? stats.rol / stats.volumeKg : 0;
  }
  return map;
}

function buildMixConcentration(rows: PricingRow[]): MixConcentration {
  const marginBySku = new Map<string, number>();
  for (const row of rows) {
    const sku = row.sku?.trim() || row.skuDesc?.trim();
    if (!sku) continue;
    marginBySku.set(sku, (marginBySku.get(sku) ?? 0) + row.contribMarginal);
  }

  const margins = Array.from(marginBySku.values()).map((value) => Math.abs(value)).filter((value) => value > 0);
  const total = margins.reduce((sum, value) => sum + value, 0);
  if (total === 0) {
    return {
      score: 0,
      label: "Baixa",
      description: "Sem margem material no recorte atual para medir concentração de mix.",
    };
  }

  const score = margins.reduce((sum, value) => {
    const share = value / total;
    return sum + share * share;
  }, 0) * 100;

  if (score >= 18) {
    return {
      score,
      label: "Alta",
      description: "A margem depende de poucos SKUs relevantes. Pequenas perdas nesses itens podem pressionar o resultado rapidamente.",
    };
  }
  if (score >= 8) {
    return {
      score,
      label: "Moderada",
      description: "A margem tem alguns SKUs âncora, mas ainda existe diversificação suficiente para amortecer parte do risco.",
    };
  }
  return {
    score,
    label: "Baixa",
    description: "A margem está bem distribuída entre muitos SKUs, reduzindo dependência de poucos itens de alto desempenho.",
  };
}

function buildMixRiskAlerts(
  rows: PricingRow[],
  months: { periodo: string; label: string; fy: string; ano: number; mes: number }[],
): MixRiskAlert[] {
  const monthList = months
    .filter((month) => rows.some((row) => row.periodo === month.periodo))
    .sort((a, b) => a.ano - b.ano || a.mes - b.mes);
  if (monthList.length < 4) return [];

  const totalVolumeByMonth = new Map<string, number>();
  const skuMonthVolume = new Map<string, Map<string, number>>();
  const skuStats = new Map<string, { name: string; volume: number; margin: number }>();
  let totalVolume = 0;
  let totalMargin = 0;

  for (const row of rows) {
    const sku = row.sku?.trim();
    if (!sku) continue;
    totalVolume += row.volumeKg;
    totalMargin += row.contribMarginal;
    totalVolumeByMonth.set(row.periodo, (totalVolumeByMonth.get(row.periodo) ?? 0) + row.volumeKg);

    let byMonth = skuMonthVolume.get(sku);
    if (!byMonth) {
      byMonth = new Map();
      skuMonthVolume.set(sku, byMonth);
    }
    byMonth.set(row.periodo, (byMonth.get(row.periodo) ?? 0) + row.volumeKg);

    const current = skuStats.get(sku) ?? { name: row.skuDesc?.trim() || sku, volume: 0, margin: 0 };
    current.volume += row.volumeKg;
    current.margin += row.contribMarginal;
    if (!current.name || current.name === sku) current.name = row.skuDesc?.trim() || sku;
    skuStats.set(sku, current);
  }

  const avgMarginPerKg = totalVolume > 0 ? totalMargin / totalVolume : 0;
  const highMarginThreshold = avgMarginPerKg * 1.2;
  const alerts: MixRiskAlert[] = [];

  for (const [sku, stats] of skuStats) {
    if (stats.volume <= 0) continue;
    const marginPerKg = stats.margin / stats.volume;
    if (marginPerKg <= highMarginThreshold) continue;

    const volumes = skuMonthVolume.get(sku);
    const shares = monthList.map((month) => {
      const total = totalVolumeByMonth.get(month.periodo) ?? 0;
      return total > 0 ? ((volumes?.get(month.periodo) ?? 0) / total) * 100 : 0;
    });
    const recent = shares.slice(-4);
    const falling = recent.length === 4 && recent.every((share, index) => index === 0 || share < recent[index - 1]);
    if (!falling) continue;

    alerts.push({
      sku,
      name: stats.name,
      marginPerKg,
      shareDropPp: recent[0] - recent[recent.length - 1],
    });
  }

  return alerts.sort((a, b) => b.shareDropPp - a.shareDropPp).slice(0, 6);
}

function buildTransferBars(
  reference: SkuMixStats | null,
  comparison: SkuMixStats | null,
  direction: MixTransferDirection,
  transferKg: number,
) {
  const referenceVolume = reference?.volumeKg ?? 0;
  const comparisonVolume = comparison?.volumeKg ?? 0;
  const referenceMargin = reference?.margin ?? 0;
  const comparisonMargin = comparison?.margin ?? 0;
  const referenceMarginPerKg = reference?.marginPerKg ?? 0;
  const comparisonMarginPerKg = comparison?.marginPerKg ?? 0;
  const boundedTransfer =
    direction === "comparison_to_reference"
      ? Math.min(Math.max(0, transferKg), comparisonVolume)
      : Math.min(Math.max(0, transferKg), referenceVolume);

  if (direction === "comparison_to_reference") {
    return {
      volume: {
        beforeReference: referenceVolume,
        beforeComparison: comparisonVolume,
        afterReference: referenceVolume + boundedTransfer,
        afterComparison: Math.max(0, comparisonVolume - boundedTransfer),
      },
      margin: {
        beforeReference: referenceMargin,
        beforeComparison: comparisonMargin,
        afterReference: referenceMargin + referenceMarginPerKg * boundedTransfer,
        afterComparison: comparisonMargin - comparisonMarginPerKg * boundedTransfer,
      },
    };
  }

  return {
    volume: {
      beforeReference: referenceVolume,
      beforeComparison: comparisonVolume,
      afterReference: Math.max(0, referenceVolume - boundedTransfer),
      afterComparison: comparisonVolume + boundedTransfer,
      },
      margin: {
      beforeReference: referenceMargin,
      beforeComparison: comparisonMargin,
      afterReference: referenceMargin - referenceMarginPerKg * boundedTransfer,
      afterComparison: comparisonMargin + comparisonMarginPerKg * boundedTransfer,
    },
  };
}

function buildEvolutionData(
  rows: PricingRow[],
  months: { periodo: string; label: string; fy: string; ano: number; mes: number }[],
  dimension: EvolutionDimension,
  selectedSkus: string[] = [],
  lens: MixLens = "margin",
): EvolutionData {
  const monthList = months
    .filter((month) => rows.some((row) => row.periodo === month.periodo))
    .sort((a, b) => a.ano - b.ano || a.mes - b.mes);
  if (monthList.length === 0) return { series: [], points: [] };

  const dimensionOf = (row: PricingRow) => {
    if (dimension === "categoria") return row.categoria?.trim() || "Sem categoria";
    if (dimension === "canal") return row.canalAjustado?.trim() || row.canal?.trim() || "Sem canal";
    return row.sku?.trim() || row.skuDesc?.trim() || "Sem SKU";
  };

  const selectedSkuSet = dimension === "sku" && selectedSkus.length > 0 ? new Set(selectedSkus) : null;
  const totalVolumeByMonth = new Map<string, number>();
  const grouped = new Map<string, Map<string, { volume: number; margin: number }>>();
  const totalByDimension = new Map<string, number>();

  for (const row of rows) {
    const month = row.periodo;
    totalVolumeByMonth.set(month, (totalVolumeByMonth.get(month) ?? 0) + row.volumeKg);
    if (dimension === "sku" && selectedSkuSet && !selectedSkuSet.has(row.sku ?? "")) continue;
    const key = dimensionOf(row);
    totalByDimension.set(key, (totalByDimension.get(key) ?? 0) + row.volumeKg);
    let byDimension = grouped.get(month);
    if (!byDimension) {
      byDimension = new Map();
      grouped.set(month, byDimension);
    }
    const current = byDimension.get(key) ?? { volume: 0, margin: 0 };
    current.volume += row.volumeKg;
    current.margin += lens === "margin" ? row.contribMarginal : row.rol;
    byDimension.set(key, current);
  }

  const keys =
    dimension === "sku"
      ? selectedSkus
      : Array.from(totalByDimension.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([key]) => key);
  if (keys.length === 0) return { series: [], points: [] };

  const points = monthList.map((month) => {
    const point: EvolutionPoint = { periodo: month.periodo, label: month.label };
    const total = totalVolumeByMonth.get(month.periodo) ?? 0;
    const byDimension = grouped.get(month.periodo);
    keys.forEach((key, index) => {
      const row = byDimension?.get(key);
      const share = total > 0 ? (row?.volume ?? 0) / total : 0;
      point[key] = dimension === "sku" ? share * 100 : share;
      point[`${key}Margin`] = row?.margin ?? 0;
      point[`${key}Color`] = EVOLUTION_COLORS[index % EVOLUTION_COLORS.length];
    });
    return point;
  });

  const series = keys.map((key, index) => ({
    key,
    label: key,
    color: EVOLUTION_COLORS[index % EVOLUTION_COLORS.length],
    falling: hasConsistentShareDrop(points.map((point) => Number(point[key] ?? 0))),
  }));

  return { series, points };
}

function hasConsistentShareDrop(values: number[]): boolean {
  const material = values.filter((value) => Number.isFinite(value) && value > 0);
  if (material.length < 4) return false;
  const recent = material.slice(-4);
  return recent.every((value, index) => index === 0 || value < recent[index - 1]);
}
