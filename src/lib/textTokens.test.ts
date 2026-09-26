import { describe, expect, it } from "vitest";
import type { PricingRow } from "./types";
import type { BudgetRow } from "./budget";
import { computeTokenValues, findUnknownTokens, formatBRLShort, hasTextTokens, resolveTextTokens } from "./textTokens";

const real = (mes: number, ano: number, rol: number, cm = rol / 4, volumeKg = 1000): PricingRow =>
  ({ mes, ano, periodo: `${String(mes).padStart(3, "0")}.${ano}`, rol, contribMarginal: cm, volumeKg } as unknown as PricingRow);
const plan = (mes: number, ano: number, receita: number, kind: "budget" | "real" = "budget"): BudgetRow =>
  ({ mes, ano, periodo: `${String(mes).padStart(3, "0")}.${ano}`, kind, receita, volumeKg: 0, cm: 0, cpv: 0 } as unknown as BudgetRow);

describe("textTokens", () => {
  const pricing = [real(8, 2025, 7_800_000), real(7, 2026, 8_000_000), real(8, 2026, 8_400_000, 2_100_000, 1_234_000)];
  // Real da base de Budget (8,4 mi) é o que entra no "vs budget" — como no Budget Evolutivo.
  const budget = [plan(8, 2026, 8_150_000), plan(8, 2026, 8_400_000, "real"), plan(9, 2026, 9_000_000)];

  it("resolve datas e números do mês mais recente da base", () => {
    const values = computeTokenValues(pricing, budget, null);
    const text = "Em {mês}, o ROL foi {ROL do mês} ({ROL vs budget %} vs budget). Antes: {mês anterior}, {ano}.";
    expect(resolveTextTokens(text, values)).toBe(
      "Em agosto/2026, o ROL foi R$ 8,4 mi (+3,1% vs budget). Antes: julho/2026, 2026.",
    );
    expect(resolveTextTokens("{CM do mês} | {CM % do mês} | {Volume do mês}", values)).toBe("R$ 2,1 mi | 25,0% | 1.234 t");
    expect(resolveTextTokens("{ROL vs mês anterior %} / {ROL vs ano anterior %}", values)).toBe("+5,0% / +7,7%");
  });

  it("vs budget usa o Real da base de Budget, não a base de preços", () => {
    const values = computeTokenValues(pricing, [plan(8, 2026, 8_000_000), plan(8, 2026, 7_600_000, "real")], null);
    expect(resolveTextTokens("{ROL vs budget %}", values)).toBe("-5,0%");
    const noReal = computeTokenValues(pricing, [plan(8, 2026, 8_000_000)], null);
    expect(resolveTextTokens("{ROL vs budget %}", noReal)).toBe("—");
  });

  it("aceita o nome sem acento e com outra caixa", () => {
    const values = computeTokenValues(pricing, budget, null);
    expect(resolveTextTokens("{MES} {rol do mes}", values)).toBe("agosto/2026 R$ 8,4 mi");
  });

  it("sem base, mas com mês de referência: datas pelo mês de referência, números viram —", () => {
    const values = computeTokenValues([], [], "003.2026");
    expect(resolveTextTokens("{mês} {mês anterior} {ROL do mês}", values)).toBe("março/2026 fevereiro/2026 —");
  });

  it("nome desconhecido fica como digitado e é apontado", () => {
    const values = computeTokenValues(pricing, budget, null);
    expect(resolveTextTokens("{receita} de {mês}", values)).toBe("{receita} de agosto/2026");
    expect(findUnknownTokens("{receita} de {mês}")).toEqual(["{receita}"]);
    expect(hasTextTokens("{receita}")).toBe(false);
    expect(hasTextTokens("Em {Mês}")).toBe(true);
  });

  it("valor curto em reais", () => {
    expect(formatBRLShort(8_412_000)).toBe("R$ 8,4 mi");
    expect(formatBRLShort(840_000)).toBe("R$ 840 mil");
    expect(formatBRLShort(-1_500_000_000)).toBe("-R$ 1,5 bi");
  });
});
