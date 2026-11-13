import { describe, expect, it } from "vitest";
import { completeDeParaEntries } from "./depara";
import { classifySku, HIER_FIELDS, parseWeightRange, subcategoriasOf, unitWeightGrams } from "./skuClassify";

describe("peso unitário e faixas", () => {
  it("lê o peso da última embalagem da descrição", () => {
    expect(unitWeightGrams("GRANUL CROC ESC CONF 12X400G")).toBe(400);
    expect(unitWeightGrams("COB CHIPS MEIO AMARGO 5X2,1KG BOL")).toBe(2100);
    expect(unitWeightGrams("CHOC 63% UNIQUE 3X12X80G")).toBe(80);
    expect(unitWeightGrams("COB BARRA LEITE")).toBeNull();
  });

  it("entende os rótulos de faixa do De/Para", () => {
    expect(parseWeightRange("2 - 4,99kg")).toEqual({ min: 2000, max: 4990 });
    expect(parseWeightRange("201 - 999g")).toEqual({ min: 201, max: 999 });
    expect(parseWeightRange("20KG  e acima")).toEqual({ min: 20000, max: Infinity });
  });
});

describe("classifySku", () => {
  it("sugere a faixa de peso pela descrição, dizendo o motivo", () => {
    const r = classifySku({ sku: "999990", description: "GRANUL CROC CHOC CONF 12X400G" });
    expect(r.fields.faixaPeso?.value).toBe("201 - 999g");
    expect(r.fields.faixaPeso?.source).toBe("peso");
    expect(r.fields.faixaPeso?.reason).toContain("400 g");
  });

  it("usa o valor da própria base quando ele existe no De/Para", () => {
    const r = classifySku({ sku: "999991", description: "COB BARRA BRANCO TOP 5X1KG", baseValues: { marca: "top" } });
    expect(r.fields.marca).toMatchObject({ value: "Top", source: "base" });
  });

  it("não sugere o que o SKU já tem e mantém a subcategoria dentro da categoria", () => {
    const r = classifySku({ sku: "999992", description: "COB BARRA BRANCO TOP 5X1KG", known: { categoria: "Chocolate" } });
    expect(r.fields.categoria).toBeUndefined();
    const subs = subcategoriasOf("Chocolate");
    if (r.fields.subcategoria) expect(subs).toContain(r.fields.subcategoria.value);
  });

  it("acerta os SKUs já classificados quando testados como se fossem novos", () => {
    const all = completeDeParaEntries();
    let hits = 0, total = 0, confident = 0, confidentHits = 0;
    const byField: Record<string, number> = {};
    for (const { sku, entry } of all) {
      const r = classifySku({ sku, description: entry.skuDesc, stamp: -1 });
      for (const f of HIER_FIELDS) {
        const s = r.fields[f];
        total++;
        if (s?.value === entry[f]) { hits++; byField[f] = (byField[f] ?? 0) + 1; }
        if (s && s.confidence >= 0.7) { confident++; if (s.value === entry[f]) confidentHits++; }
      }
    }
    expect(hits / total).toBeGreaterThan(0.88);
    expect(confidentHits / confident).toBeGreaterThan(0.96);
    expect(byField.categoria / all.length).toBeGreaterThan(0.96);
    expect(byField.faixaPeso / all.length).toBeGreaterThan(0.93);
  }, 60_000);
});

describe("tradução base → De/Para", () => {
  it("usa o destino que o mesmo valor da base teve nos SKUs já classificados", async () => {
    const { registerBaseHierarchy, clearBaseHierarchy } = await import("./baseHierarchy");
    const { completeDeParaEntries: complete } = await import("./depara");
    // Todos os SKUs "Top" do De/Para vieram da base como "B1 Top".
    const tops = complete().filter((e) => e.entry.marca === "Top").slice(0, 20);
    clearBaseHierarchy();
    registerBaseHierarchy(Object.fromEntries(tops.map((e) => [e.sku, { marca: "B1 Top" }])));
    // Descrição que, sozinha, puxaria outra marca.
    const r = classifySku({ sku: "999993", description: "CONFEITE VERDE CONF 12X400G", baseValues: { marca: "B1 Top" }, stamp: -9 });
    expect(r.fields.marca).toMatchObject({ value: "Top", source: "traducao" });
    expect(r.fields.marca!.reason).toContain("“B1 Top” na base virou Top em 20 de 20");
    clearBaseHierarchy();
  });

  it("sem informação da base, segue a sugestão pela descrição", async () => {
    const { clearBaseHierarchy } = await import("./baseHierarchy");
    clearBaseHierarchy();
    const r = classifySku({ sku: "999994", description: "COB BARRA BRANCO TOP 5X1KG", stamp: -10 });
    expect(r.fields.marca?.source).toBe("parecidos");
  });
});
