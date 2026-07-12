import { beforeEach, describe, expect, it } from "vitest";
import {
  incrementSlidePerfCounter,
  recordSlidePerfEvent,
  recordSlideRender,
} from "./slidesPerfCounters";

declare global {
  interface Window {
    __OMNI_SLIDES_PERF__?: {
      counts?: Record<string, number>;
      events?: Array<{ name: string }>;
      measures?: Array<unknown>;
      detailed?: boolean;
    };
    __OMNI_SLIDES_PERF_ENABLED__?: boolean;
    __OMNI_SLIDES_PERF_DETAILED__?: boolean;
  }
}

describe("slidesPerfCounters", () => {
  beforeEach(() => {
    delete window.__OMNI_SLIDES_PERF__;
    delete window.__OMNI_SLIDES_PERF_ENABLED__;
    delete window.__OMNI_SLIDES_PERF_DETAILED__;
  });

  it("does not initialize or count anything unless explicitly enabled", () => {
    recordSlideRender("ChartCanvas", "block-1");
    recordSlidePerfEvent("slides.chartCanvas.mount", { blockId: "block-1" });
    incrementSlidePerfCounter("SlideThumbnail:hit", "slide-1");

    expect(window.__OMNI_SLIDES_PERF__).toBeUndefined();
  });

  it("records only numeric counters by default when enabled", () => {
    window.__OMNI_SLIDES_PERF_ENABLED__ = true;

    recordSlideRender("ChartCanvas", "block-1");
    recordSlidePerfEvent("slides.chartCanvas.mount", { blockId: "block-1" });

    expect(window.__OMNI_SLIDES_PERF__?.counts).toMatchObject({
      ChartCanvas: 1,
      "ChartCanvas:block-1": 1,
      "slides.chartCanvas.mount": 1,
    });
    expect(window.__OMNI_SLIDES_PERF__?.events).toEqual([]);
  });

  it("records detailed events only when the detailed flag is enabled too", () => {
    window.__OMNI_SLIDES_PERF_ENABLED__ = true;
    window.__OMNI_SLIDES_PERF_DETAILED__ = true;

    recordSlidePerfEvent("slides.chartCanvas.mount", { blockId: "block-1" });

    expect(window.__OMNI_SLIDES_PERF__?.events).toHaveLength(1);
    expect(window.__OMNI_SLIDES_PERF__?.events?.[0].name).toBe("slides.chartCanvas.mount");
  });
});
