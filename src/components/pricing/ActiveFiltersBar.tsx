import { X, SlidersHorizontal } from "lucide-react";
import { usePricing } from "@/store/pricing";
import { useMonthsInfo } from "@/store/selectors";
import type { FilterKey } from "@/lib/types";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const FILTER_LABEL: Record<FilterKey, string> = {
  marca: "Marca",
  canal: "Canal",
  canalAjustado: "Canal Ajustado",
  categoria: "Categoria",
  subcategoria: "Subcategoria",
  formato: "Formato",
  sku: "SKU",
  regiao: "Região",
  uf: "UF",
  regional: "Regional",
  mercado: "Mercado",
  mercadoAjustado: "Mercado Ajustado",
  sabor: "Sabor",
  tecnologia: "Tecnologia",
  faixaPeso: "Faixa de Peso",
  inovacao: "Inovação",
  legado: "Legado",
};

export function ActiveFiltersBar() {
  const filters = usePricing((s) => s.filters);
  const selected = usePricing((s) => s.selectedPeriods);
  const setFilter = usePricing((s) => s.setFilter);
  const clearFilters = usePricing((s) => s.clearFilters);
  const setAllPeriods = usePricing((s) => s.setAllPeriods);
  const months = useMonthsInfo();
  const navigate = useNavigate();

  const activeFilters = useMemo(
    () =>
      (Object.entries(filters) as [FilterKey, string[] | undefined][])
        .filter(([, v]) => v && v.length > 0)
        .map(([k, v]) => ({ key: k, values: v as string[] })),
    [filters],
  );

  const periodChip = useMemo(() => {
    if (!selected || selected.length === 0) return null;
    if (months.length > 0 && selected.length === months.length) return null;
    const sortedSelected = [...selected].sort();
    const labelOf = (p: string) => months.find((m) => m.periodo === p)?.label ?? p;
    if (sortedSelected.length === 1) return labelOf(sortedSelected[0]);
    return `${labelOf(sortedSelected[0])} – ${labelOf(sortedSelected[sortedSelected.length - 1])}`;
  }, [selected, months]);

  const hasAny = activeFilters.length > 0 || periodChip !== null;

  if (!hasAny) return null;

  return (
    <div
      className="overflow-hidden border-b border-border/40 bg-background/40 backdrop-blur-xl animate-fade-in"
      aria-hidden={!hasAny}
    >
      <div className="flex h-9 items-center gap-1.5 overflow-x-auto whitespace-nowrap px-4 md:px-8">
        {/* Atalho para página de filtros */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => navigate("/filtros")}
              className="mr-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-primary/10 hover:text-primary"
              aria-label="Abrir página de filtros"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Gerenciar filtros</TooltipContent>
        </Tooltip>

        <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
          Filtros ativos
        </span>

        {activeFilters.map(({ key, values }) => (
          <Chip
            key={key}
            label={`${FILTER_LABEL[key]}: ${values.length === 1 ? values[0] : `${values.length} valores`}`}
            onRemove={() => setFilter(key, [])}
          />
        ))}

        {periodChip && (
          <Chip label={periodChip} onRemove={() => setAllPeriods()} tone="period" />
        )}

        {hasAny && (
          <button
            onClick={() => {
              clearFilters();
              setAllPeriods();
            }}
            className="ml-auto shrink-0 rounded-full border border-border/60 bg-card/40 px-3 py-1 text-[11px] text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
          >
            Limpar todos
          </button>
        )}
      </div>
    </div>
  );
}

function Chip({
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
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${toneCls}`}
        >
          {label}
          <button
            onClick={onRemove}
            className="-mr-0.5 ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full opacity-70 transition-opacity hover:bg-foreground/10 hover:opacity-100"
            aria-label="Remover filtro"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

/** Helper exposto para a Sidebar: indica se há qualquer filtro/período custom ativo. */
export function useHasActiveFilters(): boolean {
  const filters = usePricing((s) => s.filters);
  const selected = usePricing((s) => s.selectedPeriods);
  const monthsLen = useMonthsInfo().length;
  return useMemo(() => {
    const anyFilter = Object.values(filters).some((v) => v && v.length > 0);
    const anyPeriod = selected !== null && selected.length > 0 && selected.length !== monthsLen;
    return anyFilter || anyPeriod;
  }, [filters, selected, monthsLen]);
}
