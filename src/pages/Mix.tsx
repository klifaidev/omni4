import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, BookOpen, Calendar, CalendarDays, Filter, Layers3, TrendingDown, TrendingUp } from "lucide-react";
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
import { applyFilters, calcPVM, type PVMSkuDetail } from "@/lib/analytics";
import { computeAvailableOptionsPerDimension } from "@/lib/filterOptions";
import { buildMixReading, getSkuMixEffect, type MixReadingDriver } from "@/lib/pvmReading";
import { formatBRL, formatNum } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FilterKey, PricingRow } from "@/lib/types";

type PeriodMode = "fy" | "month";
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
  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
  const [basePeriod, setBasePeriod] = useState<string | null>(null);
  const [compPeriod, setCompPeriod] = useState<string | null>(null);
  const [evolutionDimension, setEvolutionDimension] = useState<EvolutionDimension>("categoria");
  const [selectedEvolutionSkus, setSelectedEvolutionSkus] = useState<string[]>([]);
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
  const lowVolumeResidual = useMemo(
    () => result?.skuDetails.reduce((sum, detail) => sum + (detail.lowVolumeResidualEffect ?? 0), 0) ?? 0,
    [result],
  );

  const categoryDrivers = useMemo(
    () => (result ? buildDimensionDrivers(result.skuDetails, filteredRows, basePeriod, compPeriod, periodMode, "categoria") : []),
    [basePeriod, compPeriod, filteredRows, periodMode, result],
  );
  const channelDrivers = useMemo(
    () => (result ? buildDimensionDrivers(result.skuDetails, filteredRows, basePeriod, compPeriod, periodMode, "canalAjustado") : []),
    [basePeriod, compPeriod, filteredRows, periodMode, result],
  );
  const narrative = useMemo(
    () => (result ? buildMixReading(result, { categories: categoryDrivers, channels: channelDrivers, marginPp: mixMarginPp }) : []),
    [categoryDrivers, channelDrivers, mixMarginPp, result],
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
        };
      })
      .filter((item) => Math.abs(item.value) >= 1);
  }, [result]);
  const mixOffenders = useMemo(
    () => skuMixRanking.filter((item) => item.value < 0).sort((a, b) => a.value - b.value),
    [skuMixRanking],
  );
  const mixFortresses = useMemo(
    () => skuMixRanking.filter((item) => item.value > 0).sort((a, b) => b.value - a.value),
    [skuMixRanking],
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
    () => buildEvolutionData(evolutionRows, months, evolutionDimension, evolutionDimension === "sku" ? selectedEvolutionSkus : undefined),
    [evolutionDimension, evolutionRows, months, selectedEvolutionSkus],
  );

  const activeFilterCount = FILTER_FIELDS.reduce((sum, field) => sum + (filters[field.key]?.length ?? 0), 0);
  const notEnough = (periodMode === "fy" && fyList.length < 2) || (periodMode === "month" && months.length < 2);
  const mixTone = mixTotal > 0 ? "positive" : mixTotal < 0 ? "negative" : "neutral";

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
                A leitura reaproveita o efeito residual de mix e SKUs nao comparaveis ja calculado na Bridge PVM,
                agora com foco executivo para explorar categoria, canal e periodo.
              </p>
            </div>
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="h-7 px-3 text-xs">
                {activeFilterCount} filtro{activeFilterCount === 1 ? "" : "s"} ativo{activeFilterCount === 1 ? "" : "s"}
              </Badge>
            )}
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
                      Efeito de Mix Total
                    </span>
                    <div className={cn(
                      "mt-3 text-4xl font-light leading-none tabular-nums",
                      mixTone === "positive" && "text-success",
                      mixTone === "negative" && "text-destructive",
                      mixTone === "neutral" && "text-primary",
                    )}>
                      {mixTotal > 0 ? "+" : ""}{formatBRL(mixTotal, { compact: true })}
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <MetricPill label="Impacto em margem" value={`${mixMarginPp > 0 ? "+" : ""}${formatNum(mixMarginPp, 1)} p.p.`} tone={mixTone} />
                    <MetricPill label="SKUs analisados" value={formatNum(result.skuDetails.length, 0)} tone="neutral" />
                  </div>
                  {Math.abs(lowVolumeResidual) >= 1 && (
                    <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                      Residuo de baixo volume separado: {formatBRL(lowVolumeResidual, { compact: true })}.
                    </p>
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

            <div className="grid gap-4 xl:grid-cols-2">
              <SkuMixRankingCard
                title="Maiores Ofensores"
                subtitle="SKUs comparáveis que mais prejudicaram a margem por mudança desfavorável de mix."
                items={mixOffenders}
                tone="negative"
              />
              <SkuMixRankingCard
                title="Maiores Fortalezas"
                subtitle="SKUs comparáveis que mais ajudaram a margem por mudança favorável de mix."
                items={mixFortresses}
                tone="positive"
              />
            </div>

            <MixEvolutionSection
              dimension={evolutionDimension}
              onDimensionChange={setEvolutionDimension}
              data={evolutionData}
              skuOptions={skuEvolutionOptions}
              selectedSkus={selectedEvolutionSkus}
              onSelectedSkusChange={setSelectedEvolutionSkus}
              fiscalYear={evolutionFy}
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

function SkuMixRankingCard({
  title,
  subtitle,
  items,
  tone,
}: {
  title: string;
  subtitle: string;
  items: MixSkuRankingItem[];
  tone: "positive" | "negative";
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
            {tone === "positive" ? "Mix favorável" : "Mix desfavorável"}
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
                      <span className="text-muted-foreground">Margem/kg base</span>
                      <span className="text-right">{item.marginBasePerKg === null ? "—" : formatBRL(item.marginBasePerKg, { digits: 2 })}</span>
                      <span className="text-muted-foreground">Margem/kg atual</span>
                      <span className="text-right">{item.marginCompPerKg === null ? "—" : formatBRL(item.marginCompPerKg, { digits: 2 })}</span>
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
  skuOptions,
  selectedSkus,
  onSelectedSkusChange,
  fiscalYear,
}: {
  dimension: EvolutionDimension;
  onDimensionChange: (dimension: EvolutionDimension) => void;
  data: EvolutionData;
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
            Participacao no volume total mes a mes dentro de {fiscalYear ?? "ano fiscal selecionado"}, com margem
            contribuida no tooltip para apoiar a leitura do mix antes de virar um problema maior.
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
                <RechartsTooltip content={<EvolutionTooltip series={data.series} />} />
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
                <RechartsTooltip content={<EvolutionTooltip series={data.series} stacked />} />
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

function EvolutionTooltip({
  active,
  payload,
  label,
  series,
  stacked = false,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; value?: number; payload?: Record<string, unknown>; color?: string; name?: string }>;
  label?: string;
  series: EvolutionSeries[];
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
            const margin = Number(item.payload?.[`${key}Margin`] ?? 0);
            const shareValue = Number(item.value ?? 0);
            const share = stacked ? shareValue * 100 : shareValue;
            return (
              <div key={key} className="grid grid-cols-[10px_minmax(120px,1fr)_auto] items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.falling ? "#dc2626" : meta.color }} />
                <span className="truncate text-muted-foreground">{meta.label}</span>
                <span className="font-semibold text-foreground">{formatNum(share, 1)}%</span>
                <span />
                <span className="text-muted-foreground">Margem</span>
                <span className="text-right font-medium">{formatBRL(margin, { compact: true })}</span>
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

function buildEvolutionData(
  rows: PricingRow[],
  months: { periodo: string; label: string; fy: string; ano: number; mes: number }[],
  dimension: EvolutionDimension,
  selectedSkus: string[] = [],
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
    current.margin += row.contribMarginal;
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
