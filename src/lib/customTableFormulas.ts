import type { CustomCellValue } from "@/store/customTables";

export type FormulaDisplayValue = {
  value: string | number;
  error?: string;
};

type Token =
  | { type: "number"; value: number }
  | { type: "cell"; value: string }
  | { type: "ident"; value: string }
  | { type: "op"; value: "+" | "-" | "*" | "/" | "(" | ")" | ":" | "," | ";" }
  | { type: "eof" };

type CellRef = { row: number; col: number };

type Parser = {
  tokens: Token[];
  index: number;
  visited: Set<string>;
  table: CustomCellValue[][];
  cache: Map<string, FormulaDisplayValue>;
};

type FormulaArgument = {
  values: number[];
  nonEmptyCount: number;
};

const FORMULA_ERROR = {
  circular: "Referência circular",
  divZero: "Divisão por zero",
  syntax: "Erro de fórmula",
};

function colToIndex(label: string): number {
  let value = 0;
  for (const char of label.toUpperCase()) {
    value = value * 26 + (char.charCodeAt(0) - 64);
  }
  return value - 1;
}

function keyOf(ref: CellRef) {
  return `${ref.row}:${ref.col}`;
}

function parseCellRef(ref: string): CellRef | null {
  const match = /^([A-Z]+)([1-9]\d*)$/i.exec(ref);
  if (!match) return null;
  return { col: colToIndex(match[1]), row: Number(match[2]) - 1 };
}

function numericCellValue(result: FormulaDisplayValue): number {
  if (result.error) throw new Error(result.error);
  if (typeof result.value === "number") return result.value;
  const text = String(result.value ?? "").trim();
  if (!text) return 0;
  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : text;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < expression.length) {
    const char = expression[index];
    if (/\s/.test(char)) {
      index++;
      continue;
    }
    if ("+-*/():,;".includes(char)) {
      tokens.push({ type: "op", value: char as "+" | "-" | "*" | "/" | "(" | ")" | ":" | "," | ";" });
      index++;
      continue;
    }
    if (/\d/.test(char) || (char === "." && /\d/.test(expression[index + 1]))) {
      let raw = "";
      while (index < expression.length && /[\d.,]/.test(expression[index])) raw += expression[index++];
      const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
      const value = Number(normalized);
      if (!Number.isFinite(value)) throw new Error(FORMULA_ERROR.syntax);
      tokens.push({ type: "number", value });
      continue;
    }
    if (/[A-Za-z_À-ÿ]/.test(char)) {
      let raw = "";
      while (index < expression.length && /[A-Za-z0-9_À-ÿ]/.test(expression[index])) raw += expression[index++];
      const cell = parseCellRef(raw);
      tokens.push(cell ? { type: "cell", value: raw.toUpperCase() } : { type: "ident", value: raw.toUpperCase() });
      continue;
    }
    throw new Error(FORMULA_ERROR.syntax);
  }
  tokens.push({ type: "eof" });
  return tokens;
}

function peek(parser: Parser): Token {
  return parser.tokens[parser.index] ?? { type: "eof" };
}

function consume(parser: Parser): Token {
  return parser.tokens[parser.index++] ?? { type: "eof" };
}

function matchOp(parser: Parser, value: string): boolean {
  const token = peek(parser);
  if (token.type === "op" && token.value === value) {
    parser.index++;
    return true;
  }
  return false;
}

function expectOp(parser: Parser, value: string) {
  if (!matchOp(parser, value)) throw new Error(FORMULA_ERROR.syntax);
}

function evalCell(parser: Parser, refText: string): number {
  const ref = parseCellRef(refText);
  if (!ref) throw new Error(FORMULA_ERROR.syntax);
  const result = evaluateCell(parser.table, ref.row, ref.col, parser.cache, parser.visited);
  return numericCellValue(result);
}

function rangeRefs(start: string, end: string): CellRef[] {
  const a = parseCellRef(start);
  const b = parseCellRef(end);
  if (!a || !b) throw new Error(FORMULA_ERROR.syntax);
  const rowStart = Math.min(a.row, b.row);
  const rowEnd = Math.max(a.row, b.row);
  const colStart = Math.min(a.col, b.col);
  const colEnd = Math.max(a.col, b.col);
  const refs: CellRef[] = [];
  for (let row = rowStart; row <= rowEnd; row++) {
    for (let col = colStart; col <= colEnd; col++) refs.push({ row, col });
  }
  return refs;
}

