// Renderer dos blocos do slide personalizado.

import React, { useMemo } from "react";
import type {
  CustomBlock, TitleBlock, TextBlock, KpiBlock, ImageBlock,
  ShapeBlock, BridgeBlock, TableBlock, ChartBlock, TopSkuBlock, DreBlock,
  BlockDataSource,
} from "@/lib/customSlide";
import type { PricingRow } from "@/lib/types";
import type { BudgetRow } from "@/lib/budget";
import { aggregate, LINES, fmt } from "../DreTable";
import { useMonthsInfo } from "@/store/selectors";
import { applyFilters, calcPVM } from "@/lib/analytics";
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

export function BlockRenderer({ block, readOnly: _readOnly, isEditing }: { block: CustomBlock; readOnly?: boolean; isEditing?: boolean }) {
  switch (block.kind) {
    case "title":  return <TitleRender block={block} isEditing={isEditing} />;
    case "text":   return <TextRender block={block} isEditing={isEditing} />;
    case "kpi":    return <KpiRender block={block} />;
    case "image":  return <ImageRender block={block} />;
    case "shape":  return <ShapeRender block={block} />;
    case "bridge": return <BridgeRender block={block} />;
    case "table":  return <TableRender block={block} />;
    case "chart":  return <ChartRender block={block} />;
    case "topSku": return <TopSkuRender block={block} />;
    case "dre":    return <DreRender block={block} />;
  }
}

function TitleRender({ block: b, isEditing }: { block: TitleBlock; isEditing?: boolean }) {
  return (
    <div style={{
      width: "100%", height: "100%", display: "flex",
      alignItems: "center", justifyContent: justifyMap[b.align] ?? "flex-start",
      fontFamily: b.fontFamily ?? "Calibri, sans-serif",
      fontSize: b.size,
      fontWeight: b.bold ? 700 : 400,
      fontStyle: b.italic ? "italic" : "normal",
      color: `#${b.color}`,
      lineHeight: b.lineHeight ?? 1.1,
      textAlign: b.align,
      letterSpacing: b.letterSpacing != null ? `${b.letterSpacing}em` : undefined,
      textShadow: b.textShadow || undefined,
      opacity: b.opacity != null ? b.opacity / 100 : undefined,
      textTransform: (b.textTransform ?? "none") as React.CSSProperties["textTransform"],
      padding: b.padding ?? 0,
      backgroundColor: b.backgroundColor && b.backgroundColor !== "transparent"
        ? `#${b.backgroundColor}` : undefined,
      borderRadius: b.borderRadius ?? undefined,
      overflow: "hidden",
      visibility: isEditing ? "hidden" : "visible",
    }}>
      {b.text}
    </div>
  );
}

function TextRender({ block: b, isEditing }: { block: TextBlock; isEditing?: boolean }) {
  return (
    <div style={{
      width: "100%", height: "100%", display: "flex",
      alignItems: "flex-start", justifyContent: b.align,
      fontFamily: b.fontFamily ?? "Calibri, sans-serif",
      fontSize: b.size,
      fontStyle: b.italic ? "italic" : "normal",
      color: `#${b.color}`,
      textAlign: b.align,
      whiteSpace: "pre-wrap", overflow: "hidden",
      lineHeight: b.lineHeight ?? 1.3,
      letterSpacing: b.letterSpacing != null ? `${b.letterSpacing}em` : undefined,
      textShadow: b.textShadow || undefined,
      opacity: b.opacity != null ? b.opacity / 100 : undefined,
      textTransform: (b.textTransform ?? "none") as React.CSSProperties["textTransform"],
      padding: b.padding ?? 0,
      backgroundColor: b.backgroundColor && b.backgroundColor !== "transparent"
        ? `#${b.backgroundColor}` : undefined,
      borderRadius: b.borderRadius ?? undefined,
      visibility: isEditing ? "hidden" : "visible",
    }}>
      {b.text}
    </div>
  );
}

