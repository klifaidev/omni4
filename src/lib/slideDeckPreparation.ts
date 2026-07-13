import type { ChartBlock, KpiMeasureId } from "@/lib/customSlide";
import type { SlideItem } from "@/lib/slidesFlow";
import { isMeasureAvailable } from "@/lib/customSlide";
import { computeChartSeries, computeTopRanking } from "@/lib/customKpi";
import { useBudget } from "@/store/budget";
import { useForecast } from "@/store/forecast";
import { usePricing } from "@/store/pricing";
import { useRolling } from "@/store/rolling";
import { budgetRowsAsPricingFiltered } from "@/lib/budgetAdapter";
import { forecastRowsAsPricingLatest } from "@/lib/forecastAdapter";
import { rollingRowsAsPricing } from "@/lib/rollingAdapter";
import { getCachedRowsSignature, getOrComputeSlideCalc, type SlideCalcCacheKeyInput } from "@/lib/slideCalcCache";
import { computeChartSeriesAsync, computeTopRankingAsync } from "@/lib/slideCalcWorkerClient";
import { ensureChartStyle } from "@/components/pricing/custom/chart/types";
import type { PricingRow } from "@/lib/types";

const RANKING_CHART_TYPES = ["pie", "donut", "bubble", "scatter", "funnel", "treemap"] as const;

function fallbackMeasureForSource(dataSource: ChartBlock["dataSource"]): KpiMeasureId {
  return dataSource === "forecast" ? "volume" : "rol";
}

function safeMeasureForSource(
  measure: KpiMeasureId | null | undefined,
  dataSource: ChartBlock["dataSource"],
): KpiMeasureId | undefined {
  if (!measure) return undefined;
  return isMeasureAvailable(measure, dataSource) ? measure : undefined;
}

function rowsForDataSource(dataSource: ChartBlock["dataSource"]): PricingRow[] {
  if (dataSource === "budget") return budgetRowsAsPricingFiltered(useBudget.getState().rows, "budget");
  if (dataSource === "budget_real") return budgetRowsAsPricingFiltered(useBudget.getState().rows, "real");
  if (dataSource === "forecast") return forecastRowsAsPricingLatest(useForecast.getState().rows);
  if (dataSource === "rolling") return rollingRowsAsPricing(useRolling.getState().rows);
  return usePricing.getState().rows;
}

async function warmChartSeriesCache(input: SlideCalcCacheKeyInput, rows: PricingRow[], block: ChartBlock, measure: KpiMeasureId, breakdown: string | null, xDim?: string | null) {
  await computeChartSeriesAsync({
    cache: input,
    rows,
    filters: block.filters,
    measure,
    breakdown,
    xDim,
  });
}

async function warmChartRankingCache(input: SlideCalcCacheKeyInput, rows: PricingRow[], block: ChartBlock, dim: string, measure: KpiMeasureId) {
  await computeTopRankingAsync({
    cache: input,
    rows,
    filters: block.filters,
    dim,
    measure,
    topN: 50,
    periodMode: "all",
    periodValue: null,
  });
}

