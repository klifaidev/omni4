// Visão Geral · Evolução mensal — ROL, Margem % e Volume.
// O MESMO desenho na aba e no slide (só as cores mudam com a superfície).
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBRL, formatTon } from "@/lib/format";
import type { EvolucaoMensalPoint } from "./evolucaoMensal";
import { tabVisualPalette, type TabVisualVariant } from "./visualTheme";

export function EvolucaoMensalVisual({ data, variant }: { data: EvolucaoMensalPoint[]; variant: TabVisualVariant }) {
  const c = tabVisualPalette(variant);
  const tick = { fill: c.axis, fontSize: c.fontSize };
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 10, right: 24, bottom: 8, left: 8 }}>
        <CartesianGrid stroke={c.grid} strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={tick} stroke={c.axisLine} />
        <YAxis
          yAxisId="left"
          tick={tick}
          stroke={c.axisLine}
          // "R$ 10.000.000" não cabia na largura padrão (60px) e era cortado.
          width={Math.ceil(c.fontSize * 7.4)}
          tickFormatter={(v) => formatBRL(Number(v), { compact: true })}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={tick}
          stroke={c.axisLine}
          tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
        />
        <Tooltip
          contentStyle={{
            background: c.tooltipBg,
            border: c.tooltipBorder,
            borderRadius: 8,
            fontSize: 12,
            color: c.tooltipText,
          }}
          formatter={(value: number, name: string) => {
            if (name === "Margem %") return [`${value.toFixed(1)}%`, name];
            if (name === "Volume (kg)") return [formatTon(value), name];
            return [formatBRL(value, { compact: true }), name];
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: c.fontSize }}
          formatter={c.legendText ? (value: string) => <span style={{ color: c.legendText }}>{value}</span> : undefined}
        />
        <Bar
          yAxisId="left"
          dataKey="volumeKg"
          name="Volume (kg)"
          fill={c.warningFill}
          stroke={c.warningStroke}
          radius={[4, 4, 0, 0]}
          isAnimationActive={c.animate}
        />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="rol"
          name="ROL (R$)"
          stroke={c.primary}
          strokeWidth={2.2}
          dot={{ r: 3 }}
          isAnimationActive={c.animate}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="margemPctNum"
          name="Margem %"
          stroke={c.success}
          strokeWidth={2.2}
          dot={{ r: 3 }}
          isAnimationActive={c.animate}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
