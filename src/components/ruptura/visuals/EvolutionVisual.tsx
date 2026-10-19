// Ruptura · Evolução mensal. O mesmo gráfico na aba (clicável, com o período
// destacado) e no slide (parado, sem destaque de seleção).
import type { ReactNode } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle } from "lucide-react";
import { formatNum, formatPct } from "@/lib/format";
import { monthKeyLabel } from "@/lib/ruptura/metrics";
import type { TabVisualVariant } from "@/components/pricing/tabVisuals/visualTheme";
import { formatEvoValue, type RupturaEvolutionData, type RupturaEvoPoint } from "./data";
import { rupturaPalette } from "./theme";

export function RupturaEvolutionVisual({
  data,
  variant,
  months,
  selection,
  onPick,
  footerRight,
}: {
  data: RupturaEvolutionData;
  variant: TabVisualVariant;
  /** Meses da base (para destacar o período escolhido na aba). */
  months?: string[];
  /** Período escolhido na aba; some quando é a base inteira. */
  selection?: { from: number; to: number } | null;
  onPick?: (month: number, extend: boolean) => void;
  footerRight?: ReactNode;
}) {
  const slide = variant === "slide";
  const palette = rupturaPalette(variant);
  const { metric, points } = data;
  const valid = points.filter((d) => d.value !== null);
  const maxP = valid.reduce<RupturaEvoPoint | null>((a, b) => (!a || (b.value ?? 0) > (a.value ?? 0) ? b : a), null);
  const minP = valid.reduce<RupturaEvoPoint | null>((a, b) => (!a || (b.value ?? 0) < (a.value ?? 0) ? b : a), null);
  const shifts = points.filter((d) => d.coverageShift);
  const showSelection = !!selection && !data.sameStores && !!months;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3">
      <div className={slide ? "min-h-0 flex-1" : "h-[260px] w-full"}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={points}
            margin={{ top: 12, right: 16, bottom: 0, left: 0 }}
            onClick={onPick ? (state, event) => {
              const idx = state?.activeTooltipIndex;
              if (typeof idx === "number" && points[idx]) onPick(points[idx].month, !!(event as unknown as MouseEvent)?.shiftKey);
            } : undefined}
            style={onPick ? { cursor: "pointer" } : undefined}
          >
            <CartesianGrid stroke={palette.grid} vertical={false} />
            {showSelection && selection!.from === selection!.to && (
              <ReferenceLine x={monthKeyLabel(months![selection!.from])} stroke="hsl(var(--primary) / 0.16)" strokeWidth={28} />
            )}
            {showSelection && selection!.from !== selection!.to && (
              <ReferenceArea
                x1={monthKeyLabel(months![selection!.from])}
                x2={monthKeyLabel(months![selection!.to])}
                fill="hsl(var(--primary) / 0.08)"
                stroke="hsl(var(--primary) / 0.25)"
                ifOverflow="extendDomain"
              />
            )}
            <XAxis dataKey="label" tick={{ fontSize: palette.fontSize, fill: palette.axis }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: palette.fontSize, fill: palette.axis }}
              axisLine={false}
              tickLine={false}
              width={slide ? 72 : 56}
              tickFormatter={(v: number) => formatEvoValue(metric, v)}
            />
            {!slide && (
              <Tooltip
                content={({ active, payload }) => {
                  const p = active ? (payload?.[0]?.payload as RupturaEvoPoint | undefined) : undefined;
                  if (!p) return null;
                  return (
                    <div className="rounded-lg border border-border/50 bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
                      <div className="mb-1 font-medium">{p.label}</div>
                      <div className="grid grid-cols-[1fr_auto] gap-x-3 tabular-nums">
                        <span className="text-muted-foreground">Ocorrências</span><span className="text-right">{formatNum(p.occurrences)}</span>
                        <span className="text-muted-foreground">Lojas afetadas</span><span className="text-right">{formatNum(p.storesAffected)}</span>
                        <span className="text-muted-foreground">SKUs afetados</span><span className="text-right">{formatNum(p.skusAffected)}</span>
                        <span className="text-muted-foreground">Taxa</span><span className="text-right">{p.rate === null ? "indisponível" : formatPct(p.rate)}</span>
                        <span className="text-muted-foreground">Lojas com registro</span><span className="text-right">{formatNum(p.storesSurveyed)}</span>
                        <span className="text-muted-foreground">Pesquisas brutas</span><span className="text-right">{formatNum(p.rawEvaluations)}</span>
                      </div>
                      {p.coverageShift && <div className="mt-1.5 flex items-center gap-1 text-warning"><AlertTriangle className="h-3 w-3" /> Cobertura mudou ≥ 15% vs mês anterior</div>}
                    </div>
                  );
                }}
              />
            )}
            <Line
              type="monotone"
              dataKey="value"
              stroke={palette.danger}
              strokeWidth={slide ? 3 : 2}
              connectNulls={false}
              isAnimationActive={false}
              dot={(props: { cx?: number; cy?: number; payload?: RupturaEvoPoint; index?: number }) => {
                const { cx, cy, payload, index } = props;
                if (cx === undefined || cy === undefined || !payload) return <g key={index} />;
                const isMax = payload === maxP;
                const isMin = payload === minP;
                const r = (isMax || isMin ? 5 : 3) * (slide ? 1.2 : 1);
                const fill = payload.coverageShift ? palette.warning : isMax ? palette.danger : isMin ? palette.good : palette.dotFill;
                return <circle key={index} cx={cx} cy={cy} r={r} fill={fill} stroke={palette.danger} strokeWidth={1.5} />;
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-muted-foreground ${slide ? "text-[13px]" : "text-[11px]"}`}>
        <div className="flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
          {maxP && <span>Maior: <strong className="font-medium text-foreground">{maxP.label}</strong> ({formatEvoValue(metric, maxP.value!)})</span>}
          {minP && <span>Menor: <strong className="font-medium text-foreground">{minP.label}</strong> ({formatEvoValue(metric, minP.value!)})</span>}
          {shifts.length > 0 && (
            <span className="inline-flex items-center gap-1 text-warning">
              <AlertTriangle className="h-3 w-3" /> cobertura mudou em {shifts.map((s) => s.label).join(", ")}
            </span>
          )}
        </div>
        {footerRight}
      </div>
    </div>
  );
}
