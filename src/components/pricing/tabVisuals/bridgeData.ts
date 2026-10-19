// Dados dos visuais do Bridge PVM (cartões de efeito e rankings), usados pela
// aba e pelo slide. Como na aba, o Bridge ignora os meses do filtro global:
// compara exclusivamente os períodos base e comparação (mês ou ano fiscal).
import { applyFilters, calcPVM, type PVMResult, type PVMSkuDetail } from "@/lib/analytics";
import { parsePeriodo } from "@/lib/deckPeriod";
import { monthLabel } from "@/lib/format";
import type { Metric, PricingRow } from "@/lib/types";
import type { TabVisualContext } from "./registry";
import { resolvePricePeriods } from "./precoData";

export type BridgeEffectId = "volume" | "price" | "cost" | "freight" | "commission" | "others";

export const BRIDGE_EFFECT_ORDER: BridgeEffectId[] = ["volume", "price", "cost", "freight", "commission", "others"];

/** Texto de cada cartão de efeito (rótulo e dica de cálculo). */
export const BRIDGE_EFFECT_INFO: Record<BridgeEffectId, { label: string; description: string }> = {
  volume: {
    label: "Δ Volume",
    description:
      "Impacto na margem causado pela variação de volume vendido entre os dois períodos. Positivo = vendeu mais; negativo = vendeu menos.",
  },
  price: {
    label: "Δ Preço",
    description:
      "Impacto causado pela variação no preço médio de realização (ROL/kg). Positivo = preço médio subiu; negativo = preço médio caiu.",
  },
  cost: {
    label: "Δ Custo Var.",
    description:
      "Impacto causado pela variação no custo variável unitário (CV/kg). Positivo = custo caiu (ganho); negativo = custo subiu (pressão).",
  },
  freight: {
    label: "Δ Frete",
    description:
      "Variação no custo de frete unitário entre os períodos. Positivo = frete caiu; negativo = frete subiu.",
  },
  commission: {
    label: "Δ Comissão",
    description:
      "Variação na comissão comercial unitária. Positivo = comissão caiu; negativo = comissão subiu.",
  },
  others: {
    label: "Δ Outros",
    description:
      "Efeitos residuais de mix e outros componentes não capturados nos demais efeitos.",
  },
};

export interface BridgeEffectCardData {
  id: BridgeEffectId;
  label: string;
  description: string;
  value: number;
  /** Participação do efeito na soma dos efeitos em módulo (0–100). */
  share: number;
}

export interface BridgeEffectsData {
  baseLabel: string;
  currentLabel: string;
  cards: BridgeEffectCardData[];
}

// ── Ranking (heróis e ofensores por efeito) ──────────────────────────────

export type BridgeRankingEffect = "volumeEffect" | "priceEffect" | "costEffect" | "othersEffect";
export type BridgeRankingLevel = "categoria" | "sku";

export const BRIDGE_RANKING_EFFECTS: Array<{ key: BridgeRankingEffect; label: string; subtitle: string }> = [
  { key: "volumeEffect", label: "Efeito Volume", subtitle: "Impacto da variação de volume sobre a margem." },
  { key: "priceEffect", label: "Efeito Preço", subtitle: "Impacto da realização de preço no período comparado." },
  { key: "costEffect", label: "Efeito Custo Variável", subtitle: "Ganhos e pressões vindos do custo variável unitário." },
  { key: "othersEffect", label: "Mix e Resíduo Comercial", subtitle: "SKUs não comparáveis, baixo volume e resíduo de mix/comercial." },
];

export interface BridgeRankingItem {
  id: string;
  name: string;
  subLabel?: string;
  volumeEffect: number;
  priceEffect: number;
  costEffect: number;
  othersEffect: number;
}

export interface BridgeRankingData {
  level: BridgeRankingLevel;
  effect: BridgeRankingEffect;
  title: string;
  subtitle: string;
  heroes: BridgeRankingItem[];
  offenders: BridgeRankingItem[];
}

function periodLabel(periodo: string): string {
  const p = parsePeriodo(periodo);
  return p ? monthLabel(p.mes, p.ano) : periodo;
}

export interface BridgeScope {
  result: PVMResult;
  /** Linhas já filtradas (sem corte de mês) — usadas para achar a categoria de cada SKU. */
  rows: PricingRow[];
  base: string;
  comp: string;
  periodMode: "fy" | "month";
}

/** Metric das opções do visual. */
export function bridgeMetricOf(params: Record<string, unknown>): Metric {
  return params.metric === "mb" ? "mb" : "cm";
}

/**
 * O resultado do Bridge para as opções do visual. `null` quando base e
 * comparação não estão definidas (ou são iguais), como na aba.
 */
