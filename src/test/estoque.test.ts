import { describe, expect, it } from "vitest";
import { estoqueStatus, parseMaterialPack } from "@/lib/estoque";

describe("estoqueStatus", () => {
  it("classifica risco pela faixa de shelf informada na base", () => {
    expect(estoqueStatus(30, 117)).toBe("bloqueado");
    expect(estoqueStatus(60, 117)).toBe("critico");
    expect(estoqueStatus(90, 117)).toBe("atencao");
    expect(estoqueStatus(120, 117)).toBe("monitorar");
  });

  it("usa dias ate vencimento como fallback quando a faixa nao existe", () => {
    expect(estoqueStatus(null, 25)).toBe("bloqueado");
    expect(estoqueStatus(null, 75)).toBe("atencao");
    expect(estoqueStatus(null, 130)).toBe("monitorar");
    expect(estoqueStatus(null, null)).toBe("revisar");
  });
});

describe("parseMaterialPack", () => {
  it("extrai kg por caixa de embalagens no final do material", () => {
    expect(parseMaterialPack("ESCAMA CROC CHOC CONF 24X500G").kgPorCaixa).toBe(12);
    expect(parseMaterialPack("CHOC BARRA BRANCO MELKEN 10X1KG").kgPorCaixa).toBe(10);
    expect(parseMaterialPack("COB GTS MEIO AMARGO CONF 5X2,1KG").kgPorCaixa).toBe(10.5);
  });
});
