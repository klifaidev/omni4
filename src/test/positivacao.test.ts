import { describe, expect, it } from "vitest";
import { buildPositivacaoSeries } from "@/lib/positivacao";
import type { PricingRow } from "@/lib/types";

function row(patch: Partial<PricingRow>): PricingRow {
  return {
    periodo: "001.2026",
    mes: 1,
    ano: 2026,
    fy: "FY25/26",
    fyNum: 2526,
    rol: 100,
    volumeKg: 10,
    cogs: 0,
    custoVariavel: 0,
    custoFixo: 0,
    margemBruta: 0,
    contribMarginal: 0,
    frete: 0,
    comissao: 0,
    ...patch,
  };
}

describe("buildPositivacaoSeries", () => {
  it("conta clientes unicos ativos por mes e dimensao", () => {
    const series = buildPositivacaoSeries([
      row({ cliente: "100 Cliente A", categoria: "Chocolates" }),
      row({ cliente: "100 Cliente A", categoria: "Chocolates", marca: "Outra linha" }),
      row({ cliente: "200 Cliente B", categoria: "Chocolates" }),
      row({ cliente: "300 Cliente C", categoria: "Chocolates", volumeKg: 0, rol: 0 }),
    ], "categoria");

    expect(series.table[0].key).toBe("Chocolates");
    expect(series.table[0].ultimo).toBe(2);
  });

  it("monta evolutivo dos meses mais recentes", () => {
    const series = buildPositivacaoSeries([
      row({ periodo: "001.2026", mes: 1, cliente: "100 Cliente A", marca: "Melken" }),
      row({ periodo: "002.2026", mes: 2, cliente: "100 Cliente A", marca: "Melken" }),
      row({ periodo: "002.2026", mes: 2, cliente: "200 Cliente B", marca: "Melken" }),
    ], "marca");

    expect(series.months.map((m) => m.periodo)).toEqual(["001.2026", "002.2026"]);
    expect(series.table[0].ultimo).toBe(2);
    expect(series.table[0].delta).toBe(1);
  });
});
