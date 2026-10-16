// Totais e subtotais da Tabela Dinâmica — o que fica visível, como no Excel
// (Design → Totais Gerais / Subtotais). Sem subtotais a tabela fica PLANA:
// nenhuma linha de grupo e os rótulos repetidos em toda linha.
//
// Só controla a EXIBIÇÃO: o pivot continua calculando todos os totais, porque
// "% do total", ordenação e destaques dependem deles.

export interface PivotTotals {
  /** Linha "Total" no rodapé da tabela. */
  grandRow: boolean;
  /** Coluna "Total" à direita (só existe quando há dimensão em Colunas). */
  grandCol: boolean;
  /** Valores dos grupos de linha (só existem com 2+ dimensões em Linhas). */
  subtotals: boolean;
}

export const DEFAULT_PIVOT_TOTALS: PivotTotals = { grandRow: true, grandCol: true, subtotals: true };

/** Montagens salvas antes deste recurso não têm `totals` — tudo visível, como era. */
export function normalizeTotals(value: unknown): PivotTotals {
  const v = (value ?? {}) as Partial<PivotTotals>;
  return {
    grandRow: v.grandRow !== false,
    grandCol: v.grandCol !== false,
    subtotals: v.subtotals !== false,
  };
}

export function totalsEqual(a: PivotTotals, b: PivotTotals): boolean {
  return a.grandRow === b.grandRow && a.grandCol === b.grandCol && a.subtotals === b.subtotals;
}

export type PivotTotalsPreset = "all" | "grand" | "none";

export const PIVOT_TOTALS_PRESETS: Record<PivotTotalsPreset, PivotTotals> = {
  all: { grandRow: true, grandCol: true, subtotals: true },
  grand: { grandRow: true, grandCol: true, subtotals: false },
  none: { grandRow: false, grandCol: false, subtotals: false },
};

/** Qual atalho descreve a configuração atual (null = combinação personalizada). */
export function matchTotalsPreset(totals: PivotTotals): PivotTotalsPreset | null {
  for (const id of Object.keys(PIVOT_TOTALS_PRESETS) as PivotTotalsPreset[]) {
    if (totalsEqual(PIVOT_TOTALS_PRESETS[id], totals)) return id;
  }
  return null;
}

/** O que a tabela atual consegue mostrar — desliga no menu o que não se aplica. */
export function totalsApplicability(rowDimCount: number, colDimCount: number) {
  return { grandRow: true, grandCol: colDimCount > 0, subtotals: rowDimCount > 1 };
}

/** Frase curta pro botão: "Sem totais", "Só total geral"… (null = tudo visível). */
export function describeTotals(totals: PivotTotals, applies: ReturnType<typeof totalsApplicability>): string | null {
  const hidden: string[] = [];
  if (applies.grandRow && !totals.grandRow) hidden.push("total geral");
  if (applies.grandCol && !totals.grandCol) hidden.push("coluna Total");
  if (applies.subtotals && !totals.subtotals) hidden.push("subtotais");
  if (hidden.length === 0) return null;
  const all = [applies.grandRow, applies.grandCol, applies.subtotals].filter(Boolean).length;
  if (hidden.length === all) return "Sem totais";
  return `Sem ${hidden.join(" e ")}`;
}
