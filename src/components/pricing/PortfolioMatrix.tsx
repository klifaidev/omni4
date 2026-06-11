import { CartesianGrid, ReferenceLine, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis, ResponsiveContainer } from "recharts";
import type { AggRow } from "@/lib/analytics";
import { formatBRL, formatPct, formatTon } from "@/lib/format";
import { useMemo } from "react";

interface Props {
  rows: AggRow[];
  metricLabel: string;
}

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

interface Point {
  x: number; y: number; z: number; key: string; rol: number; margemPct: number; volumeKg: number;
}

export function PortfolioMatrix({ rows, metricLabel }: Props) {
  const { points, medX, medY, useLog } = useMemo(() => {
    const pool = rows.filter((r) => r.volumeKg > 0 && r.rol > 0 && isFinite(r.margemPct));
    const vols = pool.map((r) => r.volumeKg);
    const minV = Math.min(...vols, 1);
    const maxV = Math.max(...vols, 1);
    const useLog = vols.length > 0 && maxV / Math.max(minV, 1) > 100;
    const points: Point[] = pool.map((r) => ({
      x: r.volumeKg,
      y: r.margemPct * 100,
      z: r.rol,
      key: r.key,
      rol: r.rol,
      margemPct: r.margemPct,
      volumeKg: r.volumeKg,
    }));
    return {
      points,
      medX: median(vols),
      medY: median(pool.map((r) => r.margemPct * 100)),
      useLog,
    };
  }, [rows]);

  if (points.length === 0) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Sem dados para a matriz.</div>;
  }

  const maxRol = Math.max(...points.map((p) => p.z));
  // ZAxis range gives us area; sqrt-scale handled by recharts via range pixels² is approximate. Use ~ [36, 1024] (=6²..32²)
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={420}>
        <ScatterChart margin={{ top: 28, right: 28, bottom: 36, left: 16 }}>
          <CartesianGrid stroke="hsl(var(--border) / 0.4)" strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="x"
            name="Volume"
            scale={useLog ? "log" : "linear"}
            domain={useLog ? ["auto", "auto"] : [0, "auto"]}
            allowDataOverflow={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            tickFormatter={(v) => formatTon(Number(v))}
            label={{ value: "Volume (kg)", position: "insideBottom", offset: -16, fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="Margem %"
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
            label={{ value: `${metricLabel} %`, angle: -90, position: "insideLeft", fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          />
          <ZAxis type="number" dataKey="z" range={[36, 1024]} domain={[0, maxRol]} />
          <ReferenceLine x={medX} stroke="hsl(var(--primary) / 0.5)" strokeDasharray="4 4" />
          <ReferenceLine y={medY} stroke="hsl(var(--primary) / 0.5)" strokeDasharray="4 4" />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as Point;
              return (
                <div className="rounded-lg border border-border/60 bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
                  <div className="mb-1 max-w-[260px] truncate font-semibold">{p.key}</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-muted-foreground">
                    <span>ROL</span><span className="text-right tabular-nums text-foreground">{formatBRL(p.rol, { compact: true })}</span>
                    <span>{metricLabel} %</span><span className="text-right tabular-nums text-foreground">{formatPct(p.margemPct)}</span>
                    <span>Volume</span><span className="text-right tabular-nums text-foreground">{formatTon(p.volumeKg)}</span>
                  </div>
                </div>
              );
            }}
          />
          <Scatter data={points} fill="hsl(var(--primary))" fillOpacity={0.55} stroke="hsl(var(--primary))" />
        </ScatterChart>
      </ResponsiveContainer>

      {/* Quadrant labels overlay */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute right-3 top-3 rounded-md border border-success/40 bg-success/10 px-2 py-1 text-[10px] font-semibold text-success">
          ⭐ Estrelas
        </div>
        <div className="absolute right-3 bottom-12 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-[10px] font-semibold text-warning">
          🐄 Vacas
          <div className="text-[9px] font-normal opacity-80">Revisar pricing</div>
        </div>
        <div className="absolute left-16 top-3 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">
          💡 Oportunidades
          <div className="text-[9px] font-normal opacity-80">Potencial de escala</div>
        </div>
        <div className="absolute left-16 bottom-12 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-[10px] font-semibold text-destructive">
          🍍 Abacaxis
          <div className="text-[9px] font-normal opacity-80">Avaliar descontinuação</div>
        </div>
      </div>
    </div>
  );
}

export function classifyQuadrant(volumeKg: number, margemPct: number, medVol: number, medMargem: number): "estrela" | "vaca" | "oportunidade" | "abacaxi" {
  const right = volumeKg >= medVol;
  const top = margemPct >= medMargem;
  if (right && top) return "estrela";
  if (right && !top) return "vaca";
  if (!right && top) return "oportunidade";
  return "abacaxi";
}

export function portfolioMedians(rows: AggRow[]) {
  const pool = rows.filter((r) => r.volumeKg > 0 && r.rol > 0 && isFinite(r.margemPct));
  return {
    medVol: median(pool.map((r) => r.volumeKg)),
    medMargem: median(pool.map((r) => r.margemPct)),
  };
}
