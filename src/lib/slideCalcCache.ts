import { incrementSlidePerfCounter, isSlidePerfEnabled } from "@/lib/slidesPerfCounters";

export type SlideCalcCacheKeyInput = {
  op: string;
  slideId?: string | null;
  blockId?: string | null;
  /**
   * Use only for computations whose result is fully determined by op, slide,
   * data source/signature and params. Chart data series/rankings fit this:
   * blockId is useful for diagnostics, but does not change the math. Layout or
   * block-specific calculations must keep this false so different blocks do not
   * collide in cache.
   */
  shareAcrossBlocks?: boolean;
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
let rowsSignatureCache = new WeakMap<readonly unknown[], string>();
let rowsSignatureComputeCount = 0;

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
  if (!isSlidePerfEnabled()) return;
  incrementSlidePerfCounter(name, id);
}

export function buildSlideCalcCacheKey(input: SlideCalcCacheKeyInput): string {
  return [
    input.op,
    input.slideId ?? "no-slide",
    input.shareAcrossBlocks ? "shared-block" : input.blockId ?? "no-block",
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

const SIGNATURE_FIELDS = [
  "periodo",
  "fy",
  "sku",
  "skuDesc",
  "canal",
  "canalAjustado",
  "volumeKg",
  "rol",
  "margemBruta",
  "contribMarginal",
] as const;
const COLON = 58; // ":"

/**
 * Assinatura de um conjunto de linhas (chave de cache dos cálculos).
 *
 * Mesmo valor de sempre — por linha, FNV-1a do texto "periodo:fy:sku:…"
 * (campos vazios viram ""), depois a soma dos caracteres do hash em base 36 —
 * mas calculado campo a campo e dígito a dígito, sem montar esses textos:
 * antes eram 3 textos e um array por linha (~1 s com 1,4 milhão de linhas, na
 * abertura dos Slides).
 */
export function slideDataSignature(rows: readonly unknown[]): string {
  rowsSignatureComputeCount += 1;
  let hash = 2166136261;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] as Record<string, unknown> | undefined;
    if (!row) continue;
    let rowHash = 2166136261;
    for (let f = 0; f < SIGNATURE_FIELDS.length; f += 1) {
      if (f > 0) {
        rowHash ^= COLON;
        rowHash = Math.imul(rowHash, 16777619);
      }
      const value = row[SIGNATURE_FIELDS[f]];
      if (value === undefined || value === null) continue;
      const text = typeof value === "string" ? value : String(value);
      for (let k = 0; k < text.length; k += 1) {
        rowHash ^= text.charCodeAt(k);
        rowHash = Math.imul(rowHash, 16777619);
      }
    }
    // Soma dos códigos dos dígitos de (rowHash >>> 0).toString(36).
    let rest = rowHash >>> 0;
    let digitSum = 0;
    if (rest === 0) digitSum = 48;
    while (rest > 0) {
      const digit = rest % 36;
      digitSum += digit < 10 ? 48 + digit : 87 + digit;
      rest = Math.floor(rest / 36);
    }
    hash ^= digitSum;
    hash = Math.imul(hash, 16777619);
  }
  return `${rows.length}:${(hash >>> 0).toString(36)}`;
}

export function getCachedRowsSignature(rows: readonly unknown[]): string {
  const cached = rowsSignatureCache.get(rows);
  if (cached) return cached;
  const signature = slideDataSignature(rows);
  rowsSignatureCache.set(rows, signature);
  return signature;
}

export function clearSlideCalcCache(): void {
  cache.clear();
  rowsSignatureCache = new WeakMap<readonly unknown[], string>();
  rowsSignatureComputeCount = 0;
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

export function getRowsSignatureComputeCountForTest(): number {
  return rowsSignatureComputeCount;
}
