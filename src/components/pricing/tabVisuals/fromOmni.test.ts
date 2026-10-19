import { describe, expect, it } from "vitest";
import { newBlock, type TabVisualBlock } from "@/lib/customSlide";
import type { PricingRow } from "@/lib/types";
import { canConvertOmni, getLegacyConversion } from "./fromOmni";
import { TAB_VISUAL_IDS } from "./registry";

const ROWS = ["001", "002", "003"].map((m, i) => ({
  periodo: `${m}.2026`, mes: i + 1, ano: 2026, fy: "FY26", fyNum: 2026, rol: 10, volumeKg: 5,
  cogs: 0, custoVariavel: 0, custoFixo: 0, margemBruta: 1, contribMarginal: 2, frete: 0, comissao: 0,
})) as PricingRow[];

function omni(kind: Parameters<typeof newBlock>[0], patch: Record<string, unknown> = {}) {
  return { ...newBlock(kind, 0), x: 100, y: 150, w: 800, h: 400, z: 7, ...patch } as ReturnType<typeof newBlock>;
}

describe("trocar elemento Omni antigo pelo visual igual à aba", () => {
  it("mantém posição, filtros (como lista) e meses (travados)", () => {
    const block = omni("omni_canal_trend", { marca: "Melken", periodos: ["001.2026", "002.2026"], showTitle: true, title: "Canais" });
    const built = getLegacyConversion(block, ROWS)!.build() as TabVisualBlock;
    expect(built.kind).toBe("tab_visual");
    expect(built.visualId).toBe(TAB_VISUAL_IDS.canalTrend);
    expect([built.x, built.y, built.w, built.h, built.z]).toEqual([100, 150, 800, 400, 7]);
    expect(built.filters).toEqual({ marca: ["Melken"] });
    expect(built.period).toEqual({ mode: "locked", periods: ["001.2026", "002.2026"] });
    expect(built.title).toBe("Canais");
  });

  it("avisa o que muda: heróis e ofensores juntos e quebra da evolução mensal", () => {
    const heroes = getLegacyConversion(omni("omni_herois_ofensores", { variant: "both" }), ROWS)!;
    expect(heroes.notes.join(" ")).toMatch(/um por vez/);
    const evo = getLegacyConversion(omni("omni_evolucao_mensal", { breakdown: "marca" }), ROWS)!;
    expect(evo.notes.join(" ")).toMatch(/quebra por/i);
  });

  it("decomposição sem períodos fixos usa os dois meses mais recentes e avança", () => {
    const built = getLegacyConversion(omni("omni_price_decomp"), ROWS)!.build() as TabVisualBlock;
    expect(built.params).toMatchObject({ base: "002.2026", comp: "003.2026", follow: "live" });
  });

  it("farol leva os SKUs escolhidos", () => {
    const built = getLegacyConversion(omni("omni_farol", { skuRef: "A", skuComp: "B", periodoMeses: 6 }), ROWS)!.build() as TabVisualBlock;
    expect(built.params).toMatchObject({ skuRef: "A", skuComp: "B", periodoMeses: 6 });
  });

  it("só oferece a troca onde há visual equivalente", () => {
    expect(canConvertOmni(omni("omni_bridge_pvm"))).toBe(false);
    expect(canConvertOmni(omni("omni_abc_bars"))).toBe(false);
    expect(canConvertOmni(newBlock("chart", 0))).toBe(false);
    for (const kind of ["omni_evolucao_mensal", "omni_heatmap_sazonalidade", "omni_herois_ofensores", "omni_positivacao", "omni_canal_trend", "omni_canal_mix", "omni_custo_evolucao", "omni_custo_composicao", "omni_custo_pressao", "omni_price_decomp", "omni_uf_map", "omni_farol", "omni_abc_curva", "omni_portfolio_matrix"] as const) {
      expect(canConvertOmni(omni(kind))).toBe(true);
      expect(getLegacyConversion(omni(kind), ROWS)!.build().kind).toBe("tab_visual");
    }
  });
});
