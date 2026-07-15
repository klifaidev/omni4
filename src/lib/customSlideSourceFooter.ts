import type { BlockDataSource, CustomBlock, CustomSlideConfig } from "./customSlide";
import { monthLabel } from "./format";
import { resolvePeriodValue, resolvePeriodValues } from "./relativePeriods";
import type { PricingRow } from "./types";

export type SlideSourceFooterMode = "auto" | "manual";

export interface SlideSourceFooterConfig {
  mode?: SlideSourceFooterMode;
  manualText?: string;
}

export type SourceRowsByDataSource = Record<BlockDataSource, readonly PricingRow[]>;

const SOURCE_LABELS: Record<BlockDataSource, string> = {
  ke30: "KE30",
  budget: "Superbase",
  budget_real: "Superbase",
  forecast: "Forecast",
  rolling: "Rolling",
};

const SOURCE_ORDER: BlockDataSource[] = ["ke30", "budget", "budget_real", "forecast", "rolling"];

function isDataSource(value: unknown): value is BlockDataSource {
  return value === "ke30"
    || value === "budget"
    || value === "budget_real"
    || value === "forecast"
    || value === "rolling";
}

function blockDataSources(block: CustomBlock): BlockDataSource[] {
  const sources = new Set<BlockDataSource>();
  if ("dataSource" in block && isDataSource(block.dataSource)) sources.add(block.dataSource);
  if (block.kind === "chart" && Array.isArray(block.comboSeries)) {
    block.comboSeries.forEach((series) => {
      if (isDataSource(series.dataSource)) sources.add(series.dataSource);
    });
  }
  if (block.kind === "bridge") sources.add("ke30");
  return Array.from(sources);
}

function monthRank(period: string): number {
  const [mesRaw, anoRaw] = period.split(".");
  const mes = Number(mesRaw);
  const ano = Number(anoRaw);
  return Number.isFinite(mes) && Number.isFinite(ano) ? ano * 100 + mes : Number.NEGATIVE_INFINITY;
}

function periodLabel(period: string): string {
  const [mesRaw, anoRaw] = period.split(".");
  const mes = Number(mesRaw);
  const ano = Number(anoRaw);
  return Number.isFinite(mes) && Number.isFinite(ano) ? monthLabel(mes, ano) : period;
}

function allRowsPeriodRange(rows: readonly PricingRow[]): string[] {
  const periods = Array.from(new Set(rows.map((row) => row.periodo).filter(Boolean)));
  return periods.sort((a, b) => monthRank(a) - monthRank(b));
}

function addResolvedPeriod(periods: Set<string>, value: string | null | undefined): void {
  if (value) periods.add(value);
}

function addBlockPeriods(block: CustomBlock, rows: readonly PricingRow[], periods: Set<string>): void {
  if (block.kind === "kpi" || block.kind === "topSku") {
    if (block.periodMode === "all") return;
    addResolvedPeriod(periods, resolvePeriodValue(
      rows,
      block.periodMode ?? "month",
      block.periodValue,
      block.periodSelectionMode,
      block.relativePeriod,
    ));
    return;
  }

  if (block.kind === "dre") {
    const values = resolvePeriodValues(rows, block.periodos, block.periodosSelectionMode, block.periodosRelativePeriod);
    values?.forEach((period) => periods.add(period));
    return;
  }

  if (block.kind === "bridge") {
    addResolvedPeriod(periods, resolvePeriodValue(rows, block.mode, block.base, block.baseSelectionMode, block.baseRelativePeriod));
    addResolvedPeriod(periods, resolvePeriodValue(rows, block.mode, block.comp, block.compSelectionMode, block.compRelativePeriod));
    return;
  }

  if (block.kind === "omni_price_decomp" || block.kind === "omni_bridge_pvm") {
    addResolvedPeriod(periods, resolvePeriodValue(rows, block.periodMode, block.base, block.baseSelectionMode, block.baseRelativePeriod));
    addResolvedPeriod(periods, resolvePeriodValue(rows, block.periodMode, block.comp, block.compSelectionMode, block.compRelativePeriod));
    return;
  }

  if (block.kind.startsWith("omni_") && "periodos" in block) {
    block.periodos?.forEach((period) => periods.add(period));
  }
}

function formatRange(periods: Iterable<string>, rows: readonly PricingRow[]): string {
  const resolved = Array.from(periods).filter(Boolean).sort((a, b) => monthRank(a) - monthRank(b));
  const safe = resolved.length > 0 ? resolved : allRowsPeriodRange(rows);
  if (safe.length === 0) return "";
  const first = safe[0];
  const last = safe[safe.length - 1];
  return first === last ? periodLabel(first) : `${periodLabel(first)}–${periodLabel(last)}`;
}

export function sourceFooterLabel(source: BlockDataSource): string {
  return SOURCE_LABELS[source];
}

export function buildAutomaticSourceFooterText(
  config: CustomSlideConfig,
  rowsBySource: SourceRowsByDataSource,
): string {
  const periodsBySource = new Map<BlockDataSource, Set<string>>();

  for (const block of config.blocks) {
    for (const source of blockDataSources(block)) {
      if (!periodsBySource.has(source)) periodsBySource.set(source, new Set<string>());
      addBlockPeriods(block, rowsBySource[source] ?? [], periodsBySource.get(source)!);
    }
  }

  return SOURCE_ORDER
    .filter((source) => periodsBySource.has(source))
    .map((source) => {
      const range = formatRange(periodsBySource.get(source) ?? [], rowsBySource[source] ?? []);
      return range ? `${sourceFooterLabel(source)} (${range})` : sourceFooterLabel(source);
    })
    .join(" · ");
}

export function getSourceFooterText(
  config: CustomSlideConfig,
  rowsBySource: SourceRowsByDataSource,
): string {
  if (config.sourceFooter?.mode === "manual") return config.sourceFooter.manualText?.trim() ?? "";
  return buildAutomaticSourceFooterText(config, rowsBySource);
}
