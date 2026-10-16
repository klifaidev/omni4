import { describe, expect, it } from "vitest";
import type { PricingRow } from "./types";
import type { BudgetRow } from "./budget";
import { computeTokenValues, findTokenQuery, findUnknownTokens, formatBRLShort, hasTextTokens, insertToken, matchTokens, periodTokenValue, resolveTextTokens } from "./textTokens";

const real = (mes: number, ano: number, rol: number, cm = rol / 4, volumeKg = 1000): PricingRow =>
  ({ mes, ano, periodo: `${String(mes).padStart(3, "0")}.${ano}`, rol, contribMarginal: cm, volumeKg } as unknown as PricingRow);
const plan = (mes: number, ano: number, receita: number, kind: "budget" | "real" = "budget"): BudgetRow =>
  ({ mes, ano, periodo: `${String(mes).padStart(3, "0")}.${ano}`, kind, receita, volumeKg: 0, cm: 0, cpv: 0 } as unknown as BudgetRow);

describe("textTokens", () => {
  const pricing = [real(8, 2025, 7_800_000), real(7, 2026, 8_000_000), real(8, 2026, 8_400_000, 2_100_000, 1_234_000)];
  // Real da base de Budget (8,4 mi) é o que entra no "vs budget" — como no Budget Evolutivo.
  const budget = [plan(8, 2026, 8_150_000), plan(8, 2026, 8_400_000, "real"), plan(9, 2026, 9_000_000)];

  it("resolve datas e números do mês mais recente da base", () => {
    const values = computeTokenValues(pricing, budget, null);
    const text = "Em {mês}, o ROL foi {ROL do mês} ({ROL vs budget %} vs budget). Antes: {mês anterior}, {ano}.";
    expect(resolveTextTokens(text, values)).toBe(
      "Em agosto/2026, o ROL foi R$ 8,4 mi (+3,1% vs budget). Antes: julho/2026, 2026.",
    );
    expect(resolveTextTokens("{CM do mês} | {CM % do mês} | {Volume do mês}", values)).toBe("R$ 2,1 mi | 25,0% | 1.234 t");
    expect(resolveTextTokens("{ROL vs mês anterior %} / {ROL vs ano anterior %}", values)).toBe("+5,0% / +7,7%");
  });

  it("vs budget usa o Real da base de Budget, não a base de preços", () => {
    const values = computeTokenValues(pricing, [plan(8, 2026, 8_000_000), plan(8, 2026, 7_600_000, "real")], null);
    expect(resolveTextTokens("{ROL vs budget %}", values)).toBe("-5,0%");
    const noReal = computeTokenValues(pricing, [plan(8, 2026, 8_000_000)], null);
    expect(resolveTextTokens("{ROL vs budget %}", noReal)).toBe("—");
  });

  it("aceita o nome sem acento e com outra caixa", () => {
    const values = computeTokenValues(pricing, budget, null);
    expect(resolveTextTokens("Em {MES}: {rol do mes}", values)).toBe("Em agosto/2026: R$ 8,4 mi");
  });

  it("sem base, mas com mês de referência: datas pelo mês de referência, números viram —", () => {
    const values = computeTokenValues([], [], "003.2026");
    expect(resolveTextTokens("de {mês} a {mês anterior} {ROL do mês}", values)).toBe("de março/2026 a fevereiro/2026 —");
  });

  it("nome desconhecido fica como digitado e é apontado", () => {
    const values = computeTokenValues(pricing, budget, null);
    expect(resolveTextTokens("{receita} de {mês}", values)).toBe("{receita} de agosto/2026");
    expect(findUnknownTokens("{receita} de {mês}")).toEqual(["{receita}"]);
    expect(hasTextTokens("{receita}")).toBe(false);
    expect(hasTextTokens("Em {Mês}")).toBe(true);
  });

  it("valor curto em reais", () => {
    expect(formatBRLShort(8_412_000)).toBe("R$ 8,4 mi");
    expect(formatBRLShort(840_000)).toBe("R$ 840 mil");
    expect(formatBRLShort(-1_500_000_000)).toBe("-R$ 1,5 bi");
  });
});

