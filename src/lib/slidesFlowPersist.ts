// Gravação da esteira de slides — leve e espaçada.
//
// Duas causas de travamento/crash ao mexer na esteira com pré-definições:
// 1. Imagens coladas nos slides (PNG de 2–3 MB em base64) eram gravadas
//    inteiras em CADA pré-definição que as continha: 3 pré-definições + a
//    esteira = a mesma imagem 4 vezes. Uma esteira real chegou a 36 MB.
// 2. Cada alteração (inclusive "carregar pré-definição") transformava esses
//    36 MB em texto na hora, e de novo a cada passo seguinte.
//
// Aqui: cada imagem grande vai uma vez só para `assets` (endereçada pelo
// conteúdo) e os slides guardam uma referência; e a gravação espera uma pausa
// curta para juntar alterações seguidas numa só. Na memória nada muda — só o
// arquivo. Arquivos antigos (sem `assets`) continuam sendo lidos.
import type { PersistStorage, StateStorage, StorageValue } from "zustand/middleware";

/** Texto a partir do qual vale guardar à parte (imagens; nunca textos comuns). */
export const ASSET_MIN_LENGTH = 20_000;
const ASSET_PREFIX = "omni-asset:";

function hashString(text: string): string {
  // FNV-1a 32 bits + tamanho: rápido o bastante para alguns MB e sem colisão prática.
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${text.length.toString(36)}-${(h >>> 0).toString(36)}`;
}

function isAssetCandidate(value: string): boolean {
  return value.length >= ASSET_MIN_LENGTH && value.startsWith("data:");
}

/** Troca cada imagem grande por uma referência; devolve o objeto novo e as imagens. */
export function packAssets<T>(value: T): { packed: T; assets: Record<string, string> } {
  const assets: Record<string, string> = {};
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      if (!isAssetCandidate(v)) return v;
      const id = hashString(v);
      assets[id] = v;
      return ASSET_PREFIX + id;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, child] of Object.entries(v as Record<string, unknown>)) out[k] = walk(child);
      return out;
    }
    return v;
  };
  return { packed: walk(value) as T, assets };
}

/** Desfaz `packAssets`. Referência sem imagem (arquivo corrompido) vira texto vazio. */
export function unpackAssets<T>(value: T, assets: Record<string, string> | undefined): T {
  if (!assets) return value;
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      if (!v.startsWith(ASSET_PREFIX)) return v;
      return assets[v.slice(ASSET_PREFIX.length)] ?? "";
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, child] of Object.entries(v as Record<string, unknown>)) out[k] = walk(child);
      return out;
    }
    return v;
  };
  return walk(value) as T;
}

export function serializePersisted<S>(value: StorageValue<S>): string {
  const { packed, assets } = packAssets(value.state);
  const body: Record<string, unknown> = { state: packed, version: value.version };
  if (Object.keys(assets).length > 0) body.assets = assets;
  return JSON.stringify(body);
}

export function deserializePersisted<S>(raw: string): StorageValue<S> {
  const parsed = JSON.parse(raw) as StorageValue<S> & { assets?: Record<string, string> };
  return { state: unpackAssets(parsed.state, parsed.assets), version: parsed.version };
}

// ---------------------------------------------------------------------------
// Gravação adiada
// ---------------------------------------------------------------------------

const flushers = new Set<() => void>();
let lifecycleBound = false;

function bindLifecycle() {
  if (lifecycleBound || typeof window === "undefined") return;
  lifecycleBound = true;
  // Fechar/recarregar a janela grava o que estiver pendente.
  const flushAll = () => flushers.forEach((f) => f());
  window.addEventListener("pagehide", flushAll);
  window.addEventListener("beforeunload", flushAll);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushAll();
  });
}

/** Grava já o que estiver esperando (antes de exportar, trocar de tela etc.). */
export function flushPendingPersist(): void {
  flushers.forEach((f) => f());
}

/**
 * PersistStorage do zustand que (1) espera `delayMs` sem alterações antes de
 * transformar o estado em texto e gravar, e (2) grava imagens uma vez só.
 */
export function createDeferredPackedStorage<S>(getRaw: () => StateStorage, delayMs = 500): PersistStorage<S> {
  const pending = new Map<string, StorageValue<S>>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let raw: StateStorage | null = null;
  const storage = () => (raw ??= getRaw());

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const entries = [...pending.entries()];
    pending.clear();
    for (const [name, value] of entries) {
      try {
        void storage().setItem(name, serializePersisted(value));
      } catch (error) {
        console.error("[slidesFlow] Falha ao preparar a gravação da esteira.", error);
      }
    }
  };
  flushers.add(flush);
  bindLifecycle();

  return {
    getItem: async (name) => {
      const text = await storage().getItem(name);
      if (!text) return null;
      try {
        return deserializePersisted<S>(text);
      } catch (error) {
        console.error("[slidesFlow] Esteira gravada ilegível.", error);
        return null;
      }
    },
    setItem: (name, value) => {
      pending.set(name, value);
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    },
    removeItem: async (name) => {
      pending.delete(name);
      await storage().removeItem(name);
    },
  };
}
