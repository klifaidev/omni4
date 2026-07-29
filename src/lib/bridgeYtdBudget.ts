import type { BudgetRow } from "./budget";
import type { Filters, Metric, PricingRow } from "./types";
import { applyFilters, type PVMSkuDetail, type PVMResult } from "./analytics";
import { monthLabel } from "./format";

export interface BridgeYtdBudgetResult {
  result: PVMResult;
  baseRows: PricingRow[];
  compRows: PricingRow[];
  fy: string;
  periods: string[];
  latestPeriodLabel: string;
}

const MIN_VOLUME_SHARE_FOR_UNIT_EFFECTS = 0.01;
const MIN_ABSOLUTE_VOLUME_FOR_UNIT_EFFECTS = 1;

function periodSortValue(row: Pick<PricingRow, "ano" | "mes">): number {
  return row.ano * 100 + row.mes;
}

function budgetToBridgeRow(row: BudgetRow): PricingRow {
  const cogs = -(row.cpv ?? 0);
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
    rol: row.receita,
    volumeKg: row.volumeKg,
    cogs,
    custoVariavel: cogs,
    custoFixo: 0,
    margemBruta: 0,
    contribMarginal: row.cm,
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
  interface Agg {
    vol: number;
    rol: number;
    cogs: number;
    margem: number;
  }

  const aggSku = (rows: PricingRow[]) => {
    const map = new Map<string, Agg>();
    for (const row of rows) {
      const key = row.sku || row.skuDesc || "-";
      const cur = map.get(key) ?? { vol: 0, rol: 0, cogs: 0, margem: 0 };
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
  const totalVolume = [...base.values(), ...comp.values()].reduce((sum, row) => sum + Math.max(0, row.vol), 0);
  const minMaterialVolume = Math.max(
    MIN_ABSOLUTE_VOLUME_FOR_UNIT_EFFECTS,
    totalVolume * MIN_VOLUME_SHARE_FOR_UNIT_EFFECTS,
  );
  const descMap = new Map<string, string>();
  for (const row of [...baseRows, ...compRows]) {
    const key = row.sku || row.skuDesc || "-";
    if (!descMap.has(key) && row.skuDesc) descMap.set(key, row.skuDesc);
  }

  let baseTotal = 0;
  let currentTotal = 0;
  for (const row of base.values()) baseTotal += row.margem;
  for (const row of comp.values()) currentTotal += row.margem;

  let volume = 0;
  let price = 0;
  let cost = 0;
  const skuDetails: PVMSkuDetail[] = [];

  for (const sku of new Set([...base.keys(), ...comp.keys()])) {
    const a = base.get(sku);
    const b = comp.get(sku);
    const detail: PVMSkuDetail = {
      sku,
      skuDesc: descMap.get(sku),
      status: a && b ? "both" : a ? "only_base" : "only_comp",
      volA: a?.vol ?? 0,
      volB: b?.vol ?? 0,
      rolA: a?.rol ?? 0,
      rolB: b?.rol ?? 0,
      cogsA: a?.cogs ?? 0,
      cogsB: b?.cogs ?? 0,
      freteA: 0,
      freteB: 0,
      comissaoA: 0,
      comissaoB: 0,
      margemA: a?.margem ?? 0,
      margemB: b?.margem ?? 0,
      volumeEffect: 0,
      priceEffect: 0,
      costEffect: 0,
      freightEffect: 0,
      commissionEffect: 0,
      othersEffect: 0,
      mixResidualEffect: 0,
      skuOnlyEffect: 0,
      lowVolumeResidualEffect: 0,
    };

    if (!a || !b || a.vol === 0 || b.vol === 0) {
      detail.othersEffect = (b?.margem ?? 0) - (a?.margem ?? 0);
      detail.skuOnlyEffect = detail.othersEffect;
      detail.residualCause = "sku_only";
      skuDetails.push(detail);
      continue;
    }

    if (a.vol < minMaterialVolume || b.vol < minMaterialVolume) {
      detail.othersEffect = b.margem - a.margem;
      detail.lowVolumeResidualEffect = detail.othersEffect;
      detail.residualCause = "low_volume";
      skuDetails.push(detail);
      continue;
    }

    const volumeEffect = (b.vol - a.vol) * (a.margem / a.vol);
    const priceEffect = ((b.rol / b.vol) - (a.rol / a.vol)) * b.vol;
    const costEffect = -((b.cogs / b.vol) - (a.cogs / a.vol)) * b.vol;
    const othersEffect = (b.margem - a.margem) - volumeEffect - priceEffect - costEffect;

    detail.volumeEffect = volumeEffect;
    detail.priceEffect = priceEffect;
    detail.costEffect = costEffect;
    detail.othersEffect = othersEffect;
    detail.mixResidualEffect = othersEffect;
    detail.residualCause = "mix";
    skuDetails.push(detail);

    volume += volumeEffect;
    price += priceEffect;
    cost += costEffect;
  }

  const others = currentTotal - baseTotal - volume - price - cost;
  return {
    base: baseTotal,
    volume,
    price,
    cost,
    freight: 0,
    commission: 0,
    others,
    othersLabel: "Mix e Resíduo Comercial",
    commercialCostsCollapsed: true,
    current: currentTotal,
    baseLabel: labels.base,
    currentLabel: labels.comp,
    skuDetails,
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
