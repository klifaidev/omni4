import { applyFilters } from "./analytics";
import type { Filters, PricingRow } from "./types";

export interface AiSourceSummary {
  key: string;
  label: string;
  rowCount: number;
  periods: string[];
  totals: AiTotals;
  latest?: AiPeriodSummary;
  previous?: AiPeriodSummary;
  deltaLatest?: AiDeltaSummary;
}

export interface AiTotals {
  rol: number;
  volumeKg: number;
  contribMarginal: number;
  cmPct: number;
  precoMedio: number;
  skus: number;
  clientes: number;
}

export interface AiPeriodSummary extends AiTotals {
  periodo: string;
  label: string;
}

export interface AiDeltaSummary {
  rol: number;
  volumeKg: number;
  contribMarginal: number;
  cmPct: number;
  precoMedio: number;
}

export interface AiRankItem {
  name: string;
  rol: number;
  volumeKg: number;
  contribMarginal: number;
  cmPct: number;
  precoMedio: number;
}

export interface OmniAiContext {
  generatedAt: string;
  activeFilters: Record<string, string[]>;
  selectedPeriods: string[] | null;
  sources: AiSourceSummary[];
  realHighlights: {
    bestSkus: AiRankItem[];
    riskSkus: AiRankItem[];
    categories: AiRankItem[];
    channels: AiRankItem[];
  };
}

export interface OllamaResult {
  ok: boolean;
  text: string;
  model: string;
  elapsedMs: number;
  mode: "llm" | "local";
  error?: string;
}

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function periodRank(periodo: string): number {
  const match = String(periodo).match(/^0*(\d{1,2})[.\/-](\d{4})$/);
  if (!match) return -Infinity;
  return Number(match[2]) * 12 + Number(match[1]);
}

function periodLabel(row: Pick<PricingRow, "mes" | "ano"> | undefined, periodo: string) {
  if (!row) return periodo;
  return `${MONTHS[row.mes - 1] ?? String(row.mes)}/${String(row.ano).slice(-2)}`;
}

function totals(rows: PricingRow[]): AiTotals {
  let rol = 0;
  let volumeKg = 0;
  let contribMarginal = 0;
  const skus = new Set<string>();
  const clientes = new Set<string>();

  for (const row of rows) {
    rol += row.rol || 0;
    volumeKg += row.volumeKg || 0;
    contribMarginal += row.contribMarginal || 0;
    if (row.sku) skus.add(row.sku);
    if (row.cliente) clientes.add(row.cliente);
  }

  return {
    rol,
    volumeKg,
    contribMarginal,
    cmPct: rol ? contribMarginal / rol : 0,
    precoMedio: volumeKg ? rol / volumeKg : 0,
    skus: skus.size,
    clientes: clientes.size,
  };
}

function summarizePeriod(periodo: string, rows: PricingRow[]): AiPeriodSummary {
  const first = rows[0];
  return {
    periodo,
    label: periodLabel(first, periodo),
    ...totals(rows),
  };
}

function delta(current?: AiPeriodSummary, previous?: AiPeriodSummary): AiDeltaSummary | undefined {
  if (!current || !previous) return undefined;
  return {
    rol: current.rol - previous.rol,
    volumeKg: current.volumeKg - previous.volumeKg,
    contribMarginal: current.contribMarginal - previous.contribMarginal,
    cmPct: current.cmPct - previous.cmPct,
    precoMedio: current.precoMedio - previous.precoMedio,
  };
}

