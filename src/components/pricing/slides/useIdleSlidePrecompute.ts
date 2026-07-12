import { useEffect, useMemo, useRef } from "react";
import type { SlideItem } from "@/lib/slidesFlow";
import { warmSlideThumbnail } from "@/components/pricing/SlidePreview";
import { incrementSlidePerfCounter } from "@/lib/slidesPerfCounters";

type IdleDeadlineLike = {
  didTimeout: boolean;
  timeRemaining: () => number;
};

type IdleCallbackHandle = ReturnType<typeof setTimeout> | number;

type WindowWithIdleCallback = Window & {
  requestIdleCallback?: (callback: (deadline: IdleDeadlineLike) => void, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function scheduleIdle(callback: (deadline: IdleDeadlineLike) => void): IdleCallbackHandle {
  if (typeof window === "undefined") return setTimeout(() => callback({ didTimeout: true, timeRemaining: () => 0 }), 1);
  const win = window as WindowWithIdleCallback;
  if (typeof win.requestIdleCallback === "function") {
    return win.requestIdleCallback(callback, { timeout: 1200 });
  }
  return window.setTimeout(() => callback({ didTimeout: true, timeRemaining: () => 8 }), 80);
}

function cancelIdle(handle: IdleCallbackHandle): void {
  if (typeof window === "undefined") return;
  const win = window as WindowWithIdleCallback;
  if (typeof win.cancelIdleCallback === "function" && typeof handle === "number") {
    win.cancelIdleCallback(handle);
    return;
  }
  window.clearTimeout(handle);
}

function orderedByDistance(items: SlideItem[], selectedId: string | null): SlideItem[] {
  const selectedIndex = selectedId ? items.findIndex((item) => item.id === selectedId) : 0;
  const origin = selectedIndex >= 0 ? selectedIndex : 0;
  return [...items].sort((a, b) => {
    const ia = items.findIndex((item) => item.id === a.id);
    const ib = items.findIndex((item) => item.id === b.id);
    const da = Math.abs(ia - origin);
    const db = Math.abs(ib - origin);
    if (da !== db) return da - db;
    return ia - ib;
  });
}

function recordIdleMetric(name: string, id?: string): void {
  incrementSlidePerfCounter(name, id);
}

export function useIdleSlidePrecompute(items: SlideItem[], selectedId: string | null): void {
  const generationRef = useRef(0);
  const runningRef = useRef(false);
  const ordered = useMemo(() => orderedByDistance(items, selectedId), [items, selectedId]);

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
