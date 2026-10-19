// Catálogo dos visuais da Ruptura que podem ir para o slide como eles são.
//
// Mesma ideia do catálogo das outras abas (components/pricing/tabVisuals): cada
// visual é UM componente usado pela aba e pelo slide; o slide guarda só a
// receita — id, versão, opções, filtros e período — e desenha o componente com
// a base de ruptura carregada. Aqui os dados vêm do modelo da Ruptura, não das
// linhas do KE30.
import { createElement, type ComponentType } from "react";
import type { RupturaVisualBlock, TabVisualPeriod } from "@/lib/customSlide";
import type { RupturaFilters } from "@/lib/ruptura/metrics";
import type { RupturaModel } from "@/lib/ruptura/types";
import { makeRupturaView, type RupturaView } from "@/lib/ruptura/view";
import { newBlock } from "@/lib/customSlide";
import { rupturaAnchorIndex, resolveRupturaPeriod } from "@/lib/rupturaVisualPeriod";
import type { TabVisualLayout } from "@/components/pricing/tabVisuals/TabVisualSurface";
import type { TabVisualVariant } from "@/components/pricing/tabVisuals/visualTheme";
import {
  computeRupturaEvolution,
  computeRupturaKpis,
  computeRupturaMap,
  computeRupturaRanking,
  RUPTURA_EVO_METRICS,
  RUPTURA_KPI_IDS,
  RUPTURA_MAP_METRICS,
  RUPTURA_RANKING_DIMS,
  type RupturaEvoMetric,
  type RupturaEvolutionData,
  type RupturaKpiData,
  type RupturaKpiId,
  type RupturaMapData,
  type RupturaMapMetric,
  type RupturaRankingData,
  type RupturaRankingDim,
} from "./data";
import { RupturaEvolutionVisual } from "./EvolutionVisual";
import { RupturaKpiStripVisual, RupturaKpiVisual } from "./KpiVisuals";
import { RupturaMapVisual } from "./MapVisual";
import { RupturaRankingVisual } from "./RankingVisual";

export interface RupturaParamControl {
  key: string;
  label: string;
  options: Array<{ value: string; label: string }>;
}

/** O que a conta de um visual recebe além do recorte. */
export interface RupturaVisualContext {
  filters: RupturaFilters;
  /** Último mês (índice) que o deck enxerga. */
  last: number;
}

export interface RupturaVisualDefinition<D = unknown> {
  id: string;
  /** Sobe quando o significado dos `params` muda (decks antigos migram). */
  version: number;
  page: "Ruptura";
  route: "/ruptura";
  title: string;
  /** Opções que dá para trocar no slide. */
  params: RupturaParamControl[];
  defaultParams: Record<string, unknown>;
  /** "period": respeita os meses escolhidos; "history": sempre a base inteira, como na aba. */
  scope?: (params: Record<string, unknown>) => "period" | "history";
  compute(view: RupturaView, params: Record<string, unknown>, ctx: RupturaVisualContext): D;
  isEmpty(data: D): boolean;
  layout: TabVisualLayout;
  designWidth?: number;
  /** Mostrar o título acima do visual ao criar (os cartões já trazem o próprio). */
  showTitle?: boolean;
  /** Posição e tamanho iniciais no slide. */
  frame: { x: number; y: number; w: number; h: number };
  Component: ComponentType<{ data: D; params: Record<string, unknown>; variant: TabVisualVariant }>;
}

const str = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);

// ── Indicadores ──────────────────────────────────────────────────────────

const KPI_LABELS: Record<RupturaKpiId, string> = {
  rate: "Taxa de ruptura",
  storesAffected: "Lojas com ruptura",
  occurrences: "Ocorrências",
  skusAffected: "SKUs afetados",
  redesAffected: "Redes afetadas",
};

