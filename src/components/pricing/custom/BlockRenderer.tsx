// Renderer dos blocos do slide personalizado.

import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  CustomBlock, KpiBlock,
  BridgeBlock, TableBlock, ChartBlock, TopSkuBlock, DreBlock,
  BlockDataSource,
  TableGapColumn,
  OmniBaseBlock,
  OmniEvolucaoMensalBlock, OmniHeatmapSazonalidadeBlock, OmniHeroisOfensoresBlock,
  OmniCanalTrendBlock, OmniCanalMixBlock, OmniCustoEvolucaoBlock, OmniCustoComposicaoBlock,
  OmniCustoPressaoBlock,
  OmniPositivacaoBlock, OmniUfMapBlock,
  OmniPriceDecompBlock, OmniBridgePvmBlock, OmniFarolBlock,
  OmniAbcCurvaBlock, OmniPortfolioMatrixBlock, OmniAbcBarsBlock,
  OmniMetric,
} from "@/lib/customSlide";
import type { Filters, PricingRow } from "@/lib/types";
import type { BudgetRow } from "@/lib/budget";
import { aggregate, LINES, fmt } from "../DreTable";
import { useMonthsInfo } from "@/store/selectors";
import {
  applyFilters, calcPVM, aggregateBy, type PVMResult,
  computeCanalTrend, computeCostEvolution, computePriceDecomposition,
} from "@/lib/analytics";
import { FarolGauge } from "@/components/farol/FarolGauge";
import { AbcBar } from "@/components/pricing/AbcBar";
import { AbcPareto, classifyAbc } from "@/components/pricing/AbcPareto";
import { PortfolioMatrix } from "@/components/pricing/PortfolioMatrix";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { SLIDE_CHART_PALETTE, SLIDE_HEX, SLIDE_RGBA } from "@/lib/slideColors";
import { formatPct, formatTon, formatNum } from "@/lib/format";
import { Waterfall } from "@/components/pricing/Waterfall";
import { computePivot, type PivotConfig, type PivotMeasure } from "@/lib/pivot";
import { buildUnifiedRows, ALL_DIMENSIONS } from "@/lib/pivotData";
import { usePricing } from "@/store/pricing";
import { useBudget } from "@/store/budget";
import { useForecast } from "@/store/forecast";
import { useRolling } from "@/store/rolling";
import { monthLabel, formatBRL } from "@/lib/format";
import {
  computeKpiBlock, computeTopRanking, formatValue, inferFormat,
} from "@/lib/customKpi";
import { calcFarol } from "@/lib/farol";
import { KPI_MEASURES } from "@/lib/customSlide";
import { resolveTableFit, resolveTopSkuFit } from "@/lib/customCapacity";
import { budgetRowsAsPricingFiltered } from "@/lib/budgetAdapter";
import { forecastRowsAsPricingLatest } from "@/lib/forecastAdapter";
import { rollingRowsAsPricing } from "@/lib/rollingAdapter";
import { localDataMissingMessage, missingLocalDataLabel } from "@/lib/slideLocalDataStatus";
import { ShapeRenderer } from "./ShapeRenderer";
import { useSlideFilters } from "./SlideFilterContext";
import { resolveFieldValue } from "./chart/filterHelpers";
import { isSlidePerfEnabled, recordSlideRender } from "@/lib/slidesPerfCounters";
import { buildSlideCalcCacheKey, getCachedRowsSignature, getOrComputeSlideCalc, type SlideCalcCacheKeyInput } from "@/lib/slideCalcCache";
import { calcPvmAsync } from "@/lib/slideCalcWorkerClient";
import { resolveMonthRangeSelection, resolvePeriodValue, resolvePeriodValues, relativePeriodLabel } from "@/lib/relativePeriods";
import { buildPositivacaoSeries } from "@/lib/positivacao";
import { computeBridgeYtdRealVsBudget } from "@/lib/bridgeYtdBudget";
import { getUfFromRegiao } from "@/lib/deparaComercial";
import { buildSimpleBlockLayout, type CustomSlideLayoutNode } from "@/lib/customSlideLayout";
import brMapRaw from "@/assets/br.svg?raw";

function useDataSource(
  dataSource: BlockDataSource | undefined,
  pricing: PricingRow[],
  budget: BudgetRow[],
  forecast: import("@/lib/forecast").ForecastRow[],
  rolling: import("@/lib/rolling").RollingRow[],
): PricingRow[] {
  return useMemo(() => {
    if (!dataSource || dataSource === "ke30") return pricing;
    if (dataSource === "budget") return budgetRowsAsPricingFiltered(budget, "budget");
    if (dataSource === "budget_real") return budgetRowsAsPricingFiltered(budget, "real");
    if (dataSource === "forecast") return forecastRowsAsPricingLatest(forecast);
    if (dataSource === "rolling") return rollingRowsAsPricing(rolling);
    return pricing;
  }, [dataSource, pricing, budget, forecast, rolling]);
}

function MissingLocalData({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center rounded-md border border-dashed border-warning/40 bg-warning/10 p-4 text-center text-xs font-medium leading-relaxed text-warning">
      {localDataMissingMessage(label)}
    </div>
  );
}

const blockSignatureCache = new WeakMap<CustomBlock, string>();

function blockSignature(block: CustomBlock): string {
  const cached = blockSignatureCache.get(block);
  if (cached) return cached;
  const signature = JSON.stringify(block);
  blockSignatureCache.set(block, signature);
  return signature;
}

function areBlocksEqual(prev: CustomBlock, next: CustomBlock): boolean {
  return prev === next || blockSignature(prev) === blockSignature(next);
}

function applyOmniFilters(rows: PricingRow[], blk: OmniBaseBlock): PricingRow[] {
  return rows.filter((r) => {
    if (blk.periodos?.length && !blk.periodos.includes(r.periodo)) return false;
    if (blk.canal && r.canal !== blk.canal) return false;
    if (blk.canalAjustado && r.canalAjustado !== blk.canalAjustado) return false;
    if (blk.categoria && r.categoria !== blk.categoria) return false;
    if (blk.subcategoria && r.subcategoria !== blk.subcategoria) return false;
    if (blk.marca && r.marca !== blk.marca) return false;
    if (blk.formato && r.formato !== blk.formato) return false;
    if (blk.regional && r.regional !== blk.regional) return false;
    if (blk.uf && r.uf !== blk.uf) return false;
    return true;
  });
}

function topFarolSkus(rows: PricingRow[]): { sku: string; desc: string; volume: number }[] {
  const map = new Map<string, { desc: string; volume: number }>();
  for (const r of rows) {
    if (!r.sku) continue;
    const cur = map.get(r.sku);
    if (cur) cur.volume += r.volumeKg || 0;
    else map.set(r.sku, { desc: r.skuDesc || r.sku, volume: r.volumeKg || 0 });
  }
  return Array.from(map, ([sku, v]) => ({ sku, ...v })).sort((a, b) => b.volume - a.volume);
}

function useAsyncBlockCalc<T>(
  enabled: boolean,
  fallback: T,
  key: string,
  compute: () => Promise<T>,
): { value: T; loading: boolean } {
  const [state, setState] = useState<{ value: T; loading: boolean }>({ value: fallback, loading: enabled });
  const computeRef = useRef(compute);
  computeRef.current = compute;

  useEffect(() => {
    let cancelled = false;
    if (!enabled) {
      setState({ value: fallback, loading: false });
      return () => { cancelled = true; };
    }

    setState((previous) => ({ value: previous.value, loading: true }));
    computeRef.current()
      .then((value) => {
        if (!cancelled) setState({ value, loading: false });
      })
      .catch(() => {
        if (!cancelled) setState({ value: fallback, loading: false });
      });

    return () => { cancelled = true; };
  }, [enabled, fallback, key]);

  return state;
}

export const CUSTOM_TABLE_MEASURES: PivotMeasure[] = [
  { id: "rol_real",  label: "ROL",            field: "rol_real",         agg: "sum", format: "currency", tone: "real" },
  { id: "vol_real",  label: "Volume (Kg)",    field: "volumeKg_real",    agg: "sum", format: "tons",     tone: "real" },
  { id: "cm_real",   label: "Contrib. Marg.", field: "cm_real",          agg: "sum", format: "currency", tone: "real" },
  { id: "cv_real",   label: "Custo Variável", field: "custoVariavel_real", agg: "sum", format: "currency", tone: "real" },
  { id: "frete_real",label: "Frete",          field: "frete_real",       agg: "sum", format: "currency", tone: "real" },
  { id: "com_real",  label: "Comissão",       field: "comissao_real",    agg: "sum", format: "currency", tone: "real" },
  { id: "mb_real",   label: "Margem Bruta",   field: "mb_real",          agg: "sum", format: "currency", tone: "real" },
];

export const CUSTOM_TABLE_DIMS = ALL_DIMENSIONS;

function fmtMeasure(m: PivotMeasure, v: number | null | undefined): string {
  const n = typeof v === "number" ? v : Number(v);
  if (!isFinite(n)) return "—";
  if (m.format === "currency") return formatBRL(n);
  if (m.format === "percent") return `${(n * 100).toFixed(1)}%`;
  if (m.format === "tons") return Math.round(n).toLocaleString("pt-BR");
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

const textAlignToJustify: Record<string, React.CSSProperties["justifyContent"]> = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
};

function exportCellStyle(style: React.CSSProperties): React.CSSProperties {
  return {
    ...style,
    padding: 0,
    lineHeight: 1,
    verticalAlign: "middle",
  };
}

function exportCellContent(
  content: React.ReactNode,
  opts: { padding: React.CSSProperties["padding"]; align?: React.CSSProperties["textAlign"]; wrap?: boolean },
) {
  const align = String(opts.align ?? "center");
  return (
    <div style={{
      minHeight: "100%",
      height: "100%",
      boxSizing: "border-box",
      display: "flex",
      alignItems: "center",
      justifyContent: textAlignToJustify[align] ?? "center",
      padding: opts.padding,
      lineHeight: 1.15,
      textAlign: opts.align,
      whiteSpace: opts.wrap ? "normal" : "nowrap",
      overflow: "hidden",
      overflowWrap: opts.wrap ? "anywhere" : undefined,
      wordBreak: opts.wrap ? "break-word" : undefined,
    }}>
      {content}
    </div>
  );
}

function pricingDimValue(row: PricingRow, dim: string): string {
  const value = (row as unknown as Record<string, unknown>)[dim];
  if (value == null || value === "") return "—";
  return String(value);
}

function applyTableDimensionFilters(rows: PricingRow[], filters: Filters | undefined): PricingRow[] {
  const activeFilters = Object.entries(filters ?? {}).filter(([, allowed]) => allowed && allowed.length > 0);
  if (activeFilters.length === 0) return rows;
  return rows.filter((row) => activeFilters.every(([dim, allowed]) => allowed!.includes(pricingDimValue(row, dim))));
}

function ExportPositionedCell({
  children,
  style,
  left,
  top,
  width,
  height,
  padX = 6,
}: {
  children: React.ReactNode;
  style: React.CSSProperties;
  left: number;
  top: number;
  width: number;
  height: number;
  padX?: number;
}) {
  const align = style.textAlign ?? "center";
  const fontSize = typeof style.fontSize === "number" ? style.fontSize : 12;
  const shouldWrap = style.whiteSpace === "normal" || style.whiteSpace === "pre-wrap";
  if (shouldWrap) {
    return (
      <div style={{
        ...style,
        position: "absolute",
        left: `${left}%`,
        top: `${top}%`,
        width: `${width}%`,
        height: `${height}%`,
        boxSizing: "border-box",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: textAlignToJustify[String(align)] ?? "center",
        padding: `0 ${padX}px`,
        whiteSpace: "normal",
        overflowWrap: "anywhere",
        wordBreak: "break-word",
      }}>
        {children}
      </div>
    );
  }
  const textAnchor = align === "left" ? "start" : align === "right" ? "end" : "middle";
  const textX = align === "left" ? "0%" : align === "right" ? "100%" : "50%";
  const dx = align === "left" ? padX : align === "right" ? -padX : 0;
  return (
    <div style={{
      ...style,
      position: "absolute",
      left: `${left}%`,
      top: `${top}%`,
      width: `${width}%`,
      height: `${height}%`,
      boxSizing: "border-box",
      padding: 0,
      overflow: "hidden",
      lineHeight: 1.15,
      display: "flex",
      alignItems: "center",
      justifyContent: textAlignToJustify[String(align)] ?? "center",
    }}>
      <svg width="100%" height="100%" style={{ display: "block", overflow: "hidden" }}>
        <text
          x={textX}
          dx={dx}
          y="50%"
          dominantBaseline="middle"
          alignmentBaseline="middle"
          textAnchor={textAnchor}
          fontFamily="Calibri, Arial, sans-serif"
          fontSize={`${fontSize}px`}
          fontWeight={style.fontWeight as number | string | undefined}
          fontStyle={style.fontStyle as string | undefined}
          fill={cssColor(style.color)}
        >
          {children}
        </text>
      </svg>
    </div>
  );
}

function cssColor(value: React.CSSProperties["color"], fallback = SLIDE_HEX.chart2): string {
  return typeof value === "string" ? value : fallback;
}

function cssFill(value: React.CSSProperties["background"], fallback = "transparent"): string {
  if (typeof value !== "string") return fallback;
  if (value.startsWith("linear-gradient")) return fallback;
  return value;
}

function SvgExportCell({
  x,
  y,
  w,
  h,
  children,
  style,
  clipId,
  padX = 6,
  fontFamily = "Calibri, Arial, sans-serif",
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  children: React.ReactNode;
  style: React.CSSProperties;
  clipId: string;
  padX?: number;
  fontFamily?: string;
}) {
  const align = style.textAlign ?? "center";
  const textAnchor = align === "left" ? "start" : align === "right" ? "end" : "middle";
  const textX = align === "left" ? x + padX : align === "right" ? x + w - padX : x + w / 2;
  const bg = cssFill(style.backgroundColor ?? style.background, "transparent");
  const fontSize = typeof style.fontSize === "number" ? style.fontSize : 12;
  return (
    <g>
      <clipPath id={clipId}>
        <rect x={x} y={y} width={w} height={h} />
      </clipPath>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill={bg}
        stroke={SLIDE_HEX.grid}
        strokeWidth={0.6}
      />
      <text
        x={textX}
        y={y + h / 2}
        clipPath={`url(#${clipId})`}
        dominantBaseline="middle"
        alignmentBaseline="middle"
        textAnchor={textAnchor}
        fontFamily={fontFamily}
        fontSize={fontSize}
        fontWeight={style.fontWeight as number | string | undefined}
        fontStyle={style.fontStyle as string | undefined}
        fill={cssColor(style.color)}
      >
        {children}
      </text>
    </g>
  );
}

class BlockErrorBoundary extends React.Component<
  { block: CustomBlock; children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidUpdate(prevProps: { block: CustomBlock }) {
    if (prevProps.block !== this.props.block && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 12,
        boxSizing: "border-box",
        background: SLIDE_HEX.dangerWash,
        border: `1px dashed ${SLIDE_HEX.dangerBorder}`,
        color: SLIDE_HEX.dangerDark,
        fontFamily: "Calibri, Arial, sans-serif",
        fontSize: 12,
        textAlign: "center",
      }}>
        Nao foi possivel renderizar este bloco com os filtros atuais.
      </div>
    );
  }
}

type BlockRendererProps = {
  block: CustomBlock;
  readOnly?: boolean;
  isEditing?: boolean;
  cacheSlideId?: string;
  onPatch?: (patch: Partial<CustomBlock>) => void;
};

