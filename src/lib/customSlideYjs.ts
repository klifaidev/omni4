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

function textFieldsForKind(kind: string): Set<string> {
  return new Set(TEXT_FIELDS_BY_KIND[kind] ?? []);
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

function clearYMap<T>(map: Y.Map<T>): void {
  Array.from(map.keys()).forEach((key) => map.delete(key));
}

function writeConfigToYDoc(doc: Y.Doc, config: CustomSlideConfig): void {
  const { meta, blockOrder, blocks } = getParts(doc);

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

function removeFromArray<T>(array: Y.Array<T>, predicate: (value: T) => boolean): void {
  for (let index = array.length - 1; index >= 0; index -= 1) {
    if (predicate(array.get(index))) array.delete(index, 1);
  }
}

export function uniqueOrderedBlockIds(ids: string[], blocks: Y.Map<Y.Map<unknown>>): string[] {
  const seen = new Set<string>();
  return ids.filter((id) => {
    if (seen.has(id) || !blocks.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function compactCustomSlideBlockOrder(doc: Y.Doc): string[] {
  const { blockOrder, blocks } = getParts(doc);
  const compacted = uniqueOrderedBlockIds(blockOrder.toArray(), blocks);
  const current = blockOrder.toArray();
  const alreadyCompact = current.length === compacted.length
    && current.every((id, index) => id === compacted[index]);

  if (!alreadyCompact) {
    doc.transact(() => {
      blockOrder.delete(0, blockOrder.length);
      if (compacted.length > 0) blockOrder.insert(0, compacted);
    });
  }

  return compacted;
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

export function getCustomSlideBlockMap(doc: Y.Doc, blockId: string): Y.Map<unknown> | null {
  const blockMap = getParts(doc).blocks.get(blockId);
  return blockMap instanceof Y.Map ? blockMap : null;
}

export function insertCustomSlideBlock(doc: Y.Doc, block: CustomBlock, index?: number): string {
  const { blockOrder, blocks } = getParts(doc);
  doc.transact(() => {
    if (blocks.has(block.id)) return;
    const safeIndex = Math.max(0, Math.min(index ?? blockOrder.length, blockOrder.length));
    blocks.set(block.id, blockToYMap(block));
    blockOrder.insert(safeIndex, [block.id]);
  });
  return block.id;
}

export function insertCustomSlideBlocks(doc: Y.Doc, newBlocks: CustomBlock[], index?: number): string[] {
  const { blockOrder, blocks } = getParts(doc);
  const ids: string[] = [];
  doc.transact(() => {
    let insertAt = Math.max(0, Math.min(index ?? blockOrder.length, blockOrder.length));
    newBlocks.forEach((block) => {
      if (blocks.has(block.id)) return;
      blocks.set(block.id, blockToYMap(block));
      blockOrder.insert(insertAt, [block.id]);
      ids.push(block.id);
      insertAt += 1;
    });
  });
  return ids;
}

export function removeCustomSlideBlock(doc: Y.Doc, blockId: string): void {
  const { blockOrder, blocks } = getParts(doc);
  doc.transact(() => {
    blocks.delete(blockId);
    removeFromArray(blockOrder, (id) => id === blockId);
  });
}

export function duplicateCustomSlideBlock(doc: Y.Doc, sourceBlockId: string, clone: CustomBlock): string | null {
  const { blockOrder, blocks } = getParts(doc);
  if (!blocks.has(sourceBlockId) || blocks.has(clone.id)) return null;
  doc.transact(() => {
    const sourceIndex = blockOrder.toArray().indexOf(sourceBlockId);
    const insertAt = sourceIndex >= 0 ? sourceIndex + 1 : blockOrder.length;
    blocks.set(clone.id, blockToYMap(clone));
    blockOrder.insert(insertAt, [clone.id]);
  });
  return clone.id;
}

export function reorderCustomSlideBlock(doc: Y.Doc, blockId: string, overBlockId: string): void {
  if (blockId === overBlockId) return;
  const { blockOrder, blocks } = getParts(doc);
  if (!blocks.has(blockId) || !blocks.has(overBlockId)) return;
  doc.transact(() => {
    const ids = blockOrder.toArray().filter((id) => blocks.has(id));
    const oldIndex = ids.indexOf(blockId);
    const newIndex = ids.indexOf(overBlockId);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
    ids.splice(oldIndex, 1);
    ids.splice(newIndex, 0, blockId);
    blockOrder.delete(0, blockOrder.length);
    blockOrder.insert(0, ids);
  });
}

export function patchCustomSlideBlock(doc: Y.Doc, blockId: string, patch: Partial<CustomBlock>): boolean {
  const blockMap = getCustomSlideBlockMap(doc, blockId);
  if (!blockMap) return false;
  const props = blockMap.get(BLOCK_PROPS) as Y.Map<unknown> | undefined;
  const texts = blockMap.get(BLOCK_TEXTS) as Y.Map<Y.Text> | undefined;
  if (!props || !texts) return false;
  const kind = String(props.get("kind") ?? "");
  const textFields = textFieldsForKind(kind);

  doc.transact(() => {
    Object.entries(patch as JsonObject).forEach(([key, value]) => {
      if (typeof value === "string" && textFields.has(key)) {
        const text = texts.get(key) ?? createText("");
        if (!texts.has(key)) texts.set(key, text);
        setYTextValue(text, value);
        return;
      }
      if (value === undefined) {
        props.delete(key);
        texts.delete(key);
        return;
      }
      props.set(key, value);
    });
  });

  return true;
}

export function customSlideConfigToYDoc(config: CustomSlideConfig): Y.Doc {
  const doc = new Y.Doc();
  doc.transact(() => writeConfigToYDoc(doc, config));

  return doc;
}

export function replaceCustomSlideYDoc(doc: Y.Doc, config: CustomSlideConfig): void {
  const { meta, blockOrder, blocks } = getParts(doc);
  doc.transact(() => {
    clearYMap(meta);
    clearYMap(blocks);
    if (blockOrder.length > 0) blockOrder.delete(0, blockOrder.length);
    writeConfigToYDoc(doc, config);
  });
}

export function yDocToCustomSlideConfig(doc: Y.Doc): CustomSlideConfig {
  const { meta, blockOrder, blocks } = getParts(doc);
  const speakerNotes = meta.get(SPEAKER_NOTES) as Y.Text | undefined;
  const config: CustomSlideConfig = {
    background: String(meta.get("background") ?? "FFFFFF"),
    showHaraldFooter: Boolean(meta.get("showHaraldFooter") ?? true),
    blocks: uniqueOrderedBlockIds(blockOrder.toArray(), blocks)
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