describe("textTokens — catálogo ampliado", () => {
  const months: PricingRow[] = [];
  // FY25/26 (abr/25–mar/26) e FY26/27 até agosto/26, ROL 1 mi/mês no ano anterior e 1,1 mi agora.
  for (let m = 4; m <= 12; m++) months.push(real(m, 2025, 1_000_000, 250_000, 10_000));
  for (let m = 1; m <= 3; m++) months.push(real(m, 2026, 1_000_000, 250_000, 10_000));
  for (let m = 4; m <= 8; m++) months.push(real(m, 2026, 1_100_000, m === 8 ? 300_000 : 250_000, m === 8 ? 12_000 : 10_000));
  const values = computeTokenValues(months, [plan(8, 2026, 1_000_000)], null, new Date(2026, 9, 15));
  const r = (t: string) => resolveTextTokens(t, values);

  it("datas", () => {
    expect(r("x {mês curto} {mesmo mês ano anterior} {trimestre} {ano fiscal} {hoje}"))
      .toBe("x ago/26 agosto/2025 3º tri/2026 FY26/27 15/10/2026");
  });

  it("variações e acumulado do ano fiscal", () => {
    expect(r("x {Volume vs mês anterior %} {Volume vs ano anterior %} {CM % vs mês anterior}")).toBe("x +20,0% +20,0% +4,5 p.p.");
    // abr–ago/26: 5 × 1,1 mi = 5,5 mi; mesmos meses de 2025: 5 mi → +10%.
    expect(r("x {ROL acumulado no ano fiscal} {ROL acumulado vs ano anterior %} {ROL budget do mês}")).toBe("x R$ 5,5 mi +10,0% R$ 1,0 mi");
  });

  it("acumulado sem o ano anterior completo não inventa comparação", () => {
    const partial = computeTokenValues(months.slice(9), [], null);
    expect(resolveTextTokens("x {ROL acumulado vs ano anterior %}", partial)).toBe("x —");
  });

  it("valor no começo da frase ganha maiúscula; no meio, não", () => {
    expect(r("{mês} fechou bem. {mês anterior} também.")).toBe("Agosto/2026 fechou bem. Julho/2026 também.");
    expect(r("**{mês}** em destaque")).toBe("**Agosto/2026** em destaque");
    expect(r("Resultado de {mês}")).toBe("Resultado de agosto/2026");
  });

  it("base em toneladas: Volume do mês sai em toneladas de verdade", () => {
    const tons = Array.from({ length: 60 }, (_, i) => real(8, 2026, 100, 25, 0.05 + (i % 3) * 0.01));
    const v = computeTokenValues(tons, [], null);
    // 60 linhas × ~0,06 t = 3,6 t (antes saía "0 t")
    expect(resolveTextTokens("x {Volume do mês}", v)).toBe("x 3,60 t");
  });
});

describe("textTokens — autocompletar e período do bloco", () => {
  it("acha a busca em andamento depois da {", () => {
    expect(findTokenQuery("Volume de {mês a", 16)).toEqual({ start: 10, query: "mês a" });
    expect(findTokenQuery("Volume de {mês}", 15)).toBeNull();
    expect(findTokenQuery("sem chave", 9)).toBeNull();
  });

  it("ordena: início do nome primeiro, depois início de palavra", () => {
    const names = matchTokens("ant").map((t) => t.label);
    expect(names[0]).toBe("mês anterior");
    expect(matchTokens("vol").map((t) => t.label).slice(0, 2)).toEqual(["Volume do mês", "Volume vs mês anterior %"]);
    expect(matchTokens("zzz")).toEqual([]);
    // Sinônimos: quem procura "variação" acha os "vs"; "receita" acha ROL; "meta" acha budget.
    expect(matchTokens("variação").every((t) => t.group === "change")).toBe(true);
    expect(matchTokens("variação").length).toBeGreaterThan(3);
    expect(matchTokens("receita")[0].label).toMatch(/ROL/);
    expect(matchTokens("meta").map((t) => t.label)).toContain("ROL budget do mês");
    expect(matchTokens("tri").map((t) => t.label)).toEqual(["trimestre"]);
  });

  it("insere o token no lugar da busca e posiciona o cursor depois dele", () => {
    const q = findTokenQuery("Em {me", 6)!;
    expect(insertToken("Em {me", q, 6, { label: "mês" })).toEqual({ text: "Em {mês}", caret: 8 });
    expect(insertToken("Em ", null, 3, { label: "ano" })).toEqual({ text: "Em {ano}", caret: 8 });
  });

  it("período do bloco", () => {
    expect(periodTokenValue("month", "007.2026")).toBe("julho/2026");
    expect(periodTokenValue("fy", "FY26/27")).toBe("FY26/27");
    expect(periodTokenValue("all", null)).toBe("todos os períodos");
  });
});
