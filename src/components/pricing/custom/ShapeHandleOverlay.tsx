// Contextual handles overlay for ShapeBlock — replaces the default
// 8-point react-rnd handles for line family / triangle / ellipse / circle
// shapes, and adds extra geometry handles (radius for roundRect, notch
// for chevron). Rendered as a sibling of the Rnd, positioned absolutely
// within the slide canvas in slide-coords.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ShapeBlock,
  ensureShapeBlock,
  isLineFamily,
} from "@/lib/customSlide";
import { patchBlockAction } from "./editorStore";

type Pt = { x: number; y: number };

interface Props {
  block: ShapeBlock;
  scale: number;
  canvasEl: HTMLDivElement | null;
}

const HANDLE_BASE = 10; // px at 1× zoom
const ENDPOINT_BASE = 12;
const SNAP_PX = 8;

function clientToSlide(canvasEl: HTMLDivElement | null, cx: number, cy: number, scale: number): Pt {
  if (!canvasEl) return { x: cx, y: cy };
  const r = canvasEl.getBoundingClientRect();
  return { x: (cx - r.left) / scale, y: (cy - r.top) / scale };
}

function snapAngle(p1: Pt, p2: Pt): Pt {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return p2;
  const ang = Math.atan2(dy, dx);
  const step = Math.PI / 4; // 45°
  const snapped = Math.round(ang / step) * step;
  return { x: p1.x + Math.cos(snapped) * len, y: p1.y + Math.sin(snapped) * len };
}