export async function warmSlideChartData(item: SlideItem, options?: { onBlock?: () => Promise<void> | void }): Promise<number> {
  if (item.kind !== "custom") return 0;
  const chartBlocks = item.config.blocks.filter((block): block is ChartBlock => block.kind === "chart" && !block.hidden);
  let warmed = 0;

  for (const block of chartBlocks) {
    const style = ensureChartStyle(block.style);
    const xDim = block.fieldWells?.xDim ?? null;
    const seriesDim = block.fieldWells?.colorDim ?? block.breakdown ?? null;
    const effectiveMeasure = safeMeasureForSource(block.measure, block.dataSource) ?? fallbackMeasureForSource(block.dataSource);
    const safeMeasureLine = safeMeasureForSource(style.measureLine, block.dataSource);
    const safeMeasureX = safeMeasureForSource(style.measureX, block.dataSource);
    const safeMeasureY = safeMeasureForSource(style.measureY, block.dataSource);
    const safeTooltipMeasure = safeMeasureForSource(block.fieldWells?.tooltipMeasure ?? undefined, block.dataSource);
    const rows = rowsForDataSource(block.dataSource);
    const dataSignature = getCachedRowsSignature(rows);

    if (block.chartType === "combo" && block.comboSeries?.length) {
      for (const series of block.comboSeries) {
        const measure = safeMeasureForSource(series.measure, series.dataSource);
        if (!measure) continue;
        const sourceRows = rowsForDataSource(series.dataSource);
        await warmChartSeriesCache({
          op: "chart-series",
          slideId: item.id,
          blockId: block.id,
          dataSource: series.dataSource,
          dataSignature: getCachedRowsSignature(sourceRows),
          params: { filters: block.filters, measure, breakdown: null, xDim, comboSeriesName: series.name },
        }, sourceRows, block, measure, null, xDim);
        warmed += 1;
      }
    } else {
      await warmChartSeriesCache({
        op: "chart-series",
        slideId: item.id,
        blockId: block.id,
        dataSource: block.dataSource,
        dataSignature,
        params: { filters: block.filters, measure: effectiveMeasure, seriesDim, xDim },
      }, rows, block, effectiveMeasure, seriesDim, xDim);
      warmed += 1;
    }

    getOrComputeSlideCalc({
      op: "chart-inspector-series",
      blockId: block.id,
      dataSource: block.dataSource,
      dataSignature,
      params: { filters: block.filters, measure: block.measure, breakdown: block.breakdown },
    }, () => computeChartSeries(rows, block.filters, block.measure, block.breakdown));
    warmed += 1;

    if (safeTooltipMeasure) {
      getOrComputeSlideCalc({
        op: "chart-tooltip-extra",
        slideId: item.id,
        blockId: block.id,
        dataSource: block.dataSource,
        dataSignature,
        params: { filters: block.filters, measure: safeTooltipMeasure, xDim },
      }, () => computeChartSeries(rows, block.filters, safeTooltipMeasure, null, xDim));
      warmed += 1;
    }

    if (block.chartType === "combo" && safeMeasureLine) {
      getOrComputeSlideCalc({
        op: "chart-line-series",
        slideId: item.id,
        blockId: block.id,
        dataSource: block.dataSource,
        dataSignature,
        params: { filters: block.filters, measure: safeMeasureLine, seriesDim },
      }, () => computeChartSeries(rows, block.filters, safeMeasureLine, seriesDim));
      warmed += 1;
    }

    const isRankingChart = RANKING_CHART_TYPES.includes(block.chartType as typeof RANKING_CHART_TYPES[number]);
    if (isRankingChart) {
      const dim = seriesDim ?? "marca";
      await warmChartRankingCache({
        op: "chart-ranking",
        slideId: item.id,
        blockId: block.id,
        dataSource: block.dataSource,
        dataSignature,
        params: { filters: block.filters, dim, measure: effectiveMeasure, chartType: block.chartType },
      }, rows, block, dim, effectiveMeasure);
      warmed += 1;

      if (["pie", "donut", "funnel", "treemap"].includes(block.chartType)) {
        const rankingBreakdown = block.breakdown ?? "marca";
        getOrComputeSlideCalc({
          op: "chart-inspector-ranking",
          blockId: block.id,
          dataSource: block.dataSource,
          dataSignature,
          params: { filters: block.filters, breakdown: rankingBreakdown, measure: block.measure, topN: 50, mode: "all" },
        }, () => computeTopRanking(rows, block.filters, rankingBreakdown, block.measure, 50, "all", null));
        warmed += 1;
      }
    }

    if ((block.chartType === "bubble" || block.chartType === "scatter") && (safeMeasureX || safeMeasureY)) {
      const dim = seriesDim ?? "marca";
      if (safeMeasureX) {
        getOrComputeSlideCalc({
          op: "chart-scatter-axis-ranking",
          slideId: item.id,
          blockId: block.id,
          dataSource: block.dataSource,
          dataSignature,
          params: { filters: block.filters, dim, measure: safeMeasureX, axis: "x" },
        }, () => computeTopRanking(rows, block.filters, dim, safeMeasureX, 50, "all", null));
        warmed += 1;
      }
      if (safeMeasureY) {
        getOrComputeSlideCalc({
          op: "chart-scatter-axis-ranking",
          slideId: item.id,
          blockId: block.id,
          dataSource: block.dataSource,
          dataSignature,
          params: { filters: block.filters, dim, measure: safeMeasureY, axis: "y" },
        }, () => computeTopRanking(rows, block.filters, dim, safeMeasureY, 50, "all", null));
        warmed += 1;
      }
    }
    await options?.onBlock?.();
  }

  return warmed;
}