export const BlockRenderer = React.memo(function BlockRenderer({ block, readOnly, isEditing, cacheSlideId, onPatch }: BlockRendererProps) {
  if (isSlidePerfEnabled()) recordSlideRender("BlockRenderer", block.id);
  return (
    <BlockErrorBoundary block={block}>
      <BlockRendererInner block={block} readOnly={readOnly} isEditing={isEditing} cacheSlideId={cacheSlideId} onPatch={onPatch} />
    </BlockErrorBoundary>
  );
}, (prev, next) => (
  areBlocksEqual(prev.block, next.block)
  && prev.readOnly === next.readOnly
  && prev.isEditing === next.isEditing
  && prev.cacheSlideId === next.cacheSlideId
));

function BlockRendererInner({ block, readOnly, isEditing, cacheSlideId, onPatch }: BlockRendererProps) {
  let content: React.ReactNode;
  switch (block.kind) {
    case "title":  content = <SimpleLayoutRender node={buildSimpleBlockLayout(block)} isEditing={isEditing} readOnly={readOnly} />; break;
    case "text":   content = <SimpleLayoutRender node={buildSimpleBlockLayout(block)} isEditing={isEditing} readOnly={readOnly} />; break;
    case "kpi":    content = <KpiRender block={block} readOnly={readOnly} />; break;
    case "image":  content = <SimpleLayoutRender node={buildSimpleBlockLayout(block)} />; break;
    case "shape":  content = <SimpleLayoutRender node={buildSimpleBlockLayout(block)} />; break;
    case "bridge": content = <BridgeRender block={block} cacheSlideId={cacheSlideId} />; break;
    case "table":  content = <TableRender block={block} readOnly={readOnly} onPatch={onPatch} />; break;
    case "chart":  content = <ChartRender block={block} cacheSlideId={cacheSlideId} />; break;
    case "topSku": content = <TopSkuRender block={block} />; break;
    case "dre":    content = <DreRender block={block} readOnly={readOnly} />; break;
    // Omni Analytics
    case "omni_evolucao_mensal":      content = <OmniEvolucaoMensalRender block={block} />; break;
    case "omni_heatmap_sazonalidade": content = <OmniHeatmapSazonalidadeRender block={block} />; break;
    case "omni_herois_ofensores":     content = <OmniHeroisOfensoresRender block={block} />; break;
    case "omni_canal_trend":          content = <OmniCanalTrendRender block={block} />; break;
    case "omni_canal_mix":            content = <OmniCanalMixRender block={block} />; break;
    case "omni_custo_evolucao":       content = <OmniCustoEvolucaoRender block={block} />; break;
    case "omni_custo_composicao":     content = <OmniCustoComposicaoRender block={block} />; break;
    case "omni_custo_pressao":        content = <OmniCustoPressaoRender block={block} />; break;
    case "omni_positivacao":          content = <OmniPositivacaoRender block={block} />; break;
    case "omni_uf_map":               content = <OmniUfMapRender block={block} />; break;
    case "omni_price_decomp":         content = <OmniPriceDecompRender block={block} />; break;
    case "omni_bridge_pvm":           content = <OmniBridgePvmRender block={block} />; break;
    case "omni_farol":                content = <OmniFarolRender block={block} />; break;
    case "omni_abc_curva":            content = <OmniAbcCurvaRender block={block} />; break;
    case "omni_portfolio_matrix":     content = <OmniPortfolioMatrixRender block={block} />; break;
    case "omni_abc_bars":             content = <OmniAbcBarsRender block={block} />; break;
  }
  const opacity = block.opacity == null ? 100 : Math.max(0, Math.min(100, block.opacity));
  return (
    <div style={{ width: "100%", height: "100%", opacity: opacity === 100 ? undefined : opacity / 100 }}>
      {content}
    </div>
  );
}

function SimpleLayoutRender({
  node,
  isEditing,
  readOnly,
}: {
  node: CustomSlideLayoutNode;
  isEditing?: boolean;
  readOnly?: boolean;
}) {
  if (node.kind === "text") {
    return (
      <div style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: node.style.alignItems,
        justifyContent: node.style.justifyContent,
        boxSizing: "border-box",
        fontFamily: node.style.fontFamily,
        fontSize: node.style.fontSize,
        fontWeight: node.style.fontWeight,
        fontStyle: node.style.fontStyle,
        color: node.style.color,
        lineHeight: node.style.lineHeight,
        textAlign: node.style.textAlign,
        whiteSpace: node.role === "body" ? "pre-wrap" : undefined,
        letterSpacing: node.style.letterSpacing,
        textShadow: node.style.textShadow,
        textTransform: node.style.textTransform,
        padding: node.style.padding,
        backgroundColor: node.style.backgroundColor,
        borderRadius: node.style.borderRadius,
        overflow: readOnly ? "visible" : "hidden",
        visibility: isEditing ? "hidden" : "visible",
      }}>
        {node.text}
      </div>
    );
  }

  if (node.kind === "image") {
    if (!node.src) {
      return (
        <div style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: node.placeholder.background,
          border: node.placeholder.border,
          color: node.placeholder.color,
          fontFamily: node.placeholder.fontFamily,
          fontSize: node.placeholder.fontSize,
        }}>
          {node.placeholder.text}
        </div>
      );
    }
    return (
      <img src={node.src} alt=""
        style={{ width: "100%", height: "100%", objectFit: node.fit, display: "block" }}
      />
    );
  }

  return <ShapeRenderer block={node.block} />;
}

function KpiRender({ block: b, readOnly }: { block: KpiBlock; readOnly?: boolean }) {
  const pricing = usePricing((s) => s.rows);
  const budget = useBudget((s) => s.rows);
  const forecast = useForecast((s) => s.rows);
  const rolling = useRolling((s) => s.rows);
  const { filters } = useSlideFilters();
  const participates = b.participatesInCrossFilter !== false;

  const missingData = missingLocalDataLabel(b.dataSource, {
    pricing: pricing.length,
    budget: budget.length,
    forecast: forecast.length,
    rolling: rolling.length,
  });
  const baseRows = useDataSource(b.dataSource, pricing, budget, forecast, rolling);

  // Split incoming filters into "period" (special: format-tolerant + overrides
  // the block's own periodMode/periodValue) and "dimensional" (other dims).
  const incoming = useMemo(
    () => (participates ? filters.filter((f) => f.sourceBlockId !== b.id) : []),
    [filters, participates, b.id],
  );
  const periodFilterValues = useMemo(() => {
    const vals: string[] = [];
    for (const f of incoming) {
      if (f.dimension === "period" || f.dimension === "periodo") vals.push(...f.values);
    }
    return vals;
  }, [incoming]);

  const rows = useMemo(() => {
    if (incoming.length === 0) return baseRows;
    const applyPeriod = (r: (typeof baseRows)[number]) => {
      if (periodFilterValues.length === 0) return true;
      const row = r as { mes?: number; ano?: number; periodo?: string };
      const lbl = monthLabel(row.mes ?? 0, row.ano ?? 0);
      const raw = String(row.periodo ?? "");
      return periodFilterValues.includes(lbl) || periodFilterValues.includes(raw);
    };
    const hasDimensional = incoming.some(
      (f) => f.dimension !== "period" && f.dimension !== "periodo",
    );
    const filtered = baseRows.filter((r) => {
      // Period filter — match against display label OR raw periodo.
      if (!applyPeriod(r)) return false;
      for (const f of incoming) {
        if (f.dimension === "period" || f.dimension === "periodo") continue;
        const v = resolveFieldValue(r as unknown as Record<string, unknown>, f.dimension);
        if (!f.values.includes(v)) return false;
      }
      return true;
    });
    // Fallback: if dimensional filters cause empty results but period filter is active,
    // show period-only totals instead of zero.
    if (filtered.length === 0 && periodFilterValues.length > 0 && hasDimensional) {
      return baseRows.filter(applyPeriod);
    }
    return filtered;
  }, [baseRows, incoming, periodFilterValues]);

  // When a cross-filter period is active, override the block's own
  // periodMode so computeKpiBlock doesn't double-filter into an empty set.
  const effectiveBlock = useMemo<KpiBlock>(
    () => (periodFilterValues.length > 0
      ? { ...b, periodMode: "all", periodValue: null, periodSelectionMode: "fixed", relativePeriod: undefined }
      : b),
    [b, periodFilterValues.length],
  );

  const value = useMemo(() => computeKpiBlock(rows, effectiveBlock), [rows, effectiveBlock]);
  const measureLabel = b.source === "dynamic"
    ? KPI_MEASURES.find((m) => m.id === b.measure)?.label
    : null;
  const periodDescriptor = b.periodMode && b.periodMode !== "all"
    ? b.periodSelectionMode === "relative"
      ? `Relativo: ${relativePeriodLabel(b.relativePeriod)}`
      : b.periodValue ?? ""
    : b.periodMode === "all" ? "Todos os períodos" : "";

  const cardBg = b.cardBg ?? "F8FAFC";
  const isTransparent = cardBg === "transparent";
  const valueSize = b.valueSize;
  if (missingData) return <MissingLocalData label={missingData} />;
  if (readOnly) {
    const fill = isTransparent ? "transparent" : `#${cardBg}`;
    const stroke = isTransparent ? "transparent" : SLIDE_HEX.grid;
    const labelText = b.label || measureLabel || "KPI";
    const footerText = b.source === "dynamic"
      ? `${measureLabel ?? ""}${periodDescriptor ? ` · ${periodDescriptor}` : ""}`
      : "";
    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${b.w} ${b.h}`} preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
        <rect x={0.5} y={0.5} width={Math.max(1, b.w - 1)} height={Math.max(1, b.h - 1)} rx={isTransparent ? 0 : 12} fill={fill} stroke={stroke} />
        <text
          x={12}
          y={Math.max(20, b.h * 0.28)}
          dominantBaseline="middle"
          alignmentBaseline="middle"
          textAnchor="start"
          fontFamily="Calibri, Arial, sans-serif"
          fontSize={14}
          letterSpacing={1}
          fill={SLIDE_HEX.slate500}
        >
          {labelText.toUpperCase()}
        </text>
        <text
          x={12}
          y={b.h / 2 + 6}
          dominantBaseline="middle"
          alignmentBaseline="middle"
          textAnchor="start"
          fontFamily="Calibri, Arial, sans-serif"
          fontSize={valueSize}
          fontWeight={700}
          fill={`#${b.color}`}
        >
          {value}
        </text>
        {footerText && (
          <text
            x={12}
            y={Math.max(16, b.h - 18)}
            dominantBaseline="middle"
            alignmentBaseline="middle"
            textAnchor="start"
            fontFamily="Calibri, Arial, sans-serif"
            fontSize={11}
            fill={SLIDE_HEX.slate400}
          >
            {footerText}
          </text>
        )}
      </svg>
    );
  }
  return (
    <div style={{
      width: "100%", height: "100%",
      display: "flex", flexDirection: "column", justifyContent: "center",
      boxSizing: "border-box",
      padding: 12, borderRadius: isTransparent ? 0 : 12,
      background: isTransparent ? "transparent" : `#${cardBg}`,
      border: isTransparent ? "none" : `1px solid ${SLIDE_HEX.grid}`,
      fontFamily: "Calibri, sans-serif",
    }}>
      <div style={{ fontSize: 14, color: SLIDE_HEX.slate500, textTransform: "uppercase", letterSpacing: 1 }}>
        {b.label || measureLabel || "KPI"}
      </div>
      <div style={{
        fontSize: valueSize, fontWeight: 700, color: `#${b.color}`,
        marginTop: 4, lineHeight: readOnly ? 1.18 : 1.05,
        whiteSpace: "nowrap",
        overflow: readOnly ? "visible" : "hidden",
        textOverflow: readOnly ? undefined : "ellipsis",
        paddingBlock: readOnly ? 2 : 0,
        minHeight: readOnly ? Math.ceil(valueSize * 1.18) : undefined,
      }}>
        {value}
      </div>
      {b.source === "dynamic" && (
        <div style={{ fontSize: 11, color: SLIDE_HEX.slate400, marginTop: 6 }}>
          {measureLabel}
          {periodDescriptor ? ` · ${periodDescriptor}` : ""}
        </div>
      )}
    </div>
  );
}

function BridgeRender({ block: b, cacheSlideId }: { block: BridgeBlock; cacheSlideId?: string }) {
  const pricing = usePricing((s) => s.rows);
  const metric = usePricing((s) => s.metric);
  const pricingSignature = useMemo(() => getCachedRowsSignature(pricing), [pricing]);
  const filteredRows = useMemo(() => applyOmniFilters(pricing, b), [pricing, b]);
  const baseKey = useMemo(
    () => resolvePeriodValue(filteredRows, b.mode, b.base, b.baseSelectionMode, b.baseRelativePeriod),
    [filteredRows, b.mode, b.base, b.baseSelectionMode, b.baseRelativePeriod],
  );
  const compKey = useMemo(
    () => resolvePeriodValue(filteredRows, b.mode, b.comp, b.compSelectionMode, b.compRelativePeriod),
    [filteredRows, b.mode, b.comp, b.compSelectionMode, b.compRelativePeriod],
  );

  const bridgeCacheInput = useMemo<SlideCalcCacheKeyInput>(() => ({
    op: "custom-bridge-pvm",
    slideId: cacheSlideId,
    blockId: b.id,
    dataSource: "ke30",
    dataSignature: `${pricingSignature}:${JSON.stringify({ filters: b.filters, base: baseKey, comp: compKey, mode: b.mode })}`,
    params: { metric, base: baseKey, comp: compKey, mode: b.mode, filters: b.filters },
  }), [cacheSlideId, b.id, b.filters, baseKey, compKey, b.mode, pricingSignature, metric]);
  const bridgeCacheKey = useMemo(() => buildSlideCalcCacheKey(bridgeCacheInput), [bridgeCacheInput]);
  const labels = useMemo(() => {
    if (b.mode !== "month") return undefined;
    return {
      base: (() => { const r = filteredRows.find((x) => x.periodo === baseKey); return r ? monthLabel(r.mes, r.ano) : baseKey!; })(),
      comp: (() => { const r = filteredRows.find((x) => x.periodo === compKey); return r ? monthLabel(r.mes, r.ano) : compKey!; })(),
    };
  }, [b.mode, baseKey, compKey, filteredRows]);
  const bridgeCalc = useAsyncBlockCalc<PVMResult | null>(
    !!baseKey && !!compKey && baseKey !== compKey,
    null,
    bridgeCacheKey,
    () => calcPvmAsync({
      cache: bridgeCacheInput,
      rows: filteredRows,
      filters: {},
      metric,
      base: baseKey!,
      comp: compKey!,
      mode: b.mode,
      labels,
    }),
  );
  const pvmResult = useMemo(() => {
    if (!baseKey || !compKey || baseKey === compKey) return { kind: "unconfigured" as const };
    if (bridgeCalc.loading) return { kind: "loading" as const };
    if (!bridgeCalc.value) return { kind: "error" as const };
    return { kind: "ok" as const, data: bridgeCalc.value };
  }, [baseKey, compKey, bridgeCalc.loading, bridgeCalc.value]);

  if (pvmResult.kind !== "ok") {
    return (
      <div style={{
        width: "100%", height: "100%",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: SLIDE_HEX.paper, border: `1px dashed ${SLIDE_HEX.slate300}`,
        color: SLIDE_HEX.slate500, fontFamily: "Calibri", fontSize: 14,
      }}>
        {pvmResult.kind === "loading"
          ? "Calculando Bridge..."
          : pvmResult.kind === "unconfigured"
          ? "Configure base e comparação para a Bridge"
          : "Erro ao calcular Bridge"}
      </div>
    );
  }
  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
      <Waterfall data={pvmResult.data} height={Math.max(220, b.h - 4)} labelAngle={-35} />
    </div>
  );
}

const TABLE_MIN_COL_WIDTH_PCT = 6;
const TABLE_ROW_COL_KEY = "__row__";
const TABLE_PIVOT_SEP = "\u001F";
const TABLE_EMPTY = "—";

