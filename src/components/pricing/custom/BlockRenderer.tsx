// Renderer dos blocos do slide personalizado.

import React, { useMemo } from "react";
import type {
  CustomBlock, TitleBlock, TextBlock, KpiBlock, ImageBlock,
  ShapeBlock, BridgeBlock, TableBlock, ChartBlock, TopSkuBlock, DreBlock,
  BlockDataSource,
  OmniBaseBlock,
  OmniEvolucaoMensalBlock, OmniHeatmapSazonalidadeBlock, OmniHeroisOfensoresBlock,
  OmniCanalTrendBlock, OmniCanalMixBlock, OmniCustoEvolucaoBlock, OmniCustoComposicaoBlock,
  OmniCustoPressaoBlock,
  OmniPriceDecompBlock, OmniBridgePvmBlock, OmniFarolBlock,
  OmniAbcCurvaBlock, OmniPortfolioMatrixBlock, OmniAbcBarsBlock,
  OmniMetric,
} from "@/lib/customSlide";
import type { PricingRow } from "@/lib/types";
import type { BudgetRow } from "@/lib/budget";
import { aggregate, LINES, fmt } from "../DreTable";
import { useMonthsInfo } from "@/store/selectors";
import {
  applyFilters, calcPVM, aggregateBy,
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
import { formatPct, formatTon } from "@/lib/format";
import { Waterfall } from "@/components/pricing/Waterfall";
import { computePivot, type PivotConfig, type PivotMeasure } from "@/lib/pivot";
import { buildUnifiedRows, ALL_DIMENSIONS } from "@/lib/pivotData";
import { usePricing } from "@/store/pricing";
import { useBudget } from "@/store/budget";
import { monthLabel, formatBRL } from "@/lib/format";
import {
  computeKpiBlock, computeTopRanking, formatValue, inferFormat,
} from "@/lib/customKpi";
import { KPI_MEASURES } from "@/lib/customSlide";
import { resolveTableFit, resolveTopSkuFit } from "@/lib/customCapacity";
import { budgetRowsAsPricingFiltered } from "@/lib/budgetAdapter";
import { ShapeRenderer } from "./ShapeRenderer";
import { useSlideFilters } from "./SlideFilterContext";
import { resolveFieldValue } from "./chart/filterHelpers";

function useDataSource(
  dataSource: BlockDataSource | undefined,
  pricing: PricingRow[],
  budget: BudgetRow[],
): PricingRow[] {
  return useMemo(() => {
    if (!dataSource || dataSource === "ke30") return pricing;
    if (dataSource === "budget") return budgetRowsAsPricingFiltered(budget, "budget");
    if (dataSource === "budget_real") return budgetRowsAsPricingFiltered(budget, "real");
    return pricing;
  }, [dataSource, pricing, budget]);
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

function fmtMeasure(m: PivotMeasure, v: number): string {
  if (!isFinite(v)) return "—";
  if (m.format === "currency") return formatBRL(v);
  if (m.format === "percent") return `${(v * 100).toFixed(1)}%`;
  if (m.format === "tons") return Math.round(v).toLocaleString("pt-BR");
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

const justifyMap: Record<string, string> = { left: "flex-start", center: "center", right: "flex-end" };
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
  opts: { padding: React.CSSProperties["padding"]; align?: React.CSSProperties["textAlign"] },
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
    }}>
      {content}
    </div>
  );
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
  return (
    <div style={{
      ...style,
      position: "absolute",
      left: `${left}%`,
      top: `${top}%`,
      width: `${width}%`,
      height: `${height}%`,
      boxSizing: "border-box",
      padding: `0 ${padX}px`,
      overflow: "hidden",
      lineHeight: 1.15,
      display: "flex",
      alignItems: "center",
      justifyContent: textAlignToJustify[String(align)] ?? "center",
    }}>
      <span style={{
        display: "block",
        width: "100%",
        lineHeight: 1.15,
        textAlign: align,
        whiteSpace: "nowrap",
        overflow: style.overflow,
        textOverflow: style.textOverflow,
      }}>
        {children}
      </span>
    </div>
  );
}

function fitFontSize(opts: {
  desired: number;
  width: number;
  height: number;
  text: string;
  lineHeight: number;
  padding?: number;
  min?: number;
}) {
  const pad = opts.padding ?? 0;
  const min = opts.min ?? 8;
  const availableW = Math.max(1, opts.width - pad * 2);
  const availableH = Math.max(1, opts.height - pad * 2);
  const lines = String(opts.text || "").split(/\r?\n/);
  const longest = Math.max(1, ...lines.map((line) => line.length));
  const lineCount = Math.max(1, lines.length);
  const byHeight = availableH / (lineCount * opts.lineHeight);
  const byWidth = availableW / (longest * 0.58);
  return Math.max(min, Math.floor(Math.min(opts.desired, byHeight, byWidth)));
}

