import { describe, expect, it } from "vitest";
import { defaultItem, slideDisplayName, type SlideItem } from "./slidesFlow";
import { defaultChartTitle, newChartBlock, type TitleBlock } from "./customSlide";

function customWithTitle(label: string, title: string): SlideItem {
  const item = defaultItem("custom");
  if (item.kind !== "custom") throw new Error("esperava slide personalizado");
  (item.config.blocks[0] as TitleBlock).text = title;
  return { ...item, label };
}

describe("slideDisplayName", () => {
  it("rótulo genérico dá lugar ao título do slide", () => {
    expect(slideDisplayName(customWithTitle("Slide em branco (cópia) (cópia)", "Margem por canal"), "Personalizado")).toBe("Margem por canal");
    expect(slideDisplayName(customWithTitle("Slide personalizado", "Resultado de agosto\nsubtítulo"), "Personalizado")).toBe("Resultado de agosto");
  });

  it("rótulo escrito pela pessoa sempre vence", () => {
    expect(slideDisplayName(customWithTitle("Abertura", "Margem por canal"), "Personalizado")).toBe("Abertura");
  });

  it("sem título útil, mantém o rótulo", () => {
    expect(slideDisplayName(customWithTitle("Slide em branco", "Título do slide"), "Personalizado")).toBe("Slide em branco");
  });
});

describe("defaultChartTitle", () => {
  it("gráfico mensal nasce dizendo o que mostra", () => {
    expect(newChartBlock("column", 0).title).toBe("Contribuição Marginal por mês");
    expect(defaultChartTitle("line", "rol")).toBe("ROL por mês");
  });

  it("tipos sem eixo mensal mantêm o nome do tipo", () => {
    expect(defaultChartTitle("pie", "cm")).toBe("Pizza");
  });
});
