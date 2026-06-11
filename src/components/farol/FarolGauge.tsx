const RED   = "#E24B4A";
const AMBER = "#EF9F27";
const GREEN = "#4ADE80";

function lerpColor(c1: string, c2: string, t: number): string {
  const p = (hex: string, o: number) => parseInt(hex.slice(o, o + 2), 16);
  const r = Math.round(p(c1, 1) + (p(c2, 1) - p(c1, 1)) * t);
  const g = Math.round(p(c1, 3) + (p(c2, 3) - p(c1, 3)) * t);
  const b = Math.round(p(c1, 5) + (p(c2, 5) - p(c1, 5)) * t);
  return `rgb(${r},${g},${b})`;
}

function arcColor(v: number): string {
  return v < 0.5
    ? lerpColor(RED, AMBER, v / 0.5)
    : lerpColor(AMBER, GREEN, (v - 0.5) / 0.5);
}

// Outer tick angles: 0% / 25% / 50% / 75%
const TICK_ANGLES = [
  -Math.PI / 2,
   0,
   Math.PI / 2,
   Math.PI,
] as const;

interface FarolGaugeProps {
  value: number; // 0..1
  size?: number;
}

export function FarolGauge({ value, size = 200 }: FarolGaugeProps) {
  const cx = 100;
  const cy = 100;
  const r  = 80;
  const sw = 16;

  const v = Math.max(0, Math.min(1, value));

  const startAngle = -Math.PI / 2;
  const endAngle   = startAngle + v * 2 * Math.PI;

  const startX = cx + r * Math.cos(startAngle); // 100
  const startY = cy + r * Math.sin(startAngle); // 20

  const endX = cx + r * Math.cos(endAngle);
  const endY = cy + r * Math.sin(endAngle);

  const largeArc  = v > 0.5 ? 1 : 0;
  const arcD      = `M ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 1 ${endX.toFixed(3)} ${endY.toFixed(3)}`;

  const color   = arcColor(v);
  const showArc = v > 0.005;
  const fullCircle = v >= 0.9999;
  const pct        = Math.round(v * 100);

  const dotX = fullCircle ? startX : endX;
  const dotY = fullCircle ? startY : endY;

  return (
    <div
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 200 200"
        style={{ background: "transparent", display: "block" }}
        aria-label={`Positivação: ${pct}%`}
      >
        <defs>
          {/* Neon glow for arc and dot */}
          <filter id="farolGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* No-op track filter (reserved) */}
          <filter id="farolTrack">
            <feGaussianBlur stdDeviation="0" />
          </filter>
        </defs>

        {/* Track — higher contrast */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={sw}
        />

        {/* Decorative inner ring for depth */}
        <circle
          cx={cx} cy={cy} r={68}
          fill="none"
          stroke="rgba(255,255,255,0.03)"
          strokeWidth={1}
        />


        {/* Colored value arc — solid color based on current value */}
        {showArc && (
          fullCircle ? (
            <circle
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={color}
              strokeWidth={sw}
              filter="url(#farolGlow)"
            />
          ) : (
            <path
              d={arcD}
              fill="none"
              stroke={color}
              strokeWidth={sw}
              strokeLinecap="round"
              filter="url(#farolGlow)"
            />
          )
        )}

        {/* Central labels */}
        <text
          x={cx}
          y={108}
          textAnchor="middle"
          fontSize={36}
          fontWeight={700}
          fill="white"
        >
          {pct}%
        </text>
        <text
          x={cx}
          y={124}
          textAnchor="middle"
          fontSize={10}
          fill="rgba(255,255,255,0.5)"
        >
          positivado
        </text>
      </svg>
    </div>
  );
}
