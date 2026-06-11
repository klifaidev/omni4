import { usePricing } from "@/store/pricing";
import { uniqueValues, applyFilters } from "@/lib/analytics";
import type { FilterKey, PricingRow } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { X, Package, Briefcase, Sparkles } from "lucide-react";
import { getDeParaBySku } from "@/lib/depara";
import { MultiSelectFilter } from "@/components/pricing/MultiSelectFilter";

// Filtros de SKU — atributos do produto vindos do De Para IA.
const SKU_FIELDS: { key: FilterKey; label: string }[] = [
  { key: "categoria", label: "01. Categoria" },
  { key: "subcategoria", label: "Subcategoria" },
  { key: "marca", label: "02. Marca" },
  { key: "tecnologia", label: "03. Tecnologia" },
  { key: "formato", label: "04. Formato" },
  { key: "mercado", label: "05. Mercado" },
  { key: "faixaPeso", label: "06. Faixa de Peso" },
  { key: "sabor", label: "07. Sabor" },
  { key: "sku", label: "Artigo (SKU)" },
];

// Filtros vinculados ao De Para de Inovação — destacados na paleta de Inovação.
const INOVACAO_FIELDS: { key: FilterKey; label: string }[] = [
  { key: "inovacao", label: "Inovação / Regular" },
  { key: "legado", label: "Legado" },
];

// Filtros Comerciais — vindos do De Para IA V2.
const COMERCIAL_FIELDS: { key: FilterKey; label: string }[] = [
  { key: "canalAjustado", label: "Canal Ajustado" },
  { key: "mercadoAjustado", label: "Mercado Ajustado" },
  { key: "regional", label: "Regional" },
  { key: "uf", label: "UF" },
];

export function FilterGrid() {
  const rows = usePricing((s) => s.rows);
  const filters = usePricing((s) => s.filters);
  const setFilter = usePricing((s) => s.setFilter);
  const clear = usePricing((s) => s.clearFilters);
  const selected = usePricing((s) => s.selectedPeriods);

  // Considera apenas linhas cujo SKU está no De Para — assim os valores
  // exibidos em cada filtro vêm exclusivamente da planilha De Para IA.
  const baseRows = applyFilters(rows, {}, selected).filter((r) =>
    getDeParaBySku(r.sku),
  );

  const hasAny = Object.values(filters).some((v) => v && v.length);
  const inovacaoMode = filters.inovacao?.[0] === "Inovação";

  const renderField = (
    f: { key: FilterKey; label: string },
    variant: "sku" | "comercial" | "inovacao",
  ) => {
    const opts = uniqueValues(baseRows, f.key as keyof PricingRow);
    if (opts.length === 0) return null;
    const current = filters[f.key] ?? [];

    let optionItems: { value: string; label: string }[];
    if (f.key === "sku") {
      const descBySku = new Map<string, string>();
      for (const r of baseRows) {
        if (r.sku && r.skuDesc && !descBySku.has(r.sku)) {
          descBySku.set(r.sku, r.skuDesc);
        }
      }
      optionItems = opts
        .map((o) => {
          const desc = descBySku.get(o);
          return { value: o, label: desc ? `${o} - ${desc}` : o };
        })
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    } else {
      optionItems = opts
        .map((o) => ({ value: o, label: o }))
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    }

    const labelClass =
      variant === "comercial"
        ? "mb-1 block text-[11px] font-medium uppercase tracking-wider text-success"
        : variant === "inovacao"
          ? "mb-1 block text-[11px] font-medium uppercase tracking-wider text-accent"
          : "mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground";

    return (
      <div key={f.key}>
        <label className={labelClass}>{f.label}</label>
        <MultiSelectFilter
          options={optionItems}
          selected={current}
          onChange={(vals) => setFilter(f.key, vals)}
          placeholder="Todos"
          variant={variant}
        />
      </div>
    );
  };

  return (
    <div className="space-y-5" data-shortcut-target="filter-grid">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Filtros</h3>
        {hasAny && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clear}>
            <X className="mr-1 h-3 w-3" /> Limpar
          </Button>
        )}
      </div>

      {/* Bloco SKU */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <Package className="h-3.5 w-3.5 text-muted-foreground" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Produto · SKU
          </h4>
          <div className="h-px flex-1 bg-border/40" />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {SKU_FIELDS.map((f) => renderField(f, "sku"))}
        </div>
      </section>

      {/* Bloco Inovação — só aparece quando o Modo Inovação está ativo */}
      {inovacaoMode && (
        <section className="animate-in fade-in slide-in-from-top-2 rounded-lg border border-accent/30 bg-accent/5 p-3 shadow-[0_0_24px_-12px_hsl(var(--accent)/0.4)] duration-500">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-accent">
              Inovação
            </h4>
            <div className="h-px flex-1 bg-accent/20" />
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {INOVACAO_FIELDS.map((f) => renderField(f, "inovacao"))}
          </div>
        </section>
      )}

      {/* Bloco Comercial */}
      <section className="rounded-lg border border-success/20 bg-success/5 p-3">
        <div className="mb-2 flex items-center gap-2">
          <Briefcase className="h-3.5 w-3.5 text-success" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-success">
            Comercial
          </h4>
          <div className="h-px flex-1 bg-success/20" />
          <span className="text-[10px] font-normal normal-case tracking-normal text-muted-foreground">
            Budget usa apenas <span className="font-medium text-success/80">Canal Ajustado</span>
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {COMERCIAL_FIELDS.map((f) => renderField(f, "comercial"))}
        </div>
      </section>
    </div>
  );
}
