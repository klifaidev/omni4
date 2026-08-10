import { describe, expect, it } from "vitest";
import { parseCsvFile } from "./csv";

describe("parseCsvFile", () => {
  it("detects SAP-style multi-row headers and maps period plus measures", async () => {
    const csv = [
      ";;;;;;;;;;;;;;Peso líquido;Rec. Líquida;CPV;Matéria Prima;Embalagem;MOD;CIF;Margem Bruta;Frete sobre vendas;Comissão repres;Contrib. Marginal;Ctb. Mg. %",
      ";;;;;;;;;;;;;;Real;Real;Real;Real;Real;Real;Real;Real;Real;Real;Real;Real",
      "Artigo;Cliente;Gestor Resp.;Canal distrib.;03 Família;Centro;04 Formato;02 Marca;01 Categoria;05 Mercado;Período/ano;06 Faixa de Peso;07 Sabor;Região;1.000 KG;1.000 BRL;1.000 BRL;1.000 BRL;1.000 BRL;1.000 BRL;1.000 BRL;1.000 BRL;1.000 BRL;1.000 BRL;1.000 BRL;1.000",
      "100009;Cliente A;Gestor A;5  1.1 Varejo Espec.;Chocolate;Centro;Kibled;Melken;A1 Chocolates;Indústria;007.2026 Julho 2026;20KG  e acima;Ao leite;BR /SP  São Paulo;1,25;10,50;-4,00;-3,00;-1,00;0,00;0,00;6,50;-0,50;-0,25;5,75;54,8",
    ].join("\n");

    const parsed = await parseCsvFile({
      name: "sap.csv",
      text: async () => csv,
      arrayBuffer: async () => new TextEncoder().encode(csv).buffer,
    } as File);

    expect(parsed.warnings).not.toContainEqual(expect.stringContaining("Coluna de período"));
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].periodo).toBe("007.2026");
    expect(parsed.rows[0].volumeKg).toBe(1.25);
    expect(parsed.rows[0].rol).toBe(10.5);
    expect(parsed.rows[0].cogs).toBe(-4);
    expect(parsed.rows[0].contribMarginal).toBe(5.75);
  });
});
