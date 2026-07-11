type SlidePerfEvent = {
  name: string;
  id?: string;
  at: number;
  detail?: Record<string, unknown>;
};

type SlidePerfState = {
  counts?: Record<string, number>;
  events?: SlidePerfEvent[];
  measures?: Array<{ name: string; duration: number; startTime: number; detail?: Record<string, unknown> }>;
};

declare global {
  interface Window {
    __OMNI_SLIDES_PERF__?: SlidePerfState;
  }
}

function isDevRuntime(): boolean {
  if (import.meta.env?.DEV) return true;
  if (typeof window === "undefined") return false;
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

function getPerfState(): SlidePerfState | null {
  if (typeof window === "undefined") return null;
  if (!window.__OMNI_SLIDES_PERF__ && isDevRuntime()) {
    try {
      window.__OMNI_SLIDES_PERF__ = { counts: {}, events: [], measures: [] };
    } catch {
      return null;
    }
  }
  return window.__OMNI_SLIDES_PERF__ ?? null;
}

export function recordSlideRender(name: string, id?: string, detail?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const perf = getPerfState();
  if (!perf) return;
  const counts = perf.counts ?? {};
  counts[name] = (counts[name] ?? 0) + 1;
  if (id) {
    const scoped = `${name}:${id}`;
    counts[scoped] = (counts[scoped] ?? 0) + 1;
  }
  perf.counts = counts;
  if (perf.events) {
    perf.events.push({ name, id, at: performance.now(), detail });
    if (perf.events.length > 50_000) perf.events.splice(0, perf.events.length - 50_000);
  }
}

export function recordSlidePerfEvent(name: string, detail?: Record<string, unknown>, id?: string): void {
  if (typeof window === "undefined") return;
  const perf = getPerfState();
  if (!perf?.events) return;
  perf.events.push({ name, id, at: performance.now(), detail });
  if (perf.events.length > 50_000) perf.events.splice(0, perf.events.length - 50_000);
}

export function markSlidePerf(name: string): void {
  if (typeof performance === "undefined" || typeof performance.mark !== "function") return;
  if (!getPerfState()) return;
  performance.mark(name);
}

export function measureSlidePerf(
  name: string,
  startMark: string,
  endMark?: string,
  detail?: Record<string, unknown>,
): void {
  if (typeof performance === "undefined" || typeof performance.measure !== "function") return;
  const perf = getPerfState();
  if (!perf) return;
  try {
    if (endMark) performance.measure(name, startMark, endMark);
    else performance.measure(name, startMark);
    const entries = performance.getEntriesByName(name, "measure");
    const latest = entries[entries.length - 1];
    if (latest) {
      const measures = perf.measures ?? [];
      measures.push({ name, duration: latest.duration, startTime: latest.startTime, detail });
      if (measures.length > 10_000) measures.splice(0, measures.length - 10_000);
      perf.measures = measures;
    }
  } catch {
    // Perf marks are diagnostic only; never affect the editor.
  }
}
