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
  uniqueValues,
  type PriceDecompositionResult,
  type PriceDecompositionSku,
} from "@/lib/analytics";
import { getUfFromRegiao } from "@/lib/deparaComercial";
import { formatBRL, formatPct, formatNum } from "@/lib/format";
import { MultiSelectFilter } from "@/components/pricing/MultiSelectFilter";
import brMapRaw from "@/assets/br.svg?raw";
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
  BarChart3,
  BookOpen,
  Calendar,
  CalendarDays,
  Filter,
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
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { usePageTitle } from "@/hooks/use-page-title";
import type { FilterKey, PricingRow } from "@/lib/types";

type PeriodMode = "month" | "fy";
type RankingMetric = "preco" | "mix" | "total";
type EvolDim = "total" | "marca" | "canal";

type UfMapPoint = {
  uf: string;
  label: string;
  x: number;
  y: number;
};

type BrazilStatePath = {
  uf: string;
  name: string;
  d: string;
};

const fmtRsKg = (v: number) => formatBRL(v, { digits: 2 });
const SVG_UF_ID = /^BR([A-Z]{2})$/;

const PRODUCT_FILTER_FIELDS: { key: FilterKey; label: string }[] = [
  { key: "categoria", label: "Categoria" },
  { key: "subcategoria", label: "Subcategoria" },
  { key: "marca", label: "Marca" },
  { key: "formato", label: "Formato" },
  { key: "sku", label: "SKU" },
];

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
const VALID_UFS = new Set(UF_MAP_POINTS.map((point) => point.uf));
const STATE_NAME_TO_UF = new Map(
  UF_MAP_POINTS.flatMap((point) => [
    [normalizeText(point.label), point.uf],
    [normalizeText(point.uf), point.uf],
  ]),
);
STATE_NAME_TO_UF.set(normalizeText("Brasília"), "DF");
STATE_NAME_TO_UF.set(normalizeText("Distrito Federal"), "DF");

function normalizeText(value: string | undefined | null): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUf(value: string | undefined | null): string | null {
  const text = normalizeText(value);
  if (!text) return null;
  if (VALID_UFS.has(text)) return text;
  const brCode = text.match(/\bBR\s*\/\s*([A-Z]{2})\b/)?.[1];
  if (brCode && VALID_UFS.has(brCode)) return brCode;
  const exactName = STATE_NAME_TO_UF.get(text);
  if (exactName) return exactName;
  for (const [name, uf] of STATE_NAME_TO_UF) {
    if (name.length > 2 && text.includes(name)) return uf;
  }
  return null;
}

function getRowUf(row: { uf?: string; regiao?: string }): string | null {
  return normalizeUf(row.uf) ?? normalizeUf(row.regiao) ?? normalizeUf(getUfFromRegiao(row.regiao));
}

function decodeSvgText(value: string): string {
  const doc = new DOMParser().parseFromString(`<textarea>${value}</textarea>`, "text/html");
  return doc.querySelector("textarea")?.value ?? value;
}

function parseBrazilSvg(raw: string): { states: BrazilStatePath[]; labelPoints: UfMapPoint[] } {
  const doc = new DOMParser().parseFromString(raw, "image/svg+xml");
  const states = Array.from(doc.querySelectorAll("g#features path"))
    .map((path) => {
      const id = path.getAttribute("id") ?? "";
      const match = id.match(SVG_UF_ID);
      const d = path.getAttribute("d") ?? "";
      if (!match || !d) return null;
      return {
        uf: match[1],
        name: decodeSvgText(path.getAttribute("name") ?? match[1]),
        d,
      };
    })
    .filter(Boolean) as BrazilStatePath[];

  const labelPoints = Array.from(doc.querySelectorAll("g#label_points circle"))
    .map((circle) => {
      const id = circle.getAttribute("id") ?? "";
      const match = id.match(SVG_UF_ID);
      if (!match) return null;
      return {
        uf: match[1],
        label: decodeSvgText(circle.getAttribute("class") ?? match[1]),
        x: Number(circle.getAttribute("cx") ?? 0),
        y: Number(circle.getAttribute("cy") ?? 0),
      };
    })
    .filter((point): point is UfMapPoint => Boolean(point && point.x && point.y));

  return { states, labelPoints };
}

