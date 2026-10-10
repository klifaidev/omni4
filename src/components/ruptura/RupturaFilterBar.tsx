import { useMemo, useState } from "react";
import { ChevronDown, FilterX, X } from "lucide-react";
import { MultiSelectFilter } from "@/components/pricing/MultiSelectFilter";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { filterOptions, monthKeyLabel } from "@/lib/ruptura/metrics";
import type { RupturaDim, RupturaModel } from "@/lib/ruptura/types";
import { cn } from "@/lib/utils";
import { useRuptura } from "@/store/ruptura";

export const DIM_LABEL: Record<RupturaDim, string> = {
  marca: "Marca",
  categoria: "Categoria",
  linha: "Linha de produto",
  sku: "SKU",
  rede: "Rede",
  bandeira: "Bandeira",
  pdv: "PDV",
  canal: "Canal",
  regional: "Regional",
  estado: "Estado",
  cidade: "Cidade",
};

const PRIMARY: RupturaDim[] = ["marca", "categoria", "sku", "rede", "canal", "estado"];
const SECONDARY: RupturaDim[] = ["linha", "bandeira", "pdv", "regional", "cidade"];

function DimFilter({ model, dim }: { model: RupturaModel; dim: RupturaDim }) {
  const filters = useRuptura((s) => s.filters);
  const period = useRuptura((s) => s.period);
  const setFilter = useRuptura((s) => s.setFilter);
  const options = useMemo(
    () => filterOptions(model, filters, period, dim).map((v) => ({ value: v, label: v })),
    [model, filters, period, dim],
  );
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{DIM_LABEL[dim]}</span>
      <MultiSelectFilter options={options} selected={filters[dim] ?? []} onChange={(next) => setFilter(dim, next)} placeholder="Todos" />
    </label>
  );
}

export function RupturaFilterBar({ model }: { model: RupturaModel }) {
  const filters = useRuptura((s) => s.filters);
  const period = useRuptura((s) => s.period);
  const setPeriod = useRuptura((s) => s.setPeriod);
  const setFilter = useRuptura((s) => s.setFilter);
  const clearFilters = useRuptura((s) => s.clearFilters);
  const [more, setMore] = useState(() => SECONDARY.some((d) => (filters[d]?.length ?? 0) > 0));

  const from = period?.from ?? 0;
  const to = period?.to ?? model.months.length - 1;
  const fullRange = from === 0 && to === model.months.length - 1;
  const active = (Object.entries(filters) as [RupturaDim, string[]][]).filter(([, v]) => v.length > 0);
  const hasAny = active.length > 0 || !fullRange;

  return (
    <section aria-label="Filtros da análise de ruptura" className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">De</span>
          <Select value={String(from)} onValueChange={(v) => setPeriod({ from: Number(v), to: Math.max(Number(v), to) })}>
            <SelectTrigger className="h-9 border-border/50 bg-secondary/40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {model.months.map((m, i) => <SelectItem key={m} value={String(i)} className="text-xs">{monthKeyLabel(m)}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Até</span>
          <Select value={String(to)} onValueChange={(v) => setPeriod({ from: Math.min(from, Number(v)), to: Number(v) })}>
            <SelectTrigger className="h-9 border-border/50 bg-secondary/40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {model.months.map((m, i) => <SelectItem key={m} value={String(i)} className="text-xs">{monthKeyLabel(m)}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        {PRIMARY.map((dim) => <DimFilter key={dim} model={model} dim={dim} />)}
        {more && SECONDARY.map((dim) => <DimFilter key={dim} model={model} dim={dim} />)}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-muted-foreground" onClick={() => setMore((v) => !v)} aria-expanded={more}>
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", more && "rotate-180")} />
          {more ? "Menos filtros" : "Mais filtros (linha, bandeira, PDV, regional, cidade)"}
        </Button>
        {!fullRange && (
          <FilterChip
            label={`Período: ${monthKeyLabel(model.months[from])}${from !== to ? `–${monthKeyLabel(model.months[to])}` : ""}`}
            onRemove={() => setPeriod({ from: 0, to: model.months.length - 1 })}
          />
        )}
        {active.flatMap(([dim, values]) =>
          values.map((value) => (
            <FilterChip
              key={`${dim}:${value}`}
              label={`${DIM_LABEL[dim]}: ${value}`}
              onRemove={() => setFilter(dim, values.filter((v) => v !== value))}
            />
          )),
        )}
        {hasAny && (
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={clearFilters}>
            <FilterX className="h-3.5 w-3.5" /> Limpar filtros
          </Button>
        )}
      </div>
    </section>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex max-w-[320px] items-center gap-1 rounded-full border border-primary/30 bg-primary/10 py-0.5 pl-2.5 pr-1 text-[11px] text-primary">
      <span className="truncate">{label}</span>
      <button type="button" onClick={onRemove} className="rounded-full p-0.5 hover:bg-primary/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" aria-label={`Remover filtro ${label}`}>
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
