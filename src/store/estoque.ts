import { create } from "zustand";
import type { EstoqueFile, EstoqueRow } from "@/lib/estoque";

interface EstoqueState {
  rows: EstoqueRow[];
  file: EstoqueFile | null;
  warnings: string[];
  setEstoque: (rows: EstoqueRow[], file: EstoqueFile, warnings?: string[]) => void;
  clearEstoque: () => void;
}

export const useEstoque = create<EstoqueState>((set) => ({
  rows: [],
  file: null,
  warnings: [],
  setEstoque: (rows, file, warnings = []) => set({ rows, file, warnings }),
  clearEstoque: () => set({ rows: [], file: null, warnings: [] }),
}));

