import type { Filters, FilterKey } from "@/lib/types";

/**
 * Converte a montagem da Tabela Dinâmica no bloco de Tabela do slide.
 *
 * O bloco do slide é mais simples que o pivot: uma dimensão em Colunas, só
 * medidas de valor (sem Budget/Δ/percentuais) e uma fonte por vez. O que não
 * cabe vira uma nota, mostrada antes de enviar — nada some em silêncio.
 */

export type PivotSlideMode = "real" | "budget" | "compare";

export interface PivotSlideLayout {
  rows: string[];
  cols: string[];
  values: string[];
  filterVals: Record<string, string[]>;
  sort: { col: string; measure: string; dir: "asc" | "desc" } | null;
}

export interface PivotSlideTable {
  dataSource: "ke30" | "budget";
  rowDims: string[];
  colDim: string | null;
  measures: string[];
  filters: Filters;
  /** Meses (código `periodo`) a manter; null = todos. */
  periods: string[] | null;
  sortMeasure: string | null;
  sortDirection: "asc" | "desc" | null;
}

export interface PivotSlideResult {
  table: PivotSlideTable | null;
  /** Ids (do pivot) das medidas que foram para o slide, na ordem da montagem. */
  keptValues: string[];
  notes: string[];
}

/** Medidas que o bloco de Tabela do slide sabe calcular. */
export const SLIDE_TABLE_MEASURE_IDS: ReadonlySet<string> = new Set([
  "rol_real",
  "vol_real",
  "cm_real",
  "cv_real",
  "frete_real",
  "com_real",
  "mb_real",
]);

const REAL_TO_SLIDE: Record<string, string> = {
  rol_real: "rol_real",
  vol_real: "vol_real",
  cm_real: "cm_real",
  cvar_real: "cv_real",
  frete_real: "frete_real",
  com_real: "com_real",
  mb_real: "mb_real",
};

// Na fonte "budget" do slide, o ROL/Volume/CM do Budget ocupam os campos de
// valor (budgetRowsAsPricingFiltered) — por isso viram as medidas "_real".
const BUDGET_TO_SLIDE: Record<string, string> = {
  rol_budget: "rol_real",
  vol_budget: "vol_real",
  cm_budget: "cm_real",
};

export const SLIDE_FILTER_KEYS: ReadonlySet<FilterKey> = new Set<FilterKey>([
  "marca",
  "canal",
  "canalAjustado",
  "categoria",
  "subcategoria",
  "formato",
  "sku",
  "gestorResp",
  "regiao",
  "uf",
  "regional",
  "mercado",
  "mercadoAjustado",
  "sabor",
  "tecnologia",
  "faixaPeso",
  "inovacao",
  "legado",
]);

const TIME_DIMS = new Set(["fy", "periodo", "mesLabel"]);

type PeriodRow = { periodo?: unknown; fy?: unknown; mesLabel?: unknown };

function quoteList(labels: string[]): string {
  return labels.map((label) => `"${label}"`).join(", ");
}

export function buildPivotSlideTable({
  mode,
  layout,
  globalFilters,
  globalPeriods,
  rows,
  labelOf,
}: {
  mode: PivotSlideMode;
  layout: PivotSlideLayout;
  /** Filtros globais do app (já aplicados às linhas do pivot). */
  globalFilters: Filters;
  /** Meses selecionados no app; vazio/null = todos. */
  globalPeriods: string[] | null;
  /** Linhas do pivot (já com o período global aplicado), para resolver filtros de FY/Mês. */
  rows: PeriodRow[];
  labelOf: (id: string) => string;
}): PivotSlideResult {
  const notes: string[] = [];
  const toSlide = mode === "budget" ? BUDGET_TO_SLIDE : REAL_TO_SLIDE;

  const measures: string[] = [];
  const keptValues: string[] = [];
  const dropped: string[] = [];
  for (const id of layout.values) {
    const mapped = toSlide[id];
    if (!mapped) dropped.push(labelOf(id));
    else if (!measures.includes(mapped)) {
      measures.push(mapped);
      keptValues.push(id);
    }
  }
  if (measures.length === 0) {
    return {
      table: null,
      keptValues,
      notes: [
        "Nenhuma medida desta montagem existe na tabela do slide. Use ROL, Volume, CM, Custo Variável, Frete, Comissão ou MB.",
      ],
    };
  }
  if (dropped.length) {
    notes.push(
      mode === "compare"
        ? `O slide mostra só o Real (KE30); ficam de fora ${quoteList(dropped)}.`
        : `Medidas sem equivalente no slide: ${quoteList(dropped)}.`,
    );
  }

  const [colDim = null, ...extraCols] = layout.cols;
  if (extraCols.length) {
    notes.push(
      `A tabela do slide aceita uma dimensão em Colunas: vai ${quoteList([labelOf(colDim!)])}, fica de fora ${quoteList(extraCols.map(labelOf))}.`,
    );
  }

  // Filtros: globais + filtros do próprio pivot. Mesma dimensão nos dois = interseção.
  const filters: Filters = {};
  for (const [key, values] of Object.entries(globalFilters)) {
    if (values?.length && SLIDE_FILTER_KEYS.has(key as FilterKey)) filters[key as FilterKey] = [...values];
  }
  const timeFilters: [string, Set<string>][] = [];
  const droppedFilters: string[] = [];
  for (const [dim, values] of Object.entries(layout.filterVals)) {
    if (!values?.length) continue;
    if (TIME_DIMS.has(dim)) {
      timeFilters.push([dim, new Set(values)]);
    } else if (SLIDE_FILTER_KEYS.has(dim as FilterKey)) {
      const key = dim as FilterKey;
      const current = filters[key];
      const merged = current ? values.filter((value) => current.includes(value)) : [...values];
      // Interseção vazia: o pivot já não mostra nada; mantém o filtro do pivot
      // (lista vazia no slide significaria "sem filtro").
      filters[key] = merged.length ? merged : [...values];
    } else {
      droppedFilters.push(labelOf(dim));
    }
  }
  if (droppedFilters.length) notes.push(`Filtros que o slide não aplica: ${quoteList(droppedFilters)}.`);

  // Período: o slide filtra por mês. FY/Mês/Período do pivot viram a lista de meses.
  let periods: string[] | null = null;
  if (timeFilters.length || globalPeriods?.length) {
    const set = new Set<string>();
    for (const row of rows) {
      const periodo = typeof row.periodo === "string" ? row.periodo : null;
      if (!periodo) continue;
      const passes = timeFilters.every(([dim, allowed]) =>
        allowed.has(String((row as Record<string, unknown>)[dim] ?? "")),
      );
      if (passes) set.add(periodo);
    }
    periods = [...set].sort();
  }

  let sortMeasure: string | null = null;
  let sortDirection: "asc" | "desc" | null = null;
  if (layout.sort) {
    const mapped = toSlide[layout.sort.measure];
    if (mapped && measures.includes(mapped)) {
      sortMeasure = mapped;
      sortDirection = layout.sort.dir;
      const byTotal = layout.sort.col === "__total__" || layout.sort.col === "__all__";
      if (!byTotal) notes.push("No slide, a ordenação é sempre pelo total da linha.");
    }
  }

  return {
    table: {
      dataSource: mode === "budget" ? "budget" : "ke30",
      rowDims: [...layout.rows],
      colDim,
      measures,
      filters,
      periods,
      sortMeasure,
      sortDirection,
    },
    keptValues,
    notes,
  };
}
