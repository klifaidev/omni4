// Slide live preview — réplica visual fiel aos slides exportados em PPT.
// Renderiza um SVG miniatura usando o mesmo sistema de coordenadas
// (inches × 100 → viewBox 1333×750, equivalente ao layout LAYOUT_WIDE 13.33"×7.5").
// Espelha exatamente: cores, posições, fontes (proporcionalmente), curvas suaves
// para o Budget Evo (Overview CM/VOL) e bridge waterfall com retângulos pretos
// (totais) + linha vermelha curta (deltas) + labels abaixo.
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { applyFilters, calcPVM, type PVMResult } from "@/lib/analytics";
import { computeBudgetEvoMonthly, isItemReady, type SlideItem } from "@/lib/slidesFlow";
import { monthLabel } from "@/lib/format";
import { usePricing } from "@/store/pricing";
import { useBudget } from "@/store/budget";
import { useForecast } from "@/store/forecast";
import { useRolling } from "@/store/rolling";
import { AlertCircle, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CANVAS_W,
  CANVAS_H,
  isMeasureAvailable,
  type BlockDataSource,
  type ChartBlock,
  type CustomBlock,
  type KpiBlock,
  type ShapeBlock,
  type TextBlock,
  type TitleBlock,
} from "@/lib/customSlide";
import type { PricingRow } from "@/lib/types";
import { budgetRowsAsPricingFiltered } from "@/lib/budgetAdapter";
import { forecastRowsAsPricingLatest } from "@/lib/forecastAdapter";
import { rollingRowsAsPricing } from "@/lib/rollingAdapter";
import { computeChartSeries, computeKpiBlock } from "@/lib/customKpi";
import { CustomCanvasReadOnly } from "@/components/pricing/custom/PresentationMode";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { localDataMissingMessage } from "@/lib/slideLocalDataStatus";
import { incrementSlidePerfCounter, isSlidePerfEnabled, recordSlideRender } from "@/lib/slidesPerfCounters";
import { getCachedRowsSignature, getOrComputeSlideCalc } from "@/lib/slideCalcCache";
import {
  buildSlideThumbnailKey,
  getSlideThumbnail,
  markSlideThumbnailError,
  markSlideThumbnailRendering,
  setSlideThumbnail,
  subscribeSlideThumbnail,
} from "@/lib/slideThumbnailCache";

// ---------------------------------------------------------------------------
// Tokens (espelhando PPT_COLORS de exportPpt.ts)
// ---------------------------------------------------------------------------
const C = {
  haraldRed: "#C8102E",
  ink: "#1C2430",
  muted: "#667085",
  black: "#000000",
  white: "#FFFFFF",
  heatGreen: "#A6D89A",
  heatYellow: "#F8E78D",
};

// Sistema de coordenadas: inches × 100  → viewBox 1333 × 750
const SLIDE_W = 1333;
const SLIDE_H = 750;
type PreviewDataRow = Record<string, number | string | null | undefined>;

// ---------------------------------------------------------------------------
// Format helpers (idênticos ao slide)
// ---------------------------------------------------------------------------
const fmtIntBR = (v: number) => (!isFinite(v) || v === 0 ? "0" : Math.round(v).toLocaleString("pt-BR"));
const fmtSignedIntBR = (v: number) => {
  if (!isFinite(v) || Math.round(v) === 0) return "0";
  const r = Math.round(v);
  return r < 0 ? `-${Math.abs(r).toLocaleString("pt-BR")}` : r.toLocaleString("pt-BR");
};
const fmtDecimalBR = (v: number, d = 2) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPctBR = (v: number, d = 1) =>
  `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d })}%`;

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

  const accum = data
    .filter((m) => m.realCm !== 0 || m.realVol !== 0)
    .reduce(
      (a, m) => ({ cm: a.cm + (m.realCm - m.budCm), vol: a.vol + (m.realVol - m.budVol) }),
      { cm: 0, vol: 0 },
    );

  return (
    <Frame label="Overview CM/VOL">
      <svg viewBox={`0 0 ${SLIDE_W} ${SLIDE_H}`} className="h-full w-full">
        <rect width={SLIDE_W} height={SLIDE_H} fill={C.white} />
        {/* Título + barra vermelha decorativa */}
        <text x={40} y={58} fontFamily="Calibri" fontSize="52" fontWeight={700} fill={C.ink}>
          Overview CM/VOL
        </text>
        <rect x={40} y={68} width={340} height={3} fill={C.haraldRed} rx={1} />

        {/* Legenda REAL / BUDGET — canto superior direito */}
        <g transform="translate(1050 30)">
          <rect width={22} height={10} fill={C.haraldRed} rx={2} />
          <text x={30} y={10} fontFamily="Calibri" fontSize="14" fontWeight={700} fill={C.haraldRed}>REAL</text>
          <rect x={100} width={22} height={4} fill={C.black} rx={1} />
          <rect x={110} y={3} width={0} height={4} fill={C.black} />
          <line x1={100} y1={5} x2={122} y2={5} stroke={C.black} strokeWidth={5} strokeDasharray="6,4" />
          <text x={130} y={10} fontFamily="Calibri" fontSize="14" fontWeight={700} fill={C.black}>BUDGET</text>
        </g>

        {/* 4 linhas com separadores */}
        <LineRow y={95} title="CM ABS" headerNote={fmtSignedIntBR(accum.cm)}
          data={data} realKey="realCm" budKey="budCm" fmt={(v) => fmtIntBR(v)}
          deltaFmt={(v) => (v >= 0 ? "+" : "") + fmtIntBR(v / 1000) + " Mi"} />
        <line x1={35} y1={95 + 135} x2={1295} y2={95 + 135} stroke="#E2E8F0" strokeWidth={1} />
        <LineRow y={95 + 135} title="CM/%" data={data}
          realKey="realCmPct" budKey="budCmPct" fmt={(v) => fmtPctBR(v, 1)} />
        <line x1={35} y1={95 + 135 * 2} x2={1295} y2={95 + 135 * 2} stroke="#E2E8F0" strokeWidth={1} />
        <LineRow y={95 + 135 * 2} title="CM/Kg" data={data}
          realKey="realCmKg" budKey="budCmKg" fmt={(v) => fmtDecimalBR(v, 2)} />
        <line x1={35} y1={95 + 135 * 3} x2={1295} y2={95 + 135 * 3} stroke="#E2E8F0" strokeWidth={1} />
        <VolBarsRow y={95 + 135 * 3} data={data} accumGapTons={accum.vol} />

        <HaraldFooterStripe />
      </svg>
    </Frame>
  );
}

