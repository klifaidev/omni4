import { useEffect, useId, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider as UiSlider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignHorizontalJustifyCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  AlignVerticalJustifyCenter,
  ChevronDown,
  Filter as FunnelIcon,
  GripVertical,
  Info,
  Loader2,
  Minus,
  Paintbrush,
  Plus,
  Copy as CopyIcon,
  Sparkles,
  Star,
  Trash2,
  Group as GroupIcon,
  Ungroup as UngroupIcon,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Section, Row, ToggleField, NumberStepper, ColorField, Segmented, Slider, SelectField } from "../chart/Inspector";
import { MultiSelectFilter } from "@/components/pricing/MultiSelectFilter";
import { BlockFilters } from "../BlockFilters";
import { ShapeInspector } from "../ShapeInspector";
import { DraftInput, DraftNumberInput, DraftTextarea } from "../DraftInput";
import { ChartInspector } from "../chart/ChartInspector";
import { CUSTOM_TABLE_MEASURES, CUSTOM_TABLE_DIMS } from "../BlockRenderer";
import { useMonthsInfo, useFyList } from "@/store/selectors";
import { useBudget } from "@/store/budget";
import { useForecast } from "@/store/forecast";
import { useRolling } from "@/store/rolling";
import { usePricing } from "@/store/pricing";
import { computePivot, type PivotConfig } from "@/lib/pivot";
import { buildUnifiedRows } from "@/lib/pivotData";
import { resolveTableFit, tableHeightWithExtraRows, type FitInfo } from "@/lib/customCapacity";
import { cn } from "@/lib/utils";
import {
  dataSourceActiveClass,
  dataSourceBadgeClass,
  dataSourceDescription,
  dataSourceLabel,
} from "@/lib/slideDataSourceTheme";
import { SLIDE_HEX, SLIDE_PPT_HEX, SLIDE_RGBA } from "@/lib/slideColors";
import type { Filters, PricingRow } from "@/lib/types";
import {
  BLOCK_LABELS, KPI_MEASURES, CHART_TYPE_LABELS, CANVAS_H,
  BUDGET_UNAVAILABLE_MEASURES, BUDGET_UNAVAILABLE_HINT,
  FORECAST_UNAVAILABLE_MEASURES, FORECAST_UNAVAILABLE_HINT,
  ROLLING_UNAVAILABLE_MEASURES, ROLLING_UNAVAILABLE_HINT,
  isFromBudgetBase, isFromForecastBase, isFromRollingBase,
  type BlockDataSource, type CustomBlock, type CustomBlockKind, type KpiBlock, type ChartBlock, type TopSkuBlock, type ShapeBlock, type TableBlock,
  type TitleBlock, type TextBlock, type DreBlock, type CustomChartType, type ConditionalFormatMode, type ConditionalFormatRule,
  type TableGapColumn, type TableGapComparisonMode, type OmniEvolucaoMensalBlock, type OmniHeatmapSazonalidadeBlock,
  type OmniHeroisOfensoresBlock, type OmniCanalTrendBlock, type OmniCanalMixBlock, type OmniCustoEvolucaoBlock,
  type OmniCustoComposicaoBlock, type OmniCustoPressaoBlock, type OmniPositivacaoBlock, type OmniUfMapBlock,
  type OmniPriceDecompBlock, type OmniBridgePvmBlock, type OmniFarolBlock, type OmniAbcCurvaBlock,
  type OmniBaseBlock, type OmniPortfolioMatrixBlock, type OmniAbcBarsBlock, type OmniMetric, type OmniDim, type OmniHeroesVariant, type OmniAbcSortBy,
} from "@/lib/customSlide";
import { newId } from "@/lib/slidesFlow";
import {
  patchBlockAction, alignBlocksAction, groupBlocksAction, ungroupBlocksAction,
  resizeGroupAction, type AlignKind,
} from "../editorStore";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
// Alias: este arquivo já tem cssEscapeId() usando o CSS global do browser
// (window.CSS.escape) — importar o CSS do dnd-kit sem alias sombrearia esse
// identificador e quebraria aquela função (ela compilava só porque "CSS"
// resolvia pro global antes desta importação existir).
import { CSS as DndCSS } from "@dnd-kit/utilities";
import { LINES as DRE_LINES } from "@/components/pricing/DreTable";
import { recordSlidePerfEvent, isSlidePerfEnabled } from "@/lib/slidesPerfCounters";
import { budgetRowsAsPricingFiltered } from "@/lib/budgetAdapter";
import { forecastRowsAsPricingLatest } from "@/lib/forecastAdapter";
import { rollingRowsAsPricing } from "@/lib/rollingAdapter";
import {
  brandStyleTargetLabel,
  buildBrandStylePatch,
  getBrandStyleTarget,
  getBrandStylesForBlock,
  SLIDE_DEFAULT_FONT_FAMILY,
  SLIDE_DEFAULT_FONT_LABEL,
  type SlideBrandStyle,
} from "@/lib/slideBrandKit";
import type { SlideTheme } from "@/lib/slideThemes";
import { dimensionLabel, useSlideFilters } from "../SlideFilterContext";
import {
  DEFAULT_BASE_RELATIVE_MONTH_PRESET,
  DEFAULT_RELATIVE_MONTH_PRESET,
  DEFAULT_RELATIVE_MONTH_RANGE_PRESET,
  RELATIVE_FY_PRESETS,
  RELATIVE_MONTH_RANGE_PRESETS,
  RELATIVE_MONTH_PRESETS,
  resolveMonthRangeSelection,
  type MonthRangeSelection,
  type PeriodSelectionMode,
  type RelativeMonthRangePreset,
  type RelativePeriodPreset,
} from "@/lib/relativePeriods";
import { strings } from "@/lib/i18n";

const t = strings.slides.editor.inspectors.blocks;
// Reaproveita o vocabulário de Borda/Sombra do inspector de Forma pro novo
// controle de borda/sombra de Imagem (Fase 4 — craft visual consistente:
// mesmas palavras, mesmos componentes, não uma cópia com nomes diferentes).
const ts = strings.slides.editor.inspectors.shape;
const tc = t.common;

// Mesmo alias usado em CustomSlideEditor.tsx pro tipo de ícone dos itens da
// paleta (não exportado de lá — declarado aqui de novo, igual ao padrão já
// usado nesse arquivo pra outros tipos locais).
type Icon = ComponentType<{ className?: string }>;

function unavailableMeasuresForSource(ds: BlockDataSource | undefined): readonly string[] {
  if (isFromBudgetBase(ds)) return BUDGET_UNAVAILABLE_MEASURES;
  if (isFromForecastBase(ds)) return FORECAST_UNAVAILABLE_MEASURES;
  if (isFromRollingBase(ds)) return ROLLING_UNAVAILABLE_MEASURES;
  return [];
}

function unavailableHintForSource(ds: BlockDataSource | undefined): string | undefined {
  if (isFromBudgetBase(ds)) return BUDGET_UNAVAILABLE_HINT;
  if (isFromForecastBase(ds)) return FORECAST_UNAVAILABLE_HINT;
  if (isFromRollingBase(ds)) return ROLLING_UNAVAILABLE_HINT;
  return undefined;
}

function defaultRelativePresetForMode(mode: "month" | "fy"): RelativePeriodPreset {
  return mode === "fy" ? "latest_fy_minus_1" : DEFAULT_RELATIVE_MONTH_PRESET;
}

function relativeOptionsForMode(mode: "month" | "fy") {
  return mode === "fy" ? RELATIVE_FY_PRESETS : RELATIVE_MONTH_PRESETS;
}

function PeriodModeBadge({ mode }: { mode: PeriodSelectionMode }) {
  return (
    <Badge variant={mode === "relative" ? "default" : "secondary"} className="h-4 px-1.5 text-[9px]">
      {mode === "relative" ? tc.relative : tc.fixed}
    </Badge>
  );
}

function RelativePresetSelect({
  mode,
  value,
  onChange,
}: {
  mode: "month" | "fy";
  value: RelativePeriodPreset | undefined;
  onChange: (value: RelativePeriodPreset) => void;
}) {
  const options = relativeOptionsForMode(mode);
  const safeValue = value ?? defaultRelativePresetForMode(mode);
  return (
    <Select value={safeValue} onValueChange={(v) => onChange(v as RelativePeriodPreset)}>
      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function PositionInputs({ block, onChange }: {
  block: CustomBlock; onChange: (p: Partial<CustomBlock>) => void;
}) {
  // useId() aqui daria o mesmo id pras 4 colunas (chamado 1x fora do map) —
  // por isso é gerado dentro do próprio .map, um id por campo.
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {(["x", "y", "w", "h"] as const).map((k) => (
        <PositionInputField key={k} axis={k} value={block[k]} onChange={onChange} />
      ))}
    </div>
  );
}

function PositionInputField({ axis, value, onChange }: {
  axis: "x" | "y" | "w" | "h";
  value: number;
  onChange: (p: Partial<CustomBlock>) => void;
}) {
  const id = useId();
  return (
    <div>
      <Label htmlFor={id} className="text-[9px] uppercase text-muted-foreground">{axis}</Label>
      <DraftNumberInput
        id={id}
        className="h-7 px-1.5 text-[11px]"
        value={value}
        fallback={0}
        onCommit={(next) => onChange({ [axis]: next ?? 0 } as never)}
      />
    </div>
  );
}

export function BlockAppearanceControls({ block, onChange }: {
  block: CustomBlock;
  onChange: (p: Partial<CustomBlock>) => void;
}) {
  const id = useId();
  return (
    <div className="rounded-md border border-border/40 bg-secondary/20 p-2">
      <Label id={id} className="mb-1 block text-[10px] uppercase text-muted-foreground">{t.blockAppearance.opacity}</Label>
      <div role="group" aria-labelledby={id}>
        <SliderWithInput
          value={block.opacity ?? 100}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => onChange({ opacity: v })}
        />
      </div>
    </div>
  );
}

export function BlockSpecificEditor({ block, onChange, styleFocusRequest }: {
  block: CustomBlock;
  onChange: (p: Partial<CustomBlock>) => void;
  styleFocusRequest?: number;
}) {
  useEffect(() => {
    if (!isSlidePerfEnabled()) return;
    recordSlidePerfEvent("slides.inspector.mount", {
      blockId: block.id,
      kind: block.kind,
    });
    return () => recordSlidePerfEvent("slides.inspector.unmount", {
      blockId: block.id,
      kind: block.kind,
    });
  }, [block.id, block.kind]);
  switch (block.kind) {
    case "title":
    case "text":
      return <TextTitleInspector block={block as TitleBlock | TextBlock} onChange={onChange as (p: Partial<TitleBlock | TextBlock>) => void} />;

    case "kpi":
      return <FilteredInspector
        block={block}
        design={<KpiInspector
          block={block}
          onChange={onChange}
        />}
        filters={block.filters ?? {}}
        onFiltersChange={(f) => onChange({ filters: f } as never)}
        onChange={onChange}
        styleFocusRequest={styleFocusRequest}
      />;

    case "image":
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-[10px] uppercase text-muted-foreground">{t.image.upload}</Label>
            <input type="file" accept="image/*"
              className="text-[11px]"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = () => onChange({ src: String(reader.result) } as never);
                reader.readAsDataURL(f);
              }}
            />
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">{t.image.fit}</Label>
              <Select value={block.fit} onValueChange={(v) => onChange({ fit: v as "contain"|"cover" } as never)}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="contain">{t.image.fitOptions.contain}</SelectItem>
                  <SelectItem value="cover">{t.image.fitOptions.cover}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Section title={ts.sections.outline}>
            <Row label={ts.borderColor}>
              <ColorField value={block.strokeColor ?? "#000000"}
                onChange={(c) => onChange({ strokeColor: c } as never)} />
            </Row>
            <Row label={ts.thickness}>
              <NumberStepper value={block.strokeWidth ?? 0} min={0} max={20}
                onChange={(v) => onChange({ strokeWidth: v } as never)} />
            </Row>
            <Row label={ts.radius}>
              <NumberStepper value={block.radius ?? 0} min={0} max={200}
                onChange={(v) => onChange({ radius: v } as never)} />
            </Row>
          </Section>

          <Section title={ts.sections.shadow}>
            <ToggleField label={ts.showShadow} value={!!block.shadowEnabled}
              onChange={(v) => onChange({ shadowEnabled: v } as never)} />
            {block.shadowEnabled && (
              <>
                <Row label={ts.color}>
                  <ColorField value={block.shadowColor ?? "#000000"}
                    onChange={(c) => onChange({ shadowColor: c } as never)} />
                </Row>
                <Row label={ts.opacityPct(block.shadowOpacity ?? 30)}>
                  <Slider value={block.shadowOpacity ?? 30} min={0} max={100} step={1}
                    onChange={(v) => onChange({ shadowOpacity: v } as never)} />
                </Row>
                <Row label={ts.blur}>
                  <NumberStepper value={block.shadowBlur ?? 12} min={0} max={40}
                    onChange={(v) => onChange({ shadowBlur: v } as never)} />
                </Row>
                <Row label={ts.axisX}>
                  <NumberStepper value={block.shadowX ?? 0} min={-40} max={40}
                    onChange={(v) => onChange({ shadowX: v } as never)} />
                </Row>
                <Row label={ts.axisY}>
                  <NumberStepper value={block.shadowY ?? 4} min={-40} max={40}
                    onChange={(v) => onChange({ shadowY: v } as never)} />
                </Row>
              </>
            )}
          </Section>
        </div>
      );

    case "shape":
      return <ShapeInspector block={block} onChange={onChange} />;

    case "bridge":
      return <FilteredInspector
        block={block}
        design={<BridgeBlockEditor block={block} onChange={onChange} />}
        filters={block.filters}
        onFiltersChange={(f) => onChange({ filters: f } as never)}
        onChange={onChange}
        styleFocusRequest={styleFocusRequest}
      />;

    case "table":
      return <FilteredInspector
        block={block}
        design={<TableBlockEditor block={block} onChange={onChange} />}
        filters={block.filters}
        onFiltersChange={(f) => onChange({ filters: f } as never)}
        onChange={onChange}
        styleFocusRequest={styleFocusRequest}
      />;

    case "chart":
      return <FilteredInspector
        block={block}
        design={<ChartBlockEditor block={block} onChange={onChange} />}
        filters={block.filters}
        onFiltersChange={(f) => onChange({ filters: f } as never)}
        onChange={onChange}
        styleFocusRequest={styleFocusRequest}
      />;

    case "topSku":
      return <FilteredInspector
        block={block}
        design={<TopSkuBlockEditor block={block} onChange={onChange} />}
        filters={block.filters}
        onFiltersChange={(f) => onChange({ filters: f } as never)}
        onChange={onChange}
        styleFocusRequest={styleFocusRequest}
      />;

    case "dre":
      return <FilteredInspector
        block={block}
        design={<DreBlockInspector block={block} onChange={onChange as (patch: Partial<DreBlock>) => void} />}
        filters={(block as DreBlock).filters ?? {}}
        onFiltersChange={(f) => onChange({ filters: f } as never)}
        onChange={onChange}
        styleFocusRequest={styleFocusRequest}
      />;

    // Omni Analytics inspectors
    case "omni_evolucao_mensal":
      return <OmniEvolucaoInspector block={block as OmniEvolucaoMensalBlock} onChange={onChange as (p: Partial<OmniEvolucaoMensalBlock>) => void} />;
    case "omni_heatmap_sazonalidade":
      return <OmniMetricInspector block={block as OmniHeatmapSazonalidadeBlock} onChange={onChange as (p: Partial<OmniHeatmapSazonalidadeBlock>) => void} label={t.omni.defaultTitles.heatmapSazonalidade} />;
    case "omni_herois_ofensores":
      return <OmniHeroisInspector block={block as OmniHeroisOfensoresBlock} onChange={onChange as (p: Partial<OmniHeroisOfensoresBlock>) => void} />;
    case "omni_canal_trend":
      return <OmniCanalTrendInspector block={block as OmniCanalTrendBlock} onChange={onChange as (p: Partial<OmniCanalTrendBlock>) => void} />;
    case "omni_canal_mix":
      return <OmniMetricInspector block={block as OmniCanalMixBlock} onChange={onChange as (p: Partial<OmniCanalMixBlock>) => void} label={t.omni.defaultTitles.canalMix} />;
    case "omni_custo_evolucao":
      return <OmniCustoInspector block={block as OmniCustoEvolucaoBlock} onChange={onChange as (p: Partial<OmniCustoEvolucaoBlock>) => void} />;
    case "omni_custo_composicao":
      return <OmniCustoInspector block={block as OmniCustoComposicaoBlock} onChange={onChange as (p: Partial<OmniCustoComposicaoBlock>) => void} />;
    case "omni_custo_pressao":
      return <OmniCustoPressaoInspector block={block as OmniCustoPressaoBlock} onChange={onChange as (p: Partial<OmniCustoPressaoBlock>) => void} />;
    case "omni_positivacao":
      return <OmniPositivacaoInspector block={block as OmniPositivacaoBlock} onChange={onChange as (p: Partial<OmniPositivacaoBlock>) => void} />;
    case "omni_uf_map":
      return <OmniUfMapInspector block={block as OmniUfMapBlock} onChange={onChange as (p: Partial<OmniUfMapBlock>) => void} />;
    case "omni_price_decomp":
      return <OmniPriceDecompInspector block={block as OmniPriceDecompBlock} onChange={onChange as (p: Partial<OmniPriceDecompBlock>) => void} />;
    case "omni_bridge_pvm":
      return <OmniBridgePvmInspector block={block as OmniBridgePvmBlock} onChange={onChange as (p: Partial<OmniBridgePvmBlock>) => void} />;
    case "omni_farol":
      return <OmniFarolInspector block={block as OmniFarolBlock} onChange={onChange as (p: Partial<OmniFarolBlock>) => void} />;
    case "omni_abc_curva":
      return <OmniAbcCurvaInspector block={block as OmniAbcCurvaBlock} onChange={onChange as (p: Partial<OmniAbcCurvaBlock>) => void} />;
    case "omni_portfolio_matrix":
      return <OmniDimMetricInspector block={block as OmniPortfolioMatrixBlock} onChange={onChange as (p: Partial<OmniPortfolioMatrixBlock>) => void} label={t.omni.defaultTitles.portfolioMatrix} />;
    case "omni_abc_bars":
      return <OmniHeroisInspector block={block as OmniAbcBarsBlock} onChange={onChange as (p: Partial<OmniAbcBarsBlock>) => void} />;
  }
}

