// ChartInspector — PowerPoint-grade design panel for ChartBlock.
// Sections shown depend on chartType. Filters live in a separate tab (already
// handled by FilteredInspector wrapper outside).

import type { BlockDataSource, ChartBlock, CustomTableChartOrientation, KpiMeasureId } from "@/lib/customSlide";
import {
  KPI_MEASURES, BUDGET_UNAVAILABLE_MEASURES, BUDGET_UNAVAILABLE_HINT,
  FORECAST_UNAVAILABLE_MEASURES, FORECAST_UNAVAILABLE_HINT,
  ROLLING_UNAVAILABLE_MEASURES, ROLLING_UNAVAILABLE_HINT,
  isFromBudgetBase, isFromForecastBase, isFromRollingBase,
} from "@/lib/customSlide";
import {
  ensureChartStyle, defaultChartStyle, DEFAULT_PALETTE,
  type ChartStyle, type SeriesStyle,
  type ConditionalRule, type ReferenceLineCfg, type WaterfallColumn,
} from "./types";
import {
  Section, Row, ToggleField, NumberStepper, ColorField, SelectField,
  Segmented, Slider,
} from "./Inspector";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ChartTypePicker } from "./ChartTypePicker";
import { STYLE_PRESETS, buildStylePresetPatch, type StylePresetId } from "./stylePresets";
import { usePricing } from "@/store/pricing";
import { useBudget } from "@/store/budget";
import { useForecast } from "@/store/forecast";
import { useRolling } from "@/store/rolling";
import { useCustomTables } from "@/store/customTables";
import { budgetRowsAsPricingFiltered } from "@/lib/budgetAdapter";
import { forecastRowsAsPricingLatest } from "@/lib/forecastAdapter";
import { rollingRowsAsPricing } from "@/lib/rollingAdapter";
import { applyFilters } from "@/lib/analytics";
import { computeChartSeries, computeTopRanking } from "@/lib/customKpi";
import { getCachedRowsSignature, getOrComputeSlideCalc } from "@/lib/slideCalcCache";
import { buildCustomTableChartData } from "@/lib/customTableChartData";
import { useMemo } from "react";
import { Trash2, Plus, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSlideFilters } from "../SlideFilterContext";
import { dataSourceLabel } from "@/lib/slideDataSourceTheme";
import { SLIDE_HEX } from "@/lib/slideDesignTokens";
import { DraftInput, DraftNumberInput } from "../DraftInput";
import { strings } from "@/lib/i18n";

const t = strings.slides.editor.inspectors.chart;
const tc = t.common;

type Patch = Partial<ChartBlock>;

const POSITIVACAO_BREAKDOWN_OPTIONS = [
  { value: "categoria", label: t.dataSection.dims.categoria },
  { value: "marca", label: t.dataSection.dims.marca },
  { value: "canalAjustado", label: t.dataSection.dims.canalAjustado },
  { value: "gestorResp", label: t.dataSection.dims.gestorResp },
  { value: "sku", label: "SKU" },
  { value: "skuDesc", label: "SKU Desc." },
];

function rid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const PRESET_THUMB_COLORS: Record<StylePresetId, string[]> = {
  default: [SLIDE_HEX.chart1, SLIDE_HEX.chart2, SLIDE_HEX.chart3, SLIDE_HEX.chart6],
  minimal: [SLIDE_HEX.grid, SLIDE_HEX.slate300, SLIDE_HEX.slate400, SLIDE_HEX.slate500],
  bold: [SLIDE_HEX.ink, SLIDE_HEX.chart1, SLIDE_HEX.chart4, SLIDE_HEX.chart5],
  monochrome: [SLIDE_HEX.ink, SLIDE_HEX.slate700, SLIDE_HEX.slate500, SLIDE_HEX.slate400],
  harald: [SLIDE_HEX.chart1, SLIDE_HEX.chart2, SLIDE_HEX.chart3, SLIDE_HEX.chart4],
};

function unavailableMeasuresForSource(ds: ChartBlock["dataSource"]): readonly string[] {
  if (isFromForecastBase(ds)) return FORECAST_UNAVAILABLE_MEASURES;
  if (isFromRollingBase(ds)) return ROLLING_UNAVAILABLE_MEASURES;
  if (isFromBudgetBase(ds)) return BUDGET_UNAVAILABLE_MEASURES;
  return [];
}

function unavailableHintForSource(ds: ChartBlock["dataSource"]): string | undefined {
  if (isFromForecastBase(ds)) return FORECAST_UNAVAILABLE_HINT;
  if (isFromRollingBase(ds)) return ROLLING_UNAVAILABLE_HINT;
  if (isFromBudgetBase(ds)) return BUDGET_UNAVAILABLE_HINT;
  return undefined;
}

function availableMeasuresForSource(ds: BlockDataSource) {
  return KPI_MEASURES.map((m) => ({
    value: m.id,
    label: m.label,
    disabled: unavailableMeasuresForSource(ds).includes(m.id),
  }));
}

function PresetThumbnail({ id }: { id: StylePresetId }) {
  const colors = PRESET_THUMB_COLORS[id];
  return (
    <div className="flex h-6 w-full items-end gap-0.5 rounded-sm bg-secondary/40 p-0.5">
      {colors.map((c, i) => (
        <div key={i} className="flex-1 rounded-sm"
          style={{ background: c, height: `${40 + i * 15}%` }} />
      ))}
    </div>
  );
}

// Position options per chart family
function positionOptions(ct: ChartBlock["chartType"]) {
  const p = t.dataLabels.positions;
  if (ct === "pie" || ct === "donut") {
    return [
      { value: "inside", label: p.inside },
      { value: "outside", label: p.outside },
      { value: "callout", label: p.callout },
    ];
  }
  if (ct === "line" || ct === "area" || ct === "stackedArea" || ct === "scatter") {
    return [
      { value: "above", label: p.above },
      { value: "below", label: p.below },
      { value: "left", label: p.left },
      { value: "right", label: p.right },
    ];
  }
  if (ct === "waterfall") {
    return [
      { value: "above", label: p.aboveBar },
      { value: "inside", label: p.insideBar },
      { value: "below", label: p.belowBar },
    ];
  }
  if (ct === "funnel") {
    return [
      { value: "left", label: p.left },
      { value: "right", label: p.right },
      { value: "center", label: p.center },
      { value: "inside", label: p.inside },
    ];
  }
  // bar/column/combo
  return [
    { value: "above", label: p.above },
    { value: "below", label: p.below },
    { value: "inside-end", label: p.insideEnd },
    { value: "inside-base", label: p.insideBase },
    { value: "center", label: p.center },
  ];
}

const ALL_TYPES: { value: ChartBlock["chartType"]; label: string }[] = [
  { value: "line", label: "Linha" },
  { value: "area", label: "Área" },
  { value: "stackedArea", label: "Área empilhada" },
  { value: "bar", label: "Coluna" },
  { value: "column", label: "Coluna agrupada" },
  { value: "stackedColumn", label: "Coluna empilhada" },
  { value: "hbar", label: "Barra horizontal" },
  { value: "stackedBar", label: "Barra empilhada" },
  { value: "combo", label: "Combo (linha + barra)" },
  { value: "pie", label: "Pizza" },
  { value: "donut", label: "Rosca" },
  { value: "bubble", label: "Bolha" },
  { value: "scatter", label: "Dispersão" },
  { value: "waterfall", label: "Waterfall" },
  { value: "funnel", label: "Funil" },
  { value: "treemap", label: "Mapa de árvore" },
  { value: "mapaBrasil", label: "Mapa do Brasil" },
  { value: "radar", label: "Radar" },
  { value: "histogram", label: "Histograma" },
  { value: "boxplot", label: "Caixa (Box)" },
];

// Determines what sections should appear
function sectionsFor(ct: ChartBlock["chartType"]) {
  const isPie = ct === "pie" || ct === "donut";
  const isRadar = ct === "radar";
  const isBarFamily = ["bar", "column", "hbar", "stackedColumn", "stackedBar"].includes(ct);
  const isAreaFamily = ct === "area" || ct === "stackedArea";
  const isComboLineFamily = ct === "line" || ct === "combo";
  const showAxes = !["pie", "donut", "funnel", "treemap", "mapaBrasil", "radar", "histogram", "boxplot"].includes(ct);
  const showGrid = showAxes && ct !== "histogram"
    && !["funnel", "treemap", "mapaBrasil", "boxplot"].includes(ct) ? true : false;
  const showSeries = !["pie", "donut", "bubble", "scatter", "waterfall", "funnel", "treemap", "mapaBrasil", "histogram"].includes(ct);
  return {
    showAxes, showGrid,
    showSeries,
    showBar: isBarFamily, showArea: isAreaFamily,
    showLineSeriesProps: isComboLineFamily || isAreaFamily,
    isPie, isRadar, isCombo: ct === "combo",
  };
}

