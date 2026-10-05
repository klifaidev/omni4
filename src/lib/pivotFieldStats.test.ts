import { describe, expect, it } from "vitest";
import { countDistinctCombos, estimateLayoutSize, type LayoutSizeLimits } from "./pivotFieldStats";

// 2 marcas, cada SKU pertence a uma só marca; 3 meses.
const rows = ["A", "B"].flatMap((marca) =>
  [1, 2, 3].flatMap((s) => ["Jan", "Fev", "Mar"].map((mes) => ({ marca, sku: `${marca}${s}`, mes }))),
);
const limits: LayoutSizeLimits = { colLimit: { top: 2, threshold: 3 }, maxRows: 1000, maxCols: 100, maxCells: 1000, warnCells: 50 };
const counter = (dims: string[]) => countDistinctCombos(rows, dims);

describe("prévia de tamanho da montagem", () => {
  it("conta combinações que existem, não o produto das cardinalidades", () => {
    expect(countDistinctCombos(rows, ["marca", "sku"])).toBe(6); // não 2 × 6
    expect(countDistinctCombos(rows, [])).toBe(1);
  });

  it("linhas agrupadas somam os subtotais; colunas ganham a coluna Total", () => {
    const e = estimateLayoutSize({ rows: ["marca", "sku"], cols: ["mes"], values: ["rol"] }, counter, limits);
    expect(e.rows).toBe(6 + 2);
    expect(e.cols).toBe(3);
    expect(e.colsLimited).toBe(false);
    expect(e.cells).toBe(8 * (3 + 1) * 1);
    expect(e.tone).toBe("ok");
  });

  it("aplica o Top N + Outros acima do limite e classifica o peso", () => {
    const e = estimateLayoutSize({ rows: ["mes"], cols: ["sku"], values: ["rol", "cm"] }, counter, limits);
    expect(e.cols).toBe(6);
    expect(e.colsLimited).toBe(true);
    expect(e.colsShown).toBe(3); // 2 maiores + Outros
    expect(e.cells).toBe(3 * (3 + 1) * 2);
    expect(e.tone).toBe("ok");
    const heavy = estimateLayoutSize({ rows: ["marca", "sku"], cols: ["mes"], values: ["a", "b"] }, counter, { ...limits, warnCells: 10 });
    expect(heavy.tone).toBe("warn");
    const huge = estimateLayoutSize({ rows: ["marca", "sku"], cols: ["mes"], values: ["a"] }, counter, { ...limits, maxCells: 5 });
    expect(huge.tone).toBe("danger");
  });
});
