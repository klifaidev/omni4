import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import type { CustomSlideConfig } from "@/lib/customSlide";
import {
  compactCustomSlideBlockOrder,
  customSlideConfigToYDoc,
  getCustomSlideBlockText,
  getCustomSlideYDocParts,
  insertCustomSlideBlock,
  patchCustomSlideBlock,
  removeCustomSlideBlock,
  replaceCustomSlideYDoc,
  reorderCustomSlideBlock,
  setYTextValue,
  uniqueOrderedBlockIds,
  yDocToCustomSlideConfig,
} from "@/lib/customSlideYjs";

const sampleConfig: CustomSlideConfig = {
  background: "FFFFFF",
  showHaraldFooter: true,
  theme: "harald-classic",
  backgroundImage: "https://example.com/bg.png",
  speakerNotes: "Abrir reforcando margem e mix.",
  groups: [{ id: "group-1", memberIds: ["title-1", "text-1"] }],
  blocks: [
    {
      id: "title-1",
      kind: "title",
      x: 40,
      y: 30,
      w: 900,
      h: 70,
      z: 1,
      text: "Resultado Mensal",
      size: 44,
      bold: true,
      color: "C8102E",
      align: "left",
      groupId: "group-1",
    },
    {
      id: "text-1",
      kind: "text",
      x: 60,
      y: 120,
      w: 500,
      h: 120,
      z: 2,
      text: "Insight executivo",
      size: 24,
      color: "1C2430",
      align: "left",
      groupId: "group-1",
    },
    {
      id: "kpi-1",
      kind: "kpi",
      x: 700,
      y: 120,
      w: 240,
      h: 150,
      z: 3,
      label: "CM %",
      valueSize: 42,
      color: "C8102E",
      source: "manual",
      manualValue: "32,4%",
      dataSource: "ke30",
      filters: { canal: ["Direto"] },
    },
    {
      id: "chart-1",
      kind: "chart",
      x: 60,
      y: 290,
      w: 760,
      h: 330,
      z: 4,
      title: "Evolucao de margem",
      subtitle: "Por periodo",
      chartType: "line",
      measure: "cm",
      breakdown: null,
      showGrid: true,
      showLegend: true,
      showLabels: false,
      dataSource: "budget",
      filters: { familia: ["A"] },
    },
  ],
};

function cloneSyncedDoc(source: Y.Doc): Y.Doc {
  const clone = new Y.Doc();
  Y.applyUpdate(clone, Y.encodeStateAsUpdate(source));
  return clone;
}

function syncBoth(left: Y.Doc, right: Y.Doc): void {
  const leftUpdate = Y.encodeStateAsUpdate(left);
  const rightUpdate = Y.encodeStateAsUpdate(right);
  Y.applyUpdate(left, rightUpdate);
  Y.applyUpdate(right, leftUpdate);
}

function blockIds(doc: Y.Doc): string[] {
  return yDocToCustomSlideConfig(doc).blocks.map((block) => block.id);
}

function rawBlockOrder(doc: Y.Doc): string[] {
  return getCustomSlideYDocParts(doc).blockOrder.toArray();
}

function uniqueBlockOrder(doc: Y.Doc): string[] {
  const { blockOrder, blocks } = getCustomSlideYDocParts(doc);
  return uniqueOrderedBlockIds(blockOrder.toArray(), blocks);
}

