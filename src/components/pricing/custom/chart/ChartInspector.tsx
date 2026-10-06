// ChartInspector — PowerPoint-grade design panel for ChartBlock.
// Sections shown depend on chartType. Filters live in a separate tab (already
// handled by FilteredInspector wrapper outside).

import type { BlockDataSource, ChartBlock, CustomTableChartOrientation, KpiMeasureId } from "@/lib/customSlide";
import {
  KPI_MEASURES, BUDGET_UNAVAILABLE_MEASURES, BUDGET_UNAVAILABLE_HINT,
  CHART_TYPE_LABELS, defaultChartTitle, isFromBudgetBase,
} from "@/lib/customSlide";
import {
  ensureChartStyle, defaultChartStyle, DEFAULT_PALETTE,
  type ChartStyle, type SeriesStyle,
  type ConditionalRule, type ReferenceLineCfg, type WaterfallColumn,
} from "./types";
import {
  Section, Row, ToggleField, NumberStepper, ColorField, SelectField,
  Segmented, Slider, MoreOptions, SubGroup,
} from "./Inspector";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ChartTypePicker } from "./ChartTypePicker";
import { usePricing } from "@/store/pricing";
import { useCustomTables } from "@/store/customTables";
import { budgetRowsAsPricingFiltered } from "@/lib/budgetAdapter";
import { applyFilters } from "@/lib/analytics";
import { computeChartSeries, computeTopRanking } from "@/lib/customKpi";
import { getCachedRowsSignature, getOrComputeSlideCalc } from "@/lib/slideCalcCache";
import { buildCustomTableChartData } from "@/lib/customTableChartData";
import { useMemo, useRef, useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Search, X as ClearIcon } from "lucide-react";
import { Trash2, Plus, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSlideFilters } from "../SlideFilterContext";
import { dataSourceLabel } from "@/lib/slideDataSourceTheme";
import { SLIDE_HEX } from "@/lib/slideDesignTokens";
import { DraftInput, DraftNumberInput } from "../DraftInput";
import { strings } from "@/lib/i18n";
import { useDeckBudgetRows, useDeckPricingRows } from "@/hooks/useDeckRows";

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

function unavailableMeasuresForSource(ds: ChartBlock["dataSource"]): readonly string[] {
  if (isFromBudgetBase(ds)) return BUDGET_UNAVAILABLE_MEASURES;
  return [];
}

