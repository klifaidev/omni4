import { describe, expect, it } from "vitest";
import type { PricingRow } from "@/lib/types";
import { listTabVisuals, newTabVisualBlock, TAB_VISUAL_IDS } from "./registry";

function row(periodo: string, sku: string, volumeKg: number): PricingRow {
  const [mes, ano] = periodo.split(".").map(Number);
  return {
    periodo, mes, ano, fy: "FY26", fyNum: 2026, sku, skuDesc: `Produto ${sku}`, rol: volumeKg * 10, volumeKg,
    cogs: 0, custoVariavel: 0, custoFixo: 0, margemBruta: 1, contribMarginal: 2, frete: 0, comissao: 0,
  } as PricingRow;
}

const ROWS = [
  row("001.2026", "A", 50), row("002.2026", "A", 60), row("003.2026", "A", 70),
  row("003.2026", "B", 40), row("003.2026", "C", 10), row("002.2026", "B", 30),
];

describe("catálogo de visuais das abas", () => {
  it("todo visual registrado vira um bloco novo válido, ao vivo com o histórico todo", () => {
    expect(listTabVisuals().length).toBe(Object.keys(TAB_VISUAL_IDS).length);
    for (const visual of listTabVisuals()) {
      const block = newTabVisualBlock(visual.id, ROWS)!;
      expect(block.kind).toBe("tab_visual");
      expect(block.visualId).toBe(visual.id);
      expect(block.visualVersion).toBe(visual.version);
      expect(block.period).toEqual({ mode: "live", months: null });
      expect(block.title).toBe(visual.title);
    }
    expect(newTabVisualBlock("nao.existe", ROWS)).toBeNull();
  });

  it("os visuais de preço nascem com os dois meses mais recentes (base e comparação)", () => {
    const block = newTabVisualBlock(TAB_VISUAL_IDS.precoDecomp, ROWS)!;
    expect(block.params).toMatchObject({ base: "002.2026", comp: "003.2026", periodMode: "month", follow: "live", anchor: "003.2026" });
  });

  it("o farol nasce com os SKUs de maior volume dos últimos meses", () => {
    const block = newTabVisualBlock(TAB_VISUAL_IDS.farol, ROWS)!;
    // A (180) > B (70) > C (10): referência = A, comparado = o 3º (C)
    expect(block.params).toMatchObject({ skuRef: "A", skuComp: "C", periodoMeses: 3 });
  });

  it("o mapa já nasce mais alto que o bloco padrão", () => {
    const block = newTabVisualBlock(TAB_VISUAL_IDS.ufMapa, ROWS)!;
    expect([block.y, block.h]).toEqual([110, 520]);
  });
});