type TableColumnLayout = {
  key: string;
  left: number;
  width: number;
};

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeTableColumnWidths(
  columnKeys: string[],
  saved: Record<string, number> | undefined,
  defaultWeights: number[],
) {
  if (columnKeys.length === 0) return [];
  const raw = columnKeys.map((key, index) => {
    const savedValue = saved?.[key];
    return Number.isFinite(savedValue) && savedValue > 0
      ? savedValue
      : Math.max(0.1, defaultWeights[index] ?? 1);
  });
  const minWidth = Math.min(TABLE_MIN_COL_WIDTH_PCT, 100 / columnKeys.length);
  const sum = raw.reduce((acc, value) => acc + value, 0) || columnKeys.length;
  const normalized = raw.map((value) => (value / sum) * 100);
  const fixed = normalized.map((value) => Math.max(minWidth, value));
  const overflow = fixed.reduce((acc, value) => acc + value, 0) - 100;
  if (overflow <= 0.0001) {
    const total = fixed.reduce((acc, value) => acc + value, 0) || 100;
    return fixed.map((value) => (value / total) * 100);
  }
  const flexible = fixed.map((value) => Math.max(0, value - minWidth));
  const flexTotal = flexible.reduce((acc, value) => acc + value, 0);
  if (flexTotal <= 0.0001) return columnKeys.map(() => 100 / columnKeys.length);
  return fixed.map((value, index) => value - overflow * (flexible[index] / flexTotal));
}

function resizeTableColumnWidths(widths: number[], index: number, deltaPct: number) {
  if (widths.length <= 1) return widths;
  const minWidth = Math.min(TABLE_MIN_COL_WIDTH_PCT, 100 / widths.length);
  const maxWidth = 100 - minWidth * (widths.length - 1);
  const next = [...widths];
  const resized = clampNumber(widths[index] + deltaPct, minWidth, maxWidth);
  const diff = resized - widths[index];
  if (Math.abs(diff) < 0.0001) return next;

  const otherIndexes = widths.map((_, i) => i).filter((i) => i !== index);
  if (diff > 0) {
    const shrinkCapacity = otherIndexes.reduce((acc, i) => acc + Math.max(0, widths[i] - minWidth), 0);
    if (shrinkCapacity <= 0.0001) return next;
    const actualDiff = Math.min(diff, shrinkCapacity);
    next[index] = widths[index] + actualDiff;
    for (const i of otherIndexes) {
      const capacity = Math.max(0, widths[i] - minWidth);
      next[i] = widths[i] - actualDiff * (capacity / shrinkCapacity);
    }
    return next;
  }

  const growTotal = otherIndexes.reduce((acc, i) => acc + Math.max(0.0001, widths[i]), 0);
  next[index] = resized;
  for (const i of otherIndexes) {
    next[i] = widths[i] + Math.abs(diff) * (Math.max(0.0001, widths[i]) / growTotal);
  }
  return next;
}

function buildTableColumnLayout(columnKeys: string[], widths: number[]): TableColumnLayout[] {
  let left = 0;
  return columnKeys.map((key, index) => {
    const layout = { key, left, width: widths[index] ?? 0 };
    left += layout.width;
    return layout;
  });
}

function columnWidthsToRecord(columnKeys: string[], widths: number[]) {
  return Object.fromEntries(columnKeys.map((key, index) => [key, Number((widths[index] ?? 0).toFixed(4))]));
}

function tableDimValue(row: Record<string, unknown>, dim: string) {
  const value = row[dim];
  if (value == null || value === "") return TABLE_EMPTY;
  return String(value);
}

function tableRowKey(row: Record<string, unknown>, dims: string[]) {
  if (dims.length === 0) return "__all__";
  return dims.map((dim) => tableDimValue(row, dim)).join(TABLE_PIVOT_SEP);
}

function tableMatchesFilters(row: Record<string, unknown>, filters: Record<string, string[]>) {
  for (const [dim, allowed] of Object.entries(filters)) {
    if (!allowed || allowed.length === 0) continue;
    if (!allowed.includes(tableDimValue(row, dim))) return false;
  }
  return true;
}

function tablePeriods(rows: Record<string, unknown>[]) {
  return Array.from(new Map(rows.map((row) => {
    const periodo = String(row.periodo ?? "");
    return [periodo, { periodo, mes: Number(row.mes ?? 0), ano: Number(row.ano ?? 0) }];
  })).values())
    .filter((period) => period.periodo && period.mes > 0 && period.ano > 0)
    .sort((a, b) => a.ano - b.ano || a.mes - b.mes);
}

function measureValue(row: Record<string, unknown>, measure: PivotMeasure) {
  const value = Number(row[measure.field]);
  return Number.isFinite(value) ? value : 0;
}

function resolveTableGapReferencePeriod(
  gap: TableGapColumn,
  rows: Record<string, unknown>[],
  measures: PivotMeasure[],
) {
  const periods = tablePeriods(rows);
  if (periods.length === 0) return null;
  const latest = periods[periods.length - 1];
  if (gap.comparisonMode === "prev-month") {
    return periods.length >= 2 ? periods[periods.length - 2].periodo : null;
  }
  if (gap.comparisonMode === "prev-year-month") {
    const found = periods.find((period) => period.mes === latest.mes && period.ano === latest.ano - 1);
    return found?.periodo ?? null;
  }
  if (gap.comparisonMode === "manual") {
    return gap.manualPeriod && periods.some((period) => period.periodo === gap.manualPeriod)
      ? gap.manualPeriod
      : null;
  }
  const benchMeasure = measures.find((measure) => measure.id === (gap.benchMeasureId || gap.measureId))
    ?? measures.find((measure) => measure.id === gap.measureId)
    ?? measures[0];
  if (!benchMeasure) return null;
  const candidates = periods.slice(-25, -1);
  let best: { periodo: string; value: number } | null = null;
  for (const period of candidates) {
    const value = rows
      .filter((row) => row.periodo === period.periodo)
      .reduce((sum, row) => sum + measureValue(row, benchMeasure), 0);
    if (!best || value > best.value) best = { periodo: period.periodo, value };
  }
  return best?.periodo ?? null;
}

function tableGapLabel(gap: TableGapColumn, measure: PivotMeasure | undefined) {
  const prefix = measure?.label ?? "KPI";
  if (gap.comparisonMode === "prev-month") return `${prefix} vs M-1`;
  if (gap.comparisonMode === "prev-year-month") return `${prefix} vs LY`;
  if (gap.comparisonMode === "bench") return `${prefix} vs Bench`;
  return `${prefix} vs Manual`;
}

function buildTableGapValues(
  rows: Record<string, unknown>[],
  rowDims: string[],
  filters: Record<string, string[]>,
  measures: PivotMeasure[],
  gapColumns: TableGapColumn[],
) {
  const filtered = rows.filter((row) => tableMatchesFilters(row, filters));
  const periods = tablePeriods(filtered);
  const latest = periods[periods.length - 1]?.periodo ?? null;
  const measureById = new Map(measures.map((measure) => [measure.id, measure]));
  const result = new Map<string, Record<string, number | null>>();
  if (!latest || gapColumns.length === 0) return result;

  for (const gap of gapColumns) {
    const measure = measureById.get(gap.measureId);
    const reference = resolveTableGapReferencePeriod(gap, filtered, measures);
    if (!measure || !reference || reference === latest) continue;
    const latestByRow = new Map<string, number>();
    const referenceByRow = new Map<string, number>();
    for (const row of filtered) {
      if (row.periodo !== latest && row.periodo !== reference) continue;
      const key = tableRowKey(row, rowDims);
      const target = row.periodo === latest ? latestByRow : referenceByRow;
      target.set(key, (target.get(key) ?? 0) + measureValue(row, measure));
    }
    const keys = new Set([...latestByRow.keys(), ...referenceByRow.keys()]);
    for (const key of keys) {
      const record = result.get(key) ?? {};
      record[gap.id] = (latestByRow.get(key) ?? 0) - (referenceByRow.get(key) ?? 0);
      result.set(key, record);
    }
  }
  return result;
}

const TABLE_COLUMN_RESIZE_HANDLE_CLASS = "custom-table-column-resize-handle";
export const TABLE_COLUMN_RESIZE_HANDLE_CANCEL_SELECTOR = `.${TABLE_COLUMN_RESIZE_HANDLE_CLASS}`;

function TableColumnResizeHandle({
  onPointerDown,
  placement = "edge",
}: {
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  placement?: "edge" | "inside";
}) {
  return (
    <div
      className={TABLE_COLUMN_RESIZE_HANDLE_CLASS}
      data-table-column-resize-handle="true"
      data-export-hide="true"
      title="Arrastar para ajustar largura"
      onPointerDown={onPointerDown}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      style={{
        position: "absolute",
        top: 0,
        right: placement === "inside" ? 0 : -4,
        width: placement === "inside" ? 12 : 8,
        height: "100%",
        cursor: "col-resize",
        zIndex: 20,
        pointerEvents: "auto",
        touchAction: "none",
        userSelect: "none",
      }}
    >
      <div
        style={{
          width: 2,
          height: "100%",
          margin: placement === "inside" ? "0 0 0 auto" : "0 auto",
          background: "rgba(17, 24, 39, 0.18)",
          opacity: 0.75,
        }}
      />
    </div>
  );
}

