import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, BookOpen, Calendar, CalendarDays, Filter, Layers3, TrendingDown, TrendingUp } from "lucide-react";
import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { EmptyState } from "@/components/pricing/EmptyState";
import { MultiSelectFilter } from "@/components/pricing/MultiSelectFilter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
type FilterField = { key: FilterKey; label: string; variant?: "sku" | "comercial" | "inovacao" };

const FILTER_FIELDS: FilterField[] = [
  { key: "marca", label: "Marca" },
  { key: "categoria", label: "Categoria" },
  { key: "canalAjustado", label: "Canal Ajustado", variant: "comercial" },
  { key: "regional", label: "Regional", variant: "comercial" },
];

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
