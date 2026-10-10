import { describe, expect, it } from "vitest";
import {
  buildRupturaModel,
  detectRupturaHeader,
  parseRupturaResult,
  parseWallClock,
  pickRupturaSheet,
} from "./parse";
import {
  aggregate,
  compileFilter,
  filterOptions,
  groupBy,
  monthlySeries,
  paretoCount,
  previousPeriod,
  rateAvailable,
} from "./metrics";
import { ufFromEstado } from "./uf";

const HEADER = [
  "ID da Pesquisa", "Marca", "Categoria do Produto", "Linha de produto", "Produto (SKU)", "Rede", "Bandeira",
  "Canal PDV", "PDV", "Estado", "Cidade", "Regional", "Data e hora da pesquisa", "Produto em Ruptura", "Data", "Ano-Mês",
];

interface R {
  id: number | string;
  sku?: string;
  rede?: string;
  bandeira?: string;
  pdv: string;
  estado?: string;
  cidade?: string;
  canal?: string;
  categoria?: string;
  dt: string;
  res: string;
}

function row(r: R): unknown[] {
  return [
    r.id, "*MELKEN", r.categoria ?? "CHOCOLATE BARRA", "LINHA X", r.sku ?? "SKU A", r.rede ?? "REDE A", r.bandeira ?? r.rede ?? "REDE A",
    r.canal ?? "CASH & CARRY", r.pdv, r.estado ?? "São Paulo", r.cidade ?? "Campinas", "Regional SP", r.dt, r.res,
    r.dt.slice(0, 10), r.dt.slice(0, 7),
  ];
}

function model(rows: R[]) {
  const all = [HEADER, ...rows.map(row)];
  const header = detectRupturaHeader(all);
  if ("error" in header) throw new Error(header.error);
  return buildRupturaModel(all, header, { fileName: "t.xlsx", sheetName: "Base de Dados" });
}

const all = (m: ReturnType<typeof model>) => compileFilter(m, {}, null);

