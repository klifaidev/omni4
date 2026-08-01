import { describe, expect, it } from "vitest";
import type { TableBlock } from "./customSlide";
import {
  TABLE_ROW_H,
  effectiveTableRowHeight,
  tableHeightWithExtraRows,
} from "./customCapacity";

function tableBlock(patch: Partial<TableBlock> = {}): TableBlock {
  return {
    id: "table-1",
    kind: "table",
    source: "ke30",
    x: 0,
    y: 0,
    w: 600,
    h: 240,
    z: 1,
    measures: ["rol_real"],
    rowDims: ["categoria"],
    colDim: null,
    filters: {},
    ...patch,
  };
}

describe("customCapacity table row height", () => {
  it("uses the natural row height when table auto-fit is enabled", () => {
    const block = tableBlock({ h: 120, autoFit: true });

    expect(effectiveTableRowHeight(block, 8)).toBe(TABLE_ROW_H);
    expect(tableHeightWithExtraRows(block, 8, 1)).toBe(150);
  });

  it("preserves compressed row height for manual tables when adding the Others row", () => {
    const block = tableBlock({
      h: 120,
      autoFit: false,
      maxRows: 8,
      title: undefined,
    });

    expect(effectiveTableRowHeight(block, 8)).toBe(10);
    expect(tableHeightWithExtraRows(block, 8, 1)).toBe(134);
  });

  it("accounts for table title space when calculating compressed manual row height", () => {
    const block = tableBlock({
      h: 160,
      autoFit: false,
      maxRows: 8,
      title: "Tabela executiva",
      titleSize: 20,
    });

    expect(effectiveTableRowHeight(block, 8)).toBe(11);
    expect(tableHeightWithExtraRows(block, 8, 1)).toBe(175);
  });
});
