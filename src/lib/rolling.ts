import * as XLSX from "xlsx";
import { getCanalAjustado } from "./deparaComercial";
import { getDeParaBySku } from "./depara";
import { getInovacao, getLegado } from "./deparaInovacao";
import { monthLabel, normHeader, parseDecimal, parsePeriod } from "./format";
import type { Filters } from "./types";

export interface RollingRow {
  rollingCycle: string;
  rollingCycleLabel: string;
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
  receitaLiquida: number;
  custoVariavel: number;
  frete: number;
  comissao: number;
  contribMarginal: number;
}

export interface RollingFile {
  name: string;
  rowCount: number;
  months: string[];
  cycles: string[];
  uploadedAt: number;
}

export interface ParsedRolling {
  rows: RollingRow[];
  file: RollingFile;
  warnings: string[];
}

const PT_MONTHS: Record<string, number> = {
  jan: 1, janeiro: 1,
  fev: 2, fevereiro: 2,
  mar: 3, marco: 3,
  abr: 4, abril: 4,
  mai: 5, maio: 5,
  jun: 6, junho: 6,
  jul: 7, julho: 7,
  ago: 8, agosto: 8,
  set: 9, setembro: 9,
  out: 10, outubro: 10,
  nov: 11, novembro: 11,
  dez: 12, dezembro: 12,
};

const BLOCKS = {
  volume: { start: 67, end: 78 },
  custoVariavel: { start: 167, end: 178 },
  receitaLiquida: { start: 212, end: 223 },
  frete: { start: 236, end: 247 },
  comissao: { start: 253, end: 264 },
  contribMarginal: { start: 270, end: 281 },
} as const;

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

export function parseRollingCycleFromName(fileName: string): ReturnType<typeof parsePeriod> | null {
  const text = normHeader(fileName);
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

function periodRank(periodo: string) {
  const parsed = parsePeriod(periodo);
  return parsed ? parsed.ano * 12 + parsed.mes : -Infinity;
}

export function isRollingMonthAfterCycle(row: RollingRow): boolean {
  return periodRank(row.periodo) > periodRank(row.rollingCycle);
}

export async function parseRollingFile(file: File): Promise<ParsedRolling> {
  const warnings: string[] = [];
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames.find((name) => normHeader(name) === "base") ?? wb.SheetNames[0];

  if (!sheetName) {
    return {
      rows: [],
      file: { name: file.name, rowCount: 0, months: [], cycles: [], uploadedAt: Date.now() },
      warnings: ["Nenhuma aba encontrada no arquivo."],
    };
  }

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
    header: 1,
    raw: true,
    defval: "",
  });

  const headerRow = matrix[8] ?? [];
  const cycle = parseRollingCycleFromName(file.name);
  if (!cycle) warnings.push("Nao foi possivel identificar o mes pelo nome do arquivo; confirme o ciclo antes de aplicar.");

  const volumePeriods = headerRow
    .map((header, col) => ({ col, period: dateToPeriod(header) }))
    .filter(({ col, period }) => col >= BLOCKS.volume.start && col <= BLOCKS.volume.end && !!period) as {
      col: number;
      period: NonNullable<ReturnType<typeof parsePeriod>>;
    }[];

  if (volumePeriods.length === 0) {
    return {
      rows: [],
      file: { name: file.name, rowCount: 0, months: [], cycles: [], uploadedAt: Date.now() },
      warnings: [`Aba "${sheetName}" nao tem o bloco mensal de Volume esperado em BP:CA.`],
    };
  }

  const periodByOffset = volumePeriods.map(({ period }) => period);
  const cycleInfo = cycle ?? periodByOffset[0];
  const cycleLabel = monthLabel(cycleInfo.mes, cycleInfo.ano);
  const rows: RollingRow[] = [];
  const monthsSet = new Set<string>();
  let skippedRows = 0;

  for (let r = 9; r < matrix.length; r++) {
    const row = matrix[r];
    const sku = row[12] == null || row[12] === "" ? undefined : String(row[12]).trim();
    const canal = normalizeCanal(row[10]);
    if (!sku || !canal) {
      skippedRows++;
      continue;
    }

    const dep = getDeParaBySku(sku);
    const canalAjustado = getCanalAjustado(canal) ?? canal;
    const desc = row[13] == null || row[13] === "" ? undefined : String(row[13]).trim();

    for (let i = 0; i < periodByOffset.length; i++) {
      const period = periodByOffset[i];
      const volumeKg = parseDecimal(row[BLOCKS.volume.start + i]);
      const receitaLiquida = parseDecimal(row[BLOCKS.receitaLiquida.start + i]);
      const custoVariavel = parseDecimal(row[BLOCKS.custoVariavel.start + i]);
      const frete = parseDecimal(row[BLOCKS.frete.start + i]);
      const comissao = parseDecimal(row[BLOCKS.comissao.start + i]);
      const contribMarginal = parseDecimal(row[BLOCKS.contribMarginal.start + i]);

      rows.push({
        rollingCycle: cycleInfo.periodo,
        rollingCycleLabel: cycleLabel,
        periodo: period.periodo,
        mes: period.mes,
        ano: period.ano,
        fy: period.fy,
        fyNum: period.fyNum,
        canal,
        canalAjustado,
        sku,
        skuDesc: dep?.skuDesc ?? desc,
        categoria: dep?.categoria ?? (row[5] ? String(row[5]).trim() : undefined),
        subcategoria: dep?.subcategoria,
        marca: dep?.marca ?? (row[7] ? String(row[7]).trim() : undefined),
        tecnologia: dep?.tecnologia,
        formato: dep?.formato,
        mercado: dep?.mercado ?? (row[9] ? String(row[9]).trim() : undefined),
        faixaPeso: dep?.faixaPeso,
        sabor: dep?.sabor,
        inovacao: getInovacao(sku),
        legado: getLegado(sku),
        volumeKg,
        receitaLiquida,
        custoVariavel,
        frete,
        comissao,
        contribMarginal,
      });
      monthsSet.add(period.periodo);
    }
  }

  if (skippedRows) warnings.push(`${skippedRows} linha(s) sem SKU ou Canal foram ignoradas.`);
  warnings.push(`Rolling identificado como ${cycleLabel}; ao aplicar, o app atualiza apenas o mes seguinte em diante.`);
  warnings.push("Volume importado sem multiplicador adicional.");

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

export function applyRollingFilters(
  rows: RollingRow[],
  filters: Filters,
  selectedPeriods: string[] | null,
): RollingRow[] {
  const periodSet = selectedPeriods ? new Set(selectedPeriods) : null;
  return rows.filter((r) => {
    if (periodSet && !periodSet.has(r.periodo)) return false;
    for (const [key, values] of Object.entries(filters)) {
      if (!values || values.length === 0) continue;
      const value = r[key as keyof RollingRow];
      if (!values.includes(String(value ?? ""))) return false;
    }
    return true;
  });
}
