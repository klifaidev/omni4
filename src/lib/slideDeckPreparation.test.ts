import { afterEach, describe, expect, it } from "vitest";
import type { ChartBlock } from "@/lib/customSlide";
import type { SlideItem } from "@/lib/slidesFlow";
import type { PricingRow } from "@/lib/types";
import { usePricing } from "@/store/pricing";
import { clearSlideCalcCache, getCachedRowsSignature, getOrComputeSlideCalc } from "./slideCalcCache";
import { computeChartSeries } from "./customKpi";
import { warmSlideChartData, warmSpeculativeChartPaletteData } from "./slideDeckPreparation";

const rows = [
  { periodo: "001.2026", mes: 1, ano: 2026, marca: "A", canal: "Direto", rol: 100, contribMarginal: 25, volumeKg: 10 },
  { periodo: "002.2026", mes: 2, ano: 2026, marca: "A", canal: "Direto", rol: 120, contribMarginal: 30, volumeKg: 12 },
  { periodo: "001.2026", mes: 1, ano: 2026, marca: "B", canal: "Indireto", rol: 80, contribMarginal: 16, volumeKg: 8 },
] as PricingRow[];

function chartBlock(): ChartBlock {
  return {
    id: "chart-1",
    kind: "chart",
    x: 0,
    y: 0,
    w: 600,
    h: 320,
    z: 1,
    chartType: "line",
    measure: "cm",
    breakdown: "marca",
    showGrid: true,
    showLegend: true,
    showLabels: false,
    filters: {},
    dataSource: "ke30",
  };
}

function slideWithChart(block = chartBlock()): SlideItem {
  return slideWithCharts([block]);
}

function slideWithCharts(blocks: ChartBlock[]): SlideItem {
  return {
    id: "slide-1",
    kind: "custom",
    label: "Slide com grafico",
    config: {
      background: "FFFFFF",
      blocks,
    },
  };
}