function unavailableHintForSource(ds: ChartBlock["dataSource"]): string | undefined {
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

/** Empilhamento efetivo das barras: tipo empilhado força empilhar; o modo diz se é 100%. */
function barStacking(ct: ChartBlock["chartType"], mode: ChartStyle["bar"]["mode"]): "grouped" | "stacked" | "stacked100" {
  if (mode === "stacked100") return "stacked100";
  if (ct === "stackedColumn" || ct === "stackedBar" || mode === "stacked") return "stacked";
  return "grouped";
}

/** Tipos sem eixo de tempo: ordenar é por item, nunca por período. */
const NO_PERIOD_ORDER_TYPES: ChartBlock["chartType"][] = [
  "pie", "donut", "funnel", "treemap", "scatter", "bubble", "histogram", "boxplot", "radar",
];
const SLICE_TYPES: ChartBlock["chartType"][] = ["pie", "donut", "funnel", "treemap"];
/** Onde o eixo X é de valores (nos outros é de categorias/períodos e
 *  mínimo, máximo e formato não fazem nada — ver ChartCanvas). */
const NUMERIC_X_TYPES: ChartBlock["chartType"][] = ["hbar", "stackedBar", "scatter", "bubble"];
/** Barras horizontais: o Y é que lista as categorias. */
const CATEGORY_Y_TYPES: ChartBlock["chartType"][] = ["hbar", "stackedBar"];

/** Uma frase dizendo o que o gráfico mostra, lida antes dos controles
 *  ("ROL por período, uma cor por marca"). Null quando a frase não ajudaria. */
function chartDataSummary({ ct, measure, xDim, seriesDim, dimLabel }: {
  ct: ChartBlock["chartType"];
  measure: string;
  xDim: string | null;
  seriesDim: string | null;
  dimLabel: (d: string) => string;
}): string | null {
  const lower = (d: string) => dimLabel(d).toLowerCase();
  if (SLICE_TYPES.includes(ct)) return t.dataSection.summary.slices(measure, lower(seriesDim ?? "marca"));
  if (NO_PERIOD_ORDER_TYPES.includes(ct) || ct === "waterfall" || ct === "mapaBrasil" || ct === "combo") return null;
  const x = xDim && xDim !== "period" ? lower(xDim) : t.dataSection.summary.period;
  return t.dataSection.summary.series(measure, x, seriesDim ? lower(seriesDim) : null);
}

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

/** Roteiro do Slides, item 1.4. Filtra as Section do inspector do Chart por
 *  texto — título da seção OU qualquer rótulo de campo dentro dela.
 *  Imperativo de propósito: mexer no componente `Section`/`Row`
 *  compartilhado (usado por praticamente todo inspector do editor) pra
 *  adicionar lógica de busca teria um raio de impacto muito maior que essa
 *  função, que só olha o DOM já renderizado dentro do container passado. */
function SectionSearchBar({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const wrappers = Array.from(root.querySelectorAll<HTMLElement>(":scope > .surface-raised"));
    const q = query.trim().toLowerCase();
    if (!q) {
      wrappers.forEach((w) => { w.style.display = ""; });
      return;
    }
    wrappers.forEach((w) => {
      // textContent (não innerText) pra achar também o que está guardado
      // em "Mais opções" — o conteúdo está montado, só oculto.
      const matches = (w.textContent ?? "").toLowerCase().includes(q);
      w.style.display = matches ? "" : "none";
      if (matches) {
        const toggle = w.querySelector<HTMLButtonElement>('[data-inspector-section-toggle="true"]');
        if (toggle && toggle.getAttribute("aria-expanded") === "false") toggle.click();
        w.querySelectorAll<HTMLButtonElement>('[data-inspector-more-toggle="true"][aria-expanded="false"]').forEach((more) => {
          const panel = more.nextElementSibling;
          if ((panel?.textContent ?? "").toLowerCase().includes(q)) more.click();
        });
      }
    });
  }, [query, containerRef]);

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t.inspectorSearch.placeholder}
        className="h-8 pl-8 pr-8 text-[12px]"
      />
      {query && (
        <button
          type="button"
          onClick={() => setQuery("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
          aria-label={t.inspectorSearch.clearAria}
        >
          <ClearIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
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
  // "Mais opções" abre sozinho quando algum desses campos saiu do padrão.
  const defaults = useMemo(() => defaultChartStyle(), []);
  const changed = <K extends keyof ChartStyle>(key: K, fields: (keyof ChartStyle[K])[]) =>
    fields.some((f) => JSON.stringify((style[key] as ChartStyle[K])?.[f])
      !== JSON.stringify((defaults[key] as ChartStyle[K])?.[f]));

  const ct = block.chartType;
  const S = sectionsFor(ct);
  const { clearFilter } = useSlideFilters();
  const sectionsRef = useRef<HTMLDivElement>(null);

  // Detect actual series/categories present on canvas to drive per-item editors
  const pricing = useDeckPricingRows();
  const budget = useDeckBudgetRows();
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
    return pricing;
  }, [dataSource, pricing, budget]);
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
    ];
    onChange({
      comboSeries: defaults,
      style: {
        ...block.style,
        series: [
          ...style.series.filter((s) => !defaults.some((d) => d.name === s.key)),
          { key: "Volume Real", color: SLIDE_HEX.chart1, asLine: true },
          { key: "Volume Budget", color: SLIDE_HEX.chart2, asLine: true, lineStyle: "dashed" },
        ],
      },
    } as Patch);
  };

  // O título automático ("CM % por mês", ou o nome do tipo em gráficos
  // antigos) acompanha tipo e medida; um título escrito pela pessoa nunca
  // é trocado.
  const withAutoTitle = (next: { chartType?: ChartBlock["chartType"]; measure?: KpiMeasureId }): Patch => {
    const isAutoTitle = !block.title
      || block.title === defaultChartTitle(block.chartType, block.measure)
      || block.title === CHART_TYPE_LABELS[block.chartType];
    if (!isAutoTitle) return next as Patch;
    return {
      ...next,
      title: defaultChartTitle(next.chartType ?? block.chartType, next.measure ?? block.measure),
    } as Patch;
  };

  const dimOptions: { value: string; label: string }[] = block.measure === "positivacao"
    ? POSITIVACAO_BREAKDOWN_OPTIONS
    : [
        { value: "marca", label: t.dataSection.dims.marca },
        { value: "canalAjustado", label: t.dataSection.dims.canalAjustado },
        { value: "gestorResp", label: t.dataSection.dims.gestorResp },
        { value: "categoria", label: t.dataSection.dims.categoria },
        { value: "mercado", label: t.dataSection.dims.mercado },
        { value: "inovacao", label: t.dataSection.dims.inovacao },
      ];
  // O que o canvas usa pra separar séries (colorDim antigo tem prioridade).
  const seriesDim = block.fieldWells?.colorDim ?? block.breakdown ?? null;
  // Tipos sem eixo de tempo: a ordem é de itens, não de períodos.
  const isRankingType = NO_PERIOD_ORDER_TYPES.includes(ct);
  const xIsTime = !block.fieldWells?.xDim || block.fieldWells.xDim === "period";
  // Ordem de período só existe com o tempo no eixo X.
  const periodOrder = xIsTime && !isRankingType;
  const sortKey = (() => {
    const sc = block.sortConfig;
    if (!sc || (!periodOrder && sc.field === "period")) return periodOrder ? "period:asc" : "value:desc";
    return `${sc.field}:${sc.dir}`;
  })();
  // Com o tempo no eixo X e uma série só, ordenar por valor/nome não muda
  // nada no desenho (só reordena séries) — então nem oferece.
  const canOrderItems = !periodOrder || !!seriesDim || ct === "combo";
  const sortOptions = [
    ...(!periodOrder ? [] : [
      { value: "period:asc", label: t.dataSection.orderOptions.periodAsc },
      { value: "period:desc", label: t.dataSection.orderOptions.periodDesc },
    ]),
    ...(canOrderItems ? [
      { value: "value:desc", label: t.dataSection.orderOptions.valueDesc },
      { value: "value:asc", label: t.dataSection.orderOptions.valueAsc },
      { value: "name:asc", label: t.dataSection.orderOptions.nameAsc },
      { value: "name:desc", label: t.dataSection.orderOptions.nameDesc },
    ] : []),
  ];
  const dataSummary = isCustomSource ? null : chartDataSummary({
    ct,
    measure: KPI_MEASURES.find((m) => m.id === block.measure)?.label ?? block.measure,
    xDim: block.fieldWells?.xDim ?? null,
    seriesDim,
    dimLabel: (d) => dimOptions.find((o) => o.value === d)?.label ?? d,
  });

  return (
    <div className="space-y-3">
      {/* Chart type picker — always visible at top */}
      <div className="rounded-lg border border-border/50 bg-card/40 px-2 py-2">
        <ChartTypePicker value={ct} onChange={(v) => {
          // O tipo manda no empilhamento: escolher "Coluna" depois de
          // "Coluna empilhada" não pode continuar empilhado por um modo antigo.
          const stackedType = v === "stackedColumn" || v === "stackedBar";
          const barMode = ["bar", "column", "hbar"].includes(v)
            ? "grouped"
            : stackedType && style.bar.mode === "grouped" ? "stacked" : style.bar.mode;
          const areaStacked = v === "stackedArea" ? true : v === "area" ? false : style.area.stacked;
          const styleChanged = barMode !== style.bar.mode || areaStacked !== style.area.stacked;
          onChange({
            ...withAutoTitle({ chartType: v }),
            ...(styleChanged
              ? { style: { ...block.style, bar: { ...style.bar, mode: barMode }, area: { ...style.area, stacked: areaStacked } } }
              : {}),
          } as Patch);
        }} />
      </div>

      {/* Roteiro do Slides, item 1.4: busca dentro do inspector. O Chart é o
       * único inspector com seções demais (9-10 visíveis por vez, ~11
       * tipo-específicas no total) pra valer a pena — os outros (KPI, Omni)
       * têm poucas seções e não precisam. Filtra por texto renderizado
       * (título da seção OU qualquer rótulo de campo dentro dela), de
       * forma imperativa via DOM — não mexe no componente Section/Row
       * compartilhado, que é usado por praticamente todo inspector do
       * editor; qualquer mudança ali teria um raio de impacto enorme. */}
      <SectionSearchBar containerRef={sectionsRef} />

      <div ref={sectionsRef} className="space-y-3">
      {/* Item 7 (análise "Elementos do Editor de Slides"): as abas internas
       * Dados/Visual/Análises foram removidas — o Chart era o único tipo
       * de bloco com abas dentro de abas ("Design" já é uma aba externa
       * do FilteredInspector). Quase todo o conteúdo já vivia dentro de
       * <Section> (accordion), então "achatar" foi só isso: tirar o
       * wrapper <Tabs> e deixar as Section como irmãs diretas, na MESMA
       * ordem que as abas tinham (Dados → Visual → Análises) — sem
       * reordenar por uso, decisão explícita do usuário. */}
      {/* ============================ DADOS ============================ */}
      {/* ===== Data ===== */}
      <Section title={t.dataSection.title} defaultOpen>
        {dataSummary && (
          <p className="rounded-md bg-primary/5 px-2.5 py-1.5 text-[12px] leading-snug text-foreground/80" data-chart-data-summary>
            {dataSummary}
          </p>
        )}
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
            onChange={(v) => onChange(withAutoTitle({ measure: v as KpiMeasureId }))}
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
                        patchComboSeries(series.id, {
                          dataSource: nextSource,
                          measure: unavailableMeasuresForSource(nextSource).includes(series.measure) ? "volume" : series.measure,
                        });
                      }}
                      options={[
                        { value: "ke30", label: t.dataSection.multiBase.sourceOptions.real },
                        { value: "budget", label: t.dataSection.multiBase.sourceOptions.budget },
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
        {/* "Quebrar por" e "Cor / Legenda" eram o mesmo controle duas vezes:
            o desenho usa `colorDim ?? breakdown`, então com os dois
            preenchidos um anulava o outro em silêncio. Ficou um só. */}
        {ct !== "mapaBrasil" && (ct !== "waterfall" || (style.waterfall.mode ?? "pvm") === "manual") && (
          <Row label={isRankingType ? t.dataSection.breakdown : t.dataSection.splitBy}>
            <SelectField value={seriesDim ?? "__none__"}
              onChange={(v) => {
                clearFilter(block.id);
                onChange({
                  breakdown: v === "__none__" ? null : v,
                  ...(block.fieldWells?.colorDim ? { fieldWells: { ...block.fieldWells, colorDim: null } } : {}),
                });
              }}
              options={[
                { value: "__none__", label: t.dataSection.breakdownSingleSeries },
                ...dimOptions,
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

        {(ct === "scatter" || ct === "bubble") && (
          <Row label={t.dataSection.pointLabel}>
            <SelectField value={block.fieldWells?.labelDim ?? "__none__"}
              onChange={(v) => onChange({
                fieldWells: { ...(block.fieldWells ?? {}), labelDim: v === "__none__" ? null : v },
              })}
              options={[{ value: "__none__", label: tc.noneOption }, ...dimOptions]} />
          </Row>
        )}

        {/* Ordem: era "Ordenar por" + "Direção: Asc/Desc" (jargão, 2
            controles). Agora uma escolha só, dita como a pessoa pensa. */}
        <Row label={t.dataSection.order}>
          <SelectField value={sortKey}
            onChange={(v) => {
              const [field, dir] = v.split(":") as [string, "asc" | "desc"];
              onChange({ sortConfig: { field: field as never, dir } });
            }}
            options={sortOptions} />
        </Row>

        {/* Dica extra só aparece ao passar o mouse na apresentação — ajuste
            fino, não algo que define o gráfico. */}
        {["line", "area", "stackedArea", "bar", "column", "hbar",
          "stackedColumn", "stackedBar", "combo", "scatter", "bubble"].includes(ct) && (
          <MoreOptions customized={!!block.fieldWells?.tooltipMeasure}>
            <Row label={t.dataSection.tooltipExtra}>
              <SelectField value={(block.fieldWells?.tooltipMeasure ?? "__none__") as string}
                onChange={(v) => onChange({
                  fieldWells: { ...(block.fieldWells ?? {}),
                    tooltipMeasure: v === "__none__" ? null : v as KpiMeasureId },
                })}
                options={[
                  { value: "__none__", label: tc.noneOption },
                  ...KPI_MEASURES.map((m) => ({
                    value: m.id, label: m.label,
                    disabled: unavailableMeasuresForSource(block.dataSource).includes(m.id),
                  })),
                ]} />
            </Row>
          </MoreOptions>
        )}

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

      {/* ============================ VISUAL ============================ */}

      {/* ============================================================ */}
      {/* FIX 3 — Chart-specific sections appear FIRST (most relevant) */}
      {/* ============================================================ */}

      {/* Roteiro do Slides, item 1.2: as ~11 seções tipo-específicas abaixo
       * (Barras, Pizza/Rosca, Bolhas, Área, Waterfall, Funil, Treemap,
       * Mapa, Radar, Histograma, Boxplot) ganharam defaultOpen. Só uma
       * delas renderiza por vez (gated por `ct`), então abrir todas por
       * padrão é seguro — nunca aparece mais de uma ao mesmo tempo. Antes,
       * só "Dados" abria por padrão; agora quem troca de tipo de gráfico
       * já vê direto o estilo daquele tipo, sem precisar abrir a seção
       * manualmente toda vez. "Dados" continua aberta também — nada foi
       * escondido, só ganhou companhia. */}
      {/* ===== Type-specific: Bar ===== */}
      {S.showBar && (
        <Section title={t.bar.title} defaultOpen onReset={() => resetPath("bar")}>
          {/* Empilhamento mostra o que está DESENHADO e troca o tipo junto.
              Antes "Coluna empilhada" convivia com "Tipo: Agrupado" — o
              desenho forçava empilhar e mudar o Tipo não fazia nada. */}
          <Row label={t.bar.stacking}>
            <Segmented value={barStacking(ct, style.bar.mode)}
              onChange={(v) => {
                const horizontal = ct === "hbar" || ct === "stackedBar";
                const nextType: ChartBlock["chartType"] = v === "grouped"
                  ? (horizontal ? "hbar" : "bar")
                  : (horizontal ? "stackedBar" : "stackedColumn");
                onChange({
                  ...withAutoTitle({ chartType: nextType }),
                  style: { ...block.style, bar: { ...style.bar, mode: v as never } },
                } as Patch);
              }}
              options={[
                { value: "grouped", label: t.bar.modeOptions.grouped },
                { value: "stacked", label: t.bar.modeOptions.stacked },
                { value: "stacked100", label: t.bar.modeOptions.stacked100 },
              ]} />
          </Row>
          <MoreOptions customized={changed("bar", ["gapPct", "cornerRadius", "borderColor", "borderWidth"])}>
            <Row label={tc.spacing}>
              <NumberStepper value={style.bar.gapPct} min={0} max={80}
                onChange={(v) => updPath("bar", { gapPct: v })} suffix="%" />
            </Row>
            <Row label={t.bar.corners}>
              <NumberStepper value={style.bar.cornerRadius} min={0} max={20}
                onChange={(v) => updPath("bar", { cornerRadius: v })} suffix="px" />
            </Row>
            <Row label={tc.borderWidth}>
              <NumberStepper value={style.bar.borderWidth} min={0} max={5}
                onChange={(v) => updPath("bar", { borderWidth: v })} suffix="px" />
            </Row>
            {style.bar.borderWidth > 0 && (
              <Row label={tc.borderColor}><ColorField value={style.bar.borderColor}
                onChange={(c) => updPath("bar", { borderColor: c })} /></Row>
            )}
          </MoreOptions>
        </Section>
      )}

      {/* ===== Type-specific: Pie/Donut ===== */}
      {S.isPie && (
        <Section title={t.pie.title} defaultOpen onReset={() => resetPath("pie")}>
          {ct === "donut" && (
            <Row label={t.pie.hole}>
              <NumberStepper value={style.pie.donutHolePct} min={0} max={80}
                onChange={(v) => updPath("pie", { donutHolePct: v })} suffix="%" />
            </Row>
          )}
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
          {detectedRanking.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[12px] font-medium text-muted-foreground">{t.pie.slices}</div>
              {detectedRanking.map((name, i) => {
                const sl = style.pie.slices[name] ?? {};
                return (
                  <Row key={name} label={name}>
                    <div className="flex justify-end">
                      <ColorField value={sl.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length]}
                        onChange={(c) => updPath("pie", {
                          slices: { ...style.pie.slices, [name]: { ...sl, color: c } },
                        })} />
                    </div>
                  </Row>
                );
              })}
            </div>
          )}
          <MoreOptions customized={changed("pie", ["startAngle", "explodePct"])
            || Object.values(style.pie.slices).some((s) => (s.explode ?? 0) > 0)}>
            <Row label={t.pie.startAngle}>
              <NumberStepper value={style.pie.startAngle} min={0} max={360}
                onChange={(v) => updPath("pie", { startAngle: v })} suffix="°" />
            </Row>
            <Row label={t.pie.explosion}>
              <Slider value={style.pie.explodePct} max={30}
                onChange={(v) => updPath("pie", { explodePct: v })} />
            </Row>
            {detectedRanking.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[12px] font-medium text-muted-foreground">{t.pie.sliceExplosion}</div>
                {detectedRanking.map((name) => {
                  const sl = style.pie.slices[name] ?? {};
                  return (
                    <Row key={name} label={name}>
                      <Slider value={sl.explode ?? 0} max={30}
                        onChange={(v) => updPath("pie", {
                          slices: { ...style.pie.slices, [name]: { ...sl, explode: v } },
                        })} />
                    </Row>
                  );
                })}
              </div>
            )}
          </MoreOptions>
        </Section>
      )}

      {/* ===== Type-specific: Bubble / Scatter =====
          Dispersão renderiza os pontos com os MESMOS campos de style.bubble
          (fillOpacity/borderColor/borderWidth — ver ChartCanvas.tsx, o
          <Scatter> de bubble e scatter é o mesmo elemento) — só não tem
          tamanho variável (sem ZAxis). Por isso reaproveita a seção inteira,
          só escondendo os 2 campos que não fazem sentido sem essa dimensão. */}
      {(ct === "bubble" || ct === "scatter") && (
        <Section title={ct === "scatter" ? t.bubble.titleScatter : t.bubble.title} defaultOpen onReset={() => resetPath("bubble")}>
          {ct === "bubble" && (
            <>
              <Row label={t.bubble.minSize}>
                <NumberStepper value={style.bubble.minSize} min={20} max={500}
                  onChange={(v) => updPath("bubble", { minSize: v })} suffix="px" />
              </Row>
              <Row label={t.bubble.maxSize}>
                <NumberStepper value={style.bubble.maxSize} min={50} max={2000}
                  onChange={(v) => updPath("bubble", { maxSize: v })} suffix="px" />
              </Row>
            </>
          )}
          <Row label={t.bubble.opacity}>
            <Slider value={Math.round(style.bubble.fillOpacity * 100)}
              onChange={(v) => updPath("bubble", { fillOpacity: v / 100 })} />
          </Row>
          {ct === "bubble" && (
            <ToggleField label={t.bubble.showSizeLabel}
              value={style.bubble.showSizeLabel}
              onChange={(v) => updPath("bubble", { showSizeLabel: v })} />
          )}
          <MoreOptions customized={changed("bubble", ["borderColor", "borderWidth"])}>
            <Row label={tc.borderWidth}>
              <NumberStepper value={style.bubble.borderWidth} min={0} max={5}
                onChange={(v) => updPath("bubble", { borderWidth: v })} suffix="px" />
            </Row>
            {style.bubble.borderWidth > 0 && (
              <Row label={tc.borderColor}><ColorField value={style.bubble.borderColor}
                onChange={(c) => updPath("bubble", { borderColor: c })} /></Row>
            )}
          </MoreOptions>
        </Section>
      )}

      {/* ===== Type-specific: Area ===== */}
      {S.showArea && (
        <Section title={t.area.title} defaultOpen onReset={() => resetPath("area")}>
          {/* Mesmo princípio das barras: reflete o desenho e troca o tipo. */}
          <ToggleField label={t.area.stacked} value={ct === "stackedArea" || style.area.stacked}
            onChange={(v) => onChange({
              ...withAutoTitle({ chartType: v ? "stackedArea" : "area" }),
              style: { ...block.style, area: { ...style.area, stacked: v } },
            } as Patch)} />
          <ToggleField label={t.area.lineOnTop} value={style.area.lineOnTop}
            onChange={(v) => updPath("area", { lineOnTop: v })} />
        </Section>
      )}

      {/* ===== Type-specific: Waterfall ===== */}
      {ct === "waterfall" && (
        <Section title={t.waterfall.title} defaultOpen onReset={() => resetPath("waterfall")}>
          <PvmBridgePicker block={block} style={style} dsRows={dsRows} updPath={updPath} />
          <Row label={t.waterfall.positiveColor}><ColorField value={style.waterfall.positiveColor}
            onChange={(c) => updPath("waterfall", { positiveColor: c })} /></Row>
          <Row label={t.waterfall.negativeColor}><ColorField value={style.waterfall.negativeColor}
            onChange={(c) => updPath("waterfall", { negativeColor: c })} /></Row>
          <Row label={t.waterfall.totalColor}><ColorField value={style.waterfall.totalColor}
            onChange={(c) => updPath("waterfall", { totalColor: c })} /></Row>
          <ToggleField label={t.waterfall.runningTotal} value={style.waterfall.showRunningTotal}
            onChange={(v) => updPath("waterfall", { showRunningTotal: v })} />
          <ToggleField label={t.waterfall.connectors} value={style.waterfall.connectors}
            onChange={(v) => updPath("waterfall", { connectors: v })} />
          <MoreOptions customized={changed("waterfall", ["connectorColor", "connectorStyle", "wrapLabels", "gapPct"])}>
            {style.waterfall.connectors && (
              <>
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
              </>
            )}
            <ToggleField label={t.waterfall.wrapLabels} value={style.waterfall.wrapLabels ?? false}
              onChange={(v) => updPath("waterfall", { wrapLabels: v })} />
            {style.waterfall.wrapLabels && (
              <div className="text-[11px] text-muted-foreground leading-snug -mt-1">{t.waterfall.wrapLabelsHint}</div>
            )}
            <Row label={tc.spacing}>
              <NumberStepper value={style.waterfall.gapPct} min={0} max={80}
                onChange={(v) => updPath("waterfall", { gapPct: v })} suffix="%" />
            </Row>
          </MoreOptions>
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
        <Section title={t.funnel.title} defaultOpen onReset={() => resetPath("funnel")}>
          <Row label={tc.direction}>
            <Segmented value={style.funnel.direction}
              onChange={(v) => updPath("funnel", { direction: v as never })}
              options={[
                { value: "ttb", label: t.funnel.directionOptions.ttb },
                { value: "btt", label: t.funnel.directionOptions.btt },
              ]} />
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
          <MoreOptions customized={changed("funnel", ["gapPct"])}>
            <Row label={tc.spacing}>
              <Slider value={style.funnel.gapPct} max={20}
                onChange={(v) => updPath("funnel", { gapPct: v })} />
            </Row>
          </MoreOptions>
        </Section>
      )}

      {/* ===== Type-specific: Treemap ===== */}
      {ct === "treemap" && (
        <Section title={t.treemap.title} defaultOpen onReset={() => resetPath("treemap")}>
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
          <MoreOptions customized={changed("treemap", ["borderColor", "borderWidth"])}>
            <Row label={tc.borderWidth}>
              <NumberStepper value={style.treemap.borderWidth} min={0} max={5}
                onChange={(v) => updPath("treemap", { borderWidth: v })} suffix="px" />
            </Row>
            {style.treemap.borderWidth > 0 && (
              <Row label={tc.borderColor}>
                <ColorField value={style.treemap.borderColor}
                  onChange={(c) => updPath("treemap", { borderColor: c })} />
              </Row>
            )}
          </MoreOptions>
        </Section>
      )}

      {/* ===== Type-specific: Brazil map ===== */}
      {ct === "mapaBrasil" && (
        <Section title={t.mapaBrasil.title} defaultOpen onReset={() => resetPath("mapaBrasil")}>
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
        <Section title={t.radar.title} defaultOpen onReset={() => resetPath("radar")}>
          <ToggleField label={t.radar.fillArea} value={style.radar.fillArea}
            onChange={(v) => updPath("radar", { fillArea: v })} />
          {style.radar.fillArea && (
            <Row label={t.radar.fillOpacity}>
              <Slider value={Math.round(style.radar.fillOpacity * 100)}
                onChange={(v) => updPath("radar", { fillOpacity: v / 100 })} />
            </Row>
          )}
          <Row label={t.radar.gridShape}>
            <Segmented value={style.radar.gridShape}
              onChange={(v) => updPath("radar", { gridShape: v as never })}
              options={[
                { value: "polygon", label: t.radar.gridShapeOptions.polygon },
                { value: "circle", label: t.radar.gridShapeOptions.circle },
              ]} />
          </Row>
          <MoreOptions customized={changed("radar", ["gridColor", "axisLabelSize", "axisLabelColor"])}>
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
          </MoreOptions>
        </Section>
      )}

      {/* ===== Type-specific: Histogram ===== */}
      {ct === "histogram" && (
        <Section title={t.histogram.title} defaultOpen onReset={() => resetPath("histogram")}>
          <Row label={t.histogram.bins}>
            <NumberStepper value={style.histogram.bins} min={2} max={100}
              onChange={(v) => updPath("histogram", { bins: v })} />
          </Row>
          <Row label={t.histogram.barColor}>
            <ColorField value={style.histogram.barColor}
              onChange={(c) => updPath("histogram", { barColor: c })} />
          </Row>
          <ToggleField label={t.histogram.cumulative} value={style.histogram.cumulative}
            onChange={(v) => updPath("histogram", { cumulative: v })} />
          <MoreOptions customized={changed("histogram", ["binWidth", "borderColor", "borderWidth"])}>
            <Row label={t.histogram.binWidth}>
              <DraftNumberInput className="h-8 text-[13px]"
                value={style.histogram.binWidth ?? null} placeholder="auto"
                fallback={null}
                onCommit={(value) => updPath("histogram", { binWidth: value })} />
            </Row>
            <Row label={tc.borderWidth}>
              <NumberStepper value={style.histogram.borderWidth} min={0} max={5}
                onChange={(v) => updPath("histogram", { borderWidth: v })} suffix="px" />
            </Row>
            {style.histogram.borderWidth > 0 && (
              <Row label={tc.borderColor}>
                <ColorField value={style.histogram.borderColor}
                  onChange={(c) => updPath("histogram", { borderColor: c })} />
              </Row>
            )}
          </MoreOptions>
        </Section>
      )}

      {/* ===== Type-specific: Boxplot ===== */}
      {ct === "boxplot" && (
        <Section title={t.boxplot.title} defaultOpen onReset={() => resetPath("boxplot")}>
          <Row label={t.boxplot.boxColor}>
            <ColorField value={style.boxplot.boxFillColor}
              onChange={(c) => updPath("boxplot", { boxFillColor: c })} />
          </Row>
          <Row label={t.boxplot.whiskerColor}>
            <ColorField value={style.boxplot.whiskerColor}
              onChange={(c) => updPath("boxplot", { whiskerColor: c })} />
          </Row>
          <ToggleField label={t.boxplot.showMean} value={style.boxplot.showMean}
            onChange={(v) => updPath("boxplot", { showMean: v })} />
          <ToggleField label={t.boxplot.showOutliers} value={style.boxplot.showOutliers}
            onChange={(v) => updPath("boxplot", { showOutliers: v })} />
          <MoreOptions customized={changed("boxplot", ["whiskerWidth", "medianColor", "medianWidth"])}>
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
          </MoreOptions>
        </Section>
      )}

      {/* ===== Séries — onde mora a cor de cada série =====
          Uma linha por série (nome + cor). O que é ajuste fino de linha
          (traço, espessura, suavizar, marcador) fica em "Mais opções" da
          própria série — antes eram 7 controles × N séries sempre à vista. */}
      {S.showSeries && (
        <Section title={t.series.title} defaultOpen onReset={() => updStyle({ series: [] })}>
          {detectedSeries.length === 0 && (
            <p className="text-[11px] text-muted-foreground">{t.series.noneDetected}</p>
          )}
          {(detectedSeries.length === 0 ? ["Total"] : detectedSeries).map((name, i) => {
            const cfg = getSeriesCfg(name);
            const hasLineProps = S.showLineSeriesProps || S.showArea || ct === "line" || ct === "scatter" || ct === "combo";
            const lineCustomized = cfg.lineStyle !== undefined || cfg.thickness !== undefined
              || cfg.smooth !== undefined || cfg.areaOpacity !== undefined || cfg.marker !== undefined;
            const colorRow = (
              <Row label={name}>
                <ColorField value={cfg.color ?? DEFAULT_PALETTE[i % DEFAULT_PALETTE.length]}
                  onChange={(c) => updSeries(name, { color: c })} />
              </Row>
            );
            if (!hasLineProps && !S.isCombo) return <div key={name}>{colorRow}</div>;
            return (
              <div key={name} className="space-y-2 rounded border border-border/30 p-2.5">
                {colorRow}
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
                {hasLineProps && (
                  <MoreOptions customized={lineCustomized}>
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
                  </MoreOptions>
                )}
              </div>
            );
          })}
        </Section>
      )}

      {/* ===== Rótulos de dados =====
          Desligados, só o interruptor aparece. Ligados: o essencial à vista
          (tamanho, cor, posição, formato); acabamento em "Mais opções". */}
      <Section title={t.dataLabels.title} onReset={() => resetPath("dataLabels")}>
        <ToggleField label={t.dataLabels.show} value={style.dataLabels.show}
          onChange={(v) => updPath("dataLabels", { show: v })} />
        {style.dataLabels.show && (
          <>
            <Row label={t.dataLabels.size}>
              <NumberStepper value={style.dataLabels.size} min={6} max={24}
                onChange={(v) => updPath("dataLabels", { size: v })} suffix="pt" />
            </Row>
            <Row label={tc.color}><ColorField value={style.dataLabels.color}
              onChange={(c) => updPath("dataLabels", { color: c })} /></Row>
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
            <MoreOptions customized={changed("dataLabels", [
              "bold", "italic", "decimals", "autoContrast", "showSeries", "showCategory",
              "bgOpacity", "borderWidth",
            ])}>
              {ct !== "histogram" && (
                <Row label={tc.decimals}>
                  <NumberStepper value={style.dataLabels.decimals} min={0} max={4}
                    onChange={(v) => updPath("dataLabels", { decimals: v })} />
                </Row>
              )}
              <ToggleField label={tc.bold} value={style.dataLabels.bold}
                onChange={(v) => updPath("dataLabels", { bold: v })} />
              <ToggleField label={tc.italic} value={style.dataLabels.italic}
                onChange={(v) => updPath("dataLabels", { italic: v })} />
              <ToggleField label={t.dataLabels.autoContrast} value={style.dataLabels.autoContrast}
                onChange={(v) => updPath("dataLabels", { autoContrast: v })} />
              {ct !== "pie" && ct !== "donut" && (
                <ToggleField label={t.dataLabels.showSeriesName} value={style.dataLabels.showSeries}
                  onChange={(v) => updPath("dataLabels", { showSeries: v })} />
              )}
              <ToggleField label={t.dataLabels.showCategory} value={style.dataLabels.showCategory}
                onChange={(v) => updPath("dataLabels", { showCategory: v })} />
              <Row label={t.dataLabels.backgroundOpacity}>
                <Slider value={Math.round(style.dataLabels.bgOpacity * 100)}
                  onChange={(v) => updPath("dataLabels", { bgOpacity: v / 100 })} />
              </Row>
              {style.dataLabels.bgOpacity > 0 && (
                <Row label={t.dataLabels.background}>
                  <ColorField value={style.dataLabels.bgColor}
                    onChange={(c) => updPath("dataLabels", { bgColor: c })} />
                </Row>
              )}
              <Row label={tc.borderWidth}>
                <NumberStepper value={style.dataLabels.borderWidth} min={0} max={5}
                  onChange={(v) => updPath("dataLabels", { borderWidth: v })} suffix="px" />
              </Row>
              {style.dataLabels.borderWidth > 0 && (
                <Row label={tc.borderColor}>
                  <ColorField value={style.dataLabels.borderColor}
                    onChange={(c) => updPath("dataLabels", { borderColor: c })} />
                </Row>
              )}
            </MoreOptions>
          </>
        )}
      </Section>

      {/* ===== Título e legenda (era "Geral") =====
          À vista: o texto do título e a legenda. Tipografia do título,
          fundo, borda e respiro ficam em "Mais opções". */}
      <Section title={t.general.titleAndLegend} onReset={() => resetPath("general")}>
        <ToggleField label={t.general.showTitle} value={style.general.titleShow}
          onChange={(v) => updPath("general", { titleShow: v })} />
        {style.general.titleShow && (
          <DraftInput className="h-8 text-[13px]" value={block.title ?? ""}
            aria-label={t.general.chartTitleLabel}
            placeholder={t.general.chartTitleLabel}
            onCommit={(value) => onChange({ title: value })} />
        )}
        <ToggleField label={t.general.showLegend} value={style.general.legendShow}
          onChange={(v) => updPath("general", { legendShow: v })} />
        {style.general.legendShow && (
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
        )}
        <MoreOptions customized={changed("general", [
          "titleSize", "titleColor", "titleBold", "titleItalic", "background", "borderWidth", "padding",
        ])}>
          {style.general.titleShow && (
            <>
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
            </>
          )}
          <Row label={t.general.background}>
            <ColorField value={style.general.background} allowTransparent
              onChange={(c) => updPath("general", { background: c })} />
          </Row>
          <Row label={tc.borderWidth}>
            <NumberStepper value={style.general.borderWidth} min={0} max={8}
              onChange={(v) => updPath("general", { borderWidth: v })} suffix="px" />
          </Row>
          {style.general.borderWidth > 0 && (
            <Row label={tc.borderColor}>
              <ColorField value={style.general.borderColor}
                onChange={(c) => updPath("general", { borderColor: c })} />
            </Row>
          )}
          <Row label={t.general.padding}>
            <NumberStepper value={style.general.padding} min={0} max={40}
              onChange={(v) => updPath("general", { padding: v })} suffix="px" />
          </Row>
        </MoreOptions>
      </Section>

      {/* ===== Eixos e grade — eram 3-4 seções sanfonadas separadas ===== */}
      {S.showAxes && (
        <Section title={S.showGrid ? t.axis.axesAndGrid : t.axis.axes}>
          <AxisGroup title={t.axis.titleX} axis={style.xAxis} defaults={defaults.xAxis}
            valueAxis={NUMERIC_X_TYPES.includes(ct)}
            onChange={(p) => updPath("xAxis", p)}
            onReset={() => resetPath("xAxis")} />
          <AxisGroup title={t.axis.titleY} axis={style.yAxis} defaults={defaults.yAxis}
            valueAxis={!CATEGORY_Y_TYPES.includes(ct)}
            onChange={(p) => updPath("yAxis", p)}
            onReset={() => resetPath("yAxis")} />
          {S.isCombo && (
            <AxisGroup title={t.axis.titleY2} axis={style.yAxis2!} defaults={defaults.yAxis2!}
              valueAxis
              onChange={(p) => updPath("yAxis2", p)}
              onReset={() => resetPath("yAxis2")} />
          )}
          {S.showGrid && (
            <SubGroup title={t.grid.title} onReset={() => resetPath("grid")}>
              <ToggleField label={t.grid.show} value={style.grid.show}
                onChange={(v) => updPath("grid", { show: v })} />
              {style.grid.show && (
                <>
                  <Row label={tc.color}><ColorField value={style.grid.color}
                    onChange={(c) => updPath("grid", { color: c })} /></Row>
                  <Row label={tc.style}>
                    <Segmented value={style.grid.style}
                      onChange={(v) => updPath("grid", { style: v as never })}
                      options={[{ value: "solid", label: tc.lineStylesShort.solid }, { value: "dashed", label: tc.lineStylesShort.dashed }]} />
                  </Row>
                </>
              )}
            </SubGroup>
          )}
        </Section>
      )}

      {/* ===== Avançado =====
          Formatação condicional, análises (referência/tendência/projeção) e
          interatividade eram 3 seções sempre listadas; uso raro, então
          moram juntas numa só. O cartão "Sem análises disponíveis" saiu:
          avisar que algo não existe só ocupava espaço. */}
      <Section title={t.advanced}>
        {/* B.2 — Pizza/Rosca entraram aqui porque já tinham a
            infraestrutura de "cor por fatia" (style.pie.slices) — faltava
            só ligar a regra condicional como alternativa à cor manual. */}
        {["bar", "column", "hbar", "waterfall", "treemap", "pie", "donut"].includes(ct) && (
          <ConditionalSection
            rules={style.conditionalRules ?? []}
            defaultColor={style.conditionalDefault ?? ""}
            onRules={(rules) => updStyle({ conditionalRules: rules })}
            onDefault={(c) => updStyle({ conditionalDefault: c })} />
        )}
        {["line", "area", "combo", "bar", "column", "hbar", "scatter", "bubble"].includes(ct) && (
          <AnalyticsSection
            analytics={style.analytics!}
            onChange={(p) => updPath("analytics", p as never)} />
        )}
        {/* Interatividade vale só na apresentação ao vivo. */}
        <SubGroup title={t.interactivity.title}>
          <ToggleField label={t.interactivity.emitFilter}
            value={block.emitsCrossFilter !== false}
            onChange={(v) => onChange({ emitsCrossFilter: v })} />
          <ToggleField label={t.interactivity.receiveFilter}
            value={block.participatesInCrossFilter !== false}
            onChange={(v) => onChange({ participatesInCrossFilter: v })} />
        </SubGroup>
      </Section>
      </div>
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
    <SubGroup title={t.analytics.title}>
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
            <MoreOptions customized={rl.style !== "dashed" || rl.thickness !== 1.5}>
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
            </MoreOptions>
          </div>
        ))}
      </div>

      <div className="mt-2 space-y-1.5 rounded border border-border/30 p-2.5">
        <ToggleField label={t.analytics.trend.title} value={trend.enabled}
          onChange={(v) => onChange({ trendline: { ...trend, enabled: v } })} />
        {trend.enabled && (<>
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
        <ToggleField label={t.analytics.trend.showR2} value={trend.showR2}
          onChange={(v) => onChange({ trendline: { ...trend, showR2: v } })} />
        <MoreOptions customized={trend.thickness !== 2 || trend.style !== "dashed"}>
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
        </MoreOptions>
        </>)}
      </div>

      <div className="mt-2 space-y-1.5 rounded border border-border/30 p-2.5">
        <ToggleField label={t.analytics.forecast.title} value={fc.enabled}
          onChange={(v) => onChange({ forecast: { ...fc, enabled: v } })} />
        {fc.enabled && (
          <>
            <Row label={t.analytics.forecast.periodsAhead}>
              <NumberStepper value={fc.periods} min={1} max={6}
                onChange={(v) => onChange({ forecast: { ...fc, periods: v } })} />
            </Row>
            <ToggleField label={t.analytics.forecast.confidenceBand} value={fc.band}
              onChange={(v) => onChange({ forecast: { ...fc, band: v } })} />
          </>
        )}
      </div>
    </SubGroup>
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
    <SubGroup title={t.conditional.title}>
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
    </SubGroup>
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

