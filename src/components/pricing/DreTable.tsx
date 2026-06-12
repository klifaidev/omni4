import { useMemo } from "react";
import type { PricingRow } from "@/lib/types";
import type { MonthInfo } from "@/lib/types";
import type { BudgetRow } from "@/lib/budget";
import { formatBRL, formatNum, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePricing } from "@/store/pricing";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type DrePeriodMode = "month" | "fy";

interface DreTableProps {
  rows: PricingRow[];
  months: MonthInfo[];
  mode?: DrePeriodMode;
  /** Already filtered budget rows (same dimension filters as `rows`). */
  budgetRows?: BudgetRow[];
  /** Full unfiltered pricing rows — used to compute historical anomaly thresholds. */
  allRows?: PricingRow[];
}

interface PeriodCol {
  key: string;
  label: string;
  sublabel?: string;
}

export interface PeriodAgg {
  volume: number;
  rol: number;
  cogs: number;
  custoVariavel: number;
  custoFixo: number;
  materiaPrima: number;
  embalagem: number;
  mod: number;
  cif: number;
  hasMP: boolean;
  hasEmb: boolean;
  hasMod: boolean;
  hasCif: boolean;
  frete: number;
  comissao: number;
  cm: number;
  mb: number; // gross margin = rol - cogs (positive = good)
}

export function aggregate(rs: PricingRow[]): PeriodAgg {
  const a: PeriodAgg = {
    volume: 0, rol: 0, cogs: 0,
    custoVariavel: 0, custoFixo: 0,
    materiaPrima: 0, embalagem: 0, mod: 0, cif: 0,
    hasMP: false, hasEmb: false, hasMod: false, hasCif: false,
    frete: 0, comissao: 0, cm: 0, mb: 0,
  };
  for (const r of rs) {
    a.volume += r.volumeKg;
    a.rol += r.rol;
    a.cogs += r.cogs;
    a.custoVariavel += r.custoVariavel ?? 0;
    a.custoFixo += r.custoFixo ?? 0;
    a.frete += r.frete ?? 0;
    a.comissao += r.comissao ?? 0;
    a.cm += r.contribMarginal;
    if (r.materiaPrima != null) { a.materiaPrima += r.materiaPrima; a.hasMP = true; }
    if (r.embalagem != null) { a.embalagem += r.embalagem; a.hasEmb = true; }
    if (r.mod != null) { a.mod += r.mod; a.hasMod = true; }
    if (r.cif != null) { a.cif += r.cif; a.hasCif = true; }
  }
  a.mb = a.rol - a.cogs;
  return a;
}

export type RowKind = "value" | "perKg" | "pct" | "kg";

export interface DreLine {
  id: string;
  label: string;
  kind: RowKind;
  bold?: boolean;
  /** Mark CM% / MB% lines for anomaly highlighting. */
  anomaly?: boolean;
  get: (a: PeriodAgg) => number | null;
}

const safe = (n: number, d: number) => (d > 0 ? n / d : 0);

