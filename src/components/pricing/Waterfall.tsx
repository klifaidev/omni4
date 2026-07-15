import type { PVMResult } from "@/lib/analytics";
import { formatBRL } from "@/lib/format";
import { useMemo } from "react";

interface WaterfallProps {
  data: PVMResult;
  height?: number;
  /** Angulo de inclinacao dos labels do eixo X. 0 = horizontal (padrao). */
  labelAngle?: number;
}

interface Step {
  label: string;
  delta: number;
  total: boolean;
  color: string;
}

export function Waterfall({ data, height = 360, labelAngle = 0 }: WaterfallProps) {
  const steps: Step[] = useMemo(
    () => [
      { label: data.baseLabel, delta: data.base, total: true, color: "hsl(var(--pvm-base))" },
      { label: "Efeito Volume", delta: data.volume, total: false, color: "hsl(var(--pvm-volume))" },
      { label: "Efeito Preço", delta: data.price, total: false, color: "hsl(var(--pvm-price))" },
      { label: "Efeito Custo Variável", delta: data.cost, total: false, color: "hsl(var(--pvm-cost))" },
      { label: "Efeito Frete", delta: data.freight, total: false, color: "hsl(var(--pvm-freight))" },
      { label: "Efeito Comissão", delta: data.commission, total: false, color: "hsl(var(--pvm-commission))" },
      { label: "Efeito Outros", delta: data.others, total: false, color: "hsl(var(--pvm-others))" },
      { label: data.currentLabel, delta: data.current, total: true, color: "hsl(var(--pvm-base))" },
    ],
    [data],
  );

  const cumulative: { start: number; end: number; value: number }[] = [];
  let running = 0;
  for (const s of steps) {
    if (s.total) {
      cumulative.push({ start: 0, end: s.delta, value: s.delta });
      running = s.delta;
    } else {
      const start = running;
      const end = running + s.delta;
      cumulative.push({ start, end, value: s.delta });
      running = end;
    }
  }

  const allVals = cumulative.flatMap((c) => [c.start, c.end, 0]);
  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);
  const range = maxV - minV || 1;
  const pad = range * 0.1;
  const yMin = minV - pad;
  const yMax = maxV + pad;
  const yRange = yMax - yMin;

  const W = 900;
  const H = height;
  const padL = 60;
  const padR = 30;
  const padT = 30;
  const padB = labelAngle === 0 ? 50 : 80;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const xStep = innerW / steps.length;
  const barW = xStep * 0.55;
  const yOf = (v: number) => padT + (1 - (v - yMin) / yRange) * innerH;
  const zeroY = yOf(0);

  const ticks = 5;
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => yMin + (yRange * i) / ticks);

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {tickVals.map((tv, i) => (
          <g key={i}>
            <line
              x1={padL}
              x2={W - padR}
              y1={yOf(tv)}
              y2={yOf(tv)}
              stroke="hsl(var(--border))"
              strokeOpacity={0.3}
              strokeDasharray={tv === 0 ? "" : "2 4"}
            />
            <text x={padL - 8} y={yOf(tv) + 4} fontSize="10" textAnchor="end" fill="hsl(var(--muted-foreground))">
              {formatBRL(tv, { compact: true })}
            </text>
          </g>
        ))}

        {cumulative.slice(0, -1).map((c, i) => {
          const next = cumulative[i + 1];
          const x1 = padL + i * xStep + xStep / 2 + barW / 2;
          const x2 = padL + (i + 1) * xStep + xStep / 2 - barW / 2;
          const y = yOf(c.end);
          const yNext = next.start === c.end ? y : yOf(next.start);
          if (steps[i + 1].total) return null;
          return (
            <line
              key={`conn-${i}`}
              x1={x1}
              x2={x2}
              y1={y}
              y2={yNext}
              stroke="hsl(var(--muted-foreground))"
              strokeOpacity={0.4}
              strokeDasharray="3 3"
            />
          );
        })}

        {cumulative.map((c, i) => {
          const s = steps[i];
          const x = padL + i * xStep + (xStep - barW) / 2;
          const top = yOf(Math.max(c.start, c.end));
          const h = Math.abs(yOf(c.end) - yOf(c.start));
          const isNeg = !s.total && c.value < 0;
          const labelX = x + barW / 2;
          const labelY = H - padB + 14;
          return (
            <g key={`bar-${i}`} className="animate-fade-up">
              <rect
                x={x}
                y={s.total ? Math.min(zeroY, yOf(c.end)) : top}
                width={barW}
                height={s.total ? Math.abs(yOf(c.end) - zeroY) : h || 2}
                rx={4}
                fill={s.color}
                opacity={isNeg ? 0.85 : 0.95}
              />
              <text
                x={x + barW / 2}
                y={(s.total ? Math.min(zeroY, yOf(c.end)) : top) - 6}
                fontSize="11"
                fontWeight="500"
                textAnchor="middle"
                fill="hsl(var(--foreground))"
              >
                {s.total ? formatBRL(c.value, { compact: true }) :
                  `${c.value >= 0 ? "+" : ""}${formatBRL(c.value, { compact: true })}`}
              </text>
              {labelAngle === 0 ? (
                <text
                  x={x + barW / 2}
                  y={H - padB + 18}
                  fontSize="11"
                  textAnchor="middle"
                  fill="hsl(var(--muted-foreground))"
                  fontWeight="500"
                >
                  {s.label}
                </text>
              ) : (
                <text
                  x={labelX}
                  y={labelY}
                  fontSize="11"
                  textAnchor="end"
                  dominantBaseline="middle"
                  fill="hsl(var(--muted-foreground))"
                  fontWeight="500"
                  transform={`rotate(${labelAngle}, ${labelX}, ${labelY})`}
                >
                  {s.label}
                </text>
              )}
            </g>
          );
        })}

        <line x1={padL} x2={W - padR} y1={zeroY} y2={zeroY} stroke="hsl(var(--border))" strokeOpacity={0.6} />
      </svg>
    </div>
  );
}
