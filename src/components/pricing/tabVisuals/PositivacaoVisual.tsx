// Positivação · Evolutivo de clientes ativos (top 8 da dimensão escolhida,
// últimos 13 meses). O mesmo desenho na aba e no slide.
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatNum } from "@/lib/format";
import type { PositivacaoSeries } from "@/lib/positivacao";
import type { TabVisualVariant } from "./visualTheme";

const PALETTE = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "#22d3ee",
  "#a78bfa",
  "#f472b6",
];

export function PositivacaoVisual({ data, variant }: { data: PositivacaoSeries; variant: TabVisualVariant }) {
  const fontSize = variant === "slide" ? 13 : 11;
  const animate = variant === "tab";
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data.chartData} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
        <CartesianGrid stroke="hsl(var(--border) / 0.4)" strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize }} />
        <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize }} allowDecimals={false} />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const sorted = [...payload].sort((a, b) => Number(b.value) - Number(a.value));
            return (
              <div className="rounded-lg border border-border/60 bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
                <div className="mb-1 font-semibold">{label}</div>
                <div className="space-y-0.5">
                  {sorted.map((p) => (
                    <div key={String(p.dataKey)} className="flex items-center justify-between gap-4">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
                        {String(p.dataKey)}
                      </span>
                      <span className="tabular-nums text-foreground">{formatNum(Number(p.value), 0)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          }}
        />
        <Legend wrapperStyle={{ fontSize }} />
        {data.chartKeys.map((key, i) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={PALETTE[i % PALETTE.length]}
            strokeWidth={2}
            dot={{ r: 2 }}
            connectNulls
            isAnimationActive={animate}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
