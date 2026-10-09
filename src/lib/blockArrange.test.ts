import { describe, expect, it } from "vitest";
import { alignGroupToTarget, alignRects, distributeRects, slideArea, tidyRects, type Rect } from "./blockArrange";

const r = (id: string, x: number, y: number, w: number, h: number): Rect => ({ id, x, y, w, h });

describe("alinhar", () => {
  it("à seleção usa a caixa da seleção", () => {
    expect(alignRects([r("a", 10, 0, 50, 20), r("b", 100, 40, 20, 20)], "right"))
      .toEqual([{ id: "a", x: 70, y: 0 }, { id: "b", x: 100, y: 40 }]);
  });
  it("ao slide respeita a faixa de rodapé no alinhar embaixo", () => {
    const area = slideArea(1333, 750, 85);
    expect(alignRects([r("a", 10, 10, 100, 65)], "bottom", area)).toEqual([{ id: "a", x: 10, y: 600 }]);
    expect(alignRects([r("a", 10, 10, 133, 65)], "centerH", area)).toEqual([{ id: "a", x: 600, y: 10 }]);
  });
});

describe("alinhar a seleção ao slide como conjunto", () => {
  it("centraliza a linha inteira mantendo os vãos", () => {
    const area = slideArea(1000, 600, 0);
    const out = alignGroupToTarget([r("a", 100, 50, 100, 40), r("b", 250, 60, 100, 40)], "centerH", area);
    // caixa 100..350 (250 de largura) → começa em 375
    expect(out).toEqual([{ id: "a", x: 375, y: 50 }, { id: "b", x: 525, y: 60 }]);
  });
});

describe("espaçar", () => {
  it("vãos iguais mesmo com larguras diferentes; pontas ficam", () => {
    const out = distributeRects([r("a", 0, 0, 100, 10), r("b", 120, 0, 10, 10), r("c", 300, 0, 50, 10)], "h");
    // largura total 350 - soma 160 = 190 de vãos / 2 = 95
    expect(out.map((p) => p.x)).toEqual([0, 195, 300]);
  });
  it("menos de 3 blocos não muda", () => {
    expect(distributeRects([r("a", 0, 0, 10, 10), r("b", 50, 0, 10, 10)], "h").map((p) => p.x)).toEqual([0, 50]);
  });
});

describe("organizar", () => {
  it("linha bagunçada vira linha com topo alinhado e vão típico", () => {
    const out = tidyRects([r("a", 0, 0, 100, 50), r("b", 130, 12, 100, 50), r("c", 250, 5, 100, 50)]);
    // vãos existentes 30 e 20 → mediana 25
    expect(out).toEqual([{ id: "a", x: 0, y: 0 }, { id: "b", x: 125, y: 0 }, { id: "c", x: 250, y: 0 }]);
  });
  it("coluna única empilha à esquerda", () => {
    const out = tidyRects([r("a", 10, 0, 100, 40), r("b", 30, 70, 80, 40), r("c", 0, 150, 120, 40)]);
    // vãos 30 e 40 → 35
    expect(out).toEqual([{ id: "a", x: 0, y: 0 }, { id: "b", x: 0, y: 75 }, { id: "c", x: 0, y: 150 }]);
  });
  it("grade 2x2 mantém a ordem de leitura", () => {
    const out = tidyRects([
      r("d", 210, 115, 100, 60), r("a", 0, 0, 100, 60),
      r("b", 115, 8, 100, 60), r("c", 5, 100, 100, 60),
    ]);
    const by = Object.fromEntries(out.map((p) => [p.id, [p.x, p.y]]));
    expect(by.a).toEqual([0, 0]);
    expect(by.b[1]).toBe(0);
    expect(by.c[0]).toBe(0);
    expect(by.d[1]).toBe(by.c[1]);
    expect(by.b[0] - 100).toBe(by.c[1] - 60); // mesmo respiro na horizontal e na vertical
  });
});
