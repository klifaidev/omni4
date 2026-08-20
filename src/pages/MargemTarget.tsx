import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { DataTable, type DataTableColumn } from "@/components/pricing/DataTable";
import { EmptyState } from "@/components/pricing/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { applyFilters } from "@/lib/analytics";
import { formatBRL, formatPct } from "@/lib/format";
import { budgetRowsAsPricingFiltered } from "@/lib/budgetAdapter";
import type { PricingRow } from "@/lib/types";
import {
  STORAGE_KEY,
  aggregateByDimension,
  balanceWeights,
  buildCategoryTargets,
  buildChildrenTargets,
  buildSkuTargetsForCategory,
  calculatePremiseBaseValues,
  getPeriodOptions,
  loadSettings,
  normalizePremiseRange,
  resolvePremise,
  rowsForPath,
  type CategorySetting,
  type EffectivePremise,
  type PeriodOption,
  type PremiseBaseValues,
  type TargetMode,
  type TargetSettings,
  type TargetRow,
} from "@/lib/marginTarget";
import { cn } from "@/lib/utils";
import { usePageTitle } from "@/hooks/use-page-title";
import { useBudget } from "@/store/budget";
import { usePricing } from "@/store/pricing";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Download,
  Gauge,
  Layers3,
  SlidersHorizontal,
  Sparkles,
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

type DrillLevel = "category" | "sku" | "channel" | "regional";

interface TargetExportRow {
  level: DrillLevel;
  category: string;
  sku: string;
  channel: string;
  regional: string;
  label: string;
  rol: number;
  margemAtualPct: number;
  margemTargetPct: number;
  gapPp: number;
  impacto: number;
  pesoRol: number;
}

