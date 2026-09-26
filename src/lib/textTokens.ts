// Valores vivos em blocos de título/texto: "Em {mês}, o ROL foi {ROL do mês}"
// vira "Em agosto/2026, o ROL foi R$ 8,4 mi". O mês é o mais recente da base
// já cortada no mês de referência do deck (hooks/useDeckRows) — "Avançar um
// mês" ou trocar a referência atualiza a narrativa sozinha.
//
// Nomes sem diferença de acento/maiúscula: {mes}, {Mês} e {MÊS} valem igual.
// Nome desconhecido fica como foi digitado (a verificação antes de exportar
// avisa), para o erro aparecer em vez de sumir.

import type { PricingRow } from "./types";
import type { BudgetRow } from "./budget";
import { formatBRL, formatNum, formatPct } from "./format";
import { parsePeriodo } from "./deckPeriod";

export interface TextTokenDef {
  /** Como a pessoa digita, sem chaves. */
  label: string;
  group: "date" | "number";
  hint: string;
}

export const TEXT_TOKENS: readonly TextTokenDef[] = [
  { label: "mês", group: "date", hint: "agosto/2026" },
  { label: "mês anterior", group: "date", hint: "julho/2026" },
  { label: "ano", group: "date", hint: "2026" },
  { label: "ROL do mês", group: "number", hint: "R$ 8,4 mi" },
  { label: "CM do mês", group: "number", hint: "R$ 2,1 mi" },
  { label: "CM % do mês", group: "number", hint: "25,3%" },
  { label: "Volume do mês", group: "number", hint: "1.234 t" },
  { label: "ROL vs budget %", group: "number", hint: "+3,1%" },
  { label: "ROL vs mês anterior %", group: "number", hint: "-1,8%" },
  { label: "ROL vs ano anterior %", group: "number", hint: "+7,4%" },
];

const TOKEN_RE = /\{([^{}\n]{1,40})\}/g;

export function normalizeTokenName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const KNOWN = new Set(TEXT_TOKENS.map((tk) => normalizeTokenName(tk.label)));

export function tokenText(def: TextTokenDef): string {
  return `{${def.label}}`;
}

export function hasTextTokens(text: string | null | undefined): boolean {
  if (!text || !text.includes("{")) return false;
  TOKEN_RE.lastIndex = 0;
  for (let m = TOKEN_RE.exec(text); m; m = TOKEN_RE.exec(text)) {
    if (KNOWN.has(normalizeTokenName(m[1]))) return true;
  }
  return false;
}

/** Nomes entre chaves que não são valores conhecidos (para o aviso do preflight). */
export function findUnknownTokens(text: string | null | undefined): string[] {
  if (!text || !text.includes("{")) return [];
  const out: string[] = [];
  TOKEN_RE.lastIndex = 0;
  for (let m = TOKEN_RE.exec(text); m; m = TOKEN_RE.exec(text)) {
    if (!KNOWN.has(normalizeTokenName(m[1]))) out.push(m[0]);
  }
  return out;
}

export function resolveTextTokens(text: string, values: ReadonlyMap<string, string>): string {
  if (!text.includes("{")) return text;
  return text.replace(TOKEN_RE, (whole, name: string) => values.get(normalizeTokenName(name)) ?? whole);
}

// ---------------------------------------------------------------------------
// Valores
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const monthIdx = (mes: number, ano: number) => ano * 12 + (mes - 1);
const monthName = (idx: number) => `${MONTH_NAMES[idx % 12]}/${Math.floor(idx / 12)}`;

