// Equivalência das otimizações de desempenho (outubro/2026): cada cálculo
// otimizado comparado com a versão de referência — a lógica de antes, copiada
// aqui — sobre dados de demonstração. Mudou um número? O teste quebra.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateDemoData } from "./demoData";
import { clearDerivedCaches } from "./derivedCache";
import { calcPVM, computeCanalTrend, computePriceDecomposition, measureOf, presentPeriodsOf, rowsWhere, uniqueValues } from "./analytics";
import { computeAvailableOptionsPerDimension } from "./filterOptions";
import { getComercialDeParaVersion, getUfFromRegiao, normComercialKey, removeComercialOverride, upsertComercialOverrides } from "./deparaComercial";
import { getDeParaBySku, hasDeParaSku } from "./depara";
import { slideDataSignature } from "./slideCalcCache";
import { budgetRowsAsPricing } from "./budgetAdapter";
import { aggregate, aggregateByPeriod } from "@/components/pricing/DreTable";
import { categoryRankingItems } from "@/components/pricing/tabVisuals/bridgeData";
import { getRowUf } from "@/components/pricing/tabVisuals/ufMapData";
import type { CanalTrendPoint } from "./analytics";
import type { Metric, PricingRow } from "./types";

const demo = generateDemoData({ monthsBack: 14, rowsPerMonth: 400 });
const rows = demo.realRows;

beforeEach(() => clearDerivedCaches());

// ── referências (lógica anterior) ───────────────────────────────────────
function canalTrendReference(rs: PricingRow[], canal: string | null, metric: Metric): CanalTrendPoint[] {
  const map = new Map<string, CanalTrendPoint>();
  for (const r of rs) {
    const c = r.canalAjustado || "Sem canal";
    if (canal != null && c !== canal) continue;
    const cur = map.get(r.periodo) ?? {
      periodo: r.periodo, label: `${String(r.mes).padStart(2, "0")}/${String(r.ano).slice(-2)}`,
      ano: r.ano, mes: r.mes, rol: 0, margem: 0, margemPct: 0, volumeKg: 0,
    };
    cur.rol += r.rol;
    cur.margem += measureOf(r, metric);
    cur.volumeKg += r.volumeKg;
    map.set(r.periodo, cur);
  }
  return Array.from(map.values())
    .map((p) => ({ ...p, margemPct: p.rol > 0 ? p.margem / p.rol : 0 }))
    .sort((a, b) => a.ano - b.ano || a.mes - b.mes);
}

function uniqueValuesReference(rs: PricingRow[], key: keyof PricingRow): string[] {
  const set = new Set<string>();
  for (const r of rs) {
    const v = r[key];
    if (typeof v === "string" && v) set.add(v);
  }
  return Array.from(set).sort();
}

