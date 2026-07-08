import { describe, expect, it, vi, beforeEach } from "vitest";

import { defaultItem, isItemReady, type SlideItem } from "./slidesFlow";
import { buildSlidesPreflight } from "./slidesPreflight";
import { smartDefaults } from "./slidesSmartDefaults";
import { canRunSlideMutation, guardSlideReadOnly } from "./slidesReadOnly";
import { newBlock } from "./customSlide";
import { useBudget } from "@/store/budget";
import type { BudgetRow } from "./budget";

function budgetRow(periodo = "004.2025"): BudgetRow {
  return {
    periodo,
    mes: Number(periodo.slice(0, 3)),
    ano: Number(periodo.slice(4)),
    fy: "FY26",
    fyNum: 2026,
    kind: "budget",
    volumeKg: 10,
    receita: 100,
    cm: 30,
    cpv: 70,
  };
}

describe("slides quality helpers", () => {
  beforeEach(() => {
    useBudget.setState({ rows: [], files: [] });
  });

  it("validates required fields with isItemReady", () => {
    const bridge = defaultItem("bridge_pvm");
    expect(isItemReady(bridge)).toEqual({ ok: false, reason: "Defina período base e comparação." });

    const readyBridge: SlideItem = {
      ...bridge,
      config: { ...bridge.config, base: "004.2025", comp: "005.2025" },
    };
    expect(isItemReady(readyBridge)).toEqual({ ok: true });

    const cover = defaultItem("cover");
    expect(isItemReady({ ...cover, config: { ...cover.config, title: "" } }).ok).toBe(false);

    useBudget.setState({ rows: [budgetRow()], files: [] });
    const budget = defaultItem("budget_evo");
    expect(isItemReady({ ...budget, config: { ...budget.config, start: "004.2025", end: "005.2025" } })).toEqual({ ok: true });
  });

  it("builds preflight issues by severity without changing slide rules", () => {
    const cover = defaultItem("cover");
    const custom = defaultItem("custom");
    const image = newBlock("image", 1);

    const report = buildSlidesPreflight([
      { ...cover, config: { ...cover.config, title: "" } },
      { ...custom, config: { ...custom.config, blocks: [{ ...image, src: "" }] } },
    ]);

    expect(report.errors).toBe(2);
    expect(report.warnings).toBe(0);
    expect(report.issues.map((issue) => issue.title)).toEqual(["Capa sem titulo", "Imagem sem arquivo"]);
  });

  it("computes smart defaults from available periods", () => {
    expect(smartDefaults("bridge_pvm", {
      months: [
        { periodo: "004.2025", mes: 4, ano: 2025 },
        { periodo: "005.2025", mes: 5, ano: 2025 },
      ],
      budgetMonths: [],
    })).toMatchObject({ mode: "month", base: "004.2025", comp: "005.2025" });

    expect(smartDefaults("budget_evo", {
      months: [],
      budgetMonths: [
        { periodo: "004.2024", mes: 4, ano: 2024 },
        { periodo: "004.2025", mes: 4, ano: 2025 },
        { periodo: "006.2025", mes: 6, ano: 2025 },
      ],
    })).toMatchObject({ start: "004.2024", end: "006.2025" });
  });

  it("blocks edit actions when readOnly is true", () => {
    const onBlocked = vi.fn();

    expect(canRunSlideMutation(false)).toBe(true);
    expect(canRunSlideMutation(true)).toBe(false);
    expect(guardSlideReadOnly(false, onBlocked)).toBe(false);
    expect(onBlocked).not.toHaveBeenCalled();

    expect(guardSlideReadOnly(true, onBlocked)).toBe(true);
    expect(onBlocked).toHaveBeenCalledTimes(1);
  });
});
