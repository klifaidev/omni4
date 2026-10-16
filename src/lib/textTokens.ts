// Valores vivos nos textos do deck: "Em {mês}, o ROL foi {ROL do mês}" vira
// "Em agosto/2026, o ROL foi R$ 8,4 mi". O mês é o mais recente da base já
// cortada no mês de referência do deck (hooks/useDeckRows) — "Avançar um mês"
// ou trocar a referência atualiza a narrativa sozinha.
//
// Valem em qualquer texto do slide: blocos de título e texto, rótulo do
// cartão, títulos de gráfico, eixo, tabela e blocos analíticos, e a capa.
//
// Nomes sem diferença de acento/maiúscula: {mes}, {Mês} e {MÊS} valem igual.
// Nome desconhecido fica como foi digitado (a verificação antes de exportar
// avisa), para o erro aparecer em vez de sumir. Valor que começa uma frase
// ganha inicial maiúscula ("{mês} fechou…" → "Agosto/2026 fechou…").

import type { PricingRow } from "./types";
import type { BudgetRow } from "./budget";
import { formatBRL, formatNum, formatPct } from "./format";
import { parsePeriodo } from "./deckPeriod";
import { detectVolumeUnit } from "./volumeUnit";

export type TextTokenGroup = "date" | "number" | "change" | "ytd" | "deck" | "block";

export interface TextTokenDef {
  /** Como a pessoa digita, sem chaves. */
  label: string;
  group: TextTokenGroup;
  /** Exemplo mostrado quando ainda não há base carregada. */
  hint: string;
  /** Frase curta do que o valor significa (aparece no seletor). */
  description?: string;
}

export const TEXT_TOKENS: readonly TextTokenDef[] = [
  { label: "mês", group: "date", hint: "agosto/2026", description: "Mês de referência do deck" },
  { label: "mês curto", group: "date", hint: "ago/26" },
  { label: "mês anterior", group: "date", hint: "julho/2026" },
  { label: "mesmo mês ano anterior", group: "date", hint: "agosto/2025" },
  { label: "trimestre", group: "date", hint: "3º tri/2026" },
  { label: "ano", group: "date", hint: "2026" },
  { label: "ano fiscal", group: "date", hint: "FY26/27", description: "Abril a março" },
  { label: "hoje", group: "date", hint: "15/10/2026", description: "Data em que o slide é aberto ou exportado" },

  { label: "ROL do mês", group: "number", hint: "R$ 8,4 mi" },
  { label: "ROL budget do mês", group: "number", hint: "R$ 8,1 mi" },
  { label: "CM do mês", group: "number", hint: "R$ 2,1 mi" },
  { label: "CM % do mês", group: "number", hint: "25,3%" },
  { label: "Volume do mês", group: "number", hint: "1.234 t" },
  { label: "Preço médio do mês", group: "number", hint: "R$ 18,15/kg", description: "ROL ÷ volume" },
  { label: "Clientes positivados do mês", group: "number", hint: "2.939", description: "Clientes com compra no mês" },

  { label: "ROL vs budget %", group: "change", hint: "+3,1%" },
  { label: "ROL vs mês anterior %", group: "change", hint: "-1,8%" },
  { label: "ROL vs ano anterior %", group: "change", hint: "+7,4%", description: "Contra o mesmo mês do ano anterior" },
  { label: "Volume vs mês anterior %", group: "change", hint: "+2,0%" },
  { label: "Volume vs ano anterior %", group: "change", hint: "-0,5%", description: "Contra o mesmo mês do ano anterior" },
  { label: "CM % vs mês anterior", group: "change", hint: "+1,2 p.p.", description: "Em pontos percentuais" },

  { label: "ROL acumulado no ano fiscal", group: "ytd", hint: "R$ 41,2 mi", description: "De abril até o mês" },
  { label: "Volume acumulado no ano fiscal", group: "ytd", hint: "5.870 t" },
  { label: "ROL acumulado vs ano anterior %", group: "ytd", hint: "+6,3%", description: "Mesmos meses do ano fiscal anterior" },

  // Posição no deck (resolvidos por slide em RichTextContent, não aqui).
  { label: "slide", group: "deck", hint: "3" },
  { label: "total de slides", group: "deck", hint: "12" },

  // Do próprio bloco: o cartão de KPI troca pelo período dele ("julho/2026").
  { label: "período", group: "block", hint: "julho/2026", description: "Período do próprio cartão" },
];