/** Eixo de valores mostra escala (mín/máx/formato); eixo de categorias não —
 *  lá esses campos não tinham efeito nenhum no desenho. Desligado, só o
 *  interruptor aparece. */
function AxisGroup({ title, axis, defaults, valueAxis, onChange, onReset }: {
  title: string;
  axis: ChartStyle["xAxis"];
  defaults: ChartStyle["xAxis"];
  valueAxis: boolean;
  onChange: (p: Partial<ChartStyle["xAxis"]>) => void;
  onReset: () => void;
}) {
  const fine: (keyof ChartStyle["xAxis"])[] = [
    "titleSize", "titleColor", "labelSize", "labelColor", "lineColor", "lineWidth", "ticks",
    ...(valueAxis ? (["decimals"] as const) : []),
  ];
  const customized = fine.some((f) => axis[f] !== defaults[f]);
  return (
    <SubGroup title={title} onReset={onReset}>
      <ToggleField label={t.axis.show} value={axis.show}
        onChange={(v) => onChange({ show: v })} />
      {axis.show && (
        <>
          <Row label={t.axis.axisTitle}>
            <DraftInput className="h-8 text-[13px]" value={axis.titleText}
              placeholder={t.axis.noTitle}
              onCommit={(value) => onChange({ titleText: value })} />
          </Row>
          {valueAxis && (
            <>
              <Row label={t.axis.range}>
                <div className="flex items-center gap-1">
                  <DraftNumberInput className="h-8 min-w-0 text-[13px]" aria-label={t.axis.min}
                    value={axis.min ?? null} placeholder={t.axis.minPlaceholder}
                    fallback={null}
                    onCommit={(value) => onChange({ min: value })} />
                  <span className="text-[11px] text-muted-foreground">–</span>
                  <DraftNumberInput className="h-8 min-w-0 text-[13px]" aria-label={t.axis.max}
                    value={axis.max ?? null} placeholder={t.axis.maxPlaceholder}
                    fallback={null}
                    onCommit={(value) => onChange({ max: value })} />
                </div>
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
            </>
          )}
          <MoreOptions customized={customized}>
            {axis.titleText && (
              <>
                <Row label={tc.titleSize}>
                  <NumberStepper value={axis.titleSize} min={6} max={24}
                    onChange={(v) => onChange({ titleSize: v })} suffix="pt" />
                </Row>
                <Row label={tc.titleColor}>
                  <ColorField value={axis.titleColor}
                    onChange={(c) => onChange({ titleColor: c })} />
                </Row>
              </>
            )}
            <Row label={t.axis.labelSize}>
              <NumberStepper value={axis.labelSize} min={6} max={24}
                onChange={(v) => onChange({ labelSize: v })} suffix="pt" />
            </Row>
            <Row label={t.axis.labelColor}><ColorField value={axis.labelColor}
              onChange={(c) => onChange({ labelColor: c })} /></Row>
            {valueAxis && (
              <Row label={tc.decimals}>
                <NumberStepper value={axis.decimals} min={0} max={4}
                  onChange={(v) => onChange({ decimals: v })} />
              </Row>
            )}
            <Row label={t.axis.lineWidth}>
              <NumberStepper value={axis.lineWidth} min={0} max={5}
                onChange={(v) => onChange({ lineWidth: v })} suffix="px" />
            </Row>
            {axis.lineWidth > 0 && (
              <Row label={t.axis.lineColor}><ColorField value={axis.lineColor}
                onChange={(c) => onChange({ lineColor: c })} /></Row>
            )}
            <ToggleField label={t.axis.ticks} value={axis.ticks}
              onChange={(v) => onChange({ ticks: v })} />
          </MoreOptions>
        </>
      )}
    </SubGroup>
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
                  periodMode: v === "manual"
                    ? (pvm.periodMode === "ytd_budget" || pvm.periodMode === "ytd_vs_ytd" ? "month" : pvm.periodMode)
                    : v === "ytd-budget" ? "ytd_budget" : v === "ytd-vs-ytd" ? "ytd_vs_ytd" : "month",
                },
              })}
              options={[
                { value: "prev-month", label: t.waterfall.comparisonOptions.prevMonth },
                { value: "prev-year-month", label: t.waterfall.comparisonOptions.prevYearMonth },
                { value: "bench", label: t.waterfall.comparisonOptions.bench },
                { value: "ytd-budget", label: t.waterfall.comparisonOptions.ytdBudget },
                { value: "ytd-vs-ytd", label: t.waterfall.comparisonOptions.ytdVsYtd },
                { value: "manual", label: t.waterfall.comparisonOptions.manual },
              ]} />
          </Row>
          {comparisonMode === "ytd-budget" && (
            <div className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-[11px] text-muted-foreground">
              {t.waterfall.ytdBudgetHint}
            </div>
          )}
          {comparisonMode === "ytd-vs-ytd" && (
            <div className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-[11px] text-muted-foreground">
              {t.waterfall.ytdVsYtdHint}
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
