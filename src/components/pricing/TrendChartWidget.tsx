import { useMemo } from "react";
import { GlassCard } from "@/components/pricing/GlassCard";
import { usePricing } from "@/store/pricing";
import { measureOf } from "@/lib/analytics";
import { monthLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight, Minus, TrendingUp } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function TrendChartWidget() {
  const rows = usePricing((s) => s.rows);
  const metric = usePricing((s) => s.metric);

  const data = useMemo(() => {
    if (rows.length === 0) return [];
    const map = new Map<string, { periodo: string; ano: number; mes: number; rol: number; margem: number }>();
    for (const r of rows) {
      const cur = map.get(r.periodo) ?? { periodo: r.periodo, ano: r.ano, mes: r.mes, rol: 0, margem: 0 };
      cur.rol += r.rol;
      cur.margem += measureOf(r, metric);
      map.set(r.periodo, cur);
    }
    const all = [...map.values()].sort((a, b) =>
      a.ano !== b.ano ? a.ano - b.ano : a.mes - b.mes,
    );
    return all.slice(-3).map((p) => ({
      label: monthLabel(p.mes, p.ano),
      pct: p.rol > 0 ? (p.margem / p.rol) * 100 : 0,
    }));
  }, [rows, metric]);

  if (rows.length === 0) {
    return (
      <GlassCard>
        <header className="mb-2 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-medium">Tendência recente</h3>
        </header>
        <p className="text-xs text-muted-foreground">Sem dados para exibir.</p>
      </GlassCard>
    );
  }

  const last = data[data.length - 1]?.pct ?? 0;
  const prev = data[data.length - 2]?.pct ?? 0;
  const delta = last - prev;
  const dir = delta > 0.05 ? "up" : delta < -0.05 ? "down" : "flat";

  return (
    <GlassCard>
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-medium">Margem % — últimos 3 meses</h3>
        </div>
        {data.length >= 2 && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
              dir === "up" && "bg-success/15 text-success",
              dir === "down" && "bg-destructive/15 text-destructive",
              dir === "flat" && "bg-muted text-muted-foreground",
            )}
          >
            {dir === "up" && <ArrowUpRight className="h-3 w-3" />}
            {dir === "down" && <ArrowDownRight className="h-3 w-3" />}
            {dir === "flat" && <Minus className="h-3 w-3" />}
            {`${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(delta).toFixed(1)} pp`}
          </span>
        )}
      </header>
      <div style={{ height: 120 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis hide domain={["auto", "auto"]} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(v: number) => [`${v.toFixed(1)}%`, "Margem %"]}
            />
            <Line
              type="monotone"
              dataKey="pct"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={{ r: 3, fill: "hsl(var(--primary))" }}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>
  );
}