describe("customSlideYjs", () => {
  it("preserves a CustomSlideConfig through JSON -> Y.Doc -> JSON", () => {
    const doc = customSlideConfigToYDoc(sampleConfig);
    const restored = yDocToCustomSlideConfig(doc);

    expect(restored).toEqual(sampleConfig);
  });

  it("can replace an existing Y.Doc with a previous CustomSlideConfig for undo/redo", () => {
    const doc = customSlideConfigToYDoc(sampleConfig);
    patchCustomSlideBlock(doc, "title-1", { text: "Titulo alterado", x: 120 });
    removeCustomSlideBlock(doc, "text-1");

    replaceCustomSlideYDoc(doc, sampleConfig);

    expect(yDocToCustomSlideConfig(doc)).toEqual(sampleConfig);
  });

  it("stores block order, block maps and editable text fields as Yjs structures", () => {
    const doc = customSlideConfigToYDoc(sampleConfig);
    const { blockOrder, blocks, meta } = getCustomSlideYDocParts(doc);
    const titleMap = blocks.get("title-1");
    const titleTexts = titleMap?.get("texts");
    const notes = meta.get("speakerNotes");

    expect(blockOrder.toArray()).toEqual(["title-1", "text-1", "kpi-1", "chart-1"]);
    expect(titleMap?.constructor.name).toBe("YMap");
    expect(titleTexts?.constructor.name).toBe("YMap");
    expect(notes?.constructor.name).toBe("YText");
  });

  it("reflects Y.Text edits back into the plain CustomSlideConfig", () => {
    const doc = customSlideConfigToYDoc(sampleConfig);
    const { blocks, meta } = getCustomSlideYDocParts(doc);
    const titleTexts = blocks.get("title-1")?.get("texts") as { get: (key: string) => { delete: (index: number, length: number) => void; insert: (index: number, text: string) => void; length: number } };
    const titleText = titleTexts.get("text");
    const notes = meta.get("speakerNotes") as { delete: (index: number, length: number) => void; insert: (index: number, text: string) => void; length: number };

    titleText.delete(0, titleText.length);
    titleText.insert(0, "Novo titulo colaborativo");
    notes.delete(0, notes.length);
    notes.insert(0, "Nova nota do apresentador");

    const restored = yDocToCustomSlideConfig(doc);
    expect(restored.blocks[0]).toMatchObject({ id: "title-1", text: "Novo titulo colaborativo" });
    expect(restored.speakerNotes).toBe("Nova nota do apresentador");
  });

  it("keeps KPI manualValue as Y.Text so manual business values use encrypted Yjs updates", () => {
    const doc = customSlideConfigToYDoc(sampleConfig);
    const manualValue = getCustomSlideBlockText(doc, "kpi-1", "manualValue");

    expect(manualValue?.constructor.name).toBe("YText");
    setYTextValue(manualValue!, "35,8%");

    const restored = yDocToCustomSlideConfig(doc);
    expect(restored.blocks[2]).toMatchObject({ id: "kpi-1", manualValue: "35,8%" });
  });

  it("converges when two collaborators delete the same block at the same time", () => {
    const host = customSlideConfigToYDoc(sampleConfig);
    const guest = cloneSyncedDoc(host);

    removeCustomSlideBlock(host, "text-1");
    removeCustomSlideBlock(guest, "text-1");
    syncBoth(host, guest);

    expect(blockIds(host)).toEqual(blockIds(guest));
    expect(blockIds(host)).not.toContain("text-1");
  });

  it("converges without duplicate or missing ids after simultaneous reorders", () => {
    const host = customSlideConfigToYDoc(sampleConfig);
    const guest = cloneSyncedDoc(host);

    reorderCustomSlideBlock(host, "chart-1", "title-1");
    reorderCustomSlideBlock(guest, "kpi-1", "text-1");
    syncBoth(host, guest);

    const hostIds = blockIds(host);
    const guestIds = blockIds(guest);
    expect(hostIds).toEqual(guestIds);
    expect(new Set(hostIds)).toEqual(new Set(sampleConfig.blocks.map((block) => block.id)));
    expect(hostIds).toHaveLength(sampleConfig.blocks.length);
  });

  it("deduplicates dirty concurrent reorder state deterministically on every client", () => {
    const host = customSlideConfigToYDoc(sampleConfig);
    const guest = cloneSyncedDoc(host);

    reorderCustomSlideBlock(host, "chart-1", "title-1");
    reorderCustomSlideBlock(guest, "kpi-1", "text-1");
    syncBoth(host, guest);

    expect(rawBlockOrder(host).length).toBeGreaterThan(sampleConfig.blocks.length);
    expect(rawBlockOrder(host)).toEqual(rawBlockOrder(guest));
    expect(uniqueBlockOrder(host)).toEqual(uniqueBlockOrder(guest));
    expect(uniqueBlockOrder(host)).toHaveLength(sampleConfig.blocks.length);
    expect(new Set(uniqueBlockOrder(host))).toEqual(new Set(sampleConfig.blocks.map((block) => block.id)));
  });

  it("compacts repeated dirty reorder conflicts back to one raw id per block", () => {
    const host = customSlideConfigToYDoc(sampleConfig);
    const guest = cloneSyncedDoc(host);

    for (let i = 0; i < 8; i += 1) {
      reorderCustomSlideBlock(host, "chart-1", "title-1");
      reorderCustomSlideBlock(guest, "kpi-1", "text-1");
      syncBoth(host, guest);
      reorderCustomSlideBlock(host, "title-1", "chart-1");
      reorderCustomSlideBlock(guest, "text-1", "kpi-1");
      syncBoth(host, guest);
    }

    expect(rawBlockOrder(host).length).toBeGreaterThan(sampleConfig.blocks.length);
    const compactedHost = compactCustomSlideBlockOrder(host);
    const compactedGuest = compactCustomSlideBlockOrder(guest);

    expect(compactedHost).toEqual(compactedGuest);
    expect(rawBlockOrder(host)).toEqual(compactedHost);
    expect(rawBlockOrder(guest)).toEqual(compactedGuest);
    expect(rawBlockOrder(host)).toHaveLength(sampleConfig.blocks.length);
    expect(new Set(rawBlockOrder(host))).toEqual(new Set(sampleConfig.blocks.map((block) => block.id)));
  });

  it("keeps a concurrently edited block deleted from the app view when another collaborator removed it", () => {
    const host = customSlideConfigToYDoc(sampleConfig);
    const guest = cloneSyncedDoc(host);

    removeCustomSlideBlock(host, "kpi-1");
    patchCustomSlideBlock(guest, "kpi-1", { x: 999, y: 888 });
    syncBoth(host, guest);

    expect(blockIds(host)).toEqual(blockIds(guest));
    expect(blockIds(host)).not.toContain("kpi-1");
  });

  it("keeps both blocks when collaborators add different blocks concurrently", () => {
    const host = customSlideConfigToYDoc(sampleConfig);
    const guest = cloneSyncedDoc(host);

    insertCustomSlideBlock(host, {
      id: "host-new",
      kind: "text",
      x: 100,
      y: 100,
      w: 200,
      h: 80,
      z: 5,
      text: "Bloco do host",
      size: 20,
      color: "1C2430",
      align: "left",
    });
    insertCustomSlideBlock(guest, {
      id: "guest-new",
      kind: "text",
      x: 320,
      y: 100,
      w: 200,
      h: 80,
      z: 6,
      text: "Bloco do convidado",
      size: 20,
      color: "1C2430",
      align: "left",
    });
    syncBoth(host, guest);

    const hostIds = blockIds(host);
    expect(hostIds).toEqual(blockIds(guest));
    expect(hostIds).toContain("host-new");
    expect(hostIds).toContain("guest-new");
  });
});