function sourceSummary(key: string, label: string, rows: PricingRow[], filters: Filters, selectedPeriods: string[] | null): AiSourceSummary {
  const filtered = applyFilters(rows, filters, selectedPeriods);
  const periodMap = new Map<string, PricingRow[]>();
  for (const row of filtered) {
    const list = periodMap.get(row.periodo) ?? [];
    list.push(row);
    periodMap.set(row.periodo, list);
  }
  const periods = Array.from(periodMap.keys()).sort((a, b) => periodRank(a) - periodRank(b));
  const latestPeriod = periods.at(-1);
  const previousPeriod = periods.at(-2);
  const latest = latestPeriod ? summarizePeriod(latestPeriod, periodMap.get(latestPeriod) ?? []) : undefined;
  const previous = previousPeriod ? summarizePeriod(previousPeriod, periodMap.get(previousPeriod) ?? []) : undefined;

  return {
    key,
    label,
    rowCount: filtered.length,
    periods,
    totals: totals(filtered),
    latest,
    previous,
    deltaLatest: delta(latest, previous),
  };
}

function rankBy(rows: PricingRow[], key: keyof PricingRow, limit = 6): AiRankItem[] {
  const map = new Map<string, PricingRow[]>();
  for (const row of rows) {
    const value = row[key];
    if (!value || typeof value !== "string") continue;
    const list = map.get(value) ?? [];
    list.push(row);
    map.set(value, list);
  }
  return Array.from(map.entries())
    .map(([name, list]) => ({ name, ...totals(list) }))
    .filter((item) => item.rol !== 0 || item.volumeKg !== 0 || item.contribMarginal !== 0)
    .sort((a, b) => b.contribMarginal - a.contribMarginal)
    .slice(0, limit);
}

function riskRankBy(rows: PricingRow[], key: keyof PricingRow, limit = 6): AiRankItem[] {
  const map = new Map<string, PricingRow[]>();
  for (const row of rows) {
    const value = row[key];
    if (!value || typeof value !== "string") continue;
    const list = map.get(value) ?? [];
    list.push(row);
    map.set(value, list);
  }
  return Array.from(map.entries())
    .map(([name, list]) => ({ name, ...totals(list) }))
    .filter((item) => item.rol !== 0 || item.volumeKg !== 0 || item.contribMarginal !== 0)
    .sort((a, b) => a.cmPct - b.cmPct || a.contribMarginal - b.contribMarginal)
    .slice(0, limit);
}

export function buildOmniAiContext(input: {
  realRows: PricingRow[];
  budgetRows: PricingRow[];
  forecastRows: PricingRow[];
  rollingRows: PricingRow[];
  filters: Filters;
  selectedPeriods: string[] | null;
}): OmniAiContext {
  const filteredReal = applyFilters(input.realRows, input.filters, input.selectedPeriods);
  return {
    generatedAt: new Date().toISOString(),
    activeFilters: Object.fromEntries(Object.entries(input.filters).filter(([, values]) => values && values.length)),
    selectedPeriods: input.selectedPeriods,
    sources: [
      sourceSummary("real", "Real", input.realRows, input.filters, input.selectedPeriods),
      sourceSummary("budget", "Budget", input.budgetRows, input.filters, input.selectedPeriods),
      sourceSummary("forecast", "Forecast", input.forecastRows, input.filters, input.selectedPeriods),
      sourceSummary("rolling", "Rolling", input.rollingRows, input.filters, input.selectedPeriods),
    ].filter((source) => source.rowCount > 0),
    realHighlights: {
      bestSkus: rankBy(filteredReal, "skuDesc", 5),
      riskSkus: riskRankBy(filteredReal, "skuDesc", 5),
      categories: rankBy(filteredReal, "categoria", 6),
      channels: rankBy(filteredReal, "canalAjustado", 6),
    },
  };
}

function compactNumber(value: number, digits = 1) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits }).format(value);
}

function money(value: number, digits = 0) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: digits }).format(value);
}

function pct(value: number, digits = 1) {
  return `${compactNumber(value * 100, digits)}%`;
}