const kpi: RupturaVisualDefinition<RupturaKpiData> = {
  id: "ruptura.kpi",
  version: 1,
  page: "Ruptura",
  route: "/ruptura",
  title: "Indicador de ruptura",
  params: [{
    key: "metric",
    label: "Indicador",
    options: RUPTURA_KPI_IDS.map((id) => ({ value: id, label: KPI_LABELS[id] })),
  }],
  defaultParams: { metric: "rate" },
  compute: (view, params) => {
    const id = str(params.metric, "rate") as RupturaKpiId;
    const cards = computeRupturaKpis(view);
    return cards.find((c) => c.id === id) ?? cards[0];
  },
  isEmpty: () => false,
  layout: "fit",
  designWidth: 320,
  showTitle: false,
  frame: { x: 60, y: 130, w: 340, h: 200 },
  Component: RupturaKpiVisual,
};

const kpis: RupturaVisualDefinition<RupturaKpiData[]> = {
  id: "ruptura.kpis",
  version: 1,
  page: "Ruptura",
  route: "/ruptura",
  title: "Painel de indicadores de ruptura",
  params: [],
  defaultParams: {},
  compute: (view) => computeRupturaKpis(view),
  isEmpty: () => false,
  layout: "fit",
  designWidth: 1240,
  showTitle: false,
  frame: { x: 60, y: 130, w: 1213, h: 200 },
  Component: RupturaKpiStripVisual,
};

// ── Evolução mensal ──────────────────────────────────────────────────────

const evolucao: RupturaVisualDefinition<RupturaEvolutionData> = {
  id: "ruptura.evolucao",
  version: 1,
  page: "Ruptura",
  route: "/ruptura",
  title: "Evolução mensal da ruptura",
  params: [
    { key: "metric", label: "Mostrar", options: RUPTURA_EVO_METRICS.map((m) => ({ value: m.id, label: m.label })) },
    {
      key: "sameStores",
      label: "Lojas",
      options: [
        { value: "all", label: "Todas as lojas de cada mês" },
        { value: "same", label: "Mesmas lojas em todo o período" },
      ],
    },
  ],
  defaultParams: { metric: "occurrences", sameStores: "all" },
  // Como na aba: a linha do tempo mostra a base inteira; só "mesmas lojas"
  // usa os meses escolhidos (eles definem o conjunto de lojas).
  scope: (params) => (params.sameStores === "same" ? "period" : "history"),
  compute: (view, params, ctx) =>
    computeRupturaEvolution(view, ctx.filters, {
      metric: str(params.metric, "occurrences") as RupturaEvoMetric,
      sameStores: params.sameStores === "same",
      last: ctx.last,
    }),
  isEmpty: (data) => data.points.length === 0,
  layout: "fill",
  frame: { x: 60, y: 130, w: 1213, h: 470 },
  Component: ({ data, variant }) => createElement(RupturaEvolutionVisual, { data, variant }),
};

// ── Mapa por estado ──────────────────────────────────────────────────────

const mapa: RupturaVisualDefinition<RupturaMapData> = {
  id: "ruptura.mapa",
  version: 1,
  page: "Ruptura",
  route: "/ruptura",
  title: "Ruptura por estado",
  params: [{ key: "metric", label: "Mostrar", options: RUPTURA_MAP_METRICS.map((m) => ({ value: m.id, label: m.label })) }],
  defaultParams: { metric: "occurrences" },
  compute: (view, params) => computeRupturaMap(view, str(params.metric, "occurrences") as RupturaMapMetric),
  isEmpty: (data) => data.rows.length === 0,
  layout: "fill",
  frame: { x: 60, y: 120, w: 540, h: 470 },
  Component: ({ data, variant }) => createElement(RupturaMapVisual, { data, variant }),
};

// ── Rankings ─────────────────────────────────────────────────────────────

const TOP_OPTIONS = [5, 8, 10, 15].map((n) => ({ value: String(n), label: `Top ${n}` }));
const RANKING_PARAMS: RupturaParamControl[] = [
  { key: "top", label: "Itens", options: TOP_OPTIONS },
  { key: "view", label: "Formato", options: [{ value: "table", label: "Tabela" }, { value: "bars", label: "Barras" }] },
];

