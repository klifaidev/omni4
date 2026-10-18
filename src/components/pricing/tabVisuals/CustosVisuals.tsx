// Custos · Eficiência por Kg, Pressão de custo sobre a receita e Composição do
// custo variável. O mesmo desenho na aba e no slide.
import { Area, Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { CostEvolutionRow } from "@/lib/analytics";
import { formatBRL, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CompositionRow, CompositionTotals } from "./custosData";
import type { TabVisualVariant } from "./visualTheme";

const chartConfig = {
  custoVariavel: { label: "Custo Variável", color: "hsl(var(--warning))" },
  custoFixo: { label: "Custo Fixo", color: "hsl(var(--accent))" },
  custoTotal: { label: "Custo Total", color: "hsl(var(--primary))" },
  custoVariavelPctRol: { label: "CV / ROL", color: "hsl(var(--warning))" },
  custoFixoPctRol: { label: "CF / ROL", color: "hsl(var(--accent))" },
  custoTotalPorKg: { label: "Custo Total / Kg", color: "hsl(var(--primary))" },
  custoVariavelPorKg: { label: "Custo Variável / Kg", color: "hsl(var(--warning))" },
  custoFixoPorKg: { label: "Custo Fixo / Kg", color: "hsl(var(--accent))" },
  materiaPrima: { label: "Matéria Prima", color: "hsl(var(--primary))" },
  embalagem: { label: "Embalagem", color: "hsl(var(--warning))" },
  mod: { label: "MOD", color: "hsl(var(--accent))" },
  cif: { label: "CIF", color: "hsl(var(--success))" },
} as const;

type ConfigKey = keyof typeof chartConfig;
const labelOf = (name: unknown) => chartConfig[String(name) as ConfigKey]?.label ?? String(name);

/** Na aba a altura vem de fora; no slide o gráfico ocupa o bloco. */
function containerClass(variant: TabVisualVariant) {
  return cn("h-full w-full", variant === "slide" ? "aspect-auto text-sm" : "aspect-auto");
}

export function CustoKgVisual({ data, variant }: { data: CostEvolutionRow[]; variant: TabVisualVariant }) {
  const animate = variant === "tab";
  return (
    <ChartContainer config={chartConfig} className={containerClass(variant)}>
      <ComposedChart data={data} margin={{ left: 8, right: 8, top: 12, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => formatBRL(Number(v), { digits: 2 })} width={96} />
        <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => [formatBRL(Number(value), { digits: 2 }), labelOf(name)]} />} />
        <Legend formatter={(value) => labelOf(value)} />
        <Line type="monotone" dataKey="custoVariavelPorKg" stroke="var(--color-custoVariavel)" strokeWidth={2.25} dot={false} name="custoVariavel" isAnimationActive={animate} />
        <Line type="monotone" dataKey="custoFixoPorKg" stroke="var(--color-custoFixo)" strokeWidth={2.25} dot={false} name="custoFixo" isAnimationActive={animate} />
        <Line type="monotone" dataKey="custoTotalPorKg" stroke="var(--color-custoTotalPorKg)" strokeWidth={2.75} dot={false} name="custoTotalPorKg" isAnimationActive={animate} />
      </ComposedChart>
    </ChartContainer>
  );
}

export function CustoPressaoVisual({ data, variant }: { data: CostEvolutionRow[]; variant: TabVisualVariant }) {
  const animate = variant === "tab";
  return (
    <ChartContainer config={chartConfig} className={containerClass(variant)}>
      <ComposedChart data={data} margin={{ left: 8, right: 8, top: 12, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => formatPct(Number(v), 0)} width={72} />
        <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => [formatPct(Number(value)), labelOf(name)]} />} />
        <Legend formatter={(value) => labelOf(value)} />
        <ReferenceLine y={0} stroke="hsl(var(--border))" />
        <Area type="monotone" dataKey="custoVariavelPctRol" stackId="pct" stroke="var(--color-custoVariavelPctRol)" fill="var(--color-custoVariavelPctRol)" fillOpacity={0.35} name="custoVariavelPctRol" isAnimationActive={animate} />
        <Area type="monotone" dataKey="custoFixoPctRol" stackId="pct" stroke="var(--color-custoFixoPctRol)" fill="var(--color-custoFixoPctRol)" fillOpacity={0.25} name="custoFixoPctRol" isAnimationActive={animate} />
      </ComposedChart>
    </ChartContainer>
  );
}

export interface CustoComposicaoData {
  composition: CompositionRow[];
  totals: CompositionTotals;
}

export function CustoComposicaoVisual({ data, variant }: { data: CustoComposicaoData; variant: TabVisualVariant }) {
  const { totals } = data;
  const animate = variant === "tab";
  return (
    <ChartContainer config={chartConfig} className={containerClass(variant)}>
      <ComposedChart data={data.composition} margin={{ left: 8, right: 8, top: 12, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => formatBRL(Number(v), { compact: true })} width={88} />
        <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => [formatBRL(Number(value), { compact: true }), labelOf(name)]} />} />
        <Legend formatter={(value) => labelOf(value)} />
        {totals.hasMP && <Bar dataKey="materiaPrima" stackId="comp" fill="var(--color-materiaPrima)" name="materiaPrima" radius={[0, 0, 0, 0]} isAnimationActive={animate} />}
        {totals.hasEmb && <Bar dataKey="embalagem" stackId="comp" fill="var(--color-embalagem)" name="embalagem" radius={[0, 0, 0, 0]} isAnimationActive={animate} />}
        {totals.hasMod && <Bar dataKey="mod" stackId="comp" fill="var(--color-mod)" name="mod" radius={[0, 0, 0, 0]} isAnimationActive={animate} />}
        {totals.hasCif && <Bar dataKey="cif" stackId="comp" fill="var(--color-cif)" name="cif" radius={[4, 4, 0, 0]} isAnimationActive={animate} />}
      </ComposedChart>
    </ChartContainer>
  );
}
