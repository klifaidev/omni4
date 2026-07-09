import * as Y from "yjs";
import type { CustomBlock, CustomSlideConfig } from "@/lib/customSlide";

type JsonObject = Record<string, unknown>;

export type CustomSlideYDoc = {
  doc: Y.Doc;
  meta: Y.Map<unknown>;
  blockOrder: Y.Array<string>;
  blocks: Y.Map<Y.Map<unknown>>;
};

const META_MAP = "meta";
const BLOCK_ORDER = "blockOrder";
const BLOCKS_MAP = "blocks";
const BLOCK_PROPS = "props";
const BLOCK_TEXTS = "texts";
const SPEAKER_NOTES = "speakerNotes";

const TEXT_FIELDS_BY_KIND: Record<string, string[]> = {
  title: ["text"],
  text: ["text"],
  kpi: ["label", "manualValue"],
  bridge: ["title", "subtitle"],
  table: ["title", "subtitle"],
  chart: ["title", "subtitle", "caption"],
  topSku: ["title", "subtitle"],
  dre: ["title", "subtitle"],
  omni_evolucao_mensal: ["title", "subtitle", "insight"],
  omni_heatmap_sazonalidade: ["title", "subtitle", "insight"],
  omni_herois_ofensores: ["title", "subtitle", "insight"],
  omni_canal_trend: ["title", "subtitle", "insight"],
  omni_canal_mix: ["title", "subtitle", "insight"],
  omni_custo_evolucao: ["title", "subtitle", "insight"],
  omni_custo_composicao: ["title", "subtitle", "insight"],
  omni_custo_pressao: ["title", "subtitle", "insight"],
  omni_price_decomp: ["title", "subtitle", "insight"],
  omni_bridge_pvm: ["title", "subtitle", "insight"],
  omni_farol: ["title", "subtitle", "insight"],
  omni_abc_curva: ["title", "subtitle", "insight"],
  omni_portfolio_matrix: ["title", "subtitle", "insight"],
  omni_abc_bars: ["title", "subtitle", "insight"],
};

function createText(value: string): Y.Text {
  const text = new Y.Text();
  if (value) text.insert(0, value);
  return text;
}

function textFieldsForBlock(block: CustomBlock): Set<string> {
  return new Set(TEXT_FIELDS_BY_KIND[block.kind] ?? []);
}

function getParts(doc: Y.Doc): CustomSlideYDoc {
  return {
    doc,
    meta: doc.getMap(META_MAP),
    blockOrder: doc.getArray(BLOCK_ORDER),
    blocks: doc.getMap(BLOCKS_MAP),
  };
}

function blockToYMap(block: CustomBlock): Y.Map<unknown> {
  const blockMap = new Y.Map<unknown>();
  const props = new Y.Map<unknown>();
  const texts = new Y.Map<Y.Text>();
  const textFields = textFieldsForBlock(block);

  Object.entries(block as JsonObject).forEach(([key, value]) => {
    if (typeof value === "string" && textFields.has(key)) {
      texts.set(key, createText(value));
    } else {
      props.set(key, value);
    }
  });

  blockMap.set(BLOCK_PROPS, props);
  blockMap.set(BLOCK_TEXTS, texts);
  return blockMap;
}

function yMapToBlock(blockMap: Y.Map<unknown>): CustomBlock {
  const props = blockMap.get(BLOCK_PROPS) as Y.Map<unknown> | undefined;
  const texts = blockMap.get(BLOCK_TEXTS) as Y.Map<Y.Text> | undefined;
  const block: JsonObject = {};

  props?.forEach((value, key) => {
    block[key] = value;
  });
  texts?.forEach((value, key) => {
    block[key] = value.toString();
  });

  return block as CustomBlock;
}

export function getCustomSlideBlockText(doc: Y.Doc, blockId: string, field: string): Y.Text | null {
  const blockMap = getParts(doc).blocks.get(blockId);
  const texts = blockMap?.get(BLOCK_TEXTS) as Y.Map<Y.Text> | undefined;
  const text = texts?.get(field);
  return text instanceof Y.Text ? text : null;
}

export function getCustomSlideSpeakerNotesText(doc: Y.Doc): Y.Text {
  const { meta } = getParts(doc);
  const existing = meta.get(SPEAKER_NOTES);
  if (existing instanceof Y.Text) return existing;
  const text = createText(typeof existing === "string" ? existing : "");
  meta.set(SPEAKER_NOTES, text);
  return text;
}

export function setYTextValue(text: Y.Text, value: string): void {
  const current = text.toString();
  if (current === value) return;
  text.doc?.transact(() => {
    text.delete(0, text.length);
    if (value) text.insert(0, value);
  });
}

export function customSlideConfigToYDoc(config: CustomSlideConfig): Y.Doc {
  const doc = new Y.Doc();
  const { meta, blockOrder, blocks } = getParts(doc);

  doc.transact(() => {
    meta.set("background", config.background);
    meta.set("showHaraldFooter", config.showHaraldFooter);
    if (config.theme !== undefined) meta.set("theme", config.theme);
    if (config.backgroundImage !== undefined) meta.set("backgroundImage", config.backgroundImage);
    if (config.groups !== undefined) meta.set("groups", config.groups);
    meta.set(SPEAKER_NOTES, createText(config.speakerNotes ?? ""));

    blockOrder.insert(0, config.blocks.map((block) => block.id));
    config.blocks.forEach((block) => {
      blocks.set(block.id, blockToYMap(block));
    });
  });

  return doc;
}

export function yDocToCustomSlideConfig(doc: Y.Doc): CustomSlideConfig {
  const { meta, blockOrder, blocks } = getParts(doc);
  const speakerNotes = meta.get(SPEAKER_NOTES) as Y.Text | undefined;
  const config: CustomSlideConfig = {
    background: String(meta.get("background") ?? "FFFFFF"),
    showHaraldFooter: Boolean(meta.get("showHaraldFooter") ?? true),
    blocks: blockOrder
      .toArray()
      .map((id) => blocks.get(id))
      .filter((blockMap): blockMap is Y.Map<unknown> => blockMap instanceof Y.Map)
      .map(yMapToBlock),
  };

  const theme = meta.get("theme");
  const backgroundImage = meta.get("backgroundImage");
  const groups = meta.get("groups");
  const notes = speakerNotes?.toString() ?? "";

  if (theme !== undefined) config.theme = theme as CustomSlideConfig["theme"];
  if (backgroundImage !== undefined) config.backgroundImage = backgroundImage as string;
  if (groups !== undefined) config.groups = groups as CustomSlideConfig["groups"];
  if (notes) config.speakerNotes = notes;

  return config;
}

export function getCustomSlideYDocParts(doc: Y.Doc): CustomSlideYDoc {
  return getParts(doc);
}
