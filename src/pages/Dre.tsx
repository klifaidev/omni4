import { DreTable, type DrePeriodMode } from "@/components/pricing/DreTable";
import { EmptyState } from "@/components/pricing/EmptyState";
import { GlassCard } from "@/components/pricing/GlassCard";
import { Topbar } from "@/components/pricing/Topbar";
import { applyFilters } from "@/lib/analytics";
import { usePricing } from "@/store/pricing";
import { useBudget } from "@/store/budget";
import { useMonthsInfo } from "@/store/selectors";
import { useMemo, useState } from "react";
import { Calendar, Download, Sigma } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { exportTableCsv } from "@/lib/exportCsv";
import { cn } from "@/lib/utils";
import type { BudgetRow } from "@/lib/budget";
import type { Filters } from "@/lib/types";
import { usePageTitle } from "@/hooks/use-page-title";

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
  const budgetRowsAll = useBudget((s) => s.rows);
  const months = useMonthsInfo();
  const [mode, setMode] = useState<DrePeriodMode>("month");

  const filtered = useMemo(() => applyFilters(rows, filters, null), [rows, filters]);
  const filteredBudget = useMemo(
    () => applyBudgetFilters(budgetRowsAll, filters),
    [budgetRowsAll, filters],
  );

  if (rows.length === 0) {
    return (
      <>
        <Topbar title="DRE" subtitle="Consolidado por período com filtros ativos" />
        <div className="px-8 py-6"><EmptyState
          title="DRE gerencial"
          message="Carregue dados mensais para montar o DRE com ROL, CPV, margem bruta e contribuição."
          actionLabel="Ir para Upload"
          actionTo="/upload"
        /></div>
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
                  ? "Visão consolidada por mês — valores aplicam os filtros ativos."
                  : "Acumulado: somatória dos períodos filtrados em uma única coluna."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <PeriodModeToggle mode={mode} onChange={setMode} />
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => {
                  const data = buildDreExportRows(filtered, months, mode);
                  const cols = buildDreExportColumns(months, mode);
                  exportTableCsv(data, cols, `dre_${mode === "month" ? "mensal" : "acumulado"}`);
                  toast.success("Arquivo exportado.");
                }}
              >
                <Download className="h-4 w-4" />
                Exportar CSV
              </Button>
            </div>
          </header>
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

// ---------- Helpers de exportação CSV ----------

interface DreExportRow extends Record<string, unknown> {
  metrica: string;
}

function buildDreExportColumns(
  months: ReturnType<typeof useMonthsInfo>,
  mode: DrePeriodMode,
) {
  if (mode === "fy") {
    return [
      { key: "metrica", label: "Métrica" },
      { key: "total", label: "Acumulado" },
    ];
  }
  return [
    { key: "metrica", label: "Métrica" },
    ...months.map((m) => ({ key: `p_${m.periodo}`, label: m.label })),
  ];
}

function buildDreExportRows(
  rows: import("@/lib/types").PricingRow[],
  months: ReturnType<typeof useMonthsInfo>,
  mode: DrePeriodMode,
): DreExportRow[] {
  const periods = mode === "fy" ? ["__total__"] : months.map((m) => m.periodo);

  const agg = (filter: (p: string) => boolean) => {
    let rol = 0, cogs = 0, cv = 0, cf = 0, frete = 0, com = 0, mb = 0, cm = 0, vol = 0;
    for (const r of rows) {
      if (!filter(r.periodo)) continue;
      rol += r.rol;
      cogs += r.cogs;
      cv += r.custoVariavel;
      cf += r.custoFixo;
      frete += r.frete ?? 0;
      com += r.comissao ?? 0;
      mb += r.margemBruta;
      cm += r.contribMarginal;
      vol += r.volumeKg;
    }
    return { rol, cogs, cv, cf, frete, com, mb, cm, vol };
  };

  const cellKey = (p: string) => (mode === "fy" ? "total" : `p_${p}`);
  const buckets = new Map<string, ReturnType<typeof agg>>();
  for (const p of periods) {
    buckets.set(p, agg(mode === "fy" ? () => true : (x) => x === p));
  }

  const mkRow = (label: string, pick: (a: ReturnType<typeof agg>) => number): DreExportRow => {
    const out: DreExportRow = { metrica: label };
    for (const p of periods) out[cellKey(p)] = pick(buckets.get(p)!);
    return out;
  };

  return [
    mkRow("Volume (kg)", (a) => a.vol),
    mkRow("ROL", (a) => a.rol),
    mkRow("CPV", (a) => a.cogs),
    mkRow("Margem Bruta", (a) => a.mb),
    mkRow("Margem Bruta %", (a) => (a.rol > 0 ? a.mb / a.rol : 0)),
    mkRow("Custo Variável", (a) => a.cv),
    mkRow("Frete", (a) => a.frete),
    mkRow("Comissão", (a) => a.com),
    mkRow("Contribuição Marginal", (a) => a.cm),
    mkRow("CM %", (a) => (a.rol > 0 ? a.cm / a.rol : 0)),
    mkRow("Custo Fixo", (a) => a.cf),
  ];
}
