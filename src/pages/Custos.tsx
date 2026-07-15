import { useMemo } from "react";
import { Area, Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { KpiCard } from "@/components/pricing/KpiCard";
import { DataTable } from "@/components/pricing/DataTable";
import { EmptyState } from "@/components/pricing/EmptyState";
import { SendToSlideHover } from "@/components/pricing/SendToSlideHover";
import { applyFilters, computeCostEvolution } from "@/lib/analytics";
import { formatBRL, formatPct, formatTon } from "@/lib/format";
import { usePricing } from "@/store/pricing";
import { usePageTitle } from "@/hooks/use-page-title";

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

export default function Custos() {
  usePageTitle("Custos");
  const rows = usePricing((s) => s.rows);
  const filters = usePricing((s) => s.filters);
  const selected = usePricing((s) => s.selectedPeriods);

  const filtered = useMemo(() => applyFilters(rows, filters, selected), [rows, filters, selected]);
  const evolution = useMemo(() => computeCostEvolution(filtered), [filtered]);

  // Composition of variable cost per period (MP, Embalagem, MOD, CIF)
  const composition = useMemo(() => {
    const map = new Map<string, {
      periodo: string; label: string;
      materiaPrima: number; embalagem: number; mod: number; cif: number;
      rol: number;
      hasMP: boolean; hasEmb: boolean; hasMod: boolean; hasCif: boolean;
    }>();
    for (const r of filtered) {
      const cur = map.get(r.periodo) ?? {
        periodo: r.periodo,
        label: `${String(r.mes).padStart(2, "0")}/${String(r.ano).slice(-2)}`,
        materiaPrima: 0, embalagem: 0, mod: 0, cif: 0, rol: 0,
        hasMP: false, hasEmb: false, hasMod: false, hasCif: false,
      };
      cur.rol += r.rol;
      if (r.materiaPrima != null) { cur.materiaPrima += r.materiaPrima; cur.hasMP = true; }
      if (r.embalagem != null) { cur.embalagem += r.embalagem; cur.hasEmb = true; }
      if (r.mod != null) { cur.mod += r.mod; cur.hasMod = true; }
      if (r.cif != null) { cur.cif += r.cif; cur.hasCif = true; }
      map.set(r.periodo, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.periodo.localeCompare(b.periodo));
  }, [filtered]);

  const compTotals = useMemo(() => {
    return composition.reduce(
      (acc, r) => {
        acc.materiaPrima += r.materiaPrima;
        acc.embalagem += r.embalagem;
        acc.mod += r.mod;
        acc.cif += r.cif;
        acc.rol += r.rol;
        acc.hasMP = acc.hasMP || r.hasMP;
        acc.hasEmb = acc.hasEmb || r.hasEmb;
        acc.hasMod = acc.hasMod || r.hasMod;
        acc.hasCif = acc.hasCif || r.hasCif;
        return acc;
      },
      { materiaPrima: 0, embalagem: 0, mod: 0, cif: 0, rol: 0, hasMP: false, hasEmb: false, hasMod: false, hasCif: false },
    );
  }, [composition]);

  const showComposition =
    (compTotals.hasMP && compTotals.materiaPrima !== 0) ||
    (compTotals.hasEmb && compTotals.embalagem !== 0) ||
    (compTotals.hasMod && compTotals.mod !== 0) ||
    (compTotals.hasCif && compTotals.cif !== 0);

  const totals = useMemo(() => {
    return evolution.reduce(
      (acc, row) => {
        acc.rol += row.rol;
        acc.volumeKg += row.volumeKg;
        acc.custoVariavel += row.custoVariavel;
        acc.custoFixo += row.custoFixo;
        return acc;
      },
      { rol: 0, volumeKg: 0, custoVariavel: 0, custoFixo: 0 },
    );
  }, [evolution]);

  const custoTotal = totals.custoVariavel + totals.custoFixo;
  const custoVariavelPct = totals.rol > 0 ? totals.custoVariavel / totals.rol : 0;
  const custoFixoPct = totals.rol > 0 ? totals.custoFixo / totals.rol : 0;
  const custoTotalPorKg = totals.volumeKg > 0 ? custoTotal / totals.volumeKg : 0;
  const mpPctRol = totals.rol > 0 ? compTotals.materiaPrima / totals.rol : 0;
  const embPctRol = totals.rol > 0 ? compTotals.embalagem / totals.rol : 0;

  if (rows.length === 0) {
    return (
      <>
        <Topbar title="Custos" />
        <div className="px-8 py-6"><EmptyState
          title="Estrutura de custos"
          message="Carregue dados para analisar CPV, frete, comissões e demais componentes do custo variável."
          actionLabel="Carregar dados"
          actionTo="/upload"
        /></div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Custos" subtitle="Evolutivo de custo variável e fixo com leitura analítica por ROL e por Kg" />
      <div className="space-y-6 px-8 py-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Custo Variável" value={formatBRL(totals.custoVariavel, { compact: true })} subValue={formatPct(custoVariavelPct)} accent="amber" />
          <KpiCard label="Custo Fixo" value={formatBRL(totals.custoFixo, { compact: true })} subValue={formatPct(custoFixoPct)} accent="violet" />
          <KpiCard label="Custo Total" value={formatBRL(custoTotal, { compact: true })} subValue={formatBRL(custoTotalPorKg, { digits: 2 }) + "/kg"} accent="blue" glow="blue" />
          <KpiCard label="Volume filtrado" value={formatTon(totals.volumeKg)} subValue={`${evolution.length} período(s)`} accent="green" />
          {compTotals.hasMP && compTotals.materiaPrima !== 0 && (
            <KpiCard label="Matéria Prima / ROL" value={formatPct(mpPctRol)} subValue={formatBRL(compTotals.materiaPrima, { compact: true })} accent="blue" />
          )}
          {compTotals.hasEmb && compTotals.embalagem !== 0 && (
            <KpiCard label="Embalagem / ROL" value={formatPct(embPctRol)} subValue={formatBRL(compTotals.embalagem, { compact: true })} accent="amber" />
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <SendToSlideHover
            payload={{
              source: { page: "Custos", visualization: "Eficiência por Kg" },
              target: { blockKind: "omni_custo_evolucao", blockLabel: "Evolução de Custos" },
              config: { viewMode: "kg", filters, selectedPeriods: selected },
            }}
          >
          <GlassCard>
            <header className="mb-4">
              <h2 className="text-lg font-medium">Eficiência por Kg</h2>
              <p className="text-xs text-muted-foreground">Leitura mensal do custo unitário para separar efeito de diluição e pressão estrutural.</p>
            </header>
            <ChartContainer config={chartConfig} className="h-[320px] w-full">
              <ComposedChart data={evolution} margin={{ left: 8, right: 8, top: 12, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => formatBRL(Number(v), { digits: 2 })} width={96} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => [formatBRL(Number(value), { digits: 2 }), chartConfig[String(name) as keyof typeof chartConfig]?.label ?? String(name)]} />} />
                <Legend />
                <Line type="monotone" dataKey="custoVariavelPorKg" stroke="var(--color-custoVariavel)" strokeWidth={2.25} dot={false} name="custoVariavel" />
                <Line type="monotone" dataKey="custoFixoPorKg" stroke="var(--color-custoFixo)" strokeWidth={2.25} dot={false} name="custoFixo" />
                <Line type="monotone" dataKey="custoTotalPorKg" stroke="var(--color-custoTotalPorKg)" strokeWidth={2.75} dot={false} name="custoTotalPorKg" />
              </ComposedChart>
            </ChartContainer>
          </GlassCard>
          </SendToSlideHover>

          <SendToSlideHover
            payload={{
              source: { page: "Custos", visualization: "Pressão de custo sobre a receita" },
              target: { blockKind: "omni_custo_pressao", blockLabel: "Pressão de Custo sobre Receita" },
              config: { showCustoVariavel: true, showCustoFixo: true, filters, selectedPeriods: selected },
            }}
          >
          <GlassCard>
            <header className="mb-4">
              <h2 className="text-lg font-medium">Pressão de custo sobre a receita</h2>
              <p className="text-xs text-muted-foreground">Percentual do ROL consumido por custo variável e fixo em cada período.</p>
            </header>
            <ChartContainer config={chartConfig} className="h-[320px] w-full">
              <ComposedChart data={evolution} margin={{ left: 8, right: 8, top: 12, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => formatPct(Number(v), 0)} width={72} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => [formatPct(Number(value)), chartConfig[String(name) as keyof typeof chartConfig]?.label ?? String(name)]} />} />
                <Legend />
                <ReferenceLine y={0} stroke="hsl(var(--border))" />
                <Area type="monotone" dataKey="custoVariavelPctRol" stackId="pct" stroke="var(--color-custoVariavelPctRol)" fill="var(--color-custoVariavelPctRol)" fillOpacity={0.35} name="custoVariavelPctRol" />
                <Area type="monotone" dataKey="custoFixoPctRol" stackId="pct" stroke="var(--color-custoFixoPctRol)" fill="var(--color-custoFixoPctRol)" fillOpacity={0.25} name="custoFixoPctRol" />
              </ComposedChart>
            </ChartContainer>
          </GlassCard>
          </SendToSlideHover>
        </div>

        {showComposition && (
          <SendToSlideHover
            payload={{
              source: { page: "Custos", visualization: "Composição do custo variável" },
              target: { blockKind: "omni_custo_composicao", blockLabel: "Composição de Custos" },
              config: { viewMode: "abs", filters, selectedPeriods: selected },
            }}
          >
          <GlassCard>
            <header className="mb-4">
              <h2 className="text-lg font-medium">Composição do custo variável</h2>
              <p className="text-xs text-muted-foreground">Decomposição mensal por componente: Matéria Prima, Embalagem, MOD e CIF.</p>
            </header>
            <ChartContainer config={chartConfig} className="h-[340px] w-full">
              <ComposedChart data={composition} margin={{ left: 8, right: 8, top: 12, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => formatBRL(Number(v), { compact: true })} width={88} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => [formatBRL(Number(value), { compact: true }), chartConfig[String(name) as keyof typeof chartConfig]?.label ?? String(name)]} />} />
                <Legend />
                {compTotals.hasMP && <Bar dataKey="materiaPrima" stackId="comp" fill="var(--color-materiaPrima)" name="materiaPrima" radius={[0, 0, 0, 0]} />}
                {compTotals.hasEmb && <Bar dataKey="embalagem" stackId="comp" fill="var(--color-embalagem)" name="embalagem" radius={[0, 0, 0, 0]} />}
                {compTotals.hasMod && <Bar dataKey="mod" stackId="comp" fill="var(--color-mod)" name="mod" radius={[0, 0, 0, 0]} />}
                {compTotals.hasCif && <Bar dataKey="cif" stackId="comp" fill="var(--color-cif)" name="cif" radius={[4, 4, 0, 0]} />}
              </ComposedChart>
            </ChartContainer>

            <div className="mt-6">
              <DataTable
                rows={composition.map((c) => ({
                  label: c.label,
                  mpPctRol: c.rol > 0 ? c.materiaPrima / c.rol : 0,
                  embPctRol: c.rol > 0 ? c.embalagem / c.rol : 0,
                  modPctRol: c.rol > 0 ? c.mod / c.rol : 0,
                  cifPctRol: c.rol > 0 ? c.cif / c.rol : 0,
                })) as unknown as Record<string, unknown>[]}
                columns={[
                  { key: "label", label: "Período", align: "left", format: (v) => <span className="font-medium">{String(v)}</span> },
                  ...(compTotals.hasMP ? [{ key: "mpPctRol", label: "MP / ROL", align: "right" as const, format: (v: unknown) => formatPct(Number(v)) }] : []),
                  ...(compTotals.hasEmb ? [{ key: "embPctRol", label: "Embalagem / ROL", align: "right" as const, format: (v: unknown) => formatPct(Number(v)) }] : []),
                  ...(compTotals.hasMod ? [{ key: "modPctRol", label: "MOD / ROL", align: "right" as const, format: (v: unknown) => formatPct(Number(v)) }] : []),
                  ...(compTotals.hasCif ? [{ key: "cifPctRol", label: "CIF / ROL", align: "right" as const, format: (v: unknown) => formatPct(Number(v)) }] : []),
                ]}
              />
            </div>
          </GlassCard>
          </SendToSlideHover>
        )}

        <SendToSlideHover
          payload={{
            source: { page: "Custos", visualization: "Detalhe mensal de custos" },
            target: { blockKind: "table", blockLabel: "Tabela" },
            config: { table: "detalhe_mensal_custos", filters, selectedPeriods: selected },
          }}
        >
        <GlassCard>
          <header className="mb-4">
            <h2 className="text-lg font-medium">Detalhe mensal de custos</h2>
            <p className="text-xs text-muted-foreground">Tabela de auditoria para validar composição, peso sobre a receita e custo unitário.</p>
          </header>
          <DataTable
            rows={evolution as unknown as Record<string, unknown>[]}
            columns={[
              { key: "label", label: "Período", align: "left", format: (v) => <span className="font-medium">{String(v)}</span> },
              { key: "custoVariavel", label: "Custo Var.", align: "right", format: (v) => formatBRL(Number(v), { compact: true }) },
              { key: "custoFixo", label: "Custo Fixo", align: "right", format: (v) => formatBRL(Number(v), { compact: true }) },
              { key: "custoTotal", label: "Custo Total", align: "right", format: (v) => formatBRL(Number(v), { compact: true }) },
              { key: "custoVariavelPctRol", label: "CV / ROL", align: "right", format: (v) => formatPct(Number(v)) },
              { key: "custoFixoPctRol", label: "CF / ROL", align: "right", format: (v) => formatPct(Number(v)) },
              { key: "custoTotalPorKg", label: "Custo Total / Kg", align: "right", format: (v) => formatBRL(Number(v), { digits: 2 }) },
            ]}
          />
        </GlassCard>
        </SendToSlideHover>
      </div>
    </>
  );
}
