import type { ForecastRow } from "./forecast";
import type { PricingRow } from "./types";
import type { KpiMeasureId } from "./customSlide";
import { BUDGET_FILTER_DIMS } from "./budgetAdapter";

const forecastRowsCache = new WeakMap<ForecastRow[], PricingRow[]>();
const forecastLatestRowsCache = new WeakMap<ForecastRow[], PricingRow[]>();

function periodRank(periodo: string | undefined): number {
  if (!periodo) return -Infinity;
  const text = String(periodo).trim();
  let year = 0;
  let month = 0;
  const appFormat = text.match(/^0*(\d{1,2})[./-](\d{4})$/);
  const isoFormat = text.match(/^(\d{4})-(\d{1,2})$/);
  if (appFormat) {
    month = Number(appFormat[1]);
    year = Number(appFormat[2]);
  } else if (isoFormat) {
    year = Number(isoFormat[1]);
    month = Number(isoFormat[2]);
  }
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return -Infinity;
  return year * 12 + month;
}

export function getLatestForecastCycle(rows: ForecastRow[]): string | null {
  let latest: string | null = null;
  let latestRank = -Infinity;
  for (const row of rows) {
    const rank = periodRank(row.forecastCycle);
    if (!latest || rank > latestRank) {
      latest = row.forecastCycle;
      latestRank = rank;
    }
  }
  return latest;
}

export function forecastRowsAsPricing(rows: ForecastRow[]): PricingRow[] {
  const cached = forecastRowsCache.get(rows);
  if (cached) return cached;
  const converted = rows.map((f) => ({
    periodo: f.periodo,
    mes: f.mes,
    ano: f.ano,
    fy: f.fy,
    fyNum: f.fyNum,
    marca: f.marca,
    canal: f.canal,
    canalAjustado: f.canalAjustado,
    categoria: f.categoria,
    subcategoria: f.subcategoria,
    formato: f.formato,
    sku: f.sku,
    skuDesc: f.skuDesc,
    mercado: f.mercado,
    mercadoAjustado: undefined,
    sabor: f.sabor,
    tecnologia: f.tecnologia,
    faixaPeso: f.faixaPeso,
    inovacao: f.inovacao,
    legado: f.legado,
    regiao: undefined,
    uf: undefined,
    regional: undefined,
    cliente: undefined,
    rol: 0,
    volumeKg: f.volumeKg,
    cogs: 0,
    custoVariavel: 0,
    custoFixo: 0,
    margemBruta: 0,
    contribMarginal: 0,
    frete: 0,
    comissao: 0,
  }));
  forecastRowsCache.set(rows, converted);
  return converted;
}

export function forecastRowsAsPricingLatest(rows: ForecastRow[]): PricingRow[] {
  const cached = forecastLatestRowsCache.get(rows);
  if (cached) return cached;
  const latestCycle = getLatestForecastCycle(rows);
  if (!latestCycle) {
    forecastLatestRowsCache.set(rows, []);
    return [];
  }
  const latestRows = rows.filter((r) => r.forecastCycle === latestCycle);
  const converted = forecastRowsAsPricing(latestRows);
  forecastLatestRowsCache.set(rows, converted);
  return converted;
}

export const FORECAST_UNSUPPORTED_MEASURES: ReadonlySet<KpiMeasureId> = new Set([
  "rol", "cm", "mb", "cv", "frete", "comissao",
  "cmPct", "mbPct", "precoMedio", "positivacao", "ticketMedio",
]);

export const FORECAST_FILTER_DIMS = BUDGET_FILTER_DIMS;
