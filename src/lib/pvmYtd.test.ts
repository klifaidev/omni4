import { describe, expect, it } from "vitest";
import { calcPVM } from "./analytics";
import { ytdBasePeriodo, ytdEligibleMonths, ytdSplit } from "./pvmYtd";
import type { PricingRow } from "./types";

const pad = (mes: number) => String(mes).padStart(3, "0");

function row(mes: number, ano: number, sku: string, volumeKg: number, preco: number, custo: number): PricingRow {
  const fyStart = mes >= 4 ? ano : ano - 1;
  const rol = volumeKg * preco;
  const cv = volumeKg * custo;
  return {
    periodo: `${pad(mes)}.${ano}`, mes, ano,
    fy: `FY${String(fyStart).slice(-2)}/${String(fyStart + 1).slice(-2)}`, fyNum: fyStart + 1,
    sku, skuDesc: `Produto ${sku}`, categoria: "BARRA",
    rol, volumeKg, cogs: cv, custoVariavel: cv, custoFixo: 0, margemBruta: rol - cv, contribMarginal: rol - cv, frete: 0, comissao: 0,
  } as PricingRow;
}

/** FY25/26 (Abr/25–Mar/26) completo e FY26/27 de Abr/26 a Set/26. */
function dataset(opts: { skipBase?: Array<[number, number]> } = {}) {
  const rows: PricingRow[] = [];
  const add = (mes: number, ano: number, factor: number) => {
    if (opts.skipBase?.some(([m, a]) => m === mes && a === ano)) return;
    rows.push(row(mes, ano, "A", 100 * factor, 10, 6), row(mes, ano, "B", 50 * factor, 8, 5));
  };
  for (let i = 0; i < 12; i++) {
    const mes = ((i + 3) % 12) + 1;
    const ano = i < 9 ? 2025 : 2026;
    add(mes, ano, 1);
  }
  for (const mes of [4, 5, 6, 7, 8, 9]) add(mes, 2026, 1.2);
  return rows;
}

describe("Bridge PVM em YTD (ano fiscal começa em abril)", () => {
  it("o mês de base é o mesmo mês um ano antes", () => {
    expect(ytdBasePeriodo("009.2026")).toBe("009.2025");
    expect(ytdBasePeriodo("001.2026")).toBe("001.2025");
  });

  it("só os meses com o mesmo mês no ano anterior podem ser o 'até'", () => {
    const months = [...new Set(dataset().map((r) => r.periodo))].map((periodo) => ({ periodo }));
    const eligible = ytdEligibleMonths(months).map((m) => m.periodo);
    // Abr–Set/26 têm Abr–Set/25; Out/25–Mar/26 não têm um ano antes.
    expect(eligible.sort()).toEqual(["004.2026", "005.2026", "006.2026", "007.2026", "008.2026", "009.2026"].sort());
  });

  it("separa Abr–Set/26 contra Abr–Set/25 e nomeia as pontas", () => {
    const split = ytdSplit(dataset(), "009.2026")!;
    expect(split.baseLabel).toBe("YTD FY25/26");
    expect(split.compLabel).toBe("YTD FY26/27");
    expect(split.summary.compRange).toBe("Abr/26–Set/26");
    expect(split.summary.baseRange).toBe("Abr/25–Set/25");
    expect(split.summary.hasGaps).toBe(false);
    expect(split.summary.startsLate).toBe(false);
    expect(new Set(split.compRows.map((r) => r.periodo)).size).toBe(6);
    expect(new Set(split.baseRows.map((r) => r.periodo)).size).toBe(6);
  });

  it("acumula só até o mês escolhido", () => {
    const split = ytdSplit(dataset(), "006.2026")!;
    expect(split.summary.compRange).toBe("Abr/26–Jun/26");
    expect(split.summary.baseRange).toBe("Abr/25–Jun/25");
  });

  it("mês fora do ano fiscal em curso: janeiro pertence ao ano fiscal que começou em abril anterior", () => {
    // Jan/26 → FY25/26 (Abr/25–Jan/26) contra FY24/25: não há dados de 24/25 → nada a comparar.
    expect(ytdSplit(dataset(), "001.2026")).toBeNull();
  });

  it("um mês que falta no ano anterior sai dos dois lados", () => {
    const split = ytdSplit(dataset({ skipBase: [[6, 2025]] }), "009.2026")!;
    expect(split.summary.hasGaps).toBe(true);
    expect(split.compRows.some((r) => r.periodo === "006.2026")).toBe(false);
    expect(split.baseRows.some((r) => r.periodo === "006.2025")).toBe(false);
    expect(new Set(split.compRows.map((r) => r.periodo)).size).toBe(5);
  });

  it("calcPVM em YTD fecha: base + efeitos = atual, e o atual é o acumulado do FY em curso", () => {
    const rows = dataset();
    const r = calcPVM(rows, "cm", "009.2025", "009.2026", "ytd");
    expect(r.baseLabel).toBe("YTD FY25/26");
    expect(r.currentLabel).toBe("YTD FY26/27");
    const sum = r.base + r.volume + r.price + r.cost + r.freight + r.commission + r.others;
    expect(sum).toBeCloseTo(r.current, 4);
    const expectedCurrent = rows
      .filter((x) => x.fy === "FY26/27")
      .reduce((s, x) => s + x.contribMarginal, 0);
    expect(r.current).toBeCloseTo(expectedCurrent, 4);
    // O ano fiscal em curso vendeu 20% mais: volume é o grande efeito positivo.
    expect(r.volume).toBeGreaterThan(0);
  });

  it("sem janela comparável devolve um Bridge vazio, sem quebrar", () => {
    const r = calcPVM(dataset(), "cm", "001.2025", "001.2026", "ytd");
    expect(r.current).toBe(0);
    expect(r.skuDetails).toEqual([]);
  });
});