export function BlockRenderer({ block, readOnly, isEditing }: { block: CustomBlock; readOnly?: boolean; isEditing?: boolean }) {
  switch (block.kind) {
    case "title":  return <TitleRender block={block} isEditing={isEditing} readOnly={readOnly} />;
    case "text":   return <TextRender block={block} isEditing={isEditing} readOnly={readOnly} />;
    case "kpi":    return <KpiRender block={block} readOnly={readOnly} />;
    case "image":  return <ImageRender block={block} />;
    case "shape":  return <ShapeRender block={block} />;
    case "bridge": return <BridgeRender block={block} />;
    case "table":  return <TableRender block={block} readOnly={readOnly} />;
    case "chart":  return <ChartRender block={block} />;
    case "topSku": return <TopSkuRender block={block} />;
    case "dre":    return <DreRender block={block} readOnly={readOnly} />;
    // Omni Analytics
    case "omni_evolucao_mensal":      return <OmniEvolucaoMensalRender block={block} />;
    case "omni_heatmap_sazonalidade": return <OmniHeatmapSazonalidadeRender block={block} />;
    case "omni_herois_ofensores":     return <OmniHeroisOfensoresRender block={block} />;
    case "omni_canal_trend":          return <OmniCanalTrendRender block={block} />;
    case "omni_canal_mix":            return <OmniCanalMixRender block={block} />;
    case "omni_custo_evolucao":       return <OmniCustoEvolucaoRender block={block} />;
    case "omni_custo_composicao":     return <OmniCustoComposicaoRender block={block} />;
    case "omni_custo_pressao":        return <OmniCustoPressaoRender block={block} />;
    case "omni_price_decomp":         return <OmniPriceDecompRender block={block} />;
    case "omni_bridge_pvm":           return <OmniBridgePvmRender block={block} />;
    case "omni_farol":                return <OmniFarolRender block={block} />;
    case "omni_abc_curva":            return <OmniAbcCurvaRender block={block} />;
    case "omni_portfolio_matrix":     return <OmniPortfolioMatrixRender block={block} />;
    case "omni_abc_bars":             return <OmniAbcBarsRender block={block} />;
  }
}

function TitleRender({ block: b, isEditing, readOnly }: { block: TitleBlock; isEditing?: boolean; readOnly?: boolean }) {
  const padding = b.padding ?? 0;
  const lineHeight = Math.max(b.lineHeight ?? 1.1, readOnly ? 1.18 : 1.1);
  const fontSize = readOnly
    ? fitFontSize({
        desired: b.size,
        width: b.w,
        height: b.h,
        text: b.text,
        lineHeight,
        padding,
        min: 10,
      })
    : b.size;
  return (
    <div style={{
      width: "100%", height: "100%", display: "flex",
      alignItems: "center", justifyContent: justifyMap[b.align] ?? "flex-start",
      boxSizing: "border-box",
      fontFamily: b.fontFamily ?? "Calibri, sans-serif",
      fontSize,
      fontWeight: b.bold ? 700 : 400,
      fontStyle: b.italic ? "italic" : "normal",
      color: `#${b.color}`,
      lineHeight,
      textAlign: b.align,
      letterSpacing: b.letterSpacing != null ? `${b.letterSpacing}em` : undefined,
      textShadow: b.textShadow || undefined,
      opacity: b.opacity != null ? b.opacity / 100 : undefined,
      textTransform: (b.textTransform ?? "none") as React.CSSProperties["textTransform"],
      padding,
      backgroundColor: b.backgroundColor && b.backgroundColor !== "transparent"
        ? `#${b.backgroundColor}` : undefined,
      borderRadius: b.borderRadius ?? undefined,
      overflow: readOnly ? "visible" : "hidden",
      visibility: isEditing ? "hidden" : "visible",
    }}>
      {b.text}
    </div>
  );
}

function TextRender({ block: b, isEditing, readOnly }: { block: TextBlock; isEditing?: boolean; readOnly?: boolean }) {
  const padding = b.padding ?? 0;
  const lineHeight = Math.max(b.lineHeight ?? 1.3, readOnly ? 1.25 : 1.3);
  const fontSize = readOnly
    ? fitFontSize({
        desired: b.size,
        width: b.w,
        height: b.h,
        text: b.text,
        lineHeight,
        padding,
        min: 8,
      })
    : b.size;
  return (
    <div style={{
      width: "100%", height: "100%", display: "flex",
      alignItems: "flex-start", justifyContent: b.align,
      boxSizing: "border-box",
      fontFamily: b.fontFamily ?? "Calibri, sans-serif",
      fontSize,
      fontStyle: b.italic ? "italic" : "normal",
      color: `#${b.color}`,
      textAlign: b.align,
      whiteSpace: "pre-wrap", overflow: readOnly ? "visible" : "hidden",
      lineHeight,
      letterSpacing: b.letterSpacing != null ? `${b.letterSpacing}em` : undefined,
      textShadow: b.textShadow || undefined,
      opacity: b.opacity != null ? b.opacity / 100 : undefined,
      textTransform: (b.textTransform ?? "none") as React.CSSProperties["textTransform"],
      padding,
      backgroundColor: b.backgroundColor && b.backgroundColor !== "transparent"
        ? `#${b.backgroundColor}` : undefined,
      borderRadius: b.borderRadius ?? undefined,
      visibility: isEditing ? "hidden" : "visible",
    }}>
      {b.text}
    </div>
  );
}

