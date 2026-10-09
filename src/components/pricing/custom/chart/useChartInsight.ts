// Resumo automático de um gráfico (lib/chartInsight) com os MESMOS números
// que o ChartCanvas desenha: mesma base, mesmo filtro (inclusive o Filtro
// Global), mesma medida e mesma chave de cache — quando o gráfico já
// calculou, o resumo só lê o cache, sem refazer a conta.
//
// O filtro cruzado da apresentação (clicar numa barra) fica de fora de
// propósito: o resumo descreve o gráfico como ele foi montado.

import { useEffect, useMemo, useState } from "react";
import type { ChartBlock, KpiMeasureId } from "@/lib/customSlide";
import { isMeasureAvailable, resolveEffectiveBlock } from "@/lib/customSlide";
import { useDeckBudgetRows, useDeckPricingRows } from "@/hooks/useDeckRows";
import { useCustomTables } from "@/store/customTables";
import { useSlidesFlow } from "@/store/slidesFlow";
import { budgetRowsAsPricingFiltered } from "@/lib/budgetAdapter";
import { buildCustomTableChartData } from "@/lib/customTableChartData";
import { getCachedRowsSignature, getSlideCalcCacheValue, type SlideCalcCacheKeyInput } from "@/lib/slideCalcCache";
import {
  computeChartSeriesAsync,
  computeTopRankingAsync,
  type ChartSeriesResult,
  type TopRankingResult,
} from "@/lib/slideCalcWorkerClient";
import { buildChartInsight, type ChartInsightInput } from "@/lib/chartInsight";

/** Mesmos tipos que o ChartCanvas desenha a partir do ranking. */
const RANKING_TYPES = new Set(["pie", "donut", "bubble", "scatter", "funnel", "treemap"]);
/** Tipos cujo desenho não vem da série/ranking — sem resumo por enquanto. */
const UNSUPPORTED_TYPES = new Set(["waterfall", "mapaBrasil", "boxplot", "histogram"]);

export type ChartInsightState =
  | { status: "ready"; text: string }
  | { status: "loading" }
  | { status: "unsupported" };

type Plan =
  | { kind: "none" }
  | { kind: "custom"; input: ChartInsightInput; measure: null }
  | { kind: "series"; cache: SlideCalcCacheKeyInput; run: () => Promise<ChartSeriesResult>; isTime: boolean; measure: KpiMeasureId }
  | { kind: "ranking"; cache: SlideCalcCacheKeyInput; run: () => Promise<TopRankingResult>; measure: KpiMeasureId };

export function useChartInsight(rawChart: ChartBlock | null, cacheSlideId?: string): ChartInsightState {
  const globalFilters = useSlidesFlow((s) => s.globalFilters);
  const pricing = useDeckPricingRows();
  const budget = useDeckBudgetRows();
  const customTables = useCustomTables((s) => s.tables);

  const plan = useMemo<Plan>(() => {
    if (!rawChart) return { kind: "none" };
    const chart = resolveEffectiveBlock(rawChart as never, globalFilters) as ChartBlock;
    if (UNSUPPORTED_TYPES.has(chart.chartType)) return { kind: "none" };
    if (chart.chartType === "combo" && chart.comboSeries?.length) return { kind: "none" };
    const isRanking = RANKING_TYPES.has(chart.chartType);

    if (chart.dataSource === "personalizado") {
      const table = customTables.find((t) => t.id === chart.customTableId) ?? customTables[0] ?? null;
      const data = buildCustomTableChartData(table, chart);
      const input: ChartInsightInput = isRanking
        ? { kind: "ranking", items: data.ranking }
        : { kind: "series", periodos: data.periodos, series: data.series, isTime: false };
      return { kind: "custom", input, measure: null };
    }

    const measure: KpiMeasureId = chart.measure && isMeasureAvailable(chart.measure, chart.dataSource)
      ? chart.measure
      : "rol";
    const rows = chart.dataSource === "budget"
      ? budgetRowsAsPricingFiltered(budget, "budget")
      : chart.dataSource === "budget_real"
        ? budgetRowsAsPricingFiltered(budget, "real")
        : pricing;
    const xDim = chart.fieldWells?.xDim ?? null;
    const seriesDim = chart.fieldWells?.colorDim ?? chart.breakdown;
    const dataSignature = getCachedRowsSignature(rows);

    if (isRanking) {
      const dim = seriesDim ?? "marca";
      const cache: SlideCalcCacheKeyInput = {
        op: "chart-ranking", slideId: cacheSlideId, blockId: chart.id, shareAcrossBlocks: true,
        dataSource: chart.dataSource, dataSignature,
        params: { filters: chart.filters, dim, measure, chartType: chart.chartType },
      };
      return {
        kind: "ranking", cache, measure,
        run: () => computeTopRankingAsync({
          cache, rows, filters: chart.filters, dim, measure, topN: 50, periodMode: "all", periodValue: null,
        }),
      };
    }
    const cache: SlideCalcCacheKeyInput = {
      op: "chart-series", slideId: cacheSlideId, blockId: chart.id, shareAcrossBlocks: true,
      dataSource: chart.dataSource, dataSignature,
      params: { filters: chart.filters, measure, seriesDim, xDim },
    };
    return {
      kind: "series", cache, measure, isTime: !xDim || xDim === "period",
      run: () => computeChartSeriesAsync({ cache, rows, filters: chart.filters, measure, breakdown: seriesDim, xDim }),
    };
  }, [rawChart, globalFilters, pricing, budget, customTables, cacheSlideId]);

  const toInput = (p: Plan, value: ChartSeriesResult | TopRankingResult): ChartInsightInput =>
    p.kind === "ranking"
      ? { kind: "ranking", items: value as TopRankingResult }
      : { kind: "series", ...(value as ChartSeriesResult), isTime: p.kind === "series" ? p.isTime : false };

  const peek = (p: Plan): ChartInsightState | null => {
    if (p.kind === "none") return { status: "unsupported" };
    if (p.kind === "custom") return { status: "ready", text: buildChartInsight(p.input, { measure: null }) };
    const cached = getSlideCalcCacheValue<ChartSeriesResult | TopRankingResult>(p.cache);
    return cached === undefined ? null : { status: "ready", text: buildChartInsight(toInput(p, cached), { measure: p.measure }) };
  };

  const [state, setState] = useState<ChartInsightState>(() => peek(plan) ?? { status: "loading" });

  useEffect(() => {
    const now = peek(plan);
    if (now) { setState(now); return; }
    if (plan.kind !== "series" && plan.kind !== "ranking") return;
    let cancelled = false;
    setState((prev) => (prev.status === "ready" ? prev : { status: "loading" }));
    (plan.run() as Promise<ChartSeriesResult | TopRankingResult>)
      .then((value) => {
        if (!cancelled) setState({ status: "ready", text: buildChartInsight(toInput(plan, value), { measure: plan.measure }) });
      })
      .catch(() => { if (!cancelled) setState({ status: "unsupported" }); });
    return () => { cancelled = true; };
    // peek/toInput só dependem do plano.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  return state;
}
