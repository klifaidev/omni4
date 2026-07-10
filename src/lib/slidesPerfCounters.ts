type SlidePerfEvent = {
  name: string;
  id?: string;
  at: number;
};

type SlidePerfState = {
  counts?: Record<string, number>;
  events?: SlidePerfEvent[];
};

declare global {
  interface Window {
    __OMNI_SLIDES_PERF__?: SlidePerfState;
  }
}

export function recordSlideRender(name: string, id?: string): void {
  if (typeof window === "undefined") return;
  const perf = window.__OMNI_SLIDES_PERF__;
  if (!perf) return;
  const counts = perf.counts ?? {};
  counts[name] = (counts[name] ?? 0) + 1;
  if (id) {
    const scoped = `${name}:${id}`;
    counts[scoped] = (counts[scoped] ?? 0) + 1;
  }
  perf.counts = counts;
  if (perf.events) {
    perf.events.push({ name, id, at: performance.now() });
    if (perf.events.length > 50_000) perf.events.splice(0, perf.events.length - 50_000);
  }
}
