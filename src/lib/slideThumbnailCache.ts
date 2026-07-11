export type SlideThumbnailStatus = "ready" | "rendering" | "error";

type SlideThumbnailEntry = {
  dataUrl?: string;
  status: SlideThumbnailStatus;
  updatedAt: number;
};

const MAX_ENTRIES = 120;
const entries = new Map<string, SlideThumbnailEntry>();
const listeners = new Map<string, Set<() => void>>();

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(",")}}`;
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function emit(key: string): void {
  listeners.get(key)?.forEach((listener) => listener());
}

function trim(): void {
  if (entries.size <= MAX_ENTRIES) return;
  const stale = Array.from(entries.entries())
    .sort((a, b) => a[1].updatedAt - b[1].updatedAt)
    .slice(0, entries.size - MAX_ENTRIES);
  stale.forEach(([key]) => entries.delete(key));
}

export function buildSlideThumbnailKey(input: unknown): string {
  return hashString(stableStringify(input));
}

export function getSlideThumbnail(key: string): SlideThumbnailEntry | undefined {
  return entries.get(key);
}

export function markSlideThumbnailRendering(key: string): void {
  entries.set(key, { ...entries.get(key), status: "rendering", updatedAt: Date.now() });
  emit(key);
}

export function setSlideThumbnail(key: string, dataUrl: string): void {
  entries.set(key, { dataUrl, status: "ready", updatedAt: Date.now() });
  trim();
  emit(key);
}

export function markSlideThumbnailError(key: string): void {
  entries.set(key, { ...entries.get(key), status: "error", updatedAt: Date.now() });
  emit(key);
}

export function subscribeSlideThumbnail(key: string, listener: () => void): () => void {
  const set = listeners.get(key) ?? new Set<() => void>();
  set.add(listener);
  listeners.set(key, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(key);
  };
}

export function clearSlideThumbnailCacheForTest(): void {
  entries.clear();
  listeners.clear();
}
