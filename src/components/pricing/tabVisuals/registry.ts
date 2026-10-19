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
import type { Filters, Metric, PricingRow } from "@/lib/types";
import { usePricing } from "@/store/pricing";
import { EvolucaoMensalVisual } from "./EvolucaoMensalVisual";
import { computeEvolucaoMensal, type EvolucaoMensalPoint } from "./evolucaoMensal";
import { HeroisVisual } from "./HeroisVisual";
import { buildPositivacaoSeries, POSITIVACAO_DIMS, type PositivacaoDim, type PositivacaoSeries } from "@/lib/positivacao";
import { PositivacaoVisual } from "./PositivacaoVisual";
import { UfMapVisual } from "./UfMapVisuals";
import { computeUfMap, UF_MAP_POINTS, type UfMapData } from "./ufMapData";
import { calcFarol, type FarolComparacao } from "@/lib/farol";
import { FarolVisual } from "./FarolVisual";
import { AbcCurvaVisual, AbcMatrizVisual, type AbcVisualData } from "./AbcVisuals";
import { useInovacaoDepara } from "@/store/inovacaoDepara";
import {
  InovCanalMixVisual, InovHeroisVisual, InovMaturidadeVisual, InovMargemVisual, InovMixVisual, InovPrecoVisual,
} from "./InovacaoVisuals";
import {
  computeChannelMix, computeChannelMixMonthly, computeInnovationBase, computeInnovationHeroes, computeInnovationMargin,
  computeInnovationMix, computeInnovationPrice, computeMaturity,
  type ChannelMixMonthlyData, type InnovationHeroesData, type InnovationMarginData, type InnovationMixData,
  type InnovationPriceData, type MaturityData,
} from "./inovacaoData";
import { aggregateBy, applyFilters, computeCostEvolution, type CostEvolutionRow, type PriceDecompositionResult } from "@/lib/analytics";
import { PrecoDecompVisual, PrecoEvolucaoVisual, PrecoRankingVisual } from "./PrecoVisuals";
import {
  computePriceEvolution, computePriceRanking, computePriceResult, resolvePricePeriods,
  type PriceEvolutionData, type PriceRankingData,
} from "./precoData";
import { CustoComposicaoVisual, CustoKgVisual, CustoPressaoVisual, type CustoComposicaoData } from "./CustosVisuals";
import { buildComposition, compositionTotals, hasCompositionData } from "./custosData";
import { CanalMixVisual, CanalTrendVisual, type CanalMixVisualData, type CanalTrendVisualData } from "./CanaisVisuals";
import { canalEvolutionData, computeCanaisSeries, type CanalChartMetric } from "./canaisData";
import { SazonalidadeVisual } from "./SazonalidadeVisual";
import { computeHerois, computeSazonalidade, type HeroisData, type SazonalidadeData } from "./visaoGeralData";
import type { TabVisualVariant } from "./visualTheme";
import type { TabVisualLayout } from "./TabVisualSurface";

export interface TabVisualParamControl {
  key: string;
  label: string;
  options: Array<{ value: string; label: string }>;
}

/** O que a conta de um visual recebe além das linhas já recortadas. */
export interface TabVisualContext {
  /** A base inteira (no slide: a do deck, até o mês de referência). */
  allRows: PricingRow[];
  filters: Filters;
  /** Meses escolhidos (`null` = todos). */
  periods: string[] | null;
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
  compute(rows: PricingRow[], params: Record<string, unknown>, ctx: TabVisualContext): D;
  /** Algo além das linhas que muda o resultado (ex.: o De/Para de inovação). */
  cacheExtra?: () => unknown;
  isEmpty(data: D): boolean;
  /** "fill": ocupa o bloco (gráficos); "fit": desenhado na largura da aba
   *  (`designWidth`) e reduzido para caber (grades e listas). */
  layout: TabVisualLayout;
  designWidth?: number;
  /** Mostra sempre o histórico inteiro (até o mês de referência), como na
   *  aba — a escolha de meses não se aplica. */
  history?: boolean;
  /** Posição/altura inicial do bloco no slide, quando o padrão não serve. */
  defaultFrame?: { y?: number; h?: number };
  Component: ComponentType<{ data: D; params: Record<string, unknown>; variant: TabVisualVariant }>;
  /** Leva as opções do slide para a aba (Abrir na aba). */
  applyParamsToTab(params: Record<string, unknown>): void;
}

function metricOf(params: Record<string, unknown>): Metric {
  return params.metric === "mb" ? "mb" : "cm";
}

