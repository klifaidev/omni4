import { create } from "zustand";
import type { BudgetFile, BudgetRow } from "@/lib/budget";
import { getInovacao, getLegado } from "@/lib/deparaInovacao";

interface BudgetState {
  rows: BudgetRow[];
  files: BudgetFile[];

  addBudget: (rows: BudgetRow[], file: BudgetFile, replaceMonths: boolean) => void;
  removeBudgetFile: (name: string) => void;
  clearBudget: () => void;
  reclassifyInovacao: () => void;
}

function sortPeriods(periods: Iterable<string>) {
  return Array.from(periods).sort((a, b) => {
    const [am, ay] = a.split(".").map((x) => parseInt(x, 10));
    const [bm, by] = b.split(".").map((x) => parseInt(x, 10));
    return ay - by || am - bm;
  });
}

function activeFileMonths(files: BudgetFile[], rows: BudgetRow[], replacingFile: BudgetFile, replacingPeriods: Set<string>) {
  return files
    .filter((file) => file.name !== replacingFile.name)
    .map((file) => {
      const months = file.months.filter((month) => !replacingPeriods.has(month));
      if (months.length === file.months.length) return file;
      const monthSet = new Set(months);
      return {
        ...file,
        months,
        rowCount: rows.filter((row) => monthSet.has(row.periodo)).length,
      };
    })
    .filter((file) => file.months.length > 0);
}

export const useBudget = create<BudgetState>((set) => ({
  rows: [],
  files: [],

  addBudget: (newRows, file, _replaceMonths) => {
    const newPeriods = new Set(newRows.map((r) => r.periodo));
    set((s) => {
      const keptRows = s.rows.filter((r) => !newPeriods.has(r.periodo));
      const keptFiles = activeFileMonths(s.files, keptRows, file, newPeriods);
      return {
        rows: [...keptRows, ...newRows],
        files: [
          ...keptFiles,
          { ...file, months: sortPeriods(newPeriods), rowCount: newRows.length },
        ],
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

  reclassifyInovacao: () =>
    set((s) => ({
      rows: s.rows.map((r) => ({
        ...r,
        inovacao: getInovacao(r.sku),
        legado: getLegado(r.sku),
      })),
    })),
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
