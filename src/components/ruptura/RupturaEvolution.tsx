import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle } from "lucide-react";
import { GlassCard } from "@/components/pricing/GlassCard";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatNum, formatPct } from "@/lib/format";
import { monthKeyLabel, monthlySeries, type RupturaMonthPoint } from "@/lib/ruptura/metrics";
import { useRuptura } from "@/store/ruptura";
import type { RupturaView } from "./useRupturaView";

type EvoMetric = "occurrences" | "storesAffected" | "skusAffected" | "rate";

const METRICS: Array<{ id: EvoMetric; label: string }> = [
  { id: "occurrences", label: "Ocorrências" },
  { id: "storesAffected", label: "Lojas afetadas" },
  { id: "skusAffected", label: "SKUs afetados" },
  { id: "rate", label: "Taxa" },
];

function valueOf(p: RupturaMonthPoint, metric: EvoMetric): number | null {
  return metric === "rate" ? p.rate : p[metric];
}

function fmt(metric: EvoMetric, v: number): string {
  return metric === "rate" ? formatPct(v) : formatNum(v);
}

export function RupturaEvolution({ view }: { view: RupturaView }) {
  const { model, period, withRate } = view;
  const filters = useRuptura((s) => s.filters);
  const setPeriod = useRuptura((s) => s.setPeriod);
  const [metric, setMetric] = useState<EvoMetric>("occurrences");
  const [constantStores, setConstantStores] = useState(false);
  const effective: EvoMetric = metric === "rate" && !withRate ? "occurrences" : metric;

  // A linha do tempo mostra a base inteira (com os demais filtros); o período
  // escolhido aparece destacado e pode ser trocado clicando nos meses.
  const full = useMemo(() => ({ from: 0, to: model.months.length - 1 }), [model]);
  const series = useMemo(
    () => monthlySeries(model, filters, constantStores ? period : full, { constantStores }),
    [model, filters, full, period, constantStores],
  );
  const data = series.map((p) => ({ ...p, label: monthKeyLabel(p.key), value: valueOf(p, effective) }));
  const valid = data.filter((d) => d.value !== null);
  const maxP = valid.reduce<typeof data[number] | null>((a, b) => (!a || (b.value ?? 0) > (a.value ?? 0) ? b : a), null);
  const minP = valid.reduce<typeof data[number] | null>((a, b) => (!a || (b.value ?? 0) < (a.value ?? 0) ? b : a), null);
  const shifts = data.filter((d) => d.coverageShift);

  const fullSelected = period.from === 0 && period.to === model.months.length - 1;

  const onPick = (month: number, extend: boolean) => {
    if (extend) setPeriod({ from: Math.min(period.from, month), to: Math.max(period.to, month) });
    else setPeriod({ from: month, to: month });
  };

  return (
    <GlassCard className="flex h-full flex-col gap-3 p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium">Evolução mensal</h2>
          <p className="text-[11px] text-muted-foreground">Clique num mês para analisá-lo; Shift+clique estende o intervalo</p>
        </div>
        <ToggleGroup type="single" value={effective} onValueChange={(v) => v && setMetric(v as EvoMetric)} className="gap-1">
          {METRICS.map((m) => (
            <ToggleGroupItem
              key={m.id}
              value={m.id}
              disabled={m.id === "rate" && !withRate}
              title={m.id === "rate" && !withRate ? "Disponível quando a base trouxer respostas “Não”" : undefined}
              className="h-7 px-2 text-[11px]"
            >
              {m.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </header>

      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 12, right: 12, bottom: 0, left: 0 }}
            onClick={(state, event) => {
              const idx = state?.activeTooltipIndex;
              if (typeof idx === "number" && data[idx]) onPick(data[idx].month, !!(event as unknown as MouseEvent)?.shiftKey);
            }}
            style={{ cursor: "pointer" }}
          >
            <CartesianGrid stroke="hsl(var(--border) / 0.4)" vertical={false} />
            {!constantStores && period.from === period.to && !fullSelected && (
              <ReferenceLine x={monthKeyLabel(model.months[period.from])} stroke="hsl(var(--primary) / 0.16)" strokeWidth={28} />
            )}
            {!constantStores && period.from !== period.to && !fullSelected && (
              <ReferenceArea
                x1={monthKeyLabel(model.months[period.from])}
                x2={monthKeyLabel(model.months[period.to])}
                fill="hsl(var(--primary) / 0.08)"
                stroke="hsl(var(--primary) / 0.25)"
                ifOverflow="extendDomain"
              />
            )}
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              width={56}
              tickFormatter={(v: number) => fmt(effective, v)}
            />
            <Tooltip
              content={({ active, payload }) => {
                const p = active ? (payload?.[0]?.payload as (typeof data)[number] | undefined) : undefined;
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
            <Line
              type="monotone"
              dataKey="value"
              stroke="hsl(var(--destructive))"
              strokeWidth={2}
              connectNulls={false}
              isAnimationActive={false}
              dot={(props: { cx?: number; cy?: number; payload?: (typeof data)[number]; index?: number }) => {
                const { cx, cy, payload, index } = props;
                if (cx === undefined || cy === undefined || !payload) return <g key={index} />;
                const isMax = payload === maxP;
                const isMin = payload === minP;
                const r = isMax || isMin ? 5 : 3;
                const fill = payload.coverageShift ? "hsl(var(--warning))" : isMax ? "hsl(var(--destructive))" : isMin ? "hsl(var(--success))" : "hsl(var(--background))";
                return <circle key={index} cx={cx} cy={cy} r={r} fill={fill} stroke="hsl(var(--destructive))" strokeWidth={1.5} />;
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
        <div className="flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
          {maxP && <span>Maior: <strong className="font-medium text-foreground">{maxP.label}</strong> ({fmt(effective, maxP.value!)})</span>}
          {minP && <span>Menor: <strong className="font-medium text-foreground">{minP.label}</strong> ({fmt(effective, minP.value!)})</span>}
          {shifts.length > 0 && (
            <span className="inline-flex items-center gap-1 text-warning">
              <AlertTriangle className="h-3 w-3" /> cobertura mudou em {shifts.map((s) => s.label).join(", ")}
            </span>
          )}
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2">
          <Switch checked={constantStores} onCheckedChange={setConstantStores} aria-label="Comparar só as mesmas lojas" />
          Mesmas lojas em todo o período
          {constantStores && <span className="tabular-nums">({formatNum(series[0]?.storesSurveyed ?? 0)} lojas)</span>}
        </label>
      </footer>
    </GlassCard>
  );
}
