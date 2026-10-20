// Contas dos visuais da Ruptura, usadas pela aba e pelo slide. Recebem o
// recorte (RupturaView) e devolvem dados prontos para desenhar — assim os
// números são os mesmos nas duas superfícies.
import { formatNum, formatPct } from "@/lib/format";
import {
  groupBy,
  groupByKey,
  monthKeyLabel,
  monthlySeries,
  paretoCount,
  pointDelta,
  relativeDelta,
  type RupturaFilters,
  type RupturaGroupRow,
  type RupturaMonthPoint,
  type RupturaPeriod,
} from "@/lib/ruptura/metrics";
import { UF_NAMES } from "@/lib/ruptura/uf";
import type { RupturaView } from "@/lib/ruptura/view";

// ── Indicadores (cartões) ────────────────────────────────────────────────

export type RupturaKpiId = "rate" | "storesAffected" | "occurrences" | "skusAffected" | "redesAffected";

export type RupturaDelta = { kind: "pct" | "pp"; value: number } | null;

export interface RupturaKpiData {
  id: RupturaKpiId;
  label: string;
  value: string;
  sub: string;
  unavailable: boolean;
  delta: RupturaDelta;
  /** "vs Ago/26": de que período vem a comparação. */
  deltaLabel: string;
  /** Como o número é calculado (dica na aba). */
  help: string;
}

export const RUPTURA_KPI_IDS: RupturaKpiId[] = ["rate", "storesAffected", "occurrences", "skusAffected", "redesAffected"];

export function periodText(model: RupturaView["model"], period: RupturaPeriod): string {
  const a = monthKeyLabel(model.months[period.from]);
  return period.from === period.to ? a : `${a}–${monthKeyLabel(model.months[period.to])}`;
}

export function computeRupturaKpis(view: RupturaView): RupturaKpiData[] {
  const { model, totals, previous, withRate } = view;
  const prev = previous?.totals;
  const vsLabel = previous ? `vs ${periodText(model, previous.period)}` : "";
  const pct = (cur: number, before: number | undefined): RupturaDelta => {
    const v = relativeDelta(cur, before);
    return v === null ? null : { kind: "pct", value: v };
  };
  const rateDelta = pointDelta(totals.rate, prev?.rate ?? null);

  return [
    {
      id: "rate",
      label: "Ruptura",
      value: totals.rate === null ? "Indisponível" : formatPct(totals.rate),
      unavailable: totals.rate === null,
      sub: totals.rate === null
        ? "Aguarda respostas “Não” na base"
        : `${formatNum(totals.occurrences)} de ${formatNum(totals.evaluations)} avaliações`,
      delta: rateDelta === null ? null : { kind: "pp", value: rateDelta },
      deltaLabel: vsLabel,
      help:
        "Avaliações com ruptura ÷ avaliações válidas (Sim + Não), contando uma avaliação por loja × SKU × mês — a última pesquisa do mês."
        + (withRate
          ? ""
          : " Esta base só traz respostas “Sim”: sem os “Não”, o denominador teria só rupturas e a taxa daria 100%. Por isso ela fica indisponível até a base completa chegar."),
    },
    {
      id: "storesAffected",
      label: "Lojas com ruptura",
      value: formatNum(totals.storesAffected),
      unavailable: false,
      sub: withRate
        ? `de ${formatNum(totals.storesSurveyed)} lojas pesquisadas`
        : `${formatNum(totals.storesSurveyed)} lojas com registro`,
      delta: pct(totals.storesAffected, prev?.storesAffected),
      deltaLabel: vsLabel,
      help: "Lojas distintas com ao menos um SKU em ruptura. Loja = Rede + Bandeira + PDV + Cidade + Estado (a base não tem código de loja). Uma loja com dez SKUs ausentes conta uma vez.",
    },
    {
      id: "occurrences",
      label: "Ocorrências",
      value: formatNum(totals.occurrences),
      unavailable: false,
      sub: `loja × SKU × mês · ${formatNum(totals.rawEvaluations)} pesquisas brutas`,
      delta: pct(totals.occurrences, prev?.occurrences),
      deltaLabel: vsLabel,
      help: "Combinações loja × SKU × mês em ruptura. Várias pesquisas da mesma loja e SKU no mês viram uma só (vale a mais recente), então este número é menor que a contagem de linhas da planilha.",
    },
    {
      id: "skusAffected",
      label: "SKUs afetados",
      value: formatNum(totals.skusAffected),
      unavailable: false,
      sub: `de ${formatNum(model.dict.sku.length)} SKUs na base`,
      delta: pct(totals.skusAffected, prev?.skusAffected),
      deltaLabel: vsLabel,
      help: "SKUs distintos com ao menos uma ocorrência de ruptura no recorte.",
    },
    {
      id: "redesAffected",
      label: "Redes afetadas",
      value: formatNum(totals.redesAffected),
      unavailable: false,
      sub: `de ${formatNum(totals.redesSurveyed)} redes com registro`,
      delta: pct(totals.redesAffected, prev?.redesAffected),
      deltaLabel: vsLabel,
      help: "Redes distintas com ao menos uma loja em ruptura.",
    },
  ];
}

