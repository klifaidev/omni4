import type { PricingRow } from "./types";

export type TargetMode = "auto" | "manual";
export type TargetWeightKey = "historyWeight" | "recentWeight" | "budgetWeight";

export interface CategorySetting {
  mode: TargetMode;
  manualTargetPct?: number;
  skuOverrides?: Record<string, number>;
  /** Aumento multiplicativo ("Sonho") aplicado sobre a meta ja calculada, so nos SKUs sem ajuste manual. */
  sonhoBoostPct?: number;
  benchmarkWeight?: number;
  historyWeight?: number;
  recentWeight?: number;
  budgetWeight?: number;
  preservation?: number;
  historyStart?: string;
  historyEnd?: string;
  recentStart?: string;
  recentEnd?: string;
}

export interface TargetSettings {
  benchmarkWeight?: number;
  historyWeight: number;
  recentWeight: number;
  budgetWeight: number;
  preservation: number;
  historyStart?: string;
  historyEnd?: string;
  recentStart?: string;
  recentEnd?: string;
  categories: Record<string, CategorySetting>;
}

export interface TargetRow extends Record<string, unknown> {
  key: string;
  label: string;
  parent?: string;
  skuCode?: string;
  recentMarginPct?: number;
  manualOverride?: boolean;
  /** Numero de SKUs com ajuste manual (so preenchido na linha de categoria). */
  manualOverrideCount?: number;
  /** True quando o boost "Sonho" foi aplicado a esta linha (SKU sem ajuste manual). */
  sonhoApplied?: boolean;
  rol: number;
  margem: number;
  margemPct: number;
  volumeKg: number;
  baseTargetPct?: number;
  targetPct: number;
  gapPp: number;
  impact: number;
  weight: number;
  risk: "ok" | "attention" | "critical";
  budgetAvailable?: boolean;
  appliedBudgetWeight?: number;
}

export interface Aggregate {
  key: string;
  label: string;
  rol: number;
  margem: number;
  volumeKg: number;
  margemPct: number;
}

export interface PremiseBaseValues {
  history: number | null;
  recent: number | null;
  budget: number | null;
}

export interface PeriodOption {
  periodo: string;
  label: string;
  rank: number;
}

export interface EffectivePremise {
  historyWeight: number;
  recentWeight: number;
  budgetWeight: number;
  preservation: number;
  historyStart?: string;
  historyEnd?: string;
  recentStart?: string;
  recentEnd?: string;
}


export const STORAGE_KEY = "omni:margem-target:v1";
export const DEFAULT_SETTINGS: TargetSettings = {
  historyWeight: 0.4,
  recentWeight: 0.3,
  budgetWeight: 0.3,
  preservation: 0.65,
  categories: {},
};


function periodRank(row: PricingRow): number {
  return row.ano * 12 + row.mes;
}

