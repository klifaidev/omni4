// Cores dos visuais da Ruptura na aba e no slide. Na aba: variáveis do tema do
// app. No slide: hexadecimais do tema claro — fixos porque a exportação
// fotografa o SVG fora do app (ver tabVisuals/visualTheme.ts).
import { SLIDE_HEX } from "@/lib/slideColors";
import type { TabVisualVariant } from "@/components/pricing/tabVisuals/visualTheme";

export interface RupturaPalette {
  /** Série e destaques de ruptura (vermelho). */
  danger: string;
  /** Menor valor / melhora. */
  good: string;
  warning: string;
  grid: string;
  axis: string;
  /** Fundo dos pontos "comuns" da linha. */
  dotFill: string;
  /** Estado sem pesquisa no mapa. */
  mapEmpty: string;
  mapStroke: string;
  mapStrokeSelected: string;
  mapLabel: string;
  /** Vermelho com intensidade 0–1 (mapa). */
  heat: (t: number) => string;
  heatGradient: string;
  fontSize: number;
}

const TAB: RupturaPalette = {
  danger: "hsl(var(--destructive))",
  good: "hsl(var(--success))",
  warning: "hsl(var(--warning))",
  grid: "hsl(var(--border) / 0.4)",
  axis: "hsl(var(--muted-foreground))",
  dotFill: "hsl(var(--background))",
  mapEmpty: "hsl(var(--muted) / 0.55)",
  mapStroke: "hsl(var(--background))",
  mapStrokeSelected: "hsl(var(--foreground))",
  mapLabel: "hsl(var(--foreground) / 0.85)",
  heat: (t) => `hsl(var(--destructive) / ${(0.14 + 0.78 * t).toFixed(3)})`,
  heatGradient: "linear-gradient(90deg, hsl(var(--destructive) / 0.14), hsl(var(--destructive) / 0.92))",
  fontSize: 11,
};

const SLIDE: RupturaPalette = {
  danger: SLIDE_HEX.danger,
  good: SLIDE_HEX.success,
  warning: SLIDE_HEX.warningDark,
  grid: SLIDE_HEX.grid,
  axis: SLIDE_HEX.slate500,
  dotFill: SLIDE_HEX.white,
  mapEmpty: SLIDE_HEX.pptSurfaceAlt,
  mapStroke: SLIDE_HEX.white,
  mapStrokeSelected: SLIDE_HEX.ink,
  mapLabel: SLIDE_HEX.ink,
  heat: (t) => `rgba(220, 38, 38, ${(0.14 + 0.78 * t).toFixed(3)})`,
  heatGradient: "linear-gradient(90deg, rgba(220, 38, 38, 0.14), rgba(220, 38, 38, 0.92))",
  fontSize: 13,
};

export function rupturaPalette(variant: TabVisualVariant): RupturaPalette {
  return variant === "slide" ? SLIDE : TAB;
}
