import { describe, expect, it } from "vitest";
import { isTableMeasureUnavailable, TABLE_MEASURE_KPI_ID } from "./customSlide";
import { computePivot } from "./pivot";
import { CUSTOM_TABLE_MEASURES } from "@/components/pricing/custom/BlockRenderer";

describe("medidas da Tabela do slide", () => {
  it("no Budget, MB/Frete/Comissão (ids da Tabela) ficam indisponíveis", () => {
    expect(isTableMeasureUnavailable("mb_real", "budget")).toBe(true);
    expect(isTableMeasureUnavailable("frete_real", "budget")).toBe(true);
    expect(isTableMeasureUnavailable("mb_pct_real", "budget")).toBe(true);
    expect(isTableMeasureUnavailable("cm_pct_real", "budget")).toBe(false);
    expect(isTableMeasureUnavailable("mb_real", "ke30")).toBe(false);
  });

  it("toda medida da Tabela tem equivalente no catálogo KPI/Gráfico", () => {
    for (const m of CUSTOM_TABLE_MEASURES) expect(TABLE_MEASURE_KPI_ID[m.id]).toBeTruthy();
  });

  it("CM % soma numerador e denominador antes de dividir, mesmo sem ROL visível", () => {
    const rows = [
      { marca: "A", rol_real: 100, cm_real: 10 },
      { marca: "A", rol_real: 300, cm_real: 90 },
    ];
    const cmPct = CUSTOM_TABLE_MEASURES.find((m) => m.id === "cm_pct_real")!;
    const out = computePivot(rows, {
      rows: ["marca"], cols: [], values: [cmPct], measureCatalog: CUSTOM_TABLE_MEASURES, filters: {},
    });
    const key = out.leafRowHeaders[0].key;
    expect(out.rowTotals.get(key)?.cm_pct_real).toBeCloseTo(0.25);
  });
});
