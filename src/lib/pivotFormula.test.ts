import { describe, expect, it } from "vitest";
import { compileFormula, evaluateFormula, formatFormula, parseFormula } from "./pivotFormula";

const byLabel: Record<string, string> = { rol: "rol_real", volume: "vol_real", cm: "cm_real", "frete s/ vendas": "frete_real" };
const resolve = (name: string) => byLabel[name.toLowerCase()] ?? (Object.values(byLabel).includes(name) ? name : null);
const labelOf = (id: string) => ({ rol_real: "ROL", vol_real: "Volume", cm_real: "CM", frete_real: "Frete s/ Vendas" })[id] ?? id;

describe("campos calculados — fórmulas", () => {
  it("interpreta rótulos, guarda ids na forma canônica e avalia", () => {
    const r = parseFormula("([CM] - [Frete s/ Vendas]) / [ROL]", resolve);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.deps).toEqual(["cm_real", "frete_real", "rol_real"]);
    expect(r.canonical).toBe("([cm_real] - [frete_real]) / [rol_real]");
    expect(formatFormula(r.ast, labelOf)).toBe("([CM] - [Frete s/ Vendas]) / [ROL]");
    expect(evaluateFormula(r.ast, { cm_real: 30, frete_real: 5, rol_real: 100 })).toBeCloseTo(0.25);
  });

  it("respeita precedência, menos unário e números com vírgula", () => {
    const r = parseFormula("-[ROL] + [CM] * 1,5", resolve);
    expect(r.ok && evaluateFormula(r.ast, { rol_real: 10, cm_real: 4 })).toBe(-4);
  });

  it("divisão por zero e dado faltando viram vazio (null), não Infinity", () => {
    const fn = compileFormula("[rol_real] / [vol_real]")!;
    expect(fn({ rol_real: 10, vol_real: 0 })).toBeNull();
    expect(fn({ rol_real: null, vol_real: 2 })).toBeNull();
    expect(fn({ rol_real: 10, vol_real: 4 })).toBe(2.5);
  });

  it("forma canônica re-compila igual (é o que vai pro worker)", () => {
    const r = parseFormula("[ROL] - ([CM] - [Volume])", resolve);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.canonical).toBe("[rol_real] - ([cm_real] - [vol_real])");
    const fn = compileFormula(r.canonical)!;
    expect(fn({ rol_real: 10, cm_real: 4, vol_real: 1 })).toBe(7);
  });

  it("mensagens claras pros erros comuns", () => {
    const err = (expr: string) => {
      const r = parseFormula(expr, resolve);
      return "error" in r ? r.error : null;
    };
    expect(err("[ROL] / [Margem mágica]")).toContain('Não existe a medida "Margem mágica"');
    expect(err("[ROL] / ")).toContain("terminou no meio");
    expect(err("([ROL] / [CM]")).toContain("fechar um parêntese");
    expect(err("[ROL] [CM]")).toContain("Falta um operador");
    expect(err("2 * 3")).toContain("pelo menos uma medida");
    expect(err("[ROL")).toContain("colchete");
    expect(err("[ROL] % 2")).toContain("Caractere não reconhecido");
    expect(err("")).toContain("Escreva uma fórmula");
  });
});
