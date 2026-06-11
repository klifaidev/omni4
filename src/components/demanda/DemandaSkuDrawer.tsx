import { useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { DemandaRow, DemandaMeses, DemandaEdit, MetodoSugestao } from "@/lib/demanda";
import {
  sugestaoSazonalidade,
  sugestaoTendencia,
  sugestaoAnterior,
  calcScoreMix,
  calcAcuracia,
  calcSazonalidadeIdx,
  calcErrosMensais,
} from "@/lib/demandaCalc";
import type { PricingRow } from "@/lib/types";
import { cn } from "@/lib/utils";

interface DemandaSkuDrawerProps {
  drawerKey: string | null;
  rows: DemandaRow[];
  meses: DemandaMeses;
  edits: DemandaEdit;
  pricingRows: PricingRow[];
  metric: "cm" | "mb";
  fatorCrescimento: number;
  mesesTendencia: number;
  onClose: () => void;
  onApplyMetodo: (canal: string, cod: number, metodo: MetodoSugestao) => void;
}

function getCategoriaClass(cat: string): string {
  const lower = cat.toLowerCase();
  if (lower.includes("cobertura"))
    return "border-blue-400/40 bg-blue-500/10 text-blue-600 dark:text-blue-400";
  if (lower.includes("recheio"))
    return "border-amber-400/40 bg-amber-500/10 text-amber-700 dark:text-amber-400";
  if (lower.includes("chocolate"))
    return "border-orange-900/30 bg-orange-900/10 text-orange-900 dark:text-orange-400";
  if (lower.includes("inclus"))
    return "border-purple-400/40 bg-purple-500/10 text-purple-700 dark:text-purple-400";
  return "";
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

export function DemandaSkuDrawer({
  drawerKey,
  rows,
  meses,
  edits,
  pricingRows,
  metric,
  fatorCrescimento,
  mesesTendencia,
  onClose,
  onApplyMetodo,
}: DemandaSkuDrawerProps) {
  const isOpen = drawerKey !== null;

  const { row, canal } = useMemo(() => {
    if (!drawerKey) return { row: null, canal: "" };
    const [c, codStr] = drawerKey.split("::");
    const cod = parseInt(codStr, 10);
    const found = rows.find((r) => r.sku.regional === c && r.sku.cod === cod);
    return { row: found ?? null, canal: c };
  }, [drawerKey, rows]);

  const score = useMemo(
    () => (row ? calcScoreMix(row.sku.cod, pricingRows, metric) : null),
    [row, pricingRows, metric],
  );

  const acuracia = useMemo(
    () => (row ? calcAcuracia(row, meses.mesAtualIdx) : null),
    [row, meses.mesAtualIdx],
  );

  const sazIdx = useMemo(
    () => (row ? calcSazonalidadeIdx(row) : Array(12).fill(1) as number[]),
    [row],
  );

  const errosMensais = useMemo(
    () => (row ? calcErrosMensais(row, meses.mesAtualIdx, meses.labels) : []),
    [row, meses],
  );

  const sugestoes = useMemo(() => {
    if (!row) return { sazonalidade: [], tendencia: [], anterior: [] };
    return {
      sazonalidade: sugestaoSazonalidade(row, fatorCrescimento),
      tendencia: sugestaoTendencia(row, mesesTendencia),
      anterior: sugestaoAnterior(row),
    };
  }, [row, fatorCrescimento, mesesTendencia]);

  const chartData = useMemo(() => {
    if (!row) return [];
    return meses.labels.map((label, i) => ({
      label,
      ind1: row.indicadores[1]?.valores[i] ?? null,
      ind4: row.indicadores[4]?.valores[i] ?? null,
      ind3: i < meses.mesAtualIdx ? (row.indicadores[3]?.valores[i] ?? null) : null,
      ind8: row.indicadores[8]?.valores[i] ?? null,
    }));
  }, [row, meses]);

  const getAtualValue = (mesIdx: number): number => {
    if (!row || !canal) return 0;
    return edits[canal]?.[row.sku.cod]?.[mesIdx] ?? row.indicadores[8]?.valores[mesIdx] ?? 0;
  };

  // Seasonality peak/valley (find month with highest/lowest index)
  const { peakLabel, valleyLabel } = useMemo(() => {
    const nonZeroIdx = sazIdx.filter((v) => v > 0);
    if (nonZeroIdx.length === 0) return { peakLabel: "—", valleyLabel: "—" };
    const peakI = sazIdx.indexOf(Math.max(...sazIdx));
    const valleyI = sazIdx.indexOf(Math.min(...sazIdx));
    return {
      peakLabel: meses.labels[peakI] ?? "—",
      valleyLabel: meses.labels[valleyI] ?? "—",
    };
  }, [sazIdx, meses.labels]);

  const scoreColor =
    score === null
      ? "bg-muted text-muted-foreground"
      : score >= 7
        ? "bg-success/20 text-success"
        : score >= 4
          ? "bg-warning/20 text-warning"
          : "bg-destructive/20 text-destructive";

  const fmt = (n: number | null | undefined) =>
    n != null ? n.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "—";

  const categoriaClass = row?.sku.categoria ? getCategoriaClass(row.sku.categoria) : "";

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        className="flex w-[440px] flex-col overflow-y-auto border-l border-border/20 bg-card/95 p-0 backdrop-blur-xl sm:max-w-[440px]"
        style={{ transition: "transform 220ms cubic-bezier(0.4, 0, 0.2, 1)" }}
      >
        {row && (
          <>
            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="border-b border-border/30 px-6 py-5">
              <SheetHeader>
                <SheetTitle className="text-left">
                  {row.sku.descricao}
                </SheetTitle>
              </SheetHeader>
              <p className="mt-0.5 text-xs text-muted-foreground">{row.sku.cod}</p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {row.sku.status && (
                  <Badge variant="secondary" className="text-[10px]">
                    {row.sku.status}
                  </Badge>
                )}
                {row.sku.categoria && (
                  <Badge
                    variant="outline"
                    className={cn("text-[10px]", categoriaClass)}
                  >
                    {row.sku.categoria}
                  </Badge>
                )}
                {row.sku.tecnologia && (
                  <Badge variant="outline" className="text-[10px]">
                    {row.sku.tecnologia}
                  </Badge>
                )}
                {row.sku.formato && (
                  <Badge variant="outline" className="text-[10px]">
                    {row.sku.formato}
                  </Badge>
                )}
              </div>

              {/* Score + Acurácia */}
              <div className="mt-3 flex gap-3">
                <div className={`flex-1 rounded-lg px-3 py-2 text-xs ${scoreColor}`}>
                  <div className="font-semibold">
                    Score Mix: {score != null ? score.toFixed(1) : "—"}
                  </div>
                  <div className="mt-0.5 text-[10px] opacity-80">
                    {score === null
                      ? "Sem dados no KE30"
                      : score >= 7
                        ? "SKU premium — priorizar crescimento"
                        : score >= 4
                          ? "SKU médio — crescimento moderado"
                          : "SKU crítico — revisar com atenção"}
                  </div>
                </div>

                {acuracia && (
                  <div className="flex-1 rounded-lg bg-muted/40 px-3 py-2 text-xs">
                    <div className="font-semibold">
                      Acurácia: {(acuracia.acuracia * 100).toFixed(0)}%
                    </div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {acuracia.bias > 0.05
                        ? "Histórico otimista"
                        : acuracia.bias < -0.05
                          ? "Histórico conservador"
                          : "Histórico calibrado"}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Sazonalidade histórica ──────────────────────────────────── */}
            <div className="border-b border-border/20 px-6 py-4">
              <SectionTitle>Sazonalidade histórica</SectionTitle>
              <div className="flex flex-wrap gap-1">
                {sazIdx.map((idx, i) => {
                  const color =
                    idx > 1.1
                      ? "bg-success/20 text-success"
                      : idx < 0.9
                        ? "bg-destructive/15 text-destructive"
                        : "bg-warning/15 text-warning";
                  const label = meses.labels[i]?.split("/")[0] ?? `M${i + 1}`;
                  return (
                    <Tooltip key={i}>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            "flex h-8 w-8 flex-col items-center justify-center rounded-md text-[8px] font-medium cursor-default",
                            color,
                          )}
                        >
                          <span className="leading-none">{label}</span>
                          <span className="mt-0.5 font-semibold leading-none">{idx.toFixed(1)}</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">
                        {meses.labels[i]}: índice {idx.toFixed(2)}x
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">
                Pico histórico em <span className="font-medium text-foreground">{peakLabel}</span>
                {" · "}
                Vale histórico em <span className="font-medium text-foreground">{valleyLabel}</span>
              </p>
            </div>

            {/* ── Acurácia do ciclo anterior ──────────────────────────────── */}
            <div className="border-b border-border/20 px-6 py-4">
              <SectionTitle>Acurácia do ciclo anterior</SectionTitle>
              {errosMensais.length < 2 ? (
                <p className="text-xs text-muted-foreground">
                  Histórico insuficiente para calcular acurácia.
                </p>
              ) : (
                <>
                  {acuracia && (
                    <div className="mb-3 flex gap-4 text-xs">
                      <div>
                        <span className="text-muted-foreground">Acurácia média</span>
                        <span className="ml-2 font-semibold">
                          {(acuracia.acuracia * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Bias</span>
                        <span
                          className={cn(
                            "ml-2 font-semibold",
                            acuracia.bias > 0.05
                              ? "text-warning"
                              : acuracia.bias < -0.05
                                ? "text-primary"
                                : "text-success",
                          )}
                        >
                          {acuracia.bias > 0.05
                            ? "Otimista"
                            : acuracia.bias < -0.05
                              ? "Conservador"
                              : "Calibrado"}
                        </span>
                      </div>
                    </div>
                  )}
                  <ResponsiveContainer width="100%" height={100}>
                    <BarChart
                      data={errosMensais}
                      margin={{ top: 2, right: 4, left: -28, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="label" tick={{ fontSize: 8 }} />
                      <YAxis tick={{ fontSize: 8 }} tickFormatter={(v) => `${v}%`} />
                      <RechartsTooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          fontSize: 11,
                        }}
                        formatter={(v: number) => [`${v.toFixed(1)}%`, "Erro"]}
                      />
                      <ReferenceLine y={0} stroke="hsl(var(--border))" />
                      <Bar dataKey="erro" radius={[2, 2, 0, 0]}>
                        {errosMensais.map((entry, index) => (
                          <Cell
                            key={index}
                            fill={
                              entry.erro > 0
                                ? "hsl(var(--warning))"
                                : "hsl(var(--primary))"
                            }
                            fillOpacity={0.7}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <p className="mt-1 text-[9px] text-muted-foreground">
                    Positivo = previu mais que realizou · Negativo = previu menos
                  </p>
                </>
              )}
            </div>

            {/* ── Referências históricas (gráfico) ────────────────────────── */}
            <div className="border-b border-border/20 px-6 py-4">
              <SectionTitle>Referências históricas</SectionTitle>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 9 }} />
                  <RechartsTooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                    formatter={(v: number) =>
                      v?.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) ?? "—"
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey="ind1" name="Ano Ant." stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} dot={false} connectNulls />
                  <Line type="monotone" dataKey="ind4" name="Fc. Ant." stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false} connectNulls />
                  <Line type="monotone" dataKey="ind3" name="Realizado" stroke="hsl(var(--warning))" strokeWidth={2} strokeDasharray="4 2" dot={false} connectNulls />
                  <Line type="monotone" dataKey="ind8" name="Revisado" stroke="hsl(var(--success))" strokeWidth={2} dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* ── Comparativo de métodos ───────────────────────────────────── */}
            <div className="border-b border-border/20 px-6 py-4">
              <SectionTitle>Comparativo de métodos</SectionTitle>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/30">
                      <th className="pb-1.5 text-left text-[10px] font-medium text-muted-foreground">Mês</th>
                      {(["sazonalidade", "tendencia", "anterior"] as MetodoSugestao[]).map((m) => (
                        <th key={m} className="pb-1.5 text-right text-[10px] font-medium text-muted-foreground">
                          <div className="flex flex-col items-end gap-0.5">
                            <span>{m === "sazonalidade" ? "Sazon." : m === "tendencia" ? "Tend." : "Ant."}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 px-1.5 text-[9px] text-primary"
                              onClick={() => onApplyMetodo(canal, row.sku.cod, m)}
                            >
                              Usar todos
                            </Button>
                          </div>
                        </th>
                      ))}
                      <th className="pb-1.5 text-right text-[10px] font-semibold text-foreground">
                        Atual
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {meses.labels.map((label, i) => {
                      if (i <= meses.mesAtualIdx) return null;
                      const atual = getAtualValue(i);
                      return (
                        <tr key={i} className="border-b border-border/10">
                          <td className="py-1 text-muted-foreground">{label}</td>
                          <td className="py-1 text-right tabular-nums">{fmt(sugestoes.sazonalidade[i])}</td>
                          <td className="py-1 text-right tabular-nums">{fmt(sugestoes.tendencia[i])}</td>
                          <td className="py-1 text-right tabular-nums">{fmt(sugestoes.anterior[i])}</td>
                          <td className="rounded bg-primary/10 px-1.5 py-1 text-right font-medium tabular-nums text-primary">
                            {fmt(atual)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Indicadores de referência ────────────────────────────────── */}
            <div className="px-6 py-4">
              <SectionTitle>Indicadores de referência</SectionTitle>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/30">
                    <th className="pb-1.5 text-left text-[10px] text-muted-foreground">Mês</th>
                    <th className="pb-1.5 text-right text-[10px] text-muted-foreground">Ano Ant.</th>
                    <th className="pb-1.5 text-right text-[10px] text-muted-foreground">Realizado</th>
                    <th className="pb-1.5 text-right text-[10px] text-muted-foreground">Fc. Ant.</th>
                    <th className="pb-1.5 text-right text-[10px] text-muted-foreground">Revisado</th>
                  </tr>
                </thead>
                <tbody>
                  {meses.labels.map((label, i) => (
                    <tr
                      key={i}
                      className={`border-b border-border/10 ${i === meses.mesAtualIdx ? "bg-primary/5" : ""}`}
                    >
                      <td className="py-1 text-muted-foreground">{label}</td>
                      <td className="py-1 text-right tabular-nums">{fmt(row.indicadores[1]?.valores[i])}</td>
                      <td className="py-1 text-right tabular-nums">{fmt(row.indicadores[3]?.valores[i])}</td>
                      <td className="py-1 text-right tabular-nums">{fmt(row.indicadores[4]?.valores[i])}</td>
                      <td className="py-1 text-right font-medium tabular-nums text-primary">
                        {fmt(row.indicadores[8]?.valores[i])}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
