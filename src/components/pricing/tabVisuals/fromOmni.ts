// Elementos "Omni Analytics" antigos → visual igual à aba (TabVisualBlock).
//
// Os elementos Omni eram cópias reescritas dos gráficos das abas e foram se
// afastando delas (uma série só, um valor por filtro...). Saíram da paleta; os
// decks que já os têm continuam desenhando, e este módulo troca cada um pelo
// visual do catálogo que mostra o mesmo conteúdo — dizendo antes o que muda.
import {
  type CustomBlock,
  type OmniBaseBlock,
  type OmniBlock,
  type TabVisualBlock,
} from "@/lib/customSlide";
import { dimensionLabel } from "@/lib/crossFilter";
import type { Filters, FilterKey, PricingRow } from "@/lib/types";
import { defaultPriceParams } from "./precoData";
import { getTabVisual, newTabVisualBlock, TAB_VISUAL_IDS } from "./registry";

export interface LegacyConversion {
  /** Nome do visual que o elemento passa a ser. */
  target: string;
  /** O que muda ou se perde (mostrado antes de confirmar). */
  notes: string[];
  build: () => CustomBlock;
}

const FILTER_FIELDS: FilterKey[] = ["canal", "canalAjustado", "categoria", "subcategoria", "marca", "formato", "regional", "uf"];

function filtersOf(block: OmniBaseBlock): Filters {
  const out: Filters = {};
  for (const key of FILTER_FIELDS) {
    const value = block[key as keyof OmniBaseBlock];
    if (typeof value === "string" && value) out[key] = [value];
  }
  return out;
}

const marginMetric = (metric: unknown) => (metric === "mb" ? "mb" : "cm");

interface Mapping {
  visualId: string;
  params?: (deckRows: PricingRow[]) => Record<string, unknown>;
  notes?: string[];
}

