import type { Filters, Metric, PricingRow } from "./types";
import type { BudgetRow } from "./budget";

export const measureOf = (r: PricingRow, m: Metric) =>
  m === "cm" ? r.contribMarginal : r.margemBruta;

export function applyFilters(
  rows: PricingRow[],
  filters: Filters,
  selectedPeriods: string[] | null,
): PricingRow[] {
  return rows.filter((r) => {
    if (selectedPeriods && selectedPeriods.length && !selectedPeriods.includes(r.periodo)) return false;
    for (const [k, vals] of Object.entries(filters)) {
      if (!vals || vals.length === 0) continue;
      const v = (r as unknown as Record<string, unknown>)[k] as string | undefined;
      if (!v || !vals.includes(v)) return false;
    }
    return true;
  });
}

export interface KPI {
  rol: number;
  margem: number;
  margemPct: number;
  volumeKg: number;
  skus: number;
}

export function computeKPIs(rows: PricingRow[], metric: Metric): KPI {
  let rol = 0, margem = 0, volumeKg = 0;
  const skuSet = new Set<string>();
  for (const r of rows) {
    rol += r.rol;
    margem += measureOf(r, metric);
    volumeKg += r.volumeKg;
    if (r.sku) skuSet.add(r.sku);
  }
  return {
    rol,
    margem,
    margemPct: rol > 0 ? margem / rol : 0,
    volumeKg,
    skus: skuSet.size,
  };
}

export interface KPIComparison {
  current: KPI;
  previous: KPI;
  delta: KPI;       // absolute deltas (current - previous), margemPct as pp diff
  deltaPct: KPI;    // relative deltas ((c - p) / |p|); 0 when previous is 0
}

export function computeKPIComparison(
  currentRows: PricingRow[],
  previousRows: PricingRow[],
  metric: Metric,
): KPIComparison {
  const current = computeKPIs(currentRows, metric);
  const previous = computeKPIs(previousRows, metric);
  const sub = (a: number, b: number) => a - b;
  const rel = (a: number, b: number) => (b !== 0 ? (a - b) / Math.abs(b) : 0);
  const delta: KPI = {
    rol: sub(current.rol, previous.rol),
    margem: sub(current.margem, previous.margem),
    margemPct: sub(current.margemPct, previous.margemPct),
    volumeKg: sub(current.volumeKg, previous.volumeKg),
    skus: sub(current.skus, previous.skus),
  };
  const deltaPct: KPI = {
    rol: rel(current.rol, previous.rol),
    margem: rel(current.margem, previous.margem),
    margemPct: rel(current.margemPct, previous.margemPct),
    volumeKg: rel(current.volumeKg, previous.volumeKg),
    skus: rel(current.skus, previous.skus),
  };
  return { current, previous, delta, deltaPct };
}

/**
 * Determine the comparison context (previous-period rows + label) for KPI deltas.
 * Returns null when no comparable previous period exists in the data.
 */
export function getKpiComparisonContext(
  rows: PricingRow[],
  filters: Filters,
  selectedPeriods: string[] | null,
): { previousRows: PricingRow[]; label: string } | null {
  // Sort periods chronologically by (ano, mes), not lexicographically — "001.2026"
  // would otherwise sort before "012.2025" and break January's previous-month lookup.
  const periodMeta = new Map<string, { ano: number; mes: number; fy: string }>();
  for (const r of rows) {
    if (!periodMeta.has(r.periodo)) {
      periodMeta.set(r.periodo, { ano: r.ano, mes: r.mes, fy: r.fy });
    }
  }
  const allPeriods = Array.from(periodMeta.keys()).sort((a, b) => {
    const ma = periodMeta.get(a)!;
    const mb = periodMeta.get(b)!;
    return ma.ano - mb.ano || ma.mes - mb.mes;
  });
  if (allPeriods.length < 2) return null;

  const fyOf = (p: string): string | undefined => periodMeta.get(p)?.fy;

  let previousPeriods: string[] = [];
  let label = "";

  if (selectedPeriods && selectedPeriods.length === 1) {
    const idx = allPeriods.indexOf(selectedPeriods[0]);
    if (idx <= 0) return null;
    previousPeriods = [allPeriods[idx - 1]];
    label = "vs. mês anterior";
  } else {
    const activePeriods = selectedPeriods && selectedPeriods.length
      ? selectedPeriods
      : allPeriods;
    const fys = Array.from(new Set(activePeriods.map(fyOf).filter(Boolean))) as string[];
    if (fys.length !== 1) return null;
    const allFys = Array.from(new Set(rows.map((r) => r.fy))).sort();
    const fyIdx = allFys.indexOf(fys[0]);
    if (fyIdx <= 0) return null;
    const prevFy = allFys[fyIdx - 1];
    previousPeriods = allPeriods.filter((p) => fyOf(p) === prevFy);
    if (previousPeriods.length === 0) return null;
    label = "vs. ano fiscal anterior";
  }

  const previousRows = applyFilters(rows, filters, previousPeriods);
  return { previousRows, label };
}