const METRIC_CONTROL: TabVisualParamControl = {
  key: "metric",
  label: "Margem",
  options: [
    { value: "cm", label: "Contribuição marginal" },
    { value: "mb", label: "Margem bruta" },
  ],
};

const setTabMetric = (params: Record<string, unknown>) => usePricing.getState().setMetric(metricOf(params));

const evolucaoMensal: TabVisualDefinition<EvolucaoMensalPoint[]> = {
  id: "visao-geral.evolucao-mensal",
  version: 1,
  page: "Visão Geral",
  route: "/visao-geral",
  title: "Evolução mensal — ROL, Margem % e Volume",
  params: [METRIC_CONTROL],
  defaultParams: { metric: "cm" },
  compute: (rows, params) => computeEvolucaoMensal(rows, { metric: metricOf(params) }),
  isEmpty: (data) => data.length === 0,
  layout: "fill",
  Component: EvolucaoMensalVisual,
  applyParamsToTab: setTabMetric,
};

const sazonalidade: TabVisualDefinition<SazonalidadeData> = {
  id: "visao-geral.sazonalidade",
  version: 1,
  page: "Visão Geral",
  route: "/visao-geral",
  title: "Sazonalidade — Margem % por mês × ano fiscal",
  params: [METRIC_CONTROL],
  defaultParams: { metric: "cm" },
  compute: (rows, params) => computeSazonalidade(rows, metricOf(params)),
  isEmpty: (data) => !data.hasData,
  layout: "fit",
  designWidth: 1040,
  Component: SazonalidadeVisual,
  applyParamsToTab: setTabMetric,
};

const herois: TabVisualDefinition<HeroisData> = {
  id: "visao-geral.herois-ofensores",
  version: 1,
  page: "Visão Geral",
  route: "/visao-geral",
  title: "Heróis e Ofensores — Top 5 SKUs por Margem %",
  params: [
    { key: "variant", label: "Lista", options: [{ value: "hero", label: "Heróis (maior margem %)" }, { value: "villain", label: "Ofensores (menor margem %)" }] },
    METRIC_CONTROL,
  ],
  defaultParams: { variant: "hero", metric: "cm" },
  compute: (rows, params) => computeHerois(rows, metricOf(params)),
  isEmpty: (data) => data.bySku.length === 0,
  layout: "fit",
  designWidth: 560,
  Component: HeroisVisual,
  applyParamsToTab: setTabMetric,
};

const CANAL_CHART_METRIC_CONTROL: TabVisualParamControl = {
  key: "chartMetric",
  label: "Mostrar",
  options: [
    { value: "margemPct", label: "Margem %" },
    { value: "rol", label: "ROL" },
    { value: "volumeKg", label: "Volume" },
  ],
};

function canalChartMetricOf(params: Record<string, unknown>): CanalChartMetric {
  return params.chartMetric === "rol" || params.chartMetric === "volumeKg" ? params.chartMetric : "margemPct";
}

const canalTrend: TabVisualDefinition<CanalTrendVisualData> = {
  id: "canais.evolucao",
  version: 1,
  page: "Canais",
  route: "/canais",
  title: "Evolução temporal por canal",
  params: [CANAL_CHART_METRIC_CONTROL, METRIC_CONTROL],
  defaultParams: { chartMetric: "margemPct", metric: "cm" },
  compute: (rows, params) => {
    const series = computeCanaisSeries(rows, metricOf(params));
    const chartMetric = canalChartMetricOf(params);
    return { topCanais: series.topCanais, evolution: canalEvolutionData(series, chartMetric), chartMetric };
  },
  isEmpty: (data) => data.evolution.length === 0,
  layout: "fill",
  history: true,
  Component: CanalTrendVisual,
  applyParamsToTab: setTabMetric,
};

const canalMix: TabVisualDefinition<CanalMixVisualData> = {
  id: "canais.mix",
  version: 1,
  page: "Canais",
  route: "/canais",
  title: "Análise de mix — composição do ROL por canal",
  params: [],
  defaultParams: {},
  compute: (rows) => {
    const series = computeCanaisSeries(rows, "cm");
    return { topCanais: series.topCanais, mixData: series.mixData };
  },
  isEmpty: (data) => data.mixData.length === 0,
  layout: "fill",
  history: true,
  Component: CanalMixVisual,
  applyParamsToTab: () => {},
};

const custoKg: TabVisualDefinition<CostEvolutionRow[]> = {
  id: "custos.eficiencia-kg",
  version: 1,
  page: "Custos",
  route: "/custos",
  title: "Eficiência por Kg",
  params: [],
  defaultParams: {},
  compute: (rows) => computeCostEvolution(rows),
  isEmpty: (data) => data.length === 0,
  layout: "fill",
  history: true,
  Component: CustoKgVisual,
  applyParamsToTab: () => {},
};

