// Filtros Produto + Comercial aplicados a UM bloco do slide personalizado.
// Reusa o mesmo MultiSelectFilter dos filtros globais, mas escreve no
// `block.filters` em vez do store global.

import { useMemo } from "react";
import { Package, Briefcase, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MultiSelectFilter } from "@/components/pricing/MultiSelectFilter";
import { usePricing } from "@/store/pricing";
import { useBudget } from "@/store/budget";
import { useForecast } from "@/store/forecast";
import { useRolling } from "@/store/rolling";
import { uniqueValues, applyFilters } from "@/lib/analytics";
import { budgetRowsAsPricingFiltered } from "@/lib/budgetAdapter";
import { forecastRowsAsPricingLatest } from "@/lib/forecastAdapter";
import { rollingRowsAsPricing } from "@/lib/rollingAdapter";
import { getDeParaBySku } from "@/lib/depara";
import type { Filters, FilterKey, PricingRow } from "@/lib/types";
import type { BlockDataSource } from "@/lib/customSlide";

const SKU_FIELDS: { key: FilterKey; label: string }[] = [
  { key: "categoria", label: "Categoria" },
  { key: "marca", label: "Marca" },
  { key: "tecnologia", label: "Tecnologia" },
  { key: "formato", label: "Formato" },
  { key: "mercado", label: "Mercado" },
  { key: "faixaPeso", label: "Faixa de Peso" },
  { key: "sabor", label: "Sabor" },
  { key: "sku", label: "SKU" },
];

const COMERCIAL_FIELDS: { key: FilterKey; label: string }[] = [
  { key: "canalAjustado", label: "Canal Ajustado" },
  { key: "mercadoAjustado", label: "Mercado Ajustado" },
  { key: "regional", label: "Regional" },
  { key: "uf", label: "UF" },
];

export function BlockFilters({
  filters, onChange, dataSource = "ke30",
}: { filters: Filters; onChange: (next: Filters) => void; dataSource?: BlockDataSource }) {
  const pricing = usePricing((s) => s.rows);
  const budget = useBudget((s) => s.rows);
  const forecast = useForecast((s) => s.rows);
  const rolling = useRolling((s) => s.rows);
  const baseRows = useMemo(() => {
    if (dataSource === "budget") return budgetRowsAsPricingFiltered(budget, "budget");
    if (dataSource === "budget_real") return budgetRowsAsPricingFiltered(budget, "real");
    if (dataSource === "forecast") return forecastRowsAsPricingLatest(forecast);
    if (dataSource === "rolling") return rollingRowsAsPricing(rolling);
    return applyFilters(pricing, {}, null).filter((r) => getDeParaBySku(r.sku));
  }, [dataSource, pricing, budget, forecast, rolling]);
  // Em Budget só mostramos campos suportados (sem UF/Regional/Mercado Ajustado/Cliente).
  const isLimitedSource = dataSource === "budget" || dataSource === "budget_real" || dataSource === "forecast" || dataSource === "rolling";
  const setKey = (k: FilterKey, vals: string[]) => {
    const next: Filters = { ...filters };
    if (vals.length === 0) delete next[k];
    else next[k] = vals;
    onChange(next);
  };
  const hasAny = Object.values(filters).some((v) => v && v.length);

  const renderField = (
    f: { key: FilterKey; label: string },
    variant: "sku" | "comercial",
  ) => {
    const opts = uniqueValues(baseRows, f.key as keyof PricingRow);
    if (opts.length === 0) return null;
    let optionItems: { value: string; label: string }[];
    if (f.key === "sku") {
      const desc = new Map<string, string>();
      for (const r of baseRows) if (r.sku && r.skuDesc && !desc.has(r.sku)) desc.set(r.sku, r.skuDesc);
      optionItems = opts
        .map((o) => ({ value: o, label: desc.get(o) ? `${o} - ${desc.get(o)}` : o }))
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    } else {
      optionItems = opts
        .map((o) => ({ value: o, label: o }))
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    }
    const labelClass = variant === "comercial"
      ? "mb-1 block text-[10px] font-medium uppercase tracking-wider text-success"
      : "mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground";
    return (
      <div key={f.key}>
        <label className={labelClass}>{f.label}</label>
        <MultiSelectFilter
          options={optionItems}
          selected={filters[f.key] ?? []}
          onChange={(vals) => setKey(f.key, vals)}
          placeholder="Todos"
          variant={variant}
        />
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Filtros do bloco
        </span>
        {hasAny && (
          <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[10px]"
            onClick={() => onChange({})}>
            <X className="h-3 w-3" /> Limpar
          </Button>
        )}
      </div>

      <section>
        <div className="mb-1.5 flex items-center gap-1.5">
          <Package className="h-3 w-3 text-muted-foreground" />
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Produto
          </h4>
          <div className="h-px flex-1 bg-border/40" />
        </div>
        <div className="grid grid-cols-1 gap-2">
          {SKU_FIELDS.map((f) => renderField(f, "sku"))}
        </div>
      </section>

      <section className="rounded-md border border-success/20 bg-success/5 p-2">
        <div className="mb-1.5 flex items-center gap-1.5">
          <Briefcase className="h-3 w-3 text-success" />
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-success">
            Comercial
          </h4>
          <div className="h-px flex-1 bg-success/20" />
        </div>
        <div className="grid grid-cols-1 gap-2">
          {(isLimitedSource
            ? COMERCIAL_FIELDS.filter((f) => f.key === "canalAjustado")
            : COMERCIAL_FIELDS
          ).map((f) => renderField(f, "comercial"))}
        </div>
        {isLimitedSource && (
          <p className="mt-1 text-[9px] text-muted-foreground">
            Esta fonte expoe filtros de produto e Canal Ajustado.
          </p>
        )}
      </section>
    </div>
  );
}
