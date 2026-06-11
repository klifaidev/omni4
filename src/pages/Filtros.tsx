import { useMemo } from "react";
import { X, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { EmptyState } from "@/components/pricing/EmptyState";
import { MultiSelectFilter } from "@/components/pricing/MultiSelectFilter";
import { usePricing } from "@/store/pricing";
import { useMonthsInfo } from "@/store/selectors";
import { useHasActiveFilters } from "@/components/pricing/ActiveFiltersBar";
import { usePageTitle } from "@/hooks/use-page-title";
import type { FilterKey } from "@/lib/types";
import { cn } from "@/lib/utils";

const FILTER_DISPLAY_LABEL: Partial<Record<FilterKey, string>> = {
  marca: "Marca",
  canal: "Canal",
  canalAjustado: "Canal",
  categoria: "Categoria",
  subcategoria: "Subcategoria",
  formato: "Formato",
  regional: "Regional",
};

export default function Filtros() {
  usePageTitle("Filtros");

  const rows = usePricing((s) => s.rows);
  const filters = usePricing((s) => s.filters);
  const metric = usePricing((s) => s.metric);
  const selectedPeriods = usePricing((s) => s.selectedPeriods);
  const setFilter = usePricing((s) => s.setFilter);
  const clearFilters = usePricing((s) => s.clearFilters);
  const setSelectedPeriods = usePricing((s) => s.setSelectedPeriods);
  const setAllPeriods = usePricing((s) => s.setAllPeriods);
  const setMetric = usePricing((s) => s.setMetric);

  const months = useMonthsInfo();
  const hasFilters = useHasActiveFilters();

  const allPeriods = useMemo(() => months.map((m) => m.periodo), [months]);

  const isAllPeriods =
    selectedPeriods === null ||
    (allPeriods.length > 0 && selectedPeriods.length === allPeriods.length);

  const selectedCount = isAllPeriods ? allPeriods.length : (selectedPeriods?.length ?? 0);

  const activePeriodLabel = useMemo(() => {
    if (isAllPeriods || months.length === 0) return "Todos os períodos";
    const sorted = [...(selectedPeriods ?? [])].sort();
    const labelOf = (p: string) => months.find((m) => m.periodo === p)?.label ?? p;
    if (sorted.length === 1) return labelOf(sorted[0]);
    return `${labelOf(sorted[0])} – ${labelOf(sorted[sorted.length - 1])}`;
  }, [isAllPeriods, selectedPeriods, months]);

  // Determine which dimension filters to show and their options
  const dimensionFilters = useMemo<{ key: FilterKey; label: string; options: string[] }[]>(() => {
    const hasCanalValues = rows.some((r) => r.canal);
    const hasCanalAjustado = rows.some((r) => r.canalAjustado);
    const hasFormato = rows.some((r) => r.formato);
    const hasRegional = rows.some((r) => r.regional);

    const fields: { key: FilterKey; label: string }[] = [{ key: "marca", label: "Marca" }];

    if (hasCanalValues) fields.push({ key: "canal", label: "Canal" });
    else if (hasCanalAjustado) fields.push({ key: "canalAjustado", label: "Canal" });

    fields.push(
      { key: "categoria", label: "Categoria" },
      { key: "subcategoria", label: "Subcategoria" },
    );

    if (hasFormato) fields.push({ key: "formato", label: "Formato" });
    if (hasRegional) fields.push({ key: "regional", label: "Regional" });

    return fields.map(({ key, label }) => {
      const vals = new Set<string>();
      for (const r of rows) {
        const v = (r as Record<string, unknown>)[key];
        if (v && typeof v === "string") vals.add(v);
      }
      return { key, label, options: Array.from(vals).sort() };
    });
  }, [rows]);

  // Active filters for summary section
  const activeFilters = useMemo(
    () =>
      (Object.entries(filters) as [FilterKey, string[] | undefined][])
        .filter(([, v]) => v && v.length > 0)
        .map(([k, v]) => ({
          key: k,
          values: v as string[],
          label: FILTER_DISPLAY_LABEL[k] ?? k,
        })),
    [filters],
  );

  const periodChipLabel = useMemo(() => {
    if (isAllPeriods || !selectedPeriods?.length) return null;
    const sorted = [...selectedPeriods].sort();
    const labelOf = (p: string) => months.find((m) => m.periodo === p)?.label ?? p;
    if (sorted.length === 1) return labelOf(sorted[0]);
    return `${labelOf(sorted[0])} – ${labelOf(sorted[sorted.length - 1])}`;
  }, [isAllPeriods, selectedPeriods, months]);

  const hasSummary = activeFilters.length > 0 || periodChipLabel !== null;

  if (rows.length === 0) {
    return (
      <div className="flex flex-1 flex-col">
        <Topbar title="Filtros" />
        <div className="flex flex-1 items-center justify-center p-8">
          <EmptyState
            title="Carregue seus dados para usar os filtros"
            message="Faça upload de um arquivo CSV para começar a filtrar."
            actionLabel="Ir para Upload"
            actionTo="/upload"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <Topbar
        title="Filtros"
        actions={
          hasFilters ? (
            <Button
              variant="outline"
              size="sm"
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                clearFilters();
                setAllPeriods();
              }}
            >
              <X className="mr-1.5 h-3.5 w-3.5" />
              Limpar todos os filtros
            </Button>
          ) : undefined
        }
      />

      <div className="flex-1 space-y-6 p-4 md:p-8">
        {/* Page intro */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <SlidersHorizontal className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Filtros analíticos</h1>
            <p className="text-sm text-muted-foreground">
              As alterações aqui refletem imediatamente em todos os dashboards.
            </p>
          </div>
        </div>

        {/* Período */}
        <GlassCard>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Período</h2>
            <Badge variant="secondary" className="text-xs font-medium">
              {activePeriodLabel}
            </Badge>
          </div>

          <div className="mb-4 flex items-center gap-3">
            <Switch
              id="all-periods"
              checked={isAllPeriods}
              onCheckedChange={(checked) => {
                if (checked) {
                  setAllPeriods();
                } else if (allPeriods.length > 0) {
                  setSelectedPeriods([allPeriods[allPeriods.length - 1]]);
                }
              }}
            />
            <Label htmlFor="all-periods" className="cursor-pointer text-sm">
              Todos os períodos
            </Label>
          </div>

          {months.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {months.map((m) => {
                const active = isAllPeriods || (selectedPeriods?.includes(m.periodo) ?? false);
                return (
                  <button
                    key={m.periodo}
                    type="button"
                    onClick={() => {
                      if (isAllPeriods) {
                        const next = allPeriods.filter((p) => p !== m.periodo);
                        if (next.length === 0) return;
                        setSelectedPeriods(next);
                      } else {
                        const cur = selectedPeriods ?? allPeriods;
                        const next = active
                          ? cur.filter((p) => p !== m.periodo)
                          : [...cur, m.periodo];
                        if (next.length === 0 || next.length === allPeriods.length) {
                          setAllPeriods();
                        } else {
                          setSelectedPeriods(next);
                        }
                      }
                    }}
                    className={cn(
                      "cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border/40 bg-card/50 text-muted-foreground hover:border-primary/50",
                    )}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          )}

          <p className="mt-3 text-xs text-muted-foreground">
            {selectedCount} meses selecionados de {allPeriods.length} disponíveis
          </p>
        </GlassCard>

        {/* Dimensões */}
        {dimensionFilters.length > 0 && (
          <GlassCard>
            <h2 className="mb-5 text-base font-semibold text-foreground">Dimensões</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {dimensionFilters.map(({ key, label, options }) => {
                if (options.length === 0) return null;
                const selected = filters[key] ?? [];
                return (
                  <div key={key} className="rounded-xl border border-border/30 bg-card/30 p-4">
                    <div className="mb-2.5 flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {label}
                      </span>
                      {selected.length > 0 && (
                        <Badge
                          variant="secondary"
                          className="h-5 px-1.5 text-[10px] font-semibold"
                        >
                          {selected.length}
                        </Badge>
                      )}
                    </div>
                    <MultiSelectFilter
                      options={options.map((v) => ({ value: v, label: v }))}
                      selected={selected}
                      onChange={(next) => setFilter(key, next)}
                      placeholder="Todos"
                    />
                  </div>
                );
              })}
            </div>
          </GlassCard>
        )}

        {/* Métrica principal */}
        <GlassCard>
          <h2 className="mb-5 text-base font-semibold text-foreground">Métrica principal</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(
              [
                { value: "cm", label: "Contribuição de Margem (CM)" },
                { value: "mb", label: "Margem Bruta (MB)" },
              ] as { value: "cm" | "mb"; label: string }[]
            ).map(({ value, label }) => {
              const active = metric === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMetric(value)}
                  className={cn(
                    "cursor-pointer rounded-xl border p-4 text-left transition-colors",
                    active
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border/40 bg-card/40 text-muted-foreground hover:border-primary/30 hover:bg-card/60",
                  )}
                >
                  <span className="text-sm font-medium">{label}</span>
                  {active && (
                    <span className="mt-1 block text-[11px] font-normal opacity-70">
                      Métrica ativa
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </GlassCard>

        {/* Resumo de filtros ativos — só aparece quando há filtros */}
        {hasSummary && (
          <GlassCard>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">Filtros ativos</h2>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => {
                  clearFilters();
                  setAllPeriods();
                }}
              >
                <X className="mr-1.5 h-3.5 w-3.5" />
                Limpar todos
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {activeFilters.map(({ key, values, label }) => (
                <ActiveChip
                  key={key}
                  label={`${label}: ${values.length === 1 ? values[0] : `${values.length} valores`}`}
                  onRemove={() => setFilter(key, [])}
                />
              ))}
              {periodChipLabel && (
                <ActiveChip
                  label={`Período: ${periodChipLabel}`}
                  onRemove={() => setAllPeriods()}
                  tone="period"
                />
              )}
            </div>
          </GlassCard>
        )}
      </div>
    </div>
  );
}

function ActiveChip({
  label,
  onRemove,
  tone = "filter",
}: {
  label: string;
  onRemove: () => void;
  tone?: "filter" | "period";
}) {
  const toneCls =
    tone === "period"
      ? "border-accent/40 bg-accent/10 text-accent"
      : "border-primary/40 bg-primary/10 text-primary";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium",
        toneCls,
      )}
    >
      {label}
      <button
        onClick={onRemove}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full opacity-70 transition-opacity hover:bg-foreground/10 hover:opacity-100"
        aria-label="Remover filtro"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
