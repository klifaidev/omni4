// Budget — parser e tipos para a base orçamentária.
// Estrutura esperada (Excel): colunas CANAL, Sku, data, VOLUME, RECEITA, CM, CPV.
// Categoria/marca/faixa de peso/formato são puxados do De Para por SKU
// (mantém alinhamento com a base atual).
import * as XLSX from "xlsx";
import { getDeParaBySku } from "./depara";
import { getInovacao, getLegado } from "./deparaInovacao";
import { getCanalAjustado } from "./deparaComercial";
import { normHeader, parseDecimal, parsePeriod } from "./format";
import { createStringInterner, internTrimmed } from "./stringIntern";
import { BUDGET_HEADER_MAP as HEADER_MAP } from "./intake/headerMaps";
import type { Filters } from "./types";

export interface BudgetRow {
  periodo: string;     // "005.2025"
  mes: number;
  ano: number;
  fy: string;
  fyNum: number;
  /** STATUS bruto da linha (ex.: "1.Budget Vendas", "2.Real Vendas") */
  status?: string;
  /** Classificação derivada do STATUS: "budget" (1.Budget Vendas) | "real" (qualquer outro) */
  kind: "budget" | "real";
  canal?: string;
  canalAjustado?: string; // derivado via De Para Comercial
  sku?: string;
  skuDesc?: string;
  categoria?: string;
  subcategoria?: string;
  marca?: string;
  tecnologia?: string;
  formato?: string;
  mercado?: string;
  faixaPeso?: string;
  sabor?: string;
  inovacao?: string; // "Inovação" | "Regular"
  legado?: string;   // ex.: "1A", "2A", "3A"
  volumeKg: number;    // VOLUME
  receita: number;     // RECEITA
  cm: number;          // Contribuição Marginal
  cpv: number;         // CPV
}

export interface BudgetFile {
  name: string;
  rowCount: number;
  months: string[];
  uploadedAt: number;
}

export interface ParsedBudget {
  rows: BudgetRow[];
  file: BudgetFile;
  warnings: string[];
}


// Identifica linhas de Budget na coluna STATUS (ex.: "1.Budget Vendas").
function isBudgetStatus(raw: unknown): boolean {
  if (raw == null) return false;
  const s = normHeader(String(raw)); // remove acentos, espaços, pontuação, lowercase
  return s.includes("budgetvendas");
}

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

function dataToPeriod(raw: unknown): ReturnType<typeof parsePeriod> | null {
  if (raw == null || raw === "") return null;
  // Excel often gives a JS Date when cellDates: true.
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    const mes = raw.getMonth() + 1;
    const ano = raw.getFullYear();
    return parsePeriod(`${mes}/${ano}`);
  }
  // Data serial do Excel (planilha lida sem cellDates, ex.: Base One) — pode
  // vir com fração de hora. Conta em UTC: não depende do fuso da máquina.
  if (typeof raw === "number" && raw > 30000 && raw < 80000) {
    const date = new Date(EXCEL_EPOCH_MS + Math.floor(raw) * 86_400_000);
    return parsePeriod(`${date.getUTCMonth() + 1}/${date.getUTCFullYear()}`);
  }
  return parsePeriod(typeof raw === "number" ? raw : String(raw));
}

export async function parseBudgetFile(file: File): Promise<ParsedBudget> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });

  // Pick first sheet by default; prefer "Base_Consolidada" if available.
  const sheetName =
    wb.SheetNames.find((n) => normHeader(n).includes("baseconsolidada")) ?? wb.SheetNames[0];
  if (!sheetName) {
    return emptyBudget(file.name, "Nenhuma aba encontrada no arquivo.");
  }
  const table = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
    header: 1,
    defval: "",
    raw: true,
    blankrows: false,
  });
  const [header = [], ...dataRows] = table;
  if (dataRows.length === 0) {
    return emptyBudget(file.name, `Aba "${sheetName}" está vazia.`);
  }
  return parseBudgetTable(header.map((h) => String(h ?? "")), dataRows, file.name);
}

function emptyBudget(name: string, warning: string): ParsedBudget {
  return {
    rows: [],
    file: { name, rowCount: 0, months: [], uploadedAt: Date.now() },
    warnings: [warning],
  };
}