describe("leitura da base de ruptura", () => {
  it("reconhece o cabeçalho da planilha de referência", () => {
    const header = detectRupturaHeader([["título"], [], HEADER]);
    expect("error" in header).toBe(false);
    if ("error" in header) return;
    expect(header.headerRow).toBe(2);
    expect(header.columns.sku).toBe(4);
    expect(header.columns.result).toBe(13);
    expect(header.columns.data).toBe(14);
    expect(header.columns.dataHora).toBe(12);
  });

  it("aponta as colunas que faltam", () => {
    const header = detectRupturaHeader([["Rede", "Bandeira"]]);
    expect("error" in header && header.error).toMatch(/Produto \(SKU\)/);
  });

  it("prefere a aba Base de Dados", () => {
    const picked = pickRupturaSheet(["Painel", "Base de Dados"], (n) => (n === "Painel" ? [["x"]] : [HEADER]));
    expect("error" in picked ? null : picked.sheetName).toBe("Base de Dados");
  });

  it("interpreta Sim/Não e descarta respostas vazias (Teste: vazio não é presença)", () => {
    expect(parseRupturaResult("Sim")).toBe(1);
    expect(parseRupturaResult("NÃO")).toBe(0);
    expect(parseRupturaResult("nao")).toBe(0);
    expect(parseRupturaResult("")).toBeNull();
    expect(parseRupturaResult(null)).toBeNull();
    expect(parseRupturaResult("talvez")).toBeNull();
    const m = model([
      { id: 1, pdv: "L1", dt: "2026-01-05 10:00", res: "Sim" },
      { id: 1, sku: "SKU B", pdv: "L1", dt: "2026-01-05 10:00", res: "" },
    ]);
    expect(m.quality.invalidResult).toBe(1);
    expect(m.cells.month.length).toBe(1);
  });

  it("lê datas em serial do Excel, texto ISO e dd/mm/aaaa sem fuso", () => {
    expect(new Date(parseWallClock(46286.5)!).toISOString()).toBe("2026-09-21T12:00:00.000Z");
    expect(new Date(parseWallClock("2026-09-21 19:07:21")!).toISOString()).toBe("2026-09-21T19:07:21.000Z");
    expect(new Date(parseWallClock("21/09/2026 19:07")!).toISOString()).toBe("2026-09-21T19:07:00.000Z");
    expect(new Date(parseWallClock("2026-09")!).toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("mapeia o estado por extenso para a UF", () => {
    expect(ufFromEstado("São Paulo")).toBe("SP");
    expect(ufFromEstado("Espírito Santo")).toBe("ES");
    expect(ufFromEstado("rj")).toBe("RJ");
    expect(ufFromEstado("Atlântida")).toBeNull();
  });
});

describe("Teste A — taxa de ruptura", () => {
  it("100 avaliações, 25 Sim e 75 Não → 25%", () => {
    const rows: R[] = [];
    for (let i = 0; i < 100; i++) rows.push({ id: i, pdv: `L${i}`, dt: "2026-03-10 09:00", res: i < 25 ? "Sim" : "Não" });
    const m = model(rows);
    expect(rateAvailable(m, null)).toBe(true);
    const k = aggregate(m, all(m), true);
    expect(k.evaluations).toBe(100);
    expect(k.occurrences).toBe(25);
    expect(k.rate).toBeCloseTo(0.25);
  });

  it("sem respostas Não a taxa fica indisponível (não vira 100%)", () => {
    const m = model([{ id: 1, pdv: "L1", dt: "2026-03-10 09:00", res: "Sim" }]);
    expect(rateAvailable(m, null)).toBe(false);
    expect(aggregate(m, all(m), rateAvailable(m, null)).rate).toBeNull();
  });

  it("mês sem respostas Não deixa a taxa do período indisponível", () => {
    const m = model([
      { id: 1, pdv: "L1", dt: "2026-03-10 09:00", res: "Não" },
      { id: 2, pdv: "L1", dt: "2026-04-10 09:00", res: "Sim" },
    ]);
    expect(rateAvailable(m, { from: 0, to: 0 })).toBe(true);
    expect(rateAvailable(m, { from: 0, to: 1 })).toBe(false);
  });
});

describe("Teste B — redes de tamanhos diferentes", () => {
  it("Rede A 75/100 lojas = 75%, Rede B 1/1 = 100%", () => {
    const rows: R[] = [];
    for (let i = 0; i < 100; i++) rows.push({ id: `a${i}`, rede: "REDE A", pdv: `A${i}`, dt: "2026-05-02 08:00", res: i < 75 ? "Sim" : "Não" });
    rows.push({ id: "b0", rede: "REDE B", pdv: "B0", dt: "2026-05-02 08:00", res: "Sim" });
    const m = model(rows);
    const byRede = groupBy(m, all(m), "rede", rateAvailable(m, null));
    const a = byRede.find((r) => r.label === "REDE A")!;
    const b = byRede.find((r) => r.label === "REDE B")!;
    expect(a.rate).toBeCloseTo(0.75);
    expect(b.rate).toBeCloseTo(1);
    expect(a.storesAffected).toBe(75);
    expect(a.storesSurveyed).toBe(100);
    // Ordena por ocorrências, não pela taxa: a rede grande vem primeiro.
    expect(byRede[0].label).toBe("REDE A");
  });
});

describe("Teste F — duplicidade", () => {
  it("várias pesquisas da mesma loja × SKU no mês viram uma ocorrência, e a última vale", () => {
    const m = model([
      { id: 1, pdv: "L1", dt: "2026-06-01 08:00", res: "Sim" },
      { id: 2, pdv: "L1", dt: "2026-06-15 08:00", res: "Sim" },
      { id: 3, pdv: "L1", dt: "2026-06-28 08:00", res: "Não" },
      { id: 4, pdv: "L2", dt: "2026-06-03 08:00", res: "Não" },
      { id: 5, pdv: "L2", dt: "2026-06-20 08:00", res: "Sim" },
    ]);
    expect(m.cells.month.length).toBe(2);
    expect(m.quality.mergedDuplicates).toBe(3);
    const k = aggregate(m, all(m), true);
    expect(k.evaluations).toBe(2);
    expect(k.occurrences).toBe(1); // L1 terminou presente, L2 terminou em ruptura
    expect(k.storesAffected).toBe(1);
    expect(k.rawEvaluations).toBe(5);
  });

  it("linhas fora de ordem: vale a de maior data/hora", () => {
    const m = model([
      { id: 2, pdv: "L1", dt: "2026-06-20 08:00", res: "Não" },
      { id: 1, pdv: "L1", dt: "2026-06-01 08:00", res: "Sim" },
    ]);
    expect(m.cells.result[0]).toBe(0);
  });

  it("meses diferentes não se fundem", () => {
    const m = model([
      { id: 1, pdv: "L1", dt: "2026-06-30 08:00", res: "Sim" },
      { id: 2, pdv: "L1", dt: "2026-07-01 08:00", res: "Sim" },
    ]);
    expect(m.cells.month.length).toBe(2);
    expect(m.months).toEqual(["2026-06", "2026-07"]);
  });

  it("loja não é só o nome do PDV: mesmo nome em cidades diferentes são lojas distintas", () => {
    const m = model([
      { id: 1, pdv: "CENTRO", cidade: "Campinas", dt: "2026-06-01 08:00", res: "Sim" },
      { id: 2, pdv: "CENTRO", cidade: "Santos", dt: "2026-06-01 08:00", res: "Sim" },
    ]);
    expect(m.stores.rede.length).toBe(2);
    expect(m.quality.pdvHomonyms).toBe(1);
    expect(aggregate(m, all(m), false).storesAffected).toBe(2);
  });

  it("detecta pesquisa repetida (mesmo ID + SKU) e ID em duas lojas", () => {
    const m = model([
      { id: 9, pdv: "L1", dt: "2026-06-01 08:00", res: "Sim" },
      { id: 9, pdv: "L1", dt: "2026-06-01 08:00", res: "Sim" },
      { id: 9, sku: "SKU B", pdv: "L2", dt: "2026-06-01 08:00", res: "Sim" },
    ]);
    expect(m.quality.exactDuplicates).toBe(1);
    expect(m.quality.surveysInManyStores).toBe(1);
  });
});

describe("Teste G — reconciliação", () => {
  const rows: R[] = [];
  const cats = ["BARRA", "GOTAS", "PÓ"];
  for (let i = 0; i < 60; i++) {
    rows.push({
      id: i, pdv: `L${i % 7}`, sku: `SKU ${i % 5}`, categoria: cats[(i % 5) % 3], estado: i % 2 ? "Bahia" : "São Paulo",
      dt: `2026-0${1 + (i % 3)}-1${i % 9} 10:00`, res: i % 4 === 0 ? "Não" : "Sim",
    });
  }
  const m = model(rows);
  const total = aggregate(m, all(m), false);

  it("a soma das ocorrências por grupos exclusivos fecha com o total", () => {
    for (const dim of ["categoria", "sku", "rede", "estado", "pdv"] as const) {
      const sum = groupBy(m, all(m), dim, false).reduce((s, r) => s + r.occurrences, 0);
      expect(sum).toBe(total.occurrences);
    }
  });

  it("a série mensal soma o total do período", () => {
    const series = monthlySeries(m, {}, { from: 0, to: m.months.length - 1 });
    expect(series.reduce((s, p) => s + p.occurrences, 0)).toBe(total.occurrences);
  });

  it("Pareto: participação acumulada termina em 100%", () => {
    const rows2 = groupBy(m, all(m), "sku", false);
    expect(rows2[rows2.length - 1].cumShare).toBeCloseTo(1);
    expect(paretoCount(rows2, 1)).toBe(rows2.length);
  });

  it("filtro restringe e as opções em cascata respeitam os outros filtros", () => {
    const ba = aggregate(m, compileFilter(m, { estado: ["Bahia"] }, null), false);
    const sp = aggregate(m, compileFilter(m, { estado: ["São Paulo"] }, null), false);
    expect(ba.occurrences + sp.occurrences).toBe(total.occurrences);
    const opts = filterOptions(m, { categoria: ["BARRA"] }, null, "sku");
    const skusInBarra = new Set(rows.filter((r) => r.categoria === "BARRA").map((r) => r.sku));
    expect(new Set(opts)).toEqual(skusInBarra);
  });
});

describe("evolução e comparação", () => {
  it("lojas constantes só contam lojas presentes em todos os meses", () => {
    const m = model([
      { id: 1, pdv: "L1", dt: "2026-01-05 10:00", res: "Sim" },
      { id: 2, pdv: "L1", dt: "2026-02-05 10:00", res: "Sim" },
      { id: 3, pdv: "L2", dt: "2026-02-05 10:00", res: "Sim" },
    ]);
    const free = monthlySeries(m, {}, { from: 0, to: 1 });
    const fixed = monthlySeries(m, {}, { from: 0, to: 1 }, { constantStores: true });
    expect(free.map((p) => p.storesAffected)).toEqual([1, 2]);
    expect(fixed.map((p) => p.storesAffected)).toEqual([1, 1]);
    expect(free[1].coverageShift).toBe(true);
  });

  it("período anterior de mesmo tamanho", () => {
    expect(previousPeriod({ from: 6, to: 8 })).toEqual({ from: 3, to: 5 });
    expect(previousPeriod({ from: 1, to: 2 })).toBeNull();
  });
});
