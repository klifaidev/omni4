import { useEffect, useMemo, useState } from "react";
import { Save, Trash2, X, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { EmptyState } from "@/components/pricing/EmptyState";
import { MultiSelectFilter, type MultiSelectOption } from "@/components/pricing/MultiSelectFilter";
import { usePricing } from "@/store/pricing";
import { useMonthsInfo } from "@/store/selectors";
import { usePageTitle } from "@/hooks/use-page-title";
import { applyFilters } from "@/lib/analytics";
import { fiscalYearStartYear } from "@/lib/fiscalYear";
import type { FilterKey, Filters, PricingRow } from "@/lib/types";
import { cn } from "@/lib/utils";

const FILTER_DISPLAY_LABEL: Partial<Record<FilterKey, string>> = {
  marca: "Marca",
  sku: "SKU",
  canal: "Canal",
  canalAjustado: "Canal Ajustado",
  mercadoAjustado: "Mercado Ajustado",
  categoria: "Categoria",
  subcategoria: "Subcategoria",
  formato: "Formato",
  mercado: "Mercado",
  sabor: "Sabor",
  tecnologia: "Tecnologia",
  faixaPeso: "Faixa de Peso",
  inovacao: "Inovação / Regular",
  legado: "Legado",
  regional: "Regional",
};

type DimensionField = { key: FilterKey; label: string };
type DimensionFilterGroup = { title: string; filters: (DimensionField & { options: MultiSelectOption[] })[] };
type PeriodShortcut = { key: string; label: string; periods: string[] };
type FilterPreset = {
  id: string;
  name: string;
  filters: Filters;
  selectedPeriods: string[] | null;
  createdAt: string;
};

const FILTER_PRESETS_STORAGE_KEY = "omni4:filtros:presets:v1";

const DIMENSION_GROUPS: { title: string; fields: DimensionField[] }[] = [
  {
    title: "Comercial",
    fields: [
      { key: "canal", label: "Canal" },
      { key: "canalAjustado", label: "Canal Ajustado" },
      { key: "mercadoAjustado", label: "Mercado Ajustado" },
      { key: "regional", label: "Regional" },
    ],
  },
  {
    title: "Produto",
    fields: [
      { key: "marca", label: "Marca" },
      { key: "sku", label: "SKU" },
      { key: "categoria", label: "Categoria" },
      { key: "subcategoria", label: "Subcategoria" },
      { key: "formato", label: "Formato" },
      { key: "mercado", label: "Mercado" },
      { key: "sabor", label: "Sabor" },
      { key: "tecnologia", label: "Tecnologia" },
      { key: "faixaPeso", label: "Faixa de Peso" },
      { key: "inovacao", label: "Inovação / Regular" },
      { key: "legado", label: "Legado" },
    ],
  },
];

function fieldHasValues(rows: PricingRow[], key: FilterKey): boolean {
  return rows.some((r) => {
    const v = (r as Record<string, unknown>)[key];
    return typeof v === "string" && v.trim().length > 0;
  });
}

function getDimensionOptions(rows: PricingRow[], key: FilterKey): MultiSelectOption[] {
  if (key === "sku") {
    const options = new Map<string, string>();
    for (const r of rows) {
      if (!r.sku?.trim()) continue;
      const desc = r.skuDesc?.trim();
      if (!options.has(r.sku)) options.set(r.sku, desc ? `${r.sku} - ${desc}` : r.sku);
    }
    return Array.from(options, ([value, label]) => ({ value, label })).sort((a, b) =>
      a.value.localeCompare(b.value, "pt-BR"),
    );
  }

  const vals = new Set<string>();
  for (const r of rows) {
    const v = (r as Record<string, unknown>)[key];
    if (typeof v === "string" && v.trim().length > 0) vals.add(v);
  }
  return Array.from(vals)
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .map((value) => ({ value, label: value }));
}

function filtersWithoutKey(filters: Filters, key: FilterKey): Filters {
  const next: Filters = {};
  for (const [filterKey, values] of Object.entries(filters) as [FilterKey, string[] | undefined][]) {
    if (filterKey !== key && values && values.length > 0) next[filterKey] = values;
  }
  return next;
}

function samePeriods(a: string[] | null, b: string[]): boolean {
  if (a === null) return false;
  if (a.length !== b.length) return false;
  const aSet = new Set(a);
  return b.every((period) => aSet.has(period));
}

function loadFilterPresets(): FilterPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FILTER_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((preset): preset is FilterPreset => {
      return (
        preset &&
        typeof preset.id === "string" &&
        typeof preset.name === "string" &&
        typeof preset.createdAt === "string"
      );
    });
  } catch {
    return [];
  }
}

