export type SlideThumbnailStatus = "ready" | "rendering" | "error";

type SlideThumbnailEntry = {
  dataUrl?: string;
  status: SlideThumbnailStatus;
  updatedAt: number;
};

const MAX_ENTRIES = 120;
const entries = new Map<string, SlideThumbnailEntry>();
const listeners = new Map<string, Set<() => void>>();

/**
 * Última miniatura pronta de cada slide, indexada pelo id do item (não pela
 * chave de conteúdo). A chave de conteúdo muda toda vez que o slide é
 * editado — então, ao sair da edição ao vivo (ver LiveEditingCustomPreview em
 * SlidePreview.tsx), a chave nova ainda não tem entrada em `entries` e a
 * miniatura piscaria pra um placeholder em branco até a recaptura terminar.
 * Este mapa guarda a última imagem válida POR SLIDE, sobrevivendo à troca de
 * chave, pra a miniatura estática mostrar algo (a versão anterior) desde o
 * primeiro render em vez de piscar.
 */
const MAX_LAST_GOOD_ENTRIES = 120;
const lastGoodByItemId = new Map<string, { dataUrl: string; updatedAt: number }>();

function trimLastGood(): void {
  if (lastGoodByItemId.size <= MAX_LAST_GOOD_ENTRIES) return;
  const stale = Array.from(lastGoodByItemId.entries())
    .sort((a, b) => a[1].updatedAt - b[1].updatedAt)
    .slice(0, lastGoodByItemId.size - MAX_LAST_GOOD_ENTRIES);
  stale.forEach(([id]) => lastGoodByItemId.delete(id));
}

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

export function setSlideThumbnail(key: string, dataUrl: string, itemId?: string): void {
  entries.set(key, { dataUrl, status: "ready", updatedAt: Date.now() });
  trim();
  if (itemId) {
    lastGoodByItemId.set(itemId, { dataUrl, updatedAt: Date.now() });
    trimLastGood();
  }
  emit(key);
}

/** Ver comentário de `lastGoodByItemId` acima. */
export function getLastGoodSlideThumbnail(itemId: string): string | undefined {
  return lastGoodByItemId.get(itemId)?.dataUrl;
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
  lastGoodByItemId.clear();
}
