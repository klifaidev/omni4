import { describe, expect, it, beforeEach } from "vitest";
import { useBudget } from "./budget";
import type { BudgetFile, BudgetRow } from "@/lib/budget";

function budgetRow(periodo: string, volumeKg: number, cm: number): BudgetRow {
  const [mesRaw, anoRaw] = periodo.split(".");
  const mes = Number(mesRaw);
  const ano = Number(anoRaw);
  return {
    periodo,
    mes,
    ano,
    fy: "FY25/26",
    fyNum: 202526,
    kind: "budget",
    volumeKg,
    receita: volumeKg * 10,
    cm,
    cpv: -volumeKg * 4,
  };
}

function budgetFile(name: string, rows: BudgetRow[]): BudgetFile {
  return {
    name,
    rowCount: rows.length,
    months: Array.from(new Set(rows.map((row) => row.periodo))).sort(),
    uploadedAt: Date.now(),
  };
}

describe("useBudget", () => {
  beforeEach(() => {
    useBudget.setState({ rows: [], files: [] });
  });

  it("replaces overlapping Budget periods instead of duplicating them when multiple files are loaded", () => {
    const oldRows = [
      budgetRow("006.2026", 100, 40),
      budgetRow("007.2026", 200, 80),
    ];
    const newRows = [
      budgetRow("007.2026", 250, 100),
      budgetRow("008.2026", 300, 120),
    ];

    useBudget.getState().addBudget(oldRows, budgetFile("budget-old.xlsx", oldRows), false);
    useBudget.getState().addBudget(newRows, budgetFile("budget-new.xlsx", newRows), false);

    const rows = useBudget.getState().rows;
    const julyRows = rows.filter((row) => row.periodo === "007.2026");
    const totalVolume = rows.reduce((sum, row) => sum + row.volumeKg, 0);
    const totalCm = rows.reduce((sum, row) => sum + row.cm, 0);

    expect(julyRows).toHaveLength(1);
    expect(julyRows[0].volumeKg).toBe(250);
    expect(totalVolume).toBe(650);
    expect(totalCm).toBe(260);
    expect(useBudget.getState().files).toEqual([
      expect.objectContaining({ name: "budget-old.xlsx", months: ["006.2026"], rowCount: 1 }),
      expect.objectContaining({ name: "budget-new.xlsx", months: ["007.2026", "008.2026"], rowCount: 2 }),
    ]);
  });
});

