import { describe, expect, it } from "vitest";
import { findInDeck, replaceInDeck } from "./deckFindReplace";
import type { SlideItem } from "./slidesFlow";

const deck = (): SlideItem[] => [
  { id: "cap", kind: "cover", config: { title: "Fechamento Set/26", subtitle: "Pricing", variant: "cover" } },
  {
    id: "s1", kind: "custom", config: {
      background: "FFFFFF", showHaraldFooter: true,
      blocks: [
        { id: "t1", kind: "title", x: 0, y: 0, w: 100, h: 40, z: 1, text: "ROL de Set/26 e set/26", size: 30, color: "000", align: "left" },
        { id: "k1", kind: "kpi", x: 0, y: 0, w: 100, h: 40, z: 2, label: "ROL Set/26", valueSize: 30, color: "000", source: "dynamic" },
        { id: "t2", kind: "text", x: 0, y: 0, w: 100, h: 40, z: 3, text: "Set/26 travado", size: 14, color: "000", align: "left", locked: true },
      ],
    },
  } as unknown as SlideItem,
];

describe("localizar e substituir no deck", () => {
  it("acha em capa, título, KPI e bloco bloqueado, com número do slide", () => {
    const m = findInDeck(deck(), "Set/26");
    expect(m.map((x) => [x.slideNumber, x.field, x.count, x.locked])).toEqual([
      [1, "title", 1, false],
      [2, "text", 2, false],
      [2, "label", 1, false],
      [2, "text", 1, true],
    ]);
  });

  it("diferenciar maiúsculas", () => {
    expect(findInDeck(deck(), "Set/26", { matchCase: true }).find((x) => x.blockId === "t1")?.count).toBe(1);
  });

  it("substitui tudo menos o bloqueado, sem mexer no original", () => {
    const original = deck();
    const r = replaceInDeck(original, "set/26", "Out/26");
    expect(r.replaced).toBe(4);
    expect(r.skippedLocked).toBe(1);
    expect(r.changedItemIds).toEqual(["cap", "s1"]);
    const s1 = r.items[1] as Extract<SlideItem, { kind: "custom" }>;
    expect((s1.config.blocks[0] as { text: string }).text).toBe("ROL de Out/26 e Out/26");
    expect((s1.config.blocks[2] as { text: string }).text).toBe("Set/26 travado");
    expect((original[1] as Extract<SlideItem, { kind: "custom" }>).config.blocks[0]).toMatchObject({ text: "ROL de Set/26 e set/26" });
  });

  it("texto de substituição é literal ($ não vira referência)", () => {
    const r = replaceInDeck(deck(), "ROL", "R$ ROL");
    const s1 = r.items[1] as Extract<SlideItem, { kind: "custom" }>;
    expect((s1.config.blocks[1] as { label: string }).label).toBe("R$ ROL Set/26");
  });

  it("caracteres especiais na busca são literais", () => {
    expect(findInDeck(deck(), "(").length).toBe(0);
    expect(findInDeck(deck(), "Set/26 e").length).toBe(1);
  });
});