export default function Preco() {
  usePageTitle("Análise de Preço");

  const rows = usePricing((s) => s.rows);
  const filters = usePricing((s) => s.filters);
  const setFilter = usePricing((s) => s.setFilter);
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
            <ReadingCard result={result} />
            <PriceUfMapSection
              rows={filtered}
              base={base}
              comp={comp}
              periodMode={periodMode}
              filters={filters}
              selectedUf={selectedUf}
              onSelectedUfChange={setSelectedUf}
              onApplyUfFilter={(values) => setFilter("uf", values)}
              onProductFilterChange={setFilter}
            />
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
  filters,
  selectedUf,
  onSelectedUfChange,
  onApplyUfFilter,
  onProductFilterChange,
}: {
  rows: ReturnType<typeof applyFilters>;
  base: string | null;
  comp: string | null;
  periodMode: PeriodMode;
  filters: Partial<Record<FilterKey, string[]>>;
  selectedUf: string | null;
  onSelectedUfChange: (uf: string | null) => void;
  onApplyUfFilter: (values: string[]) => void;
  onProductFilterChange: (key: FilterKey, values: string[]) => void;
}) {
  const months = useMonthsInfo();
  const periodMatches = (periodo: string, fy: string, target: string | null) => {
    if (!target) return false;
    return periodMode === "fy" ? fy === target : periodo === target;
  };

  const { states: brazilStates, labelPoints } = useMemo(() => parseBrazilSvg(brMapRaw), []);
  const labelPointByUf = useMemo(
    () => new Map(labelPoints.map((point) => [point.uf, point])),
    [labelPoints],
  );

  const productFilterOptions = useMemo(() => {
    const bySkuDesc = new Map<string, string>();
    for (const row of rows) {
      if (row.sku && row.skuDesc && !bySkuDesc.has(row.sku)) bySkuDesc.set(row.sku, row.skuDesc);
    }
    return Object.fromEntries(
      PRODUCT_FILTER_FIELDS.map((field) => {
        const values = uniqueValues(rows, field.key as keyof PricingRow);
        const options = values
          .map((value) => ({
            value,
            label: field.key === "sku" && bySkuDesc.get(value) ? `${value} - ${bySkuDesc.get(value)}` : value,
          }))
          .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
        return [field.key, options];
      }),
    ) as Record<FilterKey, { value: string; label: string }[]>;
  }, [rows]);

  const data = useMemo(() => {
    if (!comp) return [];
    const compByUf = new Map<string, { rol: number; volumeKg: number; contribMarginal: number; filterValues: Set<string> }>();
    const baseByUf = new Map<string, { rol: number; volumeKg: number }>();

    for (const row of rows) {
      const uf = getRowUf(row);
      if (!uf) continue;
      if (periodMatches(row.periodo, row.fy, comp)) {
        const cur = compByUf.get(uf) ?? { rol: 0, volumeKg: 0, contribMarginal: 0, filterValues: new Set<string>() };
        cur.rol += row.rol;
        cur.volumeKg += row.volumeKg;
        cur.contribMarginal += row.contribMarginal;
        if (row.uf) cur.filterValues.add(row.uf);
        compByUf.set(uf, cur);
      }
      if (periodMatches(row.periodo, row.fy, base)) {
        const cur = baseByUf.get(uf) ?? { rol: 0, volumeKg: 0 };
        cur.rol += row.rol;
        cur.volumeKg += row.volumeKg;
        baseByUf.set(uf, cur);
      }
    }

    const totalVolume = Array.from(compByUf.values()).reduce((acc, cur) => acc + Math.max(0, cur.volumeKg), 0);
    return brazilStates.map((state) => {
      const compValue = compByUf.get(state.uf) ?? { rol: 0, volumeKg: 0, contribMarginal: 0, filterValues: new Set<string>() };
      const baseValue = baseByUf.get(state.uf);
      const precoMedio = compValue.volumeKg > 0 ? compValue.rol / compValue.volumeKg : 0;
      const margemPct = compValue.rol > 0 ? compValue.contribMarginal / compValue.rol : 0;
      const precoBase =
        baseValue && baseValue.volumeKg > 0 ? baseValue.rol / baseValue.volumeKg : null;
      const point = labelPointByUf.get(state.uf);
      return {
        uf: state.uf,
        label: point?.label ?? state.name,
        x: point?.x ?? 0,
        y: point?.y ?? 0,
        rol: compValue.rol,
        volumeKg: compValue.volumeKg,
        contribMarginal: compValue.contribMarginal,
        margemPct,
        precoMedio,
        volumeShare: totalVolume > 0 && compValue.volumeKg > 0 ? compValue.volumeKg / totalVolume : 0,
        precoBase,
        variacaoPreco: precoBase !== null ? precoMedio - precoBase : null,
        filterValues: Array.from(compValue.filterValues),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, base, comp, periodMode, brazilStates, labelPointByUf]);

  const canColorState = (point: { volumeKg: number; x: number; y: number }) =>
    point.volumeKg > 0 && point.x > 0 && point.y > 0;
  const activeData = data.filter(canColorState);
  const explicitSelection = activeData.find((point) => point.uf === selectedUf) ?? null;
  const selected = explicitSelection ?? [...activeData].sort((a, b) => b.volumeKg - a.volumeKg)[0] ?? null;
  const margins = activeData.map((point) => point.margemPct).filter(Number.isFinite);
  const minMargin = Math.min(...margins);
  const maxMargin = Math.max(...margins);
  const maxShare = Math.max(...activeData.map((point) => point.volumeShare), 0);
  const ranked = [...activeData].sort((a, b) => b.volumeKg - a.volumeKg).slice(0, 6);
  const dataByUf = new Map(data.map((point) => [point.uf, point]));

  const trendData = useMemo(() => {
    const byPeriod = new Map<string, { rol: number; volumeKg: number; contribMarginal: number }>();
    for (const row of rows) {
      const cur = byPeriod.get(row.periodo) ?? { rol: 0, volumeKg: 0, contribMarginal: 0 };
      cur.rol += row.rol;
      cur.volumeKg += row.volumeKg;
      cur.contribMarginal += row.contribMarginal;
      byPeriod.set(row.periodo, cur);
    }

    return months
      .filter((month) => byPeriod.has(month.periodo))
      .map((month) => {
        const cur = byPeriod.get(month.periodo)!;
        return {
          periodo: month.label,
          precoMedio: cur.volumeKg > 0 ? cur.rol / cur.volumeKg : 0,
          margemPct: cur.rol > 0 ? (cur.contribMarginal / cur.rol) * 100 : 0,
          volumeT: cur.volumeKg / 1000,
        };
      });
  }, [months, rows]);

  const colorForMargin = (value: number) => {
    const span = maxMargin - minMargin;
    const t = span > 0 ? (value - minMargin) / span : 0.5;
    const hue = t * 220;
    return `hsl(${hue} 84% 54%)`;
  };

  return (
    <GlassCard className="space-y-5 overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MapPin className="h-4 w-4" />
            </span>
            <h2 className="text-lg font-medium">Margem por UF</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Cor = Contrib. Marginal %. Vermelho indica margem baixa; azul indica margem alta.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MapPill label="Cor" value="CM %" />
          <MapPill label="Rótulo" value="UF" />
          {explicitSelection && (
            <button
              type="button"
              onClick={() => onSelectedUfChange(null)}
              className="rounded-full border border-border/60 px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            >
              Limpar seleção
            </button>
          )}
        </div>
      </header>

      {activeData.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/70 px-4 py-10 text-center text-sm text-muted-foreground">
          Não há UF com volume no período selecionado para montar o mapa.
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(330px,0.5fr)]">
          <div className="space-y-3 rounded-lg border border-border/50 bg-[radial-gradient(circle_at_50%_15%,hsl(var(--primary)/0.08),transparent_34%),linear-gradient(180deg,hsl(var(--secondary)/0.24),hsl(var(--background)/0.14))] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/35 px-3 py-2 text-xs">
              <div>
                <span className="font-medium text-foreground">Mapa do Brasil</span>
                <span className="ml-2 text-muted-foreground">Contribuição Marginal % por UF no período de comparação</span>
              </div>
              <span className="text-muted-foreground">Cinza = UF sem volume no período</span>
            </div>

            <svg
              viewBox="0 0 1000 912"
              role="img"
              aria-label="Mapa do Brasil por contribuição marginal percentual"
              className="h-[420px] w-full"
            >
              <defs>
                <filter id="uf-shadow" x="-40%" y="-40%" width="180%" height="180%">
                  <feDropShadow dx="0" dy="8" stdDeviation="9" floodColor="#000000" floodOpacity="0.28" />
                </filter>
              </defs>
              {brazilStates.map((state) => {
                const stateData = dataByUf.get(state.uf);
                const hasVolume = Boolean(stateData && canColorState(stateData));
                const selectedState = explicitSelection?.uf === state.uf;
                const labelPoint = labelPointByUf.get(state.uf);
                const transform =
                  selectedState && labelPoint
                    ? `translate(${labelPoint.x} ${labelPoint.y}) scale(1.045) translate(${-labelPoint.x} ${-labelPoint.y})`
                    : undefined;
                return (
                  <g key={state.uf} transform={transform} className="transition-transform duration-200">
                    <path
                      d={state.d}
                      fill={hasVolume ? colorForMargin(stateData!.margemPct) : "hsl(var(--muted) / 0.85)"}
                      opacity={hasVolume ? 0.9 : 0.68}
                      stroke={selectedState ? "hsl(var(--foreground))" : "hsl(var(--background))"}
                      strokeWidth={selectedState ? 2.6 : 0.8}
                      className={hasVolume ? "cursor-pointer transition-opacity hover:opacity-100" : ""}
                      filter={selectedState ? "url(#uf-shadow)" : undefined}
                      onClick={() => hasVolume && onSelectedUfChange(state.uf)}
                    >
                      <title>
                        {state.name}
                        {hasVolume
                          ? ` • CM ${formatPct(stateData!.margemPct)} • Vol ${formatPct(stateData!.volumeShare)}`
                          : " • sem volume no período"}
                      </title>
                    </path>
                  </g>
                );
              })}
              {labelPoints.map((point) => {
                const stateData = dataByUf.get(point.uf);
                const hasVolume = Boolean(stateData && canColorState(stateData));
                return (
                  <g
                    key={point.uf}
                    tabIndex={hasVolume ? 0 : -1}
                    role="button"
                    aria-label={
                      hasVolume
                        ? `${point.label}: CM ${formatPct(stateData!.margemPct)}, ${formatPct(stateData!.volumeShare)} do volume`
                        : `${point.label}: sem volume no período`
                    }
                    onClick={() => hasVolume && onSelectedUfChange(point.uf)}
                    onKeyDown={(event) => {
                      if (hasVolume && (event.key === "Enter" || event.key === " ")) {
                        event.preventDefault();
                        onSelectedUfChange(point.uf);
                      }
                    }}
                    className={hasVolume ? "cursor-pointer outline-none" : "outline-none"}
                  >
                    <text
                      x={point.x}
                      y={point.y + 5}
                      textAnchor="middle"
                      paintOrder="stroke"
                      stroke="#1f2937"
                      strokeWidth={1.1}
                      className="select-none fill-white text-[18px] font-black"
                    >
                      {point.uf}
                    </text>
                  </g>
                );
              })}
            </svg>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/35 px-3 py-2 text-[11px] text-muted-foreground">
              <span>Menor CM · <strong className="font-medium text-foreground">{formatPct(minMargin)}</strong></span>
              <div className="flex min-w-[220px] flex-1 items-center gap-2 sm:max-w-sm">
                <span>baixa</span>
                <div className="h-2 flex-1 rounded-full bg-gradient-to-r from-red-500 via-emerald-400 to-blue-500 shadow-[0_0_18px_hsl(var(--primary)/0.16)]" />
                <span>alta</span>
              </div>
              <span>Maior CM · <strong className="font-medium text-foreground">{formatPct(maxMargin)}</strong></span>
            </div>
            <ProductFiltersPanel
              filters={filters}
              optionsByKey={productFilterOptions}
              onChange={onProductFilterChange}
            />
            <UfTrendChart data={trendData} />
          </div>

          <aside className="space-y-4">
            {selected && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      UF em foco
                    </div>
                    <h3 className="mt-1 text-2xl font-semibold">{selected.label}</h3>
                  </div>
                  <span className="rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground">
                    {selected.uf}
                  </span>
                </div>
                <div className="mt-4 grid gap-2">
                  <MapMetric label="Contrib. Marginal %" value={formatPct(selected.margemPct)} />
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
                <button
                  type="button"
                  onClick={() => onApplyUfFilter(selected.filterValues.length ? selected.filterValues : [selected.label])}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition hover:bg-primary hover:text-primary-foreground"
                >
                  <Filter className="h-4 w-4" />
                  Filtrar visão por {selected.uf}
                </button>
              </div>
            )}

            <div className="rounded-lg border border-border/60 bg-background/55 p-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-medium">Ranking de volume</h3>
              </div>
              <div className="mt-3 space-y-2.5">
                {ranked.map((point) => (
                  <button
                    key={point.uf}
                    type="button"
                    onClick={() => onSelectedUfChange(point.uf)}
                    className="w-full rounded-md px-2 py-2 text-left hover:bg-secondary/50"
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="rounded-md bg-secondary px-2 py-1 text-center text-xs font-semibold">
                          {point.uf}
                        </span>
                      <span className="truncate text-sm font-medium">{point.label}</span>
                      </span>
                      <span className="text-xs font-medium tabular-nums">
                        {formatPct(point.margemPct)}
                      </span>
                    </span>
                    <span className="mt-2 flex items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${Math.max(4, point.volumeShare / Math.max(maxShare, 0.0001) * 100)}%` }}
                        />
                      </span>
                      <span className="w-14 text-right text-[11px] text-muted-foreground">
                        {formatPct(point.volumeShare)}
                      </span>
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

function MapPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-secondary/35 px-3 py-1.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </span>
  );
}

function ProductFiltersPanel({
  filters,
  optionsByKey,
  onChange,
}: {
  filters: Partial<Record<FilterKey, string[]>>;
  optionsByKey: Record<FilterKey, { value: string; label: string }[]>;
  onChange: (key: FilterKey, values: string[]) => void;
}) {
  return (
    <section className="rounded-lg border border-border/40 bg-background/35 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-primary" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Filtros de Produto
        </h3>
        <div className="h-px flex-1 bg-border/40" />
      </div>
      <div className="grid gap-2 md:grid-cols-5">
        {PRODUCT_FILTER_FIELDS.map((field) => {
          const options = optionsByKey[field.key] ?? [];
          if (options.length === 0) return null;
          return (
            <div key={field.key}>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {field.label}
              </label>
              <MultiSelectFilter
                options={options}
                selected={filters[field.key] ?? []}
                onChange={(values) => onChange(field.key, values)}
                placeholder="Todos"
                variant="sku"
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function UfTrendChart({
  data,
}: {
  data: { periodo: string; precoMedio: number; margemPct: number; volumeT: number }[];
}) {
  return (
    <section className="rounded-lg border border-border/40 bg-background/35 p-3">
      <div className="mb-2 flex items-center gap-2">
        <TrendingUp className="h-3.5 w-3.5 text-primary" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Evolutivo da visão atual
        </h3>
        <div className="h-px flex-1 bg-border/40" />
      </div>
      {data.length === 0 ? (
        <div className="flex h-[210px] items-center justify-center rounded-md border border-dashed border-border/50 text-sm text-muted-foreground">
          Sem dados mensais para o gráfico.
        </div>
      ) : (
        <div className="h-[230px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 12, right: 16, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.28} />
              <XAxis
                dataKey="periodo"
                stroke="hsl(var(--muted-foreground))"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="volume"
                stroke="hsl(var(--muted-foreground))"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => formatNum(Number(v), 0)}
              />
              <YAxis
                yAxisId="value"
                orientation="right"
                stroke="hsl(var(--muted-foreground))"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => formatNum(Number(v), 0)}
              />
              <RTooltip
                cursor={{ fill: "hsl(var(--secondary) / 0.35)" }}
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value: number, name: string) => {
                  if (name === "Volume (t)") return [`${formatNum(Number(value), 1)} t`, name];
                  if (name === "Preço médio") return [`${formatBRL(Number(value), { digits: 2 })}/kg`, name];
                  return [`${formatNum(Number(value), 1)}%`, name];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar
                yAxisId="volume"
                dataKey="volumeT"
                name="Volume (t)"
                fill="hsl(var(--primary) / 0.26)"
                radius={[4, 4, 0, 0]}
              />
              <Line
                yAxisId="value"
                type="monotone"
                dataKey="precoMedio"
                name="Preço médio"
                stroke="hsl(var(--primary))"
                strokeWidth={2.4}
                dot={{ r: 2.4, strokeWidth: 1 }}
              />
              <Line
                yAxisId="value"
                type="monotone"
                dataKey="margemPct"
                name="Margem %"
                stroke="hsl(var(--success))"
                strokeWidth={2.4}
                dot={{ r: 2.4, strokeWidth: 1 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
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
