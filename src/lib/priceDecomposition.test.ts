import { describe, expect, it } from "vitest";
import { calcPVM, computePriceDecomposition } from "./analytics";
import type { PricingRow } from "./types";

function row(periodo: string, sku: string, volumeKg: number, rol: number): PricingRow {
  const [mes, ano] = periodo.split(".").map(Number);
  return {
    periodo, mes, ano, fy: "FY26/27", fyNum: 2027, sku, skuDesc: `Produto ${sku}`,
    rol, volumeKg, cogs: rol * 0.6, custoVariavel: rol * 0.6, custoFixo: 0, margemBruta: rol * 0.4, contribMarginal: rol * 0.4, frete: 0, comissao: 0,
  } as PricingRow;
}

// Dois SKUs "normais" que baixaram o preço, e um SKU com volume irrelevante no mês-base e
// receita NEGATIVA (ajuste/estorno) que no mês seguinte volta com volume e preço normais.
const ROWS = [
  row("008.2026", "A", 5000, 5000 * 20), row("009.2026", "A", 5000, 5000 * 19),
  row("008.2026", "B", 3000, 3000 * 30), row("009.2026", "B", 3200, 3200 * 29),
  row("008.2026", "X", 0.6, -499), row("009.2026", "X", 29.5, 29.5 * 36),
];

describe("decomposição de preço da aba Análise de Preço", () => {
  const pd = computePriceDecomposition(ROWS, "008.2026", "009.2026", "month")!;
  const pvm = calcPVM(ROWS, "cm", "008.2026", "009.2026", "month");

  it("SKU com volume irrelevante e receita negativa não infla o efeito preço", () => {
    // Antes: (36 − (−832)) × 29,5 ≈ +25 mil só do SKU X, mudando o sinal do efeito.
    expect(pd.efeitoPrecoRs).toBeLessThan(0);
    const x = pd.skus.find((s) => s.sku === "X")!;
    expect(x.deltaPrecoRs).toBe(0);
  });

  it("o efeito preço da aba é o mesmo da Bridge PVM", () => {
    expect(pd.efeitoPrecoRs).toBeCloseTo(pvm.price, 6);
  });

  it("preço + mix continuam fechando a variação do preço médio", () => {
    expect(pd.efeitoPrecoRs + pd.efeitoMixRs).toBeCloseTo(pd.variacaoTotal * (5000 + 3200 + 29.5), 4);
  });

  it("o SKU sem volume relevante vira mix (nada some)", () => {
    const x = pd.skus.find((s) => s.sku === "X")!;
    expect(Math.abs(x.efeitoMixRs)).toBeGreaterThan(0);
  });
});
