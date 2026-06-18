import * as XLSX from "xlsx";
import { getCanalAjustado } from "./deparaComercial";
import { getDeParaBySku } from "./depara";
import { getInovacao, getLegado } from "./deparaInovacao";
import { monthLabel, normHeader, parseDecimal, parsePeriod } from "./format";
import type { Filters } from "./types";

export interface ForecastRow {
  forecastCycle: string;
  forecastCycleLabel: string;
  periodo: string;
  mes: number;
  ano: number;
  fy: string;
  fyNum: number;
  canal?: string;
  canalAjustado?: string;
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
  inovacao?: string;
  legado?: string;
  volumeKg: number;
}

export interface ForecastFile {
  name: string;
  rowCount: number;
  months: string[];
  cycles: string[];
  uploadedAt: number;
}

export interface ParsedForecast {
  rows: ForecastRow[];
  file: ForecastFile;
  warnings: string[];
}

const PT_MONTHS: Record<string, number> = {
  jan: 1,
  janeiro: 1,
  fev: 2,
  fevereiro: 2,
  mar: 3,
  marco: 3,
  abr: 4,
  abril: 4,
  mai: 5,
  maio: 5,
  jun: 6,
  junho: 6,
  jul: 7,
  julho: 7,
  ago: 8,
  agosto: 8,
  set: 9,
  setembro: 9,
  out: 10,
  outubro: 10,
  nov: 11,
  novembro: 11,
  dez: 12,
  dezembro: 12,
};

function dateToPeriod(raw: unknown): ReturnType<typeof parsePeriod> | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return parsePeriod(`${raw.getMonth() + 1}/${raw.getFullYear()}`);
  }
  if (typeof raw === "number") {
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (parsed) return parsePeriod(`${parsed.m}/${parsed.y}`);
  }
  if (raw == null || raw === "") return null;
  return parsePeriod(String(raw));
}

function parseCycleFromName(fileName: string, sheetName?: string): ReturnType<typeof parsePeriod> | null {
  const text = normHeader(`${fileName} ${sheetName ?? ""}`);
  for (const [name, mes] of Object.entries(PT_MONTHS)) {
    const match = text.match(new RegExp(`${name}(\\d{2}|\\d{4})`));
    if (!match) continue;
    const yy = Number(match[1]);
    const ano = yy < 100 ? 2000 + yy : yy;
    return parsePeriod(`${mes}/${ano}`);
  }
  return null;
}

function normalizeCanal(raw: unknown): string | undefined {
  const value = raw == null ? "" : String(raw).trim();
  if (!value) return undefined;
  if (normHeader(value) === "industrial") return "Industria";
  return value;
}

function findHeaderRow(rows: unknown[][]): number {
  return rows.findIndex((row) => {
    const headers = row.map((v) => normHeader(v == null ? "" : String(v)));
    return headers.includes("sku") && headers.includes("negocio");
  });
}

function findColumn(headers: unknown[], aliases: string[]): number {
  const normalizedAliases = new Set(aliases.map(normHeader));
  return headers.findIndex((h) => normalizedAliases.has(normHeader(h == null ? "" : String(h))));
}

function isWithinFiscalYear(period: ReturnType<typeof parsePeriod>, fyStart: ReturnType<typeof parsePeriod>) {
  if (!period || !fyStart) return false;
  const start = fyStart.ano * 12 + fyStart.mes;
  const current = period.ano * 12 + period.mes;
  return current >= start && current < start + 12;
}