export function ChartInspector({
  block, onChange,
}: { block: ChartBlock; onChange: (p: Patch) => void }) {
  const style = ensureChartStyle(block.style);
  const updStyle = (patch: Partial<ChartStyle>) =>
    onChange({ style: { ...block.style, ...patch } } as Patch);
  const updPath = <K extends keyof ChartStyle>(key: K, patch: Partial<ChartStyle[K]>) =>
    updStyle({ [key]: { ...(style[key] as object), ...patch } } as Partial<ChartStyle>);
  const resetPath = <K extends keyof ChartStyle>(key: K) => {
    const d = defaultChartStyle();
    updStyle({ [key]: d[key] } as Partial<ChartStyle>);
  };

  const ct = block.chartType;
  const S = sectionsFor(ct);
  const { clearFilter } = useSlideFilters();

  // Detect actual series/categories present on canvas to drive per-item editors
  const pricing = usePricing((s) => s.rows);
  const budget = useBudget((s) => s.rows);
  const forecast = useForecast((s) => s.rows);
  const rolling = useRolling((s) => s.rows);
  const customTables = useCustomTables((s) => s.tables);
  const dataSource = block.dataSource;
  const isCustomSource = dataSource === "personalizado";
  const filters = block.filters;
  const measure = block.measure;
  const breakdown = block.breakdown;
  const blockId = block.id;
  const comboSeries = block.comboSeries;
  const selectedCustomTable = useMemo(
    () => customTables.find((table) => table.id === block.customTableId) ?? customTables[0] ?? null,
    [customTables, block.customTableId],
  );
  const customChartData = useMemo(
    () => buildCustomTableChartData(selectedCustomTable, block),
    [selectedCustomTable, block],
  );
  const dsRows = useMemo(() => {
    if (dataSource === "personalizado") return [];
    if (dataSource === "budget") return budgetRowsAsPricingFiltered(budget, "budget");
    if (dataSource === "budget_real") return budgetRowsAsPricingFiltered(budget, "real");
    if (dataSource === "forecast") return forecastRowsAsPricingLatest(forecast);
    if (dataSource === "rolling") return rollingRowsAsPricing(rolling);
    return pricing;
  }, [dataSource, pricing, budget, forecast, rolling]);
  const dsRowsSignature = useMemo(() => getCachedRowsSignature(dsRows), [dsRows]);
  const detectedChartSeries = useMemo(() => {
    if (isCustomSource) return customChartData;
    try {
      return getOrComputeSlideCalc({
        op: "chart-inspector-series",
        blockId,
        shareAcrossBlocks: true,
        dataSource,
        dataSignature: dsRowsSignature,
        params: { filters, measure, breakdown },
      }, () => computeChartSeries(dsRows, filters, measure, breakdown));
    } catch {
      return null;
    }
  }, [isCustomSource, customChartData, blockId, dataSource, dsRows, dsRowsSignature, filters, measure, breakdown]);
  const detectedSeries = useMemo(() => {
    if (ct === "combo" && comboSeries?.length) {
      return comboSeries.map((s) => s.name?.trim() || dataSourceLabel(s.dataSource));
    }
    return detectedChartSeries?.series.map((s) => s.name) ?? [];
  }, [ct, comboSeries, detectedChartSeries]);
  const detectedCategories = useMemo(() => {
    return detectedChartSeries?.periodos.map((p) => p.label) ?? [];
  }, [detectedChartSeries]);
  const detectedRanking = useMemo(() => {
    if (!["pie", "donut", "funnel", "treemap"].includes(ct)) return [];
    if (isCustomSource) return customChartData.ranking.map((r) => r.name);
    const rankingBreakdown = breakdown ?? "marca";
    try {
      return getOrComputeSlideCalc({
        op: "chart-inspector-ranking",
        blockId,
        shareAcrossBlocks: true,
        dataSource,
        dataSignature: dsRowsSignature,
        params: { filters, breakdown: rankingBreakdown, measure, topN: 50, mode: "all" },
      }, () => computeTopRanking(dsRows, filters, rankingBreakdown, measure, 50, "all", null)).map((r) => r.name);
    } catch { return []; }
  }, [ct, isCustomSource, customChartData.ranking, blockId, dataSource, dsRows, dsRowsSignature, filters, breakdown, measure]);

  const updSeries = (key: string, patch: Partial<SeriesStyle>) => {
    const next = [...style.series];
    const idx = next.findIndex((x) => x.key === key);
    if (idx >= 0) next[idx] = { ...next[idx], ...patch };
    else next.push({ key, ...patch });
    updStyle({ series: next });
  };
  const getSeriesCfg = (key: string): SeriesStyle =>
    style.series.find((x) => x.key === key) ?? { key };
  const setComboSeries = (next: NonNullable<ChartBlock["comboSeries"]>) =>
    onChange({ comboSeries: next } as Patch);
  const patchComboSeries = (
    id: string,
    patch: Partial<NonNullable<ChartBlock["comboSeries"]>[number]>,
  ) => {
    const current = block.comboSeries ?? [];
    const next = current.map((item) => {
      if (item.id !== id) return item;
      const merged = { ...item, ...patch };
      if (patch.name && patch.name !== item.name) {
        const cfg = style.series.find((s) => s.key === item.name);
        if (cfg) {
          updStyle({
            series: [
              ...style.series.filter((s) => s.key !== item.name),
              { ...cfg, key: patch.name },
            ],
          });
        }
      }
      return merged;
    });
    setComboSeries(next);
  };
  const addComboSeries = (dataSource: BlockDataSource = "ke30", measure: KpiMeasureId = "volume") => {
    const label = `${dataSourceLabel(dataSource)} - ${KPI_MEASURES.find((m) => m.id === measure)?.label ?? measure}`;
    const id = rid();
    setComboSeries([
      ...(block.comboSeries ?? []),
      { id, name: label, dataSource, measure, asLine: true, secondaryAxis: false },
    ]);
  };
  const removeComboSeries = (id: string) => {
    const removed = block.comboSeries?.find((s) => s.id === id);
    setComboSeries((block.comboSeries ?? []).filter((s) => s.id !== id));
    if (removed) updStyle({ series: style.series.filter((s) => s.key !== removed.name) });
  };
  const installVolumeScenario = () => {
    const defaults: NonNullable<ChartBlock["comboSeries"]> = [
      { id: rid(), name: "Volume Real", dataSource: "ke30", measure: "volume", asLine: true },
      { id: rid(), name: "Volume Budget", dataSource: "budget", measure: "volume", asLine: true },
      { id: rid(), name: "Volume Forecast", dataSource: "forecast", measure: "volume", asLine: true },
      { id: rid(), name: "Volume Rolling", dataSource: "rolling", measure: "volume", asLine: true },
    ];
    onChange({
      comboSeries: defaults,
      style: {
        ...block.style,
        series: [
          ...style.series.filter((s) => !defaults.some((d) => d.name === s.key)),
          { key: "Volume Real", color: SLIDE_HEX.chart1, asLine: true },
          { key: "Volume Budget", color: SLIDE_HEX.chart2, asLine: true, lineStyle: "dashed" },
          { key: "Volume Forecast", color: SLIDE_HEX.chart5, asLine: true, lineStyle: "dotted" },
          { key: "Volume Rolling", color: SLIDE_HEX.forecastOrange, asLine: true, lineStyle: "dashed" },
        ],
      },
    } as Patch);
  };

  return (
    <div className="space-y-3">
      {/* Chart type picker — always visible at top */}
      <div className="rounded-lg border border-border/50 bg-card/40 px-2 py-2">
        <ChartTypePicker value={ct} onChange={(v) => onChange({ chartType: v })} />
      </div>

      <Tabs defaultValue="dados" className="w-full">
        <TabsList className="grid h-9 w-full grid-cols-3 rounded-full bg-secondary/40 p-1">
          <TabsTrigger value="dados" className="h-7 rounded-full text-[12px] data-[state=active]:bg-background data-[state=active]:shadow-sm">{t.tabs.data}</TabsTrigger>
          <TabsTrigger value="visual" className="h-7 rounded-full text-[12px] data-[state=active]:bg-background data-[state=active]:shadow-sm">{t.tabs.visual}</TabsTrigger>
          <TabsTrigger value="analises" className="h-7 rounded-full text-[12px] data-[state=active]:bg-background data-[state=active]:shadow-sm">{t.tabs.analytics}</TabsTrigger>
        </TabsList>

        {/* ============================ DADOS TAB ============================ */}
        <TabsContent value="dados" className="mt-3 space-y-3">
      {/* ===== Data ===== */}
      <Section title={t.dataSection.title} defaultOpen>
        {isCustomSource && (
          <div className="mb-3 space-y-2 rounded-lg border border-sky-500/20 bg-sky-500/5 p-2.5">
            <div>
              <div className="text-[12px] font-semibold text-foreground">{t.dataSection.customTable.title}</div>
              <p className="text-[10px] leading-snug text-muted-foreground">
                {t.dataSection.customTable.hint}
              </p>
            </div>
            {customTables.length === 0 ? (
              <div className="space-y-2 rounded-md border border-dashed border-border/60 bg-background/60 p-2 text-[11px] text-muted-foreground">
                {t.dataSection.customTable.empty}
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="mt-1 h-7 w-full text-[11px]"
                  onClick={() => { window.location.hash = "#/upload"; }}
                >
                  {t.dataSection.customTable.createCta}
                </Button>
              </div>
            ) : (
              <>
                <Row label={t.dataSection.customTable.table}>
                  <SelectField
                    value={(block.customTableId ?? selectedCustomTable?.id ?? customTables[0]?.id ?? "__none__") as string}
                    onChange={(v) => onChange({ customTableId: v === "__none__" ? null : v })}
                    options={[
                      ...customTables.map((table) => ({ value: table.id, label: table.name })),
                      { value: "__none__", label: t.dataSection.customTable.noTable },
                    ]}
                  />
                </Row>
                <Row label={t.dataSection.customTable.orientation}>
                  <SelectField
                    value={(block.customTableOrientation ?? "auto") as CustomTableChartOrientation}
                    onChange={(v) => onChange({ customTableOrientation: v })}
                    options={[
                      { value: "auto", label: t.dataSection.customTable.orientationAuto(customChartData.orientation === "rows") },
                      { value: "rows", label: t.dataSection.customTable.orientationRows },
                      { value: "columns", label: t.dataSection.customTable.orientationColumns },
                    ]}
                  />
                </Row>
                {customChartData.valueOptions.length > 1 && ["pie", "donut", "funnel", "treemap"].includes(ct) && (
                  <Row label={t.dataSection.customTable.series}>
                    <SelectField
                      value={(block.customTableValueColumn ?? customChartData.valueOptions[0]?.value ?? "__none__") as string}
                      onChange={(v) => onChange({ customTableValueColumn: v === "__none__" ? null : v })}
                      options={customChartData.valueOptions}
                    />
                  </Row>
                )}
                {customChartData.warnings.map((warning) => (
                  <p key={warning} className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1.5 text-[10px] leading-snug text-amber-700 dark:text-amber-200">
                    {warning}
                  </p>
                ))}
              </>
            )}
          </div>
        )}
        <Row label={t.dataSection.measure}>
          <SelectField value={block.measure}
            onChange={(v) => onChange({ measure: v as KpiMeasureId })}
            options={KPI_MEASURES.map((m) => {
              const unavailable = unavailableMeasuresForSource(block.dataSource);
              const disabled = unavailable.includes(m.id);
              return {
                value: m.id,
                label: m.label,
                disabled,
                title: disabled ? unavailableHintForSource(block.dataSource) : undefined,
              };
            })} />
        </Row>
        {S.isCombo && (
          <>
            <Row label={t.dataSection.lineMeasure}>
              <SelectField value={(style.measureLine ?? "__none__") as string}
                onChange={(v) => updStyle({ measureLine: v === "__none__" ? undefined : v as KpiMeasureId })}
                options={[
                  { value: "__none__", label: t.dataSection.lineMeasureNone },
                  ...KPI_MEASURES.map((m) => ({
                    value: m.id, label: m.label,
                    disabled: unavailableMeasuresForSource(block.dataSource).includes(m.id),
                  })),
                ]} />
            </Row>
            {(style.measureLine === undefined || (style.measureLine as string) === "__none__") && (
              <p className="text-[10px] text-amber-500 leading-snug">
                {t.dataSection.comboHint}
              </p>
            )}
          </>
        )}
        {S.isCombo && (
          <div className="space-y-2 rounded-lg border border-primary/15 bg-primary/5 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[12px] font-medium text-foreground/85">{t.dataSection.multiBase.title}</div>
                <p className="text-[10px] leading-snug text-muted-foreground">
                  {t.dataSection.multiBase.hint}
                </p>
              </div>
              <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]"
                onClick={installVolumeScenario}>
                {t.dataSection.multiBase.quickInstall}
              </Button>
            </div>

            {(block.comboSeries ?? []).length === 0 && (
              <div className="rounded-md border border-dashed border-border/50 bg-background/50 p-2 text-[11px] text-muted-foreground">
                {t.dataSection.multiBase.empty}
              </div>
            )}

            {(block.comboSeries ?? []).map((series) => {
              const unavailable = unavailableMeasuresForSource(series.dataSource).includes(series.measure);
              return (
                <div key={series.id} className="space-y-2 rounded-md border border-border/40 bg-background/70 p-2">
                  <div className="flex items-center gap-2">
                    <DraftInput
                      value={series.name}
                      onCommit={(value) => patchComboSeries(series.id, { name: value })}
                      className="h-8 min-w-0 text-[12px]"
                    />
                    <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0"
                      onClick={() => removeComboSeries(series.id)}
                      title={t.dataSection.multiBase.removeSeries}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <Row label={tc.base}>
                    <SelectField value={series.dataSource}
                      onChange={(v) => {
                        const nextSource = v as BlockDataSource;
                        const nextMeasure = isFromForecastBase(nextSource) ? "volume" : series.measure;
                        patchComboSeries(series.id, {
                          dataSource: nextSource,
                          measure: unavailableMeasuresForSource(nextSource).includes(nextMeasure) ? "volume" : nextMeasure,
                        });
                      }}
                      options={[
                        { value: "ke30", label: t.dataSection.multiBase.sourceOptions.real },
                        { value: "budget", label: t.dataSection.multiBase.sourceOptions.budget },
                        { value: "forecast", label: t.dataSection.multiBase.sourceOptions.forecast },
                        { value: "rolling", label: t.dataSection.multiBase.sourceOptions.rolling },
                      ]} />
                  </Row>
                  <Row label={tc.measure}>
                    <SelectField value={series.measure}
                      onChange={(v) => patchComboSeries(series.id, { measure: v as KpiMeasureId })}
                      options={availableMeasuresForSource(series.dataSource)} />
                  </Row>
                  {unavailable && (
                    <p className="text-[10px] leading-snug text-amber-500">
                      {t.dataSection.multiBase.unavailableMeasure}
                    </p>
                  )}
                  <Row label={t.dataSection.multiBase.render}>
                    <Segmented value={series.asLine === false ? "bar" : "line"}
                      onChange={(v) => {
                        patchComboSeries(series.id, { asLine: v === "line" });
                        updSeries(series.name, { asLine: v === "line" });
                      }}
                      options={[
                        { value: "line", label: t.dataSection.multiBase.renderOptions.line },
                        { value: "bar", label: t.dataSection.multiBase.renderOptions.bar },
                      ]} />
                  </Row>
                  <ToggleField label={t.dataSection.multiBase.secondaryAxis}
                    value={!!series.secondaryAxis}
                    onChange={(v) => {
                      patchComboSeries(series.id, { secondaryAxis: v });
                      updSeries(series.name, { secondaryAxis: v });
                    }} />
                </div>
              );
            })}

            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="secondary" className="h-7 px-2 text-[11px]"
                onClick={() => addComboSeries("ke30", "volume")}>
                <Plus className="mr-1 h-3 w-3" />
                {t.dataSection.multiBase.addReal}
              </Button>
              <Button size="sm" variant="secondary" className="h-7 px-2 text-[11px]"
                onClick={() => addComboSeries("budget", "volume")}>
                <Plus className="mr-1 h-3 w-3" />
                {t.dataSection.multiBase.addBudget}
              </Button>
              <Button size="sm" variant="secondary" className="h-7 px-2 text-[11px]"
                onClick={() => addComboSeries("forecast", "volume")}>
                <Plus className="mr-1 h-3 w-3" />
                {t.dataSection.multiBase.addForecast}
              </Button>
              <Button size="sm" variant="secondary" className="h-7 px-2 text-[11px]"
                onClick={() => addComboSeries("rolling", "volume")}>
                <Plus className="mr-1 h-3 w-3" />
                {t.dataSection.multiBase.addRolling}
              </Button>
              {(block.comboSeries ?? []).length > 0 && (
                <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]"
                  onClick={() => onChange({ comboSeries: [] } as Patch)}>
                  {t.dataSection.multiBase.clear}
                </Button>
              )}
            </div>
          </div>
        )}
        {(ct === "bubble" || ct === "scatter") && (
          <>
            <Row label={t.dataSection.axisXMeasure}>
              <SelectField value={(style.measureX ?? "__none__") as string}
                onChange={(v) => updStyle({ measureX: v === "__none__" ? undefined : v as KpiMeasureId })}
                options={[
                  { value: "__none__", label: t.dataSection.axisXIndex },
                  ...KPI_MEASURES.map((m) => ({
                    value: m.id, label: m.label,
                    disabled: unavailableMeasuresForSource(block.dataSource).includes(m.id),
                  })),
                ]} />
            </Row>
            <Row label={t.dataSection.axisYMeasure}>
              <SelectField value={(style.measureY ?? "__none__") as string}
                onChange={(v) => updStyle({ measureY: v === "__none__" ? undefined : v as KpiMeasureId })}
                options={[
                  { value: "__none__", label: t.dataSection.axisYMain },
                  ...KPI_MEASURES.map((m) => ({
                    value: m.id, label: m.label,
                    disabled: unavailableMeasuresForSource(block.dataSource).includes(m.id),
                  })),
                ]} />
            </Row>
            {ct === "bubble" && (
              <p className="text-[10px] leading-snug text-muted-foreground">
                {t.dataSection.bubbleSizeHint}
              </p>
            )}
            {(style.measureX !== undefined || style.measureY !== undefined) && (
              <p className="text-[10px] text-muted-foreground leading-snug">
                {t.dataSection.xyColorHint}
              </p>
            )}
          </>
        )}
        {unavailableMeasuresForSource(block.dataSource).includes(block.measure) && (
          <p className="text-[10px] leading-snug text-muted-foreground">
            {unavailableHintForSource(block.dataSource)}
          </p>
        )}
        {ct !== "mapaBrasil" && (ct !== "waterfall" || (style.waterfall.mode ?? "pvm") === "manual") && (
          <Row label={t.dataSection.breakdown}>
            <SelectField value={block.breakdown ?? "__none__"}
              onChange={(v) => {
                clearFilter(block.id);
                onChange({ breakdown: v === "__none__" ? null : v });
              }}
              options={[
                { value: "__none__", label: t.dataSection.breakdownSingleSeries },
                ...(block.measure === "positivacao"
                  ? POSITIVACAO_BREAKDOWN_OPTIONS
                  : [
                      { value: "marca", label: t.dataSection.dims.marca },
                      { value: "canalAjustado", label: t.dataSection.dims.canalAjustado },
                      { value: "gestorResp", label: t.dataSection.dims.gestorResp },
                      { value: "categoria", label: t.dataSection.dims.categoria },
                      { value: "mercado", label: t.dataSection.dims.mercado },
                      { value: "inovacao", label: t.dataSection.dims.inovacao },
                    ]),
              ]} />
          </Row>
        )}
        {ct === "waterfall" && (style.waterfall.mode ?? "pvm") === "pvm" && (
          <>
            <Row label={t.dataSection.decomposition}>
              <SelectField
                value={style.waterfall.pvm?.decomposition ?? "effects"}
                onChange={(v) => updPath("waterfall", {
                  pvm: { ...(style.waterfall.pvm ?? {}), decomposition: v }
                })}
                options={[
                  { value: "effects", label: t.dataSection.decompositionEffects },
                  { value: "marca", label: t.dataSection.dims.marca },
                  { value: "canalAjustado", label: t.dataSection.dims.canalAjustado },
                  { value: "categoria", label: t.dataSection.dims.categoria },
                  { value: "mercado", label: t.dataSection.dims.mercado },
                ]} />
            </Row>
            {(style.waterfall.pvm?.decomposition ?? "effects") !== "effects" && (
              <Row label={t.dataSection.topNItems}>
                <NumberStepper
                  value={style.waterfall.pvm?.topN ?? 6}
                  min={3} max={20}
                  onChange={(v) => updPath("waterfall", {
                    pvm: { ...(style.waterfall.pvm ?? {}), topN: v }
                  })} />
              </Row>
            )}
          </>
        )}

        {/* B.1 — Field well: Eixo X */}
        {["line", "area", "stackedArea", "bar", "column", "hbar",
          "stackedColumn", "stackedBar", "combo"].includes(ct) && (
          <Row label={t.dataSection.axisX}>
            <SelectField value={block.fieldWells?.xDim ?? "period"}
              onChange={(v) => onChange({
                fieldWells: { ...(block.fieldWells ?? {}), xDim: v === "period" ? null : v },
              })}
              options={[
                { value: "period", label: t.dataSection.period },
                { value: "marca", label: t.dataSection.dims.marca },
                { value: "canalAjustado", label: t.dataSection.dims.canalAjustado },
                { value: "categoria", label: t.dataSection.dims.categoria },
                { value: "mercado", label: t.dataSection.dims.mercado },
                { value: "inovacao", label: t.dataSection.dims.inovacao },
              ]} />
          </Row>
        )}

        {/* B.1 — Field wells: Cor / Tooltip / Rótulo */}
        {["line", "area", "stackedArea", "bar", "column", "hbar",
          "stackedColumn", "stackedBar", "combo", "scatter", "bubble"].includes(ct) && (
          <>
            {(!(ct === "scatter" || ct === "bubble") || (!style.measureX && !style.measureY)) && (
              <Row label={t.dataSection.colorLegend}>
                <SelectField value={block.fieldWells?.colorDim ?? "__none__"}
                  onChange={(v) => {
                    clearFilter(block.id);
                    onChange({
                      fieldWells: { ...(block.fieldWells ?? {}), colorDim: v === "__none__" ? null : v },
                    });
                  }}
                  options={[
                    { value: "__none__", label: tc.noneOption },
                    ...(block.measure === "positivacao"
                      ? POSITIVACAO_BREAKDOWN_OPTIONS
                      : [
                          { value: "marca", label: t.dataSection.dims.marca },
                          { value: "canalAjustado", label: t.dataSection.dims.canalAjustado },
                          { value: "gestorResp", label: t.dataSection.dims.gestorResp },
                          { value: "categoria", label: t.dataSection.dims.categoria },
                          { value: "mercado", label: t.dataSection.dims.mercado },
                          { value: "inovacao", label: t.dataSection.dims.inovacao },
                        ]),
                  ]} />
              </Row>
            )}
            <Row label={t.dataSection.tooltipExtra}>
              <SelectField value={(block.fieldWells?.tooltipMeasure ?? "__none__") as string}
                onChange={(v) => onChange({
                  fieldWells: { ...(block.fieldWells ?? {}),
                    tooltipMeasure: v === "__none__" ? null : v as KpiMeasureId },
                })}
                options={[
                  { value: "__none__", label: "— Nenhuma —" },
                  ...KPI_MEASURES.map((m) => ({ value: m.id, label: m.label })),
                ]} />
            </Row>
            {(ct === "scatter" || ct === "bubble") && (
              <Row label={t.dataSection.pointLabel}>
                <SelectField value={block.fieldWells?.labelDim ?? "__none__"}
                  onChange={(v) => onChange({
                    fieldWells: { ...(block.fieldWells ?? {}), labelDim: v === "__none__" ? null : v },
                  })}
                  options={[
                    { value: "__none__", label: tc.noneOption },
                    ...(block.measure === "positivacao"
                      ? POSITIVACAO_BREAKDOWN_OPTIONS
                      : [
                          { value: "marca", label: t.dataSection.dims.marca },
                          { value: "canalAjustado", label: t.dataSection.dims.canalAjustado },
                          { value: "gestorResp", label: t.dataSection.dims.gestorResp },
                          { value: "categoria", label: t.dataSection.dims.categoria },
                          { value: "mercado", label: t.dataSection.dims.mercado },
                          { value: "inovacao", label: t.dataSection.dims.inovacao },
                        ]),
                  ]} />
              </Row>
            )}
          </>
        )}

        {/* B.5 — Sort */}
        <Row label={t.dataSection.sortBy}>
          <SelectField value={block.sortConfig?.field ?? "period"}
            onChange={(v) => onChange({
              sortConfig: { field: v as never, dir: block.sortConfig?.dir ?? "asc" },
            })}
            options={[
              ...(["pie", "donut", "funnel", "treemap", "scatter", "bubble", "histogram", "boxplot", "radar"].includes(ct)
                ? [] : [{ value: "period", label: t.dataSection.period }]),
              { value: "value", label: t.dataSection.sortValue },
              { value: "name", label: t.dataSection.sortName },
            ]} />
        </Row>
        <Row label={t.dataSection.sortDirection}>
          <Segmented value={block.sortConfig?.dir ?? "asc"}
            onChange={(v) => onChange({
              sortConfig: { field: block.sortConfig?.field ?? "period", dir: v as never },
            })}
            options={[
              { value: "asc", label: t.dataSection.sortAsc },
              { value: "desc", label: t.dataSection.sortDesc },
            ]} />
        </Row>

        {/* B.4 — Bridge column builder (apenas no modo manual) */}
        {ct === "waterfall" && (style.waterfall.mode ?? "pvm") === "manual" && (
          <>
            {(style.waterfall.columns ?? []).length === 0 && (
              <div className="rounded-lg border border-dashed border-border/50 bg-card/30 p-3 text-center">
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {t.dataSection.bridgeEmpty.hint}
                </p>
                <button
                  className="mt-2 text-[11px] text-primary hover:underline"
                  onClick={() => {
                    const defaultCols = [
                      { id: rid(), label: t.waterfall.columns.typeOptions.start, type: "start" as const },
                      { id: rid(), label: t.waterfall.columns.seedColumnA, type: "positive" as const },
                      { id: rid(), label: t.waterfall.columns.seedColumnB, type: "negative" as const },
                      { id: rid(), label: t.waterfall.columns.typeOptions.total, type: "total" as const },
                    ];
                    updPath("waterfall", { columns: defaultCols });
                  }}
                >
                  {t.dataSection.bridgeEmpty.useTemplate}
                </button>
              </div>
            )}
            <BridgeColumnBuilder block={block} onChange={onChange}
              dsRows={dsRows}
              value={style.waterfall.columns ?? []}
              setValue={(cols) => updPath("waterfall", { columns: cols })} />
          </>
        )}
      </Section>

      {/* ===== Interatividade — moved out of "Geral" ===== */}
      <Section title={t.interactivity.title}>
        <ToggleField label={t.interactivity.emitFilter}
          value={block.emitsCrossFilter !== false}
          onChange={(v) => onChange({ emitsCrossFilter: v })} />
        <ToggleField label={t.interactivity.receiveFilter}
          value={block.participatesInCrossFilter !== false}
          onChange={(v) => onChange({ participatesInCrossFilter: v })} />
      </Section>
        </TabsContent>

        {/* ============================ VISUAL TAB ============================ */}
        <TabsContent value="visual" className="mt-3 space-y-3">
      {/* Quick style presets */}
      <div className="rounded-lg border border-border/50 bg-card/40 p-3">
        <div className="mb-2 text-[12px] font-medium text-foreground/85">{t.quickStyles}</div>
        <div className="grid grid-cols-5 gap-1.5">
          {STYLE_PRESETS.map((p) => (
            <button key={p.id} type="button"
              onClick={() => updStyle(buildStylePresetPatch(p.id as StylePresetId, style))}
              className="flex flex-col items-center gap-1 rounded-md border border-border/40 p-1.5 text-[10px] text-muted-foreground transition-colors hover:border-primary/50 hover:bg-secondary hover:text-foreground">
              <PresetThumbnail id={p.id as StylePresetId} />
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ============================================================ */}
      {/* FIX 3 — Chart-specific sections appear FIRST (most relevant) */}
      {/* ============================================================ */}

      {/* ===== Type-specific: Bar ===== */}
      {S.showBar && (
        <Section title={t.bar.title} onReset={() => resetPath("bar")}>
          <Row label={tc.type}>
            <SelectField value={style.bar.mode}
              onChange={(v) => updPath("bar", { mode: v as never })}
              options={[
                { value: "grouped", label: t.bar.modeOptions.grouped },
                { value: "stacked", label: t.bar.modeOptions.stacked },
                { value: "stacked100", label: t.bar.modeOptions.stacked100 },
              ]} />
          </Row>
          <Row label={tc.spacing}>
            <NumberStepper value={style.bar.gapPct} min={0} max={80}
              onChange={(v) => updPath("bar", { gapPct: v })} suffix="%" />
          </Row>
          <Row label={t.bar.corners}>
            <NumberStepper value={style.bar.cornerRadius} min={0} max={20}
              onChange={(v) => updPath("bar", { cornerRadius: v })} suffix="px" />
          </Row>
          <Row label={tc.border}><ColorField value={style.bar.borderColor}
            onChange={(c) => updPath("bar", { borderColor: c })} /></Row>
          <Row label={tc.borderWidth}>
            <NumberStepper value={style.bar.borderWidth} min={0} max={5}
              onChange={(v) => updPath("bar", { borderWidth: v })} suffix="px" />
          </Row>
        </Section>
      )}

      {/* ===== Type-specific: Pie/Donut ===== */}
      {S.isPie && (
        <Section title={t.pie.title} onReset={() => resetPath("pie")}>
          {ct === "donut" && (
            <Row label={t.pie.hole}>
              <NumberStepper value={style.pie.donutHolePct} min={0} max={80}
                onChange={(v) => updPath("pie", { donutHolePct: v })} suffix="%" />
            </Row>
          )}
          <Row label={t.pie.startAngle}>
            <NumberStepper value={style.pie.startAngle} min={0} max={360}
              onChange={(v) => updPath("pie", { startAngle: v })} suffix="°" />
          </Row>
          <Row label={t.pie.labels}>
            <SelectField value={style.pie.labelMode}
              onChange={(v) => updPath("pie", { labelMode: v as never })}
              options={[
                { value: "name-percent", label: t.pie.labelModes.namePercent },
                { value: "name-value", label: t.pie.labelModes.nameValue },
                { value: "name", label: t.pie.labelModes.name },
                { value: "percent", label: t.pie.labelModes.percent },
                { value: "value", label: t.pie.labelModes.value },
              ]} />
          </Row>
          <Row label={t.pie.explosion}>
            <Slider value={style.pie.explodePct} max={30}
              onChange={(v) => updPath("pie", { explodePct: v })} />
          </Row>
          {detectedRanking.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[12px] font-medium text-muted-foreground">{t.pie.slices}</div>
              {detectedRanking.map((name, i) => {
                const sl = style.pie.slices[name] ?? {};
                return (
                  <div key={name} className="space-y-1.5 rounded border border-border/30 p-2.5">
                    <div className="text-[12px] font-medium truncate">{name}</div>
                    <Row label={tc.color}>
                      <ColorField value={sl.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length]}
                        onChange={(c) => updPath("pie", {
                          slices: { ...style.pie.slices, [name]: { ...sl, color: c } },
                        })} />
                    </Row>
                    <Row label={t.pie.sliceExplosion}>
                      <Slider value={sl.explode ?? 0} max={30}
                        onChange={(v) => updPath("pie", {
                          slices: { ...style.pie.slices, [name]: { ...sl, explode: v } },
                        })} />
                    </Row>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      )}

      {/* ===== Type-specific: Bubble ===== */}
      {ct === "bubble" && (
        <Section title={t.bubble.title} onReset={() => resetPath("bubble")}>
          <Row label={t.bubble.minSize}>
            <NumberStepper value={style.bubble.minSize} min={20} max={500}
              onChange={(v) => updPath("bubble", { minSize: v })} suffix="px" />
          </Row>
          <Row label={t.bubble.maxSize}>
            <NumberStepper value={style.bubble.maxSize} min={50} max={2000}
              onChange={(v) => updPath("bubble", { maxSize: v })} suffix="px" />
          </Row>
          <Row label={t.bubble.opacity}>
            <Slider value={Math.round(style.bubble.fillOpacity * 100)}
              onChange={(v) => updPath("bubble", { fillOpacity: v / 100 })} />
          </Row>
          <Row label={tc.border}><ColorField value={style.bubble.borderColor}
            onChange={(c) => updPath("bubble", { borderColor: c })} /></Row>
          <Row label={tc.borderWidth}>
            <NumberStepper value={style.bubble.borderWidth} min={0} max={5}
              onChange={(v) => updPath("bubble", { borderWidth: v })} suffix="px" />
          </Row>
          <ToggleField label={t.bubble.showSizeLabel}
            value={style.bubble.showSizeLabel}
            onChange={(v) => updPath("bubble", { showSizeLabel: v })} />
        </Section>
      )}

      {/* ===== Type-specific: Area ===== */}
      {S.showArea && (
        <Section title={t.area.title} onReset={() => resetPath("area")}>
          <ToggleField label={t.area.stacked} value={style.area.stacked}
            onChange={(v) => updPath("area", { stacked: v })} />
          <ToggleField label={t.area.lineOnTop} value={style.area.lineOnTop}
            onChange={(v) => updPath("area", { lineOnTop: v })} />
        </Section>
      )}

      {/* ===== Type-specific: Waterfall ===== */}
      {ct === "waterfall" && (
        <Section title={t.waterfall.title} onReset={() => resetPath("waterfall")}>
          <PvmBridgePicker block={block} style={style} dsRows={dsRows} updPath={updPath} />
          <Row label={t.waterfall.positiveColor}><ColorField value={style.waterfall.positiveColor}
            onChange={(c) => updPath("waterfall", { positiveColor: c })} /></Row>
          <Row label={t.waterfall.negativeColor}><ColorField value={style.waterfall.negativeColor}
            onChange={(c) => updPath("waterfall", { negativeColor: c })} /></Row>
          <Row label={t.waterfall.totalColor}><ColorField value={style.waterfall.totalColor}
            onChange={(c) => updPath("waterfall", { totalColor: c })} /></Row>
          <ToggleField label={t.waterfall.connectors} value={style.waterfall.connectors}
            onChange={(v) => updPath("waterfall", { connectors: v })} />
          <Row label={t.waterfall.connectorColor}>
            <ColorField value={style.waterfall.connectorColor}
              onChange={(c) => updPath("waterfall", { connectorColor: c })} />
          </Row>
          <Row label={t.waterfall.connectorStyle}>
            <Segmented value={style.waterfall.connectorStyle}
              onChange={(v) => updPath("waterfall", { connectorStyle: v as never })}
              options={[
                { value: "solid", label: tc.lineStyles.solid },
                { value: "dashed", label: tc.lineStyles.dashed },
              ]} />
          </Row>
          <ToggleField label={t.waterfall.runningTotal} value={style.waterfall.showRunningTotal}
            onChange={(v) => updPath("waterfall", { showRunningTotal: v })} />
          <Row label={tc.spacing}>
            <NumberStepper value={style.waterfall.gapPct} min={0} max={80}
              onChange={(v) => updPath("waterfall", { gapPct: v })} suffix="%" />
          </Row>
          {(style.waterfall.mode ?? "pvm") === "manual" && detectedCategories.length > 0 && (
            <div className="space-y-1">
              <div className="text-[12px] font-medium text-muted-foreground">{t.waterfall.classification}</div>
              {detectedCategories.map((label, i) => {
                const lbl = `P${i + 1}`;
                const current = style.waterfall.classify[lbl] ?? "positive";
                return (
                  <Row key={lbl} label={label}>
                    <SelectField value={current}
                      onChange={(v) => updPath("waterfall", {
                        classify: { ...style.waterfall.classify, [lbl]: v as never },
                      })}
                      options={[
                        { value: "positive", label: t.waterfall.classifyOptions.positive },
                        { value: "negative", label: t.waterfall.classifyOptions.negative },
                        { value: "total", label: t.waterfall.classifyOptions.total },
                      ]} />
                  </Row>
                );
              })}
            </div>
          )}
        </Section>
      )}

      {/* ===== Type-specific: Funnel ===== */}
      {ct === "funnel" && (
        <Section title={t.funnel.title} onReset={() => resetPath("funnel")}>
          <Row label={tc.direction}>
            <Segmented value={style.funnel.direction}
              onChange={(v) => updPath("funnel", { direction: v as never })}
              options={[
                { value: "ttb", label: t.funnel.directionOptions.ttb },
                { value: "btt", label: t.funnel.directionOptions.btt },
              ]} />
          </Row>
          <Row label={tc.spacing}>
            <Slider value={style.funnel.gapPct} max={20}
              onChange={(v) => updPath("funnel", { gapPct: v })} />
          </Row>
          <Row label={t.pie.labels}>
            <SelectField value={style.funnel.labelMode}
              onChange={(v) => updPath("funnel", { labelMode: v as never })}
              options={[
                { value: "name-percent", label: t.funnel.labelModes.namePercent },
                { value: "name", label: t.funnel.labelModes.name },
                { value: "value", label: t.funnel.labelModes.value },
                { value: "percent", label: t.funnel.labelModes.percent },
              ]} />
          </Row>
          {detectedRanking.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[12px] font-medium text-muted-foreground">{t.funnel.stages}</div>
              {detectedRanking.map((name, i) => {
                const sl = style.funnel.slices[name] ?? {};
                return (
                  <Row key={name} label={name}>
                    <ColorField value={sl.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length]}
                      onChange={(c) => updPath("funnel", {
                        slices: { ...style.funnel.slices, [name]: { color: c } },
                      })} />
                  </Row>
                );
              })}
            </div>
          )}
        </Section>
      )}

      {/* ===== Type-specific: Treemap ===== */}
      {ct === "treemap" && (
        <Section title={t.treemap.title} onReset={() => resetPath("treemap")}>
          <Row label={t.treemap.colorScheme}>
            <Segmented value={style.treemap.colorScheme}
              onChange={(v) => updPath("treemap", { colorScheme: v as never })}
              options={[
                { value: "categorical", label: t.treemap.colorSchemeOptions.categorical },
                { value: "gradient", label: t.treemap.colorSchemeOptions.gradient },
              ]} />
          </Row>
          {style.treemap.colorScheme === "gradient" && (
            <>
              <Row label={t.treemap.gradientFrom}>
                <ColorField value={style.treemap.gradientFrom}
                  onChange={(c) => updPath("treemap", { gradientFrom: c })} />
              </Row>
              <Row label={t.treemap.gradientTo}>
                <ColorField value={style.treemap.gradientTo}
                  onChange={(c) => updPath("treemap", { gradientTo: c })} />
              </Row>
            </>
          )}
          <ToggleField label={t.treemap.showName} value={style.treemap.showCategoryLabel}
            onChange={(v) => updPath("treemap", { showCategoryLabel: v })} />
          <ToggleField label={t.treemap.showValue} value={style.treemap.showValueLabel}
            onChange={(v) => updPath("treemap", { showValueLabel: v })} />
          <Row label={tc.borderColor}>
            <ColorField value={style.treemap.borderColor}
              onChange={(c) => updPath("treemap", { borderColor: c })} />
          </Row>
          <Row label={tc.borderWidth}>
            <NumberStepper value={style.treemap.borderWidth} min={0} max={5}
              onChange={(v) => updPath("treemap", { borderWidth: v })} suffix="px" />
          </Row>
        </Section>
      )}

      {/* ===== Type-specific: Brazil map ===== */}
      {ct === "mapaBrasil" && (
        <Section title={t.mapaBrasil.title} onReset={() => resetPath("mapaBrasil")}>
          <Row label={t.mapaBrasil.palette}>
            <Segmented value={style.mapaBrasil.palette}
              onChange={(v) => updPath("mapaBrasil", { palette: v as never })}
              options={[
                { value: "harald", label: t.mapaBrasil.paletteOptions.harald },
                { value: "blue", label: t.mapaBrasil.paletteOptions.blue },
                { value: "diverging", label: t.mapaBrasil.paletteOptions.diverging },
                { value: "gray", label: t.mapaBrasil.paletteOptions.gray },
              ]} />
          </Row>
          <Row label={t.mapaBrasil.cutoff}>
            <NumberStepper value={style.mapaBrasil.minRolSharePct} min={0} max={10} step={0.1}
              onChange={(v) => updPath("mapaBrasil", {
                minRolSharePct: Math.max(0, Math.round(v * 10) / 10),
              })} suffix="%" />
          </Row>
          <p className="rounded-md bg-muted/40 px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
            {t.mapaBrasil.cutoffHint}
          </p>
        </Section>
      )}

      {/* ===== Type-specific: Radar ===== */}
      {S.isRadar && (
        <Section title={t.radar.title} onReset={() => resetPath("radar")}>
          <ToggleField label={t.radar.fillArea} value={style.radar.fillArea}
            onChange={(v) => updPath("radar", { fillArea: v })} />
          <Row label={t.radar.fillOpacity}>
            <Slider value={Math.round(style.radar.fillOpacity * 100)}
              onChange={(v) => updPath("radar", { fillOpacity: v / 100 })} />
          </Row>
          <Row label={t.radar.gridShape}>
            <Segmented value={style.radar.gridShape}
              onChange={(v) => updPath("radar", { gridShape: v as never })}
              options={[
                { value: "polygon", label: t.radar.gridShapeOptions.polygon },
                { value: "circle", label: t.radar.gridShapeOptions.circle },
              ]} />
          </Row>
          <Row label={t.radar.gridColor}>
            <ColorField value={style.radar.gridColor}
              onChange={(c) => updPath("radar", { gridColor: c })} />
          </Row>
          <Row label={t.radar.axisLabelSize}>
            <NumberStepper value={style.radar.axisLabelSize} min={6} max={24}
              onChange={(v) => updPath("radar", { axisLabelSize: v })} suffix="pt" />
          </Row>
          <Row label={t.radar.axisLabelColor}>
            <ColorField value={style.radar.axisLabelColor}
              onChange={(c) => updPath("radar", { axisLabelColor: c })} />
          </Row>
        </Section>
      )}

      {/* ===== Type-specific: Histogram ===== */}
      {ct === "histogram" && (
        <Section title={t.histogram.title} onReset={() => resetPath("histogram")}>
          <Row label={t.histogram.bins}>
            <NumberStepper value={style.histogram.bins} min={2} max={100}
              onChange={(v) => updPath("histogram", { bins: v })} />
          </Row>
          <Row label={t.histogram.binWidth}>
            <DraftNumberInput className="h-8 text-[13px]"
              value={style.histogram.binWidth ?? null} placeholder="auto"
              fallback={null}
              onCommit={(value) => updPath("histogram", { binWidth: value })} />
          </Row>
          <Row label={t.histogram.barColor}>
            <ColorField value={style.histogram.barColor}
              onChange={(c) => updPath("histogram", { barColor: c })} />
          </Row>
          <Row label={tc.borderColor}>
            <ColorField value={style.histogram.borderColor}
              onChange={(c) => updPath("histogram", { borderColor: c })} />
          </Row>
          <Row label={tc.borderWidth}>
            <NumberStepper value={style.histogram.borderWidth} min={0} max={5}
              onChange={(v) => updPath("histogram", { borderWidth: v })} suffix="px" />
          </Row>
          <ToggleField label={t.histogram.cumulative} value={style.histogram.cumulative}
            onChange={(v) => updPath("histogram", { cumulative: v })} />
        </Section>
      )}

      {/* ===== Type-specific: Boxplot ===== */}
      {ct === "boxplot" && (
        <Section title={t.boxplot.title} onReset={() => resetPath("boxplot")}>
          <Row label={t.boxplot.boxColor}>
            <ColorField value={style.boxplot.boxFillColor}
              onChange={(c) => updPath("boxplot", { boxFillColor: c })} />
          </Row>
          <Row label={t.boxplot.whiskerColor}>
            <ColorField value={style.boxplot.whiskerColor}
              onChange={(c) => updPath("boxplot", { whiskerColor: c })} />
          </Row>
          <Row label={t.boxplot.whiskerWidth}>
            <NumberStepper value={style.boxplot.whiskerWidth} min={0.5} max={6} step={0.5}
              onChange={(v) => updPath("boxplot", { whiskerWidth: v })} suffix="px" />
          </Row>
          <Row label={t.boxplot.medianColor}>
            <ColorField value={style.boxplot.medianColor}
              onChange={(c) => updPath("boxplot", { medianColor: c })} />
          </Row>
          <Row label={t.boxplot.medianWidth}>
            <NumberStepper value={style.boxplot.medianWidth} min={0.5} max={6} step={0.5}
              onChange={(v) => updPath("boxplot", { medianWidth: v })} suffix="px" />
          </Row>
          <ToggleField label={t.boxplot.showMean} value={style.boxplot.showMean}
            onChange={(v) => updPath("boxplot", { showMean: v })} />
          <ToggleField label={t.boxplot.showOutliers} value={style.boxplot.showOutliers}
            onChange={(v) => updPath("boxplot", { showOutliers: v })} />
        </Section>
      )}

      {/* ===== Data labels (moved up — frequently used) ===== */}
      <Section title={t.dataLabels.title} onReset={() => resetPath("dataLabels")}>
        <ToggleField label={t.dataLabels.show} value={style.dataLabels.show}
          onChange={(v) => updPath("dataLabels", { show: v })} />
        <Row label={t.dataLabels.size}>
          <NumberStepper value={style.dataLabels.size} min={6} max={24}
            onChange={(v) => updPath("dataLabels", { size: v })} suffix="pt" />
        </Row>
        <Row label={tc.color}><ColorField value={style.dataLabels.color}
          onChange={(c) => updPath("dataLabels", { color: c })} /></Row>
        <ToggleField label={tc.bold} value={style.dataLabels.bold}
          onChange={(v) => updPath("dataLabels", { bold: v })} />
        <ToggleField label={tc.italic} value={style.dataLabels.italic}
          onChange={(v) => updPath("dataLabels", { italic: v })} />
        {ct !== "histogram" && ct !== "boxplot" && (
          <Row label={t.dataLabels.position}>
            <SelectField value={ct === "funnel" ? (style.funnel.labelPos ?? "right") : style.dataLabels.position}
              onChange={(v) => ct === "funnel"
                ? updPath("funnel", { labelPos: v as never })
                : updPath("dataLabels", { position: v as never })}
              options={positionOptions(ct) as never} />
          </Row>
        )}
        {ct !== "histogram" && (
          <Row label={tc.format}>
            <SelectField value={style.dataLabels.format}
              onChange={(v) => updPath("dataLabels", { format: v as never })}
              options={[
                { value: "auto", label: tc.formatOptions.auto },
                { value: "currency", label: tc.formatOptions.currency },
                { value: "percent", label: tc.formatOptions.percent },
                { value: "number", label: tc.formatOptions.number },
                { value: "tons", label: tc.formatOptions.tons },
              ]} />
          </Row>
        )}
        {ct !== "histogram" && (
          <Row label={tc.decimals}>
            <NumberStepper value={style.dataLabels.decimals} min={0} max={4}
              onChange={(v) => updPath("dataLabels", { decimals: v })} />
          </Row>
        )}
        <ToggleField label={t.dataLabels.autoContrast} value={style.dataLabels.autoContrast}
          onChange={(v) => updPath("dataLabels", { autoContrast: v })} />
        {ct !== "pie" && ct !== "donut" && (
          <ToggleField label={t.dataLabels.showSeriesName} value={style.dataLabels.showSeries}
            onChange={(v) => updPath("dataLabels", { showSeries: v })} />
        )}
        <ToggleField label={t.dataLabels.showCategory} value={style.dataLabels.showCategory}
          onChange={(v) => updPath("dataLabels", { showCategory: v })} />
        <Row label={t.dataLabels.background}>
          <ColorField value={style.dataLabels.bgColor}
            onChange={(c) => updPath("dataLabels", { bgColor: c })} />
        </Row>
        <Row label={t.dataLabels.backgroundOpacity}>
          <Slider value={Math.round(style.dataLabels.bgOpacity * 100)}
            onChange={(v) => updPath("dataLabels", { bgOpacity: v / 100 })} />
        </Row>
        <Row label={tc.borderColor}>
          <ColorField value={style.dataLabels.borderColor}
            onChange={(c) => updPath("dataLabels", { borderColor: c })} />
        </Row>
        <Row label={tc.borderWidth}>
          <NumberStepper value={style.dataLabels.borderWidth} min={0} max={5}
            onChange={(v) => updPath("dataLabels", { borderWidth: v })} suffix="px" />
        </Row>
      </Section>

      {/* ===== Series (moved up — frequently used) ===== */}
      {S.showSeries && (
        <Section title={t.series.title} onReset={() => updStyle({ series: [] })}>
          <p className="text-[12px] text-muted-foreground">
            {t.series.hint} {detectedSeries.length === 0 && t.series.noneDetected}
          </p>
          {(detectedSeries.length === 0 ? ["Total"] : detectedSeries).map((name, i) => {
            const cfg = getSeriesCfg(name);
            return (
              <div key={name} className="space-y-1.5 rounded border border-border/30 p-2.5">
                <div className="text-[12px] font-medium truncate">{name}</div>
                <Row label={tc.color}>
                  <ColorField value={cfg.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length]}
                    onChange={(c) => updSeries(name, { color: c })} />
                </Row>
                {S.showLineSeriesProps && (
                  <>
                    <Row label={t.series.lineStyle}>
                      <Segmented value={cfg.lineStyle ?? "solid"}
                        onChange={(v) => updSeries(name, { lineStyle: v as never })}
                        options={[
                          { value: "solid", label: tc.lineStylesShort.solid },
                          { value: "dashed", label: tc.lineStylesShort.dashed },
                          { value: "dotted", label: tc.lineStylesShort.dotted },
                        ]} />
                    </Row>
                    <Row label={tc.thickness}>
                      <NumberStepper value={cfg.thickness ?? 2.5} min={0.5} max={8} step={0.5}
                        onChange={(v) => updSeries(name, { thickness: v })} suffix="px" />
                    </Row>
                    <ToggleField label={t.series.smooth} value={cfg.smooth ?? false}
                      onChange={(v) => updSeries(name, { smooth: v })} />
                  </>
                )}
                {S.showArea && (
                  <Row label={t.series.areaOpacity}>
                    <Slider value={Math.round((cfg.areaOpacity ?? 0.35) * 100)}
                      onChange={(v) => updSeries(name, { areaOpacity: v / 100 })} />
                  </Row>
                )}
                {(ct === "line" || ct === "scatter" || ct === "combo") && (
                  <>
                    <Row label={t.series.marker}>
                      <SelectField value={cfg.marker?.shape ?? "circle"}
                        onChange={(v) => updSeries(name, {
                          marker: { ...(cfg.marker ?? { show: true, shape: "circle", size: 3 }),
                            shape: v as never },
                        })}
                        options={[
                          { value: "circle", label: t.series.markerShapes.circle },
                          { value: "square", label: t.series.markerShapes.square },
                          { value: "diamond", label: t.series.markerShapes.diamond },
                          { value: "triangle", label: t.series.markerShapes.triangle },
                        ]} />
                    </Row>
                    <Row label={t.series.markerSize}>
                      <NumberStepper value={cfg.marker?.size ?? 3} min={0} max={12}
                        onChange={(v) => updSeries(name, {
                          marker: { ...(cfg.marker ?? { show: true, shape: "circle", size: 3 }),
                            size: v, show: v > 0 },
                        })} suffix="px" />
                    </Row>
                    <Row label={t.series.markerColor}>
                      <ColorField value={cfg.marker?.fill ?? cfg.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length]}
                        onChange={(c) => updSeries(name, {
                          marker: { ...(cfg.marker ?? { show: true, shape: "circle", size: 3 }),
                            fill: c },
                        })} />
                    </Row>
                  </>
                )}
                {S.isCombo && (
                  <>
                    <Row label={t.series.renderAs}>
                      <Segmented value={cfg.asLine ? "line" : "bar"}
                        onChange={(v) => updSeries(name, { asLine: v === "line" })}
                        options={[
                          { value: "bar", label: t.series.renderAsOptions.bar },
                          { value: "line", label: t.series.renderAsOptions.line },
                        ]} />
                    </Row>
                    <ToggleField label={t.dataSection.multiBase.secondaryAxis} value={cfg.secondaryAxis ?? false}
                      onChange={(v) => updSeries(name, { secondaryAxis: v })} />
                  </>
                )}
              </div>
            );
          })}
        </Section>
      )}

      {/* ============================================================ */}
      {/* Generic sections (Geral, Grade, Eixos) — moved to the bottom */}
      {/* ============================================================ */}

      {/* ===== General ===== */}
      <Section title={t.general.title} onReset={() => resetPath("general")}>
        <div>
          <Label className="text-[12px] font-normal text-muted-foreground">{t.general.chartTitleLabel}</Label>
          <DraftInput className="mt-1 h-8 text-[13px]" value={block.title ?? ""}
            onCommit={(value) => onChange({ title: value })} />
        </div>
        <ToggleField label={t.general.showTitle} value={style.general.titleShow}
          onChange={(v) => updPath("general", { titleShow: v })} />
        <Row label={tc.titleSize}>
          <NumberStepper value={style.general.titleSize} min={8} max={64}
            onChange={(v) => updPath("general", { titleSize: v })} suffix="pt" />
        </Row>
        <Row label={tc.titleColor}>
          <ColorField value={style.general.titleColor}
            onChange={(c) => updPath("general", { titleColor: c })} />
        </Row>
        <ToggleField label={tc.bold} value={style.general.titleBold}
          onChange={(v) => updPath("general", { titleBold: v })} />
        <ToggleField label={tc.italic} value={style.general.titleItalic}
          onChange={(v) => updPath("general", { titleItalic: v })} />
        <Row label={t.general.background}>
          <ColorField value={style.general.background} allowTransparent
            onChange={(c) => updPath("general", { background: c })} />
        </Row>
        <Row label={tc.border}>
          <ColorField value={style.general.borderColor}
            onChange={(c) => updPath("general", { borderColor: c })} />
        </Row>
        <Row label={tc.borderWidth}>
          <NumberStepper value={style.general.borderWidth} min={0} max={8}
            onChange={(v) => updPath("general", { borderWidth: v })} suffix="px" />
        </Row>
        <Row label={t.general.padding}>
          <NumberStepper value={style.general.padding} min={0} max={40}
            onChange={(v) => updPath("general", { padding: v })} suffix="px" />
        </Row>
        <ToggleField label={t.general.showLegend} value={style.general.legendShow}
          onChange={(v) => updPath("general", { legendShow: v })} />
        <Row label={t.general.legendPosition}>
          <SelectField value={style.general.legendPos}
            onChange={(v) => updPath("general", { legendPos: v as never })}
            options={[
              { value: "top", label: t.general.legendPositions.top },
              { value: "bottom", label: t.general.legendPositions.bottom },
              { value: "left", label: t.general.legendPositions.left },
              { value: "right", label: t.general.legendPositions.right },
            ]} />
        </Row>
      </Section>

      {/* ===== Grid ===== */}
      {S.showGrid && (
        <Section title={t.grid.title} onReset={() => resetPath("grid")}>
          <ToggleField label={t.grid.show} value={style.grid.show}
            onChange={(v) => updPath("grid", { show: v })} />
          <Row label={tc.color}><ColorField value={style.grid.color}
            onChange={(c) => updPath("grid", { color: c })} /></Row>
          <Row label={tc.style}>
            <SelectField value={style.grid.style}
              onChange={(v) => updPath("grid", { style: v as never })}
              options={[{ value: "solid", label: tc.lineStyles.solid }, { value: "dashed", label: tc.lineStyles.dashed }]} />
          </Row>
        </Section>
      )}

      {/* ===== Axes ===== */}
      {S.showAxes && (
        <>
          <AxisSection title={t.axis.titleX} axis={style.xAxis}
            onChange={(p) => updPath("xAxis", p)}
            onReset={() => resetPath("xAxis")} />
          <AxisSection title={t.axis.titleY} axis={style.yAxis}
            onChange={(p) => updPath("yAxis", p)}
            onReset={() => resetPath("yAxis")} />
          {S.isCombo && (
            <AxisSection title={t.axis.titleY2} axis={style.yAxis2!}
              onChange={(p) => updPath("yAxis2", p)}
              onReset={() => resetPath("yAxis2")} />
          )}
        </>
      )}
      {S.isRadar && (
        <Section title={t.radar.gridTitle} onReset={() => resetPath("radar")}>
          <Row label={t.radar.gridShape}>
            <Segmented value={style.radar.gridShape}
              onChange={(v) => updPath("radar", { gridShape: v as never })}
              options={[
                { value: "polygon", label: t.radar.gridShapeOptions.polygon },
                { value: "circle", label: t.radar.gridShapeOptions.circle },
              ]} />
          </Row>
          <Row label={t.radar.gridColor}>
            <ColorField value={style.radar.gridColor}
              onChange={(c) => updPath("radar", { gridColor: c })} />
          </Row>
          <Row label={t.radar.axisLabelSize}>
            <NumberStepper value={style.radar.axisLabelSize} min={6} max={24}
              onChange={(v) => updPath("radar", { axisLabelSize: v })} suffix="pt" />
          </Row>
        </Section>
      )}

        </TabsContent>

        {/* ============================ ANÁLISES TAB ============================ */}
        <TabsContent value="analises" className="mt-3 space-y-3">
      {/* B.2 — Conditional formatting */}
      {["bar", "column", "hbar", "waterfall", "treemap"].includes(ct) && (
        <ConditionalSection
          rules={style.conditionalRules ?? []}
          defaultColor={style.conditionalDefault ?? ""}
          onRules={(rules) => updStyle({ conditionalRules: rules })}
          onDefault={(c) => updStyle({ conditionalDefault: c })} />
      )}

      {/* B.1 — Analytics (refLines/trendline/forecast) */}
      {["line", "area", "combo", "bar", "column", "hbar", "scatter", "bubble"].includes(ct) && (
        <AnalyticsSection
          analytics={style.analytics!}
          onChange={(p) => updPath("analytics", p as never)} />
      )}
      {!["bar", "column", "hbar", "waterfall", "treemap", "line", "area", "combo", "scatter", "bubble"].includes(ct) && (
        <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-[12px] text-muted-foreground">
          {t.analytics.noneAvailable}
        </div>
      )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =============================================================
// B.1 Analytics Section — refLines + trendline + forecast
// =============================================================
function AnalyticsSection({ analytics, onChange }: {
  analytics: NonNullable<ChartStyle["analytics"]>;
  onChange: (p: Partial<NonNullable<ChartStyle["analytics"]>>) => void;
}) {
  const refs = analytics.refLines ?? [];
  const trend = analytics.trendline;
  const fc = analytics.forecast;

  const addRef = () => {
    if (refs.length >= 3) return;
    const nrl: ReferenceLineCfg = {
      id: rid(), value: 0, label: t.analytics.refLines.defaultLabel(refs.length + 1),
      color: SLIDE_HEX.chart6, style: "dashed", thickness: 1.5,
    };
    onChange({ refLines: [...refs, nrl] });
  };
  const updRef = (i: number, p: Partial<ReferenceLineCfg>) => {
    const next = [...refs]; next[i] = { ...next[i], ...p };
    onChange({ refLines: next });
  };
  const delRef = (i: number) => {
    onChange({ refLines: refs.filter((_, j) => j !== i) });
  };

  return (
    <Section title={t.analytics.title}>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-[12px] font-medium text-muted-foreground">{t.analytics.refLines.title}</Label>
          <button type="button" onClick={addRef} disabled={refs.length >= 3}
            className="flex items-center gap-1 rounded border border-input px-1.5 py-0.5 text-[10px] hover:bg-secondary disabled:opacity-40">
            <Plus className="h-3 w-3" /> {tc.add}
          </button>
        </div>
        {refs.map((rl, i) => (
          <div key={rl.id} className="space-y-1.5 rounded border border-border/30 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium">#{i + 1}</span>
              <button type="button" onClick={() => delRef(i)}
                className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
            <Row label={t.analytics.refLines.valueY}>
              <DraftNumberInput className="h-8 text-[13px]" value={rl.value}
                fallback={0}
                onCommit={(value) => updRef(i, { value: value ?? 0 })} />
            </Row>
            <Row label={tc.label}>
              <DraftInput className="h-8 text-[13px]" value={rl.label}
                onCommit={(value) => updRef(i, { label: value })} />
            </Row>
            <Row label={tc.color}><ColorField value={rl.color} onChange={(c) => updRef(i, { color: c })} /></Row>
            <Row label={tc.style}>
              <Segmented value={rl.style} onChange={(v) => updRef(i, { style: v as never })}
                options={[
                  { value: "solid", label: tc.lineStylesShort.solid },
                  { value: "dashed", label: tc.lineStylesShort.dashed },
                  { value: "dotted", label: tc.lineStylesShort.dotted },
                ]} />
            </Row>
            <Row label={tc.thickness}>
              <NumberStepper value={rl.thickness} min={0.5} max={6} step={0.5}
                onChange={(v) => updRef(i, { thickness: v })} suffix="px" />
            </Row>
          </div>
        ))}
      </div>

      <div className="mt-2 space-y-1.5 rounded border border-border/30 p-2.5">
        <div className="text-[12px] font-medium text-muted-foreground">{t.analytics.trend.title}</div>
        <ToggleField label={tc.enable} value={trend.enabled}
          onChange={(v) => onChange({ trendline: { ...trend, enabled: v } })} />
        <Row label={t.analytics.trend.type}>
          <SelectField value={trend.type}
            onChange={(v) => onChange({ trendline: { ...trend, type: v as never } })}
            options={[
              { value: "linear", label: t.analytics.trend.typeOptions.linear },
              { value: "exp", label: t.analytics.trend.typeOptions.exp },
              { value: "ma", label: t.analytics.trend.typeOptions.ma },
            ]} />
        </Row>
        {trend.type === "ma" && (
          <Row label={t.analytics.trend.window}>
            <NumberStepper value={trend.maWindow} min={2} max={12}
              onChange={(v) => onChange({ trendline: { ...trend, maWindow: v } })} />
          </Row>
        )}
        <Row label={tc.color}><ColorField value={trend.color}
          onChange={(c) => onChange({ trendline: { ...trend, color: c } })} /></Row>
        <Row label={tc.thickness}>
          <NumberStepper value={trend.thickness} min={0.5} max={6} step={0.5}
            onChange={(v) => onChange({ trendline: { ...trend, thickness: v } })} suffix="px" />
        </Row>
        <Row label={tc.style}>
          <Segmented value={trend.style}
            onChange={(v) => onChange({ trendline: { ...trend, style: v as never } })}
            options={[
              { value: "solid", label: tc.lineStylesShort.solid },
              { value: "dashed", label: tc.lineStylesShort.dashed },
              { value: "dotted", label: tc.lineStylesShort.dotted },
            ]} />
        </Row>
        <ToggleField label={t.analytics.trend.showR2} value={trend.showR2}
          onChange={(v) => onChange({ trendline: { ...trend, showR2: v } })} />
      </div>

      <div className="mt-2 space-y-1.5 rounded border border-border/30 p-2.5">
        <div className="text-[12px] font-medium text-muted-foreground">{t.analytics.forecast.title}</div>
        <ToggleField label={tc.enable} value={fc.enabled}
          onChange={(v) => onChange({ forecast: { ...fc, enabled: v } })} />
        <Row label={t.analytics.forecast.periodsAhead}>
          <NumberStepper value={fc.periods} min={1} max={6}
            onChange={(v) => onChange({ forecast: { ...fc, periods: v } })} />
        </Row>
        <ToggleField label={t.analytics.forecast.confidenceBand} value={fc.band}
          onChange={(v) => onChange({ forecast: { ...fc, band: v } })} />
      </div>
    </Section>
  );
}

function ConditionalSection({ rules, defaultColor, onRules, onDefault }: {
  rules: ConditionalRule[];
  defaultColor: string;
  onRules: (r: ConditionalRule[]) => void;
  onDefault: (c: string) => void;
}) {
  const add = () => {
    if (rules.length >= 5) return;
    onRules([...rules, { id: rid(), op: ">", threshold: 0, color: SLIDE_HEX.chart7 }]);
  };
  const upd = (i: number, p: Partial<ConditionalRule>) => {
    const next = [...rules]; next[i] = { ...next[i], ...p };
    onRules(next);
  };
  const del = (i: number) => onRules(rules.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rules.length) return;
    const next = [...rules]; [next[i], next[j]] = [next[j], next[i]];
    onRules(next);
  };

  return (
    <Section title={t.conditional.title}>
      <div className="flex items-center justify-between">
        <Label className="text-[12px] font-medium text-muted-foreground">{t.conditional.rules}</Label>
        <button type="button" onClick={add} disabled={rules.length >= 5}
          className="flex items-center gap-1 rounded border border-input px-1.5 py-0.5 text-[10px] hover:bg-secondary disabled:opacity-40">
          <Plus className="h-3 w-3" /> {tc.add}
        </button>
      </div>
      {rules.map((r, i) => (
        <div key={r.id} className="space-y-1.5 rounded border border-border/30 p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium">#{i + 1}</span>
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                onClick={() => move(i, -1)} title={t.conditional.moveUp} aria-label={t.conditional.moveUpAria}>
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                onClick={() => move(i, 1)} title={t.conditional.moveDown} aria-label={t.conditional.moveDownAria}>
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
              <button type="button" onClick={() => del(i)}
                title={t.conditional.remove} aria-label={t.conditional.removeAria}
                className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
          <Row label={t.conditional.operator}>
            <SelectField value={r.op} onChange={(v) => upd(i, { op: v as never })}
              options={[
                { value: ">", label: ">" },
                { value: "<", label: "<" },
                { value: "=", label: "=" },
                { value: "between", label: t.conditional.operatorBetween },
              ]} />
          </Row>
          <Row label={tc.value}>
            <DraftNumberInput className="h-8 text-[13px]" value={r.threshold}
              fallback={0}
              onCommit={(value) => upd(i, { threshold: value ?? 0 })} />
          </Row>
          {r.op === "between" && (
            <Row label={t.conditional.value2}>
              <DraftNumberInput className="h-8 text-[13px]" value={r.threshold2 ?? 0}
                fallback={0}
                onCommit={(value) => upd(i, { threshold2: value ?? 0 })} />
            </Row>
          )}
          <Row label={tc.color}><ColorField value={r.color} onChange={(c) => upd(i, { color: c })} /></Row>
        </div>
      ))}
      <Row label={t.conditional.defaultColor}>
        <ColorField value={defaultColor || SLIDE_HEX.slate400} onChange={onDefault} />
      </Row>
    </Section>
  );
}

function BridgeColumnBuilder({ block, value, setValue, dsRows }: {
  block: ChartBlock;
  onChange: (p: Patch) => void;
  value: WaterfallColumn[];
  setValue: (cols: WaterfallColumn[]) => void;
  dsRows: ReturnType<typeof budgetRowsAsPricingFiltered> | ReturnType<typeof usePricing.getState>["rows"];
}) {
  const upd = (i: number, p: Partial<WaterfallColumn>) => {
    const next = [...value]; next[i] = { ...next[i], ...p };
    setValue(next);
  };
  const del = (i: number) => setValue(value.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value]; [next[i], next[j]] = [next[j], next[i]];
    setValue(next);
  };

  // FIX 1 — preset builders that snapshot the current data into manualValue.
  const buildByPeriod = (): WaterfallColumn[] => {
    try {
      const r = computeChartSeries(dsRows, block.filters, block.measure, null);
      const totals = r.periodos.map((p, i) =>
        ({ label: p.label, v: r.series.reduce((s, ser) => s + (ser.values[i] ?? 0), 0) }));
      const cols: WaterfallColumn[] = totals.map((t) => ({
        id: rid(), label: t.label,
        type: t.v >= 0 ? "positive" : "negative",
        manualValue: t.v,
      }));
      const total = totals.reduce((s, t) => s + t.v, 0);
      cols.push({ id: rid(), label: t.waterfall.columns.typeOptions.total, type: "total", manualValue: total });
      return cols;
    } catch { return []; }
  };
  const buildByDim = (dim: string): WaterfallColumn[] => {
    try {
      const r = computeTopRanking(dsRows, block.filters, dim, block.measure, 50, "all", null);
      const cols: WaterfallColumn[] = r.map((e) => ({
        id: rid(), label: e.name,
        type: e.value >= 0 ? "positive" : "negative",
        manualValue: e.value,
      }));
      const total = r.reduce((s, e) => s + e.value, 0);
      cols.push({ id: rid(), label: t.waterfall.columns.typeOptions.total, type: "total", manualValue: total });
      return cols;
    } catch { return []; }
  };

  const presets: { label: string; build: () => WaterfallColumn[] }[] = [
    { label: t.waterfall.columns.presetByMonth, build: buildByPeriod },
    { label: t.waterfall.columns.presetByEffect, build: () => [
      { id: rid(), label: t.waterfall.columns.typeOptions.start, type: "start", measure: block.measure },
      { id: rid(), label: t.waterfall.columns.effectPresetLabels.volume, type: "positive", measure: "volume" },
      { id: rid(), label: t.waterfall.columns.effectPresetLabels.price, type: "positive", measure: "precoMedio" },
      { id: rid(), label: t.waterfall.columns.effectPresetLabels.mix, type: "negative", measure: block.measure },
      { id: rid(), label: t.waterfall.columns.effectPresetLabels.final, type: "total", measure: block.measure },
    ]},
    { label: t.waterfall.columns.presetByCategory, build: () => buildByDim("categoria") },
    { label: t.waterfall.columns.presetByBrand, build: () => buildByDim("marca") },
    { label: t.waterfall.columns.presetByChannel, build: () => buildByDim("canalAjustado") },
    { label: t.waterfall.columns.presetBlank, build: () => [] },
  ];
  const addBlank = () => setValue([...value, {
    id: rid(), label: t.waterfall.columns.newColumnLabel, type: "positive", measure: block.measure,
  }]);

  return (
    <div className="mt-2 space-y-1.5 rounded border border-border/30 p-2.5">
      <div className="text-[12px] font-medium text-muted-foreground">{t.waterfall.columns.title}</div>
      <div className="flex flex-wrap gap-1">
        {presets.map((p) => (
          <button key={p.label} type="button" onClick={() => setValue(p.build())}
            className="rounded border border-input px-1.5 py-0.5 text-[10px] hover:bg-secondary">
            {p.label}
          </button>
        ))}
      </div>
      {value.length === 0 && (
        <p className="text-[10px] text-muted-foreground">
          {t.waterfall.columns.empty}
        </p>
      )}
      {value.map((c, i) => (
        <div key={c.id} className="space-y-1.5 rounded border border-border/30 p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium">#{i + 1}</span>
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                onClick={() => move(i, -1)} title={t.waterfall.columns.reorderUp} aria-label={t.waterfall.columns.reorderUp}>
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                onClick={() => move(i, 1)} title={t.waterfall.columns.reorderDown} aria-label={t.waterfall.columns.reorderDown}>
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
              <button type="button" onClick={() => del(i)}
                title={t.waterfall.columns.remove} aria-label={t.waterfall.columns.remove}
                className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
          <Row label={tc.label}>
            <DraftInput className="h-8 text-[13px]" value={c.label}
              onCommit={(value) => upd(i, { label: value })} />
          </Row>
          <Row label={tc.type}>
            <SelectField value={c.type} onChange={(v) => upd(i, { type: v as never })}
              options={[
                { value: "start", label: t.waterfall.columns.typeOptions.start },
                { value: "positive", label: t.waterfall.columns.typeOptions.positive },
                { value: "negative", label: t.waterfall.columns.typeOptions.negative },
                { value: "total", label: t.waterfall.columns.typeOptions.total },
                { value: "subtotal", label: t.waterfall.columns.typeOptions.subtotal },
              ]} />
          </Row>
          <Row label={tc.measure}>
            <SelectField value={c.measure ?? "__manual__"}
              onChange={(v) => upd(i, v === "__manual__"
                ? { measure: undefined }
                : { measure: v as KpiMeasureId, manualValue: undefined })}
              options={[
                { value: "__manual__", label: t.waterfall.columns.measureManual },
                ...KPI_MEASURES.map((m) => ({ value: m.id, label: m.label })),
              ]} />
          </Row>
          {c.measure == null && (
            <Row label={tc.value}>
              <DraftNumberInput className="h-8 text-[13px]" value={c.manualValue ?? 0}
                fallback={0}
                onCommit={(value) => upd(i, { manualValue: value ?? 0 })} />
            </Row>
          )}
          <Row label={t.waterfall.columns.filterDim}>
            <SelectField value={c.filterDim ?? "__none__"}
              onChange={(v) => upd(i, { filterDim: v === "__none__" ? null : v })}
              options={[
                { value: "__none__", label: t.waterfall.columns.filterNone },
                { value: "marca", label: t.dataSection.dims.marca },
                { value: "canalAjustado", label: t.dataSection.dims.canalAjustado },
                { value: "categoria", label: t.dataSection.dims.categoria },
                { value: "mercado", label: t.dataSection.dims.mercado },
              ]} />
          </Row>
          {c.filterDim && (
            <Row label={t.waterfall.columns.filterValue}>
              <DraftInput className="h-8 text-[13px]" value={c.filterValue ?? ""}
                onCommit={(value) => upd(i, { filterValue: value })} />
            </Row>
          )}
        </div>
      ))}
      <button type="button" onClick={addBlank}
        className="flex w-full items-center justify-center gap-1 rounded border border-dashed border-input py-1 text-[10px] text-muted-foreground hover:bg-secondary">
        <Plus className="h-3 w-3" /> {t.waterfall.columns.addColumn}
      </button>
    </div>
  );
}

function AxisSection({ title, axis, onChange, onReset }: {
  title: string;
  axis: ChartStyle["xAxis"];
  onChange: (p: Partial<ChartStyle["xAxis"]>) => void;
  onReset: () => void;
}) {
  return (
    <Section title={title} onReset={onReset}>
      <ToggleField label={t.axis.show} value={axis.show}
        onChange={(v) => onChange({ show: v })} />
      <div className="space-y-1">
        <Label className="text-[12px] font-medium text-muted-foreground">{t.axis.axisTitle}</Label>
        <DraftInput className="h-8 text-[13px]" value={axis.titleText}
          onCommit={(value) => onChange({ titleText: value })} />
      </div>
      <Row label={tc.titleSize}>
        <NumberStepper value={axis.titleSize} min={6} max={24}
          onChange={(v) => onChange({ titleSize: v })} suffix="pt" />
      </Row>
      <Row label={tc.titleColor}>
        <ColorField value={axis.titleColor}
          onChange={(c) => onChange({ titleColor: c })} />
      </Row>
      <Row label={t.axis.labelSize}>
        <NumberStepper value={axis.labelSize} min={6} max={24}
          onChange={(v) => onChange({ labelSize: v })} suffix="pt" />
      </Row>
      <Row label={t.axis.labelColor}><ColorField value={axis.labelColor}
        onChange={(c) => onChange({ labelColor: c })} /></Row>
      <Row label={t.axis.lineColor}><ColorField value={axis.lineColor}
        onChange={(c) => onChange({ lineColor: c })} /></Row>
      <Row label={t.axis.lineWidth}>
        <NumberStepper value={axis.lineWidth} min={0} max={5}
          onChange={(v) => onChange({ lineWidth: v })} suffix="px" />
      </Row>
      <ToggleField label={t.axis.ticks} value={axis.ticks}
        onChange={(v) => onChange({ ticks: v })} />
      <Row label={t.axis.min}>
        <DraftNumberInput className="h-8 text-[13px]"
          value={axis.min ?? null} placeholder="auto"
          fallback={null}
          onCommit={(value) => onChange({ min: value })} />
      </Row>
      <Row label={t.axis.max}>
        <DraftNumberInput className="h-8 text-[13px]"
          value={axis.max ?? null} placeholder="auto"
          fallback={null}
          onCommit={(value) => onChange({ max: value })} />
      </Row>
      <Row label={tc.format}>
        <SelectField value={axis.format}
          onChange={(v) => onChange({ format: v as never })}
          options={[
            { value: "auto", label: tc.formatOptions.auto },
            { value: "currency", label: tc.formatOptions.currency },
            { value: "percent", label: tc.formatOptions.percent },
            { value: "number", label: tc.formatOptions.number },
            { value: "tons", label: tc.formatOptions.tons },
          ]} />
      </Row>
      <Row label={tc.decimals}>
        <NumberStepper value={axis.decimals} min={0} max={4}
          onChange={(v) => onChange({ decimals: v })} />
      </Row>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Bridge PVM picker — modo + base/comparação (alinhado com aba Bridge)
// ---------------------------------------------------------------------------
import type { PricingRow } from "@/lib/types";
import { monthLabel } from "@/lib/format";

function PvmBridgePicker({
  block, style, dsRows, updPath,
}: {
  block: ChartBlock;
  style: ChartStyle;
  dsRows: PricingRow[];
  updPath: <K extends keyof ChartStyle>(key: K, patch: Partial<ChartStyle[K]>) => void;
}) {
  const mode = style.waterfall.mode ?? "pvm";
  const pvm = style.waterfall.pvm ?? { base: null, comp: null, periodMode: "month" as const, comparisonMode: "prev-month" as const };
  const comparisonMode = pvm.comparisonMode ?? "prev-month";
  const metric = usePricing((s) => s.metric);

  const months = useMemo(() => {
    const map = new Map<string, { mes: number; ano: number }>();
    for (const r of dsRows) if (!map.has(r.periodo)) map.set(r.periodo, { mes: r.mes, ano: r.ano });
    return Array.from(map.entries())
      .map(([k, v]) => ({ value: k, label: monthLabel(v.mes, v.ano), mes: v.mes, ano: v.ano }))
      .sort((a, b) => a.ano - b.ano || a.mes - b.mes);
  }, [dsRows]);
  const fys = useMemo(() => {
    const set = new Set<string>();
    for (const r of dsRows) if (r.fy) set.add(r.fy);
    return Array.from(set).sort().map((f) => ({ value: f, label: f }));
  }, [dsRows]);
  const opts = pvm.periodMode === "fy" ? fys : months;

  // Bench preview — best CM month in last 24 (excluding latest)
  const benchInfo = useMemo(() => {
    if (comparisonMode !== "bench" || months.length < 2) return null;
    const last24 = months.slice(-25, -1);
    if (last24.length === 0) return null;
    const filtered = applyFilters(dsRows, block.filters, null);
    const cmByPeriod = new Map<string, number>();
    for (const r of filtered) {
      const m = metric === "cm" ? r.contribMarginal : r.margemBruta;
      cmByPeriod.set(r.periodo, (cmByPeriod.get(r.periodo) ?? 0) + m);
    }
    let best: { p: string; v: number; label: string } | null = null;
    for (const m of last24) {
      const v = cmByPeriod.get(m.value) ?? 0;
      if (!best || Math.abs(v) > Math.abs(best.v)) best = { p: m.value, v, label: m.label };
    }
    return best;
  }, [comparisonMode, months, dsRows, block.filters, metric]);

  return (
    <>
      <Row label={t.waterfall.bridgeMode}>
        <Segmented value={mode}
          onChange={(v) => updPath("waterfall", { mode: v as never })}
          options={[
            { value: "pvm", label: t.waterfall.bridgeModeOptions.pvm },
            { value: "manual", label: t.waterfall.bridgeModeOptions.manual },
          ]} />
      </Row>
      {mode === "pvm" && (
        <>
          <Row label={tc.comparison}>
            <Segmented value={comparisonMode}
              onChange={(v) => updPath("waterfall", {
                pvm: {
                  ...pvm,
                  comparisonMode: v as never,
                  periodMode: v === "manual" ? (pvm.periodMode === "ytd_budget" ? "month" : pvm.periodMode) : v === "ytd-budget" ? "ytd_budget" : "month",
                },
              })}
              options={[
                { value: "prev-month", label: t.waterfall.comparisonOptions.prevMonth },
                { value: "prev-year-month", label: t.waterfall.comparisonOptions.prevYearMonth },
                { value: "bench", label: t.waterfall.comparisonOptions.bench },
                { value: "ytd-budget", label: t.waterfall.comparisonOptions.ytdBudget },
                { value: "manual", label: t.waterfall.comparisonOptions.manual },
              ]} />
          </Row>
          {comparisonMode === "ytd-budget" && (
            <div className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-[11px] text-muted-foreground">
              {t.waterfall.ytdBudgetHint}
            </div>
          )}
          {comparisonMode === "bench" && (
            <div className="rounded-md border border-border/40 bg-muted/30 px-2 py-1.5 text-[11px] text-muted-foreground">
              {benchInfo
                ? <>{t.waterfall.benchLabel} <span className="font-medium text-foreground">{benchInfo.label}</span> (R$ {Math.round(benchInfo.v).toLocaleString("pt-BR")})</>
                : t.waterfall.benchNoData}
            </div>
          )}
          {comparisonMode === "manual" && (
            <>
              <Row label={t.dataSection.period}>
                <Segmented value={pvm.periodMode}
                  onChange={(v) => updPath("waterfall", {
                    pvm: { ...pvm, periodMode: v as never, base: null, comp: null },
                  })}
                  options={[
                    { value: "month", label: t.waterfall.periodOptions.month },
                    { value: "fy", label: t.waterfall.periodOptions.fy },
                  ]} />
              </Row>
              <Row label={tc.base}>
                <SelectField value={pvm.base ?? ""}
                  onChange={(v) => updPath("waterfall", { pvm: { ...pvm, base: v || null } })}
                  options={opts} />
              </Row>
              <Row label={tc.comparison}>
                <SelectField value={pvm.comp ?? ""}
                  onChange={(v) => updPath("waterfall", { pvm: { ...pvm, comp: v || null } })}
                  options={opts} />
              </Row>
            </>
          )}
          <Row label={t.dataSection.decomposition}>
            <SelectField value={pvm.decomposition ?? "effects"}
              onChange={(v) => updPath("waterfall", { pvm: { ...pvm, decomposition: v } })}
              options={[
                { value: "effects",      label: t.waterfall.decompositionOptions.effects },
                { value: "marca",        label: t.waterfall.decompositionOptions.marca },
                { value: "categoria",    label: t.waterfall.decompositionOptions.categoria },
                { value: "subcategoria", label: t.waterfall.decompositionOptions.subcategoria },
                { value: "formato",      label: t.waterfall.decompositionOptions.formato },
                { value: "canal",        label: t.waterfall.decompositionOptions.canal },
                { value: "canalAjustado",label: t.waterfall.decompositionOptions.canalAjustado },
                { value: "mercado",      label: t.waterfall.decompositionOptions.mercado },
                { value: "regional",     label: t.waterfall.decompositionOptions.regional },
                { value: "uf",           label: t.waterfall.decompositionOptions.uf },
                { value: "sku",          label: t.waterfall.decompositionOptions.sku },
                { value: "skuDesc",      label: t.waterfall.decompositionOptions.skuDesc },
              ]} />
          </Row>
          {(pvm.decomposition ?? "effects") !== "effects" && (
            <Row label={t.waterfall.topN}>
              <NumberStepper value={pvm.topN ?? 6} min={3} max={20}
                onChange={(v) => updPath("waterfall", { pvm: { ...pvm, topN: v } })} />
            </Row>
          )}
        </>
      )}
    </>
  );
}