// ── Evolução mensal ──────────────────────────────────────────────────────

export type RupturaEvoMetric = "occurrences" | "storesAffected" | "skusAffected" | "rate";

export const RUPTURA_EVO_METRICS: Array<{ id: RupturaEvoMetric; label: string }> = [
  { id: "occurrences", label: "Ocorrências" },
  { id: "storesAffected", label: "Lojas afetadas" },
  { id: "skusAffected", label: "SKUs afetados" },
  { id: "rate", label: "Taxa" },
];

export interface RupturaEvoPoint extends RupturaMonthPoint {
  label: string;
  value: number | null;
}

export interface RupturaEvolutionData {
  /** Métrica mostrada (a taxa cai para ocorrências quando não há respostas “Não”). */
  metric: RupturaEvoMetric;
  points: RupturaEvoPoint[];
  withRate: boolean;
  sameStores: boolean;
  /** Lojas comparadas quando "mesmas lojas" está ligado. */
  sameStoresCount: number;
}

export function effectiveEvoMetric(metric: RupturaEvoMetric, withRate: boolean): RupturaEvoMetric {
  return metric === "rate" && !withRate ? "occurrences" : metric;
}

/**
 * A linha do tempo mostra a base inteira (com os demais filtros); só com
 * "mesmas lojas" ela se limita ao período, que define o conjunto de lojas.
 */
export function computeRupturaEvolution(
  view: RupturaView,
  filters: RupturaFilters,
  opts: { metric: RupturaEvoMetric; sameStores: boolean; /** Último mês (índice) que a linha do tempo alcança; padrão: o último da base. */ last?: number },
): RupturaEvolutionData {
  const { model, period, withRate } = view;
  const metric = effectiveEvoMetric(opts.metric, withRate);
  const full: RupturaPeriod = { from: 0, to: Math.min(opts.last ?? model.months.length - 1, model.months.length - 1) };
  const series = monthlySeries(model, filters, opts.sameStores ? period : full, { constantStores: opts.sameStores });
  const points = series.map((p) => ({
    ...p,
    label: monthKeyLabel(p.key),
    value: metric === "rate" ? p.rate : p[metric],
  }));
  return { metric, points, withRate, sameStores: opts.sameStores, sameStoresCount: series[0]?.storesSurveyed ?? 0 };
}

export function formatEvoValue(metric: RupturaEvoMetric, v: number): string {
  return metric === "rate" ? formatPct(v) : formatNum(v);
}

// ── Mapa por estado ──────────────────────────────────────────────────────

export type RupturaMapMetric = "occurrences" | "storesAffected" | "rate";

export const RUPTURA_MAP_METRICS: Array<{ id: RupturaMapMetric; label: string }> = [
  { id: "occurrences", label: "Ocorrências" },
  { id: "storesAffected", label: "Lojas afetadas" },
  { id: "rate", label: "Taxa" },
];

