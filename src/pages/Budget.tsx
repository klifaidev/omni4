import { useEffect, useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { KpiCard } from "@/components/pricing/KpiCard";
import { EmptyState } from "@/components/pricing/EmptyState";
import { SendToSlideHover } from "@/components/pricing/SendToSlideHover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePricing } from "@/store/pricing";
import { useBudget } from "@/store/budget";
import { applyBudgetFilters } from "@/lib/budget";
import { exportBudgetEvoPpt } from "@/lib/exportPpt";
import { toast } from "sonner";

import { formatBRL, formatPct, monthLabel } from "@/lib/format";
import { AlertTriangle, CheckCircle2, Download, Target, TrendingDown, TrendingUp, XCircle } from "lucide-react";
import {
  Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { usePageTitle } from "@/hooks/use-page-title";

type Dim = "canal" | "categoria" | "subcategoria" | "marca";

// Formatos numéricos pt-BR (sem compactação "k/M") — alinhados ao padrão
// usado nas apresentações mensais: separador de milhar com ponto, ex.: 4.341.
const fmtIntBR = (v: number) =>
  Math.round(v).toLocaleString("pt-BR");
const fmtTonsBR = (tons: number) => `${fmtIntBR(tons)} t`;
const fmtCurrencyBR = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

interface AggLine {
  key: string;
  realRol: number;
  realCm: number;
  realVol: number;
  budRol: number;
  budCm: number;
  budVol: number;
}

function pctVar(real: number, bud: number): number {
  if (!bud) return real ? (real > 0 ? Infinity : -Infinity) : 0;
  return (real - bud) / Math.abs(bud);
}

function VarBadge({ v, invert = false }: { v: number; invert?: boolean }) {
  if (!isFinite(v)) {
    return <span className="text-muted-foreground">—</span>;
  }
  const positive = invert ? v < 0 : v >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
        positive ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive",
      )}
    >
      {v >= 0 ? "+" : ""}{(v * 100).toFixed(1)}%
    </span>
  );
}

// ---------------------------------------------------------------
// Evolutivos: linha Real (vermelho cheio) + linha Budget (preto tracejado)
// ---------------------------------------------------------------
interface EvoRow {
  label: string;
  realCm: number; budCm: number;
  realCmPct: number | null; budCmPct: number | null;
  realCmKg: number | null; budCmKg: number | null;
  realVol: number; budVol: number;
}

function ChartHeader({
  title, subtitle, gapValue, gapLabel,
}: { title: string; subtitle?: string; gapValue?: string; gapLabel?: string }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</h4>
        {subtitle && <p className="mt-0.5 text-[11px] text-muted-foreground/80">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        {gapValue !== undefined && (
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">{gapLabel ?? "Gap acumulado"}</p>
            <p className={cn(
              "text-sm font-semibold tabular-nums",
              gapValue.startsWith("-") ? "text-destructive" : "text-success",
            )}>{gapValue}</p>
          </div>
        )}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: "#E63946" }} />Real
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3.5" style={{ background: "hsl(var(--foreground))" }} />Budget
          </span>
        </div>
      </div>
    </div>
  );
}

type BudgetTooltipPayload = {
  dataKey?: string | number;
  value?: unknown;
};

