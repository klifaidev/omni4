// Geometria de arrumação dos blocos do slide: alinhar (à seleção ou ao
// slide), espaçar com vãos iguais e "Organizar" (põe a seleção em linhas e
// colunas com o mesmo respiro). Funções puras: recebem retângulos e
// devolvem as novas posições.

export interface Rect { id: string; x: number; y: number; w: number; h: number }
export type Pos = { id: string; x: number; y: number };
export type AlignEdge = "left" | "centerH" | "right" | "top" | "centerV" | "bottom";

/** Área do slide disponível (sem a faixa de rodapé, quando ela existe). */
export function slideArea(canvasW: number, canvasH: number, footerH: number): Rect {
  return { id: "slide", x: 0, y: 0, w: canvasW, h: canvasH - footerH };
}

function boundsOf(rects: readonly Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const r = Math.max(...rects.map((b) => b.x + b.w));
  const b = Math.max(...rects.map((b) => b.y + b.h));
  return { id: "bounds", x, y, w: r - x, h: b - y };
}

/** Alinha cada retângulo a uma borda/centro de `target` (o slide), ou — sem
 *  target — à caixa da própria seleção. */
export function alignRects(rects: readonly Rect[], edge: AlignEdge, target?: Rect): Pos[] {
  if (rects.length === 0) return [];
  const t = target ?? boundsOf(rects);
  return rects.map((r) => {
    switch (edge) {
      case "left": return { id: r.id, x: Math.round(t.x), y: r.y };
      case "right": return { id: r.id, x: Math.round(t.x + t.w - r.w), y: r.y };
      case "centerH": return { id: r.id, x: Math.round(t.x + (t.w - r.w) / 2), y: r.y };
      case "top": return { id: r.id, x: r.x, y: Math.round(t.y) };
      case "bottom": return { id: r.id, x: r.x, y: Math.round(t.y + t.h - r.h) };
      case "centerV": return { id: r.id, x: r.x, y: Math.round(t.y + (t.h - r.h) / 2) };
    }
  });
}

/** Leva a seleção INTEIRA (como um conjunto, mantendo o arranjo interno)
 *  para uma borda/centro de `target`. Alinhar vários blocos "ao slide" um a
 *  um os empilharia no mesmo lugar. */
export function alignGroupToTarget(rects: readonly Rect[], edge: AlignEdge, target: Rect): Pos[] {
  if (rects.length === 0) return [];
  const box = boundsOf(rects);
  const [moved] = alignRects([box], edge, target);
  const dx = moved.x - box.x;
  const dy = moved.y - box.y;
  return rects.map((r) => ({ id: r.id, x: r.x + dx, y: r.y + dy }));
}

/** Espaçamento igual: o PRIMEIRO e o ÚLTIMO ficam onde estão e os vãos
 *  entre os blocos (não as bordas) ficam todos iguais — blocos de larguras
 *  diferentes continuam com o mesmo respiro entre si. */
export function distributeRects(rects: readonly Rect[], axis: "h" | "v"): Pos[] {
  if (rects.length < 3) return rects.map((r) => ({ id: r.id, x: r.x, y: r.y }));
  const pos = axis === "h" ? (r: Rect) => r.x : (r: Rect) => r.y;
  const size = axis === "h" ? (r: Rect) => r.w : (r: Rect) => r.h;
  const sorted = [...rects].sort((a, b) => pos(a) - pos(b));
  const first = sorted[0];
  const lastEnd = Math.max(...sorted.map((r) => pos(r) + size(r)));
  const totalSize = sorted.reduce((s, r) => s + size(r), 0);
  const gap = (lastEnd - pos(first) - totalSize) / (sorted.length - 1);
  let cursor = pos(first);
  const out = new Map<string, Pos>();
  for (const r of sorted) {
    const p = Math.round(cursor);
    out.set(r.id, axis === "h" ? { id: r.id, x: p, y: r.y } : { id: r.id, x: r.x, y: p });
    cursor += size(r) + gap;
  }
  return rects.map((r) => out.get(r.id)!);
}

const DEFAULT_GAP = 24;

