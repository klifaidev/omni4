// Réguas, guias de layout e margens do editor (só na edição — tudo aqui é
// data-export-hide e nunca vai para apresentação ou exportação).
//
// Tudo é desenhado em coordenadas do slide; espessuras e fontes dividem
// pela escala para ficarem do mesmo tamanho na tela em qualquer zoom.
//  - Arraste da régua de cima → guia horizontal; da esquerda → vertical.
//  - Arraste uma guia para mover; solte na régua (ou fora do slide) para
//    apagar; dois cliques também apagam. Guias travadas não mexem.

import { useCallback, useEffect, useRef, useState } from "react";
import { CANVAS_H, CANVAS_W, FOOTER_H, type SlideGuides } from "@/lib/customSlide";
import { DEFAULT_MARGIN } from "@/lib/slideGuides";
import { strings } from "@/lib/i18n";

const t = strings.slides.editor.guides;
const GUIDE_COLOR = "#DB2777";
const RULER_PX = 18;

type Drag = { axis: "v" | "h"; index: number | null; pos: number };

export function GuidesLayer({
  guides, showRulers, showMargins, showFooter, scale, canvasEl, readOnly, onChange,
}: {
  guides: SlideGuides | undefined;
  showRulers: boolean;
  showMargins: boolean;
  showFooter: boolean;
  scale: number;
  canvasEl: HTMLDivElement | null;
  readOnly?: boolean;
  onChange: (next: SlideGuides) => void;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const s = scale > 0 ? scale : 1;
  const ruler = RULER_PX / s;
  const contentH = CANVAS_H - (showFooter ? FOOTER_H : 0);
  const v = guides?.v ?? [];
  const h = guides?.h ?? [];
  const locked = !!guides?.locked;

  const toCanvas = useCallback((clientX: number, clientY: number) => {
    if (!canvasEl) return null;
    const r = canvasEl.getBoundingClientRect();
    return { x: (clientX - r.left) / s, y: (clientY - r.top) / s };
  }, [canvasEl, s]);

  const begin = (axis: "v" | "h", index: number | null, e: React.PointerEvent) => {
    if (readOnly || e.button !== 0) return;
    if (index !== null && locked) return;
    e.preventDefault();
    e.stopPropagation();
    const p = toCanvas(e.clientX, e.clientY);
    if (!p) return;
    const next = { axis, index, pos: axis === "v" ? p.x : p.y };
    dragRef.current = next;
    setDrag(next);
  };

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const cur = dragRef.current;
      const p = toCanvas(e.clientX, e.clientY);
      if (!cur || !p) return;
      const next = { ...cur, pos: cur.axis === "v" ? p.x : p.y };
      dragRef.current = next;
      setDrag(next);
    };
    const onUp = () => {
      const cur = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!cur) return;
      const limit = cur.axis === "v" ? CANVAS_W : CANVAS_H;
      // Soltou na régua ou fora do slide: apaga (ou desiste da guia nova).
      const remove = cur.pos < ruler || cur.pos > limit;
      const list = [...(cur.axis === "v" ? v : h)];
      if (cur.index !== null) list.splice(cur.index, 1);
      if (!remove) list.push(Math.round(cur.pos));
      if (remove && cur.index === null) return;
      const sorted = Array.from(new Set(list)).sort((a, b) => a - b);
      onChange({ v: cur.axis === "v" ? sorted : v, h: cur.axis === "h" ? sorted : h, locked: guides?.locked });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // `drag` só liga/desliga os ouvintes; o valor corrente vem de dragRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null]);

  const removeAt = (axis: "v" | "h", index: number) => {
    if (readOnly || locked) return;
    const list = (axis === "v" ? v : h).filter((_, i) => i !== index);
    onChange({ v: axis === "v" ? list : v, h: axis === "h" ? list : h, locked: guides?.locked });
  };

  if (!showRulers && !showMargins) return null;

  // Enquanto arrasta uma guia existente, ela some da lista e aparece na
  // posição do ponteiro.
  const shownV = v.filter((_, i) => !(drag?.axis === "v" && drag.index === i));
  const shownH = h.filter((_, i) => !(drag?.axis === "h" && drag.index === i));
  const hit = 8 / s;
  const font = 10 / s;
  const majorStep = s < 0.45 ? 200 : 100;

  return (
    <div data-export-hide="true" data-edit-only="true"
      style={{ position: "absolute", inset: 0, width: CANVAS_W, height: CANVAS_H, pointerEvents: "none", zIndex: 999997 }}>
      <svg width={CANVAS_W} height={CANVAS_H} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        {showMargins && (
          <g>
            <rect x={DEFAULT_MARGIN} y={DEFAULT_MARGIN}
              width={CANVAS_W - 2 * DEFAULT_MARGIN} height={contentH - 2 * DEFAULT_MARGIN}
              fill="none" stroke={GUIDE_COLOR} strokeOpacity={0.55} strokeWidth={1 / s} strokeDasharray={`${6 / s} ${4 / s}`} />
            {showFooter && (
              <g>
                <rect x={0} y={CANVAS_H - FOOTER_H} width={CANVAS_W} height={FOOTER_H}
                  fill={GUIDE_COLOR} fillOpacity={0.07} stroke={GUIDE_COLOR} strokeOpacity={0.35} strokeWidth={1 / s} />
                <text x={CANVAS_W - 8 / s} y={CANVAS_H - FOOTER_H + 14 / s} textAnchor="end"
                  fontSize={font} fill={GUIDE_COLOR} fillOpacity={0.8}>{t.footerZone}</text>
              </g>
            )}
          </g>
        )}
        {showRulers && (
          <g>
            {shownV.map((x) => (
              <line key={`v${x}`} x1={x} x2={x} y1={0} y2={CANVAS_H} stroke={GUIDE_COLOR} strokeWidth={1 / s} />
            ))}
            {shownH.map((y) => (
              <line key={`h${y}`} y1={y} y2={y} x1={0} x2={CANVAS_W} stroke={GUIDE_COLOR} strokeWidth={1 / s} />
            ))}
            {drag && (drag.axis === "v"
              ? <line x1={drag.pos} x2={drag.pos} y1={0} y2={CANVAS_H} stroke={GUIDE_COLOR} strokeWidth={1.5 / s} strokeDasharray={`${4 / s} ${3 / s}`} />
              : <line y1={drag.pos} y2={drag.pos} x1={0} x2={CANVAS_W} stroke={GUIDE_COLOR} strokeWidth={1.5 / s} strokeDasharray={`${4 / s} ${3 / s}`} />)}
          </g>
        )}
      </svg>

      {showRulers && (
        <>
          {/* Réguas: de cima cria guia horizontal; da esquerda, vertical. */}
          <Ruler axis="x" thickness={ruler} scale={s} majorStep={majorStep} font={font}
            onPointerDown={(e) => begin("h", null, e)} title={t.rulerTopHint} />
          <Ruler axis="y" thickness={ruler} scale={s} majorStep={majorStep} font={font}
            onPointerDown={(e) => begin("v", null, e)} title={t.rulerLeftHint} />
          {!locked && !readOnly && v.map((x, i) => (
            <div key={`hv${x}`} role="separator" aria-orientation="vertical" aria-label={t.guideAt(Math.round(x))}
              title={t.guideHint}
              onPointerDown={(e) => begin("v", i, e)}
              onDoubleClick={(e) => { e.stopPropagation(); removeAt("v", i); }}
              style={{ position: "absolute", left: x - hit / 2, top: 0, width: hit, height: CANVAS_H, cursor: "ew-resize", pointerEvents: "auto" }} />
          ))}
          {!locked && !readOnly && h.map((y, i) => (
            <div key={`hh${y}`} role="separator" aria-orientation="horizontal" aria-label={t.guideAt(Math.round(y))}
              title={t.guideHint}
              onPointerDown={(e) => begin("h", i, e)}
              onDoubleClick={(e) => { e.stopPropagation(); removeAt("h", i); }}
              style={{ position: "absolute", top: y - hit / 2, left: 0, height: hit, width: CANVAS_W, cursor: "ns-resize", pointerEvents: "auto" }} />
          ))}
          {drag && (
            <div style={{
              position: "absolute",
              left: drag.axis === "v" ? drag.pos + 6 / s : ruler + 6 / s,
              top: drag.axis === "h" ? drag.pos + 6 / s : ruler + 6 / s,
              background: GUIDE_COLOR, color: "#fff", fontSize: font, padding: `${2 / s}px ${5 / s}px`,
              borderRadius: 3 / s, whiteSpace: "nowrap",
            }}>
              {drag.pos < ruler || drag.pos > (drag.axis === "v" ? CANVAS_W : CANVAS_H)
                ? t.dropToRemove
                : `${Math.round(drag.pos)} px`}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Ruler({ axis, thickness, scale, majorStep, font, onPointerDown, title }: {
  axis: "x" | "y";
  thickness: number;
  scale: number;
  majorStep: number;
  font: number;
  onPointerDown: (e: React.PointerEvent) => void;
  title: string;
}) {
  const length = axis === "x" ? CANVAS_W : CANVAS_H;
  const ticks: number[] = [];
  for (let p = 0; p <= length; p += majorStep / 2) ticks.push(p);
  const horizontal = axis === "x";
  return (
    <div title={title} onPointerDown={onPointerDown}
      style={{
        position: "absolute", left: 0, top: 0,
        width: horizontal ? CANVAS_W : thickness, height: horizontal ? thickness : CANVAS_H,
        background: "hsl(var(--card) / 0.92)", pointerEvents: "auto",
        cursor: horizontal ? "s-resize" : "e-resize",
        borderBottom: horizontal ? `${1 / scale}px solid hsl(var(--border))` : undefined,
        borderRight: horizontal ? undefined : `${1 / scale}px solid hsl(var(--border))`,
      }}>
      <svg width={horizontal ? CANVAS_W : thickness} height={horizontal ? thickness : CANVAS_H} style={{ display: "block" }}>
        {ticks.map((p) => {
          const major = p % majorStep === 0;
          const len = thickness * (major ? 0.55 : 0.3);
          return horizontal ? (
            <g key={p}>
              <line x1={p} x2={p} y1={thickness - len} y2={thickness} stroke="hsl(var(--muted-foreground))" strokeWidth={1 / scale} />
              {major && p > 0 && <text x={p + 3 / scale} y={font * 1.05} fontSize={font} fill="hsl(var(--muted-foreground))">{p}</text>}
            </g>
          ) : (
            <g key={p}>
              <line y1={p} y2={p} x1={thickness - len} x2={thickness} stroke="hsl(var(--muted-foreground))" strokeWidth={1 / scale} />
              {major && p > 0 && (
                <text x={font * 1.05} y={p - 3 / scale} fontSize={font} fill="hsl(var(--muted-foreground))"
                  transform={`rotate(-90 ${font * 1.05} ${p - 3 / scale})`}>{p}</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
