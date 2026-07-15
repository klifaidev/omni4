import type { BlockDataSource, CustomBlock, CustomSlideConfig } from "./customSlide";
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

export function sourceFooterLabel(source: BlockDataSource): string {
  return SOURCE_LABELS[source];
}

export function buildAutomaticSourceFooterText(
  config: CustomSlideConfig,
  rowsBySource: SourceRowsByDataSource,
): string {
  void rowsBySource;
  const sourcesInUse = new Set<BlockDataSource>();

  for (const block of config.blocks) {
    for (const source of blockDataSources(block)) {
      sourcesInUse.add(source);
    }
  }

  const body = SOURCE_ORDER
    .filter((source) => sourcesInUse.has(source))
    .map(sourceFooterLabel)
    .join(" · ");

  return body ? `Fonte: ${body}` : "";
}

export function getSourceFooterText(
  config: CustomSlideConfig,
  rowsBySource: SourceRowsByDataSource,
): string {
  if (config.sourceFooter?.mode === "manual") return config.sourceFooter.manualText?.trim() ?? "";
  return buildAutomaticSourceFooterText(config, rowsBySource);
}
