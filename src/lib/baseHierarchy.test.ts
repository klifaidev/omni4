import { afterEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { parseRealTable } from "./csv";
import { clearBaseHierarchy, getBaseHierarchy, registerBaseHierarchy } from "./baseHierarchy";
import { parseDePara360 } from "./depara360";

describe("hierarquia original da base", () => {
  afterEach(() => clearBaseHierarchy());

  it("guarda o valor da base antes do De/Para sobrescrever", () => {
    clearBaseHierarchy();
    const headers = ["Artigo", "02 Marca", "07 Sabor", "Período/ano", "Rec. Líquida"];
    const parsed = parseRealTable(headers, [
      ["100009 CHOC LEITE MELKEN 1X25KG", "A5 Melken", "não atribuído", "008.2026 Agosto 2026", "10,00"],
    ], "teste.csv");
    // A linha mostra o De/Para; a hierarquia original fica guardada à parte.
    expect(parsed.rows[0].marca).toBe("Melken");
    expect(parsed.baseHierarchy?.["100009"]).toEqual({ marca: "A5 Melken" });
    expect(getBaseHierarchy("100009")).toEqual({ marca: "A5 Melken" });
  });

  it("lê cada nível da KE30 na sua coluna (03 Família, 04 Formato)", () => {
    // Mesma ordem de colunas da KE30 real: Família e Formato antes de Categoria.
    const headers = ["Artigo", "03 Família", "04 Formato", "02 Marca", "01 Categoria", "05 Mercado", "Período/ano", "06 Faixa de Peso", "07 Sabor", "Rec. Líquida"];
    const parsed = parseRealTable(headers, [
      ["100009 CHOC LEITE MELKEN 1X25KG", "A12 Chocolate Regular", "A13 Kibled", "A5 Melken", "A1 Chocolates", "A5 Industrialização", "009.2026 Setembro 2026", "A7 10kg e acima", "A1 Ao leite", "10,00"],
    ], "teste.csv");
    expect(parsed.baseHierarchy?.["100009"]).toEqual({
      categoria: "A1 Chocolates",
      marca: "A5 Melken",
      tecnologia: "A12 Chocolate Regular",
      formato: "A13 Kibled",
      mercado: "A5 Industrialização",
      faixaPeso: "A7 10kg e acima",
      sabor: "A1 Ao leite",
    });
  });

  it("fica guardada neste computador e volta ao reabrir o app", async () => {
    registerBaseHierarchy({ "100009": { marca: "A5 Melken", sabor: "A1 Ao leite" } });
    vi.resetModules();
    const fresh = await import("./baseHierarchy");
    expect(fresh.getBaseHierarchy("100009")).toEqual({ marca: "A5 Melken", sabor: "A1 Ao leite" });
  });

  it("a base mais nova vence; a planilha do time só completa o que falta", () => {
    registerBaseHierarchy({ "1": { marca: "B1 Top" } });
    registerBaseHierarchy({ "1": { marca: "B2 Top Novo" } });
    expect(getBaseHierarchy("1")?.marca).toBe("B2 Top Novo");
    registerBaseHierarchy({ "1": { marca: "X", sabor: "A1 Ao leite" } }, { onlyMissing: true });
    expect(getBaseHierarchy("1")).toEqual({ marca: "B2 Top Novo", sabor: "A1 Ao leite" });
  });

  it("a planilha DE/PARA traz as colunas DE", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Artigo", "", "DE - 01 Categoria", "PARA - 01 Categoria", "DE - 03 Família", "PARA - 03 Tecnologia"],
      [104716, "TOP CONFEITE", "A4 Decorações", "A3 Decoração", "B2 Decorações", "não atribuído"],
    ]), "De Para");
    const bytes = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    const parsed = await parseDePara360({ name: "dp.xlsx", arrayBuffer: async () => bytes } as unknown as File);
    expect(parsed.baseHierarchy["104716"]).toEqual({ categoria: "A4 Decorações", tecnologia: "B2 Decorações" });
  });
});
