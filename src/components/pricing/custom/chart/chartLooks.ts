// Looks prontos do gráfico: um clique muda o acabamento inteiro (grade,
// rótulos, eixos, legenda, título) sem tocar nos dados nem nas cores das
// séries. Cada look é um patch sobre o estilo atual — desfaz com Ctrl+Z.

import { SLIDE_HEX } from "@/lib/slideDesignTokens";
import type { ChartStyle } from "./types";

export type ChartLookId = "executive" | "analytical" | "minimal" | "highlight";

export const CHART_LOOK_IDS: ChartLookId[] = ["executive", "analytical", "minimal", "highlight"];

export function chartLookPatch(look: ChartLookId, s: ChartStyle): Partial<ChartStyle> {
  switch (look) {
    case "executive":
      return {
        grid: { ...s.grid, show: false },
        yAxis: { ...s.yAxis, show: false },
        xAxis: { ...s.xAxis, show: true, lineWidth: 1, ticks: false },
        dataLabels: { ...s.dataLabels, show: true, size: 11, bold: true, format: "auto" },
        general: { ...s.general, titleShow: true, titleBold: true, legendShow: true, legendPos: "bottom" },
        bar: { ...s.bar, cornerRadius: 0, gapPct: 25 },
      };
    case "analytical":
      return {
        grid: { ...s.grid, show: true, style: "dashed" },
        yAxis: { ...s.yAxis, show: true, lineWidth: 1, ticks: true },
        xAxis: { ...s.xAxis, show: true, lineWidth: 1, ticks: true },
        dataLabels: { ...s.dataLabels, show: false },
        general: { ...s.general, titleShow: true, titleBold: true, legendShow: true, legendPos: "top" },
        bar: { ...s.bar, cornerRadius: 0, gapPct: 20 },
      };
    case "minimal":
      return {
        grid: { ...s.grid, show: false },
        yAxis: { ...s.yAxis, show: false },
        xAxis: { ...s.xAxis, show: true, lineWidth: 0, ticks: false },
        dataLabels: { ...s.dataLabels, show: true, size: 10, bold: false },
        general: { ...s.general, titleShow: true, titleBold: false, legendShow: false, borderWidth: 0 },
        bar: { ...s.bar, cornerRadius: 2, gapPct: 35 },
      };
    case "highlight":
      return {
        grid: { ...s.grid, show: false },
        yAxis: { ...s.yAxis, show: false },
        xAxis: { ...s.xAxis, show: true, lineWidth: 1, ticks: false },
        dataLabels: { ...s.dataLabels, show: true, size: 12, bold: true },
        general: { ...s.general, titleShow: true, titleBold: true, titleColor: SLIDE_HEX.chart1, legendShow: true, legendPos: "bottom" },
        bar: { ...s.bar, cornerRadius: 6, gapPct: 30 },
      };
  }
}

/** Qual look o estilo atual já é (pra marcar o botão), ou null. */
export function activeChartLook(s: ChartStyle): ChartLookId | null {
  for (const id of CHART_LOOK_IDS) {
    const patch = chartLookPatch(id, s);
    const same = (Object.keys(patch) as (keyof ChartStyle)[]).every((k) =>
      JSON.stringify(patch[k]) === JSON.stringify(s[k]));
    if (same) return id;
  }
  return null;
}
