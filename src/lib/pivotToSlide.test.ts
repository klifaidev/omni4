import { describe, expect, it } from "vitest";
import { buildPivotSlideTable, type PivotSlideLayout } from "./pivotToSlide";
import { buildCustomBlockFromPayload } from "./sendToSlideInsert";
import { defaultCustomSlide, type TableBlock } from "./customSlide";

const LABELS: Record<string, string> = {
  marca: "Marca",
  categoria: "Categoria",
  fy: "FY",
  mesLabel: "Mês",
  cliente: "Cliente (Real)",
  rol_real: "ROL Real",
  rol_budget: "ROL Budget",
  rol_delta: "ROL Δ",
  cvar_real: "Custo Variável",
  cm_pct_real: "CM %",
};
const labelOf = (id: string) => LABELS[id] ?? id;

const rows = [
  { periodo: "009.2025", fy: "FY25/26", mesLabel: "Set/25" },
  { periodo: "010.2025", fy: "FY25/26", mesLabel: "Out/25" },
  { periodo: "009.2026", fy: "FY26/27", mesLabel: "Set/26" },
];

function layout(partial: Partial<PivotSlideLayout>): PivotSlideLayout {
  return { rows: ["marca"], cols: ["fy"], values: ["rol_real"], filterVals: {}, sort: null, ...partial };
}

describe("buildPivotSlideTable", () => {
  it("leva linhas, coluna, medidas mapeadas, filtros e ordenação pelo total", () => {
    const { table, notes } = buildPivotSlideTable({
      mode: "real",
      layout: layout({
        rows: ["marca", "categoria"],
        values: ["rol_real", "cvar_real", "cm_pct_real"],
        filterVals: { marca: ["A", "B"] },
        sort: { col: "__total__", measure: "rol_real", dir: "asc" },
      }),
      globalFilters: { marca: ["B", "C"], canal: ["Varejo"] },
      globalPeriods: null,
      rows,
      labelOf,
    });

    expect(table).toMatchObject({
      dataSource: "ke30",
      rowDims: ["marca", "categoria"],
      colDim: "fy",
      measures: ["rol_real", "cv_real"],
      // mesma dimensão no global e no pivot = interseção
      filters: { marca: ["B"], canal: ["Varejo"] },
      periods: null,
      sortMeasure: "rol_real",
      sortDirection: "asc",
    });
    expect(notes).toEqual(['Medidas sem equivalente no slide: "CM %".']);
  });

  it("filtros de FY/Mês viram a lista de meses; colunas extras e filtros sem suporte viram notas", () => {
    const { table, notes } = buildPivotSlideTable({
      mode: "real",
      layout: layout({
        cols: ["fy", "mesLabel"],
        filterVals: { fy: ["FY25/26"], cliente: ["X"] },
        sort: { col: "FY25/26", measure: "rol_real", dir: "desc" },
      }),
      globalFilters: {},
      globalPeriods: null,
      rows,
      labelOf,
    });

    expect(table?.periods).toEqual(["009.2025", "010.2025"]);
    expect(table?.colDim).toBe("fy");
    expect(notes).toEqual([
      'A tabela do slide aceita uma dimensão em Colunas: vai "FY", fica de fora "Mês".',
      'Filtros que o slide não aplica: "Cliente (Real)".',
      "No slide, a ordenação é sempre pelo total da linha.",
    ]);
  });

  it("Comparativo leva só o Real; SuperBase usa a fonte Budget do slide", () => {
    const compare = buildPivotSlideTable({
      mode: "compare",
      layout: layout({ values: ["rol_real", "rol_budget", "rol_delta"] }),
      globalFilters: {},
      globalPeriods: ["009.2025"],
      rows,
      labelOf,
    });
    expect(compare.table?.measures).toEqual(["rol_real"]);
    expect(compare.table?.dataSource).toBe("ke30");
    // período global selecionado vira mês fixo mesmo sem filtro de tempo no pivot
    expect(compare.table?.periods).toEqual(["009.2025", "009.2026", "010.2025"]);
    expect(compare.notes).toEqual(['O slide mostra só o Real (KE30); ficam de fora "ROL Budget", "ROL Δ".']);
    expect(compare.keptValues).toEqual(["rol_real"]);

    const budget = buildPivotSlideTable({
      mode: "budget",
      layout: layout({ values: ["rol_budget"] }),
      globalFilters: {},
      globalPeriods: null,
      rows,
      labelOf,
    });
    expect(budget.table).toMatchObject({ dataSource: "budget", measures: ["rol_real"] });
  });

  it("sem nenhuma medida compatível, não gera tabela", () => {
    const { table, notes } = buildPivotSlideTable({
      mode: "real",
      layout: layout({ values: ["cm_pct_real"] }),
      globalFilters: {},
      globalPeriods: null,
      rows,
      labelOf,
    });
    expect(table).toBeNull();
    expect(notes).toHaveLength(1);
  });

  it("o bloco de Tabela do slide recebe a montagem completa", () => {
    const { table } = buildPivotSlideTable({
      mode: "real",
      layout: layout({
        rows: ["marca", "categoria"],
        values: ["rol_real", "cvar_real"],
        filterVals: { fy: ["FY26/27"], marca: ["A"] },
        sort: { col: "__total__", measure: "cvar_real", dir: "desc" },
      }),
      globalFilters: {},
      globalPeriods: null,
      rows,
      labelOf,
    });
    const block = buildCustomBlockFromPayload(
      {
        source: { page: "Tabela Dinâmica", visualization: "Marca · Categoria × FY — ROL" },
        target: { blockKind: "table", blockLabel: "Tabela" },
        config: { table: "pivot", ...table },
      },
      defaultCustomSlide(),
    ) as TableBlock;

    expect(block.kind).toBe("table");
    expect(block.rowDims).toEqual(["marca", "categoria"]);
    expect(block.colDim).toBe("fy");
    expect(block.measures).toEqual(["rol_real", "cv_real"]);
    expect(block.filters).toEqual({ marca: ["A"] });
    expect(block.monthFilter).toEqual({ mode: "fixed", periods: ["009.2026"] });
    expect(block.sortMode).toBe("kpi");
    expect(block.sortMeasure).toBe("cv_real");
    expect(block.sortDirection).toBe("desc");
    expect(block.title).toBe("Marca · Categoria × FY — ROL");
  });
});
