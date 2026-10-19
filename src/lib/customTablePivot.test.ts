import { describe, expect, it } from "vitest";
import { CUSTOM_TABLE_MEASURES } from "@/components/pricing/custom/BlockRenderer";
import { clearCustomTableCaches, computeCustomTablePivot, CUSTOM_TABLE_LIMITS } from "./customTablePivot";
import type { PricingRow } from "./types";

function row(periodo: string, marca: string, uf: string, sku: string, volumeKg: number): PricingRow {
  const [mes, ano] = periodo.split(".").map(Number);
  return {
    periodo, mes, ano, fy: "FY25/26", fyNum: 2026, marca, uf, sku, skuDesc: sku,
    rol: volumeKg * 10, volumeKg, cogs: 0, custoVariavel: 0, custoFixo: 0, margemBruta: 1, contribMarginal: 1, frete: 0, comissao: 0,
  } as PricingRow;
}

const measures = CUSTOM_TABLE_MEASURES.filter((m) => m.id === "vol_real");
const base = { colDim: null, filters: {}, monthFilter: null };

describe("tabela dinâmica do slide: cálculo, cache e memória", () => {
  const rows = [
    row("001.2026", "A", "SP", "S1", 10), row("002.2026", "A", "RJ", "S1", 20),
    row("001.2026", "B", "SP", "S2", 30), row("002.2026", "B", "MG", "S2", 40),
  ];

  it("soma o volume por UF, sem quebra por mês", () => {
    const { result } = computeCustomTablePivot(rows, { ...base, rowDims: ["uf"] }, measures, CUSTOM_TABLE_MEASURES);
    const byUf = Object.fromEntries(result!.leafRowHeaders.map((h) => [h.values[0], result!.rowTotals.get(h.key)?.vol_real]));
    expect(byUf).toEqual({ SP: 40, RJ: 20, MG: 40 });
  });

  it("trocar a dimensão reaproveita as MESMAS linhas unificadas (uma cópia só na memória)", () => {
    clearCustomTableCaches();
    const porMarca = computeCustomTablePivot(rows, { ...base, rowDims: ["marca"] }, measures, CUSTOM_TABLE_MEASURES);
    const porUf = computeCustomTablePivot(rows, { ...base, rowDims: ["uf"] }, measures, CUSTOM_TABLE_MEASURES);
    const porUfMarca = computeCustomTablePivot(rows, { ...base, rowDims: ["uf", "marca"] }, measures, CUSTOM_TABLE_MEASURES);
    const a = porMarca.getUnified();
    expect(porUf.getUnified()).toBe(a);
    expect(porUfMarca.getUnified()).toBe(a);
  });

  it("repetir a configuração devolve o resultado guardado", () => {
    const first = computeCustomTablePivot(rows, { ...base, rowDims: ["uf"] }, measures, CUSTOM_TABLE_MEASURES);
    expect(computeCustomTablePivot(rows, { ...base, rowDims: ["uf"] }, measures, CUSTOM_TABLE_MEASURES)).toBe(first);
  });

  it("mudar os meses monta um recorte novo", () => {
    const todos = computeCustomTablePivot(rows, { ...base, rowDims: ["uf"] }, measures, CUSTOM_TABLE_MEASURES);
    const so1 = computeCustomTablePivot(
      rows,
      { ...base, rowDims: ["uf"], monthFilter: { mode: "fixed", periods: ["001.2026"] } },
      measures,
      CUSTOM_TABLE_MEASURES,
    );
    expect(so1.getUnified()).not.toBe(todos.getUnified());
    expect(so1.getUnified()).toHaveLength(2);
  });

  it("tabela gigante (SKU × mês) não é montada: devolve a estimativa em vez de derrubar o app", () => {
    const many = Array.from({ length: CUSTOM_TABLE_LIMITS.maxRowHeaders + 500 }, (_, i) => row("001.2026", "A", "SP", `SKU-${i}`, 1));
    const out = computeCustomTablePivot(many, { ...base, rowDims: ["sku"] }, measures, CUSTOM_TABLE_MEASURES);
    expect(out.result).toBeNull();
    expect(out.estimate.leafRowCount).toBeGreaterThan(CUSTOM_TABLE_LIMITS.maxRowHeaders);
  });
});
