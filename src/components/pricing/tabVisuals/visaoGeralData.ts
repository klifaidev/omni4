// Dados dos visuais da Visão Geral usados pela aba e pelo slide.
import { aggregateBy, type AggRow } from "@/lib/analytics";
import type { Metric, PricingRow } from "@/lib/types";

// FY vai de abril a março.
export const FY_MONTH_ORDER = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
export const MES_NOMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export interface SazonalidadeData {
  matrix: { fy: string; cells: (number | null)[] }[];
  min: number;
  max: number;
  best: { mes: number; pct: number } | null;
  worst: { mes: number; pct: number } | null;
  hasData: boolean;
}

/** Margem % por mês × ano fiscal, com o melhor e o pior mês na média. */
export function computeSazonalidade(rows: PricingRow[], metric: Metric): SazonalidadeData {
  const acc = new Map<string, Map<number, { margem: number; rol: number }>>();
  const fySet = new Set<string>();
  const fyNumMap = new Map<string, number>();
  for (const r of rows) {
    const margem = metric === "cm" ? r.contribMarginal : r.margemBruta;
    const rol = r.rol;
    if (!Number.isFinite(margem) || !Number.isFinite(rol)) continue;
    fySet.add(r.fy);
    fyNumMap.set(r.fy, r.fyNum);
    let byMonth = acc.get(r.fy);
    if (!byMonth) {
      byMonth = new Map();
      acc.set(r.fy, byMonth);
    }
    const cell = byMonth.get(r.mes) ?? { margem: 0, rol: 0 };
    cell.margem += margem;
    cell.rol += rol;
    byMonth.set(r.mes, cell);
  }
  const fys = Array.from(fySet).sort((a, b) => (fyNumMap.get(a) ?? 0) - (fyNumMap.get(b) ?? 0));
  const matrix = fys.map((fy) => {
    const byMonth = acc.get(fy)!;
    const cells = FY_MONTH_ORDER.map((m) => {
      const c = byMonth.get(m);
      if (!c || c.rol === 0) return null;
      return c.margem / c.rol;
    });
    return { fy, cells };
  });
  const allVals = matrix.flatMap((r) => r.cells.filter((v): v is number => v !== null));
  const min = allVals.length ? Math.min(...allVals) : 0;
  const max = allVals.length ? Math.max(...allVals) : 0;

  // Média de cada mês em todos os FYs (ponderada pelo ROL).
  const monthAvg = new Map<number, { margem: number; rol: number }>();
  for (const byMonth of acc.values()) {
    for (const [m, c] of byMonth.entries()) {
      const cur = monthAvg.get(m) ?? { margem: 0, rol: 0 };
      cur.margem += c.margem;
      cur.rol += c.rol;
      monthAvg.set(m, cur);
    }
  }
  const monthlyAverages = FY_MONTH_ORDER.map((m) => ({
    mes: m,
    pct: monthAvg.has(m) && monthAvg.get(m)!.rol > 0 ? monthAvg.get(m)!.margem / monthAvg.get(m)!.rol : null,
  })).filter((x) => x.pct !== null) as { mes: number; pct: number }[];

  let best: { mes: number; pct: number } | null = null;
  let worst: { mes: number; pct: number } | null = null;
  for (const m of monthlyAverages) {
    if (!best || m.pct > best.pct) best = m;
    if (!worst || m.pct < worst.pct) worst = m;
  }
  return { matrix, min, max, best, worst, hasData: allVals.length > 0 };
}

export interface HeroisData {
  bySku: AggRow[];
  /** SKUs abaixo de 1% do ROL total ficam fora do ranking de margem %. */
  minRolForPct: number;
}

export function computeHerois(rows: PricingRow[], metric: Metric): HeroisData {
  const bySku = aggregateBy(rows, metric, (r) => r.skuDesc || r.sku || "—");
  let rol = 0;
  for (const r of rows) rol += r.rol;
  return { bySku, minRolForPct: rol * 0.01 };
}
