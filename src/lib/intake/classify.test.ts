import { describe, expect, it } from "vitest";
import { classifySheet, headerRowFor } from "./classify";

const REAL = [
  ["Artigo", "Cliente", "Gestor Resp.", "Canal distrib.", "Período/ano", "Região", "Peso líquido", "Rec. Líquida", "CPV", "Margem Bruta"],
  ["100067 COB BARRA", "8686 S.F. IND", "117 Ana", "4 5.4 Ind.Nac", "009.2026 Setembro 2026", "BR /MG Minas Gerais", 0.03, 0.35, 0.2, 0.14],
  ["100068 COB GOTAS", "8871 T T F", "116 Paulo", "2 4.1 DisFS", "009.2026 Setembro 2026", "BR /SP São Paulo", 1, 2, 1, 1],
];

const BUDGET = [
  ["filtro", "CANAL", "Sku", "Descrição do Produto", "Categoria", "Marca", "Status", "data", "VOLUME", "RECEITA", "CM", "CPV", "STATUS"],
  [100067, "ESPECIALIZADO", 100067, "COB BARRA", "Compound", "Raspar", null, 45842, 0, 0, 0, 0, "2.Realizado25"],
  [100067, "ESPECIALIZADO", 100067, "COB BARRA", "Compound", "Raspar", null, 46113, 10, 20, 5, 15, "1.Budget Vendas"],
];

const RUPTURA = [
  ["ID da Pesquisa", "Marca", "Categoria do Produto", "Produto (SKU)", "Rede", "Bandeira", "PDV", "Estado", "Data e hora da pesquisa", "Produto em Ruptura"],
  [47904216, "*TOP", "COBERTURA", "*COB BARRA", "CARREFOUR", "ATACADAO", "ATACADAO - TROBOGY", "Bahia", 46295.69, "Sim"],
  [47904217, "*TOP", "COBERTURA", "*COB GOTAS", "CARREFOUR", "ATACADAO", "ATACADAO - TROBOGY", "Bahia", 46295.7, "Não"],
];

describe("reconhecimento de abas pelo conteúdo", () => {
  it("reconhece Real, Budget e Ruptura com certeza alta", () => {
    expect(classifySheet(REAL)).toMatchObject({ kind: "real", confidence: "alta", headerRow: 0 });
    expect(classifySheet(BUDGET)).toMatchObject({ kind: "budget", confidence: "alta", headerRow: 0 });
    expect(classifySheet(RUPTURA)).toMatchObject({ kind: "ruptura", confidence: "alta", headerRow: 0 });
  });

  it("não depende da ordem das colunas", () => {
    const shuffled = REAL.map((row) => [...row].reverse());
    expect(classifySheet(shuffled).kind).toBe("real");
  });

  it("acha o cabeçalho abaixo de linhas de título", () => {
    const withTitle = [["Relatório de Budget — Setembro"], [], ...BUDGET];
    const result = classifySheet(withTitle);
    expect(result.kind).toBe("budget");
    expect(result.headerRow).toBe(2);
    expect(headerRowFor(result, "budget")).toBe(2);
  });

  it("explica o reconhecimento com palavras da planilha", () => {
    expect(classifySheet(BUDGET).evidence).toContain('STATUS = "1.Budget Vendas"');
    expect(classifySheet(REAL).evidence).toContain("Cliente");
  });

  it("ignora abas que não são base", () => {
    const resumo = [["Resumo do mês"], ["Total", 123], ["Meta", 456]];
    expect(classifySheet(resumo).kind).toBeNull();
    expect(classifySheet([]).kind).toBeNull();
  });

  it("não confunde Budget sem STATUS de Budget com o Real", () => {
    const onlyRealized = BUDGET.map((row, i) => (i === 0 ? row : row.map((v) => (v === "1.Budget Vendas" ? "2.Realizado25" : v))));
    expect(classifySheet(onlyRealized).kind).toBe("budget");
  });
});
