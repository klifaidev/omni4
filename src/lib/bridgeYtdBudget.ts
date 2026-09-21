import type { BudgetRow } from "./budget";
import type { Filters, Metric, PricingRow } from "./types";
import { applyFilters, computePvmEffects, type PvmSkuAgg, type PVMResult } from "./analytics";
import { monthLabel } from "./format";
import { fiscalYearStartYear } from "./fiscalYear";

export interface BridgeYtdBudgetResult {
  result: PVMResult;
  baseRows: PricingRow[];
  compRows: PricingRow[];
  fy: string;
  periods: string[];
  latestPeriodLabel: string;
}

function periodSortValue(row: Pick<PricingRow, "ano" | "mes">): number {
  return row.ano * 100 + row.mes;
}

function budgetToBridgeRow(row: BudgetRow): PricingRow {
  // Budget rows in Superbase do not open CPV reliably. For this bridge only,
  // use the implicit cost needed to reconcile Receita to CM on both sides.
  const receita = Number.isFinite(row.receita) ? row.receita : 0;
  const cm = Number.isFinite(row.cm) ? row.cm : 0;
  const cogs = receita - cm;
  return {
    periodo: row.periodo,
    mes: row.mes,
    ano: row.ano,
    fy: row.fy,
    fyNum: row.fyNum,
    marca: row.marca,
    canal: row.canal,
    canalAjustado: row.canalAjustado,
    categoria: row.categoria,
    subcategoria: row.subcategoria,
    formato: row.formato,
    sku: row.sku,
    skuDesc: row.skuDesc,
    mercado: row.mercado,
    mercadoAjustado: undefined,
    sabor: row.sabor,
    tecnologia: row.tecnologia,
    faixaPeso: row.faixaPeso,
    inovacao: row.inovacao,
    legado: row.legado,
    regiao: undefined,
    uf: undefined,
    regional: undefined,
    cliente: undefined,
    rol: receita,
    volumeKg: row.volumeKg,
    cogs,
    custoVariavel: cogs,
    custoFixo: 0,
    margemBruta: 0,
    contribMarginal: cm,
    frete: 0,
    comissao: 0,
  };
}

function latestRealYtdPeriods(realRows: PricingRow[]): { fy: string; periods: string[]; latestLabel: string } | null {
  const realWithVolume = realRows.filter((row) => (row.volumeKg ?? 0) > 0 || (row.rol ?? 0) > 0 || (row.contribMarginal ?? 0) !== 0);
  if (realWithVolume.length === 0) return null;

  const latest = [...realWithVolume].sort((a, b) => periodSortValue(b) - periodSortValue(a))[0];
  const periodMap = new Map<string, PricingRow>();
  for (const row of realWithVolume) {
    if (row.fy !== latest.fy) continue;
    if (periodSortValue(row) > periodSortValue(latest)) continue;
    if (!periodMap.has(row.periodo)) periodMap.set(row.periodo, row);
  }

  const periods = [...periodMap.values()]
    .sort((a, b) => periodSortValue(a) - periodSortValue(b))
    .map((row) => row.periodo);

  return {
    fy: latest.fy,
    periods,
    latestLabel: monthLabel(latest.mes, latest.ano),
  };
}

function computeBudgetStyleBridge(baseRows: PricingRow[], compRows: PricingRow[], labels: { base: string; comp: string }): PVMResult {
  const aggSku = (rows: PricingRow[]) => {
    const map = new Map<string, PvmSkuAgg>();
    for (const row of rows) {
      const key = row.sku || row.skuDesc || "-";
      const cur = map.get(key) ?? { vol: 0, rol: 0, cogs: 0, frete: 0, comissao: 0, margem: 0 };
      cur.vol += row.volumeKg ?? 0;
      cur.rol += row.rol ?? 0;
      cur.cogs += row.cogs ?? 0;
      cur.margem += row.contribMarginal ?? 0;
      map.set(key, cur);
    }
    return map;
  };

  const base = aggSku(baseRows);
  const comp = aggSku(compRows);
  const descMap = new Map<string, string>();
  for (const row of [...baseRows, ...compRows]) {
    const key = row.sku || row.skuDesc || "-";
    if (!descMap.has(key) && row.skuDesc) descMap.set(key, row.skuDesc);
  }

  const effects = computePvmEffects(base, comp, descMap);
  const others = effects.currentTotal - effects.baseTotal - effects.volume - effects.price - effects.cost;

  return {
    base: effects.baseTotal,
    volume: effects.volume,
    price: effects.price,
    cost: effects.cost,
    freight: 0,
    commission: 0,
    others,
    mixEffect: effects.mixEffect,
    newDiscontinuedEffect: effects.skuOnlyEffect,
    lowVolumeEffect: effects.lowVolumeEffect,
    othersLabel: "Mix e Resíduo Comercial",
    commercialCostsCollapsed: true,
    current: effects.currentTotal,
    baseLabel: labels.base,
    currentLabel: labels.comp,
    skuDetails: effects.skuDetails,
  };
}

