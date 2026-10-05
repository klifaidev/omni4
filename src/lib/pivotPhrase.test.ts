import { describe, expect, it } from "vitest";
import { describePivotLayout, parsePivotPhrase, type PhraseField } from "./pivotPhrase";

const dims: PhraseField[] = [
  { id: "fy", label: "FY" },
  { id: "periodo", label: "Período" },
  { id: "mesLabel", label: "Mês" },
  { id: "marca", label: "Marca" },
  { id: "categoria", label: "Categoria" },
  { id: "sku", label: "SKU" },
  { id: "skuDesc", label: "Descrição SKU" },
  { id: "inovacao", label: "Inovação / Regular" },
  { id: "canalAjustado", label: "Canal Ajustado" },
  { id: "canal", label: "Canal (Real)" },
  { id: "uf", label: "UF (Real)" },
];
const measures: PhraseField[] = [
  { id: "rol_real", label: "ROL" },
  { id: "vol_real", label: "Volume" },
  { id: "mb_real", label: "MB" },
  { id: "cm_real", label: "CM" },
  { id: "cm_pct_real", label: "CM %" },
  { id: "rol_kg_real", label: "ROL R$/Kg" },
];
const valueIndex = {
  canalAjustado: ["Varejo", "Atacado", "Distribuidor"],
  canal: ["1.1 Varejo Spec.", "1.2 Atacado Espec.", "5.1 Varejo Tradicional"],
  marca: ["Harald", "Melken", "Marca Própria"],
  uf: ["SP", "RJ", "MG"],
};

describe("parsePivotPhrase", () => {
  it("medidas antes de 'por', linhas × colunas e filtro por valor", () => {
    const r = parsePivotPhrase("ROL e CM% por Marca × Mês, só Varejo", dims, measures, valueIndex);
    expect(r.values).toEqual(["rol_real", "cm_pct_real"]);
    expect(r.rows).toEqual(["marca"]);
    expect(r.cols).toEqual(["mesLabel"]);
    // "Varejo" exato no Canal Ajustado vence o "contém" do Canal (Real).
    expect(r.filters).toEqual([{ dim: "canalAjustado", values: ["Varejo"], term: "varejo" }]);
    expect(r.unknown).toEqual([]);
    expect(r.understood).toBe(true);
  });

  it("sem '×', o tempo vai pras colunas (convenção de pivot)", () => {
    const r = parsePivotPhrase("receita por categoria e mês", dims, measures);
    expect(r.values).toEqual(["rol_real"]);
    expect(r.rows).toEqual(["categoria"]);
    expect(r.cols).toEqual(["mesLabel"]);
  });

  it("só tempo fica nas linhas", () => {
    const r = parsePivotPhrase("volume por mês", dims, measures);
    expect(r.rows).toEqual(["mesLabel"]);
    expect(r.cols).toEqual([]);
  });

  it("reconhece o termo mais longo e não confunde CM com CM % nem ROL com ROL R$/Kg", () => {
    const r = parsePivotPhrase("CM, CM % e ROL R$/Kg por sku", dims, measures);
    expect(r.values).toEqual(["cm_real", "cm_pct_real", "rol_kg_real"]);
    expect(r.rows).toEqual(["sku"]);
  });

  it("'canal' é o Canal (Real) quando ele existe; sinônimos e plural funcionam", () => {
    const r = parsePivotPhrase("margem por canal e marcas em colunas: estados", dims, measures);
    expect(r.values).toEqual(["cm_pct_real"]);
    expect(r.rows).toEqual(["canal", "marca"]);
    expect(r.cols).toEqual(["uf"]);
  });

  it("'canal' cai no Canal Ajustado quando o Canal (Real) não está no modo", () => {
    const r = parsePivotPhrase("ROL por canal", dims.filter((d) => d.id !== "canal"), measures);
    expect(r.rows).toEqual(["canalAjustado"]);
  });

  it("filtro com dimensão explícita e vários valores", () => {
    const r = parsePivotPhrase("ROL por mês apenas marca: harald, melken", dims, measures, valueIndex);
    expect(r.filters).toEqual([{ dim: "marca", values: ["Harald", "Melken"], term: "marca: harald, melken" }]);
  });

  it("'canal varejo' procura o valor só naquela dimensão (desempate)", () => {
    const r = parsePivotPhrase("ROL por marca só canal varejo", dims, measures, valueIndex);
    expect(r.filters).toEqual([
      { dim: "canal", values: ["1.1 Varejo Spec.", "5.1 Varejo Tradicional"], term: "canal varejo" },
    ]);
  });

  it("vários valores soltos viram o mesmo filtro; 'contém' pega todas as variações", () => {
    const r = parsePivotPhrase("ROL por marca só SP e RJ", dims, measures, valueIndex);
    expect(r.filters).toEqual([{ dim: "uf", values: ["SP", "RJ"], term: "sp" }]);
  });

  it("aponta o que não entendeu sem descartar o resto", () => {
    const r = parsePivotPhrase("ROL por marca e foobar só xyzzy", dims, measures, valueIndex);
    expect(r.rows).toEqual(["marca"]);
    expect(r.unknown).toEqual(["foobar", "xyzzy"]);
  });

  it("medida citada depois de 'por' também é reconhecida", () => {
    const r = parsePivotPhrase("marca por ROL", dims, measures);
    expect(r.values).toEqual(["rol_real"]);
  });

  it("frase vazia não entende nada", () => {
    expect(parsePivotPhrase("   ", dims, measures).understood).toBe(false);
  });
});

describe("describePivotLayout", () => {
  it("descreve a montagem como frase", () => {
    const label = (id: string) => [...dims, ...measures].find((f) => f.id === id)?.label ?? id;
    expect(describePivotLayout(
      { rows: ["categoria", "marca"], cols: ["fy"], values: ["rol_real", "cm_real"], filterVals: { uf: ["SP", "RJ", "MG"] } },
      label,
    )).toBe("ROL, CM por Categoria › Marca × FY só UF (Real): SP, RJ +1");
  });
});
