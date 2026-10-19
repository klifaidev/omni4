import { describe, expect, it } from "vitest";
import { buildRupturaModel, detectRupturaHeader } from "@/lib/ruptura/parse";
import { makeRupturaView } from "@/lib/ruptura/view";
import {
  resolveRupturaPeriod,
  rupturaAnchorIndex,
  rupturaPeriodOptions,
  rupturaPeriodRange,
} from "@/lib/rupturaVisualPeriod";
import { computeRupturaEvolution, computeRupturaKpis, computeRupturaMap, computeRupturaRanking } from "./data";
import { computeRupturaVisual, getRupturaVisual, listRupturaVisuals, newRupturaVisualBlock } from "./registry";

const HEADER = [
  "ID da Pesquisa", "Marca", "Categoria do Produto", "Linha de produto", "Produto (SKU)", "Rede", "Bandeira",
  "Canal PDV", "PDV", "Estado", "Cidade", "Regional", "Data e hora da pesquisa", "Produto em Ruptura", "Data", "Ano-Mês",
];

interface R { sku: string; categoria?: string; rede: string; pdv: string; estado: string; month: string; res: "Sim" | "Não" }

let surveyId = 0;
function row(r: R): unknown[] {
  const dt = `${r.month}-10 10:00:00`;
  return [
    ++surveyId, "*MELKEN", r.categoria ?? "BARRA", "LINHA X", r.sku, r.rede, r.rede, "CASH & CARRY", r.pdv, r.estado, "Cidade", "Regional",
    dt, r.res, dt.slice(0, 10), dt.slice(0, 7),
  ];
}

function model(rows: R[]) {
  const all = [HEADER, ...rows.map(row)];
  const header = detectRupturaHeader(all);
  if ("error" in header) throw new Error(header.error);
  return buildRupturaModel(all, header, { fileName: "t.xlsx", sheetName: "Base de Dados" });
}

// 4 meses (jan–abr/2026). Rupturas crescem: 1, 2, 3, 4 por mês; sempre há um "Não".
function sample() {
  const rows: R[] = [];
  const months = ["2026-01", "2026-02", "2026-03", "2026-04"];
  months.forEach((month, mi) => {
    for (let i = 0; i < 6; i++) {
      rows.push({
        sku: `SKU ${i % 3}`,
        categoria: i % 2 ? "BARRA" : "BOMBOM",
        rede: i < 3 ? "REDE A" : "REDE B",
        pdv: `LOJA ${i}`,
        estado: i < 4 ? "São Paulo" : "Rio de Janeiro",
        month,
        res: i <= mi ? "Sim" : "Não",
      });
    }
  });
  return model(rows);
}

describe("período dos visuais da Ruptura", () => {
  const m = sample();

  it("ao vivo: últimos N meses até o mais recente da base", () => {
    expect(resolveRupturaPeriod(m, { mode: "live", months: null })).toEqual({ from: 0, to: 3 });
    expect(resolveRupturaPeriod(m, { mode: "live", months: 2 })).toEqual({ from: 2, to: 3 });
    expect(resolveRupturaPeriod(m, { mode: "live", months: 1, endOffset: 1 })).toEqual({ from: 2, to: 2 });
  });

  it("o mês de referência do deck limita o que a base mostra", () => {
    expect(rupturaAnchorIndex(m, "03.2026")).toBe(2);
    expect(resolveRupturaPeriod(m, { mode: "live", months: 2 }, "03.2026")).toEqual({ from: 1, to: 2 });
    // Referência antes da base: nada para mostrar.
    expect(resolveRupturaPeriod(m, { mode: "live", months: null }, "12.2025").to).toBeLessThan(0);
  });

  it("travado: o intervalo dos meses guardados", () => {
    expect(resolveRupturaPeriod(m, { mode: "locked", periods: ["2026-02", "2026-03"] })).toEqual({ from: 1, to: 2 });
    expect(resolveRupturaPeriod(m, { mode: "locked", periods: null })).toEqual({ from: 0, to: 3 });
  });

  it("opções de envio: base inteira vira ao vivo sem janela; recorte vira janela e meses travados", () => {
    const full = rupturaPeriodOptions(m, { from: 0, to: 3 });
    expect(full.live).toEqual({ mode: "live", months: null });
    const part = rupturaPeriodOptions(m, { from: 1, to: 2 });
    expect(part.live).toEqual({ mode: "live", months: 2, endOffset: 1 });
    expect(part.locked).toEqual({ mode: "locked", periods: ["2026-02", "2026-03"] });
    // O "ao vivo" gravado volta exatamente ao recorte de hoje.
    expect(resolveRupturaPeriod(m, part.live)).toEqual({ from: 1, to: 2 });
  });

  it("texto do intervalo", () => {
    expect(rupturaPeriodRange(m, { from: 0, to: 3 })).toBe("Jan/26 – Abr/26");
    expect(rupturaPeriodRange(m, { from: 2, to: 2 })).toBe("Mar/26");
    expect(rupturaPeriodRange(m, { from: 0, to: -1 })).toBe("nenhum mês com dados");
  });
});

