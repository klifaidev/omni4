import { describe, expect, it } from "vitest";

import type { BudgetRow } from "./budget";
import { computeBridgeYtdRealVsBudget, computeBridgeYtdVsYtd, validateBridgeAgainstDre } from "./bridgeYtdBudget";
import type { PricingRow } from "./types";

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
    sku: categoria,
    volumeKg,
    receita,
    cm,
    cpv,
  };
}

// Ao contrário de row() acima (que crava fy="FY26" pra todo mundo, o que
// serve pra comparar dentro de um único ano fiscal), aqui o fy é calculado
// de verdade (abril–março) — necessário pra testar uma comparação que
// atravessa dois anos fiscais diferentes.
function rowRealFy(
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
  const fyStart = mes >= 4 ? ano : ano - 1;
  return {
    periodo,
    mes,
    ano,
    fy: `FY${String(fyStart).slice(-2)}/${String(fyStart + 1).slice(-2)}`,
    fyNum: fyStart * 100 + ((fyStart + 1) % 100),
    kind,
    categoria,
    sku: categoria,
    volumeKg,
    receita,
    cm,
    cpv,
  };
}

describe("computeBridgeYtdVsYtd", () => {
  it("compares current fiscal-year YTD real against the same months of the previous fiscal year", () => {
    const result = computeBridgeYtdVsYtd([
      // FY25/26 (ano fiscal anterior): Abr–Jun/25
      rowRealFy("real", "004.2025", 40),
      rowRealFy("real", "005.2025", 50),
      rowRealFy("real", "006.2025", 60),
      // FY26/27 (ano fiscal atual): Abr–Jun/26 — mesma janela de meses
      rowRealFy("real", "004.2026", 45),
      rowRealFy("real", "005.2026", 55),
      rowRealFy("real", "006.2026", 65),
    ], {}, "cm");

    expect(result?.fy).toBe("FY26/27");
    expect(result?.periods).toEqual(["004.2026", "005.2026", "006.2026"]);
    expect(result?.result.base).toBe(150); // FY25/26 Abr–Jun
    expect(result?.result.current).toBe(165); // FY26/27 Abr–Jun
    expect(result?.result.baseLabel).toContain("FY25/26");
    expect(result?.result.currentLabel).toContain("FY26/27");
  });

  it("uses only the same relative months of the previous fiscal year, ignoring extra months", () => {
    const result = computeBridgeYtdVsYtd([
      // Ano fiscal anterior tem o ano inteiro, mas só Abr-Mai devem entrar
      // na comparação (janela igual à do ano atual).
      rowRealFy("real", "004.2025", 40),
      rowRealFy("real", "005.2025", 50),
      rowRealFy("real", "012.2025", 999), // Dez/25 — fora da janela, deve ser ignorado
      rowRealFy("real", "004.2026", 45),
      rowRealFy("real", "005.2026", 55),
    ], {}, "cm");

    expect(result?.result.base).toBe(90); // só Abr+Mai do FY anterior, não os 999
    expect(result?.result.current).toBe(100);
  });

  it("respects slide filters before calculating the bridge", () => {
    const result = computeBridgeYtdVsYtd([
      rowRealFy("real", "004.2025", 40, "Chocolates"),
      rowRealFy("real", "004.2025", 80, "Coberturas"),
      rowRealFy("real", "004.2026", 45, "Chocolates"),
      rowRealFy("real", "004.2026", 90, "Coberturas"),
    ], { categoria: ["Chocolates"] }, "cm");

    expect(result?.result.base).toBe(40);
    expect(result?.result.current).toBe(45);
  });

  it("returns null when there is no data for the previous fiscal year", () => {
    const result = computeBridgeYtdVsYtd([
      rowRealFy("real", "004.2026", 45),
      rowRealFy("real", "005.2026", 55),
    ], {}, "cm");

    expect(result).toBeNull();
  });

  it("returns null when there is no real data at all", () => {
    const result = computeBridgeYtdVsYtd([], {}, "cm");
    expect(result).toBeNull();
  });
});

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
    expect(result?.result.othersLabel).toBe("Mix e Resíduo Comercial");
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

  it("derives implicit cost from receita minus CM when Budget CPV is missing", () => {
    const result = computeBridgeYtdRealVsBudget([
      row("budget", "004.2025", 40, "Chocolates", Number.NaN, 10, 100),
      row("real", "004.2025", 35, "Chocolates", -999, 10, 95),
    ], {}, "cm");

    expect(result?.baseRows[0]?.cogs).toBe(60);
    expect(result?.compRows[0]?.cogs).toBe(60);
  });

  it("uses the simplified Superbase bridge formula: volume, price, implicit cost and residual others", () => {
    const result = computeBridgeYtdRealVsBudget([
      row("budget", "004.2025", 40, "Chocolates", -60, 10, 100),
      row("real", "004.2025", 42, "Chocolates", -84, 12, 132),
    ], {}, "cm");

    expect(result?.result.volume).toBeCloseTo(8);
    expect(result?.result.price).toBeCloseTo(12);
    expect(result?.result.cost).toBeCloseTo(-18);
    expect(result?.result.others).toBeCloseTo(0);
    expect(result?.result.current).toBeCloseTo(
      (result?.result.base ?? 0)
      + (result?.result.volume ?? 0)
      + (result?.result.price ?? 0)
      + (result?.result.cost ?? 0)
      + (result?.result.others ?? 0),
    );
  });

  it("does not inflate cost/residual when Budget CPV is absent but receita and CM are available", () => {
    const result = computeBridgeYtdRealVsBudget([
      row("budget", "004.2025", 40, "Chocolates", Number.NaN, 10, 100),
      row("real", "004.2025", 50, "Chocolates", -999, 12, 132),
    ], {}, "cm");
    const gap = Math.abs((result?.result.current ?? 0) - (result?.result.base ?? 0));
    const noise = Math.abs(result?.result.cost ?? 0) + Math.abs(result?.result.others ?? 0);

    expect(result?.baseRows[0]?.cogs).toBe(60);
    expect(result?.compRows[0]?.cogs).toBe(82);
    expect(noise).toBeLessThanOrEqual(gap * 5);
  });

  it("routes low-volume SKUs to mix/residual instead of unstable unit effects", () => {
    const result = computeBridgeYtdRealVsBudget([
      row("budget", "004.2025", 4000, "Base", -6000, 1000, 10000),
      row("real", "004.2025", 4200, "Base", -6300, 1000, 10500),
      row("budget", "004.2025", 4, "Tiny", -1, 0.5, 5),
      row("real", "004.2025", 6, "Tiny", -1000, 500, 5000),
    ], {}, "cm");

    const tiny = result?.result.skuDetails.find((detail) => detail.sku === "Tiny");
    expect(tiny?.residualCause).toBe("low_volume");
    expect(tiny?.priceEffect).toBe(0);
    expect(tiny?.costEffect).toBe(0);
    expect(tiny?.lowVolumeResidualEffect).toBeCloseTo(2);
  });

  it("validates bridge current against an independent DRE CM total", () => {
    const result = computeBridgeYtdRealVsBudget([
      row("budget", "004.2025", 40, "Chocolates", -60, 10, 100),
      row("real", "004.2025", 42, "Chocolates", -84, 12, 132),
    ], {}, "cm");
    const validation = validateBridgeAgainstDre(result!.result, [{
      periodo: "004.2025",
      mes: 4,
      ano: 2025,
      fy: "FY26",
      fyNum: 2026,
      volumeKg: 12,
      rol: 132,
      cogs: 84,
      custoVariavel: 84,
      custoFixo: 0,
      margemBruta: 48,
      contribMarginal: 42,
      frete: 0,
      comissao: 0,
    } satisfies PricingRow]);

    expect(validation.ok).toBe(true);
    expect(validation.difference).toBeCloseTo(0);
  });
});
