import { monthLabel } from "./format";
import type { PricingRow } from "./types";

export type PeriodSelectionMode = "fixed" | "relative";

export type RelativePeriodPreset =
  | "latest_month"
  | "latest_month_minus_1"
  | "latest_month_minus_2"
  | "latest_month_minus_3"
  | "latest_month_minus_6"
  | "latest_fy"
  | "latest_fy_minus_1"
  | "latest_fy_minus_2";

export const RELATIVE_MONTH_PRESETS: { value: RelativePeriodPreset; label: string }[] = [
  { value: "latest_month", label: "Mês mais recente" },
  { value: "latest_month_minus_1", label: "Mês mais recente - 1" },
  { value: "latest_month_minus_2", label: "Mês mais recente - 2" },
  { value: "latest_month_minus_3", label: "Mês mais recente - 3" },
  { value: "latest_month_minus_6", label: "Mês mais recente - 6" },
];

export const RELATIVE_FY_PRESETS: { value: RelativePeriodPreset; label: string }[] = [
  { value: "latest_fy", label: "Ano mais recente" },
  { value: "latest_fy_minus_1", label: "Ano mais recente - 1" },
  { value: "latest_fy_minus_2", label: "Ano mais recente - 2" },
];

export const DEFAULT_RELATIVE_MONTH_PRESET: RelativePeriodPreset = "latest_month_minus_1";
export const DEFAULT_BASE_RELATIVE_MONTH_PRESET: RelativePeriodPreset = "latest_month_minus_2";

function monthOffset(preset: RelativePeriodPreset): number {
  switch (preset) {
    case "latest_month_minus_1": return 1;
    case "latest_month_minus_2": return 2;
    case "latest_month_minus_3": return 3;
    case "latest_month_minus_6": return 6;
    default: return 0;
  }
}

function fyOffset(preset: RelativePeriodPreset): number {
  switch (preset) {
    case "latest_fy_minus_1": return 1;
    case "latest_fy_minus_2": return 2;
    default: return 0;
  }
}

function fyRank(fy: string): number {
  const m = fy.match(/\d{4}/);
  return m ? Number(m[0]) : Number.NEGATIVE_INFINITY;
}

export function relativePeriodLabel(preset: RelativePeriodPreset | undefined): string {
  return [...RELATIVE_MONTH_PRESETS, ...RELATIVE_FY_PRESETS].find((p) => p.value === preset)?.label
    ?? "Mês mais recente - 1";
}

export function getSortedMonthPeriods(rows: readonly PricingRow[]) {
  const map = new Map<string, { value: string; label: string; mes: number; ano: number }>();
  for (const r of rows) {
    if (!r.periodo) continue;
    if (!map.has(r.periodo)) {
      map.set(r.periodo, {
        value: r.periodo,
        label: monthLabel(r.mes, r.ano),
        mes: r.mes,
        ano: r.ano,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.ano - b.ano || a.mes - b.mes);
}

export function getSortedFiscalYears(rows: readonly PricingRow[]) {
  return Array.from(new Set(rows.map((r) => r.fy).filter(Boolean)))
    .sort((a, b) => fyRank(a) - fyRank(b) || a.localeCompare(b));
}

export function resolveRelativePeriod(
  rows: readonly PricingRow[],
  preset: RelativePeriodPreset | undefined,
): string | null {
  const safePreset = preset ?? DEFAULT_RELATIVE_MONTH_PRESET;
  if (safePreset.startsWith("latest_fy")) {
    const years = getSortedFiscalYears(rows);
    return years[Math.max(0, years.length - 1 - fyOffset(safePreset))] ?? years[0] ?? null;
  }
  const months = getSortedMonthPeriods(rows);
  return months[Math.max(0, months.length - 1 - monthOffset(safePreset))]?.value
    ?? months[0]?.value
    ?? null;
}

export function resolvePeriodValue(
  rows: readonly PricingRow[],
  mode: "month" | "fy" | "all",
  fixedValue: string | null | undefined,
  selectionMode?: PeriodSelectionMode,
  relativePreset?: RelativePeriodPreset,
): string | null {
  if (mode === "all") return null;
  if (selectionMode === "relative") {
    const fallback = mode === "fy" ? "latest_fy_minus_1" : DEFAULT_RELATIVE_MONTH_PRESET;
    return resolveRelativePeriod(rows, relativePreset ?? fallback);
  }
  return fixedValue ?? null;
}

export function resolvePeriodValues(
  rows: readonly PricingRow[],
  fixedValues: string[] | null | undefined,
  selectionMode?: PeriodSelectionMode,
  relativePreset?: RelativePeriodPreset,
): string[] | null {
  if (selectionMode === "relative") {
    const value = resolveRelativePeriod(rows, relativePreset ?? DEFAULT_RELATIVE_MONTH_PRESET);
    return value ? [value] : null;
  }
  return fixedValues ?? null;
}
