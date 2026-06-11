import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Filters } from "@/lib/types";

export interface Bookmark {
  id: string;
  name: string;
  page: string;
  filters: Filters;
  selectedPeriods: string[] | null;
  createdAt: number;
}

interface BookmarksState {
  bookmarks: Bookmark[];
  addBookmark: (
    name: string,
    page: string,
    filters: Filters,
    selectedPeriods: string[] | null,
  ) => Bookmark;
  removeBookmark: (id: string) => void;
  renameBookmark: (id: string, name: string) => void;
}

export const useBookmarks = create<BookmarksState>()(
  persist(
    (set, get) => ({
      bookmarks: [],
      addBookmark: (name, page, filters, selectedPeriods) => {
        const bookmark: Bookmark = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: name.trim() || "Sem nome",
          page,
          filters,
          selectedPeriods,
          createdAt: Date.now(),
        };
        set({ bookmarks: [bookmark, ...get().bookmarks] });
        return bookmark;
      },
      removeBookmark: (id) =>
        set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== id) })),
      renameBookmark: (id, name) =>
        set((s) => ({
          bookmarks: s.bookmarks.map((b) => (b.id === id ? { ...b, name: name.trim() || b.name } : b)),
        })),
    }),
    { name: "app-bookmarks-v1" },
  ),
);

export function matchesCurrent(
  b: Bookmark,
  page: string,
  filters: Filters,
  selectedPeriods: string[] | null,
): boolean {
  if (b.page !== page) return false;
  if (JSON.stringify(b.filters) !== JSON.stringify(filters)) return false;
  if (JSON.stringify(b.selectedPeriods) !== JSON.stringify(selectedPeriods)) return false;
  return true;
}