const custoPressao: TabVisualDefinition<CostEvolutionRow[]> = {
  ...custoKg,
  id: "custos.pressao-receita",
  title: "Pressão de custo sobre a receita",
  Component: CustoPressaoVisual,
};

const custoComposicao: TabVisualDefinition<CustoComposicaoData> = {
  id: "custos.composicao",
  version: 1,
  page: "Custos",
  route: "/custos",
  title: "Composição do custo variável",
  params: [],
  defaultParams: {},
  compute: (rows) => {
    const composition = buildComposition(rows);
    return { composition, totals: compositionTotals(composition) };
  },
  isEmpty: (data) => !hasCompositionData(data.totals),
  layout: "fill",
  history: true,
  Component: CustoComposicaoVisual,
  applyParamsToTab: () => {},
};

// ---- Inovação ----
const innovationMapIds = new WeakMap<object, number>();
let innovationMapSeq = 0;
/** Identifica o De/Para de inovação em uso (muda o resultado da maturação). */
function innovationMapKey(): number {
  const map = useInovacaoDepara.getState().map;
  let id = innovationMapIds.get(map);
  if (id === undefined) {
    id = ++innovationMapSeq;
    innovationMapIds.set(map, id);
  }
  return id;
}

const INOV_BASE = {
  version: 1,
  page: "Inovação",
  route: "/inovacao",
  params: [] as TabVisualParamControl[],
  defaultParams: {},
  applyParamsToTab: () => {},
};

const inovMix: TabVisualDefinition<InnovationMixData> = {
  ...INOV_BASE,
  id: "inovacao.participacao-volume",
  title: "Participação mensal de volume — Inovação vs Regular",
  compute: (rows) => computeInnovationMix(rows),
  isEmpty: (data) => data.monthlyMix.length === 0,
  layout: "fill",
  Component: InovMixVisual,
};

const inovMargem: TabVisualDefinition<InnovationMarginData> = {
  ...INOV_BASE,
  id: "inovacao.margem",
  title: "Margem Inovação vs Regular",
  params: [METRIC_CONTROL],
  defaultParams: { metric: "cm" },
  compute: (rows, params) => computeInnovationMargin(computeInnovationBase(rows, metricOf(params)), metricOf(params)),
  isEmpty: () => false,
  layout: "fit",
  designWidth: 1000,
  Component: InovMargemVisual,
  applyParamsToTab: setTabMetric,
};

const inovMaturidade: TabVisualDefinition<MaturityData> = {
  ...INOV_BASE,
  id: "inovacao.maturacao",
  title: "Curva de maturação por safra",
  compute: (rows, _params, ctx) => computeMaturity(ctx.allRows, rows, useInovacaoDepara.getState().map),
  cacheExtra: innovationMapKey,
  isEmpty: () => false,
  layout: "fill",
  Component: InovMaturidadeVisual,
};

const inovHerois: TabVisualDefinition<InnovationHeroesData> = {
  ...INOV_BASE,
  id: "inovacao.herois-ofensores",
  title: "Heróis e ofensores de inovação",
  params: [METRIC_CONTROL],
  defaultParams: { metric: "cm" },
  compute: (rows, params, ctx) => {
    const metric = metricOf(params);
    return computeInnovationHeroes(ctx.allRows, ctx.filters, ctx.periods, computeInnovationBase(rows, metric), metric);
  },
  isEmpty: (data) => data.heroes.length === 0 && data.offenders.length === 0,
  layout: "fit",
  designWidth: 1000,
  Component: InovHeroisVisual,
  applyParamsToTab: setTabMetric,
};

const inovPreco: TabVisualDefinition<InnovationPriceData> = {
  ...INOV_BASE,
  id: "inovacao.preco",
  title: "Preço médio Inovação vs Regular",
  compute: (rows) => computeInnovationPrice(rows, computeInnovationBase(rows, "cm")),
  isEmpty: (data) => data.monthly.length === 0,
  layout: "fit",
  designWidth: 1000,
  Component: InovPrecoVisual,
};

const inovCanalMix: TabVisualDefinition<ChannelMixMonthlyData> = {
  ...INOV_BASE,
  id: "inovacao.mix-canal",
  title: "Mix de inovação por canal",
  compute: (rows, _params, ctx) => {
    const base = computeInnovationBase(rows, "cm");
    return computeChannelMixMonthly(ctx.allRows, ctx.filters, computeChannelMix(rows, base.innovationKpis.volumeKg));
  },
  isEmpty: () => false,
  layout: "fill",
  Component: InovCanalMixVisual,
};

