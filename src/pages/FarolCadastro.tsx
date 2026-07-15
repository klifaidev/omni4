import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  Radar,
  ArrowLeftRight,
  ChevronsUpDown,
  Check,
  ChevronDown,
  ChevronUp,
  BookOpen,
  FileSpreadsheet,
} from "lucide-react";
import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { KpiCard } from "@/components/pricing/KpiCard";
import { SendToSlideHover } from "@/components/pricing/SendToSlideHover";
import { EmptyState } from "@/components/pricing/EmptyState";
import { FarolGauge } from "@/components/farol/FarolGauge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePricing } from "@/store/pricing";
import { calcFarol, clienteId } from "@/lib/farol";
import type { FarolComparacao, FarolFiltros } from "@/lib/farol";
import type { PricingRow } from "@/lib/types";
import { formatBRL, formatTon, formatPct } from "@/lib/format";
import { usePageTitle } from "@/hooks/use-page-title";
import { cn } from "@/lib/utils";

// ─── Export oportunidades ─────────────────────────────────────────────────────
function exportOportunidadesXlsx(
  result: FarolComparacao,
  allRows: PricingRow[],
  periodoMeses: number,
): void {
  const { skuRef, skuComp, clientesApenasRef } = result;

  // Periodo set used in the comparison (last N)
  const allPeriodos = Array.from(new Set(allRows.map((r) => r.periodo))).sort();
  const periodos = new Set(allPeriodos.slice(-periodoMeses));

  // Filter ref SKU rows within the period
  const refRows = allRows.filter(
    (r) => r.sku === skuRef.sku && periodos.has(r.periodo),
  );

  // avg vol/rol per comp client (for opportunity estimate)
  const avgVolComp = skuComp.clientesAtivos > 0
    ? skuComp.volumeKgTotal / skuComp.clientesAtivos
    : 0;
  const avgRolComp = skuComp.clientesAtivos > 0
    ? skuComp.rolTotal / skuComp.clientesAtivos
    : 0;

  // Build per-client lookup from ref rows
  const clienteSet = new Set(clientesApenasRef);
  const byCliente = new Map<string, { row: PricingRow; vol: number; rol: number; meses: Set<string> }>();

  for (const r of refRows) {
    const id = clienteId(r.cliente);
    if (!id || !clienteSet.has(id)) continue;
    const cur = byCliente.get(id);
    if (cur) {
      cur.vol += r.volumeKg;
      cur.rol += r.rol;
      cur.meses.add(r.periodo);
    } else {
      byCliente.set(id, { row: r, vol: r.volumeKg, rol: r.rol, meses: new Set([r.periodo]) });
    }
  }

  const dados = clientesApenasRef.map((id) => {
    const entry = byCliente.get(id);
    const mesesCompra = entry?.meses.size ?? 1;
    const volMedio = entry ? entry.vol / mesesCompra : 0;
    const rolMedio = entry ? entry.rol / mesesCompra : 0;
    const cliente = entry?.row.cliente ?? id;
    const [codigo, ...restNome] = cliente.split(" ");
    const nomeCliente = restNome.join(" ") || codigo;
    const canalAj = entry?.row.canalAjustado ?? entry?.row.canal ?? "";
    const uf = entry?.row.uf ?? "";
    const opVol = avgVolComp;
    const opCM = avgRolComp * skuComp.margemMedia;

    return {
      "Código Cliente": codigo,
      "Nome Cliente": nomeCliente,
      "Canal Ajustado": canalAj,
      "UF": uf,
      "Volume Médio Mensal no Ref (kg)": +volMedio.toFixed(2),
      "ROL Médio Mensal no Ref (R$)": +rolMedio.toFixed(2),
      "Meses com Compra no Ref": mesesCompra,
      "Op. Volume Estimado (kg)": +opVol.toFixed(2),
      "Op. CM Estimada (R$)": +opCM.toFixed(2),
    };
  });

  const ws = XLSX.utils.json_to_sheet(dados, { origin: "A2" });

  // Title row
  XLSX.utils.sheet_add_aoa(ws, [
    [`Oportunidades — ${skuComp.skuDesc} vs ${skuRef.skuDesc} — Últimos ${periodoMeses} meses`],
  ], { origin: "A1" });

  // Merge title across all 9 columns
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }];

  // Column widths
  ws["!cols"] = [
    { wpx: 100 }, // Código
    { wpx: 200 }, // Nome
    { wpx: 130 }, // Canal
    { wpx: 50 },  // UF
    { wpx: 155 }, // Vol Médio
    { wpx: 160 }, // ROL Médio
    { wpx: 140 }, // Meses
    { wpx: 155 }, // Op Vol
    { wpx: 140 }, // Op CM
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Oportunidades");

  const date = new Date().toISOString().slice(0, 10);
  const safeSku = skuComp.sku.replace(/[^a-zA-Z0-9]/g, "_");
  XLSX.writeFile(wb, `farol_oportunidades_${safeSku}_${date}.xlsx`);
}

