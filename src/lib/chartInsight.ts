// Resumo automático de um gráfico: duas ou três frases determinísticas,
// escritas a partir dos MESMOS números que o gráfico desenha (série por
// período/categoria, ou o ranking das pizzas/funis). Sem IA e sem
// adivinhação — cada frase só aparece quando o dado sustenta a afirmação.
//
// Trechos importantes vêm em **negrito** (lib/richText), que o bloco de
// texto já sabe desenhar.

import type { KpiMeasureId } from "./customSlide";
import { formatBRL, formatNum, formatPct } from "./format";
import { formatBRLShort } from "./textTokens";

export type ChartInsightInput =
  | {
      kind: "series";
      periodos: { key: string; label: string }[];
      series: { name: string; values: number[] }[];
      /** Eixo X é tempo (meses em ordem). */
      isTime: boolean;
    }
  | { kind: "ranking"; items: { name: string; value: number }[] };

export interface ChartInsightOptions {
  /** null = tabela livre (número sem unidade conhecida). */
  measure: KpiMeasureId | null;
}

/** Somar séries/categorias só faz sentido para medidas aditivas. */
const ADDITIVE: ReadonlySet<KpiMeasureId> = new Set(["rol", "volume", "cm", "mb", "cv", "frete", "comissao"]);
const PERCENT: ReadonlySet<KpiMeasureId> = new Set(["cmPct", "mbPct"]);

const MEASURE_PROSE: Record<KpiMeasureId, string> = {
  rol: "o ROL",
  volume: "o volume",
  cm: "a contribuição marginal",
  cv: "o custo variável",
  mb: "a margem bruta",
  frete: "o frete",
  comissao: "a comissão",
  cmPct: "a CM %",
  mbPct: "a MB %",
  precoMedio: "o preço médio",
  positivacao: "a positivação",
  ticketMedio: "o ticket médio",
};

export const INSIGHT_EMPTY = "Sem dados no período do gráfico.";

const isAdditive = (m: KpiMeasureId | null) => m === null || ADDITIVE.has(m);
const isPercent = (m: KpiMeasureId | null) => m !== null && PERCENT.has(m);
const b = (s: string) => `**${s}**`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const finite = (v: number) => (Number.isFinite(v) ? v : 0);

/** Valor no formato de texto corrido (curto: R$ 8,4 mi, 1.234 t, 25,3%). */
export function formatInsightValue(v: number, measure: KpiMeasureId | null): string {
  if (!Number.isFinite(v)) return "—";
  switch (measure) {
    case "cmPct":
    case "mbPct":
      return formatPct(v, 1);
    case "volume": {
      const t = v / 1000;
      return `${formatNum(t, Math.abs(t) >= 100 ? 0 : 1)} t`;
    }
    case "precoMedio":
      return `${formatBRL(v, { digits: 2 })}/kg`;
    case "ticketMedio":
      return `${formatNum(v, 1)} kg/cliente`;
    case "positivacao":
      return `${formatNum(v, 0)} clientes`;
    case null:
      return formatNum(v, Math.abs(v) >= 100 ? 0 : 1);
    default:
      return formatBRLShort(v);
  }
}

/** Variação com sinal: % para valores, p.p. para medidas que já são %. */
function formatChange(current: number, base: number, measure: KpiMeasureId | null): string | null {
  if (isPercent(measure)) {
    const pp = (current - base) * 100;
    if (Math.abs(pp) < 0.05) return "estável (0,0 p.p.)";
    return `${pp > 0 ? "+" : "-"}${formatNum(Math.abs(pp), 1)} p.p.`;
  }
  if (base === 0 || !Number.isFinite(base)) return null;
  // Base negativa (margem negativa…) inverte o sentido da razão.
  const v = (current - base) / Math.abs(base);
  if (Math.abs(v) < 0.0005) return "estável (0,0%)";
  return `${v > 0 ? "+" : "-"}${formatPct(Math.abs(v), 1)}`;
}

/** "Ago/26" → "ago/26" para o meio da frase; outros rótulos ficam como estão. */
function periodProse(label: string): string {
  return /^[A-Z][a-zç]{2}\/\d{2}$/.test(label) ? label.toLowerCase() : label;
}

