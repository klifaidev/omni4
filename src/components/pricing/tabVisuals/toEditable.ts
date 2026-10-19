// "Converter em elemento editável": troca um visual da aba (TabVisualBlock) pelo
// elemento nativo do editor que mais se parece com ele, para a pessoa poder
// formatar tudo. É uma via de mão única: o elemento novo deixa de acompanhar o
// visual da aba, e perde o que o elemento nativo não sabe fazer — por isso
// cada conversão diz o que muda ANTES de aplicar.
//
// Só existe conversão onde há um elemento nativo à altura. Os demais ficam
// como visual da aba (que já se edita pelo painel: período, opções, filtros).
import {
  newBlock,
  newChartBlock,
  newPositivacaoChartBlock,
  type ChartBlock,
  type CustomBlock,
  type KpiMeasureId,
  type OmniBaseBlock,
  type OmniCustoComposicaoBlock,
  type OmniCustoEvolucaoBlock,
  type OmniFarolBlock,
  type OmniHeroisOfensoresBlock,
  type OmniPriceDecompBlock,
  type OmniMetric,
  type TabVisualBlock,
} from "@/lib/customSlide";
import { dimensionLabel } from "@/lib/crossFilter";
import { resolveTabVisualPeriods, tabVisualPeriodRange } from "@/lib/tabVisualPeriod";
import type { FilterKey, Filters, PricingRow } from "@/lib/types";
import { resolvePricePeriods } from "./precoData";
import { TAB_VISUAL_IDS } from "./registry";

export interface EditableConversion {
  /** O que o visual vira ("Gráfico combinado", "Matriz de portfólio"...). */
  target: string;
  /** O que muda ou se perde na conversão (mostrado antes de confirmar). */
  notes: string[];
  /** Monta o elemento novo (a posição e o tamanho vêm do bloco trocado). */
  build: () => CustomBlock;
}

interface Input {
  block: TabVisualBlock;
  deckRows: PricingRow[];
}

const OMNI_FILTER_KEYS: FilterKey[] = ["canal", "canalAjustado", "categoria", "subcategoria", "marca", "formato", "regional", "uf"];

function marginMeasure(metric: unknown): KpiMeasureId {
  return metric === "mb" ? "mbPct" : "cmPct";
}

function omniMetric(metric: unknown): OmniMetric {
  return metric === "mb" ? "mb" : "cm";
}

/** Tem filtro? (para avisar quando o elemento novo não guarda todos). */
function activeFilterEntries(filters: Filters): Array<[FilterKey, string[]]> {
  return (Object.entries(filters) as Array<[FilterKey, string[] | undefined]>)
    .filter((entry): entry is [FilterKey, string[]] => !!entry[1] && entry[1].length > 0);
}

/** Elementos "omni" guardam UM valor por dimensão e só 8 dimensões. */
function omniFilterFields(filters: Filters): { fields: Partial<OmniBaseBlock>; notes: string[] } {
  const fields: Record<string, string | null> = {};
  const notes: string[] = [];
  for (const [key, values] of activeFilterEntries(filters)) {
    if (!OMNI_FILTER_KEYS.includes(key)) {
      notes.push(`O filtro ${dimensionLabel(key)} não existe neste elemento e será descartado.`);
      continue;
    }
    fields[key] = values[0];
    if (values.length > 1) {
      notes.push(`${dimensionLabel(key)}: este elemento guarda um valor só — fica "${values[0]}" (eram ${values.length}).`);
    }
  }
  return { fields: fields as Partial<OmniBaseBlock>, notes };
}

/** Gráficos nativos mostram o histórico todo: a janela de meses não vai junto. */
function chartPeriodNotes({ block, deckRows }: Input, isHistoryVisual: boolean): string[] {
  if (isHistoryVisual) return [];
  const shown = resolveTabVisualPeriods(deckRows, block.period);
  if (shown == null) return [];
  return [`O gráfico editável mostra todo o histórico, não só ${tabVisualPeriodRange(deckRows, block.period)}.`];
}

/** Omni com meses: leva os meses mostrados agora, fixos. */
function omniPeriodFields({ block, deckRows }: Input, isHistoryVisual: boolean): { periodos: string[] | null; notes: string[] } {
  if (isHistoryVisual) return { periodos: null, notes: [] };
  const shown = resolveTabVisualPeriods(deckRows, block.period);
  if (shown == null) return { periodos: null, notes: [] };
  return {
    periodos: shown,
    notes: [`Os meses (${tabVisualPeriodRange(deckRows, block.period)}) ficam fixos no elemento — ele não anda mais com o mês de referência.`],
  };
}

/** O título do visual vira o do gráfico; sem título (já está no slide), o gráfico não repete. */
function applyChartTitle(chart: ChartBlock, block: TabVisualBlock): void {
  if (block.showTitle && block.title) {
    chart.title = block.title;
    return;
  }
  chart.style = { ...chart.style, general: { ...chart.style?.general, titleShow: false } } as ChartBlock["style"];
}

