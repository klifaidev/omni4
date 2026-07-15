import { create } from "zustand";
import type { Filters, LoadedFile, Metric, PricingRow } from "@/lib/types";
import type { MissingMappings } from "@/lib/csv";
import { getInovacao, getLegado } from "@/lib/deparaInovacao";
import { getDeParaBySku, getMissingDeParaFields, type DeParaEntry } from "@/lib/depara";

interface PricingState {
  rows: PricingRow[];
  files: LoadedFile[];
  metric: Metric;
  filters: Filters;
  selectedPeriods: string[] | null; // null = all
  missing: MissingMappings;         // valores ausentes nos De Paras
  // PVM
  pvmMode: "fy" | "month";
  pvmBase: string | null;
  pvmComp: string | null;
  parsing: boolean;
  isDemoData: boolean;

  setParsingStart: () => void;
  setParsingEnd: () => void;
  setDemoMode: (v: boolean) => void;
  setMetric: (m: Metric) => void;
  setFilter: (k: keyof Filters, v: string[]) => void;
  clearFilters: () => void;
  setSelectedPeriods: (p: string[] | null) => void;
  togglePeriod: (p: string) => void;
  setAllPeriods: () => void;

  addParsed: (
    rows: PricingRow[],
    file: LoadedFile,
    replaceMonths: boolean,
    missing?: MissingMappings,
  ) => void;
  removeFile: (name: string) => void;
  clearAll: () => void;
  dismissMissing: () => void;
  reclassifyInovacao: () => void;
  applySkuDeParaEntries: (entries: Record<string, DeParaEntry>) => void;

  setPvm: (base: string | null, comp: string | null) => void;
  setPvmMode: (mode: "fy" | "month") => void;
}

const EMPTY_MISSING: MissingMappings = { skus: [], canais: [], regioes: [], ufs: [] };

function mergeMissing(a: MissingMappings, b: MissingMappings): MissingMappings {
  const skuMap = new Map<string, MissingMappings["skus"][number]>();
  for (const it of [...a.skus, ...b.skus]) {
    const prev = skuMap.get(it.sku);
    if (!prev) {
      skuMap.set(it.sku, it);
    } else {
      // Mantém entry mais completa e união dos missingFields.
      const mergedFields = Array.from(new Set([...prev.missingFields, ...it.missingFields]));
      skuMap.set(it.sku, {
        sku: it.sku,
        descricao: prev.descricao ?? it.descricao,
        entry: it.entry ?? prev.entry,
        missingFields: mergedFields,
      });
    }
  }
  return {
    skus: Array.from(skuMap.values()).sort((x, y) => x.sku.localeCompare(y.sku)),
    canais: Array.from(new Set([...a.canais, ...b.canais])).sort(),
    regioes: Array.from(new Set([...a.regioes, ...b.regioes])).sort(),
    ufs: Array.from(new Set([...a.ufs, ...b.ufs])).sort(),
  };
}

export const usePricing = create<PricingState>((set, get) => ({
  rows: [],
  files: [],
  metric: "cm",
  filters: {},
  selectedPeriods: null,
  missing: EMPTY_MISSING,
  pvmMode: "fy",
  pvmBase: null,
  pvmComp: null,
  parsing: false,
  isDemoData: false,

  setParsingStart: () => set({ parsing: true }),
  setParsingEnd: () => set({ parsing: false }),
  setDemoMode: (v) => set({ isDemoData: v }),

  setMetric: (m) => set({ metric: m }),
  setFilter: (k, v) =>
    set((s) => ({ filters: { ...s.filters, [k]: v.length ? v : undefined } })),
  clearFilters: () => set({ filters: {} }),
  setSelectedPeriods: (p) => set({ selectedPeriods: p }),
  togglePeriod: (p) =>
    set((s) => {
      const all = Array.from(new Set(get().rows.map((r) => r.periodo))).sort();
      const cur = s.selectedPeriods ?? all;
      const next = cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p];
      return { selectedPeriods: next };
    }),
  setAllPeriods: () => set({ selectedPeriods: null }),

  addParsed: (newRows, file, replaceMonths, missing) => {
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
        missing: missing ? mergeMissing(s.missing, missing) : s.missing,
        isDemoData: false,
      };
    });
  },

  removeFile: (name) =>
    set((s) => {
      const file = s.files.find((f) => f.name === name);
      if (!file) return {};
      const removedPeriods = new Set(file.months);
      const remainingFiles = s.files.filter((f) => f.name !== name);
      const stillCoveredPeriods = new Set(remainingFiles.flatMap((f) => f.months));
      const rows = s.rows.filter((r) => {
        if (!removedPeriods.has(r.periodo)) return true;
        return stillCoveredPeriods.has(r.periodo);
      });
      return { rows, files: remainingFiles };
    }),

  clearAll: () =>
    set({
      rows: [],
      files: [],
      filters: {},
      selectedPeriods: null,
      pvmBase: null,
      pvmComp: null,
      missing: EMPTY_MISSING,
      isDemoData: false,
    }),

  dismissMissing: () => set({ missing: EMPTY_MISSING }),

  reclassifyInovacao: () =>
    set((s) => ({
      rows: s.rows.map((r) => ({
        ...r,
        inovacao: getInovacao(r.sku),
        legado: getLegado(r.sku),
      })),
    })),

  applySkuDeParaEntries: (entries) =>
    set((s) => {
      const changedSkus = new Set(Object.keys(entries));
      const rows = s.rows.map((r) => {
        if (!r.sku || !changedSkus.has(r.sku)) return r;
        const dp = getDeParaBySku(r.sku);
        if (!dp) return r;
        return {
          ...r,
          categoria: dp.categoria || r.categoria,
          subcategoria: dp.subcategoria || r.subcategoria,
          formato: dp.formato || r.formato,
          marca: dp.marca || r.marca,
          tecnologia: dp.tecnologia || r.tecnologia,
          mercado: dp.mercado || r.mercado,
          faixaPeso: dp.faixaPeso || r.faixaPeso,
          sabor: dp.sabor || r.sabor,
          skuDesc: dp.skuDesc || r.skuDesc,
        };
      });
      const skus = s.missing.skus
        .map((item) => {
          if (!changedSkus.has(item.sku)) return item;
          const entry = getDeParaBySku(item.sku);
          const missingFields = getMissingDeParaFields(item.sku);
          return { ...item, entry: entry ?? item.entry, missingFields };
        })
        .filter((item) => item.missingFields.length > 0);
      return { rows, missing: { ...s.missing, skus } };
    }),

  setPvm: (base, comp) => set({ pvmBase: base, pvmComp: comp }),
  setPvmMode: (mode) => set({ pvmMode: mode, pvmBase: null, pvmComp: null }),
}));
