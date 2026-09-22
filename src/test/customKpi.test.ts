import { describe, expect, it } from "vitest";
import { aggregateKpi, computeChartSeries, computeKpiBlock, pickMeasure } from "@/lib/customKpi";
import type { KpiBlock } from "@/lib/customSlide";
import { makeRow } from "./_helpers";

function kpiBlock(p: Partial<KpiBlock> = {}): KpiBlock {
  return {
    id: "kpi-1", kind: "kpi", x: 0, y: 0, w: 280, h: 130, z: 1,
    label: "Volume Médio", valueSize: 36, color: "C8102E",
    source: "dynamic", measure: "ticketMedio",
    periodMode: "all", filters: {}, format: "auto", dataSource: "ke30",
    ...p,
  };
}

describe("customKpi positivity measures", () => {
  it("conta clientes unicos com volume positivo", () => {
    const agg = aggregateKpi([
      makeRow({ cliente: "100 Cliente A", volumeKg: 10 }),
      makeRow({ cliente: "100 Cliente A", volumeKg: 5 }),
      makeRow({ cliente: "200 Cliente B", volumeKg: 0 }),
      makeRow({ cliente: "300 Cliente C", volumeKg: -2 }),
      makeRow({ cliente: "400 Cliente D", volumeKg: 8 }),
    ]);

    expect(pickMeasure(agg, "positivacao")).toBe(2);
    expect(pickMeasure(agg, "ticketMedio")).toBe(21 / 2);
  });

  it("calcula positivacao por periodo para grafico de linha", () => {
    const series = computeChartSeries([
      makeRow({ periodo: "004.2025", mes: 4, cliente: "100 Cliente A", volumeKg: 10 }),
      makeRow({ periodo: "004.2025", mes: 4, cliente: "100 Cliente A", volumeKg: 4 }),
      makeRow({ periodo: "005.2025", mes: 5, cliente: "100 Cliente A", volumeKg: 6 }),
      makeRow({ periodo: "005.2025", mes: 5, cliente: "200 Cliente B", volumeKg: 3 }),
    ], {}, "positivacao", null);

    expect(series.series[0].values).toEqual([1, 2]);
  });
});

describe("customKpi volumeUnit (Kg vs Toneladas)", () => {
  const rows = [
    makeRow({ cliente: "100 Cliente A", volumeKg: 40, rol: 100 }),
    makeRow({ cliente: "200 Cliente B", volumeKg: 8, rol: 20 }),
  ];

  it("sem volumeUnit definido (padrão), usa o volume da base como Kg — sem conversão", () => {
    const value = computeKpiBlock(rows, kpiBlock());
    // (40+8) / 2 clientes = 24 kg/cliente
    expect(value).toBe("24,0 kg/cliente");
  });

  it("volumeUnit: 'ton' multiplica por 1000 antes de agregar — corrige Ticket Médio", () => {
    const value = computeKpiBlock(rows, kpiBlock({ volumeUnit: "ton" }));
    // (40.000+8.000) / 2 clientes = 24.000 kg/cliente
    expect(value).toBe("24.000,0 kg/cliente");
  });

  it("volumeUnit: 'ton' também corrige a medida Volume (que já divide por 1000 pra exibir toneladas)", () => {
    const value = computeKpiBlock(rows, kpiBlock({ measure: "volume", volumeUnit: "ton" }));
    // agg.volume vira (40+8)*1000 = 48.000 kg reais; formatValue tons faz /1000 de volta = 48 t
    expect(value).toBe("48,0 t");
  });

  it("volumeUnit: 'ton' corrige Preço Médio (R$/Kg) na mesma direção do ROL/Kg da tabela DRE", () => {
    const priceRows = [
      makeRow({ cliente: "100 Cliente A", volumeKg: 40, rol: 800_000 }),
      makeRow({ cliente: "200 Cliente B", volumeKg: 8, rol: 160_000 }),
    ];
    const value = computeKpiBlock(priceRows, kpiBlock({ measure: "precoMedio", volumeUnit: "ton" }));
    // ROL total 960.000 / volume real (48 t = 48.000 kg) = R$20,00/kg
    // (toLocaleString insere um espaço não separável entre "R$" e o número)
    expect(value.replace(/\s/g, " ")).toBe("R$ 20");
  });
});
