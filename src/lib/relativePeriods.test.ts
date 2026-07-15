import { describe, expect, it } from "vitest";
import type { PricingRow } from "./types";
import { resolvePeriodValue, resolveRelativePeriod } from "./relativePeriods";

const rows = [
  { periodo: "001.2026", mes: 1, ano: 2026, fy: "FY 2026", fyNum: 2026 },
  { periodo: "002.2026", mes: 2, ano: 2026, fy: "FY 2026", fyNum: 2026 },
  { periodo: "003.2026", mes: 3, ano: 2026, fy: "FY 2026", fyNum: 2026 },
] as PricingRow[];

describe("relativePeriods", () => {
  it("resolves latest month minus one against the currently loaded rows", () => {
    expect(resolveRelativePeriod(rows, "latest_month_minus_1")).toBe("002.2026");

    const updatedRows = [
      ...rows,
      { periodo: "004.2026", mes: 4, ano: 2026, fy: "FY 2026", fyNum: 2026 },
    ] as PricingRow[];

    expect(resolveRelativePeriod(updatedRows, "latest_month_minus_1")).toBe("003.2026");
  });

  it("keeps fixed values unchanged when new rows are loaded", () => {
    const updatedRows = [
      ...rows,
      { periodo: "004.2026", mes: 4, ano: 2026, fy: "FY 2026", fyNum: 2026 },
    ] as PricingRow[];

    expect(resolvePeriodValue(updatedRows, "month", "002.2026", "fixed", "latest_month_minus_1"))
      .toBe("002.2026");
  });

  it("resolves relative fiscal years independently from month presets", () => {
    const fyRows = [
      ...rows,
      { periodo: "001.2027", mes: 1, ano: 2027, fy: "FY 2027", fyNum: 2027 },
    ] as PricingRow[];

    expect(resolvePeriodValue(fyRows, "fy", null, "relative", "latest_fy_minus_1"))
      .toBe("FY 2026");
  });
});
