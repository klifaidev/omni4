// Canais · Evolução temporal por canal e Análise de mix.
// O mesmo desenho na aba e no slide.
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBRL, formatTon } from "@/lib/format";
import { CANAL_PALETTE, type CanalChartMetric } from "./canaisData";
import type { TabVisualVariant } from "./visualTheme";

export interface CanalTrendVisualData {
  topCanais: string[];
  evolution: Record<string, number | string>[];
  chartMetric: CanalChartMetric;
}

function axisStyle(variant: TabVisualVariant) {
  return { fill: "hsl(var(--muted-foreground))", fontSize: variant === "slide" ? 13 : 11 };
}

function SortedTooltip({ active, payload, label, format, square }: {
  active?: boolean;
  payload?: Array<{ dataKey?: unknown; value?: unknown; color?: string }>;
  label?: unknown;
  format: (v: number) => string;
  square?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const sorted = [...payload].sort((a, b) => Number(b.value) - Number(a.value));
  return (
    <div className="rounded-lg border border-border/60 bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <div className="mb-1 font-semibold">{String(label)}</div>
      <div className="space-y-0.5">
        {sorted.map((p) => (
          <div key={String(p.dataKey)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className={square ? "inline-block h-2 w-2 rounded-sm" : "inline-block h-2 w-2 rounded-full"} style={{ background: p.color }} />
              {String(p.dataKey)}
            </span>
            <span className="tabular-nums text-foreground">{format(Number(p.value))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CanalTrendVisual({ data, variant }: { data: CanalTrendVisualData; variant: TabVisualVariant }) {
  const { chartMetric } = data;
  const fmtAxis = (v: number) =>
    chartMetric === "margemPct" ? `${v.toFixed(0)}%` : chartMetric === "rol" ? formatBRL(v, { compact: true }) : formatTon(v);
  const fmtTip = (v: number) =>
    chartMetric === "margemPct" ? `${v.toFixed(1)}%` : chartMetric === "rol" ? formatBRL(v, { compact: true }) : formatTon(v);
  const animate = variant === "tab";
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data.evolution} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
        <CartesianGrid stroke="hsl(var(--border) / 0.4)" strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={axisStyle(variant)} />
        <YAxis tick={axisStyle(variant)} tickFormatter={(v) => fmtAxis(Number(v))} width={variant === "slide" ? 80 : 60} />
        <Tooltip content={(props) => <SortedTooltip {...props} format={fmtTip} />} />
        <Legend wrapperStyle={{ fontSize: variant === "slide" ? 13 : 11 }} />
        {data.topCanais.map((c, i) => (
          <Line
            key={c}
            type="monotone"
            dataKey={c}
            stroke={CANAL_PALETTE[i % CANAL_PALETTE.length]}
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

export interface CanalMixVisualData {
  topCanais: string[];
  mixData: Record<string, number | string>[];
}

// Os dados já são % do mês (somam 100): com stackOffset="expand" as barras eram
// normalizadas para 0–1 e o eixo ia de 0 a 100 — ficavam com 1 px de altura.
export function CanalMixVisual({ data, variant }: { data: CanalMixVisualData; variant: TabVisualVariant }) {
  const animate = variant === "tab";
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data.mixData} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
        <CartesianGrid stroke="hsl(var(--border) / 0.4)" strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={axisStyle(variant)} />
        <YAxis tick={axisStyle(variant)} tickFormatter={(v) => `${Number(v).toFixed(0)}%`} domain={[0, 100]} />
        <Tooltip content={(props) => <SortedTooltip {...props} format={(v) => `${v.toFixed(1)}%`} square />} />
        <Legend wrapperStyle={{ fontSize: variant === "slide" ? 13 : 11 }} />
        {data.topCanais.map((c, i) => (
          <Bar key={c} dataKey={c} stackId="mix" fill={CANAL_PALETTE[i % CANAL_PALETTE.length]} fillOpacity={0.85} isAnimationActive={animate} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
