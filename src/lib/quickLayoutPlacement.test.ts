import { describe, expect, it } from "vitest";
import { placeQuickLayout, SLIDE_TITLE_BOX } from "./quickLayoutPlacement";

const box = (kind: string, x: number, y: number, w: number, h: number) => ({ kind, x, y, w, h });
const layoutTitle = box("title", 60, 45, 940, 60);
const kpis = [box("kpi", 60, 155, 285, 145), box("kpi", 370, 155, 285, 145)];
const LIMIT = 720 - 60; // área útil acima do rodapé

describe("placeQuickLayout", () => {
  it("slide só com título: reaproveita o título e usa a posição desenhada", () => {
    const r = placeQuickLayout([box("title", 40, 30, 1240, 70)], layoutTitle, kpis, LIMIT);
    expect(r.target).toBe("current");
    expect(r.blocks).toEqual(kpis);
  });

  it("slide vazio: título do layout vai para a posição padrão", () => {
    const r = placeQuickLayout([], layoutTitle, kpis, LIMIT);
    expect(r.blocks[0]).toMatchObject({ kind: "title", ...SLIDE_TITLE_BOX });
    expect(r.blocks.slice(1)).toEqual(kpis);
  });

  it("slide com conteúdo: layout entra logo abaixo do que já existe", () => {
    const existing = [box("title", 40, 30, 1240, 70), box("chart", 60, 140, 1200, 200)]; // termina em 340
    const r = placeQuickLayout(existing, layoutTitle, kpis, LIMIT);
    expect(r.target).toBe("current");
    expect(r.blocks.map((b) => b.y)).toEqual([364, 364]);
  });

  it("sem espaço: vai para um slide novo, com o título", () => {
    const existing = [box("title", 40, 30, 1240, 70), box("chart", 60, 140, 1200, 480)]; // termina em 620
    const r = placeQuickLayout(existing, layoutTitle, kpis, LIMIT);
    expect(r.target).toBe("newSlide");
    expect(r.blocks[0]).toMatchObject({ kind: "title", ...SLIDE_TITLE_BOX });
    expect(r.blocks.slice(1)).toEqual(kpis);
  });

  it("blocos ocultos não contam como ocupados", () => {
    const hidden = { ...box("chart", 60, 140, 1200, 480), hidden: true };
    const r = placeQuickLayout([box("title", 40, 30, 1240, 70), hidden], layoutTitle, kpis, LIMIT);
    expect(r).toEqual({ target: "current", blocks: kpis });
  });
});