function periodLabel(row: PricingRow): string {
  const labels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${labels[row.mes - 1] ?? String(row.mes).padStart(2, "0")}/${String(row.ano).slice(-2)}`;
}

export function getPeriodOptions(rows: PricingRow[]): PeriodOption[] {
  return Array.from(
    new Map(
      rows.map((row) => [
        row.periodo,
        { periodo: row.periodo, label: periodLabel(row), rank: periodRank(row) },
      ]),
    ).values(),
  ).sort((a, b) => a.rank - b.rank);
}

function periodRangeSet(options: PeriodOption[], start?: string, end?: string): Set<string> {
  const startRank = options.find((option) => option.periodo === start)?.rank ?? -Infinity;
  const endRank = options.find((option) => option.periodo === end)?.rank ?? Infinity;
  return new Set(
    options
      .filter((option) => option.rank >= startRank && option.rank <= endRank)
      .map((option) => option.periodo),
  );
}

function defaultPremise(options: PeriodOption[]): EffectivePremise {
  const last = options[options.length - 1];
  const recentStart = options[Math.max(0, options.length - 3)]?.periodo;
  const recentEnd = last?.periodo;
  const historyStart = options[Math.max(0, options.length - 24)]?.periodo;
  const historyEnd = recentEnd;
  return {
    historyWeight: DEFAULT_SETTINGS.historyWeight,
    recentWeight: DEFAULT_SETTINGS.recentWeight,
    budgetWeight: DEFAULT_SETTINGS.budgetWeight,
    preservation: DEFAULT_SETTINGS.preservation,
    historyStart,
    historyEnd,
    recentStart,
    recentEnd,
  };
}

export function normalizeWeights(weights: Record<TargetWeightKey, number>): Record<TargetWeightKey, number> {
  const historyWeight = Math.max(0, weights.historyWeight);
  const recentWeight = Math.max(0, weights.recentWeight);
  const budgetWeight = Math.max(0, weights.budgetWeight);
  const total = historyWeight + recentWeight + budgetWeight;
  if (total <= 0) {
    return {
      historyWeight: DEFAULT_SETTINGS.historyWeight,
      recentWeight: DEFAULT_SETTINGS.recentWeight,
      budgetWeight: DEFAULT_SETTINGS.budgetWeight,
    };
  }
  return {
    historyWeight: historyWeight / total,
    recentWeight: recentWeight / total,
    budgetWeight: budgetWeight / total,
  };
}

function weightsFromSetting(
  categorySetting: CategorySetting | undefined,
  settings: TargetSettings,
  defaults: EffectivePremise,
): Record<TargetWeightKey, number> {
  const legacyBenchmark = categorySetting?.benchmarkWeight ?? settings.benchmarkWeight;
  const historyWeight = categorySetting?.historyWeight ?? settings.historyWeight ?? legacyBenchmark ?? defaults.historyWeight;
  const budgetWeight = categorySetting?.budgetWeight ?? settings.budgetWeight ?? defaults.budgetWeight;
  const recentWeight = categorySetting?.recentWeight
    ?? settings.recentWeight
    ?? Math.max(0, 1 - historyWeight - budgetWeight);
  return {
    historyWeight: Math.max(0, historyWeight),
    recentWeight: Math.max(0, recentWeight),
    budgetWeight: Math.max(0, budgetWeight),
  };
}

export function balanceWeights(
  current: Pick<EffectivePremise, TargetWeightKey>,
): Record<TargetWeightKey, number> {
  return normalizeWeights({
    historyWeight: current.historyWeight,
    recentWeight: current.recentWeight,
    budgetWeight: current.budgetWeight,
  });
}

function applyBudgetFallbackWeights(
  premise: Pick<EffectivePremise, TargetWeightKey>,
  hasBudget: boolean,
): Record<TargetWeightKey, number> {
  if (hasBudget) return normalizeWeights(premise);
  return normalizeWeights({
    historyWeight: premise.historyWeight,
    recentWeight: premise.recentWeight,
    budgetWeight: 0,
  });
}

export function resolvePremise(settings: TargetSettings, category: string | undefined, options: PeriodOption[]): EffectivePremise {
  const defaults = defaultPremise(options);
  const categorySetting = category ? settings.categories[category] : undefined;
  const weights = weightsFromSetting(categorySetting, settings, defaults);
  return {
    ...weights,
    preservation: categorySetting?.preservation ?? settings.preservation ?? defaults.preservation,
    historyStart: categorySetting?.historyStart ?? settings.historyStart ?? defaults.historyStart,
    historyEnd: categorySetting?.historyEnd ?? settings.historyEnd ?? defaults.historyEnd,
    recentStart: categorySetting?.recentStart ?? settings.recentStart ?? defaults.recentStart,
    recentEnd: categorySetting?.recentEnd ?? settings.recentEnd ?? defaults.recentEnd,
  };
}

function filterRowsByPeriodRange(rows: PricingRow[], options: PeriodOption[], start?: string, end?: string): PricingRow[] {
  const range = periodRangeSet(options, start, end);
  if (range.size === 0) return rows;
  return rows.filter((row) => range.has(row.periodo));
}

export function normalizePremiseRange(
  premise: Partial<EffectivePremise>,
  options: PeriodOption[],
): Partial<EffectivePremise> {
  const byPeriod = new Map(options.map((option) => [option.periodo, option.rank]));
  const out: Partial<EffectivePremise> = { ...premise };
  if (out.historyStart && out.historyEnd && (byPeriod.get(out.historyStart) ?? 0) > (byPeriod.get(out.historyEnd) ?? 0)) {
    out.historyEnd = out.historyStart;
  }
  if (out.recentStart && out.recentEnd && (byPeriod.get(out.recentStart) ?? 0) > (byPeriod.get(out.recentEnd) ?? 0)) {
    out.recentEnd = out.recentStart;
  }
  return out;
}

function aggregateRows(rows: PricingRow[]): Omit<Aggregate, "key" | "label"> {
  let rol = 0;
  let margem = 0;
  let volumeKg = 0;
  for (const row of rows) {
    rol += row.rol;
    margem += row.contribMarginal;
    volumeKg += row.volumeKg;
  }
  return { rol, margem, volumeKg, margemPct: rol > 0 ? margem / rol : 0 };
}

export function aggregateByDimension(rows: PricingRow[], getKey: (row: PricingRow) => string): Aggregate[] {
  const map = new Map<string, PricingRow[]>();
  for (const row of rows) {
    const key = getKey(row).trim() || "Sem informação";
    const bucket = map.get(key) ?? [];
    bucket.push(row);
    map.set(key, bucket);
  }
  return Array.from(map.entries())
    .map(([key, bucket]) => ({ key, label: key, ...aggregateRows(bucket) }))
    .filter((row) => row.rol > 0)
    .sort((a, b) => b.rol - a.rol);
}

export function loadSettings(): TargetSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<TargetSettings>;
    const legacyBenchmark = typeof parsed.benchmarkWeight === "number" ? parsed.benchmarkWeight : undefined;
    const historyWeight = typeof parsed.historyWeight === "number"
      ? parsed.historyWeight
      : legacyBenchmark ?? DEFAULT_SETTINGS.historyWeight;
    const budgetWeight = typeof parsed.budgetWeight === "number" ? parsed.budgetWeight : DEFAULT_SETTINGS.budgetWeight;
    const recentWeight = typeof parsed.recentWeight === "number"
      ? parsed.recentWeight
      : Math.max(0, 1 - historyWeight - budgetWeight);
    return {
      historyWeight: Math.max(0, historyWeight),
      recentWeight: Math.max(0, recentWeight),
      budgetWeight: Math.max(0, budgetWeight),
      preservation: typeof parsed.preservation === "number" ? parsed.preservation : DEFAULT_SETTINGS.preservation,
      historyStart: typeof parsed.historyStart === "string" ? parsed.historyStart : undefined,
      historyEnd: typeof parsed.historyEnd === "string" ? parsed.historyEnd : undefined,
      recentStart: typeof parsed.recentStart === "string" ? parsed.recentStart : undefined,
      recentEnd: typeof parsed.recentEnd === "string" ? parsed.recentEnd : undefined,
      categories: parsed.categories && typeof parsed.categories === "object" ? parsed.categories : {},
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function buildCategoryTargets(
  currentRows: PricingRow[],
  historyRows: PricingRow[],
  budgetRows: PricingRow[],
  settings: TargetSettings,
  periodOptions: PeriodOption[],
): TargetRow[] {
  const categories = aggregateByDimension(currentRows, (row) => row.categoria || "Sem categoria");
  const totalRol = categories.reduce((sum, row) => sum + row.rol, 0) || 1;
  const budgetByCategory = new Map(aggregateByDimension(budgetRows, (row) => row.categoria || "Sem categoria").map((row) => [row.key, row]));
  const rangeAggregates = new Map<string, Map<string, Aggregate>>();
  const aggregatesForRange = (start?: string, end?: string) => {
    const key = `${start ?? ""}|${end ?? ""}`;
    const cached = rangeAggregates.get(key);
    if (cached) return cached;
    const rowsForRange = filterRowsByPeriodRange(historyRows, periodOptions, start, end);
    const map = new Map(aggregateByDimension(rowsForRange, (row) => row.categoria || "Sem categoria").map((row) => [row.key, row]));
    rangeAggregates.set(key, map);
    return map;
  };

  return categories.map((category) => {
    const setting = settings.categories[category.key];
    const premise = resolvePremise(settings, category.key, periodOptions);
    const historicalAgg = aggregatesForRange(premise.historyStart, premise.historyEnd).get(category.key);
    const recentAgg = aggregatesForRange(premise.recentStart, premise.recentEnd).get(category.key);
    const budgetAgg = budgetByCategory.get(category.key);
    const historical = historicalAgg && historicalAgg.rol > 0 ? historicalAgg.margemPct : category.margemPct;
    const recent = recentAgg && recentAgg.rol > 0 ? recentAgg.margemPct : category.margemPct;
    const budgetAvailable = Boolean(budgetAgg && budgetAgg.rol > 0);
    const appliedWeights = applyBudgetFallbackWeights(premise, budgetAvailable);
    const budget = budgetAvailable && budgetAgg ? budgetAgg.margemPct : 0;
    const autoTarget =
      historical * appliedWeights.historyWeight +
      recent * appliedWeights.recentWeight +
      budget * appliedWeights.budgetWeight;
    const targetPct = setting?.mode === "manual" && typeof setting.manualTargetPct === "number"
      ? setting.manualTargetPct
      : autoTarget;
    const skuOverrideCount = setting?.skuOverrides ? Object.keys(setting.skuOverrides).length : 0;
    const sonhoBoostPct = setting?.sonhoBoostPct ?? 0;
    const adjustedTargetPct = skuOverrideCount > 0 || sonhoBoostPct > 0
      ? weightedTargetFromRows(
          buildSkuTargetsForCategory({
            categoryRows: rowsForPath(currentRows, category.key),
            categoryTargetPct: targetPct,
            preservation: premise.preservation,
            periodOptions,
            recentStart: premise.recentStart,
            recentEnd: premise.recentEnd,
            overrides: setting?.skuOverrides,
            sonhoBoostPct,
          }),
          targetPct,
        )
      : targetPct;
    return buildTargetRow(category, adjustedTargetPct, totalRol, {
      budgetAvailable,
      appliedBudgetWeight: appliedWeights.budgetWeight,
      manualOverride: skuOverrideCount > 0,
      manualOverrideCount: skuOverrideCount,
      baseTargetPct: targetPct,
    });
  });
}

export function buildChildrenTargets(children: Aggregate[], parentTargetPct: number, preservation: number): TargetRow[] {
  const totalRol = children.reduce((sum, row) => sum + row.rol, 0) || 1;
  const currentWeightedAvg = children.reduce((sum, row) => sum + row.margemPct * row.rol, 0) / totalRol;
  return children.map((child) => {
    const targetPct = parentTargetPct + preservation * (child.margemPct - currentWeightedAvg);
    return buildTargetRow(child, targetPct, totalRol);
  });
}

export function buildSkuTargetsForCategory(args: {
  categoryRows: PricingRow[];
  categoryTargetPct: number;
  preservation: number;
  periodOptions: PeriodOption[];
  recentStart?: string;
  recentEnd?: string;
  overrides?: Record<string, number>;
  /** Aumento multiplicativo "Sonho": aplicado so aos SKUs sem ajuste manual (overrides). */
  sonhoBoostPct?: number;
}): TargetRow[] {
  const skuCodeByLabel = new Map<string, string>();
  for (const row of args.categoryRows) {
    const label = row.skuDesc || row.sku || "Sem SKU";
    if (!skuCodeByLabel.has(label)) skuCodeByLabel.set(label, row.sku || "");
  }
  const recentSkuAgg = new Map(
    aggregateByDimension(
      filterRowsByPeriodRange(args.categoryRows, args.periodOptions, args.recentStart, args.recentEnd),
      (row) => row.skuDesc || row.sku || "Sem SKU",
    ).map((row) => [row.key, row]),
  );
  const skus = aggregateByDimension(args.categoryRows, (row) => row.skuDesc || row.sku || "Sem SKU");
  const sonhoBoostPct = args.sonhoBoostPct ?? 0;
  return buildChildrenTargets(skus, args.categoryTargetPct, args.preservation)
    .map((row) => {
      const manualTarget = args.overrides?.[row.key];
      const isManual = typeof manualTarget === "number";
      const sonhoApplied = !isManual && sonhoBoostPct > 0;
      const cascadedTargetPct = sonhoApplied ? row.targetPct * (1 + sonhoBoostPct) : row.targetPct;
      const targetPct = isManual ? manualTarget : cascadedTargetPct;
      return {
        ...row,
        targetPct,
        gapPp: targetPct - row.margemPct,
        impact: (targetPct - row.margemPct) * row.rol,
        risk: Math.abs(targetPct - row.margemPct) >= 0.05 ? "critical" : Math.abs(targetPct - row.margemPct) >= 0.02 ? "attention" : "ok",
        skuCode: skuCodeByLabel.get(row.key) ?? "",
        recentMarginPct: recentSkuAgg.get(row.key)?.margemPct,
        manualOverride: isManual,
        sonhoApplied,
      };
    });
}

function weightedTargetFromRows(rows: TargetRow[], fallback: number): number {
  const totalRol = rows.reduce((sum, row) => sum + row.rol, 0);
  if (totalRol <= 0) return fallback;
  return rows.reduce((sum, row) => sum + row.targetPct * row.rol, 0) / totalRol;
}

function buildTargetRow(
  row: Aggregate,
  targetPct: number,
  totalRol: number,
  extra?: Pick<TargetRow, "budgetAvailable" | "appliedBudgetWeight" | "manualOverride" | "manualOverrideCount" | "baseTargetPct">,
): TargetRow {
  const gapPp = targetPct - row.margemPct;
  const impact = gapPp * row.rol;
  const absGap = Math.abs(gapPp);
  return {
    ...row,
    targetPct,
    gapPp,
    impact,
    weight: row.rol / totalRol,
    risk: absGap >= 0.05 ? "critical" : absGap >= 0.02 ? "attention" : "ok",
    ...extra,
  };
}

export function calculatePremiseBaseValues(args: {
  historyRows: PricingRow[];
  budgetRows: PricingRow[];
  periodOptions: PeriodOption[];
  premise: EffectivePremise;
  category?: string;
}): PremiseBaseValues {
  const scopedHistoryRows = args.category ? rowsForPath(args.historyRows, args.category) : args.historyRows;
  const scopedBudgetRows = args.category ? rowsForPath(args.budgetRows, args.category) : args.budgetRows;
  const historyAgg = aggregateRows(filterRowsByPeriodRange(scopedHistoryRows, args.periodOptions, args.premise.historyStart, args.premise.historyEnd));
  const recentAgg = aggregateRows(filterRowsByPeriodRange(scopedHistoryRows, args.periodOptions, args.premise.recentStart, args.premise.recentEnd));
  const budgetAgg = aggregateRows(scopedBudgetRows);
  return {
    history: historyAgg.rol > 0 ? historyAgg.margemPct : null,
    recent: recentAgg.rol > 0 ? recentAgg.margemPct : null,
    budget: budgetAgg.rol > 0 ? budgetAgg.margemPct : null,
  };
}


export function rowsForPath(rows: PricingRow[], category?: string, sku?: string, channel?: string): PricingRow[] {
  return rows.filter((row) => {
    if (category && (row.categoria || "Sem categoria") !== category) return false;
    const skuKey = row.skuDesc || row.sku || "Sem SKU";
    if (sku && skuKey !== sku) return false;
    if (channel && (row.canalAjustado || "Sem canal") !== channel) return false;
    return true;
  });
}
