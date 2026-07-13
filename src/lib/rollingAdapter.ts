import type { RollingRow } from "./rolling";
import type { PricingRow } from "./types";
import type { KpiMeasureId } from "./customSlide";
import { BUDGET_FILTER_DIMS } from "./budgetAdapter";

const rollingRowsCache = new WeakMap<RollingRow[], PricingRow[]>();

export function rollingRowsAsPricing(rows: RollingRow[]): PricingRow[] {
  const cached = rollingRowsCache.get(rows);
  if (cached) return cached;
  const converted = rows.map((r) => ({
    periodo: r.periodo,
    mes: r.mes,
    ano: r.ano,
    fy: r.fy,
    fyNum: r.fyNum,
    marca: r.marca,
    canal: r.canal,
    canalAjustado: r.canalAjustado,
    categoria: r.categoria,
    subcategoria: r.subcategoria,
    formato: r.formato,
    sku: r.sku,
    skuDesc: r.skuDesc,
    mercado: r.mercado,
    mercadoAjustado: undefined,
    sabor: r.sabor,
    tecnologia: r.tecnologia,
    faixaPeso: r.faixaPeso,
    inovacao: r.inovacao,
    legado: r.legado,
    regiao: undefined,
    uf: undefined,
    regional: undefined,
    cliente: undefined,
    rol: r.receitaLiquida,
    volumeKg: r.volumeKg,
    cogs: r.custoVariavel,
    custoVariavel: r.custoVariavel,
    custoFixo: 0,
    margemBruta: r.receitaLiquida - r.custoVariavel,
    contribMarginal: r.contribMarginal,
    frete: r.frete,
    comissao: r.comissao,
  }));
  rollingRowsCache.set(rows, converted);
  return converted;
}

export const ROLLING_UNSUPPORTED_MEASURES: ReadonlySet<KpiMeasureId> = new Set([
  "positivacao",
  "ticketMedio",
]);

export const ROLLING_FILTER_DIMS = BUDGET_FILTER_DIMS;