export interface AggRow {
  key: string;
  rol: number;
  margem: number;
  margemPct: number;
  volumeKg: number;
  rolPorKg: number;
  custoVariavel: number;
  custoFixo: number;
}

export function aggregateBy(
  rows: PricingRow[],
  metric: Metric,
  keyFn: (r: PricingRow) => string,
): AggRow[] {
  const map = new Map<string, { rol: number; margem: number; volumeKg: number; custoVariavel: number; custoFixo: number }>();
  for (const r of rows) {
    const k = keyFn(r) || "—";
    const cur = map.get(k) ?? { rol: 0, margem: 0, volumeKg: 0, custoVariavel: 0, custoFixo: 0 };
    cur.rol += r.rol;
    cur.margem += measureOf(r, metric);
    cur.volumeKg += r.volumeKg;
    cur.custoVariavel += r.custoVariavel ?? 0;
    cur.custoFixo += r.custoFixo ?? 0;
    map.set(k, cur);
  }
  return Array.from(map.entries())
    .map(([key, v]) => ({
      key,
      rol: v.rol,
      margem: v.margem,
      margemPct: v.rol > 0 ? v.margem / v.rol : 0,
      volumeKg: v.volumeKg,
      rolPorKg: v.volumeKg > 0 ? v.rol / v.volumeKg : 0,
      custoVariavel: v.custoVariavel,
      custoFixo: v.custoFixo,
    }))
    .sort((a, b) => b.rol - a.rol);
}

export interface CostEvolutionRow {
  periodo: string;
  label: string;
  ano: number;
  mes: number;
  rol: number;
  volumeKg: number;
  custoVariavel: number;
  custoFixo: number;
  custoTotal: number;
  custoVariavelPctRol: number;
  custoFixoPctRol: number;
  custoTotalPctRol: number;
  custoVariavelPorKg: number;
  custoFixoPorKg: number;
  custoTotalPorKg: number;
}

export function computeCostEvolution(rows: PricingRow[]): CostEvolutionRow[] {
  const map = new Map<string, CostEvolutionRow>();
  for (const r of rows) {
    const cur = map.get(r.periodo) ?? {
      periodo: r.periodo,
      label: `${String(r.mes).padStart(2, "0")}/${String(r.ano).slice(-2)}`,
      ano: r.ano,
      mes: r.mes,
      rol: 0,
      volumeKg: 0,
      custoVariavel: 0,
      custoFixo: 0,
      custoTotal: 0,
      custoVariavelPctRol: 0,
      custoFixoPctRol: 0,
      custoTotalPctRol: 0,
      custoVariavelPorKg: 0,
      custoFixoPorKg: 0,
      custoTotalPorKg: 0,
    };
    cur.rol += r.rol;
    cur.volumeKg += r.volumeKg;
    cur.custoVariavel += r.custoVariavel ?? 0;
    cur.custoFixo += r.custoFixo ?? 0;
    map.set(r.periodo, cur);
  }

  return Array.from(map.values())
    .map((row) => {
      const custoTotal = row.custoVariavel + row.custoFixo;
      return {
        ...row,
        custoTotal,
        custoVariavelPctRol: row.rol > 0 ? row.custoVariavel / row.rol : 0,
        custoFixoPctRol: row.rol > 0 ? row.custoFixo / row.rol : 0,
        custoTotalPctRol: row.rol > 0 ? custoTotal / row.rol : 0,
        custoVariavelPorKg: row.volumeKg > 0 ? row.custoVariavel / row.volumeKg : 0,
        custoFixoPorKg: row.volumeKg > 0 ? row.custoFixo / row.volumeKg : 0,
        custoTotalPorKg: row.volumeKg > 0 ? custoTotal / row.volumeKg : 0,
      };
    })
    .sort((a, b) => a.ano - b.ano || a.mes - b.mes);
}

