// Estado da Central de De/Paras: aberta ou não, em qual tela, e um contador
// que muda a cada correção (os mapeamentos vivem fora do React — o contador
// faz as telas recalcularem).
import { create } from "zustand";
import type { DeParaMapId } from "@/lib/deparaHealth";

export type DeParaView = "pendencias" | DeParaMapId;

interface DeParaCenterState {
  open: boolean;
  view: DeParaView;
  version: number;
  openCenter: (view?: DeParaView) => void;
  setView: (view: DeParaView) => void;
  close: () => void;
  bump: () => void;
}

export const useDeParaCenter = create<DeParaCenterState>((set) => ({
  open: false,
  view: "pendencias",
  version: 0,
  openCenter: (view) => set((s) => ({ open: true, view: view ?? s.view })),
  setView: (view) => set({ view }),
  close: () => set({ open: false }),
  bump: () => set((s) => ({ version: s.version + 1 })),
}));
