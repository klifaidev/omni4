import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { DataTable, type DataTableColumn } from "@/components/pricing/DataTable";
import { EmptyState } from "@/components/pricing/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { applyFilters, measureOf } from "@/lib/analytics";
import { formatBRL, formatPct } from "@/lib/format";
import type { PricingRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { usePageTitle } from "@/hooks/use-page-title";
import { usePricing } from "@/store/pricing";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Crosshair,
  Gauge,
  Layers3,
  SlidersHorizontal,
  Target,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type TargetMode = "auto" | "manual";
type DrillLevel = "category" | "sku" | "channel" | "regional";

interface CategorySetting {
  mode: TargetMode;
  manualTargetPct?: number;
}

interface TargetSettings {
  benchmarkWeight: number;
  preservation: number;
  categories: Record<string, CategorySetting>;
}

interface TargetRow extends Record<string, unknown> {
  key: string;
  label: string;
  parent?: string;
  rol: number;
  margem: number;
  margemPct: number;
  volumeKg: number;
  targetPct: number;
  gapPp: number;
  impact: number;
  weight: number;
  risk: "ok" | "attention" | "critical";
}

interface Aggregate {
  key: string;
  label: string;
  rol: number;
  margem: number;
  volumeKg: number;
  margemPct: number;
}

const STORAGE_KEY = "omni:margem-target:v1";
const DEFAULT_SETTINGS: TargetSettings = {
  benchmarkWeight: 0.6,
  preservation: 0.65,
  categories: {},
};

function safePct(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function formatPp(value: number): string {
  return `${value >= 0 ? "+" : ""}${(value * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}pp`;
}

function formatTonFromKg(value: number): string {
  return `${(value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} t`;
}

function periodRank(row: PricingRow): number {
  return row.ano * 12 + row.mes;
}

function lastPeriods(rows: PricingRow[], count: number): Set<string> {
  const periods = Array.from(
    new Map(rows.map((row) => [row.periodo, { periodo: row.periodo, rank: periodRank(row) }])).values(),
  )
    .sort((a, b) => b.rank - a.rank)
    .slice(0, count)
    .map((period) => period.periodo);
  return new Set(periods);
}

function aggregateRows(rows: PricingRow[]): Omit<Aggregate, "key" | "label"> {
  let rol = 0;
  let margem = 0;
  let volumeKg = 0;
  for (const row of rows) {
    rol += row.rol;
    margem += row.contribMarginal;
    volumeKg += row.volumeKg;
  }
  return { rol, margem, volumeKg, margemPct: rol > 0 ? margem / rol : 0 };
}

function aggregateByDimension(rows: PricingRow[], getKey: (row: PricingRow) => string): Aggregate[] {
  const map = new Map<string, PricingRow[]>();
  for (const row of rows) {
    const key = getKey(row).trim() || "Sem informação";
    const bucket = map.get(key) ?? [];
    bucket.push(row);
    map.set(key, bucket);
  }
  return Array.from(map.entries())
    .map(([key, bucket]) => ({ key, label: key, ...aggregateRows(bucket) }))
    .filter((row) => row.rol > 0)
    .sort((a, b) => b.rol - a.rol);
}

function loadSettings(): TargetSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<TargetSettings>;
    return {
      benchmarkWeight: typeof parsed.benchmarkWeight === "number" ? parsed.benchmarkWeight : DEFAULT_SETTINGS.benchmarkWeight,
      preservation: typeof parsed.preservation === "number" ? parsed.preservation : DEFAULT_SETTINGS.preservation,
      categories: parsed.categories && typeof parsed.categories === "object" ? parsed.categories : {},
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function buildCategoryTargets(
  currentRows: PricingRow[],
  historyRows: PricingRow[],
  settings: TargetSettings,
): TargetRow[] {
  const categories = aggregateByDimension(currentRows, (row) => row.categoria || "Sem categoria");
  const totalRol = categories.reduce((sum, row) => sum + row.rol, 0) || 1;
  const last3 = lastPeriods(historyRows, 3);
  const historyByCategory = aggregateByDimension(historyRows, (row) => row.categoria || "Sem categoria");
  const recentByCategory = aggregateByDimension(
    historyRows.filter((row) => last3.has(row.periodo)),
    (row) => row.categoria || "Sem categoria",
  );
  const historyMap = new Map(historyByCategory.map((row) => [row.key, row]));
  const recentMap = new Map(recentByCategory.map((row) => [row.key, row]));

  return categories.map((category) => {
    const setting = settings.categories[category.key];
    const historical = historyMap.get(category.key)?.margemPct ?? category.margemPct;
    const recent = recentMap.get(category.key)?.margemPct ?? category.margemPct;
    const autoTarget = historical * settings.benchmarkWeight + recent * (1 - settings.benchmarkWeight);
    const targetPct = setting?.mode === "manual" && typeof setting.manualTargetPct === "number"
      ? setting.manualTargetPct
      : autoTarget;
    return buildTargetRow(category, targetPct, totalRol);
  });
}

function buildChildrenTargets(children: Aggregate[], parentTargetPct: number, preservation: number): TargetRow[] {
  const totalRol = children.reduce((sum, row) => sum + row.rol, 0) || 1;
  const currentWeightedAvg = children.reduce((sum, row) => sum + row.margemPct * row.rol, 0) / totalRol;
  return children.map((child) => {
    const targetPct = parentTargetPct + preservation * (child.margemPct - currentWeightedAvg);
    return buildTargetRow(child, targetPct, totalRol);
  });
}

function buildTargetRow(row: Aggregate, targetPct: number, totalRol: number): TargetRow {
  const gapPp = targetPct - row.margemPct;
  const impact = gapPp * row.rol;
  const absGap = Math.abs(gapPp);
  return {
    ...row,
    targetPct,
    gapPp,
    impact,
    weight: row.rol / totalRol,
    risk: absGap >= 0.05 ? "critical" : absGap >= 0.02 ? "attention" : "ok",
  };
}

function rowsForPath(rows: PricingRow[], category?: string, sku?: string, channel?: string): PricingRow[] {
  return rows.filter((row) => {
    if (category && (row.categoria || "Sem categoria") !== category) return false;
    const skuKey = row.skuDesc || row.sku || "Sem SKU";
    if (sku && skuKey !== sku) return false;
    if (channel && (row.canalAjustado || "Sem canal") !== channel) return false;
    return true;
  });
}

function getDimensionLabel(level: DrillLevel): string {
  if (level === "category") return "Categoria";
  if (level === "sku") return "SKU";
  if (level === "channel") return "Canal";
  return "Regional";
}

function statusLabel(row: TargetRow): string {
  if (row.gapPp <= -0.005) return "Acima da meta";
  if (row.gapPp >= 0.005) return "Abaixo da meta";
  return "Na meta";
}

export default function MargemTarget() {
  usePageTitle("Margem Target");
  const rows = usePricing((state) => state.rows);
  const filters = usePricing((state) => state.filters);
  const selectedPeriods = usePricing((state) => state.selectedPeriods);
  const [settings, setSettings] = useState<TargetSettings>(() => loadSettings());
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [selectedSku, setSelectedSku] = useState<string | undefined>();
  const [selectedChannel, setSelectedChannel] = useState<string | undefined>();

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const currentRows = useMemo(() => applyFilters(rows, filters, selectedPeriods), [rows, filters, selectedPeriods]);
  const historyRows = useMemo(() => applyFilters(rows, filters, null), [rows, filters]);

  const categoryTargets = useMemo(
    () => buildCategoryTargets(currentRows, historyRows, settings),
    [currentRows, historyRows, settings],
  );

  const selectedCategoryTarget = categoryTargets.find((row) => row.key === selectedCategory);
  const categoryRows = useMemo(
    () => rowsForPath(currentRows, selectedCategory),
    [currentRows, selectedCategory],
  );
  const skuTargets = useMemo(() => {
    if (!selectedCategoryTarget) return [];
    const skus = aggregateByDimension(categoryRows, (row) => row.skuDesc || row.sku || "Sem SKU");
    return buildChildrenTargets(skus, selectedCategoryTarget.targetPct, settings.preservation);
  }, [categoryRows, selectedCategoryTarget, settings.preservation]);

  const selectedSkuTarget = skuTargets.find((row) => row.key === selectedSku);
  const skuRows = useMemo(
    () => rowsForPath(currentRows, selectedCategory, selectedSku),
    [currentRows, selectedCategory, selectedSku],
  );
  const channelTargets = useMemo(() => {
    if (!selectedSkuTarget) return [];
    const channels = aggregateByDimension(skuRows, (row) => row.canalAjustado || "Sem canal");
    return buildChildrenTargets(channels, selectedSkuTarget.targetPct, settings.preservation);
  }, [skuRows, selectedSkuTarget, settings.preservation]);

  const selectedChannelTarget = channelTargets.find((row) => row.key === selectedChannel);
  const channelRows = useMemo(
    () => rowsForPath(currentRows, selectedCategory, selectedSku, selectedChannel),
    [currentRows, selectedCategory, selectedSku, selectedChannel],
  );
  const regionalTargets = useMemo(() => {
    if (!selectedChannelTarget) return [];
    const regionals = aggregateByDimension(channelRows, (row) => row.regional || row.regiao || row.uf || "Sem regional");
    return buildChildrenTargets(regionals, selectedChannelTarget.targetPct, settings.preservation);
  }, [channelRows, selectedChannelTarget, settings.preservation]);

  const level: DrillLevel = selectedChannel ? "regional" : selectedSku ? "channel" : selectedCategory ? "sku" : "category";
  const visibleRows = level === "category"
    ? categoryTargets
    : level === "sku"
      ? skuTargets
      : level === "channel"
        ? channelTargets
        : regionalTargets;

  const selectedSetting = selectedCategory ? settings.categories[selectedCategory] ?? { mode: "auto" as TargetMode } : null;
  const selectedManualValue = selectedSetting?.manualTargetPct ?? selectedCategoryTarget?.targetPct ?? 0;
  const totalImpact = visibleRows.reduce((sum, row) => sum + row.impact, 0);
  const weightedTarget = visibleRows.reduce((sum, row) => sum + row.targetPct * row.rol, 0) / Math.max(visibleRows.reduce((sum, row) => sum + row.rol, 0), 1);
  const weightedCurrent = visibleRows.reduce((sum, row) => sum + row.margemPct * row.rol, 0) / Math.max(visibleRows.reduce((sum, row) => sum + row.rol, 0), 1);
  const chartRows = visibleRows.slice(0, 12).map((row) => ({
    name: row.label.length > 18 ? `${row.label.slice(0, 18)}...` : row.label,
    atual: row.margemPct * 100,
    target: row.targetPct * 100,
    gap: row.gapPp,
  }));

  const columns: DataTableColumn<TargetRow>[] = [
    {
      key: "label",
      label: getDimensionLabel(level),
      format: (value, row) => (
        <button
          type="button"
          className={cn(
            "max-w-[320px] truncate text-left font-medium text-foreground hover:text-primary",
            level === "regional" && "pointer-events-none hover:text-foreground",
          )}
          onClick={() => {
            if (level === "category") {
              setSelectedCategory(String(row.key));
              setSelectedSku(undefined);
              setSelectedChannel(undefined);
            } else if (level === "sku") {
              setSelectedSku(String(row.key));
              setSelectedChannel(undefined);
            } else if (level === "channel") {
              setSelectedChannel(String(row.key));
            }
          }}
          disabled={level === "regional"}
          title={String(value)}
        >
          {String(value)}
        </button>
      ),
    },
    { key: "weight", label: "Peso ROL", align: "right", format: (value) => formatPct(Number(value)) },
    { key: "margemPct", label: "Atual", align: "right", format: (value) => formatPct(Number(value)) },
    { key: "targetPct", label: "Target", align: "right", format: (value) => formatPct(Number(value)) },
    {
      key: "gapPp",
      label: "Gap",
      align: "right",
      format: (value) => <span className={Number(value) > 0 ? "text-destructive" : "text-success"}>{formatPp(Number(value))}</span>,
    },
    {
      key: "impact",
      label: "Impacto estimado",
      align: "right",
      format: (value) => <span className={Number(value) > 0 ? "text-destructive" : "text-success"}>{formatBRL(Number(value), { compact: true })}</span>,
    },
    {
      key: "risk",
      label: "Status",
      format: (_, row) => (
        <Badge
          className={cn(
            "border",
            row.risk === "ok" && "border-success/30 bg-success/10 text-success hover:bg-success/10",
            row.risk === "attention" && "border-warning/30 bg-warning/10 text-warning hover:bg-warning/10",
            row.risk === "critical" && "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/10",
          )}
        >
          {statusLabel(row)}
        </Badge>
      ),
    },
  ];

  const updateCategorySetting = (category: string, patch: Partial<CategorySetting>) => {
    setSettings((current) => ({
      ...current,
      categories: {
        ...current.categories,
        [category]: {
          mode: current.categories[category]?.mode ?? "auto",
          ...current.categories[category],
          ...patch,
        },
      },
    }));
  };

  const resetDrill = (target: "root" | "category" | "sku") => {
    if (target === "root") {
      setSelectedCategory(undefined);
      setSelectedSku(undefined);
      setSelectedChannel(undefined);
      return;
    }
    if (target === "category") {
      setSelectedSku(undefined);
      setSelectedChannel(undefined);
      return;
    }
    setSelectedChannel(undefined);
  };

  if (rows.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <Topbar title="Margem Target" subtitle="Metas de margem por categoria, SKU, canal e regional" />
        <main className="container mx-auto px-6 py-8">
          <EmptyState
            title="Carregue a base Real para calcular metas"
            message="A aba Margem Target usa ROL e contribuição marginal da base Real para distribuir metas ponderadas."
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Topbar title="Margem Target" subtitle="Defina metas por categoria e desdobre para SKU, canal e regional" />
      <main className="container mx-auto space-y-6 px-6 py-8">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <GlassCard className="overflow-hidden p-0">
            <div className="border-b border-border/40 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Mapa de metas</p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight">
                    {level === "category" ? "Categorias" : getDimensionLabel(level)}
                  </h2>
                </div>
                <BreadcrumbActions
                  category={selectedCategory}
                  sku={selectedSku}
                  channel={selectedChannel}
                  onRoot={() => resetDrill("root")}
                  onCategory={() => resetDrill("category")}
                  onSku={() => resetDrill("sku")}
                />
              </div>
            </div>

            {level === "category" ? (
              <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
                {categoryTargets.map((row) => (
                  <CategoryTargetCard
                    key={row.key}
                    row={row}
                    mode={settings.categories[row.key]?.mode ?? "auto"}
                    onClick={() => {
                      setSelectedCategory(row.key);
                      setSelectedSku(undefined);
                      setSelectedChannel(undefined);
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="p-5">
                <DataTable
                  rows={visibleRows}
                  columns={columns}
                  searchable
                  searchKeys={["label"]}
                  pageSize={12}
                  emptyMessage="Sem dados para este recorte."
                />
              </div>
            )}
          </GlassCard>

          <AssumptionPanel
            settings={settings}
            selectedCategory={selectedCategory}
            selectedSetting={selectedSetting}
            selectedManualValue={selectedManualValue}
            selectedCategoryTarget={selectedCategoryTarget}
            onBenchmarkChange={(value) => setSettings((current) => ({ ...current, benchmarkWeight: value }))}
            onPreservationChange={(value) => setSettings((current) => ({ ...current, preservation: value }))}
            onCategoryChange={updateCategorySetting}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <SummaryTile
            label="Margem atual"
            value={formatPct(safePct(weightedCurrent))}
            helper={`Média ponderada por ROL em ${visibleRows.length} item(ns)`}
            icon={<Gauge className="h-4 w-4" />}
          />
          <SummaryTile
            label="Margem target"
            value={formatPct(safePct(weightedTarget))}
            helper={`Gap consolidado ${formatPp(weightedTarget - weightedCurrent)}`}
            icon={<Target className="h-4 w-4" />}
          />
          <SummaryTile
            label="Impacto estimado"
            value={formatBRL(totalImpact, { compact: true })}
            helper="CM necessária para fechar o target"
            icon={totalImpact >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
            tone={totalImpact >= 0 ? "destructive" : "success"}
          />
        </div>

        <GlassCard>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Comparativo visual</p>
              <h2 className="mt-1 text-lg font-semibold">Margem atual vs target</h2>
            </div>
            <Badge variant="outline" className="border-primary/25 bg-primary/10 text-primary">
              Top {Math.min(chartRows.length, 12)} por ROL
            </Badge>
          </div>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRows} margin={{ top: 12, right: 24, left: 0, bottom: 36 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.35} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-18} textAnchor="end" height={58} />
                <YAxis tickFormatter={(value) => `${Number(value).toFixed(0)}%`} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value: number, name: string) => [`${Number(value).toFixed(1)}%`, name === "atual" ? "Atual" : "Target"]}
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 12,
                    color: "hsl(var(--popover-foreground))",
                  }}
                />
                <Bar dataKey="atual" name="Atual" radius={[6, 6, 0, 0]} fill="hsl(var(--muted-foreground))" />
                <Bar dataKey="target" name="Target" radius={[6, 6, 0, 0]}>
                  {chartRows.map((row) => (
                    <Cell key={row.name} fill={row.gap > 0 ? "hsl(var(--destructive))" : "hsl(var(--success))"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      </main>
    </div>
  );
}

function BreadcrumbActions({
  category,
  sku,
  channel,
  onRoot,
  onCategory,
  onSku,
}: {
  category?: string;
  sku?: string;
  channel?: string;
  onRoot: () => void;
  onCategory: () => void;
  onSku: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      <Button variant="ghost" size="sm" className="h-8 px-2" onClick={onRoot}>
        Categorias
      </Button>
      {category && (
        <>
          <ArrowRight className="h-3 w-3" />
          <Button variant="ghost" size="sm" className="h-8 max-w-[180px] truncate px-2" onClick={onCategory} title={category}>
            {category}
          </Button>
        </>
      )}
      {sku && (
        <>
          <ArrowRight className="h-3 w-3" />
          <Button variant="ghost" size="sm" className="h-8 max-w-[180px] truncate px-2" onClick={onSku} title={sku}>
            {sku}
          </Button>
        </>
      )}
      {channel && (
        <>
          <ArrowRight className="h-3 w-3" />
          <Badge variant="outline" className="max-w-[160px] truncate">
            {channel}
          </Badge>
        </>
      )}
    </div>
  );
}

function CategoryTargetCard({
  row,
  mode,
  onClick,
}: {
  row: TargetRow;
  mode: TargetMode;
  onClick: () => void;
}) {
  const positiveGap = row.gapPp > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-2xl border border-border/45 bg-card/45 p-5 text-left transition hover:-translate-y-0.5 hover:border-primary/35 hover:bg-card/75 hover:shadow-lg"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold tracking-tight" title={row.label}>{row.label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{formatPct(row.weight)} do ROL filtrado</p>
        </div>
        <Badge className={cn(
          "shrink-0 border",
          mode === "manual"
            ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/10"
            : "border-muted-foreground/20 bg-muted/40 text-muted-foreground hover:bg-muted/40",
        )}>
          {mode === "manual" ? "Manual" : "Auto"}
        </Badge>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <MetricMini label="Atual" value={formatPct(row.margemPct)} />
        <MetricMini label="Target" value={formatPct(row.targetPct)} />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-background/45 px-3 py-2">
        <span className="text-xs text-muted-foreground">Gap</span>
        <span className={cn("text-sm font-semibold", positiveGap ? "text-destructive" : "text-success")}>
          {formatPp(row.gapPp)}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-xs">
        <span className="text-muted-foreground">Impacto</span>
        <span className={cn("font-semibold", row.impact > 0 ? "text-destructive" : "text-success")}>
          {formatBRL(row.impact, { compact: true })}
        </span>
      </div>
    </button>
  );
}

function MetricMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/35 bg-background/35 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-semibold">{value}</p>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  helper,
  icon,
  tone = "primary",
}: {
  label: string;
  value: string;
  helper: string;
  icon: React.ReactNode;
  tone?: "primary" | "success" | "destructive";
}) {
  const toneClass = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    destructive: "bg-destructive/10 text-destructive",
  }[tone];
  return (
    <GlassCard className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
        </div>
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", toneClass)}>{icon}</div>
      </div>
    </GlassCard>
  );
}

function AssumptionPanel({
  settings,
  selectedCategory,
  selectedSetting,
  selectedManualValue,
  selectedCategoryTarget,
  onBenchmarkChange,
  onPreservationChange,
  onCategoryChange,
}: {
  settings: TargetSettings;
  selectedCategory?: string;
  selectedSetting: CategorySetting | null;
  selectedManualValue: number;
  selectedCategoryTarget?: TargetRow;
  onBenchmarkChange: (value: number) => void;
  onPreservationChange: (value: number) => void;
  onCategoryChange: (category: string, patch: Partial<CategorySetting>) => void;
}) {
  return (
    <GlassCard className="h-fit p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <SlidersHorizontal className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Premissas</p>
          <h2 className="text-lg font-semibold">Motor de margem target</h2>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        <div>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-medium">Benchmark histórico</span>
            <span className="text-muted-foreground">{Math.round(settings.benchmarkWeight * 100)}%</span>
          </div>
          <Slider
            value={[Math.round(settings.benchmarkWeight * 100)]}
            min={0}
            max={100}
            step={5}
            onValueChange={([value]) => onBenchmarkChange(value / 100)}
            aria-label="Peso do benchmark histórico"
          />
          <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
            <span>Mais recente</span>
            <span>Histórico</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            O restante do peso usa a média dos últimos 3 meses disponíveis.
          </p>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-medium">Preservar cenário atual</span>
            <span className="text-muted-foreground">{Math.round(settings.preservation * 100)}%</span>
          </div>
          <Slider
            value={[Math.round(settings.preservation * 100)]}
            min={0}
            max={100}
            step={5}
            onValueChange={([value]) => onPreservationChange(value / 100)}
            aria-label="Preservação das diferenças atuais"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Quanto maior, mais SKU/canal/regional mantém sua diferença atual em relação à média do pai.
          </p>
        </div>

        <div className="rounded-2xl border border-border/40 bg-background/35 p-4">
          <div className="flex items-center gap-2">
            <Layers3 className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">Meta da categoria</p>
          </div>
          {!selectedCategory ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Selecione uma categoria para alternar entre meta automática e manual.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={(selectedSetting?.mode ?? "auto") === "auto" ? "default" : "outline"}
                  size="sm"
                  onClick={() => onCategoryChange(selectedCategory, { mode: "auto" })}
                >
                  Automático
                </Button>
                <Button
                  type="button"
                  variant={selectedSetting?.mode === "manual" ? "default" : "outline"}
                  size="sm"
                  onClick={() => onCategoryChange(selectedCategory, { mode: "manual", manualTargetPct: selectedManualValue })}
                >
                  Manual
                </Button>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground" htmlFor="manual-target">
                  Margem target manual
                </label>
                <div className="mt-2 flex items-center gap-2">
                  <Input
                    id="manual-target"
                    type="number"
                    min={-100}
                    max={100}
                    step={0.1}
                    value={(selectedManualValue * 100).toFixed(1)}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (Number.isFinite(value)) {
                        onCategoryChange(selectedCategory, { mode: "manual", manualTargetPct: value / 100 });
                      }
                    }}
                    className="h-9"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Atual da categoria: {selectedCategoryTarget ? formatPct(selectedCategoryTarget.margemPct) : "—"} · ROL{" "}
                  {selectedCategoryTarget ? formatBRL(selectedCategoryTarget.rol, { compact: true }) : "—"}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-xs text-muted-foreground">
          <div className="mb-2 flex items-center gap-2 font-semibold text-primary">
            <BarChart3 className="h-4 w-4" />
            Como a meta fecha
          </div>
          A distribuição usa ROL como peso. A média ponderada dos filhos fecha exatamente na meta do pai, preservando parte
          das diferenças atuais para evitar metas artificiais.
        </div>
      </div>
    </GlassCard>
  );
}
