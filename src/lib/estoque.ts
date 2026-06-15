import * as XLSX from "xlsx";
import { normHeader, parseDecimal } from "./format";

export type EstoqueStatus = "bloqueado" | "critico" | "atencao" | "monitorar" | "revisar";

export interface EstoqueRow {
  codMaterial: string;
  material: string;
  negocio: string;
  negocioGrupo: "retail" | "industria" | "exportacao" | "outros";
  shelfPrazoDias: number | null;
  shelfRaw: string;
  cd: string;
  lote: string;
  producao?: string;
  vencimento: string | null;
  qtCxs: number;
  reprocessavel: boolean | null;
  embalagem: {
    raw: string | null;
    unidadesPorCaixa: number | null;
    pesoUnitario: number | null;
    unidade: string | null;
    kgPorCaixa: number | null;
    confianca: "ok" | "revisar";
  };
  diasAteVencimento: number | null;
  folgaShelfDias: number | null;
  kgEstoque: number | null;
  tonEstoque: number | null;
  status: EstoqueStatus;
}

export interface EstoqueFile {
  name: string;
  rowCount: number;
  uploadedAt: number;
}

export interface ParsedEstoque {
  rows: EstoqueRow[];
  file: EstoqueFile;
  warnings: string[];
}

const HEADER_MAP: Record<string, string> = {
  coddomaterial: "codMaterial",
  codmaterial: "codMaterial",
  codigo: "codMaterial",
  material: "material",
  negocio: "negocio",
  prazovencimentodoshelf: "shelf",
  prazovencimentoshelf: "shelf",
  volton: "volTon",
  cd: "cd",
  lotes: "lote",
  lote: "lote",
  producao: "producao",
  vencimento: "vencimento",
  qtcxs: "qtCxs",
  caixas: "qtCxs",
  ereprocessavel: "reprocessavel",
  reprocessavel: "reprocessavel",
};

function excelDateToIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && value > 30000 && value < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30 + value));
    return d.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (!s || s.toLowerCase() === "vazio") return null;
  const br = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (br) {
    const day = parseInt(br[1], 10);
    const month = parseInt(br[2], 10);
    let year = parseInt(br[3], 10);
    if (year < 100) year += 2000;
    const d = new Date(Date.UTC(year, month - 1, day));
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function daysBetween(from: Date, iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  const base = new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate()));
  return Math.floor((d.getTime() - base.getTime()) / 86400000);
}