export function buildLocalExecutiveReading(context: OmniAiContext, question: string): string {
  const real = context.sources.find((source) => source.key === "real");
  const rolling = context.sources.find((source) => source.key === "rolling");
  const budget = context.sources.find((source) => source.key === "budget");

  if (!real) {
    return [
      "Ainda nao ha base Real filtrada para uma leitura completa.",
      "Carregue ou ajuste os filtros para que a analise consiga comparar volume, receita, margem e mix.",
    ].join("\n\n");
  }

  const lines: string[] = [];
  lines.push(`Leitura executiva para: ${question || "diagnostico geral"}.`);
  lines.push(
    `No Real, a base filtrada soma ${money(real.totals.rol)} de receita, ${compactNumber(real.totals.volumeKg / 1000, 1)} tons e ${pct(real.totals.cmPct)} de contribuicao marginal.`,
  );

  if (real.latest && real.previous && real.deltaLatest) {
    const d = real.deltaLatest;
    lines.push(
      `Na passagem de ${real.previous.label} para ${real.latest.label}, a receita variou ${money(d.rol)}, o volume ${compactNumber(d.volumeKg / 1000, 1)} tons e a margem mudou ${pct(d.cmPct)} p.p.`,
    );
  }

  if (budget?.totals.volumeKg) {
    const gap = real.totals.contribMarginal - budget.totals.contribMarginal;
    lines.push(`Contra Budget, o gap de contribuicao marginal da selecao atual e ${money(gap)}.`);
  }

  if (rolling?.totals.volumeKg) {
    const gap = real.totals.contribMarginal - rolling.totals.contribMarginal;
    lines.push(`Contra Rolling, o gap de contribuicao marginal da selecao atual e ${money(gap)}.`);
  }

  const risk = context.realHighlights.riskSkus[0];
  if (risk) {
    lines.push(
      `Principal ponto de atencao: ${risk.name}, com ${pct(risk.cmPct)} de margem e ${money(risk.contribMarginal)} de contribuicao marginal.`,
    );
  }

  const hero = context.realHighlights.bestSkus[0];
  if (hero) {
    lines.push(
      `Principal alavanca positiva: ${hero.name}, com ${money(hero.contribMarginal)} de contribuicao marginal e ${compactNumber(hero.volumeKg / 1000, 1)} tons.`,
    );
  }

  lines.push("Recomendacao: priorizar a leitura dos ofensores de margem, validar se o gap vem de preco, mix ou volume, e transformar os 3 maiores efeitos em highlights para o slide executivo.");
  return lines.join("\n\n");
}

export function buildOllamaPrompt(context: OmniAiContext, question: string) {
  const compactContext = JSON.stringify(context, null, 2).slice(0, 22000);
  return [
    "Voce e o analista executivo do OMNI4, um app de pricing, DRE, margem, budget, forecast, rolling, estoque e slides.",
    "Use apenas os dados estruturados enviados. Nao invente numeros.",
    "Responda em portugues do Brasil, com tom executivo, direto e orientado a decisao.",
    "Quando citar numeros, explique se sao Real, Budget, Forecast ou Rolling.",
    "Formato desejado: diagnostico, riscos, oportunidades e proximas acoes.",
    "",
    `Pergunta do usuario: ${question || "Faca uma leitura executiva dos dados atuais."}`,
    "",
    "Contexto estruturado:",
    compactContext,
  ].join("\n");
}

export async function askOllamaLocal(input: {
  model: string;
  prompt: string;
  timeoutMs?: number;
}): Promise<OllamaResult> {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), input.timeoutMs ?? 45000);
  try {
    const response = await fetch("http://127.0.0.1:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: input.model,
        prompt: input.prompt,
        stream: false,
        options: {
          temperature: 0.2,
          num_ctx: 8192,
        },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Ollama respondeu ${response.status}`);
    }
    const data = (await response.json()) as { response?: string; error?: string };
    if (data.error) throw new Error(data.error);
    return {
      ok: true,
      text: data.response?.trim() || "A IA local nao retornou texto.",
      model: input.model,
      elapsedMs: Math.round(performance.now() - started),
      mode: "llm",
    };
  } catch (error) {
    return {
      ok: false,
      text: "",
      model: input.model,
      elapsedMs: Math.round(performance.now() - started),
      mode: "local",
      error: error instanceof Error ? error.message : "Falha ao chamar IA local.",
    };
  } finally {
    window.clearTimeout(timeout);
  }
}
