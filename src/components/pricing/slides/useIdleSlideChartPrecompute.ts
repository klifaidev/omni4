import { useEffect, useMemo, useRef } from "react";
import type { SlideItem } from "@/lib/slidesFlow";
import { warmSlideChartData } from "@/lib/slideDeckPreparation";
import { incrementSlidePerfCounter, isSlidePerfEnabled } from "@/lib/slidesPerfCounters";
import { cancelIdle, itemsByDistanceFromSelection, scheduleIdle, type IdleCallbackHandle, type IdleDeadlineLike } from "./idleScheduler";

const CHART_PRECOMPUTE_MAX_BLOCKS_PER_SLIDE = 2;
const CHART_PRECOMPUTE_MAX_BLOCKS_TOTAL = 40;

function recordIdleMetric(name: string, id?: string): void {
  if (!isSlidePerfEnabled()) return;
  incrementSlidePerfCounter(name, id);
}

/**
 * Aquece o cache de dados de gráfico (warmSlideChartData) do deck inteiro em
 * segundo plano, do slide mais próximo da seleção atual para o mais distante,
 * usando requestIdleCallback. Deliberadamente separado do agendamento de
 * miniaturas (useIdleSlidePrecompute / IntersectionObserver da tira): são
 * cargas de trabalho diferentes (cálculo de série vs. captura de DOM) e
 * misturar as filas dificultaria raciocinar sobre prioridade e cancelamento
 * de cada uma.
 */
export function useIdleSlideChartPrecompute(items: SlideItem[], selectedId: string | null): void {
  const generationRef = useRef(0);
  const runningRef = useRef(false);
  const ordered = useMemo(() => itemsByDistanceFromSelection(items, selectedId), [items, selectedId]);

  useEffect(() => {
    if (typeof window === "undefined" || ordered.length === 0) return undefined;

    generationRef.current += 1;
    const generation = generationRef.current;
    const queue = [...ordered];
    let warmedBlocks = 0;
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
      if (warmedBlocks >= CHART_PRECOMPUTE_MAX_BLOCKS_TOTAL) return;

      const item = queue.shift();
      if (!item) return;

      runningRef.current = true;
      recordIdleMetric("SlideChartPrecompute:start", item.id);
      const remainingBudget = Math.max(0, CHART_PRECOMPUTE_MAX_BLOCKS_TOTAL - warmedBlocks);
      warmSlideChartData(item, { maxBlocks: Math.min(CHART_PRECOMPUTE_MAX_BLOCKS_PER_SLIDE, remainingBudget) })
        .then((warmed) => {
          warmedBlocks += warmed;
          recordIdleMetric("SlideChartPrecompute:done", item.id);
        })
        .catch(() => {
          recordIdleMetric("SlideChartPrecompute:error", item.id);
        })
        .finally(() => {
          runningRef.current = false;
          if (!cancelled && generation === generationRef.current && queue.length > 0 && warmedBlocks < CHART_PRECOMPUTE_MAX_BLOCKS_TOTAL) {
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