function parseRangeOrExpression(parser: Parser): FormulaArgument {
  const first = peek(parser);
  if (first.type === "cell") {
    consume(parser);
    if (matchOp(parser, ":")) {
      const second = consume(parser);
      if (second.type !== "cell") throw new Error(FORMULA_ERROR.syntax);
      const refs = rangeRefs(first.value, second.value);
      const values: number[] = [];
      let nonEmptyCount = 0;
      for (const ref of refs) {
        const raw = parser.table[ref.row]?.[ref.col] ?? "";
        if (String(raw ?? "").trim() !== "") nonEmptyCount++;
        values.push(numericCellValue(evaluateCell(parser.table, ref.row, ref.col, parser.cache, parser.visited)));
      }
      return { values, nonEmptyCount };
    }
    parser.index--;
  }
  const value = parseExpression(parser);
  return { values: [value], nonEmptyCount: value === 0 ? 0 : 1 };
}

function parseFunction(parser: Parser, name: string): number {
  expectOp(parser, "(");
  const values: number[] = [];
  let nonEmptyCount = 0;
  if (!matchOp(parser, ")")) {
    do {
      const arg = parseRangeOrExpression(parser);
      values.push(...arg.values);
      nonEmptyCount += arg.nonEmptyCount;
    } while (matchOp(parser, ",") || matchOp(parser, ";"));
    expectOp(parser, ")");
  }
  if (name === "SOMA" || name === "SUM") return values.reduce((sum, value) => sum + value, 0);
  if (name === "MEDIA" || name === "MÉDIA" || name === "AVERAGE") {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  }
  if (name === "CONTAGEM" || name === "COUNT" || name === "COUNTA" || name === "CONT") {
    return nonEmptyCount;
  }
  throw new Error(FORMULA_ERROR.syntax);
}

function parseFactor(parser: Parser): number {
  if (matchOp(parser, "+")) return parseFactor(parser);
  if (matchOp(parser, "-")) return -parseFactor(parser);
  if (matchOp(parser, "(")) {
    const value = parseExpression(parser);
    expectOp(parser, ")");
    return value;
  }
  const token = consume(parser);
  if (token.type === "number") return token.value;
  if (token.type === "cell") return evalCell(parser, token.value);
  if (token.type === "ident") return parseFunction(parser, token.value);
  throw new Error(FORMULA_ERROR.syntax);
}

function parseTerm(parser: Parser): number {
  let value = parseFactor(parser);
  while (true) {
    if (matchOp(parser, "*")) value *= parseFactor(parser);
    else if (matchOp(parser, "/")) {
      const divisor = parseFactor(parser);
      if (divisor === 0) throw new Error(FORMULA_ERROR.divZero);
      value /= divisor;
    } else break;
  }
  return value;
}

function parseExpression(parser: Parser): number {
  let value = parseTerm(parser);
  while (true) {
    if (matchOp(parser, "+")) value += parseTerm(parser);
    else if (matchOp(parser, "-")) value -= parseTerm(parser);
    else break;
  }
  return value;
}

export function evaluateCell(
  rows: CustomCellValue[][],
  row: number,
  col: number,
  cache = new Map<string, FormulaDisplayValue>(),
  visited = new Set<string>(),
): FormulaDisplayValue {
  const key = keyOf({ row, col });
  if (cache.has(key)) return cache.get(key)!;
  if (visited.has(key)) {
    const circular = { value: FORMULA_ERROR.circular, error: FORMULA_ERROR.circular };
    cache.set(key, circular);
    return circular;
  }
  const raw = rows[row]?.[col] ?? "";
  if (typeof raw !== "string" || !raw.trim().startsWith("=")) {
    const result = { value: raw };
    cache.set(key, result);
    return result;
  }

  visited.add(key);
  try {
    const parser: Parser = {
      tokens: tokenize(raw.trim().slice(1)),
      index: 0,
      visited,
      table: rows,
      cache,
    };
    const value = parseExpression(parser);
    if (peek(parser).type !== "eof") throw new Error(FORMULA_ERROR.syntax);
    const result = { value: Number.isInteger(value) ? value : Number(value.toFixed(8)) };
    cache.set(key, result);
    return result;
  } catch (error) {
    const message = error instanceof Error && Object.values(FORMULA_ERROR).includes(error.message)
      ? error.message
      : FORMULA_ERROR.syntax;
    const result = { value: message, error: message };
    cache.set(key, result);
    return result;
  } finally {
    visited.delete(key);
  }
}

export function evaluateCustomTable(rows: CustomCellValue[][]): FormulaDisplayValue[][] {
  const cache = new Map<string, FormulaDisplayValue>();
  return rows.map((row, rowIndex) => row.map((_, colIndex) => evaluateCell(rows, rowIndex, colIndex, cache, new Set())));
}
