import type { CSSProperties } from "react";
import type { BlockDataSource, CustomBlock, CustomSlideConfig } from "./customSlide";
import type { PricingRow } from "./types";

/** "off": a fonte fica desativada neste slide (não aparece na tela, na apresentação nem nos exports). */
export type SlideSourceFooterMode = "auto" | "manual" | "off";

export interface SlideSourceFooterConfig {
  mode?: SlideSourceFooterMode;
  manualText?: string;
  /** Modo a retomar quando a fonte for reativada depois de desativada. */
  resume?: "auto" | "manual";
}

/**
 * Camadas do slide. A fonte fica SEMPRE acima de tudo: dos elementos (z do
 * bloco), da faixa da Harald e das camadas de edição. Os dois renderizadores
 * (editor e leitura/exportação) usam estes números — não duplicar.
 */
export const SLIDE_HARALD_FOOTER_Z_INDEX = 99999;
export const SLIDE_SOURCE_FOOTER_Z_INDEX = 2147483647;

export function isSourceFooterOff(config: Pick<CustomSlideConfig, "sourceFooter">): boolean {
  return config.sourceFooter?.mode === "off";
}

/** Config ao desativar/reativar a fonte, preservando o texto manual e o modo anterior. */
export function toggleSourceFooter(
  current: SlideSourceFooterConfig | undefined,
  on: boolean,
): SlideSourceFooterConfig {
  const manualText = current?.manualText;
  if (!on) {
    const resume = current?.mode === "manual" ? "manual" : current?.resume ?? "auto";
    return { mode: "off", resume, ...(manualText != null ? { manualText } : null) };
  }
  const mode = current?.mode === "off" ? current.resume ?? "auto" : current?.mode ?? "auto";
  return { mode, ...(manualText != null ? { manualText } : null) };
}

/** Posição, camada e tipografia da fonte — igual no editor e na leitura/exportação. */
export function sourceFooterBoxStyle(showHaraldFooter: boolean): CSSProperties {
  return {
    position: "absolute",
    left: 40,
    bottom: showHaraldFooter ? 13 : 18,
    maxWidth: 720,
    zIndex: SLIDE_SOURCE_FOOTER_Z_INDEX,
    color: showHaraldFooter ? "#FFFFFF" : "#64748B",
    fontFamily: "Calibri, sans-serif",
    fontSize: 11,
    fontStyle: "italic",
    fontWeight: 700,
    lineHeight: 1.1,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
}

export type SourceRowsByDataSource = Record<BlockDataSource, readonly PricingRow[]>;

// Nota: "personalizado" nunca aparece em SOURCE_ORDER de propósito (tabelas
// customizadas não mostram rótulo de fonte no rodapé) — comportamento
// pré-existente, mantido. Chave presente aqui só pra satisfazer o Record.
const SOURCE_LABELS: Record<BlockDataSource, string> = {
  ke30: "KE30",
  budget: "Superbase",
  budget_real: "Superbase",
  personalizado: "",
};

const SOURCE_ORDER: BlockDataSource[] = ["ke30", "budget", "budget_real"];

function isDataSource(value: unknown): value is BlockDataSource {
  return value === "ke30"
    || value === "budget"
    || value === "budget_real"
    || value === "personalizado";
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
  if (isSourceFooterOff(config)) return "";
  if (config.sourceFooter?.mode === "manual") return config.sourceFooter.manualText?.trim() ?? "";
  return buildAutomaticSourceFooterText(config, rowsBySource);
}
