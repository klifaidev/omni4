import { create } from "zustand";
import type { RollingFile, RollingRow } from "@/lib/rolling";
import { isRollingMonthAfterCycle } from "@/lib/rolling";
import { getInovacao, getLegado } from "@/lib/deparaInovacao";

interface RollingState {
  rows: RollingRow[];
  files: RollingFile[];

  addRolling: (rows: RollingRow[], file: RollingFile) => void;
  removeRollingFile: (name: string) => void;
  clearRolling: () => void;
  reclassifyInovacao: () => void;
}

function rank(periodo: string) {
  const [m, y] = periodo.split(".").map((x) => parseInt(x, 10));
  return y * 12 + m;
}

export const useRolling = create<RollingState>((set) => ({
  rows: [],
  files: [],

  addRolling: (newRows, file) => {
    const cycle = file.cycles[0] ?? newRows[0]?.rollingCycle;
    const cycleRank = cycle ? rank(cycle) : -Infinity;
    const rowsToApply = newRows.filter(isRollingMonthAfterCycle);

    set((s) => ({
      rows: [
        ...s.rows.filter((r) => rank(r.periodo) <= cycleRank),
        ...rowsToApply,
      ],
      files: [
        ...s.files.filter((f) => !f.cycles.some((c) => rank(c) >= cycleRank)),
        { ...file, rowCount: rowsToApply.length, months: Array.from(new Set(rowsToApply.map((r) => r.periodo))).sort() },
      ],
    }));
  },

  removeRollingFile: (name) =>
    set((s) => {
      const file = s.files.find((f) => f.name === name);
      if (!file) return {};
      const removedMonths = new Set(file.months);
      const remainingFiles = s.files.filter((f) => f.name !== name);
      const stillCovered = new Set(remainingFiles.flatMap((f) => f.months));
      const rows = s.rows.filter((r) => {
        if (!removedMonths.has(r.periodo)) return true;
        return stillCovered.has(r.periodo);
      });
      return { rows, files: remainingFiles };
    }),

  clearRolling: () => set({ rows: [], files: [] }),

  reclassifyInovacao: () =>
    set((s) => ({
      rows: s.rows.map((r) => ({
        ...r,
        inovacao: getInovacao(r.sku),
        legado: getLegado(r.sku),
      })),
    })),
}));

export function getRollingMonthsInfo(rows: RollingRow[]) {
  const map = new Map<string, { periodo: string; mes: number; ano: number; fy: string; rowCount: number }>();
  for (const r of rows) {
    const cur = map.get(r.periodo);
    if (cur) cur.rowCount++;
    else map.set(r.periodo, { periodo: r.periodo, mes: r.mes, ano: r.ano, fy: r.fy, rowCount: 1 });
  }
  return Array.from(map.values()).sort((a, b) => a.ano - b.ano || a.mes - b.mes);
}

export function getRollingCyclesInfo(rows: RollingRow[]) {
  const map = new Map<string, { periodo: string; label: string; rowCount: number }>();
  for (const r of rows) {
    const cur = map.get(r.rollingCycle);
    if (cur) cur.rowCount++;
    else map.set(r.rollingCycle, { periodo: r.rollingCycle, label: r.rollingCycleLabel, rowCount: 1 });
  }
  return Array.from(map.values()).sort((a, b) => a.periodo.localeCompare(b.periodo));
}
