import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Boxes, CheckCircle2, Factory, FileSpreadsheet, PackageSearch, RefreshCw, ShieldAlert, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePageTitle } from "@/hooks/use-page-title";
import { formatBRL, formatNum } from "@/lib/format";
import { parseEstoqueFile, type EstoqueRow, type EstoqueStatus } from "@/lib/estoque";
import { cn } from "@/lib/utils";
import { useEstoque } from "@/store/estoque";
import { usePricing } from "@/store/pricing";

type NegocioFilter = "retail" | "industria" | "exportacao" | "todos";
type CdFilter = "todos" | "SP" | "PB";

const statusLabels: Record<EstoqueStatus, string> = {
  bloqueado: "Bloqueado",
  critico: "Crítico 30d",
  atencao: "Atenção 60d",
  monitorar: "Monitorar",
  revisar: "Revisar cadastro",
};

const statusClass: Record<EstoqueStatus, string> = {
  bloqueado: "border-red-500/30 bg-red-500/10 text-red-500",
  critico: "border-orange-500/30 bg-orange-500/10 text-orange-500",
  atencao: "border-yellow-500/30 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  monitorar: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
  revisar: "border-slate-500/30 bg-slate-500/10 text-slate-400",
};

function isRisk(status: EstoqueStatus) {
  return status === "bloqueado" || status === "critico" || status === "atencao";
}

