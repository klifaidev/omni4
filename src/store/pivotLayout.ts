import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PivotMode } from "@/lib/pivotData";

export type PivotVizMode = "heatmap" | "plain";
export type PivotSortState = { col: string; measure: string; dir: "asc" | "desc" } | null;

/** Montagem da Tabela Dinâmica — tudo que a pessoa configura na tela. */
export interface PivotLayout {
  rows: string[];
  cols: string[];
  values: string[];
  filterDims: string[];
  filterVals: Record<string, string[]>;
  sort: PivotSortState;
  viz: PivotVizMode;
  hideEmpty: boolean;
}

export interface SavedPivotView {
  id: string;
  name: string;
  mode: PivotMode;
  layout: PivotLayout;
  createdAt: number;
}

const MAX_SAVED_VIEWS = 30;

interface PivotLayoutState {
  mode: PivotMode;
  /** Última montagem de cada modo — restaurada ao voltar pra aba ou trocar de modo. */
  layouts: Partial<Record<PivotMode, PivotLayout>>;
  savedViews: SavedPivotView[];
  /** Só chamado quando a pessoa troca de modo — um recuo automático (ex.: sem
   *  base de Budget) não deve sobrescrever a preferência. */
  setMode: (mode: PivotMode) => void;
  saveLayout: (mode: PivotMode, layout: PivotLayout) => void;
  /** Salvar com um nome que já existe no mesmo modo substitui a visão anterior. */
  saveView: (name: string, mode: PivotMode, layout: PivotLayout) => SavedPivotView;
  deleteView: (id: string) => void;
  /** Desfaz uma exclusão: reinsere a visão na posição que ela ocupava. */
  restoreView: (view: SavedPivotView, index: number) => void;
}

function newViewId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const usePivotLayoutStore = create<PivotLayoutState>()(
  persist(
    (set) => ({
      mode: "real",
      layouts: {},
      savedViews: [],
      setMode: (mode) => set({ mode }),
      saveLayout: (mode, layout) =>
        set((state) => ({ layouts: { ...state.layouts, [mode]: layout } })),
      saveView: (name, mode, layout) => {
        const view: SavedPivotView = { id: newViewId(), name: name.trim(), mode, layout, createdAt: Date.now() };
        set((state) => {
          const others = state.savedViews.filter(
            (existing) => !(existing.mode === mode && existing.name.toLowerCase() === view.name.toLowerCase()),
          );
          return { savedViews: [...others, view].slice(-MAX_SAVED_VIEWS) };
        });
        return view;
      },
      deleteView: (id) =>
        set((state) => ({ savedViews: state.savedViews.filter((view) => view.id !== id) })),
      restoreView: (view, index) =>
        set((state) => {
          if (state.savedViews.some((existing) => existing.id === view.id)) return state;
          const next = state.savedViews.slice();
          next.splice(Math.max(0, Math.min(index, next.length)), 0, view);
          return { savedViews: next.slice(-MAX_SAVED_VIEWS) };
        }),
    }),
    { name: "omni4-pivot-layout-v1" },
  ),
);
