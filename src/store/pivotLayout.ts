import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PivotMode } from "@/lib/pivotData";

export type PivotVizMode = "heatmap" | "plain" | "bars";
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

export type PivotDensity = "comfortable" | "compact";

/** Campo calculado pela pessoa (ex.: "Margem líquida" = ([CM] - [Frete]) / [ROL]). */
export interface PivotCalcField {
  id: string;
  name: string;
  /** Fórmula canônica, com ids das medidas: "([cm_real] - [frete_real]) / [rol_real]". */
  formula: string;
  format: "currency" | "number" | "percent";
  /** As medidas mudam de modo pra modo — o campo vale só no modo em que foi criado. */
  mode: PivotMode;
}

interface PivotLayoutState {
  mode: PivotMode;
  /** Altura das linhas da tabela — preferência da pessoa, vale pra todos os modos. */
  density: PivotDensity;
  setDensity: (density: PivotDensity) => void;
  calcFields: PivotCalcField[];
  saveCalcField: (field: Omit<PivotCalcField, "id"> & { id?: string }) => PivotCalcField;
  removeCalcField: (id: string) => void;
  /** Última montagem de cada modo — restaurada ao voltar pra aba ou trocar de modo. */
  layouts: Partial<Record<PivotMode, PivotLayout>>;
  savedViews: SavedPivotView[];
  /** Só chamado quando a pessoa troca de modo — um recuo automático (ex.: sem
   *  base de Budget) não deve sobrescrever a preferência. */
  setMode: (mode: PivotMode) => void;
  saveLayout: (mode: PivotMode, layout: PivotLayout) => void;
  /** Esquece a última montagem do modo — a próxima abertura usa o padrão. */
  clearLayout: (mode: PivotMode) => void;
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
      density: "comfortable",
      setDensity: (density) => set({ density }),
      calcFields: [],
      saveCalcField: (field) => {
        const saved: PivotCalcField = { ...field, id: field.id ?? `calc_${newViewId()}`, name: field.name.trim() };
        set((state) => ({
          calcFields: state.calcFields.some((f) => f.id === saved.id)
            ? state.calcFields.map((f) => (f.id === saved.id ? saved : f))
            : [...state.calcFields, saved],
        }));
        return saved;
      },
      removeCalcField: (id) => set((state) => ({ calcFields: state.calcFields.filter((f) => f.id !== id) })),
      layouts: {},
      savedViews: [],
      setMode: (mode) => set({ mode }),
      saveLayout: (mode, layout) =>
        set((state) => ({ layouts: { ...state.layouts, [mode]: layout } })),
      clearLayout: (mode) =>
        set((state) => {
          const layouts = { ...state.layouts };
          delete layouts[mode];
          return { layouts };
        }),
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
