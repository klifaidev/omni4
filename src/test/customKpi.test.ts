import { describe, expect, it } from "vitest";
import { aggregateKpi, computeChartSeries, pickMeasure } from "@/lib/customKpi";
import { makeRow } from "./_helpers";

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