function KpiRender({ block: b, readOnly }: { block: KpiBlock; readOnly?: boolean }) {
  const pricing = usePricing((s) => s.rows);
  const budget = useBudget((s) => s.rows);
  const { filters } = useSlideFilters();
  const participates = b.participatesInCrossFilter !== false;

  const baseRows = useDataSource(b.dataSource, pricing, budget);

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
      const lbl = monthLabel((r as any).mes, (r as any).ano);
      const raw = String((r as any).periodo ?? "");
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
    () => (periodFilterValues.length > 0 ? { ...b, periodMode: "all", periodValue: null } : b),
    [b, periodFilterValues.length],
  );

  const value = useMemo(() => computeKpiBlock(rows, effectiveBlock), [rows, effectiveBlock]);
  const measureLabel = b.source === "dynamic"
    ? KPI_MEASURES.find((m) => m.id === b.measure)?.label
    : null;

  const cardBg = b.cardBg ?? "F8FAFC";
  const isTransparent = cardBg === "transparent";
  const valueSize = readOnly
    ? fitFontSize({
        desired: b.valueSize,
        width: b.w,
        height: Math.max(1, b.h - 44),
        text: value,
        lineHeight: 1.18,
        padding: 24,
        min: 12,
      })
    : b.valueSize;
  return (
    <div style={{
      width: "100%", height: "100%",
      display: "flex", flexDirection: "column", justifyContent: "center",
      boxSizing: "border-box",
      padding: 12, borderRadius: isTransparent ? 0 : 12,
      background: isTransparent ? "transparent" : `#${cardBg}`,
      border: isTransparent ? "none" : "1px solid #E2E8F0",
      fontFamily: "Calibri, sans-serif",
    }}>
      <div style={{ fontSize: 14, color: "#64748B", textTransform: "uppercase", letterSpacing: 1 }}>
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
        <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 6 }}>
          {measureLabel}
          {b.periodMode && b.periodMode !== "all" && b.periodValue
            ? ` · ${b.periodValue}`
            : b.periodMode === "all" ? " · Todos os períodos" : ""}
        </div>
      )}
    </div>
  );
}

function ImageRender({ block: b }: { block: ImageBlock }) {
  if (!b.src) {
    return (
      <div style={{
        width: "100%", height: "100%", display: "flex",
        alignItems: "center", justifyContent: "center",
        background: "#F1F5F9", border: "1px dashed #94A3B8",
        color: "#64748B", fontFamily: "Calibri", fontSize: 14,
      }}>
        Faça upload de uma imagem
      </div>
    );
  }
  return (
    <img src={b.src} alt=""
      style={{ width: "100%", height: "100%", objectFit: b.fit, display: "block" }}
    />
  );
}

function ShapeRender({ block: b }: { block: ShapeBlock }) {
  return <ShapeRenderer block={b} />;
}

