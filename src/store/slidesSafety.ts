// Proteção da aba Slides contra falta de memória (lib/memoryGuard).
// Não é persistido: vale para a sessão.
import { create } from "zustand";

export type SlidesSafetyReason = "crash" | "memory" | null;

interface SlidesSafetyState {
  /** Miniaturas pausadas: a esteira mostra só o nome de cada slide. */
  thumbnailsPaused: boolean;
  reason: SlidesSafetyReason;
  pause: (reason: Exclude<SlidesSafetyReason, null>) => void;
  resume: () => void;
}

export const useSlidesSafety = create<SlidesSafetyState>((set) => ({
  thumbnailsPaused: false,
  reason: null,
  pause: (reason) => set({ thumbnailsPaused: true, reason }),
  resume: () => set({ thumbnailsPaused: false, reason: null }),
}));