describe("contas dos visuais da Ruptura", () => {
  const m = sample();
  const view = makeRupturaView(m, {}, { from: 3, to: 3 });

  it("indicadores: ocorrências do mês e variação contra o mês anterior", () => {
    const cards = computeRupturaKpis(view);
    const occ = cards.find((c) => c.id === "occurrences")!;
    expect(occ.value).toBe("4");
    // Mês anterior tinha 3: +33,3%
    expect(occ.delta).toEqual({ kind: "pct", value: expect.closeTo(1 / 3, 5) });
    expect(occ.deltaLabel).toBe("vs Mar/26");
    const rate = cards.find((c) => c.id === "rate")!;
    expect(rate.unavailable).toBe(false);
    expect(rate.value).toMatch(/%/);
  });

  it("ranking: ordena por ocorrências, corta no Top N e soma a participação", () => {
    const r = computeRupturaRanking(view, "sku", 2);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].occurrences).toBeGreaterThanOrEqual(r.rows[1].occurrences);
    expect(r.totalRows).toBe(3);
    expect(r.rows[0].sub).toContain("*MELKEN");
    expect(r.shownShare).toBeCloseTo(r.rows[0].share + r.rows[1].share, 5);
  });

  it("mapa: um valor por estado pesquisado", () => {
    const map = computeRupturaMap(view, "occurrences");
    expect(map.rows.map((r) => r.uf).sort()).toEqual(["RJ", "SP"]);
    expect(map.max).toBe(Math.max(...map.rows.map((r) => r.value ?? 0)));
  });

  it("evolução: a base inteira; só 'mesmas lojas' fica no período", () => {
    const all = computeRupturaEvolution(view, {}, { metric: "occurrences", sameStores: false });
    expect(all.points.map((p) => p.label)).toEqual(["Jan/26", "Fev/26", "Mar/26", "Abr/26"]);
    expect(all.points.map((p) => p.value)).toEqual([1, 2, 3, 4]);
    const same = computeRupturaEvolution(view, {}, { metric: "occurrences", sameStores: true });
    expect(same.points).toHaveLength(1);
    // A linha do tempo respeita o limite do deck.
    const capped = computeRupturaEvolution(view, {}, { metric: "occurrences", sameStores: false, last: 2 });
    expect(capped.points).toHaveLength(3);
  });
});

describe("catálogo da Ruptura", () => {
  const m = sample();

  it("tem os oito visuais, com ids únicos", () => {
    const ids = listRupturaVisuals().map((v) => v.id);
    expect(ids).toHaveLength(8);
    expect(new Set(ids).size).toBe(8);
  });

  it("calcula pelo período do bloco e devolve o mesmo resultado em cache", () => {
    const visual = getRupturaVisual("ruptura.ranking-categoria")!;
    const input = { params: visual.defaultParams, filters: {}, period: { mode: "live", months: 1 } as const };
    const a = computeRupturaVisual(visual, m, input, null) as ReturnType<typeof computeRupturaRanking>;
    const b = computeRupturaVisual(visual, m, input, null);
    expect(b).toBe(a);
    // O mês de referência muda o recorte: 1 mês antes tem menos rupturas.
    const earlier = computeRupturaVisual(visual, m, input, "03.2026") as typeof a;
    expect(earlier.rows.reduce((s, r) => s + r.occurrences, 0)).toBe(3);
    expect(a.rows.reduce((s, r) => s + r.occurrences, 0)).toBe(4);
  });

  it("sem mês em comum com o deck, não há dado", () => {
    const visual = getRupturaVisual("ruptura.mapa")!;
    expect(computeRupturaVisual(visual, m, { params: {}, filters: {}, period: { mode: "live", months: null } }, "12.2025")).toBeNull();
  });

  it("a evolução ignora os meses escolhidos, exceto com 'mesmas lojas'", () => {
    const visual = getRupturaVisual("ruptura.evolucao")!;
    const live1 = { mode: "live", months: 1 } as const;
    const all = computeRupturaVisual(visual, m, { params: visual.defaultParams, filters: {}, period: live1 }, null) as { points: unknown[] };
    expect(all.points).toHaveLength(4);
    const same = computeRupturaVisual(visual, m, { params: { ...visual.defaultParams, sameStores: "same" }, filters: {}, period: live1 }, null) as { points: unknown[] };
    expect(same.points).toHaveLength(1);
  });

  it("um elemento novo traz opções, tamanho e título do visual", () => {
    const block = newRupturaVisualBlock("ruptura.kpi", 3);
    expect(block.kind).toBe("ruptura_visual");
    expect(block.params).toEqual({ metric: "rate" });
    expect(block.showTitle).toBe(false);
    expect(block.w).toBe(340);
    const rank = newRupturaVisualBlock("ruptura.ranking-sku", 0);
    expect(rank.showTitle).toBe(true);
    expect(rank.title).toBe("Ruptura por SKU");
  });
});
