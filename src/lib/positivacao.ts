import type { PricingRow } from "./types";
import { monthLabel } from "./format";
import { clienteId } from "./farol";
import { memoizeByRows } from "./derivedCache";

export type PositivacaoDim = "categoria" | "marca" | "canalAjustado" | "gestorResp" | "sku" | "skuDesc";

export const POSITIVACAO_DIMS: { key: PositivacaoDim; label: string; emptyLabel: string }[] = [
  { key: "categoria", label: "Categoria", emptyLabel: "Sem categoria" },
  { key: "marca", label: "Marca", emptyLabel: "Sem marca" },
  { key: "canalAjustado", label: "Canal Ajustado", emptyLabel: "Sem canal" },
  { key: "gestorResp", label: "Gestor Resp.", emptyLabel: "Sem gestor" },
  { key: "sku", label: "SKU", emptyLabel: "Sem SKU" },
  { key: "skuDesc", label: "SKU Desc.", emptyLabel: "Sem descricao" },
];

export interface PositivacaoMonth {
  periodo: string;
  mes: number;
  ano: number;
  label: string;
}

export interface PositivacaoTableRow {
  key: string;
  total: number;
  media: number;
  ultimo: number;
  anterior: number;
  delta: number;
  months: Record<string, number>;
}

export interface PositivacaoSeries {
  months: PositivacaoMonth[];
  table: PositivacaoTableRow[];
  chartKeys: string[];
  chartData: Record<string, string | number>[];
}

export interface PositivacaoTotalPoint {
  periodo: string;
  label: string;
  clientes: number;
}

function dimMeta(dim: PositivacaoDim) {
  return POSITIVACAO_DIMS.find((d) => d.key === dim)!;
}

/**
 * Número do cliente ativo da linha (ou -1). Comparar inteiros em vez de textos
 * é o que deixa a contagem de clientes únicos rápida com milhões de linhas; o
 * texto bruto do cliente se repete muito, então cada um só é analisado uma vez.
 */
function clientResolver() {
  const byRaw = new Map<string, number>();
  const byId = new Map<string, number>();
  return (row: PricingRow): number => {
    if ((row.volumeKg ?? 0) <= 0 && (row.rol ?? 0) <= 0) return -1;
    const raw = row.cliente;
    if (!raw) return -1;
    let n = byRaw.get(raw);
    if (n === undefined) {
      const id = clienteId(raw);
      if (id === null) n = -1;
      else {
        n = byId.get(id);
        if (n === undefined) {
          n = byId.size;
          byId.set(id, n);
        }
      }
      byRaw.set(raw, n);
    }
    return n;
  };
}

export function latestPositivacaoMonths(rows: PricingRow[], count = 13): PositivacaoMonth[] {
  const map = new Map<string, PositivacaoMonth>();
  for (const r of rows) {
    if (!r.periodo || map.has(r.periodo)) continue;
    map.set(r.periodo, {
      periodo: r.periodo,
      mes: r.mes,
      ano: r.ano,
      label: monthLabel(r.mes, r.ano),
    });
  }
  return [...map.values()]
    .sort((a, b) => a.ano - b.ano || a.mes - b.mes)
    .slice(-count);
}

type MonthClients = Array<Set<number> | undefined>;

function seriesFromSets(months: PositivacaoMonth[], sets: Map<string, MonthClients>): PositivacaoSeries {
  const table = [...sets.entries()].map(([key, byMonth]) => {
    const values = months.map((_, i) => byMonth[i]?.size ?? 0);
    const monthValues: Record<string, number> = {};
    months.forEach((m, i) => { monthValues[m.periodo] = values[i]; });
    const total = values.reduce((s, v) => s + v, 0);
    const ultimo = values[values.length - 1] ?? 0;
    const anterior = values[values.length - 2] ?? 0;
    return {
      key,
      total,
      media: values.length ? total / values.length : 0,
      ultimo,
      anterior,
      delta: ultimo - anterior,
      months: monthValues,
    };
  }).sort((a, b) => b.ultimo - a.ultimo || b.total - a.total || a.key.localeCompare(b.key));

  const monthIndex = new Map(months.map((m, i) => [m.periodo, i]));
  const chartKeys = table.slice(0, 8).map((r) => r.key);
  const chartData = months.map((m) => {
    const row: Record<string, string | number> = { label: m.label };
    for (const key of chartKeys) row[key] = sets.get(key)?.[monthIndex.get(m.periodo)!]?.size ?? 0;
    return row;
  });

  return { months, table, chartKeys, chartData };
}

/** Numa passada só sobre as linhas, a série de cada abertura pedida. */
function buildSeriesFor(rows: PricingRow[], dims: PositivacaoDim[], monthCount: number): PositivacaoSeries[] {
  const months = latestPositivacaoMonths(rows, monthCount);
  const monthIndex = new Map(months.map((m, i) => [m.periodo, i]));
  const resolve = clientResolver();
  const perDim = dims.map((dim) => ({
    dim,
    emptyLabel: dimMeta(dim).emptyLabel,
    sets: new Map<string, MonthClients>(),
    keys: new Map<unknown, string>(),
  }));

  for (const r of rows) {
    const month = monthIndex.get(r.periodo);
    if (month === undefined) continue;
    const cli = resolve(r);
    if (cli < 0) continue;
    for (const acc of perDim) {
      const raw = r[acc.dim];
      let key = acc.keys.get(raw);
      if (key === undefined) {
        key = String(raw ?? "").trim() || acc.emptyLabel;
        acc.keys.set(raw, key);
      }
      let byMonth = acc.sets.get(key);
      if (!byMonth) {
        byMonth = new Array(months.length);
        acc.sets.set(key, byMonth);
      }
      (byMonth[month] ??= new Set()).add(cli);
    }
  }

  return perDim.map((acc) => seriesFromSets(months, acc.sets));
}

export const buildPositivacaoSeries: (rows: PricingRow[], dim: PositivacaoDim, monthCount?: number) => PositivacaoSeries =
  (() => {
    const cached = memoizeByRows(
      (rows: PricingRow[], dim: PositivacaoDim, monthCount: number) => buildSeriesFor(rows, [dim], monthCount)[0],
    );
    return (rows, dim, monthCount = 13) => cached(rows, dim, monthCount);
  })();

/** Todas as aberturas de uma vez (a aba mostra as seis). */
export const buildPositivacaoAll = memoizeByRows(
  (rows: PricingRow[], monthCount: number): Record<PositivacaoDim, PositivacaoSeries> => {
    const dims = POSITIVACAO_DIMS.map((d) => d.key);
    const series = buildSeriesFor(rows, dims, monthCount);
    const out = {} as Record<PositivacaoDim, PositivacaoSeries>;
    dims.forEach((dim, i) => { out[dim] = series[i]; });
    return out;
  },
  2,
);

export function buildPositivacaoTotal(rows: PricingRow[], monthCount = 13): PositivacaoTotalPoint[] {
  const months = latestPositivacaoMonths(rows, monthCount);
  const monthSet = new Set(months.map((m) => m.periodo));
  const byMonth = new Map<string, Set<number>>();
  const resolve = clientResolver();

  for (const r of rows) {
    if (!monthSet.has(r.periodo)) continue;
    const cli = resolve(r);
    if (cli < 0) continue;
    let clients = byMonth.get(r.periodo);
    if (!clients) {
      clients = new Set();
      byMonth.set(r.periodo, clients);
    }
    clients.add(cli);
  }

  return months.map((m) => ({
    periodo: m.periodo,
    label: m.label,
    clientes: byMonth.get(m.periodo)?.size ?? 0,
  }));
}