describe("séries por canal (um índice por base, em vez de uma varredura por canal)", () => {
  it("cada canal, o total e um canal inexistente dão exatamente o mesmo de antes", () => {
    const canais = Array.from(new Set(rows.map((r) => r.canalAjustado || "Sem canal")));
    for (const metric of ["cm", "mb"] as Metric[]) {
      for (const c of [...canais, null, "Canal que não existe"]) {
        expect(computeCanalTrend(rows, c, metric)).toEqual(canalTrendReference(rows, c, metric));
      }
    }
  });

  it("devolve um array novo a cada chamada (quem fizer slice/sort não afeta os outros)", () => {
    const a = computeCanalTrend(rows, null, "cm");
    const b = computeCanalTrend(rows, null, "cm");
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe("valores distintos de um campo", () => {
  it("iguais ao cálculo direto, para vários campos", () => {
    for (const key of ["canal", "marca", "sku", "categoria", "uf", "regional"] as (keyof PricingRow)[]) {
      expect(uniqueValues(rows, key)).toEqual(uniqueValuesReference(rows, key));
    }
  });
});

describe("DRE mensal (agregado por mês numa varredura só)", () => {
  it("cada mês: exatamente a soma de aggregate() sobre as linhas do mês", () => {
    const byPeriod = aggregateByPeriod(rows);
    const periods = new Set(rows.map((r) => r.periodo));
    expect(byPeriod.size).toBe(periods.size);
    for (const p of periods) {
      expect(byPeriod.get(p)).toEqual(aggregate(rows.filter((r) => r.periodo === p)));
    }
  });
});

describe("opções de filtro (memorizadas pelo conteúdo dos filtros)", () => {
  it("mesmo resultado para filtros iguais em objetos diferentes, e diferente quando o filtro muda", () => {
    const canal = rows[0].canal!;
    const a = computeAvailableOptionsPerDimension(rows, { canal: [canal] }, null, ["canal", "marca"]);
    const b = computeAvailableOptionsPerDimension(rows, { canal: [canal] }, null, ["canal", "marca"]);
    expect(b).toBe(a);
    clearDerivedCaches();
    expect(computeAvailableOptionsPerDimension(rows, { canal: [canal] }, null, ["canal", "marca"])).toEqual(a);
    const other = computeAvailableOptionsPerDimension(rows, {}, null, ["canal", "marca"]);
    expect(other.matchingRows.length).toBe(rows.length);
    expect(a.matchingRows.every((r) => r.canal === canal)).toBe(true);
  });
});

describe("ranking por categoria da Bridge (categoria do SKU numa varredura só)", () => {
  it("prioriza a categoria vista no período de comparação, depois na base, depois em qualquer mês", () => {
    const mk = (sku: string, periodo: string, categoria: string) =>
      ({ sku, periodo, fy: "FY", categoria, mes: 1, ano: 2026 }) as unknown as PricingRow;
    const rs = [
      mk("A", "001", "Velha"), mk("A", "003", "DaBase"), mk("A", "004", "DoComp"),
      mk("B", "001", "SóAntiga"),
      mk("C", "003", "BaseC"), mk("C", "001", "AntigaC"),
    ];
    const details = ["A", "B", "C"].map((sku) => ({ sku, volumeEffect: 1, priceEffect: 0, costEffect: 0, othersEffect: 0 }));
    const items = categoryRankingItems(details as never, rs, "003", "004", "month");
    expect(items.map((i) => i.name).sort()).toEqual(["BaseC", "DoComp", "SóAntiga"]);
  });
});

describe("De/Para: checagem sem alocar e normalização memorizada", () => {
  it("hasDeParaSku segue exatamente getDeParaBySku", () => {
    const skus = [...new Set(rows.map((r) => r.sku))].slice(0, 200);
    for (const sku of [...skus, "", "  ", "nao-existe-123", undefined, null]) {
      expect(hasDeParaSku(sku as string)).toBe(getDeParaBySku(sku as string) !== null);
    }
  });

  it("normComercialKey: mesma chave na primeira e nas próximas vezes", () => {
    const samples = ["  São  Paulo ", "VAREJO", "Atacado Distribuidor", "Ação", ""];
    const first = samples.map((s) => normComercialKey(s));
    expect(first).toEqual(["sao paulo", "varejo", "atacado distribuidor", "acao", ""]);
    expect(samples.map((s) => normComercialKey(s))).toEqual(first);
  });
});

describe("UF por linha (memorizada) acompanha correções do De/Para Comercial", () => {
  const regiao = "Região Teste Perf 999";
  afterEach(() => removeComercialOverride("regiaoToUf", regiao));

  it("depois de corrigir a região, a UF muda sem reabrir o app", () => {
    expect(getUfFromRegiao(regiao)).toBeNull();
    expect(getRowUf({ regiao })).toBeNull();
    const before = getComercialDeParaVersion();
    upsertComercialOverrides("regiaoToUf", { [regiao]: "PR" });
    expect(getComercialDeParaVersion()).toBeGreaterThan(before);
    expect(getRowUf({ regiao })).toBe("PR");
  });
});

describe("Bridge e decomposição de preço memorizadas", () => {
  const periods = Array.from(presentPeriodsOf(rows)).sort((a, b) => {
    const [ma, ya] = a.split(".").map(Number);
    const [mb, yb] = b.split(".").map(Number);
    return ya - yb || ma - mb;
  });
  const [base, comp] = periods.slice(-2);

  it("mesma Bridge na 2ª chamada, e igual ao cálculo do zero", () => {
    const a = calcPVM(rows, "cm", base, comp, "month");
    expect(calcPVM(rows, "cm", base, comp, "month")).toBe(a);
    clearDerivedCaches();
    expect(calcPVM(rows, "cm", base, comp, "month")).toEqual(a);
  });

  it("rótulos entram na chave pelo conteúdo e continuam saindo no resultado", () => {
    const semRotulo = calcPVM(rows, "cm", base, comp, "month");
    expect(semRotulo.baseLabel).toBe(base);
    const comRotulo = calcPVM(rows, "cm", base, comp, "month", { base: "Ago/26", comp: "Set/26" });
    expect(comRotulo).not.toBe(semRotulo);
    expect([comRotulo.baseLabel, comRotulo.currentLabel]).toEqual(["Ago/26", "Set/26"]);
    expect(calcPVM(rows, "cm", base, comp, "month", { base: "Ago/26", comp: "Set/26" })).toBe(comRotulo);
    expect(comRotulo.volume).toBe(semRotulo.volume);
  });

  it("decomposição de preço: rótulos e memória", () => {
    const a = computePriceDecomposition(rows, base, comp, "month", { base: "B", comp: "C" })!;
    expect(computePriceDecomposition(rows, base, comp, "month", { base: "B", comp: "C" })).toBe(a);
    clearDerivedCaches();
    expect(computePriceDecomposition(rows, base, comp, "month", { base: "B", comp: "C" })).toEqual(a);
    expect(computePriceDecomposition(rows, base, base, "month")).toBeNull();
  });

  it("subconjunto por campo e meses presentes", () => {
    expect(rowsWhere(rows, "periodo", comp)).toEqual(rows.filter((r) => r.periodo === comp));
    expect(rowsWhere(rows, "periodo", comp)).toBe(rowsWhere(rows, "periodo", comp));
    expect(rowsWhere(rows, "fy", null)).toEqual([]);
    expect(presentPeriodsOf(rows)).toEqual(new Set(rows.map((r) => r.periodo)));
  });
});

describe("assinatura dos dados dos Slides (mesmo valor, sem textos por linha)", () => {
  // Implementação anterior, copiada como referência.
  function hashStringRef(value: string): string {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }
  function signatureRef(rs: readonly unknown[]): string {
    let hash = 2166136261;
    for (let i = 0; i < rs.length; i += 1) {
      const row = rs[i] as Record<string, unknown> | undefined;
      if (!row) continue;
      const sample = [row.periodo, row.fy, row.sku, row.skuDesc, row.canal, row.canalAjustado, row.volumeKg, row.rol, row.margemBruta, row.contribMarginal].join(":");
      hash ^= hashStringRef(sample).split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
      hash = Math.imul(hash, 16777619);
    }
    return `${rs.length}:${(hash >>> 0).toString(36)}`;
  }

  it("igual à anterior em Real, Budget e casos de borda", () => {
    expect(slideDataSignature(rows)).toBe(signatureRef(rows));
    const budget = budgetRowsAsPricing(demo.budgetRows);
    expect(slideDataSignature(budget)).toBe(signatureRef(budget));
    const edge = [
      {}, null, undefined, { periodo: "001.2026", rol: 0, volumeKg: -0, sku: "", skuDesc: "Açúcar ç ã" },
      { rol: Number.NaN, margemBruta: 1e21, contribMarginal: -1.5e-7, canal: null, fy: undefined },
    ];
    expect(slideDataSignature(edge)).toBe(signatureRef(edge));
    expect(slideDataSignature([])).toBe(signatureRef([]));
  });
});
