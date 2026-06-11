import { describe, it, expect } from "vitest";
import { classifyAbc } from "@/components/pricing/AbcPareto";
import type { AggRow } from "@/lib/analytics";

function agg(key: string, rol: number): AggRow {
  return {
    key,
    rol,
    margem: 0,
    margemPct: 0,
    volumeKg: 0,
    rolPorKg: 0,
    custoVariavel: 0,
    custoFixo: 0,
  };
}

describe("classifyAbc", () => {
  it("classifica [100, 80, 20] — 1º A, 3º C", () => {
    const result = classifyAbc([agg("a", 100), agg("b", 80), agg("c", 20)]);
    expect(result).toHaveLength(3);
    expect(result[0].classe).toBe("A");
    expect(result[0].position).toBe(1);
    expect(["A", "B"]).toContain(result[1].classe);
    expect(result[2].classe).toBe("C");
    // cumulPct estritamente crescente, último ≈ 1
    expect(result[0].cumulPct).toBeLessThan(result[1].cumulPct);
    expect(result[2].cumulPct).toBeCloseTo(1, 6);
  });

  it("ordena por rol desc e ignora linhas com rol <= 0", () => {
    const result = classifyAbc([
      agg("low", 10),
      agg("zero", 0),
      agg("neg", -5),
      agg("high", 100),
    ]);
    expect(result.map((r) => r.key)).toEqual(["high", "low"]);
  });

  it("array vazio → array vazio", () => {
    expect(classifyAbc([])).toEqual([]);
  });
});
