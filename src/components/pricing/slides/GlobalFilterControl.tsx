// Filtro Global da apresentação — visível na esteira (Part D). Botão com
// badge do nº de filtros ativos, abre um painel com os mesmos campos de
// BlockFilters.tsx, mas escrevendo em useSlidesFlow().globalFilters em vez
// do filtro individual de um bloco. Blocos participam ligando
// `useGlobalFilter` no seu próprio inspector ("Filtros" > "Usar filtro global").
import { useMemo, useState } from "react";
import { Globe2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { MultiSelectFilter } from "@/components/pricing/MultiSelectFilter";
import { usePricing } from "@/store/pricing";
import { useSlidesFlow } from "@/store/slidesFlow";
import { uniqueValues, applyFilters } from "@/lib/analytics";
import { getDeParaBySku } from "@/lib/depara";
import type { Filters, FilterKey, PricingRow } from "@/lib/types";
import { strings } from "@/lib/i18n";
import { toast } from "sonner";

const t = strings.slides.editor.inspectors.blocks.globalFilter;

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

export function GlobalFilterControl() {
  const [open, setOpen] = useState(false);
  const pricing = usePricing((s) => s.rows);
  const globalFilters = useSlidesFlow((s) => s.globalFilters);
  const setGlobalFilters = useSlidesFlow((s) => s.setGlobalFilters);
  const clearGlobalFilters = useSlidesFlow((s) => s.clearGlobalFilters);
  const applyGlobalFilterToAllBlocks = useSlidesFlow((s) => s.applyGlobalFilterToAllBlocks);

  const activeCount = Object.values(globalFilters).reduce((acc, v) => acc + (v?.length ?? 0), 0);

  const baseRows = useMemo(
    () => applyFilters(pricing, {}, null).filter((r) => getDeParaBySku(r.sku)),
    [pricing],
  );
  const filterOptionsByKey = useMemo(() => {
    const fields = [...SKU_FIELDS, ...COMERCIAL_FIELDS];
    return Object.fromEntries(
      fields.map((field) => [field.key, uniqueValues(baseRows, field.key as keyof PricingRow)]),
    ) as Partial<Record<FilterKey, string[]>>;
  }, [baseRows]);
  const skuDescriptions = useMemo(() => {
    const desc = new Map<string, string>();
    for (const row of baseRows) {
      if (row.sku && row.skuDesc && !desc.has(row.sku)) desc.set(row.sku, row.skuDesc);
    }
    return desc;
  }, [baseRows]);

  const setKey = (k: FilterKey, vals: string[]) => {
    const next: Filters = { ...globalFilters };
    if (vals.length === 0) delete next[k];
    else next[k] = vals;
    setGlobalFilters(next);
  };

  const renderField = (f: { key: FilterKey; label: string }) => {
    const opts = filterOptionsByKey[f.key] ?? [];
    if (opts.length === 0) return null;
    const optionItems = (f.key === "sku"
      ? opts.map((o) => ({ value: o, label: skuDescriptions.get(o) ? `${o} - ${skuDescriptions.get(o)}` : o }))
      : opts.map((o) => ({ value: o, label: o }))
    ).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    return (
      <div key={f.key}>
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {f.label}
        </label>
        <MultiSelectFilter
          options={optionItems}
          selected={globalFilters[f.key] ?? []}
          onChange={(vals) => setKey(f.key, vals)}
          placeholder="Todos"
          variant={f.key === "sku" ? "sku" : undefined}
        />
      </div>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={activeCount > 0 ? "default" : "outline"}
          size="sm"
          className="h-8 gap-1.5 px-2.5 text-xs"
          aria-label={t.openPanel}
          title={t.openPanel}
        >
          <Globe2 className="h-3.5 w-3.5" />
          {/* Só ícone abaixo de 2xl: a barra da esteira não cabia em 1366px. */}
          <span className="hidden 2xl:inline">{t.openPanel}</span>
          {activeCount > 0 && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-semibold">
              {activeCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] max-h-[70vh] overflow-y-auto p-3">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-foreground">{t.panelTitle}</div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{t.panelDescription}</p>
          </div>
          {activeCount > 0 && (
            <Button
              size="sm" variant="ghost" className="h-6 shrink-0 gap-1 px-2 text-[10px]"
              onClick={() => clearGlobalFilters()}
            >
              <X className="h-3 w-3" /> {t.clearAll}
            </Button>
          )}
        </div>

        <div className="space-y-3">
          <section>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Produto
            </div>
            <div className="grid grid-cols-1 gap-2">
              {SKU_FIELDS.map(renderField)}
            </div>
          </section>
          <section className="rounded-md border border-success/20 bg-success/5 p-2">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-success">
              Comercial
            </div>
            <div className="grid grid-cols-1 gap-2">
              {COMERCIAL_FIELDS.map(renderField)}
            </div>
          </section>
        </div>

        <Button
          size="sm"
          className="mt-3 w-full gap-1.5 text-xs"
          disabled={activeCount === 0}
          onClick={() => {
            const n = applyGlobalFilterToAllBlocks();
            toast.success(t.applyToAllDone(n));
          }}
        >
          <Globe2 className="h-3.5 w-3.5" />
          {t.applyToAll}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