function chartBase(input: Input, type: ChartBlock["chartType"]): ChartBlock {
  const chart = newChartBlock(type, 0);
  chart.filters = { ...input.block.filters };
  applyChartTitle(chart, input.block);
  return chart;
}

function omniBase<T extends CustomBlock>(input: Input, kind: T["kind"], isHistory: boolean): { block: T; notes: string[] } {
  const base = newBlock(kind, 0) as unknown as T & OmniBaseBlock;
  const { fields, notes: filterNotes } = omniFilterFields(input.block.filters ?? {});
  const { periodos, notes: periodNotes } = omniPeriodFields(input, isHistory);
  Object.assign(base, fields, { periodos });
  if (input.block.showTitle && input.block.title) base.title = input.block.title;
  base.showTitle = !!input.block.showTitle;
  return { block: base as T, notes: [...filterNotes, ...periodNotes] };
}

type Converter = (input: Input) => EditableConversion | null;

const CONVERTERS: Record<string, Converter> = {
  [TAB_VISUAL_IDS.evolucaoMensal]: (input) => ({
    target: "Gráfico combinado (colunas + linhas, 2 eixos)",
    notes: chartPeriodNotes(input, false),
    build: () => {
      const metric = input.block.params.metric;
      const chart = chartBase(input, "combo");
      chart.measure = "rol";
      chart.comboSeries = [
        { id: crypto.randomUUID(), name: "Volume (kg)", dataSource: "ke30", measure: "volume", asLine: false },
        { id: crypto.randomUUID(), name: "ROL (R$)", dataSource: "ke30", measure: "rol", asLine: true },
        { id: crypto.randomUUID(), name: "Margem %", dataSource: "ke30", measure: marginMeasure(metric), asLine: true, secondaryAxis: true },
      ];
      return chart;
    },
  }),

  [TAB_VISUAL_IDS.canalTrend]: (input) => ({
    target: "Gráfico de linhas por canal",
    notes: [],
    build: () => {
      const chart = chartBase(input, "line");
      const cm = input.block.params.chartMetric;
      chart.measure = cm === "rol" ? "rol" : cm === "volumeKg" ? "volume" : marginMeasure(input.block.params.metric);
      chart.breakdown = "canalAjustado";
      chart.autoFit = false;
      chart.maxSeries = 8;
      chart.showOthers = true;
      return chart;
    },
  }),

  [TAB_VISUAL_IDS.canalMix]: (input) => ({
    target: "Gráfico de colunas empilhadas por canal",
    notes: ["Mostra o ROL de cada canal em R$ empilhado, não a participação em % de cada mês."],
    build: () => {
      const chart = chartBase(input, "stackedColumn");
      chart.measure = "rol";
      chart.breakdown = "canalAjustado";
      chart.autoFit = false;
      chart.maxSeries = 8;
      chart.showOthers = true;
      return chart;
    },
  }),

  [TAB_VISUAL_IDS.inovMix]: (input) => ({
    target: "Gráfico de colunas empilhadas (Inovação × Regular)",
    notes: [...chartPeriodNotes(input, false), "Mostra o volume em kg de cada grupo empilhado, não a participação em %."],
    build: () => {
      const chart = chartBase(input, "stackedColumn");
      chart.measure = "volume";
      chart.breakdown = "inovacao";
      return chart;
    },
  }),

  [TAB_VISUAL_IDS.inovMargem]: (input) => ({
    target: "Gráfico de linhas (margem % Inovação × Regular por mês)",
    notes: [...chartPeriodNotes(input, false), "Vira a margem % mês a mês de cada grupo; o bridge do efeito do mix de inovação não vai junto."],
    build: () => {
      const chart = chartBase(input, "line");
      chart.measure = marginMeasure(input.block.params.metric);
      chart.breakdown = "inovacao";
      return chart;
    },
  }),

  [TAB_VISUAL_IDS.inovPreco]: (input) => ({
    target: "Gráfico de linhas (preço médio Inovação × Regular)",
    notes: [...chartPeriodNotes(input, false), "Os dois cartões de preço (R$/kg) não vão junto."],
    build: () => {
      const chart = chartBase(input, "line");
      chart.measure = "precoMedio";
      chart.breakdown = "inovacao";
      return chart;
    },
  }),

  [TAB_VISUAL_IDS.positivacao]: (input) => ({
    target: "Gráfico de linhas de positivação",
    notes: [],
    build: () => {
      const chart = newPositivacaoChartBlock(0);
      chart.filters = { ...input.block.filters };
      chart.breakdown = typeof input.block.params.dim === "string" ? input.block.params.dim : "categoria";
      applyChartTitle(chart, input.block);
      return chart;
    },
  }),

  [TAB_VISUAL_IDS.precoEvolucao]: (input) => ({
    target: "Gráfico de linhas do preço médio",
    notes: input.block.params.dim === "canal" ? ["Agrupa por canal ajustado."] : [],
    build: () => {
      const chart = chartBase(input, "line");
      chart.measure = "precoMedio";
      const dim = input.block.params.dim;
      chart.breakdown = dim === "marca" ? "marca" : dim === "canal" ? "canalAjustado" : null;
      chart.autoFit = false;
      chart.maxSeries = 6;
      return chart;
    },
  }),

  [TAB_VISUAL_IDS.sazonalidade]: (input) => {
    const { block, notes } = omniBase<CustomBlock & { metric: OmniMetric }>(input, "omni_heatmap_sazonalidade", false);
    const mb = input.block.params.metric === "mb";
    return {
      target: "Heatmap de sazonalidade",
      notes: [...notes, ...(mb ? ["O heatmap editável usa contribuição marginal %, não margem bruta %."] : [])],
      build: () => { block.metric = "margemPct"; return block; },
    };
  },

  [TAB_VISUAL_IDS.herois]: (input) => {
    const { block, notes } = omniBase<OmniHeroisOfensoresBlock>(input, "omni_herois_ofensores", false);
    return {
      target: "Heróis e ofensores",
      notes,
      build: () => {
        block.variant = input.block.params.variant === "villain" ? "villain" : "hero";
        block.sortBy = "margemPct";
        block.dim = "skuDesc";
        block.topN = 5;
        block.metric = omniMetric(input.block.params.metric);
        return block;
      },
    };
  },

  [TAB_VISUAL_IDS.custoKg]: (input) => {
    const { block, notes } = omniBase<OmniCustoEvolucaoBlock>(input, "omni_custo_evolucao", true);
    return { target: "Evolução de custos (por kg)", notes, build: () => { block.viewMode = "kg"; return block; } };
  },
  [TAB_VISUAL_IDS.custoPressao]: (input) => {
    const { block, notes } = omniBase<CustomBlock>(input, "omni_custo_pressao", true);
    return { target: "Pressão de custo sobre a receita", notes, build: () => block };
  },
  [TAB_VISUAL_IDS.custoComposicao]: (input) => {
    const { block, notes } = omniBase<OmniCustoComposicaoBlock>(input, "omni_custo_composicao", true);
    return { target: "Composição de custos", notes, build: () => { block.viewMode = "abs"; return block; } };
  },

  [TAB_VISUAL_IDS.precoDecomp]: (input) => {
    const { block, notes } = omniBase<OmniPriceDecompBlock>(input, "omni_price_decomp", true);
    const { base, comp, periodMode } = resolvePricePeriods(input.block.params, input.deckRows);
    return {
      target: "Decomposição de preço",
      notes: [...notes, ...(input.block.params.follow === "fixed" ? [] : ["Base e comparação ficam fixas nos períodos de agora — não avançam mais com o mês de referência."])],
      build: () => {
        block.base = base;
        block.comp = comp;
        block.periodMode = periodMode;
        block.baseSelectionMode = "fixed";
        block.compSelectionMode = "fixed";
        return block;
      },
    };
  },

  [TAB_VISUAL_IDS.farol]: (input) => {
    const { block, notes } = omniBase<OmniFarolBlock>(input, "omni_farol", true);
    const p = input.block.params;
    return {
      target: "Farol de positivação",
      notes: [
        ...notes,
        ...(typeof p.categoria === "string" && p.categoria ? ["O filtro de categoria do farol não existe neste elemento e será descartado."] : []),
      ],
      build: () => {
        block.skuRef = typeof p.skuRef === "string" ? p.skuRef : null;
        block.skuComp = typeof p.skuComp === "string" ? p.skuComp : null;
        block.periodoMeses = typeof p.periodoMeses === "number" ? p.periodoMeses : 3;
        if (typeof p.canal === "string" && p.canal) block.canal = p.canal;
        block.metric = omniMetric(p.metric);
        return block;
      },
    };
  },

  [TAB_VISUAL_IDS.abcMatriz]: (input) => {
    const { block, notes } = omniBase<CustomBlock & { metric: OmniMetric; dim: string }>(input, "omni_portfolio_matrix", false);
    return {
      target: "Matriz de portfólio",
      notes,
      build: () => { block.metric = omniMetric(input.block.params.metric); block.dim = "skuDesc"; return block; },
    };
  },
  [TAB_VISUAL_IDS.abcCurva]: (input) => {
    const { block, notes } = omniBase<CustomBlock & { metric: OmniMetric; dim: string }>(input, "omni_abc_curva", false);
    return { target: "Curva ABC (Pareto)", notes, build: () => { block.metric = "rol"; block.dim = "skuDesc"; return block; } };
  },
};

/** Há elemento nativo para este visual? */
export function canConvertToEditable(visualId: string): boolean {
  return visualId in CONVERTERS;
}

/** A conversão pronta para confirmar, ou `null` se o visual não tem equivalente. */
export function getEditableConversion(block: TabVisualBlock, deckRows: PricingRow[]): EditableConversion | null {
  const convert = CONVERTERS[block.visualId];
  return convert ? convert({ block, deckRows }) : null;
}
