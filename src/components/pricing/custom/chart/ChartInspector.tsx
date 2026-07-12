// ChartInspector — PowerPoint-grade design panel for ChartBlock.
// Sections shown depend on chartType. Filters live in a separate tab (already
// handled by FilteredInspector wrapper outside).

import type { BlockDataSource, ChartBlock, KpiMeasureId } from "@/lib/customSlide";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ChartTypePicker } from "./ChartTypePicker";
import { STYLE_PRESETS, buildStylePresetPatch, type StylePresetId } from "./stylePresets";
import { usePricing } from "@/store/pricing";
import { useBudget } from "@/store/budget";
import { useForecast } from "@/store/forecast";
import { useRolling } from "@/store/rolling";
import { budgetRowsAsPricingFiltered } from "@/lib/budgetAdapter";
import { forecastRowsAsPricingLatest } from "@/lib/forecastAdapter";
import { rollingRowsAsPricing } from "@/lib/rollingAdapter";
import { applyFilters } from "@/lib/analytics";
import { computeChartSeries, computeTopRanking } from "@/lib/customKpi";
import { getCachedRowsSignature, getOrComputeSlideCalc } from "@/lib/slideCalcCache";
import { useMemo } from "react";
import { Trash2, Plus, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSlideFilters } from "../SlideFilterContext";
import { dataSourceLabel } from "@/lib/slideDataSourceTheme";
import { SLIDE_HEX } from "@/lib/slideDesignTokens";

type Patch = Partial<ChartBlock>;