function median(values: number[]): number {
  if (!values.length) return DEFAULT_GAP;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Agrupa em linhas: dois blocos estão na mesma linha quando a faixa
 *  vertical deles se sobrepõe em mais da metade da altura do menor. */
function rowsOf(rects: readonly Rect[]): Rect[][] {
  const sorted = [...rects].sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2));
  const rows: Rect[][] = [];
  for (const r of sorted) {
    const row = rows.find((cand) => cand.some((c) => {
      const overlap = Math.min(c.y + c.h, r.y + r.h) - Math.max(c.y, r.y);
      return overlap > Math.min(c.h, r.h) / 2;
    }));
    if (row) row.push(r);
    else rows.push([r]);
  }
  for (const row of rows) row.sort((a, b) => a.x - b.x);
  return rows.sort((a, b) => Math.min(...a.map((r) => r.y)) - Math.min(...b.map((r) => r.y)));
}

/** "Organizar": mantém a ordem de leitura, alinha o topo de cada linha (ou
 *  a esquerda, numa coluna única) e iguala todos os respiros ao vão típico
 *  que já existia (mediana dos vãos positivos; 24 px se tudo se sobrepõe). */
export function tidyRects(rects: readonly Rect[]): Pos[] {
  if (rects.length < 2) return rects.map((r) => ({ id: r.id, x: r.x, y: r.y }));
  const rows = rowsOf(rects);
  const gaps: number[] = [];
  for (const row of rows) {
    for (let i = 1; i < row.length; i++) {
      const g = row[i].x - (row[i - 1].x + row[i - 1].w);
      if (g > 0) gaps.push(g);
    }
  }
  for (let i = 1; i < rows.length; i++) {
    const prevBottom = Math.max(...rows[i - 1].map((r) => r.y + r.h));
    const g = Math.min(...rows[i].map((r) => r.y)) - prevBottom;
    if (g > 0) gaps.push(g);
  }
  const gap = Math.round(median(gaps));
  const origin = boundsOf(rects);
  const out = new Map<string, Pos>();

  if (rows.every((row) => row.length === 1)) {
    // Coluna única: empilha alinhando à esquerda.
    let y = origin.y;
    for (const [r] of rows) {
      out.set(r.id, { id: r.id, x: origin.x, y });
      y += r.h + gap;
    }
  } else {
    let y = origin.y;
    for (const row of rows) {
      let x = origin.x;
      for (const r of row) {
        out.set(r.id, { id: r.id, x, y });
        x += r.w + gap;
      }
      y += Math.max(...row.map((r) => r.h)) + gap;
    }
  }
  return rects.map((r) => out.get(r.id)!);
}

// ---------------------------------------------------------------------------
// Lugar para um bloco novo ao lado de outro (o resumo do gráfico)
// ---------------------------------------------------------------------------

const intersects = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Onde pôr um bloco de altura `h` junto de `anchor` sem cobrir nada:
 * 1) logo abaixo, com a mesma largura; 2) à direita, se sobra coluna;
 * 3) abrindo espaço — o `anchor` encolhe por baixo (`shrink`) e o bloco
 * entra no lugar. Último caso: em cima da parte de baixo do anchor.
 */
export function placeNear(
  anchor: Rect,
  others: readonly Rect[],
  area: Rect,
  h: number,
  opts: { gap?: number; minSideW?: number; maxSideW?: number; minAnchorH?: number } = {},
): { rect: Omit<Rect, "id">; shrink?: { h: number } } {
  const gap = opts.gap ?? 12;
  const minSideW = opts.minSideW ?? 240;
  const maxSideW = opts.maxSideW ?? 380;
  const minAnchorH = opts.minAnchorH ?? 200;
  const margin = 24;
  const free = (r: Omit<Rect, "id">) =>
    r.x >= area.x && r.y >= area.y && r.x + r.w <= area.x + area.w && r.y + r.h <= area.y + area.h
    && !others.some((o) => intersects({ id: "", ...r }, o));

  const below = { x: anchor.x, y: anchor.y + anchor.h + gap, w: anchor.w, h };
  if (free(below)) return { rect: below };

  const sideX = anchor.x + anchor.w + gap;
  const sideW = Math.min(maxSideW, area.x + area.w - margin - sideX);
  if (sideW >= minSideW) {
    const side = { x: sideX, y: anchor.y, w: sideW, h: Math.min(anchor.h, Math.max(h, 160)) };
    if (free(side)) return { rect: side };
  }

  const shrunkH = anchor.h - h - gap;
  if (shrunkH >= minAnchorH) {
    return { rect: { x: anchor.x, y: anchor.y + shrunkH + gap, w: anchor.w, h }, shrink: { h: shrunkH } };
  }
  return { rect: { x: anchor.x, y: anchor.y + anchor.h - h, w: anchor.w, h } };
}