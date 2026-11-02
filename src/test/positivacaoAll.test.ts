import { describe, expect, it } from "vitest";
import { buildPositivacaoAll, buildPositivacaoSeries, POSITIVACAO_DIMS } from "@/lib/positivacao";
import type { PricingRow } from "@/lib/types";

function row(partial: Partial<PricingRow>): PricingRow {
  return {
    periodo: "001.2026",
    mes: 1,
    ano: 2026,
    rol: 10,
    volumeKg: 1,
    cliente: "100 CLIENTE",
    categoria: "Cat A",
    marca: "Marca",
    canalAjustado: "Canal",
    gestorResp: "Gestor",
    sku: "1",
    skuDesc: "SKU 1",
    ...partial,
  } as PricingRow;
}

describe("Positivação com todas as aberturas numa passada", () => {
  const rows = [
    row({}),
    row({ cliente: "100 OUTRO NOME DO MESMO CLIENTE" }),
    row({ cliente: "200 CLIENTE", categoria: "Cat B" }),
    row({ cliente: "300 CLIENTE", categoria: "   ", rol: 0, volumeKg: 0 }),
    row({ cliente: "SEM NUMERO", categoria: "Cat C" }),
    row({ cliente: undefined, categoria: "Cat D" }),
    row({ cliente: "400 CLIENTE", categoria: "", periodo: "002.2026", mes: 2 }),
  ];

  it("dá o mesmo resultado de pedir cada abertura sozinha", () => {
    const all = buildPositivacaoAll(rows, 13);
    for (const { key } of POSITIVACAO_DIMS) {
      expect(all[key]).toEqual(buildPositivacaoSeries([...rows], key, 13));
    }
  });

  it("conta clientes únicos pelo número e ignora linha sem venda ou sem número", () => {
    const series = buildPositivacaoAll(rows, 13).categoria;
    const catA = series.table.find((r) => r.key === "Cat A");
    expect(catA?.months["001.2026"]).toBe(1);
    expect(series.table.find((r) => r.key === "Cat C")).toBeUndefined();
    expect(series.table.find((r) => r.key === "Cat D")).toBeUndefined();
    expect(series.table.find((r) => r.key === "Sem categoria")?.months["002.2026"]).toBe(1);
  });

  it("guarda o resultado pela identidade da base", () => {
    expect(buildPositivacaoAll(rows, 13)).toBe(buildPositivacaoAll(rows, 13));
    expect(buildPositivacaoAll([...rows], 13)).not.toBe(buildPositivacaoAll(rows, 13));
  });
});
