export type SlideCalcCacheKeyInput = {
  op: string;
  slideId?: string | null;
  blockId?: string | null;
  dataSource?: string | null;
  dataSignature?: string | null;
  params?: unknown;
};

type CacheEntry<T> = {
  key: string;
  value: T;
  usedAt: number;
};

const DEFAULT_MAX_ENTRIES = 250;
let maxEntries = DEFAULT_MAX_ENTRIES;
let tick = 0;
const cache = new Map<string, CacheEntry<unknown>>();

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

function recordCacheMetric(name: string, id?: string): void {
  if (typeof window === "undefined") return;
  const perf = window.__OMNI_SLIDES_PERF__;
  if (!perf) return;
  const counts = perf.counts ?? {};
  counts[name] = (counts[name] ?? 0) + 1;
  if (id) counts[`${name}:${id}`] = (counts[`${name}:${id}`] ?? 0) + 1;
  perf.counts = counts;
  if (perf.events) {
    perf.events.push({ name, id, at: performance.now() });
    if (perf.events.length > 50_000) perf.events.splice(0, perf.events.length - 50_000);
  }
}

export function buildSlideCalcCacheKey(input: SlideCalcCacheKeyInput): string {
  return [
    input.op,
    input.slideId ?? "no-slide",
    input.blockId ?? "no-block",
    input.dataSource ?? "default",
    input.dataSignature ?? "no-data",
    hashString(stableStringify(input.params ?? null)),
  ].join("|");
}

export function getOrComputeSlideCalc<T>(input: SlideCalcCacheKeyInput, compute: () => T): T {
  const key = buildSlideCalcCacheKey(input);
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit) {
    hit.usedAt = ++tick;
    recordCacheMetric(`SlideCalcCache:${input.op}:hit`, input.blockId ?? input.slideId ?? undefined);
    return hit.value;
  }

  recordCacheMetric(`SlideCalcCache:${input.op}:miss`, input.blockId ?? input.slideId ?? undefined);
  recordCacheMetric(`SlideCalc:${input.op}`, input.blockId ?? input.slideId ?? undefined);
  const value = compute();
  cache.set(key, { key, value, usedAt: ++tick });
  trimSlideCalcCache();
  return value;
}

export function getSlideCalcCacheValue<T>(input: SlideCalcCacheKeyInput): T | undefined {
  const key = buildSlideCalcCacheKey(input);
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (!hit) return undefined;
  hit.usedAt = ++tick;
  recordCacheMetric(`SlideCalcCache:${input.op}:hit`, input.blockId ?? input.slideId ?? undefined);
  return hit.value;
}

export function setSlideCalcCacheValue<T>(input: SlideCalcCacheKeyInput, value: T): void {
  const key = buildSlideCalcCacheKey(input);
  cache.set(key, { key, value, usedAt: ++tick });
  trimSlideCalcCache();
}

function trimSlideCalcCache(): void {
  if (cache.size <= maxEntries) return;
  const entries = Array.from(cache.values()).sort((a, b) => a.usedAt - b.usedAt);
  const removeCount = cache.size - maxEntries;
  for (let i = 0; i < removeCount; i += 1) cache.delete(entries[i].key);
}

export function slideDataSignature(rows: readonly unknown[]): string {
  let hash = 2166136261;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] as Record<string, unknown> | undefined;
    if (!row) continue;
    const sample = [
      row.periodo,
      row.fy,
      row.sku,
      row.skuDesc,
      row.canal,
      row.canalAjustado,
      row.forecastCycle,
      row.rollingCycle,
      row.volumeKg,
      row.rol,
      row.margemBruta,
      row.contribMarginal,
    ].join(":");
    hash ^= hashString(sample).split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    hash = Math.imul(hash, 16777619);
  }
  return `${rows.length}:${(hash >>> 0).toString(36)}`;
}

export function clearSlideCalcCache(): void {
  cache.clear();
}

export function getSlideCalcCacheSize(): number {
  return cache.size;
}

export function setSlideCalcCacheMaxEntriesForTest(limit: number): void {
  maxEntries = limit;
  trimSlideCalcCache();
}

export function resetSlideCalcCacheMaxEntriesForTest(): void {
  maxEntries = DEFAULT_MAX_ENTRIES;
  trimSlideCalcCache();
}
