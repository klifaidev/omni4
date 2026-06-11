// Quick visual style presets — apply a coherent set of style overrides
// (colors, fonts, grid, labels) without touching data/schema.

import type { ChartStyle } from "./types";
import { defaultChartStyle, DEFAULT_PALETTE } from "./types";

export type StylePresetId = "default" | "minimal" | "bold" | "monochrome" | "harald";

type StylePatch = Partial<ChartStyle>;

const HARALD_PALETTE = [
  "#C8102E", "#1C2430", "#0F766E", "#EA580C",
  "#2563EB", "#7C3AED", "#16A34A", "#DB2777",
];

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
          background: "#FFFFFF", borderColor: "#FFFFFF", borderWidth: 0,
          titleColor: "#1C2430", titleBold: false, titleSize: 15,
          legendShow: true, legendPos: "bottom",
        },
        grid: { show: false, color: "#E2E8F0", style: "solid" },
        dataLabels: { ...current.dataLabels, show: false },
        xAxis: { ...current.xAxis, lineColor: "#F1F5F9", lineWidth: 1, ticks: false },
        yAxis: { ...current.yAxis, lineColor: "#F1F5F9", lineWidth: 0, ticks: false },
        series: [],
      };
    case "bold":
      return {
        general: {
          ...current.general,
          titleColor: "#0B1220", titleBold: true, titleSize: 20,
          background: "#FFFFFF",
        },
        grid: { show: true, color: "#E2E8F0", style: "solid" },
        dataLabels: {
          ...current.dataLabels, show: true, bold: true, size: 12,
          color: "#0B1220",
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
          titleColor: "#0B1220", background: "#FFFFFF",
        },
        grid: { show: true, color: "#F1F5F9", style: "dashed" },
        dataLabels: { ...current.dataLabels, color: "#0B1220" },
        series: ["#0B1220", "#334155", "#64748B", "#94A3B8", "#CBD5E1", "#E2E8F0"]
          .map((color, i) => ({ key: `s${i}`, color })),
      };
    case "harald":
      return {
        general: {
          ...current.general,
          titleColor: "#C8102E", titleBold: true, titleSize: 16,
          background: "#FFFFFF",
        },
        grid: { show: true, color: "#E2E8F0", style: "dashed" },
        dataLabels: { ...current.dataLabels, color: "#1C2430" },
        series: HARALD_PALETTE.map((color, i) => ({ key: `s${i}`, color })),
      };
  }
}

// Re-export so consumers can show palette dots in preset previews.
export { DEFAULT_PALETTE };
