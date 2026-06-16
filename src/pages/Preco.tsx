import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { KpiCard } from "@/components/pricing/KpiCard";
import { EmptyState } from "@/components/pricing/EmptyState";
import { DataTable, type DataTableColumn } from "@/components/pricing/DataTable";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { usePricing } from "@/store/pricing";
import { useFyList, useMonthsInfo } from "@/store/selectors";
import {
  applyFilters,
  computePriceDecomposition,
  type PriceDecompositionResult,
  type PriceDecompositionSku,
} from "@/lib/analytics";
import { formatBRL, formatPct, formatNum } from "@/lib/format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowRight,
  BookOpen,
  Calendar,
  CalendarDays,
  Info,
  MapPin,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { usePageTitle } from "@/hooks/use-page-title";

type PeriodMode = "month" | "fy";
type RankingMetric = "preco" | "mix" | "total";
type EvolDim = "total" | "marca" | "canal";

type UfMapPoint = {
  uf: string;
  label: string;
  x: number;
  y: number;
};

const fmtRsKg = (v: number) => formatBRL(v, { digits: 2 });

const UF_MAP_POINTS: UfMapPoint[] = [
  { uf: "RR", label: "Roraima", x: 322, y: 48 },
  { uf: "AP", label: "Amapá", x: 466, y: 88 },
  { uf: "AM", label: "Amazonas", x: 230, y: 154 },
  { uf: "PA", label: "Pará", x: 432, y: 170 },
  { uf: "AC", label: "Acre", x: 110, y: 285 },
  { uf: "RO", label: "Rondônia", x: 220, y: 292 },
  { uf: "MT", label: "Mato Grosso", x: 350, y: 330 },
  { uf: "TO", label: "Tocantins", x: 502, y: 302 },
  { uf: "MA", label: "Maranhão", x: 595, y: 222 },
  { uf: "PI", label: "Piauí", x: 650, y: 270 },
  { uf: "CE", label: "Ceará", x: 720, y: 248 },
  { uf: "RN", label: "Rio Grande do Norte", x: 790, y: 260 },
  { uf: "PB", label: "Paraíba", x: 806, y: 298 },
  { uf: "PE", label: "Pernambuco", x: 778, y: 330 },
  { uf: "AL", label: "Alagoas", x: 760, y: 366 },
  { uf: "SE", label: "Sergipe", x: 742, y: 402 },
  { uf: "BA", label: "Bahia", x: 642, y: 400 },
  { uf: "GO", label: "Goiás", x: 470, y: 416 },
  { uf: "DF", label: "Distrito Federal", x: 520, y: 396 },
  { uf: "MS", label: "Mato Grosso do Sul", x: 380, y: 505 },
  { uf: "MG", label: "Minas Gerais", x: 570, y: 500 },
  { uf: "ES", label: "Espírito Santo", x: 680, y: 514 },
  { uf: "RJ", label: "Rio de Janeiro", x: 626, y: 568 },
  { uf: "SP", label: "São Paulo", x: 516, y: 585 },
  { uf: "PR", label: "Paraná", x: 458, y: 660 },
  { uf: "SC", label: "Santa Catarina", x: 500, y: 730 },
  { uf: "RS", label: "Rio Grande do Sul", x: 468, y: 820 },
];

