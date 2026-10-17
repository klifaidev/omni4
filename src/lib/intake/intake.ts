// Entrada de bases — um caminho só para Base One, CSV do KE30 e planilhas
// avulsas de Budget ou Ruptura.
//
// 1. ler: o worker abre a planilha e reconhece cada aba pelo conteúdo;
// 2. revisar: cada aba vira uma "parte" (Real, Budget, Ruptura ou ignorada),
//    já lida, com os meses que traz — a pessoa pode corrigir o tipo;
// 3. aplicar: meses repetidos são substituídos ou mantidos (escolha da
//    pessoa, que pode virar padrão) e, no app instalado, cada parte é gravada
//    no formato compacto (.omnib) — nunca a planilha original.
import { parseBudgetFile, parseBudgetTable, budgetPeriodColumn, budgetPeriodOf, type ParsedBudget } from "@/lib/budget";
import { parseCsvFile, parseRealTable, realPeriodColumn, type ParsedCsv } from "@/lib/csv";
import { monthLabel, parsePeriod } from "@/lib/format";
import { buildRupturaModel, detectRupturaHeader, parseWallClock } from "@/lib/ruptura/parse";
import type { RupturaModel } from "@/lib/ruptura/types";
import { saveProcessedBaseInBackground } from "@/lib/processedBaseCache";
import { useBudget } from "@/store/budget";
import { usePricing } from "@/store/pricing";
import { useRuptura } from "@/store/ruptura";
import type { IntakeWorkerResponse, IntakeWorkerSheet } from "@/workers/workbookIntake.worker";
import { headerRowFor, type BaseKind, type Confidence, type SheetClassification } from "./classify";
import {
  compactAllRows,
  compactCell,
  decodeCompactTable,
  encodeCompactTable,
  filterCompactRows,
  isCompactTableName,
  COMPACT_TABLE_EXTENSION,
  type CompactTable,
} from "./compactTable";

export type { BaseKind } from "./classify";

export const KIND_LABEL: Record<BaseKind, string> = {
  real: "Real",
  budget: "Budget",
  ruptura: "Ruptura",
};

/** Pasta das bases salvas no app instalado. */
const KIND_TIPO: Record<BaseKind, "ke30" | "budget" | "ruptura"> = {
  real: "ke30",
  budget: "budget",
  ruptura: "ruptura",
};

export interface IntakeProgress {
  label: string;
  fraction: number | null;
}

export interface IntakePart {
  id: string;
  /** Aba de origem (null no CSV). */
  sheetName: string | null;
  /** O que o reconhecimento achou. */
  detected: BaseKind | null;
  /** O que vai ser aplicado (a pessoa pode corrigir; null = ignorar). */
  kind: BaseKind | null;
  confidence: Confidence;
  evidence: string[];
  classification?: SheetClassification;
  table?: CompactTable;
  /** .omnib codificado para o tipo detectado. */
  stored?: Uint8Array;
  dataRows: number;
  real?: ParsedCsv;
  budget?: ParsedBudget;
  ruptura?: RupturaModel;
  /** Meses que a parte traz ("AAAA-MM", em ordem). */
  months: string[];
  warnings: string[];
  error?: string;
}

export interface IntakeFile {
  id: string;
  file: File;
  status: "reading" | "ready" | "error" | "applied";
  progress?: IntakeProgress;
  parts: IntakePart[];
  error?: string;
}

