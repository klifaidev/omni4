import { describe, expect, it } from "vitest";
import type { PricingRow } from "@/lib/types";
import {
  computeBridgeEffects,
  computeBridgeRanking,
  computeBridgeScope,
  categoryRankingItems,
  topBridgeItems,
} from "./bridgeData";
import { getTabVisual, newTabVisualBlock, TAB_VISUAL_IDS } from "./registry";

function row(periodo: string, sku: string, categoria: string, volumeKg: number, preco: number, custo: number): PricingRow {
  const [mes, ano] = periodo.split(".").map(Number);
  const rol = volumeKg * preco;
  const cv = volumeKg * custo;
  return {
    periodo, mes, ano, fy: `FY${ano}`, fyNum: ano, sku, skuDesc: `Produto ${sku}`, categoria,
    rol, volumeKg, cogs: cv, custoVariavel: cv, custoFixo: 0, margemBruta: rol - cv, contribMarginal: rol - cv, frete: 0, comissao: 0,
  } as PricingRow;
}

// Dois meses: A vende mais e mais caro; B cai de volume; C só existe na base.
const ROWS = [
  row("001.2026", "A", "BARRA", 100, 10, 6), row("002.2026", "A", "BARRA", 130, 11, 6),
  row("001.2026", "B", "BOMBOM", 200, 9, 5), row("002.2026", "B", "BOMBOM", 120, 9, 6),
  row("001.2026", "C", "BOMBOM", 50, 8, 5),
];

const ctx = (filters = {}) => ({ allRows: ROWS, filters, periods: null });
const params = { base: "001.2026", comp: "002.2026", periodMode: "month", follow: "fixed", metric: "cm" };

describe("dados dos visuais do Bridge PVM", () => {
  it("compara os períodos base e comparação, ignorando os meses do filtro", () => {
    const scope = computeBridgeScope(params, ctx())!;
    expect(scope.base).toBe("001.2026");
    expect(scope.result.baseLabel).toBe("Jan/26");
    expect(scope.result.currentLabel).toBe("Fev/26");
    // O fechamento do bridge bate: base + efeitos = atual
    const r = scope.result;
    const sum = r.base + r.volume + r.price + r.cost + r.freight + r.commission + r.others;
    expect(sum).toBeCloseTo(r.current, 4);
  });

  it("sem base e comparação distintas não há resultado", () => {
    expect(computeBridgeScope({ ...params, comp: "001.2026" }, ctx())).toBeNull();
    expect(computeBridgeScope({ ...params, base: null }, ctx())).toBeNull();
  });

  it("ao vivo, a comparação anda com o mês de referência do deck", () => {
    // Enviado quando o deck ia até 001.2026 (base 12/25 → comp 001/26); hoje o deck vai até 002.2026.
    const live = computeBridgeScope(
      { base: "001.2026", comp: "001.2026", periodMode: "month", follow: "live", anchor: "001.2026" },
      ctx(),
    );
    expect(live).toBeNull();
    const shifted = computeBridgeScope(
      { base: "012.2025", comp: "001.2026", periodMode: "month", follow: "live", anchor: "001.2026", metric: "cm" },
      ctx(),
    )!;
    expect(shifted.base).toBe("001.2026");
    expect(shifted.comp).toBe("002.2026");
  });

  it("cartões de efeito: seis, na ordem da aba, com participação somando 100%", () => {
    const data = computeBridgeEffects(computeBridgeScope(params, ctx()))!;
    expect(data.cards.map((c) => c.id)).toEqual(["volume", "price", "cost", "freight", "commission", "others"]);
    expect(data.cards.reduce((s, c) => s + c.share, 0)).toBeCloseTo(100, 4);
    expect(computeBridgeEffects(null)).toBeNull();
  });

  it("ranking por SKU: heróis positivos em ordem decrescente e ofensores negativos", () => {
    const scope = computeBridgeScope(params, ctx())!;
    const rk = computeBridgeRanking(scope, "sku", "volumeEffect")!;
    expect(rk.heroes.every((i) => i.volumeEffect > 0)).toBe(true);
    expect(rk.offenders.every((i) => i.volumeEffect < 0)).toBe(true);
    expect(rk.heroes.map((i) => i.volumeEffect)).toEqual([...rk.heroes.map((i) => i.volumeEffect)].sort((a, b) => b - a));
    // A vendeu mais (herói de volume); B vendeu menos (ofensor).
    expect(rk.heroes[0].id).toBe("A");
    expect(rk.offenders[0].id).toBe("B");
  });

  it("ranking por categoria soma os SKUs de cada categoria", () => {
    const scope = computeBridgeScope(params, ctx())!;
    const items = categoryRankingItems(scope.result.skuDetails, scope.rows, scope.base, scope.comp, scope.periodMode);
    expect(items.map((i) => i.name).sort()).toEqual(["BARRA", "BOMBOM"]);
    const bombom = items.find((i) => i.name === "BOMBOM")!;
    const skuSum = scope.result.skuDetails.filter((d) => d.sku === "B" || d.sku === "C").reduce((s, d) => s + d.volumeEffect, 0);
    expect(bombom.volumeEffect).toBeCloseTo(skuSum, 6);
    expect(topBridgeItems(items, "volumeEffect", 1).heroes).toHaveLength(1);
  });

  it("filtros do visual recortam o Bridge", () => {
    const scope = computeBridgeScope(params, ctx({ categoria: ["BARRA"] }))!;
    expect(scope.result.skuDetails.map((d) => d.sku)).toEqual(["A"]);
  });
});