export const LINES: DreLine[] = [
  { id: "vol", label: "Volume (Kg)", kind: "kg", bold: true, get: (a) => a.volume },
  { id: "rol", label: "Receita Líquida", kind: "value", get: (a) => a.rol },
  { id: "rolKg", label: "ROL (R$/Kg)", kind: "perKg", bold: true, get: (a) => safe(a.rol, a.volume) },
  { id: "cv", label: "Custo Variável", kind: "value", get: (a) => -Math.abs(a.custoVariavel) },
  { id: "cvPctRol", label: "Custo Variável (%/ROL)", kind: "pct", get: (a) => -safe(Math.abs(a.custoVariavel), a.rol) },
  { id: "cvKg", label: "Custo Variável (R$/Kg)", kind: "perKg", bold: true, get: (a) => -safe(Math.abs(a.custoVariavel), a.volume) },
  { id: "mp", label: "Matéria Prima Ajustado", kind: "value", get: (a) => a.hasMP ? -Math.abs(a.materiaPrima) : null },
  { id: "emb", label: "Embalagem Ajustado", kind: "value", get: (a) => a.hasEmb ? -Math.abs(a.embalagem) : null },
  { id: "cf", label: "Custo Fixo", kind: "value", get: (a) => -Math.abs(a.custoFixo) },
  { id: "cfKg", label: "Custo Fixo (R$/Kg)", kind: "perKg", bold: true, get: (a) => -safe(Math.abs(a.custoFixo), a.volume) },
  { id: "mod", label: "MOD", kind: "value", get: (a) => a.hasMod ? -Math.abs(a.mod) : null },
  { id: "cif", label: "CIF", kind: "value", get: (a) => a.hasCif ? -Math.abs(a.cif) : null },
  { id: "frete", label: "Frete sobre Vendas Ajustado", kind: "value", get: (a) => -Math.abs(a.frete) },
  { id: "freteKg", label: "Frete (R$/Kg)", kind: "perKg", get: (a) => -safe(Math.abs(a.frete), a.volume) },
  { id: "com", label: "Comissão Repres Ajustado", kind: "value", get: (a) => -Math.abs(a.comissao) },
  { id: "comPct", label: "Comissão (%/ROL)", kind: "pct", get: (a) => -safe(Math.abs(a.comissao), a.rol) },
  { id: "comKg", label: "Comissão (R$/Kg)", kind: "perKg", get: (a) => -safe(Math.abs(a.comissao), a.volume) },
  { id: "cm", label: "Contrib. Marginal", kind: "value", bold: true, get: (a) => a.cm },
  { id: "cmPct", label: "Contrib. Marginal (%/ROL)", kind: "pct", bold: true, anomaly: true, get: (a) => safe(a.cm, a.rol) },
  { id: "cmKg", label: "Contrib. Marginal (R$/Kg)", kind: "perKg", bold: true, get: (a) => safe(a.cm, a.volume) },
];

export function fmt(value: number | null, kind: RowKind) {
  if (value == null) return <span className="text-muted-foreground/50">—</span>;
  if (kind === "pct") return formatPct(value);
  if (kind === "perKg") return formatBRL(value, { digits: 2 });
  if (kind === "kg") return `${formatNum(value, 0)} kg`;
  if (Math.abs(value) >= 1_000_000) return formatBRL(value, { compact: true });
  return formatBRL(value, { digits: 0 });
}