let seq = 0;
export const intakeId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${++seq}`;

// ── Meses ────────────────────────────────────────────────────────────────

/** "009.2026" → "2026-09". */
export function periodToMonth(periodo: string): string {
  const [mes, ano] = periodo.split(".");
  return `${ano}-${mes.slice(-2).padStart(2, "0")}`;
}

/** "2026-09" → "Set/2026" (mesmo rótulo do resto do app). */
export function monthKeyLabel(month: string): string {
  const [ano, mes] = month.split("-").map((x) => parseInt(x, 10));
  return monthLabel(mes, ano);
}

/** "Abr/2025 – Mar/2027" ou só "Set/2026". */
export function monthRangeLabel(months: string[]): string {
  if (months.length === 0) return "sem meses";
  const first = monthKeyLabel(months[0]);
  if (months.length === 1) return first;
  return `${first} – ${monthKeyLabel(months[months.length - 1])}`;
}

/** Meses que já estão carregados no app, por tipo de base. */
export function loadedMonths(kind: BaseKind): Set<string> {
  if (kind === "real") return new Set(usePricing.getState().files.flatMap((f) => f.months).map(periodToMonth));
  if (kind === "budget") return new Set(useBudget.getState().files.flatMap((f) => f.months).map(periodToMonth));
  return new Set(useRuptura.getState().model?.months ?? []);
}

// ── Ler ──────────────────────────────────────────────────────────────────

function isCsv(file: File) {
  return file.name.toLowerCase().endsWith(".csv");
}

function readWorkbookInWorker(file: File, buffer: ArrayBuffer, onProgress: (p: IntakeProgress) => void): Promise<IntakeWorkerSheet[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../../workers/workbookIntake.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<IntakeWorkerResponse>) => {
      const msg = event.data;
      if (msg.type === "progress") {
        onProgress({ label: msg.label, fraction: msg.fraction });
        return;
      }
      worker.terminate();
      if (msg.type === "done") resolve(msg.sheets);
      else reject(new Error(msg.message));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "Falha ao ler a planilha."));
    };
    worker.postMessage({ buffer, fileName: file.name, fileBytes: file.size }, [buffer]);
  });
}

/** Lê um arquivo e devolve as partes reconhecidas, já lidas. */
export async function readIntakeFile(file: File, onProgress: (p: IntakeProgress) => void): Promise<IntakePart[]> {
  if (isCsv(file)) {
    onProgress({ label: "Lendo o CSV", fraction: null });
    const real = await parseCsvFile(file);
    if (real.rows.length === 0) throw new Error(real.warnings[0] ?? "Nenhuma linha válida no CSV.");
    return [{
      id: intakeId("part"),
      sheetName: null,
      detected: "real",
      kind: "real",
      confidence: "alta",
      evidence: ["CSV do KE30"],
      dataRows: real.rows.length,
      real,
      months: real.file.months.map(periodToMonth).sort(),
      warnings: real.warnings,
    }];
  }
  const sheets = await readWorkbookInWorker(file, await file.arrayBuffer(), onProgress);
  onProgress({ label: "Conferindo os meses de cada base", fraction: null });
  return sheets.map((sheet) => resolvePart({
    id: intakeId("part"),
    sheetName: sheet.sheetName,
    detected: sheet.classification.kind,
    kind: sheet.classification.kind,
    confidence: sheet.classification.confidence,
    evidence: sheet.classification.evidence,
    classification: sheet.classification,
    table: sheet.table,
    stored: sheet.stored,
    dataRows: sheet.dataRows,
    ruptura: sheet.ruptura,
    months: [],
    warnings: [],
  }, file.name));
}

/** Cabeçalho + linhas de dados da tabela, para o tipo escolhido. */
function tableFor(part: IntakePart, kind: BaseKind): { headers: string[]; rows: unknown[][]; all: unknown[][] } {
  const all = compactAllRows(part.table!);
  const headerRow = part.classification ? headerRowFor(part.classification, kind) : part.table!.head.length - 1;
  return {
    headers: (all[headerRow] ?? []).map((h) => String(h ?? "").trim()),
    rows: all.slice(headerRow + 1),
    all,
  };
}

/** Lê a parte como o tipo escolhido (`part.kind`). */
export function resolvePart(part: IntakePart, fileName: string): IntakePart {
  const next: IntakePart = { ...part, real: undefined, budget: undefined, months: [], warnings: [], error: undefined };
  if (part.kind === null || !part.table) {
    if (part.kind === "real" && part.real) return { ...next, real: part.real, months: part.months, warnings: part.warnings };
    return next;
  }
  try {
    if (part.kind === "real") {
      const { headers, rows } = tableFor(part, "real");
      const real = parseRealTable(headers, rows, fileName);
      if (real.rows.length === 0) return { ...next, error: real.warnings[real.warnings.length - 1] ?? "Nenhuma linha válida." };
      return { ...next, ruptura: undefined, real, months: real.file.months.map(periodToMonth).sort(), warnings: real.warnings };
    }
    if (part.kind === "budget") {
      const { headers, rows } = tableFor(part, "budget");
      const budget = parseBudgetTable(headers, rows, fileName);
      if (budget.rows.length === 0) return { ...next, error: budget.warnings[0] ?? "Nenhuma linha válida." };
      return { ...next, ruptura: undefined, budget, months: budget.file.months.map(periodToMonth).sort(), warnings: budget.warnings };
    }
    let ruptura = part.detected === "ruptura" ? part.ruptura : undefined;
    if (!ruptura) {
      const { all } = tableFor(part, "ruptura");
      const header = detectRupturaHeader(all.slice(0, 30));
      if ("error" in header) return { ...next, error: header.error };
      ruptura = buildRupturaModel(all, header, { fileName, sheetName: part.sheetName ?? "" });
    }
    if (ruptura.cells.month.length === 0) return { ...next, error: "Nenhuma avaliação válida (Sim/Não com SKU, PDV e data)." };
    return { ...next, ruptura, months: [...ruptura.months] };
  } catch (err) {
    return { ...next, error: err instanceof Error ? err.message : "Falha ao ler esta aba." };
  }
}

// ── Aplicar ──────────────────────────────────────────────────────────────

export type DuplicateChoice = "replace" | "keep";
export type DuplicatePolicy = "ask" | DuplicateChoice;

const POLICY_KEY = "omni4.bases.duplicatePolicy";

export function getDuplicatePolicy(): DuplicatePolicy {
  try {
    const v = window.localStorage.getItem(POLICY_KEY);
    return v === "replace" || v === "keep" ? v : "ask";
  } catch {
    return "ask";
  }
}

export function setDuplicatePolicy(policy: DuplicatePolicy) {
  try {
    if (policy === "ask") window.localStorage.removeItem(POLICY_KEY);
    else window.localStorage.setItem(POLICY_KEY, policy);
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
}

export interface DuplicateInfo {
  part: IntakePart;
  fileName: string;
  kind: BaseKind;
  months: string[];
}

/** Partes que trazem meses já carregados no app. */
export function findDuplicates(files: IntakeFile[]): DuplicateInfo[] {
  const out: DuplicateInfo[] = [];
  for (const file of files) {
    for (const part of file.parts) {
      if (!part.kind || part.error) continue;
      const loaded = loadedMonths(part.kind);
      const months = part.months.filter((m) => loaded.has(m));
      if (months.length) out.push({ part, fileName: file.file.name, kind: part.kind, months });
    }
  }
  return out;
}

/** Nome do arquivo gravado: pelo conteúdo, então reimportar o mesmo mês sobrescreve. */
export function storedNameFor(kind: BaseKind, months: string[]): string {
  const range = months.length <= 1 ? months[0] ?? "sem-mes" : `${months[0]} a ${months[months.length - 1]}`;
  return `${KIND_LABEL[kind]} ${range}${COMPACT_TABLE_EXTENSION}`;
}

/** Mês ("AAAA-MM") de cada linha de dados da tabela, para filtrar por mês. */
function rowMonthOf(part: IntakePart, kind: BaseKind): (row: number) => string | null {
  const table = part.table!;
  const headerRow = part.classification ? headerRowFor(part.classification, kind) : table.head.length - 1;
  // Linhas entre o fim de `head` e o cabeçalho deste tipo (raro) contam como dado.
  const offset = headerRow + 1 - table.head.length;
  const headers = (compactAllRows({ ...table, rowCount: 0 })[headerRow] ?? []).map((h) => String(h ?? "").trim());
  if (kind === "real") {
    const col = realPeriodColumn(headers);
    return (row) => {
      const p = parsePeriod(String(compactCell(table, row, col) ?? ""));
      return row < offset || !p ? null : periodToMonth(p.periodo);
    };
  }
  if (kind === "budget") {
    const col = budgetPeriodColumn(headers);
    return (row) => {
      const p = budgetPeriodOf(compactCell(table, row, col));
      return row < offset || !p ? null : periodToMonth(p);
    };
  }
  const head = compactAllRows({ ...table, rowCount: 0 });
  const header = detectRupturaHeader(head.slice(0, 30));
  if ("error" in header) return () => null;
  const c = header.columns;
  return (row) => {
    const pick = (col: number | undefined) => (col === undefined ? null : parseWallClock(compactCell(table, row, col)));
    const ts = pick(c.anoMes) ?? pick(c.data) ?? pick(c.dataHora);
    if (ts === null) return null;
    const d = new Date(ts);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
}

export interface ApplyResult {
  applied: Array<{ kind: BaseKind; months: string[]; rows: number }>;
  skipped: Array<{ kind: BaseKind; reason: string }>;
  saved: number;
  savedBytes: number;
  saveErrors: string[];
}

function bases() {
  return window.electronAPI?.bases ?? null;
}

function bytesToBase64(bytes: Uint8Array): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(new Blob([bytes]));
  });
}

async function storedBytesFor(part: IntakePart, kind: BaseKind, keepMonths: Set<string> | null, sourceName: string): Promise<Uint8Array | null> {
  if (!part.table) return null;
  if (!keepMonths && part.stored && part.detected === kind) return part.stored;
  const monthOf = rowMonthOf(part, kind);
  const table = keepMonths ? filterCompactRows(part.table, (row) => keepMonths.has(monthOf(row) ?? "")) : part.table;
  if (table.rowCount === 0) return null;
  return encodeCompactTable(table, {
    kind,
    sourceName,
    sheetName: part.sheetName ?? "",
    createdAt: new Date().toISOString(),
  });
}

/**
 * Aplica as partes no app e, no app instalado, grava cada uma convertida.
 * `choice` decide o que fazer com meses que já estão carregados.
 */
export async function applyIntake(files: IntakeFile[], choice: DuplicateChoice): Promise<ApplyResult> {
  const result: ApplyResult = { applied: [], skipped: [], saved: 0, savedBytes: 0, saveErrors: [] };
  const api = bases();

  for (const file of files) {
    for (const part of file.parts) {
      const kind = part.kind;
      if (!kind || part.error) continue;
      const loaded = loadedMonths(kind);
      const keep = choice === "keep" ? new Set(part.months.filter((m) => !loaded.has(m))) : null;
      const months = keep ? part.months.filter((m) => keep.has(m)) : part.months;
      if (months.length === 0) {
        result.skipped.push({ kind, reason: `${KIND_LABEL[kind]}: todos os meses já estavam carregados` });
        continue;
      }
      const storedName = part.sheetName === null ? file.file.name : storedNameFor(kind, months);

      if (kind === "real" && part.real) {
        const periods = new Set(months.map((m) => `0${m.slice(5)}.${m.slice(0, 4)}`));
        const rows = keep ? part.real.rows.filter((r) => periods.has(r.periodo)) : part.real.rows;
        const parsed: ParsedCsv = { ...part.real, rows, file: { ...part.real.file, name: storedName, rowCount: rows.length, months: [...periods].sort() } };
        const before = usePricing.getState().files;
        usePricing.getState().addParsed(parsed.rows, parsed.file, true, parsed.missing);
        result.applied.push({ kind, months, rows: rows.length });
        if (api) {
          await persist(api, kind, part, keep, file.file, storedName, result);
          saveProcessedBaseInBackground("ke30", storedName, "ke30-parsed-csv", parsed);
          await removeSuperseded(api, "ke30", before.map((f) => ({ name: f.name, months: f.months })), parsed.file.months, storedName);
        }
      } else if (kind === "budget" && part.budget) {
        const periods = new Set(months.map((m) => `0${m.slice(5)}.${m.slice(0, 4)}`));
        const rows = keep ? part.budget.rows.filter((r) => periods.has(r.periodo)) : part.budget.rows;
        const parsed: ParsedBudget = { ...part.budget, rows, file: { ...part.budget.file, name: storedName, rowCount: rows.length, months: [...periods].sort() } };
        const before = useBudget.getState().files;
        useBudget.getState().addBudget(parsed.rows, parsed.file, true);
        result.applied.push({ kind, months, rows: rows.length });
        if (api) {
          await persist(api, kind, part, keep, file.file, storedName, result);
          saveProcessedBaseInBackground("budget", storedName, "budget-parsed-xlsx", parsed);
          await removeSuperseded(api, "budget", before.map((f) => ({ name: f.name, months: f.months })), parsed.file.months, storedName);
        }
      } else if (kind === "ruptura" && part.ruptura) {
        const bytes = api ? await storedBytesFor(part, kind, keep, file.file.name) : null;
        await useRuptura.getState().mergeIncoming(part.ruptura, {
          replaceExisting: choice === "replace",
          stored: bytes ? { name: storedName, bytes } : undefined,
        });
        if (bytes) {
          result.saved++;
          result.savedBytes += bytes.byteLength;
        }
        result.applied.push({ kind, months, rows: part.dataRows });
      }
    }
  }
  return result;
}

async function persist(
  api: NonNullable<ReturnType<typeof bases>>,
  kind: BaseKind,
  part: IntakePart,
  keep: Set<string> | null,
  source: File,
  storedName: string,
  result: ApplyResult,
) {
  try {
    // CSV do KE30 já é leve: guarda o próprio arquivo, como sempre.
    const bytes = part.table
      ? await storedBytesFor(part, kind, keep, source.name)
      : new Uint8Array(await source.arrayBuffer());
    if (!bytes) return;
    const saved = await api.salvar(KIND_TIPO[kind], storedName, await bytesToBase64(bytes));
    if (!saved.ok) throw new Error(saved.erro ?? "falha ao gravar");
    result.saved++;
    result.savedBytes += bytes.byteLength;
  } catch (err) {
    result.saveErrors.push(`${KIND_LABEL[kind]}: ${err instanceof Error ? err.message : "falha ao gravar"}`);
  }
}

/**
 * Arquivos gravados cujos meses foram TODOS substituídos agora saem do disco —
 * sem isso, o arquivo antigo e o novo seriam lidos na próxima abertura. Só
 * conta arquivo que estava carregado (com meses conhecidos): o que não estava
 * em memória nunca é apagado.
 */
async function removeSuperseded(
  api: NonNullable<ReturnType<typeof bases>>,
  tipo: "ke30" | "budget",
  before: Array<{ name: string; months: string[] }>,
  newPeriods: string[],
  keepName: string,
) {
  const replaced = new Set(newPeriods);
  for (const file of before) {
    if (file.name === keepName || file.months.length === 0) continue;
    if (file.months.every((m) => replaced.has(m))) {
      await api.deletar(tipo, file.name).catch(() => undefined);
    }
  }
}

// ── Reabrir o que foi gravado ────────────────────────────────────────────

/** Lê um arquivo salvo da base Real (CSV do KE30 ou .omnib). */
export async function parseSavedRealFile(file: File): Promise<ParsedCsv> {
  if (!isCompactTableName(file.name)) return parseCsvFile(file);
  const { table } = await decodeCompactTable(await file.arrayBuffer());
  const all = compactAllRows(table);
  const headerRow = table.head.length - 1;
  return parseRealTable((all[headerRow] ?? []).map((h) => String(h ?? "").trim()), all.slice(headerRow + 1), file.name);
}

/** Lê um arquivo salvo do Budget (XLSX ou .omnib). */
export async function parseSavedBudgetFile(file: File): Promise<ParsedBudget> {
  if (!isCompactTableName(file.name)) return parseBudgetFile(file);
  const { table } = await decodeCompactTable(await file.arrayBuffer());
  const all = compactAllRows(table);
  const headerRow = table.head.length - 1;
  return parseBudgetTable((all[headerRow] ?? []).map((h) => String(h ?? "")), all.slice(headerRow + 1), file.name);
}