// Wrapper com abas Design / Filtros ? dá aos blocos de dados a UX
// próxima do PowerPoint (painel de formatação à direita).
// Inclui o seletor de Fonte de Dados PINADO no topo (não-colapsável).
function FilteredInspector({
  block, design, filters, onFiltersChange, onChange, styleFocusRequest,
}: {
  block: CustomBlock;
  design: React.ReactNode;
  filters: Filters;
  onFiltersChange: (f: Filters) => void;
  onChange: (p: Partial<CustomBlock>) => void;
  styleFocusRequest?: number;
}) {
  const ds = (block as { dataSource?: BlockDataSource }).dataSource ?? "ke30";
  const [activeTab, setActiveTab] = useState("design");
  const [pendingSource, setPendingSource] = useState<BlockDataSource | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const hasBudget = useBudget((s) => s.rows.length > 0);
  const hasForecast = useForecast((s) => s.rows.length > 0);
  const hasRolling = useRolling((s) => s.rows.length > 0);

  // Bridge não tem fonte selecionável (sempre KE30 ? usa cálculo PVM).
  const showPicker = block.kind !== "bridge";

  useEffect(() => {
    if (styleFocusRequest) setActiveTab("design");
  }, [styleFocusRequest]);

  const applySwitch = (next: BlockDataSource) => {
    if (next === ds) return;
    setPendingSource(next);
  };

  const confirmSwitch = () => {
    if (!pendingSource) return;
    const unavailable = unavailableMeasuresForSource(pendingSource);
    // Reset filtros + medida quando a fonte muda ? campos podem não existir.
    const patch: Partial<CustomBlock> = {
      dataSource: pendingSource,
      filters: {},
    } as never;
    if (block.kind === "kpi" && unavailable.length > 0) {
      const m = (block as KpiBlock).measure;
      if (unavailable.includes(m)) {
        (patch as Partial<KpiBlock>).measure = isFromForecastBase(pendingSource) ? "volume" : "rol";
      }
    }
    if (block.kind === "chart" && unavailable.length > 0) {
      const m = (block as ChartBlock).measure;
      if (unavailable.includes(m)) {
        (patch as Partial<ChartBlock>).measure = isFromForecastBase(pendingSource) ? "volume" : "rol";
      }
      const chart = block as ChartBlock;
      const stylePatch: NonNullable<ChartBlock["style"]> = { ...(chart.style ?? {}) };
      if (stylePatch.measureLine && unavailable.includes(stylePatch.measureLine)) {
        stylePatch.measureLine = undefined;
      }
      if (stylePatch.measureX && unavailable.includes(stylePatch.measureX)) {
        stylePatch.measureX = undefined;
      }
      if (stylePatch.measureY && unavailable.includes(stylePatch.measureY)) {
        stylePatch.measureY = undefined;
      }
      const tooltipMeasure = chart.fieldWells?.tooltipMeasure;
      if (tooltipMeasure && unavailable.includes(tooltipMeasure)) {
        (patch as Partial<ChartBlock>).fieldWells = { ...chart.fieldWells, tooltipMeasure: null };
      }
      if (stylePatch.measureLine !== chart.style?.measureLine
        || stylePatch.measureX !== chart.style?.measureX
        || stylePatch.measureY !== chart.style?.measureY) {
        (patch as Partial<ChartBlock>).style = stylePatch;
      }
    }
    if (block.kind === "topSku" && unavailable.length > 0) {
      const m = (block as TopSkuBlock).measure;
      if (unavailable.includes(m)) {
        (patch as Partial<TopSkuBlock>).measure = isFromForecastBase(pendingSource) ? "volume" : "rol";
      }
    }
    if (block.kind === "table" && unavailable.length > 0) {
      const tb = block as Extract<CustomBlock, { kind: "table" }>;
      const filtered = tb.measures.filter((m) => !unavailable.includes(m));
      if (filtered.length !== tb.measures.length) {
        const fallback = filtered.length ? filtered : ["vol_real"];
        (patch as Partial<typeof tb>).measures = fallback;
        if (tb.sortMeasure && unavailable.includes(tb.sortMeasure)) {
          (patch as Partial<typeof tb>).sortMeasure = filtered[0] ?? undefined;
        }
        const nextMeasures = new Set(fallback);
        const nextGapColumns = (tb.gapColumns ?? []).filter((gap) => nextMeasures.has(gap.measureId));
        if (nextGapColumns.length !== (tb.gapColumns ?? []).length) {
          (patch as Partial<typeof tb>).gapColumns = nextGapColumns;
          if (tb.sortMode === "gap" && !nextGapColumns.some((gap) => gap.id === tb.sortGapColumnId)) {
            (patch as Partial<typeof tb>).sortGapColumnId = nextGapColumns[0]?.id;
            (patch as Partial<typeof tb>).sortMode = nextGapColumns.length ? "gap" : "kpi";
          }
        }
      }
    }
    setRecalculating(true);
    const nextLabel = dataSourceLabel(pendingSource);
    window.setTimeout(() => {
      onChange(patch);
      setPendingSource(null);
      setRecalculating(false);
      toast.success(t.dataSourcePicker.sourceChanged(nextLabel));
    }, 180);
  };

  const dsBadgeLabel = dataSourceLabel(ds);
  const dsBadgeCls = dataSourceBadgeClass(ds);
  const sourceOptions: BlockDataSource[] = [
    "ke30",
    ...(hasBudget ? (["budget"] as BlockDataSource[]) : []),
    ...(hasForecast ? (["forecast"] as BlockDataSource[]) : []),
    ...(hasRolling ? (["rolling"] as BlockDataSource[]) : []),
    ...(block.kind === "chart" ? (["personalizado"] as BlockDataSource[]) : []),
  ];
  const dsDesc = ds === "personalizado"
    ? dataSourceDescription(ds)
    : ds === "forecast"
    ? t.dataSourcePicker.descriptions.forecast
    : ds === "ke30"
    ? t.dataSourcePicker.descriptions.ke30
    : ds === "budget"
      ? t.dataSourcePicker.descriptions.budget
      : t.dataSourcePicker.descriptions.budgetReal;

  return (
    <div className="space-y-2">
      {showPicker && (
        <div className="relative rounded-md border border-border/60 bg-secondary/30 p-2">
          {recalculating && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-background/70 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-xs font-medium text-primary">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t.dataSourcePicker.recalculating}
              </div>
            </div>
          )}
          <div className="mb-1.5 flex items-center justify-between">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-foreground">
              {tc.dataSource}
            </Label>
            <Badge variant="secondary" className={cn("text-[9px]", dsBadgeCls)}>
              {dsBadgeLabel}
            </Badge>
          </div>
          {sourceOptions.length > 1 ? (
            <div className={cn("grid gap-1", sourceOptions.length >= 3 ? "grid-cols-3" : "grid-cols-2")}>
              {sourceOptions.map((opt) => (
                <button key={opt} type="button" onClick={() => applySwitch(opt)}
                  className={cn("rounded px-2 py-1 text-[11px] font-medium transition-colors",
                    ds === opt ? dataSourceActiveClass(opt) : "bg-card hover:bg-secondary text-muted-foreground",
                  )}>{dataSourceLabel(opt)}</button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-1">
              <button type="button" onClick={() => applySwitch("ke30")}
                className={cn("rounded px-2 py-1 text-[11px] font-medium transition-colors",
                  "bg-blue-500/20 text-blue-700 dark:text-blue-200",
                )}>KE30</button>
              <p className="mt-1 text-[9px] text-muted-foreground italic">
                {t.dataSourcePicker.onlyKe30Hint}
              </p>
            </div>
          )}
          <p className="mt-1 text-[9px] leading-snug text-muted-foreground">{dsDesc}</p>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid h-8 w-full grid-cols-2">
          <TabsTrigger value="design" className="text-[11px]">{t.dataSourcePicker.design}</TabsTrigger>
          <TabsTrigger value="filters" className="text-[11px]">{t.dataSourcePicker.filters}</TabsTrigger>
        </TabsList>
        <TabsContent value="design" className="mt-2 space-y-2">
          <div data-style-panel-target="true">{design}</div>
        </TabsContent>
        <TabsContent value="filters" className="mt-2">
          <BlockFilters filters={filters} onChange={onFiltersChange} dataSource={ds} />
        </TabsContent>
      </Tabs>

      <Dialog open={!!pendingSource} onOpenChange={(v) => !v && setPendingSource(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.dataSourcePicker.switchSourceTitle}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t.dataSourcePicker.switchSourceBody}
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingSource(null)}>{t.dataSourcePicker.cancel}</Button>
            <Button onClick={confirmSwitch}>{t.dataSourcePicker.switchTo(dataSourceLabel(pendingSource ?? "ke30"))}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  normalize,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  normalize?: (v: string) => string;
}) {
  return (
    <div>
      <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
      <DraftInput
        className="h-7 text-xs"
        value={value}
        normalize={normalize}
        onCommit={onChange}
      />
    </div>
  );
}
function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
      <DraftNumberInput
        className="h-7 text-xs"
        value={value}
        fallback={0}
        onCommit={(next) => onChange(next ?? 0)}
      />
    </div>
  );
}

const CHECKER_BG: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg, rgba(0,0,0,0.08) 25%, transparent 25%)," +
    "linear-gradient(-45deg, rgba(0,0,0,0.08) 25%, transparent 25%)," +
    "linear-gradient(45deg, transparent 75%, rgba(0,0,0,0.08) 75%)," +
    "linear-gradient(-45deg, transparent 75%, rgba(0,0,0,0.08) 75%)",
  backgroundSize: "8px 8px",
  backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0",
  backgroundColor: SLIDE_HEX.white,
};