/** Palavras que a pessoa usa para procurar (além do nome do valor). */
const GROUP_KEYWORDS: Record<TextTokenGroup, string> = {
  date: "data periodo calendario",
  number: "valor numero resultado",
  change: "variacao crescimento queda comparacao versus diferenca evolucao",
  ytd: "acumulado ytd ano fiscal total no ano",
  deck: "pagina numeracao apresentacao",
  block: "periodo deste cartao bloco",
};

const LABEL_KEYWORDS: Array<[RegExp, string]> = [
  [/^ROL\b/, "receita faturamento vendas"],
  [/^CM\b/, "margem contribuicao"],
  [/volume/i, "kg toneladas peso quantidade"],
  [/preço/i, "preco ticket r$/kg"],
  [/clientes/i, "positivacao clientes ativos"],
  [/budget/i, "meta orcamento plano"],
  [/hoje/i, "data atual dia"],
];

function searchText(tk: TextTokenDef): string {
  const extra = LABEL_KEYWORDS.filter(([re]) => re.test(tk.label)).map(([, k]) => k).join(" ");
  return normalizeTokenName(`${GROUP_KEYWORDS[tk.group]} ${extra} ${tk.description ?? ""}`);
}

export const TOKEN_GROUP_LABELS: Record<TextTokenGroup, string> = {
  date: "Datas",
  number: "Números do mês",
  change: "Variações",
  ytd: "Acumulado no ano fiscal",
  deck: "Apresentação",
  block: "Deste bloco",
};

/** Tokens que dependem do slide, não das bases. */
export const SLIDE_POSITION_TOKENS = ["slide", "total de slides"] as const;

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