export default function Preco() {
  usePageTitle("Análise de Preço");

  const rows = usePricing((s) => s.rows);
  const filters = usePricing((s) => s.filters);
  const selectedPeriods = usePricing((s) => s.selectedPeriods);
  const fyList = useFyList();
  const months = useMonthsInfo();

  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
  const [base, setBase] = useState<string | null>(null);
  const [comp, setComp] = useState<string | null>(null);
  const [rankingMetric, setRankingMetric] = useState<RankingMetric>("preco");
  const [evolDim, setEvolDim] = useState<EvolDim>("total");
  const [selectedUf, setSelectedUf] = useState<string | null>(null);
  const [showFilterNote, setShowFilterNote] = useState(true);

  const options = useMemo(
    () =>
      periodMode === "fy"
        ? fyList.map((fy) => ({ value: fy, label: fy }))
        : months.map((m) => ({ value: m.periodo, label: m.label })),
    [periodMode, fyList, months],
  );

  useEffect(() => {
    if (options.length < 2) return;
    const values = new Set(options.map((o) => o.value));
    const baseOk = base && values.has(base);
    const compOk = comp && values.has(comp);
    if (!baseOk || !compOk) {
      setBase(options[0].value);
      setComp(options[options.length - 1].value);
    }
  }, [options, base, comp]);

  // Períodos são controlados exclusivamente pelos seletores base/comp desta página.
  // O selectedPeriods global é ignorado aqui para não bloquear silenciosamente a análise.
  const filtered = useMemo(
    () => applyFilters(rows, filters, null),
    [rows, filters],
  );

  const result = useMemo(() => {
    if (!base || !comp || base === comp) return null;
    const labels =
      periodMode === "month"
        ? {
            base: months.find((m) => m.periodo === base)?.label ?? base,
            comp: months.find((m) => m.periodo === comp)?.label ?? comp,
          }
        : { base, comp };
    return computePriceDecomposition(filtered, base, comp, periodMode, labels);
  }, [filtered, base, comp, periodMode, months]);

  if (rows.length === 0) {
    return (
      <>
        <Topbar title="Análise de Preço" />
        <div className="px-8 py-6">
          <EmptyState
            title="Sem dados para análise de preço"
            message="Carregue ao menos dois períodos para decompor a variação de preço médio em efeito preço puro vs. mix de SKUs."
            actionLabel="Ir para Upload"
            actionTo="/upload"
          />
        </div>
      </>
    );
  }

  const notEnough =
    (periodMode === "fy" && fyList.length < 2) || (periodMode === "month" && months.length < 2);

  return (
    <>
      <Topbar
        title="Análise de Preço"
        subtitle="Decomposição da variação de preço médio em efeito puro vs. mix"
      />
      <div className="space-y-6 px-8 py-6">
        <GlassCard className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Comparar por
              </div>
              <ToggleGroup
                type="single"
                value={periodMode}
                onValueChange={(v) => v && setPeriodMode(v as PeriodMode)}
                className="mt-1.5 inline-flex rounded-full border border-border/50 bg-secondary/30 p-1"
              >
                <ToggleGroupItem
                  value="fy"
                  className="h-8 gap-1.5 rounded-full px-4 text-xs data-[state=on]:bg-primary/20 data-[state=on]:text-primary data-[state=on]:shadow-sm"
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  Ano Fiscal
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="month"
                  className="h-8 gap-1.5 rounded-full px-4 text-xs data-[state=on]:bg-primary/20 data-[state=on]:text-primary data-[state=on]:shadow-sm"
                >
                  <Calendar className="h-3.5 w-3.5" />
                  Mês
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>

          {notEnough ? (
            <p className="text-sm text-muted-foreground">
              {periodMode === "fy"
                ? `Carregue ao menos dois anos fiscais. Você tem: ${fyList.join(", ") || "—"}`
                : `Carregue ao menos dois meses para comparar.`}
            </p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <PeriodSelect
                label={periodMode === "fy" ? "Base (FY)" : "Período base"}
                value={base}
                onChange={(v) => setBase(v)}
                options={options}
              />
              <div className="flex h-10 items-center text-primary/60">
                <ArrowRight className="h-5 w-5" />
              </div>
              <PeriodSelect
                label={periodMode === "fy" ? "Comparação (FY)" : "Período de comparação"}
                value={comp}
                onChange={(v) => setComp(v)}
                options={options}
                excludeValue={base}
              />
              {base && comp && base === comp && (
                <p className="pb-2.5 text-xs text-warning">Selecione períodos diferentes.</p>
              )}
            </div>
          )}
        </GlassCard>

        {selectedPeriods !== null && showFilterNote && (
          <Alert className="relative border-primary/30 bg-primary/5 text-foreground">
            <Info className="h-4 w-4 text-primary" />
            <AlertDescription className="pr-8 text-sm">
              Os filtros de período do Topbar não afetam a Análise de Preço. Use os seletores de período acima.
            </AlertDescription>
            <button
              type="button"
              onClick={() => setShowFilterNote(false)}
              className="absolute right-2 top-2 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Fechar aviso"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </Alert>
        )}

        {!result ? (
          <GlassCard className="py-12 text-center text-sm text-muted-foreground">
            {base && comp && base !== comp
              ? "Sem dados para os períodos selecionados. Verifique se os filtros dimensionais não estão excluindo todos os dados."
              : "Configure os períodos base e comparação para visualizar a decomposição."}
          </GlassCard>
        ) : (
          <>
            <DecompositionKpis result={result} />
            <DecompositionCards result={result} />
            <PriceUfMapSection
              rows={filtered}
              base={base}
              comp={comp}
              periodMode={periodMode}
              selectedUf={selectedUf}
              onSelectedUfChange={setSelectedUf}
            />
            <ReadingCard result={result} />
            <RankingSection
              result={result}
              metric={rankingMetric}
              onMetricChange={setRankingMetric}
            />
            <EvolutionSection rows={filtered} dim={evolDim} onDimChange={setEvolDim} />
          </>
        )}
      </div>
    </>
  );
}

