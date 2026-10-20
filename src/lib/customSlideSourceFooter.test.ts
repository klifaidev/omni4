import { describe, expect, it } from "vitest";
import type { CustomSlideConfig } from "./customSlide";
import {
  buildAutomaticSourceFooterText,
  getSourceFooterText,
  isSourceFooterOff,
  SLIDE_HARALD_FOOTER_Z_INDEX,
  SLIDE_SOURCE_FOOTER_Z_INDEX,
  sourceFooterBoxStyle,
  toggleSourceFooter,
  type SourceRowsByDataSource,
} from "./customSlideSourceFooter";
import type { PricingRow } from "./types";

const baseRows = [
  { periodo: "001.2026", mes: 1, ano: 2026, fy: "FY 2026", fyNum: 2026 },
  { periodo: "002.2026", mes: 2, ano: 2026, fy: "FY 2026", fyNum: 2026 },
  { periodo: "003.2026", mes: 3, ano: 2026, fy: "FY 2026", fyNum: 2026 },
] as PricingRow[];

function rowsBySource(rows: PricingRow[] = baseRows): SourceRowsByDataSource {
  return {
    ke30: rows,
    budget: rows,
    budget_real: rows,
    personalizado: rows,
  };
}

describe("customSlideSourceFooter", () => {
  it("groups distinct sources and maps budget sources to Superbase", () => {
    const config: CustomSlideConfig = {
      background: "FFFFFF",
      showHaraldFooter: true,
      blocks: [
        {
          id: "kpi-1",
          kind: "kpi",
          x: 0,
          y: 0,
          w: 100,
          h: 100,
          z: 1,
          label: "ROL",
          valueSize: 24,
          color: "C8102E",
          source: "dynamic",
          measure: "rol",
          periodMode: "month",
          periodValue: "001.2026",
          periodSelectionMode: "fixed",
          filters: {},
          dataSource: "ke30",
        },
        {
          id: "chart-1",
          kind: "chart",
          x: 0,
          y: 0,
          w: 100,
          h: 100,
          z: 2,
          chartType: "line",
          measure: "cm",
          breakdown: null,
          showGrid: false,
          showLegend: false,
          showLabels: false,
          filters: {},
          dataSource: "budget_real",
        },
      ],
    };

    expect(buildAutomaticSourceFooterText(config, rowsBySource()))
      .toBe("Fonte: KE30 · Superbase");
  });

  it("keeps relative sources stable when loaded rows change", () => {
    const config: CustomSlideConfig = {
      background: "FFFFFF",
      showHaraldFooter: true,
      blocks: [
        {
          id: "kpi-1",
          kind: "kpi",
          x: 0,
          y: 0,
          w: 100,
          h: 100,
          z: 1,
          label: "ROL",
          valueSize: 24,
          color: "C8102E",
          source: "dynamic",
          measure: "rol",
          periodMode: "month",
          periodValue: null,
          periodSelectionMode: "relative",
          relativePeriod: "latest_month_minus_1",
          filters: {},
          dataSource: "ke30",
        },
      ],
    };

    expect(buildAutomaticSourceFooterText(config, rowsBySource())).toBe("Fonte: KE30");
    expect(buildAutomaticSourceFooterText(config, rowsBySource([
      ...baseRows,
      { periodo: "004.2026", mes: 4, ano: 2026, fy: "FY 2026", fyNum: 2026 } as PricingRow,
    ]))).toBe("Fonte: KE30");
  });

  it("uses manual text literally until the slide returns to automatic mode", () => {
    const config: CustomSlideConfig = {
      background: "FFFFFF",
      showHaraldFooter: true,
      sourceFooter: { mode: "manual", manualText: "Fonte validada pelo time comercial" },
      blocks: [],
    };

    expect(getSourceFooterText(config, rowsBySource())).toBe("Fonte validada pelo time comercial");
  });

  it("fonte desativada não gera texto em nenhum modo (nem na tela, nem na exportação)", () => {
    const base: CustomSlideConfig = {
      background: "FFFFFF",
      showHaraldFooter: true,
      blocks: [{ id: "k", kind: "kpi", dataSource: "ke30" } as never],
    };
    expect(getSourceFooterText(base, rowsBySource())).toBe("Fonte: KE30");
    const off = { ...base, sourceFooter: { mode: "off" as const } };
    expect(isSourceFooterOff(off)).toBe(true);
    expect(getSourceFooterText(off, rowsBySource())).toBe("");
    const offManual = { ...base, sourceFooter: { mode: "off" as const, resume: "manual" as const, manualText: "Meu texto" } };
    expect(getSourceFooterText(offManual, rowsBySource())).toBe("");
  });

  it("desativar e reativar preserva o modo e o texto manual", () => {
    // Automático → off → automático
    const off = toggleSourceFooter(undefined, false);
    expect(off).toEqual({ mode: "off", resume: "auto" });
    expect(toggleSourceFooter(off, true)).toEqual({ mode: "auto" });
    // Manual → off → manual, com o texto
    const manual = { mode: "manual" as const, manualText: "Fonte: KE30 - Abr/25 a Mar/26" };
    const manualOff = toggleSourceFooter(manual, false);
    expect(manualOff).toEqual({ mode: "off", resume: "manual", manualText: "Fonte: KE30 - Abr/25 a Mar/26" });
    expect(toggleSourceFooter(manualOff, true)).toEqual(manual);
    // Ligar quando já está ligada não muda nada.
    expect(toggleSourceFooter(manual, true)).toEqual(manual);
  });

  it("a fonte fica SEMPRE acima da faixa da Harald e de qualquer elemento", () => {
    expect(SLIDE_SOURCE_FOOTER_Z_INDEX).toBeGreaterThan(SLIDE_HARALD_FOOTER_Z_INDEX);
    // A camada de edição mais alta do editor (texto em edição) é 9.999.999.
    expect(SLIDE_SOURCE_FOOTER_Z_INDEX).toBeGreaterThan(9_999_999);
    expect(sourceFooterBoxStyle(true).zIndex).toBe(SLIDE_SOURCE_FOOTER_Z_INDEX);
    expect(sourceFooterBoxStyle(false).zIndex).toBe(SLIDE_SOURCE_FOOTER_Z_INDEX);
    // Sobre a faixa o texto é branco; sem faixa, cinza.
    expect(sourceFooterBoxStyle(true).color).toBe("#FFFFFF");
    expect(sourceFooterBoxStyle(false).color).toBe("#64748B");
  });
});
