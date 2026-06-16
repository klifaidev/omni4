import { describe, it, expect } from "vitest";
import { calcPVM, computeKPIs, aggregateBy, computePriceDecomposition } from "@/lib/analytics";
import { makeRow } from "./_helpers";

describe("calcPVM", () => {
  it("month mode: volume up + price down → volEffect > 0, priceEffect < 0, current = base + sum(effects)", () => {
    const base = [
      makeRow({ periodo: "005.2025", sku: "X", volumeKg: 100, rol: 1000, cogs: 600, margemBruta: 400, contribMarginal: 400 }),
    ];
    const comp = [
      makeRow({ periodo: "006.2025", mes: 6, sku: "X", volumeKg: 150, rol: 1200, cogs: 900, margemBruta: 300, contribMarginal: 300 }),
    ];
    const res = calcPVM([...base, ...comp], "mb", "005.2025", "006.2025", "month");
    expect(res.volume).toBeGreaterThan(0);
    expect(res.price).toBeLessThan(0);
    const sum = res.base + res.volume + res.price + res.cost + res.freight + res.commission + res.others;
    expect(sum).toBeCloseTo(res.current, 6);
  });

  it("base === comp → all effects ≈ 0, base === current", () => {
    const rows = [
      makeRow({ sku: "A", volumeKg: 50, rol: 500, cogs: 300, margemBruta: 200, contribMarginal: 200 }),
    ];
    const res = calcPVM(rows, "mb", "005.2025", "005.2025", "month");
    expect(res.base).toBeCloseTo(res.current, 6);
    expect(res.volume).toBeCloseTo(0, 6);
    expect(res.price).toBeCloseTo(0, 6);
    expect(res.cost).toBeCloseTo(0, 6);
    expect(res.others).toBeCloseTo(0, 6);
  });

  it("empty rows → all effects = 0", () => {
    const res = calcPVM([], "mb", "FY24/25", "FY25/26", "fy");
    expect(res.base).toBe(0);
    expect(res.current).toBe(0);
    expect(res.volume).toBe(0);
    expect(res.price).toBe(0);
    expect(res.cost).toBe(0);
    expect(res.freight).toBe(0);
    expect(res.commission).toBe(0);
    expect(res.others).toBe(0);
    expect(res.skuDetails).toEqual([]);
  });
});

describe("computeKPIs", () => {
  it("soma rol, margem, volume e conta SKUs distintos", () => {
    const rows = [
      makeRow({ sku: "A", rol: 100, margemBruta: 40, contribMarginal: 30, volumeKg: 10 }),
      makeRow({ sku: "B", rol: 200, margemBruta: 60, contribMarginal: 50, volumeKg: 20 }),
      makeRow({ sku: "A", rol: 100, margemBruta: 20, contribMarginal: 20, volumeKg: 5 }),
    ];
    const k = computeKPIs(rows, "mb");
    expect(k.rol).toBe(400);
    expect(k.margem).toBe(120);
    expect(k.volumeKg).toBe(35);
    expect(k.skus).toBe(2);
    expect(k.margemPct).toBeCloseTo(120 / 400, 6);
  });

  it("rol = 0 → margemPct = 0 (não NaN)", () => {
    const k = computeKPIs([makeRow({ rol: 0, margemBruta: 0 })], "mb");
    expect(k.margemPct).toBe(0);
  });
});

describe("aggregateBy", () => {
  it("agrupa por chave e soma métricas", () => {
    const rows = [
      makeRow({ marca: "X", rol: 100, margemBruta: 40, volumeKg: 10 }),
      makeRow({ marca: "X", rol: 200, margemBruta: 80, volumeKg: 20 }),
      makeRow({ marca: "Y", rol: 50, margemBruta: 10, volumeKg: 5 }),
    ];
    const agg = aggregateBy(rows, "mb", (r) => r.marca ?? "—");
    const byKey = Object.fromEntries(agg.map((a) => [a.key, a]));
    expect(byKey.X.rol).toBe(300);
    expect(byKey.X.margem).toBe(120);
    expect(byKey.X.volumeKg).toBe(30);
    expect(byKey.Y.rol).toBe(50);
    // ordenado por rol desc
    expect(agg[0].key).toBe("X");
  });
});

describe("computePriceDecomposition", () => {
  it("fecha variacao total como efeito preco + efeito mix em R$/kg", () => {
    const rows = [
      makeRow({ periodo: "004.2026", mes: 4, sku: "A", volumeKg: 100, rol: 1000 }),
      makeRow({ periodo: "004.2026", mes: 4, sku: "B", volumeKg: 100, rol: 3000 }),
      makeRow({ periodo: "005.2026", mes: 5, sku: "A", volumeKg: 150, rol: 1350 }),
      makeRow({ periodo: "005.2026", mes: 5, sku: "B", volumeKg: 50, rol: 1600 }),
    ];

    const res = computePriceDecomposition(rows, "004.2026", "005.2026", "month");

    expect(res).not.toBeNull();
    expect(res!.efeitoPrecoRsKg + res!.efeitoMixRsKg).toBeCloseTo(res!.variacaoTotal, 10);
  });

  it("mantem fechamento quando ha devolucao com volume negativo", () => {
    const rows = [
      makeRow({ periodo: "004.2026", mes: 4, sku: "A", volumeKg: 100, rol: 1000 }),
      makeRow({ periodo: "004.2026", mes: 4, sku: "B", volumeKg: 100, rol: 3000 }),
      makeRow({ periodo: "005.2026", mes: 5, sku: "A", volumeKg: 130, rol: 1300 }),
      makeRow({ periodo: "005.2026", mes: 5, sku: "B", volumeKg: 90, rol: 2700 }),
      makeRow({ periodo: "005.2026", mes: 5, sku: "C", volumeKg: -20, rol: -500 }),
    ];

    const res = computePriceDecomposition(rows, "004.2026", "005.2026", "month");

    expect(res).not.toBeNull();
    expect(res!.efeitoPrecoRsKg + res!.efeitoMixRsKg).toBeCloseTo(res!.variacaoTotal, 10);
  });
});
