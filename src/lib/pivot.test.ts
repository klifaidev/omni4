import { describe, expect, it } from "vitest";
import { computePivot } from "./pivot";

describe("computePivot weighted ratio measures", () => {
  it("documents why ratios must use summed numerators and denominators via derive, not avg", () => {
    const rows = [
      { categoria: "A", volumeKg: 100, rol: 1000, precoLinha: 10 },
      { categoria: "A", volumeKg: 10, rol: 200, precoLinha: 20 },
    ];

    const pivot = computePivot(rows, {
      rows: ["categoria"],
      cols: [],
      filters: {},
      values: [
        { id: "rol", label: "ROL", field: "rol", agg: "sum", format: "currency" },
        { id: "volume", label: "Volume", field: "volumeKg", agg: "sum", format: "kg" },
        { id: "preco_avg_incorreto", label: "Preco medio simples", field: "precoLinha", agg: "avg", format: "number" },
        {
          id: "preco_ponderado",
          label: "Preco medio ponderado",
          field: "rol",
          agg: "sum",
          format: "number",
          derive: (acc) => {
            if (acc.rol == null || acc.volume == null || acc.volume === 0) return null;
            return acc.rol / acc.volume;
          },
        },
      ],
    });

    const row = pivot.rowTotals.get("A");

    expect(row?.preco_avg_incorreto).toBe(15);
    expect(row?.preco_ponderado).toBeCloseTo(1200 / 110, 6);
    expect(row?.preco_avg_incorreto).not.toBeCloseTo(row?.preco_ponderado ?? 0, 6);
  });
});