function saveFilterPresets(presets: FilterPreset[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FILTER_PRESETS_STORAGE_KEY, JSON.stringify(presets));
}

function createPresetId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `preset-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function Filtros() {
  usePageTitle("Filtros");

  const rows = usePricing((s) => s.rows);
  const filters = usePricing((s) => s.filters);
  const selectedPeriods = usePricing((s) => s.selectedPeriods);
  const setFilter = usePricing((s) => s.setFilter);
  const clearFilters = usePricing((s) => s.clearFilters);
  const setSelectedPeriods = usePricing((s) => s.setSelectedPeriods);
  const setAllPeriods = usePricing((s) => s.setAllPeriods);

  const months = useMonthsInfo();
  const [presets, setPresets] = useState<FilterPreset[]>(() => loadFilterPresets());
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presetToDelete, setPresetToDelete] = useState<FilterPreset | null>(null);

  useEffect(() => {
    saveFilterPresets(presets);
  }, [presets]);

  const allPeriods = useMemo(() => months.map((m) => m.periodo), [months]);

  const isAllPeriods =
    selectedPeriods === null ||
    (allPeriods.length > 0 && selectedPeriods.length === allPeriods.length);

  const selectedCount = isAllPeriods ? allPeriods.length : (selectedPeriods?.length ?? 0);

  const latestFiscalYearStart = useMemo(() => {
    if (months.length === 0) return null;
    const latest = months[months.length - 1];
    return fiscalYearStartYear(latest.mes, latest.ano);
  }, [months]);

  const periodShortcuts = useMemo<PeriodShortcut[]>(() => {
    if (months.length === 0) return [];

    const byFiscalYear = (startYear: number) =>
      months
        .filter((m) => fiscalYearStartYear(m.mes, m.ano) === startYear)
        .map((m) => m.periodo);

    const shortcuts: PeriodShortcut[] = [
      { key: "all", label: "Todos os períodos", periods: allPeriods },
      { key: "last-3", label: "Últimos três meses", periods: months.slice(-3).map((m) => m.periodo) },
      { key: "last-6", label: "Últimos seis meses", periods: months.slice(-6).map((m) => m.periodo) },
    ];

    if (latestFiscalYearStart !== null) {
      shortcuts.splice(
        1,
        0,
        {
          key: "current-fy",
          label: "Ano fiscal atual",
          periods: byFiscalYear(latestFiscalYearStart),
        },
        {
          key: "previous-fy",
          label: "Ano fiscal anterior",
          periods: byFiscalYear(latestFiscalYearStart - 1),
        },
      );
    }

    return shortcuts.filter((shortcut) => shortcut.periods.length > 0);
  }, [allPeriods, latestFiscalYearStart, months]);

  const activeShortcutKey = useMemo(() => {
    if (isAllPeriods) return "all";
    const current = selectedPeriods ?? [];
    return periodShortcuts.find((shortcut) => samePeriods(current, shortcut.periods))?.key ?? null;
  }, [isAllPeriods, periodShortcuts, selectedPeriods]);

  const monthsByYear = useMemo(() => {
    const groups = new Map<number, typeof months>();
    for (const month of months) {
      const group = groups.get(month.ano);
      if (group) group.push(month);
      else groups.set(month.ano, [month]);
    }
    return Array.from(groups.entries()).map(([year, items]) => ({ year, months: items }));
  }, [months]);

  const matchingRows = useMemo(
    () => applyFilters(rows, filters, selectedPeriods),
    [filters, rows, selectedPeriods],
  );

  const matchingSkuCount = useMemo(() => {
    const skus = new Set<string>();
    for (const r of matchingRows) {
      if (r.sku) skus.add(r.sku);
    }
    return skus.size;
  }, [matchingRows]);

  const activePeriodLabel = useMemo(() => {
    if (isAllPeriods || months.length === 0) return "Todos os períodos";
    const sorted = [...(selectedPeriods ?? [])].sort();
    const labelOf = (p: string) => months.find((m) => m.periodo === p)?.label ?? p;
    if (sorted.length === 1) return labelOf(sorted[0]);
    return `${labelOf(sorted[0])} – ${labelOf(sorted[sorted.length - 1])}`;
  }, [isAllPeriods, selectedPeriods, months]);

  // Options are cross-filtered by the other dimensions and period, but not by themselves.
  const dimensionFilterGroups = useMemo<DimensionFilterGroup[]>(() => {
    const scopedRowsByKey = new Map<FilterKey, PricingRow[]>();

    const getScopedRows = (key: FilterKey) => {
      const cached = scopedRowsByKey.get(key);
      if (cached) return cached;
      const scopedRows = applyFilters(rows, filtersWithoutKey(filters, key), selectedPeriods);
      scopedRowsByKey.set(key, scopedRows);
      return scopedRows;
    };

    return DIMENSION_GROUPS.map(({ title, fields }) => ({
      title,
      filters: fields
        .filter(({ key }) => fieldHasValues(rows, key))
        .map(({ key, label }) => ({
          key,
          label,
          options: getDimensionOptions(getScopedRows(key), key),
        })),
    })).filter((group) => group.filters.length > 0);
  }, [filters, rows, selectedPeriods]);

  const hasDimensionFilters = dimensionFilterGroups.length > 0;

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

  const currentPresetSummary = useMemo(() => {
    const filterCount = activeFilters.reduce((acc, item) => acc + item.values.length, 0);
    const periodText = isAllPeriods ? "todos os períodos" : `${selectedCount} período(s)`;
    return `${filterCount} filtro(s) · ${periodText}`;
  }, [activeFilters, isAllPeriods, selectedCount]);

  const handleSavePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const nextPreset: FilterPreset = {
      id: createPresetId(),
      name,
      filters: JSON.parse(JSON.stringify(filters)) as Filters,
      selectedPeriods: selectedPeriods ? [...selectedPeriods] : null,
      createdAt: new Date().toISOString(),
    };
    setPresets((cur) => [nextPreset, ...cur]);
    setPresetName("");
    setSaveDialogOpen(false);
  };

  const applyPreset = (preset: FilterPreset) => {
    clearFilters();
    for (const [key, values] of Object.entries(preset.filters) as [FilterKey, string[] | undefined][]) {
      if (values?.length) setFilter(key, values);
    }
    setSelectedPeriods(preset.selectedPeriods ? [...preset.selectedPeriods] : null);
  };

  const deletePreset = () => {
    if (!presetToDelete) return;
    setPresets((cur) => cur.filter((preset) => preset.id !== presetToDelete.id));
    setPresetToDelete(null);
  };

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
    <>
    <div className="flex flex-1 flex-col">
      <Topbar title="Filtros" />

      <div className="flex-1 space-y-6 p-4 md:p-8">
        {/* Page intro */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <SlidersHorizontal className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-lg font-semibold text-foreground">Filtros analíticos</h1>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="h-6 px-2.5 text-xs font-semibold">
                    {matchingRows.length.toLocaleString("pt-BR")}{" "}
                    {matchingRows.length === 1
                      ? "registro correspondente"
                      : "registros correspondentes"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {matchingSkuCount.toLocaleString("pt-BR")}{" "}
                    {matchingSkuCount === 1 ? "SKU distinto" : "SKUs distintos"}
                  </span>
                </div>
              </div>
              {hasSummary && (
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
                  Limpar todos
                </Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              As alterações aqui refletem imediatamente em todos os dashboards.
            </p>
            {hasSummary && (
              <div className="mt-3 flex flex-wrap gap-2">
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
            )}
          </div>
        </div>

        <GlassCard>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">Presets de filtros</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Salve combinações frequentes de dimensão, período e métrica para reaplicar depois.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => {
                setPresetName("");
                setSaveDialogOpen(true);
              }}
            >
              <Save className="mr-1.5 h-3.5 w-3.5" />
              Salvar combinação atual
            </Button>
          </div>

          <div className="mt-4">
            {presets.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/50 bg-card/30 px-4 py-3 text-sm text-muted-foreground">
                Nenhum preset salvo ainda. Ajuste os filtros e salve a primeira combinação quando fizer sentido.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {presets.map((preset) => (
                  <div
                    key={preset.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-secondary/40 px-2 py-1"
                  >
                    <button
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className="max-w-[220px] truncate px-1 text-sm font-medium text-foreground hover:text-primary"
                      title={preset.name}
                    >
                      {preset.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPresetToDelete(preset)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Excluir preset ${preset.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </GlassCard>

        {/* Período */}
        <GlassCard>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Período</h2>
            <Badge variant="secondary" className="text-xs font-medium">
              {activePeriodLabel}
            </Badge>
          </div>

          <div className="mb-5 flex flex-wrap gap-2">
            {periodShortcuts.map((shortcut) => {
              const active = activeShortcutKey === shortcut.key;
              return (
                <button
                  key={shortcut.key}
                  type="button"
                  onClick={() => {
                    if (shortcut.key === "all") setAllPeriods();
                    else setSelectedPeriods(shortcut.periods);
                  }}
                  className={cn(
                    "cursor-pointer rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border/40 bg-card/50 text-muted-foreground hover:border-primary/50 hover:bg-card/70",
                  )}
                >
                  {shortcut.label}
                </button>
              );
            })}
          </div>

          {months.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Personalizado
                </span>
                <span className="h-px flex-1 bg-border/40" />
              </div>
              {monthsByYear.map((group) => (
                <div key={group.year} className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground">{group.year}</div>
                  <div className="flex flex-wrap gap-2">
                    {group.months.map((m) => {
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
                </div>
              ))}
            </div>
          )}

          <p className="mt-3 text-xs text-muted-foreground">
            {selectedCount} meses selecionados de {allPeriods.length} disponíveis
          </p>
        </GlassCard>

        {/* Dimensões */}
        {hasDimensionFilters && (
          <GlassCard>
            <h2 className="mb-5 text-base font-semibold text-foreground">Dimensões</h2>
            <div className="space-y-5">
              {dimensionFilterGroups.map((group) => (
                <section key={group.title} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {group.title}
                    </span>
                    <span className="h-px flex-1 bg-border/40" />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {group.filters.map(({ key, label, options }) => {
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
                            options={options}
                            selected={selected}
                            onChange={(next) => setFilter(key, next)}
                            placeholder="Todos"
                            variant={key === "sku" ? "sku" : undefined}
                          />
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </GlassCard>
        )}
      </div>
    </div>

    <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Salvar preset de filtros</DialogTitle>
          <DialogDescription>
            Dê um nome para reaplicar esta combinação de filtros, período e métrica no futuro.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Input
            value={presetName}
            onChange={(event) => setPresetName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleSavePreset();
            }}
            placeholder="Ex.: Revisão mensal Chocolates"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">{currentPresetSummary}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSavePreset} disabled={!presetName.trim()}>
            Salvar preset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog open={presetToDelete !== null} onOpenChange={(open) => !open && setPresetToDelete(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir preset?</AlertDialogTitle>
          <AlertDialogDescription>
            O preset "{presetToDelete?.name}" será removido deste computador. Essa ação não altera os filtros
            aplicados agora.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={deletePreset}
          >
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
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
