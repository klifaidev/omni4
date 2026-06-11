import { create } from "zustand";

const STORAGE_KEY = "sidebar-collapsed";

function readStored(): boolean | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

function persist(v: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(v));
  } catch {
    /* ignore */
  }
}

const initialCollapsed = (() => {
  const stored = readStored();
  if (stored !== null) return stored;
  return typeof window !== "undefined" && window.innerWidth < 1400;
})();

interface SidebarState {
  collapsed: boolean;
  mobileOpen: boolean;
  setCollapsed: (v: boolean) => void;
  toggleCollapsed: () => void;
  setMobileOpen: (v: boolean) => void;
}

export const useSidebarState = create<SidebarState>((set, get) => ({
  collapsed: initialCollapsed,
  mobileOpen: false,
  setCollapsed: (v) => {
    persist(v);
    set({ collapsed: v });
  },
  toggleCollapsed: () => {
    const next = !get().collapsed;
    persist(next);
    set({ collapsed: next });
  },
  setMobileOpen: (v) => set({ mobileOpen: v }),
}));
