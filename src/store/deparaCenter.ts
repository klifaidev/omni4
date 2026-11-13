// Estado da Central de De/Paras: aberta ou não, em qual tela, e um contador
// que muda a cada correção (os mapeamentos vivem fora do React — o contador
// faz as telas recalcularem).
import { createFreezable } from "@/lib/pageFreeze";
import type { DeParaMapId } from "@/lib/deparaHealth";

export type DeParaView = "pendencias" | DeParaMapId;

/** Fila do modo "Classificar SKUs": quais SKUs, em que ordem, e onde está. */
export interface ClassifySession {
  queue: string[];
  index: number;
  /** SKUs salvos nesta fila. */
  saved: string[];
}

interface DeParaCenterState {
  open: boolean;
  view: DeParaView;
  version: number;
  classify: ClassifySession | null;
  startClassify: (queue: string[], startSku?: string) => void;
  goToClassify: (index: number) => void;
  markClassified: (sku: string) => void;
  stopClassify: () => void;
  openCenter: (view?: DeParaView) => void;
  setView: (view: DeParaView) => void;
  close: () => void;
  bump: () => void;
}

export const useDeParaCenter = createFreezable<DeParaCenterState>((set) => ({
  open: false,
  view: "pendencias",
  version: 0,
  classify: null,
  startClassify: (queue, startSku) => {
    if (queue.length === 0) return;
    const index = startSku ? Math.max(0, queue.indexOf(startSku)) : 0;
    set({ classify: { queue, index, saved: [] } });
  },
  goToClassify: (index) =>
    set((s) => (s.classify ? { classify: { ...s.classify, index: Math.max(0, Math.min(index, s.classify.queue.length)) } } : {})),
  markClassified: (sku) =>
    set((s) => (s.classify && !s.classify.saved.includes(sku) ? { classify: { ...s.classify, saved: [...s.classify.saved, sku] } } : {})),
  stopClassify: () => set({ classify: null }),
  openCenter: (view) => set((s) => ({ open: true, view: view ?? s.view })),
  setView: (view) => set({ view, classify: null }),
  close: () => set({ open: false, classify: null }),
  bump: () => set((s) => ({ version: s.version + 1 })),
}));