function TableRender({ block: b, readOnly, onPatch }: { block: TableBlock; readOnly?: boolean; onPatch?: (patch: Partial<CustomBlock>) => void }) {
  const pricing = usePricing((s) => s.rows);
  const budget = useBudget((s) => s.rows);
  const forecast = useForecast((s) => s.rows);
  const rolling = useRolling((s) => s.rows);
  const missingData = missingLocalDataLabel(b.dataSource, {
    pricing: pricing.length,
    budget: budget.length,
    forecast: forecast.length,
    rolling: rolling.length,
  });
  const sourceRows = useDataSource(b.dataSource, pricing, budget, forecast, rolling);

  const data = useMemo(() => {
    const dimensionFilteredRows = applyTableDimensionFilters(sourceRows, b.filters);
    const resolvedMonths = resolveMonthRangeSelection(dimensionFilteredRows, b.monthFilter);
    const monthSet = resolvedMonths?.length ? new Set(resolvedMonths) : null;
    const tableRows = monthSet
      ? dimensionFilteredRows.filter((row) => monthSet.has(row.periodo))
      : dimensionFilteredRows;
    const unified = buildUnifiedRows(tableRows, [], "real");
    const measures = CUSTOM_TABLE_MEASURES.filter((m) => b.measures.includes(m.id));
    if (measures.length === 0) return null;
    const filters = {};
    const gapColumns = (b.gapColumns ?? []).filter((gap) => measures.some((measure) => measure.id === gap.measureId));
    const gapValues = buildTableGapValues(
      unified as unknown as Record<string, unknown>[],
      b.rowDims,
      filters,
      measures,
      gapColumns,
    );
    const cfg: PivotConfig = {
      rows: b.rowDims,
      cols: b.colDim ? [b.colDim] : [],
      values: measures,
      filters,
    };
    const result = computePivot(unified as unknown as Record<string, unknown>[], cfg);

    const rowLabel = (header: { values: string[] }) => header.values.join(" / ") || "Total";
    const sortKey = b.sortMeasure && measures.find((m) => m.id === b.sortMeasure)
      ? b.sortMeasure
      : measures[0].id;
    const manualRank = new Map((b.manualRowOrder ?? []).map((key, index) => [key, index]));
    const sortedHeaders = [...result.leafRowHeaders].sort((a, z) => {
      if (b.sortMode === "manual") {
        const ar = manualRank.get(a.key);
        const zr = manualRank.get(z.key);
        if (ar != null && zr != null) return ar - zr;
        if (ar != null) return -1;
        if (zr != null) return 1;
        return rowLabel(a).localeCompare(rowLabel(z), "pt-BR", { sensitivity: "base", numeric: true });
      }
      if (b.sortMode === "az" || b.sortMode === "za") {
        const cmp = rowLabel(a).localeCompare(rowLabel(z), "pt-BR", { sensitivity: "base", numeric: true });
        return b.sortMode === "az" ? cmp : -cmp;
      }
      if (b.sortMode === "gap") {
        const gapSortKey = b.sortGapColumnId ?? gapColumns[0]?.id;
        if (!gapSortKey) return 0;
        const va = gapValues.get(a.key)?.[gapSortKey] ?? 0;
        const vz = gapValues.get(z.key)?.[gapSortKey] ?? 0;
        return (b.sortDirection ?? "desc") === "asc" ? va - vz : vz - va;
      }
      const va = result.rowTotals.get(a.key)?.[sortKey] ?? 0;
      const vz = result.rowTotals.get(z.key)?.[sortKey] ?? 0;
      return (b.sortDirection ?? "desc") === "asc" ? va - vz : vz - va;
    });
    return { result, measures, sortedHeaders, gapColumns, gapValues };
  }, [sourceRows, b.rowDims, b.colDim, b.measures, b.filters, b.monthFilter, b.gapColumns, b.sortMeasure, b.sortMode, b.sortGapColumnId, b.sortDirection, b.manualRowOrder]);

  const tableColumnKeys = useMemo(() => {
    if (!data) return [];
    const cols = data.result.colHeaders;
    const showCols = cols.length > 0 && cols[0].values.length > 0;
    const showLastColumnVariation = !!b.showLastColumnVariation && showCols && cols.length >= 2;
    const valueKeys = showCols
      ? [
          ...cols.flatMap((c) => data.measures.map((m) => `${c.key}::${m.id}`)),
          ...(showLastColumnVariation ? data.measures.map((m) => `var::${m.id}`) : []),
        ]
      : data.measures.map((m) => m.id);
    return [TABLE_ROW_COL_KEY, ...valueKeys, ...data.gapColumns.map((gap) => `gap::${gap.id}`)];
  }, [data, b.showLastColumnVariation]);
  const defaultColumnWeights = useMemo(
    () => tableColumnKeys.map((_, index) => (index === 0 ? 1.7 : 1)),
    [tableColumnKeys],
  );
  const [draftColumnWidths, setDraftColumnWidths] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    setDraftColumnWidths(null);
  }, [b.id, b.columnWidths, tableColumnKeys.join("|")]);
  const activeColumnWidths = useMemo(
    () => normalizeTableColumnWidths(tableColumnKeys, draftColumnWidths ?? b.columnWidths, defaultColumnWeights),
    [tableColumnKeys, draftColumnWidths, b.columnWidths, defaultColumnWeights],
  );
  const columnLayouts = useMemo(
    () => buildTableColumnLayout(tableColumnKeys, activeColumnWidths),
    [tableColumnKeys, activeColumnWidths],
  );
  const tableResizeRef = useRef<HTMLDivElement | null>(null);
  const startTableColumnResize = (index: number, event: React.PointerEvent<HTMLDivElement>) => {
    if (readOnly || !onPatch || tableColumnKeys.length <= 1) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = tableResizeRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const handleEl = event.currentTarget;
    const ownerDocument = handleEl.ownerDocument ?? document;
    if (handleEl.setPointerCapture) {
      try {
        handleEl.setPointerCapture(event.pointerId);
      } catch {
        // Some embedded webviews can reject capture after pointer cancellation.
      }
    }
    const startX = event.clientX;
    const startWidths = [...activeColumnWidths];
    const handleMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      const deltaPct = ((moveEvent.clientX - startX) / rect.width) * 100;
      const next = resizeTableColumnWidths(startWidths, index, deltaPct);
      setDraftColumnWidths(columnWidthsToRecord(tableColumnKeys, next));
    };
    const stopTracking = () => {
      ownerDocument.removeEventListener("pointermove", handleMove);
      ownerDocument.removeEventListener("pointerup", handleUp);
      ownerDocument.removeEventListener("pointercancel", handleCancel);
      if (handleEl.releasePointerCapture && handleEl.hasPointerCapture?.(event.pointerId)) {
        try {
          handleEl.releasePointerCapture(event.pointerId);
        } catch {
          // Capture may already be released by the browser.
        }
      }
    };
    const handleUp = (upEvent: PointerEvent) => {
      const deltaPct = ((upEvent.clientX - startX) / rect.width) * 100;
      const next = resizeTableColumnWidths(startWidths, index, deltaPct);
      const columnWidths = columnWidthsToRecord(tableColumnKeys, next);
      setDraftColumnWidths(columnWidths);
      onPatch({ columnWidths } as Partial<CustomBlock>);
      stopTracking();
    };
    const handleCancel = () => {
      stopTracking();
    };
    ownerDocument.addEventListener("pointermove", handleMove);
    ownerDocument.addEventListener("pointerup", handleUp, { once: true });
    ownerDocument.addEventListener("pointercancel", handleCancel, { once: true });
  };

  if (missingData) return <MissingLocalData label={missingData} />;
  if (!data || data.sortedHeaders.length === 0) {
    return (
      <div style={{
        width: "100%", height: "100%",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: SLIDE_HEX.paper, border: `1px dashed ${SLIDE_HEX.slate300}`,
        color: SLIDE_HEX.slate500, fontFamily: "Calibri", fontSize: 14,
      }}>
        Configure dimensões e medidas da tabela
      </div>
    );
  }

  const { result, measures, sortedHeaders, gapColumns, gapValues } = data;
  const tableTitle = (b.title ?? "").trim();
  const tableTitleSize = Math.max(12, b.titleSize ?? 18);
  const tableTitleColor = b.titleColor
    ? (b.titleColor.startsWith("#") ? b.titleColor : `#${b.titleColor}`)
    : SLIDE_HEX.ink;
  const tableTitleGap = tableTitle ? tableTitleSize + 12 : 0;
  const tableTitleEl = tableTitle ? (
    <div
      style={{
        height: tableTitleGap,
        display: "flex",
        alignItems: "flex-start",
        color: tableTitleColor,
        fontFamily: "Calibri",
        fontSize: tableTitleSize,
        fontWeight: 700,
        lineHeight: 1.1,
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
      }}
      title={tableTitle}
    >
      {tableTitle}
    </div>
  ) : null;
  const hasSingleMeasure = measures.length === 1;
  const measureById = new Map(measures.map((measure) => [measure.id, measure]));
  const tableHeaderLabel = (colLabel: string, measureLabel: string) =>
    hasSingleMeasure ? colLabel : `${colLabel} - ${measureLabel}`;
  const fit = resolveTableFit(b, sortedHeaders.length);
  const visibleHeaders = sortedHeaders.slice(0, fit.shown);
  const hiddenHeaders = sortedHeaders.slice(fit.shown);
  const showOthers = !!b.showOthers && hiddenHeaders.length > 0;
  const cols = result.colHeaders;
  const showCols = cols.length > 0 && cols[0].values.length > 0;
  const showLastColumnVariation = !!b.showLastColumnVariation && showCols && cols.length >= 2;
  const previousCol = showLastColumnVariation ? cols[cols.length - 2] : null;
  const lastCol = showLastColumnVariation ? cols[cols.length - 1] : null;
  const gapStartIndex = (showCols ? cols.length * measures.length : measures.length)
    + (showLastColumnVariation ? measures.length : 0);

  // Agrega "Outros" cell-by-cell
  const othersRow: Record<string, Record<string, number>> | null = showOthers ? (() => {
    const acc: Record<string, Record<string, number>> = { __row__: {} };
    for (const m of measures) acc.__row__[m.id] = 0;
    if (showCols) for (const c of cols) {
      acc[c.key] = {};
      for (const m of measures) acc[c.key][m.id] = 0;
    }
    for (const rh of hiddenHeaders) {
      for (const m of measures) acc.__row__[m.id] += result.rowTotals.get(rh.key)?.[m.id] ?? 0;
      if (showCols) for (const c of cols) for (const m of measures) {
        acc[c.key][m.id] += result.cells.get(rh.key)?.get(c.key)?.[m.id] ?? 0;
      }
    }
    return acc;
  })() : null;

  const renderedRowCount = 1 + visibleHeaders.length + (othersRow ? 1 : 0);
  const manualRowHeightPx = b.autoFit === false
    ? Math.max(1, (b.h - tableTitleGap) / Math.max(1, renderedRowCount))
    : 0;
  const compactTableCell: React.CSSProperties = b.autoFit === false
    ? {
        padding: manualRowHeightPx < 18 ? "0 4px" : manualRowHeightPx < 24 ? "1px 6px" : undefined,
        fontSize: manualRowHeightPx < 14 ? 8 : manualRowHeightPx < 20 ? 9 : undefined,
        lineHeight: manualRowHeightPx < 20 ? 1 : undefined,
        height: "100%",
      }
    : {};
  const wrappedTextStyle: React.CSSProperties = {
    whiteSpace: "normal",
    overflow: "hidden",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    textOverflow: undefined,
  };
  const clippedTextStyle: React.CSSProperties = {
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
  const renderCellHead: React.CSSProperties = {
    ...cellHead,
    ...compactTableCell,
    ...(b.wrapColumnText ? wrappedTextStyle : clippedTextStyle),
  };
  const renderCellLabel: React.CSSProperties = {
    ...cellLabel,
    ...compactTableCell,
    ...(b.wrapRowText ? wrappedTextStyle : clippedTextStyle),
  };
  const renderCellVal: React.CSSProperties = { ...cellVal, ...compactTableCell };

  // ---------- Formatação condicional ----------
  const valueAlign = b.valueAlign ?? "right";
  const cellValDyn: React.CSSProperties = { ...renderCellVal, textAlign: valueAlign };
  const tableCell = (
    tag: "th" | "td",
    content: React.ReactNode,
    style: React.CSSProperties,
    key?: React.Key,
  ) => {
    if (!readOnly) {
      return tag === "th"
        ? <th key={key} style={style}>{content}</th>
        : <td key={key} style={style}>{content}</td>;
    }
    const inner = exportCellContent(content, {
      padding: style.padding,
      align: style.textAlign,
      wrap: style.whiteSpace === "normal" || style.whiteSpace === "pre-wrap",
    });
    const cellStyle = exportCellStyle(style);
    return tag === "th"
      ? <th key={key} style={cellStyle}>{inner}</th>
      : <td key={key} style={cellStyle}>{inner}</td>;
  };

  const getValueFor = (rhKey: string, colKey: string, mId: string): number => {
    if (showCols && colKey !== "__row__") {
      return result.cells.get(rhKey)?.get(colKey)?.[mId] ?? 0;
    }
    return result.rowTotals.get(rhKey)?.[mId] ?? 0;
  };

  const variationPct = (current: number, previous: number): number | null => {
    if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
    return (current - previous) / Math.abs(previous);
  };
  const fmtVariation = (value: number | null): string => {
    if (value === null) return "—";
    const sign = value > 0 ? "+" : "";
    return `${sign}${(value * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  };
  const variationStyle = (value: number | null): React.CSSProperties => {
    if (value === null) return { color: SLIDE_HEX.slate400 };
    if (value > 0) return { color: SLIDE_HEX.successDark, fontWeight: 700 };
    if (value < 0) return { color: SLIDE_HEX.dangerDark, fontWeight: 700 };
    return { color: SLIDE_HEX.slate500, fontWeight: 700 };
  };
  const gapCellStyle = (value: number | null): React.CSSProperties => {
    if (value === null) return { color: SLIDE_HEX.slate400 };
    if (value > 0) return { color: SLIDE_HEX.successDark, fontWeight: 700 };
    if (value < 0) return { color: SLIDE_HEX.dangerDark, fontWeight: 700 };
    return { color: SLIDE_HEX.slate500, fontWeight: 700 };
  };
  const fmtGap = (gap: TableGapColumn, value: number | null | undefined): string => {
    if (value == null) return "—";
    const measure = measureById.get(gap.measureId);
    if (!measure) return "—";
    const formatted = fmtMeasure(measure, Math.abs(value));
    if (value > 0) return `+${formatted}`;
    if (value < 0) return `-${formatted}`;
    return formatted;
  };
  const variationHeaderLabel = (measureLabel: string) =>
    measures.length === 1 ? "Var. % vs mês ant." : `Var. % ${measureLabel}`;
  const getRowVariation = (rhKey: string, mId: string): number | null => {
    if (!previousCol || !lastCol) return null;
    const previous = result.cells.get(rhKey)?.get(previousCol.key)?.[mId] ?? 0;
    const current = result.cells.get(rhKey)?.get(lastCol.key)?.[mId] ?? 0;
    return variationPct(current, previous);
  };
  const getOthersVariation = (mId: string): number | null => {
    if (!previousCol || !lastCol || !othersRow) return null;
    const previous = othersRow[previousCol.key]?.[mId] ?? 0;
    const current = othersRow[lastCol.key]?.[mId] ?? 0;
    return variationPct(current, previous);
  };
  const getOthersGap = (gapId: string) =>
    hiddenHeaders.reduce((sum, rh) => sum + (gapValues.get(rh.key)?.[gapId] ?? 0), 0);
  // Pré-computa pools de valores por (medida, escopo-key) p/ heatmap/avg/data_bar
  const cfPoolCache = new Map<string, number[]>();
  const getPool = (mId: string, colKey: string, rowKey: string, scope: "column" | "table" | "row"): number[] => {
    const cacheKey = `${mId}::${scope}::${scope === "column" ? colKey : scope === "row" ? rowKey : "_"}`;
    const cached = cfPoolCache.get(cacheKey);
    if (cached) return cached;
    const out: number[] = [];
    const rowSet = visibleHeaders;
    if (scope === "column") {
      for (const rh of rowSet) {
        const v = getValueFor(rh.key, colKey, mId);
        if (v > 0) out.push(v);
      }
    } else if (scope === "row") {
      if (showCols) {
        for (const c of cols) {
          const v = getValueFor(rowKey, c.key, mId);
          if (v > 0) out.push(v);
        }
      } else {
        const v = getValueFor(rowKey, "__row__", mId);
        if (v > 0) out.push(v);
      }
    } else {
      for (const rh of rowSet) {
        if (showCols) {
          for (const c of cols) {
            const v = getValueFor(rh.key, c.key, mId);
            if (v > 0) out.push(v);
          }
        } else {
          const v = getValueFor(rh.key, "__row__", mId);
          if (v > 0) out.push(v);
        }
      }
    }
    cfPoolCache.set(cacheKey, out);
    return out;
  };

  const lerpColor = (a: string, b2: string, t: number): string => {
    const r1 = parseInt(a.slice(0, 2), 16), g1 = parseInt(a.slice(2, 4), 16), bb1 = parseInt(a.slice(4, 6), 16);
    const r2 = parseInt(b2.slice(0, 2), 16), g2 = parseInt(b2.slice(2, 4), 16), bb2 = parseInt(b2.slice(4, 6), 16);
    const r = Math.round(r1 + (r2 - r1) * t).toString(16).padStart(2, "0");
    const g = Math.round(g1 + (g2 - g1) * t).toString(16).padStart(2, "0");
    const bx = Math.round(bb1 + (bb2 - bb1) * t).toString(16).padStart(2, "0");
    return r + g + bx;
  };
  const luminanceOf = (hex: string): number => {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const bb = parseInt(hex.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * bb) / 255;
  };

  const getConditionalStyle = (mId: string, value: number, colKey: string, rowKey: string): React.CSSProperties => {
    const rule = b.conditionalFormats?.[mId];
    if (!rule || rule.mode === "none") return {};
    const scope = rule.scope ?? "table";
    const pool = getPool(mId, colKey, rowKey, scope);
    if (pool.length === 0) return {};
    const min = Math.min(...pool);
    const max = Math.max(...pool);
    const t = max === min ? 0.5 : Math.max(0, Math.min(1, (value - min) / (max - min)));

    if (rule.mode === "heatmap") {
      const cMin = rule.colorMin ?? "F8696B";
      const cMax = rule.colorMax ?? "63BE7B";
      const cMid = rule.colorMid;
      let bgHex: string;
      if (cMid) {
        bgHex = t < 0.5 ? lerpColor(cMin, cMid, t * 2) : lerpColor(cMid, cMax, (t - 0.5) * 2);
      } else {
        bgHex = lerpColor(cMin, cMax, t);
      }
      return {
        backgroundColor: `#${bgHex}`,
        color: luminanceOf(bgHex) > 0.6 ? SLIDE_HEX.chart2 : SLIDE_HEX.white,
      };
    }
    if (rule.mode === "above_avg") {
      const avg = pool.reduce((s, x) => s + x, 0) / pool.length;
      if (value > avg) return { backgroundColor: SLIDE_HEX.successSoft, color: SLIDE_HEX.successDark };
      if (value < avg) return { backgroundColor: SLIDE_HEX.dangerSoft, color: SLIDE_HEX.dangerDark };
      return {};
    }
    if (rule.mode === "data_bar") {
      const pct = Math.round(t * 100);
      return { background: `linear-gradient(90deg, ${SLIDE_HEX.blueSoft} ${pct}%, transparent ${pct}%)` };
    }
    return {};
  };

  const rowCount = 1 + visibleHeaders.length + (othersRow ? 1 : 0);
  const rowH = 100 / rowCount;
  const firstCol = columnLayouts[0] ?? { key: TABLE_ROW_COL_KEY, left: 0, width: 100 };
  const valueCol = (idx: number) => columnLayouts[idx + 1] ?? { key: `missing-${idx}`, left: firstCol.width, width: 0 };

  const headerCells = [
      <ExportPositionedCell key="row-head" style={renderCellHead} left={firstCol.left} top={0} width={firstCol.width} height={rowH} padX={8}>
        {b.rowDims.map((d) => labelOfDim(d)).join(" / ") || "Total"}
      </ExportPositionedCell>,
      ...(showCols
        ? [
            ...cols.flatMap((c, ci) => measures.map((m, mi) => (
              <ExportPositionedCell
                key={`${c.key}-${m.id}`}
                style={renderCellHead}
                left={valueCol(ci * measures.length + mi).left}
                top={0}
                width={valueCol(ci * measures.length + mi).width}
                height={rowH}
                padX={8}
              >
                {tableHeaderLabel(c.values.join(" / "), m.label)}
              </ExportPositionedCell>
            ))),
            ...(showLastColumnVariation
              ? measures.map((m, mi) => (
                  <ExportPositionedCell
                    key={`var-${m.id}`}
                    style={renderCellHead}
                    left={valueCol(cols.length * measures.length + mi).left}
                    top={0}
                    width={valueCol(cols.length * measures.length + mi).width}
                    height={rowH}
                    padX={8}
                  >
                    {variationHeaderLabel(m.label)}
                  </ExportPositionedCell>
                ))
              : []),
          ]
        : measures.map((m, mi) => (
            <ExportPositionedCell key={m.id} style={renderCellHead} left={valueCol(mi).left} top={0} width={valueCol(mi).width} height={rowH} padX={8}>
              {m.label}
            </ExportPositionedCell>
          ))),
      ...gapColumns.map((gap, gi) => {
        const col = valueCol(gapStartIndex + gi);
        return (
          <ExportPositionedCell key={`gap-${gap.id}`} style={renderCellHead} left={col.left} top={0} width={col.width} height={rowH} padX={8}>
            {tableGapLabel(gap, measureById.get(gap.measureId))}
          </ExportPositionedCell>
        );
      }),
    ];

    const bodyCells = visibleHeaders.flatMap((rh, ri) => [
      <ExportPositionedCell key={`${rh.key}-label`} style={renderCellLabel} left={firstCol.left} top={(ri + 1) * rowH} width={firstCol.width} height={rowH} padX={8}>
        {rh.values.join(" / ") || "Total"}
      </ExportPositionedCell>,
      ...(showCols
        ? [
            ...cols.flatMap((c, ci) => measures.map((m, mi) => {
              const v = result.cells.get(rh.key)?.get(c.key)?.[m.id] ?? 0;
              return (
                <ExportPositionedCell
                  key={`${rh.key}-${c.key}-${m.id}`}
                  style={{ ...cellValDyn, ...getConditionalStyle(m.id, v, c.key, rh.key) }}
                  left={valueCol(ci * measures.length + mi).left}
                  top={(ri + 1) * rowH}
                  width={valueCol(ci * measures.length + mi).width}
                  height={rowH}
                  padX={8}
                >
                  {fmtMeasure(m, v)}
                </ExportPositionedCell>
              );
            })),
            ...(showLastColumnVariation
              ? measures.map((m, mi) => {
                  const v = getRowVariation(rh.key, m.id);
                  return (
                    <ExportPositionedCell
                      key={`${rh.key}-var-${m.id}`}
                      style={{ ...cellValDyn, ...variationStyle(v) }}
                      left={valueCol(cols.length * measures.length + mi).left}
                      top={(ri + 1) * rowH}
                      width={valueCol(cols.length * measures.length + mi).width}
                      height={rowH}
                      padX={8}
                    >
                      {fmtVariation(v)}
                    </ExportPositionedCell>
                  );
                })
              : []),
          ]
        : measures.map((m, mi) => {
            const v = result.rowTotals.get(rh.key)?.[m.id] ?? 0;
            return (
              <ExportPositionedCell
                key={`${rh.key}-${m.id}`}
                style={{ ...cellValDyn, ...getConditionalStyle(m.id, v, "__row__", rh.key) }}
                left={valueCol(mi).left}
                top={(ri + 1) * rowH}
                width={valueCol(mi).width}
                height={rowH}
                padX={8}
              >
                {fmtMeasure(m, v)}
              </ExportPositionedCell>
            );
          })),
      ...gapColumns.map((gap, gi) => {
        const value = gapValues.get(rh.key)?.[gap.id] ?? null;
        const col = valueCol(gapStartIndex + gi);
        return (
          <ExportPositionedCell
            key={`${rh.key}-gap-${gap.id}`}
            style={{ ...cellValDyn, ...gapCellStyle(value) }}
            left={col.left}
            top={(ri + 1) * rowH}
            width={col.width}
            height={rowH}
            padX={8}
          >
            {fmtGap(gap, value)}
          </ExportPositionedCell>
        );
      }),
    ]);

    const othersCells = othersRow
      ? [
          <ExportPositionedCell
            key="others-label"
            style={{ ...renderCellLabel, fontStyle: "italic", background: SLIDE_HEX.gridSoft }}
            left={firstCol.left}
            top={(rowCount - 1) * rowH}
            width={firstCol.width}
            height={rowH}
            padX={8}
          >
            Outros ({hiddenHeaders.length})
          </ExportPositionedCell>,
          ...(showCols
            ? [
                ...cols.flatMap((c, ci) => measures.map((m, mi) => (
                  <ExportPositionedCell
                    key={`oth-${c.key}-${m.id}`}
                    style={{ ...cellValDyn, fontStyle: "italic", background: SLIDE_HEX.gridSoft }}
                    left={valueCol(ci * measures.length + mi).left}
                    top={(rowCount - 1) * rowH}
                    width={valueCol(ci * measures.length + mi).width}
                    height={rowH}
                    padX={8}
                  >
                    {fmtMeasure(m, othersRow[c.key]?.[m.id])}
                  </ExportPositionedCell>
                ))),
                ...(showLastColumnVariation
                  ? measures.map((m, mi) => {
                      const v = getOthersVariation(m.id);
                      return (
                        <ExportPositionedCell
                          key={`oth-var-${m.id}`}
                          style={{ ...cellValDyn, fontStyle: "italic", background: SLIDE_HEX.gridSoft, ...variationStyle(v) }}
                          left={valueCol(cols.length * measures.length + mi).left}
                          top={(rowCount - 1) * rowH}
                          width={valueCol(cols.length * measures.length + mi).width}
                          height={rowH}
                          padX={8}
                        >
                          {fmtVariation(v)}
                        </ExportPositionedCell>
                      );
                    })
                  : []),
              ]
            : measures.map((m, mi) => (
                <ExportPositionedCell
                  key={`oth-${m.id}`}
                  style={{ ...cellValDyn, fontStyle: "italic", background: SLIDE_HEX.gridSoft }}
                  left={valueCol(mi).left}
                  top={(rowCount - 1) * rowH}
                  width={valueCol(mi).width}
                  height={rowH}
                  padX={8}
                >
                  {fmtMeasure(m, othersRow.__row__[m.id])}
                </ExportPositionedCell>
              ))),
          ...gapColumns.map((gap, gi) => {
            const value = getOthersGap(gap.id);
            const col = valueCol(gapStartIndex + gi);
            return (
              <ExportPositionedCell
                key={`oth-gap-${gap.id}`}
                style={{ ...cellValDyn, fontStyle: "italic", background: SLIDE_HEX.gridSoft, ...gapCellStyle(value) }}
                left={col.left}
                top={(rowCount - 1) * rowH}
                width={col.width}
                height={rowH}
                padX={8}
              >
                {fmtGap(gap, value)}
              </ExportPositionedCell>
            );
          }),
        ]
      : [];
    const resizeHandles = !readOnly && onPatch
      ? columnLayouts.slice(0, -1).map((layout, index) => (
          <div
            key={`resize-${layout.key}`}
            style={{
              position: "absolute",
              left: `${layout.left + layout.width}%`,
              top: 0,
              width: 0,
              height: `${rowH}%`,
              zIndex: 30,
            }}
          >
            <TableColumnResizeHandle onPointerDown={(event) => startTableColumnResize(index, event)} />
          </div>
        ))
      : null;

    return (
      <div style={{ width: "100%", height: "100%", overflow: "hidden", fontFamily: "Calibri", fontSize: 12 }}>
        {tableTitleEl}
        <div ref={tableResizeRef} style={{
          width: "100%",
          height: `calc(100% - ${tableTitleGap}px)`,
          position: "relative",
        }}>
          {headerCells}
          {bodyCells}
          {othersCells}
          {resizeHandles}
        </div>
      </div>
    );
  }

