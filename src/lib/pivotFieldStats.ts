// Valores distintos por dimensão da Tabela Dinâmica, calculados em fatias no
// tempo ocioso do navegador (uma passada sobre a base inteira de uma vez
// travaria a tela a cada troca de mês no topo). Alimentam a prévia de tamanho
// ao arrastar um campo e o reconhecimento de valores da "frase viva".

export type PivotFieldStats = {
  rowCount: number;
  /** Valores distintos por dimensão (na ordem em que aparecem). */
  distinct: Record<string, string[]>;
};

const CHUNK_ROWS = 20_000;
const EMPTY = "—";

type IdleHandle = { cancel: () => void };

function scheduleIdle(fn: () => void): IdleHandle {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (w.requestIdleCallback && w.cancelIdleCallback) {
    const id = w.requestIdleCallback(fn, { timeout: 500 });
    return { cancel: () => w.cancelIdleCallback!(id) };
  }
  const id = window.setTimeout(fn, 16);
  return { cancel: () => window.clearTimeout(id) };
}

/** Calcula em fatias e chama `onDone` no fim. Retorna a função que cancela. */
export function computeFieldStatsInIdle(
  rows: Record<string, unknown>[],
  dims: string[],
  onDone: (stats: PivotFieldStats) => void,
): () => void {
  const sets = dims.map(() => new Set<string>());
  let index = 0;
  let handle: IdleHandle | null = null;
  let cancelled = false;

  const step = () => {
    if (cancelled) return;
    const end = Math.min(rows.length, index + CHUNK_ROWS);
    for (; index < end; index++) {
      const row = rows[index];
      for (let d = 0; d < dims.length; d++) {
        const v = row[dims[d]];
        sets[d].add(v == null || v === "" ? EMPTY : String(v));
      }
    }
    if (index < rows.length) {
      handle = scheduleIdle(step);
      return;
    }
    const distinct: Record<string, string[]> = {};
    dims.forEach((dim, d) => {
      distinct[dim] = Array.from(sets[d]);
    });
    onDone({ rowCount: rows.length, distinct });
  };

  handle = scheduleIdle(step);
  return () => {
    cancelled = true;
    handle?.cancel();
  };
}

export type LayoutSizeTone = "ok" | "warn" | "danger";

export type LayoutSizeEstimate = {
  rows: number;
  cols: number;
  /** Colunas que de fato aparecem (com o Top N + "Outros" aplicado). */
  colsShown: number;
  colsLimited: boolean;
  cells: number;
  tone: LayoutSizeTone;
};

export type LayoutSizeLimits = {
  colLimit: { top: number; threshold: number } | null;
  maxRows: number;
  maxCols: number;
  maxCells: number;
  warnCells: number;
};

/** Teto de combinações contadas uma a uma; acima disso a prévia já é "grande demais". */
export const COMBO_COUNT_CAP = 400_000;

/**
 * Quantas combinações distintas das dimensões existem na base (SKU dentro de
 * Marca dá ~400, não 14 × 400). Para no teto pra não varrer a base inteira
 * à toa numa montagem que já passou de qualquer limite.
 */
export function countDistinctCombos(rows: Record<string, unknown>[], dims: string[], cap = COMBO_COUNT_CAP): number {
  if (dims.length === 0) return 1;
  const seen = new Set<string>();
  for (const row of rows) {
    let key = "";
    for (let d = 0; d < dims.length; d++) {
      const v = row[dims[d]];
      key += `${v == null || v === "" ? EMPTY : String(v)}\u001f`;
    }
    seen.add(key);
    if (seen.size >= cap) break;
  }
  return Math.max(1, seen.size);
}

/**
 * Tamanho da montagem a partir das combinações que existem na base (sem os
 * filtros internos da tabela, então é um teto quando há filtro).
 */
export function estimateLayoutSize(
  layout: { rows: string[]; cols: string[]; values: string[] },
  countCombos: (dims: string[]) => number,
  limits: LayoutSizeLimits,
): LayoutSizeEstimate {
  const leafRows = countCombos(layout.rows);
  const rows = layout.rows.length > 1 ? leafRows + countCombos(layout.rows.slice(0, 1)) : leafRows;
  const cols = layout.cols.length ? countCombos(layout.cols) : 1;
  const colsLimited = !!limits.colLimit && layout.cols.length > 0 && cols > limits.colLimit.threshold;
  const colsShown = colsLimited ? limits.colLimit!.top + 1 : cols;
  const totalCol = layout.cols.length > 0 ? 1 : 0;
  const cells = rows * (colsShown + totalCol) * Math.max(1, layout.values.length);
  const tone: LayoutSizeTone =
    rows > limits.maxRows || (!colsLimited && cols > limits.maxCols) || cells > limits.maxCells
      ? "danger"
      : cells > limits.warnCells
        ? "warn"
        : "ok";
  return { rows, cols, colsShown, colsLimited, cells, tone };
}
