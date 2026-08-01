import { describe, expect, it } from "vitest";
import type { TableBlock } from "./customSlide";
import {
  TABLE_ROW_H,
  effectiveTableRowHeight,
  resolveTableFit,
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
  it("reduces shown rows in auto-fit mode so rows fit without partial cuts", () => {
    const block = tableBlock({ h: 92, autoFit: true });

    const fit = resolveTableFit(block, 10);

    expect(fit).toEqual({ shown: 2, total: 10, truncated: true });
    expect(effectiveTableRowHeight(block, fit.shown)).toBe(TABLE_ROW_H);
  });

  it("uses the natural row height when table auto-fit is enabled", () => {
    const block = tableBlock({ h: 120, autoFit: true });

    expect(effectiveTableRowHeight(block, 8)).toBe(TABLE_ROW_H);
    expect(tableHeightWithExtraRows(block, 8, 1)).toBe(150);
  });

  it("shows exactly maxRows in manual mode when there is enough natural-height space", () => {
    const block = tableBlock({
      h: 240,
      autoFit: false,
      maxRows: 5,
    });

    const fit = resolveTableFit(block, 12);

    expect(fit).toEqual({ shown: 5, total: 12, truncated: true });
    expect(effectiveTableRowHeight(block, fit.shown)).toBe(TABLE_ROW_H);
    expect(tableHeightWithExtraRows(block, fit.shown, 1)).toBe(270);
  });

  it("keeps exactly maxRows in compressed manual mode instead of omitting rows", () => {
    const block = tableBlock({
      h: 120,
      autoFit: false,
      maxRows: 8,
    });

    const fit = resolveTableFit(block, 12);

    expect(fit).toEqual({ shown: 8, total: 12, truncated: true });
    expect(effectiveTableRowHeight(block, fit.shown)).toBe(10);
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

  it("documents the extreme manual fallback with a 1px minimum row-height estimate", () => {
    const block = tableBlock({
      h: 30,
      autoFit: false,
      maxRows: 8,
      title: undefined,
    });

    const fit = resolveTableFit(block, 8);

    expect(fit).toEqual({ shown: 8, total: 8, truncated: false });
    expect(effectiveTableRowHeight(block, fit.shown)).toBe(1);
    expect(tableHeightWithExtraRows(block, fit.shown, 1)).toBe(35);
  });
});
