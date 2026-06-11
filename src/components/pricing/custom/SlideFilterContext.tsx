// SlideFilterContext — slide-scoped cross-filter state (Part B.6).
// Click on a chart's data point emits a filter to other blocks on the same slide.

import { createContext, useCallback, useContext, useMemo, useReducer, useRef, useEffect } from "react";

export interface ActiveFilter {
  sourceBlockId: string;
  dimension: string;          // e.g. "marca", "canal", "categoria", "period"
  values: string[];
}

interface State { filters: ActiveFilter[] }

type Action =
  | { type: "set"; filter: ActiveFilter }
  | { type: "toggle"; filter: ActiveFilter }
  | { type: "clear"; sourceBlockId: string }
  | { type: "clearAll" };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "set": {
      const others = s.filters.filter((f) => f.sourceBlockId !== a.filter.sourceBlockId);
      // When period filter changes, clear all dimensional (non-period) filters so
      // charts don't zero out due to stale dimensional selections.
      if (a.filter.dimension === "period" || a.filter.dimension === "periodo") {
        const periodOnly = others.filter((f) => f.dimension === "period" || f.dimension === "periodo");
        return { filters: [...periodOnly, a.filter] };
      }
      return { filters: [...others, a.filter] };
    }
    case "toggle": {
      const cur = s.filters.find((f) => f.sourceBlockId === a.filter.sourceBlockId
        && f.dimension === a.filter.dimension);
      if (!cur) return reducer(s, { type: "set", filter: a.filter });
      // toggle values
      const set = new Set(cur.values);
      for (const v of a.filter.values) {
        if (set.has(v)) set.delete(v); else set.add(v);
      }
      const others = s.filters.filter((f) => f.sourceBlockId !== a.filter.sourceBlockId);
      if (set.size === 0) return { filters: others };
      return { filters: [...others, { ...cur, values: Array.from(set) }] };
    }
    case "clear":
      return { filters: s.filters.filter((f) => f.sourceBlockId !== a.sourceBlockId) };
    case "clearAll":
      return { filters: [] };
  }
}

interface ContextValue {
  filters: ActiveFilter[];
  setFilter: (f: ActiveFilter) => void;
  toggleFilter: (f: ActiveFilter) => void;
  clearFilter: (sourceBlockId: string) => void;
  clearAll: () => void;
}

const Ctx = createContext<ContextValue>({
  filters: [],
  setFilter: () => {},
  toggleFilter: () => {},
  clearFilter: () => {},
  clearAll: () => {},
});

export function SlideFilterProvider({
  children, slideKey,
}: { children: React.ReactNode; slideKey?: string }) {
  const [state, dispatch] = useReducer(reducer, { filters: [] });
  const lastKey = useRef(slideKey);
  useEffect(() => {
    if (lastKey.current !== slideKey) {
      lastKey.current = slideKey;
      dispatch({ type: "clearAll" });
    }
  }, [slideKey]);

  const setFilter = useCallback((f: ActiveFilter) => dispatch({ type: "set", filter: f }), []);
  const toggleFilter = useCallback((f: ActiveFilter) => dispatch({ type: "toggle", filter: f }), []);
  const clearFilter = useCallback((id: string) => dispatch({ type: "clear", sourceBlockId: id }), []);
  const clearAll = useCallback(() => dispatch({ type: "clearAll" }), []);

  const value = useMemo<ContextValue>(() => ({
    filters: state.filters, setFilter, toggleFilter, clearFilter, clearAll,
  }), [state.filters, setFilter, toggleFilter, clearFilter, clearAll]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSlideFilters(): ContextValue {
  return useContext(Ctx);
}

const DIM_LABELS: Record<string, string> = {
  marca: "Marca", canal: "Canal", canalAjustado: "Canal",
  categoria: "Categoria", subcategoria: "Subcategoria",
  cliente: "Cliente", sku: "SKU", skuDesc: "SKU",
  uf: "UF", regiao: "Região", periodo: "Período", period: "Período",
};
export function dimensionLabel(d: string): string {
  return DIM_LABELS[d] ?? d.charAt(0).toUpperCase() + d.slice(1);
}
