import type { PricingRow } from "./types";

export type PriceIndexDimension = "sabor" | "faixaPeso" | "formato";

export interface PriceIndexAggregate {
  rol: number;
  volumeKg: number;
  avgPrice: number | null;
  skuCount: number;
}

export interface CalibratedPriceIndex extends PriceIndexAggregate {
  dimension: PriceIndexDimension;
  value: string;
  referenceValue: string;
  referenceAvgPrice: number | null;
  index: number | null;
}

export type PriceIndexValues = Partial<Record<PriceIndexDimension, Record<string, number>>>;

export interface PredictIdealPriceInput {
  anchorSuggestedPrice: number;
  sabor?: string;
  faixaPeso?: string;
  formato?: string;
  indices?: PriceIndexValues;
}

export interface PricePredictionResidual extends PriceIndexAggregate {
  sabor: string;
  faixaPeso: string;
  formato: string;
  predictedPrice: number;
  actualPrice: number | null;
  residual: number | null;
  residualPct: number | null;
}

const EMPTY_VALUE = "Sem informação";

function cleanValue(value: unknown): string {
  const text = String(value ?? "").trim();
  return text || EMPTY_VALUE;
}

function valueForDimension(row: PricingRow, dimension: PriceIndexDimension): string {
  return cleanValue(row[dimension]);
}

function aggregatePriceRows(rows: PricingRow[]): PriceIndexAggregate {
  let rol = 0;
  let volumeKg = 0;
  const skus = new Set<string>();

  for (const row of rows) {
    rol += Number.isFinite(row.rol) ? row.rol : 0;
    volumeKg += Number.isFinite(row.volumeKg) ? row.volumeKg : 0;
    const sku = cleanValue(row.sku || row.skuDesc);
    if (sku !== EMPTY_VALUE) skus.add(sku);
  }

  return {
    rol,
    volumeKg,
    avgPrice: volumeKg > 0 ? rol / volumeKg : null,
    skuCount: skus.size,
  };
}

export function calibratePriceIndices(
  rows: PricingRow[],
  dimension: PriceIndexDimension,
  referenceValue: string,
): CalibratedPriceIndex[] {
  const normalizedReference = cleanValue(referenceValue);
  const groups = new Map<string, PricingRow[]>();

  for (const row of rows) {
    const value = valueForDimension(row, dimension);
    const bucket = groups.get(value) ?? [];
    bucket.push(row);
    groups.set(value, bucket);
  }

  const referenceRows = groups.get(normalizedReference) ?? [];
  const reference = aggregatePriceRows(referenceRows);

  return Array.from(groups.entries())
    .map(([value, bucket]) => {
      const aggregate = aggregatePriceRows(bucket);
      const index = reference.avgPrice && aggregate.avgPrice
        ? aggregate.avgPrice / reference.avgPrice
        : null;

      return {
        dimension,
        value,
        referenceValue: normalizedReference,
        referenceAvgPrice: reference.avgPrice,
        index,
        ...aggregate,
      };
    })
    .sort((a, b) => b.volumeKg - a.volumeKg);
}

export function calibratedIndicesToValues(indices: CalibratedPriceIndex[]): Record<string, number> {
  return indices.reduce<Record<string, number>>((acc, item) => {
    if (item.index !== null && Number.isFinite(item.index)) {
      acc[item.value] = item.index;
    }
    return acc;
  }, {});
}

function lookupIndex(
  indices: PriceIndexValues | undefined,
  dimension: PriceIndexDimension,
  value: string | undefined,
): number {
  if (!value) return 1;
  const index = indices?.[dimension]?.[cleanValue(value)];
  return Number.isFinite(index) && index ? index : 1;
}

export function predictIdealPrice(input: PredictIdealPriceInput): number {
  const basePrice = Math.max(0, input.anchorSuggestedPrice);
  return (
    basePrice *
    lookupIndex(input.indices, "sabor", input.sabor) *
    lookupIndex(input.indices, "faixaPeso", input.faixaPeso) *
    lookupIndex(input.indices, "formato", input.formato)
  );
}

export function calculatePricePredictionResiduals(
  rows: PricingRow[],
  input: Omit<PredictIdealPriceInput, "sabor" | "faixaPeso" | "formato">,
): PricePredictionResidual[] {
  const groups = new Map<string, PricingRow[]>();

  for (const row of rows) {
    const sabor = valueForDimension(row, "sabor");
    const faixaPeso = valueForDimension(row, "faixaPeso");
    const formato = valueForDimension(row, "formato");
    const key = `${sabor}\u0001${faixaPeso}\u0001${formato}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(row);
    groups.set(key, bucket);
  }

  return Array.from(groups.entries())
    .map(([key, bucket]) => {
      const [sabor, faixaPeso, formato] = key.split("\u0001");
      const aggregate = aggregatePriceRows(bucket);
      const predictedPrice = predictIdealPrice({ ...input, sabor, faixaPeso, formato });
      const actualPrice = aggregate.avgPrice;
      const residual = actualPrice !== null ? predictedPrice - actualPrice : null;
      const residualPct = residual !== null && actualPrice > 0 ? residual / actualPrice : null;

      return {
        sabor,
        faixaPeso,
        formato,
        predictedPrice,
        actualPrice,
        residual,
        residualPct,
        ...aggregate,
      };
    })
    .sort((a, b) => Math.abs(b.residual ?? 0) - Math.abs(a.residual ?? 0));
}
