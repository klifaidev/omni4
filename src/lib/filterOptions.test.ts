import { describe, expect, it } from "vitest";
import { applyFilters } from "./analytics";
import { computeAvailableOptionsPerDimension, type FilterOption } from "./filterOptions";
import type { FilterKey, Filters, PricingRow } from "./types";

function row(partial: Partial<PricingRow>): PricingRow {
  return {
    periodo: "001.2026",
    mes: 1,
    ano: 2026,
    fy: "FY25/26",
    fyNum: 2526,
    rol: 0,
    volumeKg: 0,
    cogs: 0,
    custoVariavel: 0,
    custoFixo: 0,
    margemBruta: 0,
    contribMarginal: 0,
    frete: 0,
    comissao: 0,
    ...partial,
  };
}

function filtersWithoutKey(filters: Filters, key: FilterKey): Filters {
  const next: Filters = {};
  for (const [filterKey, values] of Object.entries(filters) as [FilterKey, string[] | undefined][]) {
    if (filterKey !== key && values?.length) next[filterKey] = values;
  }
  return next;
}

function legacyOptions(rows: PricingRow[], key: FilterKey): FilterOption[] {
  if (key === "sku") {
    const options = new Map<string, string>();
    for (const r of rows) {
      if (!r.sku?.trim()) continue;
      const desc = r.skuDesc?.trim();
      if (!options.has(r.sku)) options.set(r.sku, desc ? `${r.sku} - ${desc}` : r.sku);
    }
    return Array.from(options, ([value, label]) => ({ value, label })).sort((a, b) =>
      a.value.localeCompare(b.value, "pt-BR"),
    );
  }

  const values = new Set<string>();
  for (const r of rows) {
    const value = (r as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim().length > 0) values.add(value);
  }
  return Array.from(values)
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .map((value) => ({ value, label: value }));
}

describe("computeAvailableOptionsPerDimension", () => {
  it("matches the legacy cross-filtered options from repeated applyFilters calls", () => {
    const rows = [
      row({ periodo: "001.2026", canal: "Direto", categoria: "Coberturas", regional: "Sul", sku: "100", skuDesc: "Top Meio Amargo" }),
      row({ periodo: "001.2026", canal: "Direto", categoria: "Coberturas", regional: "Sudeste", sku: "200", skuDesc: "Top Branco" }),
      row({ periodo: "001.2026", canal: "Distribuidor", categoria: "Chocolates", regional: "Sul", sku: "300", skuDesc: "Melken" }),
      row({ periodo: "002.2026", canal: "Direto", categoria: "Coberturas", regional: "Sul", sku: "400", skuDesc: "Top Leite" }),
      row({ periodo: "001.2026", canal: "Direto", categoria: "Recheios", regional: "Nordeste", sku: "500", skuDesc: "Recheio" }),
    ];
    const filters: Filters = {
      canal: ["Direto"],
      categoria: ["Coberturas"],
    };
    const selectedPeriods = ["001.2026"];
    const dimensionKeys: FilterKey[] = ["canal", "categoria", "regional", "sku"];

    const actual = computeAvailableOptionsPerDimension(rows, filters, selectedPeriods, dimensionKeys);

    for (const key of dimensionKeys) {
      const scopedRows = applyFilters(rows, filtersWithoutKey(filters, key), selectedPeriods);
      expect(actual.optionsByKey.get(key)).toEqual(legacyOptions(scopedRows, key));
    }

    const matchingRows = applyFilters(rows, filters, selectedPeriods);
    expect(actual.matchingRows).toEqual(matchingRows);
    expect(actual.matchingSkuCount).toBe(new Set(matchingRows.map((item) => item.sku).filter(Boolean)).size);
  });
});
