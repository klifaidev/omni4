import { describe, expect, it } from "vitest";
import { planPptSections } from "./exportPpt";

describe("seções do PowerPoint a partir dos grupos", () => {
  const s = (section?: string) => ({ section });

  it("sem nenhum grupo, não há seções (arquivo igual ao de antes)", () => {
    expect(planPptSections([s(), s(), s()])).toEqual([null, null, null]);
  });

  it("todo slide fica numa seção; os sem grupo ganham a deles", () => {
    expect(planPptSections([s(), s("Resultados"), s("Resultados"), s(), s("Custos"), s(), s()])).toEqual([
      "Sem grupo", "Resultados", "Resultados", "Sem grupo (2)", "Custos", "Sem grupo (3)", "Sem grupo (3)",
    ]);
  });

  it("slides seguidos do mesmo grupo são uma seção só", () => {
    expect(planPptSections([s("A"), s("A"), s("A")])).toEqual(["A", "A", "A"]);
  });

  it("nome em branco conta como sem grupo", () => {
    expect(planPptSections([s("  "), s("A")])).toEqual(["Sem grupo", "A"]);
  });
});