// ---- Positivação ----
function positivacaoDimOf(params: Record<string, unknown>): PositivacaoDim {
  return POSITIVACAO_DIMS.some((d) => d.key === params.dim) ? (params.dim as PositivacaoDim) : "categoria";
}

const positivacao: TabVisualDefinition<PositivacaoSeries> = {
  id: "positivacao.evolutivo",
  version: 1,
  page: "Positivação",
  route: "/positivacao",
  title: "Evolutivo de positivação",
  params: [{ key: "dim", label: "Abertura", options: POSITIVACAO_DIMS.map((d) => ({ value: d.key, label: d.label })) }],
  defaultParams: { dim: "categoria" },
  compute: (rows, params) => buildPositivacaoSeries(rows, positivacaoDimOf(params), 13),
  isEmpty: (data) => data.chartData.length === 0,
  layout: "fill",
  history: true,
  Component: PositivacaoVisual,
  applyParamsToTab: () => {},
};

// ---- Análise de Preço ----
const UF_FOCUS_OPTIONS = [...UF_MAP_POINTS]
  .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
  .map((point) => ({ value: point.uf, label: `${point.label} (${point.uf})` }));

const PRICE_FOLLOW_CONTROL: TabVisualParamControl = {
  key: "follow",
  label: "Base × comparação",
  options: [
    { value: "live", label: "Avançam com o mês de referência" },
    { value: "fixed", label: "Fixos (os escolhidos na aba)" },
  ],
};

function priceResultFor(params: Record<string, unknown>, ctx: TabVisualContext) {
  const { base, comp, periodMode } = resolvePricePeriods(params, ctx.allRows);
  return computePriceResult(applyFilters(ctx.allRows, ctx.filters, null), base, comp, periodMode);
}

const PRECO_BASE = {
  version: 1,
  page: "Análise de Preço",
  route: "/preco",
  applyParamsToTab: () => {},
  history: true,
};

const precoDecomp: TabVisualDefinition<PriceDecompositionResult | null> = {
  ...PRECO_BASE,
  id: "preco.decomposicao",
  title: "Decomposição de Preço — efeito preço × mix",
  params: [PRICE_FOLLOW_CONTROL],
  defaultParams: { follow: "live" },
  compute: (_rows, params, ctx) => priceResultFor(params, ctx),
  isEmpty: (data) => data == null,
  layout: "fit",
  designWidth: 900,
  Component: PrecoDecompVisual,
};

const precoRanking: TabVisualDefinition<PriceRankingData> = {
  ...PRECO_BASE,
  id: "preco.ranking-skus",
  title: "Ranking de SKUs por variação de preço",
  params: [
    { key: "metric", label: "Métrica", options: [{ value: "preco", label: "Preço puro" }, { value: "mix", label: "Mix" }, { value: "total", label: "Impacto total" }] },
    PRICE_FOLLOW_CONTROL,
  ],
  defaultParams: { metric: "preco", follow: "live" },
  compute: (_rows, params, ctx) => computePriceRanking(
    priceResultFor(params, ctx),
    params.metric === "mix" || params.metric === "total" ? params.metric : "preco",
  ),
  isEmpty: (data) => data.top10.length === 0,
  layout: "fill",
  Component: PrecoRankingVisual,
};

const precoEvolucao: TabVisualDefinition<PriceEvolutionData> = {
  ...PRECO_BASE,
  id: "preco.evolucao",
  title: "Evolução do preço médio",
  params: [{ key: "dim", label: "Abertura", options: [{ value: "total", label: "Total" }, { value: "marca", label: "Por marca" }, { value: "canal", label: "Por canal" }] }],
  defaultParams: { dim: "total" },
  compute: (rows, params) => computePriceEvolution(rows, params.dim === "marca" || params.dim === "canal" ? params.dim : "total"),
  isEmpty: (data) => data.data.length === 0,
  layout: "fill",
  Component: PrecoEvolucaoVisual,
};