function safePct(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function formatPp(value: number): string {
  return `${value >= 0 ? "+" : ""}${(value * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}pp`;
}

function buildTargetExportRows(
  currentRows: PricingRow[],
  categoryTargets: TargetRow[],
  settings: TargetSettings,
  periodOptions: PeriodOption[],
): TargetExportRow[] {
  const out: TargetExportRow[] = [];
  for (const category of categoryTargets) {
    out.push(targetRowToExport(category, "category", category.label, "", "", ""));
    const premise = resolvePremise(settings, category.key, periodOptions);
    const categoryRows = rowsForPath(currentRows, category.key);
    const skuTargets = buildSkuTargetsForCategory({
      categoryRows,
      categoryTargetPct: category.baseTargetPct ?? category.targetPct,
      preservation: premise.preservation,
      periodOptions,
      recentStart: premise.recentStart,
      recentEnd: premise.recentEnd,
      overrides: settings.categories[category.key]?.skuOverrides,
      sonhoBoostPct: settings.categories[category.key]?.sonhoBoostPct,
    });
    for (const sku of skuTargets) {
      out.push(targetRowToExport(sku, "sku", category.label, sku.label, "", ""));
      const skuRows = rowsForPath(currentRows, category.key, sku.key);
      const channelTargets = buildChildrenTargets(
        aggregateByDimension(skuRows, (row) => row.canalAjustado || "Sem canal"),
        sku.targetPct,
        premise.preservation,
      );
      for (const channel of channelTargets) {
        out.push(targetRowToExport(channel, "channel", category.label, sku.label, channel.label, ""));
        const channelRows = rowsForPath(currentRows, category.key, sku.key, channel.key);
        const regionalTargets = buildChildrenTargets(
          aggregateByDimension(channelRows, (row) => row.regional || row.regiao || row.uf || "Sem regional"),
          channel.targetPct,
          premise.preservation,
        );
        for (const regional of regionalTargets) {
          out.push(targetRowToExport(regional, "regional", category.label, sku.label, channel.label, regional.label));
        }
      }
    }
  }
  return out;
}

function targetRowToExport(
  row: TargetRow,
  level: DrillLevel,
  category: string,
  sku: string,
  channel: string,
  regional: string,
): TargetExportRow {
  return {
    level,
    category,
    sku,
    channel,
    regional,
    label: row.label,
    rol: row.rol,
    margemAtualPct: row.margemPct,
    margemTargetPct: row.targetPct,
    gapPp: row.gapPp,
    impacto: row.impact,
    pesoRol: row.weight,
  };
}

function exportMargemTargetXlsx(args: {
  rows: TargetExportRow[];
  activePremise: EffectivePremise;
  budgetFyLabel: string;
}) {
  if (args.rows.length === 0) {
    toast.info("Não há dados para exportar.");
    return;
  }
  const wb = XLSX.utils.book_new();
  const header = [
    "Nível",
    "Categoria",
    "SKU",
    "Canal",
    "Regional",
    "ROL",
    "Margem Atual %",
    "Margem Target %",
    "Gap (p.p.)",
    "Impacto Estimado",
    "Peso ROL",
  ];
  const flatRows = args.rows.map((row) => ({
    "Nível": getDimensionLabel(row.level),
    Categoria: row.category,
    SKU: row.sku,
    Canal: row.channel,
    Regional: row.regional,
    ROL: row.rol,
    "Margem Atual %": row.margemAtualPct,
    "Margem Target %": row.margemTargetPct,
    "Gap (p.p.)": row.gapPp * 100,
    "Impacto Estimado": row.impacto,
    "Peso ROL": row.pesoRol,
  }));
  const flatWs = XLSX.utils.json_to_sheet(flatRows, { header });
  flatWs["!cols"] = [
    { wch: 14 },
    { wch: 28 },
    { wch: 38 },
    { wch: 24 },
    { wch: 22 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 12 },
    { wch: 18 },
    { wch: 12 },
  ];
  const flatRange = XLSX.utils.decode_range(flatWs["!ref"] ?? "A1");
  for (let r = 1; r <= flatRange.e.r; r++) {
    for (const c of [6, 7, 10]) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (flatWs[addr]) flatWs[addr].z = "0.0%";
    }
    const gapAddr = XLSX.utils.encode_cell({ r, c: 8 });
    if (flatWs[gapAddr]) flatWs[gapAddr].z = '+0.0;-0.0;0.0';
    const rolAddr = XLSX.utils.encode_cell({ r, c: 5 });
    if (flatWs[rolAddr]) flatWs[rolAddr].z = '"R$" #,##0;[Red]-"R$" #,##0';
    const impactAddr = XLSX.utils.encode_cell({ r, c: 9 });
    if (flatWs[impactAddr]) flatWs[impactAddr].z = '"R$" #,##0;[Red]-"R$" #,##0';
  }
  XLSX.utils.book_append_sheet(wb, flatWs, "Base para Dinâmica");

  const hierarchyRows = [
    ["Margem Target", "", "", "", "", ""],
    ["Histórico", args.activePremise.historyWeight, "Recentes", args.activePremise.recentWeight, "Budget", args.activePremise.budgetWeight],
    ["Budget usado", args.budgetFyLabel, "", "", "", ""],
    [],
    ["Hierarquia", "ROL", "Atual", "Target", "Gap p.p.", "Impacto"],
    ...args.rows.map((row) => {
      const indent = row.level === "category" ? "" : row.level === "sku" ? "  " : row.level === "channel" ? "    " : "      ";
      return [
        `${indent}${row.label}`,
        row.rol,
        row.margemAtualPct,
        row.margemTargetPct,
        row.gapPp * 100,
        row.impacto,
      ];
    }),
  ];
  const hierarchyWs = XLSX.utils.aoa_to_sheet(hierarchyRows);
  hierarchyWs["!cols"] = [{ wch: 52 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 18 }];
  const hierarchyRange = XLSX.utils.decode_range(hierarchyWs["!ref"] ?? "A1");
  for (let r = 1; r <= hierarchyRange.e.r; r++) {
    for (const c of [1, 2, 3, 4, 5]) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = hierarchyWs[addr];
      if (!cell) continue;
      if (r === 1 && [1, 3, 5].includes(c)) cell.z = "0%";
      if (r >= 5 && [2, 3].includes(c)) cell.z = "0.0%";
      if (r >= 5 && c === 4) cell.z = '+0.0;-0.0;0.0';
      if (r >= 5 && [1, 5].includes(c)) cell.z = '"R$" #,##0;[Red]-"R$" #,##0';
    }
  }
  XLSX.utils.book_append_sheet(wb, hierarchyWs, "Visão Hierárquica");
  wb.SheetNames = ["Visão Hierárquica", "Base para Dinâmica"];

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `margem_target_dinamica_${date}.xlsx`);
  toast.success("Excel da Margem Target exportado.");
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
  const budgetRowsRaw = useBudget((state) => state.rows);
  const [settings, setSettings] = useState<TargetSettings>(() => loadSettings());
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [selectedSku, setSelectedSku] = useState<string | undefined>();
  const [selectedChannel, setSelectedChannel] = useState<string | undefined>();

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new Event("omni:margem-target:changed"));
  }, [settings]);

  const currentRows = useMemo(() => applyFilters(rows, filters, selectedPeriods), [rows, filters, selectedPeriods]);
  const historyRows = useMemo(() => applyFilters(rows, filters, null), [rows, filters]);
  const periodOptions = useMemo(() => getPeriodOptions(historyRows), [historyRows]);
  const budgetRows = useMemo(() => budgetRowsAsPricingFiltered(budgetRowsRaw, "budget"), [budgetRowsRaw]);
  const latestBudgetFyNum = useMemo(() => {
    return budgetRows.reduce((latest, row) => Math.max(latest, row.fyNum || 0), 0);
  }, [budgetRows]);
  const budgetFiscalRows = useMemo(() => {
    if (!latestBudgetFyNum) return [];
    return budgetRows.filter((row) => row.fyNum === latestBudgetFyNum);
  }, [budgetRows, latestBudgetFyNum]);
  const budgetFyLabel = budgetFiscalRows[0]?.fy ?? "ano fiscal do Budget";

  const categoryTargets = useMemo(
    () => buildCategoryTargets(currentRows, historyRows, budgetFiscalRows, settings, periodOptions),
    [currentRows, historyRows, budgetFiscalRows, settings, periodOptions],
  );

  const selectedCategoryTarget = categoryTargets.find((row) => row.key === selectedCategory);
  const missingBudgetCount = categoryTargets.filter((row) => row.budgetAvailable === false).length;
  const activePremise = useMemo(
    () => resolvePremise(settings, selectedCategory, periodOptions),
    [settings, selectedCategory, periodOptions],
  );
  const premiseBaseValues = useMemo(
    () => calculatePremiseBaseValues({
      historyRows,
      budgetRows: budgetFiscalRows,
      periodOptions,
      premise: activePremise,
      category: selectedCategory,
    }),
    [historyRows, budgetFiscalRows, periodOptions, activePremise, selectedCategory],
  );
  const categoryRows = useMemo(
    () => rowsForPath(currentRows, selectedCategory),
    [currentRows, selectedCategory],
  );
  const skuTargets = useMemo(() => {
    if (!selectedCategoryTarget) return [];
    return buildSkuTargetsForCategory({
      categoryRows,
      categoryTargetPct: selectedCategoryTarget.baseTargetPct ?? selectedCategoryTarget.targetPct,
      preservation: activePremise.preservation,
      periodOptions,
      recentStart: activePremise.recentStart,
      recentEnd: activePremise.recentEnd,
      overrides: selectedCategory ? settings.categories[selectedCategory]?.skuOverrides : undefined,
      sonhoBoostPct: selectedCategory ? settings.categories[selectedCategory]?.sonhoBoostPct : undefined,
    });
  }, [categoryRows, periodOptions, selectedCategoryTarget, activePremise.preservation, activePremise.recentStart, activePremise.recentEnd, selectedCategory, settings.categories]);

  const selectedSkuTarget = skuTargets.find((row) => row.key === selectedSku);
  const skuRows = useMemo(
    () => rowsForPath(currentRows, selectedCategory, selectedSku),
    [currentRows, selectedCategory, selectedSku],
  );
  const channelTargets = useMemo(() => {
    if (!selectedSkuTarget) return [];
    const channels = aggregateByDimension(skuRows, (row) => row.canalAjustado || "Sem canal");
    return buildChildrenTargets(channels, selectedSkuTarget.targetPct, activePremise.preservation);
  }, [skuRows, selectedSkuTarget, activePremise.preservation]);

  const selectedChannelTarget = channelTargets.find((row) => row.key === selectedChannel);
  const channelRows = useMemo(
    () => rowsForPath(currentRows, selectedCategory, selectedSku, selectedChannel),
    [currentRows, selectedCategory, selectedSku, selectedChannel],
  );
  const regionalTargets = useMemo(() => {
    if (!selectedChannelTarget) return [];
    const regionals = aggregateByDimension(channelRows, (row) => row.regional || row.regiao || row.uf || "Sem regional");
    return buildChildrenTargets(regionals, selectedChannelTarget.targetPct, activePremise.preservation);
  }, [channelRows, selectedChannelTarget, activePremise.preservation]);

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

  const updateSkuOverride = (skuKey: string, value: number | null) => {
    if (!selectedCategory) return;
    setSettings((current) => {
      const currentCategory = current.categories[selectedCategory];
      const nextOverrides = { ...(currentCategory?.skuOverrides ?? {}) };
      if (value === null) delete nextOverrides[skuKey];
      else nextOverrides[skuKey] = value;
      return {
        ...current,
        categories: {
          ...current.categories,
          [selectedCategory]: {
            mode: currentCategory?.mode ?? "auto",
            ...currentCategory,
            skuOverrides: nextOverrides,
          },
        },
      };
    });
  };

  const columns: DataTableColumn<TargetRow>[] = [
    ...(level === "sku"
      ? [{
          key: "skuCode",
          label: "Cód. SKU",
          className: "w-[120px]",
          format: (value) => (
            <span className="font-mono text-[11px] font-semibold text-muted-foreground">
              {String(value || "—")}
            </span>
          ),
        } satisfies DataTableColumn<TargetRow>]
      : []),
    {
      key: "label",
      label: level === "sku" ? "Descrição" : getDimensionLabel(level),
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
    ...(level === "sku"
      ? [{
          key: "recentMarginPct",
          label: "MC% 3M",
          align: "right",
          format: (value) => (
            typeof value === "number"
              ? <span className="font-semibold text-foreground">{formatPct(value)}</span>
              : <span className="text-muted-foreground">—</span>
          ),
        } satisfies DataTableColumn<TargetRow>]
      : []),
    {
      key: "targetPct",
      label: "Target",
      align: "right",
      format: (value, row) => (
        level === "sku" ? (
          <div className="flex items-center justify-end gap-2">
            {row.manualOverride ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px] text-muted-foreground hover:text-primary"
                onClick={(event) => {
                  event.stopPropagation();
                  updateSkuOverride(row.key, null);
                }}
              >
                Auto
              </Button>
            ) : null}
            <InlinePercentInput
              value={Number(value)}
              manual={Boolean(row.manualOverride)}
              onCommit={(next) => updateSkuOverride(row.key, next)}
            />
          </div>
        ) : formatPct(Number(value))
      ),
    },
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

  const updateActivePremise = (patch: Partial<EffectivePremise>) => {
    const normalizedPremise = normalizePremiseRange({ ...activePremise, ...patch }, periodOptions);
    const normalizedPatch: Partial<EffectivePremise> = { ...patch };
    if ("historyStart" in patch || "historyEnd" in patch) {
      normalizedPatch.historyStart = normalizedPremise.historyStart;
      normalizedPatch.historyEnd = normalizedPremise.historyEnd;
    }
    if ("recentStart" in patch || "recentEnd" in patch) {
      normalizedPatch.recentStart = normalizedPremise.recentStart;
      normalizedPatch.recentEnd = normalizedPremise.recentEnd;
    }
    if (selectedCategory) {
      updateCategorySetting(selectedCategory, normalizedPatch);
      return;
    }
    setSettings((current) => ({ ...current, ...normalizedPatch }));
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
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => exportMargemTargetXlsx({
                    rows: buildTargetExportRows(currentRows, categoryTargets, settings, periodOptions),
                    activePremise,
                    budgetFyLabel,
                  })}
                >
                  <Download className="h-4 w-4" />
                  Exportar Excel
                </Button>
              </div>
            </div>

            {level === "category" ? (
              <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
                {categoryTargets.map((row) => (
                  <CategoryTargetCard
                    key={row.key}
                    row={row}
                    mode={settings.categories[row.key]?.mode ?? "auto"}
                    sonhoBoostPct={settings.categories[row.key]?.sonhoBoostPct}
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
                  searchKeys={level === "sku" ? ["label", "skuCode"] : ["label"]}
                  pageSize={12}
                  emptyMessage="Sem dados para este recorte."
                />
              </div>
            )}
          </GlassCard>

          <AssumptionPanel
            activePremise={activePremise}
            periodOptions={periodOptions}
            selectedCategory={selectedCategory}
            selectedSetting={selectedSetting}
            selectedManualValue={selectedManualValue}
            selectedCategoryTarget={selectedCategoryTarget}
            premiseBaseValues={premiseBaseValues}
            budgetFyLabel={budgetFyLabel}
            missingBudgetCount={missingBudgetCount}
            onPremiseChange={updateActivePremise}
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
  sonhoBoostPct,
  onClick,
}: {
  row: TargetRow;
  mode: TargetMode;
  sonhoBoostPct?: number;
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
      {row.budgetAvailable === false ? (
        <div className="mt-3 rounded-xl border border-warning/25 bg-warning/10 px-3 py-2 text-[11px] font-medium text-warning">
          Sem Budget: peso redistribuído
        </div>
      ) : null}
      {sonhoBoostPct ? (
        <div className="mt-3 flex items-center gap-1.5 rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-[11px] font-medium text-primary">
          <Sparkles className="h-3 w-3" />
          Sonho +{Math.round(sonhoBoostPct * 100)}%
          {(row.manualOverrideCount ?? 0) > 0 ? ` · ${row.manualOverrideCount} SKU(s) manual(is) fora` : ""}
        </div>
      ) : null}
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

function PeriodSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: string;
  options: PeriodOption[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 bg-background/60 text-xs">
          <SelectValue placeholder="Selecione" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.periodo} value={option.periodo}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function parsePercentInput(value: string): number | null {
  const normalized = value.trim().replace("%", "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed / 100 : null;
}

function ManualTargetInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(() => (value * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (focused) return;
    setDraft((value * 100).toLocaleString("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }));
  }, [focused, value]);

  return (
    <Input
      id="manual-target"
      inputMode="decimal"
      value={draft}
      onFocus={() => setFocused(true)}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        const parsed = parsePercentInput(next);
        if (parsed !== null) onChange(parsed);
      }}
      onBlur={() => {
        setFocused(false);
        const parsed = parsePercentInput(draft);
        setDraft(((parsed ?? value) * 100).toLocaleString("pt-BR", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }));
      }}
      className="h-9"
    />
  );
}

function InlinePercentInput({
  value,
  manual,
  onCommit,
}: {
  value: number;
  manual: boolean;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(() => (value * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (focused) return;
    setDraft((value * 100).toLocaleString("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }));
  }, [focused, value]);

  const commit = () => {
    const parsed = parsePercentInput(draft);
    const next = parsed ?? value;
    setDraft((next * 100).toLocaleString("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }));
    onCommit(next);
  };

  return (
    <div className="inline-flex items-center gap-1.5">
      {manual ? (
        <Badge className="border-primary/30 bg-primary/10 px-1.5 py-0 text-[10px] text-primary hover:bg-primary/10">
          Manual
        </Badge>
      ) : null}
      <Input
        value={draft}
        inputMode="decimal"
        className={cn(
          "h-8 w-20 border-border/50 bg-background/60 px-2 text-right text-xs font-semibold tabular-nums",
          manual && "border-primary/35 bg-primary/5 text-primary",
        )}
        aria-label="Margem target manual do SKU"
        onFocus={() => setFocused(true)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
      />
      <span className="text-xs text-muted-foreground">%</span>
    </div>
  );
}

function WeightSlider({
  label,
  helper,
  value,
  baseValue,
  colorClass,
  onChange,
}: {
  label: string;
  helper: string;
  value: number;
  baseValue?: number | null;
  colorClass: string;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-xs">
        <span className="flex min-w-0 items-center gap-2 font-medium">
          <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", colorClass)} />
          <span className="truncate">{label}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <Badge variant="outline" className="border-border/50 bg-background/50 px-2 py-0 text-[10px] font-medium text-muted-foreground">
            {typeof baseValue === "number" ? `Base ${formatPct(baseValue)}` : "Sem dados"}
          </Badge>
          <span className="text-muted-foreground">{Math.round(draft * 100)}%</span>
        </span>
      </div>
      <Slider
        value={[Math.round(draft * 100)]}
        min={0}
        max={100}
        step={5}
        onValueChange={([next]) => setDraft(next / 100)}
        onValueCommit={([next]) => onChange(next / 100)}
        aria-label={`Peso de ${label}`}
      />
      <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{helper}</p>
    </div>
  );
}

function SonhoTooltip({ count }: { count: number }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-warning/40 bg-warning/10 text-[10px] font-semibold text-warning"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        aria-label={`${count} SKU(s) com ajuste manual nao recebem o Sonho`}
      >
        !
      </button>
      {open ? (
        <span className="absolute left-1/2 top-full z-10 mt-1.5 w-56 -translate-x-1/2 rounded-lg border border-border/60 bg-popover px-3 py-2 text-[11px] leading-snug text-popover-foreground shadow-lg">
          {count} SKU{count > 1 ? "s" : ""} com ajuste manual nesta categoria não recebe{count > 1 ? "m" : ""} o
          aumento do Sonho — continua{count > 1 ? "m" : ""} com o valor definido à mão.
        </span>
      ) : null}
    </span>
  );
}

function AssumptionPanel({
  activePremise,
  periodOptions,
  selectedCategory,
  selectedSetting,
  selectedManualValue,
  selectedCategoryTarget,
  premiseBaseValues,
  budgetFyLabel,
  missingBudgetCount,
  onPremiseChange,
  onCategoryChange,
}: {
  activePremise: EffectivePremise;
  periodOptions: PeriodOption[];
  selectedCategory?: string;
  selectedSetting: CategorySetting | null;
  selectedManualValue: number;
  selectedCategoryTarget?: TargetRow;
  premiseBaseValues: PremiseBaseValues;
  budgetFyLabel: string;
  missingBudgetCount: number;
  onPremiseChange: (patch: Partial<EffectivePremise>) => void;
  onCategoryChange: (category: string, patch: Partial<CategorySetting>) => void;
}) {
  const budgetMissingForSelection = Boolean(selectedCategory && selectedCategoryTarget && selectedCategoryTarget.budgetAvailable === false);
  const budgetWarning = budgetMissingForSelection
    ? "Esta categoria não tem Budget no ano fiscal selecionado. O peso do Budget foi redistribuído entre Histórico e Recente."
    : !selectedCategory && missingBudgetCount > 0
      ? `${missingBudgetCount} categoria(s) sem Budget. O peso do Budget é redistribuído automaticamente nesses casos.`
      : null;
  const weightsTotal = activePremise.historyWeight + activePremise.recentWeight + activePremise.budgetWeight;
  const weightsAboveLimit = weightsTotal > 1.0001;
  const selectedSonhoValue = selectedSetting?.sonhoBoostPct ?? 0;

  return (
    <GlassCard className="h-fit p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <SlidersHorizontal className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Premissas</p>
          <h2 className="text-lg font-semibold">Motor de margem target</h2>
          <p className="mt-0.5 max-w-[260px] truncate text-xs text-muted-foreground" title={selectedCategory ?? "Premissa global"}>
            {selectedCategory ? `Premissa exclusiva: ${selectedCategory}` : "Premissa global padrão"}
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        <div className="rounded-2xl border border-border/40 bg-background/35 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Peso dos pilares</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Histórico, meses recentes e Budget fecham 100% da meta automática.
              </p>
            </div>
            <Badge variant="outline" className="shrink-0 border-primary/25 bg-primary/5 text-primary">
              Total {Math.round(weightsTotal * 100)}%
            </Badge>
          </div>
          <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-muted">
            <div className="bg-primary" style={{ width: `${activePremise.historyWeight * 100}%` }} />
            <div className="bg-success" style={{ width: `${activePremise.recentWeight * 100}%` }} />
            <div className="bg-warning" style={{ width: `${activePremise.budgetWeight * 100}%` }} />
          </div>
          <div className="mt-4 space-y-4">
            <WeightSlider
              label="Histórico"
              helper="Benchmark dos últimos 2 anos definidos abaixo."
              value={activePremise.historyWeight}
              baseValue={premiseBaseValues.history}
              colorClass="bg-primary"
              onChange={(value) => onPremiseChange({ historyWeight: value })}
            />
            <WeightSlider
              label="Meses recentes"
              helper="Por padrão, os 3 últimos meses fechados."
              value={activePremise.recentWeight}
              baseValue={premiseBaseValues.recent}
              colorClass="bg-success"
              onChange={(value) => onPremiseChange({ recentWeight: value })}
            />
            <WeightSlider
              label="Budget"
              helper={`Ano fiscal inteiro (${budgetFyLabel}), sem filtros da página.`}
              value={activePremise.budgetWeight}
              baseValue={premiseBaseValues.budget}
              colorClass="bg-warning"
              onChange={(value) => onPremiseChange({ budgetWeight: value })}
            />
          </div>
          {weightsAboveLimit ? (
            <div className="mt-4 rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-xs text-destructive">
              <div className="flex items-start justify-between gap-3">
                <p>
                  Os pesos somam {Math.round(weightsTotal * 100)}%. Para manter a premissa fechada, reduza os pesos ou use o equilíbrio automático.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0 border-destructive/30 bg-background/60 text-destructive hover:bg-destructive/10"
                  onClick={() => onPremiseChange(balanceWeights(activePremise))}
                >
                  Equilibrar
                </Button>
              </div>
            </div>
          ) : null}
          {budgetWarning ? (
            <div className="mt-4 rounded-xl border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-warning">
              {budgetWarning}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-border/40 bg-background/35 p-4">
          <p className="text-sm font-semibold">Janelas fixas da meta</p>
          <p className="mt-1 text-xs text-muted-foreground">
            O filtro de mês da página mede a performance atual; estes períodos congelam a régua da meta.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <PeriodSelect
              label="Histórico início"
              value={activePremise.historyStart}
              options={periodOptions}
              onChange={(value) => onPremiseChange({ historyStart: value })}
            />
            <PeriodSelect
              label="Histórico fim"
              value={activePremise.historyEnd}
              options={periodOptions}
              onChange={(value) => onPremiseChange({ historyEnd: value })}
            />
            <PeriodSelect
              label="Recente início"
              value={activePremise.recentStart}
              options={periodOptions}
              onChange={(value) => onPremiseChange({ recentStart: value })}
            />
            <PeriodSelect
              label="Recente fim"
              value={activePremise.recentEnd}
              options={periodOptions}
              onChange={(value) => onPremiseChange({ recentEnd: value })}
            />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-medium">Preservar cenário atual</span>
            <span className="text-muted-foreground">{Math.round(activePremise.preservation * 100)}%</span>
          </div>
          <Slider
            value={[Math.round(activePremise.preservation * 100)]}
            min={0}
            max={100}
            step={5}
            onValueChange={([value]) => onPremiseChange({ preservation: value / 100 })}
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
                  <ManualTargetInput
                    value={selectedManualValue}
                    onChange={(value) => onCategoryChange(selectedCategory, { mode: "manual", manualTargetPct: value })}
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

        <div className="rounded-2xl border border-border/40 bg-background/35 p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">Sonho</p>
          </div>
          {!selectedCategory ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Selecione uma categoria para configurar o aumento "Sonho".
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="flex items-center gap-1.5 font-medium">
                  Aumento sobre a meta
                  {(selectedCategoryTarget?.manualOverrideCount ?? 0) > 0 && (selectedSonhoValue ?? 0) > 0 ? (
                    <SonhoTooltip count={selectedCategoryTarget?.manualOverrideCount ?? 0} />
                  ) : null}
                </span>
                <span className="text-muted-foreground">{Math.round((selectedSonhoValue ?? 0) * 100)}%</span>
              </div>
              <Slider
                value={[Math.round((selectedSonhoValue ?? 0) * 100)]}
                min={0}
                max={100}
                step={5}
                onValueChange={([value]) => onCategoryChange(selectedCategory, { sonhoBoostPct: value / 100 })}
                aria-label="Aumento Sonho sobre a meta"
              />
              <p className="text-[11px] leading-snug text-muted-foreground">
                Aumento irracional (aposta da diretoria) aplicado sobre a meta já calculada pelos 3 pilares, apenas
                nos SKUs desta categoria que ainda seguem a premissa automática — SKUs com ajuste manual não são
                afetados.
              </p>
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