/**
 * Coluna → campo do Budget. Cabeçalhos com o MESMO texto valem pela primeira
 * ocorrência; nomes diferentes que caem no mesmo campo, pela última (ex.:
 * "data" e "Data correta" → vale "Data correta").
 */
export function mapBudgetColumns(headers: string[]): Map<number, string> {
  const colKey = new Map<number, string>();
  const seenText = new Set<string>();
  const fieldCol = new Map<string, number>();
  headers.forEach((rawHeader, index) => {
    const text = String(rawHeader ?? "");
    const key = HEADER_MAP[normHeader(text)];
    if (!key || seenText.has(text)) return;
    seenText.add(text);
    const previous = fieldCol.get(key);
    if (previous !== undefined) colKey.delete(previous);
    fieldCol.set(key, index);
    colKey.set(index, key);
  });
  return colKey;
}

function isBlankRow(row: ArrayLike<unknown>): boolean {
  for (let i = 0; i < row.length; i++) {
    const v = row[i];
    if (v !== null && v !== undefined && v !== "") return false;
  }
  return true;
}

/** Índice da coluna de data do Budget (ou -1). */
export function budgetPeriodColumn(headers: string[]): number {
  for (const [index, key] of mapBudgetColumns(headers)) if (key === "periodo") return index;
  return -1;
}

/** Período ("005.2025") de um valor da coluna de data do Budget. */
export function budgetPeriodOf(raw: unknown): string | null {
  return dataToPeriod(raw)?.periodo ?? null;
}

/**
 * Lê o Budget a partir de uma tabela (cabeçalho + linhas). Usado pelo XLSX do
 * Budget e pelas abas reconhecidas como Budget numa Base One.
 */
export function parseBudgetTable(headers: string[], dataRows: ArrayLike<unknown>[], fileName: string): ParsedBudget {
  const intern = createStringInterner();
  const warnings: string[] = [];
  const colKey = mapBudgetColumns(headers);
  const keys = new Set(colKey.values());
  const columns = Array.from(colKey.entries());
  const required = ["sku", "canal", "periodo", "volume", "receita", "cm"];
  const missingReq = required.filter((r) => !keys.has(r));
  if (missingReq.length) {
    warnings.push(`Colunas obrigatórias ausentes: ${missingReq.join(", ")}.`);
  }

  const rows: BudgetRow[] = [];
  const monthsSet = new Set<string>();
  let skippedNoPeriod = 0;

  let countBudget = 0;
  let countReal = 0;
  const hasStatusCol = keys.has("status");

  for (const r of dataRows) {
    if (!r || isBlankRow(r)) continue;
    const norm: Record<string, unknown> = {};
    // Célula vazia vira "" — como o leitor de XLSX sempre entregou (defval).
    for (const [index, key] of columns) norm[key] = r[index] ?? "";

    const p = dataToPeriod(norm.periodo);
    if (!p) { skippedNoPeriod++; continue; }

    const sku = norm.sku != null ? internTrimmed(norm.sku, intern) : undefined;
    const canal = norm.canal ? internTrimmed(norm.canal, intern) : undefined;
    const skuDescRaw = norm.skuDesc ? internTrimmed(norm.skuDesc, intern) : undefined;
    const statusRaw = norm.status != null ? internTrimmed(norm.status, intern) : undefined;

    const dep = sku ? getDeParaBySku(sku) : null;
    const legado = getLegado(sku);

    const volumeKg = parseDecimal(norm.volume);
    const receita = parseDecimal(norm.receita);
    const cm = parseDecimal(norm.cm);
    const cpv = parseDecimal(norm.cpv);

    // Importa todas as linhas com período válido — inclusive zeradas e negativas.

    // Sem coluna STATUS: assume Budget (compatibilidade com bases antigas).
    const kind: "budget" | "real" = !hasStatusCol || isBudgetStatus(statusRaw) ? "budget" : "real";
    if (kind === "budget") countBudget++; else countReal++;

    rows.push({
      periodo: intern(p.periodo),
      mes: p.mes,
      ano: p.ano,
      fy: intern(p.fy),
      fyNum: p.fyNum,
      status: statusRaw,
      kind,
      canal,
      canalAjustado: canal ? intern(getCanalAjustado(canal) ?? "") || undefined : undefined,
      sku,
      skuDesc: dep?.skuDesc ? intern(dep.skuDesc) : skuDescRaw,
      categoria: dep?.categoria ? intern(dep.categoria) : undefined,
      subcategoria: dep?.subcategoria ? intern(dep.subcategoria) : undefined,
      marca: dep?.marca ? intern(dep.marca) : undefined,
      tecnologia: dep?.tecnologia ? intern(dep.tecnologia) : undefined,
      formato: dep?.formato ? intern(dep.formato) : undefined,
      mercado: dep?.mercado ? intern(dep.mercado) : undefined,
      faixaPeso: dep?.faixaPeso ? intern(dep.faixaPeso) : undefined,
      sabor: dep?.sabor ? intern(dep.sabor) : undefined,
      inovacao: intern(getInovacao(sku)),
      legado: legado ? intern(legado) : undefined,
      volumeKg,
      receita,
      cm,
      cpv,
    });
    monthsSet.add(p.periodo);
  }

  if (!hasStatusCol) {
    warnings.push(`Coluna "STATUS" não encontrada — todas as linhas foram tratadas como Budget.`);
  } else {
    warnings.push(
      `Importado: ${countBudget.toLocaleString("pt-BR")} linha(s) Budget (STATUS = "1.Budget Vendas") + ` +
      `${countReal.toLocaleString("pt-BR")} linha(s) Real (demais STATUS). ` +
      `A separação Real/Budget é aplicada na aba Budget.`,
    );
  }
  if (skippedNoPeriod) warnings.push(`${skippedNoPeriod} linha(s) sem data válida foram ignoradas.`);
  

  return {
    rows,
    file: {
      name: fileName,
      rowCount: rows.length,
      months: Array.from(monthsSet).sort(),
      uploadedAt: Date.now(),
    },
    warnings,
  };
}