export function tokenText(def: Pick<TextTokenDef, "label">): string {
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

/** O texto antes do valor termina uma frase (ou não existe)? Marcação ** e _ não conta. */
function startsSentence(before: string): boolean {
  const trimmed = before.replace(/[\s*_"'“(]+$/u, "");
  return trimmed === "" || /[.!?\n•]$/u.test(trimmed);
}

export function resolveTextTokens(text: string, values: ReadonlyMap<string, string>): string {
  if (!text.includes("{")) return text;
  return text.replace(TOKEN_RE, (whole, name: string, offset: number) => {
    const value = values.get(normalizeTokenName(name));
    if (value === undefined) return whole;
    if (value && startsSentence(text.slice(0, offset))) {
      return value.charAt(0).toLocaleUpperCase("pt-BR") + value.slice(1);
    }
    return value;
  });
}

// ---------------------------------------------------------------------------
// Autocompletar: "{" abre a lista; o que se digita depois filtra.
// ---------------------------------------------------------------------------

export interface TokenQuery {
  /** Posição da "{" que abriu a busca. */
  start: number;
  /** Texto digitado depois da "{" (pode ser vazio). */
  query: string;
}

/** Busca em andamento no cursor: "Volume de {mês a|" → { start, query: "mês a" }. */
export function findTokenQuery(text: string, caret: number): TokenQuery | null {
  const before = text.slice(0, caret);
  const open = before.lastIndexOf("{");
  if (open < 0) return null;
  const query = before.slice(open + 1);
  if (query.includes("}") || query.includes("\n") || query.length > 40) return null;
  return { start: open, query };
}

/** Tokens que combinam com o que foi digitado (início de palavra primeiro). */
export function matchTokens(query: string, tokens: readonly TextTokenDef[] = TEXT_TOKENS): TextTokenDef[] {
  const q = normalizeTokenName(query);
  if (!q) return [...tokens];
  const scored: Array<{ tk: TextTokenDef; score: number }> = [];
  for (const tk of tokens) {
    const name = normalizeTokenName(tk.label);
    const at = name.indexOf(q);
    if (at >= 0) {
      const wordStart = at === 0 || name[at - 1] === " ";
      scored.push({ tk, score: (at === 0 ? 0 : wordStart ? 1 : 2) * 100 + name.length });
      continue;
    }
    // Sinônimos ("variação", "receita", "meta"…) vêm depois dos nomes.
    // Sinônimo só casa no início de uma palavra ("tri" não acha "contribuição").
    if (` ${searchText(tk)}`.includes(` ${q}`)) scored.push({ tk, score: 300 + name.length });
  }
  return scored.sort((a, b) => a.score - b.score).map((s) => s.tk);
}

/** Troca a busca em andamento pelo token completo e devolve o novo texto e cursor. */
export function insertToken(text: string, query: TokenQuery | null, caret: number, def: Pick<TextTokenDef, "label">): { text: string; caret: number } {
  const token = tokenText(def);
  const from = query ? query.start : caret;
  // Se já havia "}" logo depois (o editor fechou sozinho), não duplica.
  const to = text[caret] === "}" && query ? caret + 1 : caret;
  const next = text.slice(0, from) + token + text.slice(to);
  return { text: next, caret: from + token.length };
}

// ---------------------------------------------------------------------------
// Valores
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const MONTH_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const monthIdx = (mes: number, ano: number) => ano * 12 + (mes - 1);
export const monthNameOf = (idx: number) => `${MONTH_NAMES[idx % 12]}/${Math.floor(idx / 12)}`;
const monthShortOf = (idx: number) => `${MONTH_SHORT[idx % 12]}/${String(Math.floor(idx / 12)).slice(-2)}`;
/** Abril abre o ano fiscal: devolve o índice do abril do ano fiscal do mês. */
const fyStartOf = (idx: number) => (idx % 12 >= 3 ? idx - (idx % 12) + 3 : idx - (idx % 12) - 9);
const fyLabelOf = (idx: number) => {
  const start = Math.floor(fyStartOf(idx) / 12);
  return `FY${String(start).slice(-2)}/${String(start + 1).slice(-2)}`;
};

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

function signedPoints(delta: number): string {
  if (!isFinite(delta)) return "—";
  const pts = delta * 100;
  if (Math.round(Math.abs(pts) * 10) === 0) return "0,0 p.p.";
  return `${pts > 0 ? "+" : "-"}${formatNum(Math.abs(pts), 1)} p.p.`;
}

/** Toneladas com casas conforme o tamanho: 9.405 t, 87,3 t, 1,25 t. */
function formatTonsShort(kg: number): string {
  const t = kg / 1000;
  const abs = Math.abs(t);
  return `${formatNum(t, abs >= 100 ? 0 : abs >= 10 ? 1 : 2)} t`;
}

const formatToday = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

interface MonthAgg { rol: number; cm: number; volume: number; clientes: Set<string> }

const valuesCache = new WeakMap<readonly object[], WeakMap<readonly object[], Map<string, Map<string, string>>>>();

/**
 * Valores de todos os tokens para as linhas do deck. Cache por (linhas reais,
 * linhas de budget, referência, dia): os hooks do deck devolvem os mesmos
 * arrays enquanto nada muda, então todos os textos do deck dividem um cálculo.
 */
export function computeTokenValues(
  pricing: readonly PricingRow[],
  budget: readonly BudgetRow[],
  reference: string | null,
  today: Date = new Date(),
): Map<string, string> {
  const todayText = formatToday(today);
  const refKey = `${reference ?? ""}|${todayText}`;
  let byBudget = valuesCache.get(pricing);
  const cached = byBudget?.get(budget)?.get(refKey);
  if (cached) return cached;

  // Base em toneladas (export do SAP em "1.000 KG") vira kg — o mesmo critério
  // dos cartões de KPI, para o texto não contradizer o cartão ao lado.
  const volumeScale = detectVolumeUnit(pricing).guess === "ton" ? 1000 : 1;

  const real = new Map<number, MonthAgg>();
  let latest = -1;
  for (const r of pricing) {
    const idx = monthIdx(r.mes, r.ano);
    let acc = real.get(idx);
    if (!acc) { acc = { rol: 0, cm: 0, volume: 0, clientes: new Set() }; real.set(idx, acc); }
    const rol = r.rol ?? 0;
    const vol = r.volumeKg ?? 0;
    acc.rol += rol;
    acc.cm += r.contribMarginal ?? 0;
    acc.volume += vol;
    if (vol > 0 || rol > 0) {
      const id = r.cliente?.split(" ")[0];
      if (id && /^\d+$/.test(id)) acc.clientes.add(id);
    }
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
  for (const tk of TEXT_TOKENS) if (tk.group !== "deck") set(tk.label, "—");
  set("hoje", todayText);
  if (latest >= 0) {
    const cur = real.get(latest);
    const prev = real.get(latest - 1);
    const lastYear = real.get(latest - 12);
    const budgetRol = plan.get(latest);
    const budgetRealRol = planReal.get(latest);
    set("mês", monthNameOf(latest));
    set("mês curto", monthShortOf(latest));
    set("mês anterior", monthNameOf(latest - 1));
    set("mesmo mês ano anterior", monthNameOf(latest - 12));
    set("trimestre", `${Math.floor((latest % 12) / 3) + 1}º tri/${Math.floor(latest / 12)}`);
    set("ano", String(Math.floor(latest / 12)));
    set("ano fiscal", fyLabelOf(latest));
    set("período", monthNameOf(latest));
    if (cur) {
      set("ROL do mês", formatBRLShort(cur.rol));
      set("CM do mês", formatBRLShort(cur.cm));
      if (cur.rol !== 0) set("CM % do mês", formatPct(cur.cm / cur.rol, 1));
      set("Volume do mês", formatTonsShort(cur.volume * volumeScale));
      // R$/kg nas unidades da base: em toneladas o R$ também vem em milhares.
      if (cur.volume > 0) set("Preço médio do mês", `${formatBRL(cur.rol / cur.volume, { digits: 2 })}/kg`);
      if (cur.clientes.size > 0) set("Clientes positivados do mês", formatNum(cur.clientes.size, 0));
    }
    if (budgetRol) set("ROL budget do mês", formatBRLShort(budgetRol));
    if (budgetRealRol && budgetRol) set("ROL vs budget %", signedPct(budgetRealRol, budgetRol));
    if (cur && prev) {
      set("ROL vs mês anterior %", signedPct(cur.rol, prev.rol));
      set("Volume vs mês anterior %", signedPct(cur.volume, prev.volume));
      if (cur.rol !== 0 && prev.rol !== 0) set("CM % vs mês anterior", signedPoints(cur.cm / cur.rol - prev.cm / prev.rol));
    }
    if (cur && lastYear) {
      set("ROL vs ano anterior %", signedPct(cur.rol, lastYear.rol));
      set("Volume vs ano anterior %", signedPct(cur.volume, lastYear.volume));
    }
    // Acumulado do ano fiscal: de abril até o mês de referência.
    const fyStart = fyStartOf(latest);
    let ytdRol = 0;
    let ytdVol = 0;
    let ytdPrevRol = 0;
    let months = 0;
    let prevMonths = 0;
    for (let i = fyStart; i <= latest; i++) {
      const m = real.get(i);
      if (m) { ytdRol += m.rol; ytdVol += m.volume; months++; }
      const p = real.get(i - 12);
      if (p) { ytdPrevRol += p.rol; prevMonths++; }
    }
    if (months > 0) {
      set("ROL acumulado no ano fiscal", formatBRLShort(ytdRol));
      set("Volume acumulado no ano fiscal", formatTonsShort(ytdVol * volumeScale));
    }
    // Só compara quando o ano anterior tem os mesmos meses — senão a conta mente.
    if (months > 0 && prevMonths === latest - fyStart + 1) set("ROL acumulado vs ano anterior %", signedPct(ytdRol, ytdPrevRol));
  }

  if (!byBudget) { byBudget = new WeakMap(); valuesCache.set(pricing, byBudget); }
  let byRef = byBudget.get(budget);
  if (!byRef) { byRef = new Map(); byBudget.set(budget, byRef); }
  byRef.set(refKey, values);
  return values;
}

/** "006.2026" → "junho/2026"; "FY26/27" fica igual; vazio → "todos os períodos". */
export function periodTokenValue(periodMode: string | undefined, resolved: string | null | undefined): string {
  if (!periodMode || periodMode === "all" || !resolved) return "todos os períodos";
  const p = parsePeriodo(resolved);
  return p ? monthNameOf(monthIdx(p.mes, p.ano)) : resolved;
}
