import { describe, expect, it } from "vitest";
import { advanceDeckFixedPeriods, capRowsAtReference, parsePeriodo, shiftPeriodo } from "./deckPeriod";
import { defaultItem, type SlideItem } from "./slidesFlow";
import { newBlock, type CustomBlock } from "./customSlide";

describe("períodos", () => {
  it("interpreta e avança meses, virando o ano", () => {
    expect(parsePeriodo("008.2026")).toEqual({ mes: 8, ano: 2026 });
    expect(parsePeriodo("FY25/26")).toBeNull();
    expect(shiftPeriodo("012.2025", 1)).toBe("001.2026");
    expect(shiftPeriodo("001.2026", -1)).toBe("012.2025");
  });
});

describe("capRowsAtReference", () => {
  const rows = [
    { mes: 6, ano: 2026, kind: "real" },
    { mes: 7, ano: 2026, kind: "real" },
    { mes: 8, ano: 2026, kind: "real" },
    { mes: 12, ano: 2026, kind: "budget" },
  ];

  it("corta o realizado depois da referência e mantém o que `keep` protege", () => {
    expect(capRowsAtReference(rows, "007.2026").map((r) => r.mes)).toEqual([6, 7]);
    expect(capRowsAtReference(rows, "007.2026", (r) => r.kind === "budget").map((r) => r.mes)).toEqual([6, 7, 12]);
  });

  it("sem referência devolve o mesmo array; com referência, o mesmo resultado em cache", () => {
    expect(capRowsAtReference(rows, null)).toBe(rows);
    expect(capRowsAtReference(rows, "007.2026")).toBe(capRowsAtReference(rows, "007.2026"));
  });
});

function custom(blocks: CustomBlock[]): SlideItem {
  const item = defaultItem("custom");
  if (item.kind !== "custom") throw new Error();
  return { ...item, config: { ...item.config, blocks } };
}

describe("advanceDeckFixedPeriods", () => {
  it("avança só os períodos fixos de meses, em blocos e slides nativos", () => {
    const kpiFixed = { ...newBlock("kpi", 1), periodSelectionMode: "fixed", periodMode: "month", periodValue: "007.2026" } as CustomBlock;
    const kpiRelative = { ...newBlock("kpi", 2) } as CustomBlock; // relativo por padrão
    const table = { ...newBlock("table", 3), monthFilter: { mode: "fixed", periods: ["006.2026", "007.2026"] } } as CustomBlock;
    const dreFy = { ...newBlock("dre", 4), periodosSelectionMode: "fixed", periodMode: "fy", periodos: ["FY25/26"] } as CustomBlock;
    const bridge = { ...defaultItem("bridge_pvm"), config: { mode: "month", base: "006.2026", comp: "007.2026", filters: {} } } as SlideItem;
    const budget = { ...defaultItem("budget_evo"), config: { start: "004.2026", end: null, filters: {} } } as SlideItem;
    const deck = [custom([kpiFixed, kpiRelative, table, dreFy]), bridge, budget, defaultItem("cover")];

    const result = advanceDeckFixedPeriods(deck);
    const [c, br, bu] = result.items as Array<SlideItem & { config: Record<string, unknown> }>;
    const blocks = (c.config as { blocks: Array<Record<string, unknown>> }).blocks;

    expect(blocks[0].periodValue).toBe("008.2026");
    expect(blocks[1].periodValue).toBeNull();
    expect((blocks[2].monthFilter as { periods: string[] }).periods).toEqual(["007.2026", "008.2026"]);
    expect(blocks[3].periodos).toEqual(["FY25/26"]);
    expect([br.config.base, br.config.comp]).toEqual(["007.2026", "008.2026"]);
    expect([bu.config.start, bu.config.end]).toEqual(["005.2026", null]);

    expect(result.changed).toBe(6);
    expect(result.slides).toBe(3);
    expect(result.skippedFiscal).toBe(1);
    expect(result.latest).toBe("008.2026");
  });

  it("não altera o deck original (Desfazer restaura o anterior)", () => {
    const bridge = { ...defaultItem("bridge_pvm"), config: { mode: "month", base: "006.2026", comp: "007.2026", filters: {} } } as SlideItem;
    advanceDeckFixedPeriods([bridge]);
    expect((bridge.config as { base: string }).base).toBe("006.2026");
  });
});