function BridgeRender({ block: b }: { block: BridgeBlock }) {
  const pricing = usePricing((s) => s.rows);
  const metric = usePricing((s) => s.metric);

  const pvmResult = useMemo(() => {
    if (!b.base || !b.comp || b.base === b.comp) return { kind: "unconfigured" as const };
    const filtered = applyOmniFilters(pricing, b);
    const labels = b.mode === "month" ? {
      base: (() => { const r = filtered.find((x) => x.periodo === b.base); return r ? monthLabel(r.mes, r.ano) : b.base!; })(),
      comp: (() => { const r = filtered.find((x) => x.periodo === b.comp); return r ? monthLabel(r.mes, r.ano) : b.comp!; })(),
    } : undefined;
    try {
      return { kind: "ok" as const, data: calcPVM(filtered, metric, b.base, b.comp, b.mode, labels) };
    } catch (err) {
      console.error("[BridgeRender] calcPVM error:", err);
      return { kind: "error" as const };
    }
  }, [pricing, metric, b.base, b.comp, b.mode, b.filters]);

  if (pvmResult.kind !== "ok") {
    return (
      <div style={{
        width: "100%", height: "100%",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "#F8FAFC", border: "1px dashed #CBD5E1",
        color: "#64748B", fontFamily: "Calibri", fontSize: 14,
      }}>
        {pvmResult.kind === "unconfigured"
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

function TableRender({ block: b, readOnly }: { block: TableBlock; readOnly?: boolean }) {
  const pricing = usePricing((s) => s.rows);
  const budget = useBudget((s) => s.rows);
  const sourceRows = useDataSource(b.dataSource, pricing, budget);

  const data = useMemo(() => {
    const unified = buildUnifiedRows(sourceRows, [], "real");
    const measures = CUSTOM_TABLE_MEASURES.filter((m) => b.measures.includes(m.id));
    if (measures.length === 0) return null;
    const cfg: PivotConfig = {
      rows: b.rowDims,
      cols: b.colDim ? [b.colDim] : [],
      values: measures,
      filters: Object.fromEntries(Object.entries(b.filters).map(([k, v]) => [k, new Set(v ?? [])])),
    };
    const result = computePivot(unified as unknown as Record<string, unknown>[], cfg);

    // Ordena rowHeaders pela sortMeasure (ou primeira measure) desc
    const sortKey = b.sortMeasure && measures.find((m) => m.id === b.sortMeasure)
      ? b.sortMeasure
      : measures[0].id;
    const sortedHeaders = [...result.rowHeaders].sort((a, z) => {
      const va = result.rowTotals.get(a.key)?.[sortKey] ?? 0;
      const vz = result.rowTotals.get(z.key)?.[sortKey] ?? 0;
      return vz - va;
    });
    return { result, measures, sortedHeaders };
  }, [sourceRows, b.rowDims, b.colDim, b.measures, b.filters, b.sortMeasure]);

  if (!data || data.sortedHeaders.length === 0) {
    return (
      <div style={{
        width: "100%", height: "100%",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "#F8FAFC", border: "1px dashed #CBD5E1",
        color: "#64748B", fontFamily: "Calibri", fontSize: 14,
      }}>
        Configure dimensões e medidas da tabela
      </div>
    );
  }

  const { result, measures, sortedHeaders } = data;
  const fit = resolveTableFit(b, sortedHeaders.length);
  const visibleHeaders = sortedHeaders.slice(0, fit.shown);
  const hiddenHeaders = sortedHeaders.slice(fit.shown);
  const showOthers = !!b.showOthers && hiddenHeaders.length > 0;
  const cols = result.colHeaders;
  const showCols = cols.length > 0 && cols[0].values.length > 0;

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

  // ---------- Formatação condicional ----------
  const valueAlign = b.valueAlign ?? "right";
  const cellValDyn: React.CSSProperties = { ...cellVal, textAlign: valueAlign };
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
    const inner = exportCellContent(content, { padding: style.padding, align: style.textAlign });
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
        color: luminanceOf(bgHex) > 0.6 ? "#1C2430" : "#FFFFFF",
      };
    }
    if (rule.mode === "above_avg") {
      const avg = pool.reduce((s, x) => s + x, 0) / pool.length;
      if (value > avg) return { backgroundColor: "#D1FAE5", color: "#065F46" };
      if (value < avg) return { backgroundColor: "#FEE2E2", color: "#991B1B" };
      return {};
    }
    if (rule.mode === "data_bar") {
      const pct = Math.round(t * 100);
      return { background: `linear-gradient(90deg, #BFDBFE ${pct}%, transparent ${pct}%)` };
    }
    return {};
  };

  if (readOnly) {
    const valueCols = showCols ? cols.length * measures.length : measures.length;
    const rowCount = 1 + visibleHeaders.length + (othersRow ? 1 : 0);
    const rowH = 100 / rowCount;
    const firstColW = 100 * 1.7 / (1.7 + valueCols);
    const valueColW = (100 - firstColW) / Math.max(1, valueCols);
    const leftForValue = (idx: number) => firstColW + idx * valueColW;

    const headerCells = [
      <ExportPositionedCell key="row-head" style={cellHead} left={0} top={0} width={firstColW} height={rowH} padX={8}>
        {b.rowDims.map((d) => labelOfDim(d)).join(" / ") || "Total"}
      </ExportPositionedCell>,
      ...(showCols
        ? cols.flatMap((c, ci) => measures.map((m, mi) => (
            <ExportPositionedCell
              key={`${c.key}-${m.id}`}
              style={cellHead}
              left={leftForValue(ci * measures.length + mi)}
              top={0}
              width={valueColW}
              height={rowH}
              padX={8}
            >
              {c.values.join(" / ")} · {m.label}
            </ExportPositionedCell>
          )))
        : measures.map((m, mi) => (
            <ExportPositionedCell key={m.id} style={cellHead} left={leftForValue(mi)} top={0} width={valueColW} height={rowH} padX={8}>
              {m.label}
            </ExportPositionedCell>
          ))),
    ];

    const bodyCells = visibleHeaders.flatMap((rh, ri) => [
      <ExportPositionedCell key={`${rh.key}-label`} style={cellLabel} left={0} top={(ri + 1) * rowH} width={firstColW} height={rowH} padX={8}>
        {rh.values.join(" / ") || "Total"}
      </ExportPositionedCell>,
      ...(showCols
        ? cols.flatMap((c, ci) => measures.map((m, mi) => {
            const v = result.cells.get(rh.key)?.get(c.key)?.[m.id] ?? 0;
            return (
              <ExportPositionedCell
                key={`${rh.key}-${c.key}-${m.id}`}
                style={{ ...cellValDyn, ...getConditionalStyle(m.id, v, c.key, rh.key) }}
                left={leftForValue(ci * measures.length + mi)}
                top={(ri + 1) * rowH}
                width={valueColW}
                height={rowH}
                padX={8}
              >
                {fmtMeasure(m, v)}
              </ExportPositionedCell>
            );
          }))
        : measures.map((m, mi) => {
            const v = result.rowTotals.get(rh.key)?.[m.id] ?? 0;
            return (
              <ExportPositionedCell
                key={`${rh.key}-${m.id}`}
                style={{ ...cellValDyn, ...getConditionalStyle(m.id, v, "__row__", rh.key) }}
                left={leftForValue(mi)}
                top={(ri + 1) * rowH}
                width={valueColW}
                height={rowH}
                padX={8}
              >
                {fmtMeasure(m, v)}
              </ExportPositionedCell>
            );
          })),
    ]);

    const othersCells = othersRow
      ? [
          <ExportPositionedCell
            key="others-label"
            style={{ ...cellLabel, fontStyle: "italic", background: "#F1F5F9" }}
            left={0}
            top={(rowCount - 1) * rowH}
            width={firstColW}
            height={rowH}
            padX={8}
          >
            Outros ({hiddenHeaders.length})
          </ExportPositionedCell>,
          ...(showCols
            ? cols.flatMap((c, ci) => measures.map((m, mi) => (
                <ExportPositionedCell
                  key={`oth-${c.key}-${m.id}`}
                  style={{ ...cellValDyn, fontStyle: "italic", background: "#F1F5F9" }}
                  left={leftForValue(ci * measures.length + mi)}
                  top={(rowCount - 1) * rowH}
                  width={valueColW}
                  height={rowH}
                  padX={8}
                >
                  {fmtMeasure(m, othersRow[c.key][m.id])}
                </ExportPositionedCell>
              )))
            : measures.map((m, mi) => (
                <ExportPositionedCell
                  key={`oth-${m.id}`}
                  style={{ ...cellValDyn, fontStyle: "italic", background: "#F1F5F9" }}
                  left={leftForValue(mi)}
                  top={(rowCount - 1) * rowH}
                  width={valueColW}
                  height={rowH}
                  padX={8}
                >
                  {fmtMeasure(m, othersRow.__row__[m.id])}
                </ExportPositionedCell>
              ))),
        ]
      : [];

    return (
      <div style={{ width: "100%", height: "100%", overflow: "hidden", fontFamily: "Calibri", fontSize: 12 }}>
        <div style={{
          width: "100%",
          height: "100%",
          position: "relative",
        }}>
          {headerCells}
          {bodyCells}
          {othersCells}
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden", fontFamily: "Calibri", fontSize: 12 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {tableCell("th", b.rowDims.map((d) => labelOfDim(d)).join(" / ") || "Total", cellHead)}
            {showCols
              ? cols.flatMap((c) => measures.map((m) => (
                  <th key={`${c.key}-${m.id}`} style={cellHead}>{c.values.join(" / ")} · {m.label}</th>
                )))
              : measures.map((m) => <th key={m.id} style={cellHead}>{m.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {visibleHeaders.map((rh) => (
            <tr key={rh.key}>
              {tableCell("td", rh.values.join(" / ") || "Total", cellLabel)}
              {showCols
                ? cols.flatMap((c) => measures.map((m) => {
                    const v = result.cells.get(rh.key)?.get(c.key)?.[m.id] ?? 0;
                    return tableCell("td", fmtMeasure(m, v), { ...cellValDyn, ...getConditionalStyle(m.id, v, c.key, rh.key) }, `${c.key}-${m.id}`);
                  }))
                : measures.map((m) => {
                    const v = result.rowTotals.get(rh.key)?.[m.id] ?? 0;
                    return tableCell("td", fmtMeasure(m, v), { ...cellValDyn, ...getConditionalStyle(m.id, v, "__row__", rh.key) }, m.id);
                  })}
            </tr>
          ))}
          {othersRow && (
            <tr style={{ background: "#F1F5F9" }}>
              {tableCell("td", `Outros (${hiddenHeaders.length})`, { ...cellLabel, fontStyle: "italic" })}
              {showCols
                ? cols.flatMap((c) => measures.map((m) => (
                    tableCell("td", fmtMeasure(m, othersRow[c.key][m.id]), { ...cellValDyn, fontStyle: "italic" }, `oth-${c.key}-${m.id}`)
                  )))
                : measures.map((m) => (
                    tableCell("td", fmtMeasure(m, othersRow.__row__[m.id]), { ...cellValDyn, fontStyle: "italic" }, `oth-${m.id}`)
                  ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart — delegates to the unified ChartCanvas (Recharts + ChartStyle)
// ---------------------------------------------------------------------------
import { ChartCanvas } from "./chart/ChartCanvas";

function ChartRender({ block }: { block: ChartBlock }) {
  return <ChartCanvas block={block} />;
}

// ---------------------------------------------------------------------------
// Top SKU / Top Ranking
// ---------------------------------------------------------------------------
function TopSkuRender({ block: b }: { block: TopSkuBlock }) {
  const pricing = usePricing((s) => s.rows);
  const budget = useBudget((s) => s.rows);
  const rows = useDataSource(b.dataSource, pricing, budget);
  // Sempre busca todos para podermos calcular o efetivo + Outros
  const allItems = useMemo(
    () => computeTopRanking(rows, b.filters, b.dim, b.measure, 9999, b.periodMode, b.periodValue),
    [rows, b.filters, b.dim, b.measure, b.periodMode, b.periodValue],
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

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", fontFamily: "Calibri" }}>
      {b.title && (
        <div style={{ fontSize: 16, fontWeight: 700, color: "#C8102E", padding: "4px 8px" }}>
          {b.title}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", padding: "0 8px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#C8102E", color: "#fff" }}>
              <th style={topHead}>#</th>
              <th style={{ ...topHead, textAlign: "left" }}>Item</th>
              <th style={{ ...topHead, textAlign: "right" }}>Valor</th>
              {b.showShare && <th style={{ ...topHead, textAlign: "right" }}>%</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const isOthers = b.showOthers && i === items.length - 1 && hidden.length > 0;
              return (
                <tr key={it.name} style={{ borderBottom: "1px solid #E2E8F0", background: isOthers ? "#F1F5F9" : undefined }}>
                  <td style={{ padding: "4px 6px", color: "#64748B", fontWeight: 600 }}>{isOthers ? "—" : i + 1}</td>
                  <td style={{ padding: "4px 6px", maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontStyle: isOthers ? "italic" : undefined }}>
                    <div style={{ position: "relative" }}>
                      <div style={{
                        position: "absolute", left: 0, top: 0, bottom: 0,
                        width: `${(it.value / max) * 100}%`,
                        background: "rgba(200,16,46,0.08)", zIndex: 0,
                      }} />
                      <span style={{ position: "relative", zIndex: 1 }}>{it.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: "4px 6px", textAlign: "right", fontWeight: 600, fontStyle: isOthers ? "italic" : undefined }}>{fmt(it.value)}</td>
                  {b.showShare && (
                    <td style={{ padding: "4px 6px", textAlign: "right", color: "#64748B" }}>
                      {(it.share * 100).toFixed(1)}%
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const topHead: React.CSSProperties = {
  padding: "5px 6px", fontSize: 11, fontWeight: 700, textAlign: "center",
};

const cellHead: React.CSSProperties = {
  background: "#C8102E", color: "#fff", padding: "6px 8px", textAlign: "center",
  fontWeight: 700, fontSize: 11, border: "1px solid #fff", verticalAlign: "middle", lineHeight: 1.15,
};
const cellLabel: React.CSSProperties = {
  padding: "5px 8px", textAlign: "left", fontWeight: 600,
  color: "#1C2430", borderBottom: "1px solid #E2E8F0", background: "#fff",
  verticalAlign: "middle", lineHeight: 1.15,
};
const cellVal: React.CSSProperties = {
  padding: "5px 8px", textAlign: "right", color: "#1C2430",
  borderBottom: "1px solid #E2E8F0", background: "#fff",
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

function DreRender({ block: blk, readOnly }: { block: DreBlock; readOnly?: boolean }) {
  const pricingRows = usePricing((s) => s.rows);
  const budgetRows = useBudget((s) => s.rows);
  const sourceRows = useDataSource(blk.dataSource, pricingRows, budgetRows);
  const months = useMonthsInfo();

  const filteredRows = useMemo(
    () => applyFilters(sourceRows, blk.filters ?? {}, null),
    [sourceRows, blk.filters],
  );

  const cols = useMemo(() => {
    const allMonths = [...months].sort((a, b) =>
      a.ano !== b.ano ? a.ano - b.ano : a.mes - b.mes,
    );
    if (!blk.periodos || blk.periodos.length === 0) return allMonths.slice(-6);
    return allMonths.filter((m) => blk.periodos!.includes(m.periodo));
  }, [months, blk.periodos]);

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

  if (cols.length === 0) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: "100%", height: "100%", color: "#94A3B8",
        fontSize: blk.fontSize, fontFamily: "Calibri, Arial, sans-serif",
      }}>
        Configure os períodos para exibir o DRE
      </div>
    );
  }

  const fs = blk.fontSize;
  const pad = `${Math.round(fs * 0.27)}px ${Math.round(fs * 0.55)}px`;
  const padVal = `${Math.round(fs * 0.27)}px ${Math.round(fs * 0.36)}px`;
  const dreCell = (
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
    const inner = exportCellContent(content, { padding: style.padding, align: style.textAlign });
    const cellStyle = exportCellStyle(style);
    return tag === "th"
      ? <th key={key} style={cellStyle}>{inner}</th>
      : <td key={key} style={cellStyle}>{inner}</td>;
  };

  if (readOnly) {
    const rowCount = 1 + visibleLines.length;
    const rowH = 100 / rowCount;
    const firstColW = 30;
    const periodColW = (showVar ? 55 : 70) / cols.length;
    const varColW = showVar ? 15 : 0;
    const leftForPeriod = (idx: number) => firstColW + idx * periodColW;
    const headerBase: React.CSSProperties = {
      background: blk.headerColor,
      color: "#FFFFFF",
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
      const rowBg = isEven ? "#F8FAFC" : "#FFFFFF";
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
          {line.label}
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
            color: cfColor ?? (isNeg ? "#DC2626"
              : (line.id === "cm" || line.id === "cmPct") ? "#16A34A"
              : blk.textColor),
            background: cfBg ?? rowBg,
            borderBottom: line.bold ? `1px solid ${blk.headerColor}30` : "none",
            fontSize: fs,
          }} left={leftForPeriod(ci)} top={top} width={periodColW} height={rowH} padX={Math.round(fs * 0.36)}>
            {val === null ? "—" : fmt(val, line.kind)}
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
          : (isPositivo !== isCusto) ? "#16A34A" : "#DC2626";
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

  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden", fontFamily: "Calibri, Arial, sans-serif" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: fs, color: blk.textColor, tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "30%" }} />
          {cols.map((c) => <col key={c.periodo} style={{ width: `${(showVar ? 55 : 70) / cols.length}%` }} />)}
          {showVar && <col style={{ width: "15%" }} />}
        </colgroup>
        <thead>
          <tr>
            <th style={{
              background: blk.headerColor, color: "#FFFFFF",
              padding: pad, textAlign: "left", fontWeight: 600,
              fontSize: fs + 1, whiteSpace: "nowrap",
              verticalAlign: "middle", lineHeight: 1.15,
            }}>
              Indicador
            </th>
            {cols.map((col) => (
              <th key={col.periodo} style={{
                background: blk.headerColor, color: "#FFFFFF",
                padding: padVal, textAlign: "center", fontWeight: 600,
                fontSize: fs + 1,
                verticalAlign: "middle", lineHeight: 1.15,
              }}>
                {MESES[col.mes - 1]}/{String(col.ano).slice(2)}
              </th>
            ))}
            {showVar && ultimoCol && penultimoCol && (
              <th style={{
                background: blk.headerColor, color: "#FFFFFF",
                padding: padVal, textAlign: "center", fontWeight: 600,
                fontSize: fs + 1,
                borderLeft: "1px solid rgba(255,255,255,0.3)",
                verticalAlign: "middle", lineHeight: 1.15,
              }}>
                {MESES[ultimoCol.mes - 1]}/{String(ultimoCol.ano).slice(2)}
                {" vs "}
                {MESES[penultimoCol.mes - 1]}/{String(penultimoCol.ano).slice(2)}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {visibleLines.map((line, idx) => {
            const isEven = idx % 2 === 0;
            return (
              <tr key={line.id} style={{ background: isEven ? "#F8FAFC" : "#FFFFFF" }}>
                {dreCell("td", line.label, {
                  padding: pad,
                  fontWeight: line.bold ? 600 : 400,
                  color: line.id === "cm" || line.id === "cmPct" || line.id === "cmKg"
                    ? blk.headerColor : blk.textColor,
                  borderBottom: line.bold ? `1px solid ${blk.headerColor}30` : "none",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  fontSize: fs,
                  verticalAlign: "middle", lineHeight: 1.15,
                  textAlign: "left",
                })}
                {cols.map((col) => {
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
                  return (
                    <td key={col.periodo} style={{
                      padding: readOnly ? 0 : padVal, textAlign: "center",
                      fontWeight: line.bold ? 600 : 400,
                      color: cfColor ?? (isNeg ? "#DC2626"
                        : (line.id === "cm" || line.id === "cmPct") ? "#16A34A"
                        : blk.textColor),
                      background: cfBg,
                      borderBottom: line.bold ? `1px solid ${blk.headerColor}30` : "none",
                      fontSize: fs,
                      verticalAlign: "middle", lineHeight: 1.15,
                    }}>
                      {readOnly
                        ? exportCellContent(val === null ? "—" : fmt(val, line.kind), { padding: padVal, align: "center" })
                        : val === null ? "—" : fmt(val, line.kind)}
                    </td>
                  );
                })}
                {showVar && (() => {
                  const valUltimo = aggUltimo ? line.get(aggUltimo) : null;
                  const valPenultimo = aggPenultimo ? line.get(aggPenultimo) : null;
                  const varPct = (valUltimo !== null && valPenultimo !== null && valPenultimo !== 0)
                    ? (valUltimo - valPenultimo) / Math.abs(valPenultimo)
                    : null;
                  const varAbs = (valUltimo !== null && valPenultimo !== null)
                    ? valUltimo - valPenultimo
                    : null;
                  const isCusto = LINHAS_CUSTO.includes(line.id);
                  const isPositivo = varPct !== null && varPct > 0;
                  const cor = varPct === null ? blk.textColor
                    : (isPositivo !== isCusto) ? "#16A34A" : "#DC2626";
                  const tipo = blk.variacaoTipo ?? "percentual";
                  let display: React.ReactNode = "—";
                  if (tipo === "percentual") {
                    if (varPct !== null) {
                      const sinal = varPct > 0 ? "+" : "";
                      display = `${sinal}${(varPct * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
                    }
                  } else if (tipo === "absoluta") {
                    display = varAbs !== null ? fmt(varAbs, line.kind) : "—";
                  } else {
                    const pctStr = varPct !== null
                      ? `${varPct > 0 ? "+" : ""}${(varPct * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
                      : "—";
                    display = varAbs !== null ? <>{pctStr} ({fmt(varAbs, line.kind)})</> : pctStr;
                  }
                  return (
                    <td style={{
                      padding: readOnly ? 0 : padVal, textAlign: "center",
                      fontWeight: line.bold ? 600 : 400,
                      color: cor,
                      borderLeft: `1px solid ${blk.headerColor}20`,
                      borderBottom: line.bold ? `1px solid ${blk.headerColor}30` : "none",
                      fontSize: fs,
                      background: isEven ? "#F8FAFC" : "#FFFFFF",
                      verticalAlign: "middle", lineHeight: 1.15,
                    }}>
                      {readOnly
                        ? exportCellContent(display, { padding: padVal, align: "center" })
                        : display}
                    </td>
                  );
                })()}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function labelOfDim(id: string): string {
  return ALL_DIMENSIONS.find((d) => d.id === id)?.label ?? id;
}

// ---------------------------------------------------------------------------
// Omni Analytics Renderers
// ---------------------------------------------------------------------------

const OMNI_COLORS = ["#C8102E", "#1C2430", "#2563EB", "#16A34A", "#D97706", "#7C3AED", "#0891B2", "#BE185D"];

function omniEmpty(msg = "Sem dados.") {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>{msg}</span>
    </div>
  );
}

function omniTitle(title: string) {
  return (
    <div style={{ fontSize: 12, fontWeight: 700, color: "#1C2430", marginBottom: 6, paddingLeft: 2 }}>
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
  return { bg: `hsl(${h.toFixed(0)} ${s}% ${l.toFixed(0)}%)`, color: l < 58 ? "#fff" : "#1C2430" };
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
              <td style={{ padding: "2px 4px", fontWeight: 600, fontSize: fs, color: "#1C2430", whiteSpace: "nowrap" }}>{row.fy}</td>
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
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 16, overflow: "hidden" }}>
        {showHero && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "hsl(var(--success))", marginBottom: 4 }}>Heróis</div>
            <AbcBar rows={rows} variant="hero" limit={b.topN} sortBy={b.sortBy} minRolForPct={minRolForPct} />
          </div>
        )}
        {showVillain && (
          <div style={{ flex: 1, minWidth: 0 }}>
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
    if (b.base && b.comp) return { baseKey: b.base, compKey: b.comp };
    const opts = b.periodMode === "fy"
      ? Array.from(new Set(filtered.map((r) => r.fy))).sort()
      : months.map((m) => m.periodo);
    const compKey = opts[opts.length - 1] ?? "";
    const baseKey = opts[opts.length - 2] ?? "";
    return { baseKey, compKey };
  }, [filtered, b.base, b.comp, b.periodMode, months]);

  const result = useMemo(
    () => computePriceDecomposition(filtered, baseKey, compKey, b.periodMode),
    [filtered, baseKey, compKey, b.periodMode],
  );

  if (!result) return omniEmpty("Selecione dois períodos para comparar.");

  const signColor = (v: number) => v >= 0 ? "#16A34A" : "#C8102E";
  const fmtBRL2 = (v: number) => formatBRL(v, { compact: false, digits: 2 });

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: 8, overflow: "auto" }}>
      {b.showTitle && omniTitle(b.title || "Decomposição de Preço")}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[
          { label: "Preço Médio Base", value: fmtBRL2(result.precoMedioBase), color: "#1C2430" },
          { label: "Preço Médio Comp", value: fmtBRL2(result.precoMedioComp), color: "#1C2430" },
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
  const months  = useMonthsInfo();
  const filtered = useMemo(() => applyOmniFilters(pricing, b), [pricing, b]);

  const { baseKey, compKey } = useMemo(() => {
    if (b.base && b.comp) return { baseKey: b.base, compKey: b.comp };
    const opts = b.periodMode === "fy"
      ? Array.from(new Set(filtered.map((r) => r.fy))).sort()
      : months.map((m) => m.periodo);
    return { baseKey: opts[opts.length - 2] ?? "", compKey: opts[opts.length - 1] ?? "" };
  }, [filtered, b.base, b.comp, b.periodMode, months]);

  const result = useMemo(() => {
    if (!baseKey || !compKey) return null;
    return calcPVM(filtered, baseKey, compKey, b.periodMode);
  }, [filtered, baseKey, compKey, b.periodMode]);

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

  const { filtered, allClients, value } = useMemo(() => {
    const all = applyOmniFilters(pricing, b);
    const allClients = new Set(all.map((r) => r.cliente).filter(Boolean));
    let subset = all;
    if (b.periodoComp) {
      subset = all.filter((r) => r.periodo === b.periodoComp || r.fy === b.periodoComp);
    } else {
      const periods = Array.from(new Set(all.map((r) => r.periodo))).sort();
      const lastPeriod = periods[periods.length - 1];
      if (lastPeriod) subset = all.filter((r) => r.periodo === lastPeriod);
    }
    const activeClients = new Set(subset.map((r) => r.cliente).filter(Boolean));
    const value = allClients.size > 0 ? activeClients.size / allClients.size : 0;
    return { filtered: subset, allClients, value };
  }, [pricing, b]);

  const activeCount = useMemo(() => new Set(filtered.map((r) => r.cliente).filter(Boolean)).size, [filtered]);

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", padding: 8 }}>
      {b.showTitle && omniTitle(b.title || "Farol de Positivação")}
      {b.showGauge && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <FarolGauge value={value} size={Math.min(b.w, b.h) * 0.55} />
        </div>
      )}
      <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", textAlign: "center" }}>
        {activeCount.toLocaleString("pt-BR")} clientes ativos / {allClients.size.toLocaleString("pt-BR")} total
      </div>
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
              <Area type="monotone" dataKey="cv" name="Custo Variável % ROL" stroke="#C8102E" fill="#C8102E" fillOpacity={0.7} strokeWidth={1.5} dot={false} isAnimationActive={false} />
            )}
            {b.showCustoFixo && (
              <Area type="monotone" dataKey="cf" name="Custo Fixo % ROL" stroke="#1C2430" fill="#1C2430" fillOpacity={0.5} strokeWidth={1.5} dot={false} isAnimationActive={false} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