/** Rótulo do mesmo mês um ano antes ("Ago/26" → "Ago/25"). */
function yearAgoLabel(label: string): string | null {
  const m = /^(.+\/)(\d{2})$/.exec(label);
  if (!m) return null;
  const year = Number(m[2]);
  return `${m[1]}${String((year + 99) % 100).padStart(2, "0")}`;
}

function sumSeries(series: { values: number[] }[], length: number): number[] {
  const out = new Array<number>(length).fill(0);
  for (const s of series) for (let i = 0; i < length; i++) out[i] += finite(s.values[i]);
  return out;
}

function pct(v: number): string {
  return formatPct(v, 0);
}

// ---------------------------------------------------------------------------

export function buildChartInsight(input: ChartInsightInput, opts: ChartInsightOptions): string {
  if (input.kind === "ranking") return rankingInsight(input.items, opts.measure);
  const { periodos, series } = input;
  if (periodos.length === 0 || series.length === 0) return INSIGHT_EMPTY;
  const hasData = series.some((s) => s.values.some((v) => Number.isFinite(v) && v !== 0));
  if (!hasData) return INSIGHT_EMPTY;
  if (input.isTime) return timeInsight(periodos, series, opts.measure);
  return categoryInsight(periodos, series, opts.measure);
}

function timeInsight(
  periodos: { key: string; label: string }[],
  series: { name: string; values: number[] }[],
  measure: KpiMeasureId | null,
): string {
  const n = periodos.length;
  const last = n - 1;
  const what = measure ? MEASURE_PROSE[measure] : "o valor";
  const single = series.length === 1;
  const sentences: string[] = [];

  // Medida não aditiva quebrada por dimensão: não existe "total" — compara
  // as séries no último mês.
  if (!single && !isAdditive(measure)) {
    const ranked = series
      .map((s) => ({ name: s.name, v: s.values[last] }))
      .filter((s) => Number.isFinite(s.v) && s.v !== 0)
      .sort((a, z) => z.v - a.v);
    if (ranked.length === 0) return INSIGHT_EMPTY;
    const top = ranked[0];
    const bottom = ranked[ranked.length - 1];
    let s = `Em ${b(periodProse(periodos[last].label))}, ${what} foi maior em ${b(top.name)} (${b(formatInsightValue(top.v, measure))})`;
    if (ranked.length > 1) s += ` e menor em ${b(bottom.name)} (${b(formatInsightValue(bottom.v, measure))})`;
    sentences.push(`${s}.`);
    return sentences.join(" ");
  }

  const total = single ? series[0].values.map(finite) : sumSeries(series, n);
  const cur = total[last];
  let headline = `Em ${b(periodProse(periodos[last].label))}, ${what} foi de ${b(formatInsightValue(cur, measure))}`;
  const parts: string[] = [];
  if (n >= 2) {
    const ch = formatChange(cur, total[last - 1], measure);
    if (ch) parts.push(`${b(ch)} sobre ${periodProse(periodos[last - 1].label)}`);
  }
  const yaLabel = yearAgoLabel(periodos[last].label);
  const yaIdx = yaLabel ? periodos.findIndex((p) => p.label === yaLabel) : -1;
  if (yaIdx >= 0) {
    const ch = formatChange(cur, total[yaIdx], measure);
    if (ch) parts.push(`${b(ch)} sobre ${periodProse(periodos[yaIdx].label)}`);
  }
  if (parts.length) headline += `, ${parts.join(" e ")}`;
  sentences.push(`${headline}.`);

  // Quem explica o movimento (só com quebra por dimensão).
  if (!single && n >= 2) {
    const delta = cur - total[last - 1];
    const moves = series
      .map((s) => ({ name: s.name, d: finite(s.values[last]) - finite(s.values[last - 1]) }))
      .filter((m) => Math.sign(m.d) === Math.sign(delta) && m.d !== 0)
      .sort((a, z) => Math.abs(z.d) - Math.abs(a.d));
    if (delta !== 0 && moves.length > 0) {
      const top = moves[0];
      const sign = top.d > 0 ? "+" : "-";
      sentences.push(
        `${b(top.name)} puxou a ${delta > 0 ? "alta" : "queda"} (${b(`${sign}${formatInsightValue(Math.abs(top.d), measure)}`)}).`,
      );
    } else if (cur > 0) {
      const leader = series
        .map((s) => ({ name: s.name, v: finite(s.values[last]) }))
        .sort((a, z) => z.v - a.v)[0];
      if (leader && leader.v > 0) {
        sentences.push(`${b(leader.name)} responde por ${b(pct(leader.v / cur))} do total.`);
      }
    }
  }

  // Contexto da janela: recorde, piso ou sequência.
  if (n >= 4) {
    const prior = total.slice(0, last);
    const maxPrior = Math.max(...prior);
    const minPrior = Math.min(...prior);
    if (cur > maxPrior) sentences.push(`É o maior valor dos últimos ${n} meses.`);
    else if (cur < minPrior) sentences.push(`É o menor valor dos últimos ${n} meses.`);
    else {
      let streak = 0;
      const dir = Math.sign(total[last] - total[last - 1]);
      for (let i = last; i > 0 && dir !== 0; i--) {
        if (Math.sign(total[i] - total[i - 1]) === dir) streak++;
        else break;
      }
      if (streak >= 2) sentences.push(`${cap(`${streak}ª ${dir > 0 ? "alta" : "queda"} seguida`)}.`);
    }
  }

  return sentences.join(" ");
}

