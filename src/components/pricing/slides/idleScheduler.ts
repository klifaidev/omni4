// Utilitários compartilhados para trabalho em segundo plano na aba Slides,
// pautado por requestIdleCallback (com fallback via setTimeout em ambientes
// sem suporte, ex.: Safari/jsdom). Garante que o preenchimento de fundo
// (miniaturas, dados de gráfico) nunca compita com interação ativa da pessoa.
import type { SlideItem } from "@/lib/slidesFlow";

export type IdleDeadlineLike = {
  didTimeout: boolean;
  timeRemaining: () => number;
};

export type IdleCallbackHandle = ReturnType<typeof setTimeout> | number;

type WindowWithIdleCallback = Window & {
  requestIdleCallback?: (callback: (deadline: IdleDeadlineLike) => void, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function scheduleIdle(callback: (deadline: IdleDeadlineLike) => void): IdleCallbackHandle {
  if (typeof window === "undefined") return setTimeout(() => callback({ didTimeout: true, timeRemaining: () => 0 }), 1);
  const win = window as WindowWithIdleCallback;
  if (typeof win.requestIdleCallback === "function") {
    return win.requestIdleCallback(callback, { timeout: 1200 });
  }
  return window.setTimeout(() => callback({ didTimeout: true, timeRemaining: () => 8 }), 80);
}

export function cancelIdle(handle: IdleCallbackHandle): void {
  if (typeof window === "undefined") return;
  const win = window as WindowWithIdleCallback;
  if (typeof win.cancelIdleCallback === "function" && typeof handle === "number") {
    win.cancelIdleCallback(handle);
    return;
  }
  window.clearTimeout(handle);
}

/** Ordena o deck inteiro por distância ao slide selecionado (o mais próximo primeiro). */
export function itemsByDistanceFromSelection(items: SlideItem[], selectedId: string | null): SlideItem[] {
  const selectedIndex = selectedId ? items.findIndex((item) => item.id === selectedId) : 0;
  const origin = selectedIndex >= 0 ? selectedIndex : 0;
  const indexById = new Map(items.map((item, index) => [item.id, index]));
  return [...items].sort((a, b) => {
    const ia = indexById.get(a.id) ?? 0;
    const ib = indexById.get(b.id) ?? 0;
    const da = Math.abs(ia - origin);
    const db = Math.abs(ib - origin);
    if (da !== db) return da - db;
    return ia - ib;
  });
}
