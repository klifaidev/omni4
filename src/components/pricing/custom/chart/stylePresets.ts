// Quick visual style presets — apply a coherent set of style overrides
// (colors, fonts, grid, labels) without touching data/schema.

import type { ChartStyle } from "./types";
import { defaultChartStyle, DEFAULT_PALETTE } from "./types";
import { SLIDE_HARALD_PALETTE, SLIDE_HEX } from "@/lib/slideDesignTokens";

export type StylePresetId = "default" | "minimal" | "bold" | "monochrome" | "harald";

type StylePatch = Partial<ChartStyle>;

const HARALD_PALETTE = SLIDE_HARALD_PALETTE;

export const STYLE_PRESETS: { id: StylePresetId; label: string }[] = [
  { id: "default", label: "Padrão" },
  { id: "minimal", label: "Minimal" },
  { id: "bold", label: "Bold" },
  { id: "monochrome", label: "Mono" },
  { id: "harald", label: "Harald" },
];

export function buildStylePresetPatch(id: StylePresetId, current: ChartStyle): StylePatch {
  const d = defaultChartStyle();
  switch (id) {
    case "default":
      return {
        general: { ...current.general, ...d.general },
        grid: d.grid,
        dataLabels: { ...current.dataLabels, ...d.dataLabels },
        series: [],
      };
    case "minimal":
      return {
        general: {
          ...current.general,
          background: SLIDE_HEX.white, borderColor: SLIDE_HEX.white, borderWidth: 0,
          titleColor: SLIDE_HEX.chart2, titleBold: false, titleSize: 15,
          legendShow: true, legendPos: "bottom",
        },
        grid: { show: false, color: SLIDE_HEX.grid, style: "solid" },
        dataLabels: { ...current.dataLabels, show: false },
        xAxis: { ...current.xAxis, lineColor: SLIDE_HEX.gridSoft, lineWidth: 1, ticks: false },
        yAxis: { ...current.yAxis, lineColor: SLIDE_HEX.gridSoft, lineWidth: 0, ticks: false },
        series: [],
      };
    case "bold":
      return {
        general: {
          ...current.general,
          titleColor: SLIDE_HEX.ink, titleBold: true, titleSize: 20,
          background: SLIDE_HEX.white,
        },
        grid: { show: true, color: SLIDE_HEX.grid, style: "solid" },
        dataLabels: {
          ...current.dataLabels, show: true, bold: true, size: 12,
          color: SLIDE_HEX.ink,
        },
        bar: { ...current.bar, cornerRadius: 6, gapPct: 30 },
        series: HARALD_PALETTE.map((color, i) => ({
          key: `s${i}`, color, thickness: 3,
        })),
      };
    case "monochrome":
      return {
        general: {
          ...current.general,
          titleColor: SLIDE_HEX.ink, background: SLIDE_HEX.white,
        },
        grid: { show: true, color: SLIDE_HEX.gridSoft, style: "dashed" },
        dataLabels: { ...current.dataLabels, color: SLIDE_HEX.ink },
        series: [SLIDE_HEX.ink, SLIDE_HEX.slate700, SLIDE_HEX.slate500, SLIDE_HEX.slate400, SLIDE_HEX.slate300, SLIDE_HEX.grid]
          .map((color, i) => ({ key: `s${i}`, color })),
      };
    case "harald":
      return {
        general: {
          ...current.general,
          titleColor: SLIDE_HEX.chart1, titleBold: true, titleSize: 16,
          background: SLIDE_HEX.white,
        },
        grid: { show: true, color: SLIDE_HEX.grid, style: "dashed" },
        dataLabels: { ...current.dataLabels, color: SLIDE_HEX.chart2 },
        series: HARALD_PALETTE.map((color, i) => ({ key: `s${i}`, color })),
      };
  }
}

// Re-export so consumers can show palette dots in preset previews.
export { DEFAULT_PALETTE };
