import { describe, it, expect } from "vitest";

// pctVar é função interna de src/pages/Budget.tsx — replicada aqui para teste de unidade
// (mantida em paridade com a implementação original).
function pctVar(real: number, bud: number): number {
  if (!bud) return real ? (real > 0 ? Infinity : -Infinity) : 0;
  return (real - bud) / Math.abs(bud);
}

describe("pctVar (variação real vs budget)", () => {
  it("real === bud → 0", () => {
    expect(pctVar(100, 100)).toBe(0);
  });

  it("real > bud → positivo", () => {
    expect(pctVar(110, 100)).toBeCloseTo(0.1, 6);
  });

  it("real < bud → negativo", () => {
    expect(pctVar(90, 100)).toBeCloseTo(-0.1, 6);
  });

  it("bud = 0 e real > 0 → Infinity (não NaN)", () => {
    const v = pctVar(100, 0);
    expect(Number.isNaN(v)).toBe(false);
    expect(v).toBe(Infinity);
  });

  it("bud = 0 e real < 0 → -Infinity", () => {
    expect(pctVar(-100, 0)).toBe(-Infinity);
  });

  it("bud = 0 e real = 0 → 0 (caso seguro)", () => {
    expect(pctVar(0, 0)).toBe(0);
  });

  it("bud negativo usa |bud| no denominador", () => {
    expect(pctVar(-90, -100)).toBeCloseTo(0.1, 6);
  });
});
