import { useMemo } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingUp, FileSpreadsheet, Target, Activity, type LucideIcon } from "lucide-react";
import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { EmptyState } from "@/components/pricing/EmptyState";
import { SendToSlideHover } from "@/components/pricing/SendToSlideHover";
import { Badge } from "@/components/ui/badge";
import { usePageTitle } from "@/hooks/use-page-title";
import { usePricing } from "@/store/pricing";
import { useRolling, getRollingCyclesInfo, getRollingMonthsInfo } from "@/store/rolling";
import { rollingRowsAsPricing } from "@/lib/rollingAdapter";
import { applyFilters } from "@/lib/analytics";
import { formatBRL, formatNum, formatPct, monthLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PricingRow } from "@/lib/types";

function sum(rows: PricingRow[]) {
  let rol = 0;
  let volumeKg = 0;
  let cv = 0;
  let frete = 0;
  let comissao = 0;
  let cm = 0;
  for (const row of rows) {
    rol += row.rol;
    volumeKg += row.volumeKg;
    cv += row.custoVariavel;
    frete += row.frete;
    comissao += row.comissao;
    cm += row.contribMarginal;
  }
  return {
    rol,
    volumeKg,
    cv,
    frete,
    comissao,
    cm,
    cmPct: rol ? cm / rol : 0,
    precoMedio: volumeKg ? rol / volumeKg : 0,
    cmKg: volumeKg ? cm / volumeKg : 0,
  };
}

const DRE_LINES = [
  { id: "volume", label: "Volume (Tons)", value: (rows: PricingRow[]) => sum(rows).volumeKg / 1000, format: "number" },
  { id: "rol", label: "Receita Liquida", value: (rows: PricingRow[]) => sum(rows).rol, format: "currency" },
  { id: "pm", label: "ROL R$/Kg", value: (rows: PricingRow[]) => sum(rows).precoMedio, format: "currency2" },
  { id: "cv", label: "Custo Variavel", value: (rows: PricingRow[]) => -sum(rows).cv, format: "currency" },
  { id: "cvkg", label: "Custo Variavel R$/Kg", value: (rows: PricingRow[]) => {
    const s = sum(rows);
    return s.volumeKg ? -(s.cv / s.volumeKg) : 0;
  }, format: "currency2" },
  { id: "frete", label: "Frete", value: (rows: PricingRow[]) => -sum(rows).frete, format: "currency" },
  { id: "fretekg", label: "Frete R$/Kg", value: (rows: PricingRow[]) => {
    const s = sum(rows);
    return s.volumeKg ? -(s.frete / s.volumeKg) : 0;
  }, format: "currency2" },
  { id: "comissao", label: "Comissao", value: (rows: PricingRow[]) => -sum(rows).comissao, format: "currency" },
  { id: "comissaopct", label: "Comissao %/ROL", value: (rows: PricingRow[]) => {
    const s = sum(rows);
    return s.rol ? -(s.comissao / s.rol) : 0;
  }, format: "percent" },
  { id: "cm", label: "Contrib. Marginal", value: (rows: PricingRow[]) => sum(rows).cm, format: "currency" },
  { id: "cmpct", label: "Contrib. Marginal %/ROL", value: (rows: PricingRow[]) => sum(rows).cmPct, format: "percent" },
  { id: "cmkg", label: "Contrib. Marginal R$/Kg", value: (rows: PricingRow[]) => sum(rows).cmKg, format: "currency2" },
] as const;

function fmt(value: number, format: string) {
  if (format === "currency") return formatBRL(value, { compact: true, digits: 0 });
  if (format === "currency2") return formatBRL(value, { digits: 2 });
  if (format === "percent") return formatPct(value, 1);
  return formatNum(value, 0);
}