function KpiRender({ block: b }: { block: KpiBlock }) {
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
  return (
    <div style={{
      width: "100%", height: "100%",
      display: "flex", flexDirection: "column", justifyContent: "center",
      padding: 12, borderRadius: isTransparent ? 0 : 12,
      background: isTransparent ? "transparent" : `#${cardBg}`,
      border: isTransparent ? "none" : "1px solid #E2E8F0",
      fontFamily: "Calibri, sans-serif",
    }}>
      <div style={{ fontSize: 14, color: "#64748B", textTransform: "uppercase", letterSpacing: 1 }}>
        {b.label || measureLabel || "KPI"}
      </div>
      <div style={{
        fontSize: b.valueSize, fontWeight: 700, color: `#${b.color}`,
        marginTop: 4, lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
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
    const filtered = applyFilters(pricing, b.filters, null);
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

function TableRender({ block: b }: { block: TableBlock }) {
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

  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden", fontFamily: "Calibri", fontSize: 12 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={cellHead}>{b.rowDims.map((d) => labelOfDim(d)).join(" / ") || "Total"}</th>
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
              <td style={cellLabel}>{rh.values.join(" / ") || "Total"}</td>
              {showCols
                ? cols.flatMap((c) => measures.map((m) => {
                    const v = result.cells.get(rh.key)?.get(c.key)?.[m.id] ?? 0;
                    return <td key={`${c.key}-${m.id}`} style={{ ...cellValDyn, ...getConditionalStyle(m.id, v, c.key, rh.key) }}>{fmtMeasure(m, v)}</td>;
                  }))
                : measures.map((m) => {
                    const v = result.rowTotals.get(rh.key)?.[m.id] ?? 0;
                    return <td key={m.id} style={{ ...cellValDyn, ...getConditionalStyle(m.id, v, "__row__", rh.key) }}>{fmtMeasure(m, v)}</td>;
                  })}
            </tr>
          ))}
          {othersRow && (
            <tr style={{ background: "#F1F5F9" }}>
              <td style={{ ...cellLabel, fontStyle: "italic" }}>
                Outros ({hiddenHeaders.length})
              </td>
              {showCols
                ? cols.flatMap((c) => measures.map((m) => (
                    <td key={`oth-${c.key}-${m.id}`} style={{ ...cellValDyn, fontStyle: "italic" }}>
                      {fmtMeasure(m, othersRow[c.key][m.id])}
                    </td>
                  )))
                : measures.map((m) => (
                    <td key={`oth-${m.id}`} style={{ ...cellValDyn, fontStyle: "italic" }}>
                      {fmtMeasure(m, othersRow.__row__[m.id])}
                    </td>
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
  fontWeight: 700, fontSize: 11, border: "1px solid #fff",
};
const cellLabel: React.CSSProperties = {
  padding: "5px 8px", textAlign: "left", fontWeight: 600,
  color: "#1C2430", borderBottom: "1px solid #E2E8F0", background: "#fff",
};
const cellVal: React.CSSProperties = {
  padding: "5px 8px", textAlign: "right", color: "#1C2430",
  borderBottom: "1px solid #E2E8F0", background: "#fff",
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

function DreRender({ block: blk }: { block: DreBlock }) {
  const pricingRows = usePricing((s) => s.rows);
  const budgetRows = useBudget((s) => s.rows);
  const sourceRows = useDataSource(blk.dataSource, pricingRows, budgetRows);
  const months = useMonthsInfo();

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
      const rs = sourceRows.filter((r) => r.periodo === col.periodo);
      map.set(col.periodo, aggregate(rs));
    }
    return map;
  }, [sourceRows, cols]);

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
            }}>
              Indicador
            </th>
            {cols.map((col) => (
              <th key={col.periodo} style={{
                background: blk.headerColor, color: "#FFFFFF",
                padding: padVal, textAlign: "center", fontWeight: 600,
                fontSize: fs + 1,
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
                <td style={{
                  padding: pad,
                  fontWeight: line.bold ? 600 : 400,
                  color: line.id === "cm" || line.id === "cmPct" || line.id === "cmKg"
                    ? blk.headerColor : blk.textColor,
                  borderBottom: line.bold ? `1px solid ${blk.headerColor}30` : "none",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  fontSize: fs,
                }}>
                  {line.label}
                </td>
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
                      padding: padVal, textAlign: "center",
                      fontWeight: line.bold ? 600 : 400,
                      color: cfColor ?? (isNeg ? "#DC2626"
                        : (line.id === "cm" || line.id === "cmPct") ? "#16A34A"
                        : blk.textColor),
                      background: cfBg,
                      borderBottom: line.bold ? `1px solid ${blk.headerColor}30` : "none",
                      fontSize: fs,
                    }}>
                      {val === null ? "—" : fmt(val, line.kind)}
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
                      padding: padVal, textAlign: "center",
                      fontWeight: line.bold ? 600 : 400,
                      color: cor,
                      borderLeft: `1px solid ${blk.headerColor}20`,
                      borderBottom: line.bold ? `1px solid ${blk.headerColor}30` : "none",
                      fontSize: fs,
                      background: isEven ? "#F8FAFC" : "#FFFFFF",
                    }}>
                      {display}
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
