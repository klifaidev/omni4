// Análise de Preço · Decomposição (efeito preço × mix), Ranking de SKUs e
// Evolução do preço médio. O mesmo desenho na aba e no slide.
import { Info, TrendingDown, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { GlassCard } from "@/components/pricing/GlassCard";
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { PriceDecompositionResult } from "@/lib/analytics";
import { formatBRL, formatPct } from "@/lib/format";
import type { PriceEvolutionData, PriceRankingData } from "./precoData";
import type { TabVisualVariant } from "./visualTheme";

const fmtRsKg = (v: number) => formatBRL(v, { digits: 2 });

function EffectCard({
  title,
  tooltip,
  rsPerKg,
  rsTotal,
  pct,
  totalAbs,
  Icon,
}: {
  title: string;
  tooltip: string;
  rsPerKg: number;
  rsTotal: number;
  pct: number;
  totalAbs: number;
  Icon: typeof TrendingUp;
}) {
  const positive = rsTotal >= 0;
  const share = totalAbs > 0 ? Math.min(1, Math.abs(rsTotal) / totalAbs) : 0;
  return (
    <GlassCard glow={positive ? "green" : "red"} className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${
              positive ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
            }`}
          >
            <Icon className="h-4 w-4" />
          </div>
          <h3 className="text-base font-medium">{title}</h3>
        </div>
        <TooltipProvider>
          <UiTooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Saiba mais">
                <Info className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">{tooltip}</TooltipContent>
          </UiTooltip>
        </TooltipProvider>
      </div>

      <div className="space-y-1">
        <div className={`break-words text-3xl font-light tabular-nums ${positive ? "text-success" : "text-destructive"}`}>
          {positive ? "+" : "−"}
          {fmtRsKg(Math.abs(rsPerKg))}/kg
        </div>
        <div className="text-sm text-muted-foreground">
          Total: {positive ? "+" : "−"}
          {formatBRL(Math.abs(rsTotal), { compact: true })}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
          <span>Participação na variação</span>
          <span className="tabular-nums">{formatPct(Math.abs(pct))}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-secondary/40">
          <div className={`h-full rounded-full ${positive ? "bg-success" : "bg-destructive"}`} style={{ width: `${share * 100}%` }} />
        </div>
      </div>
    </GlassCard>
  );
}

export function PrecoDecompVisual({ data }: { data: PriceDecompositionResult | null }) {
  if (!data) return null;
  const totalAbs = Math.abs(data.efeitoPrecoRs) + Math.abs(data.efeitoMixRs);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <EffectCard
        title="Efeito Preço Puro"
        tooltip="Variação explicada pela mudança de preço real de cada SKU, mantendo o mix constante. Só entram SKUs com volume relevante (1 t ou mais) nos dois meses — com volume quase zero o preço por kg é ruído (ex.: receita negativa de ajuste) e o efeito vai para o mix. É o mesmo critério do Efeito Preço da Bridge PVM."
        rsPerKg={data.efeitoPrecoRsKg}
        rsTotal={data.efeitoPrecoRs}
        pct={data.pctPreco}
        totalAbs={totalAbs}
        Icon={data.efeitoPrecoRs >= 0 ? TrendingUp : TrendingDown}
      />
      <EffectCard
        title="Efeito Mix de SKUs"
        tooltip="Variação explicada pela mudança na participação de volume de cada SKU, entrada/saída de SKUs e ajustes sem volume que afetam o preço médio."
        rsPerKg={data.efeitoMixRsKg}
        rsTotal={data.efeitoMixRs}
        pct={data.pctMix}
        totalAbs={totalAbs}
        Icon={data.efeitoMixRs >= 0 ? TrendingUp : TrendingDown}
      />
    </div>
  );
}

export function PrecoRankingVisual({ data, variant }: { data: PriceRankingData; variant: TabVisualVariant }) {
  const fontSize = variant === "slide" ? 13 : 11;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data.top10} layout="vertical" margin={{ top: 8, right: 60, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
        <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={fontSize} tickFormatter={(v) => formatBRL(Number(v), { compact: true })} />
        <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={fontSize} width={variant === "slide" ? 170 : 140} />
        <RTooltip
          cursor={{ fill: "hsl(var(--secondary) / 0.4)" }}
          contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
          formatter={(value: number) => [formatBRL(value, { compact: true }), "Impacto"]}
          labelFormatter={(_, payload) => (payload?.[0]?.payload as { fullName?: string } | undefined)?.fullName ?? ""}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={variant === "tab"}>
          {data.top10.map((d, i) => (
            <Cell key={i} fill={d.value >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

const EVOL_PALETTE = [
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--accent))",
  "hsl(var(--destructive))",
  "#9b87f5",
];

export function PrecoEvolucaoVisual({ data, variant }: { data: PriceEvolutionData; variant: TabVisualVariant }) {
  const fontSize = variant === "slide" ? 13 : 11;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data.data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
        <XAxis dataKey="period" stroke="hsl(var(--muted-foreground))" fontSize={fontSize} />
        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={fontSize} tickFormatter={(v) => fmtRsKg(Number(v))} />
        <RTooltip
          contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
          formatter={(value: number, name: string) => [`${fmtRsKg(value)}/kg`, name]}
        />
        <Legend wrapperStyle={{ fontSize }} />
        {data.keys.map((k, i) => (
          <Line
            key={k}
            type="monotone"
            dataKey={k}
            stroke={EVOL_PALETTE[i % EVOL_PALETTE.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            isAnimationActive={variant === "tab"}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
