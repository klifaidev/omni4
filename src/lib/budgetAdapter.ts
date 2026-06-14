// Adapta linhas Budget (BudgetRow) para o formato PricingRow, permitindo
// que blocos do Slide Personalizado consumam a base "Budget" reaproveitando
// todos os helpers já existentes (applyFilters, computeKpiBlock,
// computeChartSeries, computeTopRanking, computePivot).
//
// Mapeamento de medidas Budget → KPI:
//   rol           ← receita
//   volume        ← volumeKg
//   cm            ← cm
//   cv            ← cpv          (CPV total como custo variável proxy)
//   cmPct         ← cm / receita
//   precoMedio    ← receita / volumeKg
//
// Não suportadas em Budget: mb, mbPct, frete, comissao  → permanecem 0/—.

import type { PricingRow } from "./types";
import type { BudgetRow } from "./budget";
import type { KpiMeasureId } from "./customSlide";

/** Converte linhas Budget em PricingRow (campos ausentes ficam 0/undefined). */
export function budgetRowsAsPricing(rows: BudgetRow[]): PricingRow[] {
  return rows.map((b) => ({
    periodo: b.periodo,
    mes: b.mes,
    ano: b.ano,
    fy: b.fy,
    fyNum: b.fyNum,
    marca: b.marca,
    canal: b.canal,
    canalAjustado: b.canalAjustado,
    categoria: b.categoria,
    subcategoria: b.subcategoria,
    formato: b.formato,
    sku: b.sku,
    skuDesc: b.skuDesc,
    mercado: b.mercado,
    mercadoAjustado: undefined,
    sabor: b.sabor,
    tecnologia: b.tecnologia,
    faixaPeso: b.faixaPeso,
    inovacao: b.inovacao,
    legado: b.legado,
    regiao: undefined,
    uf: undefined,
    regional: undefined,
    cliente: undefined,
    rol: b.receita,
    volumeKg: b.volumeKg,
    cogs: b.cpv,
    custoVariavel: b.cpv,
    custoFixo: 0,
    margemBruta: 0,
    contribMarginal: b.cm,
    frete: 0,
    comissao: 0,
  }));
}

/** Converte linhas Budget filtradas por kind. */
export function budgetRowsAsPricingFiltered(
  rows: BudgetRow[],
  kind: "budget" | "real" | "all",
): PricingRow[] {
  const filtered = kind === "all" ? rows : rows.filter((r) => r.kind === kind);
  return budgetRowsAsPricing(filtered);
}

/** Medidas que NÃO existem na base Budget (devem ser desabilitadas na UI). */
export const BUDGET_UNSUPPORTED_MEASURES: ReadonlySet<KpiMeasureId> = new Set([
  "mb", "mbPct", "frete", "comissao",
]);

/** Dimensões disponíveis para filtro/quebra na base Budget. */
export const BUDGET_FILTER_DIMS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "categoria", label: "Categoria" },
  { key: "marca", label: "Marca" },
  { key: "canalAjustado", label: "Canal" },
  { key: "subcategoria", label: "Subcategoria" },
  { key: "formato", label: "Formato" },
  { key: "tecnologia", label: "Tecnologia" },
  { key: "faixaPeso", label: "Faixa de Peso" },
  { key: "sabor", label: "Sabor" },
  { key: "sku", label: "SKU" },
];

/** Dimensões disponíveis na base KE30 (super-set). */
export const KE30_FILTER_DIMS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "categoria", label: "Categoria" },
  { key: "marca", label: "Marca" },
  { key: "tecnologia", label: "Tecnologia" },
  { key: "formato", label: "Formato" },
  { key: "mercado", label: "Mercado" },
  { key: "faixaPeso", label: "Faixa de Peso" },
  { key: "sabor", label: "Sabor" },
  { key: "sku", label: "SKU" },
  { key: "canalAjustado", label: "Canal Ajustado" },
  { key: "mercadoAjustado", label: "Mercado Ajustado" },
  { key: "regional", label: "Regional" },
  { key: "uf", label: "UF" },
];
