import { create } from "zustand";
import type { ForecastFile, ForecastRow } from "@/lib/forecast";
import { getInovacao, getLegado } from "@/lib/deparaInovacao";

interface ForecastState {
  rows: ForecastRow[];
  files: ForecastFile[];

  addForecast: (rows: ForecastRow[], file: ForecastFile, replaceCycles: boolean) => void;
  removeForecastFile: (name: string) => void;
  clearForecast: () => void;
  reclassifyInovacao: () => void;
}

function activeForecastFiles(files: ForecastFile[], rows: ForecastRow[], replacingFile: ForecastFile, replacingCycles: Set<string>) {
  return files
    .filter((file) => file.name !== replacingFile.name)
    .map((file) => {
      const cycles = file.cycles.filter((cycle) => !replacingCycles.has(cycle));
      if (cycles.length === file.cycles.length) return file;
      const cycleSet = new Set(cycles);
      return {
        ...file,
        cycles,
        rowCount: rows.filter((row) => cycleSet.has(row.forecastCycle)).length,
      };
    })
    .filter((file) => file.cycles.length > 0);
}

export const useForecast = create<ForecastState>((set) => ({
  rows: [],
  files: [],

  addForecast: (newRows, file, _replaceCycles) => {
    const newCycles = new Set(newRows.map((r) => r.forecastCycle));
    set((s) => {
      const keptRows = s.rows.filter((r) => !newCycles.has(r.forecastCycle));
      const keptFiles = activeForecastFiles(s.files, keptRows, file, newCycles);
      return {
        rows: [...keptRows, ...newRows],
        files: [...keptFiles, { ...file, cycles: Array.from(newCycles).sort(), rowCount: newRows.length }],
      };
    });
  },

  removeForecastFile: (name) =>
    set((s) => {
      const file = s.files.find((f) => f.name === name);
      if (!file) return {};
      const removedCycles = new Set(file.cycles);
      const remainingFiles = s.files.filter((f) => f.name !== name);
      const stillCovered = new Set(remainingFiles.flatMap((f) => f.cycles));
      const rows = s.rows.filter((r) => {
        if (!removedCycles.has(r.forecastCycle)) return true;
        return stillCovered.has(r.forecastCycle);
      });
      return { rows, files: remainingFiles };
    }),

  clearForecast: () => set({ rows: [], files: [] }),

  reclassifyInovacao: () =>
    set((s) => ({
      rows: s.rows.map((r) => ({
        ...r,
        inovacao: getInovacao(r.sku),
        legado: getLegado(r.sku),
      })),
    })),
}));

export function getForecastMonthsInfo(rows: ForecastRow[]) {
  const map = new Map<string, { periodo: string; mes: number; ano: number; fy: string; rowCount: number }>();
  for (const r of rows) {
    const cur = map.get(r.periodo);
    if (cur) cur.rowCount++;
    else map.set(r.periodo, { periodo: r.periodo, mes: r.mes, ano: r.ano, fy: r.fy, rowCount: 1 });
  }
  return Array.from(map.values()).sort((a, b) => a.ano - b.ano || a.mes - b.mes);
}

export function getForecastCyclesInfo(rows: ForecastRow[]) {
  const map = new Map<string, { periodo: string; label: string; rowCount: number }>();
  for (const r of rows) {
    const cur = map.get(r.forecastCycle);
    if (cur) cur.rowCount++;
    else map.set(r.forecastCycle, { periodo: r.forecastCycle, label: r.forecastCycleLabel, rowCount: 1 });
  }
  return Array.from(map.values()).sort((a, b) => a.periodo.localeCompare(b.periodo));
}
