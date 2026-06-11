import { Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AggRow } from "@/lib/analytics";
import { DataTable } from "./DataTable";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatPct } from "@/lib/format";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface Props {
  rows: AggRow[];
}

export interface AbcClassifiedRow extends AggRow {
  position: number;
  cumulPct: number;
  classe: "A" | "B" | "C";
}

export function classifyAbc(rows: AggRow[]): AbcClassifiedRow[] {
  const sorted = [...rows].filter((r) => r.rol > 0).sort((a, b) => b.rol - a.rol);
  const total = sorted.reduce((s, r) => s + r.rol, 0) || 1;
  let acc = 0;
  return sorted.map((r, i) => {
    acc += r.rol;
    const cumulPct = acc / total;
    const classe: "A" | "B" | "C" = cumulPct <= 0.8 ? "A" : cumulPct <= 0.95 ? "B" : "C";
    return { ...r, position: i + 1, cumulPct, classe };
  });
}

export function AbcPareto({ rows }: Props) {
  const classified = useMemo(() => classifyAbc(rows), [rows]);
  const chartData = useMemo(
    () =>
      classified.slice(0, 60).map((r) => ({
        key: r.key.length > 18 ? r.key.slice(0, 16) + "…" : r.key,
        rol: r.rol,
        cumul: r.cumulPct * 100,
      })),
    [classified],
  );

  if (classified.length === 0) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Sem dados.</div>;
  }

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={chartData} margin={{ top: 16, right: 32, bottom: 56, left: 8 }}>
          <CartesianGrid stroke="hsl(var(--border) / 0.4)" strokeDasharray="3 3" />
          <XAxis dataKey="key" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} angle={-35} textAnchor="end" interval={0} height={70} />
          <YAxis yAxisId="left" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={(v) => formatBRL(Number(v), { compact: true })} />
          <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const rol = payload.find((p) => p.dataKey === "rol")?.value as number;
              const cumul = payload.find((p) => p.dataKey === "cumul")?.value as number;
              return (
                <div className="rounded-lg border border-border/60 bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
                  <div className="mb-1 font-semibold">{label}</div>
                  <div className="text-muted-foreground">ROL: <span className="text-foreground tabular-nums">{formatBRL(rol, { compact: true })}</span></div>
                  <div className="text-muted-foreground">Acumulado: <span className="text-foreground tabular-nums">{cumul?.toFixed(1)}%</span></div>
                </div>
              );
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <ReferenceLine yAxisId="right" y={80} stroke="hsl(var(--success))" strokeDasharray="4 4" label={{ value: "80% (A)", fill: "hsl(var(--success))", fontSize: 10, position: "right" }} />
          <ReferenceLine yAxisId="right" y={95} stroke="hsl(var(--warning))" strokeDasharray="4 4" label={{ value: "95% (B)", fill: "hsl(var(--warning))", fontSize: 10, position: "right" }} />
          <Bar yAxisId="left" dataKey="rol" name="ROL" fill="hsl(var(--primary))" fillOpacity={0.7} />
          <Line yAxisId="right" type="monotone" dataKey="cumul" name="ROL Acumulado %" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>

      <DataTable
        rows={classified as unknown as Record<string, unknown>[]}
        searchable
        searchKeys={["key"]}
        columns={[
          { key: "position", label: "#", align: "right", format: (v) => String(v) },
          { key: "key", label: "SKU", align: "left", format: (v) => <span className="truncate font-medium">{String(v)}</span> },
          { key: "rol", label: "ROL", align: "right", format: (v) => formatBRL(Number(v), { compact: true }) },
          { key: "cumulPct", label: "ROL Acum.%", align: "right", format: (v) => formatPct(Number(v)) },
          {
            key: "classe",
            label: "Classe",
            align: "right",
            format: (v) => {
              const c = String(v) as "A" | "B" | "C";
              return (
                <Badge
                  className={cn(
                    "px-2 text-[10px] font-bold",
                    c === "A" && "bg-success/15 text-success hover:bg-success/20 border border-success/30",
                    c === "B" && "bg-warning/15 text-warning hover:bg-warning/20 border border-warning/30",
                    c === "C" && "bg-destructive/15 text-destructive hover:bg-destructive/20 border border-destructive/30",
                  )}
                  variant="secondary"
                >
                  {c}
                </Badge>
              );
            },
          },
          { key: "margemPct", label: "Margem %", align: "right", format: (v) => formatPct(Number(v)) },
        ]}
      />
    </div>
  );
}