function categoryInsight(
  cats: { key: string; label: string }[],
  series: { name: string; values: number[] }[],
  measure: KpiMeasureId | null,
): string {
  if (series.length === 1 || isAdditive(measure)) {
    const values = series.length === 1 ? series[0].values.map(finite) : sumSeries(series, cats.length);
    return rankingInsight(cats.map((c, i) => ({ name: c.label, value: values[i] })), measure);
  }
  // Medida não aditiva com quebra: o maior e o menor ponto do gráfico.
  const points: { name: string; v: number }[] = [];
  for (const s of series) {
    cats.forEach((c, i) => {
      const v = s.values[i];
      if (Number.isFinite(v) && v !== 0) points.push({ name: `${c.label} · ${s.name}`, v });
    });
  }
  if (points.length === 0) return INSIGHT_EMPTY;
  points.sort((a, z) => z.v - a.v);
  const top = points[0];
  const bottom = points[points.length - 1];
  let s = `Maior valor: ${b(top.name)} (${b(formatInsightValue(top.v, measure))})`;
  if (points.length > 1) s += `; menor: ${b(bottom.name)} (${b(formatInsightValue(bottom.v, measure))})`;
  return `${s}.`;
}

function rankingInsight(rawItems: { name: string; value: number }[], measure: KpiMeasureId | null): string {
  const items = rawItems
    .filter((it) => Number.isFinite(it.value) && it.value !== 0)
    .sort((a, z) => z.value - a.value);
  if (items.length === 0) return INSIGHT_EMPTY;
  const top = items[0];
  const sentences: string[] = [];

  if (!isAdditive(measure)) {
    let s = `${b(top.name)} tem o maior valor (${b(formatInsightValue(top.value, measure))})`;
    if (items.length > 1) {
      const bottom = items[items.length - 1];
      s += ` e ${b(bottom.name)}, o menor (${b(formatInsightValue(bottom.value, measure))})`;
    }
    return `${s}.`;
  }

  const positive = items.filter((it) => it.value > 0);
  const total = positive.reduce((s, it) => s + it.value, 0);
  if (total <= 0 || top.value <= 0) {
    return `${b(top.name)} lidera com ${b(formatInsightValue(top.value, measure))}.`;
  }
  sentences.push(
    `${b(top.name)} lidera com ${b(formatInsightValue(top.value, measure))} (${b(pct(top.value / total))} do total).`,
  );
  if (positive.length >= 4) {
    const top3 = positive.slice(0, 3).reduce((s, it) => s + it.value, 0);
    sentences.push(`Os 3 primeiros somam ${b(pct(top3 / total))}.`);
  } else if (positive.length >= 2) {
    const second = positive[1];
    sentences.push(`Em seguida vem ${b(second.name)}, com ${b(pct(second.value / total))}.`);
  }
  // Concentração: quantos itens chegam a 80% (curva ABC) — só com lista longa.
  if (positive.length >= 8) {
    let acc = 0;
    let k = 0;
    for (const it of positive) { acc += it.value; k++; if (acc / total >= 0.8) break; }
    sentences.push(`${k} de ${positive.length} itens fazem 80% do total.`);
  }
  return sentences.join(" ");
}
