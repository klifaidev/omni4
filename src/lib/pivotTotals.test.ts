import { describe, expect, it } from "vitest";
import {
  DEFAULT_PIVOT_TOTALS,
  PIVOT_TOTALS_PRESETS,
  describeTotals,
  matchTotalsPreset,
  normalizeTotals,
  subtotalValuesHidden,
  totalsApplicability,
} from "./pivotTotals";

describe("normalizeTotals", () => {
  it("montagem antiga (sem totals) mostra tudo", () => {
    expect(normalizeTotals(undefined)).toEqual(DEFAULT_PIVOT_TOTALS);
    expect(normalizeTotals(null)).toEqual(DEFAULT_PIVOT_TOTALS);
    expect(normalizeTotals({})).toEqual(DEFAULT_PIVOT_TOTALS);
  });

  it("só esconde o que foi explicitamente desligado", () => {
    expect(normalizeTotals({ grandRow: false })).toEqual({ grandRow: false, grandCol: true, subtotals: true });
    expect(normalizeTotals({ subtotals: false, grandCol: false })).toEqual({ grandRow: true, grandCol: false, subtotals: false });
    expect(normalizeTotals({ grandRow: "não" })).toEqual(DEFAULT_PIVOT_TOTALS);
  });
});

describe("atalhos", () => {
  it("reconhece cada atalho e devolve null para combinações personalizadas", () => {
    expect(matchTotalsPreset(PIVOT_TOTALS_PRESETS.all)).toBe("all");
    expect(matchTotalsPreset(PIVOT_TOTALS_PRESETS.grand)).toBe("grand");
    expect(matchTotalsPreset(PIVOT_TOTALS_PRESETS.none)).toBe("none");
    expect(matchTotalsPreset({ grandRow: true, grandCol: false, subtotals: true })).toBeNull();
  });
});

describe("subtotalValuesHidden", () => {
  const group = { key: "g", isLeaf: false };
  const leaf = { key: "l", isLeaf: true };
  const off = { ...DEFAULT_PIVOT_TOTALS, subtotals: false };

  it("com subtotais ligados nunca esconde", () => {
    expect(subtotalValuesHidden(DEFAULT_PIVOT_TOTALS, group, new Set(["g"]))).toBe(false);
  });

  it("sem subtotais, o grupo aberto vira só título", () => {
    expect(subtotalValuesHidden(off, group, new Set(["g"]))).toBe(true);
  });

  it("sem subtotais, o grupo recolhido ainda mostra o resumo", () => {
    expect(subtotalValuesHidden(off, group, new Set())).toBe(false);
  });

  it("folhas nunca são afetadas", () => {
    expect(subtotalValuesHidden(off, leaf, new Set(["l"]))).toBe(false);
  });
});

describe("describeTotals", () => {
  it("só descreve o que se aplica à tabela atual", () => {
    // 1 dimensão em linhas, sem colunas: só existe o total geral do rodapé.
    const flat = totalsApplicability(1, 0);
    expect(flat).toEqual({ grandRow: true, grandCol: false, subtotals: false });
    expect(describeTotals({ grandRow: true, grandCol: false, subtotals: false }, flat)).toBeNull();
    expect(describeTotals({ grandRow: false, grandCol: true, subtotals: true }, flat)).toBe("Sem totais");
  });

  it("nomeia as combinações", () => {
    const full = totalsApplicability(2, 1);
    expect(describeTotals(PIVOT_TOTALS_PRESETS.all, full)).toBeNull();
    expect(describeTotals(PIVOT_TOTALS_PRESETS.none, full)).toBe("Sem totais");
    expect(describeTotals(PIVOT_TOTALS_PRESETS.grand, full)).toBe("Sem subtotais");
    expect(describeTotals({ grandRow: false, grandCol: true, subtotals: false }, full)).toBe("Sem total geral e subtotais");
  });
});
