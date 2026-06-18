import { create } from "zustand";
import {
  getInovacaoMap,
  resetInovacaoMap,
  setInovacaoMap,
  type InovacaoEntry,
} from "@/lib/deparaInovacao";
import type { InovacaoDeparaFile } from "@/lib/parseDeparaInovacao";

interface InovacaoDeparaState {
  map: Record<string, InovacaoEntry>;
  file: InovacaoDeparaFile | null;
  setDepara: (map: Record<string, InovacaoEntry>, file: InovacaoDeparaFile | null) => void;
  clearDepara: () => void;
}

export const useInovacaoDepara = create<InovacaoDeparaState>((set) => ({
  map: getInovacaoMap(),
  file: null,

  setDepara: (map, file) => {
    setInovacaoMap(map);
    set({ map, file });
  },

  clearDepara: () => {
    resetInovacaoMap();
    set({ map: getInovacaoMap(), file: null });
  },
}));