export default function Rolling() {
  usePageTitle("Rolling");
  const rollingRows = useRolling((s) => s.rows);
  const filters = usePricing((s) => s.filters);
  const selectedPeriods = usePricing((s) => s.selectedPeriods);

  const cycles = useMemo(() => getRollingCyclesInfo(rollingRows), [rollingRows]);
  const months = useMemo(() => getRollingMonthsInfo(rollingRows), [rollingRows]);
  const rows = useMemo(
    () => applyFilters(rollingRowsAsPricing(rollingRows), filters, selectedPeriods),
    [rollingRows, filters, selectedPeriods],
  );
  const totals = useMemo(() => sum(rows), [rows]);

  const monthly = useMemo(() => {
    const map = new Map<string, PricingRow[]>();
    for (const row of rows) {
      const list = map.get(row.periodo) ?? [];
      list.push(row);
      map.set(row.periodo, list);
    }
    return Array.from(map.entries())
      .map(([periodo, list]) => {
        const s = sum(list);
        const first = list[0];
        return {
          periodo,
          label: monthLabel(first.mes, first.ano),
          rank: first.ano * 12 + first.mes,
          rol: s.rol,
          volume: s.volumeKg / 1000,
          cm: s.cm,
          cmPct: s.cmPct,
          precoMedio: s.precoMedio,
          rows: list,
        };
      })
      .sort((a, b) => a.rank - b.rank);
  }, [rows]);

  if (rollingRows.length === 0) {
    return (
      <>
        <Topbar title="Rolling" subtitle="DRE e evolutivo da revisao Rolling" />
        <div className="px-8 py-6">
          <EmptyState
            title="Sem dados de Rolling"
            message="Carregue a planilha Rolling na tela Upload para acompanhar DRE, volume, receita e margem do ciclo vigente."
            actionLabel="Ir para Upload"
            actionHref="/upload"
          />
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Rolling" subtitle="DRE, evolutivo e leitura executiva do Rolling" />
      <div className="space-y-6 px-8 py-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{cycles.length} ciclo(s)</Badge>
          <Badge variant="secondary">{months.length} mes(es)</Badge>
          <Badge variant="secondary">{rows.length.toLocaleString("pt-BR")} linhas filtradas</Badge>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
          <MetricCard icon={FileSpreadsheet} label="Receita Liquida" value={formatBRL(totals.rol)} sub={`${formatBRL(totals.precoMedio, { digits: 2 })}/kg`} />
          <MetricCard icon={Activity} label="Volume (Tons)" value={formatNum(totals.volumeKg / 1000, 1)} sub="Rolling filtrado" />
          <MetricCard icon={TrendingUp} label="Contrib. Marginal" value={formatBRL(totals.cm)} sub={formatPct(totals.cmPct)} />
          <MetricCard icon={Target} label="CM R$/Kg" value={formatBRL(totals.cmKg, { digits: 2 })} sub="Rentabilidade por kg" />
        </div>

        <SendToSlideHover
          payload={{
            source: { page: "Rolling", visualization: "Evolutivo Rolling" },
            target: { blockKind: "chart", blockLabel: "Gráfico" },
            config: { dataSource: "rolling", chartType: "combo", measures: ["volume", "rol", "cmPct"], filters, selectedPeriods },
          }}
        >
        <GlassCard>
          <header className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Evolutivo Rolling</h3>
              <p className="text-[11px] text-muted-foreground">Colunas de volume, linha de receita e linha de CM %.</p>
            </div>
          </header>
          <div className="h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthly} margin={{ top: 12, right: 18, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.5} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Number(v).toFixed(0)}%`} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  formatter={(value, name) => {
                    if (name === "CM %") return [formatPct(Number(value) / 100), name];
                    if (name === "Volume") return [`${formatNum(Number(value), 1)} t`, name];
                    return [formatBRL(Number(value)), name];
                  }}
                />
                <Bar yAxisId="left" dataKey="volume" name="Volume" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                <Line yAxisId="left" type="monotone" dataKey="rol" name="Receita Liquida" stroke="#2563EB" strokeWidth={2.5} dot={false} />
                <Line yAxisId="right" type="monotone" dataKey={(d) => d.cmPct * 100} name="CM %" stroke="#C8102E" strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
        </SendToSlideHover>

        <SendToSlideHover
          payload={{
            source: { page: "Rolling", visualization: "DRE Rolling" },
            target: { blockKind: "dre", blockLabel: "DRE" },
            config: { dataSource: "rolling", mode: "month", filters, selectedPeriods },
          }}
        >
        <GlassCard>
          <header className="mb-4">
            <h3 className="text-sm font-semibold">DRE Rolling</h3>
            <p className="text-[11px] text-muted-foreground">Estrutura mensal calculada a partir dos KPIs do Rolling.</p>
          </header>
          <div className="overflow-auto rounded-lg border border-border/50">
            <table className="min-w-full text-xs">
              <thead className="bg-primary text-primary-foreground">
                <tr>
                  <th className="sticky left-0 z-10 bg-primary px-3 py-2 text-left font-semibold">Indicador</th>
                  {monthly.map((m) => (
                    <th key={m.periodo} className="px-3 py-2 text-right font-semibold">{m.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DRE_LINES.map((line) => (
                  <tr key={line.id} className="border-t border-border/40 odd:bg-muted/20">
                    <td className="sticky left-0 bg-background px-3 py-2 font-medium">{line.label}</td>
                    {monthly.map((m) => {
                      const value = line.value(m.rows);
                      return (
                        <td
                          key={`${line.id}-${m.periodo}`}
                          className={cn("px-3 py-2 text-right tabular-nums", value < 0 && "text-destructive")}
                        >
                          {fmt(value, line.format)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
        </SendToSlideHover>
      </div>
    </>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <GlassCard className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-amber-500" />
      </div>
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </GlassCard>
  );
}
