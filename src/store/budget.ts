import { create } from "zustand";
import type { BudgetFile, BudgetRow } from "@/lib/budget";

interface BudgetState {
  rows: BudgetRow[];
  files: BudgetFile[];

  addBudget: (rows: BudgetRow[], file: BudgetFile, replaceMonths: boolean) => void;
  removeBudgetFile: (name: string) => void;
  clearBudget: () => void;
}

export const useBudget = create<BudgetState>((set) => ({
  rows: [],
  files: [],

  addBudget: (newRows, file, replaceMonths) => {
    const newPeriods = new Set(newRows.map((r) => r.periodo));
    set((s) => {
      const keptRows = replaceMonths
        ? s.rows.filter((r) => !newPeriods.has(r.periodo))
        : s.rows;
      const keptFiles = replaceMonths
        ? s.files.filter((f) => !f.months.some((m) => newPeriods.has(m)))
        : s.files;
      return {
        rows: [...keptRows, ...newRows],
        files: [...keptFiles, file],
      };
    });
  },

  removeBudgetFile: (name) =>
    set((s) => {
      const file = s.files.find((f) => f.name === name);
      if (!file) return {};
      const removedPeriods = new Set(file.months);
      const remainingFiles = s.files.filter((f) => f.name !== name);
      const stillCovered = new Set(remainingFiles.flatMap((f) => f.months));
      const rows = s.rows.filter((r) => {
        if (!removedPeriods.has(r.periodo)) return true;
        return stillCovered.has(r.periodo);
      });
      return { rows, files: remainingFiles };
    }),

  clearBudget: () => set({ rows: [], files: [] }),
}));

// Selectors --------------------------------------------------------
export function getBudgetMonthsInfo(rows: BudgetRow[]) {
  const map = new Map<string, { periodo: string; mes: number; ano: number; fy: string; rowCount: number }>();
  for (const r of rows) {
    const cur = map.get(r.periodo);
    if (cur) cur.rowCount++;
    else map.set(r.periodo, { periodo: r.periodo, mes: r.mes, ano: r.ano, fy: r.fy, rowCount: 1 });
  }
  return Array.from(map.values()).sort((a, b) => a.ano - b.ano || a.mes - b.mes);
}
