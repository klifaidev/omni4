import { describe, expect, it } from "vitest";

import type { BudgetRow } from "./budget";
import { computeBridgeYtdRealVsBudget } from "./bridgeYtdBudget";

function row(
  kind: BudgetRow["kind"],
  periodo: string,
  cm: number,
  categoria = "Chocolates",
  cpv = 70,
  volumeKg = 10,
  receita = 100,
): BudgetRow {
  const mes = Number(periodo.slice(0, 3));
  const ano = Number(periodo.slice(4));
  return {
    periodo,
    mes,
    ano,
    fy: "FY26",
    fyNum: 2026,
    kind,
    categoria,
    volumeKg,
    receita,
    cm,
    cpv,
  };
}

describe("computeBridgeYtdRealVsBudget", () => {
  it("compares Superbase real YTD only against budget for the same realized months", () => {
    const result = computeBridgeYtdRealVsBudget([
      row("budget", "004.2025", 40),
      row("budget", "005.2025", 50),
      row("budget", "006.2025", 60),
      row("budget", "007.2025", 999),
      row("real", "004.2025", 35),
      row("real", "005.2025", 45),
      row("real", "006.2025", 55),
    ], {}, "cm");

    expect(result?.periods).toEqual(["004.2025", "005.2025", "006.2025"]);
    expect(result?.result.base).toBe(150);
    expect(result?.result.current).toBe(135);
    expect(result?.result.freight).toBe(0);
    expect(result?.result.commission).toBe(0);
    expect(result?.result.othersLabel).toBe("Outros Custos");
    expect(result?.result.commercialCostsCollapsed).toBe(true);
    expect(result?.result.currentLabel).toContain("Real YTD");
  });

  it("respects slide filters before calculating the bridge", () => {
    const result = computeBridgeYtdRealVsBudget([
      row("budget", "004.2025", 40, "Chocolates"),
      row("budget", "004.2025", 80, "Coberturas"),
      row("real", "004.2025", 35, "Chocolates"),
      row("real", "004.2025", 75, "Coberturas"),
    ], { categoria: ["Coberturas"] }, "cm");

    expect(result?.result.base).toBe(80);
    expect(result?.result.current).toBe(75);
  });

  it("normalizes signed Superbase CPV using accounting direction before calculating cost effects", () => {
    const result = computeBridgeYtdRealVsBudget([
      row("budget", "004.2025", 40, "Chocolates", -70),
      row("real", "004.2025", 35, "Chocolates", 5),
    ], {}, "cm");

    expect(result?.baseRows[0]?.cogs).toBe(70);
    expect(result?.compRows[0]?.cogs).toBe(-5);
  });

  it("uses the simplified Superbase bridge formula: volume, price, CPV cost and residual others", () => {
    const result = computeBridgeYtdRealVsBudget([
      row("budget", "004.2025", 40, "Chocolates", -60, 10, 100),
      row("real", "004.2025", 42, "Chocolates", -84, 12, 132),
    ], {}, "cm");

    expect(result?.result.volume).toBeCloseTo(8);
    expect(result?.result.price).toBeCloseTo(12);
    expect(result?.result.cost).toBeCloseTo(-12);
    expect(result?.result.others).toBeCloseTo(-6);
    expect(result?.result.current).toBeCloseTo(
      (result?.result.base ?? 0)
      + (result?.result.volume ?? 0)
      + (result?.result.price ?? 0)
      + (result?.result.cost ?? 0)
      + (result?.result.others ?? 0),
    );
  });
});
