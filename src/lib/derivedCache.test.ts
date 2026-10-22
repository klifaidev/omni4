import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearDerivedCaches, memoizeByRows } from "./derivedCache";
import { applyFilters, applyFiltersUncached, clearApplyFiltersCacheForTest, generateAlerts, getKpiComparisonContext } from "./analytics";
import { computeMonthsInfo } from "@/store/selectors";
import { computeCanaisSeries } from "@/components/pricing/tabVisuals/canaisData";
import { generateDemoData } from "./demoData";

describe("memoizeByRows", () => {
  beforeEach(() => clearDerivedCaches());

  it("calcula uma vez por base e por argumentos", () => {
    const fn = vi.fn((rows: number[], k: string) => rows.length + k);
    const memo = memoizeByRows(fn);
    const a = [1, 2, 3];
    expect(memo(a, "x")).toBe("3x");
    expect(memo(a, "x")).toBe("3x");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(memo(a, "y")).toBe("3y");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("base nova (mesmo conteúdo) recalcula — a memória é por identidade", () => {
    const fn = vi.fn((rows: number[]) => rows.length);
    const memo = memoizeByRows(fn);
    memo([1, 2]);
    memo([1, 2]);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("objetos como argumento contam por identidade", () => {
    const fn = vi.fn((rows: number[], other: number[]) => rows.length + other.length);
    const memo = memoizeByRows(fn);
    const rows = [1];
    const b1 = [1, 2];
    memo(rows, b1);
    memo(rows, b1);
    memo(rows, [1, 2]);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("guarda no máximo N combinações por base (sai a usada há mais tempo)", () => {
    const fn = vi.fn((_rows: number[], k: number) => k);
    const memo = memoizeByRows(fn, 2);
    const rows = [0];
    memo(rows, 1);
    memo(rows, 2);
    memo(rows, 1); // 1 vira a mais recente
    memo(rows, 3); // sai o 2
    memo(rows, 1);
    expect(fn).toHaveBeenCalledTimes(3);
    memo(rows, 2);
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it("guarda também resultados vazios (null/undefined)", () => {
    const fn = vi.fn(() => undefined);
    const memo = memoizeByRows(fn);
    const rows = [1];
    memo(rows);
    memo(rows);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("clearDerivedCaches esquece tudo (guarda de memória)", () => {
    const fn = vi.fn((rows: number[]) => rows.length);
    const memo = memoizeByRows(fn);
    const rows = [1];
    memo(rows);
    clearDerivedCaches();
    memo(rows);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("cálculos compartilhados entre telas dão o mesmo resultado de antes", () => {
  const demo = generateDemoData({ monthsBack: 14, rowsPerMonth: 300 });
  const rows = demo.realRows;
  beforeEach(() => {
    clearDerivedCaches();
    clearApplyFiltersCacheForTest();
  });

  it("applyFilters sem filtro devolve a própria base; com filtro, igual ao cálculo direto", () => {
    expect(applyFilters(rows, {}, null)).toBe(rows);
    expect(applyFilters(rows, { canal: [] }, [])).toBe(rows);
    const canal = rows[0].canal!;
    const filtered = applyFilters(rows, { canal: [canal] }, null);
    expect(filtered).not.toBe(rows);
    expect(filtered).toEqual(applyFiltersUncached(rows, { canal: [canal] }, null));
    const period = rows[0].periodo;
    expect(applyFilters(rows, {}, [period])).toEqual(rows.filter((r) => r.periodo === period));
  });

  it("meses: uma varredura por base, mesmo resultado para todos", () => {
    const a = computeMonthsInfo(rows);
    expect(computeMonthsInfo(rows)).toBe(a);
    expect(a.reduce((s, m) => s + m.rowCount, 0)).toBe(rows.length);
    const sorted = [...a].sort((x, y) => x.ano - y.ano || x.mes - y.mes);
    expect(a.map((m) => m.periodo)).toEqual(sorted.map((m) => m.periodo));
  });

  it("comparação do KPI: o mesmo contexto com o índice de meses reaproveitado", () => {
    const months = computeMonthsInfo(rows);
    const last = months[months.length - 1].periodo;
    const prev = months[months.length - 2].periodo;
    const ctx = getKpiComparisonContext(rows, {}, [last])!;
    expect(ctx.label).toBe("vs. mês anterior");
    expect(ctx.previousRows).toEqual(rows.filter((r) => r.periodo === prev));
    // Uma segunda chamada (outra tela) dá o mesmo.
    expect(getKpiComparisonContext(rows, {}, [last])).toEqual(ctx);
  });

  it("alertas e séries de canais: guardados por base e iguais ao cálculo direto", () => {
    const alerts = generateAlerts(rows, demo.budgetRows, "cm");
    expect(generateAlerts(rows, demo.budgetRows, "cm")).toBe(alerts);
    clearDerivedCaches();
    expect(generateAlerts(rows, demo.budgetRows, "cm")).toEqual(alerts);
    expect(generateAlerts(rows, demo.budgetRows, "mb")).not.toBe(alerts);

    const series = computeCanaisSeries(rows, "cm");
    expect(computeCanaisSeries(rows, "cm")).toBe(series);
    clearDerivedCaches();
    expect(computeCanaisSeries(rows, "cm")).toEqual(series);
  });

  it("base trocada na store (novo array) nunca devolve o resultado antigo", () => {
    const before = computeMonthsInfo(rows);
    const fewer = rows.filter((r) => r.periodo !== rows[0].periodo);
    const after = computeMonthsInfo(fewer);
    expect(after).not.toBe(before);
    expect(after.length).toBe(before.length - 1);
  });
});
