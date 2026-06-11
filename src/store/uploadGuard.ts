import { create } from "zustand";

interface UploadGuardState {
  pending: number;
  apply: (() => Promise<void> | void) | null;
  setPending: (n: number) => void;
  setApply: (fn: (() => Promise<void> | void) | null) => void;
}

export const useUploadGuard = create<UploadGuardState>((set) => ({
  pending: 0,
  apply: null,
  setPending: (n) => set({ pending: n }),
  setApply: (fn) => set({ apply: fn }),
}));
