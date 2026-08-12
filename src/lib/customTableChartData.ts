import type { ChartBlock, CustomTableChartOrientation } from "@/lib/customSlide";
import { evaluateCustomTable } from "@/lib/customTableFormulas";
import type { CustomTable } from "@/store/customTables";

export type CustomTableSeries = {
  name: string;
  values: number[];
};

export type CustomTablePeriod = {
  key: string;
  label: string;
};

export type CustomTableRankingItem = {
  name: string;
  value: number;
};

export type CustomTableChartData = {
  table: CustomTable | null;
  orientation: Exclude<CustomTableChartOrientation, "auto">;
  periodos: CustomTablePeriod[];
  series: CustomTableSeries[];
  ranking: CustomTableRankingItem[];
  valueOptions: Array<{ value: string; label: string }>;
  warnings: string[];
};

const RANKING_TYPES = new Set<ChartBlock["chartType"]>([
  "pie", "donut", "funnel", "treemap", "scatter", "bubble",
]);

function cleanLabel(value: unknown, fallback: string): string {
  const label = String(value ?? "").trim();
  return label || fallback;
}

export function parseCustomNumericValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value ?? "").trim();
  if (!text) return null;
  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : text;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function numericDensityByColumns(table: CustomTable): number {
  const evaluated = evaluateCustomTable(table.rows);
  if (evaluated.length === 0 || table.columns.length <= 1) return 0;
  let numeric = 0;
  let total = 0;
  for (const row of evaluated) {
    for (let col = 1; col < table.columns.length; col += 1) {
      total += 1;
      if (parseCustomNumericValue(row[col]?.value) != null) numeric += 1;
    }
  }
  return total ? numeric / total : 0;
}

function numericDensityByRows(table: CustomTable): number {
  const evaluated = evaluateCustomTable(table.rows);
  if (evaluated.length <= 1 || table.columns.length <= 1) return 0;
  let numeric = 0;
  let total = 0;
  for (let row = 1; row < evaluated.length; row += 1) {
    for (let col = 1; col < table.columns.length; col += 1) {
      total += 1;
      if (parseCustomNumericValue(evaluated[row]?.[col]?.value) != null) numeric += 1;
    }
  }
  return total ? numeric / total : 0;
}

function looksLikePeriodHeader(label: string): boolean {
  const normalized = label.trim().toLowerCase();
  return /^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)(\/\d{2,4})?$/.test(normalized)
    || /^(m[+-]?\d+|\d{1,2}[./-]\d{2,4}|\d{4})$/.test(normalized);
}

export function inferCustomTableChartOrientation(table: CustomTable): Exclude<CustomTableChartOrientation, "auto"> {
  const periodHeaders = table.columns.slice(1).filter((column) => looksLikePeriodHeader(column)).length;
  if (periodHeaders >= Math.max(2, Math.ceil((table.columns.length - 1) * 0.6))) return "columns";
  return numericDensityByRows(table) > numericDensityByColumns(table) + 0.15 ? "columns" : "rows";
}

function buildRowsOrientation(table: CustomTable): Pick<CustomTableChartData, "periodos" | "series" | "valueOptions"> {
  const evaluated = evaluateCustomTable(table.rows);
  const periodos = evaluated.map((row, rowIndex) => ({
    key: String(rowIndex),
    label: cleanLabel(row[0]?.value, `Linha ${rowIndex + 1}`),
  }));
  const series: CustomTableSeries[] = [];
  for (let col = 1; col < table.columns.length; col += 1) {
    const values = evaluated.map((row) => parseCustomNumericValue(row[col]?.value) ?? 0);
    if (!values.some((value) => value !== 0)) continue;
    series.push({
      name: cleanLabel(table.columns[col], `Serie ${col}`),
      values,
    });
  }
  return {
    periodos,
    series,
    valueOptions: series.map((s) => ({ value: s.name, label: s.name })),
  };
}

function buildColumnsOrientation(table: CustomTable): Pick<CustomTableChartData, "periodos" | "series" | "valueOptions"> {
  const evaluated = evaluateCustomTable(table.rows);
  const periodos = table.columns.slice(1).map((column, index) => ({
    key: String(index),
    label: cleanLabel(column, `Coluna ${index + 2}`),
  }));
  const series = evaluated.map((row, rowIndex) => ({
    name: cleanLabel(row[0]?.value, `Linha ${rowIndex + 1}`),
    values: table.columns.slice(1).map((_, offset) => parseCustomNumericValue(row[offset + 1]?.value) ?? 0),
  })).filter((seriesItem) => seriesItem.values.some((value) => value !== 0));
  return {
    periodos,
    series,
    valueOptions: series.map((s) => ({ value: s.name, label: s.name })),
  };
}

function rankingFromSeries(
  periodos: CustomTablePeriod[],
  series: CustomTableSeries[],
  selectedSeriesName?: string | null,
): CustomTableRankingItem[] {
  const selected = series.find((s) => s.name === selectedSeriesName) ?? series[0];
  if (!selected) return [];
  return periodos.map((period, index) => ({
    name: period.label,
    value: selected.values[index] ?? 0,
  })).filter((item) => item.value !== 0);
}

function compatibilityWarnings(block: ChartBlock, result: Omit<CustomTableChartData, "warnings">): string[] {
  const warnings: string[] = [];
  if (!result.table) {
    warnings.push("Escolha uma tabela personalizada para alimentar este grafico.");
    return warnings;
  }
  if (result.series.length === 0) {
    warnings.push("A tabela precisa ter pelo menos uma coluna ou linha numerica.");
  }
  if ((block.chartType === "pie" || block.chartType === "donut") && result.series.length > 1 && !block.customTableValueColumn) {
    warnings.push("Pizza e rosca usam uma unica serie numerica. Selecione qual serie deve entrar no grafico.");
  }
  if ((block.chartType === "scatter" || block.chartType === "bubble") && result.series.length < 2) {
    warnings.push("Dispersao e bolhas precisam de pelo menos duas series numericas para os eixos X e Y.");
  }
  if (block.chartType === "mapaBrasil") {
    warnings.push("Mapa do Brasil ainda usa bases geograficas do Omni4. Use barra, linha, pizza ou tabela para dados personalizados.");
  }
  if (block.chartType === "waterfall") {
    warnings.push("Cascata personalizada ainda nao esta disponivel para tabelas livres.");
  }
  return warnings;
}

export function buildCustomTableChartData(
  table: CustomTable | null | undefined,
  block: ChartBlock,
): CustomTableChartData {
  if (!table) {
    const empty = {
      table: null,
      orientation: "rows" as const,
      periodos: [],
      series: [],
      ranking: [],
      valueOptions: [],
    };
    return { ...empty, warnings: compatibilityWarnings(block, empty) };
  }

  const orientation = block.customTableOrientation && block.customTableOrientation !== "auto"
    ? block.customTableOrientation
    : inferCustomTableChartOrientation(table);
  const base = orientation === "columns"
    ? buildColumnsOrientation(table)
    : buildRowsOrientation(table);
  const ranking = rankingFromSeries(base.periodos, base.series, block.customTableValueColumn);
  const result = {
    table,
    orientation,
    periodos: base.periodos,
    series: base.series,
    ranking,
    valueOptions: base.valueOptions,
  };
  return { ...result, warnings: compatibilityWarnings(block, result) };
}
