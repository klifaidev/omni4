import { describe, expect, it } from "vitest";
import { computePivot } from "./pivot";

describe("computePivot weighted ratio measures", () => {
  it("tracks original row indexes for cell drill-through without duplicating row objects", () => {
    const rows = [
      { categoria: "A", mes: "Jan", valor: 10, canal: "Direto" },
      { categoria: "A", mes: "Jan", valor: 5, canal: "Online" },
      { categoria: "A", mes: "Fev", valor: 7, canal: "Direto" },
      { categoria: "B", mes: "Jan", valor: 3, canal: "Direto" },
    ];

    const pivot = computePivot(rows, {
      rows: ["categoria"],
      cols: ["mes"],
      filters: { canal: ["Direto"] },
      values: [
        { id: "valor", label: "Valor", field: "valor", agg: "sum", format: "number" },
      ],
    });

    expect(pivot.cells.get("A")?.get("Jan")?.valor).toBe(10);
    expect(pivot.drillRows.get("A")?.get("Jan")).toEqual([0]);
    expect(pivot.drillRows.get("A")?.get("Fev")).toEqual([2]);
    expect(pivot.drillRows.get("B")?.get("Jan")).toEqual([3]);
  });

  it("returns expandable row groups with leaf headers preserving the previous flat order", () => {
    const rows = [
      { categoria: "Chocolates", sku: "100", mes: "Jan", valor: 100 },
      { categoria: "Chocolates", sku: "200", mes: "Jan", valor: 200 },
      { categoria: "Coberturas", sku: "300", mes: "Jan", valor: 50 },
      { categoria: "Chocolates", sku: "100", mes: "Fev", valor: 300 },
    ];

    const pivot = computePivot(rows, {
      rows: ["categoria", "sku"],
      cols: ["mes"],
      filters: {},
      values: [
        { id: "valor", label: "Valor", field: "valor", agg: "sum", format: "number" },
      ],
    });

    expect(pivot.rowHeaders.map((row) => ({
      key: row.key,
      depth: row.depth,
      isLeaf: row.isLeaf,
      parentKey: row.parentKey,
      values: row.values,
    }))).toEqual([
      { key: "Chocolates", depth: 0, isLeaf: false, parentKey: undefined, values: ["Chocolates"] },
      { key: "Chocolates\u001f100", depth: 1, isLeaf: true, parentKey: "Chocolates", values: ["Chocolates", "100"] },
      { key: "Chocolates\u001f200", depth: 1, isLeaf: true, parentKey: "Chocolates", values: ["Chocolates", "200"] },
      { key: "Coberturas", depth: 0, isLeaf: false, parentKey: undefined, values: ["Coberturas"] },
      { key: "Coberturas\u001f300", depth: 1, isLeaf: true, parentKey: "Coberturas", values: ["Coberturas", "300"] },
    ]);
    expect(pivot.leafRowHeaders.map((row) => row.key)).toEqual([
      "Chocolates\u001f100",
      "Chocolates\u001f200",
      "Coberturas\u001f300",
    ]);
    expect(pivot.rowTotals.get("Chocolates")?.valor).toBe(600);
    expect(pivot.cells.get("Chocolates")?.get("Jan")?.valor).toBe(300);
    expect(pivot.cells.get("Chocolates")?.get("Fev")?.valor).toBe(300);
    expect(pivot.drillRows.get("Chocolates")?.get("Jan")).toEqual([0, 1]);
  });

  it("aggregates sum, avg, count, min and max from incremental accumulators", () => {
    const rows = [
      { categoria: "A", valor: 10 },
      { categoria: "A", valor: -2 },
      { categoria: "A", valor: 7 },
      { categoria: "B", valor: 4 },
    ];

    const pivot = computePivot(rows, {
      rows: ["categoria"],
      cols: [],
      filters: {},
      values: [
        { id: "sum", label: "Soma", field: "valor", agg: "sum", format: "number" },
        { id: "avg", label: "Media", field: "valor", agg: "avg", format: "number" },
        { id: "count", label: "Contagem", field: "valor", agg: "count", format: "number" },
        { id: "min", label: "Min", field: "valor", agg: "min", format: "number" },
        { id: "max", label: "Max", field: "valor", agg: "max", format: "number" },
      ],
    });

    expect(pivot.rowTotals.get("A")).toMatchObject({
      sum: 15,
      avg: 5,
      count: 3,
      min: -2,
      max: 10,
    });
    expect(pivot.grandTotal).toMatchObject({
      sum: 19,
      avg: 4.75,
      count: 4,
      min: -2,
      max: 10,
    });
  });

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
