import { describe, expect, it } from "vitest";
import { mergeGuides, presetGuides } from "./slideGuides";
import { computeSnap } from "@/components/pricing/custom/canvas/alignmentGuides";

describe("predefinições de guias", () => {
  it("margens usam a altura útil (sem a faixa)", () => {
    expect(presetGuides("margins", 1333, 665)).toEqual({ v: [40, 1293], h: [40, 625] });
  });
  it("12 colunas: 24 guias que começam e terminam nas margens", () => {
    const g = presetGuides("columns12", 1333, 665);
    expect(g.v).toHaveLength(24);
    expect(Math.round(g.v[0])).toBe(40);
    expect(Math.round(g.v[23])).toBe(1293);
  });
  it("juntar não repete e mantém a ordem e o travamento", () => {
    expect(mergeGuides({ v: [100, 40], h: [], locked: true }, { v: [40, 667], h: [10] }))
      .toEqual({ v: [40, 100, 667], h: [10], locked: true });
  });
});

describe("encaixe nas guias", () => {
  it("bloco perto de uma guia vertical encaixa nela", () => {
    const snap = computeSnap({ x: 203, y: 300, w: 100, h: 50 }, [], { v: [200], h: [] });
    expect(snap.x).toBe(200);
    expect(snap.guides.v).toContain(200);
  });
});