function mappingFor(block: OmniBlock): Mapping | null {
  switch (block.kind) {
    case "omni_evolucao_mensal":
      return {
        visualId: TAB_VISUAL_IDS.evolucaoMensal,
        params: () => ({ metric: marginMetric(block.metric) }),
        notes: [
          ...(block.breakdown ? [`A quebra por ${dimensionLabel(block.breakdown)} não existe no visual da aba: ele mostra o total.`] : []),
          "O visual da aba combina volume (colunas) com ROL e margem % (linhas), em vez de uma série só.",
        ],
      };
    case "omni_heatmap_sazonalidade":
      return { visualId: TAB_VISUAL_IDS.sazonalidade, params: () => ({ metric: marginMetric(block.metric) }) };
    case "omni_herois_ofensores":
      return {
        visualId: TAB_VISUAL_IDS.herois,
        params: () => ({ variant: block.variant === "villain" ? "villain" : "hero", metric: marginMetric(block.metric) }),
        notes: [
          ...(block.variant === "both" ? ["Mostrava heróis e ofensores juntos; o visual da aba mostra um por vez (fica Heróis — duplique e troque para ter os dois)."] : []),
          ...(block.sortBy !== "margemPct" || block.topN !== 5 ? ["O visual da aba é sempre o Top 5 por margem %."] : []),
        ],
      };
    case "omni_positivacao":
      return {
        visualId: TAB_VISUAL_IDS.positivacao,
        params: () => ({ dim: block.dim }),
        notes: block.chartType !== "line" ? ["O visual da aba é sempre de linhas."] : [],
      };
    case "omni_canal_trend":
      return { visualId: TAB_VISUAL_IDS.canalTrend, params: () => ({ chartMetric: "margemPct", metric: marginMetric(block.metric) }) };
    case "omni_canal_mix":
      return { visualId: TAB_VISUAL_IDS.canalMix };
    case "omni_custo_evolucao":
      return {
        visualId: block.viewMode === "pct" ? TAB_VISUAL_IDS.custoPressao : TAB_VISUAL_IDS.custoKg,
        notes: block.viewMode === "abs" ? ["Mostrava o custo em R$; o visual da aba mostra o custo por kg."] : [],
      };
    case "omni_custo_composicao":
      return { visualId: TAB_VISUAL_IDS.custoComposicao, notes: block.viewMode === "pct" ? ["O visual da aba mostra a composição em R$, não em % do ROL."] : [] };
    case "omni_custo_pressao":
      return {
        visualId: TAB_VISUAL_IDS.custoPressao,
        notes: !block.showCustoVariavel || !block.showCustoFixo ? ["O visual da aba mostra custo variável e fixo juntos."] : [],
      };
    case "omni_price_decomp":
      return {
        visualId: TAB_VISUAL_IDS.precoDecomp,
        params: (rows) => ({
          ...defaultPriceParams(rows),
          ...(block.base && block.comp && block.baseSelectionMode === "fixed" && block.compSelectionMode === "fixed"
            ? { base: block.base, comp: block.comp, periodMode: block.periodMode === "fy" ? "fy" : "month", follow: "fixed" }
            : {}),
        }),
        notes: ["Sem períodos fixos, base e comparação ficam nos dois meses mais recentes e avançam com o mês de referência."],
      };
    case "omni_uf_map":
      return {
        visualId: TAB_VISUAL_IDS.ufMapa,
        params: defaultPriceParams,
        notes: ["Mostra a margem por UF no último mês, comparado ao anterior, e avança com o mês de referência."],
      };
    case "omni_farol":
      return {
        visualId: TAB_VISUAL_IDS.farol,
        params: () => ({
          skuRef: block.skuRef,
          skuComp: block.skuComp,
          periodoMeses: block.periodoMeses,
          metric: marginMetric(block.metric),
          canal: block.canal,
        }),
      };
    case "omni_abc_curva":
      return { visualId: TAB_VISUAL_IDS.abcCurva, params: () => ({ metric: "rol" }) };
    case "omni_portfolio_matrix":
      return { visualId: TAB_VISUAL_IDS.abcMatriz, params: () => ({ metric: marginMetric(block.metric) }) };
    // Sem equivalente no catálogo.
    case "omni_bridge_pvm":
    case "omni_abc_bars":
      return null;
  }
}

/** Há visual da aba equivalente a este elemento Omni? */
export function canConvertOmni(block: CustomBlock): boolean {
  return block.kind.startsWith("omni_") && mappingFor(block as OmniBlock) !== null;
}

/** A troca pronta para confirmar, ou `null` se o elemento não tem equivalente. */
export function getLegacyConversion(block: CustomBlock, deckRows: PricingRow[]): LegacyConversion | null {
  if (!block.kind.startsWith("omni_")) return null;
  const omni = block as OmniBlock;
  const mapping = mappingFor(omni);
  if (!mapping) return null;
  const notes = [...(mapping.notes ?? [])];

  const filters = filtersOf(omni);
  const periods = omni.periodos?.length ? [...omni.periodos] : null;

  return {
    target: getTabVisual(mapping.visualId)?.title ?? mapping.visualId,
    notes: [
      ...notes,
      ...(periods ? [`Os meses escolhidos (${periods.length}) ficam travados no visual.`] : []),
    ],
    build: () => {
      const next = newTabVisualBlock(mapping.visualId, deckRows) as TabVisualBlock;
      const built: TabVisualBlock = {
        ...next,
        params: { ...next.params, ...mapping.params?.(deckRows) },
        filters,
        useGlobalFilter: omni.useGlobalFilter,
        period: periods ? { mode: "locked", periods } : next.period,
        showTitle: !!omni.showTitle,
        title: omni.title?.trim() ? omni.title : next.title,
        // Posição e tamanho vêm do elemento trocado (replaceBlockAction).
        x: omni.x, y: omni.y, w: omni.w, h: omni.h, z: omni.z,
      };
      return built;
    },
  };
}