function ChartTooltip({
  active,
  payload,
  label,
  fmt,
}: {
  active?: boolean;
  payload?: BudgetTooltipPayload[];
  label?: string;
  fmt: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const real = payload.find((p) => p.dataKey?.toString().startsWith("real"));
  const bud = payload.find((p) => p.dataKey?.toString().startsWith("bud"));
  const rv = real?.value, bv = bud?.value;
  let delta: string | null = null;
  if (typeof rv === "number" && typeof bv === "number" && bv !== 0) {
    const d = (rv - bv) / Math.abs(bv);
    delta = `${d >= 0 ? "+" : ""}${(d * 100).toFixed(1)}%`;
  }
  return (
    <div className="rounded-xl border border-border/60 bg-popover/95 px-3 py-2 text-xs shadow-2xl backdrop-blur-md">
      <p className="mb-1.5 font-medium text-foreground">{label}</p>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-6">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ background: "#E63946" }} />Real
          </span>
          <span className="font-medium tabular-nums">{rv == null ? "—" : fmt(rv)}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span className="h-0.5 w-3" style={{ background: "hsl(var(--foreground))" }} />Budget
          </span>
          <span className="font-medium tabular-nums text-muted-foreground">{bv == null ? "—" : fmt(bv)}</span>
        </div>
        {delta && (
          <div className="mt-1 flex items-center justify-between gap-6 border-t border-border/40 pt-1">
            <span className="text-muted-foreground">Δ</span>
            <span className={cn(
              "font-semibold tabular-nums",
              delta.startsWith("-") ? "text-destructive" : "text-success",
            )}>{delta}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function EvoChart({
  title, gapValue, data, realKey, budKey, fmt, gradientId,
}: {
  title: string;
  gapValue?: string;
  data: EvoRow[];
  realKey: keyof EvoRow;
  budKey: keyof EvoRow;
  fmt: (v: number | null) => string;
  gradientId: string;
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-secondary/20 p-4 transition-colors hover:bg-secondary/30">
      <ChartHeader title={title} gapValue={gapValue} />
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#E63946" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#E63946" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.35} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => fmt(v)} width={60} />
            <Tooltip content={<ChartTooltip fmt={fmt} />} cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }} />
            <Area type="monotone" dataKey={realKey as string} stroke="none" fill={`url(#${gradientId})`} connectNulls />
            <Line type="monotone" dataKey={budKey as string} name="Budget" stroke="hsl(var(--foreground))" strokeWidth={1.5} strokeDasharray="5 4" dot={false} activeDot={{ r: 4, fill: "hsl(var(--foreground))" }} connectNulls />
            <Line type="monotone" dataKey={realKey as string} name="Real" stroke="#E63946" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: "#E63946", stroke: "hsl(var(--background))", strokeWidth: 2 }} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function EvoVolChart({ data, accumVolGap }: { data: EvoRow[]; accumVolGap: number }) {
  const tonsFmt = (v: number) =>
    `${Math.round(v).toLocaleString("pt-BR")} t`;
  const gapStr = `${accumVolGap >= 0 ? "+" : ""}${tonsFmt(accumVolGap)}`;
  return (
    <div className="rounded-xl border border-border/40 bg-secondary/20 p-4 transition-colors hover:bg-secondary/30">
      <ChartHeader title="Volume (Tons)" gapValue={gapStr} />
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
            <defs>
              <linearGradient id="volReal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#E63946" stopOpacity={1} />
                <stop offset="100%" stopColor="#E63946" stopOpacity={0.55} />
              </linearGradient>
              <linearGradient id="volBud" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity={0.55} />
                <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity={0.2} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.35} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={tonsFmt} width={60} />
            <Tooltip content={<ChartTooltip fmt={tonsFmt} />} cursor={{ fill: "hsl(var(--foreground))", fillOpacity: 0.04 }} />
            <Bar dataKey="realVol" name="Real" fill="url(#volReal)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="budVol" name="Budget" fill="url(#volBud)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function Budget() {
  usePageTitle("Budget");
  const selectedPeriods = usePricing((s) => s.selectedPeriods);
  const filters = usePricing((s) => s.filters);
  const budgetRows = useBudget((s) => s.rows);

  const [dim, setDim] = useState<Dim>("canal");

  // TODA a aba Budget é alimentada pelo arquivo XLSX de Budget.
  // Real e Budget vêm da MESMA base, separados por STATUS:
  //  - Budget = STATUS "1.Budget Vendas"          → row.kind === "budget"
  //  - Real   = qualquer outro STATUS             → row.kind === "real"
  const filteredAll = useMemo(
    () => applyBudgetFilters(budgetRows, filters, selectedPeriods),
    [budgetRows, filters, selectedPeriods],
  );
  const realFiltered = useMemo(() => filteredAll.filter((r) => r.kind === "real"), [filteredAll]);
  const budgetFiltered = useMemo(() => filteredAll.filter((r) => r.kind === "budget"), [filteredAll]);

  // Totais
  const totals = useMemo(() => {
    let realRol = 0, realCm = 0, realVol = 0;
    for (const r of realFiltered) { realRol += r.receita; realCm += r.cm; realVol += r.volumeKg; }
    let budRol = 0, budCm = 0, budVol = 0;
    for (const r of budgetFiltered) { budRol += r.receita; budCm += r.cm; budVol += r.volumeKg; }
    return { realRol, realCm, realVol, budRol, budCm, budVol };
  }, [realFiltered, budgetFiltered]);

  // Evolução mensal (todos os meses cobertos pela base Budget — Real + Budget).
  // Inclui meses futuros que tenham apenas Budget (sem Real ainda realizado),
  // garantindo a visão completa do orçado ao longo do horizonte.
  const monthly = useMemo(() => {
    type M = {
      periodo: string; mes: number; ano: number; label: string;
      realRol: number; budRol: number;
      realCm: number; budCm: number;
      realVol: number; budVol: number;
      realCmPct: number | null; budCmPct: number | null;
      realCmKg: number | null; budCmKg: number | null;
    };
    const map = new Map<string, M>();
    const ensure = (periodo: string, mes: number, ano: number) => {
      let x = map.get(periodo);
      if (!x) {
        x = {
          periodo, mes, ano, label: monthLabel(mes, ano),
          realRol: 0, budRol: 0, realCm: 0, budCm: 0, realVol: 0, budVol: 0,
          realCmPct: null, budCmPct: null, realCmKg: null, budCmKg: null,
        };
        map.set(periodo, x);
      }
      return x;
    };
    // Aplica filtros (exceto seleção de períodos) — meses futuros aparecem
    // mesmo que não estejam selecionados nos filtros mensais.
    const filteredNoPeriod = applyBudgetFilters(budgetRows, filters, null);
    for (const r of filteredNoPeriod) {
      const x = ensure(r.periodo, r.mes, r.ano);
      if (r.kind === "real") {
        x.realRol += r.receita; x.realCm += r.cm; x.realVol += r.volumeKg;
      } else {
        x.budRol += r.receita; x.budCm += r.cm; x.budVol += r.volumeKg;
      }
    }
    return Array.from(map.values())
      .sort((a, b) => a.ano - b.ano || a.mes - b.mes)
      .map((x) => ({
        ...x,
        realCmPct: x.realRol ? x.realCm / x.realRol : null,
        budCmPct: x.budRol ? x.budCm / x.budRol : null,
        realCmKg: x.realVol ? x.realCm / x.realVol : null,
        budCmKg: x.budVol ? x.budCm / x.budVol : null,
      }));
  }, [budgetRows, filters]);

  // Range de meses para o evolutivo (start/end). Default: primeiro mês do
  // ano fiscal ANTERIOR ao mais recente disponível (FY começa em abril).
  const [evoStart, setEvoStart] = useState<string | null>(null);
  const [evoEnd, setEvoEnd] = useState<string | null>(null);

  useEffect(() => {
    if (monthly.length === 0) return;
    const last = monthly[monthly.length - 1];
    const fyStart = last.mes >= 4 ? last.ano : last.ano - 1;
    const prevFyStart = fyStart - 1;
    const defaultStartPeriod = `${String(4).padStart(3, "0")}.${prevFyStart}`;
    const hasDefault = monthly.some((m) => m.periodo === defaultStartPeriod);
    const startCandidate = hasDefault ? defaultStartPeriod : monthly[0].periodo;
    const endCandidate = last.periodo;
    if (!evoStart || !monthly.some((m) => m.periodo === evoStart)) setEvoStart(startCandidate);
    if (!evoEnd || !monthly.some((m) => m.periodo === evoEnd)) setEvoEnd(endCandidate);
  }, [monthly, evoStart, evoEnd]);

  const monthlyRange = useMemo(() => {
    if (!evoStart || !evoEnd) return monthly;
    const si = monthly.findIndex((m) => m.periodo === evoStart);
    const ei = monthly.findIndex((m) => m.periodo === evoEnd);
    if (si < 0 || ei < 0) return monthly;
    const [a, b] = si <= ei ? [si, ei] : [ei, si];
    return monthly.slice(a, b + 1);
  }, [monthly, evoStart, evoEnd]);

  // Acumulados Real vs Budget apenas onde há REAL (futuro só tem budget)
  const accumGap = useMemo(() => {
    const realMonths = monthlyRange.filter((m) => m.realCm !== 0 || m.realVol !== 0);
    const cmGap = realMonths.reduce((s, m) => s + (m.realCm - m.budCm), 0);
    const volGap = realMonths.reduce((s, m) => s + (m.realVol - m.budVol), 0);
    return { cmGap, volGap };
  }, [monthlyRange]);

  // Agregação por dimensão
  const byDim = useMemo<AggLine[]>(() => {
    const map = new Map<string, AggLine>();
    const get = (k: string) => {
      let x = map.get(k);
      if (!x) {
        x = { key: k, realRol: 0, realCm: 0, realVol: 0, budRol: 0, budCm: 0, budVol: 0 };
        map.set(k, x);
      }
      return x;
    };
    for (const r of realFiltered) {
      const k = r[dim] ?? "—";
      const x = get(String(k));
      x.realRol += r.receita;
      x.realCm += r.cm;
      x.realVol += r.volumeKg;
    }
    for (const r of budgetFiltered) {
      const k = r[dim] ?? "—";
      const x = get(String(k));
      x.budRol += r.receita;
      x.budCm += r.cm;
      x.budVol += r.volumeKg;
    }
    return Array.from(map.values()).sort((a, b) => b.realRol + b.budRol - (a.realRol + a.budRol));
  }, [realFiltered, budgetFiltered, dim]);

  // ---------------------------------------------------------------
  // Painel YTD + Projeção de fechamento (FY mais recente nos dados Real)
  // ---------------------------------------------------------------
  const projection = useMemo(() => {
    // FY mais recente que tenha pelo menos uma linha Real
    const realByFy = new Map<string, { ano: number; mes: number }[]>();
    for (const r of budgetRows) {
      if (r.kind !== "real") continue;
      const arr = realByFy.get(r.fy) ?? [];
      arr.push({ ano: r.ano, mes: r.mes });
      realByFy.set(r.fy, arr);
    }
    const fys = Array.from(realByFy.keys()).sort();
    const currentFy = fys[fys.length - 1];
    if (!currentFy) return null;

    // Períodos com Real no FY atual (ignora seleção de meses, mas respeita filtros dim)
    const filteredNoPeriod = applyBudgetFilters(budgetRows, filters, null);
    const currentFyRows = filteredNoPeriod.filter((r) => r.fy === currentFy);
    const realPeriods = new Set(
      currentFyRows.filter((r) => r.kind === "real").map((r) => r.periodo),
    );

    let realRolYtd = 0, realCmYtd = 0, realVolYtd = 0;
    let budRolYtd = 0, budCmYtd = 0, budVolYtd = 0;
    let budRolFy = 0, budCmFy = 0, budVolFy = 0;
    for (const r of currentFyRows) {
      if (r.kind === "real") {
        realRolYtd += r.receita; realCmYtd += r.cm; realVolYtd += r.volumeKg;
      } else {
        budRolFy += r.receita; budCmFy += r.cm; budVolFy += r.volumeKg;
        if (realPeriods.has(r.periodo)) {
          budRolYtd += r.receita; budCmYtd += r.cm; budVolYtd += r.volumeKg;
        }
      }
    }
    const ratio = budRolYtd > 0 ? realRolYtd / budRolYtd : 0;
    const remainingBud = budRolFy - budRolYtd;
    const projected = realRolYtd + remainingBud * ratio;
    const attainment = budRolFy > 0 ? projected / budRolFy : 0;
    const status: "ok" | "risk" | "off" =
      attainment >= 0.98 ? "ok" : attainment >= 0.9 ? "risk" : "off";
    const gapAbs = realRolYtd - budRolYtd;
    const gapPct = budRolYtd > 0 ? gapAbs / budRolYtd : 0;

    return {
      currentFy,
      realRolYtd, budRolYtd, budRolFy, projected, attainment, status,
      gapAbs, gapPct, ratio,
      realCmYtd, budCmYtd, budCmFy, realVolYtd, budVolYtd, budVolFy,
      monthsRealized: realPeriods.size,
    };
  }, [budgetRows, filters]);

  // Waterfall Budget YTD → Δ por dimensão → Real YTD
  const waterfallData = useMemo(() => {
    if (!projection) return [];
    const filteredNoPeriod = applyBudgetFilters(budgetRows, filters, null);
    const fyRows = filteredNoPeriod.filter((r) => r.fy === projection.currentFy);
    const realPeriods = new Set(
      fyRows.filter((r) => r.kind === "real").map((r) => r.periodo),
    );
    type Cell = { real: number; bud: number };
    const map = new Map<string, Cell>();
    for (const r of fyRows) {
      const k = String((r as unknown as Record<string, unknown>)[dim] ?? "—");
      const c = map.get(k) ?? { real: 0, bud: 0 };
      if (r.kind === "real") c.real += r.receita;
      else if (realPeriods.has(r.periodo)) c.bud += r.receita;
      map.set(k, c);
    }
    const gaps = Array.from(map.entries())
      .map(([key, v]) => ({ key, gap: v.real - v.bud }))
      .filter((g) => Math.abs(g.gap) > 0)
      .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
      .slice(0, 6);
    let running = projection.budRolYtd;
    const out: Array<{ name: string; base: number; value: number; type: "anchor" | "pos" | "neg"; total: number }> = [];
    out.push({ name: "Budget YTD", base: 0, value: projection.budRolYtd, type: "anchor", total: projection.budRolYtd });
    for (const g of gaps) {
      const isPos = g.gap >= 0;
      const next = running + g.gap;
      out.push({
        name: g.key,
        base: isPos ? running : next,
        value: Math.abs(g.gap),
        type: isPos ? "pos" : "neg",
        total: next,
      });
      running = next;
    }
    out.push({ name: "Real YTD", base: 0, value: projection.realRolYtd, type: "anchor", total: projection.realRolYtd });
    return out;
  }, [projection, budgetRows, filters, dim]);

  // Tabela de desvios por dimensão (YTD do FY corrente)
  const deviationRows = useMemo(() => {
    if (!projection) return [] as Array<{ key: string; bud: number; real: number; gapAbs: number; gapPct: number }>;
    const filteredNoPeriod = applyBudgetFilters(budgetRows, filters, null);
    const fyRows = filteredNoPeriod.filter((r) => r.fy === projection.currentFy);
    const realPeriods = new Set(
      fyRows.filter((r) => r.kind === "real").map((r) => r.periodo),
    );
    const map = new Map<string, { bud: number; real: number }>();
    for (const r of fyRows) {
      const k = String((r as unknown as Record<string, unknown>)[dim] ?? "—");
      const c = map.get(k) ?? { bud: 0, real: 0 };
      if (r.kind === "real") c.real += r.receita;
      else if (realPeriods.has(r.periodo)) c.bud += r.receita;
      map.set(k, c);
    }
    return Array.from(map.entries())
      .map(([key, v]) => {
        const gapAbs = v.real - v.bud;
        const gapPct = v.bud > 0 ? gapAbs / v.bud : 0;
        return { key, bud: v.bud, real: v.real, gapAbs, gapPct };
      })
      .filter((r) => r.bud > 0 || r.real > 0)
      .sort((a, b) => a.gapAbs - b.gapAbs);
  }, [projection, budgetRows, filters, dim]);

  if (budgetRows.length === 0) {
    return (
      <>
        <Topbar title="Budget" subtitle="Real vs Orçamento" />
        <div className="px-8 py-6">
          <EmptyState
            title="Sem dados de budget"
            message="Carregue a planilha de Budget para comparar resultado real vs. orçado e ver a projeção de fechamento do ano."
            actionLabel="Ir para Upload"
            actionTo="/upload"
          />
        </div>
      </>
    );
  }

  const rolVar = pctVar(totals.realRol, totals.budRol);
  const cmVar = pctVar(totals.realCm, totals.budCm);
  const volVar = pctVar(totals.realVol, totals.budVol);
  const realCmPct = totals.realRol ? totals.realCm / totals.realRol : 0;
  const budCmPct = totals.budRol ? totals.budCm / totals.budRol : 0;

  return (
    <>
      <Topbar title="Budget" subtitle="Comparativo Real vs Orçamento" />
      <div className="space-y-6 px-8 py-6">
        {/* KPIs */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Receita — Real vs Budget"
            value={fmtCurrencyBR(totals.realRol)}
            subValue={`Budget ${fmtCurrencyBR(totals.budRol)}`}
            delta={isFinite(rolVar) ? rolVar : undefined}
            accent="blue"
            sendToSlide={{
              source: { page: "Budget", visualization: "KPI - Receita Real vs Budget" },
              target: { blockKind: "kpi", blockLabel: "KPI" },
              config: { label: "Receita - Real vs Budget", measure: "rol", dataSource: "budget", filters, selectedPeriods },
            }}
          />
          <KpiCard
            label="Contrib. Marginal"
            value={fmtCurrencyBR(totals.realCm)}
            subValue={`Budget ${fmtCurrencyBR(totals.budCm)}`}
            delta={isFinite(cmVar) ? cmVar : undefined}
            accent="violet"
            sendToSlide={{
              source: { page: "Budget", visualization: "KPI - Contrib. Marginal" },
              target: { blockKind: "kpi", blockLabel: "KPI" },
              config: { label: "Contrib. Marginal", measure: "cm", dataSource: "budget", filters, selectedPeriods },
            }}
          />
          <KpiCard
            label="Volume (Tons)"
            value={fmtTonsBR(totals.realVol)}
            subValue={`Budget ${fmtTonsBR(totals.budVol)}`}
            delta={isFinite(volVar) ? volVar : undefined}
            accent="green"
            sendToSlide={{
              source: { page: "Budget", visualization: "KPI - Volume" },
              target: { blockKind: "kpi", blockLabel: "KPI" },
              config: { label: "Volume", measure: "volume", dataSource: "budget", filters, selectedPeriods },
            }}
          />
          <KpiCard
            label="% CM — Real vs Budget"
            value={formatPct(realCmPct)}
            subValue={`Budget ${formatPct(budCmPct)}`}
            delta={realCmPct - budCmPct}
            accent="amber"
            sendToSlide={{
              source: { page: "Budget", visualization: "KPI - CM % Real vs Budget" },
              target: { blockKind: "kpi", blockLabel: "KPI" },
              config: { label: "CM % - Real vs Budget", measure: "cmPct", dataSource: "budget", filters, selectedPeriods },
            }}
          />
        </div>

        {/* Painel YTD + Projeção de fechamento */}
        {projection && <ProjectionPanel p={projection} />}

        {/* Waterfall Budget YTD → decomposição → Real YTD */}
        {projection && waterfallData.length > 0 && (
          <SendToSlideHover
            payload={{
              source: { page: "Budget", visualization: `Waterfall Budget vs. Real YTD (${projection.currentFy})` },
              target: { blockKind: "bridge", blockLabel: "Bridge" },
              config: { dataSource: "budget", chartType: "waterfall", dimension: dim, filters, selectedPeriods },
            }}
          >
          <GlassCard>
            <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Waterfall Budget vs. Real YTD ({projection.currentFy})</h3>
                <p className="text-[11px] text-muted-foreground">Decomposição do gap por <span className="capitalize">{dim}</span> (top 6 contribuintes)</p>
              </div>
              <div className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-secondary/30 p-1">
                {(["canal", "categoria", "subcategoria", "marca"] as Dim[]).map((d) => (
                  <Button key={d} size="sm" variant={dim === d ? "secondary" : "ghost"} className="h-7 px-3 text-xs capitalize" onClick={() => setDim(d)}>
                    {d}
                  </Button>
                ))}
              </div>
            </header>
            <div className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={waterfallData} margin={{ top: 24, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.35} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval={0} angle={-15} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => fmtCurrencyBR(v)} width={80} />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--foreground))", fillOpacity: 0.04 }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload as typeof waterfallData[number];
                      const signed = d.type === "neg" ? -d.value : d.value;
                      return (
                        <div className="rounded-xl border border-border/60 bg-popover/95 px-3 py-2 text-xs shadow-2xl backdrop-blur-md">
                          <p className="mb-1 font-medium">{d.name}</p>
                          {d.type === "anchor" ? (
                            <p className="tabular-nums">{fmtCurrencyBR(d.value)}</p>
                          ) : (
                            <>
                              <p className={cn("tabular-nums font-semibold", d.type === "pos" ? "text-success" : "text-destructive")}>
                                {signed >= 0 ? "+" : ""}{fmtCurrencyBR(signed)}
                              </p>
                              <p className="text-muted-foreground">Acumulado: <span className="tabular-nums">{fmtCurrencyBR(d.total)}</span></p>
                            </>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="base" stackId="w" fill="transparent" />
                  <Bar dataKey="value" stackId="w" radius={[4, 4, 0, 0]}>
                    {waterfallData.map((d, i) => (
                      <Cell
                        key={i}
                        fill={d.type === "anchor" ? "hsl(var(--primary))" : d.type === "pos" ? "hsl(var(--success))" : "hsl(var(--destructive))"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>
          </SendToSlideHover>
        )}

        {/* Tabela de desvios por dimensão (YTD) */}
        {projection && deviationRows.length > 0 && (
          <SendToSlideHover
            payload={{
              source: { page: "Budget", visualization: `Desvios por ${dim}` },
              target: { blockKind: "table", blockLabel: "Tabela" },
              config: { table: "budget_desvios", dimension: dim, filters, selectedPeriods },
            }}
          >
          <GlassCard>
            <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Desvios por <span className="capitalize">{dim}</span> — YTD {projection.currentFy}</h3>
                <p className="text-[11px] text-muted-foreground">Linhas com gap inferior a -10% destacadas em vermelho</p>
              </div>
            </header>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="capitalize">{dim}</TableHead>
                    <TableHead className="text-right">Budget YTD</TableHead>
                    <TableHead className="text-right">Real YTD</TableHead>
                    <TableHead className="text-right">Gap R$</TableHead>
                    <TableHead className="text-right">Gap %</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deviationRows.map((r) => {
                    const critical = r.gapPct < -0.1;
                    const status: "ok" | "risk" | "off" =
                      r.gapPct >= -0.02 ? "ok" : r.gapPct >= -0.1 ? "risk" : "off";
                    return (
                      <TableRow key={r.key} className={cn(critical && "bg-destructive/10 hover:bg-destructive/15")}>
                        <TableCell className="font-medium">{r.key}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{fmtCurrencyBR(r.bud)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtCurrencyBR(r.real)}</TableCell>
                        <TableCell className={cn("text-right tabular-nums font-medium", r.gapAbs >= 0 ? "text-success" : "text-destructive")}>
                          {r.gapAbs >= 0 ? "+" : ""}{fmtCurrencyBR(r.gapAbs)}
                        </TableCell>
                        <TableCell className="text-right"><VarBadge v={r.gapPct} /></TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant="secondary"
                            className={cn(
                              "px-2 text-[10px] font-bold",
                              status === "ok" && "bg-success/15 text-success border border-success/30",
                              status === "risk" && "bg-warning/15 text-warning border border-warning/30",
                              status === "off" && "bg-destructive/15 text-destructive border border-destructive/30",
                            )}
                          >
                            {status === "ok" ? "No caminho" : status === "risk" ? "Em risco" : "Fora"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </GlassCard>
          </SendToSlideHover>
        )}

        {/* Overview CM/VOL — 4 evolutivos Real vs Budget */}
        <SendToSlideHover
          payload={{
            source: { page: "Budget", visualization: "Overview CM/VOL - Real vs Budget" },
            target: { blockKind: "slide:budget_evo", blockLabel: "Overview CM/VOL" },
            config: { dataSource: "budget", filters, selectedPeriods, start: evoStart, end: evoEnd },
          }}
        >
        <GlassCard>
          <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">
                <Target className="mr-2 inline h-4 w-4 text-accent" /> Overview CM/VOL — Real vs Budget
              </h3>
              <p className="text-[11px] text-muted-foreground">
                CM Absoluto, CM %, CM R$/Kg e Volume — meses futuros mostram apenas Budget.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-secondary/30 px-2 py-1">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">De</span>
                <Select value={evoStart ?? undefined} onValueChange={(v) => setEvoStart(v)}>
                  <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue placeholder="Início" /></SelectTrigger>
                  <SelectContent>
                    {monthly.map((m) => (
                      <SelectItem key={m.periodo} value={m.periodo}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Até</span>
                <Select value={evoEnd ?? undefined} onValueChange={(v) => setEvoEnd(v)}>
                  <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue placeholder="Fim" /></SelectTrigger>
                  <SelectContent>
                    {monthly.map((m) => (
                      <SelectItem key={m.periodo} value={m.periodo}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Badge variant="secondary">{monthlyRange.length} mês(es)</Badge>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={async () => {
                  try {
                    await exportBudgetEvoPpt(monthlyRange, accumGap);
                    toast.success("PPTX gerado com os 4 evolutivos.");
                  } catch (e) {
                    console.error(e);
                    toast.error("Falha ao gerar PPTX.");
                  }
                }}
              >
                <Download className="h-4 w-4" /> Exportar PPTX
              </Button>
            </div>
          </header>

          {monthlyRange.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem dados.</p>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <EvoChart
                title="CM Absoluto (R$)"
                gapValue={`${accumGap.cmGap >= 0 ? "+" : ""}${fmtCurrencyBR(accumGap.cmGap)}`}
                data={monthlyRange}
                realKey="realCm"
                budKey="budCm"
                fmt={(v) => fmtCurrencyBR(v ?? 0)}
                gradientId="gradCmAbs"
              />
              <EvoChart
                title="CM % (sobre ROL)"
                data={monthlyRange}
                realKey="realCmPct"
                budKey="budCmPct"
                fmt={(v) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`)}
                gradientId="gradCmPct"
              />
              <EvoChart
                title="CM R$/Kg"
                data={monthlyRange}
                realKey="realCmKg"
                budKey="budCmKg"
                fmt={(v) => (v == null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}
                gradientId="gradCmKg"
              />
              <EvoVolChart
                data={monthlyRange}
                accumVolGap={accumGap.volGap}
              />
            </div>
          )}
        </GlassCard>
        </SendToSlideHover>

        {/* Comparativo por dimensão */}
        <SendToSlideHover
          payload={{
            source: { page: "Budget", visualization: "Atingimento por dimensão" },
            target: { blockKind: "table", blockLabel: "Tabela" },
            config: { table: "budget_atingimento", dimension: dim, filters, selectedPeriods },
          }}
        >
        <GlassCard>
          <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Atingimento por dimensão</h3>
              <p className="text-[11px] text-muted-foreground">Real vs Budget no período selecionado</p>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-secondary/30 p-1">
              {(["canal", "categoria", "subcategoria", "marca"] as Dim[]).map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant={dim === d ? "secondary" : "ghost"}
                  className="h-7 px-3 text-xs capitalize"
                  onClick={() => setDim(d)}
                >
                  {d}
                </Button>
              ))}
            </div>
          </header>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="capitalize">{dim}</TableHead>
                  <TableHead className="text-right">Receita Real</TableHead>
                  <TableHead className="text-right">Receita Budget</TableHead>
                  <TableHead className="text-right">Δ Receita</TableHead>
                  <TableHead className="text-right">CM Real</TableHead>
                  <TableHead className="text-right">CM Budget</TableHead>
                  <TableHead className="text-right">Δ CM</TableHead>
                  <TableHead className="text-right">Atingim. Receita</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byDim.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                      Sem dados para o período selecionado.
                    </TableCell>
                  </TableRow>
                ) : (
                  byDim.map((row) => {
                    const dRol = pctVar(row.realRol, row.budRol);
                    const dCm = pctVar(row.realCm, row.budCm);
                    const ating = row.budRol ? row.realRol / row.budRol : 0;
                    return (
                      <TableRow key={row.key}>
                        <TableCell className="font-medium">{row.key}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtCurrencyBR(row.realRol)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{fmtCurrencyBR(row.budRol)}</TableCell>
                        <TableCell className="text-right"><VarBadge v={dRol} /></TableCell>
                        <TableCell className="text-right tabular-nums">{fmtCurrencyBR(row.realCm)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{fmtCurrencyBR(row.budCm)}</TableCell>
                        <TableCell className="text-right"><VarBadge v={dCm} /></TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {row.budRol ? `${(ating * 100).toFixed(1)}%` : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </GlassCard>
        </SendToSlideHover>

        {/* Heróis & ofensores vs Budget */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <GlassCard>
            <header className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                <TrendingUp className="mr-2 inline h-4 w-4 text-success" /> Maiores Heróis vs Budget
              </h3>
              <span className="text-[11px] text-muted-foreground capitalize">por {dim}</span>
            </header>
            <ul className="space-y-1.5">
              {[...byDim]
                .filter((r) => r.budRol > 0)
                .sort((a, b) => pctVar(b.realRol, b.budRol) - pctVar(a.realRol, a.budRol))
                .slice(0, 5)
                .map((r) => (
                  <li key={r.key} className="flex items-center justify-between rounded-lg border border-border/30 bg-secondary/20 px-3 py-2">
                    <span className="text-sm font-medium truncate">{r.key}</span>
                    <VarBadge v={pctVar(r.realRol, r.budRol)} />
                  </li>
                ))}
            </ul>
          </GlassCard>

          <GlassCard>
            <header className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                <TrendingDown className="mr-2 inline h-4 w-4 text-destructive" /> Maiores Ofensores vs Budget
              </h3>
              <span className="text-[11px] text-muted-foreground capitalize">por {dim}</span>
            </header>
            <ul className="space-y-1.5">
              {[...byDim]
                .filter((r) => r.budRol > 0)
                .sort((a, b) => pctVar(a.realRol, a.budRol) - pctVar(b.realRol, b.budRol))
                .slice(0, 5)
                .map((r) => (
                  <li key={r.key} className="flex items-center justify-between rounded-lg border border-border/30 bg-secondary/20 px-3 py-2">
                    <span className="text-sm font-medium truncate">{r.key}</span>
                    <VarBadge v={pctVar(r.realRol, r.budRol)} />
                  </li>
                ))}
            </ul>
          </GlassCard>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------
// Painel YTD + Projeção de fechamento
// ---------------------------------------------------------------
interface ProjectionData {
  currentFy: string;
  realRolYtd: number; budRolYtd: number; budRolFy: number;
  projected: number; attainment: number;
  status: "ok" | "risk" | "off";
  gapAbs: number; gapPct: number;
  monthsRealized: number;
}

function ProjectionPanel({ p }: { p: ProjectionData }) {
  const statusMeta = {
    ok:   { label: "No caminho",     icon: CheckCircle2,   tone: "text-success border-success/30 bg-success/10" },
    risk: { label: "Em risco",       icon: AlertTriangle,  tone: "text-warning border-warning/30 bg-warning/10" },
    off:  { label: "Fora do budget", icon: XCircle,        tone: "text-destructive border-destructive/30 bg-destructive/10" },
  }[p.status];
  const StatusIcon = statusMeta.icon;
  const projGap = p.projected - p.budRolFy;

  return (
    <GlassCard glow={p.status === "ok" ? "green" : p.status === "off" ? "red" : "blue"}>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">
            <Target className="mr-2 inline h-4 w-4 text-accent" /> Projeção de fechamento — {p.currentFy}
          </h3>
          <p className="text-[11px] text-muted-foreground">
            {p.monthsRealized} mês(es) realizado(s) · projeção linear pelo ratio Real/Budget YTD
          </p>
        </div>
        <div className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold", statusMeta.tone)}>
          <StatusIcon className="h-4 w-4" />
          {statusMeta.label}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ProjStat label="YTD Real"   value={fmtCurrencyBR(p.realRolYtd)} />
        <ProjStat label="YTD Budget" value={fmtCurrencyBR(p.budRolYtd)} muted />
        <ProjStat
          label="Gap YTD"
          value={`${p.gapAbs >= 0 ? "+" : ""}${fmtCurrencyBR(p.gapAbs)}`}
          extra={
            <Badge
              variant="secondary"
              className={cn(
                "ml-2 px-2 text-[10px] font-bold tabular-nums",
                p.gapPct >= 0
                  ? "bg-success/15 text-success border border-success/30"
                  : "bg-destructive/15 text-destructive border border-destructive/30",
              )}
            >
              {p.gapPct >= 0 ? "+" : ""}{(p.gapPct * 100).toFixed(1)}%
            </Badge>
          }
          valueClass={p.gapAbs >= 0 ? "text-success" : "text-destructive"}
        />
        <ProjStat
          label="Projeção FY"
          value={fmtCurrencyBR(p.projected)}
          subValue={`Budget anual ${fmtCurrencyBR(p.budRolFy)} · ${(p.attainment * 100).toFixed(1)}% atingimento${
            projGap !== 0 ? ` (${projGap >= 0 ? "+" : ""}${fmtCurrencyBR(projGap)})` : ""
          }`}
          valueClass={
            p.status === "ok" ? "text-success" : p.status === "off" ? "text-destructive" : "text-warning"
          }
        />
      </div>

      {/* Barra visual de atingimento */}
      <div className="mt-5">
        <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Atingimento projetado</span>
          <span className="tabular-nums font-semibold text-foreground">{(p.attainment * 100).toFixed(1)}%</span>
        </div>
        <div className="relative h-3 overflow-hidden rounded-full bg-secondary/50">
          <div
            className={cn(
              "absolute inset-y-0 left-0 rounded-full transition-all",
              p.status === "ok" ? "bg-success" : p.status === "risk" ? "bg-warning" : "bg-destructive",
            )}
            style={{ width: `${Math.min(p.attainment, 1.2) * 100 / 1.2}%`, opacity: 0.85 }}
          />
          {/* marca de 100% */}
          <div className="absolute inset-y-0" style={{ left: `${100 / 1.2}%` }}>
            <div className="h-full w-px bg-foreground/40" />
          </div>
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>0%</span>
          <span style={{ marginRight: `${100 / 1.2 - 100}%` }}>100% (budget)</span>
          <span>120%</span>
        </div>
      </div>
    </GlassCard>
  );
}

function ProjStat({
  label, value, subValue, valueClass, extra, muted,
}: {
  label: string;
  value: string;
  subValue?: string;
  valueClass?: string;
  extra?: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-secondary/20 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-1 flex items-baseline text-xl font-bold tabular-nums", muted && "text-muted-foreground", valueClass)}>
        <span>{value}</span>
        {extra}
      </div>
      {subValue && <div className="mt-1 text-[11px] text-muted-foreground">{subValue}</div>}
    </div>
  );
}
