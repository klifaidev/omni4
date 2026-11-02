import { create } from "zustand";

export type PageWarmupStatus = "idle" | "running" | "done";

interface KeptPagesState {
  /** Abas montadas e guardadas (à vista ou ocultas). */
  mounted: string[];
  warmup: { status: PageWarmupStatus; done: number; total: number; label: string };
  addMounted: (path: string) => void;
  setWarmup: (warmup: KeptPagesState["warmup"]) => void;
  /** Desmonta as abas ocultas (guarda de memória); voltam a montar ao abrir. */
  releaseHidden: () => void;
}

export const useKeptPages = create<KeptPagesState>((set) => ({
  mounted: [],
  warmup: { status: "idle", done: 0, total: 0, label: "" },
  addMounted: (path) => set((s) => (s.mounted.includes(path) ? s : { mounted: [...s.mounted, path] })),
  setWarmup: (warmup) => set({ warmup }),
  releaseHidden: () => set({ mounted: [] }),
}));