// ─── SKU Combobox ─────────────────────────────────────────────────────────────
interface SkuOption { sku: string; desc: string }

function SkuCombobox({
  label,
  value,
  options,
  onChange,
  disabledSku,
}: {
  label: string;
  value: string;
  options: SkuOption[];
  onChange: (v: string) => void;
  disabledSku?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.sku === value);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-10 w-full justify-between border-border/50 bg-secondary/30 text-sm"
          >
            {selected ? (
              <span className="truncate">
                <span className="mr-2 text-xs text-muted-foreground">{selected.sku}</span>
                {selected.desc}
              </span>
            ) : (
              <span className="text-muted-foreground">Selecionar SKU…</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar código ou descrição…" />
            <CommandList>
              <CommandEmpty>Nenhum SKU encontrado.</CommandEmpty>
              <CommandGroup>
                {options.map((o) => (
                  <CommandItem
                    key={o.sku}
                    value={`${o.sku} ${o.desc}`}
                    disabled={o.sku === disabledSku}
                    onSelect={() => {
                      onChange(o.sku);
                      setOpen(false);
                    }}
                    className="text-xs"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-3.5 w-3.5",
                        value === o.sku ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="mr-2 text-muted-foreground">{o.sku}</span>
                    <span className="flex-1 truncate">{o.desc}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ─── Auto-analysis text ───────────────────────────────────────────────────────
function buildAnalysis(result: FarolComparacao, periodoMeses: number): string[] {
  const { skuRef, skuComp, indicePositivacao, clientesAmbos, oportunidadeClientes, oportunidadeCM } = result;

  const s1 = `O SKU ${skuComp.skuDesc} está positivado em ${formatPct(indicePositivacao)} dos clientes do SKU ${skuRef.skuDesc}, representando ${clientesAmbos.length} clientes em comum de ${skuRef.clientesAtivos} totais nos últimos ${periodoMeses} meses.`;

  const s2 =
    oportunidadeClientes > 0
      ? `Existem ${oportunidadeClientes} clientes que já compram ${skuRef.skuDesc} mas ainda não compraram ${skuComp.skuDesc} — eles representam uma oportunidade de ${formatBRL(oportunidadeCM)} em Contribuição Marginal adicional.`
      : `Todos os clientes do SKU Referência já compram o SKU Comparado — cobertura total atingida.`;

  let s3: string;
  if (indicePositivacao >= 0.8) {
    s3 = "O SKU Comparado já tem alta penetração na base do Referência — oportunidade incremental limitada.";
  } else if (indicePositivacao >= 0.5) {
    s3 = "Há espaço relevante de crescimento — priorizar ativação junto ao time comercial.";
  } else {
    s3 = "Baixa penetração — este SKU tem grande potencial não explorado na base de clientes do Referência.";
  }

  return [s1, s2, s3];
}

// ─── Oportunidade card ────────────────────────────────────────────────────────
function OportunidadeCard({
  title,
  value,
  pct,
  subtitle,
  highlight,
  badge,
}: {
  title: string;
  value: string;
  pct: number;
  subtitle: string;
  highlight?: boolean;
  badge?: string;
}) {
  return (
    <GlassCard
      glow={highlight ? "blue" : "none"}
      className={cn(highlight && "border-primary/40")}
    >
      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        <div className="flex items-baseline gap-2">
          <span className={cn("text-2xl font-light tabular-nums", highlight ? "text-primary" : "text-foreground")}>
            {value}
          </span>
          {badge && (
            <Badge variant="secondary" className="text-[10px]">
              {badge}
            </Badge>
          )}
        </div>
        <span className={cn("text-sm font-medium", pct >= 0 ? "text-success" : "text-destructive")}>
          +{(pct * 100).toFixed(1)}% vs atual
        </span>
        <p className="text-xs text-muted-foreground leading-relaxed">{subtitle}</p>
      </div>
    </GlassCard>
  );
}

// ─── Canal breakdown table row ─────────────────────────────────────────────────
function BreakdownRow({ canal, r }: { canal: string; r: FarolComparacao }) {
  const low = r.indicePositivacao < 0.5;
  return (
    <tr className={cn("border-b border-border/20 text-xs", low && "bg-destructive/5")}>
      <td className="px-3 py-2 font-medium text-foreground">{canal}</td>
      <td className="px-3 py-2 tabular-nums text-right">{r.skuRef.clientesAtivos}</td>
      <td className="px-3 py-2 tabular-nums text-right">{r.skuComp.clientesAtivos}</td>
      <td className={cn("px-3 py-2 tabular-nums text-right font-medium", low ? "text-destructive" : r.indicePositivacao >= 0.8 ? "text-success" : "text-warning")}>
        {formatPct(r.indicePositivacao)}
      </td>
      <td className="px-3 py-2 tabular-nums text-right">{r.oportunidadeClientes}</td>
      <td className="px-3 py-2 tabular-nums text-right">{formatBRL(r.oportunidadeCM)}</td>
    </tr>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function FarolCadastro() {
  usePageTitle("Farol de Cadastro");

  const rows = usePricing((s) => s.rows);
  const metric = usePricing((s) => s.metric);
  const navigate = useNavigate();

  const [skuRef, setSkuRef] = useState("");
  const [skuComp, setSkuComp] = useState("");
  const [canalFiltro, setCanalFiltro] = useState<string | null>(null);
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | null>(null);
  const [periodoMeses, setPeriodoMeses] = useState(3);
  const [result, setResult] = useState<FarolComparacao | null | undefined>(undefined);
  // undefined = not run yet, null = no data, FarolComparacao = ok

  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [breakdown, setBreakdown] = useState<{ canal: string; result: FarolComparacao }[] | null>(null);

  // All unique SKUs sorted by volume descending (last 3 months)
  const skuOptions = useMemo<SkuOption[]>(() => {
    const last3 = Array.from(new Set(rows.map((r) => r.periodo))).sort().slice(-3);
    const recent = rows.filter((r) => last3.includes(r.periodo));
    const map = new Map<string, { desc: string; vol: number }>();
    for (const r of recent) {
      if (!r.sku) continue;
      const cur = map.get(r.sku);
      if (cur) { cur.vol += r.volumeKg; }
      else map.set(r.sku, { desc: r.skuDesc ?? r.sku, vol: r.volumeKg });
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1].vol - a[1].vol)
      .map(([sku, { desc }]) => ({ sku, desc }));
  }, [rows]);

  // Available canals
  const canais = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      const c = r.canal ?? r.canalAjustado ?? "";
      if (c) s.add(c);
    }
    return Array.from(s).sort();
  }, [rows]);

  // Available categories
  const categorias = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) { if (r.categoria) s.add(r.categoria); }
    return Array.from(s).sort();
  }, [rows]);

  // Set defaults once data is available
  useEffect(() => {
    if (skuOptions.length === 0) return;
    if (skuRef && skuComp) return; // already set

    const last3 = Array.from(new Set(rows.map((r) => r.periodo))).sort().slice(-3);
    const recentRows = rows.filter((r) => last3.includes(r.periodo));

    // Try Cobertura first
    const cobMap = new Map<string, number>();
    for (const r of recentRows) {
      if (!r.sku) continue;
      const cat = r.categoria?.toLowerCase() ?? "";
      if (cat.includes("cobertura")) cobMap.set(r.sku, (cobMap.get(r.sku) ?? 0) + r.volumeKg);
    }
    const cobSorted = Array.from(cobMap.entries()).sort((a, b) => b[1] - a[1]);

    const refDefault = cobSorted[0]?.[0] ?? skuOptions[0]?.sku ?? "";
    const compDefault =
      cobSorted.length >= 3
        ? cobSorted[2][0]
        : cobSorted.length >= 2
          ? cobSorted[1][0]
          : skuOptions.find((o) => o.sku !== refDefault)?.sku ?? "";

    if (!skuRef && refDefault) setSkuRef(refDefault);
    if (!skuComp && compDefault) setSkuComp(compDefault);
  }, [skuOptions.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-run when both defaults are set (first time only)
  useEffect(() => {
    if (!skuRef || !skuComp || result !== undefined) return;
    runComparison(skuRef, skuComp);
  }, [skuRef, skuComp]); // eslint-disable-line react-hooks/exhaustive-deps

  const runComparison = useCallback(
    (ref = skuRef, comp = skuComp) => {
      const filtros: FarolFiltros = { canal: canalFiltro, categoria: categoriaFiltro, periodoMeses };
      const r = calcFarol(rows, ref, comp, filtros, metric);
      setResult(r);
      setBreakdown(null); // reset lazy breakdown
    },
    [rows, skuRef, skuComp, canalFiltro, categoriaFiltro, periodoMeses, metric],
  );

  // Lazy breakdown when collapsible opens
  useEffect(() => {
    if (!breakdownOpen || !result || breakdown !== null) return;
    const filtros: FarolFiltros = { canal: null, categoria: categoriaFiltro, periodoMeses };
    const bd = canais
      .map((c) => ({
        canal: c,
        result: calcFarol(rows, skuRef, skuComp, { ...filtros, canal: c }, metric),
      }))
      .filter((x): x is { canal: string; result: FarolComparacao } => x.result !== null)
      .sort((a, b) => b.result.oportunidadeCM - a.result.oportunidadeCM);
    setBreakdown(bd);
  }, [breakdownOpen, result]); // eslint-disable-line react-hooks/exhaustive-deps

  if (rows.length === 0) {
    return (
      <div className="flex flex-1 flex-col">
        <Topbar title="Farol de Cadastro" />
        <div className="flex flex-1 items-center justify-center p-8">
          <EmptyState
            title="Farol de Cadastro"
            message="Carregue seus dados para usar o Farol de Cadastro."
            actionLabel="Ir para Upload"
            actionTo="/upload"
          />
        </div>
      </div>
    );
  }

  const analysis = result ? buildAnalysis(result, periodoMeses) : null;

  return (
    <div className="flex flex-1 flex-col">
      <Topbar title="Farol de Cadastro" />

      <div className="flex-1 space-y-6 p-4 md:p-8">
        {/* Page intro */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Radar className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Farol de Cadastro</h1>
            <p className="text-sm text-muted-foreground">
              Compare a positivação de dois SKUs e estime o ganho de cobertura.
            </p>
          </div>
        </div>

        {/* ── ZONA 1 — Seletor ────────────────────────────────── */}
        <GlassCard>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto_1fr]">
            <SkuCombobox
              label="SKU Referência"
              value={skuRef}
              options={skuOptions}
              onChange={setSkuRef}
              disabledSku={skuComp}
            />

            <div className="flex items-end justify-center pb-1.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border/40 bg-card/50 text-muted-foreground">
                <ArrowLeftRight className="h-4 w-4" />
              </div>
            </div>

            <SkuCombobox
              label="SKU Comparado"
              value={skuComp}
              options={skuOptions}
              onChange={setSkuComp}
              disabledSku={skuRef}
            />
          </div>

          {/* Filters + Compare button */}
          <div className="mt-4 flex flex-wrap items-end gap-3">
            {/* Canal */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Canal</span>
              <Select
                value={canalFiltro ?? "__all__"}
                onValueChange={(v) => setCanalFiltro(v === "__all__" ? null : v)}
              >
                <SelectTrigger className="h-9 w-44 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__" className="text-xs">Todos os canais</SelectItem>
                  {canais.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Categoria */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Categoria</span>
              <Select
                value={categoriaFiltro ?? "__all__"}
                onValueChange={(v) => setCategoriaFiltro(v === "__all__" ? null : v)}
              >
                <SelectTrigger className="h-9 w-44 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__" className="text-xs">Todas</SelectItem>
                  {categorias.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Período */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Período</span>
              <Select
                value={String(periodoMeses)}
                onValueChange={(v) => setPeriodoMeses(parseInt(v, 10))}
              >
                <SelectTrigger className="h-9 w-44 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3" className="text-xs">Últimos 3 meses</SelectItem>
                  <SelectItem value="6" className="text-xs">Últimos 6 meses</SelectItem>
                  <SelectItem value="12" className="text-xs">Últimos 12 meses</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              className="h-9"
              onClick={() => runComparison()}
              disabled={!skuRef || !skuComp}
            >
              Comparar
            </Button>
          </div>
        </GlassCard>

        {/* ── ZONA 2 — Resultado ──────────────────────────────── */}
        {result === null && (
          <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
            Não há dados suficientes para um dos SKUs selecionados no período e filtros escolhidos.
          </div>
        )}

        {result && (
          <>
            {/* Main positivation card + KPIs */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[auto_1fr]">
              {/* Gauge card */}
              <SendToSlideHover
                payload={{
                  source: { page: "Farol de Cadastro", visualization: "Velocímetro do Farol" },
                  target: { blockKind: "omni_farol", blockLabel: "Farol de Positivação" },
                  config: { skuRef, skuComp, periodoMeses, periodoRef: null, periodoComp: null, showGauge: true, showStats: true },
                }}
              >
              <GlassCard
                glow={result.indicePositivacao >= 0.8 ? "green" : result.indicePositivacao >= 0.5 ? "none" : "red"}
                className="flex flex-col items-center justify-center px-6 py-8 lg:min-w-[260px]"
              >
                <FarolGauge value={result.indicePositivacao} size={220} />
                <p className="mt-3 max-w-[220px] text-center text-xs text-muted-foreground leading-relaxed">
                  <span className="font-medium text-foreground">{result.skuComp.skuDesc}</span>
                  {" "}positivado nos clientes do{" "}
                  <span className="font-medium text-foreground">{result.skuRef.skuDesc}</span>
                </p>
              </GlassCard>
              </SendToSlideHover>

              {/* KPI grid */}
              <div className="grid grid-cols-2 gap-3">
                <KpiCard
                  label="Clientes Referência"
                  value={result.skuRef.clientesAtivos.toLocaleString("pt-BR")}
                  subValue={`compraram nos últimos ${periodoMeses} meses`}
                  accent="blue"
                />
                <KpiCard
                  label="Clientes Comparado"
                  value={result.skuComp.clientesAtivos.toLocaleString("pt-BR")}
                  delta={result.indicePositivacao - 1}
                  deltaLabel="vs referência"
                  accent={result.indicePositivacao >= 0.8 ? "green" : result.indicePositivacao >= 0.5 ? "amber" : "red"}
                />
                <KpiCard
                  label="Clientes em Comum"
                  value={result.clientesAmbos.length.toLocaleString("pt-BR")}
                  subValue="compram os dois SKUs"
                  accent="green"
                />
                <div className="relative">
                  <KpiCard
                    label="Oportunidade"
                    value={result.oportunidadeClientes.toLocaleString("pt-BR")}
                    subValue="clientes do ref. que não compraram o comp."
                    accent="amber"
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-2 h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          exportOportunidadesXlsx(result, rows, periodoMeses);
                          toast.success(`Arquivo exportado com ${result.clientesApenasRef.length} clientes.`);
                        }}
                        disabled={result.clientesApenasRef.length === 0}
                      >
                        <FileSpreadsheet className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="left">Exportar lista de clientes</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </div>

            {/* ── ZONA 3 — Oportunidades ─────────────────────── */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <OportunidadeCard
                title="Ganho de Volume"
                value={formatTon(result.oportunidadeVolumeKg)}
                pct={result.oportunidadeVolumeKgPct}
                subtitle={`Se os ${result.oportunidadeClientes} clientes do SKU Referência que ainda não compraram o SKU Comparado passassem a comprar com o mesmo ticket médio, o volume cresceria ${formatTon(result.oportunidadeVolumeKg)}.`}
              />
              <OportunidadeCard
                title="Ganho de ROL"
                value={formatBRL(result.oportunidadeRol)}
                pct={result.skuComp.rolTotal > 0 ? result.oportunidadeRol / result.skuComp.rolTotal : 0}
                subtitle={`Estimativa de Receita Operacional Líquida adicional baseada no ticket médio de ${formatBRL(result.skuComp.clientesAtivos > 0 ? result.skuComp.rolTotal / result.skuComp.clientesAtivos : 0)} por cliente.`}
              />
              <OportunidadeCard
                title="Ganho de Contrib. Marginal"
                value={formatBRL(result.oportunidadeCM)}
                pct={result.oportunidadeCMPct}
                highlight
                badge={`${formatPct(result.skuComp.margemMedia)} margem`}
                subtitle={`Baseado na margem média de ${formatPct(result.skuComp.margemMedia)} do SKU Comparado nos últimos ${periodoMeses} meses.`}
              />
            </div>

            {/* ── Análise automática ─────────────────────────── */}
            {analysis && (
              <GlassCard>
                <div className="mb-4 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <BookOpen className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-medium">Leitura do resultado</h2>
                    <p className="text-[11px] text-muted-foreground">Interpretação automática do Farol</p>
                  </div>
                </div>
                <ol className="space-y-3">
                  {analysis.map((sentence, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                        {i + 1}
                      </span>
                      <p className="text-sm text-foreground/80 leading-relaxed">{sentence}</p>
                    </li>
                  ))}
                </ol>
              </GlassCard>
            )}

            {/* ── ZONA 4 — Breakdown por canal (lazy) ─────────── */}
            <Collapsible open={breakdownOpen} onOpenChange={setBreakdownOpen}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl border border-border/40 bg-card/30 px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-card/50"
                >
                  <span>Detalhamento por canal</span>
                  {breakdownOpen ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <GlassCard className="mt-2 p-0 overflow-hidden">
                  {breakdown === null ? (
                    <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                      Calculando…
                    </div>
                  ) : breakdown.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                      Sem dados suficientes por canal.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr className="border-b border-border/40 bg-card/60 text-muted-foreground">
                            <th className="px-3 py-2 text-left font-semibold">Canal</th>
                            <th className="px-3 py-2 text-right font-semibold">Clientes Ref.</th>
                            <th className="px-3 py-2 text-right font-semibold">Clientes Comp.</th>
                            <th className="px-3 py-2 text-right font-semibold">Positivação</th>
                            <th className="px-3 py-2 text-right font-semibold">Op. Clientes</th>
                            <th className="px-3 py-2 text-right font-semibold">Op. CM</th>
                          </tr>
                        </thead>
                        <tbody>
                          {breakdown.map(({ canal, result: r }) => (
                            <BreakdownRow key={canal} canal={canal} r={r} />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </GlassCard>
              </CollapsibleContent>
            </Collapsible>
          </>
        )}
      </div>
    </div>
  );
}