function LineRow({
  y, title, headerNote, data, realKey, budKey, fmt, deltaFmt,
}: {
  y: number;
  title: string;
  headerNote?: string;
  data: PreviewDataRow[];
  realKey: string;
  budKey: string;
  fmt: (v: number) => string;
  deltaFmt?: (delta: number) => string;
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

  const realPts: { x: number; y: number }[] = [];
  const budPts: { x: number; y: number }[] = [];
  data.forEach((r, i) => {
    const a = r[realKey], b = r[budKey];
    if (a != null && isFinite(a)) realPts.push({ x: xOf(i), y: yOf(a) });
    if (b != null && isFinite(b)) budPts.push({ x: xOf(i), y: yOf(b) });
  });

  // Separador vertical Real / Budget
  const sepColIdx = data.findIndex((r) => {
    const rv = r[realKey]; const bv = r[budKey];
    return (rv == null || rv === 0) && bv != null && bv !== 0;
  });
  const hasSep = sepColIdx > 0;
  const sepX = hasSep ? plotX + (sepColIdx - 0.5) * colW : 0;
  let deltaLabel = "";
  let deltaColor = C.haraldRed;
  if (hasSep && deltaFmt) {
    const totalReal = data.reduce((s, r) => { const v = r[realKey]; return typeof v === "number" && v > 0 ? s + v : s; }, 0);
    const totalBud  = data.reduce((s, r) => { const v = r[budKey];  return typeof v === "number" && v > 0 ? s + v : s; }, 0);
    const delta = totalReal - totalBud;
    deltaLabel = deltaFmt(delta);
    deltaColor = delta >= 0 ? "#16A34A" : C.haraldRed;
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

      {/* Header note (right) */}
      {headerNote && (
        <text x={x + w * 0.78} y={y - 2} fontFamily="Calibri" fontSize="14" fontWeight={700}
          fill={C.haraldRed} textAnchor="middle">
          {headerNote}
        </text>
      )}

      {/* Curves */}
      <path d={smoothPathD(realPts)} stroke={C.haraldRed} strokeWidth={7} fill="none"
        strokeLinecap="round" strokeLinejoin="round" />
      <path d={smoothPathD(budPts)} stroke={C.black} strokeWidth={5} fill="none"
        strokeLinecap="round" strokeLinejoin="round" strokeDasharray="14,8" />

      {/* Separador vertical Real / Budget + nota de variação */}
      {hasSep && (
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
        if (a != null && isFinite(a) && a !== 0) items.push({ v: a, color: C.haraldRed });
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
    </g>
  );
}

function VolBarsRow({ y, data, accumGapTons }: { y: number; data: PreviewDataRow[]; accumGapTons: number }) {
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

  // Separador vertical Real / Budget + nota de variação em volume
  const sepColIdxV = data.findIndex((r) => r.realVol === 0 && typeof r.budVol === "number" && r.budVol > 0);
  const hasSepV = sepColIdxV > 0;
  const sepXV = hasSepV ? plotX + (sepColIdxV - 0.5) * colW : 0;
  const volDeltaLabel = (accumGapTons >= 0 ? "+" : "-") + fmtIntBR(Math.abs(accumGapTons)) + " Tons";
  const volDeltaColor = accumGapTons >= 0 ? "#16A34A" : C.haraldRed;

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
      <text x={x + w * 0.78} y={y - 2} fontFamily="Calibri" fontSize="16" fontWeight={700}
        fill={C.haraldRed} textAnchor="middle">
        {`${accumGapTons.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} Tons`}
      </text>

      {data.map((r, i) => {
        const cx = plotX + colW * (i + 0.5);
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
              transform={`rotate(-35, ${cx}, ${y + h - 8})`}
              x={cx} y={y + h - 8}
              fontFamily="Calibri" fontSize="11" fontWeight={700}
              fill={C.muted} textAnchor="end">
              {r.label}
            </text>
          </g>
        );
      })}

      {/* Separador vertical Real / Budget + nota de variação */}
      {hasSepV && (
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
      <g transform={`translate(${plotX + plotW - 180} ${y + h + 8})`}>
        <rect width={18} height={10} fill={C.haraldRed} />
        <text x={26} y={9} fontFamily="Calibri" fontSize="11" fontWeight={700} fill={C.ink}>REAL</text>
        <rect x={80} width={18} height={10} fill={C.black} />
        <text x={106} y={9} fontFamily="Calibri" fontSize="11" fontWeight={700} fill={C.ink}>BUDGET</text>
      </g>
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
  const metric = usePricing((s) => s.metric);
  const ready = isItemReady(item);
  const pricingSignature = useMemo(() => getCachedRowsSignature(pricingRows), [pricingRows]);

  const pvm = useMemo(() => {
    if (!ready.ok || !item.config.base || !item.config.comp) return null;
    return getOrComputeSlideCalc({
      op: "preview-bridge-pvm",
      slideId: item.id,
      blockId: "bridge-pvm",
      dataSource: "ke30",
      dataSignature: pricingSignature,
      params: { metric, config: item.config },
    }, () => {
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
  }, [pricingRows, pricingSignature, metric, item.id, item.config, ready.ok]);

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

  const geom: { start: number; end: number; value: number; type: "total" | "delta" }[] = [];
  let running = 0;
  steps.forEach((s) => {
    if (s.type === "total") { geom.push({ start: 0, end: s.value, value: s.value, type: "total" }); running = s.value; }
    else { const end = running + s.value; geom.push({ start: running, end, value: s.value, type: "delta" }); running = end; }
  });

  const allVals = geom.flatMap((g) => [g.start, g.end, 0]);
  const minV = Math.min(...allVals), maxV = Math.max(...allVals);
  const range = (maxV - minV) || 1;
  const yMin = minV - range * 0.08;
  const yMax = maxV + range * 0.18;

  const colSlot = w / steps.length;
  const barW = colSlot * 0.42;
  const yOf = (v: number) => y + (1 - (v - yMin) / (yMax - yMin)) * h;

  return (
    <g>
      {geom.map((g, i) => {
        const s = steps[i];
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
const LIGHTWEIGHT_THUMBNAIL_MAX_W = 128;
const STATIC_THUMBNAIL_DEBOUNCE_MS = 280;

function recordThumbnailMetric(name: string, id?: string): void {
  if (!isSlidePerfEnabled()) return;
  incrementSlidePerfCounter(name, id);
}

type ThumbnailRect = { x: number; y: number; w: number; h: number };
type ChartSeriesForThumbnail = ReturnType<typeof computeChartSeries>;

const THUMB_COLORS = {
  border: "#d8dee8",
  softBorder: "#e7ebf2",
  panel: "#ffffff",
  panelAlt: "#f8fafc",
  ink: "#182230",
  muted: "#667085",
  red: "#C8102E",
  blue: "#2f6fed",
  green: "#16a34a",
  amber: "#d97706",
  violet: "#7c3aed",
  teal: "#0f766e",
};

const THUMB_SERIES_COLORS = [
  THUMB_COLORS.red,
  THUMB_COLORS.blue,
  THUMB_COLORS.green,
  THUMB_COLORS.amber,
  THUMB_COLORS.violet,
  THUMB_COLORS.teal,
];

function normalizeCanvasColor(value: string | undefined, fallback: string): string {
  if (!value || value === "transparent") return fallback;
  if (value.startsWith("#") || value.startsWith("rgb")) return value;
  return `#${value}`;
}

function clampRect(rect: ThumbnailRect, canvas: HTMLCanvasElement): ThumbnailRect {
  const x = Math.max(0, Math.min(canvas.width, rect.x));
  const y = Math.max(0, Math.min(canvas.height, rect.y));
  return {
    x,
    y,
    w: Math.max(0, Math.min(canvas.width - x, rect.w)),
    h: Math.max(0, Math.min(canvas.height - y, rect.h)),
  };
}

function blockRect(block: CustomBlock, sx: number, sy: number, canvas: HTMLCanvasElement): ThumbnailRect {
  return clampRect({ x: block.x * sx, y: block.y * sy, w: block.w * sx, h: block.h * sy }, canvas);
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  rect: ThumbnailRect,
  radius: number,
  fill: string,
  stroke?: string,
) {
  const r = Math.max(0, Math.min(radius, rect.w / 2, rect.h / 2));
  ctx.beginPath();
  ctx.moveTo(rect.x + r, rect.y);
  ctx.lineTo(rect.x + rect.w - r, rect.y);
  ctx.quadraticCurveTo(rect.x + rect.w, rect.y, rect.x + rect.w, rect.y + r);
  ctx.lineTo(rect.x + rect.w, rect.y + rect.h - r);
  ctx.quadraticCurveTo(rect.x + rect.w, rect.y + rect.h, rect.x + rect.w - r, rect.y + rect.h);
  ctx.lineTo(rect.x + r, rect.y + rect.h);
  ctx.quadraticCurveTo(rect.x, rect.y + rect.h, rect.x, rect.y + rect.h - r);
  ctx.lineTo(rect.x, rect.y + r);
  ctx.quadraticCurveTo(rect.x, rect.y, rect.x + r, rect.y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function ellipsizeCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(`${text.slice(0, mid)}...`).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo).trimEnd()}...`;
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    if (lines.length >= maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines) {
    lines[maxLines - 1] = ellipsizeCanvasText(ctx, lines[maxLines - 1], maxWidth);
  }
  return lines;
}

function drawWrappedCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  rect: ThumbnailRect,
  options: { font: string; color: string; lineHeight: number; align?: CanvasTextAlign; maxLines?: number },
) {
  const padding = Math.max(4, Math.min(10, rect.w * 0.06));
  const maxWidth = Math.max(0, rect.w - padding * 2);
  const maxLines = options.maxLines ?? Math.max(1, Math.floor((rect.h - padding * 2) / options.lineHeight));
  ctx.save();
  ctx.font = options.font;
  ctx.fillStyle = options.color;
  ctx.textBaseline = "top";
  ctx.textAlign = options.align ?? "left";
  const lines = wrapCanvasText(ctx, text, maxWidth, maxLines);
  const baseX = options.align === "center" ? rect.x + rect.w / 2 : options.align === "right" ? rect.x + rect.w - padding : rect.x + padding;
  lines.forEach((line, index) => {
    ctx.fillText(line, baseX, rect.y + padding + index * options.lineHeight);
  });
  ctx.restore();
}

function rowsForThumbnailDataSource(dataSource: BlockDataSource | undefined): PricingRow[] {
  const pricing = usePricing.getState().rows;
  if (!dataSource || dataSource === "ke30") return pricing;
  if (dataSource === "budget") return budgetRowsAsPricingFiltered(useBudget.getState().rows, "budget");
  if (dataSource === "budget_real") return budgetRowsAsPricingFiltered(useBudget.getState().rows, "real");
  if (dataSource === "forecast") return forecastRowsAsPricingLatest(useForecast.getState().rows);
  if (dataSource === "rolling") return rollingRowsAsPricing(useRolling.getState().rows);
  return pricing;
}

function fallbackChartMeasure(block: ChartBlock) {
  return isMeasureAvailable(block.measure, block.dataSource)
    ? block.measure
    : block.dataSource === "forecast"
      ? "volume"
      : "rol";
}

function getThumbnailChartSeries(slideId: string, block: ChartBlock): ChartSeriesForThumbnail | null {
  const rows = rowsForThumbnailDataSource(block.dataSource);
  if (!rows.length) return null;
  const measure = fallbackChartMeasure(block);
  const xDim = block.fieldWells?.xDim ?? null;
  const seriesDim = block.fieldWells?.colorDim ?? block.breakdown;
  try {
    return getOrComputeSlideCalc({
      op: "thumbnail-chart-series",
      slideId,
      blockId: block.id,
      dataSource: block.dataSource,
      dataSignature: getCachedRowsSignature(rows),
      params: { filters: block.filters, measure, seriesDim, xDim, chartType: block.chartType },
    }, () => computeChartSeries(rows, block.filters, measure, seriesDim, xDim));
  } catch {
    return null;
  }
}

function getThumbnailKpiValue(block: KpiBlock): string {
  if (block.source === "manual") return block.manualValue?.trim() || "-";
  const rows = rowsForThumbnailDataSource(block.dataSource);
  if (!rows.length) return "-";
  try {
    return getOrComputeSlideCalc({
      op: "thumbnail-kpi",
      blockId: block.id,
      dataSource: block.dataSource,
      dataSignature: getCachedRowsSignature(rows),
      params: {
        filters: block.filters,
        measure: block.measure,
        periodMode: block.periodMode,
        periodValue: block.periodValue,
        format: block.format,
      },
    }, () => computeKpiBlock(rows, block));
  } catch {
    return "-";
  }
}

function drawTextThumbnailBlock(
  ctx: CanvasRenderingContext2D,
  block: TitleBlock | TextBlock,
  rect: ThumbnailRect,
  sx: number,
) {
  const bg = normalizeCanvasColor(block.backgroundColor, "transparent");
  if (bg !== "transparent") {
    drawRoundedRect(ctx, rect, Math.max(0, (block.borderRadius ?? 0) * sx), bg);
  }
  const fontPx = Math.max(block.kind === "title" ? 10 : 8, Math.min(28, block.size * sx));
  const weight = block.kind === "title" && block.bold ? "700" : block.kind === "title" ? "600" : "400";
  drawWrappedCanvasText(ctx, block.text || (block.kind === "title" ? "Titulo" : "Texto"), rect, {
    font: `${block.italic ? "italic " : ""}${weight} ${fontPx}px ${block.fontFamily || "Calibri, Arial"}`,
    color: normalizeCanvasColor(block.color, THUMB_COLORS.ink),
    lineHeight: Math.max(10, fontPx * (block.lineHeight ?? 1.12)),
    align: block.align,
  });
}

function drawKpiThumbnailBlock(ctx: CanvasRenderingContext2D, block: KpiBlock, rect: ThumbnailRect) {
  drawRoundedRect(ctx, rect, 8, normalizeCanvasColor(block.cardBg, THUMB_COLORS.panelAlt), THUMB_COLORS.softBorder);
  const value = getThumbnailKpiValue(block);
  const valuePx = Math.max(13, Math.min(32, rect.h * 0.34));
  ctx.save();
  ctx.fillStyle = THUMB_COLORS.muted;
  ctx.font = "600 9px Calibri, Arial";
  ctx.textBaseline = "top";
  ctx.fillText(ellipsizeCanvasText(ctx, block.label || "KPI", Math.max(20, rect.w - 14)), rect.x + 7, rect.y + 7);
  ctx.fillStyle = normalizeCanvasColor(block.color, THUMB_COLORS.red);
  ctx.font = `700 ${valuePx}px Calibri, Arial`;
  ctx.fillText(ellipsizeCanvasText(ctx, value, Math.max(20, rect.w - 14)), rect.x + 7, rect.y + Math.max(20, rect.h * 0.38));
  ctx.restore();
}

function flattenChartValues(data: ChartSeriesForThumbnail): number[] {
  return data.series.flatMap((series) => series.values).filter((value) => Number.isFinite(value));
}

function drawChartAxes(ctx: CanvasRenderingContext2D, rect: ThumbnailRect) {
  ctx.strokeStyle = THUMB_COLORS.softBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(rect.x + 10, rect.y + rect.h - 15);
  ctx.lineTo(rect.x + rect.w - 8, rect.y + rect.h - 15);
  ctx.moveTo(rect.x + 10, rect.y + 20);
  ctx.lineTo(rect.x + 10, rect.y + rect.h - 15);
  ctx.stroke();
}

function drawFallbackChartSkeleton(ctx: CanvasRenderingContext2D, rect: ThumbnailRect, type: ChartBlock["chartType"]) {
  drawChartAxes(ctx, rect);
  const plot = { x: rect.x + 14, y: rect.y + 24, w: Math.max(10, rect.w - 28), h: Math.max(10, rect.h - 44) };
  if (type === "line" || type === "area" || type === "combo") {
    ctx.strokeStyle = THUMB_COLORS.red;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const x = plot.x + (plot.w / 5) * i;
      const y = plot.y + plot.h * (0.75 - Math.sin(i * 0.9) * 0.22);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    return;
  }
  for (let i = 0; i < 5; i += 1) {
    const barH = plot.h * (0.25 + ((i * 17) % 50) / 100);
    ctx.fillStyle = THUMB_SERIES_COLORS[i % THUMB_SERIES_COLORS.length];
    ctx.fillRect(plot.x + i * (plot.w / 5) + 2, plot.y + plot.h - barH, Math.max(3, plot.w / 8), barH);
  }
}

function drawBarsThumbnail(ctx: CanvasRenderingContext2D, rect: ThumbnailRect, values: number[]) {
  const plot = { x: rect.x + 14, y: rect.y + 24, w: Math.max(10, rect.w - 28), h: Math.max(10, rect.h - 44) };
  const shown = values.slice(0, 8);
  const maxAbs = Math.max(1, ...shown.map((v) => Math.abs(v)));
  const slot = plot.w / Math.max(1, shown.length);
  shown.forEach((value, index) => {
    const barH = Math.max(2, (Math.abs(value) / maxAbs) * plot.h);
    ctx.fillStyle = THUMB_SERIES_COLORS[index % THUMB_SERIES_COLORS.length];
    ctx.fillRect(plot.x + index * slot + slot * 0.2, plot.y + plot.h - barH, Math.max(3, slot * 0.55), barH);
  });
}

function drawLineThumbnail(ctx: CanvasRenderingContext2D, rect: ThumbnailRect, data: ChartSeriesForThumbnail, fillArea = false) {
  const plot = { x: rect.x + 14, y: rect.y + 24, w: Math.max(10, rect.w - 28), h: Math.max(10, rect.h - 44) };
  const values = flattenChartValues(data);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;
  data.series.slice(0, 3).forEach((series, seriesIndex) => {
    const valuesForSeries = series.values.slice(0, 12);
    if (valuesForSeries.length < 2) return;
    ctx.beginPath();
    valuesForSeries.forEach((value, index) => {
      const x = plot.x + (plot.w / Math.max(1, valuesForSeries.length - 1)) * index;
      const y = plot.y + plot.h - ((value - min) / range) * plot.h;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    if (fillArea) {
      ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
      ctx.lineTo(plot.x, plot.y + plot.h);
      ctx.closePath();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = THUMB_SERIES_COLORS[seriesIndex % THUMB_SERIES_COLORS.length];
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = THUMB_SERIES_COLORS[seriesIndex % THUMB_SERIES_COLORS.length];
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

function drawPieThumbnail(ctx: CanvasRenderingContext2D, rect: ThumbnailRect, values: number[], donut: boolean) {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2 + 4;
  const r = Math.max(8, Math.min(rect.w, rect.h) * 0.28);
  const shown = values.slice(0, 5).map((value) => Math.abs(value)).filter((value) => value > 0);
  const total = shown.reduce((sum, value) => sum + value, 0) || 1;
  let angle = -Math.PI / 2;
  shown.forEach((value, index) => {
    const next = angle + (value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angle, next);
    ctx.closePath();
    ctx.fillStyle = THUMB_SERIES_COLORS[index % THUMB_SERIES_COLORS.length];
    ctx.fill();
    angle = next;
  });
  if (donut) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = THUMB_COLORS.panel;
    ctx.fill();
  }
}

function drawChartThumbnailBlock(ctx: CanvasRenderingContext2D, slideId: string, block: ChartBlock, rect: ThumbnailRect) {
  drawRoundedRect(ctx, rect, 8, "#f8fbff", "#d7e3f8");
  ctx.save();
  ctx.fillStyle = THUMB_COLORS.ink;
  ctx.font = "600 9px Calibri, Arial";
  ctx.textBaseline = "top";
  const title = block.title?.trim() || "Grafico";
  ctx.fillText(ellipsizeCanvasText(ctx, title, Math.max(20, rect.w - 16)), rect.x + 8, rect.y + 7);

  const data = getThumbnailChartSeries(slideId, block);
  if (!data || data.series.length === 0 || flattenChartValues(data).length === 0) {
    drawFallbackChartSkeleton(ctx, rect, block.chartType);
    ctx.restore();
    return;
  }

  drawChartAxes(ctx, rect);
  const values = data.series.length > 1
    ? data.series.map((series) => series.values.reduce((sum, value) => sum + value, 0))
    : data.series[0].values;
  if (block.chartType === "line" || block.chartType === "combo") drawLineThumbnail(ctx, rect, data);
  else if (block.chartType === "area" || block.chartType === "stackedArea") drawLineThumbnail(ctx, rect, data, true);
  else if (block.chartType === "pie" || block.chartType === "donut") drawPieThumbnail(ctx, rect, values, block.chartType === "donut");
  else drawBarsThumbnail(ctx, rect, values);
  ctx.restore();
}

function drawShapeThumbnailBlock(ctx: CanvasRenderingContext2D, block: ShapeBlock, rect: ThumbnailRect, sx: number) {
  const fill = normalizeCanvasColor(block.fill, "#f8fafc");
  const stroke = normalizeCanvasColor(block.strokeColor, THUMB_COLORS.border);
  ctx.save();
  ctx.globalAlpha = block.fillOpacity != null ? Math.max(0, Math.min(1, block.fillOpacity / 100)) : 1;
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(1, (block.strokeWidth ?? 1) * sx);
  if (block.shape === "circle" || block.shape === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w / 2, rect.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (block.shape === "line" || block.shape === "dashed-line" || block.shape === "arrow" || block.shape === "double-arrow") {
    ctx.globalAlpha = 1;
    if (block.shape === "dashed-line") ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(rect.x, rect.y + rect.h / 2);
    ctx.lineTo(rect.x + rect.w, rect.y + rect.h / 2);
    ctx.stroke();
  } else if (block.shape === "triangle" || block.shape === "right-triangle") {
    ctx.beginPath();
    ctx.moveTo(rect.x + rect.w / 2, rect.y);
    ctx.lineTo(rect.x + rect.w, rect.y + rect.h);
    ctx.lineTo(rect.x, rect.y + rect.h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    drawRoundedRect(ctx, rect, block.shape === "roundRect" ? 8 : 2, fill, stroke);
  }
  ctx.restore();
}

function drawImageThumbnailBlock(ctx: CanvasRenderingContext2D, rect: ThumbnailRect) {
  drawRoundedRect(ctx, rect, 6, "#f8fafc", THUMB_COLORS.border);
  ctx.save();
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 1.5;
  const pad = Math.max(6, Math.min(12, rect.w * 0.1));
  ctx.strokeRect(rect.x + pad, rect.y + pad, Math.max(8, rect.w - pad * 2), Math.max(8, rect.h - pad * 2));
  ctx.beginPath();
  ctx.moveTo(rect.x + pad + 5, rect.y + rect.h - pad - 6);
  ctx.lineTo(rect.x + rect.w * 0.45, rect.y + rect.h * 0.55);
  ctx.lineTo(rect.x + rect.w - pad - 5, rect.y + rect.h - pad - 6);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(rect.x + rect.w - pad - 10, rect.y + pad + 10, 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawTableThumbnailBlock(ctx: CanvasRenderingContext2D, rect: ThumbnailRect) {
  drawRoundedRect(ctx, rect, 6, THUMB_COLORS.panel, THUMB_COLORS.border);
  const rows = 4;
  const cols = 3;
  const pad = 7;
  const top = rect.y + pad;
  const left = rect.x + pad;
  const cellW = Math.max(8, (rect.w - pad * 2) / cols);
  const cellH = Math.max(6, (rect.h - pad * 2) / rows);
  ctx.fillStyle = "#eef2f7";
  ctx.fillRect(left, top, cellW * cols, cellH);
  ctx.strokeStyle = THUMB_COLORS.softBorder;
  ctx.lineWidth = 1;
  for (let i = 0; i <= rows; i += 1) {
    ctx.beginPath();
    ctx.moveTo(left, top + i * cellH);
    ctx.lineTo(left + cellW * cols, top + i * cellH);
    ctx.stroke();
  }
  for (let i = 0; i <= cols; i += 1) {
    ctx.beginPath();
    ctx.moveTo(left + i * cellW, top);
    ctx.lineTo(left + i * cellW, top + cellH * rows);
    ctx.stroke();
  }
}

function drawGenericAnalyticsBlock(ctx: CanvasRenderingContext2D, block: CustomBlock, rect: ThumbnailRect) {
  drawRoundedRect(ctx, rect, 8, THUMB_COLORS.panelAlt, THUMB_COLORS.border);
  ctx.save();
  ctx.fillStyle = THUMB_COLORS.muted;
  ctx.font = "600 8px Calibri, Arial";
  ctx.textBaseline = "top";
  const label = block.kind.replace(/^omni_/, "").replaceAll("_", " ");
  ctx.fillText(ellipsizeCanvasText(ctx, label, Math.max(20, rect.w - 14)), rect.x + 7, rect.y + 7);
  drawFallbackChartSkeleton(ctx, rect, "bar");
  ctx.restore();
}

function drawCustomThumbnailBlock(
  ctx: CanvasRenderingContext2D,
  slideId: string,
  block: CustomBlock,
  rect: ThumbnailRect,
  sx: number,
) {
  if (rect.w < 3 || rect.h < 3) return;
  if (block.kind === "title" || block.kind === "text") drawTextThumbnailBlock(ctx, block, rect, sx);
  else if (block.kind === "kpi") drawKpiThumbnailBlock(ctx, block, rect);
  else if (block.kind === "chart") drawChartThumbnailBlock(ctx, slideId, block, rect);
  else if (block.kind === "shape") drawShapeThumbnailBlock(ctx, block, rect, sx);
  else if (block.kind === "image") drawImageThumbnailBlock(ctx, rect);
  else if (block.kind === "table" || block.kind === "dre") drawTableThumbnailBlock(ctx, rect);
  else if (block.kind === "bridge") {
    drawRoundedRect(ctx, rect, 8, THUMB_COLORS.panel, THUMB_COLORS.border);
    drawFallbackChartSkeleton(ctx, rect, "waterfall");
  } else if (block.kind === "topSku") {
    drawRoundedRect(ctx, rect, 8, THUMB_COLORS.panel, THUMB_COLORS.border);
    drawBarsThumbnail(ctx, rect, [9, 7, 5, 4, 3]);
  } else drawGenericAnalyticsBlock(ctx, block, rect);
}

function renderFallbackThumbnail(item: SlideItem): string {
  const startedAt = isSlidePerfEnabled() && typeof performance !== "undefined" ? performance.now() : 0;
  const canvas = document.createElement("canvas");
  canvas.width = STATIC_THUMBNAIL_W;
  canvas.height = Math.round((CANVAS_H / CANVAS_W) * STATIC_THUMBNAIL_W);
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const sx = canvas.width / CANVAS_W;
  const sy = canvas.height / CANVAS_H;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#e2e8f0";
  ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);

  if (item.kind === "cover") {
    const isDivider = item.config.variant === "divider";
    ctx.fillStyle = isDivider ? "#ffffff" : "#C8102E";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = isDivider ? "#1C2430" : "#ffffff";
    ctx.font = "700 22px Calibri, Arial";
    ctx.fillText(item.config.title || "Titulo do slide", 18, canvas.height / 2);
    ctx.font = "12px Calibri, Arial";
    ctx.fillStyle = isDivider ? "#667085" : "rgba(255,255,255,0.82)";
    ctx.fillText(item.config.subtitle || "Apresentacao", 18, canvas.height / 2 + 22);
  } else if (item.kind === "custom") {
    const bg = item.config.background;
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    const blocks = [...item.config.blocks].sort((a, b) => a.z - b.z);
    blocks.forEach((block) => {
      if (block.hidden) return;
      drawCustomThumbnailBlock(ctx, item.id, block, blockRect(block, sx, sy, canvas), sx);
    });
  } else {
    ctx.fillStyle = "#C8102E";
    ctx.fillRect(0, 0, canvas.width, 28);
    ctx.fillStyle = "#111827";
    ctx.font = "700 18px Calibri, Arial";
    ctx.fillText(item.label || (item.kind === "budget_evo" ? "Overview CM/VOL" : "Overview DRE & Bridge"), 18, 70);
    ctx.strokeStyle = "#C8102E";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(18, 92);
    ctx.lineTo(canvas.width - 18, canvas.height - 45);
    ctx.stroke();
  }

  if (startedAt) {
    const elapsed = performance.now() - startedAt;
    recordThumbnailMetric("SlideThumbnail:fallbackRich", item.id);
    if (elapsed > 16) recordThumbnailMetric("SlideThumbnail:fallbackRich:over16ms", item.id);
  }

  return canvas.toDataURL("image/png");
}

function buildSlideThumbnailKeyFromSignatures({
  item,
  pricingMetric,
  pricingSignature,
  budgetSignature,
  forecastSignature,
  rollingSignature,
}: {
  item: SlideItem;
  pricingMetric: string;
  pricingSignature: string;
  budgetSignature: string;
  forecastSignature: string;
  rollingSignature: string;
}): string {
  return buildSlideThumbnailKey({
    item,
    pricingMetric,
    pricingSignature,
    budgetSignature,
    forecastSignature,
    rollingSignature,
    renderWidth: STATIC_THUMBNAIL_W,
  });
}

// eslint-disable-next-line react-refresh/only-export-components
export function getSlideThumbnailKeyForItem(item: SlideItem): string {
  const pricingState = usePricing.getState();
  return buildSlideThumbnailKeyFromSignatures({
    item,
    pricingMetric: pricingState.metric,
    pricingSignature: getCachedRowsSignature(pricingState.rows),
    budgetSignature: getCachedRowsSignature(useBudget.getState().rows),
    forecastSignature: getCachedRowsSignature(useForecast.getState().rows),
    rollingSignature: getCachedRowsSignature(useRolling.getState().rows),
  });
}

// eslint-disable-next-line react-refresh/only-export-components
export async function warmSlideThumbnail(item: SlideItem): Promise<"hit" | "generated" | "fallback" | "error"> {
  const key = getSlideThumbnailKeyForItem(item);
  const current = getSlideThumbnail(key);
  if (current?.status === "ready") {
    recordThumbnailMetric("SlideThumbnail:hit", item.id);
    return "hit";
  }
  if (current?.status === "rendering") return "hit";

  markSlideThumbnailRendering(key);
  recordThumbnailMetric("SlideThumbnail:render", item.id);
  try {
    const dataUrl = renderFallbackThumbnail(item);
    setSlideThumbnail(key, dataUrl);
    recordThumbnailMetric("SlideThumbnail:ready", item.id);
    return "generated";
  } catch {
    const fallback = renderFallbackThumbnail(item);
    if (fallback) {
      setSlideThumbnail(key, fallback);
      recordThumbnailMetric("SlideThumbnail:fallback", item.id);
      return "fallback";
    }
    markSlideThumbnailError(key);
    recordThumbnailMetric("SlideThumbnail:error", item.id);
    return "error";
  }
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

function StaticScaledPreview({ item, targetWidth }: { item: SlideItem; targetWidth?: number }) {
  if (isSlidePerfEnabled()) recordSlideRender("StaticScaledPreview", item.id);
  const previewW = targetWidth ?? PREVIEW_W_INSPECTOR;
  const previewH = (CANVAS_H / CANVAS_W) * previewW;
  const key = useSlideThumbnailKey(item);
  const current = useSyncExternalStore(
    (listener) => subscribeSlideThumbnail(key, listener),
    () => getSlideThumbnail(key),
    () => getSlideThumbnail(key),
  );

  useEffect(() => {
    const entry = getSlideThumbnail(key);
    if (entry?.status === "ready" || entry?.status === "rendering" || entry?.status === "error") return;
    const timer = window.setTimeout(async () => {
      await warmSlideThumbnail(item);
    }, STATIC_THUMBNAIL_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [item, key]);

  return (
    <>
      {current?.status === "ready" && current.dataUrl ? (
        <img
          src={current.dataUrl}
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

function LightweightScaledPreview({ item, targetWidth }: { item: SlideItem; targetWidth?: number }) {
  if (isSlidePerfEnabled()) recordSlideRender("LightweightScaledPreview", item.id);
  const previewW = targetWidth ?? PREVIEW_W_INSPECTOR;
  const previewH = (CANVAS_H / CANVAS_W) * previewW;
  const dataUrl = useMemo(() => {
    if (typeof document === "undefined") return "";
    return renderFallbackThumbnail(item);
  }, [item]);

  if (!dataUrl) return <SlideThumbnailPlaceholder width={previewW} />;
  return (
    <img
      src={dataUrl}
      alt=""
      className="block rounded-lg border border-border/40 bg-white object-cover"
      style={{ width: previewW, height: previewH }}
      draggable={false}
    />
  );
}

export function ScaledPreview({
  item,
  targetWidth,
  mode = "static",
}: {
  item: SlideItem;
  targetWidth?: number;
  mode?: "static" | "live";
}) {
  if (mode === "live") return <LiveScaledPreview item={item} targetWidth={targetWidth} />;
  if ((targetWidth ?? PREVIEW_W_INSPECTOR) <= LIGHTWEIGHT_THUMBNAIL_MAX_W) {
    return <LightweightScaledPreview item={item} targetWidth={targetWidth} />;
  }
  return <StaticScaledPreview item={item} targetWidth={targetWidth} />;
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
      <ScaledPreview item={item} mode="live" />

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
