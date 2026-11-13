import { describe, expect, it } from "vitest";
import { parseRealTable } from "./csv";
import { clearBaseHierarchy, getBaseHierarchy } from "./baseHierarchy";

describe("hierarquia original da base", () => {
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
    clearBaseHierarchy();
  });
});
