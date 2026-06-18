import type { ForecastRow } from "./forecast";
import type { PricingRow } from "./types";
import type { KpiMeasureId } from "./customSlide";
import { BUDGET_FILTER_DIMS } from "./budgetAdapter";

function periodRank(periodo: string | undefined): number {
  if (!periodo) return -Infinity;
  const [year, month] = periodo.split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return -Infinity;
  return year * 12 + month;
}

export function getLatestForecastCycle(rows: ForecastRow[]): string | null {
  let latest: string | null = null;
  let latestRank = -Infinity;
  for (const row of rows) {
    const rank = periodRank(row.forecastCycle);
    if (rank > latestRank) {
      latest = row.forecastCycle;
      latestRank = rank;
    }
  }
  return latest;
}

export function forecastRowsAsPricing(rows: ForecastRow[]): PricingRow[] {
  return rows.map((f) => ({
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
}

export function forecastRowsAsPricingLatest(rows: ForecastRow[]): PricingRow[] {
  const latestCycle = getLatestForecastCycle(rows);
  if (!latestCycle) return [];
  return forecastRowsAsPricing(rows.filter((r) => r.forecastCycle === latestCycle));
}

export const FORECAST_UNSUPPORTED_MEASURES: ReadonlySet<KpiMeasureId> = new Set([
  "rol", "cm", "mb", "cv", "frete", "comissao",
  "cmPct", "mbPct", "precoMedio", "positivacao", "ticketMedio",
]);

export const FORECAST_FILTER_DIMS = BUDGET_FILTER_DIMS;