function isoDateBR(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function fmtKg(v: number | null | undefined) {
  if (v == null || !isFinite(v)) return "—";
  if (Math.abs(v) >= 1000) return `${formatNum(v / 1000, 1)} t`;
  return `${formatNum(v, 0)} kg`;
}

function negocioLabel(v: NegocioFilter) {
  if (v === "retail") return "Retail";
  if (v === "industria") return "Indústria";
  if (v === "exportacao") return "Exportação";
  return "Todos";
}

export default function Estoque() {
  usePageTitle("Estoque");
  const rows = useEstoque((s) => s.rows);
  const file = useEstoque((s) => s.file);
  const warnings = useEstoque((s) => s.warnings);
  const setEstoque = useEstoque((s) => s.setEstoque);
  const clearEstoque = useEstoque((s) => s.clearEstoque);
  const pricingRows = usePricing((s) => s.rows);

  const [negocio, setNegocio] = useState<NegocioFilter>("retail");
  const [cd, setCd] = useState<CdFilter>("todos");
  const [status, setStatus] = useState<EstoqueStatus | "todos">("todos");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const financialBySku = useMemo(() => {
    const map = new Map<string, { rolKg: number; cmKg: number; margemPct: number }>();
    const acc = new Map<string, { rol: number; cm: number; kg: number }>();
    for (const r of pricingRows) {
      const sku = String(r.sku ?? "").trim();
      if (!sku) continue;
      const cur = acc.get(sku) ?? { rol: 0, cm: 0, kg: 0 };
      cur.rol += r.rol;
      cur.cm += r.contribMarginal;
      cur.kg += r.volumeKg;
      acc.set(sku, cur);
    }
    for (const [sku, v] of acc) {
      if (v.kg > 0) map.set(sku, { rolKg: v.rol / v.kg, cmKg: v.cm / v.kg, margemPct: v.rol ? v.cm / v.rol : 0 });
    }
    return map;
  }, [pricingRows]);

  const enriched = useMemo(() => rows.map((r) => {
    const fin = financialBySku.get(r.codMaterial);
    const kg = r.kgEstoque ?? 0;
    return {
      ...r,
      rolKg: fin?.rolKg ?? null,
      cmKg: fin?.cmKg ?? null,
      margemPct: fin?.margemPct ?? null,
      impactoRol: fin ? kg * fin.rolKg : null,
      impactoCm: fin ? kg * fin.cmKg : null,
      score:
        (r.status === "bloqueado" ? 1000 : r.status === "critico" ? 700 : r.status === "atencao" ? 400 : r.status === "revisar" ? 250 : 0)
        + (r.reprocessavel === false ? 200 : 0)
        + Math.min(250, kg / 20),
    };
  }), [rows, financialBySku]);

  const filtered = useMemo(() => enriched.filter((r) => {
    if (negocio !== "todos" && r.negocioGrupo !== negocio) return false;
    if (cd !== "todos" && r.cd !== cd) return false;
    if (status !== "todos" && r.status !== status) return false;
    return true;
  }), [enriched, negocio, cd, status]);

  const totals = useMemo(() => {
    const risk = filtered.filter((r) => isRisk(r.status));
    const sum = (arr: typeof filtered, pick: (r: typeof filtered[number]) => number | null) =>
      arr.reduce((s, r) => s + (pick(r) ?? 0), 0);
    return {
      caixas: sum(filtered, (r) => r.qtCxs),
      kg: sum(filtered, (r) => r.kgEstoque),
      riscoCaixas: sum(risk, (r) => r.qtCxs),
      riscoKg: sum(risk, (r) => r.kgEstoque),
      bloqueadoCaixas: sum(filtered.filter((r) => r.status === "bloqueado"), (r) => r.qtCxs),
      naoReprocKg: sum(risk.filter((r) => r.reprocessavel === false), (r) => r.kgEstoque),
      impactoRol: sum(risk, (r) => r.impactoRol),
      impactoCm: sum(risk, (r) => r.impactoCm),
      revisarPack: filtered.filter((r) => r.embalagem.confianca === "revisar").length,
    };
  }, [filtered]);

  const byCdStatus = useMemo(() => {
    const out: Record<string, Partial<Record<EstoqueStatus, number>>> = {};
    for (const r of filtered) {
      out[r.cd] ??= {};
      out[r.cd][r.status] = (out[r.cd][r.status] ?? 0) + r.qtCxs;
    }
    return out;
  }, [filtered]);

  const topRisk = useMemo(
    () => [...filtered].sort((a, b) => b.score - a.score).slice(0, 25),
    [filtered],
  );

  async function handleFiles(files: FileList | File[]) {
    const file = Array.from(files)[0];
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
      toast.error("Envie uma planilha .xlsx ou .xls de Shelf Life.");
      return;
    }
    setBusy(true);
    try {
      const parsed = await parseEstoqueFile(file);
      if (parsed.rows.length === 0) throw new Error(parsed.warnings[0] ?? "Nenhuma linha válida encontrada.");
      setEstoque(parsed.rows, parsed.file, parsed.warnings);
      toast.success(`Estoque carregado: ${parsed.rows.length.toLocaleString("pt-BR")} lotes ativos.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao processar a planilha de estoque.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <Topbar title="Estoque" subtitle="Risco de shelf life, reprocesso e impacto financeiro estimado" />
      <div className="space-y-6 px-8 py-6">
        <GlassCard className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
                <PackageSearch className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-sm font-semibold">Base Shelf Life</div>
                <div className="text-[11px] text-muted-foreground">
                  {file ? `${file.name} · ${file.rowCount.toLocaleString("pt-BR")} lotes ativos` : "Carregue a planilha com a aba Base"}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input ref={inputRef} type="file" accept=".xlsx,.xls" hidden onChange={(e) => e.target.files && handleFiles(e.target.files)} />
              <Button variant="outline" className="gap-2" onClick={() => inputRef.current?.click()} disabled={busy}>
                {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Carregar estoque
              </Button>
              {rows.length > 0 && (
                <Button variant="ghost" className="gap-2 text-destructive hover:text-destructive" onClick={clearEstoque}>
                  <Trash2 className="h-4 w-4" />
                  Limpar
                </Button>
              )}
            </div>
          </div>
          {warnings.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {warnings.slice(0, 4).map((w) => (
                <Badge key={w} variant="outline" className="border-warning/40 bg-warning/10 text-warning">{w}</Badge>
              ))}
            </div>
          )}
        </GlassCard>

        {rows.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <GlassCard className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <FilterSelect label="Negócio" value={negocio} onChange={(v) => setNegocio(v as NegocioFilter)} options={[
                  ["retail", "Retail"],
                  ["industria", "Indústria"],
                  ["exportacao", "Exportação"],
                  ["todos", "Todos"],
                ]} />
                <FilterSelect label="CD" value={cd} onChange={(v) => setCd(v as CdFilter)} options={[["todos", "Todos"], ["SP", "SP"], ["PB", "PB"]]} />
                <FilterSelect label="Status" value={status} onChange={(v) => setStatus(v as EstoqueStatus | "todos")} options={[
                  ["todos", "Todos"],
                  ["bloqueado", "Bloqueado"],
                  ["critico", "Crítico 30d"],
                  ["atencao", "Atenção 60d"],
                  ["monitorar", "Monitorar"],
                  ["revisar", "Revisar"],
                ]} />
                <div className="ml-auto text-[11px] text-muted-foreground">
                  Visão atual: <span className="font-medium text-foreground">{negocioLabel(negocio)}</span>
                </div>
              </div>
            </GlassCard>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <KpiCard icon={Boxes} label="Estoque filtrado" value={fmtKg(totals.kg)} sub={`${formatNum(totals.caixas, 0)} caixas`} />
              <KpiCard icon={ShieldAlert} label="Risco shelf" value={fmtKg(totals.riscoKg)} sub={`${formatNum(totals.riscoCaixas, 0)} caixas em bloqueado/30/60d`} tone="warning" />
              <KpiCard icon={AlertTriangle} label="Não reprocessável" value={fmtKg(totals.naoReprocKg)} sub="Risco com pior caminho de perda" tone="danger" />
              <KpiCard icon={Factory} label="Impacto CM estimado" value={totals.impactoCm ? formatBRL(totals.impactoCm) : "Sem Real"} sub={`ROL em risco ${totals.impactoRol ? formatBRL(totals.impactoRol) : "—"}`} tone="accent" />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <GlassCard>
                <h3 className="mb-4 text-sm font-semibold">Mapa CD x urgência</h3>
                <div className="space-y-3">
                  {Object.entries(byCdStatus).map(([cdKey, vals]) => {
                    const total = Object.values(vals).reduce((s, v) => s + (v ?? 0), 0) || 1;
                    return (
                      <div key={cdKey} className="rounded-xl border border-border/50 bg-card/40 p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-semibold">{cdKey}</span>
                          <span className="text-xs text-muted-foreground">{formatNum(total, 0)} caixas</span>
                        </div>
                        <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                          {(["bloqueado", "critico", "atencao", "monitorar", "revisar"] as EstoqueStatus[]).map((s) => {
                            const pct = ((vals[s] ?? 0) / total) * 100;
                            return <div key={s} className={barColor(s)} style={{ width: `${pct}%` }} title={`${statusLabels[s]}: ${formatNum(vals[s] ?? 0, 0)}`} />;
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </GlassCard>

              <GlassCard>
                <h3 className="mb-4 text-sm font-semibold">Plano de ação recomendado</h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <ActionCard title="1. Bloquear ou destravar venda" value={formatNum(filtered.filter((r) => r.status === "bloqueado").length, 0)} text="Lotes já dentro da trava de shelf. Prioridade máxima." />
                  <ActionCard title="2. Atacar não reprocessáveis" value={fmtKg(totals.naoReprocKg)} text="Se não vender, tende a descarte. Puxar comercial e CD." />
                  <ActionCard title="3. Revisar cadastro" value={formatNum(totals.revisarPack, 0)} text="Sem pack confiável, shelf ou vencimento. Não entra bem no impacto R$." />
                </div>
              </GlassCard>
            </div>

            <GlassCard className="overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-border/50 px-5 py-4">
                <div>
                  <h3 className="text-sm font-semibold">Top riscos por lote</h3>
                  <p className="text-[11px] text-muted-foreground">Ordenado por urgência, volume, reprocesso e impacto estimado.</p>
                </div>
                {pricingRows.length === 0 && (
                  <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">
                    Carregue a base Real para impacto financeiro
                  </Badge>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-sm">
                  <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-left">SKU / Material</th>
                      <th className="px-3 py-3 text-left">Status</th>
                      <th className="px-3 py-3 text-left">CD</th>
                      <th className="px-3 py-3 text-right">Folga</th>
                      <th className="px-3 py-3 text-right">Caixas</th>
                      <th className="px-3 py-3 text-right">Kg</th>
                      <th className="px-3 py-3 text-left">Pack</th>
                      <th className="px-3 py-3 text-right">CM risco</th>
                      <th className="px-4 py-3 text-left">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topRisk.map((r) => (
                      <tr key={`${r.codMaterial}-${r.lote}-${r.cd}-${r.vencimento}`} className="border-t border-border/40">
                        <td className="max-w-[360px] px-4 py-3">
                          <div className="font-medium">{r.codMaterial}</div>
                          <div className="truncate text-xs text-muted-foreground">{r.material}</div>
                          <div className="mt-1 text-[10px] text-muted-foreground">Lote {r.lote} · venc. {isoDateBR(r.vencimento)}</div>
                        </td>
                        <td className="px-3 py-3"><Badge variant="outline" className={cn("whitespace-nowrap", statusClass[r.status])}>{statusLabels[r.status]}</Badge></td>
                        <td className="px-3 py-3">{r.cd}</td>
                        <td className="px-3 py-3 text-right">{r.folgaShelfDias ?? "—"} d</td>
                        <td className="px-3 py-3 text-right">{formatNum(r.qtCxs, 0)}</td>
                        <td className="px-3 py-3 text-right">{fmtKg(r.kgEstoque)}</td>
                        <td className="px-3 py-3">
                          <div>{r.embalagem.raw ?? "Revisar"}</div>
                          <div className="text-[10px] text-muted-foreground">{r.embalagem.kgPorCaixa ? `${formatNum(r.embalagem.kgPorCaixa, 2)} kg/cx` : "sem kg/cx"}</div>
                        </td>
                        <td className="px-3 py-3 text-right">{r.impactoCm != null ? formatBRL(r.impactoCm) : "—"}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{actionFor(r)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          </>
        )}
      </div>
    </>
  );
}

function EmptyState() {
  return (
    <GlassCard className="flex min-h-[320px] items-center justify-center">
      <div className="max-w-md text-center">
        <FileSpreadsheet className="mx-auto h-10 w-10 text-muted-foreground" />
        <h3 className="mt-4 text-lg font-semibold">Carregue a planilha de Shelf Life</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          A aba Estoque vai calcular folga real de shelf, kg por caixa, toneladas em risco e impacto financeiro estimado com a base Real.
        </p>
      </div>
    </GlassCard>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 rounded-md border border-border/60 bg-card px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function KpiCard({ icon: Icon, label, value, sub, tone = "primary" }: { icon: typeof Boxes; label: string; value: string; sub: string; tone?: "primary" | "warning" | "danger" | "accent" }) {
  const toneClass = tone === "danger" ? "text-red-500 bg-red-500/10" : tone === "warning" ? "text-yellow-500 bg-yellow-500/10" : tone === "accent" ? "text-accent bg-accent/10" : "text-primary bg-primary/10";
  return (
    <GlassCard className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
          <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
        </div>
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", toneClass)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </GlassCard>
  );
}

function ActionCard({ title, value, text }: { title: string; value: string; text: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/40 p-4">
      <div className="text-xs font-semibold text-muted-foreground">{title}</div>
      <div className="mt-2 text-xl font-semibold">{value}</div>
      <p className="mt-2 text-xs text-muted-foreground">{text}</p>
    </div>
  );
}

function barColor(status: EstoqueStatus) {
  if (status === "bloqueado") return "bg-red-500";
  if (status === "critico") return "bg-orange-500";
  if (status === "atencao") return "bg-yellow-500";
  if (status === "revisar") return "bg-slate-500";
  return "bg-emerald-500";
}

function actionFor(r: EstoqueRow & { impactoCm: number | null }) {
  if (r.status === "revisar") return "Revisar cadastro de shelf, vencimento ou embalagem.";
  if (r.status === "bloqueado") return r.reprocessavel ? "Acionar qualidade/reprocesso e bloquear venda sem exceção." : "Priorizar decisão de descarte ou exceção comercial aprovada.";
  if (r.reprocessavel === false && isRisk(r.status)) return "Forçar plano comercial/CD: risco sem reprocesso.";
  if (r.status === "critico") return "Venda/transferência urgente antes da trava de shelf.";
  if (r.status === "atencao") return "Monitorar semanalmente e criar plano de escoamento.";
  return "Monitorar no ciclo normal.";
}