// Aggregations -----------------------------------------------------

export interface BudgetTotals {
  receita: number;
  volumeKg: number;
  cm: number;
  cpv: number;
}

export function aggregateBudget(rows: BudgetRow[]): BudgetTotals {
  let receita = 0, volumeKg = 0, cm = 0, cpv = 0;
  for (const r of rows) {
    receita += r.receita;
    volumeKg += r.volumeKg;
    cm += r.cm;
    cpv += r.cpv;
  }
  return { receita, volumeKg, cm, cpv };
}

// Filtros aplicáveis ao Budget.
// SKU/Produto: todos os atributos vindos do De Para por SKU.
// Comercial: APENAS canalAjustado (UF/Regional/Mercado Ajustado vêm da
// Região do CSV Real e não existem na base Budget).
export const BUDGET_FILTER_KEYS = new Set([
  "categoria", "subcategoria", "marca", "tecnologia", "formato",
  "mercado", "faixaPeso", "sabor", "sku", "inovacao", "legado",
  "canalAjustado",
]);

export function applyBudgetFilters(
  rows: BudgetRow[],
  filters: Filters,
  selectedPeriods: string[] | null,
): BudgetRow[] {
  return rows.filter((r) => {
    if (selectedPeriods && selectedPeriods.length && !selectedPeriods.includes(r.periodo)) return false;
    for (const [k, vals] of Object.entries(filters)) {
      if (!vals || vals.length === 0) continue;
      if (!BUDGET_FILTER_KEYS.has(k)) continue; // ignora filtros não suportados
      const v = (r as unknown as Record<string, unknown>)[k] as string | undefined;
      if (!v || !vals.includes(v)) return false;
    }
    return true;
  });
}

/** Mesmas linhas do DRE que têm equivalente direto no Budget (as demais não têm dado de Budget). */
export function getBudgetLineValue(lineId: string, a: BudgetTotals): number | null {
  const safe = (n: number, d: number) => (d > 0 ? n / d : 0);
  switch (lineId) {
    case "vol": return a.volumeKg;
    case "rol": return a.receita;
    case "rolKg": return safe(a.receita, a.volumeKg);
    case "cm": return a.cm;
    case "cmPct": return safe(a.cm, a.receita);
    case "cmKg": return safe(a.cm, a.volumeKg);
    default: return null;
  }
}
