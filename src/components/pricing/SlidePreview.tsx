// Slide live preview — réplica visual fiel aos slides exportados em PPT.
// Renderiza um SVG miniatura usando o mesmo sistema de coordenadas
// (inches × 100 → viewBox 1333×750, equivalente ao layout LAYOUT_WIDE 13.33"×7.5").
// Espelha exatamente: cores, posições, fontes (proporcionalmente), curvas suaves
// para o Budget Evo (Overview CM/VOL) e bridge waterfall com retângulos pretos
// (totais) + linha vermelha curta (deltas) + labels abaixo.
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import html2canvas from "html2canvas";
import { applyFilters, calcPVM, type PVMResult } from "@/lib/analytics";
import {
  computeBudgetEvoAccumGap,
  computeBudgetEvoMonthly,
  formatBudgetEvoGapLabel,
  isItemReady,
  type SlideItem,
} from "@/lib/slidesFlow";
import { isCurrentFiscalYearMonth, latestFiscalYearStartYear } from "@/lib/fiscalYear";
import { monthLabel } from "@/lib/format";
import { usePricing } from "@/store/pricing";
import { useBudget } from "@/store/budget";
import { useForecast } from "@/store/forecast";
import { useRolling } from "@/store/rolling";
import { useCustomTables } from "@/store/customTables";
import { AlertCircle, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CANVAS_W,
  CANVAS_H,
} from "@/lib/customSlide";
import { computeBridgeYtdRealVsBudget } from "@/lib/bridgeYtdBudget";
import { CustomCanvasReadOnly } from "@/components/pricing/custom/PresentationMode";
import { SlideFilterProvider } from "@/components/pricing/custom/SlideFilterContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { localDataMissingMessage } from "@/lib/slideLocalDataStatus";
import { incrementSlidePerfCounter, isSlidePerfEnabled, recordSlideRender } from "@/lib/slidesPerfCounters";
import { getCachedRowsSignature, getOrComputeSlideCalc } from "@/lib/slideCalcCache";
import { SLIDE_HEX, SLIDE_PREVIEW_COLORS } from "@/lib/slideColors";
import {
  buildSlideThumbnailKey,
  getSlideThumbnail,
  markSlideThumbnailError,
  markSlideThumbnailRendering,
  setSlideThumbnail,
  subscribeSlideThumbnail,
} from "@/lib/slideThumbnailCache";

const C = SLIDE_PREVIEW_COLORS;

// Sistema de coordenadas: inches × 100  → viewBox 1333 × 750
const SLIDE_W = 1333;
const SLIDE_H = 750;
type PreviewDataRow = Record<string, number | string | null | undefined>;

type ThumbnailKeySignature = {
  pricingMetric: string;
  pricingSignature: string;
  budgetSignature: string;
  forecastSignature: string;
  rollingSignature: string;
  useData: boolean;
  pixelRatio: number;
};

const slideThumbnailKeyByItem = new WeakMap<SlideItem, { signature: ThumbnailKeySignature; key: string }>();

function sameThumbnailKeySignature(a: ThumbnailKeySignature, b: ThumbnailKeySignature): boolean {
  return a.pricingMetric === b.pricingMetric
    && a.pricingSignature === b.pricingSignature
    && a.budgetSignature === b.budgetSignature
    && a.forecastSignature === b.forecastSignature
    && a.rollingSignature === b.rollingSignature
    && a.useData === b.useData
    && a.pixelRatio === b.pixelRatio;
}

// ---------------------------------------------------------------------------
// Format helpers (idênticos ao slide)
// ---------------------------------------------------------------------------
const fmtIntBR = (v: number) => (!isFinite(v) || v === 0 ? "0" : Math.round(v).toLocaleString("pt-BR"));
const fmtSignedIntBR = (v: number) => {
  if (!isFinite(v) || Math.round(v) === 0) return "0";
  const r = Math.round(v);
  return r < 0 ? `-${Math.abs(r).toLocaleString("pt-BR")}` : r.toLocaleString("pt-BR");
};
const fmtSignedGapIntBR = formatBudgetEvoGapLabel;
const fmtDecimalBR = (v: number, d = 2) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPctBR = (v: number, d = 1) =>
  `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d })}%`;

function centerOfVisibleRealRange<T>(
  rows: T[],
  xOf: (index: number) => number,
  hasReal: (row: T) => boolean,
  fallbackX: number,
) {
  const realIndexes = rows
    .map((row, index) => (hasReal(row) ? index : -1))
    .filter((index) => index >= 0);
  if (realIndexes.length === 0) return fallbackX;
  return (xOf(realIndexes[0]) + xOf(realIndexes[realIndexes.length - 1])) / 2;
}