function ranking(dim: RupturaRankingDim, view: "table" | "bars" = "table"): RupturaVisualDefinition<RupturaRankingData> {
  return {
    id: `ruptura.ranking-${dim}`,
    version: 1,
    page: "Ruptura",
    route: "/ruptura",
    title: RUPTURA_RANKING_DIMS[dim].title,
    params: RANKING_PARAMS,
    defaultParams: { top: "8", view },
    compute: (v, params) => computeRupturaRanking(v, dim, Number(str(params.top, "8")) || 8),
    isEmpty: (data) => data.rows.length === 0,
    layout: "fit",
    designWidth: 820,
    frame: { x: 60, y: 130, w: 820, h: 470 },
    Component: RupturaRankingVisual,
  };
}

const ALL = [kpi, kpis, evolucao, mapa, ranking("categoria", "bars"), ranking("canal"), ranking("rede"), ranking("sku")] as Array<RupturaVisualDefinition<never>>;
const BY_ID = new Map(ALL.map((v) => [v.id, v as RupturaVisualDefinition]));

export const RUPTURA_VISUAL_IDS = {
  kpi: kpi.id,
  kpis: kpis.id,
  evolucao: evolucao.id,
  mapa: mapa.id,
  ranking: (dim: RupturaRankingDim) => `ruptura.ranking-${dim}`,
} as const;

export function getRupturaVisual(id: string): RupturaVisualDefinition | undefined {
  return BY_ID.get(id);
}

export function listRupturaVisuals(): RupturaVisualDefinition[] {
  return ALL as unknown as RupturaVisualDefinition[];
}

/** Um elemento novo do catálogo, com as opções e o tamanho iniciais do visual. */
export function newRupturaVisualBlock(visualId: string, z: number, overrides: Partial<RupturaVisualBlock> = {}): RupturaVisualBlock {
  const visual = getRupturaVisual(visualId);
  const block = newBlock("ruptura_visual", z) as RupturaVisualBlock;
  block.visualId = visualId;
  block.visualVersion = visual?.version ?? 1;
  block.params = { ...(visual?.defaultParams ?? {}) };
  block.title = visual?.title ?? "";
  block.showTitle = visual?.showTitle ?? true;
  if (visual) Object.assign(block, visual.frame);
  return Object.assign(block, overrides);
}

// ── Cálculo com cache ────────────────────────────────────────────────────

const cache = new WeakMap<RupturaModel, Map<string, unknown>>();
const CACHE_LIMIT = 80;

export interface RupturaVisualInput {
  params: Record<string, unknown>;
  filters: RupturaFilters;
  period: TabVisualPeriod;
}

/**
 * Os dados do visual para o modelo e o deck de agora. `null` quando a base
 * ainda não alcança nenhum mês do deck. O mesmo recorte é calculado uma vez e
 * dividido entre blocos, miniaturas e apresentação.
 */
export function computeRupturaVisual(
  visual: RupturaVisualDefinition,
  model: RupturaModel,
  input: RupturaVisualInput,
  reference: string | null,
): unknown | null {
  const last = rupturaAnchorIndex(model, reference);
  if (last < 0) return null;
  const scope = visual.scope?.(input.params) ?? "period";
  const period = scope === "history" ? { from: 0, to: last } : resolveRupturaPeriod(model, input.period, reference);
  if (period.to < period.from) return null;
  const key = JSON.stringify([visual.id, visual.version, input.params, input.filters, period.from, period.to, last]);
  let perModel = cache.get(model);
  if (!perModel) cache.set(model, (perModel = new Map()));
  if (perModel.has(key)) return perModel.get(key) ?? null;
  const data = visual.compute(makeRupturaView(model, input.filters, period), input.params, { filters: input.filters, last });
  if (perModel.size >= CACHE_LIMIT) perModel.delete(perModel.keys().next().value as string);
  perModel.set(key, data);
  return data;
}
