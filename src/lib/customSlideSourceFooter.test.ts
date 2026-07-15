import { describe, expect, it } from "vitest";
import type { CustomSlideConfig } from "./customSlide";
import { buildAutomaticSourceFooterText, getSourceFooterText, type SourceRowsByDataSource } from "./customSlideSourceFooter";
import type { PricingRow } from "./types";

const baseRows = [
  { periodo: "001.2026", mes: 1, ano: 2026, fy: "FY 2026", fyNum: 2026 },
  { periodo: "002.2026", mes: 2, ano: 2026, fy: "FY 2026", fyNum: 2026 },
  { periodo: "003.2026", mes: 3, ano: 2026, fy: "FY 2026", fyNum: 2026 },
] as PricingRow[];

function rowsBySource(rows: PricingRow[] = baseRows): SourceRowsByDataSource {
  return {
    ke30: rows,
    budget: rows,
    budget_real: rows,
    forecast: rows,
    rolling: rows,
  };
}

describe("customSlideSourceFooter", () => {
  it("groups distinct sources and maps budget sources to Superbase", () => {
    const config: CustomSlideConfig = {
      background: "FFFFFF",
      showHaraldFooter: true,
      blocks: [
        {
          id: "kpi-1",
          kind: "kpi",
          x: 0,
          y: 0,
          w: 100,
          h: 100,
          z: 1,
          label: "ROL",
          valueSize: 24,
          color: "C8102E",
          source: "dynamic",
          measure: "rol",
          periodMode: "month",
          periodValue: "001.2026",
          periodSelectionMode: "fixed",
          filters: {},
          dataSource: "ke30",
        },
        {
          id: "chart-1",
          kind: "chart",
          x: 0,
          y: 0,
          w: 100,
          h: 100,
          z: 2,
          chartType: "line",
          measure: "cm",
          breakdown: null,
          showGrid: false,
          showLegend: false,
          showLabels: false,
          filters: {},
          dataSource: "budget_real",
        },
      ],
    };

    expect(buildAutomaticSourceFooterText(config, rowsBySource()))
      .toBe("Fonte: KE30 · Superbase");
  });

  it("keeps relative sources stable when loaded rows change", () => {
    const config: CustomSlideConfig = {
      background: "FFFFFF",
      showHaraldFooter: true,
      blocks: [
        {
          id: "kpi-1",
          kind: "kpi",
          x: 0,
          y: 0,
          w: 100,
          h: 100,
          z: 1,
          label: "ROL",
          valueSize: 24,
          color: "C8102E",
          source: "dynamic",
          measure: "rol",
          periodMode: "month",
          periodValue: null,
          periodSelectionMode: "relative",
          relativePeriod: "latest_month_minus_1",
          filters: {},
          dataSource: "ke30",
        },
      ],
    };

    expect(buildAutomaticSourceFooterText(config, rowsBySource())).toBe("Fonte: KE30");
    expect(buildAutomaticSourceFooterText(config, rowsBySource([
      ...baseRows,
      { periodo: "004.2026", mes: 4, ano: 2026, fy: "FY 2026", fyNum: 2026 } as PricingRow,
    ]))).toBe("Fonte: KE30");
  });

  it("uses manual text literally until the slide returns to automatic mode", () => {
    const config: CustomSlideConfig = {
      background: "FFFFFF",
      showHaraldFooter: true,
      sourceFooter: { mode: "manual", manualText: "Fonte validada pelo time comercial" },
      blocks: [],
    };

    expect(getSourceFooterText(config, rowsBySource())).toBe("Fonte validada pelo time comercial");
  });
});
