// Tabela dinâmica do bloco "Tabela" do slide — um cálculo só, com cache.
//
// O bloco (BlockRenderer › TableRender) e o painel de propriedades
// (BlockInspectors › TableBlockEditor) calculavam a MESMA tabela, cada um por
// conta própria e de forma síncrona: selecionar uma tabela refazia o cálculo
// inteiro só para o painel contar linhas. Com o cache, o painel reaproveita o
// resultado que o bloco acabou de calcular.
//
// Memória (crash 2026-10-19, "oom" ao trocar Marca por UF numa tabela de 12
// meses): as "linhas unificadas" têm ~40 campos por linha — de 0,5 a 1 GB com
// 12 meses da base real — e antes cada configuração (cada clique numa
// dimensão) montava e GUARDAVA a sua própria cópia, até 24 por base. Agora:
//   • só UMA cópia fica viva, compartilhada por todas as configurações do mesmo
//     recorte (a anterior é solta antes de montar a nova);
//   • o que se guarda por configuração é só o resultado (pequeno);
//   • tabelas gigantes (ex.: SKU × mês) passam pela guarda de tamanho e não são
//     montadas — o bloco avisa em vez de derrubar o app.
import { buildUnifiedRows } from "@/lib/pivotData";
import {
  computePivotGuarded,
  type PivotLimits,
  type PivotMeasure,
  type PivotResult,
  type PivotSizeEstimate,
} from "@/lib/pivot";
import { resolveMonthRangeSelection } from "@/lib/relativePeriods";
import type { TableBlock } from "@/lib/customSlide";
import type { Filters, PricingRow } from "@/lib/types";

export interface CustomTablePivot {
  /** `null` quando a tabela passa dos limites de tamanho — ela não é montada. */
  result: PivotResult | null;
  estimate: PivotSizeEstimate;
  /** Linhas unificadas (colunas de gap). Montadas só quando pedidas e compartilhadas entre configurações. */
  getUnified: () => Record<string, unknown>[];
}

/** Uma tabela de slide com mais que isso é ilegível — e é o que derruba a memória. */
export const CUSTOM_TABLE_LIMITS: PivotLimits = {
  maxRowHeaders: 20_000,
  maxColHeaders: 500,
  maxObservedCells: 120_000,
  maxVisibleValueCells: 300_000,
};

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

// WeakRef existe no Chromium do Electron; o alvo do TypeScript do projeto ainda não o declara.
interface WeakRefLike<T extends object> { deref(): T | undefined }
declare const WeakRef: { new <T extends object>(target: T): WeakRefLike<T> };

const MAX_ENTRIES_PER_BASE = 24;
let resultCache = new WeakMap<readonly PricingRow[], Map<string, CustomTablePivot>>();

// A única cópia das linhas unificadas. WeakRef na base: não segura uma base antiga na memória.
let unifiedSlot: { source: WeakRefLike<readonly PricingRow[]>; key: string; rows: Record<string, unknown>[] } | null = null;

/** Recorte da tabela (filtros de dimensão + meses) — o que define as linhas unificadas. */
function scopedRows(sourceRows: PricingRow[], block: Pick<TableBlock, "filters" | "monthFilter">): PricingRow[] {
  const dimensionFiltered = applyTableDimensionFilters(sourceRows, block.filters);
  const months = resolveMonthRangeSelection(dimensionFiltered, block.monthFilter);
  const monthSet = months?.length ? new Set(months) : null;
  return monthSet ? dimensionFiltered.filter((row) => monthSet.has(row.periodo)) : dimensionFiltered;
}

function unifiedFor(sourceRows: PricingRow[], block: Pick<TableBlock, "filters" | "monthFilter">): Record<string, unknown>[] {
  const key = JSON.stringify([block.filters ?? {}, block.monthFilter ?? null]);
  if (unifiedSlot && unifiedSlot.key === key && unifiedSlot.source.deref() === sourceRows) return unifiedSlot.rows;
  // Solta a cópia anterior ANTES de montar a nova: o pico é de uma cópia só.
  unifiedSlot = null;
  const rows = buildUnifiedRows(scopedRows(sourceRows, block), [], "real") as unknown as Record<string, unknown>[];
  unifiedSlot = { source: new WeakRef(sourceRows), key, rows };
  return rows;
}

/** Libera o que dá para recalcular (a guarda de memória chama isto). */
export function clearCustomTableCaches(): void {
  unifiedSlot = null;
  resultCache = new WeakMap();
}

export function computeCustomTablePivot(
  sourceRows: PricingRow[],
  block: Pick<TableBlock, "rowDims" | "colDim" | "filters" | "monthFilter">,
  measures: PivotMeasure[],
  /** Catálogo completo: medidas derivadas (CM %, R$/Kg) somam as que dependem
   *  dele mesmo quando elas não estão visíveis na tabela. */
  catalog: PivotMeasure[] = measures,
): CustomTablePivot {
  const key = JSON.stringify([
    block.rowDims, block.colDim ?? null, measures.map((m) => m.id), block.filters ?? {}, block.monthFilter ?? null,
  ]);
  let byKey = resultCache.get(sourceRows);
  const hit = byKey?.get(key);
  if (hit) {
    // LRU simples: reinsere para ficar entre os mais recentes.
    byKey!.delete(key);
    byKey!.set(key, hit);
    return hit;
  }

  const unified = unifiedFor(sourceRows, block);
  const { estimate, result } = computePivotGuarded(
    unified,
    {
      rows: block.rowDims,
      cols: block.colDim ? [block.colDim] : [],
      values: measures,
      measureCatalog: catalog,
      filters: {},
    },
    CUSTOM_TABLE_LIMITS,
  );

  const entry: CustomTablePivot = { result, estimate, getUnified: () => unifiedFor(sourceRows, block) };
  if (!byKey) {
    byKey = new Map();
    resultCache.set(sourceRows, byKey);
  }
  byKey.set(key, entry);
  if (byKey.size > MAX_ENTRIES_PER_BASE) byKey.delete(byKey.keys().next().value as string);
  return entry;
}
