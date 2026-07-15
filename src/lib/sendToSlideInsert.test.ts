import { describe, expect, it } from "vitest";
import { defaultCustomSlide, type DreBlock, type KpiBlock, type OmniBridgePvmBlock } from "./customSlide";
import { resolvePeriodValue, resolvePeriodValues } from "./relativePeriods";
import {
  buildCustomBlockFromPayload,
  buildNativeSlideConfigFromPayload,
} from "./sendToSlideInsert";
import type { SendToSlidePayload } from "./sendToSlide";
import type { PricingRow } from "./types";
import type { SlideItem } from "./slidesFlow";

function row(periodo: string, mes: number, ano: number): PricingRow {
  return {
    periodo,
    mes,
    ano,
    fy: `FY${String(ano).slice(-2)}`,
    fyNum: ano,
    rol: 1,
    volumeKg: 1,
    cogs: 0,
    custoVariavel: 0,
    custoFixo: 0,
    margemBruta: 1,
    contribMarginal: 1,
    frete: 0,
    comissao: 0,
  };
}

describe("sendToSlideInsert", () => {
  it("preserves a relative period when creating a KPI block", () => {
    const payload: SendToSlidePayload = {
      source: { page: "Visao Geral", visualization: "ROL Total" },
      target: { blockKind: "kpi", blockLabel: "KPI" },
      config: {
        label: "ROL Total",
        measure: "rol",
        dataSource: "ke30",
        periodMode: "month",
        periodSelectionMode: "relative",
        relativePeriod: "latest_month",
      },
    };

    const block = buildCustomBlockFromPayload(payload, defaultCustomSlide()) as KpiBlock;

    expect(block.label).toBe("ROL Total");
    expect(block.periodMode).toBe("month");
    expect(block.periodSelectionMode).toBe("relative");
    expect(block.relativePeriod).toBe("latest_month");
    expect(block.periodValue).toBeNull();

    const before = [row("005.2025", 5, 2025), row("006.2025", 6, 2025)];
    const after = [...before, row("007.2025", 7, 2025)];
    expect(resolvePeriodValue(before, block.periodMode!, block.periodValue, block.periodSelectionMode, block.relativePeriod))
      .toBe("006.2025");
    expect(resolvePeriodValue(after, block.periodMode!, block.periodValue, block.periodSelectionMode, block.relativePeriod))
      .toBe("007.2025");
  });

  it("preserves relative selected periods for DRE blocks", () => {
    const payload: SendToSlidePayload = {
      source: { page: "DRE", visualization: "DRE Executiva" },
      target: { blockKind: "dre", blockLabel: "DRE" },
      config: {
        periodMode: "month",
        periodosSelectionMode: "relative",
        periodosRelativePeriod: "latest_month_minus_1",
      },
    };

    const block = buildCustomBlockFromPayload(payload, defaultCustomSlide()) as DreBlock;

    expect(block.periodos).toBeNull();
    expect(block.periodosSelectionMode).toBe("relative");
    expect(block.periodosRelativePeriod).toBe("latest_month_minus_1");

    const before = [row("005.2025", 5, 2025), row("006.2025", 6, 2025)];
    const after = [...before, row("007.2025", 7, 2025)];
    expect(resolvePeriodValues(before, block.periodos, block.periodosSelectionMode, block.periodosRelativePeriod))
      .toEqual(["005.2025"]);
    expect(resolvePeriodValues(after, block.periodos, block.periodosSelectionMode, block.periodosRelativePeriod))
      .toEqual(["006.2025"]);
  });

  it("preserves relative comparison periods and title for Omni bridge blocks", () => {
    const payload: SendToSlidePayload = {
      source: { page: "Bridge PVM", visualization: "Bridge PVM por Categoria" },
      target: { blockKind: "slide:bridge_pvm", blockLabel: "Bridge PVM" },
      config: {
        metric: "cm",
        periodMode: "month",
        baseSelectionMode: "relative",
        baseRelativePeriod: "latest_month_minus_2",
        compSelectionMode: "relative",
        compRelativePeriod: "latest_month",
      },
    };

    const block = buildCustomBlockFromPayload(payload, defaultCustomSlide()) as OmniBridgePvmBlock;

    expect(block.title).toBe("Bridge PVM por Categoria");
    expect(block.base).toBeNull();
    expect(block.comp).toBeNull();
    expect(block.baseSelectionMode).toBe("relative");
    expect(block.baseRelativePeriod).toBe("latest_month_minus_2");
    expect(block.compSelectionMode).toBe("relative");
    expect(block.compRelativePeriod).toBe("latest_month");
  });

  it("uses the source visualization as the native slide label", () => {
    const item: SlideItem = {
      id: "slide-1",
      kind: "bridge_pvm",
      label: "Bridge",
      config: { mode: "month", base: null, comp: null, filters: {} },
    };
    const payload: SendToSlidePayload = {
      source: { page: "Bridge PVM", visualization: "Bridge PVM por Canal" },
      target: { blockKind: "slide:bridge_pvm", blockLabel: "Bridge PVM" },
      config: { periodMode: "month", base: "005.2025", comp: "006.2025" },
    };

    const next = buildNativeSlideConfigFromPayload(payload, item);

    expect(next.label).toBe("Bridge PVM por Canal");
  });
});
