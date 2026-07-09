import { describe, expect, it } from "vitest";
import type { CustomSlideConfig } from "@/lib/customSlide";
import {
  customSlideConfigToYDoc,
  getCustomSlideBlockText,
  getCustomSlideYDocParts,
  setYTextValue,
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

describe("customSlideYjs", () => {
  it("preserves a CustomSlideConfig through JSON -> Y.Doc -> JSON", () => {
    const doc = customSlideConfigToYDoc(sampleConfig);
    const restored = yDocToCustomSlideConfig(doc);

    expect(restored).toEqual(sampleConfig);
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
});