export interface CanalTrendPoint {
  periodo: string;
  label: string;
  ano: number;
  mes: number;
  rol: number;
  margem: number;
  margemPct: number;
  volumeKg: number;
}

/**
 * Monthly time series for a single canal (canalAjustado).
 * If `canal` is null/undefined, aggregates ALL rows.
 */
export function computeCanalTrend(
  rows: PricingRow[],
  canal: string | null,
  metric: Metric,
): CanalTrendPoint[] {
  const map = new Map<string, CanalTrendPoint>();
  for (const r of rows) {
    const c = r.canalAjustado || "Sem canal";
    if (canal != null && c !== canal) continue;
    const cur = map.get(r.periodo) ?? {
      periodo: r.periodo,
      label: `${String(r.mes).padStart(2, "0")}/${String(r.ano).slice(-2)}`,
      ano: r.ano,
      mes: r.mes,
      rol: 0,
      margem: 0,
      margemPct: 0,
      volumeKg: 0,
    };
    cur.rol += r.rol;
    cur.margem += measureOf(r, metric);
    cur.volumeKg += r.volumeKg;
    map.set(r.periodo, cur);
  }
  return Array.from(map.values())
    .map((p) => ({ ...p, margemPct: p.rol > 0 ? p.margem / p.rol : 0 }))
    .sort((a, b) => a.ano - b.ano || a.mes - b.mes);
}

export interface PVMSkuDetail {
  sku: string;
  skuDesc?: string;
  status: "both" | "only_base" | "only_comp";
  volA: number;
  volB: number;
  rolA: number;
  rolB: number;
  cogsA: number;
  cogsB: number;
  freteA: number;
  freteB: number;
  comissaoA: number;
  comissaoB: number;
  margemA: number;
  margemB: number;
  // Effects attributable to this SKU
  volumeEffect: number;
  priceEffect: number;
  costEffect: number;
  freightEffect: number;
  commissionEffect: number;
  othersEffect: number; // for orphan SKUs, full margin impact
}

export interface PVMResult {
  base: number;
  volume: number;
  price: number;
  cost: number;       // Custo variável (CPV)
  freight: number;    // Frete sobre vendas
  commission: number; // Comissão
  others: number;     // Mix + outros (resíduo)
  current: number;
  baseLabel: string;
  currentLabel: string;
  skuDetails: PVMSkuDetail[];
}

/**
 * Detailed PVM bridge between two periods (FY or month).
 * Decomposes CM/MB variation into:
 *   Volume · Preço · Custo Variável · Frete · Comissão · Outros (mix + resíduo)
 *
 * Per-SKU effects use comp-period volumes for unit deltas; volume effect uses
 * base CM unit margin × Δvolume (classic PVM approach).
 *
 * `mode`: "fy" compares by `r.fy`, "month" compares by `r.periodo`.
 */
