import type { PricingRow } from "./types";
import { monthLabel } from "./format";
import { clienteId } from "./farol";

export type PositivacaoDim = "categoria" | "marca" | "canalAjustado" | "gestorResp";

export const POSITIVACAO_DIMS: { key: PositivacaoDim; label: string; emptyLabel: string }[] = [
  { key: "categoria", label: "Categoria", emptyLabel: "Sem categoria" },
  { key: "marca", label: "Marca", emptyLabel: "Sem marca" },
  { key: "canalAjustado", label: "Canal Ajustado", emptyLabel: "Sem canal" },
  { key: "gestorResp", label: "Gestor Resp.", emptyLabel: "Sem gestor" },
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

function dimMeta(dim: PositivacaoDim) {
  return POSITIVACAO_DIMS.find((d) => d.key === dim)!;
}

function activeCliente(row: PricingRow): string | null {
  if ((row.volumeKg ?? 0) <= 0 && (row.rol ?? 0) <= 0) return null;
  return clienteId(row.cliente);
}

export function latestPositivacaoMonths(rows: PricingRow[], count = 13): PositivacaoMonth[] {
  const map = new Map<string, PositivacaoMonth>();
  for (const r of rows) {
    if (!r.periodo) continue;
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

export function buildPositivacaoSeries(rows: PricingRow[], dim: PositivacaoDim, monthCount = 13): PositivacaoSeries {
  const months = latestPositivacaoMonths(rows, monthCount);
  const monthSet = new Set(months.map((m) => m.periodo));
  const meta = dimMeta(dim);
  const sets = new Map<string, Map<string, Set<string>>>();

  for (const r of rows) {
    if (!monthSet.has(r.periodo)) continue;
    const cli = activeCliente(r);
    if (!cli) continue;
    const key = String(r[dim] ?? "").trim() || meta.emptyLabel;
    let byMonth = sets.get(key);
    if (!byMonth) {
      byMonth = new Map();
      sets.set(key, byMonth);
    }
    let clients = byMonth.get(r.periodo);
    if (!clients) {
      clients = new Set();
      byMonth.set(r.periodo, clients);
    }
    clients.add(cli);
  }

  const table = [...sets.entries()].map(([key, byMonth]) => {
    const values = months.map((m) => byMonth.get(m.periodo)?.size ?? 0);
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

  const chartKeys = table.slice(0, 8).map((r) => r.key);
  const chartData = months.map((m) => {
    const row: Record<string, string | number> = { label: m.label };
    for (const key of chartKeys) row[key] = sets.get(key)?.get(m.periodo)?.size ?? 0;
    return row;
  });

  return { months, table, chartKeys, chartData };
}
