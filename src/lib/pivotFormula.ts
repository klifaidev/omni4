// Campos calculados da Tabela Dinâmica: fórmulas sobre as medidas, como
// "[ROL] / [Volume]" ou "([CM] - [Frete s/ Vendas]) / [ROL]". Interpretador
// próprio (sem eval/new Function — a CSP do app proíbe, e uma fórmula nunca
// deve virar código): números, + - * /, parênteses, menos unário e
// referências entre colchetes. A forma canônica guarda os ids das medidas
// ("[rol_real] / [vol_real]") — é ela que vai pro worker, onde é recompilada.

export type FormulaNode =
  | { kind: "num"; value: number }
  | { kind: "ref"; id: string }
  | { kind: "neg"; arg: FormulaNode }
  | { kind: "bin"; op: "+" | "-" | "*" | "/"; left: FormulaNode; right: FormulaNode };

export type FormulaParseResult =
  | { ok: true; ast: FormulaNode; deps: string[]; canonical: string }
  | { ok: false; error: string };

type Token =
  | { type: "num"; value: number; at: number }
  | { type: "ref"; name: string; at: number }
  | { type: "op"; op: "+" | "-" | "*" | "/"; at: number }
  | { type: "paren"; open: boolean; at: number };

function tokenize(expr: string): Token[] | string {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "[") {
      const end = expr.indexOf("]", i + 1);
      if (end < 0) return `Falta fechar o colchete aberto na posição ${i + 1}.`;
      const name = expr.slice(i + 1, end).trim();
      if (!name) return "Há um colchete vazio — escreva o nome de uma medida dentro dele.";
      tokens.push({ type: "ref", name, at: i });
      i = end + 1;
      continue;
    }
    if (/[0-9]/.test(ch) || ((ch === "," || ch === ".") && /[0-9]/.test(expr[i + 1] ?? ""))) {
      let j = i;
      while (j < expr.length && /[0-9.,]/.test(expr[j])) j++;
      // Aceita "1,5" (pt-BR) e "1.5"; sem separador de milhar.
      const raw = expr.slice(i, j).replace(",", ".");
      const value = Number(raw);
      if (!isFinite(value) || (raw.match(/\./g)?.length ?? 0) > 1) return `Número inválido: "${expr.slice(i, j)}".`;
      tokens.push({ type: "num", value, at: i });
      i = j;
      continue;
    }
    if ("+-*/".includes(ch)) {
      tokens.push({ type: "op", op: ch as "+" | "-" | "*" | "/", at: i });
      i++;
      continue;
    }
    if (ch === "×") {
      tokens.push({ type: "op", op: "*", at: i });
      i++;
      continue;
    }
    if (ch === "÷") {
      tokens.push({ type: "op", op: "/", at: i });
      i++;
      continue;
    }
    if (ch === "(" || ch === ")") {
      tokens.push({ type: "paren", open: ch === "(", at: i });
      i++;
      continue;
    }
    return `Caractere não reconhecido: "${ch}". Use medidas entre colchetes, números e + − × ÷ ( ).`;
  }
  return tokens;
}

/**
 * `resolve` traduz o que está entre colchetes (rótulo ou id) no id da medida;
 * null quando não existe.
 */
