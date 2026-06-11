import { describe, it, expect } from "vitest";
import { formatBRL, formatPct, formatTon } from "@/lib/format";

describe("formatBRL", () => {
  it("formata 1.000.000 em pt-BR com R$", () => {
    const s = formatBRL(1000000);
    expect(s).toMatch(/R\$/);
    expect(s).toMatch(/1\.000\.000/);
  });

  it("aceita opt compact sem quebrar (retorna string)", () => {
    const s = formatBRL(1000000, { compact: true });
    expect(typeof s).toBe("string");
    expect(s.length).toBeGreaterThan(0);
  });

  it("valores negativos retornam string com sinal", () => {
    const s = formatBRL(-1500);
    expect(s).toMatch(/-/);
    expect(s).toMatch(/R\$/);
  });

  it("Infinity → placeholder '—'", () => {
    expect(formatBRL(Infinity)).toBe("—");
    expect(formatBRL(-Infinity)).toBe("—");
    expect(formatBRL(NaN)).toBe("—");
  });

  it("zero retorna R$ 0", () => {
    expect(formatBRL(0)).toMatch(/R\$/);
    expect(formatBRL(0)).toMatch(/0/);
  });
});

describe("formatPct", () => {
  it("formata 0.1523 → 15,2%", () => {
    expect(formatPct(0.1523)).toBe("15,2%");
  });

  it("aceita digits custom", () => {
    expect(formatPct(0.5, 0)).toBe("50%");
  });

  it("valores negativos", () => {
    expect(formatPct(-0.1)).toMatch(/-10,0%/);
  });

  it("zero → 0,0%", () => {
    expect(formatPct(0)).toBe("0,0%");
  });

  it("Infinity → '—'", () => {
    expect(formatPct(Infinity)).toBe("—");
    expect(formatPct(NaN)).toBe("—");
  });
});

describe("formatTon", () => {
  it("formata 1500 com sufixo t", () => {
    const s = formatTon(1500);
    expect(s).toMatch(/t$/);
    expect(s).toMatch(/1\.500/);
  });

  it("zero → '0 t'", () => {
    expect(formatTon(0)).toBe("0 t");
  });

  it("negativo mantém sinal", () => {
    expect(formatTon(-100)).toMatch(/-100/);
  });

  it("Infinity → '— t'", () => {
    expect(formatTon(Infinity)).toBe("— t");
  });
});