describe("slideDeckPreparation", () => {
  afterEach(() => {
    clearSlideCalcCache();
    usePricing.setState({ rows: [], metric: "cm" });
    window.__OMNI_SLIDES_PERF_ENABLED__ = false;
    window.__OMNI_SLIDES_PERF__ = undefined;
  });

  it("warms ChartCanvas and ChartInspector cache entries for chart blocks", async () => {
    const block = chartBlock();
    usePricing.setState({ rows, metric: "cm" });

    await warmSlideChartData(slideWithChart(block));

    let chartSeriesCalls = 0;
    const dataSignature = getCachedRowsSignature(rows);
    const chartSeries = getOrComputeSlideCalc({
      op: "chart-series",
      slideId: "slide-1",
      blockId: block.id,
      shareAcrossBlocks: true,
      dataSource: block.dataSource,
      dataSignature,
      params: { filters: block.filters, measure: "cm", seriesDim: "marca", xDim: null },
    }, () => {
      chartSeriesCalls += 1;
      return computeChartSeries(rows, block.filters, "cm", "marca", null);
    });

    let inspectorCalls = 0;
    const inspectorSeries = getOrComputeSlideCalc({
      op: "chart-inspector-series",
      blockId: block.id,
      shareAcrossBlocks: true,
      dataSource: block.dataSource,
      dataSignature,
      params: { filters: block.filters, measure: block.measure, breakdown: block.breakdown },
    }, () => {
      inspectorCalls += 1;
      return computeChartSeries(rows, block.filters, block.measure, block.breakdown);
    });

    expect(chartSeriesCalls).toBe(0);
    expect(inspectorCalls).toBe(0);
    expect(chartSeries.series.map((series) => series.name)).toEqual(["A", "B"]);
    expect(inspectorSeries.series.map((series) => series.name)).toEqual(["A", "B"]);
  });

  it("turns first ChartCanvas/Inspector reads from miss to hit after preparation", async () => {
    const block = chartBlock();
    usePricing.setState({ rows, metric: "cm" });
    window.__OMNI_SLIDES_PERF_ENABLED__ = true;
    window.__OMNI_SLIDES_PERF__ = { counts: {}, events: [], measures: [] };
    const dataSignature = getCachedRowsSignature(rows);

    getOrComputeSlideCalc({
      op: "chart-series",
      slideId: "slide-1",
      blockId: block.id,
      shareAcrossBlocks: true,
      dataSource: block.dataSource,
      dataSignature,
      params: { filters: block.filters, measure: "cm", seriesDim: "marca", xDim: null },
    }, () => computeChartSeries(rows, block.filters, "cm", "marca", null));
    expect(window.__OMNI_SLIDES_PERF__?.counts?.["SlideCalcCache:chart-series:miss"]).toBe(1);

    clearSlideCalcCache();
    window.__OMNI_SLIDES_PERF__ = { counts: {}, events: [], measures: [] };
    await warmSlideChartData(slideWithChart(block));

    getOrComputeSlideCalc({
      op: "chart-series",
      slideId: "slide-1",
      blockId: block.id,
      shareAcrossBlocks: true,
      dataSource: block.dataSource,
      dataSignature: getCachedRowsSignature(rows),
      params: { filters: block.filters, measure: "cm", seriesDim: "marca", xDim: null },
    }, () => computeChartSeries(rows, block.filters, "cm", "marca", null));
    getOrComputeSlideCalc({
      op: "chart-inspector-series",
      blockId: block.id,
      shareAcrossBlocks: true,
      dataSource: block.dataSource,
      dataSignature: getCachedRowsSignature(rows),
      params: { filters: block.filters, measure: block.measure, breakdown: block.breakdown },
    }, () => computeChartSeries(rows, block.filters, block.measure, block.breakdown));

    const counts = window.__OMNI_SLIDES_PERF__?.counts ?? {};
    expect(counts["SlideCalcCache:chart-series:hit"]).toBe(1);
    expect(counts["SlideCalcCache:chart-inspector-series:hit"]).toBe(1);
  });

  it("can limit how many chart blocks are warmed in one preparation pass", async () => {
    usePricing.setState({ rows, metric: "cm" });
    const first = chartBlock();
    const second = { ...chartBlock(), id: "chart-2", measure: "rol" as const };

    const warmed = await warmSlideChartData(slideWithCharts([first, second]), { maxBlocks: 1 });

    expect(warmed).toBeGreaterThan(0);

    const dataSignature = getCachedRowsSignature(rows);
    let firstCalls = 0;
    getOrComputeSlideCalc({
      op: "chart-series",
      slideId: "slide-1",
      blockId: first.id,
      shareAcrossBlocks: true,
      dataSource: first.dataSource,
      dataSignature,
      params: { filters: first.filters, measure: "cm", seriesDim: "marca", xDim: null },
    }, () => {
      firstCalls += 1;
      return computeChartSeries(rows, first.filters, "cm", "marca", null);
    });

    let secondCalls = 0;
    getOrComputeSlideCalc({
      op: "chart-series",
      slideId: "slide-1",
      blockId: second.id,
      shareAcrossBlocks: true,
      dataSource: second.dataSource,
      dataSignature,
      params: { filters: second.filters, measure: "rol", seriesDim: "marca", xDim: null },
    }, () => {
      secondCalls += 1;
      return computeChartSeries(rows, second.filters, "rol", "marca", null);
    });

    expect(firstCalls).toBe(0);
    expect(secondCalls).toBe(1);
  });

  it("warms speculative chart palette data without requiring the future block id", async () => {
    usePricing.setState({ rows, metric: "cm" });

    await warmSpeculativeChartPaletteData({ slideId: "slide-1", maxCharts: 1 });

    const dataSignature = getCachedRowsSignature(rows);
    let calls = 0;
    getOrComputeSlideCalc({
      op: "chart-series",
      slideId: "slide-1",
      blockId: "future-chart-id",
      shareAcrossBlocks: true,
      dataSource: "ke30",
      dataSignature,
      params: { filters: {}, measure: "cm", seriesDim: null, xDim: null },
    }, () => {
      calls += 1;
      return computeChartSeries(rows, {}, "cm", null, null);
    });

    expect(calls).toBe(0);
  });
});
