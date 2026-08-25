// Agenda a geração de miniaturas da tira lateral de slides por visibilidade
// real, via IntersectionObserver — sem cálculo manual de posição de rolagem.
//
// Dois observers COMPARTILHADOS (não um por miniatura) cobrem todos os
// elementos registrados dentro do mesmo container:
//   - "visible": interseção estrita (rootMargin 0) -> prioridade alta, gera já.
//   - "preload": interseção com rootMargin expandido -> prioridade média, para
//     a miniatura já estar pronta quando a pessoa rolar até lá.
// Um slide que sai de ambas as zonas antes de sua geração começar tem a
// prioridade rebaixada para "background" (ver demoteSlideThumbnailPriority),
// evitando fila de trabalho obsoleto numa rolagem rápida. O restante do deck
// (nunca observado porque a virtualização da lista nem chega a montar o nó)
// é preenchido à parte, em tempo ocioso, por useIdleSlidePrecompute.
import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { SlideItem } from "@/lib/slidesFlow";
import { demoteSlideThumbnailPriority, warmSlideThumbnail } from "@/components/pricing/SlidePreview";

const DEFAULT_PRELOAD_ROOT_MARGIN = "600px 0px";

export interface ThumbnailVisibilityScheduler {
  /**
   * Retorna um ref-callback estável para o slide informado. Passe o resultado
   * como `ref` do elemento raiz da miniatura na tira; o próprio callback
   * cuida de observar/desobservar quando o elemento monta, é substituído
   * (reordenação) ou desmonta (remoção do slide / saída da view).
   */
  getRefCallback: (item: SlideItem) => (element: HTMLElement | null) => void;
}

export function useThumbnailVisibilityScheduler(
  containerRef: RefObject<HTMLElement | null>,
  options?: { preloadRootMargin?: string; enabled?: boolean },
): ThumbnailVisibilityScheduler {
  const enabled = options?.enabled ?? true;
  const preloadRootMargin = options?.preloadRootMargin ?? DEFAULT_PRELOAD_ROOT_MARGIN;

  const itemsByIdRef = useRef(new Map<string, SlideItem>());
  const elementByIdRef = useRef(new Map<string, HTMLElement>());
  const idByElementRef = useRef(new Map<Element, string>());
  const visibleSetRef = useRef(new Set<Element>());
  const preloadSetRef = useRef(new Set<Element>());
  const observersRef = useRef<{ visible: IntersectionObserver; preload: IntersectionObserver } | null>(null);
  const refCallbacksRef = useRef(new Map<string, (element: HTMLElement | null) => void>());

  const applyPriorityForElement = useCallback((element: Element) => {
    const id = idByElementRef.current.get(element);
    if (!id) return;
    const item = itemsByIdRef.current.get(id);
    if (!item) return;
    if (visibleSetRef.current.has(element)) {
      void warmSlideThumbnail(item, { priority: "visible" });
    } else if (preloadSetRef.current.has(element)) {
      void warmSlideThumbnail(item, { priority: "preload" });
    } else {
      demoteSlideThumbnailPriority(item);
    }
  }, []);

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof IntersectionObserver === "undefined") {
      return undefined;
    }
    const root = containerRef.current ?? null;

    const onVisibleChange: IntersectionObserverCallback = (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visibleSetRef.current.add(entry.target);
        else visibleSetRef.current.delete(entry.target);
        applyPriorityForElement(entry.target);
      }
    };
    const onPreloadChange: IntersectionObserverCallback = (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) preloadSetRef.current.add(entry.target);
        else preloadSetRef.current.delete(entry.target);
        applyPriorityForElement(entry.target);
      }
    };

    const visible = new IntersectionObserver(onVisibleChange, { root, rootMargin: "0px" });
    const preload = new IntersectionObserver(onPreloadChange, { root, rootMargin: preloadRootMargin });
    observersRef.current = { visible, preload };

    // Elementos ja registrados antes deste efeito rodar (ex.: primeiro render).
    for (const element of idByElementRef.current.keys()) {
      visible.observe(element);
      preload.observe(element);
    }

    return () => {
      visible.disconnect();
      preload.disconnect();
      observersRef.current = null;
      visibleSetRef.current.clear();
      preloadSetRef.current.clear();
    };
  }, [containerRef, enabled, preloadRootMargin, applyPriorityForElement]);

  const getRefCallback = useCallback((item: SlideItem) => {
    itemsByIdRef.current.set(item.id, item);
    const existing = refCallbacksRef.current.get(item.id);
    if (existing) return existing;

    const callback = (element: HTMLElement | null) => {
      const previous = elementByIdRef.current.get(item.id);
      if (previous && previous !== element) {
        observersRef.current?.visible.unobserve(previous);
        observersRef.current?.preload.unobserve(previous);
        idByElementRef.current.delete(previous);
        visibleSetRef.current.delete(previous);
        preloadSetRef.current.delete(previous);
      }
      if (element) {
        elementByIdRef.current.set(item.id, element);
        idByElementRef.current.set(element, item.id);
        observersRef.current?.visible.observe(element);
        observersRef.current?.preload.observe(element);
      } else {
        elementByIdRef.current.delete(item.id);
        itemsByIdRef.current.delete(item.id);
        refCallbacksRef.current.delete(item.id);
      }
    };
    refCallbacksRef.current.set(item.id, callback);
    return callback;
  }, []);

  return { getRefCallback };
}
