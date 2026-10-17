import { beforeEach, describe, expect, it } from "vitest";
import type { BudgetRow } from "@/lib/budget";
import type { PricingRow } from "@/lib/types";
import { computeDeParaHealth } from "./deparaHealth";
import { suggestComercial, suggestSkuHierarchy, descTokens } from "./deparaSuggest";
import {
  getCanalAjustado,
  getComercialEntries,
  getRegionalFromUf,
  removeComercialOverride,
  upsertComercialOverrides,
} from "./deparaComercial";
import { listDeParaEntries } from "./depara";

const row = (p: Partial<PricingRow>): PricingRow => ({
  periodo: "009.2026", mes: 9, ano: 2026, fy: "FY26/27", fyNum: 202627,
  rol: 0, volumeKg: 0, cogs: 0, margemBruta: 0, contribMarginal: 0,
  ...p,
} as PricingRow);

// Um SKU completo do De/Para padrão, para as linhas "mapeadas".
const knownSku = listDeParaEntries().find((e) => e.missingFields.length === 0)!.sku;

describe("saúde dos De/Paras", () => {
  beforeEach(() => window.localStorage.clear());

  it("lista pendências pela parte do ROL que pesam", () => {
    const real = [
      row({ sku: knownSku, rol: 900, canal: "5  1.1 Varejo Espec.", canalAjustado: "ESPECIALIZADO" }),
      row({ sku: "999001", skuDesc: "COB BARRA NOVA", rol: 80, canal: "40 4.9 Canal Novo" }),
      row({ sku: "999002", skuDesc: "CHOC GOTAS NOVO", rol: 20, canal: "5  1.1 Varejo Espec.", canalAjustado: "ESPECIALIZADO" }),
    ];
    const health = computeDeParaHealth(real, []);
    expect(health.maps.hierarquia.pending.map((p) => p.key)).toEqual(["999001", "999002"]);
    expect(health.maps.hierarquia.coverage).toBeCloseTo(0.9);
    expect(health.maps.canalToCanalAjustado.pending[0]).toMatchObject({ key: "40 4.9 Canal Novo", share: 0.08 });
    expect(health.pending[0].share).toBeGreaterThanOrEqual(health.pending[health.pending.length - 1].share);
  });

  it("ignora linhas sem SKU (não atribuído) e marca o que só aparece no Budget", () => {
    const real = [row({ sku: "não atribuído", rol: 50 })];
    const budget = [{ sku: "999003", skuDesc: "RECHEIO", canal: "ESPECIALIZADO", canalAjustado: "ESPECIALIZADO" } as BudgetRow];
    const health = computeDeParaHealth(real, budget);
    expect(health.maps.hierarquia.pending).toHaveLength(1);
    expect(health.maps.hierarquia.pending[0]).toMatchObject({ key: "999003", onlyBudget: true });
  });
});

describe("De/Para Comercial", () => {
  beforeEach(() => window.localStorage.clear());

  it("o canal que já vem ajustado (Budget) se mapeia para ele mesmo", () => {
    expect(getCanalAjustado("ESPECIALIZADO")).toBe("ESPECIALIZADO");
    expect(getCanalAjustado("food service")).toBe("FOOD SERVICE");
    expect(getCanalAjustado("canal inexistente")).toBeNull();
  });

  it("correção feita no app vale por cima do padrão e pode ser desfeita", () => {
    upsertComercialOverrides("canalToCanalAjustado", { "40 4.9 Canal Novo": "FOOD SERVICE" });
    expect(getCanalAjustado("40  4.9 canal novo")).toBe("FOOD SERVICE");
    expect(getComercialEntries("canalToCanalAjustado").find((e) => e.key === "40 4.9 Canal Novo")?.source).toBe("app");
    removeComercialOverride("canalToCanalAjustado", "40 4.9 Canal Novo");
    expect(getCanalAjustado("40 4.9 Canal Novo")).toBeNull();
  });
});

describe("sugestões", () => {
  it("canal novo herda o Canal Ajustado do mesmo grupo de código", () => {
    expect(suggestComercial("canalToCanalAjustado", "40 4.9 DisFS.Nova")?.value).toBe("FOOD SERVICE");
    expect(suggestComercial("canalToCanalAjustado", "41 2.9 C&C Novo")?.value).toBe("CASH & CARRY");
  });

  it("região traz o estado no texto e o mercado pelo prefixo do país", () => {
    expect(suggestComercial("regiaoToUf", "BR /TO  Tocantins")?.value).toBe("Tocantins");
    expect(suggestComercial("regiaoToMercadoAjustado", "BR /TO  Tocantins")?.value).toBe("Brasil");
  });

  it("UF sugere a macrorregião com a grafia das regionais existentes", () => {
    expect(suggestComercial("ufToRegional", "Tocantins")?.value).toBe("NORTE");
    // "CENTRO-OESTE" vira a regional já usada, "CENTRO OESTE".
    expect(suggestComercial("ufToRegional", "Goiás")?.value).toBe("CENTRO OESTE");
    expect(getRegionalFromUf("Goiás")).not.toBeNull();
  });

  it("SKU novo copia a hierarquia do SKU de descrição mais parecida", () => {
    const sample = listDeParaEntries().find((e) => e.missingFields.length === 0 && descTokens(e.entry.skuDesc).length >= 3)!;
    const suggestions = suggestSkuHierarchy("999999", sample.entry.skuDesc);
    expect(suggestions[0]?.entry.categoria).toBe(sample.entry.categoria);
  });
});