/** Background color picker with "Sem fundo" toggle. value: hex sem '#' OR "transparent". */
export function BgField({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  const isT = value === "transparent";
  const v = isT ? "" : (value || "").replace("#", "");
  return (
    <div>
      <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
      <label className="mt-1 mb-1 flex cursor-pointer items-center justify-between text-[10px] text-muted-foreground">
        <span>{t.bgField.noFill}</span>
        <Switch checked={isT} className="scale-75"
          onCheckedChange={(c) => onChange(c ? "transparent" : "FFFFFF")} />
      </label>
      <div className="flex items-center gap-1">
        <input type="color" disabled={isT} value={`#${v || "FFFFFF"}`}
          onChange={(e) => onChange(e.target.value.replace("#", ""))}
          className="h-7 w-7 cursor-pointer rounded border border-border bg-transparent disabled:cursor-not-allowed"
          style={isT ? CHECKER_BG : undefined} />
        <DraftInput
          className="h-7 text-xs font-mono"
          value={v}
          disabled={isT}
          normalize={(next) => next.replace("#", "").toUpperCase()}
          onCommit={onChange}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI inspector — Manual ou Dinâmico
// ---------------------------------------------------------------------------
function KpiInspector({ block, onChange }: {
  block: KpiBlock;
  onChange: (p: Partial<CustomBlock>) => void;
}) {
  const months = useMonthsInfo();
  const fyList = useFyList();
  const periodMode = block.periodMode ?? "all";
  const periodSelectionMode = block.periodSelectionMode ?? "fixed";
  const periodOpts = periodMode === "fy"
    ? fyList.map((f) => ({ value: f, label: f }))
    : periodMode === "month"
      ? months.map((m) => ({ value: m.periodo, label: m.label }))
      : [];

  return (
    <div className="space-y-2">
      <Field label={t.kpi.label} value={block.label}
        onChange={(v) => onChange({ label: v } as never)} />

      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">{t.kpi.valueSource}</Label>
        <Select value={block.source}
          onValueChange={(v) => onChange({ source: v as "manual"|"dynamic" } as never)}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="dynamic">{t.kpi.dynamic}</SelectItem>
            <SelectItem value="manual">{t.kpi.manual}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {block.source === "manual" ? (
        <Field label={t.kpi.value} value={block.manualValue ?? ""}
          onChange={(v) => onChange({ manualValue: v } as never)} />
      ) : (
        <>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">{t.kpi.measure}</Label>
            <Select value={block.measure ?? "rol"}
              onValueChange={(v) => onChange({ measure: v as never } as never)}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {KPI_MEASURES.map((m) => {
                  const unavailable = unavailableMeasuresForSource(block.dataSource);
                  const hint = unavailableHintForSource(block.dataSource);
                  const disabled = unavailable.includes(m.id);
                  return (
                    <SelectItem key={m.id} value={m.id} disabled={disabled}
                      title={disabled ? hint : undefined}>
                      {m.label}{disabled ? ` ${t.table.unavailableSuffix}` : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {unavailableMeasuresForSource(block.dataSource).includes(block.measure ?? "rol") && (
              <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                {unavailableHintForSource(block.dataSource)}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">{tc.period}</Label>
              <Select value={periodMode}
                onValueChange={(v) => {
                  const nextMode = v as "all" | "month" | "fy";
                  onChange({
                    periodMode: nextMode as never,
                    periodValue: null,
                    periodSelectionMode: nextMode === "all" ? "fixed" : (block.periodSelectionMode ?? "relative"),
                    relativePeriod: nextMode === "all" ? undefined : defaultRelativePresetForMode(nextMode),
                  } as never);
                }}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{tc.all}</SelectItem>
                  <SelectItem value="month">{tc.month}</SelectItem>
                  <SelectItem value="fy">{tc.fiscalYear}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {periodMode !== "all" && (
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <Label className="text-[10px] uppercase text-muted-foreground">{tc.value}</Label>
                  <PeriodModeBadge mode={periodSelectionMode} />
                </div>
                {periodSelectionMode === "relative" ? (
                  <RelativePresetSelect
                    mode={periodMode}
                    value={block.relativePeriod}
                    onChange={(v) => onChange({ relativePeriod: v, periodValue: null } as never)}
                  />
                ) : (
                  <Select value={block.periodValue ?? ""}
                    onValueChange={(v) => onChange({ periodValue: v } as never)}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="..." /></SelectTrigger>
                    <SelectContent>
                      {periodOpts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </div>
          {periodMode !== "all" && (
            <div className="grid grid-cols-2 gap-1">
              {(["relative", "fixed"] as const).map((mode) => (
                <Button
                  key={mode}
                  type="button"
                  size="sm"
                  variant={periodSelectionMode === mode ? "default" : "outline"}
                  className="h-7 text-[11px]"
                  onClick={() => onChange({
                    periodSelectionMode: mode,
                    periodValue: mode === "relative" ? null : block.periodValue,
                    relativePeriod: mode === "relative"
                      ? block.relativePeriod ?? defaultRelativePresetForMode(periodMode)
                      : block.relativePeriod,
                  } as never)}
                >
                  {mode === "relative" ? tc.relative : tc.fixed}
                </Button>
              ))}
            </div>
          )}
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">{t.kpi.format}</Label>
            <Select value={block.format ?? "auto"}
              onValueChange={(v) => onChange({ format: v as never } as never)}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t.kpi.formatOptions.auto}</SelectItem>
                <SelectItem value="currency">{t.kpi.formatOptions.currency}</SelectItem>
                <SelectItem value="percent">{t.kpi.formatOptions.percent}</SelectItem>
                <SelectItem value="tons">{t.kpi.formatOptions.tons}</SelectItem>
                <SelectItem value="number">{t.kpi.formatOptions.number}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      <Separator />
      <div className="grid grid-cols-2 gap-2">
        <NumField label={t.kpi.valueSize} value={block.valueSize}
          onChange={(v) => onChange({ valueSize: v } as never)} />
        <Field label={t.kpi.colorHex} value={block.color}
          normalize={(v) => v.replace("#", "").toUpperCase()}
          onChange={(v) => onChange({ color: v } as never)} />
      </div>
      <BgField label={t.kpi.cardBg}
        value={block.cardBg ?? "F8FAFC"}
        onChange={(v) => onChange({ cardBg: v } as never)} />
      <Separator />
      <div className="flex items-center justify-between">
        <Label className="text-[10px] uppercase text-muted-foreground">
          {t.kpi.reactToFilters}
        </Label>
        <Switch
          checked={block.participatesInCrossFilter !== false}
          onCheckedChange={(v) => onChange({ participatesInCrossFilter: v } as never)}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function ComparePeriodField({
  label,
  mode,
  fixedValue,
  selectionMode,
  relativeValue,
  options,
  onChange,
}: {
  label: string;
  mode: "month" | "fy";
  fixedValue: string | null;
  selectionMode?: PeriodSelectionMode;
  relativeValue?: RelativePeriodPreset;
  options: { value: string; label: string }[];
  onChange: (patch: {
    value?: string | null;
    selectionMode?: PeriodSelectionMode;
    relativePeriod?: RelativePeriodPreset;
  }) => void;
}) {
  const activeMode = selectionMode ?? "fixed";
  const defaultPreset = label === tc.base && mode === "month"
    ? DEFAULT_BASE_RELATIVE_MONTH_PRESET
    : defaultRelativePresetForMode(mode);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
        <PeriodModeBadge mode={activeMode} />
      </div>
      <div className="grid grid-cols-2 gap-1">
        {(["relative", "fixed"] as const).map((m) => (
          <Button
            key={m}
            type="button"
            size="sm"
            variant={activeMode === m ? "default" : "outline"}
            className="h-7 text-[11px]"
            onClick={() => onChange({
              selectionMode: m,
              value: m === "relative" ? null : fixedValue,
              relativePeriod: m === "relative" ? relativeValue ?? defaultPreset : relativeValue,
            })}
          >
            {m === "relative" ? tc.relative : tc.fixed}
          </Button>
        ))}
      </div>
      {activeMode === "relative" ? (
        <RelativePresetSelect
          mode={mode}
          value={relativeValue ?? defaultPreset}
          onChange={(v) => onChange({ relativePeriod: v, value: null })}
        />
      ) : (
        <Select value={fixedValue ?? ""} onValueChange={(v) => onChange({ value: v })}>
          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="..." /></SelectTrigger>
          <SelectContent>
            {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function BridgeBlockEditor({ block, onChange }: {
  block: Extract<CustomBlock, { kind: "bridge" }>;
  onChange: (p: Partial<CustomBlock>) => void;
}) {
  const months = useMonthsInfo();
  const fyList = useFyList();
  const opts = block.mode === "fy"
    ? fyList.map((f) => ({ value: f, label: f }))
    : months.map((m) => ({ value: m.periodo, label: m.label }));
  return (
    <div className="space-y-2">
      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">{tc.mode}</Label>
        <Select value={block.mode}
          onValueChange={(v) => {
            const nextMode = v as "fy" | "month";
            onChange({
              mode: nextMode,
              base: null,
              comp: null,
              baseSelectionMode: block.baseSelectionMode ?? "relative",
              baseRelativePeriod: nextMode === "fy" ? "latest_fy_minus_2" : "latest_month_minus_2",
              compSelectionMode: block.compSelectionMode ?? "relative",
              compRelativePeriod: nextMode === "fy" ? "latest_fy_minus_1" : "latest_month_minus_1",
            } as never);
          }}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="month">{t.bridge.modeOptions.month}</SelectItem>
            <SelectItem value="fy">{t.bridge.modeOptions.fy}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ComparePeriodField
          label={tc.base}
          mode={block.mode}
          fixedValue={block.base}
          selectionMode={block.baseSelectionMode}
          relativeValue={block.baseRelativePeriod}
          options={opts}
          onChange={(p) => onChange({
            base: p.value,
            baseSelectionMode: p.selectionMode,
            baseRelativePeriod: p.relativePeriod,
          } as never)}
        />
        <ComparePeriodField
          label={tc.comparison}
          mode={block.mode}
          fixedValue={block.comp}
          selectionMode={block.compSelectionMode}
          relativeValue={block.compRelativePeriod}
          options={opts}
          onChange={(p) => onChange({
            comp: p.value,
            compSelectionMode: p.selectionMode,
            compRelativePeriod: p.relativePeriod,
          } as never)}
        />
      </div>
    </div>
  );
}

function tableEditorDimValue(row: PricingRow, dim: string): string {
  const value = (row as unknown as Record<string, unknown>)[dim];
  if (value == null || value === "") return "—";
  return String(value);
}

function applyTableEditorDimensionFilters(rows: PricingRow[], filters: Filters | undefined): PricingRow[] {
  const activeFilters = Object.entries(filters ?? {}).filter(([, allowed]) => allowed && allowed.length > 0);
  if (activeFilters.length === 0) return rows;
  return rows.filter((row) => activeFilters.every(([dim, allowed]) => allowed!.includes(tableEditorDimValue(row, dim))));
}

function TableBlockEditor({ block, onChange }: {
  block: Extract<CustomBlock, { kind: "table" }>;
  onChange: (p: Partial<CustomBlock>) => void;
}) {
  const dims = CUSTOM_TABLE_DIMS;
  const pricing = usePricing((s) => s.rows);
  const budget = useBudget((s) => s.rows);
  const forecast = useForecast((s) => s.rows);
  const rolling = useRolling((s) => s.rows);
  const sourceRows = useMemo(() => {
    const ds = block.dataSource ?? "ke30";
    if (ds === "budget") return budgetRowsAsPricingFiltered(budget, "budget");
    if (ds === "budget_real") return budgetRowsAsPricingFiltered(budget, "real");
    if (ds === "forecast") return forecastRowsAsPricingLatest(forecast);
    if (ds === "rolling") return rollingRowsAsPricing(rolling);
    return pricing;
  }, [block.dataSource, pricing, budget, forecast, rolling]);
  const periodOptions = useMemo(() => (
    Array.from(new Map(sourceRows.map((row) => [row.periodo, row])).values())
      .filter((row) => row.periodo && row.mes && row.ano)
      .sort((a, b) => a.ano - b.ano || a.mes - b.mes)
      .map((row) => ({ value: row.periodo, label: `${String(row.mes).padStart(2, "0")}/${row.ano}` }))
  ), [sourceRows]);
  const monthFilterMode: "all" | PeriodSelectionMode = block.monthFilter
    ? block.monthFilter.mode
    : "all";
  const patchMonthFilterMode = (mode: "all" | PeriodSelectionMode) => {
    if (mode === "all") {
      onChange({ monthFilter: null } as never);
      return;
    }
    const current = block.monthFilter;
    const next: MonthRangeSelection = mode === "relative"
      ? {
          mode: "relative",
          relativeRange: current?.relativeRange ?? DEFAULT_RELATIVE_MONTH_RANGE_PRESET,
        }
      : {
          mode: "fixed",
          periods: current?.periods ?? [],
          relativeRange: current?.relativeRange,
        };
    onChange({ monthFilter: next } as never);
  };
  const patchRelativeMonthRange = (relativeRange: RelativeMonthRangePreset) => {
    onChange({ monthFilter: { mode: "relative", relativeRange } } as never);
  };
  const patchManualMonthSelection = (periods: string[]) => {
    onChange({ monthFilter: { mode: "fixed", periods: periods.length ? periods : null } } as never);
  };
  const tablePreview = useMemo(() => {
    const measures = CUSTOM_TABLE_MEASURES.filter((m) => block.measures.includes(m.id));
    if (!measures.length) return { totalRows: 0, rowHeaders: [] as { key: string; label: string }[] };
    const dimensionFilteredRows = applyTableEditorDimensionFilters(sourceRows, block.filters);
    const resolvedMonths = resolveMonthRangeSelection(dimensionFilteredRows, block.monthFilter);
    const monthSet = resolvedMonths?.length ? new Set(resolvedMonths) : null;
    const tableRows = monthSet
      ? dimensionFilteredRows.filter((row) => monthSet.has(row.periodo))
      : dimensionFilteredRows;
    const unified = buildUnifiedRows(tableRows, [], "real");
    const cfg: PivotConfig = {
      rows: block.rowDims, cols: block.colDim ? [block.colDim] : [],
      values: measures,
      filters: {},
    };
    const result = computePivot(unified as unknown as Record<string, unknown>[], cfg);
    return {
      totalRows: result.leafRowHeaders.length,
      rowHeaders: result.leafRowHeaders.map((row) => ({
        key: row.key,
        label: row.values.join(" / ") || "Total",
      })),
    };
  }, [sourceRows, block.rowDims, block.colDim, block.measures, block.filters, block.monthFilter]);
  const totalRows = tablePreview.totalRows;
  const fit = resolveTableFit(block, totalRows);
  const toggleMeasure = (id: string) => {
    const next = block.measures.includes(id)
      ? block.measures.filter((m) => m !== id)
      : [...block.measures, id];
    onChange({ measures: next } as never);
  };
  const toggleRowDim = (id: string) => {
    const next = block.rowDims.includes(id)
      ? block.rowDims.filter((d) => d !== id)
      : [...block.rowDims, id];
    onChange({ rowDims: next } as never);
  };
  const selectedMeasures = CUSTOM_TABLE_MEASURES.filter((m) => block.measures.includes(m.id));
  const gapColumns = block.gapColumns ?? [];
  const addGapColumn = () => {
    const measureId = selectedMeasures[0]?.id ?? block.measures[0] ?? CUSTOM_TABLE_MEASURES[0]?.id;
    if (!measureId) return;
    const gap: TableGapColumn = {
      id: `gap_${newId()}`,
      measureId,
      comparisonMode: "prev-month",
      benchMeasureId: measureId,
    };
    onChange({ gapColumns: [...gapColumns, gap] } as never);
  };
  const patchGapColumn = (id: string, patch: Partial<TableGapColumn>) => {
    const next = gapColumns.map((gap) => gap.id === id ? { ...gap, ...patch } : gap);
    onChange({ gapColumns: next } as never);
  };
  const removeGapColumn = (id: string) => {
    const next = gapColumns.filter((gap) => gap.id !== id);
    onChange({
      gapColumns: next,
      sortGapColumnId: block.sortGapColumnId === id ? next[0]?.id : block.sortGapColumnId,
      sortMode: block.sortMode === "gap" && next.length === 0 ? "kpi" : block.sortMode,
    } as never);
  };

  // Quando o usuário liga "Outros" e a tabela está truncada,
  // crescemos a altura para garantir que a linha apareça no canvas.
  const handleShowOthers = (v: boolean) => {
    const patch: Partial<typeof block> = { showOthers: v };
    if (v && fit.truncated) {
      const extraRows = 1; // linha "Outros"
      const needed = tableHeightWithExtraRows(block, fit.shown, extraRows);
      const maxH = CANVAS_H - block.y;
      patch.h = Math.min(maxH, needed);
    }
    onChange(patch as never);
  };
  const manualRowOrder = useMemo(() => {
    const current = block.manualRowOrder ?? [];
    const available = new Set(tablePreview.rowHeaders.map((row) => row.key));
    const kept = current.filter((key) => available.has(key));
    const missing = tablePreview.rowHeaders.map((row) => row.key).filter((key) => !kept.includes(key));
    return [...kept, ...missing];
  }, [block.manualRowOrder, tablePreview.rowHeaders]);
  const rowLabelByKey = useMemo(
    () => new Map(tablePreview.rowHeaders.map((row) => [row.key, row.label])),
    [tablePreview.rowHeaders],
  );
  const handleManualRowDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = manualRowOrder.indexOf(String(active.id));
    const newIndex = manualRowOrder.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onChange({ manualRowOrder: arrayMove(manualRowOrder, oldIndex, newIndex) } as never);
  };

  return (
    <div className="space-y-3">
      <TruncationAlert blockId={block.id} fit={fit} unitPlural="linhas" />

      <Section title={t.table.titleSection} defaultOpen>
        <Row label={t.table.titleText}>
          <DraftInput
            value={block.title ?? ""}
            onCommit={(value) => onChange({ title: value } as never)}
            placeholder={t.table.titlePlaceholder}
            className="h-7 text-xs"
          />
        </Row>
        <Row label={t.table.titleSizeLabel}>
          <NumberStepper
            value={block.titleSize ?? 18}
            min={10}
            max={48}
            onChange={(v) => onChange({ titleSize: v } as never)}
            suffix="px"
          />
        </Row>
        <Row label={t.table.titleColorLabel}>
          <ColorField
            value={`#${block.titleColor ?? "1C2430"}`}
            onChange={(c) => onChange({ titleColor: c.replace("#", "") } as never)}
          />
        </Row>
      </Section>

      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">{t.table.rowDims}</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 w-full justify-start text-xs">
              {block.rowDims.length ? block.rowDims.map((d) => dims.find((x) => x.id === d)?.label).join(", ") : tc.select}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="max-h-72 w-64 overflow-auto p-2" align="start">
            {dims.map((d) => (
              <button key={d.id as string}
                onClick={() => toggleRowDim(d.id as string)}
                className={cn(
                  "flex w-full items-center justify-between rounded px-2 py-1 text-xs outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary/60",
                  block.rowDims.includes(d.id as string) && "bg-primary/10 text-primary",
                )}
              >
                <span>{d.label}</span>
                <span className="text-[9px] text-muted-foreground">{d.group}</span>
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">{t.table.colDim}</Label>
        <Select value={block.colDim ?? "__none__"}
          onValueChange={(v) => onChange({ colDim: v === "__none__" ? null : v } as never)}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">{t.table.noColumn}</SelectItem>
            {dims.map((d) => <SelectItem key={d.id as string} value={d.id as string}>{d.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Section title={t.table.periodsSection}>
        <div className="space-y-2">
          <Row label={tc.mode}>
            <Segmented
              value={monthFilterMode}
              onChange={(v) => patchMonthFilterMode(v as "all" | PeriodSelectionMode)}
              options={[
                { value: "all", label: t.table.periodModeOptions.all },
                { value: "relative", label: t.table.periodModeOptions.relative },
                { value: "fixed", label: t.table.periodModeOptions.fixed },
              ]}
            />
          </Row>
          {monthFilterMode === "relative" && (
            <div className="grid grid-cols-3 gap-1">
              {RELATIVE_MONTH_RANGE_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => patchRelativeMonthRange(preset.value)}
                  className={cn(
                    "rounded-md border px-2 py-1.5 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                    (block.monthFilter?.relativeRange ?? DEFAULT_RELATIVE_MONTH_RANGE_PRESET) === preset.value
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border/50 bg-background/50 text-muted-foreground hover:bg-secondary",
                  )}
                >
                  {t.table.monthsSuffix(preset.months)}
                </button>
              ))}
            </div>
          )}
          {monthFilterMode === "fixed" && (
            <MultiSelectFilter
              options={periodOptions}
              selected={block.monthFilter?.periods ?? []}
              onChange={patchManualMonthSelection}
              placeholder={t.table.selectMonths}
            />
          )}
          <p className="text-[10px] leading-snug text-muted-foreground">
            {t.table.relativeHint}
          </p>
        </div>
      </Section>

      <div className="rounded-md border border-border/40 bg-muted/20 p-2">
        <ToggleRow
          label={t.table.lastColumnVariation}
          value={!!block.showLastColumnVariation}
          onChange={(v) => onChange({ showLastColumnVariation: v } as never)}
        />
        <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
          {t.table.lastColumnVariationHint}
        </p>
      </div>

      <Section title={t.table.wrapTextSection}>
        <div className="space-y-2">
          <ToggleRow
            label={t.table.wrapRows}
            value={!!block.wrapRowText}
            onChange={(v) => onChange({ wrapRowText: v } as never)}
          />
          <ToggleRow
            label={t.table.wrapColumns}
            value={!!block.wrapColumnText}
            onChange={(v) => onChange({ wrapColumnText: v } as never)}
          />
          <p className="text-[10px] leading-snug text-muted-foreground">
            {t.table.wrapHint}
          </p>
        </div>
      </Section>

      <Section title={t.table.gapColumnsSection}>
        <div className="space-y-2">
          {gapColumns.length === 0 ? (
            <p className="text-[10px] leading-snug text-muted-foreground">
              {t.table.gapColumnsEmpty}
            </p>
          ) : gapColumns.map((gap, index) => {
            const mode = gap.comparisonMode;
            return (
              <div key={gap.id} className="space-y-2 rounded-md border border-border/50 bg-background/40 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold">{t.table.gapLabel(index + 1)}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeGapColumn(gap.id)}
                    title={t.table.removeGapColumn}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Row label={t.table.kpi}>
                  <Select value={gap.measureId} onValueChange={(v) => patchGapColumn(gap.id, {
                    measureId: v,
                    benchMeasureId: gap.benchMeasureId ?? v,
                  })}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {selectedMeasures.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Row>
                <Row label={t.table.reference}>
                  <Select value={mode} onValueChange={(v) => patchGapColumn(gap.id, { comparisonMode: v as TableGapComparisonMode })}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="prev-month">{t.table.referenceOptions.prevMonth}</SelectItem>
                      <SelectItem value="bench">{t.table.referenceOptions.bench}</SelectItem>
                      <SelectItem value="prev-year-month">{t.table.referenceOptions.prevYearMonth}</SelectItem>
                      <SelectItem value="manual">{t.table.referenceOptions.manual}</SelectItem>
                    </SelectContent>
                  </Select>
                </Row>
                {mode === "bench" && selectedMeasures.length > 1 && (
                  <Row label={t.table.benchBy}>
                    <Select value={gap.benchMeasureId ?? gap.measureId} onValueChange={(v) => patchGapColumn(gap.id, { benchMeasureId: v })}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {selectedMeasures.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Row>
                )}
                {mode === "manual" && (
                  <Row label={t.table.baseMonth}>
                    <Select value={gap.manualPeriod ?? periodOptions[0]?.value ?? ""} onValueChange={(v) => patchGapColumn(gap.id, { manualPeriod: v })}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder={t.table.selectPlaceholder} /></SelectTrigger>
                      <SelectContent>
                        {periodOptions.map((period) => <SelectItem key={period.value} value={period.value}>{period.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Row>
                )}
              </div>
            );
          })}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 w-full justify-center gap-1 text-xs"
            onClick={addGapColumn}
            disabled={selectedMeasures.length === 0}
          >
            <Plus className="h-3.5 w-3.5" />
            {t.table.addGap}
          </Button>
        </div>
      </Section>

      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">{t.table.measures}</Label>
        <div className="space-y-1">
          {CUSTOM_TABLE_MEASURES.map((m) => {
            const unavailable = unavailableMeasuresForSource(block.dataSource);
            const hint = unavailableHintForSource(block.dataSource);
            const disabled = unavailable.includes(m.id);
            return (
              <button key={m.id}
                onClick={() => { if (!disabled) toggleMeasure(m.id); }}
                disabled={disabled}
                title={disabled ? hint : undefined}
                className={cn(
                  "flex w-full items-center justify-between rounded px-2 py-1 text-xs outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary/60",
                  block.measures.includes(m.id) && "bg-primary/10 text-primary",
                  disabled && "cursor-not-allowed opacity-40 hover:bg-transparent",
                )}
              >
                <span>{m.label}{disabled ? t.table.unavailableSuffix : ""}</span>
                {block.measures.includes(m.id) && !disabled && <span className="text-[9px]">✓</span>}
              </button>
            );
          })}
        </div>
        {block.measures.some((m) => unavailableMeasuresForSource(block.dataSource).includes(m)) && (
          <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
            {unavailableHintForSource(block.dataSource)}
          </p>
        )}
      </div>

      {block.measures.length > 0 && (
        <Section title={t.table.sortSection} defaultOpen>
          <Row label={tc.mode}>
            <Segmented
              value={block.sortMode ?? "kpi"}
              onChange={(v) => onChange({ sortMode: v as TableBlock["sortMode"] } as never)}
              options={[
                { value: "kpi", label: t.table.sortModeOptions.kpi },
                { value: "gap", label: t.table.sortModeOptions.gap },
                { value: "az", label: t.table.sortModeOptions.az },
                { value: "za", label: t.table.sortModeOptions.za },
                { value: "manual", label: t.table.sortModeOptions.manual },
              ]}
            />
          </Row>

          {(block.sortMode ?? "kpi") === "kpi" && (
            <>
              <Row label={t.table.kpi}>
                <Select value={block.sortMeasure ?? block.measures[0]}
                  onValueChange={(v) => onChange({ sortMeasure: v } as never)}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CUSTOM_TABLE_MEASURES.filter((m) => block.measures.includes(m.id))
                      .map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Row>
              <Row label={t.table.direction}>
                <Segmented
                  value={block.sortDirection ?? "desc"}
                  onChange={(v) => onChange({ sortDirection: v as TableBlock["sortDirection"] } as never)}
                  options={[
                    { value: "desc", label: t.table.directionOptions.desc },
                    { value: "asc", label: t.table.directionOptions.asc },
                  ]}
                />
              </Row>
            </>
          )}

          {(block.sortMode ?? "kpi") === "gap" && (
            <>
              <Row label={t.table.column}>
                <Select value={block.sortGapColumnId ?? gapColumns[0]?.id ?? "__none__"}
                  onValueChange={(v) => onChange({ sortGapColumnId: v } as never)}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {gapColumns.length === 0 && <SelectItem value="__none__">{t.table.noGapConfigured}</SelectItem>}
                    {gapColumns.map((gap, index) => {
                      const measure = selectedMeasures.find((m) => m.id === gap.measureId);
                      const modeLabel = gap.comparisonMode === "prev-month"
                        ? t.table.referenceOptions.prevMonth
                        : gap.comparisonMode === "prev-year-month"
                        ? t.table.referenceOptions.prevYearMonth
                        : gap.comparisonMode === "bench"
                        ? t.table.referenceOptions.bench
                        : t.table.referenceOptions.manual;
                      return (
                        <SelectItem key={gap.id} value={gap.id}>
                          {t.table.gapVs(measure?.label ?? t.table.gapLabel(index + 1), modeLabel)}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </Row>
              <Row label={t.table.direction}>
                <Segmented
                  value={block.sortDirection ?? "desc"}
                  onChange={(v) => onChange({ sortDirection: v as TableBlock["sortDirection"] } as never)}
                  options={[
                    { value: "desc", label: t.table.directionOptions.desc },
                    { value: "asc", label: t.table.directionOptions.asc },
                  ]}
                />
              </Row>
              {gapColumns.length === 0 && (
                <p className="text-[10px] leading-snug text-muted-foreground">
                  {t.table.noGapToSort}
                </p>
              )}
            </>
          )}

          {(block.sortMode ?? "kpi") === "manual" && (
            <div className="space-y-2">
              <p className="text-[10px] leading-snug text-muted-foreground">
                {t.table.manualOrderHint}
              </p>
              <DndContext collisionDetection={closestCenter} onDragEnd={handleManualRowDragEnd}>
                <SortableContext items={manualRowOrder} strategy={verticalListSortingStrategy}>
                  <div className="max-h-48 space-y-1 overflow-auto rounded-md border border-border/50 bg-background/40 p-1">
                    {manualRowOrder.length === 0 ? (
                      <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                        {t.table.manualOrderEmpty}
                      </div>
                    ) : manualRowOrder.map((key) => (
                      <SortableManualTableRow key={key} id={key} label={rowLabelByKey.get(key) ?? key} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          )}
        </Section>
      )}

      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">{t.table.valueAlign}</Label>
        <div className="mt-1 flex gap-1">
          {(["left", "center", "right"] as const).map((a) => (
            <Button
              key={a}
              size="sm"
              variant={(block.valueAlign ?? "right") === a ? "default" : "outline"}
              className="h-6 flex-1 text-[10px]"
              onClick={() => onChange({ valueAlign: a } as never)}
            >
              {a === "left" ? "?" : a === "center" ? "?" : "?"}
            </Button>
          ))}
        </div>
      </div>

      {block.measures.length > 0 && (
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">{t.table.conditionalFormat}</Label>
          {CUSTOM_TABLE_MEASURES.filter((m) => block.measures.includes(m.id)).map((m) => {
            const rule = block.conditionalFormats?.[m.id] ?? { mode: "none" as ConditionalFormatMode };
            const setRule = (patch: Partial<ConditionalFormatRule>) =>
              onChange({
                conditionalFormats: {
                  ...block.conditionalFormats,
                  [m.id]: { ...rule, ...patch },
                },
              } as never);
            return (
              <div key={m.id} className="mt-1.5 space-y-1.5 rounded border border-border/30 p-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium">{m.label}</span>
                  <Select value={rule.mode} onValueChange={(v) => setRule({ mode: v as ConditionalFormatMode })}>
                    <SelectTrigger className="h-6 w-28 text-[10px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t.table.conditionalModeOptions.none}</SelectItem>
                      <SelectItem value="heatmap">{t.table.conditionalModeOptions.heatmap}</SelectItem>
                      <SelectItem value="above_avg">{t.table.conditionalModeOptions.aboveAvg}</SelectItem>
                      <SelectItem value="data_bar">{t.table.conditionalModeOptions.dataBar}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {rule.mode === "heatmap" && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="w-8 text-[10px] text-muted-foreground">{t.table.heatmapMin}</span>
                      <input type="color" value={`#${rule.colorMin ?? "F8696B"}`}
                        onChange={(e) => setRule({ colorMin: e.target.value.slice(1) })}
                        className="h-5 w-8 cursor-pointer rounded border-0 p-0" />
                      <span className="w-8 text-[10px] text-muted-foreground">{t.table.heatmapMid}</span>
                      <input type="color" value={`#${rule.colorMid ?? "FFEB84"}`}
                        onChange={(e) => setRule({ colorMid: e.target.value.slice(1) })}
                        className="h-5 w-8 cursor-pointer rounded border-0 p-0" />
                      <span className="w-8 text-[10px] text-muted-foreground">{t.table.heatmapMax}</span>
                      <input type="color" value={`#${rule.colorMax ?? "63BE7B"}`}
                        onChange={(e) => setRule({ colorMax: e.target.value.slice(1) })}
                        className="h-5 w-8 cursor-pointer rounded border-0 p-0" />
                    </div>
                    <Select value={rule.scope ?? "table"}
                      onValueChange={(v) => setRule({ scope: v as "table" | "column" | "row" })}>
                      <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="table">{t.table.heatmapScopeOptions.table}</SelectItem>
                        <SelectItem value="column">{t.table.heatmapScopeOptions.column}</SelectItem>
                        <SelectItem value="row">{t.table.heatmapScopeOptions.row}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Separator />
      <div className="space-y-1.5">
        <Row label={t.table.rowHeight}>
          <Segmented
            value={block.autoFit === false ? "manual" : "auto"}
            onChange={(v) => {
              if (v === "manual") {
                onChange({ autoFit: false, maxRows: block.maxRows ?? fit.shown } as never);
              } else {
                onChange({ autoFit: true } as never);
              }
            }}
            options={[
              { value: "auto", label: t.table.rowHeightOptions.auto },
              { value: "manual", label: t.table.rowHeightOptions.manual },
            ]}
          />
        </Row>
        <NumField
          label={block.autoFit === false ? t.table.rowsVisible : t.table.rowsVisibleFixed}
          value={block.maxRows ?? fit.shown}
          onChange={(v) => onChange({ autoFit: false, maxRows: Math.max(1, v) } as never)}
        />
        <p className="text-[10px] leading-snug text-muted-foreground">
          {t.table.manualHint}
        </p>
        <ToggleRow label={t.table.showOthersRow} value={!!block.showOthers}
          onChange={handleShowOthers} />
        <ToggleRow label={t.table.exportNote} value={!!block.exportNote}
          onChange={(v) => onChange({ exportNote: v } as never)} />
        <p className="text-[10px] text-muted-foreground">
          {t.table.showingOf(fit.shown, fit.total)}
        </p>
      </div>
    </div>
  );
}

function SortableManualTableRow({ id, label }: { id: string; label: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: DndCSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded border border-border/40 bg-card px-2 py-1.5 text-xs shadow-sm",
        isDragging && "z-10 opacity-80 shadow-md",
      )}
    >
      <button
        type="button"
        className="flex h-5 w-5 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-secondary active:cursor-grabbing"
        aria-label={t.table.reorderRow(label)}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <span className="min-w-0 flex-1 truncate" title={label}>{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
function ChartBlockEditor({ block, onChange }: {
  block: ChartBlock; onChange: (p: Partial<CustomBlock>) => void;
}) {
  return <ChartInspector block={block} onChange={onChange as never} />;
}

function TopSkuBlockEditor({ block, onChange }: {
  block: TopSkuBlock;
  onChange: (p: Partial<CustomBlock>) => void;
}) {
  const months = useMonthsInfo();
  const fyList = useFyList();
  const periodSelectionMode = block.periodSelectionMode ?? "fixed";
  const periodOpts = block.periodMode === "fy"
    ? fyList.map((f) => ({ value: f, label: f }))
    : block.periodMode === "month"
      ? months.map((m) => ({ value: m.periodo, label: m.label }))
      : [];
  return (
    <div className="space-y-2">
      <Field label={t.topSku.title} value={block.title ?? ""}
        onChange={(v) => onChange({ title: v } as never)} />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">{t.topSku.rankBy}</Label>
          <Select value={block.dim}
            onValueChange={(v) => onChange({ dim: v as never } as never)}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="skuDesc">{t.topSku.rankByOptions.skuDesc}</SelectItem>
              <SelectItem value="sku">{t.topSku.rankByOptions.sku}</SelectItem>
              <SelectItem value="cliente">{t.topSku.rankByOptions.cliente}</SelectItem>
              <SelectItem value="marca">{t.topSku.rankByOptions.marca}</SelectItem>
              <SelectItem value="categoria">{t.topSku.rankByOptions.categoria}</SelectItem>
              <SelectItem value="canalAjustado">{t.topSku.rankByOptions.canalAjustado}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">{tc.metric}</Label>
          <Select value={block.measure}
            onValueChange={(v) => onChange({ measure: v as never } as never)}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {KPI_MEASURES.map((m) => {
                const unavailable = unavailableMeasuresForSource(block.dataSource);
                const hint = unavailableHintForSource(block.dataSource);
                const disabled = unavailable.includes(m.id);
                return (
                  <SelectItem key={m.id} value={m.id} disabled={disabled}
                    title={disabled ? hint : undefined}>
                    {m.label}{disabled ? t.table.unavailableSuffix : ""}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {unavailableMeasuresForSource(block.dataSource).includes(block.measure) && (
            <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
              {unavailableHintForSource(block.dataSource)}
            </p>
          )}
        </div>
      </div>
      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">{tc.period}</Label>
        <Select value={block.periodMode}
          onValueChange={(v) => {
            const nextMode = v as "all" | "month" | "fy";
            onChange({
              periodMode: nextMode as never,
              periodValue: null,
              periodSelectionMode: nextMode === "all" ? "fixed" : (block.periodSelectionMode ?? "relative"),
              relativePeriod: nextMode === "all" ? undefined : defaultRelativePresetForMode(nextMode),
            } as never);
          }}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.topSku.periodOptions.all}</SelectItem>
            <SelectItem value="month">{t.topSku.periodOptions.month}</SelectItem>
            <SelectItem value="fy">{t.topSku.periodOptions.fy}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {block.periodMode !== "all" && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <Label className="text-[10px] uppercase text-muted-foreground">{t.topSku.periodValue}</Label>
            <PeriodModeBadge mode={periodSelectionMode} />
          </div>
          {periodSelectionMode === "relative" ? (
            <RelativePresetSelect
              mode={block.periodMode}
              value={block.relativePeriod}
              onChange={(v) => onChange({ relativePeriod: v, periodValue: null } as never)}
            />
          ) : (
            <Select value={block.periodValue ?? ""}
              onValueChange={(v) => onChange({ periodValue: v } as never)}>
              <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="..." /></SelectTrigger>
              <SelectContent>
                {periodOpts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      )}
      {block.periodMode !== "all" && (
        <div className="grid grid-cols-2 gap-1">
          {(["relative", "fixed"] as const).map((mode) => (
            <Button
              key={mode}
              type="button"
              size="sm"
              variant={periodSelectionMode === mode ? "default" : "outline"}
              className="h-7 text-[11px]"
              onClick={() => onChange({
                periodSelectionMode: mode,
                periodValue: mode === "relative" ? null : block.periodValue,
                relativePeriod: mode === "relative"
                  ? block.relativePeriod ?? defaultRelativePresetForMode(block.periodMode)
                  : block.relativePeriod,
              } as never)}
            >
              {mode === "relative" ? tc.relative : tc.fixed}
            </Button>
          ))}
        </div>
      )}
      <Row label={t.topSku.itemsShown}>
        <Segmented
          value={block.autoFit === false ? "manual" : "auto"}
          onChange={(v) => onChange({ autoFit: v !== "manual" } as never)}
          options={[
            { value: "auto", label: t.topSku.itemsShownOptions.auto },
            { value: "manual", label: t.topSku.itemsShownOptions.manual },
          ]}
        />
      </Row>
      <NumField label={tc.topN} value={block.topN}
        onChange={(v) => onChange({ autoFit: false, topN: Math.max(1, Math.min(50, v)) } as never)} />
      {block.autoFit !== false && (
        <p className="text-[10px] leading-snug text-muted-foreground">
          {t.topSku.autoHint(block.topN)}
        </p>
      )}
      <ToggleRow label={t.topSku.showShare} value={block.showShare}
        onChange={(v) => onChange({ showShare: v } as never)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// DRE block inspector
// ---------------------------------------------------------------------------
// Shared inspector for TitleBlock + TextBlock
// ---------------------------------------------------------------------------
const FONT_FAMILIES = [
  { value: SLIDE_DEFAULT_FONT_FAMILY, label: SLIDE_DEFAULT_FONT_LABEL },
  { value: "Arial, sans-serif", label: "Arial" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: "Verdana, sans-serif", label: "Verdana" },
  { value: "Tahoma, sans-serif", label: "Tahoma" },
  { value: "Times New Roman, serif", label: "Times New Roman" },
  { value: "'Courier New', monospace", label: "Courier New" },
];

// ---------------------------------------------------------------------------
// Slider + numeric input combo, reused across all inspector sliders
// ---------------------------------------------------------------------------
function SliderWithInput({
  value, min, max, step = 1, unit = "", onChange,
}: {
  value: number; min: number; max: number; step?: number; unit?: string;
  onChange: (v: number) => void;
}) {
  const fmt = (n: number) => String(Math.round(n * 1000) / 1000);
  const [inputVal, setInputVal] = useState(fmt(value));
  useEffect(() => { setInputVal(fmt(value)); }, [value]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <UiSlider
          min={min} max={max} step={step}
          value={[value]}
          onValueChange={([v]) => onChange(v)}
        />
      </div>
      <input
        type="number"
        min={min} max={max} step={step}
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        onBlur={() => {
          const v = parseFloat(inputVal);
          if (!isNaN(v)) {
            const clamped = Math.min(max, Math.max(min, v));
            onChange(clamped);
            setInputVal(fmt(clamped));
          } else {
            setInputVal(fmt(value));
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") { setInputVal(fmt(value)); e.currentTarget.blur(); }
        }}
        style={{
          width: 44, height: 24, flexShrink: 0,
          textAlign: "right", fontSize: 11, padding: "0 4px",
          border: "1px solid hsl(var(--border))", borderRadius: 4,
          background: "hsl(var(--background))", color: "hsl(var(--foreground))",
          outline: "none",
        }}
      />
      {unit && (
        <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", flexShrink: 0, width: 12 }}>
          {unit}
        </span>
      )}
    </div>
  );
}

function TextTitleInspector({ block, onChange }: {
  block: TitleBlock | TextBlock;
  onChange: (patch: Partial<TitleBlock | TextBlock>) => void;
}) {
  const isTitle = block.kind === "title";
  return (
    <div className="space-y-2">
      <Section title={t.textTitle.content} defaultOpen>
        <DraftTextarea
          rows={isTitle ? 2 : 4}
          value={block.text}
          onCommit={(value) => onChange({ text: value })}
          className="text-xs"
        />
      </Section>

      <Section title={t.textTitle.typography} defaultOpen>
        <Row label={t.textTitle.font}>
          <Select value={block.fontFamily ?? SLIDE_DEFAULT_FONT_FAMILY}
            onValueChange={(v) => onChange({ fontFamily: v })}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FONT_FAMILIES.map((f) => (
                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label={t.textTitle.sizePx}>
          <SliderWithInput value={block.size} min={8} max={200} unit="px"
            onChange={(v) => onChange({ size: v })} />
        </Row>
        <Row label={t.textTitle.color}>
          <ColorField value={`#${block.color}`} onChange={(c) => onChange({ color: c.replace("#", "") })} />
        </Row>
        <Row label={t.textTitle.align}>
          <Segmented
            value={block.align}
            onChange={(v) => onChange({ align: v as "left" | "center" | "right" })}
            options={[
              { value: "left", label: t.textTitle.alignOptions.left },
              { value: "center", label: t.textTitle.alignOptions.center },
              { value: "right", label: t.textTitle.alignOptions.right },
            ]}
          />
        </Row>
        {isTitle && (
          <ToggleField label={t.textTitle.bold} value={(block as TitleBlock).bold}
            onChange={(v) => onChange({ bold: v } as Partial<TitleBlock>)} />
        )}
        <ToggleField label={t.textTitle.italic} value={block.italic ?? false}
          onChange={(v) => onChange({ italic: v })} />
        <Row label={t.textTitle.transform}>
          <Segmented
            value={block.textTransform ?? "none"}
            onChange={(v) => onChange({ textTransform: v as TitleBlock["textTransform"] })}
            options={[
              { value: "none", label: t.textTitle.transformOptions.none },
              { value: "uppercase", label: t.textTitle.transformOptions.uppercase },
              { value: "lowercase", label: t.textTitle.transformOptions.lowercase },
              { value: "capitalize", label: t.textTitle.transformOptions.capitalize },
            ]}
          />
        </Row>
        <Row label={t.textTitle.letterSpacing}>
          <SliderWithInput value={block.letterSpacing ?? 0} min={-0.1} max={0.5} step={0.01} unit="em"
            onChange={(v) => onChange({ letterSpacing: v })} />
        </Row>
        <Row label={t.textTitle.lineHeight}>
          <SliderWithInput value={block.lineHeight ?? (isTitle ? 1.1 : 1.3)} min={0.8} max={3} step={0.05} unit="x"
            onChange={(v) => onChange({ lineHeight: v })} />
        </Row>
      </Section>

      <Section title={t.textTitle.rotationSection} defaultOpen={false}>
        <Row label={t.textTitle.rotate}>
          <SliderWithInput value={block.rotation ?? 0} min={-180} max={180} unit="deg"
            onChange={(v) => onChange({ rotation: v })} />
        </Row>
        <Row label="">
          <button className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
            onClick={() => onChange({ rotation: 0 })} title={t.textTitle.resetRotationTitle}>
            {t.textTitle.resetRotation}
          </button>
        </Row>
      </Section>

      <Section title={t.textTitle.appearance} defaultOpen={false}>
        <Row label={t.textTitle.textShadow}>
          <DraftInput className="h-7 text-xs" placeholder="2px 2px 4px #000000"
            value={block.textShadow ?? ""}
            onCommit={(value) => onChange({ textShadow: value })} />
        </Row>
        <Row label={t.textTitle.padding}>
          <SliderWithInput value={block.padding ?? 0} min={0} max={60} unit="px"
            onChange={(v) => onChange({ padding: v })} />
        </Row>
        <Row label={t.textTitle.backgroundHex}>
          <DraftInput className="h-7 text-xs" placeholder="transparent"
            value={block.backgroundColor ?? ""}
            normalize={(value) => value.replace("#", "").toUpperCase()}
            onCommit={(value) => onChange({ backgroundColor: value || undefined })} />
        </Row>
        <Row label={t.textTitle.borderRadius}>
          <SliderWithInput value={block.borderRadius ?? 0} min={0} max={40} unit="px"
            onChange={(v) => onChange({ borderRadius: v })} />
        </Row>
      </Section>

      <Section title={t.textTitle.animation} defaultOpen={false}>
        <Row label={t.textTitle.entrance}>
          <Select
            value={(block as { enterAnimation?: string }).enterAnimation ?? "none"}
            onValueChange={(v) => onChange({ enterAnimation: v } as never)}
          >
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t.textTitle.entranceOptions.none}</SelectItem>
              <SelectItem value="fade">{t.textTitle.entranceOptions.fade}</SelectItem>
              <SelectItem value="slide-up">{t.textTitle.entranceOptions.slideUp}</SelectItem>
              <SelectItem value="pop">{t.textTitle.entranceOptions.pop}</SelectItem>
            </SelectContent>
          </Select>
        </Row>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
function DreSourcePicker({ block, onChange }: {
  block: DreBlock;
  onChange: (patch: Partial<DreBlock>) => void;
}) {
  const hasBudget = useBudget((s) => s.rows.length > 0);
  const hasForecast = useForecast((s) => s.rows.length > 0);
  const hasRolling = useRolling((s) => s.rows.length > 0);
  const ds = block.dataSource ?? "ke30";
  const dsBadgeLabel = dataSourceLabel(ds);
  const dsBadgeCls = dataSourceBadgeClass(ds);
  const sourceOptions: BlockDataSource[] = [
    "ke30",
    ...(hasBudget ? (["budget"] as BlockDataSource[]) : []),
    ...(hasForecast ? (["forecast"] as BlockDataSource[]) : []),
    ...(hasRolling ? (["rolling"] as BlockDataSource[]) : []),
  ];
  if (sourceOptions.length <= 1) return null;
  return (
    <div className="rounded-md border border-border/60 bg-secondary/30 p-2">
      <div className="mb-1.5 flex items-center justify-between">
        <Label className="text-[10px] font-semibold uppercase tracking-wider text-foreground">
          {tc.dataSource}
        </Label>
        <Badge variant="secondary" className={cn("text-[9px]", dsBadgeCls)}>
          {dsBadgeLabel}
        </Badge>
      </div>
      <div className={cn("grid gap-1", sourceOptions.length >= 3 ? "grid-cols-3" : "grid-cols-2")}>
        {sourceOptions.map((opt) => {
          const label = dataSourceLabel(opt);
          const activeCls = dataSourceActiveClass(opt);
          return (
            <button key={opt} type="button"
              onClick={() => { if (opt !== ds) onChange({ dataSource: opt, periodos: null }); }}
              className={cn("rounded px-2 py-1 text-[11px] font-medium transition-colors",
                ds === opt ? activeCls : "bg-card hover:bg-secondary text-muted-foreground",
              )}>{label}</button>
          );
        })}
      </div>
    </div>
  );
}

function DreBlockInspector({ block, onChange }: {
  block: DreBlock;
  onChange: (patch: Partial<DreBlock>) => void;
}) {
  const months = useMonthsInfo();
  const periodosSelectionMode = block.periodosSelectionMode ?? "fixed";
  const allMonths = [...months].sort((a, b) =>
    a.ano !== b.ano ? a.ano - b.ano : a.mes - b.mes,
  );

  return (
    <div className="space-y-2">
      <DreSourcePicker block={block} onChange={onChange} />
      <Section title={t.dre.periodsSection} defaultOpen>
        <Row label={tc.mode}>
          <Segmented
            value={block.periodMode}
            onChange={(v) => onChange({
              periodMode: v as "month" | "fy",
              periodos: null,
              periodosRelativePeriod: v === "fy" ? "latest_fy_minus_1" : "latest_month_minus_1",
            })}
            options={[
              { value: "month", label: t.dre.periodModeOptions.month },
              { value: "fy", label: t.dre.periodModeOptions.fy },
            ]}
          />
        </Row>
        <Row label={t.dre.typeLabel}>
          <div className="flex items-center gap-1">
            <Segmented
              value={periodosSelectionMode}
              onChange={(v) => onChange({
                periodosSelectionMode: v as PeriodSelectionMode,
                periodos: v === "relative" ? null : block.periodos,
                periodosRelativePeriod: v === "relative"
                  ? block.periodosRelativePeriod ?? defaultRelativePresetForMode(block.periodMode)
                  : block.periodosRelativePeriod,
              })}
              options={[
                { value: "relative", label: t.dre.typeOptions.relative },
                { value: "fixed", label: t.dre.typeOptions.fixed },
              ]}
            />
            <PeriodModeBadge mode={periodosSelectionMode} />
          </div>
        </Row>
        <Row label={tc.periods}>
          {periodosSelectionMode === "relative" ? (
            <RelativePresetSelect
              mode={block.periodMode}
              value={block.periodosRelativePeriod}
              onChange={(v) => onChange({ periodosRelativePeriod: v, periodos: null })}
            />
          ) : (
            <MultiSelectFilter
              options={allMonths.map((m) => ({ value: m.periodo, label: m.label }))}
              selected={block.periodos ?? []}
              onChange={(v) => onChange({ periodos: v.length === 0 ? null : v })}
              placeholder={t.dre.periodsPlaceholder}
            />
          )}
        </Row>
      </Section>

      <Section title={t.dre.linesSection} defaultOpen>
        <div className="space-y-0.5">
          {DRE_LINES.map((line) => (
            <label key={line.id} className="flex items-center justify-between py-0.5 cursor-pointer">
              <span className="text-[11px] text-muted-foreground">{line.label}</span>
              <input
                type="checkbox"
                className="h-3.5 w-3.5"
                checked={block.linhas === null || block.linhas.includes(line.id)}
                onChange={(e) => {
                  const current = block.linhas ?? DRE_LINES.map((l) => l.id);
                  const next = e.target.checked
                    ? [...current.filter((id) => id !== line.id), line.id]
                    : current.filter((id) => id !== line.id);
                  onChange({ linhas: next.length === DRE_LINES.length ? null : next });
                }}
              />
            </label>
          ))}
          <button
            className="mt-1 text-[10px] text-primary hover:underline"
            onClick={() => onChange({ linhas: null })}
          >
            {t.dre.showAll}
          </button>
        </div>
      </Section>

      <Section title={t.dre.appearance} defaultOpen>
        <Row label={t.dre.fontPx}>
          <NumberStepper value={block.fontSize} min={8} max={18}
            onChange={(v) => onChange({ fontSize: v })} />
        </Row>
        <Row label={t.dre.headerColor}>
          <ColorField value={block.headerColor}
            onChange={(c) => onChange({ headerColor: c })} />
        </Row>
        <Row label={t.dre.textColor}>
          <ColorField value={block.textColor}
            onChange={(c) => onChange({ textColor: c })} />
        </Row>
        <ToggleField label={t.dre.showBudget} value={block.showBudget}
          onChange={(v) => onChange({ showBudget: v })} />
        <ToggleField
          label={t.dre.showVariation}
          value={block.showVariacao ?? false}
          onChange={(v) => onChange({ showVariacao: v })}
        />
        {(block.showVariacao ?? false) && (
          <Row label={t.dre.variationType}>
            <Segmented
              value={block.variacaoTipo ?? "percentual"}
              onChange={(v) => onChange({ variacaoTipo: v as "absoluta" | "percentual" | "ambas" })}
              options={[
                { value: "percentual", label: t.dre.variationOptions.percentual },
                { value: "absoluta", label: t.dre.variationOptions.absoluta },
                { value: "ambas", label: t.dre.variationOptions.ambas },
              ]}
            />
          </Row>
        )}
      </Section>

      <Section title={t.dre.conditionalFormat} defaultOpen={false}>
        {(() => {
          const cf = block.conditionalFormat ?? {
            enabled: false, scope: "row" as const, colorMin: SLIDE_HEX.danger,
            colorMid: SLIDE_HEX.white, colorMax: SLIDE_HEX.success,
            applyTo: "cell" as const, linhasAtivas: [],
          };
          const upd = (patch: Partial<NonNullable<DreBlock["conditionalFormat"]>>) =>
            onChange({ conditionalFormat: { ...cf, ...patch } });
          return (
            <>
              <ToggleField label={t.dre.enable} value={cf.enabled}
                onChange={(v) => upd({ enabled: v })} />
              {cf.enabled && (
                <>
                  <Row label={t.dre.scope}>
                    <Segmented value={cf.scope} onChange={(v) => upd({ scope: v as "row" | "table" })}
                      options={[
                        { value: "row", label: t.dre.scopeOptions.row },
                        { value: "table", label: t.dre.scopeOptions.table },
                      ]} />
                  </Row>
                  <Row label={t.dre.applyTo}>
                    <Segmented value={cf.applyTo} onChange={(v) => upd({ applyTo: v as "cell" | "text" })}
                      options={[
                        { value: "cell", label: t.dre.applyToOptions.cell },
                        { value: "text", label: t.dre.applyToOptions.text },
                      ]} />
                  </Row>
                  <Row label={t.dre.colorMin}>
                    <ColorField value={cf.colorMin} onChange={(c) => upd({ colorMin: c })} />
                  </Row>
                  <Row label={t.dre.colorMid}>
                    <ColorField value={cf.colorMid} onChange={(c) => upd({ colorMid: c })} />
                  </Row>
                  <Row label={t.dre.colorMax}>
                    <ColorField value={cf.colorMax} onChange={(c) => upd({ colorMax: c })} />
                  </Row>
                  <div className="space-y-0.5">
                    <span className="text-[10px] uppercase text-muted-foreground">{t.dre.activeLines}</span>
                    {DRE_LINES.map((line) => (
                      <label key={line.id} className="flex items-center justify-between py-0.5 cursor-pointer">
                        <span className="text-[11px] text-muted-foreground">{line.label}</span>
                        <input type="checkbox" className="h-3.5 w-3.5"
                          checked={cf.linhasAtivas.includes(line.id)}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...cf.linhasAtivas, line.id]
                              : cf.linhasAtivas.filter((id) => id !== line.id);
                            upd({ linhasAtivas: next });
                          }} />
                      </label>
                    ))}
                  </div>
                </>
              )}
            </>
          );
        })()}
      </Section>
    </div>
  );
}

const OMNI_METRIC_OPTIONS: { value: OmniMetric; label: string }[] = [
  { value: "cm", label: t.omni.metricOptions.cm },
  { value: "mb", label: t.omni.metricOptions.mb },
  { value: "rol", label: t.omni.metricOptions.rol },
  { value: "volume", label: t.omni.metricOptions.volume },
  { value: "margemPct", label: t.omni.metricOptions.margemPct },
];

const OMNI_DIM_OPTIONS: { value: OmniDim; label: string }[] = [
  { value: "skuDesc", label: t.omni.dimOptions.skuDesc },
  { value: "marca", label: t.omni.dimOptions.marca },
  { value: "categoria", label: t.omni.dimOptions.categoria },
  { value: "canalAjustado", label: t.omni.dimOptions.canalAjustado },
  { value: "cliente", label: t.omni.dimOptions.cliente },
  { value: "sku", label: t.omni.dimOptions.sku },
];

const OMNI_SORTBY_OPTIONS: { value: OmniAbcSortBy; label: string }[] = [
  { value: "margem", label: t.omni.sortByOptions.margem },
  { value: "margemPct", label: t.omni.sortByOptions.margemPct },
  { value: "volume", label: t.omni.sortByOptions.volume },
];

function OmniTitleSection({ showTitle, title, defaultTitle, onChange }: {
  showTitle: boolean;
  title?: string;
  defaultTitle: string;
  onChange: (patch: { showTitle?: boolean; title?: string }) => void;
}) {
  return (
    <Section title={t.omni.titleSectionLabel}>
      <Row label={tc.show}>
        <ToggleField value={showTitle} onChange={(v) => onChange({ showTitle: v })} label="" />
      </Row>
      {showTitle && (
        <Row label={tc.text}>
          <DraftInput
            className="h-7 w-full rounded border border-border/50 bg-background px-2 text-xs"
            value={title ?? ""}
            placeholder={defaultTitle}
            onCommit={(value) => onChange({ title: value || undefined })}
          />
        </Row>
      )}
    </Section>
  );
}

function OmniFiltersSection({ block, onChange }: {
  block: OmniBaseBlock;
  onChange: (patch: Partial<OmniBaseBlock>) => void;
}) {
  const rows = usePricing((s) => s.rows);
  const unique = (field: keyof PricingRow) =>
    Array.from(new Set(rows.map((r) => r[field] as string | undefined).filter(Boolean))).sort() as string[];
  const dimOpt = (field: keyof PricingRow, placeholder: string) => [
    { value: "", label: placeholder },
    ...unique(field).map((v) => ({ value: v, label: v })),
  ];
  const f = t.omni.filterFields;

  return (
    <Section title={t.omni.filters}>
      <Row label={f.periods}>
        <MultiSelectFilter
          selected={block.periodos ?? []}
          options={unique("periodo").map((v) => ({ value: v, label: v }))}
          onChange={(v) => onChange({ periodos: v.length ? v : null })}
          placeholder={f.periodsAll}
        />
      </Row>
      <Row label={f.canal}><SelectField value={block.canalAjustado ?? ""} options={dimOpt("canalAjustado", f.canalAll)} onChange={(v) => onChange({ canalAjustado: v || null })} /></Row>
      <Row label={f.categoria}><SelectField value={block.categoria ?? ""} options={dimOpt("categoria", f.categoriaAll)} onChange={(v) => onChange({ categoria: v || null })} /></Row>
      <Row label={f.subcategoria}><SelectField value={block.subcategoria ?? ""} options={dimOpt("subcategoria", f.subcategoriaAll)} onChange={(v) => onChange({ subcategoria: v || null })} /></Row>
      <Row label={f.marca}><SelectField value={block.marca ?? ""} options={dimOpt("marca", f.marcaAll)} onChange={(v) => onChange({ marca: v || null })} /></Row>
      <Row label={f.formato}><SelectField value={block.formato ?? ""} options={dimOpt("formato", f.formatoAll)} onChange={(v) => onChange({ formato: v || null })} /></Row>
      <Row label={f.regional}><SelectField value={block.regional ?? ""} options={dimOpt("regional", f.regionalAll)} onChange={(v) => onChange({ regional: v || null })} /></Row>
      <Row label={f.uf}><SelectField value={block.uf ?? ""} options={dimOpt("uf", f.ufAll)} onChange={(v) => onChange({ uf: v || null })} /></Row>
    </Section>
  );
}

/** Estilo mínimo compartilhado pros blocos Omni Analytics — cor principal
 * + tamanho de fonte dos rótulos. Ligado incrementalmente, um bloco por
 * vez (cada renderer decide como aplicar `color`/`fontSize`, já que os
 * 17 blocos têm formas de desenho bem diferentes entre si). Ver
 * OmniBaseBlock em customSlide.ts pro porquê dos campos ficarem lá. */
function OmniStyleSection({ block, onChange, defaultColor, hideColor }: {
  block: OmniBaseBlock;
  onChange: (p: Partial<OmniBaseBlock>) => void;
  defaultColor?: string;
  /** true pros blocos onde `color` não tem efeito visível garantido (ex.:
   *  gráfico multi-série sem uma única cor de destaque, heatmap com escala
   *  de cor pelos dados) — evita reintroduzir a mesma classe de "controle
   *  que não faz nada" que motivou essa análise inteira. */
  hideColor?: boolean;
}) {
  return (
    <Section title={t.omni.style.sectionLabel}>
      {!hideColor && (
        <Row label={tc.color}>
          <ColorField value={block.color ?? defaultColor ?? SLIDE_HEX.chart1} onChange={(c) => onChange({ color: c })} />
        </Row>
      )}
      <Row label={t.omni.style.fontSize}>
        <NumberStepper value={block.fontSize ?? 9} min={7} max={16}
          onChange={(v) => onChange({ fontSize: v })} suffix="px" />
      </Row>
    </Section>
  );
}

function OmniMetricInspector({ block, onChange, label }: {
  block: OmniBaseBlock & { metric: OmniMetric };
  onChange: (p: Partial<OmniBaseBlock> & { metric?: OmniMetric }) => void;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <OmniTitleSection showTitle={block.showTitle} title={block.title} defaultTitle={label} onChange={onChange} />
      <Section title={t.omni.data}>
        <Row label={tc.metric}><SelectField value={block.metric} onChange={(v) => onChange({ metric: v as OmniMetric })} options={OMNI_METRIC_OPTIONS} /></Row>
      </Section>
      {/* Sem "Cor": usado por canal_mix (barras empilhadas multi-série) e
       * heatmap_sazonalidade (cor por valor, escala de calor) — nenhum dos
       * dois tem uma única cor de destaque pra esse campo controlar. */}
      <OmniStyleSection block={block} onChange={onChange} hideColor />
      <OmniFiltersSection block={block} onChange={onChange} />
    </div>
  );
}

function OmniEvolucaoInspector({ block, onChange }: {
  block: OmniEvolucaoMensalBlock;
  onChange: (p: Partial<OmniEvolucaoMensalBlock>) => void;
}) {
  return (
    <div className="space-y-2">
      <OmniTitleSection showTitle={block.showTitle} title={block.title} defaultTitle={t.omni.defaultTitles.evolucaoMensal} onChange={onChange} />
      <Section title={t.omni.data}>
        <Row label={tc.metric}><SelectField value={block.metric} onChange={(v) => onChange({ metric: v as OmniMetric })} options={OMNI_METRIC_OPTIONS} /></Row>
        <Row label={t.omni.evolucao.chartType}><SelectField value={block.chartType} onChange={(v) => onChange({ chartType: v as "line" | "bar" | "area" })} options={[
          { value: "line", label: t.omni.evolucao.chartTypeOptions.line },
          { value: "bar", label: t.omni.evolucao.chartTypeOptions.bar },
          { value: "area", label: t.omni.evolucao.chartTypeOptions.area },
        ]} /></Row>
        <Row label={t.omni.evolucao.legend}><ToggleField value={block.showLegend} onChange={(v) => onChange({ showLegend: v })} label="" /></Row>
      </Section>
      <OmniStyleSection block={block} onChange={onChange as (p: Partial<OmniBaseBlock>) => void} defaultColor={SLIDE_HEX.chart1} />
      <OmniFiltersSection block={block} onChange={onChange as (p: Partial<OmniBaseBlock>) => void} />
    </div>
  );
}

function OmniHeroisInspector({ block, onChange }: {
  block: OmniHeroisOfensoresBlock | OmniAbcBarsBlock;
  onChange: (p: Partial<OmniHeroisOfensoresBlock & OmniAbcBarsBlock>) => void;
}) {
  const label = block.kind === "omni_herois_ofensores" ? t.omni.defaultTitles.heroisOfensores : t.omni.defaultTitles.abcBars;
  return (
    <div className="space-y-2">
      <OmniTitleSection showTitle={block.showTitle} title={block.title} defaultTitle={label} onChange={onChange} />
      <Section title={t.omni.data}>
        <Row label={tc.dimension}><SelectField value={block.dim} onChange={(v) => onChange({ dim: v as OmniDim })} options={OMNI_DIM_OPTIONS} /></Row>
        <Row label={tc.metric}><SelectField value={block.metric} onChange={(v) => onChange({ metric: v as OmniMetric })} options={OMNI_METRIC_OPTIONS} /></Row>
        <Row label={t.omni.heroisOfensores.sortBy}><SelectField value={block.sortBy} onChange={(v) => onChange({ sortBy: v as OmniAbcSortBy })} options={OMNI_SORTBY_OPTIONS} /></Row>
        <Row label={t.omni.heroisOfensores.variant}><SelectField value={block.variant} onChange={(v) => onChange({ variant: v as OmniHeroesVariant })} options={[
          { value: "both", label: t.omni.heroisOfensores.variantOptions.both },
          { value: "hero", label: t.omni.heroisOfensores.variantOptions.hero },
          { value: "villain", label: t.omni.heroisOfensores.variantOptions.villain },
        ]} /></Row>
        <Row label={t.omni.heroisOfensores.topN}><NumberStepper value={block.topN} min={3} max={20} step={1} onChange={(v) => onChange({ topN: v })} /></Row>
      </Section>
      <OmniFiltersSection block={block} onChange={onChange as (p: Partial<OmniBaseBlock>) => void} />
    </div>
  );
}

function OmniCanalTrendInspector({ block, onChange }: {
  block: OmniCanalTrendBlock;
  onChange: (p: Partial<OmniCanalTrendBlock>) => void;
}) {
  return (
    <div className="space-y-2">
      <OmniTitleSection showTitle={block.showTitle} title={block.title} defaultTitle={t.omni.defaultTitles.canalTrend} onChange={onChange} />
      <Section title={t.omni.data}>
        <Row label={tc.metric}><SelectField value={block.metric} onChange={(v) => onChange({ metric: v as OmniMetric })} options={OMNI_METRIC_OPTIONS} /></Row>
        <Row label={t.omni.custo.legend}><ToggleField value={block.showLegend} onChange={(v) => onChange({ showLegend: v })} label="" /></Row>
      </Section>
      {/* Sem controle de "Cor": por padrão (canal=null) este bloco desenha
       * várias linhas (top canais), então uma única cor não teria efeito
       * visível garantido — ver comentário em OmniStyleSection. */}
      <OmniStyleSection block={block} onChange={onChange as (p: Partial<OmniBaseBlock>) => void} hideColor />
      <OmniFiltersSection block={block} onChange={onChange as (p: Partial<OmniBaseBlock>) => void} />
    </div>
  );
}

function OmniCustoInspector({ block, onChange }: {
  block: OmniCustoEvolucaoBlock | OmniCustoComposicaoBlock;
  onChange: (p: Partial<OmniCustoEvolucaoBlock & OmniCustoComposicaoBlock>) => void;
}) {
  const label = block.kind === "omni_custo_evolucao" ? t.omni.defaultTitles.custoEvolucao : t.omni.defaultTitles.custoComposicao;
  return (
    <div className="space-y-2">
      <OmniTitleSection showTitle={block.showTitle} title={block.title} defaultTitle={label} onChange={onChange} />
      <Section title={t.omni.data}>
        <Row label={t.omni.custo.view}><SelectField value={block.viewMode} onChange={(v) => onChange({ viewMode: v as "pct" | "abs" | "kg" })} options={[
          { value: "pct", label: t.omni.custo.viewOptions.pct },
          { value: "abs", label: t.omni.custo.viewOptions.abs },
          ...(block.kind === "omni_custo_evolucao" ? [{ value: "kg" as const, label: t.omni.custo.viewOptions.kg }] : []),
        ]} /></Row>
        <Row label={t.omni.custo.legend}><ToggleField value={block.showLegend} onChange={(v) => onChange({ showLegend: v })} label="" /></Row>
      </Section>
      <OmniFiltersSection block={block} onChange={onChange as (p: Partial<OmniBaseBlock>) => void} />
    </div>
  );
}

function OmniCustoPressaoInspector({ block, onChange }: {
  block: OmniCustoPressaoBlock;
  onChange: (p: Partial<OmniCustoPressaoBlock>) => void;
}) {
  return (
    <div className="space-y-2">
      <OmniTitleSection showTitle={block.showTitle} title={block.title} defaultTitle={t.omni.defaultTitles.custoPressao} onChange={onChange} />
      <Section title={t.omni.data}>
        <Row label={t.omni.custoPressao.custoVariavel}><ToggleField value={block.showCustoVariavel} onChange={(v) => onChange({ showCustoVariavel: v })} label="" /></Row>
        <Row label={t.omni.custoPressao.custoFixo}><ToggleField value={block.showCustoFixo} onChange={(v) => onChange({ showCustoFixo: v })} label="" /></Row>
        <Row label={t.omni.custoPressao.legend}><ToggleField value={block.showLegend} onChange={(v) => onChange({ showLegend: v })} label="" /></Row>
      </Section>
      <OmniFiltersSection block={block} onChange={onChange as (p: Partial<OmniBaseBlock>) => void} />
    </div>
  );
}

function OmniPositivacaoInspector({ block, onChange }: {
  block: OmniPositivacaoBlock;
  onChange: (p: Partial<OmniPositivacaoBlock>) => void;
}) {
  return (
    <div className="space-y-2">
      <OmniTitleSection showTitle={block.showTitle} title={block.title} defaultTitle={t.omni.defaultTitles.positivacao} onChange={onChange} />
      <Section title={t.omni.data}>
        <Row label={tc.dimension}><SelectField value={block.dim} onChange={(v) => onChange({ dim: v as OmniPositivacaoBlock["dim"] })} options={[
          { value: "categoria", label: t.omni.positivacao.dimOptions.categoria },
          { value: "marca", label: t.omni.positivacao.dimOptions.marca },
          { value: "canalAjustado", label: t.omni.positivacao.dimOptions.canalAjustado },
          { value: "gestorResp", label: t.omni.positivacao.dimOptions.gestorResp },
          { value: "sku", label: t.omni.positivacao.dimOptions.sku },
          { value: "skuDesc", label: t.omni.positivacao.dimOptions.skuDesc },
        ]} /></Row>
        <Row label={t.omni.positivacao.chartType}><SelectField value={block.chartType} onChange={(v) => onChange({ chartType: v as OmniPositivacaoBlock["chartType"] })} options={[
          { value: "line", label: t.omni.positivacao.chartTypeOptions.line },
          { value: "bar", label: t.omni.positivacao.chartTypeOptions.bar },
          { value: "area", label: t.omni.positivacao.chartTypeOptions.area },
        ]} /></Row>
        <Row label={t.omni.positivacao.topN}><NumberStepper value={block.topN ?? 8} min={3} max={12} step={1} onChange={(v) => onChange({ topN: v })} /></Row>
        <Row label={t.omni.positivacao.legend}><ToggleField value={block.showLegend} onChange={(v) => onChange({ showLegend: v })} label="" /></Row>
      </Section>
      <OmniFiltersSection block={block} onChange={onChange as (p: Partial<OmniBaseBlock>) => void} />
    </div>
  );
}

function OmniUfMapInspector({ block, onChange }: {
  block: OmniUfMapBlock;
  onChange: (p: Partial<OmniUfMapBlock>) => void;
}) {
  return (
    <div className="space-y-2">
      <OmniTitleSection showTitle={block.showTitle} title={block.title} defaultTitle={t.omni.defaultTitles.ufMap} onChange={onChange} />
      <Section title={t.omni.data}>
        <Row label={tc.metric}><SelectField value={block.metric} onChange={(v) => onChange({ metric: v as OmniMetric })} options={OMNI_METRIC_OPTIONS} /></Row>
        <Row label={t.omni.ufMap.labelMode}><SelectField value={block.labelMode} onChange={(v) => onChange({ labelMode: v as OmniUfMapBlock["labelMode"] })} options={[
          { value: "uf", label: t.omni.ufMap.labelModeOptions.uf },
          { value: "value", label: t.omni.ufMap.labelModeOptions.value },
          { value: "both", label: t.omni.ufMap.labelModeOptions.both },
        ]} /></Row>
      </Section>
      <OmniFiltersSection block={block} onChange={onChange as (p: Partial<OmniBaseBlock>) => void} />
    </div>
  );
}

function OmniPriceDecompInspector({ block, onChange }: {
  block: OmniPriceDecompBlock;
  onChange: (p: Partial<OmniPriceDecompBlock>) => void;
}) {
  const months = useMonthsInfo();
  const fyList = useFyList();
  const opts = block.periodMode === "fy" ? fyList.map((f) => ({ value: f, label: f })) : months.map((m) => ({ value: m.periodo, label: m.label }));
  return (
    <div className="space-y-2">
      <OmniTitleSection showTitle={block.showTitle} title={block.title} defaultTitle={t.omni.defaultTitles.priceDecomp} onChange={onChange} />
      <Section title={t.omni.priceDecompBridge.periodsSection}>
        <Row label={tc.mode}><SelectField value={block.periodMode} onChange={(v) => {
          const nextMode = v as "fy" | "month";
          onChange({ periodMode: nextMode, base: null, comp: null, baseSelectionMode: block.baseSelectionMode ?? "relative", baseRelativePeriod: nextMode === "fy" ? "latest_fy_minus_2" : "latest_month_minus_2", compSelectionMode: block.compSelectionMode ?? "relative", compRelativePeriod: nextMode === "fy" ? "latest_fy_minus_1" : "latest_month_minus_1" });
        }} options={[
          { value: "month", label: t.omni.priceDecompBridge.modeOptions.month },
          { value: "fy", label: t.omni.priceDecompBridge.modeOptions.fy },
        ]} /></Row>
        <Row label={tc.base}><ComparePeriodField label={tc.base} mode={block.periodMode} fixedValue={block.base} selectionMode={block.baseSelectionMode} relativeValue={block.baseRelativePeriod} options={opts} onChange={(p) => onChange({ base: p.value, baseSelectionMode: p.selectionMode, baseRelativePeriod: p.relativePeriod })} /></Row>
        <Row label={t.omni.priceDecompBridge.comparisonLabel}><ComparePeriodField label={tc.comparison} mode={block.periodMode} fixedValue={block.comp} selectionMode={block.compSelectionMode} relativeValue={block.compRelativePeriod} options={opts} onChange={(p) => onChange({ comp: p.value, compSelectionMode: p.selectionMode, compRelativePeriod: p.relativePeriod })} /></Row>
      </Section>
      <OmniFiltersSection block={block} onChange={onChange as (p: Partial<OmniBaseBlock>) => void} />
    </div>
  );
}

function OmniBridgePvmInspector({ block, onChange }: {
  block: OmniBridgePvmBlock;
  onChange: (p: Partial<OmniBridgePvmBlock>) => void;
}) {
  const months = useMonthsInfo();
  const fyList = useFyList();
  const opts = block.periodMode === "fy" ? fyList.map((f) => ({ value: f, label: f })) : months.map((m) => ({ value: m.periodo, label: m.label }));
  return (
    <div className="space-y-2">
      <OmniTitleSection showTitle={block.showTitle} title={block.title} defaultTitle={t.omni.defaultTitles.bridgePvm} onChange={onChange} />
      <Section title={t.omni.priceDecompBridge.periodsSection}>
        <Row label={tc.mode}><SelectField value={block.periodMode} onChange={(v) => {
          const nextMode = v as "fy" | "month" | "ytd_budget";
          onChange({ periodMode: nextMode, base: null, comp: null, baseSelectionMode: block.baseSelectionMode ?? "relative", baseRelativePeriod: nextMode === "fy" ? "latest_fy_minus_2" : "latest_month_minus_2", compSelectionMode: block.compSelectionMode ?? "relative", compRelativePeriod: nextMode === "fy" ? "latest_fy_minus_1" : "latest_month_minus_1" });
        }} options={[
          { value: "month", label: t.omni.priceDecompBridge.modeOptions.month },
          { value: "fy", label: t.omni.priceDecompBridge.modeOptions.fy },
          { value: "ytd_budget", label: t.omni.priceDecompBridge.ytdBudgetOption },
        ]} /></Row>
        {block.periodMode === "ytd_budget" ? (
          <div className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-[11px] text-muted-foreground">{t.omni.priceDecompBridge.ytdBudgetHint}</div>
        ) : (
          <>
            <Row label={tc.base}><ComparePeriodField label={tc.base} mode={block.periodMode} fixedValue={block.base} selectionMode={block.baseSelectionMode} relativeValue={block.baseRelativePeriod} options={opts} onChange={(p) => onChange({ base: p.value, baseSelectionMode: p.selectionMode, baseRelativePeriod: p.relativePeriod })} /></Row>
            <Row label={t.omni.priceDecompBridge.comparisonLabel}><ComparePeriodField label={tc.comparison} mode={block.periodMode} fixedValue={block.comp} selectionMode={block.compSelectionMode} relativeValue={block.compRelativePeriod} options={opts} onChange={(p) => onChange({ comp: p.value, compSelectionMode: p.selectionMode, compRelativePeriod: p.relativePeriod })} /></Row>
          </>
        )}
      </Section>
      <OmniFiltersSection block={block} onChange={onChange as (p: Partial<OmniBaseBlock>) => void} />
    </div>
  );
}

function buildFarolSkuOptions(rows: PricingRow[]) {
  const map = new Map<string, { desc: string; volume: number }>();
  for (const r of rows) {
    if (!r.sku) continue;
    const cur = map.get(r.sku);
    if (cur) cur.volume += r.volumeKg || 0;
    else map.set(r.sku, { desc: r.skuDesc || r.sku, volume: r.volumeKg || 0 });
  }
  return Array.from(map, ([sku, v]) => ({
    sku,
    label: v.desc ? `${sku} - ${v.desc}` : sku,
    volume: v.volume,
  })).sort((a, b) => b.volume - a.volume);
}

function FarolSkuField({ id, value, options, onChange }: {
  id: string;
  value: string | null;
  options: { sku: string; label: string }[];
  onChange: (sku: string | null) => void;
}) {
  return (
    <>
      <DraftInput className="h-7 px-2 text-xs" list={id} placeholder="auto" value={value ?? ""} normalize={(next) => next.trim()} onCommit={(next) => onChange(next || null)} />
      <datalist id={id}>
        {options.slice(0, 600).map((o) => <option key={o.sku} value={o.sku}>{o.label}</option>)}
      </datalist>
    </>
  );
}

function OmniFarolInspector({ block, onChange }: {
  block: OmniFarolBlock;
  onChange: (p: Partial<OmniFarolBlock>) => void;
}) {
  const rows = usePricing((s) => s.rows);
  const skuOptions = useMemo(() => buildFarolSkuOptions(rows), [rows]);
  return (
    <div className="space-y-2">
      <OmniTitleSection showTitle={block.showTitle} title={block.title} defaultTitle={t.omni.defaultTitles.farol} onChange={onChange} />
      <Section title={t.omni.farol.comparisonSection}>
        <Row label={t.omni.farol.baseSku}><FarolSkuField id={`farol-sku-ref-${block.id}`} value={block.skuRef ?? null} options={skuOptions} onChange={(skuRef) => onChange({ skuRef })} /></Row>
        <Row label={t.omni.farol.comparedSku}><FarolSkuField id={`farol-sku-comp-${block.id}`} value={block.skuComp ?? null} options={skuOptions} onChange={(skuComp) => onChange({ skuComp })} /></Row>
        <Row label={t.omni.farol.window}><SelectField value={String(block.periodoMeses ?? 3)} options={[
          { value: "3", label: t.omni.farol.windowOptions.m3 },
          { value: "6", label: t.omni.farol.windowOptions.m6 },
          { value: "12", label: t.omni.farol.windowOptions.m12 },
        ]} onChange={(v) => onChange({ periodoMeses: Number(v) || 3 })} /></Row>
      </Section>
      <Section title={t.omni.farol.displaySection}>
        <Row label={t.omni.farol.gauge}><ToggleField value={block.showGauge} onChange={(v) => onChange({ showGauge: v })} label="" /></Row>
        <Row label={t.omni.farol.legend}><ToggleField value={block.showCaption ?? true} onChange={(v) => onChange({ showCaption: v })} label="" /></Row>
        <Row label={t.omni.farol.numbers}><ToggleField value={block.showStats ?? true} onChange={(v) => onChange({ showStats: v })} label="" /></Row>
        <Row label={t.omni.farol.theme}><Segmented value={block.gaugeTheme ?? "dark"} onChange={(v) => onChange({ gaugeTheme: v as "dark" | "light" })} options={[
          { value: "dark", label: t.omni.farol.themeOptions.dark },
          { value: "light", label: t.omni.farol.themeOptions.light },
        ]} /></Row>
        <Row label={t.omni.farol.size}><Slider value={block.gaugeScale ?? 55} min={40} max={75} step={5} onChange={(v) => onChange({ gaugeScale: v })} suffix="%" /></Row>
      </Section>
      <OmniFiltersSection block={block} onChange={onChange as (p: Partial<OmniBaseBlock>) => void} />
    </div>
  );
}

function OmniAbcCurvaInspector({ block, onChange }: {
  block: OmniAbcCurvaBlock;
  onChange: (p: Partial<OmniAbcCurvaBlock>) => void;
}) {
  return (
    <div className="space-y-2">
      <OmniTitleSection showTitle={block.showTitle} title={block.title} defaultTitle={t.omni.defaultTitles.abcCurva} onChange={onChange} />
      <Section title={t.omni.data}>
        <Row label={tc.dimension}><SelectField value={block.dim} onChange={(v) => onChange({ dim: v as OmniDim })} options={OMNI_DIM_OPTIONS} /></Row>
        <Row label={t.omni.abcCurva.table}><ToggleField value={block.showTable} onChange={(v) => onChange({ showTable: v })} label="" /></Row>
      </Section>
      <OmniFiltersSection block={block} onChange={onChange as (p: Partial<OmniBaseBlock>) => void} />
    </div>
  );
}

function OmniDimMetricInspector({ block, onChange, label }: {
  block: OmniBaseBlock & { dim: OmniDim };
  onChange: (p: Partial<OmniBaseBlock> & { dim?: OmniDim }) => void;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <OmniTitleSection showTitle={block.showTitle} title={block.title} defaultTitle={label} onChange={onChange} />
      <Section title={t.omni.data}>
        <Row label={tc.dimension}><SelectField value={block.dim} onChange={(v) => onChange({ dim: v as OmniDim })} options={OMNI_DIM_OPTIONS} /></Row>
        <Row label={tc.metric}><SelectField value={block.metric} onChange={(v) => onChange({ metric: v as OmniMetric })} options={OMNI_METRIC_OPTIONS} /></Row>
      </Section>
      <OmniFiltersSection block={block} onChange={onChange as (p: Partial<OmniBaseBlock>) => void} />
    </div>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}

// (FitControls compartilhado removido ? apenas tabela usa estes toggles agora,
// inlined em TableBlockEditor.)

// Alerta dismissível mostrado quando o conteúdo está sendo cortado.
// Reaparece quando capacidade muda (ex.: usuário redimensiona o bloco).
const dismissedTruncations = new Map<string, string>();
function TruncationAlert({ blockId, fit, unitPlural }: {
  blockId: string; fit: FitInfo; unitPlural: string;
}) {
  const key = `${fit.shown}/${fit.total}`;
  const [, force] = useState(0);
  if (!fit.truncated) return null;
  if (dismissedTruncations.get(blockId) === key) return null;
  return (
    <Alert className="relative border-amber-300 bg-amber-50 py-2 pr-7 dark:bg-amber-950/30">
      <Info className="h-3.5 w-3.5 text-amber-600" />
      <AlertDescription className="text-[11px] leading-snug text-amber-900 dark:text-amber-200">
        {t.truncationAlert.message(fit.shown, fit.total, unitPlural)}
      </AlertDescription>
      <button
        onClick={() => { dismissedTruncations.set(blockId, key); force((n) => n + 1); }}
        className="absolute right-1 top-1 rounded p-0.5 hover:bg-amber-100"
        aria-label={t.truncationAlert.close}
        title={t.truncationAlert.closeTitle}
      >
        <X className="h-3 w-3 text-amber-700" />
      </button>
    </Alert>
  );
}

export function PaletteGroup({
  title, defaultOpen = true, children,
}: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-2 py-1 slides-type-label outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background">
        <span>{title}</span>
        <ChevronDown className={cn("h-3 w-3 transition-transform", open ? "" : "-rotate-90")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-0.5 pt-1">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function PaletteButton({
  icon: Icon, label, onClick, favorite = false, onToggleFavorite,
}: {
  icon: Icon;
  label: string;
  onClick: () => void;
  favorite?: boolean;
  onToggleFavorite?: () => void;
}) {
  return (
    <div className="group flex items-center rounded-md hover:bg-surface-raised focus-within:bg-surface-raised">
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
      >
        <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="truncate">{label}</span>
      </button>
      {onToggleFavorite && (
        <button
          type="button"
          title={favorite ? t.paletteButton.removeFavorite : t.paletteButton.addFavorite}
          aria-label={favorite ? t.paletteButton.removeFavorite : t.paletteButton.addFavorite}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          className={cn(
            "mr-1 rounded p-0.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
            favorite
              ? "text-amber-500"
              : "text-muted-foreground/40 opacity-0 hover:text-amber-500 group-hover:opacity-100",
          )}
        >
          <Star className={cn("h-3.5 w-3.5", favorite && "fill-current")} />
        </button>
      )}
    </div>
  );
}

export function QuickLayoutButton({
  label,
  description,
  onClick,
}: {
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="surface-raised mb-1 w-full rounded-lg border border-border/50 px-2.5 py-2 text-left outline-none transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
    >
      <div className="slides-type-section text-[12px]">{label}</div>
      <div className="mt-0.5 slides-type-helper leading-snug">{description}</div>
    </button>
  );
}

export function TextStyleButton({
  label,
  className,
  onClick,
}: {
  label: string;
  className: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="surface-raised mb-1 w-full rounded-lg border border-border/50 px-3 py-2 text-left outline-none transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
    >
      <span className={cn("block leading-tight", className)}>{label}</span>
    </button>
  );
}

// Badge "KE30" / "Budget" mostrado no canto superior-esquerdo de cada bloco
// de dados durante a edição. Marcado data-edit-only para o exporter remover.
export function DataSourceBadge({ block }: { block: CustomBlock }) {
  const kinds: CustomBlockKind[] = ["chart", "kpi", "table", "topSku"];
  if (!kinds.includes(block.kind)) return null;
  const ds = (block as { dataSource?: BlockDataSource }).dataSource ?? "ke30";
  const bgColor = ds === "ke30"
    ? SLIDE_RGBA.editorSelectionBadgeStrong
    : ds === "budget"
      ? "hsl(var(--data-source-budget) / 0.92)"
      : ds === "forecast"
        ? "hsl(var(--data-source-forecast) / 0.92)"
      : "hsl(var(--data-source-budget-real) / 0.92)";
  const dsLabel = dataSourceLabel(ds);
  return (
    <div
      data-edit-only="true"
      style={{
        position: "absolute",
        top: 4,
        left: 4,
        zIndex: 50,
        padding: "1px 6px",
        borderRadius: 4,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        color: SLIDE_HEX.white,
        background: bgColor,
        boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
        pointerEvents: "none",
      }}
    >
      {dsLabel}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ClearFiltersToolbar ? slide-level cross-filter clear button (Part B.6)
// ---------------------------------------------------------------------------
export function ClearFiltersToolbar() {
  const { filters, clearAll } = useSlideFilters();
  if (filters.length === 0) return null;
  const summary = filters
    .map((f) => t.clearFiltersToolbar.summary(dimensionLabel(f.dimension), f.values.join(", ")))
    .join(" · ");
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5">
      <FunnelIcon className="h-3.5 w-3.5 text-primary" />
      <span className="flex-1 truncate text-[11px] text-foreground/90" title={summary}>
        {t.clearFiltersToolbar.activeFilters(summary)}
      </span>
      <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={clearAll}>
        {t.clearFiltersToolbar.clear(filters.length)}
      </Button>
    </div>
  );
}

export function clientToCanvas(
  canvasEl: HTMLDivElement | null,
  clientX: number,
  clientY: number,
  scale: number,
): { x: number; y: number } | null {
  if (!canvasEl) return null;
  const r = canvasEl.getBoundingClientRect();
  return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale };
}

function cssEscapeId(id: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(id);
  return id.replace(/["\\]/g, "\\$&");
}

function blockFrameElement(id: string, root: ParentNode | null): HTMLElement | null {
  return root?.querySelector<HTMLElement>(`[data-block-frame-id="${cssEscapeId(id)}"]`) ?? null;
}

// ---------------------------------------------------------------------------
// Multi-selection inspector (B8.2)
// ---------------------------------------------------------------------------
export function MultiSelectInspector({ selectedIds, blocks, hasGroup, readOnly, canEdit, onDuplicate, onDelete }: {
  selectedIds: string[];
  blocks: CustomBlock[];
  hasGroup: boolean;
  readOnly: boolean;
  canEdit: () => boolean;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const align = (k: AlignKind) => { if (canEdit()) alignBlocksAction(selectedIds, k); };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Badge variant="secondary" className="text-[10px]">
          {t.multiSelect.title(blocks.length)}
        </Badge>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7"
            disabled={readOnly}
            onClick={onDuplicate}
            title={t.multiSelect.duplicateAll}
            aria-label={t.multiSelect.duplicateAllAria}>
            <CopyIcon className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 hover:text-destructive"
            disabled={readOnly}
            onClick={onDelete}
            title={t.multiSelect.deleteAll}
            aria-label={t.multiSelect.deleteAllAria}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <Separator />

      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">{t.multiSelect.alignment}</Label>
        <div className="mt-1 grid grid-cols-3 gap-1">
          <Button size="icon" variant="outline" className="h-8" title={t.multiSelect.alignLeft} aria-label={t.multiSelect.alignLeftAria} onClick={() => align("left")}>
            <AlignStartVertical className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="outline" className="h-8" title={t.multiSelect.alignCenterH} aria-label={t.multiSelect.alignCenterHAria} onClick={() => align("centerH")}>
            <AlignHorizontalJustifyCenter className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="outline" className="h-8" title={t.multiSelect.alignRight} aria-label={t.multiSelect.alignRightAria} onClick={() => align("right")}>
            <AlignEndVertical className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="outline" className="h-8" title={t.multiSelect.alignTop} aria-label={t.multiSelect.alignTopAria} onClick={() => align("top")}>
            <AlignStartHorizontal className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="outline" className="h-8" title={t.multiSelect.alignCenterV} aria-label={t.multiSelect.alignCenterVAria} onClick={() => align("centerV")}>
            <AlignVerticalJustifyCenter className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="outline" className="h-8" title={t.multiSelect.alignBottom} aria-label={t.multiSelect.alignBottomAria} onClick={() => align("bottom")}>
            <AlignEndHorizontal className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">{t.multiSelect.distribute}</Label>
        <div className="mt-1 grid grid-cols-2 gap-1">
          <Button size="sm" variant="outline" className="h-8 gap-1 text-[11px]"
            disabled={readOnly || blocks.length < 3}
            onClick={() => align("distH")}>
            <AlignHorizontalDistributeCenter className="h-3.5 w-3.5" /> {t.multiSelect.distributeH}
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1 text-[11px]"
            disabled={readOnly || blocks.length < 3}
            onClick={() => align("distV")}>
            <AlignVerticalDistributeCenter className="h-3.5 w-3.5" /> {t.multiSelect.distributeV}
          </Button>
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-2 gap-1">
        <Button size="sm" variant="outline" className="h-8 gap-1 text-[11px]"
          disabled={readOnly}
          onClick={() => { if (canEdit()) groupBlocksAction(selectedIds); }}
          aria-label={t.multiSelect.groupAria}>
          <GroupIcon className="h-3.5 w-3.5" /> {t.multiSelect.group}
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1 text-[11px]"
          disabled={readOnly || !hasGroup}
          onClick={() => { if (canEdit()) ungroupBlocksAction(selectedIds); }}
          aria-label={t.multiSelect.ungroupAria}>
          <UngroupIcon className="h-3.5 w-3.5" /> {t.multiSelect.ungroup}
        </Button>
      </div>

      <p className="text-[10px] leading-snug text-muted-foreground">
        {t.multiSelect.shortcutsPrefix} <kbd>Ctrl+A</kbd> {t.multiSelect.shortcutSelectAll} · <kbd>Ctrl+G</kbd> {t.multiSelect.shortcutGroup} · <kbd>Ctrl+Shift+G</kbd> {t.multiSelect.shortcutUngroup} · <kbd>setas</kbd> {t.multiSelect.shortcutMove}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GroupOverlay ? dashed bbox + 8 resize handles for the active group (B8 fix).
// Drag preview is local; on mouseup a single labeled action commits the
// proportional scale to every member ("Redimensionar grupo" ? undoable).
// ---------------------------------------------------------------------------
export function GroupOverlay({
  bounds, active, showHandles, members, scaleRef, canvasEl,
}: {
  bounds: { x: number; y: number; w: number; h: number };
  active: boolean;
  showHandles: boolean;
  members: CustomBlock[];
  scaleRef: React.MutableRefObject<number>;
  canvasEl: HTMLDivElement | null;
}) {
  const [preview, setPreview] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const bb = preview ?? bounds;
  const memberIds = useMemo(() => members.map((member) => member.id), [members]);

  type HandleDir = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

  const startResize = (dir: HandleDir, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const origin = { ...bounds };
    const startX = e.clientX;
    const startY = e.clientY;
    const sc = scaleRef.current || 1;
    let raf: number | null = null;
    let lastPreview: { x: number; y: number; w: number; h: number } | null = null;
    const originalFrameStyles = new Map<string, { transform: string; transformOrigin: string; willChange: string; transition: string }>();

    const applyMemberPreview = (nextPreview: { x: number; y: number; w: number; h: number }) => {
      const scaleX = nextPreview.w / Math.max(1, origin.w);
      const scaleY = nextPreview.h / Math.max(1, origin.h);
      members.forEach((member) => {
        if (member.locked) return;
        const frame = blockFrameElement(member.id, canvasEl);
        if (!frame) return;
        if (!originalFrameStyles.has(member.id)) {
          originalFrameStyles.set(member.id, {
            transform: frame.style.transform,
            transformOrigin: frame.style.transformOrigin,
            willChange: frame.style.willChange,
            transition: frame.style.transition,
          });
        }
        const dx = member.x - origin.x;
        const dy = member.y - origin.y;
        const newX = nextPreview.x + dx * scaleX;
        const newY = nextPreview.y + dy * scaleY;
        const newW = Math.max(40, member.w * scaleX);
        const newH = Math.max(40, member.h * scaleY);
        const baseTransform = originalFrameStyles.get(member.id)?.transform ?? "";
        frame.style.transformOrigin = "0 0";
        frame.style.transition = "none";
        frame.style.willChange = "transform";
        frame.style.transform = `${baseTransform} translate(${newX - member.x}px, ${newY - member.y}px) scale(${newW / Math.max(1, member.w)}, ${newH / Math.max(1, member.h)})`;
      });
    };

    const clearMemberPreview = () => {
      originalFrameStyles.forEach((style, id) => {
        const frame = blockFrameElement(id, canvasEl);
        if (!frame) return;
        frame.style.transform = style.transform;
        frame.style.transformOrigin = style.transformOrigin;
        frame.style.willChange = style.willChange;
        frame.style.transition = style.transition;
      });
      originalFrameStyles.clear();
    };

    const computePreview = (ev: MouseEvent) => {
      const rawDx = (ev.clientX - startX) / sc;
      const rawDy = (ev.clientY - startY) / sc;
      let { x, y, w, h } = origin;
      if (dir.includes("e")) w = Math.max(40, origin.w + rawDx);
      if (dir.includes("s")) h = Math.max(40, origin.h + rawDy);
      if (dir.includes("w")) {
        const nw = Math.max(40, origin.w - rawDx);
        x = origin.x + (origin.w - nw);
        w = nw;
      }
      if (dir.includes("n")) {
        const nh = Math.max(40, origin.h - rawDy);
          y = origin.y + (origin.h - nh);
          h = nh;
      }
      return { x, y, w, h };
    };

    const move = (ev: MouseEvent) => {
      const nextPreview = computePreview(ev);
      lastPreview = nextPreview;
      if (raf !== null) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setPreview(nextPreview);
        applyMemberPreview(nextPreview);
        raf = null;
      });
    };
    const up = () => {
      if (raf !== null) {
        cancelAnimationFrame(raf);
        raf = null;
      }
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      clearMemberPreview();
      if (lastPreview) resizeGroupAction(memberIds, origin, lastPreview);
      setPreview(null);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const handleStyle = (top: number | string | "auto", left: number | string | "auto", right: number | string | "auto", bottom: number | string | "auto", cursor: string): React.CSSProperties => ({
    position: "absolute",
    top: top === "auto" ? "auto" : top,
    left: left === "auto" ? "auto" : left,
    right: right === "auto" ? "auto" : right,
    bottom: bottom === "auto" ? "auto" : bottom,
    width: 10, height: 10,
    background: SLIDE_HEX.blue,
    border: "1.5px solid white",
    borderRadius: 2,
    cursor,
    pointerEvents: "auto",
    zIndex: 999997,
  });

  return (
    <>
      {/* dashed bbox */}
      <div
        data-export-hide="true"
        style={{
          position: "absolute",
          left: bb.x - 4, top: bb.y - 4,
          width: bb.w + 8, height: bb.h + 8,
          border: `1px dashed ${active ? SLIDE_HEX.blue : SLIDE_RGBA.editorSelectionBorderSoft}`,
          borderRadius: 4,
          pointerEvents: "none",
          zIndex: showHandles ? 999996 : 0,
        }}
      />
      {showHandles && (
        <div
          data-export-hide="true"
          style={{
            position: "absolute",
            left: bb.x - 5, top: bb.y - 5,
            width: bb.w + 10, height: bb.h + 10,
            pointerEvents: "none",
            zIndex: 999997,
          }}
        >
          <div onMouseDown={(e) => startResize("nw", e)} style={handleStyle(-5, -5, "auto", "auto", "nwse-resize")} />
          <div onMouseDown={(e) => startResize("n",  e)} style={{ ...handleStyle(-5, "50%", "auto", "auto", "ns-resize"), marginLeft: -5 }} />
          <div onMouseDown={(e) => startResize("ne", e)} style={handleStyle(-5, "auto", -5, "auto", "nesw-resize")} />
          <div onMouseDown={(e) => startResize("e",  e)} style={{ ...handleStyle("50%", "auto", -5, "auto", "ew-resize"), marginTop: -5 }} />
          <div onMouseDown={(e) => startResize("se", e)} style={handleStyle("auto", "auto", -5, -5, "nwse-resize")} />
          <div onMouseDown={(e) => startResize("s",  e)} style={{ ...handleStyle("auto", "50%", "auto", -5, "ns-resize"), marginLeft: -5 }} />
          <div onMouseDown={(e) => startResize("sw", e)} style={handleStyle("auto", -5, "auto", -5, "nesw-resize")} />
          <div onMouseDown={(e) => startResize("w",  e)} style={{ ...handleStyle("50%", -5, "auto", "auto", "ew-resize"), marginTop: -5 }} />
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// PalettePopover ? paleta de cores rápidas (cores usadas + cores do tema)
// ---------------------------------------------------------------------------
function collectUsedColors(blocks: CustomBlock[]): string[] {
  const set = new Set<string>();
  for (const b of blocks) {
    if (b.kind === "title" || b.kind === "text") set.add(b.color);
    else if (b.kind === "kpi") set.add(b.color);
    else if (b.kind === "shape") set.add(b.fill);
  }
  return Array.from(set).filter(Boolean).slice(0, 7);
}

export function BrandKitPopover({
  selected, readOnly, canEdit,
}: {
  selected: CustomBlock | null;
  readOnly: boolean;
  canEdit: () => boolean;
}) {
  const target = getBrandStyleTarget(selected);
  const styles = getBrandStylesForBlock(selected);

  const apply = (style: SlideBrandStyle) => {
    if (!canEdit()) return;
    if (!selected) {
      toast.info(t.brandKit.selectBlockToast);
      return;
    }
    patchBlockAction(selected.id, buildBrandStylePatch(style, selected), "Alterar estilo");
    toast.success(t.brandKit.appliedToast(style.name));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-[11px]"
          disabled={readOnly}
          title={t.brandKit.trigger}
        >
          <Sparkles className="h-3.5 w-3.5" /> {t.brandKit.trigger}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="space-y-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t.brandKit.officialStyles}
            </div>
            <div className="text-xs text-muted-foreground">
              {selected
                ? t.brandKit.selectedSuffix(brandStyleTargetLabel(target))
                : t.brandKit.selectPrompt}
            </div>
          </div>

          {styles.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/70 p-3 text-xs text-muted-foreground">
              {t.brandKit.noStyles}
            </div>
          ) : (
            <div className="space-y-2">
              {styles.map((style) => (
                <BrandStyleButton
                  key={style.id}
                  style={style}
                  onClick={() => apply(style)}
                />
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function BrandStyleButton({
  style,
  onClick,
}: {
  style: SlideBrandStyle;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg border border-border/60 bg-background/80 p-2 text-left transition hover:border-primary/50 hover:bg-accent/40"
    >
      <div
        className="flex h-12 w-16 shrink-0 items-center justify-center rounded-md border border-border/50"
        style={{ background: `#${style.preview.bg}`, color: `#${style.preview.fg}` }}
      >
        <div className="flex items-center gap-1.5">
          <span
            className="h-6 w-1.5 rounded-full"
            style={{ background: `#${style.preview.accent}` }}
          />
          <span className="text-[13px] font-bold">Aa</span>
        </div>
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs font-semibold text-foreground">{style.name}</div>
        <div className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
          {style.description}
        </div>
      </div>
    </button>
  );
}

export function PalettePopover({
  theme, blocks, selected, readOnly, canEdit,
}: {
  theme: SlideTheme;
  blocks: CustomBlock[];
  selected: CustomBlock | null;
  readOnly: boolean;
  canEdit: () => boolean;
}) {
  const used = collectUsedColors(blocks);
  const canApply = !!selected && (
    selected.kind === "title" || selected.kind === "text" ||
    selected.kind === "kpi" || selected.kind === "shape"
  );

  const apply = (hex: string) => {
    if (!canEdit()) return;
    if (!selected) {
      toast.info(t.palette.selectBlockToast);
      return;
    }
    if (selected.kind === "shape") {
      patchBlockAction(selected.id, { fill: hex } as Partial<CustomBlock>, "Alterar estilo");
    } else if (
      selected.kind === "title" || selected.kind === "text" || selected.kind === "kpi"
    ) {
      patchBlockAction(selected.id, { color: hex } as Partial<CustomBlock>, "Alterar estilo");
    } else {
      toast.info(t.palette.unsupportedToast);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm" variant="ghost"
          className="h-7 gap-1 px-2 text-[11px]"
          disabled={readOnly}
          title={t.palette.title}
        >
          <Paintbrush className="h-3.5 w-3.5" /> {t.palette.trigger}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="space-y-3">
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t.palette.usedColors}
            </div>
            {used.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">{t.palette.noColorsUsed}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {used.map((hex) => (
                  <button
                    key={`u-${hex}`} type="button"
                    onClick={() => apply(hex)}
                    disabled={!canApply}
                    className="h-6 w-6 rounded-md border border-border/50 transition hover:scale-110 disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ background: `#${hex}` }}
                    title={`#${hex}`}
                    aria-label={t.palette.applyColor(hex)}
                  />
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t.palette.themeLabel(theme.name)}
            </div>
            <div className="grid grid-cols-8 gap-1.5">
              {theme.swatches.map((hex, i) => (
                <button
                  key={`t-${i}-${hex}`} type="button"
                  onClick={() => apply(hex)}
                  disabled={!canApply}
                  className="h-6 w-6 rounded-md border border-border/50 transition hover:scale-110 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: `#${hex}` }}
                  title={`#${hex}`}
                  aria-label={t.palette.applyColor(hex)}
                />
              ))}
            </div>
          </div>
          {!canApply && (
            <p className="text-[10px] text-muted-foreground">
              {t.palette.selectPrompt}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ----------------------------------------------------------------------------
// SpeakerNotesBar ? colapsável no rodapé do editor de canvas.
// ----------------------------------------------------------------------------