describe("catálogo: visuais do Bridge PVM", () => {
  it("nascem com os dois meses mais recentes e o período do slide não vale (compara dois períodos)", () => {
    for (const id of [TAB_VISUAL_IDS.bridgeEfeito, TAB_VISUAL_IDS.bridgeEfeitos, TAB_VISUAL_IDS.bridgeRankingCategoria, TAB_VISUAL_IDS.bridgeRankingSku]) {
      const visual = getTabVisual(id)!;
      expect(visual.history).toBe(true);
      expect(visual.periodNote).toMatch(/Bridge compara/);
      const block = newTabVisualBlock(id, ROWS)!;
      expect(block.params).toMatchObject({ base: "001.2026", comp: "002.2026", periodMode: "month", follow: "live" });
    }
  });

  it("o cartão de efeito nasce pequeno, no canto, e o painel ocupa a largura toda", () => {
    const card = newTabVisualBlock(TAB_VISUAL_IDS.bridgeEfeito, ROWS)!;
    expect([card.x, card.y, card.w, card.h]).toEqual([60, 130, 340, 190]);
    const strip = newTabVisualBlock(TAB_VISUAL_IDS.bridgeEfeitos, ROWS)!;
    expect([strip.y, strip.h]).toEqual([130, 190]);
  });
});

describe("Bridge PVM em YTD no catálogo", () => {
  function fyRow(mes: number, ano: number, sku: string, volumeKg: number): PricingRow {
    const start = mes >= 4 ? ano : ano - 1;
    return {
      ...row(`${String(mes).padStart(3, "0")}.${ano}`, sku, "BARRA", volumeKg, 10, 6),
      fy: `FY${String(start).slice(-2)}/${String(start + 1).slice(-2)}`,
    };
  }
  const YTD_ROWS = [4, 5, 6, 7, 8, 9].flatMap((mes) => [
    fyRow(mes, 2025, "A", 100), fyRow(mes, 2025, "B", 50),
    fyRow(mes, 2026, "A", 130), fyRow(mes, 2026, "B", 40),
  ]);
  const ytdCtx = { allRows: YTD_ROWS, filters: {}, periods: null };

  it("compara o acumulado do ano fiscal (abril) com o mesmo período do ano anterior", () => {
    const scope = computeBridgeScope({ periodMode: "ytd", comp: "009.2026", follow: "fixed", metric: "cm" }, ytdCtx)!;
    expect(scope.periodMode).toBe("ytd");
    expect(scope.base).toBe("009.2025");
    expect(scope.result.baseLabel).toBe("YTD FY25/26");
    expect(scope.result.currentLabel).toBe("YTD FY26/27");
    const r = scope.result;
    expect(r.base + r.volume + r.price + r.cost + r.freight + r.commission + r.others).toBeCloseTo(r.current, 4);
    // Seis meses acumulados de cada lado.
    expect(r.current).toBeCloseTo(YTD_ROWS.filter((x) => x.fy === "FY26/27").reduce((sum, x) => sum + x.contribMarginal, 0), 4);
  });

  it("ao vivo, o mês do acumulado anda com o mês de referência do deck", () => {
    const scope = computeBridgeScope(
      { periodMode: "ytd", comp: "008.2026", anchor: "008.2026", follow: "live", metric: "cm" },
      ytdCtx,
    )!;
    // O deck agora vai até 009.2026: o "até" avança um mês.
    expect(scope.comp).toBe("009.2026");
  });

  it("sem o mesmo mês no ano anterior não há Bridge YTD", () => {
    expect(computeBridgeScope({ periodMode: "ytd", comp: "003.2026", follow: "fixed" }, ytdCtx)).toBeNull();
  });

  it("os rankings por categoria e SKU usam as janelas do YTD", () => {
    const scope = computeBridgeScope({ periodMode: "ytd", comp: "009.2026", follow: "fixed", metric: "cm" }, ytdCtx)!;
    const rk = computeBridgeRanking(scope, "sku", "volumeEffect")!;
    expect(rk.heroes[0].id).toBe("A");
    expect(rk.offenders[0].id).toBe("B");
    expect(computeBridgeRanking(scope, "categoria", "volumeEffect")!.heroes.length + computeBridgeRanking(scope, "categoria", "volumeEffect")!.offenders.length).toBeGreaterThan(0);
  });
});
