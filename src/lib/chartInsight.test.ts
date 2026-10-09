import { describe, expect, it } from "vitest";
import { buildChartInsight, formatInsightValue, INSIGHT_EMPTY } from "./chartInsight";

const months = (labels: string[]) => labels.map((label, i) => ({ key: String(i), label }));
// Intl separa "R$" do número com espaço sem quebra.
const strip = (s: string) => s.replace(/\*\*/g, "").replace(/ /g, " ");

describe("resumo de série no tempo", () => {
  it("valor do mês, variação vs mês anterior e vs mesmo mês do ano anterior", () => {
    const labels = ["Ago/25", "Set/25", "Out/25", "Nov/25", "Dez/25", "Jan/26", "Fev/26", "Mar/26", "Abr/26", "Mai/26", "Jun/26", "Jul/26", "Ago/26"];
    const values = [7.8e6, 8e6, 8e6, 8e6, 8e6, 8e6, 8e6, 8e6, 8e6, 8e6, 8e6, 8e6, 8.4e6];
    const text = buildChartInsight(
      { kind: "series", periodos: months(labels), series: [{ name: "Total", values }], isTime: true },
      { measure: "rol" },
    );
    expect(strip(text)).toContain("Em ago/26, o ROL foi de R$ 8,4 mi, +5,0% sobre jul/26 e +7,7% sobre ago/25.");
    expect(strip(text)).toContain("É o maior valor dos últimos 13 meses.");
  });

  it("com quebra por dimensão, aponta quem puxou o movimento", () => {
    const text = buildChartInsight({
      kind: "series",
      periodos: months(["Jun/26", "Jul/26"]),
      series: [
        { name: "Marca A", values: [100e3, 400e3] },
        { name: "Marca B", values: [500e3, 450e3] },
      ],
      isTime: true,
    }, { measure: "rol" });
    expect(strip(text)).toContain("Marca A puxou a alta (+R$ 300 mil).");
  });

  it("medida em % compara em pontos percentuais", () => {
    const text = buildChartInsight({
      kind: "series", periodos: months(["Jun/26", "Jul/26"]),
      series: [{ name: "Total", values: [0.25, 0.262] }], isTime: true,
    }, { measure: "cmPct" });
    expect(strip(text)).toBe("Em jul/26, a CM % foi de 26,2%, +1,2 p.p. sobre jun/26.");
  });

  it("medida não aditiva com quebra não soma séries", () => {
    const text = buildChartInsight({
      kind: "series", periodos: months(["Jun/26", "Jul/26"]),
      series: [{ name: "A", values: [0.3, 0.31] }, { name: "B", values: [0.1, 0.12] }], isTime: true,
    }, { measure: "cmPct" });
    expect(strip(text)).toBe("Em jul/26, a CM % foi maior em A (31,0%) e menor em B (12,0%).");
  });

  it("sequência de quedas", () => {
    const text = buildChartInsight({
      kind: "series", periodos: months(["Abr/26", "Mai/26", "Jun/26", "Jul/26", "Ago/26"]),
      series: [{ name: "Total", values: [5e6, 9e6, 8e6, 7e6, 6e6] }], isTime: true,
    }, { measure: "rol" });
    expect(strip(text)).toContain("3ª queda seguida.");
  });

  it("sem dados", () => {
    expect(buildChartInsight({ kind: "series", periodos: [], series: [], isTime: true }, { measure: "rol" })).toBe(INSIGHT_EMPTY);
    expect(buildChartInsight({
      kind: "series", periodos: months(["Jul/26"]), series: [{ name: "Total", values: [0] }], isTime: true,
    }, { measure: "rol" })).toBe(INSIGHT_EMPTY);
  });
});

describe("resumo por categoria e ranking", () => {
  it("líder, participação e concentração", () => {
    const items = [40, 20, 10, 8, 6, 5, 4, 3, 2, 2].map((v, i) => ({ name: `Item ${i + 1}`, value: v * 1e6 }));
    const text = strip(buildChartInsight({ kind: "ranking", items }, { measure: "rol" }));
    expect(text).toContain("Item 1 lidera com R$ 40,0 mi (40% do total).");
    expect(text).toContain("Os 3 primeiros somam 70%.");
    expect(text).toContain("5 de 10 itens fazem 80% do total.");
  });

  it("eixo de categorias soma as séries quando a medida é aditiva", () => {
    const text = strip(buildChartInsight({
      kind: "series", periodos: months(["Varejo", "Atacado"]),
      series: [{ name: "2025", values: [10e6, 30e6] }, { name: "2026", values: [10e6, 30e6] }], isTime: false,
    }, { measure: "rol" }));
    expect(text).toBe("Atacado lidera com R$ 60,0 mi (75% do total). Em seguida vem Varejo, com 25%.");
  });

  it("ranking de medida não aditiva fala de maior e menor", () => {
    const text = strip(buildChartInsight({
      kind: "ranking", items: [{ name: "A", value: 12.5 }, { name: "B", value: 18.25 }],
    }, { measure: "precoMedio" }));
    expect(text).toBe("B tem o maior valor (R$ 18,25/kg) e A, o menor (R$ 12,50/kg).");
  });
});

describe("formatos", () => {
  it("volume em toneladas e tabela livre sem unidade", () => {
    expect(formatInsightValue(1_234_000, "volume")).toBe("1.234 t");
    expect(formatInsightValue(12.34, null)).toBe("12,3");
  });
});