function PeriodSelect({
  label,
  value,
  onChange,
  options,
  excludeValue,
}: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  excludeValue?: string | null;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <Select value={value ?? undefined} onValueChange={onChange}>
        <SelectTrigger className="h-10 w-48 border-border/50 bg-secondary/40 text-sm">
          <SelectValue placeholder="Escolha..." />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} disabled={o.value === excludeValue}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DecompositionKpis({ result }: { result: PriceDecompositionResult }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <KpiCard
        label={`Preço médio • ${result.baseLabel}`}
        value={`${fmtRsKg(result.precoMedioBase)}/kg`}
        accent="violet"
      />
      <KpiCard
        label={`Preço médio • ${result.compLabel}`}
        value={`${fmtRsKg(result.precoMedioComp)}/kg`}
        accent="blue"
        delta={result.variacaoPct}
        deltaLabel={`vs. ${result.baseLabel}`}
      />
      <KpiCard
        label="Variação total"
        value={`${result.variacaoTotal >= 0 ? "+" : "−"}${fmtRsKg(Math.abs(result.variacaoTotal))}/kg`}
        subValue={formatPct(result.variacaoPct)}
        accent={result.variacaoTotal >= 0 ? "green" : "red"}
      />
    </div>
  );
}

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
    <GlassCard
      glow={positive ? "green" : "red"}
      className="space-y-4"
    >
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
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                aria-label="Saiba mais"
              >
                <Info className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">{tooltip}</TooltipContent>
          </UiTooltip>
        </TooltipProvider>
      </div>

      <div className="space-y-1">
        <div
          className={`break-words text-3xl font-light tabular-nums ${
            positive ? "text-success" : "text-destructive"
          }`}
        >
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
          <div
            className={`h-full rounded-full ${positive ? "bg-success" : "bg-destructive"}`}
            style={{ width: `${share * 100}%` }}
          />
        </div>
      </div>
    </GlassCard>
  );
}

function DecompositionCards({ result }: { result: PriceDecompositionResult }) {
  const totalAbs = Math.abs(result.efeitoPrecoRs) + Math.abs(result.efeitoMixRs);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <EffectCard
        title="Efeito Preço Puro"
        tooltip="Variação explicada pela mudança de preço real de cada SKU, mantendo o mix constante."
        rsPerKg={result.efeitoPrecoRsKg}
        rsTotal={result.efeitoPrecoRs}
        pct={result.pctPreco}
        totalAbs={totalAbs}
        Icon={result.efeitoPrecoRs >= 0 ? TrendingUp : TrendingDown}
      />
      <EffectCard
        title="Efeito Mix de SKUs"
        tooltip="Variação explicada pela mudança na participação de volume de cada SKU, entrada/saída de SKUs e ajustes sem volume que afetam o preço médio."
        rsPerKg={result.efeitoMixRsKg}
        rsTotal={result.efeitoMixRs}
        pct={result.pctMix}
        totalAbs={totalAbs}
        Icon={result.efeitoMixRs >= 0 ? TrendingUp : TrendingDown}
      />
    </div>
  );
}

