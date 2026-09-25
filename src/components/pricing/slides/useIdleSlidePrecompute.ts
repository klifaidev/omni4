import { useEffect, useMemo, useRef } from "react";
import type { SlideItem } from "@/lib/slidesFlow";
import { warmSlideThumbnail } from "@/components/pricing/SlidePreview";
import { incrementSlidePerfCounter, isSlidePerfEnabled } from "@/lib/slidesPerfCounters";
import { cancelIdle, itemsByDistanceFromSelection, scheduleIdle, type IdleCallbackHandle, type IdleDeadlineLike } from "./idleScheduler";

function recordIdleMetric(name: string, id?: string): void {
  if (!isSlidePerfEnabled()) return;
  incrementSlidePerfCounter(name, id);
}

/**
 * Preenche as miniaturas do deck inteiro em segundo plano, do slide mais
 * próximo da seleção atual para o mais distante, usando requestIdleCallback.
 * Roda com prioridade "background" (padrão de warmSlideThumbnail): itens já
 * gerados via IntersectionObserver da tira (visible/preload) resolvem em
 * "hit" e não custam trabalho extra; este hook garante que, mesmo sem a
 * pessoa rolar até lá, o resto do deck fique pronto quando o navegador tiver
 * tempo ocioso real — nunca competindo com rolagem, clique ou edição.
 */
export function useIdleSlidePrecompute(items: SlideItem[], selectedId: string | null): void {
  const generationRef = useRef(0);
  const runningRef = useRef(false);
  // Memoiza pela assinatura de ids (não por `items`): o array inteiro ganha
  // uma referência nova a cada edição de QUALQUER slide, o que reiniciaria
  // esta fila (e o requestIdleCallback pendente) a cada tecla digitada. Só a
  // ordem/composição do deck deve reiniciar a fila — o conteúdo de um slide
  // sendo editado, não. O slide selecionado é excluído: sua miniatura usa o
  // preview ao vivo (ver ScaledPreview/liveEditingActive) enquanto ativo, e
  // pré-computá-lo aqui só re-capturava via html2canvas o slide em edição.
  const itemIdsSignature = useMemo(() => items.map((item) => item.id).join("|"), [items]);
  const ordered = useMemo(
    () => itemsByDistanceFromSelection(items, selectedId).filter((item) => item.id !== selectedId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itemIdsSignature, selectedId],
  );

  useEffect(() => {
    if (typeof window === "undefined" || ordered.length === 0) return undefined;

    generationRef.current += 1;
    const generation = generationRef.current;
    const queue = [...ordered];
    let handle: IdleCallbackHandle | null = null;
    let cancelled = false;

    const runNext = (deadline: IdleDeadlineLike) => {
      if (cancelled || generation !== generationRef.current) return;
      if (runningRef.current) {
        handle = scheduleIdle(runNext);
        return;
      }
      if (!deadline.didTimeout && deadline.timeRemaining() < 8) {
        handle = scheduleIdle(runNext);
        return;
      }

      const item = queue.shift();
      if (!item) return;

      runningRef.current = true;
      recordIdleMetric("SlidePrecompute:start", item.id);
      warmSlideThumbnail(item)
        .then((result) => {
          recordIdleMetric(`SlidePrecompute:${result}`, item.id);
        })
        .catch(() => {
          recordIdleMetric("SlidePrecompute:error", item.id);
        })
        .finally(() => {
          runningRef.current = false;
          if (!cancelled && generation === generationRef.current && queue.length > 0) {
            handle = scheduleIdle(runNext);
          }
        });
    };

    handle = scheduleIdle(runNext);

    return () => {
      cancelled = true;
      if (handle !== null) cancelIdle(handle);
    };
  }, [ordered]);
}
