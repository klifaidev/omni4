import {
  aggregate,
  DreTable,
  LINES,
  type DrePeriodMode,
  type PeriodAgg,
  type RowKind,
} from "@/components/pricing/DreTable";
import { EmptyState } from "@/components/pricing/EmptyState";
import { GlassCard } from "@/components/pricing/GlassCard";
import { MultiSelectFilter } from "@/components/pricing/MultiSelectFilter";
import { Topbar } from "@/components/pricing/Topbar";
import { applyFilters, uniqueValues } from "@/lib/analytics";
import { getDeParaBySku } from "@/lib/depara";
import { usePricing } from "@/store/pricing";
import { useBudget } from "@/store/budget";
import { useMonthsInfo } from "@/store/selectors";
import { useMemo, useState } from "react";
import { Briefcase, Calendar, ChevronDown, Download, Filter, Package, Sigma, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { BudgetRow } from "@/lib/budget";
import type { FilterKey, Filters, PricingRow } from "@/lib/types";
import { usePageTitle } from "@/hooks/use-page-title";
import * as XLSX from "xlsx";

const PRODUCT_FILTER_FIELDS: { key: FilterKey; label: string }[] = [
  { key: "categoria", label: "Categoria" },
  { key: "subcategoria", label: "Subcategoria" },
  { key: "marca", label: "Marca" },
  { key: "tecnologia", label: "Tecnologia" },
  { key: "formato", label: "Formato" },
  { key: "mercado", label: "Mercado" },
  { key: "faixaPeso", label: "Faixa de Peso" },
  { key: "sabor", label: "Sabor" },
  { key: "sku", label: "Artigo (SKU)" },
];

const COMMERCIAL_FILTER_FIELDS: { key: FilterKey; label: string }[] = [
  { key: "canalAjustado", label: "Canal Ajustado" },
  { key: "mercadoAjustado", label: "Mercado Ajustado" },
  { key: "regional", label: "Regional" },
  { key: "uf", label: "UF" },
  { key: "gestorResp", label: "Gestor Resp." },
];

const BATCH_EXPORT_FIELDS: { key: FilterKey; label: string; group: "Produto" | "Comercial" }[] = [
  { key: "categoria", label: "Categoria", group: "Produto" },
  { key: "subcategoria", label: "Subcategoria", group: "Produto" },
  { key: "marca", label: "Marca", group: "Produto" },
  { key: "sku", label: "Artigo (SKU)", group: "Produto" },
  { key: "canalAjustado", label: "Canal Ajustado", group: "Comercial" },
  { key: "mercadoAjustado", label: "Mercado Ajustado", group: "Comercial" },
  { key: "regional", label: "Regional", group: "Comercial" },
  { key: "uf", label: "UF", group: "Comercial" },
  { key: "gestorResp", label: "Gestor Resp.", group: "Comercial" },
];

function applyBudgetFilters(rows: BudgetRow[], filters: Filters): BudgetRow[] {
  return rows.filter((r) => {
    for (const [k, vals] of Object.entries(filters)) {
      if (!vals || vals.length === 0) continue;
      const v = (r as unknown as Record<string, unknown>)[k] as string | undefined;
      if (!v || !vals.includes(v)) return false;
    }
    return true;
  });
}

export default function Dre() {
  usePageTitle("DRE");
  const rows = usePricing((s) => s.rows);
  const filters = usePricing((s) => s.filters);
  const setFilter = usePricing((s) => s.setFilter);
  const clearFilters = usePricing((s) => s.clearFilters);
  const selectedPeriods = usePricing((s) => s.selectedPeriods);
  const budgetRowsAll = useBudget((s) => s.rows);
  const months = useMonthsInfo();
  const [mode, setMode] = useState<DrePeriodMode>("month");
  const [showFilters, setShowFilters] = useState(false);
  const [exportDelta, setExportDelta] = useState(false);
  const [exportBudget, setExportBudget] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchDim, setBatchDim] = useState<FilterKey>("categoria");
  const [batchValues, setBatchValues] = useState<string[]>([]);
  const [batchIncludeTotal, setBatchIncludeTotal] = useState(true);

  const filtered = useMemo(() => applyFilters(rows, filters, null), [rows, filters]);
  const filteredBudget = useMemo(
    () => applyBudgetFilters(budgetRowsAll, filters),
    [budgetRowsAll, filters],
  );
  const filterBaseRows = useMemo(
    () => applyFilters(rows, {}, selectedPeriods).filter((r) => getDeParaBySku(r.sku)),
    [rows, selectedPeriods],
  );
  const activeFiltersCount = useMemo(
    () => Object.values(filters).reduce((sum, values) => sum + (values?.length ?? 0), 0),
    [filters],
  );
  const batchBaseRows = useMemo(
    () => applyFilters(rows, omitFilter(filters, batchDim), selectedPeriods),
    [rows, filters, batchDim, selectedPeriods],
  );
  const batchOptions = useMemo(
    () => buildBatchOptions(batchBaseRows, batchDim),
    [batchBaseRows, batchDim],
  );

  if (rows.length === 0) {
    return (
      <>
        <Topbar title="DRE" subtitle="Consolidado por período com filtros ativos" />
        <div className="px-8 py-6">
          <EmptyState
            title="DRE gerencial"
            message="Carregue dados mensais para montar o DRE com ROL, CPV, margem bruta e contribuição."
            actionLabel="Ir para Upload"
            actionTo="/upload"
          />
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="DRE" subtitle="Consolidado por período com filtros ativos" />
      <div className="space-y-6 px-8 py-6">
        <GlassCard>
          <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium">DRE por Período</h2>
              <p className="text-xs text-muted-foreground">
                {mode === "month"
                  ? "Visão consolidada por mês - valores aplicam os filtros ativos."
                  : "Acumulado: somatória dos períodos filtrados em uma única coluna."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <PeriodModeToggle mode={mode} onChange={setMode} />
              <ExportOptionToggle
                label="Delta"
                active={exportDelta}
                onClick={() => setExportDelta((v) => !v)}
              />
              <ExportOptionToggle
                label="Budget"
                active={exportBudget}
                onClick={() => setExportBudget((v) => !v)}
              />
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => {
                  try {
                    exportDreXlsx({
                      rows: filtered,
                      months,
                      mode,
                      selectedPeriods,
                      budgetRows: filteredBudget,
                      showDelta: exportDelta,
                      showBudget: exportBudget,
                    });
                    toast.success("DRE exportado em XLSX.");
                  } catch (err) {
                    toast.error("Erro ao exportar DRE: " + (err as Error).message);
                  }
                }}
              >
                <Download className="h-4 w-4" />
                Exportar XLSX
              </Button>
              <Button
                variant="default"
                size="sm"
                className="gap-2"
                onClick={() => setBatchOpen(true)}
              >
                <Download className="h-4 w-4" />
                Exportar em lote
              </Button>
            </div>
          </header>
          <BatchExportDialog
            open={batchOpen}
            onOpenChange={setBatchOpen}
            dimension={batchDim}
            onDimensionChange={(dim) => {
              setBatchDim(dim);
              setBatchValues([]);
            }}
            selectedValues={batchValues}
            onSelectedValuesChange={setBatchValues}
            includeTotal={batchIncludeTotal}
            onIncludeTotalChange={setBatchIncludeTotal}
            options={batchOptions}
            filters={filters}
            rows={rows}
            budgetRows={budgetRowsAll}
            months={months}
            mode={mode}
            selectedPeriods={selectedPeriods}
            showDelta={exportDelta}
            showBudget={exportBudget}
          />
          <DreFiltersPanel
            open={showFilters}
            onToggle={() => setShowFilters((v) => !v)}
            rows={filterBaseRows}
            filters={filters}
            onChange={setFilter}
            onClear={clearFilters}
            activeCount={activeFiltersCount}
          />
          <DreTable
            rows={filtered}
            months={months}
            mode={mode}
            budgetRows={filteredBudget}
            allRows={filtered}
          />
        </GlassCard>
      </div>
    </>
  );
}

interface BatchOption {
  value: string;
  label: string;
  rows: number;
  rol: number;
  volume: number;
}

function omitFilter(filters: Filters, key: FilterKey): Filters {
  const next: Filters = { ...filters };
  delete next[key];
  return next;
}

function safeSheetName(raw: string, fallback: string): string {
  const clean = (raw || fallback)
    .replace(/[\\/?*\[\]:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31);
  return clean || fallback.slice(0, 31);
}

function uniqueSheetName(raw: string, used: Set<string>, fallback: string): string {
  const base = safeSheetName(raw, fallback);
  let name = base;
  let i = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = ` ${i}`;
    name = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    i += 1;
  }
  used.add(name.toLowerCase());
  return name;
}

function clusterValue(row: PricingRow, key: FilterKey): string | null {
  const value = row[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildBatchOptions(rows: PricingRow[], dimension: FilterKey): BatchOption[] {
  const map = new Map<string, BatchOption>();
  for (const row of rows) {
    const value = clusterValue(row, dimension);
    if (!value) continue;
    const current = map.get(value);
    if (current) {
      current.rows += 1;
      current.rol += row.rol || 0;
      current.volume += row.volumeKg || 0;
      continue;
    }
    const desc = dimension === "sku" && row.skuDesc ? `${value} - ${row.skuDesc}` : value;
    map.set(value, {
      value,
      label: desc,
      rows: 1,
      rol: row.rol || 0,
      volume: row.volumeKg || 0,
    });
  }
  return Array.from(map.values()).sort((a, b) => {
    const byRol = Math.abs(b.rol) - Math.abs(a.rol);
    return byRol !== 0 ? byRol : a.label.localeCompare(b.label, "pt-BR");
  });
}

function compactCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: Math.abs(value) >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(value) >= 1_000_000 ? 1 : 0,
  });
}

