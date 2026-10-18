// Estado das miniaturas compartilhadas da aba Slides (os componentes estão em
// components/pricing/thumbnailPool.tsx — lá está a explicação do desenho).
//
// Uma miniatura viva por slide, desenhada num "host" (<div> fora da árvore
// das listas). Cada lugar que mostra a miniatura é um "encaixe": o host é
// movido para dentro do encaixe vencedor (camada mais alta; empate: o mais
// novo). Sem encaixe, o host espera no "estacionamento", ainda montado.
import { startTransition, useEffect, useLayoutEffect, useState } from "react";
import { CANVAS_H, CANVAS_W } from "@/lib/customSlide";
import type { SlideItem } from "@/lib/slidesFlow";
import { useSlidesSafety } from "@/store/slidesSafety";

// ---------------------------------------------------------------------------
// Fila de montagem escalonada
// ---------------------------------------------------------------------------
/**
 * Listas longas montam no máximo uma miniatura nova por quadro, em vez de
 * renderizar dezenas de slides (com gráficos e tabelas) de uma vez.
 *
 * Cada montagem roda dentro de startTransition: como transição o React fatia
 * o trabalho e devolve o controle ao navegador entre as fatias — digitação e
 * cliques nunca esperam uma miniatura terminar de montar.
 */
export type StaggeredMountPriority = boolean | "priority";
const staggeredMountQueue: Array<() => void> = [];
let staggeredMountPumpScheduled = false;

function pumpStaggeredMounts(): void {
  staggeredMountPumpScheduled = false;
  const job = staggeredMountQueue.shift();
  if (job) startTransition(job);
  if (staggeredMountQueue.length > 0) scheduleStaggeredMountPump();
}

function scheduleStaggeredMountPump(): void {
  if (staggeredMountPumpScheduled) return;
  staggeredMountPumpScheduled = true;
  // Depois da pintura do quadro atual, pra nunca empilhar duas montagens
  // de slide no mesmo quadro. Com a janela minimizada o navegador congela o
  // requestAnimationFrame — o temporizador de reserva mantém a fila andando
  // (o pré-carregamento não fica parado esperando a janela voltar).
  let fired = false;
  const go = () => {
    if (fired) return;
    fired = true;
    window.setTimeout(pumpStaggeredMounts, 0);
  };
  requestAnimationFrame(go);
  window.setTimeout(go, 100);
}

/** Põe uma montagem na fila; devolve o cancelamento. */
function enqueueStaggeredMount(job: () => void, priority: boolean): () => void {
  let cancelled = false;
  const run = () => {
    if (!cancelled) job();
  };
  if (priority) staggeredMountQueue.unshift(run);
  else staggeredMountQueue.push(run);
  scheduleStaggeredMountPump();
  return () => {
    cancelled = true;
    const index = staggeredMountQueue.indexOf(run);
    if (index >= 0) staggeredMountQueue.splice(index, 1);
  };
}

/**
 * Uma vez montada, a miniatura fica montada (não pisca ao rolar de volta).
 * `"priority"` entra na frente da fila (slide aberto/selecionado).
 */
export function useStaggeredMount(canMount: boolean, stagger: StaggeredMountPriority): boolean {
  const [mounted, setMounted] = useState(canMount && !stagger);
  useEffect(() => {
    if (mounted || !canMount) return;
    if (!stagger) {
      setMounted(true);
      return;
    }
    return enqueueStaggeredMount(() => setMounted(true), stagger === "priority");
  }, [mounted, canMount, stagger]);
  return mounted;
}

// ---------------------------------------------------------------------------
// Pool
// ---------------------------------------------------------------------------
/**
 * Camadas de encaixe: o editor (por cima da esteira) fica com a miniatura.
 * `standby`: encaixe montado que não deve pegar a miniatura agora (o editor
 * enquanto anima a abertura/fechamento — a esteira por trás continua visível).
 */
export const THUMBNAIL_LAYER = { standby: -1, flow: 0, editor: 1 } as const;
export type ThumbnailLayer = typeof THUMBNAIL_LAYER[keyof typeof THUMBNAIL_LAYER];

type PoolSlot = { el: HTMLElement; layer: number; seq: number; setOwner: (owns: boolean) => void };
type PoolEntry = { host: HTMLDivElement; ready: boolean; slots: PoolSlot[] };

const entries = new Map<string, PoolEntry>();
/** Slides cuja miniatura o host deve manter montada. */
const requested = new Set<string>();
/** Pedidos ainda na fila escalonada (id → cancelar). */
const queuedRequests = new Map<string, { priority: boolean; cancel: () => void }>();
const readyWaiters = new Map<string, Array<() => void>>();
const hostListeners = new Set<() => void>();
const readyListeners = new Set<() => void>();
let hostRendered = false;
let parking: HTMLDivElement | null = null;
let slotSeq = 0;

function getParking(): HTMLDivElement {
  if (parking?.isConnected) return parking;
  parking = document.createElement("div");
  parking.setAttribute("aria-hidden", "true");
  parking.dataset.thumbnailPool = "parking";
  // Fora da tela e sem pintura, mas COM layout: os gráficos medem o próprio
  // tamanho, e um nó solto do documento mediria 0×0 e redesenharia ao voltar.
  Object.assign(parking.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: "0",
    height: "0",
    overflow: "hidden",
    visibility: "hidden",
    pointerEvents: "none",
    contain: "strict",
  });
  document.body.appendChild(parking);
  return parking;
}

