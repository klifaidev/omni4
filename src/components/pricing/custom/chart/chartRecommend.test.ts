import { describe, expect, it } from "vitest";
import { recommendChartType } from "./chartRecommend";
import { activeChartLook, chartLookPatch } from "./chartLooks";
import { defaultChartStyle } from "./types";

describe("recommendChartType", () => {
  it("colunas com muitos meses → linha", () => {
    expect(recommendChartType({ chartType: "bar", measure: "rol", xIsTime: true, categoryCount: 18 }))
      .toEqual({ type: "line", reason: "manyPeriods" });
  });
  it("12 meses em colunas está ok — não sugere nada", () => {
    expect(recommendChartType({ chartType: "bar", measure: "rol", xIsTime: true, categoryCount: 12 })).toBeNull();
  });
  it("% empilhado → linha", () => {
    expect(recommendChartType({ chartType: "stackedColumn", measure: "cmPct", xIsTime: true, categoryCount: 6 }))
      .toEqual({ type: "line", reason: "ratioStacked" });
  });
  it("muitas marcas em colunas → barra horizontal", () => {
    expect(recommendChartType({ chartType: "bar", measure: "rol", xIsTime: false, categoryCount: 12 }))
      .toEqual({ type: "hbar", reason: "manyCategories" });
  });
  it("linha ligando categorias (não tempo) → colunas", () => {
    expect(recommendChartType({ chartType: "line", measure: "rol", xIsTime: false, categoryCount: 5 }))
      .toEqual({ type: "bar", reason: "fewCategories" });
  });
  it("pizza com fatias demais → barra horizontal", () => {
    expect(recommendChartType({ chartType: "pie", measure: "rol", xIsTime: false, categoryCount: 10 }))
      .toEqual({ type: "hbar", reason: "manySlices" });
  });
  it("tipos especiais não recebem sugestão", () => {
    expect(recommendChartType({ chartType: "waterfall", measure: "rol", xIsTime: true, categoryCount: 30 })).toBeNull();
  });
});

describe("looks do gráfico", () => {
  it("aplicar um look faz ele ser reconhecido como ativo", () => {
    const s = defaultChartStyle();
    const applied = { ...s, ...chartLookPatch("executive", s) };
    expect(activeChartLook(applied)).toBe("executive");
    expect(activeChartLook(s)).toBeNull();
  });
  it("look não mexe nas cores das séries", () => {
    const s = { ...defaultChartStyle(), series: [{ key: "A", color: "#123456" }] };
    expect(chartLookPatch("highlight", s).series).toBeUndefined();
  });
});