export function computeBridgeScope(params: Record<string, unknown>, ctx: TabVisualContext): BridgeScope | null {
  const { base, comp, periodMode } = resolvePricePeriods(params, ctx.allRows);
  if (!base || !comp || base === comp) return null;
  const rows = applyFilters(ctx.allRows, ctx.filters, null);
  const labels = periodMode === "month" ? { base: periodLabel(base), comp: periodLabel(comp) } : undefined;
  return { result: calcPVM(rows, bridgeMetricOf(params), base, comp, periodMode, labels), rows, base, comp, periodMode };
}

export function computeBridgeEffects(scope: BridgeScope | null): BridgeEffectsData | null {
  if (!scope) return null;
  const { result } = scope;
  const totalAbs = BRIDGE_EFFECT_ORDER.reduce((sum, id) => sum + Math.abs(result[id]), 0);
  return {
    baseLabel: result.baseLabel,
    currentLabel: result.currentLabel,
    cards: BRIDGE_EFFECT_ORDER.map((id) => ({
      id,
      label: BRIDGE_EFFECT_INFO[id].label,
      description: BRIDGE_EFFECT_INFO[id].description,
      value: result[id],
      share: totalAbs > 0 ? (Math.abs(result[id]) / totalAbs) * 100 : 0,
    })),
  };
}

export function skuRankingItems(details: PVMSkuDetail[]): BridgeRankingItem[] {
  return details.map((item) => ({
    id: item.sku,
    name: item.skuDesc?.trim() || item.sku,
    subLabel: item.skuDesc?.trim() ? item.sku : undefined,
    volumeEffect: item.volumeEffect,
    priceEffect: item.priceEffect,
    costEffect: item.costEffect,
    othersEffect: item.othersEffect,
  }));
}

export function categoryRankingItems(
  details: PVMSkuDetail[],
  rows: PricingRow[],
  base: string | null,
  comp: string | null,
  mode: "fy" | "month",
): BridgeRankingItem[] {
  const categoryBySku = new Map<string, string>();
  const isComp = (row: PricingRow) => (mode === "fy" ? row.fy : row.periodo) === comp;
  const isBase = (row: PricingRow) => (mode === "fy" ? row.fy : row.periodo) === base;
  const remember = (row: PricingRow) => {
    const sku = row.sku || row.skuDesc;
    if (!sku) return;
    const category = row.categoria?.trim() || "Sem categoria";
    if (!categoryBySku.has(sku)) categoryBySku.set(sku, category);
  };

  rows.filter(isComp).forEach(remember);
  rows.filter(isBase).forEach(remember);
  rows.forEach(remember);

  const grouped = new Map<string, BridgeRankingItem>();
  details.forEach((item) => {
    const category = categoryBySku.get(item.sku) ?? "Sem categoria";
    const current = grouped.get(category) ?? {
      id: category,
      name: category,
      volumeEffect: 0,
      priceEffect: 0,
      costEffect: 0,
      othersEffect: 0,
    };
    current.volumeEffect += item.volumeEffect;
    current.priceEffect += item.priceEffect;
    current.costEffect += item.costEffect;
    current.othersEffect += item.othersEffect;
    grouped.set(category, current);
  });

  return Array.from(grouped.values());
}

/** Os 5 maiores ganhos e as 5 maiores pressões de um efeito. */
export function topBridgeItems(items: BridgeRankingItem[], effect: BridgeRankingEffect, top = 5) {
  return {
    heroes: [...items].filter((i) => i[effect] > 0).sort((a, b) => b[effect] - a[effect]).slice(0, top),
    offenders: [...items].filter((i) => i[effect] < 0).sort((a, b) => a[effect] - b[effect]).slice(0, top),
  };
}

export function bridgeRankingEffectOf(params: Record<string, unknown>): BridgeRankingEffect {
  return BRIDGE_RANKING_EFFECTS.some((e) => e.key === params.effect) ? (params.effect as BridgeRankingEffect) : "volumeEffect";
}

export function computeBridgeRanking(
  scope: BridgeScope | null,
  level: BridgeRankingLevel,
  effect: BridgeRankingEffect,
): BridgeRankingData | null {
  if (!scope) return null;
  const meta = BRIDGE_RANKING_EFFECTS.find((e) => e.key === effect)!;
  const items = level === "sku"
    ? skuRankingItems(scope.result.skuDetails)
    : categoryRankingItems(scope.result.skuDetails, scope.rows, scope.base, scope.comp, scope.periodMode);
  return { level, effect, title: meta.label, subtitle: meta.subtitle, ...topBridgeItems(items, effect) };
}
