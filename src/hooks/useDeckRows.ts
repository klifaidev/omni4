// Leitura das bases pela aba Slides, já limitada ao mês de referência do deck
// (lib/deckPeriod.ts). Todo bloco, prévia, apresentação e exportação dos
// Slides lê as bases por aqui — trocar a referência recalcula o deck inteiro.
import { useMemo } from "react";
import { usePricing } from "@/store/pricing";
import { useBudget } from "@/store/budget";
import { useSlidesFlow } from "@/store/slidesFlow";
import { capRowsAtReference } from "@/lib/deckPeriod";
import { computeTokenValues } from "@/lib/textTokens";
import type { PricingRow } from "@/lib/types";
import type { BudgetRow } from "@/lib/budget";

/** Plano de Budget nunca é cortado: o Budget Evolutivo mostra os meses futuros. */
const isBudgetPlan = (row: BudgetRow) => row.kind === "budget";

export function useDeckPricingRows(): PricingRow[] {
  const rows = usePricing((s) => s.rows);
  const reference = useSlidesFlow((s) => s.referencePeriod);
  return useMemo(() => capRowsAtReference(rows, reference), [rows, reference]);
}

export function useDeckBudgetRows(): BudgetRow[] {
  const rows = useBudget((s) => s.rows);
  const reference = useSlidesFlow((s) => s.referencePeriod);
  return useMemo(() => capRowsAtReference(rows, reference, isBudgetPlan), [rows, reference]);
}

/** Valores de {mês}, {ROL do mês}… para o deck (lib/textTokens), com cache. */
export function useDeckTokenValues(): Map<string, string> {
  const pricing = useDeckPricingRows();
  const budget = useDeckBudgetRows();
  const reference = useSlidesFlow((s) => s.referencePeriod);
  return computeTokenValues(pricing, budget, reference);
}

/** Fora de componentes (pré-cálculo): mesmas linhas que os hooks devolvem. */
export function getDeckPricingRows(): PricingRow[] {
  return capRowsAtReference(usePricing.getState().rows, useSlidesFlow.getState().referencePeriod);
}

export function getDeckBudgetRows(): BudgetRow[] {
  return capRowsAtReference(useBudget.getState().rows, useSlidesFlow.getState().referencePeriod, isBudgetPlan);
}
