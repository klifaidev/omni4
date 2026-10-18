// Dados dos visuais da aba Canais (evolução e mix), usados pela aba e pelo
// slide. Os dois leem o HISTÓRICO inteiro (só filtros de dimensão), como a
// aba sempre fez — o mês escolhido não muda estes gráficos.
import { aggregateBy, computeCanalTrend, type CanalTrendPoint } from "@/lib/analytics";
import type { Metric, PricingRow } from "@/lib/types";

export type CanalChartMetric = "margemPct" | "rol" | "volumeKg";

export const CANAL_PALETTE = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "#a78bfa",
  "#22d3ee",
  "#f472b6",
  "#94a3b8",
];

export interface CanaisSeries {
  /** Top 8 canais por ROL (+ "Outros" quando há mais). */
  topCanais: string[];
  months: { periodo: string; label: string }[];
  seriesPerCanal: Map<string, Map<string, CanalTrendPoint>>;
  /** % do ROL de cada canal em cada mês. */
  mixData: Record<string, number | string>[];
}

export function computeCanaisSeries(allHistory: PricingRow[], metric: Metric): CanaisSeries {
  const canalAggHist = aggregateBy(allHistory, metric, (r) => r.canalAjustado || "Sem canal");
  const sorted = [...canalAggHist].sort((a, b) => b.rol - a.rol);
  const top = sorted.slice(0, 8).map((c) => c.key);
  const others = sorted.slice(8).map((c) => c.key);

  const periodMeta = new Map<string, { ano: number; mes: number; label: string }>();
  for (const r of allHistory) {
    if (!periodMeta.has(r.periodo)) {
      periodMeta.set(r.periodo, {
        ano: r.ano,
        mes: r.mes,
        label: `${String(r.mes).padStart(2, "0")}/${String(r.ano).slice(-2)}`,
      });
    }
  }
  const months = Array.from(periodMeta.entries())
    .sort(([, a], [, b]) => a.ano - b.ano || a.mes - b.mes)
    .map(([periodo, m]) => ({ periodo, label: m.label }));

  const series = new Map<string, Map<string, CanalTrendPoint>>();
  for (const c of top) {
    const t = computeCanalTrend(allHistory, c, metric);
    series.set(c, new Map(t.map((p) => [p.periodo, p])));
  }
  if (others.length > 0) {
    const othersSet = new Set(others);
    const othersRows = allHistory.filter((r) => othersSet.has(r.canalAjustado || "Sem canal"));
    const t = computeCanalTrend(othersRows, null, metric);
    series.set("Outros", new Map(t.map((p) => [p.periodo, p])));
  }

  const display = others.length > 0 ? [...top, "Outros"] : top;
  const mixData = months.map(({ periodo, label }) => {
    const totalRol = display.reduce((s, c) => s + (series.get(c)?.get(periodo)?.rol ?? 0), 0);
    const row: Record<string, number | string> = { label };
    for (const c of display) {
      const r = series.get(c)?.get(periodo)?.rol ?? 0;
      row[c] = totalRol > 0 ? (r / totalRol) * 100 : 0;
    }
    return row;
  });

  return { topCanais: display, months, seriesPerCanal: series, mixData };
}

export function canalEvolutionData(series: CanaisSeries, chartMetric: CanalChartMetric): Record<string, number | string>[] {
  return series.months.map(({ periodo, label }) => {
    const row: Record<string, number | string> = { label };
    for (const c of series.topCanais) {
      const p = series.seriesPerCanal.get(c)?.get(periodo);
      if (!p) { row[c] = NaN; continue; }
      row[c] = chartMetric === "margemPct" ? p.margemPct * 100 : chartMetric === "rol" ? p.rol : p.volumeKg;
    }
    return row;
  });
}