// Curva suave Catmull-Rom → Bezier (espelha smoothPathD do export)
function smoothPathD(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------
function Empty({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
      <AlertCircle className="h-5 w-5 text-muted-foreground/60" />
      <p className="text-[11px] text-muted-foreground">{message}</p>
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode; label?: string }) {
  return <div className="aspect-[1333/750] w-full bg-white">{children}</div>;
}

function HaraldFooterStripe() {
  return (
    <>
      <rect x={0} y={SLIDE_H - 28} width={SLIDE_W} height={28} fill={C.haraldRed} />
      <text x={SLIDE_W - 40} y={SLIDE_H - 9} fontFamily="Calibri" fontSize="16" fontWeight={700}
        fill="white" textAnchor="end">Harald</text>
      <text x={40} y={SLIDE_H - 9} fontFamily="Calibri" fontSize="10" fontStyle="italic"
        fill="white">FONTE: KE30 – OMNI4 Pricing Analytics</text>
    </>
  );
}

// ---------------------------------------------------------------------------
// COVER preview
// ---------------------------------------------------------------------------
function CoverPreview({ item }: { item: Extract<SlideItem, { kind: "cover" }> }) {
  const { title, subtitle, variant } = item.config;
  const isDivider = variant === "divider";
  return (
    <Frame label={isDivider ? "Divisor" : "Capa"}>
      <svg viewBox={`0 0 ${SLIDE_W} ${SLIDE_H}`} className="h-full w-full">
        <rect width={SLIDE_W} height={SLIDE_H} fill={isDivider ? C.white : C.haraldRed} />
        <text x={60} y={SLIDE_H / 2 - 20} fontFamily="Calibri" fontSize="22" fontWeight={600}
          fill={isDivider ? C.muted : "rgba(255,255,255,0.75)"} letterSpacing="4">
          {(isDivider ? "DIVISOR DE SEÇÃO" : "APRESENTAÇÃO")}
        </text>
        <text x={60} y={SLIDE_H / 2 + 30} fontFamily="Calibri" fontSize="62" fontWeight={700}
          fill={isDivider ? C.ink : C.white}>
          {title || "Título do slide"}
        </text>
        {subtitle && (
          <text x={60} y={SLIDE_H / 2 + 70} fontFamily="Calibri" fontSize="22"
            fill={isDivider ? C.muted : "rgba(255,255,255,0.85)"}>
            {subtitle}
          </text>
        )}
        {isDivider && <HaraldFooterStripe />}
      </svg>
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// BUDGET EVO — Overview CM/VOL
// Reproduz exatamente o layout de addBudgetEvoSlide:
//  • Título "Overview CM/VOL" (vermelho) em x=40 y=20
//  • 4 linhas de rowH=135 começando em y=95:
//      CM ABS · CM/% · CM/Kg · VOLUME (barras)
//  • Cada linha: título rotacionado 270° à esquerda (x=35),
//    headerNote em x+w*0.55, plot a partir de x+70
//  • Curvas suaves (real vermelha, budget preta tracejada)
//  • Labels horizontais por mês (maior em cima, menor embaixo)
//  • VOLUME: barras Real (vermelha) + Budget (preta) lado a lado
//    com rótulos rotacionados 270°, legenda REAL/BUDGET embaixo
// ---------------------------------------------------------------------------
function BudgetEvoPreview({ item }: { item: Extract<SlideItem, { kind: "budget_evo" }> }) {
  const budgetRows = useBudget((s) => s.rows);
  const budgetSignature = useMemo(() => getCachedRowsSignature(budgetRows), [budgetRows]);
  const data = useMemo(
    () => getOrComputeSlideCalc({
      op: "preview-budget-evo",
      slideId: item.id,
      blockId: "budget-evo",
      dataSource: "budget",
      dataSignature: budgetSignature,
      params: item.config,
    }, () => computeBudgetEvoMonthly(budgetRows, item.config.filters, item.config.start, item.config.end)),
    [budgetRows, budgetSignature, item.id, item.config],
  );

  if (data.length === 0) {
    if (budgetRows.length === 0) {
      return <Frame label="Overview CM/VOL"><Empty message={localDataMissingMessage("Budget")} /></Frame>;
    }
    return <Frame label="Overview CM/VOL"><Empty message="Sem dados Budget para o range escolhido." /></Frame>;
  }

  const currentFiscalYearStart = latestFiscalYearStartYear(data);
  const accum = computeBudgetEvoAccumGap(data);

  return (
    <Frame label="Overview CM/VOL">
      <svg viewBox={`0 0 ${SLIDE_W} ${SLIDE_H}`} className="h-full w-full">
        <rect width={SLIDE_W} height={SLIDE_H} fill={C.white} />
        {/* Título + barra vermelha decorativa */}
        <text x={40} y={58} fontFamily="Calibri" fontSize="32" fontWeight={700} fill={C.ink}>
          Overview CM/VOL
        </text>

        {/* 4 linhas de gráficos */}
        <LineRow y={95} title="CM ABS" headerNote={fmtSignedGapIntBR(accum.cmGap)} headerNoteValue={accum.cmGap}
          data={data} realKey="realCm" budKey="budCm" fmt={(v) => fmtIntBR(v)}
          showRealPoint={(row) => row.realVol > 0}
          headerNotePoint={(row) => row.realVol > 0 && isCurrentFiscalYearMonth(row, currentFiscalYearStart)}
          deltaFmt={(v) => (v >= 0 ? "+" : "") + fmtIntBR(v / 1000) + " Mi"} />
        <LineRow y={95 + 135} title="CM/%" data={data}
          realKey="realCmPct" budKey="budCmPct" fmt={(v) => fmtPctBR(v, 1)} />
        <LineRow y={95 + 135 * 2} title="CM/Kg" data={data}
          realKey="realCmKg" budKey="budCmKg" fmt={(v) => fmtDecimalBR(v, 2)} />
        <VolBarsRow y={95 + 135 * 3} data={data} accumGapTons={accum.volGap} currentFiscalYearStart={currentFiscalYearStart} />

        <HaraldFooterStripe />
      </svg>
    </Frame>
  );
}

function LineRow({
  y, title, headerNote, headerNoteValue, data, realKey, budKey, fmt, deltaFmt, showRealPoint, headerNotePoint,
}: {
  y: number;
  title: string;
  headerNote?: string;
  headerNoteValue?: number;
  data: PreviewDataRow[];
  realKey: string;
  budKey: string;
  fmt: (v: number) => string;
  deltaFmt?: (delta: number) => string;
  showRealPoint?: (row: PreviewDataRow) => boolean;
  headerNotePoint?: (row: PreviewDataRow) => boolean;
}) {
  const x = 35;
  const w = 1260;
  const h = 135;

  const plotX = x + 70;
  const plotY = y + 5;
  const plotW = w - 75;
  const plotH = h - 10;

  // valores
  const all: number[] = [];
  data.forEach((r) => {
    const a = r[realKey], b = r[budKey];
    if (a != null && isFinite(a)) all.push(a);
    if (b != null && isFinite(b)) all.push(b);
  });
  if (all.length === 0) return null;
  let minV = Math.min(...all), maxV = Math.max(...all);
  if (minV === maxV) { minV -= 1; maxV += 1; }
  const pad = (maxV - minV) * 0.25;
  const yMin = minV - pad, yMax = maxV + pad;

  const colW = plotW / Math.max(1, data.length);
  const yOf = (v: number) => plotY + (1 - (v - yMin) / (yMax - yMin)) * plotH;
  const xOf = (i: number) => plotX + colW * (i + 0.5);
  const headerNoteX = centerOfVisibleRealRange(
    data,
    xOf,
    (r) => {
      const v = r[realKey];
      return v != null && isFinite(v) && (headerNotePoint?.(r) ?? showRealPoint?.(r) ?? true);
    },
    plotX + plotW * 0.5,
  );
  const headerNoteColor = (headerNoteValue ?? 0) >= 0 ? SLIDE_HEX.success : C.haraldRed;

  const realSegments: { x: number; y: number }[][] = [];
  let currentRealSegment: { x: number; y: number }[] = [];
  const budPts: { x: number; y: number }[] = [];
  data.forEach((r, i) => {
    const a = r[realKey], b = r[budKey];
    if (a != null && isFinite(a) && (showRealPoint?.(r) ?? true)) {
      currentRealSegment.push({ x: xOf(i), y: yOf(a) });
    } else if (currentRealSegment.length > 0) {
      realSegments.push(currentRealSegment);
      currentRealSegment = [];
    }
    if (b != null && isFinite(b) && b !== 0) budPts.push({ x: xOf(i), y: yOf(b) });
  });
  if (currentRealSegment.length > 0) realSegments.push(currentRealSegment);

  // Separador vertical Real / Budget
  const sepColIdx = data.findIndex((r) => {
    const rv = r[realKey]; const bv = r[budKey];
    return (rv == null || rv === 0) && bv != null && bv !== 0;
  });
  const hasSep = sepColIdx > 0;
  const sepX = hasSep ? plotX + (sepColIdx - 0.5) * colW : 0;
  const showSplitGuide = false;
  let deltaLabel = "";
  let deltaColor = C.haraldRed;
  if (hasSep && deltaFmt) {
    const totalReal = data.reduce((s, r) => { const v = r[realKey]; return typeof v === "number" && v > 0 ? s + v : s; }, 0);
    const totalBud  = data.reduce((s, r) => { const v = r[budKey];  return typeof v === "number" && v > 0 ? s + v : s; }, 0);
    const delta = totalReal - totalBud;
    deltaLabel = deltaFmt(delta);
    deltaColor = delta >= 0 ? SLIDE_HEX.success : C.haraldRed;
  }

  return (
    <g>
      {/* Título rotacionado 270° */}
      <text
        x={x + 25} y={y + h / 2}
        fontFamily="Calibri" fontSize="22" fontWeight={700} fill={C.haraldRed}
        textAnchor="middle" dominantBaseline="middle"
        transform={`rotate(-90 ${x + 25} ${y + h / 2})`}
      >
        {title}
      </text>

      {/* Curves */}
      {realSegments.map((segment, idx) => (
        segment.length > 1 ? (
          <path key={idx} d={smoothPathD(segment)} stroke={C.haraldRed} strokeWidth={7} fill="none"
            strokeLinecap="round" strokeLinejoin="round" />
        ) : null
      ))}
      {budPts.length > 0 && (
        <path d={smoothPathD(budPts)} stroke={C.black} strokeWidth={5} fill="none"
          strokeLinecap="round" strokeLinejoin="round" strokeDasharray="14,8" />
      )}

      {/* Separador vertical Real / Budget + nota de variação */}
      {showSplitGuide && hasSep && (
        <>
          <line x1={sepX} y1={plotY + 5} x2={sepX} y2={plotY + plotH - 5}
            stroke={C.haraldRed} strokeWidth={1.5} />
          {deltaFmt && deltaLabel && (
            <>
              <text x={sepX} y={plotY - 15} fontFamily="Calibri" fontSize="13" fontWeight={700}
                fill={deltaColor} textAnchor="middle">
                {deltaLabel}
              </text>
              <line x1={sepX - 60} y1={plotY - 2} x2={sepX + 60} y2={plotY - 2}
                stroke={C.haraldRed} strokeWidth={1} />
            </>
          )}
        </>
      )}

      {/* Labels por mês: maior valor acima, menor abaixo — zeros ignorados */}
      {data.map((r, i) => {
        const a = r[realKey], b = r[budKey];
        const items: { v: number; color: string }[] = [];
        if (a != null && isFinite(a) && a !== 0 && (showRealPoint?.(r) ?? true)) items.push({ v: a, color: C.haraldRed });
        if (b != null && isFinite(b) && b !== 0) items.push({ v: b, color: C.black });
        if (items.length === 0) return null;
        items.sort((p, q) => q.v - p.v);
        const cx = xOf(i);
        return (
          <g key={i}>
            {items.map((it, idx) => {
              const cy = yOf(it.v);
              const goAbove = idx === 0;
              const ly = goAbove ? cy - 8 : cy + 18;
              return (
                <text key={idx} x={cx} y={ly}
                  fontFamily="Calibri" fontSize="13" fontWeight={700}
                  fill={it.color} textAnchor="middle">
                  {fmt(it.v)}
                </text>
              );
            })}
          </g>
        );
      })}

      {headerNote && (
        <text x={headerNoteX} y={y - 2} fontFamily="Calibri" fontSize="18" fontWeight={700}
          fill={headerNoteColor} textAnchor="middle">
          {headerNote}
        </text>
      )}
    </g>
  );
}

function VolBarsRow({
  y,
  data,
  accumGapTons,
  currentFiscalYearStart,
}: {
  y: number;
  data: PreviewDataRow[];
  accumGapTons: number;
  currentFiscalYearStart: number | null;
}) {
  const x = 35;
  const w = 1260;
  const h = 125;

  const plotX = x + 70;
  const plotY = y + 5;
  const plotW = w - 75;
  const plotH = h - 10;

  const all: number[] = [];
  data.forEach((r) => {
    if (r.realVol) all.push(r.realVol);
    if (r.budVol) all.push(r.budVol);
  });
  if (all.length === 0) return null;
  const maxV = Math.max(...all) * 1.25;
  const yOf = (v: number) => plotY + (1 - v / maxV) * plotH;
  const colW = plotW / Math.max(1, data.length);
  const barW = colW * 0.36;
  const xOf = (i: number) => plotX + colW * (i + 0.5);
  const headerNoteX = centerOfVisibleRealRange(
    data,
    xOf,
    (r) => r.realVol > 0 && isCurrentFiscalYearMonth(r, currentFiscalYearStart),
    plotX + plotW * 0.5,
  );

  // Separador vertical Real / Budget + nota de variação em volume
  const sepColIdxV = data.findIndex((r) => r.realVol === 0 && typeof r.budVol === "number" && r.budVol > 0);
  const hasSepV = sepColIdxV > 0;
  const sepXV = hasSepV ? plotX + (sepColIdxV - 0.5) * colW : 0;
  const showSplitGuide = false;
  const volDeltaLabel = `${fmtSignedGapIntBR(accumGapTons)} Tons`;
  const volDeltaColor = accumGapTons >= 0 ? SLIDE_HEX.success : C.haraldRed;

  return (
    <g>
      {/* Título VOLUME rotacionado */}
      <text x={x + 25} y={y + h / 2}
        fontFamily="Calibri" fontSize="22" fontWeight={700} fill={C.haraldRed}
        textAnchor="middle" dominantBaseline="middle"
        transform={`rotate(-90 ${x + 25} ${y + h / 2})`}>
        VOLUME
      </text>

      {/* Header tons acumulado — destaque vermelho */}
      {data.map((r, i) => {
        const cx = xOf(i);
        const realX = cx - barW - 1;
        const budX = cx + 1;
        return (
          <g key={i}>
            {r.realVol > 0 && (
              <>
                <rect x={realX} y={yOf(r.realVol)} width={barW}
                  height={plotY + plotH - yOf(r.realVol)} fill={C.haraldRed} />
                {/* label rotacionado 270° */}
                <text x={realX + barW / 2} y={yOf(r.realVol) - 6}
                  fontFamily="Calibri" fontSize="12" fontWeight={700} fill={C.haraldRed}
                  textAnchor="start" dominantBaseline="middle"
                  transform={`rotate(-90 ${realX + barW / 2} ${yOf(r.realVol) - 6})`}>
                  {fmtIntBR(r.realVol)}
                </text>
              </>
            )}
            {r.budVol > 0 && (
              <>
                <rect x={budX} y={yOf(r.budVol)} width={barW}
                  height={plotY + plotH - yOf(r.budVol)} fill={C.black} />
                <text x={budX + barW / 2} y={yOf(r.budVol) - 6}
                  fontFamily="Calibri" fontSize="12" fontWeight={700} fill={C.black}
                  textAnchor="start" dominantBaseline="middle"
                  transform={`rotate(-90 ${budX + barW / 2} ${yOf(r.budVol) - 6})`}>
                  {fmtIntBR(r.budVol)}
                </text>
              </>
            )}
            {/* Mês inclinado -35° */}
            <text
              transform={`rotate(-35, ${cx}, ${y + h + 8})`}
              x={cx} y={y + h + 8}
              fontFamily="Calibri" fontSize="11" fontWeight={700}
              fill={C.muted} textAnchor="end">
              {r.label}
            </text>
          </g>
        );
      })}

      {/* Separador vertical Real / Budget + nota de variação */}
      {showSplitGuide && hasSepV && (
        <>
          <line x1={sepXV} y1={plotY + 5} x2={sepXV} y2={plotY + plotH - 5}
            stroke={C.haraldRed} strokeWidth={1.5} />
          <text x={sepXV} y={plotY - 15} fontFamily="Calibri" fontSize="13" fontWeight={700}
            fill={volDeltaColor} textAnchor="middle">
            {volDeltaLabel}
          </text>
        </>
      )}

      {/* Legenda REAL / BUDGET — canto inferior direito do plot */}
      <g transform={`translate(${plotX + plotW - 180} ${y + h + 34})`}>
        <rect width={18} height={10} fill={C.haraldRed} />
        <text x={26} y={9} fontFamily="Calibri" fontSize="11" fontWeight={700} fill={C.ink}>REAL</text>
        <rect x={80} width={18} height={10} fill={C.black} />
        <text x={106} y={9} fontFamily="Calibri" fontSize="11" fontWeight={700} fill={C.ink}>BUDGET</text>
      </g>

      <text x={headerNoteX} y={y - 2} fontFamily="Calibri" fontSize="20" fontWeight={700}
        fill={volDeltaColor} textAnchor="middle">
        {volDeltaLabel}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// BRIDGE PVM — Overview DRE & Bridge
// Reproduz layout do addOverviewDreBridgeSlide:
//  • Título "OVERVIEW DRE & BRIDGE" vermelho top-left
//  • Labels rotacionadas "DRE" (à altura da tabela) e "BRIDGE" (à altura da bridge)
//  • Tabela DRE compacta (até 10 últimos meses) com cabeçalho vermelho
//    e linhas alternando heatmap simples (sem dados reais aqui — placeholder visual)
//  • Bridge: totais = retângulos pretos cheios; deltas = linha vermelha curta
//    no topo do patamar; valores acima; categorias abaixo
// Para a prévia, omitimos a tabela DRE detalhada (precisaria de pricingRows
// agregados por mês) e mantemos um bloco "DRE (10 últ. meses)" estilizado,
// já que o foco visual da bridge é o waterfall inferior.
// ---------------------------------------------------------------------------
function BridgePvmPreview({ item }: { item: Extract<SlideItem, { kind: "bridge_pvm" }> }) {
  const pricingRows = usePricing((s) => s.rows);
  const budgetRows = useBudget((s) => s.rows);
  const metric = usePricing((s) => s.metric);
  const ready = isItemReady(item);
  const pricingSignature = useMemo(() => getCachedRowsSignature(pricingRows), [pricingRows]);
  const budgetSignature = useMemo(() => getCachedRowsSignature(budgetRows), [budgetRows]);

  const pvm = useMemo(() => {
    if (!ready.ok) return null;
    if (item.config.mode !== "ytd_budget" && (!item.config.base || !item.config.comp)) return null;
    return getOrComputeSlideCalc({
      op: "preview-bridge-pvm",
      slideId: item.id,
      blockId: "bridge-pvm",
      dataSource: item.config.mode === "ytd_budget" ? "budget" : "ke30",
      dataSignature: item.config.mode === "ytd_budget" ? budgetSignature : pricingSignature,
      params: { metric, config: item.config },
    }, () => {
      if (item.config.mode === "ytd_budget") {
        return computeBridgeYtdRealVsBudget(budgetRows, item.config.filters, metric)?.result ?? null;
      }
      const filtered = applyFilters(pricingRows, item.config.filters, null);
      const labels = item.config.mode === "month"
        ? {
            base: (() => {
              const r = filtered.find((x) => x.periodo === item.config.base);
              return r ? monthLabel(r.mes, r.ano) : item.config.base ?? "";
            })(),
            comp: (() => {
              const r = filtered.find((x) => x.periodo === item.config.comp);
              return r ? monthLabel(r.mes, r.ano) : item.config.comp ?? "";
            })(),
          }
        : undefined;
      try { return calcPVM(filtered, metric, item.config.base, item.config.comp, item.config.mode, labels); }
      catch { return null; }
    });
  }, [budgetRows, budgetSignature, pricingRows, pricingSignature, metric, item.id, item.config, ready.ok]);

  if (!ready.ok) return <Frame label="Bridge PVM"><Empty message={ready.reason ?? "Configure o slide."} /></Frame>;
  if (!pvm) return <Frame label="Bridge PVM"><Empty message="Sem dados para os períodos selecionados." /></Frame>;

  return (
    <Frame label="Overview DRE & Bridge">
      <svg viewBox={`0 0 ${SLIDE_W} ${SLIDE_H}`} className="h-full w-full">
        <rect width={SLIDE_W} height={SLIDE_H} fill={C.white} />

        {/* Título */}
        <text x={40} y={62} fontFamily="Calibri" fontSize="42" fontWeight={700} fill={C.haraldRed}>
          OVERVIEW DRE &amp; BRIDGE
        </text>

        {/* Side label DRE */}
        <text x={32} y={267} fontFamily="Calibri" fontSize="28" fontWeight={700} fill={C.haraldRed}
          textAnchor="middle" dominantBaseline="middle"
          transform="rotate(-90 32 267)">DRE</text>

        {/* Tabela DRE — placeholder fiel (cabeçalho vermelho + grade) */}
        <DreTablePreview x={85} y={95} w={1210} h={345} />

        {/* Side label BRIDGE */}
        <text x={25} y={565} fontFamily="Calibri" fontSize="28" fontWeight={700} fill={C.haraldRed}
          textAnchor="middle" dominantBaseline="middle"
          transform="rotate(-90 25 565)">BRIDGE</text>

        {/* Bridge waterfall */}
        <BridgeWaterfall pvm={pvm} x={95} y={495} w={1200} h={140} />

        <HaraldFooterStripe />
      </svg>
    </Frame>
  );
}

function DreTablePreview({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  // Mostra um esqueleto realista: 1 cabeçalho vermelho + 13 linhas alternadas
  const headerH = 22;
  const rows = 13;
  const rowH = (h - headerH) / rows;
  const labelW = 200;
  const cols = 10;
  const dataW = (w - labelW) / cols;

  const cellValues = useMemo(() =>
    Array.from({ length: rows }, (_, ri) =>
      Array.from({ length: cols }, () => {
        if (ri === 2 || ri === 4 || ri === 6 || ri === 9 || ri === 12)
          return (Math.random() * 5 + 1).toFixed(2);
        if (ri === 8) return `${(Math.random() * 5).toFixed(1)}%`;
        return Math.round(Math.random() * 8000 + 500).toLocaleString("pt-BR");
      })
    ),
  []);

  const headers = ["Abr/24", "Mai/24", "Jun/24", "Jul/24", "Ago/24", "Set/24", "Out/24", "Nov/24", "Dez/24", "Jan/25"];
  const labels = [
    "Volume (Tons)", "Receita Operacional Líquida", "ROL (R$/Kg)",
    "Custo Variável", "Custo Variável (R$/Kg)", "Frete sobre Vendas",
    "Frete (R$/Kg)", "Comissão Repres", "Comissão (%/ROL)", "Comissão (R$/Kg)",
    "Contrib. Marginal", "Contrib. Marginal (%/ROL)", "Contrib. Marginal (R$/Kg)",
  ];
  const heatRows = new Set([0, 2, 4, 6, 10, 12]);

  return (
    <g>
      {/* Header */}
      <rect x={x} y={y} width={w} height={headerH} fill={C.haraldRed} />
      <text x={x + 8} y={y + 16} fontFamily="Calibri" fontSize="11" fontWeight={700} fill={C.white}>
        Valores
      </text>
      {headers.map((h, i) => (
        <text key={i} x={x + labelW + dataW * (i + 0.5)} y={y + 16}
          fontFamily="Calibri" fontSize="11" fontWeight={700} fill={C.white} textAnchor="middle">
          {h}
        </text>
      ))}

      {/* Linhas */}
      {labels.map((lab, ri) => {
        const ry = y + headerH + ri * rowH;
        return (
          <g key={ri}>
            <text x={x + 8} y={ry + rowH * 0.65} fontFamily="Calibri" fontSize="10"
              fontWeight={ri === 0 || ri === 10 ? 700 : 400} fill={C.ink}>
              {lab}
            </text>
            {Array.from({ length: cols }).map((_, ci) => {
              const cx = x + labelW + dataW * ci;
              const fill = heatRows.has(ri)
                ? (ci + ri) % 3 === 0 ? C.heatGreen : (ci + ri) % 3 === 1 ? C.heatYellow : "#FCD9A8"
                : C.white;
              return (
                <g key={ci}>
                  <rect x={cx} y={ry} width={dataW} height={rowH} fill={fill} stroke={C.white} strokeWidth={0.5} />
                  <text x={cx + dataW / 2} y={ry + rowH * 0.65} fontFamily="Calibri" fontSize="9.5"
                    fontWeight={ri === 0 || ri === 10 ? 700 : 400} fill={C.ink} textAnchor="middle">
                    {cellValues[ri][ci]}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

function BridgeWaterfall({ pvm, x, y, w, h }: { pvm: PVMResult; x: number; y: number; w: number; h: number }) {
  const steps = [
    { label: `CM ${pvm.baseLabel}`, value: pvm.base, type: "total" as const },
    { label: "Efeito volume", value: pvm.volume, type: "delta" as const },
    { label: "Efeito frete", value: pvm.freight, type: "delta" as const },
    { label: "Efeito comissão", value: pvm.commission, type: "delta" as const },
    { label: "Efeito outros", value: pvm.others, type: "delta" as const },
    { label: "Efeito preço", value: pvm.price, type: "delta" as const },
    { label: "Efeito custo", value: pvm.cost, type: "delta" as const },
    { label: `CM ${pvm.currentLabel}`, value: pvm.current, type: "total" as const },
  ];
  const displaySteps = pvm.commercialCostsCollapsed
    ? [
      steps[0],
      steps[1],
      { label: `Efeito ${pvm.othersLabel ?? "Mix e Resíduo Comercial"}`, value: pvm.others, type: "delta" as const },
      steps[5],
      steps[6],
      steps[7],
    ]
    : steps;

  const geom: { start: number; end: number; value: number; type: "total" | "delta" }[] = [];
  let running = 0;
  displaySteps.forEach((s) => {
    if (s.type === "total") { geom.push({ start: 0, end: s.value, value: s.value, type: "total" }); running = s.value; }
    else { const end = running + s.value; geom.push({ start: running, end, value: s.value, type: "delta" }); running = end; }
  });

  const allVals = geom.flatMap((g) => [g.start, g.end, 0]);
  const minV = Math.min(...allVals), maxV = Math.max(...allVals);
  const range = (maxV - minV) || 1;
  const yMin = minV - range * 0.08;
  const yMax = maxV + range * 0.18;

  const colSlot = w / displaySteps.length;
  const barW = colSlot * 0.42;
  const yOf = (v: number) => y + (1 - (v - yMin) / (yMax - yMin)) * h;

  return (
    <g>
      {geom.map((g, i) => {
    const s = displaySteps[i];
        const cx = x + colSlot * i + colSlot / 2;
        const xBar = cx - barW / 2;
        const isTotal = s.type === "total";
        const yTop = isTotal ? yOf(Math.max(0, g.value)) : yOf(Math.max(g.start, g.end));
        const yBot = isTotal ? yOf(Math.min(0, g.value)) : yOf(Math.max(g.start, g.end)) + 4;
        const valText = isTotal ? fmtIntBR(s.value) : fmtSignedIntBR(s.value);
        return (
          <g key={i}>
            {isTotal ? (
              <rect x={xBar} y={yTop} width={barW} height={Math.max(2, yBot - yTop)} fill={C.black} />
            ) : (
              <rect x={xBar} y={yTop - 2} width={barW} height={4} fill={C.haraldRed} />
            )}
            {/* valor acima */}
            <text x={cx} y={yTop - 5} fontFamily="Calibri" fontSize="13" fontWeight={500}
              fill={C.ink} textAnchor="middle">
              {valText}
            </text>
            {/* label abaixo */}
            <text x={cx} y={y + h + 18} fontFamily="Calibri" fontSize="11"
              fill={C.muted} textAnchor="middle">
              {s.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Wrapper
// ---------------------------------------------------------------------------
// Renderiza o conteúdo do preview (sem o wrapper de expand).
function PreviewContent({ item }: { item: SlideItem }) {
  switch (item.kind) {
    case "cover": return <CoverPreview item={item} />;
    case "bridge_pvm": return <BridgePvmPreview item={item} />;
    case "budget_evo": return <BudgetEvoPreview item={item} />;
    case "custom":
      return <CustomCanvasReadOnly config={item.config} slideId={item.id} />;
  }
}

// Para slides custom o canvas tem dimensões reais (1333x750) e precisa ser
// escalado via transform para caber no painel. Para os SVG (cover/bridge/
// budget) o próprio viewBox cuida disso.
const PREVIEW_W_INSPECTOR = 260;
const PREVIEW_W_DIALOG = 800;
const STATIC_THUMBNAIL_W = 400;
const STATIC_THUMBNAIL_DEBOUNCE_MS = 280;
const MAX_THUMBNAIL_RENDERERS = 1;
const MAX_THUMBNAIL_PIXEL_RATIO = 2;

function recordThumbnailMetric(name: string, id?: string): void {
  if (!isSlidePerfEnabled()) return;
  incrementSlidePerfCounter(name, id);
}

function thumbnailPixelRatio(): number {
  if (typeof window === "undefined") return 1;
  const ratio = Number(window.devicePixelRatio || 1);
  if (!Number.isFinite(ratio) || ratio <= 1) return 1;
  return Math.min(MAX_THUMBNAIL_PIXEL_RATIO, ratio);
}

// "visible": slide dentro da área visível da tira agora — gera imediatamente.
// "preload": slide logo fora da área visível (rootMargin do IntersectionObserver)
//   — gera com prioridade média para já estar pronto quando a pessoa rolar até lá.
// "background": resto do deck — só preenchido em tempo ocioso real (requestIdleCallback).
type ThumbnailPriority = "visible" | "preload" | "background";
type ThumbnailWarmOptions = { useData?: boolean; priority?: ThumbnailPriority };
type ThumbnailWarmResult = "hit" | "generated" | "fallback" | "error";
type ThumbnailQueueJob = {
  key: string;
  item: SlideItem;
  priority: ThumbnailPriority;
  queuedAt: number;
  resolve: (result: ThumbnailWarmResult) => void;
};

const thumbnailQueue: ThumbnailQueueJob[] = [];
const pendingThumbnailJobs = new Map<string, ThumbnailQueueJob>();
const runningThumbnailJobs = new Map<string, Promise<ThumbnailWarmResult>>();
let activeThumbnailRenderers = 0;

function thumbnailPriorityRank(priority: ThumbnailPriority): number {
  if (priority === "visible") return 0;
  if (priority === "preload") return 1;
  return 2;
}

function yieldThumbnailQueueFrame(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function sortThumbnailQueue(): void {
  thumbnailQueue.sort((a, b) => {
    const priority = thumbnailPriorityRank(a.priority) - thumbnailPriorityRank(b.priority);
    return priority !== 0 ? priority : a.queuedAt - b.queuedAt;
  });
}

async function generateSlideThumbnailNow(key: string, item: SlideItem): Promise<ThumbnailWarmResult> {
  markSlideThumbnailRendering(key);
  recordThumbnailMetric("SlideThumbnail:render", item.id);
  try {
    const dataUrl = await renderActualThumbnail(item);
    setSlideThumbnail(key, dataUrl);
    recordThumbnailMetric("SlideThumbnail:ready", item.id);
    return "generated";
  } catch {
    markSlideThumbnailError(key);
    recordThumbnailMetric("SlideThumbnail:error", item.id);
    return "error";
  }
}

function runThumbnailQueue(): void {
  while (activeThumbnailRenderers < MAX_THUMBNAIL_RENDERERS && thumbnailQueue.length > 0) {
    sortThumbnailQueue();
    const job = thumbnailQueue.shift();
    if (!job) return;
    pendingThumbnailJobs.delete(job.key);
    activeThumbnailRenderers += 1;

    const promise = (async () => {
      await yieldThumbnailQueueFrame();
      const result = await generateSlideThumbnailNow(job.key, job.item);
      await yieldThumbnailQueueFrame();
      return result;
    })();

    runningThumbnailJobs.set(job.key, promise);
    void promise
      .then(job.resolve)
      .catch(() => job.resolve("error"))
      .finally(() => {
        runningThumbnailJobs.delete(job.key);
        activeThumbnailRenderers = Math.max(0, activeThumbnailRenderers - 1);
        runThumbnailQueue();
      });
  }
}

function enqueueSlideThumbnail(
  key: string,
  item: SlideItem,
  priority: ThumbnailPriority,
): Promise<ThumbnailWarmResult> {
  const running = runningThumbnailJobs.get(key);
  if (running) return running;

  const pending = pendingThumbnailJobs.get(key);
  if (pending) {
    if (thumbnailPriorityRank(priority) < thumbnailPriorityRank(pending.priority)) {
      pending.priority = priority;
      sortThumbnailQueue();
    }
    return new Promise((resolve) => {
      const previousResolve = pending.resolve;
      pending.resolve = (result) => {
        previousResolve(result);
        resolve(result);
      };
    });
  }

  markSlideThumbnailRendering(key);
  const promise = new Promise<ThumbnailWarmResult>((resolve) => {
    const job: ThumbnailQueueJob = {
      key,
      item,
      priority,
      queuedAt: typeof performance !== "undefined" ? performance.now() : Date.now(),
      resolve,
    };
    pendingThumbnailJobs.set(key, job);
    thumbnailQueue.push(job);
    runThumbnailQueue();
  });
  return promise;
}

const THUMBNAIL_CAPTURE_CSS = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
  }
  .recharts-surface * {
    animation: none !important;
    transition: none !important;
  }
  table, thead, tbody, tr, th, td {
    vertical-align: middle !important;
  }
  th, td {
    line-height: 1.15 !important;
  }
`;

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitForFonts(): Promise<void> {
  try {
    await document.fonts?.ready;
  } catch {
    // Browser font readiness is best-effort for thumbnails.
  }
}

async function waitForImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(images.map((img) => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
    });
  }));
}

function hasRenderableSvgGeometry(root: HTMLElement): boolean {
  const svgs = Array.from(root.querySelectorAll("svg"));
  if (svgs.length === 0) return true;
  return svgs.every((svg) => {
    const box = svg.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return false;
    return !!svg.querySelector(
      "path[d], rect, circle, ellipse, line, polyline, polygon, text, tspan",
    );
  });
}

async function waitForThumbnailPaint(root: HTMLElement): Promise<void> {
  for (let i = 0; i < 30; i += 1) {
    await nextFrame();
    if (hasRenderableSvgGeometry(root)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function captureThumbnailHost(host: HTMLElement): Promise<HTMLCanvasElement> {
  const thumbnailH = Math.round((CANVAS_H / CANVAS_W) * STATIC_THUMBNAIL_W);
  return html2canvas(host, {
    scale: thumbnailPixelRatio(),
    useCORS: true,
    backgroundColor: "#FFFFFF",
    width: STATIC_THUMBNAIL_W,
    height: thumbnailH,
    windowWidth: STATIC_THUMBNAIL_W,
    windowHeight: thumbnailH,
    logging: false,
    ignoreElements: (el) => {
      if (!(el instanceof HTMLElement)) return false;
      return el.dataset.exportHide === "true"
        || el.dataset.html2canvasIgnore === "true";
    },
  });
}

async function renderActualThumbnail(item: SlideItem): Promise<string> {
  const startedAt = isSlidePerfEnabled() && typeof performance !== "undefined" ? performance.now() : 0;
  const thumbnailH = Math.round((CANVAS_H / CANVAS_W) * STATIC_THUMBNAIL_W);
  const host = document.createElement("div");
  host.style.cssText = [
    "position:fixed",
    "left:0",
    `top:-${thumbnailH + 200}px`,
    `width:${STATIC_THUMBNAIL_W}px`,
    `height:${thumbnailH}px`,
    "background:#FFFFFF",
    "overflow:hidden",
    "pointer-events:none",
    "z-index:2147483647",
  ].join(";");
  document.body.appendChild(host);
  const root = createRoot(host);

  try {
    const content = item.kind === "custom"
      ? React.createElement(
          "div",
          {
            style: {
              width: STATIC_THUMBNAIL_W,
              height: thumbnailH,
              position: "relative",
              overflow: "hidden",
              background: "#FFFFFF",
            },
          },
          React.createElement(
            "div",
            {
              style: {
                width: CANVAS_W,
                height: CANVAS_H,
                transform: `scale(${STATIC_THUMBNAIL_W / CANVAS_W})`,
                transformOrigin: "top left",
              },
            },
            React.createElement(CustomCanvasReadOnly, { config: item.config, slideId: item.id }),
          ),
        )
      : React.createElement(
          "div",
          { style: { width: STATIC_THUMBNAIL_W, height: thumbnailH, background: "#FFFFFF", overflow: "hidden" } },
          React.createElement(PreviewContent, { item }),
        );

    flushSync(() => {
      root.render(
        React.createElement(
          SlideFilterProvider,
          { slideKey: `thumbnail:${item.id}` },
          React.createElement("style", null, THUMBNAIL_CAPTURE_CSS),
          content,
        ),
      );
    });

    await waitForFonts();
    await waitForImages(host);
    await waitForThumbnailPaint(host);
    await nextFrame();
    await nextFrame();

    const canvas = await captureThumbnailHost(host);

    if (startedAt) {
      const elapsed = performance.now() - startedAt;
      recordThumbnailMetric("SlideThumbnail:actual", item.id);
      if (elapsed > 16) recordThumbnailMetric("SlideThumbnail:actual:over16ms", item.id);
    }

    return canvas.toDataURL("image/png");
  } finally {
    setTimeout(() => {
      try {
        root.unmount();
      } catch {
        // noop
      }
      host.remove();
    }, 0);
  }
}
function buildSlideThumbnailKeyFromSignatures({
  item,
  pricingMetric,
  pricingSignature,
  budgetSignature,
  forecastSignature,
  rollingSignature,
  useData = true,
}: {
  item: SlideItem;
  pricingMetric: string;
  pricingSignature: string;
  budgetSignature: string;
  forecastSignature: string;
  rollingSignature: string;
  useData?: boolean;
}): string {
  const signature = {
    pricingMetric,
    pricingSignature,
    budgetSignature,
    forecastSignature,
    rollingSignature,
    useData,
    pixelRatio: thumbnailPixelRatio(),
  };
  const cached = slideThumbnailKeyByItem.get(item);
  if (cached && sameThumbnailKeySignature(cached.signature, signature)) return cached.key;
  const key = buildSlideThumbnailKey({
    item,
    pricingMetric,
    pricingSignature,
    budgetSignature,
    forecastSignature,
    rollingSignature,
    thumbnailMode: useData ? "rich" : "light",
    renderWidth: STATIC_THUMBNAIL_W,
    pixelRatio: thumbnailPixelRatio(),
  });
  slideThumbnailKeyByItem.set(item, { signature, key });
  return key;
}

// eslint-disable-next-line react-refresh/only-export-components
export function getSlideThumbnailKeyForItem(item: SlideItem, options?: { useData?: boolean }): string {
  const pricingState = usePricing.getState();
  return buildSlideThumbnailKeyFromSignatures({
    item,
    pricingMetric: pricingState.metric,
    pricingSignature: getCachedRowsSignature(pricingState.rows),
    budgetSignature: getCachedRowsSignature(useBudget.getState().rows),
    forecastSignature: getCachedRowsSignature(useForecast.getState().rows),
    rollingSignature: getCachedRowsSignature(useRolling.getState().rows),
    useData: options?.useData !== false,
  });
}

// eslint-disable-next-line react-refresh/only-export-components
export async function warmSlideThumbnail(
  item: SlideItem,
  options?: ThumbnailWarmOptions,
): Promise<ThumbnailWarmResult> {
  const key = getSlideThumbnailKeyForItem(item, options);
  const current = getSlideThumbnail(key);
  if (current?.status === "ready") {
    recordThumbnailMetric("SlideThumbnail:hit", item.id);
    return "hit";
  }
  const running = runningThumbnailJobs.get(key);
  if (running) return running;
  const priority = options?.priority ?? "background";
  if (current?.status === "rendering" && pendingThumbnailJobs.has(key)) {
    return enqueueSlideThumbnail(key, item, priority);
  }
  if (current?.status === "rendering") return "hit";
  return enqueueSlideThumbnail(key, item, priority);
}

/**
 * Rebaixa a prioridade de um job de miniatura ainda pendente (na fila, mas cuja
 * geração não começou) para "background". Usado quando o slide sai da área
 * visível/pré-carregamento da tira antes de ser processado — evita que uma
 * rolagem rápida deixe uma fila de trabalho obsoleto com prioridade alta.
 * Jobs já em execução (runningThumbnailJobs) não são afetados: cancelar uma
 * captura de DOM em andamento não economiza trabalho e o resultado ainda é
 * útil (fica em cache).
 */
// eslint-disable-next-line react-refresh/only-export-components
export function demoteSlideThumbnailPriority(item: SlideItem, options?: { useData?: boolean }): void {
  const key = getSlideThumbnailKeyForItem(item, options);
  const pending = pendingThumbnailJobs.get(key);
  if (!pending || pending.priority === "background") return;
  pending.priority = "background";
  sortThumbnailQueue();
}

function LiveScaledPreview({ item, targetWidth }: { item: SlideItem; targetWidth?: number }) {
  if (isSlidePerfEnabled()) recordSlideRender("ScaledPreview", item.id);
  const previewW = targetWidth ?? PREVIEW_W_INSPECTOR;

  if (item.kind !== "custom") {
    // SVG previews já escalam via viewBox.
    return (
      <div
        className="overflow-hidden rounded-lg border border-border/40 bg-card"
        style={{ width: previewW, height: (CANVAS_H / CANVAS_W) * previewW }}
      >
        <PreviewContent item={item} />
      </div>
    );
  }

  const factor = previewW / CANVAS_W;
  const previewH = CANVAS_H * factor;
  return (
    <div
      className="overflow-hidden rounded-lg border border-border/40 bg-white"
      style={{ width: previewW, height: previewH, position: "relative" }}
    >
      <div
        style={{
          width: CANVAS_W,
          height: CANVAS_H,
          transform: `scale(${factor})`,
          transformOrigin: "top left",
          position: "absolute",
          top: 0,
          left: 0,
          pointerEvents: "none",
        }}
      >
        <CustomCanvasReadOnly config={item.config} slideId={item.id} />
      </div>
    </div>
  );
}

function SlideThumbnailPlaceholder({ width }: { width: number }) {
  return (
    <div
      aria-hidden
      className="flex items-center justify-center overflow-hidden rounded-lg border border-border/40 bg-muted/35"
      style={{ width, height: (CANVAS_H / CANVAS_W) * width }}
    >
      <div className="h-6 w-24 rounded-full bg-background/60" />
    </div>
  );
}

function useSlideThumbnailKey(item: SlideItem): string {
  const pricingRows = usePricing((s) => s.rows);
  const pricingMetric = usePricing((s) => s.metric);
  const budgetRows = useBudget((s) => s.rows);
  const forecastRows = useForecast((s) => s.rows);
  const rollingRows = useRolling((s) => s.rows);

  const pricingSignature = useMemo(() => getCachedRowsSignature(pricingRows), [pricingRows]);
  const budgetSignature = useMemo(() => getCachedRowsSignature(budgetRows), [budgetRows]);
  const forecastSignature = useMemo(() => getCachedRowsSignature(forecastRows), [forecastRows]);
  const rollingSignature = useMemo(() => getCachedRowsSignature(rollingRows), [rollingRows]);

  return useMemo(
    () => buildSlideThumbnailKeyFromSignatures({
      item,
      pricingMetric,
      pricingSignature,
      budgetSignature,
      forecastSignature,
      rollingSignature,
    }),
    [item, pricingMetric, pricingSignature, budgetSignature, forecastSignature, rollingSignature],
  );
}

function StaticScaledPreview({
  item,
  targetWidth,
  deferUntilVisible = false,
  liveEditingActive = false,
}: {
  item: SlideItem;
  targetWidth?: number;
  deferUntilVisible?: boolean;
  /**
   * true quando este é o slide aberto/ativo no editor no momento — ou seja,
   * a pessoa está digitando/arrastando nele agora. `item.config` (e por
   * tanto a chave da miniatura) muda a cada edição; sem essa flag, cada
   * pausa de digitação disparava uma captura real de DOM (html2canvas) da
   * miniatura da tira, travando/piscando a tela. Com a flag, a miniatura
   * fica congelada na última versão pronta e só é recapturada uma vez,
   * quando a pessoa sai da edição deste slide.
   */
  liveEditingActive?: boolean;
}) {
  if (isSlidePerfEnabled()) recordSlideRender("StaticScaledPreview", item.id);
  const previewW = targetWidth ?? PREVIEW_W_INSPECTOR;
  const previewH = (CANVAS_H / CANVAS_W) * previewW;
  const key = useSlideThumbnailKey(item);
  const current = useSyncExternalStore(
    (listener) => subscribeSlideThumbnail(key, listener),
    () => getSlideThumbnail(key),
    () => getSlideThumbnail(key),
  );

  const lastReadyDataUrlRef = useRef<string | null>(null);
  if (current?.status === "ready" && current.dataUrl) {
    lastReadyDataUrlRef.current = current.dataUrl;
  }

  const wasLiveEditingRef = useRef(liveEditingActive);
  useEffect(() => {
    const wasActive = wasLiveEditingRef.current;
    wasLiveEditingRef.current = liveEditingActive;
    if (wasActive && !liveEditingActive) {
      void warmSlideThumbnail(item, { priority: "visible" });
    }
  }, [liveEditingActive, item]);

  useEffect(() => {
    if (liveEditingActive) return;
    const entry = getSlideThumbnail(key);
    if (entry?.status === "ready" || entry?.status === "rendering" || entry?.status === "error") return;
    if (deferUntilVisible) return;
    const timer = window.setTimeout(async () => {
      await warmSlideThumbnail(item, { priority: "visible" });
    }, STATIC_THUMBNAIL_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [deferUntilVisible, item, key, liveEditingActive]);

  const displayDataUrl = current?.status === "ready" && current.dataUrl
    ? current.dataUrl
    : liveEditingActive
      ? lastReadyDataUrlRef.current
      : null;

  return (
    <>
      {displayDataUrl ? (
        <img
          src={displayDataUrl}
          alt=""
          className="block rounded-lg border border-border/40 bg-white object-cover"
          style={{ width: previewW, height: previewH }}
          draggable={false}
        />
      ) : (
        <SlideThumbnailPlaceholder width={previewW} />
      )}
    </>
  );
}

export function ScaledPreview({
  item,
  targetWidth,
  mode = "static",
  deferUntilVisible = false,
  liveEditingActive = false,
}: {
  item: SlideItem;
  targetWidth?: number;
  mode?: "static" | "live";
  deferUntilVisible?: boolean;
  liveEditingActive?: boolean;
}) {
  if (mode === "live") return <LiveScaledPreview item={item} targetWidth={targetWidth} />;
  return (
    <StaticScaledPreview
      item={item}
      targetWidth={targetWidth}
      deferUntilVisible={deferUntilVisible}
      liveEditingActive={liveEditingActive}
    />
  );
}

// ---------------------------------------------------------------------------
// Wrapper público — preview + botão de expandir
// ---------------------------------------------------------------------------
export function SlidePreview({ item }: { item: SlideItem }) {
  const [expanded, setExpanded] = useState(false);
  const title = item.label ?? "Slide";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Prévia
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded(true)}
          aria-label="Expandir prévia"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          Expandir
        </Button>
      </div>
      <ScaledPreview item={item} />

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-[860px] p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/40">
            <DialogTitle className="text-sm font-semibold">{title}</DialogTitle>
          </DialogHeader>
          <div className="p-5">
            <ScaledPreview item={item} targetWidth={800} mode="live" />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
