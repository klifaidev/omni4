// Cores dos visuais das abas nas duas superfícies onde eles aparecem.
//
// Na aba: as variáveis do tema do app (claro/escuro). No slide: cores fixas
// em hexadecimal do tema claro da Harald — fixas de propósito, porque a
// exportação (PPTX/PDF) fotografa o SVG fora do app, onde `var(--…)` não
// existe e as cores sumiriam.
import { SLIDE_HEX } from "@/lib/slideColors";

export type TabVisualVariant = "tab" | "slide";

export interface TabVisualPalette {
  grid: string;
  axis: string;
  /** Linha dos eixos (`undefined` = padrão do Recharts, como na aba). */
  axisLine: string | undefined;
  /** Série principal (ROL). */
  primary: string;
  /** Série positiva/margem. */
  success: string;
  /** Barras de apoio (volume). */
  warningFill: string;
  warningStroke: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string | undefined;
  /** Texto da legenda (`undefined` = cor da série, como na aba). No slide,
   *  a cor translúcida das barras deixava "Volume" ilegível no branco. */
  legendText: string | undefined;
  /** Tamanho da fonte dos eixos e da legenda. */
  fontSize: number;
  /** Animação de entrada (desligada no slide: miniatura e exportação). */
  animate: boolean;
}

const TAB: TabVisualPalette = {
  grid: "hsl(var(--border) / 0.4)",
  axis: "hsl(var(--muted-foreground))",
  axisLine: undefined,
  primary: "hsl(var(--primary))",
  success: "hsl(var(--success))",
  warningFill: "hsl(var(--warning) / 0.35)",
  warningStroke: "hsl(var(--warning) / 0.6)",
  tooltipBg: "hsl(var(--popover) / 0.95)",
  tooltipBorder: "1px solid hsl(var(--border) / 0.6)",
  tooltipText: undefined,
  legendText: undefined,
  fontSize: 11,
  animate: true,
};

const SLIDE: TabVisualPalette = {
  grid: SLIDE_HEX.grid,
  axis: SLIDE_HEX.slate500,
  axisLine: SLIDE_HEX.slate300,
  primary: SLIDE_HEX.chart1,
  success: SLIDE_HEX.chart6,
  warningFill: "rgba(237, 161, 0, 0.30)",
  warningStroke: "rgba(237, 161, 0, 0.75)",
  tooltipBg: SLIDE_HEX.white,
  tooltipBorder: `1px solid ${SLIDE_HEX.grid}`,
  tooltipText: SLIDE_HEX.chart2,
  legendText: SLIDE_HEX.slate700,
  fontSize: 13,
  animate: false,
};

export function tabVisualPalette(variant: TabVisualVariant): TabVisualPalette {
  return variant === "slide" ? SLIDE : TAB;
}