function entryFor(id: string): PoolEntry {
  let entry = entries.get(id);
  if (!entry) {
    const host = document.createElement("div");
    host.dataset.thumbnailHost = id;
    Object.assign(host.style, {
      position: "absolute",
      top: "0",
      left: "0",
      width: `${CANVAS_W}px`,
      height: `${CANVAS_H}px`,
    });
    getParking().appendChild(host);
    entry = { host, ready: false, slots: [] };
    entries.set(id, entry);
  }
  return entry;
}

/** Leva o host ao encaixe vencedor e avisa cada encaixe se está com ele. */
function placeHost(id: string): void {
  const entry = entries.get(id);
  if (!entry) return;
  let winner: PoolSlot | null = null;
  for (const slot of entry.slots) {
    if (!winner || slot.layer > winner.layer || (slot.layer === winner.layer && slot.seq > winner.seq)) winner = slot;
  }
  const target = winner?.el ?? getParking();
  if (entry.host.parentNode !== target) target.appendChild(entry.host);
  for (const slot of entry.slots) slot.setOwner(slot === winner);
}

function forgetEntry(id: string): void {
  entries.get(id)?.host.remove();
  entries.delete(id);
  requested.delete(id);
  queuedRequests.get(id)?.cancel();
  queuedRequests.delete(id);
  const waiters = readyWaiters.get(id);
  readyWaiters.delete(id);
  waiters?.forEach((resolve) => resolve());
}

/** O <div> onde a miniatura do slide é desenhada (criado na primeira vez). */
export function poolHostElement(id: string): HTMLDivElement {
  return entryFor(id).host;
}

/** Registra um encaixe; devolve o cancelamento. */
export function registerPoolSlot(id: string, el: HTMLElement, layer: number, setOwner: (owns: boolean) => void): () => void {
  const slot: PoolSlot = { el, layer, seq: ++slotSeq, setOwner };
  entryFor(id).slots.push(slot);
  placeHost(id);
  return () => {
    const entry = entries.get(id);
    if (!entry) return;
    entry.slots = entry.slots.filter((s) => s !== slot);
    placeHost(id);
  };
}

/** A miniatura do slide terminou (ou deixou) de estar desenhada no host. */
export function setPoolReady(id: string, ready: boolean): void {
  const entry = entries.get(id);
  if (!entry || entry.ready === ready) return;
  entry.ready = ready;
  if (ready) {
    const waiters = readyWaiters.get(id);
    readyWaiters.delete(id);
    waiters?.forEach((resolve) => resolve());
  }
  readyListeners.forEach((listener) => listener());
}

export function isPoolRequested(id: string): boolean {
  return requested.has(id);
}

/** Pede a miniatura do slide ao host (entra na fila escalonada). */
export function requestPooledThumbnail(id: string, priority = false): void {
  if (requested.has(id)) return;
  const queued = queuedRequests.get(id);
  if (queued) {
    if (!priority || queued.priority) return;
    queued.cancel();
  }
  const cancel = enqueueStaggeredMount(() => {
    queuedRequests.delete(id);
    requested.add(id);
    hostListeners.forEach((listener) => listener());
  }, priority);
  queuedRequests.set(id, { priority, cancel });
}

/**
 * Resolve quando a miniatura do slide está desenhada (usado pelo
 * pré-carregamento da esteira). Nunca trava: sem host, em modo seguro ou
 * passado o tempo limite, resolve do mesmo jeito.
 */
export function whenPooledThumbnailReady(item: SlideItem, timeoutMs = 6000): Promise<void> {
  if (item.kind !== "custom" || !hostRendered || useSlidesSafety.getState().thumbnailsPaused) return Promise.resolve();
  if (entries.get(item.id)?.ready) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = window.setTimeout(done, timeoutMs);
    function done() {
      window.clearTimeout(timer);
      resolve();
    }
    const list = readyWaiters.get(item.id) ?? [];
    list.push(done);
    readyWaiters.set(item.id, list);
    requestPooledThumbnail(item.id, true);
  });
}

/** Há um host de miniaturas montado (página de Slides aberta). */
export function isThumbnailPoolActive(): boolean {
  return hostRendered;
}

/** Marcado já na renderização do host, antes dos encaixes decidirem se usam o pool. */
export function markPoolHostRendered(): void {
  hostRendered = true;
}

/** O host se inscreve para saber de pedidos novos; o retorno desmonta o pool. */
export function attachPoolHost(onRequest: () => void): () => void {
  hostRendered = true;
  hostListeners.add(onRequest);
  return () => {
    hostListeners.delete(onRequest);
    hostRendered = false;
    for (const id of [...entries.keys()]) forgetEntry(id);
    parking?.remove();
    parking = null;
  };
}

/** Solta as miniaturas de slides que não existem mais. */
export function prunePool(liveIds: Set<string>): void {
  for (const id of [...entries.keys()]) {
    if (!liveIds.has(id)) forgetEntry(id);
  }
}

/** Modo seguro: esquece os pedidos e devolve quais eram, para refazer depois. */
export function suspendPoolRequests(): string[] {
  const ids = [...requested];
  requested.clear();
  return ids;
}

export function usePooledReady(id: string): boolean {
  const [ready, setReadyState] = useState(() => entries.get(id)?.ready ?? false);
  useLayoutEffect(() => {
    const sync = () => setReadyState(entries.get(id)?.ready ?? false);
    sync();
    readyListeners.add(sync);
    return () => {
      readyListeners.delete(sync);
    };
  }, [id]);
  return ready;
}
