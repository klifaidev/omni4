import { describe, expect, it } from "vitest";
import {
  applyCrossFilters,
  crossFilterReducer,
  describeFilter,
  dimensionAvailable,
  normalizeFilterValue,
  rowMatches,
  type CrossFilter,
} from "./crossFilter";

const row = (p: Record<string, unknown>): Record<string, unknown> => ({ mes: 8, ano: 2026, periodo: "008.2026", fy: "FY26/27", ...p });
const rows = [
  row({ marca: "Melken", canalAjustado: "Varejo", rol: 10 }),
  row({ marca: "Top", canalAjustado: "Varejo", rol: 20 }),
  row({ marca: "Melken ", canalAjustado: "Atacado", rol: 30, mes: 7, periodo: "007.2026" }),
  row({ marca: "", canalAjustado: "Atacado", rol: 5 }),
];
const f = (p: Partial<CrossFilter>): CrossFilter => ({ sourceBlockId: "a", dimension: "marca", values: [], ...p });

describe("crossFilter — casamento de valores", () => {
  it("ignora espaço, caixa e acento", () => {
    expect(normalizeFilterValue("  MÉLKEN ")).toBe("melken");
    expect(rowMatches(rows[2], f({ values: ["melken"] }))).toBe(true);
  });

  it("rótulos de vazio casam com o campo vazio", () => {
    for (const label of ["Sem marca", "—", "(sem marca)", "não atribuído"]) {
      expect(rowMatches(rows[3], f({ values: [label] }))).toBe(true);
    }
    expect(rowMatches(rows[0], f({ values: ["Sem marca"] }))).toBe(false);
  });

  it("período casa por rótulo do mês, código e ano fiscal", () => {
    expect(rowMatches(rows[0], f({ dimension: "period", values: ["Ago/26"] }))).toBe(true);
    expect(rowMatches(rows[2], f({ dimension: "period", values: ["Ago/26"] }))).toBe(false);
    expect(rowMatches(rows[2], f({ dimension: "period", values: ["007.2026"] }))).toBe(true);
    expect(rowMatches(rows[0], f({ dimension: "period", values: ["FY26/27"] }))).toBe(true);
  });

  it("Outros = tudo menos os itens mostrados", () => {
    const outros = f({ values: ["Melken"], exclude: true, label: "Outros (2)" });
    expect(rows.filter((r) => rowMatches(r, outros)).map((r) => r.marca)).toEqual(["Top", ""]);
  });
});

describe("crossFilter — aplicação nos blocos", () => {
  it("filtra pela LINHA, não pelo que o bloco mostra (marca filtra um gráfico por mês)", () => {
    const res = applyCrossFilters(rows, [f({ values: ["Melken"] })]);
    expect(res.rows.map((r) => r.rol)).toEqual([10, 30]);
    expect(res.applied).toHaveLength(1);
  });

  it("vários filtros somam (E)", () => {
    const res = applyCrossFilters(rows, [f({ values: ["Melken"] }), f({ sourceBlockId: "b", dimension: "canalAjustado", values: ["Atacado"] })]);
    expect(res.rows.map((r) => r.rol)).toEqual([30]);
  });

  it("dimensão que a base não tem não zera o bloco: vira não aplicável", () => {
    const res = applyCrossFilters(rows, [f({ dimension: "cliente", values: ["123 X"] })]);
    expect(res.rows).toHaveLength(4);
    expect(res.skipped).toEqual([{ filter: expect.objectContaining({ dimension: "cliente" }), reason: "dimension" }]);
    expect(dimensionAvailable(rows, "cliente")).toBe(false);
  });

  it("gráfico no tempo ignora o clique num mês (destaca em vez de sumir)", () => {
    const res = applyCrossFilters(rows, [f({ dimension: "period", values: ["Ago/26"] })], { ignorePeriod: true });
    expect(res.rows).toHaveLength(4);
    expect(res.skipped[0].reason).toBe("time");
  });

  it("sem filtros devolve o mesmo array (não quebra memo/cache)", () => {
    expect(applyCrossFilters(rows, []).rows).toBe(rows);
  });
});

describe("crossFilter — estado", () => {
  it("um filtro por bloco; clicar de novo no mesmo valor desfaz", () => {
    let s = crossFilterReducer([], { type: "set", filter: f({ values: ["Melken"] }) });
    s = crossFilterReducer(s, { type: "set", filter: f({ values: ["Top"] }) });
    expect(s).toEqual([f({ values: ["Top"] })]);
    s = crossFilterReducer(s, { type: "set", filter: f({ values: ["Top"] }) });
    expect(s).toEqual([]);
  });

  it("período não apaga os filtros de outros blocos", () => {
    let s = crossFilterReducer([], { type: "set", filter: f({ values: ["Melken"] }) });
    s = crossFilterReducer(s, { type: "set", filter: f({ sourceBlockId: "b", dimension: "period", values: ["Ago/26"] }) });
    expect(s).toHaveLength(2);
  });

  it("Shift soma e tira valores; remover o último limpa", () => {
    let s = crossFilterReducer([], { type: "toggle", filter: f({ values: ["Melken"] }) });
    s = crossFilterReducer(s, { type: "toggle", filter: f({ values: ["Top"] }) });
    expect(s[0].values).toEqual(["Melken", "Top"]);
    s = crossFilterReducer(s, { type: "removeValue", sourceBlockId: "a", value: "Melken" });
    expect(s[0].values).toEqual(["Top"]);
    s = crossFilterReducer(s, { type: "toggle", filter: f({ values: ["Top"] }) });
    expect(s).toEqual([]);
  });

  it("descreve o chip", () => {
    expect(describeFilter(f({ values: ["Melken"] }))).toBe("Marca: Melken");
    expect(describeFilter(f({ dimension: "canalAjustado", values: ["A", "B", "C"] }))).toBe("Canal: 3 valores");
    expect(describeFilter(f({ values: ["Melken"], exclude: true, label: "Outros (2)" }))).toBe("Marca: Outros (2)");
  });
});
