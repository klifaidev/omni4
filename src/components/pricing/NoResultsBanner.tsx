import { FilterX } from "lucide-react";
import { usePricing } from "@/store/pricing";
import { useHasFilteredData } from "@/store/selectors";
import { useHasActiveFilters } from "./ActiveFiltersBar";

export function NoResultsBanner() {
  const hasActive = useHasActiveFilters();
  const hasData = useHasFilteredData();
  const rows = usePricing((s) => s.rows);
  const clearFilters = usePricing((s) => s.clearFilters);
  const setAllPeriods = usePricing((s) => s.setAllPeriods);

  // Só faz sentido quando há base carregada, filtros ativos e 0 linhas filtradas
  const show = rows.length > 0 && hasActive && !hasData;

  return (
    <div
      className="overflow-hidden border-b border-destructive/30 bg-destructive/10 backdrop-blur-xl transition-[height,opacity] duration-150 ease-out"
      style={{ height: show ? 40 : 0, opacity: show ? 1 : 0 }}
      aria-hidden={!show}
    >
      <div className="flex h-10 items-center gap-2 whitespace-nowrap px-8 text-[12px] text-destructive">
        <FilterX className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium">
          Nenhum dado encontrado com os filtros atuais. Tente remover alguns filtros.
        </span>
        <button
          onClick={() => {
            clearFilters();
            setAllPeriods();
          }}
          className="ml-auto shrink-0 rounded-full border border-destructive/40 bg-background/30 px-3 py-1 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/20"
        >
          Limpar todos os filtros
        </button>
      </div>
    </div>
  );
}
