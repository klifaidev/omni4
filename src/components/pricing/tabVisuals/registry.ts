// Catálogo dos visuais das abas que podem ir para o slide como eles são.
//
// Cada visual é UM componente usado pela aba e pelo slide (TabVisualBlock).
// O slide guarda só a receita — id, versão, opções, filtros e período — e
// desenha o mesmo componente com as linhas do deck, no tema claro.
//
// Para adicionar um visual: separar o desenho da aba num componente que
// recebe `data` + `variant`, a conta num `compute(rows, params)`, registrar
// aqui e trocar o envio da aba por `tabVisualPayload(...)`.
import type { ComponentType } from "react";
import type { Metric, PricingRow } from "@/lib/types";
import { usePricing } from "@/store/pricing";
import { EvolucaoMensalVisual } from "./EvolucaoMensalVisual";
import { computeEvolucaoMensal, type EvolucaoMensalPoint } from "./evolucaoMensal";
import type { TabVisualVariant } from "./visualTheme";

export interface TabVisualParamControl {
  key: string;
  label: string;
  options: Array<{ value: string; label: string }>;
}

export interface TabVisualDefinition<D = unknown> {
  id: string;
  /** Sobe quando o significado dos `params` muda (decks antigos migram). */
  version: number;
  /** Nome da aba, como aparece no menu. */
  page: string;
  /** Rota da aba, para "Abrir na aba". */
  route: string;
  title: string;
  /** Opções que dá para trocar no slide. */
  params: TabVisualParamControl[];
  defaultParams: Record<string, unknown>;
  compute(rows: PricingRow[], params: Record<string, unknown>): D;
  isEmpty(data: D): boolean;
  Component: ComponentType<{ data: D; variant: TabVisualVariant }>;
  /** Leva as opções do slide para a aba (Abrir na aba). */
  applyParamsToTab(params: Record<string, unknown>): void;
}

function metricOf(params: Record<string, unknown>): Metric {
  return params.metric === "mb" ? "mb" : "cm";
}

const evolucaoMensal: TabVisualDefinition<EvolucaoMensalPoint[]> = {
  id: "visao-geral.evolucao-mensal",
  version: 1,
  page: "Visão Geral",
  route: "/visao-geral",
  title: "Evolução mensal — ROL, Margem % e Volume",
  params: [{
    key: "metric",
    label: "Margem",
    options: [
      { value: "cm", label: "Contribuição marginal" },
      { value: "mb", label: "Margem bruta" },
    ],
  }],
  defaultParams: { metric: "cm" },
  compute: (rows, params) => computeEvolucaoMensal(rows, { metric: metricOf(params) }),
  isEmpty: (data) => data.length === 0,
  Component: EvolucaoMensalVisual,
  applyParamsToTab: (params) => usePricing.getState().setMetric(metricOf(params)),
};

const VISUALS = new Map<string, TabVisualDefinition>(
  [evolucaoMensal].map((visual) => [visual.id, visual as TabVisualDefinition]),
);

export function getTabVisual(id: string): TabVisualDefinition | undefined {
  return VISUALS.get(id);
}

export const TAB_VISUAL_IDS = {
  evolucaoMensal: evolucaoMensal.id,
} as const;
