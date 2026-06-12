// Editor preferences persisted to localStorage (B8.4).
// Currently: snap-to-grid toggle and grid size.

import { useEffect, useState } from "react";

export type GridSize = 4 | 8 | 16 | 32;

interface EditorPrefs {
  gridEnabled: boolean;
  gridSize: GridSize;
  zoom: number;
}

const STORAGE_KEY = "harald.editorPrefs.v1";
const DEFAULT: EditorPrefs = { gridEnabled: false, gridSize: 8, zoom: 1 };

function read(): EditorPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<EditorPrefs>;
    const zoom = typeof parsed.zoom === "number" && isFinite(parsed.zoom)
      ? Math.min(1.5, Math.max(0.5, parsed.zoom))
      : 1;
    return {
      gridEnabled: !!parsed.gridEnabled,
      gridSize: ([4, 8, 16, 32] as const).includes(parsed.gridSize as GridSize)
        ? (parsed.gridSize as GridSize)
        : 8,
      zoom,
    };
  } catch {
    return DEFAULT;
  }
}

function write(p: EditorPrefs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

// Module-level subscribers so multiple components stay in sync.
let current: EditorPrefs = read();
const subs = new Set<() => void>();

export function getEditorPrefs(): EditorPrefs { return current; }
export function setEditorPrefs(patch: Partial<EditorPrefs>) {
  current = { ...current, ...patch };
  write(current);
  subs.forEach((fn) => fn());
}

export function useEditorPrefs(): EditorPrefs & {
  setGridEnabled: (v: boolean) => void;
  setGridSize: (s: GridSize) => void;
  setZoom: (z: number) => void;
} {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    subs.add(fn);
    return () => { subs.delete(fn); };
  }, []);
  return {
    ...current,
    setGridEnabled: (v) => setEditorPrefs({ gridEnabled: v }),
    setGridSize: (s) => setEditorPrefs({ gridSize: s }),
    setZoom: (z) => setEditorPrefs({ zoom: Math.min(1.5, Math.max(0.5, z)) }),
  };
}

/** Snap a value to the nearest grid multiple. */
export function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}