export function parseFormula(expr: string, resolve: (name: string) => string | null): FormulaParseResult {
  const tokens = tokenize(expr);
  if (typeof tokens === "string") return { ok: false, error: tokens };
  if (tokens.length === 0) return { ok: false, error: "Escreva uma fórmula, por exemplo [ROL] / [Volume]." };
  let pos = 0;
  const deps: string[] = [];

  const fail = (msg: string): never => {
    throw new FormulaError(msg);
  };
  const peek = () => tokens[pos];

  // expr := term (("+" | "-") term)*
  // term := unary (("*" | "/") unary)*
  // unary := "-" unary | primary
  // primary := num | ref | "(" expr ")"
  const parseExpr = (): FormulaNode => {
    let node = parseTerm();
    for (let t = peek(); t && t.type === "op" && (t.op === "+" || t.op === "-"); t = peek()) {
      pos++;
      node = { kind: "bin", op: t.op, left: node, right: parseTerm() };
    }
    return node;
  };
  const parseTerm = (): FormulaNode => {
    let node = parseUnary();
    for (let t = peek(); t && t.type === "op" && (t.op === "*" || t.op === "/"); t = peek()) {
      pos++;
      node = { kind: "bin", op: t.op, left: node, right: parseUnary() };
    }
    return node;
  };
  const parseUnary = (): FormulaNode => {
    const t = peek();
    if (t && t.type === "op" && t.op === "-") {
      pos++;
      return { kind: "neg", arg: parseUnary() };
    }
    if (t && t.type === "op" && t.op === "+") {
      pos++;
      return parseUnary();
    }
    return parsePrimary();
  };
  const parsePrimary = (): FormulaNode => {
    const t = peek();
    if (!t) return fail("A fórmula terminou no meio — falta uma medida ou um número no fim.");
    pos++;
    if (t.type === "num") return { kind: "num", value: t.value };
    if (t.type === "ref") {
      const id = resolve(t.name);
      if (!id) return fail(`Não existe a medida "${t.name}" neste modo.`);
      if (!deps.includes(id)) deps.push(id);
      return { kind: "ref", id };
    }
    if (t.type === "paren" && t.open) {
      const inner = parseExpr();
      const close = peek();
      if (!close || close.type !== "paren" || close.open) return fail("Falta fechar um parêntese.");
      pos++;
      return inner;
    }
    return fail(t.type === "paren" ? "Parêntese fechado sem ter sido aberto." : "Dois operadores seguidos — falta uma medida ou um número entre eles.");
  };

  try {
    const ast = parseExpr();
    if (pos < tokens.length) {
      const t = tokens[pos];
      return { ok: false, error: t.type === "paren" ? "Parêntese fechado sem ter sido aberto." : "Falta um operador (+ − × ÷) entre dois termos." };
    }
    if (deps.length === 0) return { ok: false, error: "Use pelo menos uma medida, por exemplo [ROL]." };
    return { ok: true, ast, deps, canonical: formatFormula(ast, (id) => id) };
  } catch (error) {
    if (error instanceof FormulaError) return { ok: false, error: error.message };
    throw error;
  }
}

class FormulaError extends Error {}

const PRECEDENCE = { "+": 1, "-": 1, "*": 2, "/": 2 } as const;

/** Escreve a fórmula de volta, com os nomes que `nameOf` der (ids ou rótulos). */
export function formatFormula(node: FormulaNode, nameOf: (id: string) => string, parentPrec = 0, rightSide = false): string {
  switch (node.kind) {
    case "num":
      return String(node.value).replace(".", ",");
    case "ref":
      return `[${nameOf(node.id)}]`;
    case "neg":
      return `-${formatFormula(node.arg, nameOf, 3)}`;
    case "bin": {
      const prec = PRECEDENCE[node.op];
      const text = `${formatFormula(node.left, nameOf, prec)} ${node.op} ${formatFormula(node.right, nameOf, prec, true)}`;
      // Lado direito com a mesma precedência sempre entre parênteses:
      // a − (b + c) e a ÷ (b × c) não podem perder o agrupamento.
      const needsParens = prec < parentPrec || (rightSide && prec === parentPrec);
      return needsParens ? `(${text})` : text;
    }
  }
}

/** Valor da fórmula a partir das medidas já agregadas; null se faltar dado ou dividir por zero. */
export function evaluateFormula(node: FormulaNode, values: Record<string, number | null>): number | null {
  switch (node.kind) {
    case "num":
      return node.value;
    case "ref": {
      const v = values[node.id];
      return v == null || !isFinite(v) ? null : v;
    }
    case "neg": {
      const v = evaluateFormula(node.arg, values);
      return v == null ? null : -v;
    }
    case "bin": {
      const a = evaluateFormula(node.left, values);
      const b = evaluateFormula(node.right, values);
      if (a == null || b == null) return null;
      if (node.op === "+") return a + b;
      if (node.op === "-") return a - b;
      if (node.op === "*") return a * b;
      return b === 0 ? null : a / b;
    }
  }
}

/** Compila a forma canônica ("[rol_real] / [vol_real]") numa função de derivação. */
export function compileFormula(canonical: string): ((acc: Record<string, number | null>) => number | null) | null {
  const parsed = parseFormula(canonical, (name) => name);
  if (!parsed.ok) return null;
  const ast = parsed.ast;
  return (acc) => evaluateFormula(ast, acc);
}
