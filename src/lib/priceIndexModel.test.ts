import { describe, expect, it } from "vitest";
import {
  calculatePricePredictionResiduals,
  calibratePriceIndices,
  calibratedIndicesToValues,
  predictIdealPrice,
} from "./priceIndexModel";
import type { PricingRow } from "./types";

function row(partial: Partial<PricingRow>): PricingRow {
  return {
    periodo: "001.2026",
    mes: 1,
    ano: 2026,
    fy: "FY25/26",
    fyNum: 2526,
    rol: 0,
    volumeKg: 0,
    cogs: 0,
    custoVariavel: 0,
    custoFixo: 0,
    margemBruta: 0,
    contribMarginal: 0,
    frete: 0,
    comissao: 0,
    ...partial,
  };
}

describe("price index model", () => {
  it("calibrates observed indices from weighted average prices", () => {
    const rows = [
      row({ sku: "A", sabor: "Chocolate", volumeKg: 10, rol: 100 }),
      row({ sku: "B", sabor: "Chocolate", volumeKg: 30, rol: 300 }),
      row({ sku: "C", sabor: "Morango", volumeKg: 20, rol: 300 }),
      row({ sku: "D", sabor: "Morango", volumeKg: 10, rol: 150 }),
    ];

    const indices = calibratePriceIndices(rows, "sabor", "Chocolate");
    const chocolate = indices.find((item) => item.value === "Chocolate");
    const morango = indices.find((item) => item.value === "Morango");

    expect(chocolate?.avgPrice).toBe(10);
    expect(chocolate?.index).toBe(1);
    expect(chocolate?.skuCount).toBe(2);
    expect(chocolate?.volumeKg).toBe(40);
    expect(morango?.avgPrice).toBe(15);
    expect(morango?.index).toBe(1.5);
    expect(morango?.skuCount).toBe(2);
  });

  it("predicts an ideal price from anchor and calibrated indices", () => {
    const predicted = predictIdealPrice({
      anchorSuggestedPrice: 11,
      sabor: "Morango",
      faixaPeso: "200g",
      formato: "Barra",
      indices: {
        sabor: { Morango: 1.5 },
        faixaPeso: { "200g": 2 },
        formato: { Barra: 1 },
      },
    });

    expect(predicted).toBeCloseTo(33);
  });

  it("compares predicted prices with actual weighted average prices and returns residuals", () => {
    const rows = [
      row({ sku: "A", sabor: "Chocolate", faixaPeso: "100g", formato: "Barra", volumeKg: 10, rol: 100 }),
      row({ sku: "B", sabor: "Morango", faixaPeso: "200g", formato: "Barra", volumeKg: 10, rol: 280 }),
      row({ sku: "C", sabor: "Morango", faixaPeso: "200g", formato: "Barra", volumeKg: 30, rol: 840 }),
    ];
    const sabor = calibratedIndicesToValues(calibratePriceIndices(rows, "sabor", "Chocolate"));

    const residuals = calculatePricePredictionResiduals(rows, {
      anchorSuggestedPrice: 10,
      indices: {
        sabor,
        faixaPeso: { "100g": 1, "200g": 2 },
        formato: { Barra: 1 },
      },
    });

    const morango200g = residuals.find((item) => item.sabor === "Morango" && item.faixaPeso === "200g");

    expect(morango200g?.actualPrice).toBe(28);
    expect(morango200g?.predictedPrice).toBeCloseTo(56);
    expect(morango200g?.residual).toBeCloseTo(28);
    expect(morango200g?.residualPct).toBeCloseTo(1);
    expect(morango200g?.skuCount).toBe(2);
    expect(morango200g?.volumeKg).toBe(40);
  });
});