export function parseShelfDays(raw: unknown): number | null {
  const s = String(raw ?? "").trim();
  const m = s.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

export function normalizeNegocio(raw: unknown): EstoqueRow["negocioGrupo"] {
  const s = normHeader(String(raw ?? ""));
  if (s.includes("retail") || s.includes("lancamentos") || s.includes("b2b4c")) return "retail";
  if (s.includes("industria")) return "industria";
  if (s.includes("export")) return "exportacao";
  return "outros";
}

export function parseReprocessavel(raw: unknown): boolean | null {
  const s = normHeader(String(raw ?? ""));
  if (!s || s === "nd") return null;
  if (s === "sim" || s === "s") return true;
  if (s === "nao" || s === "n") return false;
  return null;
}

export function parseMaterialPack(material: string): EstoqueRow["embalagem"] {
  const text = material ?? "";
  const match = [...text.matchAll(/(\d+(?:[,.]\d+)?)\s*[xX]\s*(\d+(?:[,.]\d+)?)\s*(KG|G|GR|ML|L)\b/gi)].pop()
    ?? [...text.matchAll(/(\d+(?:[,.]\d+)?)\s*[xX]\s*(\d+(?:[,.]\d+)?)\s*(KG|G|GR|ML|L)(?=[A-Z]{2,}\b|$)/gi)].pop();
  if (!match) {
    return { raw: null, unidadesPorCaixa: null, pesoUnitario: null, unidade: null, kgPorCaixa: null, confianca: "revisar" };
  }
  const unidades = parseDecimal(match[1]);
  const peso = parseDecimal(match[2]);
  const unidade = match[3].toUpperCase() === "GR" ? "G" : match[3].toUpperCase();
  let kgPorCaixa: number | null = null;
  if (unidade === "KG") kgPorCaixa = unidades * peso;
  if (unidade === "G") kgPorCaixa = (unidades * peso) / 1000;
  if (unidade === "L" || unidade === "ML") kgPorCaixa = null;
  return {
    raw: match[0],
    unidadesPorCaixa: unidades || null,
    pesoUnitario: peso || null,
    unidade,
    kgPorCaixa,
    confianca: kgPorCaixa && kgPorCaixa > 0 ? "ok" : "revisar",
  };
}

export function estoqueStatus(folgaShelfDias: number | null, shelfPrazoDias: number | null, vencimento: string | null): EstoqueStatus {
  if (!vencimento || shelfPrazoDias == null || folgaShelfDias == null) return "revisar";
  if (folgaShelfDias <= 0) return "bloqueado";
  if (folgaShelfDias <= 30) return "critico";
  if (folgaShelfDias <= 60) return "atencao";
  return "monitorar";
}

export async function parseEstoqueFile(file: File, today = new Date()): Promise<ParsedEstoque> {
  const warnings: string[] = [];
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames.find((n) => normHeader(n) === "base") ?? wb.SheetNames[0];
  if (!sheetName) {
    return { rows: [], file: { name: file.name, rowCount: 0, uploadedAt: Date.now() }, warnings: ["Nenhuma aba encontrada."] };
  }

  const sheet = wb.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true });
  const headerIndex = rawRows.findIndex((row) => row.some((cell) => normHeader(String(cell)) === "coddomaterial"));
  if (headerIndex < 0) {
    return { rows: [], file: { name: file.name, rowCount: 0, uploadedAt: Date.now() }, warnings: ["Cabeçalho \"Cod do Material\" não encontrado."] };
  }

  const headers = rawRows[headerIndex].map((h) => HEADER_MAP[normHeader(String(h))] ?? "");
  const required = ["codMaterial", "material", "negocio", "shelf", "cd", "vencimento", "qtCxs", "reprocessavel"];
  const missing = required.filter((r) => !headers.includes(r));
  if (missing.length) warnings.push(`Colunas importantes ausentes: ${missing.join(", ")}.`);

  const rows: EstoqueRow[] = [];
  let skippedNoQty = 0;
  for (const row of rawRows.slice(headerIndex + 1)) {
    if (!row.some((v) => v !== "" && v != null)) continue;
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => { if (h) obj[h] = row[i]; });
    const qtCxs = parseDecimal(obj.qtCxs);
    if (qtCxs <= 0) { skippedNoQty++; continue; }
    const material = String(obj.material ?? "").trim();
    const shelfPrazoDias = parseShelfDays(obj.shelf);
    const vencimento = excelDateToIso(obj.vencimento);
    const diasAteVencimento = daysBetween(today, vencimento);
    const folgaShelfDias = diasAteVencimento != null && shelfPrazoDias != null ? diasAteVencimento - shelfPrazoDias : null;
    const embalagem = parseMaterialPack(material);
    const kgEstoque = embalagem.kgPorCaixa != null ? qtCxs * embalagem.kgPorCaixa : null;
    rows.push({
      codMaterial: String(obj.codMaterial ?? "").trim(),
      material,
      negocio: String(obj.negocio ?? "").trim(),
      negocioGrupo: normalizeNegocio(obj.negocio),
      shelfPrazoDias,
      shelfRaw: String(obj.shelf ?? "").trim(),
      cd: String(obj.cd ?? "").trim(),
      lote: String(obj.lote ?? "").trim(),
      producao: obj.producao ? String(obj.producao) : undefined,
      vencimento,
      qtCxs,
      reprocessavel: parseReprocessavel(obj.reprocessavel),
      embalagem,
      diasAteVencimento,
      folgaShelfDias,
      kgEstoque,
      tonEstoque: kgEstoque != null ? kgEstoque / 1000 : null,
      status: estoqueStatus(folgaShelfDias, shelfPrazoDias, vencimento),
    });
  }

  const revisarPack = rows.filter((r) => r.embalagem.confianca === "revisar").length;
  if (skippedNoQty) warnings.push(`${skippedNoQty} linha(s) com Qt. Cxs <= 0 foram ignoradas.`);
  if (revisarPack) warnings.push(`${revisarPack} linha(s) precisam revisar embalagem extraída do nome do material.`);

  return {
    rows,
    file: { name: file.name, rowCount: rows.length, uploadedAt: Date.now() },
    warnings,
  };
}

