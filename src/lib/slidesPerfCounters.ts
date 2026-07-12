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
  detailed?: boolean;
  maxEvents?: number;
  maxMeasures?: number;
};

declare global {
  interface Window {
    __OMNI_SLIDES_PERF__?: SlidePerfState;
    __OMNI_SLIDES_PERF_DETAILED__?: boolean;
  }
}

const DEFAULT_MAX_EVENTS = 200;
const DEFAULT_MAX_MEASURES = 200;

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

function isDetailedEnabled(perf: SlidePerfState): boolean {
  if (perf.detailed === true) return true;
  if (typeof window === "undefined") return false;
  return window.__OMNI_SLIDES_PERF_DETAILED__ === true;
}

function pushCircular<T>(target: T[], value: T, max: number): void {
  target.push(value);
  if (target.length > max) target.splice(0, target.length - max);
}

export function incrementSlidePerfCounter(name: string, id?: string): void {
  const perf = getPerfState();
  if (!perf) return;
  const counts = perf.counts ?? {};
  counts[name] = (counts[name] ?? 0) + 1;
  if (id) {
    const scoped = `${name}:${id}`;
    counts[scoped] = (counts[scoped] ?? 0) + 1;
  }
  perf.counts = counts;
}

export function recordSlideRender(name: string, id?: string): void {
  incrementSlidePerfCounter(name, id);
}

export function recordSlidePerfEvent(name: string, detail?: Record<string, unknown>, id?: string): void {
  if (typeof window === "undefined") return;
  const perf = getPerfState();
  if (!perf) return;
  incrementSlidePerfCounter(name, id);
  if (!isDetailedEnabled(perf)) return;
  const events = perf.events ?? [];
  pushCircular(events, { name, id, at: performance.now(), detail }, perf.maxEvents ?? DEFAULT_MAX_EVENTS);
  perf.events = events;
}

export function markSlidePerf(name: string): void {
  if (typeof performance === "undefined" || typeof performance.mark !== "function") return;
  const perf = getPerfState();
  if (!perf || !isDetailedEnabled(perf)) return;
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
  incrementSlidePerfCounter(name);
  if (!isDetailedEnabled(perf)) return;
  try {
    if (endMark) performance.measure(name, startMark, endMark);
    else performance.measure(name, startMark);
    const entries = performance.getEntriesByName(name, "measure");
    const latest = entries[entries.length - 1];
    if (latest) {
      const measures = perf.measures ?? [];
      pushCircular(
        measures,
        { name, duration: latest.duration, startTime: latest.startTime, detail },
        perf.maxMeasures ?? DEFAULT_MAX_MEASURES,
      );
      perf.measures = measures;
    }
  } catch {
    // Perf marks are diagnostic only; never affect the editor.
  }
}
