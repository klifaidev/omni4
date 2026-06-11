// Linha unificada Real + Budget para a Pivot Table.
// Gera um dataset comum onde cada linha tem dimensões + medidas das duas bases.
// A unificação é feita por chave (periodo + sku + canalAjustado), depois o pivot
// agrega normalmente. Cobre 3 modos: real, budget, comparativo.
import type { PricingRow } from "./types";
import type { BudgetRow } from "./budget";
import { monthLabel } from "./format";

export type PivotMode = "real" | "budget" | "compare";

export interface UnifiedRow {
  // Dimensões compartilhadas
  periodo: string;
  mesLabel: string;
  fy: string;
  marca?: string;
  categoria?: string;
  subcategoria?: string;
  formato?: string;
  tecnologia?: string;
  mercado?: string;
  faixaPeso?: string;
  sabor?: string;
  sku?: string;
  skuDesc?: string;
  canalAjustado?: string;
  inovacao?: string;
  legado?: string;
  // Apenas Real
  canal?: string;
  cliente?: string;
  regiao?: string;
  uf?: string;
  regional?: string;
  mercadoAjustado?: string;
  // Medidas Real
  rol_real: number;
  volumeKg_real: number;
  cogs_real: number;
  cm_real: number;
  mb_real: number;
  custoVariavel_real: number;
  custoFixo_real: number;
  materiaPrima_real: number;
  embalagem_real: number;
  mod_real: number;
  cif_real: number;
  frete_real: number;
  comissao_real: number;
  // Medidas Budget
  rol_budget: number;
  volumeKg_budget: number;
  cm_budget: number;
  cpv_budget: number;
}

export const ALL_DIMENSIONS: { id: keyof UnifiedRow; label: string; group: string }[] = [
  { id: "fy", label: "FY", group: "Tempo" },
  { id: "periodo", label: "Período", group: "Tempo" },
  { id: "mesLabel", label: "Mês", group: "Tempo" },
  { id: "marca", label: "Marca", group: "Produto" },
  { id: "categoria", label: "Categoria", group: "Produto" },
  { id: "subcategoria", label: "Subcategoria", group: "Produto" },
  { id: "formato", label: "Formato", group: "Produto" },
  { id: "tecnologia", label: "Tecnologia", group: "Produto" },
  { id: "mercado", label: "Mercado", group: "Produto" },
  { id: "faixaPeso", label: "Faixa de Peso", group: "Produto" },
  { id: "sabor", label: "Sabor", group: "Produto" },
  { id: "sku", label: "SKU", group: "Produto" },
  { id: "skuDesc", label: "Descrição SKU", group: "Produto" },
  { id: "inovacao", label: "Inovação / Regular", group: "Inovação" },
  { id: "legado", label: "Legado", group: "Inovação" },
  { id: "canalAjustado", label: "Canal Ajustado", group: "Comercial" },
  { id: "canal", label: "Canal (Real)", group: "Comercial" },
  { id: "cliente", label: "Cliente (Real)", group: "Comercial" },
  { id: "regiao", label: "Região (Real)", group: "Comercial" },
  { id: "uf", label: "UF (Real)", group: "Comercial" },
  { id: "regional", label: "Regional (Real)", group: "Comercial" },
  { id: "mercadoAjustado", label: "Mercado Ajustado (Real)", group: "Comercial" },
];

/**
 * Constrói linhas unificadas. As bases são mantidas separadas (não há join),
 * apenas projetadas no mesmo formato. Para visões "Real+Budget", o pivot
 * agrega ambas pelas mesmas dimensões — quando uma base não tem dado para a
 * combinação, a medida correspondente fica zerada.
 */
export function buildUnifiedRows(
  realRows: PricingRow[],
  budgetRows: BudgetRow[],
  mode: PivotMode,
): UnifiedRow[] {
  const out: UnifiedRow[] = [];

  if (mode === "real" || mode === "compare") {
    for (const r of realRows) {
      out.push({
        periodo: r.periodo,
        mesLabel: monthLabel(r.mes, r.ano),
        fy: r.fy,
        marca: r.marca,
        categoria: r.categoria,
        subcategoria: r.subcategoria,
        formato: r.formato,
        tecnologia: r.tecnologia,
        mercado: r.mercado,
        faixaPeso: r.faixaPeso,
        sabor: r.sabor,
        sku: r.sku,
        skuDesc: r.skuDesc,
        canalAjustado: r.canalAjustado,
        inovacao: r.inovacao,
        legado: r.legado,
        canal: r.canal,
        cliente: r.cliente,
        regiao: r.regiao,
        uf: r.uf,
        regional: r.regional,
        mercadoAjustado: r.mercadoAjustado,
        rol_real: r.rol,
        volumeKg_real: r.volumeKg,
        cogs_real: r.cogs,
        cm_real: r.contribMarginal,
        mb_real: r.margemBruta,
        custoVariavel_real: r.custoVariavel ?? 0,
        custoFixo_real: r.custoFixo ?? 0,
        materiaPrima_real: r.materiaPrima ?? 0,
        embalagem_real: r.embalagem ?? 0,
        mod_real: r.mod ?? 0,
        cif_real: r.cif ?? 0,
        frete_real: r.frete ?? 0,
        comissao_real: r.comissao ?? 0,
        rol_budget: 0,
        volumeKg_budget: 0,
        cm_budget: 0,
        cpv_budget: 0,
      });
    }
  }

  if (mode === "budget" || mode === "compare") {
    for (const b of budgetRows) {
      out.push({
        periodo: b.periodo,
        mesLabel: monthLabel(b.mes, b.ano),
        fy: b.fy,
        marca: b.marca,
        categoria: b.categoria,
        subcategoria: b.subcategoria,
        formato: b.formato,
        tecnologia: b.tecnologia,
        mercado: b.mercado,
        faixaPeso: b.faixaPeso,
        sabor: b.sabor,
        sku: b.sku,
        skuDesc: b.skuDesc,
        canalAjustado: b.canalAjustado,
        inovacao: b.inovacao,
        legado: b.legado,
        rol_real: 0,
        volumeKg_real: 0,
        cogs_real: 0,
        cm_real: 0,
        mb_real: 0,
        custoVariavel_real: 0,
        custoFixo_real: 0,
        materiaPrima_real: 0,
        embalagem_real: 0,
        mod_real: 0,
        cif_real: 0,
        frete_real: 0,
        comissao_real: 0,
        rol_budget: b.receita,
        volumeKg_budget: b.volumeKg,
        cm_budget: b.cm,
        cpv_budget: b.cpv,
      });
    }
  }

  return out;
}

/** Apenas dimensões aplicáveis ao modo escolhido. */
export function dimensionsForMode(mode: PivotMode) {
  if (mode === "budget") {
    // Budget não tem cliente/região/UF/regional; remove essas
    return ALL_DIMENSIONS.filter(
      (d) => !["canal", "cliente", "regiao", "uf", "regional", "mercadoAjustado"].includes(d.id as string),
    );
  }
  return ALL_DIMENSIONS;
}
