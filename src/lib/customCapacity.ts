// Capacidade física dos blocos do Slide Personalizado.
// Calcula quantas linhas/séries cabem em um bloco com base na altura,
// para alimentar o auto-fit e o alerta de truncamento.

const TABLE_HEADER_H = 36;
const TABLE_ROW_H = 26;
const TITLE_H = 32;

/** Quantas linhas de dados cabem em uma tabela com cabeçalho. */
export function tableCapacity(blockH: number): number {
  return Math.max(1, Math.floor((blockH - TABLE_HEADER_H - 4) / TABLE_ROW_H));
}

/** Quantos itens cabem num Top Ranking (com cabeçalho e título opcional). */
export function topSkuCapacity(blockH: number, hasTitle: boolean): number {
  const usable = blockH - TABLE_HEADER_H - (hasTitle ? TITLE_H : 0) - 4;
  return Math.max(1, Math.floor(usable / TABLE_ROW_H));
}

/** Quantas séries fazem sentido na legenda dado o tamanho do gráfico.
 *  Heurística: 1 série a cada ~24px de altura disponível para legenda
 *  (≈ 18% do bloco), nunca menos que 1 e nunca mais que 12. */
export function chartSeriesCapacity(blockH: number, blockW: number): number {
  const legendBudget = Math.max(28, blockH * 0.18);
  const perItem = 22;
  const byHeight = Math.floor(legendBudget / perItem);
  // Largura também limita: cada item de legenda ~140px
  const byWidth = Math.floor(blockW / 160);
  const cap = Math.min(12, Math.max(byHeight, byWidth));
  return Math.max(1, cap);
}

import type { TableBlock, ChartBlock, TopSkuBlock } from "./customSlide";

export interface FitInfo { shown: number; total: number; truncated: boolean }

export function resolveTableFit(block: TableBlock, totalRows: number): FitInfo {
  const cap = tableCapacity(block.h);
  const limit = block.autoFit !== false
    ? cap
    : Math.max(1, block.maxRows ?? cap);
  const shown = Math.min(limit, totalRows);
  return { shown, total: totalRows, truncated: totalRows > shown };
}

export function resolveTopSkuFit(block: TopSkuBlock, totalItems: number): FitInfo {
  const cap = topSkuCapacity(block.h, !!block.title);
  const limit = block.autoFit !== false
    ? cap
    : Math.max(1, block.topN || cap);
  const shown = Math.min(limit, totalItems);
  return { shown, total: totalItems, truncated: totalItems > shown };
}

export function resolveChartFit(block: ChartBlock, totalSeries: number): FitInfo {
  const cap = chartSeriesCapacity(block.h, block.w);
  const limit = block.autoFit !== false
    ? cap
    : Math.max(1, block.maxSeries ?? cap);
  const shown = Math.min(limit, totalSeries);
  return { shown, total: totalSeries, truncated: totalSeries > shown };
}
