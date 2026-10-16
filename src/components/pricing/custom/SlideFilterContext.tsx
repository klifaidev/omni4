// Estado do filtro cruzado de um slide (regras em lib/crossFilter.ts).
//
// Além dos filtros ativos, guarda o que cada bloco fez com eles (aplicou /
// não conseguiu aplicar e por quê) — é isso que a barra de filtros e o selo
// de cada bloco mostram, para o recurso nunca "falhar calado".
import {
  createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useSyncExternalStore,
} from "react";
import {
  applyCrossFilters,
  crossFilterReducer,
  dimensionLabel as libDimensionLabel,
  type CrossFilter,
  type CrossFilterResult,
} from "@/lib/crossFilter";

export type ActiveFilter = CrossFilter;

export interface BlockFilterStatus {
  applied: CrossFilter[];
  skipped: CrossFilterResult<unknown>["skipped"];
}

/** Registro dos status por bloco (fora do estado do React: muda a cada render dos blocos). */
class StatusRegistry {
  private map = new Map<string, BlockFilterStatus>();
  private listeners = new Set<() => void>();
  private snapshot: ReadonlyMap<string, BlockFilterStatus> = new Map();
  set(id: string, status: BlockFilterStatus | null) {
    const prev = this.map.get(id);
    const same = prev && status
      && prev.applied.length === status.applied.length && prev.skipped.length === status.skipped.length
      && prev.applied.every((f, i) => f === status.applied[i]) && prev.skipped.every((s, i) => s.filter === status.skipped[i].filter);
    if (same || (!prev && !status)) return;
    if (status) this.map.set(id, status);
    else this.map.delete(id);
    this.snapshot = new Map(this.map);
    // Notifica fora do render de quem reportou.
    queueMicrotask(() => this.listeners.forEach((l) => l()));
  }
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getSnapshot = () => this.snapshot;
}

interface ContextValue {
  filters: ActiveFilter[];
  setFilter: (f: ActiveFilter) => void;
  toggleFilter: (f: ActiveFilter) => void;
  removeValue: (sourceBlockId: string, value: string) => void;
  clearFilter: (sourceBlockId: string) => void;
  clearAll: () => void;
  registry: StatusRegistry | null;
  /** Editor e apresentação: há cliques. Miniaturas e exportação: não. */
  interactive: boolean;
}

const noop = () => {};
const Ctx = createContext<ContextValue>({
  filters: [],
  setFilter: noop,
  toggleFilter: noop,
  removeValue: noop,
  clearFilter: noop,
  clearAll: noop,
  registry: null,
  interactive: false,
});

export function SlideFilterProvider({
  children, slideKey, persist = false, interactive = false,
}: {
  children: React.ReactNode;
  slideKey?: string;
  /** Mostra as camadas clicáveis e os selos (editor e apresentação). */
  interactive?: boolean;
  /** Apresentação com o filtro "em todos os slides": trocar de slide não limpa. */
  persist?: boolean;
}) {
  const [filters, dispatch] = useReducer(crossFilterReducer, []);
  const registryRef = useRef<StatusRegistry>();
  if (!registryRef.current) registryRef.current = new StatusRegistry();
  const lastKey = useRef(slideKey);
  useEffect(() => {
    if (lastKey.current !== slideKey) {
      lastKey.current = slideKey;
      if (!persist) dispatch({ type: "clearAll" });
    }
  }, [slideKey, persist]);

  const setFilter = useCallback((f: ActiveFilter) => dispatch({ type: "set", filter: f }), []);
  const toggleFilter = useCallback((f: ActiveFilter) => dispatch({ type: "toggle", filter: f }), []);
  const removeValue = useCallback((id: string, value: string) => dispatch({ type: "removeValue", sourceBlockId: id, value }), []);
  const clearFilter = useCallback((id: string) => dispatch({ type: "clear", sourceBlockId: id }), []);
  const clearAll = useCallback(() => dispatch({ type: "clearAll" }), []);

  const value = useMemo<ContextValue>(() => ({
    filters, setFilter, toggleFilter, removeValue, clearFilter, clearAll, registry: registryRef.current!, interactive,
  }), [filters, setFilter, toggleFilter, removeValue, clearFilter, clearAll, interactive]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSlideFilters(): ContextValue {
  return useContext(Ctx);
}

/** Filtros vindos de OUTROS blocos (vazio quando o bloco não recebe filtros). */
export function useIncomingFilters(blockId: string, participates: boolean): ActiveFilter[] {
  const { filters } = useSlideFilters();
  return useMemo(
    () => (participates ? filters.filter((f) => f.sourceBlockId !== blockId) : []),
    [filters, participates, blockId],
  );
}

/**
 * Linhas do bloco com os filtros dos outros blocos aplicados, e o status
 * (aplicado / não aplicável) registrado para a barra e o selo do bloco.
 */
export function useCrossFilteredRows<T>(
  blockId: string,
  participates: boolean,
  rows: readonly T[],
  opts: { ignorePeriod?: boolean } = {},
): CrossFilterResult<T> {
  const incoming = useIncomingFilters(blockId, participates);
  const ignorePeriod = !!opts.ignorePeriod;
  const result = useMemo(
    () => applyCrossFilters(rows, incoming, { ignorePeriod }),
    [rows, incoming, ignorePeriod],
  );
  useReportFilterStatus(blockId, result.applied.length || result.skipped.length ? result : null);
  return result;
}

/** Para blocos que filtram por conta própria (gráfico): só reporta o status. */
export function useReportFilterStatus(blockId: string, status: BlockFilterStatus | null) {
  const { registry } = useSlideFilters();
  useEffect(() => {
    registry?.set(blockId, status);
  }, [registry, blockId, status]);
  useEffect(() => () => registry?.set(blockId, null), [registry, blockId]);
}

const EMPTY_STATUS: ReadonlyMap<string, BlockFilterStatus> = new Map();

/** Status de todos os blocos do slide (para a barra de filtros). */
export function useFilterStatuses(): ReadonlyMap<string, BlockFilterStatus> {
  const { registry } = useSlideFilters();
  return useSyncExternalStore(
    registry?.subscribe ?? (() => noop),
    registry?.getSnapshot ?? (() => EMPTY_STATUS),
  );
}

export function useBlockFilterStatus(blockId: string): BlockFilterStatus | undefined {
  return useFilterStatuses().get(blockId);
}

export const dimensionLabel = libDimensionLabel;