export interface RupturaMapData {
  metric: RupturaMapMetric;
  withRate: boolean;
  /** Estados com pesquisa no recorte. */
  rows: Array<{ uf: string; name: string; value: number | null; row: RupturaGroupRow }>;
  max: number;
}

export const UF_LIST = Object.keys(UF_NAMES).sort();

export function effectiveMapMetric(metric: RupturaMapMetric, withRate: boolean): RupturaMapMetric {
  return metric === "rate" && !withRate ? "occurrences" : metric;
}

export function formatMapValue(metric: RupturaMapMetric, v: number): string {
  return metric === "rate" ? formatPct(v) : formatNum(v);
}

export function computeRupturaMap(view: RupturaView, metric: RupturaMapMetric): RupturaMapData {
  const { model, predicate, withRate } = view;
  const effective = effectiveMapMetric(metric, withRate);
  const idx = new Map(UF_LIST.map((u, i) => [u, i]));
  const storeUf = model.stores.uf.map((u) => (u ? idx.get(u) ?? -1 : -1));
  const grouped = groupByKey(model, predicate, (i) => storeUf[model.cells.store[i]], (k) => UF_LIST[k] ?? "—", withRate);
  const rows = grouped
    .filter((r) => r.key >= 0)
    .map((row) => {
      const uf = UF_LIST[row.key];
      return { uf, name: UF_NAMES[uf] ?? uf, value: effective === "rate" ? row.rate : row[effective], row };
    });
  const values = rows.map((r) => r.value).filter((v): v is number => v !== null);
  return { metric: effective, withRate, rows, max: values.length ? Math.max(...values) : 0 };
}

// ── Rankings ─────────────────────────────────────────────────────────────

export type RupturaRankingDim = "categoria" | "canal" | "rede" | "sku";

export const RUPTURA_RANKING_DIMS: Record<RupturaRankingDim, { title: string; nameLabel: string }> = {
  categoria: { title: "Ruptura por categoria", nameLabel: "Categoria" },
  canal: { title: "Ruptura por canal", nameLabel: "Canal" },
  rede: { title: "Ruptura por rede", nameLabel: "Rede" },
  sku: { title: "Ruptura por SKU", nameLabel: "SKU" },
};

export interface RupturaRankingRow {
  label: string;
  /** Linha de apoio (marca · categoria do SKU). */
  sub?: string;
  occurrences: number;
  storesAffected: number;
  rate: number | null;
  share: number;
  cumShare: number;
}

export interface RupturaRankingData {
  dim: RupturaRankingDim;
  withRate: boolean;
  rows: RupturaRankingRow[];
  /** Itens com ocorrência no recorte (antes do corte do Top N). */
  totalRows: number;
  /** Quantos itens do topo concentram 80% das ocorrências. */
  pareto80: number;
  /** Participação dos itens mostrados no total de ocorrências. */
  shownShare: number;
}

export function computeRupturaRanking(view: RupturaView, dim: RupturaRankingDim, top: number): RupturaRankingData {
  const { model, predicate, withRate } = view;
  const all = groupBy(model, predicate, dim, withRate);
  const shown = all.slice(0, Math.max(1, top));
  const rows: RupturaRankingRow[] = shown.map((r) => ({
    label: r.label,
    sub: dim === "sku"
      ? `${model.dict.marca[model.skus.marca[r.key]]} · ${model.dict.categoria[model.skus.categoria[r.key]]}`
      : undefined,
    occurrences: r.occurrences,
    storesAffected: r.storesAffected,
    rate: r.rate,
    share: r.share,
    cumShare: r.cumShare,
  }));
  return {
    dim,
    withRate,
    rows,
    totalRows: all.length,
    pareto80: paretoCount(all, 0.8),
    shownShare: shown.length ? shown[shown.length - 1].cumShare : 0,
  };
}