export function calcPVM(
  rows: PricingRow[],
  metric: Metric,
  base: string,
  comp: string,
  mode: "fy" | "month" = "fy",
  labels?: { base?: string; comp?: string },
): PVMResult {
  const keyOf = (r: PricingRow) => (mode === "fy" ? r.fy : r.periodo);
  const baseRows = rows.filter((r) => keyOf(r) === base);
  const compRows = rows.filter((r) => keyOf(r) === comp);

  interface Agg {
    vol: number;
    rol: number;
    cogs: number;
    frete: number;
    comissao: number;
    margem: number;
  }

  const aggSku = (rs: PricingRow[]) => {
    const m = new Map<string, Agg>();
    for (const r of rs) {
      const k = r.sku || r.skuDesc || "—";
      const c = m.get(k) ?? { vol: 0, rol: 0, cogs: 0, frete: 0, comissao: 0, margem: 0 };
      c.vol += r.volumeKg;
      c.rol += r.rol;
      c.cogs += r.cogs;
      c.frete += r.frete ?? 0;
      c.comissao += r.comissao ?? 0;
      c.margem += measureOf(r, metric);
      m.set(k, c);
    }
    return m;
  };

  const a = aggSku(baseRows);
  const b = aggSku(compRows);

  // Map of sku key → human-readable description (prefer comp period, fallback to base)
  const descMap = new Map<string, string>();
  for (const r of [...baseRows, ...compRows]) {
    const k = r.sku || r.skuDesc || "—";
    if (!descMap.has(k) && r.skuDesc) descMap.set(k, r.skuDesc);
  }

  let baseTotal = 0, currentTotal = 0;
  for (const v of a.values()) { baseTotal += v.margem; }
  for (const v of b.values()) { currentTotal += v.margem; }

  let volEffect = 0;
  let priceEffect = 0;
  let costEffect = 0;
  let freightEffect = 0;
  let commissionEffect = 0;

  const skuDetails: PVMSkuDetail[] = [];
  const allSkus = new Set([...a.keys(), ...b.keys()]);
  for (const sku of allSkus) {
    const ra = a.get(sku);
    const rb = b.get(sku);

    const detail: PVMSkuDetail = {
      sku,
      skuDesc: descMap.get(sku),
      status: ra && rb ? "both" : ra ? "only_base" : "only_comp",
      volA: ra?.vol ?? 0,
      volB: rb?.vol ?? 0,
      rolA: ra?.rol ?? 0,
      rolB: rb?.rol ?? 0,
      cogsA: ra?.cogs ?? 0,
      cogsB: rb?.cogs ?? 0,
      freteA: ra?.frete ?? 0,
      freteB: rb?.frete ?? 0,
      comissaoA: ra?.comissao ?? 0,
      comissaoB: rb?.comissao ?? 0,
      margemA: ra?.margem ?? 0,
      margemB: rb?.margem ?? 0,
      volumeEffect: 0,
      priceEffect: 0,
      costEffect: 0,
      freightEffect: 0,
      commissionEffect: 0,
      othersEffect: 0,
    };

    // SKUs órfãos (só A ou só B) → impacto total cai em Mix/Outros (resíduo).
    if (!ra || !rb || ra.vol === 0 || rb.vol === 0) {
      detail.othersEffect = (rb?.margem ?? 0) - (ra?.margem ?? 0);
      skuDetails.push(detail);
      continue;
    }

    // Efeito Volume no nível do SKU: ΔV × margem unitária base daquele SKU
    const margemUnitA = ra.margem / ra.vol;
    const skuVol = (rb.vol - ra.vol) * margemUnitA;

    // Paasche: efeitos unitários valorizados pelo VOLUME ATUAL (B)
    const priceA = ra.rol / ra.vol;
    const priceB = rb.rol / rb.vol;
    const costA = ra.cogs / ra.vol;
    const costB = rb.cogs / rb.vol;
    const freightA = ra.frete / ra.vol;
    const freightB = rb.frete / rb.vol;
    const commA = ra.comissao / ra.vol;
    const commB = rb.comissao / rb.vol;

    const skuPrice = (priceB - priceA) * rb.vol;
    const skuCost = -(costB - costA) * rb.vol;
    const skuFreight = -(freightB - freightA) * rb.vol;
    const skuComm = -(commB - commA) * rb.vol;

    detail.volumeEffect = skuVol;
    detail.priceEffect = skuPrice;
    detail.costEffect = skuCost;
    detail.freightEffect = skuFreight;
    detail.commissionEffect = skuComm;
    // residual per-SKU (mix puro): ΔMargem - soma dos efeitos calculados
    detail.othersEffect =
      (rb.margem - ra.margem) - skuVol - skuPrice - skuCost - skuFreight - skuComm;

    volEffect += skuVol;
    priceEffect += skuPrice;
    costEffect += skuCost;
    freightEffect += skuFreight;
    commissionEffect += skuComm;

    skuDetails.push(detail);
  }

  const others =
    currentTotal - baseTotal - volEffect - priceEffect - costEffect - freightEffect - commissionEffect;

  return {
    base: baseTotal,
    volume: volEffect,
    price: priceEffect,
    cost: costEffect,
    freight: freightEffect,
    commission: commissionEffect,
    others,
    current: currentTotal,
    baseLabel: labels?.base ?? base,
    currentLabel: labels?.comp ?? comp,
    skuDetails,
  };
}

