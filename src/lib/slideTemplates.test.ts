import { describe, expect, it } from "vitest";
import { SLIDE_TEMPLATES, type TemplateCtx } from "./slideTemplates";
import { SLIDE_TABLE_MEASURE_IDS } from "./pivotToSlide";
import { removeShadowedDefaultTitles, repairKindlessBlocks } from "@/store/slidesFlow";
import type { CustomBlock, KpiBlock, TableBlock, TitleBlock, TopSkuBlock } from "./customSlide";

const month = (m: number, ano: number) => ({ periodo: `${String(m).padStart(3, "0")}.${ano}`, mes: m, ano });
const ctx: TemplateCtx = {
  months: [month(7, 2026), month(8, 2026)],
  budgetMonths: [month(4, 2025), month(8, 2026)],
};

const customBlocks = () =>
  SLIDE_TEMPLATES.flatMap((template) =>
    template.build(ctx).flatMap((item) =>
      item.kind === "custom" ? [{ template: template.name, label: item.label, blocks: item.config.blocks }] : [],
    ),
  );

describe("templates de slides", () => {
  it("nenhum slide nasce com dois títulos sobrepostos", () => {
    for (const slide of customBlocks()) {
      const titles = slide.blocks.filter((b): b is TitleBlock => b.kind === "title");
      expect(titles.map((t) => t.text), `${slide.template} › ${slide.label}`).not.toContain("Título do slide");
      const boxes = titles.map((t) => `${t.x},${t.y},${t.w},${t.h}`);
      expect(new Set(boxes).size, `${slide.template} › ${slide.label}`).toBe(boxes.length);
    }
  });

  it("KPIs e Top SKUs usam período relativo (mês fechado ou FY), nunca a base inteira", () => {
    for (const slide of customBlocks()) {
      for (const block of slide.blocks) {
        if (block.kind !== "kpi" && block.kind !== "topSku") continue;
        const b = block as KpiBlock | TopSkuBlock;
        expect(b.periodMode, `${slide.template} › ${slide.label}`).not.toBe("all");
        expect(b.periodSelectionMode).toBe("relative");
        const isFy = /FY|fiscal/i.test(slide.label ?? "");
        expect(b.relativePeriod).toBe(isFy ? "latest_fy" : "latest_month_minus_1");
      }
    }
  });

  it("tabelas só pedem medidas que o bloco de tabela sabe calcular", () => {
    for (const slide of customBlocks()) {
      for (const block of slide.blocks) {
        if (block.kind !== "table") continue;
        for (const id of (block as TableBlock).measures) {
          expect(SLIDE_TABLE_MEASURE_IDS.has(id), `${slide.template} › ${slide.label}: ${id}`).toBe(true);
        }
      }
    }
  });
});

describe("repairKindlessBlocks (reparo de decks salvos)", () => {
  it("bloco sem tipo do layout de Bridge volta a ser o Bridge PVM, na mesma posição", () => {
    const broken = { id: "b1", x: 60, y: 145, w: 790, h: 500, z: 7 };
    const title = { id: "t1", kind: "title", x: 40, y: 30, w: 1240, h: 70, z: 1 };
    const [t, b] = repairKindlessBlocks([title, broken] as unknown as CustomBlock[]);
    expect(t).toBe(title);
    expect(b).toMatchObject({ id: "b1", kind: "omni_bridge_pvm", x: 60, y: 145, w: 790, h: 500, z: 7 });
  });

  it("deck sem bloco quebrado devolve o mesmo array", () => {
    const blocks = [{ id: "t1", kind: "title", x: 0, y: 0, w: 1, h: 1, z: 1 }] as unknown as CustomBlock[];
    expect(repairKindlessBlocks(blocks)).toBe(blocks);
  });
});

describe("removeShadowedDefaultTitles (reparo de decks salvos)", () => {
  const title = (text: string, x = 40, y = 30) => ({ kind: "title", text, x, y, w: 1240, h: 70 });

  it("remove o título padrão escondido sob o título do template", () => {
    const blocks: Array<{ kind: string; text?: string; x: number; y: number; w: number; h: number }> = [
      title("Título do slide"), title("KPIs do mês"), { kind: "kpi", x: 40, y: 140, w: 280, h: 140 },
    ];
    expect(removeShadowedDefaultTitles(blocks).map((b) => b.kind === "title" ? b.text : b.kind)).toEqual(["KPIs do mês", "kpi"]);
  });

  it("não mexe quando o título padrão foi movido ou é o único título", () => {
    const moved = [title("Título do slide", 40, 200), title("KPIs do mês")];
    expect(removeShadowedDefaultTitles(moved)).toHaveLength(2);
    const alone = [title("Título do slide")] as unknown as CustomBlock[];
    expect(removeShadowedDefaultTitles(alone)).toHaveLength(1);
  });
});
