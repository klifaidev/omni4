// Reconhece o que cada aba de uma planilha é — Real, Budget ou Ruptura — pelo
// CONTEÚDO: nome e posição da aba não importam. Se um mês a Base One vier com
// as abas renomeadas, reordenadas ou com o cabeçalho algumas linhas abaixo, a
// leitura continua a mesma.
//
// Cada tipo tem uma "assinatura":
// - Real (KE30): coluna de período + receita, colunas que só o KE30 tem
//   (Cliente, Região, Gestor) e período no formato "009.2026 Setembro 2026";
// - Budget: SKU + data + receita, e a coluna STATUS com "Budget Vendas";
// - Ruptura: SKU + PDV + data + "Produto em Ruptura" com respostas Sim/Não.
// A aba vai para o tipo de maior pontuação; abaixo do mínimo, é ignorada.
import { normHeader } from "@/lib/format";
import { detectRupturaHeader, parseRupturaResult } from "@/lib/ruptura/parse";
import { BUDGET_HEADER_MAP, REAL_HEADER_MAP } from "./headerMaps";

export type BaseKind = "real" | "budget" | "ruptura";

export const BASE_KINDS: BaseKind[] = ["real", "budget", "ruptura"];

export type Confidence = "alta" | "media" | "baixa";

export interface KindCandidate {
  kind: BaseKind;
  headerRow: number;
  score: number;
  /** O que fez a aba parecer deste tipo, em palavras da planilha. */
  evidence: string[];
}

export interface SheetClassification {
  kind: BaseKind | null;
  headerRow: number;
  score: number;
  confidence: Confidence;
  evidence: string[];
  candidates: KindCandidate[];
}

const HEADER_SCAN_ROWS = 30;
const VALUE_SAMPLE = 400;
const MIN_SCORE = 8;

const KE30_ONLY = new Set(["cliente", "regiao", "gestorResp"]);

function cellText(v: unknown): string {
  return String(v ?? "").trim();
}

/** Valores não vazios da coluna, a partir da linha `from`, até `limit`. */
function sampleColumn(rows: ArrayLike<unknown>[], col: number, from: number, limit = VALUE_SAMPLE): unknown[] {
  const out: unknown[] = [];
  for (let r = from; r < rows.length && out.length < limit; r++) {
    const v = rows[r]?.[col];
    if (v !== null && v !== undefined && v !== "") out.push(v);
  }
  return out;
}

function columnHas(rows: ArrayLike<unknown>[], col: number, from: number, test: (v: unknown) => boolean): boolean {
  for (let r = from; r < rows.length; r++) {
    const v = rows[r]?.[col];
    if (v !== null && v !== undefined && v !== "" && test(v)) return true;
  }
  return false;
}

const TEXT_PERIOD = /^\s*0*\d{1,2}[./-]\d{4}\b/;

// ── Real ─────────────────────────────────────────────────────────────────

function realHeaderScore(row: ArrayLike<unknown> | undefined) {
  const fields = new Map<string, string>();
  for (let i = 0; i < (row?.length ?? 0); i++) {
    const text = cellText(row![i]);
    const field = REAL_HEADER_MAP[normHeader(text)];
    if (field && field !== "ignore" && !fields.has(field)) fields.set(field, text);
  }
  return fields;
}

function scoreReal(rows: ArrayLike<unknown>[]): KindCandidate | null {
  let best: { row: number; fields: Map<string, string> } | null = null;
  for (let r = 0; r < Math.min(rows.length, HEADER_SCAN_ROWS); r++) {
    const fields = realHeaderScore(rows[r]);
    if (!fields.has("periodo") || !fields.has("rol")) continue;
    if (!best || fields.size > best.fields.size) best = { row: r, fields };
  }
  if (!best) return null;
  const header = rows[best.row]!;
  const evidence: string[] = [best.fields.get("periodo")!, best.fields.get("rol")!];
  let score = best.fields.size;

  for (const field of KE30_ONLY) {
    if (best.fields.has(field)) {
      score += 4;
      evidence.push(best.fields.get(field)!);
    }
  }

  const periodCol = indexOfField(header, REAL_HEADER_MAP, "periodo");
  const periods = sampleColumn(rows, periodCol, best.row + 1);
  if (periods.length > 0) {
    const textual = periods.filter((v) => typeof v === "string" && TEXT_PERIOD.test(v)).length;
    if (textual / periods.length >= 0.6) {
      score += 10;
      evidence.push(`período como "${cellText(periods[0])}"`);
    }
  } else {
    score -= 10;
  }

  // Uma coluna STATUS com "Budget" é a marca do Budget, não do Real.
  const statusCol = findHeader(header, (key) => key === "status");
  if (statusCol >= 0 && columnHas(rows, statusCol, best.row + 1, (v) => normHeader(String(v)).includes("budget"))) {
    score -= 30;
  }
  return { kind: "real", headerRow: best.row, score, evidence };
}

// ── Budget ───────────────────────────────────────────────────────────────