function ReadingCard({ result }: { result: PriceDecompositionResult }) {
  const sentences: React.ReactNode[] = [];
  const sign = result.variacaoTotal >= 0 ? "cresceu" : "recuou";
  const tone = result.variacaoTotal >= 0 ? "text-success" : "text-destructive";
  sentences.push(
    <>
      O preço médio <span className={`font-semibold ${tone}`}>{sign}</span>{" "}
      <span className="font-semibold">
        {fmtRsKg(Math.abs(result.variacaoTotal))}/kg ({formatPct(Math.abs(result.variacaoPct))})
      </span>{" "}
      de <span className="font-semibold">{result.baseLabel}</span> para{" "}
      <span className="font-semibold">{result.compLabel}</span>.
    </>,
  );

  const absPreco = Math.abs(result.pctPreco);
  const absMix = Math.abs(result.pctMix);
  if (absPreco > 0.6) {
    sentences.push(
      <>
        A variação foi predominantemente explicada por mudança de{" "}
        <span className="font-semibold text-primary">preço real</span> (
        {formatPct(absPreco)}), indicando{" "}
        {result.efeitoPrecoRs >= 0 ? "aumento" : "redução"} efetivo nos preços praticados.
      </>,
    );
  } else if (absMix > 0.6) {
    sentences.push(
      <>
        A variação foi predominantemente explicada por mudança no{" "}
        <span className="font-semibold text-primary">mix de SKUs</span> (
        {formatPct(absMix)}), com pouca alteração nos preços reais praticados.
      </>,
    );
  } else {
    sentences.push(
      <>
        A variação foi causada por uma combinação de{" "}
        <span className="font-semibold text-primary">preço real</span> ({formatPct(absPreco)}) e{" "}
        <span className="font-semibold text-primary">mix</span> ({formatPct(absMix)}).
      </>,
    );
  }

  const top = [...result.skus].sort(
    (a, b) => Math.abs(b.deltaPrecoRs) - Math.abs(a.deltaPrecoRs),
  )[0];
  if (top && top.deltaPrecoRs !== 0) {
    sentences.push(
      <>
        O SKU mais impactante no efeito preço foi{" "}
        <span className="font-semibold">{top.skuDesc}</span> com{" "}
        <span className="font-semibold">
          {top.deltaPreco >= 0 ? "+" : "−"}
          {fmtRsKg(Math.abs(top.deltaPreco))}/kg
        </span>{" "}
        de variação e impacto total de{" "}
        <span
          className={`font-semibold ${
            top.deltaPrecoRs >= 0 ? "text-success" : "text-destructive"
          }`}
        >
          {top.deltaPrecoRs >= 0 ? "+" : "−"}
          {formatBRL(Math.abs(top.deltaPrecoRs), { compact: true })}
        </span>
        .
      </>,
    );
  }

  return (
    <GlassCard className="space-y-3">
      <header className="flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-primary" />
        <h2 className="text-base font-medium">Leitura automática</h2>
      </header>
      <div className="space-y-2 text-sm leading-relaxed text-foreground">
        {sentences.map((s, i) => (
          <p key={i}>{s}</p>
        ))}
      </div>
    </GlassCard>
  );
}

