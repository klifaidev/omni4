// Budget — parser e tipos para a base orçamentária.
// Estrutura esperada (Excel): colunas CANAL, Sku, data, VOLUME, RECEITA, CM, CPV.
// Categoria/marca/faixa de peso/formato são puxados do De Para por SKU
// (mantém alinhamento com a base atual).
import * as XLSX from "xlsx";
import { getDeParaBySku } from "./depara";
import { getInovacao, getLegado } from "./deparaInovacao";
import { getCanalAjustado } from "./deparaComercial";
import { normHeader, parseDecimal, parsePeriod } from "./format";
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

// Header canonical map (normalized → canonical key)
const HEADER_MAP: Record<string, string> = {
  canal: "canal",
  channel: "canal",
  sku: "sku",
  artigo: "sku",
  codigo: "sku",
  codsku: "sku",
  descricaodoproduto: "skuDesc",
  descricaoproduto: "skuDesc",
  descricao: "skuDesc",
  produto: "skuDesc",
  data: "periodo",
  datacorreta: "periodo",
  periodo: "periodo",
  mes: "periodo",
  competencia: "periodo",
  volume: "volume",
  qtde: "volume",
  quantidade: "volume",
  receita: "receita",
  rol: "receita",
  cm: "cm",
  contribuicaomarginal: "cm",
  contribmarginal: "cm",
  cpv: "cpv",
  cmv: "cpv",
  custo: "cpv",
  status: "status",
};

// Identifica linhas de Budget na coluna STATUS (ex.: "1.Budget Vendas").
function isBudgetStatus(raw: unknown): boolean {
  if (raw == null) return false;
  const s = normHeader(String(raw)); // remove acentos, espaços, pontuação, lowercase
  return s.includes("budgetvendas");
}

function dataToPeriod(raw: unknown): ReturnType<typeof parsePeriod> | null {
  if (raw == null || raw === "") return null;
  // Excel often gives a JS Date when cellDates: true.
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    const mes = raw.getMonth() + 1;
    const ano = raw.getFullYear();
    return parsePeriod(`${mes}/${ano}`);
  }
  return parsePeriod(typeof raw === "number" ? raw : String(raw));
}

export async function parseBudgetFile(file: File): Promise<ParsedBudget> {
  const warnings: string[] = [];
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });

  // Pick first sheet by default; prefer "Base_Consolidada" if available.
  const sheetName =
    wb.SheetNames.find((n) => normHeader(n).includes("baseconsolidada")) ?? wb.SheetNames[0];
  if (!sheetName) {
    return {
      rows: [],
      file: { name: file.name, rowCount: 0, months: [], uploadedAt: Date.now() },
      warnings: ["Nenhuma aba encontrada no arquivo."],
    };
  }
  const sheet = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: true,
  });

  if (json.length === 0) {
    return {
      rows: [],
      file: { name: file.name, rowCount: 0, months: [], uploadedAt: Date.now() },
      warnings: [`Aba "${sheetName}" está vazia.`],
    };
  }

  // Build column → canonical key map from first row
  const sample = json[0];
  const colKey: Record<string, string> = {};
  for (const col of Object.keys(sample)) {
    const k = HEADER_MAP[normHeader(col)];
    if (k) colKey[col] = k;
  }
  const required = ["sku", "canal", "periodo", "volume", "receita", "cm"];
  const missingReq = required.filter((r) => !Object.values(colKey).includes(r));
  if (missingReq.length) {
    warnings.push(`Colunas obrigatórias ausentes: ${missingReq.join(", ")}.`);
  }

  const rows: BudgetRow[] = [];
  const monthsSet = new Set<string>();
  let skippedNoPeriod = 0;
  
  let countBudget = 0;
  let countReal = 0;
  const hasStatusCol = Object.values(colKey).includes("status");

  for (const r of json) {
    const norm: Record<string, unknown> = {};
    for (const [col, key] of Object.entries(colKey)) norm[key] = r[col];

    const p = dataToPeriod(norm.periodo);
    if (!p) { skippedNoPeriod++; continue; }

    const sku = norm.sku != null ? String(norm.sku).trim() : undefined;
    const canal = norm.canal ? String(norm.canal).trim() : undefined;
    const skuDescRaw = norm.skuDesc ? String(norm.skuDesc).trim() : undefined;
    const statusRaw = norm.status != null ? String(norm.status).trim() : undefined;

    const dep = sku ? getDeParaBySku(sku) : null;

    const volumeKg = parseDecimal(norm.volume);
    const receita = parseDecimal(norm.receita);
    const cm = parseDecimal(norm.cm);
    const cpv = parseDecimal(norm.cpv);

    // Importa todas as linhas com período válido — inclusive zeradas e negativas.

    // Sem coluna STATUS: assume Budget (compatibilidade com bases antigas).
    const kind: "budget" | "real" = !hasStatusCol || isBudgetStatus(statusRaw) ? "budget" : "real";
    if (kind === "budget") countBudget++; else countReal++;

    rows.push({
      periodo: p.periodo,
      mes: p.mes,
      ano: p.ano,
      fy: p.fy,
      fyNum: p.fyNum,
      status: statusRaw,
      kind,
      canal,
      canalAjustado: getCanalAjustado(canal) ?? undefined,
      sku,
      skuDesc: dep?.skuDesc ?? skuDescRaw,
      categoria: dep?.categoria,
      subcategoria: dep?.subcategoria,
      marca: dep?.marca,
      tecnologia: dep?.tecnologia,
      formato: dep?.formato,
      mercado: dep?.mercado,
      faixaPeso: dep?.faixaPeso,
      sabor: dep?.sabor,
      inovacao: getInovacao(sku),
      legado: getLegado(sku),
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
      name: file.name,
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
