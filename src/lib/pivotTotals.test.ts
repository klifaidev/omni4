import { describe, expect, it } from "vitest";
import {
  DEFAULT_PIVOT_TOTALS,
  PIVOT_TOTALS_PRESETS,
  describeTotals,
  matchTotalsPreset,
  normalizeTotals,
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
