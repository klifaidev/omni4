import { describe, expect, it } from "vitest";
import { computeKpiComparison, formatKpiDelta } from "@/lib/customKpi";
import type { KpiBlock } from "@/lib/customSlide";
import { makeRow } from "./_helpers";

function kpi(p: Partial<KpiBlock> = {}): KpiBlock {
  return {
    id: "kpi-1", kind: "kpi", x: 0, y: 0, w: 280, h: 130, z: 1,
    label: "ROL", valueSize: 36, color: "C8102E",
    source: "dynamic", measure: "rol",
    periodMode: "month", periodSelectionMode: "fixed", periodValue: "002.2026",
    filters: {}, format: "auto", dataSource: "ke30", compare: "prevMonth",
    ...p,
  };
}

const rows = [
  makeRow({ periodo: "002.2025", mes: 2, ano: 2025, fy: "FY24/25", rol: 80, custoVariavel: 40, contribMarginal: 20 }),
  makeRow({ periodo: "001.2026", mes: 1, ano: 2026, fy: "FY25/26", rol: 100, custoVariavel: 50, contribMarginal: 30 }),
  makeRow({ periodo: "002.2026", mes: 2, ano: 2026, fy: "FY25/26", rol: 110, custoVariavel: 60, contribMarginal: 22 }),
];

describe("comparação do KPI", () => {
  it("vs mês anterior: variação relativa, subir é bom", () => {
    const c = computeKpiComparison(rows, kpi())!;
    expect(c.referenceLabel).toBe("Jan/26");
    expect(c.delta).toBeCloseTo(0.1);
    expect(c.direction).toBe("up");
    expect(c.good).toBe(true);
    expect(formatKpiDelta(c)).toBe("+10,0%");
  });

  it("vs mesmo mês do ano anterior", () => {
    const c = computeKpiComparison(rows, kpi({ compare: "prevYear" }))!;
    expect(c.referenceLabel).toBe("Fev/25");
    expect(c.delta).toBeCloseTo(110 / 80 - 1);
  });

  it("custo subindo é ruim", () => {
    const c = computeKpiComparison(rows, kpi({ measure: "cv" }))!;
    expect(c.direction).toBe("up");
    expect(c.good).toBe(false);
  });

  it("medida em % compara em pontos percentuais", () => {
    const c = computeKpiComparison(rows, kpi({ measure: "cmPct" }))!;
    expect(c.pp).toBe(true);
    expect(c.delta).toBeCloseTo(22 / 110 - 30 / 100);
    expect(formatKpiDelta(c)).toBe("−10,0 p.p.");
  });

  it("sem período (Tudo) ou sem referência, não compara", () => {
    expect(computeKpiComparison(rows, kpi({ periodMode: "all" }))).toBeNull();
    expect(computeKpiComparison(rows, kpi({ periodValue: "001.2026", compare: "prevYear" }))).toBeNull();
    expect(computeKpiComparison(rows, kpi({ compare: "none" }))).toBeNull();
  });

  it("ano fiscal vs ano anterior", () => {
    const c = computeKpiComparison(rows, kpi({ periodMode: "fy", periodValue: "FY25/26", compare: "prevYear" }))!;
    expect(c.referenceLabel).toBe("FY24/25");
    expect(c.delta).toBeCloseTo(210 / 80 - 1);
  });
});