export function formatBRLShort(v: number): string {
  if (!isFinite(v)) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}R$ ${formatNum(abs / 1e9, 1)} bi`;
  if (abs >= 1e6) return `${sign}R$ ${formatNum(abs / 1e6, 1)} mi`;
  if (abs >= 1e3) return `${sign}R$ ${formatNum(abs / 1e3, 0)} mil`;
  return formatBRL(v);
}

function signedPct(current: number, base: number): string {
  if (!isFinite(current) || !isFinite(base) || base === 0) return "—";
  const v = current / base - 1;
  const txt = formatPct(Math.abs(v), 1);
  if (Math.round(Math.abs(v) * 1000) === 0) return formatPct(0, 1);
  return `${v > 0 ? "+" : "-"}${txt}`;
}

interface MonthAgg { rol: number; cm: number; volume: number }

const valuesCache = new WeakMap<readonly object[], WeakMap<readonly object[], Map<string, Map<string, string>>>>();

/**
 * Valores de todos os tokens para as linhas do deck. Cache por (linhas reais,
 * linhas de budget, referência): os hooks do deck devolvem os mesmos arrays
 * enquanto nada muda, então todos os textos do deck dividem um cálculo só.
 */
export function computeTokenValues(
  pricing: readonly PricingRow[],
  budget: readonly BudgetRow[],
  reference: string | null,
): Map<string, string> {
  const refKey = reference ?? "";
  let byBudget = valuesCache.get(pricing);
  const cached = byBudget?.get(budget)?.get(refKey);
  if (cached) return cached;

  const real = new Map<number, MonthAgg>();
  let latest = -1;
  for (const r of pricing) {
    const idx = monthIdx(r.mes, r.ano);
    let acc = real.get(idx);
    if (!acc) { acc = { rol: 0, cm: 0, volume: 0 }; real.set(idx, acc); }
    acc.rol += r.rol ?? 0;
    acc.cm += r.contribMarginal ?? 0;
    acc.volume += r.volumeKg ?? 0;
    if (idx > latest) latest = idx;
  }
  // "vs budget" compara Real e Budget da própria base de Budget — mesma conta
  // do slide Budget Evolutivo e da aba Budget, para o texto não contradizer o
  // gráfico ao lado (o Real da base de Budget pode diferir da base de preços).
  const plan = new Map<number, number>();
  const planReal = new Map<number, number>();
  for (const b of budget) {
    const idx = monthIdx(b.mes, b.ano);
    const target = b.kind === "budget" ? plan : planReal;
    target.set(idx, (target.get(idx) ?? 0) + (b.receita ?? 0));
  }
  if (latest < 0) {
    const ref = parsePeriodo(reference);
    if (ref) latest = monthIdx(ref.mes, ref.ano);
  }

  const values = new Map<string, string>();
  const set = (label: string, value: string) => values.set(normalizeTokenName(label), value);
  if (latest < 0) {
    for (const tk of TEXT_TOKENS) set(tk.label, "—");
  } else {
    const cur = real.get(latest);
    const prev = real.get(latest - 1);
    const lastYear = real.get(latest - 12);
    const budgetRol = plan.get(latest);
    const budgetRealRol = planReal.get(latest);
    set("mês", monthName(latest));
    set("mês anterior", monthName(latest - 1));
    set("ano", String(Math.floor(latest / 12)));
    set("ROL do mês", cur ? formatBRLShort(cur.rol) : "—");
    set("CM do mês", cur ? formatBRLShort(cur.cm) : "—");
    set("CM % do mês", cur && cur.rol !== 0 ? formatPct(cur.cm / cur.rol, 1) : "—");
    set("Volume do mês", cur ? `${formatNum(cur.volume / 1000, 0)} t` : "—");
    set("ROL vs budget %", budgetRealRol && budgetRol ? signedPct(budgetRealRol, budgetRol) : "—");
    set("ROL vs mês anterior %", cur && prev ? signedPct(cur.rol, prev.rol) : "—");
    set("ROL vs ano anterior %", cur && lastYear ? signedPct(cur.rol, lastYear.rol) : "—");
  }

  if (!byBudget) { byBudget = new WeakMap(); valuesCache.set(pricing, byBudget); }
  let byRef = byBudget.get(budget);
  if (!byRef) { byRef = new Map(); byBudget.set(budget, byRef); }
  byRef.set(refKey, values);
  return values;
}
