import type { CustomBlock, CustomSlideConfig } from "@/lib/customSlide";
import type {
  BridgePvmSlideConfig,
  BudgetEvoSlideConfig,
  CoverSlideConfig,
  SlideItem,
} from "@/lib/slidesFlow";
import type { SlideTransition } from "@/store/slidesFlow";
import type { JsonValue } from "@/lib/collabCrypto";

export const COLLAB_SNAPSHOT_SCHEMA_VERSION = 1;
export const COLLAB_PROTOCOL_VERSION = 1;

export type PersistentCollabSnapshot = {
  schemaVersion: 1;
  collabProtocolVersion: 1;
  appVersion: string;
  version: number;
  createdAt: string;
  selectedSlideId: string | null;
  transition: SlideTransition;
  visualConfig: {
    canvas: { width: number; height: number };
    theme: string | null;
  };
  items: PersistentCollabSnapshotItem[];
};

export type PersistentCollabSnapshotItem = {
  id: string;
  type: SlideItem["kind"];
  title: string | null;
  subtitle: string | null;
  metric: string | null;
  chartType: string | null;
  filters: JsonValue;
  periods: JsonValue;
  layout: JsonValue;
  customBlocks: JsonValue;
  manualTexts: JsonValue;
  notes: string | null;
  transition: SlideTransition;
  visualConfig: JsonValue;
  item: SlideItem;
};

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null)) as T;
}

function toJsonValue(value: unknown): JsonValue {
  return cloneJson(value) as JsonValue;
}

function sanitizeCustomConfig(config: CustomSlideConfig): CustomSlideConfig {
  const cloned = cloneJson(config);
  return {
    ...cloned,
    blocks: cloned.blocks.map(sanitizeCustomBlock),
  };
}

function sanitizeCustomBlock(block: CustomBlock): CustomBlock {
  const sanitized = cloneJson(block) as Record<string, unknown>;

  if (sanitized.kind === "image") {
    sanitized.src = "";
  }

  delete sanitized.renderedData;
  delete sanitized.renderedSeries;
  delete sanitized.series;
  delete sanitized.rows;
  delete sanitized.data;
  delete sanitized.values;
  delete sanitized.thumbnailDataUrl;
  delete sanitized.previewDataUrl;
  delete sanitized.chartImage;
  delete sanitized.imageDataUrl;
  delete sanitized.calculatedValue;
  delete sanitized.calculatedRows;

  return sanitized as unknown as CustomBlock;
}

function sanitizeSlideItem(item: SlideItem): SlideItem {
  const cloned = cloneJson(item);
  if (cloned.kind !== "custom") return cloned;
  return {
    ...cloned,
    config: sanitizeCustomConfig(cloned.config),
  };
}

function itemTitle(item: SlideItem): string | null {
  if (item.kind === "cover") return item.config.title || item.label || null;
  if (item.kind === "custom") {
    const title = item.config.blocks.find((block) => block.kind === "title");
    return title && "text" in title ? title.text : item.label ?? null;
  }
  return item.label ?? null;
}

function itemSubtitle(item: SlideItem): string | null {
  if (item.kind === "cover") return item.config.subtitle ?? null;
  return null;
}

function itemMetric(item: SlideItem): string | null {
  if (item.kind === "custom") {
    const metricBlock = item.config.blocks.find((block) => "measure" in block || "metric" in block);
    if (!metricBlock) return null;
    if ("measure" in metricBlock && typeof metricBlock.measure === "string") return metricBlock.measure;
    if ("metric" in metricBlock && typeof metricBlock.metric === "string") return metricBlock.metric;
  }
  return null;
}

function itemChartType(item: SlideItem): string | null {
  if (item.kind !== "custom") return null;
  const chart = item.config.blocks.find((block) => block.kind === "chart" || "chartType" in block);
  return chart && "chartType" in chart && typeof chart.chartType === "string" ? chart.chartType : null;
}

function itemFilters(item: SlideItem): JsonValue {
  if (item.kind === "bridge_pvm") return toJsonValue(item.config.filters);
  if (item.kind === "budget_evo") return toJsonValue(item.config.filters);
  if (item.kind === "custom") {
    return toJsonValue(
      item.config.blocks
        .filter((block) => "filters" in block || "periodos" in block)
        .map((block) => ({
          id: block.id,
          kind: block.kind,
          filters: "filters" in block ? block.filters : null,
          periodos: "periodos" in block ? block.periodos : null,
        })),
    );
  }
  return {};
}

function itemPeriods(item: SlideItem): JsonValue {
  if (item.kind === "bridge_pvm") {
    const cfg = item.config as BridgePvmSlideConfig;
    return toJsonValue({ mode: cfg.mode, base: cfg.base, comp: cfg.comp });
  }
  if (item.kind === "budget_evo") {
    const cfg = item.config as BudgetEvoSlideConfig;
    return toJsonValue({ start: cfg.start, end: cfg.end });
  }
  if (item.kind === "custom") {
    return toJsonValue(
      item.config.blocks
        .filter((block) => "periodMode" in block || "periodValue" in block || "periodos" in block)
        .map((block) => ({
          id: block.id,
          kind: block.kind,
          periodMode: "periodMode" in block ? block.periodMode : null,
          periodValue: "periodValue" in block ? block.periodValue : null,
          periodos: "periodos" in block ? block.periodos : null,
        })),
    );
  }
  return {};
}

