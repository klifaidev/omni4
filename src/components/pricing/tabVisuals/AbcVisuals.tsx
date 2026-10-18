// Portfólio de SKUs · Matriz de portfólio e Curva ABC (Pareto). Os mesmos
// componentes da aba; no slide sem animação e sem a tabela detalhada.
import { AbcPareto } from "@/components/pricing/AbcPareto";
import { PortfolioMatrix } from "@/components/pricing/PortfolioMatrix";
import type { AggRow } from "@/lib/analytics";
import type { TabVisualVariant } from "./visualTheme";

export interface AbcVisualData {
  bySku: AggRow[];
  metricLabel: string;
}

export function AbcMatrizVisual({ data, variant }: { data: AbcVisualData; variant: TabVisualVariant }) {
  return <PortfolioMatrix rows={data.bySku} metricLabel={data.metricLabel} animate={variant === "tab"} />;
}

export function AbcCurvaVisual({ data, variant }: { data: AbcVisualData; variant: TabVisualVariant }) {
  return <AbcPareto rows={data.bySku} showTable={variant === "tab"} animate={variant === "tab"} />;
}
