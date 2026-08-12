import { describe, expect, it } from "vitest";
import { evaluateCustomTable } from "./customTableFormulas";
import type { CustomCellValue } from "@/store/customTables";

describe("customTableFormulas", () => {
  it("evaluates arithmetic with precedence, parentheses, and cell references", () => {
    const rows: CustomCellValue[][] = [
      [10, 5, "=A1+B1*2", "=(A1+B1)*2"],
    ];

    const result = evaluateCustomTable(rows);

    expect(result[0][2].value).toBe(20);
    expect(result[0][3].value).toBe(30);
  });

  it("evaluates range functions for sum, average, and non-empty count", () => {
    const rows: CustomCellValue[][] = [
      [10, "=SOMA(A1:A3)", "=MEDIA(A1:A3)", "=CONTAGEM(A1:A4)"],
      [20, "", "", ""],
      [30, "", "", ""],
      ["", "", "", ""],
    ];

    const result = evaluateCustomTable(rows);

    expect(result[0][1].value).toBe(60);
    expect(result[0][2].value).toBe(20);
    expect(result[0][3].value).toBe(3);
  });

  it("recomputes dependent cells when referenced values change", () => {
    const before = evaluateCustomTable([[10, "=A1*2"]]);
    const after = evaluateCustomTable([[25, "=A1*2"]]);

    expect(before[0][1].value).toBe(20);
    expect(after[0][1].value).toBe(50);
  });

  it("reports circular references without looping forever", () => {
    const result = evaluateCustomTable([
      ["=B1", "=A1"],
    ]);

    expect(result[0][0].error).toBe("Referência circular");
    expect(result[0][1].error).toBe("Referência circular");
  });

  it("reports division by zero as a cell-local formula error", () => {
    const result = evaluateCustomTable([[10, 0, "=A1/B1"]]);

    expect(result[0][2].error).toBe("Divisão por zero");
    expect(result[0][2].value).toBe("Divisão por zero");
  });
});
