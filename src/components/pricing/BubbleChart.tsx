import type { AggRow } from "@/lib/analytics";
import { formatBRL, formatPct } from "@/lib/format";

interface BubbleChartProps {
  data: AggRow[];
  height?: number;
}

export function BubbleChart({ data, height = 380 }: BubbleChartProps) {
  if (!data.length) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
        Sem dados para exibir.
      </div>
    );
  }
  const totalVol = data.reduce((s, d) => s + d.volumeKg, 0) || 1;
  const totalRol = data.reduce((s, d) => s + d.rol, 0) || 1;

  // X = share volume %, Y = margem %, R = share ROL
  const points = data.map((d) => ({
    ...d,
    shareVol: d.volumeKg / totalVol,
    shareRol: d.rol / totalRol,
  }));

  const maxX = Math.max(...points.map((p) => p.shareVol)) * 1.15 || 1;
  const minY = Math.min(...points.map((p) => p.margemPct), 0);
  const maxY = Math.max(...points.map((p) => p.margemPct), 0.4);
  const rangeY = maxY - minY || 1;

  const W = 900;
  const H = height;
  const padL = 60, padR = 30, padT = 20, padB = 50;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const xOf = (v: number) => padL + (v / maxX) * innerW;
  const yOf = (v: number) => padT + (1 - (v - minY) / rangeY) * innerH;
  const rOf = (s: number) => 8 + Math.sqrt(s) * 60;

  const colors = [
    "hsl(217 91% 60%)",
    "hsl(158 64% 52%)",
    "hsl(263 70% 65%)",
    "hsl(38 92% 60%)",
    "hsl(0 84% 65%)",
    "hsl(195 85% 60%)",
    "hsl(280 70% 65%)",
    "hsl(120 50% 55%)",
  ];

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {/* Y axis */}
        {[0, 0.25, 0.5, 0.75, 1].map((p) => {
          const v = minY + rangeY * p;
          return (
            <g key={p}>
              <line x1={padL} x2={W - padR} y1={yOf(v)} y2={yOf(v)} stroke="hsl(var(--border))" strokeOpacity={0.25} />
              <text x={padL - 8} y={yOf(v) + 4} fontSize="10" textAnchor="end" fill="hsl(var(--muted-foreground))">
                {formatPct(v, 0)}
              </text>
            </g>
          );
        })}
        {/* X axis */}
        {[0, 0.25, 0.5, 0.75, 1].map((p) => {
          const v = maxX * p;
          return (
            <text
              key={`x${p}`}
              x={xOf(v)}
              y={H - padB + 16}
              fontSize="10"
              textAnchor="middle"
              fill="hsl(var(--muted-foreground))"
            >
              {formatPct(v, 0)}
            </text>
          );
        })}
        <text x={W / 2} y={H - 6} fontSize="11" textAnchor="middle" fill="hsl(var(--muted-foreground))">
          Share de Volume
        </text>
        <text
          x={-H / 2}
          y={14}
          fontSize="11"
          textAnchor="middle"
          fill="hsl(var(--muted-foreground))"
          transform="rotate(-90)"
        >
          Margem %
        </text>

        {/* Bubbles */}
        {points.map((p, i) => {
          const cx = xOf(p.shareVol);
          const cy = yOf(p.margemPct);
          const r = rOf(p.shareRol);
          const c = colors[i % colors.length];
          return (
            <g key={p.key} className="animate-fade-up">
              <circle cx={cx} cy={cy} r={r} fill={c} fillOpacity={0.18} stroke={c} strokeWidth={1.5} />
              <text
                x={cx}
                y={cy + 4}
                fontSize="11"
                fontWeight="500"
                textAnchor="middle"
                fill="hsl(var(--foreground))"
              >
                {p.key}
              </text>
              <title>{`${p.key}\nROL: ${formatBRL(p.rol, { compact: true })}\nMg%: ${formatPct(p.margemPct)}\nVol Share: ${formatPct(p.shareVol)}`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
