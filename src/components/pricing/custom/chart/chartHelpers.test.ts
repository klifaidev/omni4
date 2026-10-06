import { describe, expect, it } from "vitest";
import { applySort } from "./chartHelpers";

const meses = [{ label: "Dez/25" }, { label: "Jan/26" }, { label: "Abr/26" }, { label: "Ago/26" }];
const serie = (name: string, values: number[]) => ({ name, values });

describe("applySort", () => {
  it("período crescente mantém a ordem cronológica (não alfabética)", () => {
    const out = applySort(meses, [serie("A", [1, 2, 3, 4])], { field: "period", dir: "asc" });
    expect(out.periodos.map((p) => p.label)).toEqual(["Dez/25", "Jan/26", "Abr/26", "Ago/26"]);
  });

  it("mais recente primeiro inverte períodos e valores juntos", () => {
    const out = applySort(meses, [serie("A", [1, 2, 3, 4])], { field: "period", dir: "desc" });
    expect(out.periodos.map((p) => p.label)).toEqual(["Ago/26", "Abr/26", "Jan/26", "Dez/25"]);
    expect(out.series[0].values).toEqual([4, 3, 2, 1]);
  });

  it("com categorias no eixo X, maior valor primeiro ordena as barras", () => {
    const marcas = [{ label: "Bono" }, { label: "Tostines" }, { label: "Passatempo" }];
    const out = applySort(marcas, [serie("Total", [5, 9, 1])], { field: "value", dir: "desc" }, false);
    expect(out.periodos.map((p) => p.label)).toEqual(["Tostines", "Bono", "Passatempo"]);
    expect(out.series[0].values).toEqual([9, 5, 1]);
  });

  it("com tempo no eixo X, valor ordena as séries e preserva os meses", () => {
    const out = applySort(meses, [serie("A", [1, 1, 1, 1]), serie("B", [5, 5, 5, 5])], { field: "value", dir: "desc" });
    expect(out.series.map((s) => s.name)).toEqual(["B", "A"]);
    expect(out.periodos).toBe(meses);
  });
});