export function uniqueValues<K extends keyof PricingRow>(rows: PricingRow[], key: K): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const v = r[key];
    if (typeof v === "string" && v) set.add(v);
  }
  return Array.from(set).sort();
}

// ---------------------------------------------------------------
// Alertas executivos para a home
// ---------------------------------------------------------------
export interface Alert {
  id: string;
  severity: "high" | "medium" | "low";
  message: string;
  page: string;
  icon: string;
}

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function generateAlerts(
  rows: PricingRow[],
  budgetRows: BudgetRow[],
  metric: Metric,
): Alert[] {
  const alerts: Alert[] = [];
  if (rows.length === 0) return alerts;

  // ---- SKU agg total (período inteiro carregado) ----
  const skuAgg = aggregateBy(rows, metric, (r) => r.skuDesc || r.sku || "—");
  const totalRol = skuAgg.reduce((s, r) => s + r.rol, 0);
  const validSkus = skuAgg.filter((s) => s.rol > 0 && isFinite(s.margemPct));
  const medMargemSku = median(validSkus.map((s) => s.margemPct));

  // (1) SKUs classe A com margem% < mediana
  const sortedByRol = [...validSkus].sort((a, b) => b.rol - a.rol);
  let acc = 0;
  const classeA: typeof sortedByRol = [];
  for (const s of sortedByRol) {
    if (acc / totalRol >= 0.8) break;
    classeA.push(s);
    acc += s.rol;
  }
  const aBelow = classeA.filter((s) => s.margemPct < medMargemSku);
  if (aBelow.length > 0) {
    const worst = aBelow.sort((a, b) => a.margemPct - b.margemPct)[0];
    alerts.push({
      id: "a-below-median",
      severity: "high",
      message: `${aBelow.length} SKU(s) classe A com margem abaixo da mediana — pior: ${worst.key} (${(worst.margemPct * 100).toFixed(1)}%)`,
      page: "/abc",
      icon: "trending-down",
    });
  }

  // (2) Canal > 15% ROL com margem caindo 2+ meses consecutivos
  const canais = aggregateBy(rows, metric, (r) => r.canalAjustado || "Sem canal");
  for (const c of canais) {
    if (totalRol === 0 || c.rol / totalRol <= 0.15) continue;
    const trend = computeCanalTrend(rows, c.key, metric);
    if (trend.length < 3) continue;
    const last3 = trend.slice(-3);
    const drop1 = last3[1].margemPct - last3[0].margemPct;
    const drop2 = last3[2].margemPct - last3[1].margemPct;
    if (drop1 < 0 && drop2 < 0) {
      const totalDrop = (last3[2].margemPct - last3[0].margemPct) * 100;
      alerts.push({
        id: `canal-drop-${c.key}`,
        severity: "high",
        message: `Canal ${c.key} com queda de margem em 2 meses consecutivos (${totalDrop.toFixed(1)}pp)`,
        page: "/canais",
        icon: "alert-triangle",
      });
    }
  }

  // (3) Projeção de fechamento do Budget < 95%
  if (budgetRows.length > 0) {
    const fysWithReal = new Set(budgetRows.filter((r) => r.kind === "real").map((r) => r.fy));
    const currentFy = Array.from(fysWithReal).sort().pop();
    if (currentFy) {
      const fyRows = budgetRows.filter((r) => r.fy === currentFy);
      const realPeriods = new Set(fyRows.filter((r) => r.kind === "real").map((r) => r.periodo));
      let realRolYtd = 0, budRolYtd = 0, budRolFy = 0;
      for (const r of fyRows) {
        if (r.kind === "real") realRolYtd += r.receita;
        else {
          budRolFy += r.receita;
          if (realPeriods.has(r.periodo)) budRolYtd += r.receita;
        }
      }
      const ratio = budRolYtd > 0 ? realRolYtd / budRolYtd : 0;
      const projected = realRolYtd + (budRolFy - budRolYtd) * ratio;
      const attainment = budRolFy > 0 ? projected / budRolFy : 0;
      if (attainment > 0 && attainment < 0.95) {
        alerts.push({
          id: "budget-projection",
          severity: "high",
          message: `Projeção de fechamento do FY ${currentFy} em ${(attainment * 100).toFixed(1)}% do budget`,
          page: "/budget",
          icon: "target",
        });
      }
    }
  }

  // (4) SKUs no quadrante Abacaxis com ROL > 1% do total
  const vols = validSkus.map((s) => s.volumeKg);
  const medVol = median(vols);
  const abacaxis = validSkus.filter(
    (s) => s.volumeKg < medVol && s.margemPct < medMargemSku && s.rol / Math.max(totalRol, 1) > 0.01,
  );
  if (abacaxis.length > 0) {
    alerts.push({
      id: "abacaxis-relevantes",
      severity: "medium",
      message: `${abacaxis.length} SKU(s) "Abacaxi" com ROL relevante (>1% do total) — avaliar descontinuação`,
      page: "/abc",
      icon: "alert-circle",
    });
  }

  // (5) Margem% do último mês > 2pp abaixo da média histórica
  const monthly = computeCanalTrend(rows, null, metric);
  if (monthly.length >= 2) {
    const last = monthly[monthly.length - 1];
    const prior = monthly.slice(0, -1);
    const avg = prior.reduce((s, p) => s + p.margemPct, 0) / prior.length;
    const diffPp = (last.margemPct - avg) * 100;
    if (diffPp < -2) {
      alerts.push({
        id: "margin-below-historical",
        severity: "medium",
        message: `Margem de ${last.label} (${(last.margemPct * 100).toFixed(1)}%) está ${Math.abs(diffPp).toFixed(1)}pp abaixo da média histórica`,
        page: "/dre",
        icon: "trending-down",
      });
    }
  }

  // (6-8) Alertas derivados do PVM automático (mês mais recente vs. anterior)
  const periodMeta = new Map<string, { ano: number; mes: number; label: string }>();
  for (const r of rows) {
    if (!periodMeta.has(r.periodo)) {
      periodMeta.set(r.periodo, {
        ano: r.ano,
        mes: r.mes,
        label: `${String(r.mes).padStart(2, "0")}/${String(r.ano).slice(-2)}`,
      });
    }
  }
  const sortedPeriods = Array.from(periodMeta.entries()).sort(
    (a, b) => a[1].ano - b[1].ano || a[1].mes - b[1].mes,
  );
  if (sortedPeriods.length >= 2) {
    const [basePeriod, baseMeta] = sortedPeriods[sortedPeriods.length - 2];
    const [compPeriod, compMeta] = sortedPeriods[sortedPeriods.length - 1];
    const pvm = calcPVM(rows, metric, basePeriod, compPeriod, "month", {
      base: baseMeta.label,
      comp: compMeta.label,
    });
    const compRol = rows
      .filter((r) => r.periodo === compPeriod)
      .reduce((s, r) => s + r.rol, 0);
    const effects: Record<string, number> = {
      volume: pvm.volume,
      price: pvm.price,
      cost: pvm.cost,
      freight: pvm.freight,
      commission: pvm.commission,
      others: pvm.others,
    };
    const totalNeg = Object.values(effects)
      .filter((v) => v < 0)
      .reduce((s, v) => s + Math.abs(v), 0);
    const negEntries = Object.entries(effects).filter(([, v]) => v < 0);
    const largestNeg = negEntries.sort((a, b) => a[1] - b[1])[0];
    const fmtBRL = (v: number) =>
      v.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 0,
        notation: Math.abs(v) >= 1_000_000 ? "compact" : "standard",
      });

    if (
      largestNeg &&
      largestNeg[0] === "price" &&
      totalNeg > 0 &&
      Math.abs(effects.price) / totalNeg > 0.4
    ) {
      alerts.push({
        id: "pvm-price-deterioration",
        severity: "high",
        message: `Deterioração de preço detectada em ${compMeta.label} — efeito preço de ${fmtBRL(effects.price)} está puxando a margem para baixo`,
        page: "/bridge-pvm",
        icon: "trending-down",
      });
    }

    if (effects.cost < 0 && compRol > 0 && Math.abs(effects.cost) / compRol > 0.3) {
      alerts.push({
        id: "pvm-cost-pressure",
        severity: "high",
        message: `Pressão de custo variável elevada em ${compMeta.label} — impacto de ${fmtBRL(effects.cost)} na margem`,
        page: "/bridge-pvm",
        icon: "alert-triangle",
      });
    }

    const totalDelta = pvm.current - pvm.base;
    if (pvm.base !== 0) {
      const deltaPct = totalDelta / Math.abs(pvm.base);
      if (deltaPct < -0.05) {
        alerts.push({
          id: "pvm-margin-drop",
          severity: "medium",
          message: `Margem ${compMeta.label} recuou ${Math.abs(deltaPct * 100).toFixed(1)}% vs. ${baseMeta.label} — acessar Bridge PVM para diagnóstico completo`,
          page: "/bridge-pvm",
          icon: "alert-circle",
        });
      }
    }
  }

  const order = { high: 0, medium: 1, low: 2 } as const;
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}

