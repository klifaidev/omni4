import {
  newBlock,
  type ChartBlock,
  type CustomBlock,
  type CustomBlockKind,
  type CustomSlideConfig,
  type DreBlock,
  type KpiMeasureId,
  type OmniBaseBlock,
  type TableBlock,
  type TopSkuBlock,
} from "@/lib/customSlide";
import {
  DEFAULT_BASE_RELATIVE_MONTH_PRESET,
  DEFAULT_RELATIVE_MONTH_PRESET,
  type PeriodSelectionMode,
  type RelativePeriodPreset,
} from "@/lib/relativePeriods";
import type { Filters, FilterKey } from "@/lib/types";
import type { BridgePvmSlideConfig, BudgetEvoSlideConfig, SlideItem } from "@/lib/slidesFlow";
import type { SendToSlidePayload, SendToSlideTargetKind } from "@/lib/sendToSlide";

const KPI_MEASURES = new Set<KpiMeasureId>([
  "rol",
  "volume",
  "cm",
  "mb",
  "cv",
  "frete",
  "comissao",
  "cmPct",
  "mbPct",
  "precoMedio",
  "positivacao",
  "ticketMedio",
]);

const FILTER_KEYS: FilterKey[] = [
  "marca",
  "canal",
  "canalAjustado",
  "categoria",
  "subcategoria",
  "formato",
  "sku",
  "gestorResp",
  "regiao",
  "uf",
  "regional",
  "mercado",
  "mercadoAjustado",
  "sabor",
  "tecnologia",
  "faixaPeso",
  "inovacao",
  "legado",
];

