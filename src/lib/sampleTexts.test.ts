import { describe, expect, it } from "vitest";
import { isSampleText } from "./sampleTexts";
import { defaultCustomSlide, newBlock, type TextBlock, type TitleBlock } from "./customSlide";

describe("isSampleText", () => {
  it("reconhece os textos que o editor insere", () => {
    expect(isSampleText((defaultCustomSlide().blocks[0] as TitleBlock).text)).toBe(true);
    expect(isSampleText((newBlock("text", 1) as TextBlock).text)).toBe(true);
    expect(isSampleText("Título da análise")).toBe(true); // layout "Título + KPIs"
    expect(isSampleText("  Título do slide  ")).toBe(true);
  });

  it("texto escrito pela pessoa não é exemplo", () => {
    expect(isSampleText("Resultado de agosto")).toBe(false);
    expect(isSampleText("")).toBe(false);
    expect(isSampleText(undefined)).toBe(false);
  });
});
