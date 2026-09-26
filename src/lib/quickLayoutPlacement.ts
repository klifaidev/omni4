// Onde um layout rápido do editor entra no slide.
//
// Antes os layouts entravam sempre na mesma posição e traziam o próprio
// título: num slide com conteúdo, empilhavam títulos e cobriam o que já
// existia (dois usos = três títulos + um card sobre os KPIs).
//
// Regra: o título do slide é reaproveitado; slide vazio recebe o layout onde
// ele foi desenhado; slide com conteúdo recebe o layout logo abaixo do que
// existe, se couber — senão o layout vai para um slide novo.

type Box = { kind: string; x: number; y: number; w: number; h: number; hidden?: boolean };

/** Faixa do topo onde fica o título do slide (px do canvas). */
const HEADER_BOTTOM = 110;
const GAP = 24;
/** Posição padrão do título do slide (a mesma do slide em branco). */
export const SLIDE_TITLE_BOX = { x: 40, y: 30, w: 1240, h: 70 } as const;

export type QuickLayoutPlacement<T extends Box> =
  | { target: "current"; blocks: T[] }
  | { target: "newSlide"; blocks: T[] };

export function placeQuickLayout<T extends Box>(
  existing: readonly Box[],
  layoutTitle: T,
  content: T[],
  contentBottomLimit: number,
): QuickLayoutPlacement<T> {
  const visible = existing.filter((b) => !b.hidden);
  const headerTitle = visible.find((b) => b.kind === "title" && b.y < HEADER_BOTTOM);
  const occupied = visible.filter((b) => b !== headerTitle);
  const headerBusy = !!headerTitle || occupied.some((b) => b.y < HEADER_BOTTOM);
  const title = { ...layoutTitle, ...SLIDE_TITLE_BOX } as T;

  if (content.length === 0) {
    return { target: "current", blocks: headerBusy ? [] : [title] };
  }

  const contentTop = Math.min(...content.map((b) => b.y));
  const contentBottom = Math.max(...content.map((b) => b.y + b.h));
  const occupiedBottom = occupied.length ? Math.max(...occupied.map((b) => b.y + b.h)) : 0;
  const dy = occupiedBottom > 0 ? Math.max(0, occupiedBottom + GAP - contentTop) : 0;

  if (contentBottom + dy <= contentBottomLimit) {
    const moved = dy ? content.map((b) => ({ ...b, y: b.y + dy })) : content;
    return { target: "current", blocks: headerBusy ? moved : [title, ...moved] };
  }
  return { target: "newSlide", blocks: [title, ...content] };
}
