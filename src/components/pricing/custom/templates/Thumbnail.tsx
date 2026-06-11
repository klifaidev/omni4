// Procedural SVG thumbnail generator.
// Renders block layout (positions, types) as a simplified preview.

import type { CustomBlock } from "@/lib/customSlide";
import { CANVAS_W, CANVAS_H } from "@/lib/customSlide";

interface Props {
  blocks: Omit<CustomBlock, "id">[];
  width?: number;
  height?: number;
  className?: string;
}

const COLORS = {
  bg: "#ffffff",
  border: "#e5e7eb",
  kpiBg: "#f8fafc",
  kpiAccent: "#C8102E",
  kpiText: "#cbd5e1",
  chartLine: "#3b82f6",
  chartBar: "#3b82f6",
  chartBarAlt: "#94a3b8",
  bridgePos: "#22c55e",
  bridgeNeg: "#ef4444",
  bridgeTot: "#3b82f6",
  tableHeader: "#1e293b",
  tableRow: "#f1f5f9",
  textPlaceholder: "#cbd5e1",
  haraldArc: "#C8102E",
};

function px(v: number, dim: number, target: number) {
  return (v / dim) * target;
}

export function TemplateThumbnail({ blocks, width = 320, height = 180, className }: Props) {
  const sx = (v: number) => px(v, CANVAS_W, width);
  const sy = (v: number) => px(v, CANVAS_H, height);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width} height={height}
      className={className}
      style={{ background: COLORS.bg, display: "block" }}
      role="img"
      aria-label="Pré-visualização de modelo"
    >
      <rect x="0" y="0" width={width} height={height} fill={COLORS.bg} />

      {blocks.map((b, i) => {
        const x = sx(b.x), y = sy(b.y), w = sx(b.w), h = sy(b.h);

        if (b.kind === "title") {
          return (
            <g key={i}>
              <rect x={x} y={y + h * 0.3} width={w * 0.55} height={h * 0.45}
                fill={COLORS.kpiAccent} rx={1.5} />
            </g>
          );
        }

        if (b.kind === "text") {
          return (
            <g key={i}>
              <rect x={x} y={y + 2} width={w * 0.85} height={2} fill={COLORS.textPlaceholder} rx={1} />
              <rect x={x} y={y + 6} width={w * 0.6} height={2} fill={COLORS.textPlaceholder} rx={1} />
            </g>
          );
        }

        if (b.kind === "kpi") {
          const color = (b as { color?: string }).color === "C8102E" ? COLORS.kpiAccent : COLORS.tableHeader;
          return (
            <g key={i}>
              <rect x={x} y={y} width={w} height={h}
                fill={COLORS.kpiBg} stroke={COLORS.border} strokeWidth={0.5} rx={2} />
              <rect x={x + 4} y={y + 4} width={w * 0.45} height={2} fill={COLORS.textPlaceholder} rx={1} />
              <rect x={x + 4} y={y + h * 0.45} width={w * 0.6} height={h * 0.3} fill={color} rx={1.5} />
            </g>
          );
        }

        if (b.kind === "table") {
          const rows = 6;
          const headerH = h * 0.18;
          const rowH = (h - headerH) / rows;
          return (
            <g key={i}>
              <rect x={x} y={y} width={w} height={h} fill={COLORS.bg}
                stroke={COLORS.border} strokeWidth={0.5} rx={1} />
              <rect x={x} y={y} width={w} height={headerH} fill={COLORS.tableHeader} />
              {Array.from({ length: rows }).map((_, r) => (
                <rect key={r} x={x} y={y + headerH + r * rowH} width={w}
                  height={rowH * 0.55} fill={r % 2 === 0 ? COLORS.tableRow : "transparent"} />
              ))}
            </g>
          );
        }

        if (b.kind === "bridge") {
          const cols = 7;
          const gap = w / (cols + 1);
          const heights = [0.7, 0.45, 0.3, 0.85, 0.4, 0.5, 0.6];
          const colors = [COLORS.bridgeTot, COLORS.bridgePos, COLORS.bridgeNeg, COLORS.bridgeTot, COLORS.bridgePos, COLORS.bridgeNeg, COLORS.bridgeTot];
          return (
            <g key={i}>
              <rect x={x} y={y} width={w} height={h} fill="transparent"
                stroke={COLORS.border} strokeWidth={0.5} rx={1} />
              {Array.from({ length: cols }).map((_, c) => {
                const bw = gap * 0.7;
                const bh = h * heights[c] * 0.7;
                const bx = x + gap * (c + 0.5);
                const by = y + h - bh - 4;
                return <rect key={c} x={bx} y={by} width={bw} height={bh} fill={colors[c]} rx={1} />;
              })}
            </g>
          );
        }

        if (b.kind === "chart") {
          const ct = (b as { chartType?: string }).chartType ?? "line";
          if (ct === "line" || ct === "area") {
            const pts = [0.6, 0.5, 0.7, 0.45, 0.55, 0.3, 0.4, 0.25];
            const stepX = w / (pts.length - 1);
            const path = pts.map((p, idx) =>
              `${idx === 0 ? "M" : "L"}${(x + idx * stepX).toFixed(1)},${(y + h * p).toFixed(1)}`
            ).join(" ");
            return (
              <g key={i}>
                <rect x={x} y={y} width={w} height={h} fill="transparent"
                  stroke={COLORS.border} strokeWidth={0.5} rx={1} />
                {ct === "area" && (
                  <path d={`${path} L${(x + w).toFixed(1)},${(y + h).toFixed(1)} L${x.toFixed(1)},${(y + h).toFixed(1)} Z`}
                    fill={COLORS.chartLine} fillOpacity={0.2} />
                )}
                <path d={path} stroke={COLORS.chartLine} strokeWidth={1.5} fill="none" />
              </g>
            );
          }
          if (ct === "column" || ct === "bar" || ct === "stackedColumn") {
            const cols = 8;
            const gap = w / cols;
            const heights = [0.5, 0.7, 0.4, 0.85, 0.6, 0.45, 0.75, 0.55];
            return (
              <g key={i}>
                <rect x={x} y={y} width={w} height={h} fill="transparent"
                  stroke={COLORS.border} strokeWidth={0.5} rx={1} />
                {Array.from({ length: cols }).map((_, c) => {
                  const bw = gap * 0.65;
                  const bh = h * heights[c] * 0.85;
                  return (
                    <rect key={c} x={x + c * gap + gap * 0.18} y={y + h - bh - 2}
                      width={bw} height={bh}
                      fill={c % 2 === 0 ? COLORS.chartBar : COLORS.chartBarAlt} rx={0.5} />
                  );
                })}
              </g>
            );
          }
          // fallback bar
          return (
            <g key={i}>
              <rect x={x} y={y} width={w} height={h} fill="transparent"
                stroke={COLORS.border} strokeWidth={0.5} rx={1} />
              <rect x={x + w * 0.3} y={y + h * 0.4} width={w * 0.4} height={h * 0.4}
                fill={COLORS.chartBar} rx={1} />
            </g>
          );
        }

        if (b.kind === "topSku") {
          const rows = 6;
          const rowH = h / rows;
          const widths = [0.95, 0.78, 0.66, 0.52, 0.4, 0.3];
          return (
            <g key={i}>
              {Array.from({ length: rows }).map((_, r) => (
                <rect key={r} x={x} y={y + r * rowH + rowH * 0.2}
                  width={w * widths[r]} height={rowH * 0.55}
                  fill={COLORS.chartBar} fillOpacity={0.85} rx={1} />
              ))}
            </g>
          );
        }

        if (b.kind === "shape") {
          return <rect key={i} x={x} y={y} width={w} height={h}
            fill={COLORS.border} rx={1.5} />;
        }

        // default
        return (
          <rect key={i} x={x} y={y} width={w} height={h}
            fill="none" stroke={COLORS.border} strokeWidth={0.5} rx={1} />
        );
      })}

      {/* Faixa Harald no rodapé */}
      <path d={`M0 ${height - 4} Q ${width / 2} ${height - 10} ${width} ${height - 4} L${width} ${height} L0 ${height} Z`}
        fill={COLORS.haraldArc} />
    </svg>
  );
}
