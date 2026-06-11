// SVG-based renderer for ShapeBlock — supports 24 shape types,
// fill/opacity, stroke (solid/dashed/dotted), rotation, shadow, line family.

import { useId } from "react";
import { type ShapeBlock, type ShapeType, ensureShapeBlock, isLineFamily } from "@/lib/customSlide";

function regularPolygonPoints(cx: number, cy: number, r: number, sides: number, rotateDeg = -90): string {
  const pts: string[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (rotateDeg + (360 * i) / sides) * (Math.PI / 180);
    pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
  }
  return pts.join(" ");
}

function starPoints(cx: number, cy: number, rOuter: number, rInner: number, points: number): string {
  const pts: string[] = [];
  const step = Math.PI / points;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const a = -Math.PI / 2 + i * step;
    pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
  }
  return pts.join(" ");
}

function dashArray(style: "solid" | "dashed" | "dotted", w: number): string | undefined {
  if (style === "solid") return undefined;
  if (style === "dashed") return `${Math.max(4, w * 3)} ${Math.max(2, w * 1.5)}`;
  return `${Math.max(1, w)} ${Math.max(2, w * 2)}`;
}


export function ShapeRenderer({ block }: { block: ShapeBlock }) {
  const b = ensureShapeBlock(block);
  const uid = useId().replace(/:/g, "");
  const w = Math.max(1, b.w);
  const h = Math.max(1, b.h);
  const cx = w / 2, cy = h / 2;

  const isTransparentFill = b.fill === "transparent";
  const fill = isTransparentFill ? "none" : `#${b.fill}`;
  const fillOpacity = isTransparentFill ? 0 : b.fillOpacity / 100;
  const stroke = `#${b.strokeColor}`;
  const sw = b.strokeWidth;
  const dash = dashArray(b.strokeStyle, Math.max(1, sw));
  const lineColor = isTransparentFill ? "#000000" : `#${b.fill}`;
  const lineDash = dashArray(b.shape === "dashed-line" ? "dashed" : b.strokeStyle, b.lineThickness);

  const filterAttr = b.shadowEnabled ? `url(#shadow-${uid})` : undefined;
  const transform = b.rotation ? `rotate(${b.rotation} ${cx} ${cy})` : undefined;

  const isLine = isLineFamily(b.shape);
  const arrowMarkerStart = b.arrowStart || b.shape === "double-arrow" ? `url(#mks-${uid})` : undefined;
  const arrowMarkerEnd = b.arrowEnd || b.shape === "arrow" || b.shape === "double-arrow" ? `url(#mke-${uid})` : undefined;

  let shapeEl: React.ReactNode = null;

  if (isLine) {
    // Use p1/p2 in slide-space, converted to local SVG coordinates.
    const x1 = b.p1.x - b.x, y1 = b.p1.y - b.y;
    const x2 = b.p2.x - b.x, y2 = b.p2.y - b.y;
    shapeEl = (
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={lineColor} strokeWidth={b.lineThickness}
        strokeDasharray={lineDash} strokeLinecap="round"
        markerStart={arrowMarkerStart}
        markerEnd={arrowMarkerEnd}
        fill="none"
      />
    );
  } else {
    const common = isTransparentFill ? {
      fill: "none" as const,
      stroke: sw > 0 ? stroke : "none",
      strokeWidth: sw,
      strokeDasharray: dash,
    } : {
      fill, fillOpacity,
      stroke: sw > 0 ? stroke : "none",
      strokeWidth: sw,
      strokeDasharray: dash,
    };

    switch (b.shape) {
      case "rect":
        shapeEl = <rect x={0} y={0} width={w} height={h} {...common} />;
        break;
      case "roundRect":
        shapeEl = <rect x={0} y={0} width={w} height={h} rx={b.radius} ry={b.radius} {...common} />;
        break;
      case "circle": {
        const r = Math.min(w, h) / 2;
        shapeEl = <ellipse cx={cx} cy={cy} rx={r} ry={r} {...common} />;
        break;
      }
      case "ellipse":
        shapeEl = <ellipse cx={cx} cy={cy} rx={w / 2} ry={h / 2} {...common} />;
        break;
      case "triangle":
      case "right-triangle": {
        const verts = b.vertices && b.vertices.length === 3
          ? b.vertices
          : (b.shape === "triangle"
              ? [{ x: 0.5, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]
              : [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]);
        const pts = verts.map((v) => `${v.x * w},${v.y * h}`).join(" ");
        shapeEl = <polygon points={pts} {...common} />;
        break;
      }
      case "diamond":
        shapeEl = <polygon points={`${cx},0 ${w},${cy} ${cx},${h} 0,${cy}`} {...common} />;
        break;
      case "pentagon":
        shapeEl = <polygon points={regularPolygonPoints(cx, cy, Math.min(w, h) / 2, 5)} {...common} />;
        break;
      case "hexagon":
        shapeEl = <polygon points={regularPolygonPoints(cx, cy, Math.min(w, h) / 2, 6, 0)} {...common} />;
        break;
      case "star-4":
      case "star-5":
      case "star-6": {
        const n = parseInt(b.shape.split("-")[1], 10);
        const rO = Math.min(w, h) / 2;
        const rI = rO * (n === 4 ? 0.4 : n === 5 ? 0.42 : 0.55);
        shapeEl = <polygon points={starPoints(cx, cy, rO, rI, n)} {...common} />;
        break;
      }
      case "callout-rect":
      case "callout-rounded": {
        const rx = b.shape === "callout-rounded" ? b.radius : 0;
        const tail = Math.min(20, h * 0.25);
        const bodyH = h - tail;
        return (
          <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
            <Defs uid={uid} b={b} />
            <g transform={transform} filter={filterAttr}>
              <rect x={0} y={0} width={w} height={bodyH} rx={rx} ry={rx} {...common} />
              <polygon points={`${w * 0.15},${bodyH} ${w * 0.3},${bodyH} ${w * 0.18},${h}`} {...common} />
            </g>
          </svg>
        );
      }
      case "chevron": {
        const nd = Math.max(0, Math.min(0.5, b.notchDepth));
        const tip = w * (1 - nd);
        const notch = w * nd;
        shapeEl = <polygon points={`0,0 ${tip},0 ${w},${cy} ${tip},${h} 0,${h} ${notch},${cy}`} {...common} />;
        break;
      }
      case "ribbon": {
        const tail = Math.min(h * 0.4, w * 0.08);
        const bodyL = tail, bodyR = w - tail;
        const midY = h * 0.6;
        const d = [
          `M ${bodyL} 0`, `L ${bodyR} 0`,
          `L ${w} ${midY / 2}`, `L ${bodyR} ${midY}`,
          `L ${bodyR} ${h}`, `L ${cx} ${h * 0.85}`, `L ${bodyL} ${h}`,
          `L ${bodyL} ${midY}`, `L 0 ${midY / 2}`, "Z",
        ].join(" ");
        shapeEl = <path d={d} {...common} />;
        break;
      }
      case "brace-left": {
        const d = `M ${w * 0.7} 0 Q ${w * 0.2} 0 ${w * 0.2} ${h * 0.25} L ${w * 0.2} ${cy * 0.9} Q ${w * 0.2} ${cy} 0 ${cy} Q ${w * 0.2} ${cy} ${w * 0.2} ${cy * 1.1} L ${w * 0.2} ${h * 0.75} Q ${w * 0.2} ${h} ${w * 0.7} ${h}`;
        shapeEl = <path d={d} fill="none" stroke={`#${b.fill}`} strokeWidth={Math.max(2, b.strokeWidth || 2)} strokeDasharray={dash} />;
        break;
      }
      case "brace-right": {
        const d = `M ${w * 0.3} 0 Q ${w * 0.8} 0 ${w * 0.8} ${h * 0.25} L ${w * 0.8} ${cy * 0.9} Q ${w * 0.8} ${cy} ${w} ${cy} Q ${w * 0.8} ${cy} ${w * 0.8} ${cy * 1.1} L ${w * 0.8} ${h * 0.75} Q ${w * 0.8} ${h} ${w * 0.3} ${h}`;
        shapeEl = <path d={d} fill="none" stroke={`#${b.fill}`} strokeWidth={Math.max(2, b.strokeWidth || 2)} strokeDasharray={dash} />;
        break;
      }
      case "bracket-left": {
        const d = `M ${w * 0.6} 0 L ${w * 0.2} 0 L ${w * 0.2} ${h} L ${w * 0.6} ${h}`;
        shapeEl = <path d={d} fill="none" stroke={`#${b.fill}`} strokeWidth={Math.max(2, b.strokeWidth || 2)} strokeDasharray={dash} />;
        break;
      }
      case "bracket-right": {
        const d = `M ${w * 0.4} 0 L ${w * 0.8} 0 L ${w * 0.8} ${h} L ${w * 0.4} ${h}`;
        shapeEl = <path d={d} fill="none" stroke={`#${b.fill}`} strokeWidth={Math.max(2, b.strokeWidth || 2)} strokeDasharray={dash} />;
        break;
      }
      default:
        shapeEl = <rect x={0} y={0} width={w} height={h} {...common} />;
    }
  }

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
      style={{ display: "block", overflow: "visible" }}>
      <Defs uid={uid} b={b} />
      <g transform={transform} filter={filterAttr}>
        {shapeEl}
      </g>
    </svg>
  );
}