function itemLayout(item: SlideItem): JsonValue {
  if (item.kind !== "custom") return {};
  return toJsonValue({
    canvas: { width: item.config.width, height: item.config.height },
    blocks: item.config.blocks.map((block) => ({
      id: block.id,
      kind: block.kind,
      x: block.x,
      y: block.y,
      w: block.w,
      h: block.h,
      z: block.z,
      locked: block.locked ?? false,
      hidden: block.hidden ?? false,
      groupId: block.groupId ?? null,
      enterAnimation: block.enterAnimation ?? "none",
    })),
    groups: item.config.groups ?? [],
  });
}

function itemManualTexts(item: SlideItem): JsonValue {
  if (item.kind === "cover") {
    const cfg = item.config as CoverSlideConfig;
    return toJsonValue({ title: cfg.title, subtitle: cfg.subtitle ?? "" });
  }
  if (item.kind !== "custom") return {};
  return toJsonValue(
    item.config.blocks
      .filter((block) => "text" in block || "manualValue" in block || "label" in block || "title" in block)
      .map((block) => ({
        id: block.id,
        kind: block.kind,
        text: "text" in block ? block.text : null,
        label: "label" in block ? block.label : null,
        title: "title" in block ? block.title : null,
        manualValue: "manualValue" in block ? block.manualValue : null,
      })),
  );
}

function itemNotes(item: SlideItem): string | null {
  if ("speakerNotes" in item.config && typeof item.config.speakerNotes === "string") {
    return item.config.speakerNotes;
  }
  return null;
}

function itemVisualConfig(item: SlideItem): JsonValue {
  if (item.kind === "cover") return toJsonValue({ variant: item.config.variant });
  if (item.kind !== "custom") return {};
  return toJsonValue({
    theme: item.config.theme ?? null,
    backgroundColor: item.config.backgroundColor ?? null,
    footer: item.config.footer,
    blocks: item.config.blocks.map((block) => ({
      id: block.id,
      kind: block.kind,
      color: "color" in block ? block.color : null,
      fill: "fill" in block ? block.fill : null,
      strokeColor: "strokeColor" in block ? block.strokeColor : null,
      backgroundColor: "backgroundColor" in block ? block.backgroundColor : null,
      cardBg: "cardBg" in block ? block.cardBg : null,
      style: "style" in block ? block.style : null,
    })),
  });
}

export function serializePersistentCollabSnapshot(params: {
  items: SlideItem[];
  selectedSlideId: string | null;
  transition: SlideTransition;
  appVersion: string;
  version: number;
}): PersistentCollabSnapshot {
  const sanitizedItems = params.items.map(sanitizeSlideItem);
  return {
    schemaVersion: COLLAB_SNAPSHOT_SCHEMA_VERSION,
    collabProtocolVersion: COLLAB_PROTOCOL_VERSION,
    appVersion: params.appVersion,
    version: params.version,
    createdAt: new Date().toISOString(),
    selectedSlideId: params.selectedSlideId,
    transition: params.transition,
    visualConfig: {
      canvas: { width: 1333, height: 750 },
      theme: null,
    },
    items: sanitizedItems.map((item) => ({
      id: item.id,
      type: item.kind,
      title: itemTitle(item),
      subtitle: itemSubtitle(item),
      metric: itemMetric(item),
      chartType: itemChartType(item),
      filters: itemFilters(item),
      periods: itemPeriods(item),
      layout: itemLayout(item),
      customBlocks: item.kind === "custom" ? toJsonValue(item.config.blocks) : [],
      manualTexts: itemManualTexts(item),
      notes: itemNotes(item),
      transition: params.transition,
      visualConfig: itemVisualConfig(item),
      item,
    })),
  };
}

export function validatePersistentCollabSnapshot(value: unknown): PersistentCollabSnapshot {
  const snapshot = value as Partial<PersistentCollabSnapshot> | null;
  if (!snapshot || snapshot.schemaVersion !== COLLAB_SNAPSHOT_SCHEMA_VERSION) {
    throw new Error("UNSUPPORTED_COLLAB_SNAPSHOT_SCHEMA");
  }
  if (snapshot.collabProtocolVersion !== COLLAB_PROTOCOL_VERSION) {
    throw new Error("UNSUPPORTED_COLLAB_PROTOCOL");
  }
  if (!Number.isInteger(snapshot.version) || !Array.isArray(snapshot.items)) {
    throw new Error("CORRUPTED_COLLAB_SNAPSHOT");
  }
  return snapshot as PersistentCollabSnapshot;
}

export function snapshotToSlidesState(snapshot: PersistentCollabSnapshot): {
  items: SlideItem[];
  selectedId: string | null;
  transition: SlideTransition;
} {
  const items = snapshot.items.map((entry) => entry.item);
  return {
    items,
    selectedId: snapshot.selectedSlideId && items.some((item) => item.id === snapshot.selectedSlideId)
      ? snapshot.selectedSlideId
      : items[0]?.id ?? null,
    transition: snapshot.transition,
  };
}