const RELATIVE_PRESETS = new Set<RelativePeriodPreset>([
  "latest_month",
  "latest_month_minus_1",
  "latest_month_minus_2",
  "latest_month_minus_3",
  "latest_month_minus_6",
  "latest_fy",
  "latest_fy_minus_1",
  "latest_fy_minus_2",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return out.length ? out : null;
}

function asSelectionMode(value: unknown): PeriodSelectionMode | null {
  return value === "relative" || value === "fixed" ? value : null;
}

function asRelativePeriod(value: unknown): RelativePeriodPreset | null {
  const preset = asString(value);
  return preset && RELATIVE_PRESETS.has(preset as RelativePeriodPreset) ? (preset as RelativePeriodPreset) : null;
}

function asFilters(value: unknown): Filters {
  if (!isRecord(value)) return {};
  const filters: Filters = {};
  for (const key of FILTER_KEYS) {
    const values = asStringArray(value[key]);
    if (values) filters[key] = values;
  }
  return filters;
}

function asKpiMeasure(value: unknown): KpiMeasureId | null {
  const measure = asString(value);
  return measure && KPI_MEASURES.has(measure as KpiMeasureId) ? (measure as KpiMeasureId) : null;
}

function filtersToOmniFields(filters: Filters, selectedPeriods: string[] | null): Partial<OmniBaseBlock> {
  const one = (key: FilterKey) => filters[key]?.[0] ?? null;
  return {
    periodos: selectedPeriods,
    canal: one("canal"),
    canalAjustado: one("canalAjustado"),
    categoria: one("categoria"),
    subcategoria: one("subcategoria"),
    marca: one("marca"),
    formato: one("formato"),
    regional: one("regional"),
    uf: one("uf"),
  };
}

function defaultRelativePresetForMode(mode: "month" | "fy"): RelativePeriodPreset {
  return mode === "fy" ? "latest_fy_minus_1" : DEFAULT_RELATIVE_MONTH_PRESET;
}

function defaultBaseRelativePresetForMode(mode: "month" | "fy"): RelativePeriodPreset {
  return mode === "fy" ? "latest_fy_minus_2" : DEFAULT_BASE_RELATIVE_MONTH_PRESET;
}

function periodModeFromPayload(payload: SendToSlidePayload): "month" | "fy" {
  return asString(payload.config.periodMode) === "fy" ? "fy" : "month";
}

function periodSelectionFromPayload(payload: SendToSlidePayload) {
  const periodMode = periodModeFromPayload(payload);
  const periodSelectionMode =
    asSelectionMode(payload.config.periodSelectionMode)
    ?? asSelectionMode(payload.config.periodosSelectionMode);
  const relativePeriod =
    asRelativePeriod(payload.config.relativePeriod)
    ?? asRelativePeriod(payload.config.periodosRelativePeriod)
    ?? defaultRelativePresetForMode(periodMode);
  const selectedPeriods = asStringArray(payload.config.selectedPeriods);

  if (periodSelectionMode === "relative") {
    return {
      periodMode,
      periodos: null,
      periodosSelectionMode: "relative" as const,
      periodosRelativePeriod: relativePeriod,
      periodValue: null,
      periodSelectionMode: "relative" as const,
      relativePeriod,
    };
  }

  return {
    periodMode,
    periodos: selectedPeriods,
    periodosSelectionMode: selectedPeriods ? ("fixed" as const) : undefined,
    periodosRelativePeriod: undefined,
    periodValue: selectedPeriods?.length === 1 ? selectedPeriods[0] : null,
    periodSelectionMode: selectedPeriods?.length === 1 ? ("fixed" as const) : undefined,
    relativePeriod: undefined,
  };
}

function comparePeriodSelectionFromPayload(payload: SendToSlidePayload) {
  const periodMode = periodModeFromPayload(payload);
  const base = asString(payload.config.base);
  const comp = asString(payload.config.comp);
  const baseSelectionMode =
    asSelectionMode(payload.config.baseSelectionMode)
    ?? (base ? "fixed" : "relative");
  const compSelectionMode =
    asSelectionMode(payload.config.compSelectionMode)
    ?? (comp ? "fixed" : "relative");
  return {
    periodMode,
    base,
    comp,
    baseSelectionMode,
    baseRelativePeriod:
      asRelativePeriod(payload.config.baseRelativePeriod)
      ?? defaultBaseRelativePresetForMode(periodMode),
    compSelectionMode,
    compRelativePeriod:
      asRelativePeriod(payload.config.compRelativePeriod)
      ?? defaultRelativePresetForMode(periodMode),
  };
}

function targetToCustomKind(target: SendToSlideTargetKind): CustomBlockKind {
  if (target === "slide:bridge_pvm") return "omni_bridge_pvm";
  if (target === "slide:budget_evo") return "chart";
  return target;
}

function labelFromPayload(payload: SendToSlidePayload): string {
  return asString(payload.config.label) ?? payload.source.visualization;
}

export function canApplySendToSlideToExistingSlide(item: SlideItem, payload: SendToSlidePayload): boolean {
  if (item.kind === "custom") return true;
  if (payload.target.blockKind === "slide:bridge_pvm") return item.kind === "bridge_pvm";
  if (payload.target.blockKind === "slide:budget_evo") return item.kind === "budget_evo";
  return false;
}

export function sendToSlideCreatesNativeSlide(payload: SendToSlidePayload): boolean {
  return payload.target.blockKind === "slide:bridge_pvm" || payload.target.blockKind === "slide:budget_evo";
}

export function nativeSlideKindForPayload(payload: SendToSlidePayload): "bridge_pvm" | "budget_evo" | "custom" {
  if (payload.target.blockKind === "slide:bridge_pvm") return "bridge_pvm";
  if (payload.target.blockKind === "slide:budget_evo") return "budget_evo";
  return "custom";
}

export function buildNativeSlideConfigFromPayload(
  payload: SendToSlidePayload,
  item: SlideItem,
): SlideItem {
  const filters = asFilters(payload.config.filters);
  const comparePeriod = comparePeriodSelectionFromPayload(payload);
  if (item.kind === "bridge_pvm") {
    return {
      ...item,
      label: payload.source.visualization || item.label,
      config: {
        ...item.config,
        mode: comparePeriod.periodMode,
        base: comparePeriod.base,
        comp: comparePeriod.comp,
        filters,
      } satisfies BridgePvmSlideConfig,
    };
  }
  if (item.kind === "budget_evo") {
    return {
      ...item,
      label: payload.source.visualization || item.label,
      config: {
        ...item.config,
        start: asString(payload.config.start),
        end: asString(payload.config.end),
        filters,
      } satisfies BudgetEvoSlideConfig,
    };
  }
  return item;
}

export function buildCustomBlockFromPayload(payload: SendToSlidePayload, config: CustomSlideConfig): CustomBlock {
  const zTop = config.blocks.reduce((max, block) => Math.max(max, block.z), 0);
  const kind = targetToCustomKind(payload.target.blockKind);
  const block = newBlock(kind, zTop);
  const filters = asFilters(payload.config.filters);
  const periodSelection = periodSelectionFromPayload(payload);
  const comparePeriod = comparePeriodSelectionFromPayload(payload);
  const title = payload.source.visualization;

  if ("title" in block) block.title = title;

  if (block.kind === "kpi") {
    const measure = asKpiMeasure(payload.config.measure);
    block.label = labelFromPayload(payload);
    block.filters = filters;
    block.dataSource = (asString(payload.config.dataSource) ?? "ke30") as typeof block.dataSource;
    if (measure) {
      block.source = "dynamic";
      block.measure = measure;
      block.periodMode = periodSelection.periodSelectionMode ? periodSelection.periodMode : block.periodMode;
      block.periodValue = periodSelection.periodValue;
      block.periodSelectionMode = periodSelection.periodSelectionMode;
      block.relativePeriod = periodSelection.relativePeriod;
    } else {
      block.source = "manual";
      block.manualValue = asString(payload.config.displayValue) ?? "";
    }
    return block;
  }

  if (block.kind === "chart") {
    const chart = block as ChartBlock;
    chart.title = title;
    chart.chartType = (asString(payload.config.chartType) ?? chart.chartType) as ChartBlock["chartType"];
    chart.measure = asKpiMeasure(payload.config.measure) ?? chart.measure;
    chart.breakdown = asString(payload.config.breakdown);
    chart.filters = filters;
    chart.dataSource = (asString(payload.config.dataSource) ?? chart.dataSource ?? "ke30") as ChartBlock["dataSource"];
    return chart;
  }

  if (block.kind === "table") {
    const table = block as TableBlock;
    table.filters = filters;
    table.dataSource = (asString(payload.config.dataSource) ?? table.dataSource ?? "ke30") as TableBlock["dataSource"];
    table.rowDims = [asString(payload.config.dimension) ?? table.rowDims[0] ?? "marca"];
    return table;
  }

  if (block.kind === "topSku") {
    const top = block as TopSkuBlock;
    top.title = title;
    top.filters = filters;
    top.dim = (asString(payload.config.dim) ?? top.dim) as TopSkuBlock["dim"];
    top.measure = asKpiMeasure(payload.config.measure) ?? top.measure;
    top.topN = asNumber(payload.config.topN) ?? top.topN;
    top.periodMode = periodSelection.periodSelectionMode ? periodSelection.periodMode : top.periodMode;
    top.periodValue = periodSelection.periodValue;
    top.periodSelectionMode = periodSelection.periodSelectionMode;
    top.relativePeriod = periodSelection.relativePeriod;
    return top;
  }

  if (block.kind === "dre") {
    const dre = block as DreBlock;
    dre.filters = filters;
    dre.periodos = periodSelection.periodos;
    dre.periodosSelectionMode = periodSelection.periodosSelectionMode;
    dre.periodosRelativePeriod = periodSelection.periodosRelativePeriod;
    dre.periodMode = periodSelection.periodMode;
    dre.showBudget = payload.config.showBudget === true;
    return dre;
  }

  if (block.kind.startsWith("omni_")) {
    const omni = block as CustomBlock & Partial<OmniBaseBlock>;
    Object.assign(omni, filtersToOmniFields(filters, periodSelection.periodos));
    if ("metric" in omni) omni.metric = (asString(payload.config.metric) ?? omni.metric) as OmniBaseBlock["metric"];
    if ("breakdown" in omni) omni.breakdown = asString(payload.config.breakdown);
    if ("dim" in omni) omni.dim = (asString(payload.config.dim) ?? omni.dim) as typeof omni.dim;
    if ("chartType" in omni) omni.chartType = (asString(payload.config.chartType) ?? omni.chartType) as typeof omni.chartType;
    if ("labelMode" in omni) omni.labelMode = (asString(payload.config.labelMode) ?? omni.labelMode) as typeof omni.labelMode;
    if ("variant" in omni) omni.variant = (asString(payload.config.variant) ?? omni.variant) as typeof omni.variant;
    if ("sortBy" in omni) omni.sortBy = (asString(payload.config.sortBy) ?? omni.sortBy) as typeof omni.sortBy;
    if ("topN" in omni) omni.topN = asNumber(payload.config.topN) ?? omni.topN;
    if ("viewMode" in omni) omni.viewMode = (asString(payload.config.viewMode) ?? omni.viewMode) as typeof omni.viewMode;
    if ("showCustoVariavel" in omni) omni.showCustoVariavel = payload.config.showCustoVariavel !== false;
    if ("showCustoFixo" in omni) omni.showCustoFixo = payload.config.showCustoFixo !== false;
    if ("base" in omni) omni.base = comparePeriod.base;
    if ("comp" in omni) omni.comp = comparePeriod.comp;
    if ("baseSelectionMode" in omni) omni.baseSelectionMode = comparePeriod.baseSelectionMode;
    if ("baseRelativePeriod" in omni) omni.baseRelativePeriod = comparePeriod.baseRelativePeriod;
    if ("compSelectionMode" in omni) omni.compSelectionMode = comparePeriod.compSelectionMode;
    if ("compRelativePeriod" in omni) omni.compRelativePeriod = comparePeriod.compRelativePeriod;
    if ("periodMode" in omni) omni.periodMode = periodSelection.periodMode;
    if ("skuRef" in omni) omni.skuRef = asString(payload.config.skuRef);
    if ("skuComp" in omni) omni.skuComp = asString(payload.config.skuComp);
    if ("periodoMeses" in omni) omni.periodoMeses = asNumber(payload.config.periodoMeses) ?? omni.periodoMeses;
    return block;
  }

  return block;
}