export function validateBridgeAgainstDre(
  result: PVMResult,
  dreRows: PricingRow[],
  toleranceRatio = 0.0001,
): { expectedRealCm: number; bridgeCurrent: number; difference: number; ok: boolean } {
  const expectedRealCm = dreRows.reduce((sum, row) => sum + (row.contribMarginal ?? 0), 0);
  const bridgeCurrent = result.current;
  const difference = bridgeCurrent - expectedRealCm;
  const tolerance = Math.max(1, Math.abs(expectedRealCm) * toleranceRatio);
  return {
    expectedRealCm,
    bridgeCurrent,
    difference,
    ok: Math.abs(difference) <= tolerance,
  };
}

export function computeBridgeYtdRealVsBudget(
  budgetRows: BudgetRow[],
  filters: Filters,
  metric: Metric,
): BridgeYtdBudgetResult | null {
  void metric;
  const realRows = budgetRows.filter((row) => row.kind === "real").map(budgetToBridgeRow);
  const budgetPlanRows = budgetRows.filter((row) => row.kind === "budget").map(budgetToBridgeRow);
  const ytd = latestRealYtdPeriods(realRows);
  if (!ytd || ytd.periods.length === 0) return null;

  const periodSet = new Set(ytd.periods);
  const baseRows = applyFilters(
    budgetPlanRows.filter((row) => row.fy === ytd.fy && periodSet.has(row.periodo)),
    filters,
    null,
  );
  const compRows = applyFilters(
    realRows.filter((row) => row.fy === ytd.fy && periodSet.has(row.periodo)),
    filters,
    null,
  );
  if (baseRows.length === 0 || compRows.length === 0) return null;

  const result = computeBudgetStyleBridge(baseRows, compRows, {
    base: `Budget YTD ${ytd.fy}`,
    comp: `Real YTD ate ${ytd.latestLabel}`,
  });

  return {
    result,
    baseRows,
    compRows,
    fy: ytd.fy,
    periods: ytd.periods,
    latestPeriodLabel: ytd.latestLabel,
  };
}

/** Índice do mês dentro do ano fiscal (abril=1 ... março=12) — usado para
 *  achar a mesma janela de meses no ano fiscal anterior numa comparação
 *  YTD vs YTD (ano fiscal abril–março). */
function fiscalMonthIndex(mes: number): number {
  return mes >= 4 ? mes - 3 : mes + 9;
}

function fyLabelFromStartYear(fyStartYear: number): string {
  return `FY${String(fyStartYear).slice(-2)}/${String(fyStartYear + 1).slice(-2)}`;
}

/**
 * Compara o Real acumulado do ano fiscal atual (mesmos meses já fechados,
 * igual à YTD vs Budget) contra o Real da MESMA janela de meses do ano
 * fiscal anterior — ex.: Abr–Ago/26 (FY26/27) vs Abr–Ago/25 (FY25/26).
 * Reusa a mesma agregação por SKU de computeBridgeYtdRealVsBudget, só troca
 * o lado "base" de Budget pra Real do ano fiscal anterior.
 */
export function computeBridgeYtdVsYtd(
  budgetRows: BudgetRow[],
  filters: Filters,
  metric: Metric,
): BridgeYtdBudgetResult | null {
  void metric;
  const realRows = budgetRows.filter((row) => row.kind === "real").map(budgetToBridgeRow);
  const ytd = latestRealYtdPeriods(realRows);
  if (!ytd || ytd.periods.length === 0) return null;

  const periodSet = new Set(ytd.periods);
  const currentFyRows = realRows.filter((row) => row.fy === ytd.fy && periodSet.has(row.periodo));
  if (currentFyRows.length === 0) return null;

  // Meses fiscais presentes na YTD atual (normalmente contíguos desde o
  // início do ano fiscal, mas usa o conjunto real em vez de um corte, pra
  // lidar corretamente com meses faltantes na base).
  const fiscalMonthsPresent = new Set(currentFyRows.map((row) => fiscalMonthIndex(row.mes)));
  const currentFyStartYear = fiscalYearStartYear(currentFyRows[0].mes, currentFyRows[0].ano);
  const previousFy = fyLabelFromStartYear(currentFyStartYear - 1);

  const compRows = applyFilters(currentFyRows, filters, null);
  const baseRows = applyFilters(
    realRows.filter((row) => row.fy === previousFy && fiscalMonthsPresent.has(fiscalMonthIndex(row.mes))),
    filters,
    null,
  );
  if (baseRows.length === 0 || compRows.length === 0) return null;

  const result = computeBudgetStyleBridge(baseRows, compRows, {
    base: `Real YTD ${previousFy}`,
    comp: `Real YTD ${ytd.fy} ate ${ytd.latestLabel}`,
  });

  return {
    result,
    baseRows,
    compRows,
    fy: ytd.fy,
    periods: ytd.periods,
    latestPeriodLabel: ytd.latestLabel,
  };
}