// ---- Farol de Cadastro ----
const farol: TabVisualDefinition<FarolComparacao | null> = {
  id: "farol.velocimetro",
  version: 1,
  page: "Farol de Cadastro",
  route: "/farol",
  title: "Velocímetro do Farol",
  params: [METRIC_CONTROL],
  defaultParams: { metric: "cm" },
  // O Farol tem os próprios filtros (canal, categoria, últimos N meses) e
  // conta a janela a partir do último mês da base — no slide, do deck.
  compute: (_rows, params, ctx) => {
    const skuRef = typeof params.skuRef === "string" ? params.skuRef : "";
    const skuComp = typeof params.skuComp === "string" ? params.skuComp : "";
    if (!skuRef || !skuComp) return null;
    return calcFarol(ctx.allRows, skuRef, skuComp, {
      canal: typeof params.canal === "string" ? params.canal : null,
      categoria: typeof params.categoria === "string" ? params.categoria : null,
      periodoMeses: typeof params.periodoMeses === "number" ? params.periodoMeses : 3,
    }, metricOf(params));
  },
  isEmpty: (data) => data == null,
  layout: "fit",
  designWidth: 300,
  history: true,
  Component: FarolVisual,
  applyParamsToTab: setTabMetric,
};

// ---- Portfólio de SKUs ----
const abcMatriz: TabVisualDefinition<AbcVisualData> = {
  id: "portfolio.matriz",
  version: 1,
  page: "Portfólio de SKUs",
  route: "/abc",
  title: "Matriz de portfólio — Volume × Margem %",
  params: [METRIC_CONTROL],
  defaultParams: { metric: "cm" },
  compute: (rows, params) => ({
    bySku: aggregateBy(rows, metricOf(params), (r) => r.skuDesc || r.sku || "—"),
    metricLabel: metricOf(params) === "cm" ? "CM" : "MB",
  }),
  isEmpty: (data) => data.bySku.length === 0,
  layout: "fit",
  designWidth: 1100,
  Component: AbcMatrizVisual,
  applyParamsToTab: setTabMetric,
};

const abcCurva: TabVisualDefinition<AbcVisualData> = {
  ...abcMatriz,
  id: "portfolio.curva-abc",
  title: "Curva ABC (Pareto)",
  Component: AbcCurvaVisual,
};

const ufMapa: TabVisualDefinition<UfMapData> = {
  ...PRECO_BASE,
  id: "preco.mapa-uf",
  title: "Margem por UF — mapa do Brasil",
  params: [
    PRICE_FOLLOW_CONTROL,
    {
      key: "uf",
      label: "UF em foco",
      options: [{ value: "none", label: "Nenhuma (só o ranking)" }, ...UF_FOCUS_OPTIONS],
    },
  ],
  defaultParams: { follow: "live", uf: "none" },
  // A cor é a CM % do período de COMPARAÇÃO; base serve à variação de preço.
  compute: (_rows, params, ctx) => {
    const { base, comp, periodMode } = resolvePricePeriods(params, ctx.allRows);
    return computeUfMap(applyFilters(ctx.allRows, ctx.filters, null), base, comp, periodMode);
  },
  isEmpty: (data) => data.active.length === 0,
  layout: "fit",
  designWidth: 1000,
  // Mapa + ranking pedem mais altura que o bloco padrão (470 px).
  defaultFrame: { y: 110, h: 520 },
  Component: UfMapVisual,
};

const VISUALS = new Map<string, TabVisualDefinition>(
  [
    evolucaoMensal, sazonalidade, herois, canalTrend, canalMix, custoKg, custoPressao, custoComposicao,
    inovMix, inovMargem, inovMaturidade, inovHerois, inovPreco, inovCanalMix,
    positivacao, precoDecomp, precoRanking, precoEvolucao, ufMapa, farol, abcMatriz, abcCurva,
  ].map((visual) => [visual.id, visual as TabVisualDefinition]),
);

export function getTabVisual(id: string): TabVisualDefinition | undefined {
  return VISUALS.get(id);
}

export const TAB_VISUAL_IDS = {
  evolucaoMensal: evolucaoMensal.id,
  sazonalidade: sazonalidade.id,
  herois: herois.id,
  canalTrend: canalTrend.id,
  canalMix: canalMix.id,
  custoKg: custoKg.id,
  custoPressao: custoPressao.id,
  custoComposicao: custoComposicao.id,
  inovMix: inovMix.id,
  inovMargem: inovMargem.id,
  inovMaturidade: inovMaturidade.id,
  inovHerois: inovHerois.id,
  inovPreco: inovPreco.id,
  inovCanalMix: inovCanalMix.id,
  positivacao: positivacao.id,
  precoDecomp: precoDecomp.id,
  precoRanking: precoRanking.id,
  precoEvolucao: precoEvolucao.id,
  ufMapa: ufMapa.id,
  farol: farol.id,
  abcMatriz: abcMatriz.id,
  abcCurva: abcCurva.id,
} as const;
