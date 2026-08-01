import { describe, expect, it } from "vitest";
import {
  computeBudgetEvoAccumGap,
  formatBudgetEvoGapLabel,
} from "./slidesFlow";

type GapRow = Parameters<typeof computeBudgetEvoAccumGap>[0][number];

function row(
  mes: number,
  ano: number,
  realVol: number,
  budVol: number,
  realCm: number,
  budCm: number,
): GapRow {
  return { mes, ano, realVol, budVol, realCm, budCm };
}

describe("Budget Evolutivo accumulated GAP", () => {
  it("sums Real minus Budget for all comparable months in the latest fiscal year", () => {
    const rows = [
      row(4, 2026, 100, 120, 1_000, 1_200),
      row(5, 2026, 150, 100, 1_700, 1_300),
      row(6, 2026, 90, 110, 900, 1_000),
    ];

    expect(computeBudgetEvoAccumGap(rows)).toEqual({
      volGap: 10,
      cmGap: 100,
    });
    expect(formatBudgetEvoGapLabel(100)).toBe("+100");
    expect(formatBudgetEvoGapLabel(-100)).toBe("-100");
  });

  it("excludes January to March from the previous fiscal year when April onward exists", () => {
    const rows = [
      row(1, 2026, 500, 400, 5_000, 4_000),
      row(2, 2026, 500, 400, 5_000, 4_000),
      row(3, 2026, 500, 400, 5_000, 4_000),
      row(4, 2026, 287, 620, 2_870, 6_200),
      row(5, 2026, 446, 526, 4_460, 5_260),
      row(6, 2026, 508, 652, 5_080, 6_520),
      row(7, 2026, 0, 544, 0, 5_440),
      row(8, 2026, 0, 676, 0, 6_760),
    ];

    expect(computeBudgetEvoAccumGap(rows)).toEqual({
      volGap: -557,
      cmGap: -5_570,
    });
  });

  it("returns explicit zero when the current fiscal year has no Real months yet", () => {
    const rows = [
      row(1, 2026, 500, 400, 5_000, 4_000),
      row(2, 2026, 500, 400, 5_000, 4_000),
      row(3, 2026, 500, 400, 5_000, 4_000),
      row(4, 2026, 0, 620, 0, 6_200),
      row(5, 2026, 0, 526, 0, 5_260),
      row(6, 2026, 0, 652, 0, 6_520),
    ];

    expect(computeBudgetEvoAccumGap(rows)).toEqual({
      volGap: 0,
      cmGap: 0,
    });
    expect(formatBudgetEvoGapLabel(0)).toBe("0");
  });

  it("keeps zero GAP distinct from missing Real months when Real equals Budget", () => {
    const rows = [
      row(4, 2026, 100, 100, 1_000, 1_000),
      row(5, 2026, 120, 120, 1_200, 1_200),
      row(6, 2026, 90, 90, 900, 900),
    ];

    expect(computeBudgetEvoAccumGap(rows)).toEqual({
      volGap: 0,
      cmGap: 0,
    });
    expect(formatBudgetEvoGapLabel(0)).toBe("0");
  });
});
