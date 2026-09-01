import type { BlockDataSource } from "@/lib/customSlide";

export type SlideDataSourceTheme = {
  label: string;
  description: string;
  badgeClass: string;
  activeClass: string;
};

export const SLIDE_DATA_SOURCE_THEME: Record<BlockDataSource, SlideDataSourceTheme> = {
  ke30: {
    label: "KE30",
    description: "Detalhada (KE30): receita, custos, margens, frete, comissao.",
    badgeClass: "bg-data-source-ke30/15 text-data-source-ke30",
    activeClass: "bg-data-source-ke30/20 text-data-source-ke30",
  },
  budget: {
    label: "Budget",
    description: "Agregada (Budget): receita, volume, CM, CPV. Sem MB/Frete/Comissao.",
    badgeClass: "bg-data-source-budget/15 text-data-source-budget",
    activeClass: "bg-data-source-budget/20 text-data-source-budget",
  },
  budget_real: {
    label: "Real Bud.",
    description: "Realizado da planilha Budget (legado). Sem MB/Frete/Comissao.",
    badgeClass: "bg-data-source-budget-real/15 text-data-source-budget-real",
    activeClass: "bg-data-source-budget-real/20 text-data-source-budget-real",
  },
  personalizado: {
    label: "Personalizado",
    description: "Tabela livre criada no Omni4, sem filtros globais.",
    badgeClass: "bg-sky-500/15 text-sky-600 dark:text-sky-300",
    activeClass: "bg-sky-500/20 text-sky-700 dark:text-sky-200",
  },
};

export function slideDataSourceTheme(ds: BlockDataSource | undefined): SlideDataSourceTheme {
  return SLIDE_DATA_SOURCE_THEME[ds ?? "ke30"];
}

export function dataSourceLabel(ds: BlockDataSource | undefined): string {
  return slideDataSourceTheme(ds).label;
}

export function dataSourceBadgeClass(ds: BlockDataSource | undefined): string {
  return slideDataSourceTheme(ds).badgeClass;
}

export function dataSourceActiveClass(ds: BlockDataSource): string {
  return SLIDE_DATA_SOURCE_THEME[ds].activeClass;
}

export function dataSourceDescription(ds: BlockDataSource | undefined): string {
  return slideDataSourceTheme(ds).description;
}
