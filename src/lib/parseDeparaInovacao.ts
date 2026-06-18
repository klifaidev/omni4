import * as XLSX from "xlsx";
import { normHeader, parseDecimal } from "./format";
import type { InovacaoEntry } from "./deparaInovacao";

export interface InovacaoDeparaFile {
  name: string;
  rowCount: number;
  uploadedAt: number;
}

export interface ParsedInovacaoDepara {
  map: Record<string, InovacaoEntry>;
  file: InovacaoDeparaFile;
  warnings: string[];
}

function findColumn(headers: unknown[], aliases: string[]): number {
  const aliasSet = new Set(aliases.map(normHeader));
  return headers.findIndex((h) => aliasSet.has(normHeader(String(h ?? ""))));
}

function normalizeClassificacao(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!value) return "Inovação";
  return /regular/i.test(value) ? "Regular" : "Inovação";
}

function normalizeSku(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "number") return String(Math.trunc(raw));
  const text = String(raw).trim();
  if (!text) return "";
  const numeric = parseDecimal(text);
  if (Number.isFinite(numeric) && /^\d+([,.]0+)?$/.test(text)) return String(Math.trunc(numeric));
  return text;
}

export async function parseInovacaoDeparaFile(file: File): Promise<ParsedInovacaoDepara> {
  const warnings: string[] = [];
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames.find((name) => normHeader(name).includes("inov")) ?? wb.SheetNames[0];
  if (!sheetName) {
    return { map: {}, file: { name: file.name, rowCount: 0, uploadedAt: Date.now() }, warnings: ["Nenhuma aba encontrada."] };
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, raw: true, defval: "" });
  const headerIndex = rows.findIndex((row) => row.some((v) => ["sku", "codmaterial", "codigomaterial"].includes(normHeader(String(v ?? "")))));
  if (headerIndex < 0) {
    return { map: {}, file: { name: file.name, rowCount: 0, uploadedAt: Date.now() }, warnings: ["Não encontrei uma coluna SKU na planilha."] };
  }

  const headers = rows[headerIndex];
  const skuCol = findColumn(headers, ["SKU", "Cod Material", "Cod do Material", "Código Material", "Codigo Material", "Material"]);
  const classificacaoCol = findColumn(headers, ["Classificação", "Classificacao", "Inovação", "Inovacao", "Status", "Tipo"]);
  const anoCol = findColumn(headers, ["Ano de Lançamento", "Ano Lancamento", "Ano", "Lançamento", "Lancamento"]);
  const legadoCol = findColumn(headers, ["Legado", "SKU Legado", "Produto Legado", "Família Legado", "Familia Legado"]);
  if (skuCol < 0) {
    return { map: {}, file: { name: file.name, rowCount: 0, uploadedAt: Date.now() }, warnings: ["Não encontrei uma coluna SKU na planilha."] };
  }
  if (classificacaoCol < 0) warnings.push("Coluna de classificação não encontrada; SKUs importados serão tratados como Inovação.");
  if (legadoCol < 0) warnings.push("Coluna Legado não encontrada; os SKUs serão importados sem legado.");

  const map: Record<string, InovacaoEntry> = {};
  let skipped = 0;
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    const sku = normalizeSku(row[skuCol]);
    if (!sku) {
      skipped++;
      continue;
    }
    const anoRaw = anoCol >= 0 ? row[anoCol] : "";
    const ano = String(anoRaw ?? "").trim();
    const legado = legadoCol >= 0 ? String(row[legadoCol] ?? "").trim() : "";
    map[sku] = {
      classificacao: classificacaoCol >= 0 ? normalizeClassificacao(row[classificacaoCol]) : "Inovação",
      anoLancamento: ano || null,
      legado: legado || null,
    };
  }
  if (skipped) warnings.push(`${skipped} linha(s) sem SKU foram ignoradas.`);

  return {
    map,
    file: { name: file.name, rowCount: Object.keys(map).length, uploadedAt: Date.now() },
    warnings,
  };
}