// ---------------------------------------------------------------------------
// Chart — delegates to the unified ChartCanvas (Recharts + ChartStyle)
// ---------------------------------------------------------------------------
import { ChartCanvas } from "./chart/ChartCanvas";

function ChartRender({ block, cacheSlideId }: { block: ChartBlock; cacheSlideId?: string }) {
  return <ChartCanvas block={block} cacheSlideId={cacheSlideId} />;
}

// ---------------------------------------------------------------------------
// Top SKU / Top Ranking
// ---------------------------------------------------------------------------
function TopSkuRender({ block: b }: { block: TopSkuBlock }) {
  const pricing = usePricing((s) => s.rows);
  const budget = useBudget((s) => s.rows);
  const forecast = useForecast((s) => s.rows);
  const rolling = useRolling((s) => s.rows);
  const missingData = missingLocalDataLabel(b.dataSource, {
    pricing: pricing.length,
    budget: budget.length,
    forecast: forecast.length,
    rolling: rolling.length,
  });
  const rows = useDataSource(b.dataSource, pricing, budget, forecast, rolling);
  // Sempre busca todos para podermos calcular o efetivo + Outros
  const allItems = useMemo(
    () => computeTopRanking(
      rows,
      b.filters,
      b.dim,
      b.measure,
      9999,
      b.periodMode,
      b.periodValue,
      b.periodSelectionMode,
      b.relativePeriod,
    ),
    [rows, b.filters, b.dim, b.measure, b.periodMode, b.periodValue, b.periodSelectionMode, b.relativePeriod],
  );
  const fit = resolveTopSkuFit(b, allItems.length);
  const visible = allItems.slice(0, fit.shown);
  const hidden = allItems.slice(fit.shown);
  const items = b.showOthers && hidden.length > 0
    ? [...visible, {
        name: `Outros (${hidden.length})`,
        value: hidden.reduce((s, x) => s + x.value, 0),
        share: hidden.reduce((s, x) => s + x.share, 0),
      }]
    : visible;
  const fmt = (v: number) => formatValue(v, inferFormat(b.measure), b.measure);
  const max = Math.max(...items.map((i) => i.value), 1);
  const topTitleH = b.title ? 28 : 0;
  const topRowCount = 1 + items.length;
  const topManualRowPx = Math.max(1, (b.h - topTitleH) / Math.max(1, topRowCount));
  const topManualFontSize = topManualRowPx < 14 ? 8 : topManualRowPx < 20 ? 9 : 12;
  const topManualPadX = topManualRowPx < 18 ? 4 : 6;

  if (missingData) return <MissingLocalData label={missingData} />;
  const shareColW = b.showShare ? 12 : 0;
    const rankColW = 8;
    const valueColW = 22;
    const itemColW = 100 - rankColW - valueColW - shareColW;
    const rowH = 100 / Math.max(1, topRowCount);
    const headerStyle: React.CSSProperties = {
      ...topHead,
      background: SLIDE_HEX.chart1,
      color: SLIDE_HEX.white,
      fontSize: Math.min(11, topManualFontSize),
      padding: 0,
      lineHeight: 1,
    };
    const bodyBase: React.CSSProperties = {
      color: SLIDE_HEX.chart2,
      background: SLIDE_HEX.white,
      borderBottom: `1px solid ${SLIDE_HEX.grid}`,
      fontSize: topManualFontSize,
      padding: 0,
      lineHeight: 1,
      fontFamily: "Calibri",
    };
    const headerCells = [
      <ExportPositionedCell key="rank-head" style={headerStyle} left={0} top={0} width={rankColW} height={rowH} padX={topManualPadX}>#</ExportPositionedCell>,
      <ExportPositionedCell key="item-head" style={{ ...headerStyle, textAlign: "left" }} left={rankColW} top={0} width={itemColW} height={rowH} padX={topManualPadX}>Item</ExportPositionedCell>,
      <ExportPositionedCell key="value-head" style={{ ...headerStyle, textAlign: "right" }} left={rankColW + itemColW} top={0} width={valueColW} height={rowH} padX={topManualPadX}>Valor</ExportPositionedCell>,
      ...(b.showShare
        ? [<ExportPositionedCell key="share-head" style={{ ...headerStyle, textAlign: "right" }} left={rankColW + itemColW + valueColW} top={0} width={shareColW} height={rowH} padX={topManualPadX}>%</ExportPositionedCell>]
        : []),
    ];
    const bodyCells = items.flatMap((it, i) => {
      const isOthers = b.showOthers && i === items.length - 1 && hidden.length > 0;
      const top = (i + 1) * rowH;
      const rowBg = isOthers ? SLIDE_HEX.gridSoft : SLIDE_HEX.white;
      const barPct = max > 0 ? Math.max(0, Math.min(100, (it.value / max) * 100)) : 0;
      const itemBg = isOthers
        ? rowBg
        : `linear-gradient(90deg, ${SLIDE_HEX.haraldWash} ${barPct}%, ${rowBg} ${barPct}%)`;
      return [
        <ExportPositionedCell key={`${it.name}-rank`} style={{ ...bodyBase, color: SLIDE_HEX.slate500, fontWeight: 600, background: rowBg, textAlign: "center" }} left={0} top={top} width={rankColW} height={rowH} padX={topManualPadX}>
          {isOthers ? "—" : i + 1}
        </ExportPositionedCell>,
        <ExportPositionedCell key={`${it.name}-name`} style={{ ...bodyBase, background: itemBg, fontStyle: isOthers ? "italic" : undefined, textAlign: "left" }} left={rankColW} top={top} width={itemColW} height={rowH} padX={topManualPadX}>
          {it.name}
        </ExportPositionedCell>,
        <ExportPositionedCell key={`${it.name}-value`} style={{ ...bodyBase, background: rowBg, fontWeight: 600, fontStyle: isOthers ? "italic" : undefined, textAlign: "right" }} left={rankColW + itemColW} top={top} width={valueColW} height={rowH} padX={topManualPadX}>
          {fmt(it.value)}
        </ExportPositionedCell>,
        ...(b.showShare
          ? [<ExportPositionedCell key={`${it.name}-share`} style={{ ...bodyBase, background: rowBg, color: SLIDE_HEX.slate500, textAlign: "right" }} left={rankColW + itemColW + valueColW} top={top} width={shareColW} height={rowH} padX={topManualPadX}>
              {(it.share * 100).toFixed(1)}%
            </ExportPositionedCell>]
          : []),
      ];
    });
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", fontFamily: "Calibri", overflow: "hidden" }}>
        {b.title && (
          <div style={{ height: topTitleH, fontSize: 16, fontWeight: 700, color: SLIDE_HEX.chart1, padding: "4px 8px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
            {b.title}
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden" }}>
          {headerCells}
          {bodyCells}
        </div>
      </div>
    );
  }

const topHead: React.CSSProperties = {
  padding: "5px 6px", fontSize: 11, fontWeight: 700, textAlign: "center",
};

const cellHead: React.CSSProperties = {
  background: SLIDE_HEX.chart1, color: SLIDE_HEX.white, padding: "6px 8px", textAlign: "center",
  fontWeight: 700, fontSize: 11, border: `1px solid ${SLIDE_HEX.white}`, verticalAlign: "middle", lineHeight: 1.15,
};
const cellLabel: React.CSSProperties = {
  padding: "5px 8px", textAlign: "left", fontWeight: 600,
  color: SLIDE_HEX.chart2, borderBottom: `1px solid ${SLIDE_HEX.grid}`, background: SLIDE_HEX.white,
  verticalAlign: "middle", lineHeight: 1.15,
};
const cellVal: React.CSSProperties = {
  padding: "5px 8px", textAlign: "right", color: SLIDE_HEX.chart2,
  borderBottom: `1px solid ${SLIDE_HEX.grid}`, background: SLIDE_HEX.white,
  verticalAlign: "middle", lineHeight: 1.15,
};

// ---------------------------------------------------------------------------
// DRE — tabela DRE compacta usando os mesmos dados do KE30
// ---------------------------------------------------------------------------
function lerpColor(a: string, b: string, t: number): string {
  const pa = a.replace("#", ""), pb = b.replace("#", "");
  const ri = (h: string, o: number) => parseInt(h.slice(o, o + 2), 16);
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
  const r = lerp(ri(pa, 0), ri(pb, 0));
  const g = lerp(ri(pa, 2), ri(pb, 2));
  const bv = lerp(ri(pa, 4), ri(pb, 4));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bv.toString(16).padStart(2, "0")}`;
}

function conditionalColor(
  val: number, min: number, max: number,
  colorMin: string, colorMid: string, colorMax: string,
): string {
  if (max === min) return colorMid;
  const t = Math.max(0, Math.min(1, (val - min) / (max - min)));
  return t <= 0.5 ? lerpColor(colorMin, colorMid, t * 2) : lerpColor(colorMid, colorMax, (t - 0.5) * 2);
}

function DreRender({ block: blk }: { block: DreBlock; readOnly?: boolean }) {
  const pricingRows = usePricing((s) => s.rows);
  const budgetRows = useBudget((s) => s.rows);
  const forecastRows = useForecast((s) => s.rows);
  const rollingRows = useRolling((s) => s.rows);
  const missingData = missingLocalDataLabel(blk.dataSource, {
    pricing: pricingRows.length,
    budget: budgetRows.length,
    forecast: forecastRows.length,
    rolling: rollingRows.length,
  });
  const sourceRows = useDataSource(blk.dataSource, pricingRows, budgetRows, forecastRows, rollingRows);
  const months = useMonthsInfo();

  const filteredRows = useMemo(
    () => applyFilters(sourceRows, blk.filters ?? {}, null),
    [sourceRows, blk.filters],
  );

  const cols = useMemo(() => {
    const allMonths = [...months].sort((a, b) =>
      a.ano !== b.ano ? a.ano - b.ano : a.mes - b.mes,
    );
    const selected = resolvePeriodValues(
      sourceRows,
      blk.periodos,
      blk.periodosSelectionMode,
      blk.periodosRelativePeriod,
    );
    if (!selected || selected.length === 0) return allMonths.slice(-6);
    return allMonths.filter((m) => selected.includes(m.periodo));
  }, [months, sourceRows, blk.periodos, blk.periodosSelectionMode, blk.periodosRelativePeriod]);

  const aggsByCol = useMemo(() => {
    const map = new Map<string, ReturnType<typeof aggregate>>();
    for (const col of cols) {
      const rs = filteredRows.filter((r) => r.periodo === col.periodo);
      map.set(col.periodo, aggregate(rs));
    }
    return map;
  }, [filteredRows, cols]);

  const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

  const visibleLines = useMemo(() => {
    if (!blk.linhas) return LINES;
    return LINES.filter((l) => blk.linhas!.includes(l.id));
  }, [blk.linhas]);

  const showVar = (blk.showVariacao ?? false) && cols.length >= 2;
  const ultimoCol = showVar ? cols[cols.length - 1] : null;
  const penultimoCol = showVar ? cols[cols.length - 2] : null;
  const aggUltimo = showVar && ultimoCol ? aggsByCol.get(ultimoCol.periodo) ?? null : null;
  const aggPenultimo = showVar && penultimoCol ? aggsByCol.get(penultimoCol.periodo) ?? null : null;

  const LINHAS_CUSTO = ["cv","cvPctRol","cvKg","mp","emb","cf","cfKg","mod","cif","frete","freteKg","com","comPct","comKg"];

  const conditionalMeta = useMemo(() => {
    const cf = blk.conditionalFormat;
    if (!cf?.enabled || cf.linhasAtivas.length === 0 || cols.length === 0) return null;
    const activeLines = LINES.filter((l) => cf.linhasAtivas.includes(l.id));
    const rowMinMax = new Map<string, { min: number; max: number }>();
    let tableMin = Infinity, tableMax = -Infinity;
    for (const line of activeLines) {
      const vals = cols.map((col) => {
        const agg = aggsByCol.get(col.periodo);
        return agg ? line.get(agg) : null;
      }).filter((v): v is number => v !== null);
      if (vals.length === 0) continue;
      const mn = Math.min(...vals), mx = Math.max(...vals);
      rowMinMax.set(line.id, { min: mn, max: mx });
      tableMin = Math.min(tableMin, mn);
      tableMax = Math.max(tableMax, mx);
    }
    return {
      cf,
      rowMinMax,
      tableMin: isFinite(tableMin) ? tableMin : 0,
      tableMax: isFinite(tableMax) ? tableMax : 0,
    };
  }, [blk.conditionalFormat, cols, aggsByCol]);

  if (missingData) return <MissingLocalData label={missingData} />;
  if (cols.length === 0) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: "100%", height: "100%", color: SLIDE_HEX.slate400,
        fontSize: blk.fontSize, fontFamily: "Calibri, Arial, sans-serif",
      }}>
        Configure os períodos para exibir o DRE
      </div>
    );
  }

  const fs = blk.fontSize;
  const pad = `${Math.round(fs * 0.27)}px ${Math.round(fs * 0.55)}px`;
  const padVal = `${Math.round(fs * 0.27)}px ${Math.round(fs * 0.36)}px`;
  const dreLineLabel = (line: (typeof visibleLines)[number]) =>
    line.id === "vol" ? "Volume (Tons)" : line.label;
  const fmtDreValue = (line: (typeof visibleLines)[number], value: number | null) =>
    line.id === "vol" && value !== null ? formatNum(value, 0) : fmt(value, line.kind);

  const rowCount = 1 + visibleLines.length;
  const rowH = 100 / rowCount;
  const firstColW = 30;
  const periodColW = (showVar ? 55 : 70) / cols.length;
  const varColW = showVar ? 15 : 0;
  const leftForPeriod = (idx: number) => firstColW + idx * periodColW;
  const headerBase: React.CSSProperties = {
      background: blk.headerColor,
      color: SLIDE_HEX.white,
      fontWeight: 600,
      fontSize: fs + 1,
      whiteSpace: "nowrap",
      lineHeight: 1.15,
    };

    const headerCells = [
      <ExportPositionedCell key="indicador" style={{ ...headerBase, padding: pad, textAlign: "left" }} left={0} top={0} width={firstColW} height={rowH} padX={Math.round(fs * 0.55)}>
        Indicador
      </ExportPositionedCell>,
      ...cols.map((col, ci) => (
        <ExportPositionedCell
          key={col.periodo}
          style={{ ...headerBase, padding: padVal, textAlign: "center" }}
          left={leftForPeriod(ci)}
          top={0}
          width={periodColW}
          height={rowH}
          padX={Math.round(fs * 0.36)}
        >
          {MESES[col.mes - 1]}/{String(col.ano).slice(2)}
        </ExportPositionedCell>
      )),
      ...(showVar && ultimoCol && penultimoCol
        ? [
            <ExportPositionedCell key="var" style={{
              ...headerBase,
              padding: padVal,
              textAlign: "center",
              borderLeft: "1px solid rgba(255,255,255,0.3)",
            }} left={firstColW + cols.length * periodColW} top={0} width={varColW} height={rowH} padX={Math.round(fs * 0.36)}>
              {MESES[ultimoCol.mes - 1]}/{String(ultimoCol.ano).slice(2)}
              {" vs "}
              {MESES[penultimoCol.mes - 1]}/{String(penultimoCol.ano).slice(2)}
            </ExportPositionedCell>,
          ]
        : []),
    ];

    const bodyCells = visibleLines.flatMap((line, idx) => {
      const isEven = idx % 2 === 0;
      const rowBg = isEven ? SLIDE_HEX.paper : SLIDE_HEX.white;
      const top = (idx + 1) * rowH;
      const lineCells: React.ReactNode[] = [
        <ExportPositionedCell key={`${line.id}-label`} style={{
          padding: pad,
          fontWeight: line.bold ? 600 : 400,
          color: line.id === "cm" || line.id === "cmPct" || line.id === "cmKg"
            ? blk.headerColor : blk.textColor,
          borderBottom: line.bold ? `1px solid ${blk.headerColor}30` : "none",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          fontSize: fs,
          textAlign: "left",
          background: rowBg,
        }} left={0} top={top} width={firstColW} height={rowH} padX={Math.round(fs * 0.55)}>
          {dreLineLabel(line)}
        </ExportPositionedCell>,
      ];

      for (let ci = 0; ci < cols.length; ci++) {
        const col = cols[ci];
        const agg = aggsByCol.get(col.periodo);
        const val = agg ? line.get(agg) : null;
        const isNeg = val !== null && val < 0;
        const cf = conditionalMeta?.cf;
        const cfActive = cf?.enabled && cf.linhasAtivas.includes(line.id) && val !== null;
        let cfBg: string | undefined;
        let cfColor: string | undefined;
        if (cfActive && conditionalMeta && val !== null) {
          const { min, max } = cf.scope === "row"
            ? (conditionalMeta.rowMinMax.get(line.id) ?? { min: val, max: val })
            : { min: conditionalMeta.tableMin, max: conditionalMeta.tableMax };
          const cc = conditionalColor(val, min, max, cf.colorMin, cf.colorMid, cf.colorMax);
          if (cf.applyTo === "cell") cfBg = cc;
          else cfColor = cc;
        }
        lineCells.push(
          <ExportPositionedCell key={`${line.id}-${col.periodo}`} style={{
            padding: padVal,
            textAlign: "center",
            fontWeight: line.bold ? 600 : 400,
            color: cfColor ?? (isNeg ? SLIDE_HEX.danger
              : (line.id === "cm" || line.id === "cmPct") ? SLIDE_HEX.success
              : blk.textColor),
            background: cfBg ?? rowBg,
            borderBottom: line.bold ? `1px solid ${blk.headerColor}30` : "none",
            fontSize: fs,
          }} left={leftForPeriod(ci)} top={top} width={periodColW} height={rowH} padX={Math.round(fs * 0.36)}>
            {fmtDreValue(line, val)}
          </ExportPositionedCell>,
        );
      }

      if (showVar && aggUltimo && aggPenultimo) {
        const valUltimo = line.get(aggUltimo);
        const valPenultimo = line.get(aggPenultimo);
        const varPct = valPenultimo !== 0 ? (valUltimo - valPenultimo) / Math.abs(valPenultimo) : null;
        const varAbs = valUltimo - valPenultimo;
        const isCusto = LINHAS_CUSTO.includes(line.id);
        const isPositivo = varPct !== null && varPct > 0;
        const cor = varPct === null ? blk.textColor
          : (isPositivo !== isCusto) ? SLIDE_HEX.success : SLIDE_HEX.danger;
        const tipo = blk.variacaoTipo ?? "percentual";
        let display: React.ReactNode = "—";
        if (tipo === "percentual") {
          if (varPct !== null) {
            const sinal = varPct > 0 ? "+" : "";
            display = `${sinal}${(varPct * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
          }
        } else if (tipo === "absoluta") {
          display = fmt(varAbs, line.kind);
        } else {
          const pctStr = varPct !== null
            ? `${varPct > 0 ? "+" : ""}${(varPct * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
            : "—";
          display = <>{pctStr} ({fmt(varAbs, line.kind)})</>;
        }
        lineCells.push(
          <ExportPositionedCell key={`${line.id}-var`} style={{
            padding: padVal,
            textAlign: "center",
            fontWeight: line.bold ? 600 : 400,
            color: cor,
            borderLeft: `1px solid ${blk.headerColor}20`,
            borderBottom: line.bold ? `1px solid ${blk.headerColor}30` : "none",
            fontSize: fs,
            background: rowBg,
          }} left={firstColW + cols.length * periodColW} top={top} width={varColW} height={rowH} padX={Math.round(fs * 0.36)}>
            {display}
          </ExportPositionedCell>,
        );
      }

      return lineCells;
    });

    return (
      <div style={{ width: "100%", height: "100%", overflow: "hidden", fontFamily: "Calibri, Arial, sans-serif" }}>
        <div style={{
          width: "100%",
          height: "100%",
          position: "relative",
          color: blk.textColor,
        }}>
          {headerCells}
          {bodyCells}
        </div>
      </div>
    );
  }
function labelOfDim(id: string): string {
  return ALL_DIMENSIONS.find((d) => d.id === id)?.label ?? id;
}

// ---------------------------------------------------------------------------
// Omni Analytics Renderers
// ---------------------------------------------------------------------------

const OMNI_COLORS = [
  SLIDE_HEX.chart1,
  SLIDE_HEX.chart2,
  SLIDE_HEX.chart5,
  SLIDE_HEX.chart7,
  SLIDE_HEX.warningDark,
  SLIDE_HEX.chart6,
  SLIDE_HEX.cyanDark,
  SLIDE_HEX.pinkDark,
];

function omniEmpty(msg = "Sem dados.") {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>{msg}</span>
    </div>
  );
}

function omniTitle(title: string) {
  return (
    <div style={{ fontSize: 12, fontWeight: 700, color: SLIDE_HEX.chart2, marginBottom: 6, paddingLeft: 2 }}>
      {title}
    </div>
  );
}

/** Maps OmniMetric to display info */
function omniMetricInfo(metric: OmniMetric): { label: string; fmt: (v: number) => string } {
  switch (metric) {
    case "cm":        return { label: "CM",       fmt: (v) => formatBRL(v, { compact: true }) };
    case "mb":        return { label: "MB",       fmt: (v) => formatBRL(v, { compact: true }) };
    case "rol":       return { label: "ROL",      fmt: (v) => formatBRL(v, { compact: true }) };
    case "volume":    return { label: "Volume",   fmt: (v) => formatTon(v) };
    case "margemPct": return { label: "Margem %", fmt: (v) => formatPct(v) };
  }
}

/** Resolve value from CanalTrendPoint based on OmniMetric */
function canalTrendValue(pt: ReturnType<typeof computeCanalTrend>[number], metric: OmniMetric): number {
  switch (metric) {
    case "cm":        return pt.margem;
    case "mb":        return pt.margem;
    case "rol":       return pt.rol;
    case "volume":    return pt.volumeKg;
    case "margemPct": return pt.margemPct;
  }
}

type BrazilStatePath = { uf: string; name: string; d: string };
type UfMapPoint = { uf: string; label: string; x: number; y: number };

const SVG_UF_ID = /^BR([A-Z]{2})$/;

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
      return { uf: match[1], name: decodeSvgText(path.getAttribute("name") ?? match[1]), d };
    })
    .filter((state): state is BrazilStatePath => Boolean(state));

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

function normalizeUf(value: string | undefined | null): string | null {
  const text = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
  if (/^[A-Z]{2}$/.test(text)) return text;
  const brCode = text.match(/\bBR\s*\/\s*([A-Z]{2})\b/)?.[1];
  return brCode ?? null;
}

function rowUf(row: PricingRow): string | null {
  return normalizeUf(row.uf) ?? normalizeUf(row.regiao) ?? normalizeUf(getUfFromRegiao(row.regiao));
}

function omniRowValue(row: PricingRow, metric: OmniMetric): number {
  switch (metric) {
    case "cm": return row.contribMarginal;
    case "mb": return row.margemBruta;
    case "rol": return row.rol;
    case "volume": return row.volumeKg;
    case "margemPct": return row.contribMarginal;
  }
}

function omniAggregatedValue(sum: { value: number; rol: number }, metric: OmniMetric): number {
  return metric === "margemPct" ? (sum.rol > 0 ? sum.value / sum.rol : 0) : sum.value;
}

// ---- omni_evolucao_mensal ----
function OmniEvolucaoMensalRender({ block: b }: { block: OmniEvolucaoMensalBlock }) {
  const pricing = usePricing((s) => s.rows);
  const filtered = useMemo(() => applyOmniFilters(pricing, b), [pricing, b]);
  const series = useMemo(() => computeCanalTrend(filtered, null, "cm"), [filtered]);
  const info = omniMetricInfo(b.metric);

  if (series.length === 0) return omniEmpty();

  const data = series.map((pt) => ({ label: pt.label, value: canalTrendValue(pt, b.metric) }));

  const DataElement = b.chartType === "bar"
    ? <Bar dataKey="value" name={info.label} fill={OMNI_COLORS[0]} radius={[3, 3, 0, 0]} isAnimationActive={false} />
    : b.chartType === "area"
    ? <Area type="monotone" dataKey="value" name={info.label} stroke={OMNI_COLORS[0]} fill={`${OMNI_COLORS[0]}33`} strokeWidth={2} dot={false} isAnimationActive={false} />
    : <Line type="monotone" dataKey="value" name={info.label} stroke={OMNI_COLORS[0]} strokeWidth={2} dot={false} isAnimationActive={false} />;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: 4 }}>
      {b.showTitle && omniTitle(b.title || "Evolução Mensal")}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 24, left: 8 }}>
            <CartesianGrid stroke="hsl(var(--border) / 0.3)" strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} angle={-30} textAnchor="end" height={36} />
            <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickFormatter={info.fmt} width={56} />
            <Tooltip formatter={(v: number) => [info.fmt(v), info.label]} />
            {b.showLegend && <Legend wrapperStyle={{ fontSize: 10 }} />}
            {DataElement}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---- omni_heatmap_sazonalidade ----
const FY_MONTHS = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];
const MONTH_LABELS = ["Jul", "Ago", "Set", "Out", "Nov", "Dez", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun"];

function heatColorOmni(v: number | null, min: number, max: number): { bg: string; color: string } {
  if (v === null) return { bg: "hsl(var(--muted) / 0.3)", color: "hsl(var(--muted-foreground))" };
  const range = max - min;
  const t = range > 0 ? (v - min) / range : 0.5;
  const h = t * 158;
  const s = 80;
  const l = 65 - t * 13;
  return { bg: `hsl(${h.toFixed(0)} ${s}% ${l.toFixed(0)}%)`, color: l < 58 ? SLIDE_HEX.white : SLIDE_HEX.chart2 };
}

function OmniHeatmapSazonalidadeRender({ block: b }: { block: OmniHeatmapSazonalidadeBlock }) {
  const pricing = usePricing((s) => s.rows);
  const filtered = useMemo(() => applyOmniFilters(pricing, b), [pricing, b]);
  const info = omniMetricInfo(b.metric);

  const { matrix, min, max } = useMemo(() => {
    const acc = new Map<string, Map<number, number>>();
    for (const r of filtered) {
      const fy = r.fy || String(r.ano);
      const byM = acc.get(fy) ?? new Map<number, number>();
      const prev = byM.get(r.mes) ?? 0;
      const val = b.metric === "rol" ? r.rol
        : b.metric === "volume" ? r.volumeKg
        : b.metric === "margemPct" ? r.contribMarginal  // raw cm, we'll normalize later
        : b.metric === "mb" ? r.margemBruta
        : r.contribMarginal; // cm
      byM.set(r.mes, prev + val);
      acc.set(fy, byM);
    }
    const fys = Array.from(acc.keys()).sort();
    if (b.metric === "margemPct") {
      // need ROL per cell too for %
      const rolAcc = new Map<string, Map<number, number>>();
      for (const r of filtered) {
        const fy = r.fy || String(r.ano);
        const byM = rolAcc.get(fy) ?? new Map<number, number>();
        byM.set(r.mes, (byM.get(r.mes) ?? 0) + r.rol);
        rolAcc.set(fy, byM);
      }
      const mRows = fys.map((fy) => {
        const byM = acc.get(fy)!;
        const byRol = rolAcc.get(fy)!;
        return { fy, cells: FY_MONTHS.map((m) => { const cm = byM.get(m); const rol = byRol?.get(m) ?? 0; return cm != null && rol > 0 ? cm / rol : null; }) };
      });
      const allVals = mRows.flatMap((r) => r.cells.filter((v): v is number => v !== null));
      return { matrix: mRows, min: allVals.length ? Math.min(...allVals) : 0, max: allVals.length ? Math.max(...allVals) : 1 };
    }
    const mRows = fys.map((fy) => {
      const byM = acc.get(fy)!;
      return { fy, cells: FY_MONTHS.map((m) => byM.get(m) ?? null) };
    });
    const allVals = mRows.flatMap((r) => r.cells.filter((v): v is number => v !== null));
    return { matrix: mRows, min: allVals.length ? Math.min(...allVals) : 0, max: allVals.length ? Math.max(...allVals) : 1 };
  }, [filtered, b.metric]);

  if (matrix.length === 0) return omniEmpty();

  const cellW = 36;
  const cellH = 22;
  const fs = 9;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: 4, overflow: "auto" }}>
      {b.showTitle && omniTitle(b.title || "Heatmap Sazonalidade")}
      <div style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", marginBottom: 4 }}>{info.label}</div>
      <table style={{ borderCollapse: "collapse", fontSize: fs }}>
        <thead>
          <tr>
            <th style={{ padding: "2px 4px", textAlign: "left", fontSize: fs, color: "hsl(var(--muted-foreground))", fontWeight: 600 }}>FY</th>
            {MONTH_LABELS.map((ml) => (
              <th key={ml} style={{ padding: "2px 4px", textAlign: "center", fontSize: fs, color: "hsl(var(--muted-foreground))", fontWeight: 600, minWidth: cellW }}>{ml}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row) => (
            <tr key={row.fy}>
              <td style={{ padding: "2px 4px", fontWeight: 600, fontSize: fs, color: SLIDE_HEX.chart2, whiteSpace: "nowrap" }}>{row.fy}</td>
              {row.cells.map((v, i) => {
                const { bg, color } = heatColorOmni(v, min, max);
                return (
                  <td key={i} style={{ background: bg, color, textAlign: "center", padding: `2px 0`, minWidth: cellW, height: cellH, fontSize: fs, fontWeight: 500, borderRadius: 2 }}>
                    {v !== null ? info.fmt(v) : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- omni_herois_ofensores ----
function OmniHeroisOfensoresRender({ block: b }: { block: OmniHeroisOfensoresBlock }) {
  const pricing = usePricing((s) => s.rows);
  const filtered = useMemo(() => applyOmniFilters(pricing, b), [pricing, b]);
  const rows = useMemo(() => aggregateBy(filtered, "cm", (r) => (r as never as Record<string, string>)[b.dim] || "—"), [filtered, b.dim]);
  const minRolForPct = useMemo(() => rows.reduce((s, r) => s + r.rol, 0) * 0.01, [rows]);

  if (rows.length === 0) return omniEmpty();

  const showHero    = b.variant === "hero" || b.variant === "both";
  const showVillain = b.variant === "villain" || b.variant === "both";

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: 8 }}>
      {b.showTitle && omniTitle(b.title || "Heróis e Ofensores")}
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 16, overflow: "hidden", paddingTop: 2 }}>
        {showHero && (
          <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "hsl(var(--success))", marginBottom: 4 }}>Heróis</div>
            <AbcBar rows={rows} variant="hero" limit={b.topN} sortBy={b.sortBy} minRolForPct={minRolForPct} />
          </div>
        )}
        {showVillain && (
          <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "hsl(var(--destructive))", marginBottom: 4 }}>Ofensores</div>
            <AbcBar rows={rows} variant="villain" limit={b.topN} sortBy={b.sortBy} minRolForPct={minRolForPct} />
          </div>
        )}
      </div>
    </div>
  );
}

// ---- omni_canal_trend ----
function OmniCanalTrendRender({ block: b }: { block: OmniCanalTrendBlock }) {
  const pricing = usePricing((s) => s.rows);
  const allHistory = useMemo(() => applyOmniFilters(pricing, b), [pricing, b]);
  const info = omniMetricInfo(b.metric);

  const { data, canais } = useMemo(() => {
    if (b.canal !== null) {
      const pts = computeCanalTrend(allHistory, b.canal, "cm");
      const d = pts.map((pt) => ({ label: pt.label, [b.canal!]: canalTrendValue(pt, b.metric) }));
      return { data: d, canais: [b.canal] };
    }
    // Top canais
    const canalSet = Array.from(new Set(allHistory.map((r) => r.canalAjustado || "Sem canal")));
    const sorted = canalSet
      .map((c) => ({ c, total: allHistory.filter((r) => (r.canalAjustado || "Sem canal") === c).reduce((s, r) => s + r.rol, 0) }))
      .sort((a, b) => b.total - a.total).slice(0, 6).map((x) => x.c);

    const periodMap = new Map<string, Record<string, number>>();
    for (const c of sorted) {
      const pts = computeCanalTrend(allHistory, c, "cm");
      for (const pt of pts) {
        const entry = periodMap.get(pt.label) ?? {};
        entry[c] = canalTrendValue(pt, b.metric);
        periodMap.set(pt.label, entry);
      }
    }
    const allLabels = Array.from(periodMap.keys()).sort();
    const d = allLabels.map((label) => ({ label, ...periodMap.get(label) }));
    return { data: d, canais: sorted };
  }, [allHistory, b.canal, b.metric]);

  if (data.length === 0) return omniEmpty();

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: 4 }}>
      {b.showTitle && omniTitle(b.title || "Tendência por Canal")}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 24, left: 8 }}>
            <CartesianGrid stroke="hsl(var(--border) / 0.3)" strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} angle={-30} textAnchor="end" height={36} />
            <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickFormatter={info.fmt} width={56} />
            <Tooltip formatter={(v: number) => info.fmt(v)} />
            {b.showLegend && <Legend wrapperStyle={{ fontSize: 10 }} />}
            {canais.map((c, i) => (
              <Line key={c} type="monotone" dataKey={c} stroke={OMNI_COLORS[i % OMNI_COLORS.length]} strokeWidth={2} dot={false} isAnimationActive={false} />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---- omni_canal_mix ----
function OmniCanalMixRender({ block: b }: { block: OmniCanalMixBlock }) {
  const pricing = usePricing((s) => s.rows);
  const allHistory = useMemo(() => applyOmniFilters(pricing, b), [pricing, b]);
  const info = omniMetricInfo(b.metric);

  const { data, canais } = useMemo(() => {
    const canalRows = aggregateBy(allHistory, "cm", (r) => r.canalAjustado || "Sem canal");
    const sorted = canalRows.sort((a, x) => x.rol - a.rol).slice(0, 8).map((c) => c.key);

    const periodMap = new Map<string, Record<string, number>>();
    for (const c of sorted) {
      const pts = computeCanalTrend(allHistory, c, "cm");
      for (const pt of pts) {
        const entry = periodMap.get(pt.label) ?? {};
        entry[c] = canalTrendValue(pt, b.metric);
        periodMap.set(pt.label, entry);
      }
    }
    const allLabels = Array.from(periodMap.keys()).sort();
    const d = allLabels.map((label) => ({ label, ...periodMap.get(label) }));
    return { data: d, canais: sorted };
  }, [allHistory, b.metric]);

  if (data.length === 0) return omniEmpty();

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: 4 }}>
      {b.showTitle && omniTitle(b.title || "Mix por Canal")}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 24, left: 8 }}>
            <CartesianGrid stroke="hsl(var(--border) / 0.3)" strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} angle={-30} textAnchor="end" height={36} />
            <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickFormatter={info.fmt} width={56} />
            <Tooltip formatter={(v: number) => info.fmt(v)} />
            {b.showLegend && <Legend wrapperStyle={{ fontSize: 10 }} />}
            {canais.map((c, i) => (
              <Bar key={c} dataKey={c} stackId="a" fill={OMNI_COLORS[i % OMNI_COLORS.length]} isAnimationActive={false} />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---- omni_custo_evolucao ----
function OmniCustoEvolucaoRender({ block: b }: { block: OmniCustoEvolucaoBlock }) {
  const pricing = usePricing((s) => s.rows);
  const filtered = useMemo(() => applyOmniFilters(pricing, b), [pricing, b]);
  const evolution = useMemo(() => computeCostEvolution(filtered), [filtered]);

  if (evolution.length === 0) return omniEmpty();

  const fmtY = b.viewMode === "pct" ? (v: number) => formatPct(v)
    : b.viewMode === "kg" ? (v: number) => `${formatBRL(v, { compact: true })}/kg`
    : (v: number) => formatBRL(v, { compact: true });

  const data = evolution.map((r) => ({
    label: r.label,
    cv: b.viewMode === "pct" ? r.custoVariavelPctRol : b.viewMode === "kg" ? r.custoVariavelPorKg : r.custoVariavel,
    cf: b.viewMode === "pct" ? r.custoFixoPctRol     : b.viewMode === "kg" ? r.custoFixoPorKg     : r.custoFixo,
  }));

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: 4 }}>
      {b.showTitle && omniTitle(b.title || "Evolução de Custos")}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 24, left: 8 }}>
            <CartesianGrid stroke="hsl(var(--border) / 0.3)" strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} angle={-30} textAnchor="end" height={36} />
            <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickFormatter={fmtY} width={56} />
            <Tooltip formatter={(v: number) => fmtY(v)} />
            {b.showLegend && <Legend wrapperStyle={{ fontSize: 10 }} />}
            <Line type="monotone" dataKey="cv" name="Custo Variável" stroke={OMNI_COLORS[0]} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="cf" name="Custo Fixo" stroke={OMNI_COLORS[1]} strokeWidth={2} dot={false} strokeDasharray="4 2" isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---- omni_positivacao ----
function OmniPositivacaoRender({ block: b }: { block: OmniPositivacaoBlock }) {
  const pricing = usePricing((s) => s.rows);
  const filtered = useMemo(() => applyOmniFilters(pricing, b), [pricing, b]);
  const dim = b.dim ?? "categoria";
  const series = useMemo(() => buildPositivacaoSeries(filtered, dim, 13), [filtered, dim]);

  if (series.chartData.length === 0 || series.chartKeys.length === 0) return omniEmpty();

  const DataElement = (key: string, i: number) => {
    const color = OMNI_COLORS[i % OMNI_COLORS.length];
    if (b.chartType === "bar") {
      return <Bar key={key} dataKey={key} fill={color} radius={[3, 3, 0, 0]} isAnimationActive={false} />;
    }
    if (b.chartType === "area") {
      return <Area key={key} type="monotone" dataKey={key} stroke={color} fill={`${color}33`} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />;
    }
    return <Line key={key} type="monotone" dataKey={key} stroke={color} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />;
  };

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: 4 }}>
      {b.showTitle && omniTitle(b.title || "Positivação")}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={series.chartData} margin={{ top: 4, right: 8, bottom: 24, left: 8 }}>
            <CartesianGrid stroke="hsl(var(--border) / 0.3)" strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} angle={-30} textAnchor="end" height={36} />
            <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} width={44} />
            <Tooltip formatter={(v: number) => [formatNum(Number(v), 0), "Clientes"]} />
            {b.showLegend && <Legend wrapperStyle={{ fontSize: 10 }} />}
            {series.chartKeys.slice(0, b.topN ?? 8).map(DataElement)}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---- omni_uf_map ----
function OmniUfMapRender({ block: b }: { block: OmniUfMapBlock }) {
  const pricing = usePricing((s) => s.rows);
  const filtered = useMemo(() => applyOmniFilters(pricing, b), [pricing, b]);
  const { states, labelPoints } = useMemo(() => parseBrazilSvg(brMapRaw), []);
  const labelPointByUf = useMemo(() => new Map(labelPoints.map((point) => [point.uf, point])), [labelPoints]);
  const info = omniMetricInfo(b.metric);

  const data = useMemo(() => {
    const sums = new Map<string, { value: number; rol: number; volumeKg: number }>();
    for (const row of filtered) {
      const uf = rowUf(row);
      if (!uf) continue;
      const cur = sums.get(uf) ?? { value: 0, rol: 0, volumeKg: 0 };
      cur.value += omniRowValue(row, b.metric);
      cur.rol += row.rol;
      cur.volumeKg += row.volumeKg;
      sums.set(uf, cur);
    }
    return states.map((state) => {
      const sum = sums.get(state.uf);
      const point = labelPointByUf.get(state.uf);
      return {
        ...state,
        label: point?.label ?? state.name,
        x: point?.x ?? 0,
        y: point?.y ?? 0,
        value: sum ? omniAggregatedValue(sum, b.metric) : null,
        volumeKg: sum?.volumeKg ?? 0,
      };
    });
  }, [filtered, b.metric, states, labelPointByUf]);

  const active = data.filter((point) => point.value !== null && point.volumeKg > 0 && point.x > 0 && point.y > 0);
  if (active.length === 0) return omniEmpty("Sem dados por UF.");

  const values = active.map((point) => point.value!).filter(Number.isFinite);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const dataByUf = new Map(data.map((point) => [point.uf, point]));
  const colorFor = (value: number | null) => {
    if (value === null || !Number.isFinite(value)) return "hsl(var(--muted) / 0.75)";
    const span = max - min;
    const t = span > 0 ? (value - min) / span : 0.5;
    return `hsl(${(t * 220).toFixed(0)} 78% 52%)`;
  };

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: 6, overflow: "hidden" }}>
      {b.showTitle && omniTitle(b.title || "Mapa por UF")}
      <svg viewBox="0 0 1000 912" role="img" aria-label="Mapa do Brasil por UF" style={{ flex: 1, minHeight: 0, width: "100%" }}>
        {states.map((state) => {
          const stateData = dataByUf.get(state.uf);
          const hasValue = stateData?.value !== null && (stateData?.volumeKg ?? 0) > 0;
          return (
            <path
              key={state.uf}
              d={state.d}
              fill={colorFor(stateData?.value ?? null)}
              opacity={hasValue ? 0.9 : 0.45}
              stroke={SLIDE_HEX.white}
              strokeWidth={0.9}
            >
              <title>{state.name}{hasValue ? ` - ${info.fmt(stateData!.value!)}` : " - sem dados"}</title>
            </path>
          );
        })}
        {labelPoints.map((point) => {
          const stateData = dataByUf.get(point.uf);
          const hasValue = stateData?.value !== null && (stateData?.volumeKg ?? 0) > 0;
          if (!hasValue) return null;
          const text = b.labelMode === "value"
            ? info.fmt(stateData!.value!)
            : b.labelMode === "both"
            ? `${point.uf} ${info.fmt(stateData!.value!)}`
            : point.uf;
          return (
            <text
              key={point.uf}
              x={point.x}
              y={point.y + 5}
              textAnchor="middle"
              paintOrder="stroke"
              stroke={SLIDE_HEX.chart2}
              strokeWidth={1.2}
              fill={SLIDE_HEX.white}
              fontSize={b.labelMode === "both" ? 14 : 18}
              fontWeight={800}
              style={{ pointerEvents: "none" }}
            >
              {text}
            </text>
          );
        })}
      </svg>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, color: "hsl(var(--muted-foreground))", padding: "2px 4px" }}>
        <span>{info.fmt(min)}</span>
        <div style={{ height: 6, flex: 1, borderRadius: 999, background: "linear-gradient(90deg, hsl(0 78% 52%), hsl(110 78% 52%), hsl(220 78% 52%))" }} />
        <span>{info.fmt(max)}</span>
      </div>
    </div>
  );
}

// ---- omni_custo_composicao ----
function OmniCustoComposicaoRender({ block: b }: { block: OmniCustoComposicaoBlock }) {
  const pricing = usePricing((s) => s.rows);
  const filtered = useMemo(() => applyOmniFilters(pricing, b), [pricing, b]);
  const evolution = useMemo(() => computeCostEvolution(filtered), [filtered]);

  if (evolution.length === 0) return omniEmpty();

  const fmtY = b.viewMode === "pct"
    ? (v: number) => formatPct(v)
    : (v: number) => formatBRL(v, { compact: true });

  const data = evolution.map((r) => ({
    label: r.label,
    cv: b.viewMode === "pct" ? r.custoVariavelPctRol : r.custoVariavel,
    cf: b.viewMode === "pct" ? r.custoFixoPctRol     : r.custoFixo,
  }));

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: 4 }}>
      {b.showTitle && omniTitle(b.title || "Composição de Custos")}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 24, left: 8 }}>
            <CartesianGrid stroke="hsl(var(--border) / 0.3)" strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} angle={-30} textAnchor="end" height={36} />
            <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickFormatter={fmtY} width={56} />
            <Tooltip formatter={(v: number) => fmtY(v)} />
            {b.showLegend && <Legend wrapperStyle={{ fontSize: 10 }} />}
            <Bar dataKey="cv" name="Custo Variável" stackId="a" fill={OMNI_COLORS[0]} isAnimationActive={false} />
            <Bar dataKey="cf" name="Custo Fixo"     stackId="a" fill={OMNI_COLORS[1]} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---- omni_price_decomp ----
function OmniPriceDecompRender({ block: b }: { block: OmniPriceDecompBlock }) {
  const pricing = usePricing((s) => s.rows);
  const months  = useMonthsInfo();
  const filtered = useMemo(() => applyOmniFilters(pricing, b), [pricing, b]);

  const { baseKey, compKey } = useMemo(() => {
    const relativeBase = resolvePeriodValue(filtered, b.periodMode, b.base, b.baseSelectionMode, b.baseRelativePeriod);
    const relativeComp = resolvePeriodValue(filtered, b.periodMode, b.comp, b.compSelectionMode, b.compRelativePeriod);
    if (relativeBase && relativeComp) return { baseKey: relativeBase, compKey: relativeComp };
    const opts = b.periodMode === "fy"
      ? Array.from(new Set(filtered.map((r) => r.fy))).sort()
      : months.map((m) => m.periodo);
    const compKey = opts[opts.length - 1] ?? "";
    const baseKey = opts[opts.length - 2] ?? "";
    return { baseKey, compKey };
  }, [filtered, b.base, b.comp, b.baseSelectionMode, b.baseRelativePeriod, b.compSelectionMode, b.compRelativePeriod, b.periodMode, months]);

  const result = useMemo(
    () => computePriceDecomposition(filtered, baseKey, compKey, b.periodMode),
    [filtered, baseKey, compKey, b.periodMode],
  );

  if (!result) return omniEmpty("Selecione dois períodos para comparar.");

  const signColor = (v: number) => v >= 0 ? SLIDE_HEX.success : SLIDE_HEX.chart1;
  const fmtBRL2 = (v: number) => formatBRL(v, { compact: false, digits: 2 });

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: 8, overflow: "auto" }}>
      {b.showTitle && omniTitle(b.title || "Decomposição de Preço")}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[
          { label: "Preço Médio Base", value: fmtBRL2(result.precoMedioBase), color: SLIDE_HEX.chart2 },
          { label: "Preço Médio Comp", value: fmtBRL2(result.precoMedioComp), color: SLIDE_HEX.chart2 },
          { label: "Variação Total",   value: `${formatPct(result.variacaoPct)}`, color: signColor(result.variacaoPct) },
          { label: "Efeito Preço",     value: `${formatPct(result.pctPreco)}`,    color: signColor(result.pctPreco) },
          { label: "Efeito Mix",       value: `${formatPct(result.pctMix)}`,      color: signColor(result.pctMix) },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ flex: "1 1 120px", background: "hsl(var(--card))", borderRadius: 8, border: "1px solid hsl(var(--border) / 0.5)", padding: "10px 12px" }}>
            <div style={{ fontSize: 9, color: "hsl(var(--muted-foreground))", marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- omni_bridge_pvm ----
function OmniBridgePvmRender({ block: b }: { block: OmniBridgePvmBlock }) {
  const pricing = usePricing((s) => s.rows);
  const budget = useBudget((s) => s.rows);
  const metric = usePricing((s) => s.metric);
  const months  = useMonthsInfo();
  const filtered = useMemo(() => applyOmniFilters(pricing, b), [pricing, b]);

  const { baseKey, compKey } = useMemo(() => {
    if (b.periodMode === "ytd_budget") return { baseKey: "", compKey: "" };
    const relativeBase = resolvePeriodValue(filtered, b.periodMode, b.base, b.baseSelectionMode, b.baseRelativePeriod);
    const relativeComp = resolvePeriodValue(filtered, b.periodMode, b.comp, b.compSelectionMode, b.compRelativePeriod);
    if (relativeBase && relativeComp) return { baseKey: relativeBase, compKey: relativeComp };
    const opts = b.periodMode === "fy"
      ? Array.from(new Set(filtered.map((r) => r.fy))).sort()
      : months.map((m) => m.periodo);
    return { baseKey: opts[opts.length - 2] ?? "", compKey: opts[opts.length - 1] ?? "" };
  }, [filtered, b.base, b.comp, b.baseSelectionMode, b.baseRelativePeriod, b.compSelectionMode, b.compRelativePeriod, b.periodMode, months]);

  const result = useMemo(() => {
    if (b.periodMode === "ytd_budget") {
      return computeBridgeYtdRealVsBudget(budget, b.filters, metric)?.result ?? null;
    }
    if (!baseKey || !compKey) return null;
    return calcPVM(filtered, metric, baseKey, compKey, b.periodMode);
  }, [budget, b.filters, b.periodMode, filtered, baseKey, compKey, metric]);

  if (!result) return omniEmpty("Selecione dois períodos para comparar.");

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: 4 }}>
      {b.showTitle && omniTitle(b.title || "Bridge PVM")}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <Waterfall result={result} height="100%" />
      </div>
    </div>
  );
}

// ---- omni_farol ----
function OmniFarolRender({ block: b }: { block: OmniFarolBlock }) {
  const pricing = usePricing((s) => s.rows);

  const { result, skuRefLabel, skuCompLabel } = useMemo(() => {
    const rows = applyOmniFilters(pricing, b);
    const ranked = topFarolSkus(rows);
    const skuRef = b.skuRef || ranked[0]?.sku || "";
    const skuComp = b.skuComp || ranked.find((s) => s.sku !== skuRef)?.sku || "";
    const result = calcFarol(
      rows,
      skuRef,
      skuComp,
      { canal: null, categoria: null, periodoMeses: b.periodoMeses || 3 },
      b.metric === "mb" ? "mb" : "cm",
    );
    return {
      result,
      skuRefLabel: ranked.find((s) => s.sku === skuRef)?.desc || skuRef,
      skuCompLabel: ranked.find((s) => s.sku === skuComp)?.desc || skuComp,
    };
  }, [pricing, b]);

  const isLight = (b.gaugeTheme ?? "dark") === "light";
  const fg = isLight ? SLIDE_HEX.neutralDark : SLIDE_HEX.white;
  const muted = isLight ? "rgba(17,24,39,0.58)" : "rgba(255,255,255,0.62)";
  const track = isLight ? "rgba(17,24,39,0.12)" : "rgba(255,255,255,0.12)";
  const innerTrack = isLight ? "rgba(17,24,39,0.05)" : "rgba(255,255,255,0.04)";
  const gaugeSize = Math.max(120, Math.min(b.w, b.h) * ((b.gaugeScale ?? 55) / 100));

  if (!result) {
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: 10 }}>
        {b.showTitle && omniTitle(b.title || "Farol de Positivação")}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", color: "hsl(var(--muted-foreground))", fontSize: 12, padding: 16 }}>
          Escolha SKU base e SKU comparado com dados suficientes para exibir o velocímetro.
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", padding: 10, gap: 6 }}>
      {b.showTitle && omniTitle(b.title || "Farol de Positivação")}
      {b.showGauge && (
        <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <FarolGauge
            value={result.indicePositivacao}
            size={gaugeSize}
            textColor={fg}
            mutedTextColor={muted}
            trackColor={track}
            innerTrackColor={innerTrack}
            glow={!isLight}
          />
        </div>
      )}
      {b.showCaption && (
        <div style={{ maxWidth: "92%", fontSize: 11, lineHeight: 1.25, color: "hsl(var(--muted-foreground))", textAlign: "center" }}>
          <strong style={{ color: "hsl(var(--foreground))" }}>{result.skuComp.skuDesc || skuCompLabel}</strong>
          {" "}positivado nos clientes do{" "}
          <strong style={{ color: "hsl(var(--foreground))" }}>{result.skuRef.skuDesc || skuRefLabel}</strong>
        </div>
      )}
      {b.showStats && (
        <div style={{ width: "100%", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6, fontSize: 10 }}>
          {[
            ["Base", result.skuRef.clientesAtivos],
            ["Comparado", result.skuComp.clientesAtivos],
            ["Comum", result.clientesAmbos.length],
          ].map(([label, value]) => (
            <div key={label} style={{ border: "1px solid hsl(var(--border))", borderRadius: 6, padding: "5px 6px", textAlign: "center", background: "hsl(var(--card) / 0.38)" }}>
              <div style={{ color: "hsl(var(--muted-foreground))" }}>{label}</div>
              <div style={{ color: "hsl(var(--foreground))", fontWeight: 700, fontSize: 12 }}>{Number(value).toLocaleString("pt-BR")}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- omni_abc_curva ----
function OmniAbcCurvaRender({ block: b }: { block: OmniAbcCurvaBlock }) {
  const pricing = usePricing((s) => s.rows);
  const filtered = useMemo(() => applyOmniFilters(pricing, b), [pricing, b]);
  const rows = useMemo(
    () => aggregateBy(filtered, "cm", (r) => (r as never as Record<string, string>)[b.dim] || "—"),
    [filtered, b.dim],
  );

  if (rows.length === 0) return omniEmpty();

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: 4, overflow: "auto" }}>
      {b.showTitle && omniTitle(b.title || "Curva ABC")}
      <div style={{ flex: 1, minHeight: 0 }}>
        <AbcPareto rows={rows} />
      </div>
    </div>
  );
}

// ---- omni_portfolio_matrix ----
function OmniPortfolioMatrixRender({ block: b }: { block: OmniPortfolioMatrixBlock }) {
  const pricing = usePricing((s) => s.rows);
  const filtered = useMemo(() => applyOmniFilters(pricing, b), [pricing, b]);
  const info = omniMetricInfo(b.metric);
  const rows = useMemo(
    () => aggregateBy(filtered, b.metric === "mb" ? "mb" : "cm", (r) => (r as never as Record<string, string>)[b.dim] || "—"),
    [filtered, b.metric, b.dim],
  );

  if (rows.length === 0) return omniEmpty();

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: 4, overflow: "hidden" }}>
      {b.showTitle && omniTitle(b.title || "Matriz de Portfólio")}
      <div style={{ flex: 1, minHeight: 0 }}>
        <PortfolioMatrix rows={rows} metricLabel={info.label} />
      </div>
    </div>
  );
}

// ---- omni_abc_bars ----
function OmniAbcBarsRender({ block: b }: { block: OmniAbcBarsBlock }) {
  const pricing = usePricing((s) => s.rows);
  const filtered = useMemo(() => applyOmniFilters(pricing, b), [pricing, b]);
  const rows = useMemo(
    () => aggregateBy(filtered, "cm", (r) => (r as never as Record<string, string>)[b.dim] || "—"),
    [filtered, b.dim],
  );
  const minRolForPct = useMemo(() => rows.reduce((s, r) => s + r.rol, 0) * 0.01, [rows]);

  if (rows.length === 0) return omniEmpty();

  const showHero    = b.variant === "hero" || b.variant === "both";
  const showVillain = b.variant === "villain" || b.variant === "both";

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: 8 }}>
      {b.showTitle && omniTitle(b.title || "Barras ABC")}
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 16, overflow: "hidden" }}>
        {showHero && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "hsl(var(--success))", marginBottom: 4 }}>Top</div>
            <AbcBar rows={rows} variant="hero" limit={b.topN} sortBy={b.sortBy} minRolForPct={minRolForPct} />
          </div>
        )}
        {showVillain && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "hsl(var(--destructive))", marginBottom: 4 }}>Bottom</div>
            <AbcBar rows={rows} variant="villain" limit={b.topN} sortBy={b.sortBy} minRolForPct={minRolForPct} />
          </div>
        )}
      </div>
    </div>
  );
}

// ---- omni_custo_pressao ----
function OmniCustoPressaoRender({ block: b }: { block: OmniCustoPressaoBlock }) {
  const pricing = usePricing((s) => s.rows);
  const filtered = useMemo(() => applyOmniFilters(pricing, b), [pricing, b]);
  const evolution = useMemo(() => computeCostEvolution(filtered), [filtered]);

  if (evolution.length === 0) return omniEmpty();

  const data = evolution.map((r) => ({
    label: r.label,
    cv: b.showCustoVariavel ? r.custoVariavelPctRol : undefined,
    cf: b.showCustoFixo ? r.custoFixoPctRol : undefined,
  }));

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: 4 }}>
      {b.showTitle && omniTitle(b.title || "Pressão de Custo sobre Receita")}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} stackOffset="none" margin={{ top: 4, right: 8, bottom: 24, left: 8 }}>
            <CartesianGrid stroke="hsl(var(--border) / 0.3)" strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} angle={-30} textAnchor="end" height={36} />
            <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} width={40} />
            <Tooltip formatter={(v: number) => formatPct(v)} />
            {b.showLegend && <Legend wrapperStyle={{ fontSize: 10 }} />}
            {b.showCustoVariavel && (
              <Area type="monotone" dataKey="cv" name="Custo Variável % ROL" stroke={SLIDE_HEX.chart1} fill={SLIDE_HEX.chart1} fillOpacity={0.7} strokeWidth={1.5} dot={false} isAnimationActive={false} />
            )}
            {b.showCustoFixo && (
              <Area type="monotone" dataKey="cf" name="Custo Fixo % ROL" stroke={SLIDE_HEX.chart2} fill={SLIDE_HEX.chart2} fillOpacity={0.5} strokeWidth={1.5} dot={false} isAnimationActive={false} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