export function ShapeHandleOverlay({ block, scale, canvasEl }: Props) {
  const b = ensureShapeBlock(block);
  // Local preview state during drag — committed on pointerup.
  const [draft, setDraft] = useState<Partial<ShapeBlock> | null>(null);
  const dragRef = useRef<{
    kind: string;
    start: Pt;
    init: ReturnType<typeof ensureShapeBlock>;
  } | null>(null);

  const live = { ...b, ...(draft ?? {}) } as ReturnType<typeof ensureShapeBlock>;
  const isLine = isLineFamily(b.shape);
  const handleSize = HANDLE_BASE / Math.max(scale, 0.2);
  const endpointSize = ENDPOINT_BASE / Math.max(scale, 0.2);

  // ---- Pointer handlers ----
  const startDrag = useCallback((kind: string, e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      kind,
      start: clientToSlide(canvasEl, e.clientX, e.clientY, scale),
      init: ensureShapeBlock(block),
    };
    setDraft({});
  }, [block, canvasEl, scale]);

  useEffect(() => {
    if (!draft) return;
    const onMove = (ev: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const cur = clientToSlide(canvasEl, ev.clientX, ev.clientY, scale);
      const dx = cur.x - drag.start.x;
      const dy = cur.y - drag.start.y;
      const init = drag.init;

      if (drag.kind === "p1" || drag.kind === "p2") {
        const moving: Pt = drag.kind === "p1"
          ? { x: init.p1.x + dx, y: init.p1.y + dy }
          : { x: init.p2.x + dx, y: init.p2.y + dy };
        const other: Pt = drag.kind === "p1" ? init.p2 : init.p1;
        const snapped = ev.shiftKey ? snapAngle(other, moving) : moving;
        const p1 = drag.kind === "p1" ? snapped : init.p1;
        const p2 = drag.kind === "p2" ? snapped : init.p2;
        const x = Math.min(p1.x, p2.x);
        const y = Math.min(p1.y, p2.y);
        const w = Math.max(1, Math.abs(p2.x - p1.x));
        const h = Math.max(1, Math.abs(p2.y - p1.y));
        setDraft({ p1, p2, x, y, w, h });
      } else if (drag.kind === "lineMove") {
        const p1 = { x: init.p1.x + dx, y: init.p1.y + dy };
        const p2 = { x: init.p2.x + dx, y: init.p2.y + dy };
        const x = Math.min(p1.x, p2.x);
        const y = Math.min(p1.y, p2.y);
        const w = Math.max(1, Math.abs(p2.x - p1.x));
        const h = Math.max(1, Math.abs(p2.y - p1.y));
        setDraft({ p1, p2, x, y, w, h });
      } else if (drag.kind === "radius") {
        const newR = Math.max(0, Math.min(Math.min(init.w, init.h) / 2, init.radius + dx));
        setDraft({ radius: Math.round(newR) });
      } else if (drag.kind === "notch") {
        const nd = Math.max(0, Math.min(0.5, (init.notchDepth + dx / Math.max(1, init.w))));
        setDraft({ notchDepth: nd });
      } else if (drag.kind.startsWith("vertex-")) {
        const idx = parseInt(drag.kind.split("-")[1], 10);
        const verts = init.vertices.map((v, i) =>
          i === idx
            ? { x: Math.max(0, Math.min(1, v.x + dx / Math.max(1, init.w))),
                y: Math.max(0, Math.min(1, v.y + dy / Math.max(1, init.h))) }
            : v,
        );
        setDraft({ vertices: verts });
      }
    };

    const onUp = () => {
      const drag = dragRef.current;
      if (!drag) return;
      if (draft && Object.keys(draft).length) {
        const labelMap: Record<string, "Mover ponto da linha" | "Editar vértice" | "Ajustar geometria" | "Mover bloco"> = {
          p1: "Mover ponto da linha",
          p2: "Mover ponto da linha",
          lineMove: "Mover bloco",
          radius: "Ajustar geometria",
          notch: "Ajustar geometria",
        };
        const lbl = drag.kind.startsWith("vertex-")
          ? "Editar vértice"
          : labelMap[drag.kind] ?? "Ajustar geometria";
        patchBlockAction(block.id, draft, lbl);
      }
      dragRef.current = null;
      setDraft(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [draft, block.id, canvasEl, scale]);

  // ---- Render ----
  const handleStyle = (kind: "square" | "circle" | "diamond", color = "#3B82F6", fill = "#fff", cursor = "pointer", size = handleSize): React.CSSProperties => ({
    position: "absolute",
    width: size,
    height: size,
    background: fill,
    border: `${1.5 / Math.max(scale, 0.2)}px solid ${color}`,
    borderRadius: kind === "circle" ? "50%" : kind === "diamond" ? 0 : 2,
    transform: `translate(-50%, -50%)${kind === "diamond" ? " rotate(45deg)" : ""}`,
    cursor,
    pointerEvents: "auto",
    zIndex: 10,
    boxSizing: "border-box",
  });

  // Position relative to canvas: handles use slide-coords directly because
  // the overlay container is positioned at {x:0,y:0} of the canvas with
  // width=CANVAS_W, height=CANVAS_H (parent applies the same scale).
  const px = (n: number) => `${n}px`;

  // ---- LINE FAMILY ----
  if (isLine) {
    const p1 = live.p1, p2 = live.p2;
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const minX = Math.min(p1.x, p2.x);
    const minY = Math.min(p1.y, p2.y);
    const w = Math.max(1, Math.abs(p2.x - p1.x));
    const h = Math.max(1, Math.abs(p2.y - p1.y));
    return (
      <>
        {/* Dashed reference bbox */}
        <div style={{
          position: "absolute", left: px(minX), top: px(minY),
          width: px(w), height: px(h),
          border: `${1 / Math.max(scale, 0.2)}px dashed #3B82F6`,
          pointerEvents: "none", boxSizing: "border-box", zIndex: 9,
        }} />
        {/* Endpoint p1 */}
        <div
          style={{ ...handleStyle("circle", "#3B82F6", "#fff", "crosshair", endpointSize), left: px(p1.x), top: px(p1.y) }}
          onPointerDown={(e) => startDrag("p1", e)}
          title="Ponto inicial"
        />
        {/* Endpoint p2 */}
        <div
          style={{ ...handleStyle("circle", "#3B82F6", "#fff", "crosshair", endpointSize), left: px(p2.x), top: px(p2.y) }}
          onPointerDown={(e) => startDrag("p2", e)}
          title="Ponto final"
        />
        {/* Move handle (midpoint) */}
        <div
          style={{ ...handleStyle("circle", "#3B82F6", "#3B82F6", "move", endpointSize), left: px(mid.x), top: px(mid.y) }}
          onPointerDown={(e) => startDrag("lineMove", e)}
          title="Mover linha"
        />
      </>
    );
  }

  // ---- NON-LINE: handles are rendered relative to bbox (live.x, live.y) ----
  const overlayBox: React.CSSProperties = {
    position: "absolute",
    left: px(live.x), top: px(live.y),
    width: px(live.w), height: px(live.h),
    pointerEvents: "none", zIndex: 9,
  };

  // Triangle vertices
  if (b.shape === "triangle" || b.shape === "right-triangle") {
    return (
      <div style={overlayBox}>
        {live.vertices.map((v, i) => (
          <div
            key={i}
            style={{
              ...handleStyle("circle", "#3B82F6", "#fff", "crosshair"),
              left: px(v.x * live.w),
              top: px(v.y * live.h),
            }}
            onPointerDown={(e) => startDrag(`vertex-${i}`, e)}
          />
        ))}
      </div>
    );
  }

  // RoundRect → extra radius handle
  if (b.shape === "roundRect" || b.shape === "callout-rounded") {
    const r = Math.max(0, Math.min(Math.min(live.w, live.h) / 2, live.radius));
    return (
      <div style={overlayBox}>
        <div
          style={{ ...handleStyle("diamond", "#fff", "#FBBF24", "ew-resize", handleSize * 0.9), left: px(r), top: 0 }}
          onPointerDown={(e) => startDrag("radius", e)}
          title="Raio do canto"
        />
      </div>
    );
  }

  // Chevron → notch depth
  if (b.shape === "chevron") {
    const nd = Math.max(0, Math.min(0.5, live.notchDepth));
    return (
      <div style={overlayBox}>
        <div
          style={{ ...handleStyle("diamond", "#fff", "#FBBF24", "ew-resize", handleSize * 0.9), left: px(nd * live.w), top: px(live.h / 2) }}
          onPointerDown={(e) => startDrag("notch", e)}
          title="Profundidade do recorte"
        />
      </div>
    );
  }

  return null;
}
