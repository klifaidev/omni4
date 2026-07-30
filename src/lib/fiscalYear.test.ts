import { describe, expect, it } from "vitest";
import { fiscalYearStartYear, isCurrentFiscalYearMonth, isInFiscalYearStart, latestFiscalYearStartYear } from "./fiscalYear";

describe("fiscal year helpers", () => {
  it("classifies months in a fiscal year that starts in April", () => {
    expect(fiscalYearStartYear(4, 2026)).toBe(2026);
    expect(isInFiscalYearStart({ mes: 4, ano: 2026 }, 2026)).toBe(true);
    expect(isInFiscalYearStart({ mes: 12, ano: 2026 }, 2026)).toBe(true);
    expect(isInFiscalYearStart({ mes: 1, ano: 2027 }, 2026)).toBe(true);
    expect(isInFiscalYearStart({ mes: 3, ano: 2027 }, 2026)).toBe(true);
    expect(isInFiscalYearStart({ mes: 3, ano: 2026 }, 2026)).toBe(false);
  });

  it("selects only current fiscal year months from a mixed real/budget window", () => {
    const rows = [
      { label: "Jan/26", mes: 1, ano: 2026, realVol: 500, budVol: 400 },
      { label: "Fev/26", mes: 2, ano: 2026, realVol: 500, budVol: 400 },
      { label: "Mar/26", mes: 3, ano: 2026, realVol: 500, budVol: 400 },
      { label: "Abr/26", mes: 4, ano: 2026, realVol: 287, budVol: 620 },
      { label: "Mai/26", mes: 5, ano: 2026, realVol: 446, budVol: 526 },
      { label: "Jun/26", mes: 6, ano: 2026, realVol: 508, budVol: 652 },
      { label: "Jul/26", mes: 7, ano: 2026, realVol: 0, budVol: 544 },
      { label: "Ago/26", mes: 8, ano: 2026, realVol: 0, budVol: 676 },
    ];
    const currentFiscalYearStart = latestFiscalYearStartYear(rows);
    const included = rows.filter((row) => row.realVol > 0 && isCurrentFiscalYearMonth(row, currentFiscalYearStart));

    expect(currentFiscalYearStart).toBe(2026);
    expect(included.map((row) => row.label)).toEqual(["Abr/26", "Mai/26", "Jun/26"]);
    expect(included.reduce((sum, row) => sum + (row.realVol - row.budVol), 0)).toBe(-557);
  });
});
