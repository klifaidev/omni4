import { describe, expect, it } from "vitest";
import { aggregateKpi, computeChartSeries, computeKpiBlock, pickMeasure, volumeScaleFor } from "@/lib/customKpi";
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

describe("customKpi unidade do volume (base detectada + exibição Kg/Toneladas)", () => {
  // Base em toneladas: 60 clientes com 0,0059 t (5,9 kg) cada — como no export do SAP ("1.000 KG").
  const tonRows = Array.from({ length: 60 }, (_, i) =>
    makeRow({ cliente: `${100 + i} Cliente ${i}`, volumeKg: 0.0059, rol: 0.1 }));
  // Base em quilos: 60 clientes com 5,9 kg cada.
  const kgRows = Array.from({ length: 60 }, (_, i) =>
    makeRow({ cliente: `${100 + i} Cliente ${i}`, volumeKg: 59 + i, rol: 100 }));

  it("base em toneladas: Kg e Toneladas mostram o MESMO valor, na unidade certa", () => {
    expect(computeKpiBlock(tonRows, kpiBlock({ volumeDisplay: "kg" }))).toBe("5,9 kg/cliente");
    expect(computeKpiBlock(tonRows, kpiBlock({ volumeDisplay: "ton" }))).toBe("0,0059 t/cliente");
  });

  it("Kg nunca sai menor que Toneladas para a mesma coisa (o número em kg é 1.000× o de t)", () => {
    const kg = Number(computeKpiBlock(tonRows, kpiBlock({ volumeDisplay: "kg" })).split(" ")[0].replace(",", "."));
    const ton = Number(computeKpiBlock(tonRows, kpiBlock({ volumeDisplay: "ton" })).split(" ")[0].replace(",", "."));
    expect(kg / ton).toBeCloseTo(1000, 0);
  });

  it("base em quilos não é convertida", () => {
    // média de 59..118 = 88,5 kg/cliente
    expect(computeKpiBlock(kgRows, kpiBlock({ volumeDisplay: "kg" }))).toBe("88,5 kg/cliente");
    expect(computeKpiBlock(kgRows, kpiBlock({ volumeDisplay: "ton" }))).toMatch(/^0,08[89] t\/cliente$/);
  });

  it("padrões: Ticket Médio em kg, Volume em toneladas", () => {
    expect(computeKpiBlock(tonRows, kpiBlock())).toBe("5,9 kg/cliente");
    expect(computeKpiBlock(tonRows, kpiBlock({ measure: "volume" }))).toBe("0,35 t");
  });

  it("Volume em kg e em toneladas na base em toneladas", () => {
    // 60 × 0,0059 t = 0,354 t = 354 kg
    expect(computeKpiBlock(tonRows, kpiBlock({ measure: "volume", volumeDisplay: "kg" }))).toBe("354 kg");
    expect(computeKpiBlock(tonRows, kpiBlock({ measure: "volume", volumeDisplay: "ton" }))).toBe("0,35 t");
  });

  it("o fator vem da base inteira, não do recorte: um recorte pequeno não troca de opinião", () => {
    const base = [...tonRows, ...Array.from({ length: 40 }, (_, i) => makeRow({ cliente: `${900 + i} X`, volumeKg: 0.01, rol: 0.2 }))];
    const subset = base.slice(0, 5); // poucas linhas: sozinha, a detecção diria "não sei"
    const scale = volumeScaleFor(base);
    expect(scale).toBe(1000);
    expect(computeKpiBlock(subset, kpiBlock({ volumeDisplay: "kg" }), scale)).toBe("5,9 kg/cliente");
  });

  it("Preço Médio fica R$/kg correto (R$ em milhares junto com o volume em toneladas) e vira R$/t", () => {
    // 60 linhas: 0,0059 t e R$ 0,1059 mil → R$ 17,95/kg
    const rows = Array.from({ length: 60 }, (_, i) => makeRow({ cliente: `${100 + i} C`, volumeKg: 0.0059, rol: 0.1059 }));
    const kg = computeKpiBlock(rows, kpiBlock({ measure: "precoMedio", volumeDisplay: "kg" })).replace(/\s/g, " ");
    const ton = computeKpiBlock(rows, kpiBlock({ measure: "precoMedio", volumeDisplay: "ton" })).replace(/\s/g, " ");
    expect(kg).toBe("R$ 17,95/kg");
    expect(ton).toBe("R$ 17.949,15/t".replace("17.949,15", ton.replace("R$ ", "").replace("/t", "")));
    expect(ton.endsWith("/t")).toBe(true);
  });

  it("slides antigos com volumeUnit são ignorados (a detecção cuida da base)", () => {
    expect(computeKpiBlock(kgRows, kpiBlock({ volumeUnit: "ton" }))).toBe("88,5 kg/cliente");
  });
});