export async function parseForecastFile(file: File): Promise<ParsedForecast> {
  const warnings: string[] = [];
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheetName =
    wb.SheetNames.find((name) => {
      const n = normHeader(name);
      return n.includes("ciclo") && n.includes("completo");
    }) ?? wb.SheetNames[0];

  if (!sheetName) {
    return {
      rows: [],
      file: { name: file.name, rowCount: 0, months: [], cycles: [], uploadedAt: Date.now() },
      warnings: ["Nenhuma aba encontrada no arquivo."],
    };
  }

  const sheet = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });
  const headerIndex = findHeaderRow(matrix);
  if (headerIndex < 0) {
    return {
      rows: [],
      file: { name: file.name, rowCount: 0, months: [], cycles: [], uploadedAt: Date.now() },
      warnings: [`Aba "${sheetName}" não tem cabeçalho com Sku e NEGÓCIO.`],
    };
  }

  const headers = matrix[headerIndex];
  const skuCol = findColumn(headers, ["Sku", "SKU"]);
  const skuDescCol = findColumn(headers, ["Descrição do Produto", "Descricao do Produto", "Descrição Produto"]);
  const canalCol = findColumn(headers, ["NEGÓCIO", "Negócio", "Canal"]);
  if (skuCol < 0 || canalCol < 0) {
    return {
      rows: [],
      file: { name: file.name, rowCount: 0, months: [], cycles: [], uploadedAt: Date.now() },
      warnings: [`Aba "${sheetName}" não tem colunas obrigatórias Sku e NEGÓCIO.`],
    };
  }

  const cycle = parseCycleFromName(file.name, sheetName);
  if (!cycle) warnings.push("Não foi possível identificar o ciclo pelo nome do arquivo; usando o primeiro mês do bloco como ciclo.");

  const startCol = 19; // Coluna T, zero-based. Antes disso ficam blocos auxiliares/históricos.
  const firstPeriod = headers
    .slice(startCol)
    .map(dateToPeriod)
    .find(Boolean);
  const fyStart = firstPeriod ? parsePeriod(`4/${firstPeriod.mes >= 4 ? firstPeriod.ano : firstPeriod.ano - 1}`) : null;
  const monthCols = headers
    .map((header, col) => ({ col, period: dateToPeriod(header) }))
    .filter(({ col, period }) => col >= startCol && period && fyStart && isWithinFiscalYear(period, fyStart))
    .slice(0, 12) as { col: number; period: NonNullable<ReturnType<typeof parsePeriod>> }[];

  if (monthCols.length === 0) {
    return {
      rows: [],
      file: { name: file.name, rowCount: 0, months: [], cycles: [], uploadedAt: Date.now() },
      warnings: [`Aba "${sheetName}" não tem colunas mensais válidas no bloco de Forecast.`],
    };
  }
  if (monthCols.length < 12) warnings.push(`Foram encontrados ${monthCols.length} mês(es) de Forecast no bloco esperado.`);

  const cycleInfo = cycle ?? monthCols[0].period;
  const cycleLabel = monthLabel(cycleInfo.mes, cycleInfo.ano);
  const rows: ForecastRow[] = [];
  const monthsSet = new Set<string>();
  let skippedRows = 0;

  for (let r = headerIndex + 1; r < matrix.length; r++) {
    const row = matrix[r];
    const skuRaw = row[skuCol];
    const sku = skuRaw == null || skuRaw === "" ? undefined : String(skuRaw).trim();
    const canal = normalizeCanal(row[canalCol]);
    if (!sku || !canal) {
      skippedRows++;
      continue;
    }

    const dep = getDeParaBySku(sku);
    const skuDescRaw = skuDescCol >= 0 && row[skuDescCol] ? String(row[skuDescCol]).trim() : undefined;
    const canalAjustado = getCanalAjustado(canal) ?? canal;

    for (const { col, period } of monthCols) {
      const volumeTons = parseDecimal(row[col]);
      const volumeKg = volumeTons * 1000;
      rows.push({
        forecastCycle: cycleInfo.periodo,
        forecastCycleLabel: cycleLabel,
        periodo: period.periodo,
        mes: period.mes,
        ano: period.ano,
        fy: period.fy,
        fyNum: period.fyNum,
        canal,
        canalAjustado,
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
      });
      monthsSet.add(period.periodo);
    }
  }

  if (skippedRows) warnings.push(`${skippedRows} linha(s) sem SKU ou NEGÓCIO foram ignoradas.`);
  warnings.push(`Volume convertido de toneladas para kg. Ciclo identificado: ${cycleLabel}.`);

  return {
    rows,
    file: {
      name: file.name,
      rowCount: rows.length,
      months: Array.from(monthsSet).sort(),
      cycles: [cycleInfo.periodo],
      uploadedAt: Date.now(),
    },
    warnings,
  };
}

export function applyForecastFilters(
  rows: ForecastRow[],
  filters: Filters,
  selectedPeriods: string[] | null,
): ForecastRow[] {
  const periodSet = selectedPeriods ? new Set(selectedPeriods) : null;
  return rows.filter((r) => {
    if (periodSet && !periodSet.has(r.periodo)) return false;
    for (const [key, values] of Object.entries(filters)) {
      if (!values || values.length === 0) continue;
      const value = r[key as keyof ForecastRow];
      if (!values.includes(String(value ?? ""))) return false;
    }
    return true;
  });
}
