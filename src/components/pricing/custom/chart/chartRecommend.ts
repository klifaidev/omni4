// Tipo de gráfico recomendado a partir do formato dos dados. Regras curtas e
// explicáveis (cada sugestão diz o porquê) — só aparece quando o tipo atual
// atrapalha a leitura, nunca para trocar uma escolha razoável por outra.

import type { ChartBlock, KpiMeasureId } from "@/lib/customSlide";

type CT = ChartBlock["chartType"];

export type RecommendReason =
  | "manyPeriods" | "fewPeriods" | "ratioStacked"
  | "manyCategories" | "fewCategories" | "manySlices";

export interface ChartShape {
  chartType: CT;
  measure: KpiMeasureId;
  /** Eixo X são períodos (meses). */
  xIsTime: boolean;
  /** Quantos pontos no eixo X (ou fatias, em pizza/rosca). */
  categoryCount: number;
}

/** Medidas que são razão: somar/empilhar não faz sentido. */
const RATIO_MEASURES: readonly KpiMeasureId[] = ["cmPct", "mbPct", "precoMedio", "ticketMedio"];

export function recommendChartType(s: ChartShape): { type: CT; reason: RecommendReason } | null {
  const ct = s.chartType;
  const n = s.categoryCount;
  const ratio = RATIO_MEASURES.includes(s.measure);
  const columnLike = ct === "bar" || ct === "column";
  const lineLike = ct === "line" || ct === "area";
  const stacked = ct === "stackedColumn" || ct === "stackedBar" || ct === "stackedArea";

  let pick: { type: CT; reason: RecommendReason } | null = null;
  if (ct === "pie" || ct === "donut") {
    if (n > 6) pick = { type: "hbar", reason: "manySlices" };
  } else if (s.xIsTime) {
    if (ratio && stacked) pick = { type: "line", reason: "ratioStacked" };
    else if (columnLike && n > 12) pick = { type: "line", reason: "manyPeriods" };
    else if (lineLike && n > 0 && n <= 3 && !ratio) pick = { type: "bar", reason: "fewPeriods" };
  } else if (n > 0) {
    if (ratio && stacked) pick = { type: n > 8 ? "hbar" : "bar", reason: "ratioStacked" };
    else if ((columnLike || lineLike) && n > 8) pick = { type: "hbar", reason: "manyCategories" };
    else if (ct === "stackedColumn" && n > 8) pick = { type: "stackedBar", reason: "manyCategories" };
    else if (lineLike) pick = { type: "bar", reason: "fewCategories" };
  }
  if (!pick || pick.type === ct || (pick.type === "bar" && ct === "column")) return null;
  return pick;
}