function formatDeltaPct(d: number | null): { text: string; cls: string } {
  if (d == null || !isFinite(d)) return { text: "—", cls: "text-muted-foreground/50" };
  if (Math.abs(d) < 0.0005) return { text: "0,0%", cls: "text-muted-foreground" };
  const sign = d > 0 ? "+" : "−";
  const txt = `${sign}${(Math.abs(d) * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
  return { text: txt, cls: d > 0 ? "text-success" : "text-destructive" };
}

interface BudgetAgg {
  volume: number;
  rol: number;
  cm: number;
  cpv: number;
}

function aggregateBudget(rs: BudgetRow[]): BudgetAgg {
  const a: BudgetAgg = { volume: 0, rol: 0, cm: 0, cpv: 0 };
  for (const r of rs) {
    a.volume += r.volumeKg ?? 0;
    a.rol += r.receita ?? 0;
    a.cm += r.cm ?? 0;
    a.cpv += r.cpv ?? 0;
  }
  return a;
}

/** Map a DRE line id to the matching budget metric, when applicable. */
function getBudgetValue(lineId: string, a: BudgetAgg): number | null {
  switch (lineId) {
    case "vol": return a.volume;
    case "rol": return a.rol;
    case "rolKg": return safe(a.rol, a.volume);
    case "cm": return a.cm;
    case "cmPct": return safe(a.cm, a.rol);
    case "cmKg": return safe(a.cm, a.volume);
    default: return null;
  }
}

export function DreTable({ rows, months, mode = "month", budgetRows = [], allRows }: DreTableProps) {
  const selectedPeriods = usePricing((s) => s.selectedPeriods);

  // Filter months based on selectedPeriods (null = all)
  const filteredMonths = useMemo(() => {
    const sorted = [...months].sort((a, b) =>
      a.ano !== b.ano ? a.ano - b.ano : a.mes - b.mes,
    );
    if (selectedPeriods === null) return sorted;
    return sorted.filter((m) => selectedPeriods.includes(m.periodo));
  }, [months, selectedPeriods]);

  // Map periodo → BudgetAgg for any budget data we have
  const budgetByPeriod = useMemo(() => {
    const m = new Map<string, BudgetAgg>();
    if (!budgetRows.length) return m;
    const groups = new Map<string, BudgetRow[]>();
    for (const b of budgetRows) {
      const arr = groups.get(b.periodo) ?? [];
      arr.push(b);
      groups.set(b.periodo, arr);
    }
    for (const [p, rs] of groups) m.set(p, aggregateBudget(rs));
    return m;
  }, [budgetRows]);

  // Build columns + aggregations based on mode
  const { columns, aggsByCol, prevColMap, budgetColMap } = useMemo(() => {
    const map = new Map<string, PeriodAgg>();
    const cols: PeriodCol[] = [];
    /** For each col key → previous col key (for Δ calc). */
    const prev = new Map<string, string | null>();
    /** For each col key → BudgetAgg (when available). */
    const bud = new Map<string, BudgetAgg>();

    if (mode === "fy") {
      // Acumulado: uma única coluna somando todos os períodos filtrados.
      if (filteredMonths.length > 0) {
        const periods = new Set(filteredMonths.map((m) => m.periodo));
        const rs = rows.filter((r) => periods.has(r.periodo));
        const first = filteredMonths[0];
        const last = filteredMonths[filteredMonths.length - 1];
        const fySpan = Array.from(new Set(filteredMonths.map((m) => m.fy)));
        const sub =
          filteredMonths.length === 1
            ? `${first.label} · ${first.fy}`
            : `${first.label} → ${last.label} · ${filteredMonths.length} meses${
                fySpan.length > 1 ? ` · ${fySpan.join(" + ")}` : ` · ${fySpan[0]}`
              }`;
        cols.push({ key: "acumulado", label: "Acumulado", sublabel: sub });
        map.set("acumulado", aggregate(rs));
        prev.set("acumulado", null);

        // Budget for the same set of periods
        if (budgetRows.length) {
          const bRs = budgetRows.filter((b) => periods.has(b.periodo));
          if (bRs.length) bud.set("acumulado", aggregateBudget(bRs));
        }

        // Previous-FY same-period accumulated comparison
        if (fySpan.length === 1 && allRows && allRows.length) {
          const monthsInWindow = filteredMonths.map((m) => m.mes);
          const allFys = Array.from(new Set(allRows.map((r) => r.fy))).sort();
          const idx = allFys.indexOf(fySpan[0]);
          if (idx > 0) {
            const prevFy = allFys[idx - 1];
            const prevRs = allRows.filter((r) => r.fy === prevFy && monthsInWindow.includes(r.mes));
            if (prevRs.length) {
              cols.push({
                key: "acumulado_prev",
                label: prevFy,
                sublabel: "Mesmo período · FY anterior",
              });
              map.set("acumulado_prev", aggregate(prevRs));
              prev.set("acumulado_prev", null);
              prev.set("acumulado", "acumulado_prev"); // Δ acumulado vs FY anterior
            }
          }
        }
      }
    } else {
      let lastKey: string | null = null;
      for (const m of filteredMonths) {
        const rs = rows.filter((r) => r.periodo === m.periodo);
        cols.push({ key: m.periodo, label: m.label, sublabel: m.fy });
        map.set(m.periodo, aggregate(rs));
        prev.set(m.periodo, lastKey);
        const bAgg = budgetByPeriod.get(m.periodo);
        if (bAgg) bud.set(m.periodo, bAgg);
        lastKey = m.periodo;
      }
    }
    return { columns: cols, aggsByCol: map, prevColMap: prev, budgetColMap: bud };
  }, [rows, filteredMonths, mode, budgetRows, budgetByPeriod, allRows]);

  // Anomaly thresholds: per anomaly line, compute mean - 1.5σ across ALL months
  // available in the dataset (allRows ?? rows), grouped by periodo.
  const anomalyThresholds = useMemo(() => {
    const thresholds = new Map<string, { mean: number; threshold: number }>();
    const source = allRows && allRows.length ? allRows : rows;
    if (!source.length) return thresholds;
    const grouped = new Map<string, PricingRow[]>();
    for (const r of source) {
      const arr = grouped.get(r.periodo) ?? [];
      arr.push(r);
      grouped.set(r.periodo, arr);
    }
    const aggs = Array.from(grouped.values()).map(aggregate);
    for (const line of LINES) {
      if (!line.anomaly) continue;
      const vals = aggs.map((a) => line.get(a)).filter((v): v is number => v != null && isFinite(v));
      if (vals.length < 3) continue;
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
      const std = Math.sqrt(variance);
      thresholds.set(line.id, { mean, threshold: mean - 1.5 * std });
    }
    return thresholds;
  }, [allRows, rows]);

  // Per-column footer averages for percentage rows (mean of the displayed cells).
  const pctAverages = useMemo(() => {
    const out = new Map<string, number | null>();
    for (const line of LINES) {
      if (line.kind !== "pct") continue;
      const vals: number[] = [];
      for (const c of columns) {
        if (c.key === "acumulado_prev") continue;
        const a = aggsByCol.get(c.key);
        if (!a) continue;
        const v = line.get(a);
        if (v != null && isFinite(v)) vals.push(v);
      }
      out.set(line.id, vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null);
    }
    return out;
  }, [columns, aggsByCol]);

  if (columns.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum período disponível para montar o DRE.
      </p>
    );
  }

  const hasBudgetAnywhere = budgetColMap.size > 0;

  // For the <thead>, we need a 2-row grouped layout so each period spans
  // (Real, Δ, Budget?) sub-columns.
  const subColsFor = (key: string): Array<"value" | "delta" | "budget"> => {
    const subs: Array<"value" | "delta" | "budget"> = ["value"];
    // Δ shown when there is a "previous" reference column
    if (prevColMap.get(key)) subs.push("delta");
    // Budget column shown only when budget data exists for this column
    if (budgetColMap.has(key)) subs.push("budget");
    return subs;
  };

  return (
    <TooltipProvider delayDuration={120}>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th
                rowSpan={2}
                className="sticky left-0 z-10 min-w-[260px] border-b border-border/40 bg-card/80 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-primary backdrop-blur"
              >
                Valores
              </th>
              {columns.map((c) => {
                const subs = subColsFor(c.key);
                return (
                  <th
                    key={c.key}
                    colSpan={subs.length}
                    className="border-b border-border/20 bg-card/40 px-3 py-2.5 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    <div>{c.label}</div>
                    {c.sublabel && (
                      <div className="mt-0.5 text-[9px] font-normal normal-case tracking-normal text-muted-foreground/70">
                        {c.sublabel}
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
            <tr>
              {columns.flatMap((c) =>
                subColsFor(c.key).map((sub) => (
                  <th
                    key={`${c.key}-${sub}`}
                    className={cn(
                      "border-b border-border/40 bg-card/30 px-3 py-1.5 text-right text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80",
                      sub === "delta" && "text-[10px]",
                    )}
                  >
                    {sub === "value" ? "Real" : sub === "delta" ? "Δ" : "Budget"}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {LINES.map((line, idx) => (
              <tr
                key={line.id}
                className={cn(
                  "transition-colors hover:bg-secondary/20",
                  idx % 2 === 1 && "bg-secondary/10",
                )}
              >
                <td
                  className={cn(
                    "sticky left-0 z-[1] border-b border-border/20 bg-card/80 px-4 py-2 text-left backdrop-blur",
                    line.bold ? "font-semibold text-foreground" : "text-muted-foreground",
                  )}
                >
                  {line.label}
                </td>
                {columns.flatMap((c) => {
                  const a = aggsByCol.get(c.key)!;
                  const v = line.get(a);
                  const isNeg = typeof v === "number" && v < 0;
                  const subs = subColsFor(c.key);

                  // Anomaly check on percentage margin lines
                  let anomaly: { mean: number; threshold: number } | null = null;
                  if (line.anomaly && typeof v === "number" && isFinite(v)) {
                    const t = anomalyThresholds.get(line.id);
                    if (t && v < t.threshold) anomaly = t;
                  }

                  const valueCell = (
                    <td
                      key={`${c.key}-value`}
                      className={cn(
                        "border-b border-border/20 px-3 py-2 text-right tabular-nums",
                        line.bold && "font-semibold",
                        isNeg && "text-destructive",
                        anomaly && "bg-destructive/10",
                      )}
                    >
                      {anomaly ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help underline decoration-destructive/40 decoration-dotted underline-offset-4">
                              {fmt(v, line.kind)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            Abaixo da média histórica de {formatPct(anomaly.mean)}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        fmt(v, line.kind)
                      )}
                    </td>
                  );

                  const cells = [valueCell];

                  if (subs.includes("delta")) {
                    const prevKey = prevColMap.get(c.key)!;
                    const prevAgg = aggsByCol.get(prevKey);
                    const prevV = prevAgg ? line.get(prevAgg) : null;
                    let dPct: number | null = null;
                    if (
                      typeof v === "number" && isFinite(v) &&
                      typeof prevV === "number" && isFinite(prevV) && prevV !== 0
                    ) {
                      dPct = (v - prevV) / Math.abs(prevV);
                    }
                    const d = formatDeltaPct(dPct);
                    cells.push(
                      <td
                        key={`${c.key}-delta`}
                        className={cn(
                          "border-b border-border/20 px-3 py-2 text-right text-xs tabular-nums",
                          d.cls,
                        )}
                      >
                        {d.text}
                      </td>
                    );
                  }

                  if (subs.includes("budget")) {
                    const bAgg = budgetColMap.get(c.key)!;
                    const budV = getBudgetValue(line.id, bAgg);
                    let dPct: number | null = null;
                    if (
                      budV != null && isFinite(budV) && budV !== 0 &&
                      typeof v === "number" && isFinite(v)
                    ) {
                      // For "expense" lines (already negated), positive variation
                      // means we spent more — bad. Flip sign accordingly.
                      const sign = v < 0 ? -1 : 1;
                      dPct = sign * ((v - budV) / Math.abs(budV));
                    }
                    const good = dPct != null && dPct >= 0;
                    cells.push(
                      <td
                        key={`${c.key}-budget`}
                        className="border-b border-border/20 px-3 py-2 text-right text-xs tabular-nums"
                      >
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-muted-foreground">
                            {budV != null ? fmt(budV, line.kind) : <span className="text-muted-foreground/50">—</span>}
                          </span>
                          {dPct != null && (
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                                good
                                  ? "bg-success/15 text-success"
                                  : "bg-destructive/15 text-destructive",
                              )}
                            >
                              {formatDeltaPct(dPct).text}
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  }

                  return cells;
                })}
              </tr>
            ))}

            {/* Footer: averages of percentage metrics across displayed columns */}
            <tr className="bg-secondary/30">
              <td className="sticky left-0 z-[1] border-t-2 border-border/60 bg-card/95 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-primary backdrop-blur">
                Média do período
              </td>
              <td
                colSpan={columns.flatMap((cc) => subColsFor(cc.key)).length}
                className="border-t-2 border-border/60 bg-card/50 px-3 py-2.5 text-right text-xs"
              >
                <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 text-muted-foreground">
                  {LINES.filter((l) => l.kind === "pct").map((l) => {
                    const avg = pctAverages.get(l.id);
                    if (avg == null) return null;
                    return (
                      <span key={l.id} className="inline-flex items-center gap-1.5">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                          {l.label.replace(/\s*\(%\/ROL\)\s*$/i, "")}
                        </span>
                        <span className="font-semibold tabular-nums text-foreground">
                          {formatPct(avg)}
                        </span>
                      </span>
                    );
                  })}
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        {hasBudgetAnywhere && (
          <p className="mt-2 text-[11px] text-muted-foreground/70">
            Δ = variação vs. período anterior · Budget = orçado para o mês (variação real vs. orçado).
          </p>
        )}
      </div>
    </TooltipProvider>
  );
}
