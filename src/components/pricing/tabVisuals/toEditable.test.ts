import { describe, expect, it } from "vitest";
import { newBlock, type ChartBlock, type TabVisualBlock } from "@/lib/customSlide";
import type { PricingRow } from "@/lib/types";
import { canConvertToEditable, getEditableConversion } from "./toEditable";
import { TAB_VISUAL_IDS } from "./registry";

const ROWS = ["001", "002", "003"].map((m, i) => ({
  periodo: `${m}.2026`, mes: i + 1, ano: 2026, fy: "FY26", fyNum: 2026,
  rol: 10, volumeKg: 5, cogs: 0, custoVariavel: 0, custoFixo: 0, margemBruta: 1, contribMarginal: 2, frete: 0, comissao: 0,
})) as PricingRow[];

function visual(id: string, extra: Partial<TabVisualBlock> = {}): TabVisualBlock {
  const block = newBlock("tab_visual", 0) as TabVisualBlock;
  return { ...block, visualId: id, title: "Meu visual", showTitle: true, ...extra };
}

describe("converter visual da aba em elemento editável", () => {
  it("evolução mensal vira gráfico combinado com 3 séries e eixo secundário", () => {
    const conv = getEditableConversion(visual(TAB_VISUAL_IDS.evolucaoMensal, { params: { metric: "mb" }, filters: { marca: ["A", "B"] } }), ROWS)!;
    const chart = conv.build() as ChartBlock;
    expect(chart.kind).toBe("chart");
    expect(chart.chartType).toBe("combo");
    expect(chart.comboSeries?.map((s) => [s.measure, s.asLine, !!s.secondaryAxis])).toEqual([
      ["volume", false, false],
      ["rol", true, false],
      ["mbPct", true, true],
    ]);
    // filtros multivalor vão inteiros para o gráfico nativo
    expect(chart.filters).toEqual({ marca: ["A", "B"] });
    expect(chart.title).toBe("Meu visual");
  });

  it("avisa que o gráfico nativo mostra o histórico quando o visual tinha uma janela de meses", () => {
    const windowed = getEditableConversion(visual(TAB_VISUAL_IDS.evolucaoMensal, { period: { mode: "live", months: 2 } }), ROWS)!;
    expect(windowed.notes.join(" ")).toMatch(/todo o histórico/);
    const all = getEditableConversion(visual(TAB_VISUAL_IDS.evolucaoMensal, { period: { mode: "live", months: null } }), ROWS)!;
    expect(all.notes).toEqual([]);
  });

  it("sem título visível, o gráfico não repete o título do slide", () => {
    const conv = getEditableConversion(visual(TAB_VISUAL_IDS.canalTrend, { showTitle: false }), ROWS)!;
    const chart = conv.build() as ChartBlock;
    expect(chart.style?.general?.titleShow).toBe(false);
    expect(chart.breakdown).toBe("canalAjustado");
  });

  it("elementos omni guardam um valor por filtro e avisam do que descartam", () => {
    const conv = getEditableConversion(
      visual(TAB_VISUAL_IDS.herois, { params: { variant: "villain", metric: "cm" }, filters: { marca: ["A", "B"], gestorResp: ["X"] } }),
      ROWS,
    )!;
    const block = conv.build() as unknown as Record<string, unknown>;
    expect(block.kind).toBe("omni_herois_ofensores");
    expect(block.variant).toBe("villain");
    expect(block.marca).toBe("A");
    const notes = conv.notes.join(" ");
    expect(notes).toMatch(/um valor só/);
    expect(notes).toMatch(/Gestor/i);
  });

  it("visual com meses guarda os meses de agora, fixos, no omni", () => {
    const conv = getEditableConversion(visual(TAB_VISUAL_IDS.abcMatriz, { period: { mode: "locked", periods: ["001.2026", "002.2026"] } }), ROWS)!;
    expect((conv.build() as unknown as { periodos: string[] }).periodos).toEqual(["001.2026", "002.2026"]);
    expect(conv.notes.join(" ")).toMatch(/ficam fixos/);
  });

  it("decomposição de preço leva base e comparação já resolvidas", () => {
    const conv = getEditableConversion(
      visual(TAB_VISUAL_IDS.precoDecomp, { params: { base: "001.2026", comp: "002.2026", periodMode: "month", follow: "fixed" } }),
      ROWS,
    )!;
    const block = conv.build() as unknown as { base: string; comp: string; baseSelectionMode: string };
    expect([block.base, block.comp, block.baseSelectionMode]).toEqual(["001.2026", "002.2026", "fixed"]);
  });

  it("só converte onde existe elemento equivalente", () => {
    for (const id of [TAB_VISUAL_IDS.inovMaturidade, TAB_VISUAL_IDS.inovHerois, TAB_VISUAL_IDS.inovCanalMix, TAB_VISUAL_IDS.precoRanking]) {
      expect(canConvertToEditable(id)).toBe(false);
      expect(getEditableConversion(visual(id), ROWS)).toBeNull();
    }
    for (const id of Object.values(TAB_VISUAL_IDS)) {
      if (!canConvertToEditable(id)) continue;
      const built = getEditableConversion(visual(id), ROWS)!.build();
      expect(built.kind).not.toBe("tab_visual");
      expect(built.id).toBeTruthy();
    }
  });
});
