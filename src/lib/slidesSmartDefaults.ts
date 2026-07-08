import type { BridgePvmSlideConfig, BudgetEvoSlideConfig, SlideKind } from "./slidesFlow";

export interface MonthOption {
  periodo: string;
  mes: number;
  ano: number;
}

export interface SmartDefaultsContext {
  months: MonthOption[];
  budgetMonths: MonthOption[];
}

export type SmartDefaults =
  | Partial<BridgePvmSlideConfig>
  | Partial<BudgetEvoSlideConfig>;

export function smartDefaults(kind: SlideKind, ctx: SmartDefaultsContext): SmartDefaults | null {
  if (kind === "bridge_pvm" && ctx.months.length >= 2) {
    const last = ctx.months[ctx.months.length - 1];
    const prev = ctx.months[ctx.months.length - 2];
    return { mode: "month", base: prev.periodo, comp: last.periodo, filters: {} };
  }

  if (kind === "budget_evo" && ctx.budgetMonths.length > 0) {
    const last = ctx.budgetMonths[ctx.budgetMonths.length - 1];
    const fyStart = last.mes >= 4 ? last.ano : last.ano - 1;
    const prevFyStart = fyStart - 1;
    const defaultStart = `${String(4).padStart(3, "0")}.${prevFyStart}`;
    const has = ctx.budgetMonths.some((m) => m.periodo === defaultStart);
    return {
      start: has ? defaultStart : ctx.budgetMonths[0].periodo,
      end: last.periodo,
      filters: {},
    };
  }

  return null;
}
