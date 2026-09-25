import { beforeEach, describe, expect, it } from "vitest";
import { usePivotLayoutStore, type PivotLayout } from "./pivotLayout";

const layout = (rows: string[]): PivotLayout => ({
  rows,
  cols: ["fy"],
  values: ["rol_real"],
  filterDims: [],
  filterVals: {},
  sort: null,
  viz: "heatmap",
  hideEmpty: true,
});

describe("usePivotLayoutStore", () => {
  beforeEach(() => {
    usePivotLayoutStore.setState({ mode: "real", layouts: {}, savedViews: [] });
  });

  it("guarda a última montagem por modo, sem misturar os modos — e não muda o modo preferido", () => {
    const { saveLayout, setMode } = usePivotLayoutStore.getState();
    setMode("compare");
    saveLayout("real", layout(["marca"]));
    saveLayout("compare", layout(["canalAjustado"]));

    const state = usePivotLayoutStore.getState();
    expect(state.mode).toBe("compare");
    expect(state.layouts.real?.rows).toEqual(["marca"]);
    expect(state.layouts.compare?.rows).toEqual(["canalAjustado"]);

    // Recuo automático pro KE30 (sem Budget) grava a montagem do KE30,
    // mas a preferência continua sendo o Comparativo.
    saveLayout("real", layout(["sku"]));
    expect(usePivotLayoutStore.getState().mode).toBe("compare");
  });

  it("salvar com um nome que já existe no mesmo modo atualiza a visão (ignora maiúsculas)", () => {
    const { saveView } = usePivotLayoutStore.getState();
    saveView("Margem por canal", "real", layout(["canalAjustado"]));
    saveView("margem por canal", "real", layout(["canalAjustado", "sku"]));
    saveView("Margem por canal", "compare", layout(["marca"]));

    const views = usePivotLayoutStore.getState().savedViews;
    expect(views).toHaveLength(2);
    expect(views.find((view) => view.mode === "real")?.layout.rows).toEqual(["canalAjustado", "sku"]);
  });

  it("mantém no máximo 30 visões, descartando as mais antigas", () => {
    const { saveView } = usePivotLayoutStore.getState();
    for (let i = 0; i < 33; i++) saveView(`Visão ${i}`, "real", layout(["marca"]));

    const names = usePivotLayoutStore.getState().savedViews.map((view) => view.name);
    expect(names).toHaveLength(30);
    expect(names[0]).toBe("Visão 3");
    expect(names[29]).toBe("Visão 32");
  });

  it("excluir e desfazer devolve a visão na mesma posição", () => {
    const { saveView, deleteView, restoreView } = usePivotLayoutStore.getState();
    saveView("A", "real", layout(["marca"]));
    const b = saveView("B", "real", layout(["sku"]));
    saveView("C", "real", layout(["uf"]));

    const index = usePivotLayoutStore.getState().savedViews.findIndex((view) => view.id === b.id);
    deleteView(b.id);
    expect(usePivotLayoutStore.getState().savedViews.map((view) => view.name)).toEqual(["A", "C"]);

    restoreView(b, index);
    restoreView(b, index);
    expect(usePivotLayoutStore.getState().savedViews.map((view) => view.name)).toEqual(["A", "B", "C"]);
  });
});
