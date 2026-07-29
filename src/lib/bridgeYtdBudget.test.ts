import { describe, expect, it } from "vitest";

import type { BudgetRow } from "./budget";
import { computeBridgeYtdRealVsBudget } from "./bridgeYtdBudget";
import type { PricingRow } from "./types";

function budgetRow(periodo: string, cm: number, categoria = "Chocolates"): BudgetRow {
  const mes = Number(periodo.slice(0, 3));
  const ano = Number(periodo.slice(4));
  return {
    periodo,
    mes,
    ano,
    fy: "FY26",
    fyNum: 2026,
    kind: "budget",
    categoria,
    volumeKg: 10,
    receita: 100,
    cm,
    cpv: 70,
  };
}

function realRow(periodo: string, contribMarginal: number, categoria = "Chocolates"): PricingRow {
  const mes = Number(periodo.slice(0, 3));
  const ano = Number(periodo.slice(4));
  return {
    periodo,
    mes,
    ano,
    fy: "FY26",
    fyNum: 2026,
    categoria,
    volumeKg: 10,
    rol: 100,
    cogs: 60,
    custoVariavel: 60,
    custoFixo: 0,
    margemBruta: 40,
    contribMarginal,
    frete: 4,
    comissao: 1,
  };
}

describe("computeBridgeYtdRealVsBudget", () => {
  it("compares real pricing YTD only against budget for the same realized months", () => {
    const result = computeBridgeYtdRealVsBudget([
      budgetRow("004.2025", 40),
      budgetRow("005.2025", 50),
      budgetRow("006.2025", 60),
      budgetRow("007.2025", 999),
    ], [
      realRow("004.2025", 35),
      realRow("005.2025", 45),
      realRow("006.2025", 55),
    ], {}, "cm");

    expect(result?.periods).toEqual(["004.2025", "005.2025", "006.2025"]);
    expect(result?.result.base).toBe(150);
    expect(result?.result.current).toBe(135);
    expect(result?.result.currentLabel).toContain("Real YTD");
  });

  it("respects slide filters before calculating the bridge", () => {
    const result = computeBridgeYtdRealVsBudget([
      budgetRow("004.2025", 40, "Chocolates"),
      budgetRow("004.2025", 80, "Coberturas"),
    ], [
      realRow("004.2025", 35, "Chocolates"),
      realRow("004.2025", 75, "Coberturas"),
    ], { categoria: ["Coberturas"] }, "cm");

    expect(result?.result.base).toBe(80);
    expect(result?.result.current).toBe(75);
  });
});