// ---------------------------------------------------------------------------
// Price decomposition: pure-price vs. mix effect on average price (R$/kg)
// ---------------------------------------------------------------------------

export interface PriceDecompositionSku {
  sku: string;
  skuDesc: string;
  precoBase: number;
  precoComp: number;
  deltaPreco: number;
  deltaPrecoRs: number;
  shareBase: number;
  shareComp: number;
  deltaMixShare: number;
  efeitoMixRs: number;
  volumeBase: number;
  volumeComp: number;
}

export interface PriceDecompositionResult {
  baseLabel: string;
  compLabel: string;
  precoMedioBase: number;
  precoMedioComp: number;
  variacaoTotal: number;
  variacaoPct: number;
  efeitoPrecoRs: number;
  efeitoMixRs: number;
  efeitoPrecoRsKg: number;
  efeitoMixRsKg: number;
  pctPreco: number;
  pctMix: number;
  skus: PriceDecompositionSku[];
}

export function computePriceDecomposition(
  rows: PricingRow[],
  baseKey: string,
  compKey: string,
  periodMode: "month" | "fy",
  labels?: { base: string; comp: string },
): PriceDecompositionResult | null {
  if (!baseKey || !compKey || baseKey === compKey) return null;
  const keyOf = (r: PricingRow) => (periodMode === "fy" ? r.fy : r.periodo);

  interface Agg { vol: number; rol: number; desc: string }
  const aggBase = new Map<string, Agg>();
  const aggComp = new Map<string, Agg>();
  let volTotalBase = 0, volTotalComp = 0, rolTotalBase = 0, rolTotalComp = 0;

  for (const r of rows) {
    const k = keyOf(r);
    const skuKey = r.sku || r.skuDesc || "—";
    const target = k === baseKey ? aggBase : k === compKey ? aggComp : null;
    if (!target) continue;
    const cur = target.get(skuKey) ?? { vol: 0, rol: 0, desc: r.skuDesc || skuKey };
    cur.vol += r.volumeKg;
    cur.rol += r.rol;
    if (r.skuDesc && !cur.desc) cur.desc = r.skuDesc;
    target.set(skuKey, cur);
    if (k === baseKey) { volTotalBase += r.volumeKg; rolTotalBase += r.rol; }
    else { volTotalComp += r.volumeKg; rolTotalComp += r.rol; }
  }

  if (volTotalBase <= 0 || volTotalComp <= 0) return null;

  const precoMedioBase = rolTotalBase / volTotalBase;
  const precoMedioComp = rolTotalComp / volTotalComp;
  const variacaoTotal = precoMedioComp - precoMedioBase;
  const variacaoPct = precoMedioBase !== 0 ? variacaoTotal / precoMedioBase : 0;

  const skuKeys = new Set([...aggBase.keys(), ...aggComp.keys()]);
  const skus: PriceDecompositionSku[] = [];
  let efeitoPrecoRs = 0, efeitoMixRs = 0;

  for (const k of skuKeys) {
    const a = aggBase.get(k);
    const b = aggComp.get(k);
    const volumeBase = a?.vol ?? 0;
    const volumeComp = b?.vol ?? 0;
    if (volumeBase === 0 && volumeComp === 0) continue;
    const precoBase = volumeBase !== 0 ? (a!.rol / volumeBase) : 0;
    const precoComp = volumeComp !== 0 ? (b!.rol / volumeComp) : 0;
    const shareBase = volTotalBase > 0 ? volumeBase / volTotalBase : 0;
    const shareComp = volTotalComp > 0 ? volumeComp / volTotalComp : 0;
    const deltaMixShare = shareComp - shareBase;

    // Price effect: only meaningful when SKU has volume in both periods.
    const deltaPreco = volumeBase !== 0 && volumeComp !== 0 ? (precoComp - precoBase) : 0;
    const deltaPrecoRs = deltaPreco * volumeComp;

    // Mix effect: uses base price as anchor; for new SKUs (no base), use comp price as proxy.
    const anchorPrice = volumeBase !== 0 ? precoBase : precoComp;
    const efeitoMixI = deltaMixShare * anchorPrice * volTotalComp;

    efeitoPrecoRs += deltaPrecoRs;
    efeitoMixRs += efeitoMixI;

    skus.push({
      sku: k,
      skuDesc: (b?.desc || a?.desc || k),
      precoBase,
      precoComp,
      deltaPreco,
      deltaPrecoRs,
      shareBase,
      shareComp,
      deltaMixShare,
      efeitoMixRs: efeitoMixI,
      volumeBase,
      volumeComp,
    });
  }

  const targetDeltaRs = variacaoTotal * volTotalComp;
  const residualRs = targetDeltaRs - efeitoPrecoRs - efeitoMixRs;
  if (Math.abs(residualRs) > 0.000001) {
    efeitoMixRs += residualRs;
    skus.push({
      sku: "__price_decomp_residual__",
      skuDesc: "Ajustes sem volume / resíduo",
      precoBase: 0,
      precoComp: 0,
      deltaPreco: 0,
      deltaPrecoRs: 0,
      shareBase: 0,
      shareComp: 0,
      deltaMixShare: 0,
      efeitoMixRs: residualRs,
      volumeBase: 0,
      volumeComp: 0,
    });
  }

  const efeitoPrecoRsKg = volTotalComp > 0 ? efeitoPrecoRs / volTotalComp : 0;
  const efeitoMixRsKg = volTotalComp > 0 ? efeitoMixRs / volTotalComp : 0;
  const sumAbs = Math.abs(efeitoPrecoRs) + Math.abs(efeitoMixRs);
  const pctPreco = sumAbs > 0 ? efeitoPrecoRs / sumAbs : 0;
  const pctMix = sumAbs > 0 ? efeitoMixRs / sumAbs : 0;

  return {
    baseLabel: labels?.base ?? baseKey,
    compLabel: labels?.comp ?? compKey,
    precoMedioBase,
    precoMedioComp,
    variacaoTotal,
    variacaoPct,
    efeitoPrecoRs,
    efeitoMixRs,
    efeitoPrecoRsKg,
    efeitoMixRsKg,
    pctPreco,
    pctMix,
    skus,
  };
}
