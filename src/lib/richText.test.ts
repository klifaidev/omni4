import { describe, expect, it } from "vitest";
import { hasInlineMarkup, parseInlineMarkup, stripInlineMarkup, toggleInlineMarker } from "./richText";

describe("parseInlineMarkup", () => {
  it("texto sem marcação vira um trecho só", () => {
    expect(parseInlineMarkup("Receita do mês")).toEqual([{ text: "Receita do mês", bold: false, italic: false }]);
  });

  it("reconhece negrito, itálico e os dois juntos", () => {
    expect(parseInlineMarkup("Receita **cresceu 12%** no *mês*")).toEqual([
      { text: "Receita ", bold: false, italic: false },
      { text: "cresceu 12%", bold: true, italic: false },
      { text: " no ", bold: false, italic: false },
      { text: "mês", bold: false, italic: true },
    ]);
    expect(parseInlineMarkup("**muito *forte***")).toEqual([
      { text: "muito ", bold: true, italic: false },
      { text: "forte", bold: true, italic: true },
    ]);
  });

  it("asterisco solto não formata (ex.: nota de rodapé, multiplicação)", () => {
    expect(hasInlineMarkup("Preço* sujeito a revisão")).toBe(false);
    expect(hasInlineMarkup("2 * 3 = 6")).toBe(false);
    expect(stripInlineMarkup("2 * 3 = 6")).toBe("2 * 3 = 6");
  });

  it("stripInlineMarkup devolve o texto limpo", () => {
    expect(stripInlineMarkup("Receita **cresceu** no *mês*")).toBe("Receita cresceu no mês");
  });
});

describe("toggleInlineMarker", () => {
  it("envolve a seleção e mantém o mesmo texto selecionado", () => {
    const r = toggleInlineMarker("Receita cresceu no mês", 8, 15, "**");
    expect(r.value).toBe("Receita **cresceu** no mês");
    expect(r.value.slice(r.start, r.end)).toBe("cresceu");
  });

  it("deixa espaços das pontas fora da marcação", () => {
    const r = toggleInlineMarker("Receita cresceu no mês", 7, 16, "**");
    expect(r.value).toBe("Receita **cresceu** no mês");
  });

  it("tira a marcação quando já está aplicada (seleção por dentro ou por fora)", () => {
    const inside = toggleInlineMarker("Receita **cresceu** no mês", 10, 17, "**");
    expect(inside.value).toBe("Receita cresceu no mês");
    expect(inside.value.slice(inside.start, inside.end)).toBe("cresceu");
    const outside = toggleInlineMarker("Receita **cresceu** no mês", 8, 19, "**");
    expect(outside.value).toBe("Receita cresceu no mês");
  });

  it("itálico dentro de negrito não é confundido com o negrito", () => {
    const r = toggleInlineMarker("**cresceu**", 2, 9, "*");
    expect(r.value).toBe("***cresceu***");
    expect(parseInlineMarkup(r.value)).toEqual([{ text: "cresceu", bold: true, italic: true }]);
  });

  it("seleção vazia não muda nada", () => {
    expect(toggleInlineMarker("abc", 1, 1, "**").value).toBe("abc");
  });
});
