import type { FilterKey, Filters, PricingRow } from "./types";

export type FilterOption = { value: string; label: string };

export type FilterOptionsSummary = {
  matchingRows: PricingRow[];
  matchingSkuCount: number;
  hasValuesByKey: Map<FilterKey, boolean>;
  optionsByKey: Map<FilterKey, FilterOption[]>;
};

function rowValue(row: PricingRow, key: FilterKey): string | undefined {
  const value = (row as Record<string, unknown>)[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? value : undefined;
}

function addOption(
  optionsByKey: Map<FilterKey, Map<string, string>>,
  key: FilterKey,
  row: PricingRow,
): void {
  const value = rowValue(row, key);
  if (!value) return;

  let options = optionsByKey.get(key);
  if (!options) {
    options = new Map();
    optionsByKey.set(key, options);
  }

  if (key === "sku") {
    const desc = row.skuDesc?.trim();
    if (!options.has(value)) options.set(value, desc ? `${value} - ${desc}` : value);
    return;
  }

  options.set(value, value);
}

function sortedOptions(key: FilterKey, options: Map<string, string> | undefined): FilterOption[] {
  if (!options) return [];
  return Array.from(options, ([value, label]) => ({ value, label })).sort((a, b) => {
    const left = key === "sku" ? a.value : a.label;
    const right = key === "sku" ? b.value : b.label;
    return left.localeCompare(right, "pt-BR");
  });
}

export function computeAvailableOptionsPerDimension(
  rows: PricingRow[],
  filters: Filters,
  selectedPeriods: string[] | null,
  dimensionKeys: FilterKey[],
): FilterOptionsSummary {
  const optionsByKey = new Map<FilterKey, Map<string, string>>();
  const hasValuesByKey = new Map<FilterKey, boolean>();
  const matchingRows: PricingRow[] = [];
  const matchingSkus = new Set<string>();
  const dimensionKeySet = new Set(dimensionKeys);
  const selectedPeriodSet = selectedPeriods && selectedPeriods.length ? new Set(selectedPeriods) : null;
  const activeFilters = (Object.entries(filters) as [FilterKey, string[] | undefined][])
    .filter(([, values]) => values && values.length > 0)
    .map(([key, values]) => [key, new Set(values)] as const);

  for (const row of rows) {
    for (const key of dimensionKeys) {
      if (!hasValuesByKey.get(key) && rowValue(row, key)) hasValuesByKey.set(key, true);
    }

    if (selectedPeriodSet && !selectedPeriodSet.has(row.periodo)) continue;

    let failedKey: FilterKey | null = null;
    let failedCount = 0;
    for (const [key, allowed] of activeFilters) {
      const value = rowValue(row, key);
      if (value && allowed.has(value)) continue;
      failedKey = key;
      failedCount += 1;
      if (failedCount > 1) break;
    }

    if (failedCount === 0) {
      matchingRows.push(row);
      if (row.sku) matchingSkus.add(row.sku);
      for (const key of dimensionKeys) addOption(optionsByKey, key, row);
      continue;
    }

    if (failedCount === 1 && failedKey && dimensionKeySet.has(failedKey)) {
      addOption(optionsByKey, failedKey, row);
    }
  }

  return {
    matchingRows,
    matchingSkuCount: matchingSkus.size,
    hasValuesByKey,
    optionsByKey: new Map(dimensionKeys.map((key) => [key, sortedOptions(key, optionsByKey.get(key))])),
  };
}
