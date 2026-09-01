import type { BlockDataSource } from "@/lib/customSlide";

type SourceCounts = {
  pricing: number;
  budget: number;
};

export function missingLocalDataLabel(
  dataSource: BlockDataSource | undefined,
  counts: SourceCounts,
): string | null {
  if (!dataSource || dataSource === "ke30") return counts.pricing > 0 ? null : "KE30";
  if (dataSource === "budget" || dataSource === "budget_real") return counts.budget > 0 ? null : "Budget";
  return null;
}

/** Roteiro do Slides, item 1.3: mensagem curta de propósito. A frase
 *  completa original ("Dados locais não encontrados para este filtro —
 *  carregue a base X para ver os valores.") repete em cada bloco sem base
 *  carregada — um slide com 5-6 blocos mostrava a mesma frase 5-6 vezes,
 *  o que lê como "quebrado" pra quem vê o produto pela primeira vez. Um
 *  banner único por slide exigiria tocar o loop de renderização em 2 telas
 *  (editor + apresentação) — adiado deliberadamente; isto resolve o
 *  essencial (repetição visual) com risco bem menor. */
export function localDataMissingMessage(label: string): string {
  return `Sem dados locais (${label})`;
}
