// Tabela dinâmica do bloco "Tabela" do slide — um cálculo só, com cache.
//
// O bloco (BlockRenderer › TableRender) e o painel de propriedades
// (BlockInspectors › TableBlockEditor) calculavam a MESMA tabela, cada um por
// conta própria e de forma síncrona: selecionar uma tabela refazia o cálculo
// inteiro só para o painel contar linhas. Com o cache, o painel reaproveita o
// resultado que o bloco acabou de calcular.
import { buildUnifiedRows } from "@/lib/pivotData";
import { computePivot, type PivotMeasure, type PivotResult } from "@/lib/pivot";
import { resolveMonthRangeSelection } from "@/lib/relativePeriods";
import type { TableBlock } from "@/lib/customSlide";
import type { Filters, PricingRow } from "@/lib/types";

export interface CustomTablePivot {
  /** Linhas unificadas usadas no cálculo (as colunas de gap reaproveitam). */
  unified: Record<string, unknown>[];
  result: PivotResult;
}

function dimValue(row: PricingRow, dim: string): string {
  const value = (row as unknown as Record<string, unknown>)[dim];
  if (value == null || value === "") return "—";
  return String(value);
}

export function applyTableDimensionFilters(rows: PricingRow[], filters: Filters | undefined): PricingRow[] {
  const active = Object.entries(filters ?? {}).filter(([, allowed]) => allowed && allowed.length > 0);
  if (active.length === 0) return rows;
  return rows.filter((row) => active.every(([dim, allowed]) => allowed!.includes(dimValue(row, dim))));
}

const MAX_ENTRIES_PER_BASE = 24;
const cache = new WeakMap<readonly PricingRow[], Map<string, CustomTablePivot>>();

export function computeCustomTablePivot(
  sourceRows: PricingRow[],
  block: Pick<TableBlock, "rowDims" | "colDim" | "filters" | "monthFilter">,
  measures: PivotMeasure[],
): CustomTablePivot {
  const key = JSON.stringify([
    block.rowDims, block.colDim ?? null, measures.map((m) => m.id), block.filters ?? {}, block.monthFilter ?? null,
  ]);
  let byKey = cache.get(sourceRows);
  const hit = byKey?.get(key);
  if (hit) {
    // LRU simples: reinsere para ficar entre os mais recentes.
    byKey!.delete(key);
    byKey!.set(key, hit);
    return hit;
  }

  const dimensionFiltered = applyTableDimensionFilters(sourceRows, block.filters);
  const months = resolveMonthRangeSelection(dimensionFiltered, block.monthFilter);
  const monthSet = months?.length ? new Set(months) : null;
  const tableRows = monthSet ? dimensionFiltered.filter((row) => monthSet.has(row.periodo)) : dimensionFiltered;
  const unified = buildUnifiedRows(tableRows, [], "real") as unknown as Record<string, unknown>[];
  const result = computePivot(unified, {
    rows: block.rowDims,
    cols: block.colDim ? [block.colDim] : [],
    values: measures,
    filters: {},
  });

  const entry = { unified, result };
  if (!byKey) {
    byKey = new Map();
    cache.set(sourceRows, byKey);
  }
  byKey.set(key, entry);
  if (byKey.size > MAX_ENTRIES_PER_BASE) byKey.delete(byKey.keys().next().value as string);
  return entry;
}