function BatchExportDialog({
  open,
  onOpenChange,
  dimension,
  onDimensionChange,
  selectedValues,
  onSelectedValuesChange,
  includeTotal,
  onIncludeTotalChange,
  options,
  filters,
  rows,
  budgetRows,
  months,
  mode,
  selectedPeriods,
  showDelta,
  showBudget,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dimension: FilterKey;
  onDimensionChange: (dimension: FilterKey) => void;
  selectedValues: string[];
  onSelectedValuesChange: (values: string[]) => void;
  includeTotal: boolean;
  onIncludeTotalChange: (include: boolean) => void;
  options: BatchOption[];
  filters: Filters;
  rows: PricingRow[];
  budgetRows: BudgetRow[];
  months: ReturnType<typeof useMonthsInfo>;
  mode: DrePeriodMode;
  selectedPeriods: string[] | null;
  showDelta: boolean;
  showBudget: boolean;
}) {
  const selectedSet = new Set(selectedValues);
  const selectedOptions = options.filter((option) => selectedSet.has(option.value));
  const selectedRows = selectedOptions.reduce((sum, option) => sum + option.rows, 0);
  const selectedRol = selectedOptions.reduce((sum, option) => sum + option.rol, 0);
  const sheetCount = selectedOptions.length + (includeTotal ? 1 : 0);
  const dimMeta = BATCH_EXPORT_FIELDS.find((field) => field.key === dimension) ?? BATCH_EXPORT_FIELDS[0];

  const quickSelect = (count: number) => {
    onSelectedValuesChange(options.slice(0, count).map((option) => option.value));
  };

  const handleExport = () => {
    try {
      exportDreBatchXlsx({
        rows,
        budgetRows,
        filters,
        dimension,
        clusters: selectedOptions,
        includeTotal,
        months,
        mode,
        selectedPeriods,
        showDelta,
        showBudget,
      });
      toast.success(`${sheetCount} aba${sheetCount > 1 ? "s" : ""} exportada${sheetCount > 1 ? "s" : ""}.`);
      onOpenChange(false);
    } catch (err) {
      toast.error("Erro ao exportar lote: " + (err as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Exportar DRE em lote</DialogTitle>
          <DialogDescription>
            Gere um único XLSX com uma aba para cada cluster selecionado, mantendo os filtros ativos como base.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[240px_1fr]">
          <div className="space-y-4 rounded-xl border border-border/50 bg-secondary/15 p-4">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Quebrar por
              </label>
              <select
                className="h-9 w-full rounded-md border border-border/60 bg-background px-2 text-sm"
                value={dimension}
                onChange={(event) => onDimensionChange(event.target.value as FilterKey)}
              >
                {BATCH_EXPORT_FIELDS.map((field) => (
                  <option key={field.key} value={field.key}>
                    {field.group} - {field.label}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-sm">
              <span>
                <span className="block font-medium">Incluir consolidado</span>
                <span className="block text-xs text-muted-foreground">Primeira aba com os filtros atuais</span>
              </span>
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={includeTotal}
                onChange={(event) => onIncludeTotalChange(event.target.checked)}
              />
            </label>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <button type="button" className="rounded-md border border-border/50 px-2 py-1.5 text-muted-foreground hover:text-foreground" onClick={() => quickSelect(10)}>
                Top 10
              </button>
              <button type="button" className="rounded-md border border-border/50 px-2 py-1.5 text-muted-foreground hover:text-foreground" onClick={() => quickSelect(25)}>
                Top 25
              </button>
              <button type="button" className="rounded-md border border-border/50 px-2 py-1.5 text-muted-foreground hover:text-foreground" onClick={() => onSelectedValuesChange(options.map((option) => option.value))}>
                Todos
              </button>
              <button type="button" className="rounded-md border border-border/50 px-2 py-1.5 text-muted-foreground hover:text-foreground" onClick={() => onSelectedValuesChange([])}>
                Limpar
              </button>
            </div>

            <div className="rounded-lg bg-background/60 p-3 text-xs">
              <div className="font-medium text-foreground">{sheetCount} aba{sheetCount !== 1 ? "s" : ""}</div>
              <div className="mt-1 text-muted-foreground">{selectedRows.toLocaleString("pt-BR")} linhas selecionadas</div>
              <div className="text-muted-foreground">{compactCurrency(selectedRol)} em ROL</div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{dimMeta.label}</p>
                <p className="text-xs text-muted-foreground">
                  {options.length.toLocaleString("pt-BR")} cluster{options.length !== 1 ? "s" : ""} disponível{options.length !== 1 ? "is" : ""}.
                </p>
              </div>
              {selectedValues.length > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                  {selectedValues.length} selecionado{selectedValues.length > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <MultiSelectFilter
              options={options.map((option) => ({
                value: option.value,
                label: `${option.label} · ${compactCurrency(option.rol)} · ${option.rows.toLocaleString("pt-BR")} linhas`,
              }))}
              selected={selectedValues}
              onChange={onSelectedValuesChange}
              placeholder="Selecione os clusters"
              variant={dimMeta.group === "Comercial" ? "comercial" : "sku"}
            />
            <div className="max-h-56 overflow-auto rounded-lg border border-border/40">
              {selectedOptions.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                  Selecione um ou mais clusters para montar o lote.
                </div>
              ) : (
                selectedOptions.map((option) => (
                  <div key={option.value} className="flex items-center justify-between gap-3 border-b border-border/30 px-3 py-2 last:border-b-0">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{option.label}</div>
                      <div className="text-xs text-muted-foreground">{option.rows.toLocaleString("pt-BR")} linhas</div>
                    </div>
                    <div className="shrink-0 text-right text-xs font-medium tabular-nums">
                      {compactCurrency(option.rol)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleExport} disabled={sheetCount === 0 || selectedOptions.length === 0}>
            Exportar lote
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PeriodModeToggle({
  mode,
  onChange,
}: {
  mode: DrePeriodMode;
  onChange: (m: DrePeriodMode) => void;
}) {
  const opts: { v: DrePeriodMode; label: string; icon: typeof Calendar; hint: string }[] = [
    { v: "month", label: "Mensal", icon: Calendar, hint: "Coluna por mês" },
    { v: "fy", label: "Acumulado", icon: Sigma, hint: "Somatória dos períodos filtrados em uma coluna" },
  ];
  return (
    <div className="inline-flex items-center rounded-lg border border-border/40 bg-secondary/30 p-0.5">
      {opts.map((o) => {
        const active = mode === o.v;
        const Icon = o.icon;
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            title={o.hint}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function ExportOptionToggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-md border px-3 text-xs font-medium transition-colors",
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border/50 bg-background/40 text-muted-foreground hover:text-foreground",
      )}
      title={active ? `${label} entrará no XLSX` : `${label} não entrará no XLSX`}
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          active ? "bg-primary" : "bg-muted-foreground/30",
        )}
      />
      {label}
    </button>
  );
}

function DreFiltersPanel({
  open,
  onToggle,
  rows,
  filters,
  onChange,
  onClear,
  activeCount,
}: {
  open: boolean;
  onToggle: () => void;
  rows: PricingRow[];
  filters: Filters;
  onChange: (key: FilterKey, values: string[]) => void;
  onClear: () => void;
  activeCount: number;
}) {
  const renderField = (
    field: { key: FilterKey; label: string },
    variant: "sku" | "comercial",
  ) => {
    const options = uniqueValues(rows, field.key as keyof PricingRow);
    if (options.length === 0) return null;

    const items = options
      .map((value) => {
        if (field.key !== "sku") return { value, label: value };
        const desc = rows.find((row) => row.sku === value)?.skuDesc;
        return { value, label: desc ? `${value} - ${desc}` : value };
      })
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

    return (
      <div key={field.key}>
        <label
          className={cn(
            "mb-1 block text-[11px] font-medium uppercase tracking-wider",
            variant === "comercial" ? "text-success" : "text-muted-foreground",
          )}
        >
          {field.label}
        </label>
        <MultiSelectFilter
          options={items}
          selected={filters[field.key] ?? []}
          onChange={(values) => onChange(field.key, values)}
          placeholder="Todos"
          variant={variant}
        />
      </div>
    );
  };

  return (
    <section className="mb-4 rounded-xl border border-border/50 bg-secondary/15">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2">
          <span className="rounded-md bg-primary/10 p-1.5 text-primary">
            <Filter className="h-4 w-4" />
          </span>
          <span>
            <span className="block text-sm font-medium">Filtros da aba</span>
            <span className="block text-xs text-muted-foreground">
              Produto e Comercial aplicados ao DRE e ao XLSX
            </span>
          </span>
        </span>
        <span className="flex items-center gap-2">
          {activeCount > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
              {activeCount} selecionado{activeCount > 1 ? "s" : ""}
            </span>
          )}
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-border/40 px-4 pb-4 pt-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Filtre direto por esta tela sem precisar sair do DRE.
            </p>
            {activeCount > 0 && (
              <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={onClear}>
                <X className="h-3 w-3" />
                Limpar
              </Button>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Produto
                </h4>
                <div className="h-px flex-1 bg-border/40" />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
                {PRODUCT_FILTER_FIELDS.map((field) => renderField(field, "sku"))}
              </div>
            </div>

            <div className="rounded-lg border border-success/20 bg-success/5 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Briefcase className="h-3.5 w-3.5 text-success" />
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-success">
                  Comercial
                </h4>
                <div className="h-px flex-1 bg-success/20" />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
                {COMMERCIAL_FILTER_FIELDS.map((field) => renderField(field, "comercial"))}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

interface DreExportColumn {
  key: string;
  label: string;
  sublabel?: string;
  subCols: Array<"value" | "delta" | "budget">;
  agg: PeriodAgg;
  previousAgg?: PeriodAgg;
  budgetAgg?: BudgetAgg;
}

interface BudgetAgg {
  volume: number;
  rol: number;
  cm: number;
  cpv: number;
}

function aggregateBudgetForExport(rs: BudgetRow[]): BudgetAgg {
  const a: BudgetAgg = { volume: 0, rol: 0, cm: 0, cpv: 0 };
  for (const r of rs) {
    a.volume += r.volumeKg ?? 0;
    a.rol += r.receita ?? 0;
    a.cm += r.cm ?? 0;
    a.cpv += r.cpv ?? 0;
  }
  return a;
}

function getBudgetLineValue(lineId: string, a: BudgetAgg): number | null {
  const safe = (n: number, d: number) => (d > 0 ? n / d : 0);
  switch (lineId) {
    case "vol": return a.volume;
    case "rol": return a.rol;
    case "rolKg": return safe(a.rol, a.volume);
    case "cm": return a.cm;
    case "cmPct": return safe(a.cm, a.rol);
    case "cmKg": return safe(a.cm, a.volume);
    default: return null;
  }
}

function numberFormatFor(kind: RowKind, sub: "value" | "delta" | "budget") {
  if (sub === "delta") return "0.0%;[Red]-0.0%";
  if (kind === "pct") return "0.0%;[Red]-0.0%";
  if (kind === "perKg") return '"R$" #,##0.00;[Red]-"R$" #,##0.00';
  if (kind === "kg") return "#,##0";
  return '"R$" #,##0;[Red]-"R$" #,##0';
}

function buildDreExportColumns(args: {
  rows: import("@/lib/types").PricingRow[];
  months: ReturnType<typeof useMonthsInfo>;
  mode: DrePeriodMode;
  selectedPeriods: string[] | null;
  budgetRows: BudgetRow[];
  showDelta: boolean;
  showBudget: boolean;
}): DreExportColumn[] {
  const sortedMonths = [...args.months].sort((a, b) =>
    a.ano !== b.ano ? a.ano - b.ano : a.mes - b.mes,
  );
  const visibleMonths = args.selectedPeriods === null
    ? sortedMonths
    : sortedMonths.filter((m) => args.selectedPeriods?.includes(m.periodo));

  if (visibleMonths.length === 0) return [];

  const budgetByPeriod = new Map<string, BudgetAgg>();
  for (const row of args.budgetRows) {
    const current = budgetByPeriod.get(row.periodo) ?? { volume: 0, rol: 0, cm: 0, cpv: 0 };
    current.volume += row.volumeKg ?? 0;
    current.rol += row.receita ?? 0;
    current.cm += row.cm ?? 0;
    current.cpv += row.cpv ?? 0;
    budgetByPeriod.set(row.periodo, current);
  }

  if (args.mode === "fy") {
    const periods = new Set(visibleMonths.map((m) => m.periodo));
    const rs = args.rows.filter((r) => periods.has(r.periodo));
    const budgetRs = args.budgetRows.filter((r) => periods.has(r.periodo));
    const first = visibleMonths[0];
    const last = visibleMonths[visibleMonths.length - 1];
    const fySpan = Array.from(new Set(visibleMonths.map((m) => m.fy)));
    const sublabel = visibleMonths.length === 1
      ? `${first.label} - ${first.fy}`
      : `${first.label} -> ${last.label} - ${visibleMonths.length} meses${
          fySpan.length > 1 ? ` - ${fySpan.join(" + ")}` : ` - ${fySpan[0]}`
        }`;
    const budgetAgg = args.showBudget && budgetRs.length ? aggregateBudgetForExport(budgetRs) : undefined;
    return [{
      key: "acumulado",
      label: "Acumulado",
      sublabel,
      subCols: budgetAgg ? ["value", "budget"] : ["value"],
      agg: aggregate(rs),
      budgetAgg,
    }];
  }

  let previousAgg: PeriodAgg | undefined;
  return visibleMonths.map((m) => {
    const agg = aggregate(args.rows.filter((r) => r.periodo === m.periodo));
    const budgetAgg = args.showBudget ? budgetByPeriod.get(m.periodo) : undefined;
    const col: DreExportColumn = {
      key: m.periodo,
      label: m.label,
      sublabel: m.fy,
      subCols: [
        "value",
        ...(args.showDelta && previousAgg ? ["delta" as const] : []),
        ...(budgetAgg ? ["budget" as const] : []),
      ],
      agg,
      previousAgg,
      budgetAgg,
    };
    previousAgg = agg;
    return col;
  });
}

function buildDreWorksheet(args: {
  rows: import("@/lib/types").PricingRow[];
  months: ReturnType<typeof useMonthsInfo>;
  mode: DrePeriodMode;
  selectedPeriods: string[] | null;
  budgetRows: BudgetRow[];
  showDelta: boolean;
  showBudget: boolean;
}): XLSX.WorkSheet {
  const columns = buildDreExportColumns(args);
  if (columns.length === 0) throw new Error("Nenhum periodo disponivel para exportar.");

  const header1: (string | number | null)[] = ["Valores"];
  const header2: (string | number | null)[] = [null];
  const merges: XLSX.Range[] = [{ s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }];
  let colIndex = 1;

  for (const col of columns) {
    header1.push(col.sublabel ? `${col.label} - ${col.sublabel}` : col.label);
    for (let i = 1; i < col.subCols.length; i++) header1.push(null);
    if (col.subCols.length > 1) {
      merges.push({ s: { r: 0, c: colIndex }, e: { r: 0, c: colIndex + col.subCols.length - 1 } });
    }
    for (const sub of col.subCols) {
      header2.push(sub === "value" ? "Real" : sub === "delta" ? "Delta" : "Budget");
    }
    colIndex += col.subCols.length;
  }

  const sheetRows: (string | number | null)[][] = [header1, header2];
  const cellFormats = new Map<string, string>();
  const boldRows = new Set<number>([0, 1]);
  const negativeCells = new Set<string>();

  LINES.forEach((line) => {
    const out: (string | number | null)[] = [line.label];
    for (const col of columns) {
      const real = line.get(col.agg);
      for (const sub of col.subCols) {
        let value: number | null = null;
        if (sub === "value") value = real;
        if (sub === "delta") {
          const prev = col.previousAgg ? line.get(col.previousAgg) : null;
          value =
            typeof real === "number" && isFinite(real) &&
            typeof prev === "number" && isFinite(prev) && prev !== 0
              ? (real - prev) / Math.abs(prev)
              : null;
        }
        if (sub === "budget") value = col.budgetAgg ? getBudgetLineValue(line.id, col.budgetAgg) : null;

        const address = XLSX.utils.encode_cell({ r: sheetRows.length, c: out.length });
        cellFormats.set(address, numberFormatFor(line.kind, sub));
        if (typeof value === "number" && value < 0) negativeCells.add(address);
        out.push(value ?? null);
      }
    }
    if (line.bold) boldRows.add(sheetRows.length);
    sheetRows.push(out);
  });

  const pctLines = LINES.filter((line) => line.kind === "pct");
  const footerParts = pctLines.map((line) => {
    const values = columns
      .map((col) => line.get(col.agg))
      .filter((v): v is number => typeof v === "number" && isFinite(v));
    const avg = values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
    return { label: line.label.replace(/\s*\(%\/ROL\)\s*$/i, ""), avg };
  });
  const footer: (string | number | null)[] = [
    footerParts
      .filter((part) => part.avg != null)
      .map((part) => `${part.label}: ${(part.avg! * 100).toLocaleString("pt-BR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })}%`)
      .join(" | ") || "Media do periodo",
  ];
  while (footer.length < sheetRows[0].length) footer.push(null);
  const footerRow = sheetRows.length;
  sheetRows.push(footer);

  const ws = XLSX.utils.aoa_to_sheet(sheetRows);
  ws["!merges"] = merges;
  ws["!freeze"] = { xSplit: 1, ySplit: 2 };
  ws["!cols"] = [
    { wch: 34 },
    ...Array.from({ length: sheetRows[0].length - 1 }, () => ({ wch: 15 })),
  ];

  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (!cell) continue;
      const isHeader = r <= 1;
      const isFooter = r === footerRow;
      const isFirstCol = c === 0;
      const fmt = cellFormats.get(addr);
      if (fmt && cell.t === "n") cell.z = fmt;
      cell.s = {
        font: {
          bold: isHeader || isFooter || boldRows.has(r),
          color: { rgb: isHeader ? "FFFFFF" : negativeCells.has(addr) ? "DC2626" : "111827" },
          sz: isHeader ? 11 : 10,
        },
        fill: {
          fgColor: {
            rgb: isHeader ? "D0102F" : isFooter ? "F1F5F9" : r % 2 === 0 ? "FFFFFF" : "F8FAFC",
          },
        },
        alignment: {
          horizontal: isFirstCol ? "left" : "right",
          vertical: "center",
          wrapText: isFirstCol || isHeader,
        },
        border: {
          top: { style: "thin", color: { rgb: "E5E7EB" } },
          bottom: { style: "thin", color: { rgb: "E5E7EB" } },
          left: { style: "thin", color: { rgb: "E5E7EB" } },
          right: { style: "thin", color: { rgb: "E5E7EB" } },
        },
      };
    }
  }

  return ws;
}

function exportDreXlsx(args: {
  rows: import("@/lib/types").PricingRow[];
  months: ReturnType<typeof useMonthsInfo>;
  mode: DrePeriodMode;
  selectedPeriods: string[] | null;
  budgetRows: BudgetRow[];
  showDelta: boolean;
  showBudget: boolean;
}) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildDreWorksheet(args), "DRE");
  XLSX.writeFile(wb, `dre_${args.mode === "month" ? "mensal" : "acumulado"}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function exportDreBatchXlsx(args: {
  rows: PricingRow[];
  budgetRows: BudgetRow[];
  filters: Filters;
  dimension: FilterKey;
  clusters: BatchOption[];
  includeTotal: boolean;
  months: ReturnType<typeof useMonthsInfo>;
  mode: DrePeriodMode;
  selectedPeriods: string[] | null;
  showDelta: boolean;
  showBudget: boolean;
}) {
  const totalSheets = args.clusters.length + (args.includeTotal ? 1 : 0);
  if (args.clusters.length === 0) throw new Error("Selecione pelo menos um cluster.");
  if (totalSheets > 80) {
    throw new Error("Selecione até 80 abas por vez para manter o arquivo leve.");
  }

  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();
  const dimLabel = BATCH_EXPORT_FIELDS.find((field) => field.key === args.dimension)?.label ?? args.dimension;
  const indexRows: (string | number | null)[][] = [
    ["DRE em lote", null, null, null],
    ["Dimensão", dimLabel, "Modo", args.mode === "month" ? "Mensal" : "Acumulado"],
    ["Gerado em", new Date().toLocaleString("pt-BR"), "Abas", totalSheets],
    [],
    ["Aba", "Cluster", "Linhas", "ROL"],
  ];

  const appendSheet = (label: string, sheetLabel: string, clusterFilters: Filters, option?: BatchOption) => {
    const sheetRows = applyFilters(args.rows, clusterFilters, null);
    const sheetBudgetRows = applyBudgetFilters(args.budgetRows, clusterFilters);
    const ws = buildDreWorksheet({
      rows: sheetRows,
      months: args.months,
      mode: args.mode,
      selectedPeriods: args.selectedPeriods,
      budgetRows: sheetBudgetRows,
      showDelta: args.showDelta,
      showBudget: args.showBudget,
    });
    const sheetName = uniqueSheetName(sheetLabel, usedNames, "DRE");
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    indexRows.push([
      sheetName,
      label,
      option?.rows ?? sheetRows.length,
      option?.rol ?? sheetRows.reduce((sum, row) => sum + (row.rol || 0), 0),
    ]);
  };

  if (args.includeTotal) {
    const baseRows = applyFilters(args.rows, args.filters, null);
    appendSheet("Consolidado com filtros ativos", "Consolidado", args.filters, {
      value: "__total__",
      label: "Consolidado",
      rows: baseRows.length,
      rol: baseRows.reduce((sum, row) => sum + (row.rol || 0), 0),
      volume: baseRows.reduce((sum, row) => sum + (row.volumeKg || 0), 0),
    });
  }

  for (const option of args.clusters) {
    appendSheet(
      option.label,
      option.label,
      { ...args.filters, [args.dimension]: [option.value] },
      option,
    );
  }

  const indexWs = XLSX.utils.aoa_to_sheet(indexRows);
  indexWs["!cols"] = [{ wch: 28 }, { wch: 54 }, { wch: 14 }, { wch: 18 }];
  const range = XLSX.utils.decode_range(indexWs["!ref"] ?? "A1");
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = indexWs[addr];
      if (!cell) continue;
      if (r === 4 && c === 3 && cell.t === "n") cell.z = '"R$" #,##0;[Red]-"R$" #,##0';
      if (r > 4 && c === 3 && cell.t === "n") cell.z = '"R$" #,##0;[Red]-"R$" #,##0';
      cell.s = {
        font: {
          bold: r === 0 || r === 4,
          color: { rgb: r === 0 || r === 4 ? "FFFFFF" : "111827" },
          sz: r === 0 ? 14 : 10,
        },
        fill: {
          fgColor: { rgb: r === 0 || r === 4 ? "D0102F" : r % 2 === 0 ? "FFFFFF" : "F8FAFC" },
        },
        alignment: { horizontal: c >= 2 ? "right" : "left", vertical: "center", wrapText: true },
        border: {
          top: { style: "thin", color: { rgb: "E5E7EB" } },
          bottom: { style: "thin", color: { rgb: "E5E7EB" } },
          left: { style: "thin", color: { rgb: "E5E7EB" } },
          right: { style: "thin", color: { rgb: "E5E7EB" } },
        },
      };
    }
  }
  XLSX.utils.book_append_sheet(wb, indexWs, "Índice");
  wb.SheetNames = ["Índice", ...wb.SheetNames.filter((name) => name !== "Índice")];
  XLSX.writeFile(
    wb,
    `dre_lote_${String(args.dimension)}_${args.mode === "month" ? "mensal" : "acumulado"}_${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}
