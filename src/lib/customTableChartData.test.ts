import { describe, expect, it } from "vitest";
import type { ChartBlock } from "@/lib/customSlide";
import type { CustomTable } from "@/store/customTables";
import { buildCustomTableChartData, inferCustomTableChartOrientation } from "@/lib/customTableChartData";

function table(patch: Partial<CustomTable>): CustomTable {
  return {
    id: "table-1",
    name: "Tabela teste",
    columns: ["Mes", "Real", "Budget"],
    rows: [],
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

function chart(patch: Partial<ChartBlock> = {}): ChartBlock {
  return {
    id: "chart-1",
    kind: "chart",
    x: 0,
    y: 0,
    w: 400,
    h: 240,
    z: 1,
    chartType: "line",
    measure: "rol",
    breakdown: null,
    showGrid: true,
    showLegend: true,
    showLabels: false,
    filters: {},
    dataSource: "personalizado",
    ...patch,
  };
}

describe("custom table chart data", () => {
  it("converts row-oriented tables into chart series and evaluates formulas", () => {
    const data = buildCustomTableChartData(
      table({
        rows: [
          ["Jan", 10, 12],
          ["Fev", 20, "=B1+C1"],
        ],
      }),
      chart(),
    );

    expect(data.orientation).toBe("rows");
    expect(data.periodos.map((p) => p.label)).toEqual(["Jan", "Fev"]);
    expect(data.series.map((s) => s.name)).toEqual(["Real", "Budget"]);
    expect(data.series[1].values).toEqual([12, 22]);
  });

  it("converts column-oriented tables when rows represent series", () => {
    const custom = table({
      columns: ["Serie", "Jan", "Fev", "Mar"],
      rows: [
        ["Real", 10, 20, 30],
        ["Budget", 12, 18, 28],
      ],
    });

    expect(inferCustomTableChartOrientation(custom)).toBe("columns");

    const data = buildCustomTableChartData(custom, chart({ customTableOrientation: "columns" }));

    expect(data.periodos.map((p) => p.label)).toEqual(["Jan", "Fev", "Mar"]);
    expect(data.series.map((s) => s.name)).toEqual(["Real", "Budget"]);
    expect(data.series[0].values).toEqual([10, 20, 30]);
  });

  it("uses the selected numeric series for ranking charts", () => {
    const data = buildCustomTableChartData(
      table({
        rows: [
          ["A", 10, 100],
          ["B", 20, 200],
        ],
      }),
      chart({ chartType: "donut", customTableValueColumn: "Budget" }),
    );

    expect(data.ranking).toEqual([
      { name: "A", value: 100 },
      { name: "B", value: 200 },
    ]);
  });

  it("reports compatibility warnings for chart types that need more structure", () => {
    const oneSeries = buildCustomTableChartData(
      table({ rows: [["A", 10], ["B", 20]], columns: ["Item", "Valor"] }),
      chart({ chartType: "scatter" }),
    );
    expect(oneSeries.warnings).toContain("Dispersao e bolhas precisam de pelo menos duas series numericas para os eixos X e Y.");

    const noTable = buildCustomTableChartData(null, chart());
    expect(noTable.warnings).toContain("Escolha uma tabela personalizada para alimentar este grafico.");
  });
});
