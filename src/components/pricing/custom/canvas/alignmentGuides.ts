// Smart alignment guides (B8.3).
//
// Pure helpers that, given a moving block and the other blocks on the slide,
// return the snapped position plus the guide lines to render.

import { CANVAS_W, CANVAS_H, type CustomBlock } from "@/lib/customSlide";

export interface Bounds { id: string; x: number; y: number; w: number; h: number }
export interface SnapResult {
  x: number;
  y: number;
  guides: { v: number[]; h: number[] };
}

const TOLERANCE = 6;
const SLIDE_MARGIN = 16;

export function computeSnap(
  moving: { x: number; y: number; w: number; h: number },
  others: Bounds[],
): SnapResult {
  const v = new Set<number>();
  const h = new Set<number>();
  let snapX = moving.x;
  let snapY = moving.y;
  let bestDx = TOLERANCE + 1;
  let bestDy = TOLERANCE + 1;

  // Collect candidate X (vertical lines) from each other block: left, center, right.
  const candX: { line: number; from: "edge" | "center" }[] = [];
  const candY: { line: number; from: "edge" | "center" }[] = [];

  others.forEach((b) => {
    candX.push({ line: b.x, from: "edge" });
    candX.push({ line: b.x + b.w, from: "edge" });
    candX.push({ line: b.x + b.w / 2, from: "center" });
    candY.push({ line: b.y, from: "edge" });
    candY.push({ line: b.y + b.h, from: "edge" });
    candY.push({ line: b.y + b.h / 2, from: "center" });
  });

  // Slide edges + margins + axis.
  candX.push({ line: 0, from: "edge" });
  candX.push({ line: SLIDE_MARGIN, from: "edge" });
  candX.push({ line: CANVAS_W, from: "edge" });
  candX.push({ line: CANVAS_W - SLIDE_MARGIN, from: "edge" });
  candX.push({ line: CANVAS_W / 2, from: "center" });

  candY.push({ line: 0, from: "edge" });
  candY.push({ line: SLIDE_MARGIN, from: "edge" });
  candY.push({ line: CANVAS_H, from: "edge" });
  candY.push({ line: CANVAS_H - SLIDE_MARGIN, from: "edge" });
  candY.push({ line: CANVAS_H / 2, from: "center" });

  // Targets on the moving block.
  const xTargets = [
    { v: moving.x, type: "left" as const },
    { v: moving.x + moving.w / 2, type: "center" as const },
    { v: moving.x + moving.w, type: "right" as const },
  ];
  const yTargets = [
    { v: moving.y, type: "top" as const },
    { v: moving.y + moving.h / 2, type: "middle" as const },
    { v: moving.y + moving.h, type: "bottom" as const },
  ];

  for (const c of candX) {
    for (const t of xTargets) {
      // Prevent center-to-edge cross matches noise: allow but it's still a valid alignment.
      const d = c.line - t.v;
      const ad = Math.abs(d);
      if (ad <= TOLERANCE) {
        v.add(c.line);
        if (ad < bestDx) { bestDx = ad; snapX = moving.x + d; }
      }
    }
  }

  for (const c of candY) {
    for (const t of yTargets) {
      const d = c.line - t.v;
      const ad = Math.abs(d);
      if (ad <= TOLERANCE) {
        h.add(c.line);
        if (ad < bestDy) { bestDy = ad; snapY = moving.y + d; }
      }
    }
  }

  return { x: snapX, y: snapY, guides: { v: Array.from(v), h: Array.from(h) } };
}

/** Convert blocks (excluding ids in `excludeIds`) to bounds. */
export function boundsOf(blocks: CustomBlock[], excludeIds: Set<string>): Bounds[] {
  return blocks
    .filter((b) => !excludeIds.has(b.id))
    .map((b) => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h }));
}

/** Group bounding box. */
export function groupBounds(blocks: CustomBlock[]): { x: number; y: number; w: number; h: number } | null {
  if (blocks.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of blocks) {
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.w > maxX) maxX = b.x + b.w;
    if (b.y + b.h > maxY) maxY = b.y + b.h;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
