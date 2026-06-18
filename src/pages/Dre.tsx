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
            </div>
          </header>
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
  if (kind === "kg") return '#,##0 "kg"';
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

function exportDreXlsx(args: {
  rows: import("@/lib/types").PricingRow[];
  months: ReturnType<typeof useMonthsInfo>;
  mode: DrePeriodMode;
  selectedPeriods: string[] | null;
  budgetRows: BudgetRow[];
  showDelta: boolean;
  showBudget: boolean;
}) {
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

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "DRE");
  XLSX.writeFile(wb, `dre_${args.mode === "month" ? "mensal" : "acumulado"}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