function budgetHeaderScore(row: ArrayLike<unknown> | undefined) {
  const keys = new Map<string, string>();
  for (let i = 0; i < (row?.length ?? 0); i++) {
    const text = cellText(row![i]);
    const key = BUDGET_HEADER_MAP[normHeader(text)];
    if (key && !keys.has(key)) keys.set(key, text);
  }
  return keys;
}

function scoreBudget(rows: ArrayLike<unknown>[]): KindCandidate | null {
  let best: { row: number; keys: Map<string, string> } | null = null;
  for (let r = 0; r < Math.min(rows.length, HEADER_SCAN_ROWS); r++) {
    const keys = budgetHeaderScore(rows[r]);
    if (!keys.has("sku") || !keys.has("periodo") || !keys.has("receita")) continue;
    if (!best || keys.size > best.keys.size) best = { row: r, keys };
  }
  if (!best) return null;
  const header = rows[best.row]!;
  const evidence: string[] = [best.keys.get("sku")!, best.keys.get("periodo")!, best.keys.get("receita")!];
  let score = best.keys.size;
  if (best.keys.has("canal") && best.keys.has("cm")) {
    score += 5;
    evidence.push(best.keys.get("canal")!, best.keys.get("cm")!);
  }

  // A coluna STATUS com "Budget Vendas" é a assinatura do Budget. Pode haver
  // mais de uma coluna "status" (ex.: "Status" vazia e "STATUS" preenchida).
  for (let col = 0; col < header.length; col++) {
    if (normHeader(cellText(header[col])) !== "status") continue;
    let budgetValue: unknown = null;
    if (columnHas(rows, col, best.row + 1, (v) => {
      const hit = normHeader(String(v)).includes("budget");
      if (hit) budgetValue = v;
      return hit;
    })) {
      score += 25;
      evidence.push(`${cellText(header[col])} = "${cellText(budgetValue)}"`);
      break;
    }
  }

  // Colunas que só o KE30 tem afastam o Budget.
  const real = realHeaderScore(header);
  for (const field of KE30_ONLY) if (real.has(field)) score -= 8;
  return { kind: "budget", headerRow: best.row, score, evidence };
}

// ── Ruptura ──────────────────────────────────────────────────────────────

function scoreRuptura(rows: ArrayLike<unknown>[]): KindCandidate | null {
  const head = rows.slice(0, HEADER_SCAN_ROWS).map((row) => Array.from(row ?? []));
  const header = detectRupturaHeader(head);
  if ("error" in header) return null;
  const headerCells = head[header.headerRow];
  const columns = header.columns;
  const evidence = (["sku", "pdv", "result"] as const)
    .map((field) => cellText(headerCells[columns[field]!]))
    .filter(Boolean);
  let score = 20 + Object.keys(columns).length * 2;
  const answers = sampleColumn(rows, columns.result!, header.headerRow + 1);
  if (answers.length > 0) {
    const valid = answers.filter((v) => parseRupturaResult(v) !== null).length;
    if (valid / answers.length >= 0.9) {
      score += 15;
      evidence.push("respostas Sim/Não");
    } else {
      score -= 15;
    }
  }
  return { kind: "ruptura", headerRow: header.headerRow, score, evidence };
}

// ── Helpers de cabeçalho ─────────────────────────────────────────────────

function findHeader(header: ArrayLike<unknown>, test: (key: string) => boolean): number {
  for (let i = 0; i < header.length; i++) if (test(normHeader(cellText(header[i])))) return i;
  return -1;
}

function indexOfField(header: ArrayLike<unknown>, map: Record<string, string>, field: string): number {
  // Mesma regra dos leitores: nomes diferentes no mesmo campo → vale o último.
  let found = -1;
  for (let i = 0; i < header.length; i++) if (map[normHeader(cellText(header[i]))] === field) found = i;
  return found;
}

// ── Classificação ────────────────────────────────────────────────────────

export function classifySheet(rows: ArrayLike<unknown>[]): SheetClassification {
  const candidates = [scoreReal(rows), scoreBudget(rows), scoreRuptura(rows)]
    .filter((c): c is KindCandidate => !!c && c.score > 0)
    .sort((a, b) => b.score - a.score);
  const [first, second] = candidates;
  if (!first || first.score < MIN_SCORE) {
    return { kind: null, headerRow: 0, score: first?.score ?? 0, confidence: "baixa", evidence: [], candidates };
  }
  const margin = first.score - (second?.score ?? 0);
  const confidence: Confidence = first.score >= 20 && margin >= 12 ? "alta" : margin >= 6 ? "media" : "baixa";
  return {
    kind: first.kind,
    headerRow: first.headerRow,
    score: first.score,
    confidence,
    evidence: first.evidence,
    candidates,
  };
}

/** Linha do cabeçalho para um tipo escolhido à mão (correção na revisão). */
export function headerRowFor(classification: SheetClassification, kind: BaseKind): number {
  return classification.candidates.find((c) => c.kind === kind)?.headerRow ?? classification.headerRow;
}