function PriceUfMapSection({
  rows,
  base,
  comp,
  periodMode,
  selectedUf,
  onSelectedUfChange,
}: {
  rows: ReturnType<typeof applyFilters>;
  base: string | null;
  comp: string | null;
  periodMode: PeriodMode;
  selectedUf: string | null;
  onSelectedUfChange: (uf: string | null) => void;
}) {
  const periodMatches = (periodo: string, fy: string, target: string | null) => {
    if (!target) return false;
    return periodMode === "fy" ? fy === target : periodo === target;
  };

  const data = useMemo(() => {
    if (!comp) return [];
    const compByUf = new Map<string, { rol: number; volumeKg: number }>();
    const baseByUf = new Map<string, { rol: number; volumeKg: number }>();

    for (const row of rows) {
      const uf = (row.uf ?? "").trim().toUpperCase();
      if (!uf) continue;
      if (periodMatches(row.periodo, row.fy, comp)) {
        const cur = compByUf.get(uf) ?? { rol: 0, volumeKg: 0 };
        cur.rol += row.rol;
        cur.volumeKg += row.volumeKg;
        compByUf.set(uf, cur);
      }
      if (periodMatches(row.periodo, row.fy, base)) {
        const cur = baseByUf.get(uf) ?? { rol: 0, volumeKg: 0 };
        cur.rol += row.rol;
        cur.volumeKg += row.volumeKg;
        baseByUf.set(uf, cur);
      }
    }

    const totalVolume = Array.from(compByUf.values()).reduce((acc, cur) => acc + cur.volumeKg, 0);
    return UF_MAP_POINTS.map((point) => {
      const compValue = compByUf.get(point.uf) ?? { rol: 0, volumeKg: 0 };
      const baseValue = baseByUf.get(point.uf);
      const precoMedio = compValue.volumeKg > 0 ? compValue.rol / compValue.volumeKg : 0;
      const precoBase =
        baseValue && baseValue.volumeKg > 0 ? baseValue.rol / baseValue.volumeKg : null;
      return {
        ...point,
        rol: compValue.rol,
        volumeKg: compValue.volumeKg,
        precoMedio,
        volumeShare: totalVolume > 0 ? compValue.volumeKg / totalVolume : 0,
        precoBase,
        variacaoPreco: precoBase !== null ? precoMedio - precoBase : null,
      };
    }).filter((point) => point.volumeKg > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, base, comp, periodMode]);

  const explicitSelection = data.find((point) => point.uf === selectedUf) ?? null;
  const selected = explicitSelection ?? [...data].sort((a, b) => b.volumeKg - a.volumeKg)[0] ?? null;
  const prices = data.map((point) => point.precoMedio).filter((value) => value > 0);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const maxShare = Math.max(...data.map((point) => point.volumeShare), 0);
  const ranked = [...data].sort((a, b) => b.volumeKg - a.volumeKg).slice(0, 6);

  const colorForPrice = (value: number) => {
    const span = maxPrice - minPrice;
    const t = span > 0 ? (value - minPrice) / span : 0.5;
    const hue = 210 - t * 210;
    return `hsl(${hue} 85% 52%)`;
  };

  const radiusForShare = (share: number) => {
    if (maxShare <= 0) return 12;
    return 12 + Math.sqrt(share / maxShare) * 24;
  };

  return (
    <GlassCard className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-medium">Preço médio por UF</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Cor = PM R$/kg no período de comparação. Tamanho = importância de volume da UF.
          </p>
        </div>
        {explicitSelection && (
          <button
            type="button"
            onClick={() => onSelectedUfChange(null)}
            className="rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
          >
            Limpar seleção
          </button>
        )}
      </header>

      {data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/70 px-4 py-10 text-center text-sm text-muted-foreground">
          Não há UF com volume no período selecionado para montar o mapa.
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
          <div className="rounded-lg border border-border/50 bg-secondary/20 p-3">
            <svg
              viewBox="0 0 900 900"
              role="img"
              aria-label="Mapa analítico de preço médio por UF"
              className="h-[520px] w-full"
            >
              <path
                d="M330 30 L470 70 L565 150 L690 230 L810 280 L760 410 L695 510 L645 610 L540 660 L505 820 L395 855 L335 725 L210 665 L120 565 L95 420 L55 320 L150 185 Z"
                fill="hsl(var(--secondary) / 0.32)"
                stroke="hsl(var(--border))"
                strokeWidth="2"
              />
              {data.map((point) => {
                const selectedPoint = selected?.uf === point.uf;
                const radius = radiusForShare(point.volumeShare);
                return (
                  <g
                    key={point.uf}
                    tabIndex={0}
                    role="button"
                    aria-label={`${point.label}: ${fmtRsKg(point.precoMedio)}/kg, ${formatPct(point.volumeShare)} do volume`}
                    onClick={() => onSelectedUfChange(point.uf)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelectedUfChange(point.uf);
                      }
                    }}
                    className="cursor-pointer outline-none"
                  >
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={radius + (selectedPoint ? 7 : 0)}
                      fill={selectedPoint ? "hsl(var(--primary) / 0.18)" : "transparent"}
                    />
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={radius}
                      fill={colorForPrice(point.precoMedio)}
                      opacity={selectedPoint ? 1 : 0.82}
                      stroke={selectedPoint ? "hsl(var(--foreground))" : "hsl(var(--background))"}
                      strokeWidth={selectedPoint ? 4 : 2}
                    >
                      <title>
                        {point.label} • {fmtRsKg(point.precoMedio)}/kg • {formatPct(point.volumeShare)} do volume
                      </title>
                    </circle>
                    <text
                      x={point.x}
                      y={point.y + 4}
                      textAnchor="middle"
                      className="select-none fill-background text-[22px] font-semibold"
                    >
                      {point.uf}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-[11px] text-muted-foreground">
              <span>PM menor: {fmtRsKg(minPrice)}/kg</span>
              <div className="h-2 w-48 rounded-full bg-gradient-to-r from-blue-500 via-emerald-500 to-red-500" />
              <span>PM maior: {fmtRsKg(maxPrice)}/kg</span>
            </div>
          </div>

          <aside className="space-y-4">
            {selected && (
              <div className="rounded-lg border border-border/60 bg-background/70 p-4">
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  UF selecionada
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-3">
                  <h3 className="text-xl font-semibold">{selected.label}</h3>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                    {selected.uf}
                  </span>
                </div>
                <div className="mt-4 grid gap-3">
                  <MapMetric label="Preço médio" value={`${fmtRsKg(selected.precoMedio)}/kg`} />
                  <MapMetric
                    label="Importância no volume"
                    value={formatPct(selected.volumeShare)}
                    helper={`${formatNum(selected.volumeKg / 1000, 1)} t`}
                  />
                  <MapMetric
                    label="Variação vs. base"
                    value={
                      selected.variacaoPreco === null
                        ? "Sem base"
                        : `${selected.variacaoPreco >= 0 ? "+" : "−"}${fmtRsKg(Math.abs(selected.variacaoPreco))}/kg`
                    }
                    tone={
                      selected.variacaoPreco === null
                        ? "neutral"
                        : selected.variacaoPreco >= 0
                        ? "positive"
                        : "negative"
                    }
                  />
                </div>
              </div>
            )}

            <div className="rounded-lg border border-border/60 bg-background/70 p-4">
              <h3 className="text-sm font-medium">UFs mais relevantes em volume</h3>
              <div className="mt-3 space-y-3">
                {ranked.map((point) => (
                  <button
                    key={point.uf}
                    type="button"
                    onClick={() => onSelectedUfChange(point.uf)}
                    className="grid w-full grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-secondary/50"
                  >
                    <span className="rounded-md bg-secondary px-2 py-1 text-center text-xs font-semibold">
                      {point.uf}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{point.label}</span>
                      <span className="block text-xs text-muted-foreground">
                        {formatPct(point.volumeShare)} do volume
                      </span>
                    </span>
                    <span className="text-sm font-medium tabular-nums">
                      {fmtRsKg(point.precoMedio)}/kg
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>
      )}
    </GlassCard>
  );
}

function MapMetric({
  label,
  value,
  helper,
  tone = "neutral",
}: {
  label: string;
  value: string;
  helper?: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  const color =
    tone === "positive" ? "text-success" : tone === "negative" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-md bg-secondary/40 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${color}`}>{value}</div>
      {helper && <div className="text-xs text-muted-foreground">{helper}</div>}
    </div>
  );
}

function RankingSection({
  result,
  metric,
  onMetricChange,
}: {
  result: PriceDecompositionResult;
  metric: RankingMetric;
  onMetricChange: (m: RankingMetric) => void;
}) {
  const valueOf = (s: PriceDecompositionSku) =>
    metric === "preco"
      ? s.deltaPrecoRs
      : metric === "mix"
      ? s.efeitoMixRs
      : s.deltaPrecoRs + s.efeitoMixRs;

  const top10 = useMemo(
    () =>
      [...result.skus]
        .filter((s) => valueOf(s) !== 0)
        .sort((a, b) => Math.abs(valueOf(b)) - Math.abs(valueOf(a)))
        .slice(0, 10)
        .map((s) => ({
          name: (s.skuDesc || s.sku).slice(0, 20),
          fullName: s.skuDesc || s.sku,
          value: valueOf(s),
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result.skus, metric],
  );

  const tableRows = useMemo(
    () =>
      [...result.skus]
        .sort((a, b) => Math.abs(b.deltaPrecoRs) - Math.abs(a.deltaPrecoRs))
        .map((s) => ({
          ...s,
          skuLabel: s.skuDesc || s.sku,
          volBaseT: s.volumeBase / 1000,
          volCompT: s.volumeComp / 1000,
          mixBasePct: s.shareBase * 100,
          mixCompPct: s.shareComp * 100,
        })),
    [result.skus],
  );

  type Row = (typeof tableRows)[number];
  const columns: DataTableColumn<Row>[] = [
    { key: "skuLabel", label: "SKU", align: "left" },
    { key: "volBaseT", label: "Vol Base (t)", align: "right", format: (v) => formatNum(Number(v), 1) },
    { key: "volCompT", label: "Vol Comp (t)", align: "right", format: (v) => formatNum(Number(v), 1) },
    { key: "precoBase", label: "Preço Base", align: "right", format: (v) => fmtRsKg(Number(v)) },
    { key: "precoComp", label: "Preço Comp", align: "right", format: (v) => fmtRsKg(Number(v)) },
    {
      key: "deltaPreco",
      label: "Δ Preço (R$/kg)",
      align: "right",
      format: (v) => {
        const n = Number(v);
        return (
          <span className={n >= 0 ? "text-success" : "text-destructive"}>
            {n >= 0 ? "+" : "−"}
            {fmtRsKg(Math.abs(n))}
          </span>
        );
      },
    },
    {
      key: "deltaPrecoRs",
      label: "Efeito Preço (R$)",
      align: "right",
      format: (v) => {
        const n = Number(v);
        return (
          <span className={n >= 0 ? "text-success" : "text-destructive"}>
            {formatBRL(n, { compact: true })}
          </span>
        );
      },
    },
    { key: "mixBasePct", label: "Mix Base", align: "right", format: (v) => `${formatNum(Number(v), 2)}%` },
    { key: "mixCompPct", label: "Mix Comp", align: "right", format: (v) => `${formatNum(Number(v), 2)}%` },
    {
      key: "efeitoMixRs",
      label: "Efeito Mix (R$)",
      align: "right",
      format: (v) => {
        const n = Number(v);
        return (
          <span className={n >= 0 ? "text-success" : "text-destructive"}>
            {formatBRL(n, { compact: true })}
          </span>
        );
      },
    },
  ];

  return (
    <GlassCard className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Ranking de SKUs por variação de preço</h2>
          <p className="text-xs text-muted-foreground">
            Top 10 SKUs por impacto absoluto. Use o seletor para mudar a métrica.
          </p>
        </div>
        <ToggleGroup
          type="single"
          value={metric}
          onValueChange={(v) => v && onMetricChange(v as RankingMetric)}
          className="inline-flex rounded-full border border-border/50 bg-secondary/30 p-1"
        >
          <ToggleGroupItem
            value="preco"
            className="h-8 rounded-full px-3 text-xs data-[state=on]:bg-primary/20 data-[state=on]:text-primary"
          >
            Preço Puro
          </ToggleGroupItem>
          <ToggleGroupItem
            value="mix"
            className="h-8 rounded-full px-3 text-xs data-[state=on]:bg-primary/20 data-[state=on]:text-primary"
          >
            Mix
          </ToggleGroupItem>
          <ToggleGroupItem
            value="total"
            className="h-8 rounded-full px-3 text-xs data-[state=on]:bg-primary/20 data-[state=on]:text-primary"
          >
            Impacto Total
          </ToggleGroupItem>
        </ToggleGroup>
      </header>

      <div className="h-[360px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={top10}
            layout="vertical"
            margin={{ top: 8, right: 60, left: 8, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis
              type="number"
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickFormatter={(v) => formatBRL(Number(v), { compact: true })}
            />
            <YAxis
              type="category"
              dataKey="name"
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              width={140}
            />
            <RTooltip
              cursor={{ fill: "hsl(var(--secondary) / 0.4)" }}
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value: number) => [formatBRL(value, { compact: true }), "Impacto"]}
              labelFormatter={(_, payload) =>
                (payload?.[0]?.payload as { fullName?: string } | undefined)?.fullName ?? ""
              }
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {top10.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.value >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <DataTable
        rows={tableRows}
        columns={columns}
        searchable
        searchKeys={["skuLabel"]}
        pageSize={20}
      />
    </GlassCard>
  );
}

function EvolutionSection({
  rows,
  dim,
  onDimChange,
}: {
  rows: ReturnType<typeof applyFilters>;
  dim: EvolDim;
  onDimChange: (d: EvolDim) => void;
}) {
  const months = useMonthsInfo();
  const labelOf = (periodo: string) =>
    months.find((m) => m.periodo === periodo)?.label ?? periodo;

  const { data, keys } = useMemo(() => {
    const periods = Array.from(new Set(rows.map((r) => r.periodo))).sort();
    const byPeriod = new Map<string, Map<string, { rol: number; vol: number }>>();
    const seriesSet = new Set<string>();
    for (const r of rows) {
      const seriesKey =
        dim === "total" ? "Total" : (dim === "marca" ? r.marca : r.canal) || "—";
      seriesSet.add(seriesKey);
      const p = byPeriod.get(r.periodo) ?? new Map();
      const cur = p.get(seriesKey) ?? { rol: 0, vol: 0 };
      cur.rol += r.rol;
      cur.vol += r.volumeKg;
      p.set(seriesKey, cur);
      byPeriod.set(r.periodo, p);
    }
    let keys = Array.from(seriesSet);
    if (dim !== "total") {
      const totals = new Map<string, number>();
      for (const p of byPeriod.values()) {
        for (const [k, v] of p) {
          totals.set(k, (totals.get(k) ?? 0) + v.vol);
        }
      }
      keys = keys
        .sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0))
        .slice(0, 6);
    }
    const data = periods.map((per) => {
      const m = byPeriod.get(per) ?? new Map();
      const row: Record<string, number | string> = { period: labelOf(per) };
      for (const k of keys) {
        const v = m.get(k);
        row[k] = v && v.vol > 0 ? v.rol / v.vol : 0;
      }
      return row;
    });
    return { data, keys };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, dim, months]);

  const palette = [
    "hsl(var(--primary))",
    "hsl(var(--success))",
    "hsl(var(--warning))",
    "hsl(var(--accent))",
    "hsl(var(--destructive))",
    "#9b87f5",
  ];

  return (
    <GlassCard className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Evolução do preço médio</h2>
          <p className="text-xs text-muted-foreground">
            Preço médio (R$/kg) por período = ROL / Volume.
          </p>
        </div>
        <ToggleGroup
          type="single"
          value={dim}
          onValueChange={(v) => v && onDimChange(v as EvolDim)}
          className="inline-flex rounded-full border border-border/50 bg-secondary/30 p-1"
        >
          <ToggleGroupItem
            value="total"
            className="h-8 rounded-full px-3 text-xs data-[state=on]:bg-primary/20 data-[state=on]:text-primary"
          >
            Total
          </ToggleGroupItem>
          <ToggleGroupItem
            value="marca"
            className="h-8 rounded-full px-3 text-xs data-[state=on]:bg-primary/20 data-[state=on]:text-primary"
          >
            Por Marca
          </ToggleGroupItem>
          <ToggleGroupItem
            value="canal"
            className="h-8 rounded-full px-3 text-xs data-[state=on]:bg-primary/20 data-[state=on]:text-primary"
          >
            Por Canal
          </ToggleGroupItem>
        </ToggleGroup>
      </header>

      <div className="h-[340px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis dataKey="period" stroke="hsl(var(--muted-foreground))" fontSize={11} />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickFormatter={(v) => fmtRsKg(Number(v))}
            />
            <RTooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value: number, name: string) => [`${fmtRsKg(value)}/kg`, name]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {keys.map((k, i) => (
              <Line
                key={k}
                type="monotone"
                dataKey={k}
                stroke={palette[i % palette.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>
  );
}
