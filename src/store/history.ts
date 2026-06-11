import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Filters } from "@/lib/types";

export interface HistoryEntry {
  id: string;
  page: string;
  pageLabel: string;
  filters: Filters;
  selectedPeriods: string[] | null;
  visitedAt: number;
  summary: string;
}

interface HistoryState {
  entries: HistoryEntry[];
  addEntry: (entry: Omit<HistoryEntry, "id" | "visitedAt"> & { id?: string; visitedAt?: number }) => void;
  clearHistory: () => void;
}

const MAX_ENTRIES = 15;

function sameSignature(a: HistoryEntry, b: { page: string; filters: Filters; selectedPeriods: string[] | null }) {
  if (a.page !== b.page) return false;
  if (JSON.stringify(a.filters) !== JSON.stringify(b.filters)) return false;
  if (JSON.stringify(a.selectedPeriods) !== JSON.stringify(b.selectedPeriods)) return false;
  return true;
}

export const useHistory = create<HistoryState>()(
  persist(
    (set) => ({
      entries: [],
      addEntry: (entry) =>
        set((s) => {
          const fresh: HistoryEntry = {
            id: entry.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            visitedAt: entry.visitedAt ?? Date.now(),
            page: entry.page,
            pageLabel: entry.pageLabel,
            filters: entry.filters,
            selectedPeriods: entry.selectedPeriods,
            summary: entry.summary,
          };
          // Dedupe: se a entrada mais recente for igual, apenas atualiza timestamp
          const head = s.entries[0];
          if (head && sameSignature(head, fresh)) {
            const next = [{ ...head, visitedAt: fresh.visitedAt }, ...s.entries.slice(1)];
            return { entries: next };
          }
          return { entries: [fresh, ...s.entries].slice(0, MAX_ENTRIES) };
        }),
      clearHistory: () => set({ entries: [] }),
    }),
    { name: "app-history-v1" },
  ),
);
