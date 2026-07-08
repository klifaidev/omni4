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
  forecast: {
    label: "Forecast",
    description: "Forecast: volume por SKU/mes do ultimo ciclo carregado, com filtros de produto.",
    badgeClass: "bg-data-source-forecast/15 text-data-source-forecast",
    activeClass: "bg-data-source-forecast/20 text-data-source-forecast",
  },
  rolling: {
    label: "Rolling",
    description: "Rolling: DRE por SKU/mes com receita, volume, custos, frete, comissao e CM.",
    badgeClass: "bg-data-source-rolling/15 text-data-source-rolling",
    activeClass: "bg-data-source-rolling/20 text-data-source-rolling",
  },
  budget_real: {
    label: "Real Bud.",
    description: "Realizado da planilha Budget (legado). Sem MB/Frete/Comissao.",
    badgeClass: "bg-data-source-budget-real/15 text-data-source-budget-real",
    activeClass: "bg-data-source-budget-real/20 text-data-source-budget-real",
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