function Defs({ uid, b }: { uid: string; b: ReturnType<typeof ensureShapeBlock> }) {
  return (
    <defs>
      {b.shadowEnabled && (
        <filter id={`shadow-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow
            dx={b.shadowX} dy={b.shadowY}
            stdDeviation={b.shadowBlur / 2}
            floodColor={`#${b.shadowColor}`}
            floodOpacity={b.shadowOpacity / 100}
          />
        </filter>
      )}
      <marker id={`mke-${uid}`} viewBox="0 0 10 10" refX="9" refY="5"
        markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill={`#${b.fill}`} />
      </marker>
      <marker id={`mks-${uid}`} viewBox="0 0 10 10" refX="1" refY="5"
        markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 10 0 L 0 5 L 10 10 z" fill={`#${b.fill}`} />
      </marker>
    </defs>
  );
}

/** Tiny preview for the picker grid. */
export function ShapeMiniPreview({ shape, size = 28 }: { shape: ShapeType; size?: number }) {
  const b: ShapeBlock = {
    id: "preview", kind: "shape", x: 0, y: 0, w: size, h: size, z: 0,
    shape, fill: "475569", radius: 4,
    fillOpacity: 100, strokeColor: "475569", strokeWidth: isLineFamily(shape) ? 0 : 0,
    strokeStyle: "solid", rotation: 0, lineThickness: 2,
    lineDirection: shape === "double-arrow" || shape === "arrow" ? "horizontal" : "horizontal",
    arrowStart: shape === "double-arrow", arrowEnd: shape === "arrow" || shape === "double-arrow",
    shadowEnabled: false, shadowColor: "000000", shadowOpacity: 30,
    shadowBlur: 0, shadowX: 0, shadowY: 0,
  };
  return (
    <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <ShapeRenderer block={b} />
    </div>
  );
}