const POSITIVACAO_BREAKDOWN_OPTIONS = [
  { value: "categoria", label: "Categoria" },
  { value: "marca", label: "Marca" },
  { value: "canalAjustado", label: "Canal" },
  { value: "gestorResp", label: "Gestor Resp." },
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
  if (ct === "pie" || ct === "donut") {
    return [
      { value: "inside", label: "Dentro" },
      { value: "outside", label: "Fora" },
      { value: "callout", label: "Callout" },
    ];
  }
  if (ct === "line" || ct === "area" || ct === "stackedArea" || ct === "scatter") {
    return [
      { value: "above", label: "Acima" },
      { value: "below", label: "Abaixo" },
      { value: "left", label: "Esquerda" },
      { value: "right", label: "Direita" },
    ];
  }
  if (ct === "waterfall") {
    return [
      { value: "above", label: "Acima da barra" },
      { value: "inside", label: "Dentro da barra" },
      { value: "below", label: "Abaixo da barra" },
    ];
  }
  if (ct === "funnel") {
    return [
      { value: "left", label: "Esquerda" },
      { value: "right", label: "Direita" },
      { value: "center", label: "Centro" },
      { value: "inside", label: "Dentro" },
    ];
  }
  // bar/column/combo
  return [
    { value: "above", label: "Acima" },
    { value: "below", label: "Abaixo" },
    { value: "inside-end", label: "Dentro topo" },
    { value: "inside-base", label: "Dentro base" },
    { value: "center", label: "Centro" },
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
  const showAxes = !["pie", "donut", "funnel", "treemap", "radar", "histogram", "boxplot"].includes(ct);
  const showGrid = showAxes && ct !== "histogram"
    && !["funnel", "treemap", "boxplot"].includes(ct) ? true : false;
  const showSeries = !["pie", "donut", "bubble", "scatter", "waterfall", "funnel", "treemap", "histogram"].includes(ct);
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
  const dataSource = block.dataSource;
  const filters = block.filters;
  const measure = block.measure;
  const breakdown = block.breakdown;
  const blockId = block.id;
  const comboSeries = block.comboSeries;
  const dsRows = useMemo(() => {
    if (dataSource === "budget") return budgetRowsAsPricingFiltered(budget, "budget");
    if (dataSource === "budget_real") return budgetRowsAsPricingFiltered(budget, "real");
    if (dataSource === "forecast") return forecastRowsAsPricingLatest(forecast);
    if (dataSource === "rolling") return rollingRowsAsPricing(rolling);
    return pricing;
  }, [dataSource, pricing, budget, forecast, rolling]);
  const dsRowsSignature = useMemo(() => getCachedRowsSignature(dsRows), [dsRows]);
  const detectedChartSeries = useMemo(() => {
    try {
      return getOrComputeSlideCalc({
        op: "chart-inspector-series",
        blockId,
        dataSource,
        dataSignature: dsRowsSignature,
        params: { filters, measure, breakdown },
      }, () => computeChartSeries(dsRows, filters, measure, breakdown));
    } catch {
      return null;
    }
  }, [blockId, dataSource, dsRows, dsRowsSignature, filters, measure, breakdown]);
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
    const rankingBreakdown = breakdown ?? "marca";
    try {
      return getOrComputeSlideCalc({
        op: "chart-inspector-ranking",
        blockId,
        dataSource,
        dataSignature: dsRowsSignature,
        params: { filters, breakdown: rankingBreakdown, measure, topN: 50, mode: "all" },
      }, () => computeTopRanking(dsRows, filters, rankingBreakdown, measure, 50, "all", null)).map((r) => r.name);
    } catch { return []; }
  }, [ct, blockId, dataSource, dsRows, dsRowsSignature, filters, breakdown, measure]);

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
          <TabsTrigger value="dados" className="h-7 rounded-full text-[12px] data-[state=active]:bg-background data-[state=active]:shadow-sm">Dados</TabsTrigger>
          <TabsTrigger value="visual" className="h-7 rounded-full text-[12px] data-[state=active]:bg-background data-[state=active]:shadow-sm">Visual</TabsTrigger>
          <TabsTrigger value="analises" className="h-7 rounded-full text-[12px] data-[state=active]:bg-background data-[state=active]:shadow-sm">Análises</TabsTrigger>
        </TabsList>

        {/* ============================ DADOS TAB ============================ */}
        <TabsContent value="dados" className="mt-3 space-y-3">
      {/* ===== Data ===== */}
      <Section title="Medidas e dimensões" defaultOpen>
        <Row label="Medida">
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
            <Row label="Medida da linha">
              <SelectField value={(style.measureLine ?? "__none__") as string}
                onChange={(v) => updStyle({ measureLine: v === "__none__" ? undefined : v as KpiMeasureId })}
                options={[
                  { value: "__none__", label: "— Nenhuma —" },
                  ...KPI_MEASURES.map((m) => ({
                    value: m.id, label: m.label,
                    disabled: unavailableMeasuresForSource(block.dataSource).includes(m.id),
                  })),
                ]} />
            </Row>
            {(style.measureLine === undefined || (style.measureLine as string) === "__none__") && (
              <p className="text-[10px] text-amber-500 leading-snug">
                Selecione uma medida diferente para a linha para ativar o gráfico combo.
                Sem ela, o gráfico exibe apenas colunas.
              </p>
            )}
          </>
        )}
        {S.isCombo && (
          <div className="space-y-2 rounded-lg border border-primary/15 bg-primary/5 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[12px] font-medium text-foreground/85">Séries multi-base</div>
                <p className="text-[10px] leading-snug text-muted-foreground">
                  Use para comparar Real, Budget, Forecast e Rolling no mesmo gráfico.
                </p>
              </div>
              <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]"
                onClick={installVolumeScenario}>
                Volume R/B/F/R
              </Button>
            </div>

            {(block.comboSeries ?? []).length === 0 && (
              <div className="rounded-md border border-dashed border-border/50 bg-background/50 p-2 text-[11px] text-muted-foreground">
                Nenhuma série multi-base configurada. O combo continua usando a fonte principal do bloco.
              </div>
            )}

            {(block.comboSeries ?? []).map((series) => {
              const unavailable = unavailableMeasuresForSource(series.dataSource).includes(series.measure);
              return (
                <div key={series.id} className="space-y-2 rounded-md border border-border/40 bg-background/70 p-2">
                  <div className="flex items-center gap-2">
                    <Input
                      value={series.name}
                      onChange={(e) => patchComboSeries(series.id, { name: e.target.value })}
                      className="h-8 min-w-0 text-[12px]"
                    />
                    <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0"
                      onClick={() => removeComboSeries(series.id)}
                      title="Remover série">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <Row label="Base">
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
                        { value: "ke30", label: "Real" },
                        { value: "budget", label: "Budget" },
                        { value: "forecast", label: "Forecast" },
                        { value: "rolling", label: "Rolling" },
                      ]} />
                  </Row>
                  <Row label="Medida">
                    <SelectField value={series.measure}
                      onChange={(v) => patchComboSeries(series.id, { measure: v as KpiMeasureId })}
                      options={availableMeasuresForSource(series.dataSource)} />
                  </Row>
                  {unavailable && (
                    <p className="text-[10px] leading-snug text-amber-500">
                      Medida indisponível para esta base. Troque a medida ou a base.
                    </p>
                  )}
                  <Row label="Renderizar">
                    <Segmented value={series.asLine === false ? "bar" : "line"}
                      onChange={(v) => {
                        patchComboSeries(series.id, { asLine: v === "line" });
                        updSeries(series.name, { asLine: v === "line" });
                      }}
                      options={[
                        { value: "line", label: "Linha" },
                        { value: "bar", label: "Barra" },
                      ]} />
                  </Row>
                  <ToggleField label="Eixo Y secundário"
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
                Real
              </Button>
              <Button size="sm" variant="secondary" className="h-7 px-2 text-[11px]"
                onClick={() => addComboSeries("budget", "volume")}>
                <Plus className="mr-1 h-3 w-3" />
                Budget
              </Button>
              <Button size="sm" variant="secondary" className="h-7 px-2 text-[11px]"
                onClick={() => addComboSeries("forecast", "volume")}>
                <Plus className="mr-1 h-3 w-3" />
                Forecast
              </Button>
              <Button size="sm" variant="secondary" className="h-7 px-2 text-[11px]"
                onClick={() => addComboSeries("rolling", "volume")}>
                <Plus className="mr-1 h-3 w-3" />
                Rolling
              </Button>
              {(block.comboSeries ?? []).length > 0 && (
                <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]"
                  onClick={() => onChange({ comboSeries: [] } as Patch)}>
                  Limpar
                </Button>
              )}
            </div>
          </div>
        )}
        {(ct === "bubble" || ct === "scatter") && (
          <>
            <Row label="Medida Eixo X">
              <SelectField value={(style.measureX ?? "__none__") as string}
                onChange={(v) => updStyle({ measureX: v === "__none__" ? undefined : v as KpiMeasureId })}
                options={[
                  { value: "__none__", label: "— Índice —" },
                  ...KPI_MEASURES.map((m) => ({
                    value: m.id, label: m.label,
                    disabled: unavailableMeasuresForSource(block.dataSource).includes(m.id),
                  })),
                ]} />
            </Row>
            <Row label="Medida Eixo Y">
              <SelectField value={(style.measureY ?? "__none__") as string}
                onChange={(v) => updStyle({ measureY: v === "__none__" ? undefined : v as KpiMeasureId })}
                options={[
                  { value: "__none__", label: "— Medida principal —" },
                  ...KPI_MEASURES.map((m) => ({
                    value: m.id, label: m.label,
                    disabled: unavailableMeasuresForSource(block.dataSource).includes(m.id),
                  })),
                ]} />
            </Row>
            {ct === "bubble" && (
              <p className="text-[10px] leading-snug text-muted-foreground">
                A medida principal acima define o <b>tamanho</b> das bolhas.
              </p>
            )}
            {(style.measureX !== undefined || style.measureY !== undefined) && (
              <p className="text-[10px] text-muted-foreground leading-snug">
                Com Eixo X/Y configurados, a cor é definida automaticamente por índice.
                Remova os eixos para usar cor por dimensão.
              </p>
            )}
          </>
        )}
        {unavailableMeasuresForSource(block.dataSource).includes(block.measure) && (
          <p className="text-[10px] leading-snug text-muted-foreground">
            {unavailableHintForSource(block.dataSource)}
          </p>
        )}
        {(ct !== "waterfall" || (style.waterfall.mode ?? "pvm") === "manual") && (
          <Row label="Quebrar por">
            <SelectField value={block.breakdown ?? "__none__"}
              onChange={(v) => {
                clearFilter(block.id);
                onChange({ breakdown: v === "__none__" ? null : v });
              }}
              options={[
                { value: "__none__", label: "— Série única —" },
                ...(block.measure === "positivacao"
                  ? POSITIVACAO_BREAKDOWN_OPTIONS
                  : [
                      { value: "marca", label: "Marca" },
                      { value: "canalAjustado", label: "Canal" },
                      { value: "gestorResp", label: "Gestor Resp." },
                      { value: "categoria", label: "Categoria" },
                      { value: "mercado", label: "Mercado" },
                      { value: "inovacao", label: "Inovação" },
                    ]),
              ]} />
          </Row>
        )}
        {ct === "waterfall" && (style.waterfall.mode ?? "pvm") === "pvm" && (
          <>
            <Row label="Decomposição">
              <SelectField
                value={style.waterfall.pvm?.decomposition ?? "effects"}
                onChange={(v) => updPath("waterfall", {
                  pvm: { ...(style.waterfall.pvm ?? {}), decomposition: v }
                })}
                options={[
                  { value: "effects", label: "Efeitos (Volume / Preço / Custo)" },
                  { value: "marca", label: "Marca" },
                  { value: "canalAjustado", label: "Canal" },
                  { value: "categoria", label: "Categoria" },
                  { value: "mercado", label: "Mercado" },
                ]} />
            </Row>
            {(style.waterfall.pvm?.decomposition ?? "effects") !== "effects" && (
              <Row label="Top N itens">
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
          <Row label="Eixo X">
            <SelectField value={block.fieldWells?.xDim ?? "period"}
              onChange={(v) => onChange({
                fieldWells: { ...(block.fieldWells ?? {}), xDim: v === "period" ? null : v },
              })}
              options={[
                { value: "period", label: "Período" },
                { value: "marca", label: "Marca" },
                { value: "canalAjustado", label: "Canal" },
                { value: "categoria", label: "Categoria" },
                { value: "mercado", label: "Mercado" },
                { value: "inovacao", label: "Inovação" },
              ]} />
          </Row>
        )}

        {/* B.1 — Field wells: Cor / Tooltip / Rótulo */}
        {["line", "area", "stackedArea", "bar", "column", "hbar",
          "stackedColumn", "stackedBar", "combo", "scatter", "bubble"].includes(ct) && (
          <>
            {(!(ct === "scatter" || ct === "bubble") || (!style.measureX && !style.measureY)) && (
              <Row label="Cor / Legenda">
                <SelectField value={block.fieldWells?.colorDim ?? "__none__"}
                  onChange={(v) => {
                    clearFilter(block.id);
                    onChange({
                      fieldWells: { ...(block.fieldWells ?? {}), colorDim: v === "__none__" ? null : v },
                    });
                  }}
                  options={[
                    { value: "__none__", label: "— Nenhum —" },
                    ...(block.measure === "positivacao"
                      ? POSITIVACAO_BREAKDOWN_OPTIONS
                      : [
                          { value: "marca", label: "Marca" },
                          { value: "canalAjustado", label: "Canal" },
                          { value: "gestorResp", label: "Gestor Resp." },
                          { value: "categoria", label: "Categoria" },
                          { value: "mercado", label: "Mercado" },
                          { value: "inovacao", label: "Inovação" },
                        ]),
                  ]} />
              </Row>
            )}
            <Row label="Tooltip extra">
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
              <Row label="Rótulo de ponto">
                <SelectField value={block.fieldWells?.labelDim ?? "__none__"}
                  onChange={(v) => onChange({
                    fieldWells: { ...(block.fieldWells ?? {}), labelDim: v === "__none__" ? null : v },
                  })}
                  options={[
                    { value: "__none__", label: "— Nenhum —" },
                    ...(block.measure === "positivacao"
                      ? POSITIVACAO_BREAKDOWN_OPTIONS
                      : [
                          { value: "marca", label: "Marca" },
                          { value: "canalAjustado", label: "Canal" },
                          { value: "gestorResp", label: "Gestor Resp." },
                          { value: "categoria", label: "Categoria" },
                          { value: "mercado", label: "Mercado" },
                          { value: "inovacao", label: "Inovação" },
                        ]),
                  ]} />
              </Row>
            )}
          </>
        )}

        {/* B.5 — Sort */}
        <Row label="Ordenar por">
          <SelectField value={block.sortConfig?.field ?? "period"}
            onChange={(v) => onChange({
              sortConfig: { field: v as never, dir: block.sortConfig?.dir ?? "asc" },
            })}
            options={[
              ...(["pie", "donut", "funnel", "treemap", "scatter", "bubble", "histogram", "boxplot", "radar"].includes(ct)
                ? [] : [{ value: "period", label: "Período" }]),
              { value: "value", label: "Valor" },
              { value: "name", label: "Nome" },
            ]} />
        </Row>
        <Row label="Direção">
          <Segmented value={block.sortConfig?.dir ?? "asc"}
            onChange={(v) => onChange({
              sortConfig: { field: block.sortConfig?.field ?? "period", dir: v as never },
            })}
            options={[
              { value: "asc", label: "Asc" },
              { value: "desc", label: "Desc" },
            ]} />
        </Row>

        {/* B.4 — Bridge column builder (apenas no modo manual) */}
        {ct === "waterfall" && (style.waterfall.mode ?? "pvm") === "manual" && (
          <>
            {(style.waterfall.columns ?? []).length === 0 && (
              <div className="rounded-lg border border-dashed border-border/50 bg-card/30 p-3 text-center">
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Adicione colunas para construir o waterfall manualmente.
                  Cada coluna pode ser um valor de medida ou um valor fixo.
                </p>
                <button
                  className="mt-2 text-[11px] text-primary hover:underline"
                  onClick={() => {
                    const defaultCols = [
                      { id: rid(), label: "Início", type: "start" as const },
                      { id: rid(), label: "Coluna A", type: "positive" as const },
                      { id: rid(), label: "Coluna B", type: "negative" as const },
                      { id: rid(), label: "Total", type: "total" as const },
                    ];
                    updPath("waterfall", { columns: defaultCols });
                  }}
                >
                  + Usar template padrão
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
      <Section title="Interatividade">
        <ToggleField label="Emitir filtro ao clicar"
          value={block.emitsCrossFilter !== false}
          onChange={(v) => onChange({ emitsCrossFilter: v })} />
        <ToggleField label="Receber filtros de outros blocos"
          value={block.participatesInCrossFilter !== false}
          onChange={(v) => onChange({ participatesInCrossFilter: v })} />
      </Section>
        </TabsContent>

        {/* ============================ VISUAL TAB ============================ */}
        <TabsContent value="visual" className="mt-3 space-y-3">
      {/* Quick style presets */}
      <div className="rounded-lg border border-border/50 bg-card/40 p-3">
        <div className="mb-2 text-[12px] font-medium text-foreground/85">Estilos rápidos</div>
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
        <Section title="Barras" onReset={() => resetPath("bar")}>
          <Row label="Modo">
            <SelectField value={style.bar.mode}
              onChange={(v) => updPath("bar", { mode: v as never })}
              options={[
                { value: "grouped", label: "Agrupado" },
                { value: "stacked", label: "Empilhado" },
                { value: "stacked100", label: "100% empilhado" },
              ]} />
          </Row>
          <Row label="Espaçamento">
            <NumberStepper value={style.bar.gapPct} min={0} max={80}
              onChange={(v) => updPath("bar", { gapPct: v })} suffix="%" />
          </Row>
          <Row label="Cantos">
            <NumberStepper value={style.bar.cornerRadius} min={0} max={20}
              onChange={(v) => updPath("bar", { cornerRadius: v })} suffix="px" />
          </Row>
          <Row label="Borda"><ColorField value={style.bar.borderColor}
            onChange={(c) => updPath("bar", { borderColor: c })} /></Row>
          <Row label="Esp. borda">
            <NumberStepper value={style.bar.borderWidth} min={0} max={5}
              onChange={(v) => updPath("bar", { borderWidth: v })} suffix="px" />
          </Row>
        </Section>
      )}

      {/* ===== Type-specific: Pie/Donut ===== */}
      {S.isPie && (
        <Section title="Pizza/Rosca" onReset={() => resetPath("pie")}>
          {ct === "donut" && (
            <Row label="Furo">
              <NumberStepper value={style.pie.donutHolePct} min={0} max={80}
                onChange={(v) => updPath("pie", { donutHolePct: v })} suffix="%" />
            </Row>
          )}
          <Row label="Ângulo inicial">
            <NumberStepper value={style.pie.startAngle} min={0} max={360}
              onChange={(v) => updPath("pie", { startAngle: v })} suffix="°" />
          </Row>
          <Row label="Rótulos">
            <SelectField value={style.pie.labelMode}
              onChange={(v) => updPath("pie", { labelMode: v as never })}
              options={[
                { value: "name-percent", label: "Nome + %" },
                { value: "name-value", label: "Nome + valor" },
                { value: "name", label: "Nome" },
                { value: "percent", label: "Percentual" },
                { value: "value", label: "Valor" },
              ]} />
          </Row>
          <Row label="Explosão geral">
            <Slider value={style.pie.explodePct} max={30}
              onChange={(v) => updPath("pie", { explodePct: v })} />
          </Row>
          {detectedRanking.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[12px] font-medium text-muted-foreground">Fatias</div>
              {detectedRanking.map((name, i) => {
                const sl = style.pie.slices[name] ?? {};
                return (
                  <div key={name} className="space-y-1.5 rounded border border-border/30 p-2.5">
                    <div className="text-[12px] font-medium truncate">{name}</div>
                    <Row label="Cor">
                      <ColorField value={sl.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length]}
                        onChange={(c) => updPath("pie", {
                          slices: { ...style.pie.slices, [name]: { ...sl, color: c } },
                        })} />
                    </Row>
                    <Row label="Explosão">
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
        <Section title="Bolhas" onReset={() => resetPath("bubble")}>
          <Row label="Tam. mín">
            <NumberStepper value={style.bubble.minSize} min={20} max={500}
              onChange={(v) => updPath("bubble", { minSize: v })} suffix="px" />
          </Row>
          <Row label="Tam. máx">
            <NumberStepper value={style.bubble.maxSize} min={50} max={2000}
              onChange={(v) => updPath("bubble", { maxSize: v })} suffix="px" />
          </Row>
          <Row label="Opacidade">
            <Slider value={Math.round(style.bubble.fillOpacity * 100)}
              onChange={(v) => updPath("bubble", { fillOpacity: v / 100 })} />
          </Row>
          <Row label="Borda"><ColorField value={style.bubble.borderColor}
            onChange={(c) => updPath("bubble", { borderColor: c })} /></Row>
          <Row label="Esp. borda">
            <NumberStepper value={style.bubble.borderWidth} min={0} max={5}
              onChange={(v) => updPath("bubble", { borderWidth: v })} suffix="px" />
          </Row>
          <ToggleField label="Mostrar tamanho como rótulo"
            value={style.bubble.showSizeLabel}
            onChange={(v) => updPath("bubble", { showSizeLabel: v })} />
        </Section>
      )}

      {/* ===== Type-specific: Area ===== */}
      {S.showArea && (
        <Section title="Área" onReset={() => resetPath("area")}>
          <ToggleField label="Empilhado" value={style.area.stacked}
            onChange={(v) => updPath("area", { stacked: v })} />
          <ToggleField label="Linha por cima" value={style.area.lineOnTop}
            onChange={(v) => updPath("area", { lineOnTop: v })} />
        </Section>
      )}

      {/* ===== Type-specific: Waterfall ===== */}
      {ct === "waterfall" && (
        <Section title="Waterfall" onReset={() => resetPath("waterfall")}>
          <PvmBridgePicker block={block} style={style} dsRows={dsRows} updPath={updPath} />
          <Row label="Cor positiva"><ColorField value={style.waterfall.positiveColor}
            onChange={(c) => updPath("waterfall", { positiveColor: c })} /></Row>
          <Row label="Cor negativa"><ColorField value={style.waterfall.negativeColor}
            onChange={(c) => updPath("waterfall", { negativeColor: c })} /></Row>
          <Row label="Cor total"><ColorField value={style.waterfall.totalColor}
            onChange={(c) => updPath("waterfall", { totalColor: c })} /></Row>
          <ToggleField label="Conectores" value={style.waterfall.connectors}
            onChange={(v) => updPath("waterfall", { connectors: v })} />
          <Row label="Cor conector">
            <ColorField value={style.waterfall.connectorColor}
              onChange={(c) => updPath("waterfall", { connectorColor: c })} />
          </Row>
          <Row label="Estilo conector">
            <Segmented value={style.waterfall.connectorStyle}
              onChange={(v) => updPath("waterfall", { connectorStyle: v as never })}
              options={[
                { value: "solid", label: "Sólido" },
                { value: "dashed", label: "Tracejado" },
              ]} />
          </Row>
          <ToggleField label="Total acumulado" value={style.waterfall.showRunningTotal}
            onChange={(v) => updPath("waterfall", { showRunningTotal: v })} />
          <Row label="Espaçamento">
            <NumberStepper value={style.waterfall.gapPct} min={0} max={80}
              onChange={(v) => updPath("waterfall", { gapPct: v })} suffix="%" />
          </Row>
          {(style.waterfall.mode ?? "pvm") === "manual" && detectedCategories.length > 0 && (
            <div className="space-y-1">
              <div className="text-[12px] font-medium text-muted-foreground">Classificação</div>
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
                        { value: "positive", label: "Positivo" },
                        { value: "negative", label: "Negativo" },
                        { value: "total", label: "Total" },
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
        <Section title="Funil" onReset={() => resetPath("funnel")}>
          <Row label="Direção">
            <Segmented value={style.funnel.direction}
              onChange={(v) => updPath("funnel", { direction: v as never })}
              options={[
                { value: "ttb", label: "Topo → Base" },
                { value: "btt", label: "Base → Topo" },
              ]} />
          </Row>
          <Row label="Espaçamento">
            <Slider value={style.funnel.gapPct} max={20}
              onChange={(v) => updPath("funnel", { gapPct: v })} />
          </Row>
          <Row label="Rótulos">
            <SelectField value={style.funnel.labelMode}
              onChange={(v) => updPath("funnel", { labelMode: v as never })}
              options={[
                { value: "name-percent", label: "Nome + %" },
                { value: "name", label: "Nome" },
                { value: "value", label: "Valor" },
                { value: "percent", label: "Percentual" },
              ]} />
          </Row>
          {detectedRanking.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[12px] font-medium text-muted-foreground">Estágios</div>
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
        <Section title="Mapa de árvore" onReset={() => resetPath("treemap")}>
          <Row label="Esquema de cor">
            <Segmented value={style.treemap.colorScheme}
              onChange={(v) => updPath("treemap", { colorScheme: v as never })}
              options={[
                { value: "categorical", label: "Por categoria" },
                { value: "gradient", label: "Gradiente" },
              ]} />
          </Row>
          {style.treemap.colorScheme === "gradient" && (
            <>
              <Row label="Cor inicial">
                <ColorField value={style.treemap.gradientFrom}
                  onChange={(c) => updPath("treemap", { gradientFrom: c })} />
              </Row>
              <Row label="Cor final">
                <ColorField value={style.treemap.gradientTo}
                  onChange={(c) => updPath("treemap", { gradientTo: c })} />
              </Row>
            </>
          )}
          <ToggleField label="Mostrar nome" value={style.treemap.showCategoryLabel}
            onChange={(v) => updPath("treemap", { showCategoryLabel: v })} />
          <ToggleField label="Mostrar valor" value={style.treemap.showValueLabel}
            onChange={(v) => updPath("treemap", { showValueLabel: v })} />
          <Row label="Cor borda">
            <ColorField value={style.treemap.borderColor}
              onChange={(c) => updPath("treemap", { borderColor: c })} />
          </Row>
          <Row label="Esp. borda">
            <NumberStepper value={style.treemap.borderWidth} min={0} max={5}
              onChange={(v) => updPath("treemap", { borderWidth: v })} suffix="px" />
          </Row>
        </Section>
      )}

      {/* ===== Type-specific: Radar ===== */}
      {S.isRadar && (
        <Section title="Radar" onReset={() => resetPath("radar")}>
          <ToggleField label="Preencher área" value={style.radar.fillArea}
            onChange={(v) => updPath("radar", { fillArea: v })} />
          <Row label="Opac. preenchimento">
            <Slider value={Math.round(style.radar.fillOpacity * 100)}
              onChange={(v) => updPath("radar", { fillOpacity: v / 100 })} />
          </Row>
          <Row label="Forma da grade">
            <Segmented value={style.radar.gridShape}
              onChange={(v) => updPath("radar", { gridShape: v as never })}
              options={[
                { value: "polygon", label: "Polígono" },
                { value: "circle", label: "Círculo" },
              ]} />
          </Row>
          <Row label="Cor grade">
            <ColorField value={style.radar.gridColor}
              onChange={(c) => updPath("radar", { gridColor: c })} />
          </Row>
          <Row label="Tam. rótulo eixo">
            <NumberStepper value={style.radar.axisLabelSize} min={6} max={24}
              onChange={(v) => updPath("radar", { axisLabelSize: v })} suffix="pt" />
          </Row>
          <Row label="Cor rótulo eixo">
            <ColorField value={style.radar.axisLabelColor}
              onChange={(c) => updPath("radar", { axisLabelColor: c })} />
          </Row>
        </Section>
      )}

      {/* ===== Type-specific: Histogram ===== */}
      {ct === "histogram" && (
        <Section title="Histograma" onReset={() => resetPath("histogram")}>
          <Row label="Nº de bins">
            <NumberStepper value={style.histogram.bins} min={2} max={100}
              onChange={(v) => updPath("histogram", { bins: v })} />
          </Row>
          <Row label="Largura bin">
            <Input type="number" className="h-8 text-[13px]"
              value={style.histogram.binWidth ?? ""} placeholder="auto"
              onChange={(e) => updPath("histogram", {
                binWidth: e.target.value === "" ? null : parseFloat(e.target.value),
              })} />
          </Row>
          <Row label="Cor barra">
            <ColorField value={style.histogram.barColor}
              onChange={(c) => updPath("histogram", { barColor: c })} />
          </Row>
          <Row label="Cor borda">
            <ColorField value={style.histogram.borderColor}
              onChange={(c) => updPath("histogram", { borderColor: c })} />
          </Row>
          <Row label="Esp. borda">
            <NumberStepper value={style.histogram.borderWidth} min={0} max={5}
              onChange={(v) => updPath("histogram", { borderWidth: v })} suffix="px" />
          </Row>
          <ToggleField label="Linha cumulativa" value={style.histogram.cumulative}
            onChange={(v) => updPath("histogram", { cumulative: v })} />
        </Section>
      )}

      {/* ===== Type-specific: Boxplot ===== */}
      {ct === "boxplot" && (
        <Section title="Caixa (Box & Whisker)" onReset={() => resetPath("boxplot")}>
          <Row label="Cor caixa">
            <ColorField value={style.boxplot.boxFillColor}
              onChange={(c) => updPath("boxplot", { boxFillColor: c })} />
          </Row>
          <Row label="Cor bigode">
            <ColorField value={style.boxplot.whiskerColor}
              onChange={(c) => updPath("boxplot", { whiskerColor: c })} />
          </Row>
          <Row label="Esp. bigode">
            <NumberStepper value={style.boxplot.whiskerWidth} min={0.5} max={6} step={0.5}
              onChange={(v) => updPath("boxplot", { whiskerWidth: v })} suffix="px" />
          </Row>
          <Row label="Cor mediana">
            <ColorField value={style.boxplot.medianColor}
              onChange={(c) => updPath("boxplot", { medianColor: c })} />
          </Row>
          <Row label="Esp. mediana">
            <NumberStepper value={style.boxplot.medianWidth} min={0.5} max={6} step={0.5}
              onChange={(v) => updPath("boxplot", { medianWidth: v })} suffix="px" />
          </Row>
          <ToggleField label="Mostrar média" value={style.boxplot.showMean}
            onChange={(v) => updPath("boxplot", { showMean: v })} />
          <ToggleField label="Mostrar outliers" value={style.boxplot.showOutliers}
            onChange={(v) => updPath("boxplot", { showOutliers: v })} />
        </Section>
      )}

      {/* ===== Data labels (moved up — frequently used) ===== */}
      <Section title="Rótulos de dados" onReset={() => resetPath("dataLabels")}>
        <ToggleField label="Mostrar" value={style.dataLabels.show}
          onChange={(v) => updPath("dataLabels", { show: v })} />
        <Row label="Tamanho">
          <NumberStepper value={style.dataLabels.size} min={6} max={24}
            onChange={(v) => updPath("dataLabels", { size: v })} suffix="pt" />
        </Row>
        <Row label="Cor"><ColorField value={style.dataLabels.color}
          onChange={(c) => updPath("dataLabels", { color: c })} /></Row>
        <ToggleField label="Negrito" value={style.dataLabels.bold}
          onChange={(v) => updPath("dataLabels", { bold: v })} />
        <ToggleField label="Itálico" value={style.dataLabels.italic}
          onChange={(v) => updPath("dataLabels", { italic: v })} />
        {ct !== "histogram" && ct !== "boxplot" && (
          <Row label="Posição">
            <SelectField value={ct === "funnel" ? (style.funnel.labelPos ?? "right") : style.dataLabels.position}
              onChange={(v) => ct === "funnel"
                ? updPath("funnel", { labelPos: v as never })
                : updPath("dataLabels", { position: v as never })}
              options={positionOptions(ct) as never} />
          </Row>
        )}
        {ct !== "histogram" && (
          <Row label="Formato">
            <SelectField value={style.dataLabels.format}
              onChange={(v) => updPath("dataLabels", { format: v as never })}
              options={[
                { value: "auto", label: "Automático" },
                { value: "currency", label: "Moeda" },
                { value: "percent", label: "Percentual" },
                { value: "number", label: "Número" },
                { value: "tons", label: "Toneladas" },
              ]} />
          </Row>
        )}
        {ct !== "histogram" && (
          <Row label="Decimais">
            <NumberStepper value={style.dataLabels.decimals} min={0} max={4}
              onChange={(v) => updPath("dataLabels", { decimals: v })} />
          </Row>
        )}
        <ToggleField label="Auto-contraste" value={style.dataLabels.autoContrast}
          onChange={(v) => updPath("dataLabels", { autoContrast: v })} />
        {ct !== "pie" && ct !== "donut" && (
          <ToggleField label="Mostrar nome série" value={style.dataLabels.showSeries}
            onChange={(v) => updPath("dataLabels", { showSeries: v })} />
        )}
        <ToggleField label="Mostrar categoria" value={style.dataLabels.showCategory}
          onChange={(v) => updPath("dataLabels", { showCategory: v })} />
        <Row label="Fundo rótulo">
          <ColorField value={style.dataLabels.bgColor}
            onChange={(c) => updPath("dataLabels", { bgColor: c })} />
        </Row>
        <Row label="Opac. fundo">
          <Slider value={Math.round(style.dataLabels.bgOpacity * 100)}
            onChange={(v) => updPath("dataLabels", { bgOpacity: v / 100 })} />
        </Row>
        <Row label="Cor borda">
          <ColorField value={style.dataLabels.borderColor}
            onChange={(c) => updPath("dataLabels", { borderColor: c })} />
        </Row>
        <Row label="Esp. borda">
          <NumberStepper value={style.dataLabels.borderWidth} min={0} max={5}
            onChange={(v) => updPath("dataLabels", { borderWidth: v })} suffix="px" />
        </Row>
      </Section>

      {/* ===== Series (moved up — frequently used) ===== */}
      {S.showSeries && (
        <Section title="Séries" onReset={() => updStyle({ series: [] })}>
          <p className="text-[12px] text-muted-foreground">
            Cores e estilos por série. {detectedSeries.length === 0 && "(Nenhuma série detectada — usando padrão.)"}
          </p>
          {(detectedSeries.length === 0 ? ["Total"] : detectedSeries).map((name, i) => {
            const cfg = getSeriesCfg(name);
            return (
              <div key={name} className="space-y-1.5 rounded border border-border/30 p-2.5">
                <div className="text-[12px] font-medium truncate">{name}</div>
                <Row label="Cor">
                  <ColorField value={cfg.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length]}
                    onChange={(c) => updSeries(name, { color: c })} />
                </Row>
                {S.showLineSeriesProps && (
                  <>
                    <Row label="Estilo linha">
                      <Segmented value={cfg.lineStyle ?? "solid"}
                        onChange={(v) => updSeries(name, { lineStyle: v as never })}
                        options={[
                          { value: "solid", label: "Sólida" },
                          { value: "dashed", label: "Tracej." },
                          { value: "dotted", label: "Pont." },
                        ]} />
                    </Row>
                    <Row label="Espessura">
                      <NumberStepper value={cfg.thickness ?? 2.5} min={0.5} max={8} step={0.5}
                        onChange={(v) => updSeries(name, { thickness: v })} suffix="px" />
                    </Row>
                    <ToggleField label="Suave" value={cfg.smooth ?? false}
                      onChange={(v) => updSeries(name, { smooth: v })} />
                  </>
                )}
                {S.showArea && (
                  <Row label="Opac. área">
                    <Slider value={Math.round((cfg.areaOpacity ?? 0.35) * 100)}
                      onChange={(v) => updSeries(name, { areaOpacity: v / 100 })} />
                  </Row>
                )}
                {(ct === "line" || ct === "scatter" || ct === "combo") && (
                  <>
                    <Row label="Marcador">
                      <SelectField value={cfg.marker?.shape ?? "circle"}
                        onChange={(v) => updSeries(name, {
                          marker: { ...(cfg.marker ?? { show: true, shape: "circle", size: 3 }),
                            shape: v as never },
                        })}
                        options={[
                          { value: "circle", label: "Círculo" },
                          { value: "square", label: "Quadrado" },
                          { value: "diamond", label: "Diamante" },
                          { value: "triangle", label: "Triângulo" },
                        ]} />
                    </Row>
                    <Row label="Tam. marcador">
                      <NumberStepper value={cfg.marker?.size ?? 3} min={0} max={12}
                        onChange={(v) => updSeries(name, {
                          marker: { ...(cfg.marker ?? { show: true, shape: "circle", size: 3 }),
                            size: v, show: v > 0 },
                        })} suffix="px" />
                    </Row>
                    <Row label="Cor marcador">
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
                    <Row label="Renderizar como">
                      <Segmented value={cfg.asLine ? "line" : "bar"}
                        onChange={(v) => updSeries(name, { asLine: v === "line" })}
                        options={[
                          { value: "bar", label: "Barra" },
                          { value: "line", label: "Linha" },
                        ]} />
                    </Row>
                    <ToggleField label="Eixo Y secundário" value={cfg.secondaryAxis ?? false}
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
      <Section title="Geral" onReset={() => resetPath("general")}>
        <div>
          <Label className="text-[12px] font-normal text-muted-foreground">Título</Label>
          <Input className="mt-1 h-8 text-[13px]" value={block.title ?? ""}
            onChange={(e) => onChange({ title: e.target.value })} />
        </div>
        <ToggleField label="Mostrar título" value={style.general.titleShow}
          onChange={(v) => updPath("general", { titleShow: v })} />
        <Row label="Tam. título">
          <NumberStepper value={style.general.titleSize} min={8} max={64}
            onChange={(v) => updPath("general", { titleSize: v })} suffix="pt" />
        </Row>
        <Row label="Cor título">
          <ColorField value={style.general.titleColor}
            onChange={(c) => updPath("general", { titleColor: c })} />
        </Row>
        <ToggleField label="Negrito" value={style.general.titleBold}
          onChange={(v) => updPath("general", { titleBold: v })} />
        <ToggleField label="Itálico" value={style.general.titleItalic}
          onChange={(v) => updPath("general", { titleItalic: v })} />
        <Row label="Fundo">
          <ColorField value={style.general.background} allowTransparent
            onChange={(c) => updPath("general", { background: c })} />
        </Row>
        <Row label="Borda">
          <ColorField value={style.general.borderColor}
            onChange={(c) => updPath("general", { borderColor: c })} />
        </Row>
        <Row label="Esp. borda">
          <NumberStepper value={style.general.borderWidth} min={0} max={8}
            onChange={(v) => updPath("general", { borderWidth: v })} suffix="px" />
        </Row>
        <Row label="Padding">
          <NumberStepper value={style.general.padding} min={0} max={40}
            onChange={(v) => updPath("general", { padding: v })} suffix="px" />
        </Row>
        <ToggleField label="Mostrar legenda" value={style.general.legendShow}
          onChange={(v) => updPath("general", { legendShow: v })} />
        <Row label="Pos. legenda">
          <SelectField value={style.general.legendPos}
            onChange={(v) => updPath("general", { legendPos: v as never })}
            options={[
              { value: "top", label: "Topo" },
              { value: "bottom", label: "Rodapé" },
              { value: "left", label: "Esquerda" },
              { value: "right", label: "Direita" },
            ]} />
        </Row>
      </Section>

      {/* ===== Grid ===== */}
      {S.showGrid && (
        <Section title="Grade" onReset={() => resetPath("grid")}>
          <ToggleField label="Mostrar grade" value={style.grid.show}
            onChange={(v) => updPath("grid", { show: v })} />
          <Row label="Cor"><ColorField value={style.grid.color}
            onChange={(c) => updPath("grid", { color: c })} /></Row>
          <Row label="Estilo">
            <SelectField value={style.grid.style}
              onChange={(v) => updPath("grid", { style: v as never })}
              options={[{ value: "solid", label: "Sólido" }, { value: "dashed", label: "Tracejado" }]} />
          </Row>
        </Section>
      )}

      {/* ===== Axes ===== */}
      {S.showAxes && (
        <>
          <AxisSection title="Eixo X" axis={style.xAxis}
            onChange={(p) => updPath("xAxis", p)}
            onReset={() => resetPath("xAxis")} />
          <AxisSection title="Eixo Y" axis={style.yAxis}
            onChange={(p) => updPath("yAxis", p)}
            onReset={() => resetPath("yAxis")} />
          {S.isCombo && (
            <AxisSection title="Eixo Y secundário" axis={style.yAxis2!}
              onChange={(p) => updPath("yAxis2", p)}
              onReset={() => resetPath("yAxis2")} />
          )}
        </>
      )}
      {S.isRadar && (
        <Section title="Grade radar" onReset={() => resetPath("radar")}>
          <Row label="Forma da grade">
            <Segmented value={style.radar.gridShape}
              onChange={(v) => updPath("radar", { gridShape: v as never })}
              options={[
                { value: "polygon", label: "Polígono" },
                { value: "circle", label: "Círculo" },
              ]} />
          </Row>
          <Row label="Cor grade">
            <ColorField value={style.radar.gridColor}
              onChange={(c) => updPath("radar", { gridColor: c })} />
          </Row>
          <Row label="Tam. rótulo eixo">
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
          Sem análises disponíveis para este tipo de gráfico.
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
      id: rid(), value: 0, label: `Linha ${refs.length + 1}`,
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
    <Section title="Análises">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-[12px] font-medium text-muted-foreground">Linhas de referência</Label>
          <button type="button" onClick={addRef} disabled={refs.length >= 3}
            className="flex items-center gap-1 rounded border border-input px-1.5 py-0.5 text-[10px] hover:bg-secondary disabled:opacity-40">
            <Plus className="h-3 w-3" /> Adicionar
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
            <Row label="Valor Y">
              <Input type="number" className="h-8 text-[13px]" value={rl.value}
                onChange={(e) => updRef(i, { value: parseFloat(e.target.value) || 0 })} />
            </Row>
            <Row label="Rótulo">
              <Input className="h-8 text-[13px]" value={rl.label}
                onChange={(e) => updRef(i, { label: e.target.value })} />
            </Row>
            <Row label="Cor"><ColorField value={rl.color} onChange={(c) => updRef(i, { color: c })} /></Row>
            <Row label="Estilo">
              <Segmented value={rl.style} onChange={(v) => updRef(i, { style: v as never })}
                options={[
                  { value: "solid", label: "Sólida" },
                  { value: "dashed", label: "Tracej." },
                  { value: "dotted", label: "Pont." },
                ]} />
            </Row>
            <Row label="Espessura">
              <NumberStepper value={rl.thickness} min={0.5} max={6} step={0.5}
                onChange={(v) => updRef(i, { thickness: v })} suffix="px" />
            </Row>
          </div>
        ))}
      </div>

      <div className="mt-2 space-y-1.5 rounded border border-border/30 p-2.5">
        <div className="text-[12px] font-medium text-muted-foreground">Tendência</div>
        <ToggleField label="Habilitar" value={trend.enabled}
          onChange={(v) => onChange({ trendline: { ...trend, enabled: v } })} />
        <Row label="Tipo">
          <SelectField value={trend.type}
            onChange={(v) => onChange({ trendline: { ...trend, type: v as never } })}
            options={[
              { value: "linear", label: "Linear" },
              { value: "exp", label: "Exponencial" },
              { value: "ma", label: "Média móvel" },
            ]} />
        </Row>
        {trend.type === "ma" && (
          <Row label="Janela (N)">
            <NumberStepper value={trend.maWindow} min={2} max={12}
              onChange={(v) => onChange({ trendline: { ...trend, maWindow: v } })} />
          </Row>
        )}
        <Row label="Cor"><ColorField value={trend.color}
          onChange={(c) => onChange({ trendline: { ...trend, color: c } })} /></Row>
        <Row label="Espessura">
          <NumberStepper value={trend.thickness} min={0.5} max={6} step={0.5}
            onChange={(v) => onChange({ trendline: { ...trend, thickness: v } })} suffix="px" />
        </Row>
        <Row label="Estilo">
          <Segmented value={trend.style}
            onChange={(v) => onChange({ trendline: { ...trend, style: v as never } })}
            options={[
              { value: "solid", label: "Sólida" },
              { value: "dashed", label: "Tracej." },
              { value: "dotted", label: "Pont." },
            ]} />
        </Row>
        <ToggleField label="Mostrar R²" value={trend.showR2}
          onChange={(v) => onChange({ trendline: { ...trend, showR2: v } })} />
      </div>

      <div className="mt-2 space-y-1.5 rounded border border-border/30 p-2.5">
        <div className="text-[12px] font-medium text-muted-foreground">Previsão</div>
        <ToggleField label="Habilitar" value={fc.enabled}
          onChange={(v) => onChange({ forecast: { ...fc, enabled: v } })} />
        <Row label="Períodos à frente">
          <NumberStepper value={fc.periods} min={1} max={6}
            onChange={(v) => onChange({ forecast: { ...fc, periods: v } })} />
        </Row>
        <ToggleField label="Banda de confiança" value={fc.band}
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
    <Section title="Formatação condicional">
      <div className="flex items-center justify-between">
        <Label className="text-[12px] font-medium text-muted-foreground">Regras</Label>
        <button type="button" onClick={add} disabled={rules.length >= 5}
          className="flex items-center gap-1 rounded border border-input px-1.5 py-0.5 text-[10px] hover:bg-secondary disabled:opacity-40">
          <Plus className="h-3 w-3" /> Adicionar
        </button>
      </div>
      {rules.map((r, i) => (
        <div key={r.id} className="space-y-1.5 rounded border border-border/30 p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium">#{i + 1}</span>
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                onClick={() => move(i, -1)}><ChevronUp className="h-3.5 w-3.5" /></Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                onClick={() => move(i, 1)}><ChevronDown className="h-3.5 w-3.5" /></Button>
              <button type="button" onClick={() => del(i)}
                className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
          <Row label="Operador">
            <SelectField value={r.op} onChange={(v) => upd(i, { op: v as never })}
              options={[
                { value: ">", label: ">" },
                { value: "<", label: "<" },
                { value: "=", label: "=" },
                { value: "between", label: "Entre" },
              ]} />
          </Row>
          <Row label="Valor">
            <Input type="number" className="h-8 text-[13px]" value={r.threshold}
              onChange={(e) => upd(i, { threshold: parseFloat(e.target.value) || 0 })} />
          </Row>
          {r.op === "between" && (
            <Row label="Valor 2">
              <Input type="number" className="h-8 text-[13px]" value={r.threshold2 ?? 0}
                onChange={(e) => upd(i, { threshold2: parseFloat(e.target.value) || 0 })} />
            </Row>
          )}
          <Row label="Cor"><ColorField value={r.color} onChange={(c) => upd(i, { color: c })} /></Row>
        </div>
      ))}
      <Row label="Cor padrão">
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
      cols.push({ id: rid(), label: "Total", type: "total", manualValue: total });
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
      cols.push({ id: rid(), label: "Total", type: "total", manualValue: total });
      return cols;
    } catch { return []; }
  };

  const presets: { label: string; build: () => WaterfallColumn[] }[] = [
    { label: "Por mês", build: buildByPeriod },
    { label: "Por efeito", build: () => [
      { id: rid(), label: "Início", type: "start", measure: block.measure },
      { id: rid(), label: "Volume", type: "positive", measure: "volume" },
      { id: rid(), label: "Preço", type: "positive", measure: "precoMedio" },
      { id: rid(), label: "Mix", type: "negative", measure: block.measure },
      { id: rid(), label: "Final", type: "total", measure: block.measure },
    ]},
    { label: "Por categoria", build: () => buildByDim("categoria") },
    { label: "Por marca", build: () => buildByDim("marca") },
    { label: "Por canal", build: () => buildByDim("canalAjustado") },
    { label: "Em branco", build: () => [] },
  ];
  const addBlank = () => setValue([...value, {
    id: rid(), label: "Nova coluna", type: "positive", measure: block.measure,
  }]);

  return (
    <div className="mt-2 space-y-1.5 rounded border border-border/30 p-2.5">
      <div className="text-[12px] font-medium text-muted-foreground">Colunas (Bridge)</div>
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
          Sem colunas — usando o modo automático (uma coluna por período).
        </p>
      )}
      {value.map((c, i) => (
        <div key={c.id} className="space-y-1.5 rounded border border-border/30 p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium">#{i + 1}</span>
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                onClick={() => move(i, -1)}><ChevronUp className="h-3.5 w-3.5" /></Button>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                onClick={() => move(i, 1)}><ChevronDown className="h-3.5 w-3.5" /></Button>
              <button type="button" onClick={() => del(i)}
                className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
          <Row label="Rótulo">
            <Input className="h-8 text-[13px]" value={c.label}
              onChange={(e) => upd(i, { label: e.target.value })} />
          </Row>
          <Row label="Tipo">
            <SelectField value={c.type} onChange={(v) => upd(i, { type: v as never })}
              options={[
                { value: "start", label: "Início" },
                { value: "positive", label: "Positivo" },
                { value: "negative", label: "Negativo" },
                { value: "total", label: "Total" },
                { value: "subtotal", label: "Subtotal" },
              ]} />
          </Row>
          <Row label="Medida">
            <SelectField value={c.measure ?? "__manual__"}
              onChange={(v) => upd(i, v === "__manual__"
                ? { measure: undefined }
                : { measure: v as KpiMeasureId, manualValue: undefined })}
              options={[
                { value: "__manual__", label: "— Manual —" },
                ...KPI_MEASURES.map((m) => ({ value: m.id, label: m.label })),
              ]} />
          </Row>
          {c.measure == null && (
            <Row label="Valor">
              <Input type="number" className="h-8 text-[13px]" value={c.manualValue ?? 0}
                onChange={(e) => upd(i, { manualValue: parseFloat(e.target.value) || 0 })} />
            </Row>
          )}
          <Row label="Filtrar dim.">
            <SelectField value={c.filterDim ?? "__none__"}
              onChange={(v) => upd(i, { filterDim: v === "__none__" ? null : v })}
              options={[
                { value: "__none__", label: "— Nenhum —" },
                { value: "marca", label: "Marca" },
                { value: "canalAjustado", label: "Canal" },
                { value: "categoria", label: "Categoria" },
                { value: "mercado", label: "Mercado" },
              ]} />
          </Row>
          {c.filterDim && (
            <Row label="Valor filtro">
              <Input className="h-8 text-[13px]" value={c.filterValue ?? ""}
                onChange={(e) => upd(i, { filterValue: e.target.value })} />
            </Row>
          )}
        </div>
      ))}
      <button type="button" onClick={addBlank}
        className="flex w-full items-center justify-center gap-1 rounded border border-dashed border-input py-1 text-[10px] text-muted-foreground hover:bg-secondary">
        <Plus className="h-3 w-3" /> Adicionar coluna
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
      <ToggleField label="Mostrar eixo" value={axis.show}
        onChange={(v) => onChange({ show: v })} />
      <div className="space-y-1">
        <Label className="text-[12px] font-medium text-muted-foreground">Título do eixo</Label>
        <Input className="h-8 text-[13px]" value={axis.titleText}
          onChange={(e) => onChange({ titleText: e.target.value })} />
      </div>
      <Row label="Tam. título">
        <NumberStepper value={axis.titleSize} min={6} max={24}
          onChange={(v) => onChange({ titleSize: v })} suffix="pt" />
      </Row>
      <Row label="Cor título">
        <ColorField value={axis.titleColor}
          onChange={(c) => onChange({ titleColor: c })} />
      </Row>
      <Row label="Tam. rótulo">
        <NumberStepper value={axis.labelSize} min={6} max={24}
          onChange={(v) => onChange({ labelSize: v })} suffix="pt" />
      </Row>
      <Row label="Cor rótulo"><ColorField value={axis.labelColor}
        onChange={(c) => onChange({ labelColor: c })} /></Row>
      <Row label="Cor linha"><ColorField value={axis.lineColor}
        onChange={(c) => onChange({ lineColor: c })} /></Row>
      <Row label="Esp. linha">
        <NumberStepper value={axis.lineWidth} min={0} max={5}
          onChange={(v) => onChange({ lineWidth: v })} suffix="px" />
      </Row>
      <ToggleField label="Marcações" value={axis.ticks}
        onChange={(v) => onChange({ ticks: v })} />
      <Row label="Mín">
        <Input type="number" className="h-8 text-[13px]"
          value={axis.min ?? ""} placeholder="auto"
          onChange={(e) => {
            if (e.target.value === "") { onChange({ min: null }); return; }
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onChange({ min: v });
          }} />
      </Row>
      <Row label="Máx">
        <Input type="number" className="h-8 text-[13px]"
          value={axis.max ?? ""} placeholder="auto"
          onChange={(e) => {
            if (e.target.value === "") { onChange({ max: null }); return; }
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onChange({ max: v });
          }} />
      </Row>
      <Row label="Formato">
        <SelectField value={axis.format}
          onChange={(v) => onChange({ format: v as never })}
          options={[
            { value: "auto", label: "Automático" },
            { value: "currency", label: "Moeda" },
            { value: "percent", label: "Percentual" },
            { value: "number", label: "Número" },
            { value: "tons", label: "Toneladas" },
          ]} />
      </Row>
      <Row label="Decimais">
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
      <Row label="Modo Bridge">
        <Segmented value={mode}
          onChange={(v) => updPath("waterfall", { mode: v as never })}
          options={[
            { value: "pvm", label: "PVM (auto)" },
            { value: "manual", label: "Manual" },
          ]} />
      </Row>
      {mode === "pvm" && (
        <>
          <Row label="Comparação">
            <Segmented value={comparisonMode}
              onChange={(v) => updPath("waterfall", {
                pvm: { ...pvm, comparisonMode: v as never, periodMode: v === "manual" ? pvm.periodMode : "month" },
              })}
              options={[
                { value: "prev-month", label: "Mês ant." },
                { value: "prev-year-month", label: "Mês AA" },
                { value: "bench", label: "Bench" },
                { value: "manual", label: "Manual" },
              ]} />
          </Row>
          {comparisonMode === "bench" && (
            <div className="rounded-md border border-border/40 bg-muted/30 px-2 py-1.5 text-[11px] text-muted-foreground">
              {benchInfo
                ? <>Bench: <span className="font-medium text-foreground">{benchInfo.label}</span> (R$ {Math.round(benchInfo.v).toLocaleString("pt-BR")})</>
                : "Bench: sem dados suficientes"}
            </div>
          )}
          {comparisonMode === "manual" && (
            <>
              <Row label="Período">
                <Segmented value={pvm.periodMode}
                  onChange={(v) => updPath("waterfall", {
                    pvm: { ...pvm, periodMode: v as never, base: null, comp: null },
                  })}
                  options={[
                    { value: "month", label: "Mês" },
                    { value: "fy", label: "Ano fiscal" },
                  ]} />
              </Row>
              <Row label="Base">
                <SelectField value={pvm.base ?? ""}
                  onChange={(v) => updPath("waterfall", { pvm: { ...pvm, base: v || null } })}
                  options={opts} />
              </Row>
              <Row label="Comparação">
                <SelectField value={pvm.comp ?? ""}
                  onChange={(v) => updPath("waterfall", { pvm: { ...pvm, comp: v || null } })}
                  options={opts} />
              </Row>
            </>
          )}
          <Row label="Decomposição">
            <SelectField value={pvm.decomposition ?? "effects"}
              onChange={(v) => updPath("waterfall", { pvm: { ...pvm, decomposition: v } })}
              options={[
                { value: "effects",      label: "Efeitos (Volume/Preço/Custo…)" },
                { value: "marca",        label: "Marca" },
                { value: "categoria",    label: "Categoria" },
                { value: "subcategoria", label: "Subcategoria" },
                { value: "formato",      label: "Formato" },
                { value: "canal",        label: "Canal" },
                { value: "canalAjustado",label: "Canal ajustado" },
                { value: "mercado",      label: "Mercado" },
                { value: "regional",     label: "Regional" },
                { value: "uf",           label: "UF" },
                { value: "sku",          label: "SKU (item)" },
                { value: "skuDesc",      label: "SKU (descrição)" },
              ]} />
          </Row>
          {(pvm.decomposition ?? "effects") !== "effects" && (
            <Row label="Top N">
              <NumberStepper value={pvm.topN ?? 6} min={3} max={20}
                onChange={(v) => updPath("waterfall", { pvm: { ...pvm, topN: v } })} />
            </Row>
          )}
        </>
      )}
    </>
  );
}
