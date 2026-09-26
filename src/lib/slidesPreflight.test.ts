import { describe, expect, it } from "vitest";

import { buildSlidesPreflight } from "./slidesPreflight";
import { defaultItem, type SlideItem } from "./slidesFlow";
import type { TitleBlock } from "./customSlide";

function coverItem(id: string, title: string, hidden?: boolean): SlideItem {
  return {
    id,
    kind: "cover",
    hidden,
    config: { title, variant: "cover" },
  };
}

describe("buildSlidesPreflight", () => {
  it("reports an issue for an incomplete visible slide", () => {
    const report = buildSlidesPreflight([coverItem("a", "")]);
    expect(report.errors).toBe(1);
    expect(report.issues[0]?.slideId).toBe("a");
  });

  it("skips hidden slides entirely, even when incomplete", () => {
    const report = buildSlidesPreflight([coverItem("a", "", true)]);
    expect(report.issues).toHaveLength(0);
    expect(report.errors).toBe(0);
  });

  it("still reports issues for other visible slides when one is hidden", () => {
    const report = buildSlidesPreflight([
      coverItem("hidden-one", "", true),
      coverItem("visible-one", ""),
    ]);
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]?.slideId).toBe("visible-one");
  });

  it("avisa valor entre chaves que não existe, e não os conhecidos", () => {
    const item = defaultItem("custom");
    if (item.kind !== "custom") throw new Error("esperava slide personalizado");
    (item.config.blocks[0] as TitleBlock).text = "Resultado de {mês}: {receita do mes}";
    const titles = buildSlidesPreflight([item]).issues.map((i) => `${i.title}|${i.detail}`);
    expect(titles.filter((x) => x.startsWith("Valor não reconhecido"))).toEqual([
      expect.stringContaining("{receita do mes}"),
    ]);
    expect(titles.join()).not.toContain("{mês}");
  });
});
