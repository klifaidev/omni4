import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  AlertTriangle,
  BarChart3,
  Maximize2,
  Minimize2,
  TrendingUp,
  Bookmark,
  BookmarkPlus,
  Check,
  ChevronDown,
  ChevronRight,
  Columns3,
  Download,
  Eye,
  EyeOff,
  FileImage,
  FileSpreadsheet,
  Filter as FilterIcon,
  Flame,
  GripVertical,
  Hash,
  Layers,
  Loader2,
  MoreHorizontal,
  Plus,
  Redo2,
  RotateCcw,
  Rows3,
  Search,
  Send,
  Sigma,
  Sparkles,
  Undo2,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import * as XLSX from "xlsx";
import { toPng } from "html-to-image";
import { cn } from "@/lib/utils";
import { GlassCard } from "./GlassCard";
import { formatBRL, formatNum, formatPct } from "@/lib/format";
import {
  buildUnifiedRows,
  dimensionsForMode,
  type PivotMode,
} from "@/lib/pivotData";
import {
  getDrillRowsForCell,
  PIVOT_OTHERS_COL_KEY,
  type PivotColHeader,
  type PivotColLimit,
  type PivotConfig,
  type PivotLimits,
  type PivotMeasure,
  type PivotResult,
  type PivotRowHeader,
  type PivotSizeEstimate,
} from "@/lib/pivot";
import { computePivotGuardedAsync, createEmptyPivotResult, disposePivotWorker } from "@/lib/pivotWorkerClient";
import type { Filters, PricingRow } from "@/lib/types";
import type { BudgetRow } from "@/lib/budget";
import { buildPivotSlideTable } from "@/lib/pivotToSlide";
import { captureSendToSlide } from "@/lib/sendToSlide";
import { isSendToSlideEnabledForPage } from "@/lib/sendToSlideRollout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { exportTableCsv } from "@/lib/exportCsv";
import {
  computeFieldStatsInIdle,
  countDistinctCombos,
  estimateLayoutSize,
  type LayoutSizeEstimate,
  type LayoutSizeLimits,
  type PivotFieldStats,
} from "@/lib/pivotFieldStats";
import {
  describePivotLayout,
  parsePivotPhrase,
  type PivotPhraseResult,
} from "@/lib/pivotPhrase";
import { evaluateFormula, formatFormula, parseFormula } from "@/lib/pivotFormula";
import {
  currentHeapMB,
  getPendingPivotCrash,
  resolvePendingPivotCrash,
  sendPivotBreadcrumb,
  type CrashState,
} from "@/lib/crashRecovery";
import { toast } from "sonner";
import {
  usePivotLayoutStore,
  type PivotCalcField,
  type PivotDensity,
  type PivotLayout,
  type PivotSortState,
  type PivotVizMode,
  type SavedPivotView,
} from "@/store/pivotLayout";

type Zone = "rows" | "cols" | "values" | "filters";
type VizMode = PivotVizMode;
type SortState = PivotSortState;
type ShowAsMode = "normal" | "pctColuna" | "pctLinha" | "pctGeral";
type PivotFieldKind = "dimension" | "measure";
type PivotDetailRow = Record<string, unknown>;
type DrillSelection = {
  rowValues: string[];
  colValues: string[];
  measure: PivotMeasure;
  rows: PivotDetailRow[];
};

const ZONE_LABELS: Record<Zone, string> = {
  filters: "Filtros",
  rows: "Linhas",
  cols: "Colunas",
  values: "Valores",
};

const PIVOT_VIRTUAL_ROW_THRESHOLD = 200;
const PIVOT_VIRTUAL_ROW_HEIGHT = 28;
const PIVOT_VIRTUAL_OVERSCAN = 12;
const PIVOT_MAX_VISIBLE_VALUE_CELLS = 750_000;
const PIVOT_MAX_OBSERVED_CELLS = 350_000;
const PIVOT_MAX_ROW_HEADERS = 120_000;
const PIVOT_MAX_COL_HEADERS = 3_000;
const PIVOT_CLEAR_PREVIOUS_CELL_THRESHOLD = 200_000;
/** Acima de 60 colunas, mostra as 50 maiores e soma o resto em "Outros". */
const PIVOT_COL_LIMIT: PivotColLimit = { top: 50, threshold: 60 };
/** Prévia de tamanho: acima disso a montagem é "pesada" (âmbar). */
const PIVOT_WARN_CELLS = 100_000;
const PIVOT_LIMITS: PivotLimits = {
  maxRowHeaders: PIVOT_MAX_ROW_HEADERS,
  maxColHeaders: PIVOT_MAX_COL_HEADERS,
  maxObservedCells: PIVOT_MAX_OBSERVED_CELLS,
  maxVisibleValueCells: PIVOT_MAX_VISIBLE_VALUE_CELLS,
};

type PivotSafety = {
  estimate: PivotSizeEstimate;
  blocked: boolean;
  reason: string | null;
};

function buildPivotSafety(estimate: PivotSizeEstimate): PivotSafety {
  if (estimate.rowHeaderCount > PIVOT_MAX_ROW_HEADERS) {
    return {
      estimate,
      blocked: true,
      reason: `linhas demais (${formatNum(estimate.rowHeaderCount, 0, true)})`,
    };
  }
  if (estimate.colHeaderCount > PIVOT_MAX_COL_HEADERS) {
    return {
      estimate,
      blocked: true,
      reason: `colunas demais (${formatNum(estimate.colHeaderCount, 0, true)})`,
    };
  }
  if (estimate.observedCellCount > PIVOT_MAX_OBSERVED_CELLS) {
    return {
      estimate,
      blocked: true,
      reason: `combinacoes demais (${formatNum(estimate.observedCellCount, 0, true)})`,
    };
  }
  if (estimate.visibleValueCellCount > PIVOT_MAX_VISIBLE_VALUE_CELLS) {
    return {
      estimate,
      blocked: true,
      reason: `celulas demais (${formatNum(estimate.visibleValueCellCount, 0, true)})`,
    };
  }
  return { estimate, blocked: false, reason: null };
}

const DIM_GROUPS = ["Tempo", "Produto", "Inovação", "Comercial"] as const;

// ---------- Catálogo de medidas por modo ----------
function measuresFor(mode: PivotMode): PivotMeasure[] {
  const real: PivotMeasure[] = [
    { id: "rol_real", label: "ROL", field: "rol_real", agg: "sum", format: "currency", tone: "real" },
    { id: "vol_real", label: "Volume", field: "volumeKg_real", agg: "sum", format: "kg", tone: "real" },
    { id: "cogs_real", label: "CPV", field: "cogs_real", agg: "sum", format: "currency", tone: "real" },
    { id: "cvar_real", label: "Custo Variável", field: "custoVariavel_real", agg: "sum", format: "currency", tone: "real" },
    { id: "cfix_real", label: "Custo Fixo", field: "custoFixo_real", agg: "sum", format: "currency", tone: "real" },
    { id: "mp_real", label: "Matéria Prima", field: "materiaPrima_real", agg: "sum", format: "currency", tone: "real" },
    { id: "emb_real", label: "Embalagem", field: "embalagem_real", agg: "sum", format: "currency", tone: "real" },
    { id: "mod_real", label: "MOD", field: "mod_real", agg: "sum", format: "currency", tone: "real" },
    { id: "cif_real", label: "CIF", field: "cif_real", agg: "sum", format: "currency", tone: "real" },
    { id: "frete_real", label: "Frete s/ Vendas", field: "frete_real", agg: "sum", format: "currency", tone: "real" },
    { id: "com_real", label: "Comissão", field: "comissao_real", agg: "sum", format: "currency", tone: "real" },
    { id: "mb_real", label: "MB", field: "mb_real", agg: "sum", format: "currency", tone: "real" },
    { id: "cm_real", label: "CM", field: "cm_real", agg: "sum", format: "currency", tone: "real" },
    {
      id: "cm_pct_real",
      label: "CM %",
      field: "cm_real",
      agg: "sum",
      format: "percent",
      tone: "real",
      dependsOn: ["rol_real", "cm_real"],
      derive: (a) => {
        if (a.rol_real == null || a.cm_real == null) return null;
        return a.rol_real > 0 ? a.cm_real / a.rol_real : 0;
      },
    },
    {
      id: "mb_pct_real",
      label: "MB %",
      field: "mb_real",
      agg: "sum",
      format: "percent",
      tone: "real",
      dependsOn: ["rol_real", "mb_real"],
      derive: (a) => {
        if (a.rol_real == null || a.mb_real == null) return null;
        return a.rol_real > 0 ? a.mb_real / a.rol_real : 0;
      },
    },
    {
      id: "rol_kg_real",
      label: "ROL R$/Kg",
      field: "rol_real",
      agg: "sum",
      format: "number",
      tone: "real",
      dependsOn: ["vol_real", "rol_real"],
      derive: (a) => {
        if (a.vol_real == null || a.rol_real == null) return null;
        return a.vol_real > 0 ? a.rol_real / a.vol_real : 0;
      },
    },
    {
      id: "cm_kg_real",
      label: "CM R$/Kg",
      field: "cm_real",
      agg: "sum",
      format: "number",
      tone: "real",
      dependsOn: ["vol_real", "cm_real"],
      derive: (a) => {
        if (a.vol_real == null || a.cm_real == null) return null;
        return a.vol_real > 0 ? a.cm_real / a.vol_real : 0;
      },
    },
    {
      id: "com_pct_real",
      label: "Comissão %/ROL",
      field: "comissao_real",
      agg: "sum",
      format: "percent",
      tone: "real",
      dependsOn: ["rol_real", "com_real"],
      derive: (a) => {
        if (a.rol_real == null || a.com_real == null) return null;
        return a.rol_real > 0 ? a.com_real / a.rol_real : 0;
      },
    },
  ];
  const budget: PivotMeasure[] = [
    { id: "rol_budget", label: "ROL", field: "rol_budget", agg: "sum", format: "currency", tone: "budget" },
    { id: "vol_budget", label: "Volume", field: "volumeKg_budget", agg: "sum", format: "kg", tone: "budget" },
    { id: "cm_budget", label: "CM", field: "cm_budget", agg: "sum", format: "currency", tone: "budget" },
    { id: "cpv_budget", label: "CPV", field: "cpv_budget", agg: "sum", format: "currency", tone: "budget" },
    {
      id: "cm_pct_budget",
      label: "CM %",
      field: "cm_budget",
      agg: "sum",
      format: "percent",
      tone: "budget",
      dependsOn: ["rol_budget", "cm_budget"],
      derive: (a) => {
        if (a.rol_budget == null || a.cm_budget == null) return null;
        return a.rol_budget > 0 ? a.cm_budget / a.rol_budget : 0;
      },
    },
  ];
  const compare: PivotMeasure[] = [
    { id: "rol_real", label: "ROL Real", field: "rol_real", agg: "sum", format: "currency", tone: "real" },
    { id: "rol_budget", label: "ROL Budget", field: "rol_budget", agg: "sum", format: "currency", tone: "budget" },
    {
      id: "rol_delta",
      label: "ROL Δ",
      field: "rol_real",
      agg: "sum",
      format: "currency",
      tone: "delta",
      dependsOn: ["rol_real", "rol_budget"],
      derive: (a) => {
        if (a.rol_real == null || a.rol_budget == null) return null;
        return a.rol_real - a.rol_budget;
      },
    },
    {
      id: "rol_delta_pct",
      label: "ROL Δ%",
      field: "rol_real",
      agg: "sum",
      format: "percent",
      tone: "delta",
      dependsOn: ["rol_real", "rol_budget"],
      derive: (a) => {
        if (a.rol_real == null || a.rol_budget == null) return null;
        return a.rol_budget !== 0 ? (a.rol_real - a.rol_budget) / Math.abs(a.rol_budget) : null;
      },
    },
    { id: "cm_real", label: "CM Real", field: "cm_real", agg: "sum", format: "currency", tone: "real" },
    { id: "cm_budget", label: "CM Budget", field: "cm_budget", agg: "sum", format: "currency", tone: "budget" },
    {
      id: "cm_delta",
      label: "CM Δ",
      field: "cm_real",
      agg: "sum",
      format: "currency",
      tone: "delta",
      dependsOn: ["cm_real", "cm_budget"],
      derive: (a) => {
        if (a.cm_real == null || a.cm_budget == null) return null;
        return a.cm_real - a.cm_budget;
      },
    },
    { id: "vol_real", label: "Vol Real", field: "volumeKg_real", agg: "sum", format: "kg", tone: "real" },
    { id: "vol_budget", label: "Vol Budget", field: "volumeKg_budget", agg: "sum", format: "kg", tone: "budget" },
  ];

  return mode === "real" ? real : mode === "compare" ? compare : budget;
}

/**
 * Campos calculados do modo como medidas do pivot. A fórmula só pode citar
 * medidas nativas do modo (sem campo calculado dentro de campo calculado —
 * evita ciclos); um campo cuja fórmula deixou de valer some do catálogo.
 */
function calcMeasuresFor(mode: PivotMode, calcFields: PivotCalcField[]): PivotMeasure[] {
  const native = new Set(measuresFor(mode).map((m) => m.id));
  const out: PivotMeasure[] = [];
  for (const field of calcFields) {
    if (field.mode !== mode) continue;
    const parsed = parseFormula(field.formula, (name) => (native.has(name) ? name : null));
    if (!parsed.ok) continue;
    const ast = parsed.ast;
    out.push({
      id: field.id,
      label: field.name,
      field: field.id,
      agg: "sum",
      format: field.format,
      tone: "neutral",
      dependsOn: parsed.deps,
      formula: parsed.canonical,
      derive: (acc) => evaluateFormula(ast, acc),
    });
  }
  return out;
}

/** Fórmula canônica ("[rol_real] / [vol_real]") com os rótulos ("[ROL] / [Volume]"). */
function formulaForDisplay(canonical: string, labelOf: (id: string) => string): string {
  const parsed = parseFormula(canonical, (name) => name);
  return parsed.ok ? formatFormula(parsed.ast, labelOf) : canonical;
}

function catalogFor(mode: PivotMode, calcFields: PivotCalcField[]): PivotMeasure[] {
  return [...measuresFor(mode), ...calcMeasuresFor(mode, calcFields)];
}

function defaultConfig(mode: PivotMode) {
  return {
    rows: ["marca"],
    cols: ["fy"],
    values:
      mode === "real"
        ? ["rol_real", "cm_real", "cm_pct_real"]
        : mode === "compare"
          ? ["rol_real", "rol_budget", "rol_delta", "rol_delta_pct"]
          : ["rol_budget", "cm_budget", "cm_pct_budget"],
  };
}

function defaultLayout(mode: PivotMode): PivotLayout {
  return {
    ...defaultConfig(mode),
    filterDims: [],
    filterVals: {},
    sort: null,
    viz: "heatmap",
    hideEmpty: true,
  };
}

/**
 * Montagens restauradas (última usada ou visão salva) podem citar campos que
 * não existem no modo — ex.: Região numa visão do SuperBase, ou um campo que
 * deixou de existir numa versão nova do app. Descarta o que não se aplica.
 */
function sanitizeLayout(layout: PivotLayout | undefined, mode: PivotMode): PivotLayout | null {
  if (!layout) return null;
  const dimIds = new Set(dimensionsForMode(mode).map((d) => d.id as string));
  const measureIds = new Set(catalogFor(mode, usePivotLayoutStore.getState().calcFields).map((m) => m.id));
  const filterDims = (layout.filterDims ?? []).filter((d) => dimIds.has(d));
  const values = (layout.values ?? []).filter((v) => measureIds.has(v));
  const filterVals = Object.fromEntries(
    Object.entries(layout.filterVals ?? {}).filter(([dim, vals]) => filterDims.includes(dim) && Array.isArray(vals)),
  );
  const sort = layout.sort && values.includes(layout.sort.measure) ? layout.sort : null;
  return {
    rows: (layout.rows ?? []).filter((d) => dimIds.has(d)),
    cols: (layout.cols ?? []).filter((d) => dimIds.has(d)),
    values,
    filterDims,
    filterVals,
    sort,
    viz: layout.viz === "plain" || layout.viz === "bars" ? layout.viz : "heatmap",
    hideEmpty: layout.hideEmpty !== false,
  };
}

function restoredLayoutFor(mode: PivotMode): PivotLayout {
  return sanitizeLayout(usePivotLayoutStore.getState().layouts[mode], mode) ?? defaultLayout(mode);
}

function initialPivotState(hasBudget: boolean): { mode: PivotMode; layout: PivotLayout } {
  const stored = usePivotLayoutStore.getState().mode;
  // Sem base de Budget, SuperBase/Comparativo ficam indisponíveis — volta pro KE30.
  const mode: PivotMode = stored !== "real" && !hasBudget ? "real" : stored;
  return { mode, layout: restoredLayoutFor(mode) };
}

const MAX_LAYOUT_HISTORY = 50;

// Quick start presets
type Preset = {
  id: string;
  label: string;
  hint: string;
  modes: PivotMode[];
  build: (mode: PivotMode) => { rows: string[]; cols: string[]; values: string[] };
};
const PRESETS: Preset[] = [
  {
    id: "marca-fy",
    label: "Marca × FY",
    hint: "Visão por marca em cada ano fiscal",
    modes: ["real", "budget"],
    build: (m) => ({
      rows: ["marca"],
      cols: ["fy"],
      values:
        m === "real"
          ? ["rol_real", "cm_real", "cm_pct_real"]
          : ["rol_budget", "cm_budget", "cm_pct_budget"],
    }),
  },
  {
    id: "canal-mes",
    label: "Canal × Mês",
    hint: "Evolução mensal por canal",
    modes: ["real", "budget"],
    build: (m) => ({
      rows: ["canalAjustado"],
      cols: ["mesLabel"],
      values: m === "real" ? ["rol_real"] : ["rol_budget"],
    }),
  },
  {
    id: "categoria-marca",
    label: "Categoria · Marca",
    hint: "Hierarquia categoria → marca",
    modes: ["real", "budget"],
    build: (m) => ({
      rows: ["categoria", "marca"],
      cols: ["fy"],
      values: m === "real" ? ["rol_real", "cm_real"] : ["rol_budget", "cm_budget"],
    }),
  },
  {
    id: "regiao-uf",
    label: "Região × UF",
    hint: "Geografia comercial",
    modes: ["real"],
    build: () => ({
      rows: ["regiao", "uf"],
      cols: ["fy"],
      values: ["rol_real", "vol_real"],
    }),
  },
  {
    id: "inovacao",
    label: "Inovação vs Regular",
    hint: "Quebra por classificação",
    modes: ["real", "budget"],
    build: (m) => ({
      rows: ["inovacao"],
      cols: ["mesLabel"],
      values: m === "real" ? ["rol_real", "cm_pct_real"] : ["rol_budget", "cm_pct_budget"],
    }),
  },
  {
    id: "compare-marca",
    label: "Real vs Budget",
    hint: "Comparativo Real vs Budget por marca e FY",
    modes: ["compare"],
    build: () => ({
      rows: ["marca"],
      cols: ["fy"],
      values: ["rol_real", "rol_budget", "rol_delta", "rol_delta_pct"],
    }),
  },
];

// Ordenação cronológica para mesLabel (Jan/25, Fev/25, ...)
const MES_ORDER_PT: Record<string, number> = {
  Jan:1, Fev:2, Mar:3, Abr:4, Mai:5, Jun:6,
  Jul:7, Ago:8, Set:9, Out:10, Nov:11, Dez:12,
};
function sortMesLabel(a: string, b: string): number {
  const [ma, ya] = a.split("/");
  const [mb, yb] = b.split("/");
  const yearA = parseInt(ya ?? "0");
  const yearB = parseInt(yb ?? "0");
  if (yearA !== yearB) return yearA - yearB;
  return (MES_ORDER_PT[ma] ?? 99) - (MES_ORDER_PT[mb] ?? 99);
}

function fmtValue(measure: PivotMeasure, val: number | null | undefined): string {
  if (val === null || val === undefined || !isFinite(val)) return "—";
  switch (measure.format) {
    case "currency": return formatBRL(val, { compact: true });
    case "percent": return formatPct(val);
    case "kg": return `${formatNum(val, 0, true)} kg`;
    case "tons": return `${formatNum(val / 1000, 1)} t`;
    default: return formatNum(val, 0, true);
  }
}

const SHOW_AS_OPTIONS: Array<{ mode: ShowAsMode; label: string }> = [
  { mode: "normal", label: "Valor normal" },
  { mode: "pctColuna", label: "Percentual do total da coluna" },
  { mode: "pctLinha", label: "Percentual do total da linha" },
  { mode: "pctGeral", label: "Percentual do total geral" },
];

function applyShowAs(
  value: number | null | undefined,
  mode: ShowAsMode,
  totals: {
    rowTotal?: number | null;
    colTotal?: number | null;
    grandTotal?: number | null;
  },
): number | null {
  if (value === null || value === undefined || !isFinite(value)) return null;
  if (mode === "normal") return value;
  const divisor = mode === "pctColuna"
    ? totals.colTotal
    : mode === "pctLinha"
      ? totals.rowTotal
      : totals.grandTotal;
  if (divisor === null || divisor === undefined || !isFinite(divisor) || divisor === 0) return null;
  return value / divisor;
}

function fmtPivotDisplay(measure: PivotMeasure, val: number | null | undefined, mode: ShowAsMode): string {
  if (mode === "normal") return fmtValue(measure, val);
  return fmtValue({ ...measure, format: "percent" }, val);
}

function toneClass(tone?: PivotMeasure["tone"], val?: number | null) {
  if (tone === "delta") {
    if (val == null || !isFinite(val) || val === 0) return "text-muted-foreground";
    // Tom 800 no tema claro: contraste ≥ 4,5:1 mesmo sobre o heatmap mais
    // forte; os tons 300 davam 1,5:1 e 1,9:1 e deixavam o Comparativo
    // ilegível no tema claro.
    return val > 0
      ? "text-emerald-800 dark:text-emerald-300"
      : "text-rose-800 dark:text-rose-300";
  }
  // accent-foreground é quase branco no tema claro (contraste ~1:1).
  if (tone === "budget") return "text-violet-800 dark:text-accent-foreground/90";
  return "text-foreground";
}

type HeatRange = { min: number; max: number };

function cellBg(viz: VizMode, m: PivotMeasure, v: number | null, range: HeatRange): React.CSSProperties | undefined {
  if (viz === "plain" || v === null || !isFinite(v)) return undefined;
  const { min, max } = range;
  if (viz === "bars") {
    // Barra de dados (como a do Excel): comprimento proporcional ao valor
    // absoluto; a cor diz o sinal (Δ: verde/vermelho; demais: azul/vermelho).
    const absMax = Math.max(Math.abs(min), Math.abs(max));
    if (absMax === 0 || v === 0) return undefined;
    const pct = Math.max(2, Math.min(100, (Math.abs(v) / absMax) * 100));
    const hsl = m.tone === "delta" ? (v >= 0 ? "158 64% 45%" : "0 84% 60%") : v > 0 ? "217 91% 60%" : "0 72% 51%";
    return {
      backgroundImage: `linear-gradient(to right, hsl(${hsl} / 0.32) ${pct}%, transparent ${pct}%)`,
    };
  }
  let intensity: number;
  if (m.tone === "delta" || (min < 0 && max > 0)) {
    // Divergente a partir do zero: o sinal é a informação principal.
    const absMax = Math.max(Math.abs(min), Math.abs(max));
    if (absMax === 0 || v === 0) return undefined;
    intensity = Math.abs(v) / absMax;
  } else {
    // Todos com o mesmo sinal: escala mín→máx da medida. Numa escala
    // 0→máximo, percentuais de faixa estreita (CM% entre 29% e 32%) ficavam
    // todos com a mesma cor.
    const span = max - min;
    intensity = span > 0 ? (min >= 0 ? (v - min) / span : (max - v) / span) : 1;
  }
  // Teto de 0,40: acima disso o texto colorido dos deltas perde contraste.
  const alpha = 0.06 + Math.min(1, Math.max(0, intensity)) * 0.34;
  if (m.tone === "delta") {
    const hsl = v >= 0 ? "158 64% 52%" : "0 84% 65%";
    return { backgroundColor: `hsl(${hsl} / ${alpha})` };
  }
  // Positivo → azul, negativo → vermelho (permite distinguir valores negativos no heatmap)
  const hsl = v > 0 ? "217 91% 60%" : "0 72% 51%";
  return { backgroundColor: `hsl(${hsl} / ${alpha})` };
}

const MODE_LABEL: Record<PivotMode, string> = {
  real: "KE30",
  budget: "SuperBase",
  compare: "Comparativo",
};

// ============================================================
//                        COMPONENT
// ============================================================
export function PivotBuilder({
  realRows,
  budgetRows,
  onExportReady,
  globalFilters,
  globalPeriods,
}: {
  realRows: PricingRow[];
  budgetRows: BudgetRow[];
  onExportReady?: (fn: () => void) => void;
  /** Filtros/meses globais já aplicados às linhas — o slide precisa reaplicá-los. */
  globalFilters?: Filters;
  globalPeriods?: string[] | null;
}) {
  // A montagem começa de onde a pessoa parou (último modo e última montagem
  // de cada modo, persistidos) — antes tudo voltava pro padrão "Marca × FY"
  // ao sair da aba e voltar.
  const initialRef = useRef<{ mode: PivotMode; layout: PivotLayout } | null>(null);
  if (!initialRef.current) initialRef.current = initialPivotState(budgetRows.length > 0);
  const initial = initialRef.current;
  const [mode, setMode] = useState<PivotMode>(initial.mode);
  const [rowsDims, setRowsDims] = useState<string[]>(initial.layout.rows);
  const [colsDims, setColsDims] = useState<string[]>(initial.layout.cols);
  const [valueIds, setValueIds] = useState<string[]>(initial.layout.values);
  const [filterDims, setFilterDims] = useState<string[]>(initial.layout.filterDims);
  const [filterVals, setFilterVals] = useState<Record<string, string[]>>(initial.layout.filterVals);
  const [paletteQuery, setPaletteQuery] = useState("");

  // UX state
  const [viz, setViz] = useState<VizMode>(initial.layout.viz);
  const [hideEmpty, setHideEmpty] = useState(initial.layout.hideEmpty);
  const [sort, setSort] = useState<SortState>(initial.layout.sort);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [drillSelection, setDrillSelection] = useState<DrillSelection | null>(null);
  const [expandedRowKeys, setExpandedRowKeys] = useState<Set<string>>(() => new Set());

  // Achado 05 da análise de UX/UI: identidade estável pra esses dois
  // callbacks — passados sem useCallback antes, forçavam PivotTable
  // (o componente mais pesado da tela, agora em React.memo) a re-renderizar
  // por inteiro a cada render do pai, mesmo sem nenhuma mudança relevante
  // (ex.: digitar na busca da paleta).
  const handleToggleRowGroup = useCallback((key: string) => {
    setExpandedRowKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const handleOpenDrill = useCallback((selection: DrillSelection) => setDrillSelection(selection), []);

  const tableRef = useRef<HTMLDivElement>(null);
  const pivotRequestRef = useRef(0);

  const layout = useMemo<PivotLayout>(
    () => ({ rows: rowsDims, cols: colsDims, values: valueIds, filterDims, filterVals, sort, viz, hideEmpty }),
    [rowsDims, colsDims, valueIds, filterDims, filterVals, sort, viz, hideEmpty],
  );

  const applyLayout = useCallback((next: PivotLayout) => {
    setRowsDims(next.rows);
    setColsDims(next.cols);
    setValueIds(next.values);
    setFilterDims(next.filterDims);
    setFilterVals(next.filterVals);
    setSort(next.sort);
    setViz(next.viz);
    setHideEmpty(next.hideEmpty);
    setExpandedRowKeys(new Set());
  }, []);

  // Grava a montagem a cada mudança (por modo). É um objeto pequeno — só
  // ids de campos e valores de filtro.
  useEffect(() => {
    usePivotLayoutStore.getState().saveLayout(mode, layout);
  }, [mode, layout]);

  // ----- Desfazer / refazer -----
  // Histórico em memória das montagens da sessão. `appliedJson` marca a
  // montagem aplicada pelo próprio desfazer/refazer (ou troca de modo) pra ela
  // não virar um novo passo do histórico.
  const historyRef = useRef<{ past: PivotLayout[]; future: PivotLayout[]; last: PivotLayout | null; appliedJson: string | null }>({
    past: [],
    future: [],
    last: null,
    appliedJson: null,
  });
  const [, setHistoryTick] = useState(0);

  useEffect(() => {
    const history = historyRef.current;
    if (history.appliedJson !== null && JSON.stringify(layout) === history.appliedJson) {
      history.appliedJson = null;
      history.last = layout;
      setHistoryTick((tick) => tick + 1);
      return;
    }
    history.appliedJson = null;
    if (history.last && history.last !== layout) {
      history.past.push(history.last);
      if (history.past.length > MAX_LAYOUT_HISTORY) history.past.shift();
      history.future = [];
      setHistoryTick((tick) => tick + 1);
    }
    history.last = layout;
  }, [layout]);

  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;

  const undoLayout = useCallback(() => {
    const history = historyRef.current;
    const previous = history.past.pop();
    if (!previous) return;
    if (history.last) history.future.push(history.last);
    history.appliedJson = JSON.stringify(previous);
    applyLayout(previous);
    setHistoryTick((tick) => tick + 1);
  }, [applyLayout]);

  const redoLayout = useCallback(() => {
    const history = historyRef.current;
    const next = history.future.pop();
    if (!next) return;
    if (history.last) history.past.push(history.last);
    history.appliedJson = JSON.stringify(next);
    applyLayout(next);
    setHistoryTick((tick) => tick + 1);
  }, [applyLayout]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undoLayout();
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        redoLayout();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undoLayout, redoLayout]);

  // Trocar de modo restaura a última montagem daquele modo (antes, qualquer
  // troca apagava a montagem e voltava pro padrão).
  const changeMode = useCallback((next: PivotMode) => {
    if (next === mode) return;
    const target = restoredLayoutFor(next);
    const history = historyRef.current;
    history.past = [];
    history.future = [];
    history.last = null;
    history.appliedJson = JSON.stringify(target);
    usePivotLayoutStore.getState().setMode(next);
    setMode(next);
    applyLayout(target);
  }, [mode, applyLayout]);

  useEffect(() => {
    return () => {
      disposePivotWorker();
    };
  }, []);

  const calcFields = usePivotLayoutStore((s) => s.calcFields);
  const measureCatalog = useMemo(() => catalogFor(mode, calcFields), [mode, calcFields]);
  const nativeMeasures = useMemo(() => measuresFor(mode), [mode]);
  const [calcDialog, setCalcDialog] = useState<{ field: PivotCalcField | null } | null>(null);
  const measureMap = useMemo(
    () => new Map(measureCatalog.map((m) => [m.id, m])),
    [measureCatalog],
  );
  const dims = useMemo(() => dimensionsForMode(mode), [mode]);
  const dimMap = useMemo(() => new Map(dims.map((d) => [d.id as string, d])), [dims]);

  const unified = useMemo(
    () => buildUnifiedRows(realRows, budgetRows, mode),
    [realRows, budgetRows, mode],
  );

  const selectedMeasures = useMemo(
    () => valueIds.map((id) => measureMap.get(id)).filter(Boolean) as PivotMeasure[],
    [valueIds, measureMap],
  );
  const unifiedRecords = unified as unknown as PivotDetailRow[];

  // passar filterVals diretamente para o engine (arrays, não Sets)
  const filterValsForEngine = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const [k, arr] of Object.entries(filterVals)) {
      if (arr && arr.length) out[k] = arr;
    }
    return out;
  }, [filterVals]);

  // Valores oferecidos em cada filtro, em cascata: o filtro da dimensão X lista
  // os valores de X presentes nas linhas que passam pelos OUTROS filtros —
  // não pelo próprio X. Antes o próprio filtro também era aplicado, então
  // depois de escolher "A" o popover só mostrava "A" e não dava mais pra
  // acrescentar "B". Passada única sobre a base, com Set, e só quando existe
  // algum filtro (antes a base inteira era refiltrada a cada mudança).
  const allValuesByDim = useMemo(() => {
    if (filterDims.length === 0) return {} as Record<string, string[]>;
    const active = Object.entries(filterValsForEngine)
      .map(([dim, vals]) => [dim, new Set(vals)] as const);
    const sets: Record<string, Set<string>> = {};
    for (const id of filterDims) sets[id] = new Set<string>();
    for (const row of unified as unknown as Record<string, unknown>[]) {
      let failedDim: string | null = null;
      let failures = 0;
      for (const [dim, allowed] of active) {
        if (allowed.has(String(row[dim] ?? "—"))) continue;
        failures += 1;
        failedDim = dim;
        if (failures > 1) break;
      }
      if (failures > 1) continue;
      for (const id of filterDims) {
        if (failures === 1 && failedDim !== id) continue;
        sets[id].add(String(row[id] ?? "—"));
      }
    }
    const map: Record<string, string[]> = {};
    for (const id of filterDims) {
      const arr = Array.from(sets[id] ?? []);
      if (id === "mesLabel" || id === "periodo") {
        arr.sort(sortMesLabel);
      } else {
        arr.sort((a, b) => a.localeCompare(b, "pt-BR"));
      }
      map[id] = arr;
    }
    return map;
  }, [unified, filterValsForEngine, filterDims]);

  // Muitas colunas (ex.: SKU nas colunas): por padrão só as maiores aparecem
  // uma a uma e o resto vira "Outros". "Mostrar todas" desliga — volta ao
  // padrão quando a dimensão das colunas muda.
  const [showAllCols, setShowAllCols] = useState(false);
  const colsKey = colsDims.join("|");
  useEffect(() => {
    setShowAllCols(false);
  }, [colsKey]);

  const pivotConfig = useMemo<PivotConfig>(
    () => ({
      rows: rowsDims,
      cols: colsDims,
      values: selectedMeasures,
      measureCatalog,
      filters: filterValsForEngine,
      colLimit: showAllCols ? null : PIVOT_COL_LIMIT,
    }),
    [rowsDims, colsDims, selectedMeasures, measureCatalog, filterValsForEngine, showAllCols],
  );
  // A estimativa de tamanho roda no worker, no mesmo passe do cálculo: antes
  // ela percorria a base inteira no thread principal a cada mudança de config
  // (~50ms com 72 mil linhas, crescendo linearmente com a base).
  const [pivotSafety, setPivotSafety] = useState<PivotSafety | null>(null);
  const lastEstimateRef = useRef<PivotSizeEstimate | null>(null);
  const [pivot, setPivot] = useState<PivotResult>(() => createEmptyPivotResult());
  // Formato (medidas/dimensões/config) do resultado que está NA TELA, trocado
  // junto com ele. Antes a tabela recebia a config nova assim que o usuário
  // mexia num campo e re-renderizava com o resultado antigo (colunas novas
  // vazias) — um render inteiro jogado fora antes do render com o resultado.
  const [pivotShape, setPivotShape] = useState(() => ({
    measures: selectedMeasures,
    rowDims: rowsDims,
    colDims: colsDims,
    config: pivotConfig,
  }));
  const [pivotLoading, setPivotLoading] = useState(false);

  // Modo seguro: o app caiu por falta de memória nesta aba. A montagem
  // restaurada fica nas zonas (dá pra ver e mexer), mas não é recalculada
  // sozinha — antes ela derrubava o app de novo assim que a aba abria.
  // Qualquer mudança na montagem (ou "Abrir mesmo assim") sai do modo seguro.
  const [crashNotice, setCrashNotice] = useState<CrashState | null>(() => getPendingPivotCrash());
  const crashConfigRef = useRef(pivotConfig);
  const leaveSafeMode = useCallback(() => {
    resolvePendingPivotCrash();
    setCrashNotice(null);
  }, []);
  useEffect(() => {
    if (crashNotice && pivotConfig !== crashConfigRef.current) leaveSafeMode();
  }, [crashNotice, pivotConfig, leaveSafeMode]);

  useEffect(() => {
    if (crashNotice) return;
    const requestId = ++pivotRequestRef.current;
    let cancelled = false;

    setPivotLoading(true);
    // Libera o pivot anterior antes de calcular o próximo quando ele era
    // grande, pra não manter dois resultados enormes em memória ao mesmo tempo.
    if ((lastEstimateRef.current?.visibleValueCellCount ?? 0) > PIVOT_CLEAR_PREVIOUS_CELL_THRESHOLD) {
      setPivot(createEmptyPivotResult());
    }

    computePivotGuardedAsync(unified as unknown as Record<string, unknown>[], pivotConfig, PIVOT_LIMITS)
      .then(({ estimate, result }) => {
        if (cancelled || requestId !== pivotRequestRef.current) return;
        lastEstimateRef.current = estimate;
        setPivotSafety(buildPivotSafety(estimate));
        setPivot(result ?? createEmptyPivotResult());
        sendPivotBreadcrumb({
          area: "pivot",
          mode,
          rows: pivotConfig.rows,
          cols: pivotConfig.cols,
          measures: pivotConfig.values.length,
          rowHeaders: estimate.rowHeaderCount,
          colHeaders: estimate.colHeaderCount,
          cells: estimate.visibleValueCellCount,
          heapMB: currentHeapMB(),
        });
        setPivotShape({
          measures: pivotConfig.values,
          rowDims: pivotConfig.rows,
          colDims: pivotConfig.cols,
          config: pivotConfig,
        });
      })
      .catch((error) => {
        if (cancelled || requestId !== pivotRequestRef.current) return;
        if (error instanceof Error && error.name === "AbortError") return;
        console.error("[PivotBuilder] Erro ao recalcular tabela dinâmica:", error);
        toast.error("Não foi possível recalcular a tabela dinâmica.");
      })
      .finally(() => {
        if (cancelled || requestId !== pivotRequestRef.current) return;
        setPivotLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // `mode` só entra no rastro; o cálculo depende de unified/pivotConfig.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unified, pivotConfig, crashNotice]);

  // Saindo da aba, o rastro deixa de valer: um crash em outra tela não pode
  // ser atribuído à última montagem da tabela.
  useEffect(() => () => sendPivotBreadcrumb(null), []);

  useEffect(() => {
    const groupKeys = pivot.rowHeaders.filter((row) => !row.isLeaf).map((row) => row.key);
    setExpandedRowKeys((prev) => {
      if (groupKeys.length === 0) return prev.size === 0 ? prev : new Set();
      let changed = false;
      const next = new Set<string>();
      for (const key of groupKeys) {
        if (prev.has(key)) next.add(key);
        else {
          next.add(key);
          changed = true;
        }
      }
      if (next.size !== prev.size) changed = true;
      return changed ? next : prev;
    });
  }, [pivot.rowHeaders]);

  // sortedRows: aplica hideEmpty + sort do usuário. Com grupos, os grupos são
  // ordenados pelo subtotal e as linhas dentro de cada grupo pelo próprio valor.
  const sortedRows = useMemo(() => {
    const hasGroups = pivot.rowHeaders.some((row) => !row.isLeaf);
    const rowHasValue = (rh: PivotRowHeader) => {
        const rowMap = pivot.cells.get(rh.key);
        if (!rowMap) return false;
        for (const cellRecord of rowMap.values()) {
          if (pivotShape.measures.some((m) => cellRecord[m.id] !== null && cellRecord[m.id] !== undefined)) {
            return true;
          }
        }
        return false;
    };
    const filterLeaves = (rows: PivotRowHeader[]) => hideEmpty ? rows.filter(rowHasValue) : rows;
    const sortRows = (rows: PivotRowHeader[]) => {
      if (!sort) return rows;
      const getter = (k: string) => {
        const v = sort.col === TOTAL_COL_KEY
          ? pivot.rowTotals.get(k)?.[sort.measure]
          : pivot.cells.get(k)?.get(sort.col)?.[sort.measure];
        return v ?? 0;
      };
      return [...rows].sort((a, b) => {
        const va = getter(a.key);
        const vb = getter(b.key);
        return sort.dir === "asc" ? va - vb : vb - va;
      });
    };

    if (!hasGroups) return sortRows(filterLeaves(pivot.leafRowHeaders));

    // Hierarquia de N níveis: em cada nível, os irmãos são ordenados (grupos
    // pelo subtotal) e cada grupo é seguido pelos seus filhos.
    const byKey = new Map(pivot.rowHeaders.map((header) => [header.key, header]));
    const rows: PivotRowHeader[] = [];
    const emit = (keys: string[]) => {
      const nodes: PivotRowHeader[] = [];
      for (const key of keys) {
        const node = byKey.get(key);
        if (node && (!node.isLeaf || !hideEmpty || rowHasValue(node))) nodes.push(node);
      }
      for (const node of sortRows(nodes)) {
        if (node.isLeaf) {
          rows.push(node);
          continue;
        }
        const at = rows.length;
        rows.push(node);
        emit(node.childrenKeys ?? []);
        if (hideEmpty && rows.length === at + 1 && !rowHasValue(node)) rows.pop();
      }
    };
    emit(pivot.rowHeaders.filter((header) => header.depth === 0 && !header.isLeaf).map((header) => header.key));
    return rows;
  }, [pivot, pivotShape.measures, sort, hideEmpty]);

  // Esconde os descendentes de grupos recolhidos (qualquer nível).
  const visibleRows = useMemo(() => {
    const out: PivotRowHeader[] = [];
    let collapsedDepth = Infinity;
    for (const row of sortedRows) {
      if (row.depth > collapsedDepth) continue;
      collapsedDepth = Infinity;
      out.push(row);
      if (!row.isLeaf && !expandedRowKeys.has(row.key)) collapsedDepth = row.depth;
    }
    return out;
  }, [expandedRowKeys, sortedRows]);

  // Modo foco: esconde paleta, frase e zonas e dá a altura toda pra tabela.
  const [focusMode, setFocusMode] = useState(false);
  // Destaques automáticos: valores fora do padrão da própria linha.
  const [showHighlights, setShowHighlights] = useState(true);
  const density = usePivotLayoutStore((s) => s.density);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.key.toLowerCase() !== "f") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      event.preventDefault();
      setFocusMode((on) => !on);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Recalculando por mais de um instante: a tabela anterior fica esmaecida
  // com uma barra de progresso (abaixo de 180 ms não pisca nada).
  const [showStale, setShowStale] = useState(false);
  useEffect(() => {
    if (!pivotLoading) {
      setShowStale(false);
      return;
    }
    const id = window.setTimeout(() => setShowStale(true), 180);
    return () => window.clearTimeout(id);
  }, [pivotLoading]);

  // Minigráfico de tendência por linha: só quando as colunas são de tempo
  // (FY, Período, Mês) e há pelo menos 3 pontos na série.
  const [showTrend, setShowTrend] = useState(true);
  const trendAvailable = pivotShape.colDims.length > 0
    && pivotShape.colDims.every((d) => TIME_DIM_IDS.has(d))
    && pivotShape.measures.length > 0
    && pivot.colHeaders.filter((c) => c.key !== PIVOT_OTHERS_COL_KEY).length >= 3;

  // "Mostrar até: Categoria · Marca · SKU" — abre os grupos até o nível
  // escolhido e fecha os de baixo.
  const groupDepthCount = Math.max(0, pivotShape.rowDims.length - 1);
  const expandToLevel = useCallback((level: number) => {
    setExpandedRowKeys(new Set(pivot.rowHeaders.filter((h) => !h.isLeaf && h.depth < level).map((h) => h.key)));
  }, [pivot.rowHeaders]);
  const currentLevel = useMemo(() => {
    if (groupDepthCount === 0) return null;
    const groups = pivot.rowHeaders.filter((h) => !h.isLeaf);
    for (let level = 0; level <= groupDepthCount; level++) {
      if (groups.every((h) => (h.depth < level) === expandedRowKeys.has(h.key))) return level;
    }
    return null;
  }, [groupDepthCount, pivot.rowHeaders, expandedRowKeys]);

  // ----- Drag & Drop (HTML5) -----
  const [dragging, setDragging] = useState<{ id: string; from: Zone | "palette" } | null>(null);
  const [dragOver, setDragOver] = useState<Zone | null>(null);

  // Valores distintos por dimensão (em segundo plano): prévia de tamanho ao
  // arrastar e reconhecimento de valores na frase ("só Varejo").
  const [fieldStats, setFieldStats] = useState<PivotFieldStats | null>(null);
  useEffect(() => {
    setFieldStats(null);
    return computeFieldStatsInIdle(
      unified as unknown as Record<string, unknown>[],
      dims.map((d) => d.id as string),
      setFieldStats,
    );
  }, [unified, dims]);

  const sizeLimits = useMemo<LayoutSizeLimits>(() => ({
    colLimit: showAllCols ? null : PIVOT_COL_LIMIT,
    maxRows: PIVOT_MAX_ROW_HEADERS,
    maxCols: PIVOT_MAX_COL_HEADERS,
    maxCells: PIVOT_MAX_VISIBLE_VALUE_CELLS,
    warnCells: PIVOT_WARN_CELLS,
  }), [showAllCols]);

  // Como a montagem ficaria se o campo arrastado fosse solto nesta zona.
  function simulateDrop(id: string, from: Zone | "palette", zone: Zone): { rows: string[]; cols: string[]; values: string[] } | null {
    if (zone === "values") {
      if (!measureMap.has(id)) return null;
      return { rows: rowsDims, cols: colsDims, values: valueIds.includes(id) ? valueIds : [...valueIds, id] };
    }
    if (!dimMap.has(id)) return null;
    let rows = rowsDims.filter((x) => x !== id);
    let cols = colsDims.filter((x) => x !== id);
    if (zone === "rows") rows = from === "rows" ? rowsDims : [...rows, id];
    else if (zone === "cols") cols = from === "cols" ? colsDims : [...cols, id];
    return { rows, cols, values: valueIds };
  }

  // Combinações reais por conjunto de dimensões (cache por base): a prévia
  // de "SKU dentro de Marca" é ~400 linhas, não 14 × 400.
  const comboCacheRef = useRef<{ rows: unknown; counts: Map<string, number> }>({ rows: null, counts: new Map() });
  const countCombos = useCallback((dimIds: string[]) => {
    if (dimIds.length === 0) return 1;
    if (dimIds.length === 1 && fieldStats?.distinct[dimIds[0]]) return Math.max(1, fieldStats.distinct[dimIds[0]].length);
    const cache = comboCacheRef.current;
    if (cache.rows !== unified) {
      cache.rows = unified;
      cache.counts = new Map();
    }
    const key = dimIds.join("\u001f");
    let n = cache.counts.get(key);
    if (n === undefined) {
      n = countDistinctCombos(unified as unknown as Record<string, unknown>[], dimIds);
      cache.counts.set(key, n);
    }
    return n;
  }, [unified, fieldStats]);

  function dropPreview(zone: Zone): LayoutSizeEstimate | null {
    if (!dragging || dragOver !== zone || !fieldStats) return null;
    const next = simulateDrop(dragging.id, dragging.from, zone);
    return next ? estimateLayoutSize(next, countCombos, sizeLimits) : null;
  }

  function isDimension(id: string) {
    return dimMap.has(id);
  }

  function removeFromZone(id: string, zone: Zone) {
    if (zone === "rows") setRowsDims((p) => p.filter((x) => x !== id));
    else if (zone === "cols") setColsDims((p) => p.filter((x) => x !== id));
    else if (zone === "values") setValueIds((p) => p.filter((x) => x !== id));
    else if (zone === "filters") {
      setFilterDims((p) => p.filter((x) => x !== id));
      setFilterVals((p) => {
        const n = { ...p };
        delete n[id];
        return n;
      });
    }
  }

  function addToZone(id: string, zone: Zone) {
    if (zone === "values") {
      if (!measureMap.has(id)) return;
      setValueIds((p) => (p.includes(id) ? p : [...p, id]));
      return;
    }
    if (!isDimension(id)) return;
    if (zone !== "rows") setRowsDims((p) => p.filter((x) => x !== id));
    if (zone !== "cols") setColsDims((p) => p.filter((x) => x !== id));
    if (zone !== "filters") setFilterDims((p) => p.filter((x) => x !== id));
    if (zone === "rows") setRowsDims((p) => (p.includes(id) ? p : [...p, id]));
    else if (zone === "cols") setColsDims((p) => (p.includes(id) ? p : [...p, id]));
    else if (zone === "filters") setFilterDims((p) => (p.includes(id) ? p : [...p, id]));
  }

  function canFieldMoveToZone(id: string, zone: Zone) {
    return zone === "values" ? measureMap.has(id) : isDimension(id);
  }

  function moveFieldToZone(id: string, from: Zone, to: Zone) {
    if (from === to || !canFieldMoveToZone(id, to)) return;
    removeFromZone(id, from);
    addToZone(id, to);
    setDragging(null);
    setDragOver(null);
  }

  function quickAdd(id: string) {
    if (measureMap.has(id)) addToZone(id, "values");
    else if (isDimension(id)) addToZone(id, "rows");
  }

  function reorderInZone(zone: Zone, fromId: string, toId: string) {
    const apply = (arr: string[]) => {
      const fromIdx = arr.indexOf(fromId);
      const toIdx = arr.indexOf(toId);
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return arr;
      const next = arr.slice();
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, fromId);
      return next;
    };
    if (zone === "rows") setRowsDims((p) => apply(p));
    else if (zone === "cols") setColsDims((p) => apply(p));
    else if (zone === "values") setValueIds((p) => apply(p));
    else if (zone === "filters") setFilterDims((p) => apply(p));
  }

  // Achado 12: alternativa por clique ao drag pra reordenar dentro da
  // mesma zona — troca o campo com o vizinho imediato.
  function moveAdjacent(zone: Zone, id: string, direction: "up" | "down") {
    const apply = (arr: string[]) => {
      const idx = arr.indexOf(id);
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (idx < 0 || swapIdx < 0 || swapIdx >= arr.length) return arr;
      const next = arr.slice();
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next;
    };
    if (zone === "rows") setRowsDims((p) => apply(p));
    else if (zone === "cols") setColsDims((p) => apply(p));
    else if (zone === "values") setValueIds((p) => apply(p));
    else if (zone === "filters") setFilterDims((p) => apply(p));
  }

  function handleDrop(zone: Zone) {
    if (!dragging) return;
    if (dragging.from !== "palette" && dragging.from !== zone) {
      removeFromZone(dragging.id, dragging.from);
    }
    addToZone(dragging.id, zone);
    setDragging(null);
    setDragOver(null);
  }

  function applyPreset(p: Preset) {
    const cfg = p.build(mode);
    setRowsDims(cfg.rows.filter((d) => dimMap.has(d)));
    setColsDims(cfg.cols.filter((d) => dimMap.has(d)));
    setValueIds(cfg.values.filter((v) => measureMap.has(v)));
    setFilterDims([]);
    setFilterVals({});
    setSort(null);
    setExpandedRowKeys(new Set());
  }

  function resetAll() {
    const def = defaultConfig(mode);
    setRowsDims(def.rows);
    setColsDims(def.cols);
    setValueIds(def.values);
    setFilterDims([]);
    setFilterVals({});
    setSort(null);
    setExpandedRowKeys(new Set());
  }

  function applySavedView(view: SavedPivotView) {
    applyLayout(sanitizeLayout(view.layout, mode) ?? defaultLayout(mode));
    toast.success(`Visão "${view.name}" aplicada`, { description: "Ctrl+Z desfaz." });
  }

  // ----- Frase viva -----
  const phraseInputRef = useRef<HTMLInputElement>(null);
  const parsePhrase = useCallback(
    (text: string) => parsePivotPhrase(
      text,
      dims.map((d) => ({ id: d.id as string, label: d.label })),
      measureCatalog.map((m) => ({ id: m.id, label: m.label })),
      fieldStats?.distinct,
    ),
    [dims, measureCatalog, fieldStats],
  );
  // A frase descreve a tabela: o que ela não cita continua como está (só
  // medidas → mantém linhas/colunas; sem "só …" → mantém os filtros).
  function phraseToLayout(result: PivotPhraseResult): PivotLayout {
    const hasDims = result.rows.length + result.cols.length > 0;
    const hasFilters = result.filters.length > 0;
    const values = result.values.length ? result.values : valueIds;
    return {
      ...layout,
      rows: hasDims ? result.rows : rowsDims,
      cols: hasDims ? result.cols : colsDims,
      values,
      filterDims: hasFilters ? result.filters.map((f) => f.dim) : filterDims,
      filterVals: hasFilters ? Object.fromEntries(result.filters.map((f) => [f.dim, f.values])) : filterVals,
      sort: sort && values.includes(sort.measure) ? sort : null,
    };
  }
  function applyPhrase(result: PivotPhraseResult) {
    if (!result.understood) return;
    applyLayout(phraseToLayout(result));
    toast.success("Tabela montada pela frase", { description: "Ctrl+Z desfaz." });
  }
  const estimatePhrase = (result: PivotPhraseResult): LayoutSizeEstimate | null =>
    fieldStats ? estimateLayoutSize(phraseToLayout(result), countCombos, sizeLimits) : null;
  const currentSentence = describePivotLayout(layout, (id) => dimMap.get(id)?.label ?? measureMap.get(id)?.label ?? id);

  // "/" leva pra barra de frase (fora de campos de texto), como em buscadores.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      event.preventDefault();
      phraseInputRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Ex.: "Canal Ajustado · SKU × Mês — ROL", até 60 caracteres.
  const layoutName = useCallback((rowIds: string[], colIds: string[], measureIds: string[]) => {
    const dimLabel = (ids: string[]) => ids.map((id) => dimMap.get(id)?.label ?? id).join(" · ");
    const measures = measureIds.map((id) => measureMap.get(id)?.label ?? id).join(", ");
    const shape = [dimLabel(rowIds), dimLabel(colIds)].filter(Boolean).join(" × ");
    const full = [shape, measures].filter(Boolean).join(" — ");
    if (full.length <= 60) return full;
    const cut = full.slice(0, 59);
    const boundary = Math.max(cut.lastIndexOf(", "), cut.lastIndexOf(" "));
    return `${(boundary > 20 ? cut.slice(0, boundary) : cut).replace(/[,\s—×·]+$/, "")}…`;
  }, [dimMap, measureMap]);
  const suggestedViewName = useMemo(
    () => layoutName(rowsDims, colsDims, valueIds),
    [layoutName, rowsDims, colsDims, valueIds],
  );

  const canSendToSlide = isSendToSlideEnabledForPage("Tabela Dinâmica");

  function sendToSlide() {
    const labelOf = (id: string) => dimMap.get(id)?.label ?? measureMap.get(id)?.label ?? id;
    const { table, keptValues, notes } = buildPivotSlideTable({
      mode,
      layout: { rows: rowsDims, cols: colsDims, values: valueIds, filterVals, sort },
      globalFilters: globalFilters ?? {},
      globalPeriods: globalPeriods ?? null,
      rows: unified,
      labelOf,
    });
    if (!table) {
      toast.error("Esta montagem não pode ir para o slide", { description: notes[0] });
      return;
    }
    captureSendToSlide({
      source: {
        page: "Tabela Dinâmica",
        visualization: layoutName(table.rowDims, table.colDim ? [table.colDim] : [], keptValues) || "Tabela dinâmica",
      },
      target: { blockKind: "table", blockLabel: "Tabela" },
      config: { table: "pivot", ...table },
      notes,
    });
  }

  const usedItems = new Set([...rowsDims, ...colsDims, ...filterDims, ...valueIds]);
  const activeFiltersCount = Object.values(filterVals).reduce((acc, s) => acc + (s?.length ?? 0), 0);

  const matchesQuery = (label: string) =>
    paletteQuery.trim() === "" ||
    label.toLowerCase().includes(paletteQuery.trim().toLowerCase());

  const modeMeta = {
    real: { chip: "bg-primary text-primary-foreground", glow: "shadow-[0_0_24px_-4px_hsl(var(--primary)/0.6)]" },
    budget: { chip: "bg-accent text-accent-foreground", glow: "shadow-[0_0_24px_-4px_hsl(var(--accent)/0.6)]" },
    compare: { chip: "bg-foreground text-background", glow: "" },
  } as const;

  return (
    <div className="space-y-4">
      {/* ═════════════════ COMMAND BAR ═════════════════ */}
      {/* Achado 08 da análise de UX/UI: painéis internos reproduziam as
          classes do GlassCard cruas em vez de reusar o componente — mesmo
          resultado visual, código duplicado em pelo menos 5 lugares. */}
      <GlassCard surface="raised" className="relative overflow-hidden p-4 border-border/50 animate-fade-up">
        <div className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-primary/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 -bottom-20 h-52 w-52 rounded-full bg-accent/10 blur-3xl" />

        <div className="relative flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className={cn("inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary", modeMeta[mode].glow)}>
              <Sigma className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold tracking-tight">Pivot Studio</h2>
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", modeMeta[mode].chip)}>
                  {MODE_LABEL[mode]}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {pivot.leafRowHeaders.length.toLocaleString("pt-BR")} linhas · {selectedMeasures.length} medidas
                {activeFiltersCount > 0 && ` · ${activeFiltersCount} filtros`}
              </p>
            </div>
            {pivotLoading && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary">
                <Loader2 className="h-3 w-3 animate-spin" />
                Recalculando...
              </span>
            )}
          </div>

          <div className="flex-1" />

          {/* Mode switcher */}
          <div className="inline-flex rounded-xl border border-border/50 bg-secondary/40 p-1">
            {(["real", "budget", "compare"] as PivotMode[]).map((m) => {
              const disabled = m === "compare" && budgetRows.length === 0;
              return (
                <button
                  key={m}
                  onClick={() => !disabled && changeMode(m)}
                  disabled={disabled}
                  title={disabled ? "Carregue dados de Budget para usar este modo" : undefined}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all",
                    disabled && "cursor-not-allowed opacity-40",
                    mode === m
                      ? m === "real"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : m === "compare"
                          ? "bg-foreground text-background shadow-sm"
                          : "bg-accent text-accent-foreground shadow-sm"
                      : !disabled && "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {MODE_LABEL[m]}
                </button>
              );
            })}
          </div>

          {/* Viz mode (Heatmap | Valor) */}
          <div className="inline-flex rounded-xl border border-border/50 bg-secondary/40 p-1">
            {([
              { id: "heatmap" as const, icon: Flame, label: "Heatmap" },
              { id: "bars" as const, icon: BarChart3, label: "Barras" },
              { id: "plain" as const, icon: Hash, label: "Valor" },
            ]).map((v) => (
              <button
                key={v.id}
                onClick={() => setViz(v.id)}
                title={v.label}
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all",
                  viz === v.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <v.icon className="h-3.5 w-3.5" />
                {v.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => usePivotLayoutStore.getState().setDensity(density === "compact" ? "comfortable" : "compact")}
            aria-pressed={density === "compact"}
            title={density === "compact" ? "Linhas confortáveis" : "Linhas compactas (mais linhas na tela)"}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/50 text-muted-foreground hover:text-foreground",
              density === "compact" ? "bg-primary/10 text-primary" : "bg-secondary/40",
            )}
          >
            <Rows3 className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setFocusMode((on) => !on)}
            aria-pressed={focusMode}
            title={focusMode ? "Sair do modo foco (F)" : "Modo foco: só a tabela (F)"}
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-lg border border-border/50 px-2.5 text-[11px] font-medium transition-colors",
              focusMode ? "bg-primary/10 text-primary" : "bg-secondary/40 text-muted-foreground hover:text-foreground",
            )}
          >
            {focusMode ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            {focusMode ? "Sair do foco" : "Foco"}
          </button>

          {pivotShape.colDims.length > 0 && (
            <button
              type="button"
              onClick={() => setShowHighlights((v) => !v)}
              aria-pressed={showHighlights}
              title="Marca, em cada linha, os valores a mais de 2 desvios-padrão da média da linha (verde acima, vermelho abaixo)"
              className={cn(
                "inline-flex h-8 items-center gap-1 rounded-lg border border-border/50 px-2.5 text-[11px] font-medium transition-colors",
                showHighlights ? "bg-primary/10 text-primary" : "bg-secondary/40 text-muted-foreground hover:text-foreground",
              )}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Destaques
            </button>
          )}

          {trendAvailable && (
            <button
              type="button"
              onClick={() => setShowTrend((v) => !v)}
              aria-pressed={showTrend}
              title={showTrend ? "Esconder o minigráfico de tendência" : "Mostrar o minigráfico de tendência por linha"}
              className={cn(
                "inline-flex h-8 items-center gap-1 rounded-lg border border-border/50 px-2.5 text-[11px] font-medium transition-colors",
                showTrend ? "bg-primary/10 text-primary" : "bg-secondary/40 text-muted-foreground hover:text-foreground",
              )}
            >
              <TrendingUp className="h-3.5 w-3.5" />
              Tendência
            </button>
          )}

          {/* Hide empty */}
          <button
            onClick={() => setHideEmpty((h) => !h)}
            title={hideEmpty ? "Mostrar linhas vazias" : "Ocultar linhas vazias"}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/50 text-muted-foreground hover:text-foreground",
              hideEmpty ? "bg-primary/10 text-primary" : "bg-secondary/40",
            )}
          >
            {hideEmpty ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>

          {/* Export */}
          <ExportMenu
            pivot={pivot}
            measures={pivotShape.measures}
            rowDims={pivotShape.rowDims}
            colDims={pivotShape.colDims}
            dimMap={dimMap}
            tableRef={tableRef}
            modeLabel={MODE_LABEL[mode]}
            sortedRows={sortedRows}
            onExportReady={onExportReady}
          />

          {canSendToSlide && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={sendToSlide}
              disabled={valueIds.length === 0}
              title="Inserir esta montagem como tabela num slide"
              className="h-8 gap-1.5 border-border/50 bg-secondary/40 text-[11px]"
            >
              <Send className="h-3.5 w-3.5" />
              Enviar para Slide
            </Button>
          )}

          <div className="inline-flex items-center rounded-lg border border-border/50 bg-secondary/40">
            <button
              type="button"
              onClick={undoLayout}
              disabled={!canUndo}
              title="Desfazer (Ctrl+Z)"
              aria-label="Desfazer alteração na tabela"
              className="inline-flex h-8 w-8 items-center justify-center rounded-l-lg text-muted-foreground outline-none transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/60 disabled:pointer-events-none disabled:opacity-35"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={redoLayout}
              disabled={!canRedo}
              title="Refazer (Ctrl+Shift+Z)"
              aria-label="Refazer alteração na tabela"
              className="inline-flex h-8 w-8 items-center justify-center rounded-r-lg border-l border-border/50 text-muted-foreground outline-none transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/60 disabled:pointer-events-none disabled:opacity-35"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <Button
            size="sm"
            variant="ghost"
            onClick={resetAll}
            className="h-8 gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </Button>
        </div>

        {/* Presets row */}
        <div className="relative mt-3 flex flex-wrap items-center gap-1.5">
          <div className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            <Wand2 className="h-3 w-3" /> Presets
          </div>
          {PRESETS.filter((p) => p.modes.includes(mode)).map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p)}
              title={p.hint}
              className="group inline-flex items-center gap-1 rounded-full border border-border/50 bg-secondary/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-all hover:-translate-y-px hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
            >
              <Zap className="h-3 w-3 opacity-60 group-hover:opacity-100" />
              {p.label}
            </button>
          ))}
          <SavedViewsBar
            mode={mode}
            layout={layout}
            suggestedName={suggestedViewName}
            onApply={applySavedView}
          />
        </div>
      </GlassCard>

      {/* ═════════════════ MAIN GRID ═════════════════ */}
      <div
        className={cn(
          "grid min-w-0 grid-cols-1 gap-4",
          !focusMode && (paletteOpen ? "lg:grid-cols-[260px_minmax(0,1fr)]" : "lg:grid-cols-[44px_minmax(0,1fr)]"),
        )}
      >
        {/* PALETTE */}
        <aside className={cn("surface-panel relative min-w-0 space-y-3 rounded-2xl border border-border/40 p-3 backdrop-blur-xl", focusMode && "hidden")}>
          <button
            onClick={() => setPaletteOpen((o) => !o)}
            className="absolute -right-3 top-3 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground hover:text-foreground"
            title={paletteOpen ? "Fechar paleta" : "Abrir paleta"}
          >
            {paletteOpen ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          </button>

          {!paletteOpen && (
            <div className="flex flex-col items-center gap-2 py-2 text-muted-foreground">
              <Layers className="h-4 w-4" />
            </div>
          )}

          {paletteOpen && (
            <>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Layers className="h-3.5 w-3.5" /> Campos
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={paletteQuery}
                    onChange={(e) => setPaletteQuery(e.target.value)}
                    placeholder="Buscar…"
                    className="h-8 border-border/40 bg-secondary/40 pl-8 text-xs"
                  />
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
                  <Sparkles className="h-3 w-3" />
                  Clique para adicionar · arraste p/ outra zona
                </div>
              </div>

              {DIM_GROUPS.map((g) => {
                const items = dims.filter((d) => d.group === g && matchesQuery(d.label));
                if (items.length === 0) return null;
                return (
                  <div key={g} className="space-y-1.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      {g}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {items.map((d) => (
                        <Chip
                          key={d.id as string}
                          label={d.label}
                          hint={fieldStats ? `${d.label} · ${(fieldStats.distinct[d.id as string]?.length ?? 0).toLocaleString("pt-BR")} valores distintos` : undefined}
                          faded={usedItems.has(d.id as string)}
                          draggable
                          onClick={() => quickAdd(d.id as string)}
                          onDragStart={() => setDragging({ id: d.id as string, from: "palette" })}
                          onDragEnd={() => setDragging(null)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}

              <div className="space-y-1.5 border-t border-border/30 pt-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  Medidas
                </div>
                <div className="flex flex-wrap gap-1">
                  {measureCatalog.filter((m) => !m.formula && matchesQuery(m.label)).map((m) => (
                    <Chip
                      key={m.id}
                      label={m.label}
                      tone={m.tone}
                      faded={usedItems.has(m.id)}
                      draggable
                      onClick={() => quickAdd(m.id)}
                      onDragStart={() => setDragging({ id: m.id, from: "palette" })}
                      onDragEnd={() => setDragging(null)}
                    />
                  ))}
                </div>
              </div>

              {/* Campos calculados (fórmulas da pessoa sobre as medidas). */}
              <div className="space-y-1.5 border-t border-border/30 pt-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Calculados</div>
                  <button
                    type="button"
                    onClick={() => setCalcDialog({ field: null })}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-primary outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary/60"
                  >
                    <Plus className="h-3 w-3" /> Novo
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {measureCatalog.filter((m) => !!m.formula && matchesQuery(m.label)).map((m) => (
                    <span key={m.id} className="group/calc inline-flex items-center">
                      <Chip
                        label={m.label}
                        hint={`${m.label} = ${formulaForDisplay(m.formula!, (id) => measureMap.get(id)?.label ?? id)}`}
                        faded={usedItems.has(m.id)}
                        draggable
                        onClick={() => quickAdd(m.id)}
                        onDragStart={() => setDragging({ id: m.id, from: "palette" })}
                        onDragEnd={() => setDragging(null)}
                      />
                      <button
                        type="button"
                        onClick={() => setCalcDialog({ field: calcFields.find((f) => f.id === m.id) ?? null })}
                        aria-label={`Editar o campo ${m.label}`}
                        className="ml-0.5 rounded p-0.5 text-muted-foreground opacity-0 outline-none transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-primary/60 group-hover/calc:opacity-100"
                      >
                        <MoreHorizontal className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  {!measureCatalog.some((m) => m.formula) && (
                    <span className="text-[10px] leading-relaxed text-muted-foreground/60">
                      Crie medidas com fórmulas, como [ROL] / [Volume].
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </aside>

        {/* CONFIG ZONES + TABLE */}
        <div className="min-w-0 max-w-full space-y-3 overflow-hidden">
          {!focusMode && (
            <PivotPhraseBar
              inputRef={phraseInputRef}
              currentSentence={currentSentence}
              parse={parsePhrase}
              estimate={estimatePhrase}
              labelOf={(id) => dimMap.get(id)?.label ?? measureMap.get(id)?.label ?? id}
              onApply={applyPhrase}
            />
          )}
          <div className={cn("grid min-w-0 w-full grid-cols-2 gap-2 lg:grid-cols-4", focusMode && "hidden")}>
            <DropZone
              label="Filtros"
              icon={<FilterIcon className="h-3.5 w-3.5" />}
              accent="muted"
              zone="filters"
              count={filterDims.length}
              dragOver={dragOver === "filters"}
              preview={dropPreview("filters")}
              setDragOver={setDragOver}
              onDrop={() => handleDrop("filters")}
              headerAction={
                <ZoneAddButton
                  items={dims}
                  usedItems={usedItems}
                  onAdd={(id) => addToZone(id, "filters")}
                  placeholder="Adicionar filtro…"
                />
              }
            >
              {filterDims.length === 0 && <Hint>Arraste uma dimensão aqui</Hint>}
              {filterDims.map((id, idx) => {
                const allValues = allValuesByDim[id] ?? [];
                const selected = filterVals[id] ?? [];
                return (
                  <FilterChip
                    key={id}
                    label={dimMap.get(id)?.label ?? id}
                    values={allValues}
                    selected={selected}
                    onChange={(s) => setFilterVals((prev) => ({ ...prev, [id]: s }))}
                    onRemove={() => removeFromZone(id, "filters")}
                    currentZone="filters"
                    fieldKind="dimension"
                    onMoveToZone={(zone) => moveFieldToZone(id, "filters", zone)}
                    onMoveUp={idx > 0 ? () => moveAdjacent("filters", id, "up") : undefined}
                    onMoveDown={idx < filterDims.length - 1 ? () => moveAdjacent("filters", id, "down") : undefined}
                    draggable
                    onDragStart={() => setDragging({ id, from: "filters" })}
                    onDragOver={(e) => {
                      if (dragging && dragging.from === "filters" && dragging.id !== id) {
                        e.preventDefault();
                      }
                    }}
                    onDropOnChip={() => {
                      if (dragging && dragging.from === "filters" && dragging.id !== id) {
                        reorderInZone("filters", dragging.id, id);
                        setDragging(null);
                      }
                    }}
                    onDragEnd={() => setDragging(null)}
                  />
                );
              })}
            </DropZone>

            <DropZone
              label="Colunas"
              icon={<Columns3 className="h-3.5 w-3.5" />}
              accent="primary"
              zone="cols"
              count={colsDims.length}
              dragOver={dragOver === "cols"}
              preview={dropPreview("cols")}
              setDragOver={setDragOver}
              onDrop={() => handleDrop("cols")}
              headerAction={
                <ZoneAddButton
                  items={dims}
                  usedItems={usedItems}
                  onAdd={(id) => addToZone(id, "cols")}
                  placeholder="Adicionar coluna…"
                />
              }
            >
              {colsDims.length === 0 && <Hint>Arraste uma dimensão aqui</Hint>}
              {colsDims.map((id, idx) => (
                <Chip
                  key={id}
                  label={dimMap.get(id)?.label ?? id}
                  closable
                  onRemove={() => removeFromZone(id, "cols")}
                  currentZone="cols"
                  fieldKind="dimension"
                  onMoveToZone={(zone) => moveFieldToZone(id, "cols", zone)}
                  onMoveUp={idx > 0 ? () => moveAdjacent("cols", id, "up") : undefined}
                  onMoveDown={idx < colsDims.length - 1 ? () => moveAdjacent("cols", id, "down") : undefined}
                  draggable
                  onDragStart={() => setDragging({ id, from: "cols" })}
                  onDragOverChip={(e) => {
                    if (dragging && dragging.from === "cols" && dragging.id !== id) e.preventDefault();
                  }}
                  onDropOnChip={() => {
                    if (dragging && dragging.from === "cols" && dragging.id !== id) {
                      reorderInZone("cols", dragging.id, id);
                      setDragging(null);
                    }
                  }}
                  onDragEnd={() => setDragging(null)}
                />
              ))}
            </DropZone>

            <DropZone
              label="Linhas"
              icon={<Rows3 className="h-3.5 w-3.5" />}
              accent="primary"
              zone="rows"
              count={rowsDims.length}
              dragOver={dragOver === "rows"}
              preview={dropPreview("rows")}
              setDragOver={setDragOver}
              onDrop={() => handleDrop("rows")}
              headerAction={
                <ZoneAddButton
                  items={dims}
                  usedItems={usedItems}
                  onAdd={(id) => addToZone(id, "rows")}
                  placeholder="Adicionar linha…"
                />
              }
            >
              {rowsDims.length === 0 && <Hint>Arraste uma dimensão aqui</Hint>}
              {rowsDims.map((id, idx) => (
                <Chip
                  key={id}
                  label={dimMap.get(id)?.label ?? id}
                  closable
                  onRemove={() => removeFromZone(id, "rows")}
                  currentZone="rows"
                  fieldKind="dimension"
                  onMoveToZone={(zone) => moveFieldToZone(id, "rows", zone)}
                  onMoveUp={idx > 0 ? () => moveAdjacent("rows", id, "up") : undefined}
                  onMoveDown={idx < rowsDims.length - 1 ? () => moveAdjacent("rows", id, "down") : undefined}
                  draggable
                  onDragStart={() => setDragging({ id, from: "rows" })}
                  onDragOverChip={(e) => {
                    if (dragging && dragging.from === "rows" && dragging.id !== id) e.preventDefault();
                  }}
                  onDropOnChip={() => {
                    if (dragging && dragging.from === "rows" && dragging.id !== id) {
                      reorderInZone("rows", dragging.id, id);
                      setDragging(null);
                    }
                  }}
                  onDragEnd={() => setDragging(null)}
                />
              ))}
            </DropZone>

            <DropZone
              label="Valores"
              icon={<Sigma className="h-3.5 w-3.5" />}
              accent="accent"
              zone="values"
              count={valueIds.length}
              dragOver={dragOver === "values"}
              preview={dropPreview("values")}
              setDragOver={setDragOver}
              onDrop={() => handleDrop("values")}
              headerAction={
                <ZoneAddButton
                  items={measureCatalog}
                  usedItems={usedItems}
                  onAdd={(id) => addToZone(id, "values")}
                  placeholder="Adicionar medida…"
                />
              }
            >
              {valueIds.length === 0 && <Hint>Arraste uma medida aqui</Hint>}
              {valueIds.map((id, idx) => {
                const m = measureMap.get(id);
                return (
                  <Chip
                    key={id}
                    label={m?.label ?? id}
                    tone={m?.tone}
                    closable
                    onRemove={() => removeFromZone(id, "values")}
                    currentZone="values"
                    fieldKind="measure"
                    onMoveToZone={(zone) => moveFieldToZone(id, "values", zone)}
                    onMoveUp={idx > 0 ? () => moveAdjacent("values", id, "up") : undefined}
                    onMoveDown={idx < valueIds.length - 1 ? () => moveAdjacent("values", id, "down") : undefined}
                    draggable
                    onDragStart={() => setDragging({ id, from: "values" })}
                    onDragOverChip={(e) => {
                      if (dragging && dragging.from === "values" && dragging.id !== id) e.preventDefault();
                    }}
                    onDropOnChip={() => {
                      if (dragging && dragging.from === "values" && dragging.id !== id) {
                        reorderInZone("values", dragging.id, id);
                        setDragging(null);
                      }
                    }}
                    onDragEnd={() => setDragging(null)}
                  />
                );
              })}
            </DropZone>
          </div>

          {pivotSafety?.blocked && (
            <div className="rounded-2xl border border-warning/35 bg-warning/10 p-4 text-warning">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-warning/15">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div className="min-w-0 space-y-2">
                  <div className="text-sm font-semibold text-foreground">Tabela grande demais para recalcular com seguranca</div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    A configuracao atual geraria {pivotSafety.reason}. Para evitar travamento do aplicativo, o calculo
                    foi pausado antes de processar a base completa. Adicione filtros, reduza linhas/colunas ou remova
                    medidas ate a tabela ficar mais enxuta.
                  </p>
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded-full border border-warning/25 bg-background/40 px-2 py-1">
                      {formatNum(pivotSafety.estimate.filteredRowCount, 0, true)} registros filtrados
                    </span>
                    <span className="rounded-full border border-warning/25 bg-background/40 px-2 py-1">
                      {formatNum(pivotSafety.estimate.rowHeaderCount, 0, true)} linhas
                    </span>
                    <span className="rounded-full border border-warning/25 bg-background/40 px-2 py-1">
                      {formatNum(pivotSafety.estimate.colHeaderCount, 0, true)} colunas
                    </span>
                    <span className="rounded-full border border-warning/25 bg-background/40 px-2 py-1">
                      {formatNum(pivotSafety.estimate.visibleValueCellCount, 0, true)} celulas de valor
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!crashNotice && !pivotSafety?.blocked && groupDepthCount > 0 && pivot.rowHeaders.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <Rows3 className="h-3.5 w-3.5" />
              <span>Mostrar até</span>
              <div className="inline-flex rounded-lg border border-border/50 bg-secondary/40 p-0.5" role="group" aria-label="Nível da hierarquia">
                {pivotShape.rowDims.map((dim, level) => (
                  <button
                    key={dim}
                    type="button"
                    onClick={() => expandToLevel(level)}
                    aria-pressed={currentLevel === level}
                    className={cn(
                      "rounded-md px-2 py-0.5 font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/60",
                      currentLevel === level ? "bg-card text-foreground shadow-sm" : "hover:text-foreground",
                    )}
                  >
                    {dimMap.get(dim)?.label ?? dim}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!crashNotice && !pivotSafety?.blocked && (
            <PivotColLimitNotice
              estimate={pivotSafety?.estimate ?? null}
              showAll={showAllCols}
              colsLabel={colsDims.map((d) => dimMap.get(d)?.label ?? d).join(" · ")}
              measureLabel={(id) => measureMap.get(id)?.label ?? id}
              onShowAll={() => setShowAllCols(true)}
              onShowTop={() => setShowAllCols(false)}
            />
          )}

          {crashNotice && (
            <PivotCrashNotice
              crash={crashNotice}
              labelOf={(id) => dimMap.get(id)?.label ?? id}
              onOpenAnyway={leaveSafeMode}
              onStartLight={() => {
                leaveSafeMode();
                resetAll();
              }}
            />
          )}

          <div className={cn("flex min-w-0 items-start gap-3", crashNotice && "hidden")}>
          <div ref={tableRef} className="min-w-0 max-w-full flex-1">
            <PivotTable
              highlights={showHighlights}
              focusMode={focusMode}
              density={density}
              stale={showStale}
              pivot={pivot}
              measures={pivotShape.measures}
              rowDims={pivotShape.rowDims}
              colDims={pivotShape.colDims}
              dimMap={dimMap}
              viz={viz}
              sort={sort}
              setSort={setSort}
              sortedRows={visibleRows}
              expandedRowKeys={expandedRowKeys}
              onToggleRowGroup={handleToggleRowGroup}
              onOpenDrill={handleOpenDrill}
              sourceRows={unifiedRecords}
              pivotConfig={pivotShape.config}
              trendMeasure={trendAvailable && showTrend ? pivotShape.measures[0] ?? null : null}
            />
          </div>
          <DrillPanel
            selection={drillSelection}
            dimMap={dimMap}
            measures={pivotShape.measures}
            onOpenChange={(open) => {
              if (!open) setDrillSelection(null);
            }}
          />
          </div>
          <CalcFieldDialog
            open={!!calcDialog}
            field={calcDialog?.field ?? null}
            nativeMeasures={nativeMeasures}
            onSave={(input) => {
              const saved = usePivotLayoutStore.getState().saveCalcField({ ...input, mode });
              if (!input.id) setValueIds((prev) => (prev.includes(saved.id) ? prev : [...prev, saved.id]));
              setCalcDialog(null);
              toast.success(input.id ? `Campo "${saved.name}" atualizado` : `Campo "${saved.name}" criado`, {
                description: input.id ? undefined : "Já entrou em Valores.",
              });
            }}
            onDelete={(id) => {
              usePivotLayoutStore.getState().removeCalcField(id);
              setValueIds((prev) => prev.filter((x) => x !== id));
              setCalcDialog(null);
              toast.success("Campo calculado excluído");
            }}
            onClose={() => setCalcDialog(null)}
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================
//                       SUB-COMPONENTS
// ============================================================
const CALC_FORMATS: Array<{ id: PivotCalcField["format"]; label: string }> = [
  { id: "currency", label: "Moeda" },
  { id: "number", label: "Número" },
  { id: "percent", label: "Percentual" },
];

function CalcFieldDialog({
  open,
  field,
  nativeMeasures,
  onSave,
  onDelete,
  onClose,
}: {
  open: boolean;
  field: PivotCalcField | null;
  nativeMeasures: PivotMeasure[];
  onSave: (field: { id?: string; name: string; formula: string; format: PivotCalcField["format"] }) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const labelOf = useCallback((id: string) => nativeMeasures.find((m) => m.id === id)?.label ?? id, [nativeMeasures]);
  const [name, setName] = useState("");
  const [expr, setExpr] = useState("");
  const [format, setFormat] = useState<PivotCalcField["format"]>("number");
  const exprRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(field?.name ?? "");
    setExpr(field ? formulaForDisplay(field.formula, labelOf) : "");
    setFormat(field?.format ?? "number");
  }, [open, field, labelOf]);

  const resolve = useCallback((raw: string) => {
    const wanted = raw.trim().replace(/\s+/g, " ").toLowerCase();
    const hit = nativeMeasures.find((m) => m.id === raw.trim() || m.label.toLowerCase() === wanted);
    return hit ? hit.id : null;
  }, [nativeMeasures]);
  const parsed = useMemo(() => (expr.trim() ? parseFormula(expr, resolve) : null), [expr, resolve]);
  const canSave = !!name.trim() && !!parsed?.ok;

  const insert = (text: string) => {
    const el = exprRef.current;
    const start = el?.selectionStart ?? expr.length;
    const end = el?.selectionEnd ?? expr.length;
    const next = `${expr.slice(0, start)}${text}${expr.slice(end)}`;
    setExpr(next);
    requestAnimationFrame(() => {
      el?.focus();
      const caret = start + text.length;
      el?.setSelectionRange(caret, caret);
    });
  };

  const save = () => {
    if (!canSave || !parsed?.ok) return;
    onSave({ id: field?.id, name: name.trim(), formula: parsed.canonical, format });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{field ? "Editar campo calculado" : "Novo campo calculado"}</DialogTitle>
          <DialogDescription>
            Uma medida nova a partir das que já existem. É calculada depois de somar, em cada célula — então
            [CM] / [ROL] dá a margem certa de cada linha, não a média das margens.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="calc-name" className="text-xs font-medium">Nome</label>
            <Input id="calc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Margem após frete" className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="calc-expr" className="text-xs font-medium">Fórmula</label>
            <textarea
              id="calc-expr"
              ref={exprRef}
              value={expr}
              onChange={(e) => setExpr(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  save();
                }
              }}
              rows={2}
              placeholder="([CM] - [Frete s/ Vendas]) / [ROL]"
              spellCheck={false}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            />
            <div className="flex flex-wrap gap-1">
              {nativeMeasures.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => insert(`[${m.label}]`)}
                  className="rounded-full border border-border/60 bg-secondary/60 px-2 py-0.5 text-[11px] font-medium hover:bg-secondary"
                >
                  {m.label}
                </button>
              ))}
              {["+", "−", "×", "÷", "(", ")"].map((op) => (
                <button
                  key={op}
                  type="button"
                  onClick={() => insert(op === "(" || op === ")" ? op : ` ${op === "−" ? "-" : op} `)}
                  className="w-7 rounded-md border border-border/60 bg-background py-0.5 text-[11px] font-semibold hover:bg-secondary"
                  aria-label={`Inserir ${op}`}
                >
                  {op}
                </button>
              ))}
            </div>
            <p className={cn("min-h-[1.25rem] text-[11px]", parsed && !parsed.ok ? "text-destructive" : "text-muted-foreground")} role="status">
              {!parsed
                ? "Clique nas medidas e operadores ou digite, com as medidas entre colchetes."
                : "error" in parsed
                  ? parsed.error
                  : `Fórmula válida — usa ${parsed.deps.map(labelOf).join(", ")}.`}
            </p>
          </div>
          <div className="space-y-1.5">
            <span className="text-xs font-medium">Formato</span>
            <div className="inline-flex rounded-lg border border-border/50 bg-secondary/40 p-0.5" role="radiogroup" aria-label="Formato">
              {CALC_FORMATS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={format === f.id}
                  onClick={() => setFormat(f.id)}
                  className={cn("rounded-md px-2.5 py-1 text-[11px] font-medium", format === f.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {field ? (
            <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => onDelete(field.id)}>
              Excluir campo
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="button" onClick={save} disabled={!canSave}>{field ? "Salvar" : "Criar e adicionar"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PivotColLimitNotice({
  estimate,
  showAll,
  colsLabel,
  measureLabel,
  onShowAll,
  onShowTop,
}: {
  estimate: PivotSizeEstimate | null;
  showAll: boolean;
  colsLabel: string;
  measureLabel: (id: string) => string;
  onShowAll: () => void;
  onShowTop: () => void;
}) {
  if (!estimate) return null;
  const limited = estimate.hiddenColCount > 0;
  const canLimit = showAll && estimate.colHeaderCount > PIVOT_COL_LIMIT.threshold;
  if (!limited && !canLimit) return null;
  const total = limited ? estimate.colHeaderCount - 1 + estimate.hiddenColCount : estimate.colHeaderCount;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-primary/25 bg-primary/[0.06] px-3 py-2 text-xs text-muted-foreground animate-fade-in">
      <Columns3 className="h-3.5 w-3.5 shrink-0 text-primary" />
      {limited ? (
        <span>
          Mostrando as <strong className="font-semibold text-foreground">{PIVOT_COL_LIMIT.top}</strong> colunas de{" "}
          {colsLabel} com maior {measureLabel(estimate.colLimitMeasureId ?? "")}; as outras{" "}
          <strong className="font-semibold text-foreground">{estimate.hiddenColCount.toLocaleString("pt-BR")}</strong> estão
          somadas em "Outros".
        </span>
      ) : (
        <span>
          Mostrando todas as <strong className="font-semibold text-foreground">{total.toLocaleString("pt-BR")}</strong> colunas
          de {colsLabel}.
        </span>
      )}
      <button
        type="button"
        onClick={limited ? onShowAll : onShowTop}
        className="rounded-md px-1.5 py-0.5 font-medium text-primary outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        {limited ? `Mostrar todas as ${total.toLocaleString("pt-BR")}` : `Voltar às ${PIVOT_COL_LIMIT.top} maiores`}
      </button>
    </div>
  );
}

function PivotCrashNotice({
  crash,
  labelOf,
  onOpenAnyway,
  onStartLight,
}: {
  crash: CrashState;
  labelOf: (id: string) => string;
  onOpenAnyway: () => void;
  onStartLight: () => void;
}) {
  const crumb = crash.breadcrumb;
  const when = new Date(crash.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const describe = (ids: string[]) => (ids.length ? ids.map(labelOf).join(" · ") : "—");
  return (
    <GlassCard surface="panel" className="border-warning/35 p-5" role="alert">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="min-w-0 space-y-3">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">
              {crash.reason === "oom"
                ? "A Tabela Dinâmica fechou o app por falta de memória"
                : "A Tabela Dinâmica fechou o app inesperadamente"}
            </h3>
            <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
              Foi em {when}. Para não travar de novo, a última montagem foi restaurada nas zonas acima, mas não foi
              recalculada. A tabela agora só desenha as células que estão na tela, então essa montagem deve abrir
              normalmente.
            </p>
          </div>
          {crumb && (
            <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <span className="rounded-full border border-border/50 bg-background/40 px-2 py-1">Linhas: {describe(crumb.rows)}</span>
              <span className="rounded-full border border-border/50 bg-background/40 px-2 py-1">Colunas: {describe(crumb.cols)}</span>
              <span className="rounded-full border border-border/50 bg-background/40 px-2 py-1">
                {formatNum(crumb.cells, 0, true)} células de valor
              </span>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={onOpenAnyway} className="h-8 text-xs">
              Abrir a montagem mesmo assim
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onStartLight} className="h-8 text-xs">
              Começar com a montagem padrão
            </Button>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

// Achado 10 da análise de UX/UI: uma zona vazia sem nenhum indício visual
// de que aceita um campo solto ali. O texto já existia (por zona), mas
// sem destaque — agora ganha borda tracejada, o padrão universal de
// "solte aqui" em construtores de pivot/dashboard.
function Hint({ children }: { children: React.ReactNode }) {
  return (
    <span className="pointer-events-none select-none rounded-lg border border-dashed border-border/50 px-2 py-1 text-[10px] text-muted-foreground/60">
      {children}
    </span>
  );
}

function FieldMoveMenu({
  label,
  currentZone,
  fieldKind,
  onMoveToZone,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  label: string;
  currentZone: Zone;
  fieldKind: PivotFieldKind;
  onMoveToZone: (zone: Zone) => void;
  onRemove: () => void;
  /** Achado 12 da análise de UX/UI: reordenar DENTRO da mesma zona antes só
   * funcionava arrastando — sem equivalente por clique/teclado, diferente
   * de mover ENTRE zonas (que já tinha este menu). undefined quando o
   * campo já está na primeira/última posição da zona. */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const canMoveTo = (zone: Zone) => (fieldKind === "measure" ? zone === "values" : zone !== "values");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="ml-0.5 rounded-full p-0.5 opacity-60 outline-none transition hover:bg-foreground/10 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-primary/60"
          aria-label={`Ações de ${label}`}
          title={`Mover ou remover ${label}`}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="truncate text-xs">{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(onMoveUp || onMoveDown) && (
          <>
            <DropdownMenuItem
              disabled={!onMoveUp}
              onClick={(e) => {
                e.stopPropagation();
                onMoveUp?.();
              }}
              className="text-xs"
            >
              Mover pra cima
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!onMoveDown}
              onClick={(e) => {
                e.stopPropagation();
                onMoveDown?.();
              }}
              className="text-xs"
            >
              Mover pra baixo
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {(["rows", "cols", "values", "filters"] as Zone[]).map((zone) => {
          const disabled = zone === currentZone || !canMoveTo(zone);
          return (
            <DropdownMenuItem
              key={zone}
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                onMoveToZone(zone);
              }}
              className="text-xs"
            >
              Mover para {ZONE_LABELS[zone]}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="text-xs text-destructive focus:text-destructive"
        >
          Remover
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DrillPanel({
  selection,
  dimMap,
  measures,
  onOpenChange,
}: {
  selection: DrillSelection | null;
  dimMap: Map<string, DimMeta>;
  measures: PivotMeasure[];
  onOpenChange: (open: boolean) => void;
}) {
  const columns = useMemo(() => {
    if (!selection) return [] as { key: string; label: string }[];
    const preferred = [
      "periodo",
      "mesLabel",
      "sku",
      "skuDesc",
      "categoria",
      "subcategoria",
      "marca",
      "canalAjustado",
      "canal",
      "cliente",
      "regional",
      "uf",
    ];
    const measureFields = measures.map((m) => m.field);
    const keys = Array.from(new Set([...preferred, ...measureFields]));
    return keys
      .filter((key) => selection.rows.some((row) => {
        const value = row[key];
        return value !== null && value !== undefined && value !== "";
      }))
      .map((key) => ({
        key,
        label: dimMap.get(key)?.label ?? measures.find((m) => m.field === key)?.label ?? key,
      }));
  }, [dimMap, measures, selection]);

  const context = selection
    ? [
        selection.rowValues.length > 0 ? selection.rowValues.join(" · ") : "Todas as linhas",
        selection.colValues.length > 0 ? selection.colValues.join(" · ") : "Todas as colunas",
      ].join(" | ")
    : "";

  const previewRows = selection?.rows.slice(0, 500) ?? [];
  // Confere a célula: soma do campo nas linhas encontradas (só pra medidas
  // somadas diretamente — numa derivada, como CM%, a soma do campo não é o
  // valor exibido).
  const fieldSum = selection && selection.measure.agg === "sum" && !selection.measure.derive
    ? selection.rows.reduce((sum, row) => {
        const v = Number(row[selection.measure.field]);
        return isFinite(v) ? sum + v : sum;
      }, 0)
    : null;

  if (!selection) return null;

  // Painel ao lado da tabela, não modal: a tabela continua utilizável e um
  // duplo clique em outra célula troca o conteúdo do painel (antes era uma
  // folha modal por cima de tudo — pra ver outra célula, fechar e abrir).
  return (
    <aside
      aria-label="Detalhe da célula"
      className="surface-panel flex max-h-[calc(68vh+2.75rem)] w-[min(400px,38%)] shrink-0 flex-col overflow-hidden rounded-2xl border border-border/40 animate-fade-in"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onOpenChange(false);
        }
      }}
    >
      <div className="flex items-start gap-2 border-b border-border/40 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">Detalhe da célula</h3>
          <p className="truncate text-[11px] text-muted-foreground" title={`${selection.measure.label} · ${context}`}>
            <span className="font-medium text-foreground">{selection.measure.label}</span> · {context}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Fechar o detalhe"
          className="rounded-md p-1 text-muted-foreground outline-none hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-[11px] text-muted-foreground">
        <div className="tabular-nums">
          <strong className="font-semibold text-foreground">{selection.rows.length.toLocaleString("pt-BR")}</strong> linhas
          {selection.rows.length > previewRows.length && ` · exibindo ${previewRows.length.toLocaleString("pt-BR")}`}
          {fieldSum !== null && (
            <>
              {" · soma "}
              <strong className="font-semibold text-foreground">{fmtValue(selection.measure, fieldSum)}</strong>
            </>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-[11px]"
          disabled={selection.rows.length === 0 || columns.length === 0}
          onClick={() => {
            exportTableCsv(
              selection.rows,
              columns,
              `drill_pivot_${selection.measure.id}_${new Date().toISOString().slice(0, 10)}.csv`,
            );
          }}
        >
          <Download className="h-3.5 w-3.5" />
          CSV
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {previewRows.length === 0 ? (
          <div className="m-4 rounded-xl border border-dashed border-border/50 px-4 py-10 text-center text-sm text-muted-foreground">
            Nenhuma linha encontrada para esta célula.
          </div>
        ) : (
          <table className="w-full border-collapse text-[11px]">
            <thead className="sticky top-0 z-10">
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    className="whitespace-nowrap border-b border-border/40 bg-card px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, index) => (
                <tr key={index} className="border-b border-border/15 odd:bg-muted/20">
                  {columns.map((column) => (
                    <td key={column.key} className="max-w-[180px] truncate whitespace-nowrap px-2 py-1 tabular-nums">
                      {formatDrillValue(row[column.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </aside>
  );
}

function formatDrillValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return Number.isFinite(value) ? formatNum(value, 2) : "—";
  return String(value);
}

function Chip({
  label,
  tone,
  closable,
  faded,
  onRemove,
  currentZone,
  fieldKind,
  onMoveToZone,
  onMoveUp,
  onMoveDown,
  onClick,
  draggable,
  onDragStart,
  onDragEnd,
  onDragOverChip,
  onDropOnChip,
  hint,
}: {
  /** Dica no hover (ex.: quantos valores distintos a dimensão tem). */
  hint?: string;
  label: string;
  tone?: PivotMeasure["tone"];
  closable?: boolean;
  faded?: boolean;
  onRemove?: () => void;
  currentZone?: Zone;
  fieldKind?: PivotFieldKind;
  onMoveToZone?: (zone: Zone) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onClick?: () => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDragOverChip?: (e: React.DragEvent) => void;
  onDropOnChip?: () => void;
}) {
  const toneRing =
    tone === "budget"
      ? "border-accent/40 bg-accent/10 text-violet-700 hover:bg-accent/20 dark:text-accent-foreground"
      : tone === "delta"
        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
        : tone === "real"
          ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
          : "border-border/60 bg-secondary/60 text-foreground hover:bg-secondary";

  return (
    <span
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart?.();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        onDragOverChip?.(e);
      }}
      onDrop={(e) => {
        if (onDropOnChip) {
          e.preventDefault();
          e.stopPropagation();
          onDropOnChip();
        }
      }}
      onClick={onClick}
      onKeyDown={(event) => {
        if (!onClick) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onClick();
      }}
      tabIndex={0}
      role={onClick ? "button" : undefined}
      aria-label={onClick ? `Adicionar campo ${label}` : `Campo ${label}`}
      title={hint}
      className={cn(
        "group inline-flex cursor-grab select-none items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium shadow-sm outline-none transition-all hover:-translate-y-px hover:shadow focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:cursor-grabbing",
        toneRing,
        faded && "opacity-50",
      )}
    >
      <GripVertical className="h-3 w-3 opacity-40 transition-opacity group-hover:opacity-80" />
      {label}
      {currentZone && fieldKind && onMoveToZone && onRemove && (
        <FieldMoveMenu
          label={label}
          currentZone={currentZone}
          fieldKind={fieldKind}
          onMoveToZone={onMoveToZone}
          onRemove={onRemove}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
        />
      )}
      {closable && !currentZone && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.();
          }}
          className="ml-0.5 rounded-full p-0.5 opacity-60 outline-none hover:bg-foreground/10 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-primary/60"
          aria-label="Remover"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

function FilterChip({
  label,
  values,
  selected,
  onChange,
  onRemove,
  currentZone,
  fieldKind,
  onMoveToZone,
  onMoveUp,
  onMoveDown,
  draggable,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDropOnChip,
}: {
  label: string;
  values: string[];
  /** ordem definida pelo usuário */
  selected: string[];
  onChange: (next: string[]) => void;
  onRemove: () => void;
  currentZone: Zone;
  fieldKind: PivotFieldKind;
  onMoveToZone: (zone: Zone) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDropOnChip?: () => void;
}) {
  const [q, setQ] = useState("");
  const count = selected.length;
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const filtered = values.filter((v) => v.toLowerCase().includes(q.toLowerCase()));

  // drag-reorder dentro do popover
  const [internalDrag, setInternalDrag] = useState<string | null>(null);

  function moveItem(from: string, to: string) {
    if (from === to) return;
    const next = selected.slice();
    const fi = next.indexOf(from);
    const ti = next.indexOf(to);
    if (fi < 0 || ti < 0) return;
    next.splice(fi, 1);
    next.splice(ti, 0, from);
    onChange(next);
  }

  return (
    <span
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart?.();
      }}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={(e) => {
        if (onDropOnChip) {
          e.preventDefault();
          e.stopPropagation();
          onDropOnChip();
        }
      }}
      className="inline-flex items-center"
    >
      <Popover>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "inline-flex cursor-grab items-center gap-1 rounded-l-full border border-r-0 px-2 py-0.5 text-[11px] font-medium outline-none transition-all hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:cursor-grabbing",
              count > 0
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border/60 bg-secondary/60 text-foreground",
            )}
          >
            <GripVertical className="h-3 w-3 opacity-40" />
            {label}
            {count > 0 && (
              <span className="ml-1 rounded-full bg-primary/20 px-1.5 text-[10px]">{count}</span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <div className="flex items-center justify-between border-b border-border/40 px-3 py-2 text-[11px] font-semibold">
            <span>{label}</span>
            <span className="text-muted-foreground font-normal">{values.length} valores</span>
          </div>

          {/* Lista ordenável dos selecionados */}
          {selected.length > 0 && (
            <div className="border-b border-border/30 p-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Ordem (arraste)
              </div>
              <div className="space-y-1">
                {selected.map((v) => (
                  <div
                    key={`sel-${v}`}
                    draggable
                    onDragStart={(e) => {
                      e.stopPropagation();
                      setInternalDrag(v);
                    }}
                    onDragOver={(e) => {
                      if (internalDrag && internalDrag !== v) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (internalDrag) moveItem(internalDrag, v);
                      setInternalDrag(null);
                    }}
                    onDragEnd={() => setInternalDrag(null)}
                    tabIndex={0}
                    role="listitem"
                    aria-label={`Valor selecionado ${v}. Use o mouse para reordenar.`}
                    className={cn(
                      "flex cursor-grab items-center gap-2 rounded border border-border/40 bg-secondary/40 px-2 py-1 text-xs outline-none transition-colors hover:bg-secondary/70 focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:cursor-grabbing",
                      internalDrag === v && "opacity-50",
                    )}
                  >
                    <GripVertical className="h-3 w-3 text-muted-foreground" />
                    <span className="flex-1 truncate">{v}</span>
                    <button
                      onClick={() => onChange(selected.filter((x) => x !== v))}
                      className="rounded p-0.5 opacity-60 outline-none hover:bg-foreground/10 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-primary/60"
                      aria-label={`Remover ${v}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-b border-border/30 p-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar valor…" className="h-7 text-xs" />
          </div>
          <div className="max-h-56 overflow-auto p-1">
            {filtered.map((v) => {
              const checked = selectedSet.has(v);
              return (
                <label
                  key={v}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-secondary/60"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(c) => {
                      if (c) {
                        if (!selectedSet.has(v)) onChange([...selected, v]);
                      } else {
                        onChange(selected.filter((x) => x !== v));
                      }
                    }}
                  />
                  <span className="truncate">{v}</span>
                </label>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">Nenhum valor</div>
            )}
          </div>
          <div className="flex items-center justify-between border-t border-border/40 p-2">
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => onChange([])}>
              Limpar
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => onChange(filtered)}>
              Todos
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <span className="inline-flex items-center rounded-r-full border border-l-0 border-border/60 bg-secondary/60 px-1 py-0.5">
        <FieldMoveMenu
          label={label}
          currentZone={currentZone}
          fieldKind={fieldKind}
          onMoveToZone={onMoveToZone}
          onRemove={onRemove}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
        />
      </span>
    </span>
  );
}

// "Minhas visões": montagens salvas com nome, por modo, ao lado dos presets.
function SavedViewsBar({
  mode,
  layout,
  suggestedName,
  onApply,
}: {
  mode: PivotMode;
  layout: PivotLayout;
  suggestedName: string;
  onApply: (view: SavedPivotView) => void;
}) {
  const allViews = usePivotLayoutStore((s) => s.savedViews);
  const saveView = usePivotLayoutStore((s) => s.saveView);
  const deleteView = usePivotLayoutStore((s) => s.deleteView);
  const restoreView = usePivotLayoutStore((s) => s.restoreView);
  const views = useMemo(() => allViews.filter((view) => view.mode === mode), [allViews, mode]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const replacing = views.some((view) => view.name.toLowerCase() === trimmed.toLowerCase());
    saveView(trimmed, mode, layout);
    setOpen(false);
    toast.success(replacing ? `Visão "${trimmed}" atualizada` : `Visão "${trimmed}" salva`);
  };

  const remove = (view: SavedPivotView) => {
    const index = allViews.findIndex((existing) => existing.id === view.id);
    deleteView(view.id);
    toast(`Visão "${view.name}" excluída`, {
      action: { label: "Desfazer", onClick: () => restoreView(view, index) },
    });
  };

  return (
    <>
      <span aria-hidden className="mx-1 h-4 w-px bg-border/60" />
      {views.length > 0 && (
        <div className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          <Bookmark className="h-3 w-3" /> Minhas visões
        </div>
      )}
      {views.map((view) => (
        <span
          key={view.id}
          className="group inline-flex items-center rounded-full border border-primary/30 bg-primary/10 text-[11px] font-medium text-primary transition-all hover:-translate-y-px hover:border-primary/50"
        >
          <button
            type="button"
            onClick={() => onApply(view)}
            title={`Aplicar a visão "${view.name}"`}
            className="max-w-[220px] truncate rounded-l-full py-1 pl-2.5 pr-1 outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            {view.name}
          </button>
          <button
            type="button"
            onClick={() => remove(view)}
            aria-label={`Excluir a visão ${view.name}`}
            title="Excluir visão"
            className="rounded-r-full py-1 pl-0.5 pr-2 opacity-50 outline-none transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setName(suggestedName);
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground outline-none transition-all hover:border-primary/50 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <BookmarkPlus className="h-3 w-3" />
            Salvar visão
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 space-y-2 p-3" align="start">
          <div className="text-xs font-semibold">Salvar esta montagem</div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Linhas, colunas, medidas, filtros e ordenação. Salvar com um nome que já existe atualiza a visão.
          </p>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nome da visão"
              maxLength={60}
              className="h-8 text-xs"
            />
            <Button type="submit" size="sm" className="h-8" disabled={!name.trim()}>
              Salvar
            </Button>
          </form>
        </PopoverContent>
      </Popover>
    </>
  );
}

// Achado 11 da análise de UX/UI: sem isto, colocar um campo numa zona
// específica sem arrastar exigia clicar na paleta (que sempre manda pro
// destino padrão) e depois abrir o menu "⋮" pra mover — 4 passos. Este
// botão adiciona direto na zona onde ele está, um segundo caminho completo
// que não depende do drag nenhuma vez.
function ZoneAddButton({
  items,
  usedItems,
  onAdd,
  placeholder,
}: {
  items: { id: string; label: string }[];
  usedItems: Set<string>;
  onAdd: (id: string) => void;
  placeholder: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const filtered = items.filter((it) => it.label.toLowerCase().includes(q.toLowerCase()));

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQ("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded-full p-0.5 text-muted-foreground outline-none transition hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/60"
          aria-label={placeholder}
          title={placeholder}
        >
          <Plus className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="end">
        <div className="border-b border-border/30 p-2">
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
            className="h-7 text-xs"
          />
        </div>
        <div className="max-h-56 overflow-auto p-1">
          {filtered.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => {
                onAdd(it.id);
                setOpen(false);
                setQ("");
              }}
              className={cn(
                "flex w-full items-center rounded px-2 py-1 text-left text-xs hover:bg-secondary/60",
                usedItems.has(it.id) && "text-muted-foreground",
              )}
            >
              <span className="truncate">{it.label}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">Nenhum campo</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DropZone({
  label,
  icon,
  zone,
  count,
  accent,
  dragOver,
  setDragOver,
  onDrop,
  children,
  headerAction,
  preview,
}: {
  label: string;
  icon: React.ReactNode;
  zone: Zone;
  count: number;
  accent: "primary" | "accent" | "muted";
  dragOver: boolean;
  setDragOver: (z: Zone | null) => void;
  onDrop: () => void;
  children: React.ReactNode;
  headerAction?: React.ReactNode;
  /** Arrastando sobre a zona: tamanho que a tabela teria ao soltar aqui. */
  preview?: LayoutSizeEstimate | null;
}) {
  const accentRing =
    accent === "primary"
      ? "before:bg-primary/70"
      : accent === "accent"
        ? "before:bg-accent/70"
        : "before:bg-muted-foreground/40";

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(zone);
      }}
      onDragLeave={() => setDragOver(null)}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      className={cn(
        "surface-panel relative min-h-[78px] min-w-0 overflow-hidden rounded-xl border p-2.5 transition-all",
        "before:absolute before:left-0 before:top-0 before:h-full before:w-[3px] before:rounded-l-xl",
        accentRing,
        dragOver
          ? "scale-[1.01] border-primary/60 bg-primary/5 shadow-lg shadow-primary/10"
          : "border-border/40",
      )}
    >
      <div className="mb-1.5 flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="flex items-center gap-1">
          {count > 0 && (
            <span className="rounded-full bg-secondary/80 px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
              {count}
            </span>
          )}
          {headerAction}
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap gap-1">{children}</div>
      {preview && <LayoutSizeLine estimate={preview} className="mt-1.5" />}
    </div>
  );
}

const SIZE_TONE_CLASS: Record<LayoutSizeEstimate["tone"], string> = {
  ok: "border-border/50 bg-background/60 text-muted-foreground",
  warn: "border-warning/40 bg-warning/10 text-warning",
  danger: "border-destructive/40 bg-destructive/10 text-destructive",
};

/** "≈ 14 linhas × 51 colunas · 2,1 mil células" — pelas combinações que existem na base. */
function LayoutSizeLine({ estimate, className }: { estimate: LayoutSizeEstimate; className?: string }) {
  const verdict = estimate.tone === "danger"
    ? "grande demais: o cálculo vai pausar"
    : estimate.tone === "warn"
      ? "pesada"
      : null;
  return (
    <div
      className={cn(
        "inline-flex max-w-full flex-wrap items-center gap-x-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
        SIZE_TONE_CLASS[estimate.tone],
        className,
      )}
      role="status"
    >
      <span>
        ≈ {formatNum(estimate.rows, 0, true)} {estimate.rows === 1 ? "linha" : "linhas"} ×{" "}
        {formatNum(estimate.colsShown, 0, true)} {estimate.colsShown === 1 ? "coluna" : "colunas"}
      </span>
      {estimate.colsLimited && <span className="opacity-80">(50 maiores + Outros)</span>}
      <span>· {formatNum(estimate.cells, 0, true)} células</span>
      {verdict && <span className="font-semibold">· {verdict}</span>}
    </div>
  );
}

function PivotPhraseBar({
  inputRef,
  currentSentence,
  parse,
  estimate,
  labelOf,
  onApply,
}: {
  inputRef: React.RefObject<HTMLInputElement>;
  currentSentence: string;
  parse: (text: string) => PivotPhraseResult;
  estimate: (result: PivotPhraseResult) => LayoutSizeEstimate | null;
  labelOf: (id: string) => string;
  onApply: (result: PivotPhraseResult) => void;
}) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(text), 120);
    return () => window.clearTimeout(id);
  }, [text]);
  const result = useMemo(() => (debounced.trim() ? parse(debounced) : null), [debounced, parse]);
  const size = result?.understood ? estimate(result) : null;

  const submit = () => {
    const current = text.trim() ? parse(text) : null;
    if (!current?.understood) return;
    onApply(current);
    setText("");
    setDebounced("");
  };

  const list = (ids: string[], sep = ", ") => ids.map(labelOf).join(sep);
  const chip = "inline-flex max-w-full items-center gap-1 truncate rounded-md border border-border/50 bg-secondary/50 px-1.5 py-0.5";

  return (
    <div className="space-y-1.5">
      <div
        className={cn(
          "surface-panel flex h-10 items-center gap-2 rounded-xl border px-3 transition-colors",
          focused ? "border-primary/50 ring-2 ring-primary/15" : "border-border/40",
        )}
      >
        <Wand2 className={cn("h-4 w-4 shrink-0", focused || text ? "text-primary" : "text-muted-foreground")} />
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setText("");
              setDebounced("");
              e.currentTarget.blur();
            }
          }}
          placeholder={
            focused || !currentSentence
              ? "Descreva a tabela: ROL e CM% por Marca × Mês, só Varejo"
              : `${currentSentence} — descreva outra tabela`
          }
          aria-label="Descrever a tabela em uma frase"
          className="h-full min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/70"
        />
        {text ? (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={submit}
            disabled={!result?.understood}
            className="shrink-0 rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
          >
            Montar
          </button>
        ) : (
          <kbd className="hidden shrink-0 rounded border border-border/60 bg-secondary/50 px-1.5 text-[10px] font-medium text-muted-foreground sm:inline">
            /
          </kbd>
        )}
      </div>
      {result && (
        <div className="flex flex-wrap items-center gap-1.5 px-1 text-[11px] text-muted-foreground" aria-live="polite">
          {!result.understood ? (
            <span>Não reconheci nenhum campo. Use nomes como ROL, CM%, Volume, Marca, Mês, Canal.</span>
          ) : (
            <>
              {result.values.length > 0 && <span className={chip}>Valores: <strong className="font-semibold text-foreground">{list(result.values)}</strong></span>}
              {result.rows.length > 0 && <span className={chip}>Linhas: <strong className="font-semibold text-foreground">{list(result.rows, " › ")}</strong></span>}
              {result.cols.length > 0 && <span className={chip}>Colunas: <strong className="font-semibold text-foreground">{list(result.cols, " › ")}</strong></span>}
              {result.filters.map((f) => (
                <span key={f.dim} className={chip}>
                  {labelOf(f.dim)}:{" "}
                  <strong className="font-semibold text-foreground">
                    {f.values.length > 3 ? `${f.values.slice(0, 3).join(", ")} +${f.values.length - 3}` : f.values.join(", ")}
                  </strong>
                </span>
              ))}
              {size && <LayoutSizeLine estimate={size} />}
              {result.unknown.length > 0 && (
                <span className="text-warning">Não entendi: {result.unknown.map((w) => `"${w}"`).join(", ")}</span>
              )}
              <span className="text-muted-foreground/70">Enter monta · Esc limpa</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
//                         TABLE
// ============================================================
interface DimMeta { id: string; label: string; group: string }

// A tabela é dividida em cabeçalho e linhas memoizados. Antes, cada evento de
// rolagem (e cada linha que o mouse cruzava) re-renderizava o cabeçalho
// inteiro — com um menu de "mostrar como" por coluna × medida — e todas as
// linhas visíveis: ~60-100ms por passo de rolagem com 12 meses × 3 medidas.
// Agora a rolagem só monta as linhas que entram na janela, e o realce da
// linha sob o cursor é CSS puro.
//
// Crash por falta de memória (rodada 3): só as LINHAS eram virtualizadas —
// as colunas eram sempre desenhadas inteiras. Com SKU nas colunas, 32 linhas
// × 400 SKUs × 6 medidas já davam 66 mil <td>, 91 mil nós de DOM e 2,4 mil
// elementos com backdrop-blur (+170 MB de heap, 2 s travado); com a base real
// e o limite de 3.000 colunas o processo visual estourava a memória ("oom" no
// log do Electron). Agora as colunas também entram por janela, cada célula é
// só um <td> sem closures (clique/teclado delegados no <tbody>), o menu
// "mostrar como" é um só pra tabela inteira e as células fixas usam fundo
// opaco em vez de backdrop-blur (cada uma virava uma camada de composição).
type ShowAsMap = Record<string, ShowAsMode>;
type PivotCellsByCol = Map<string, Record<string, number | null>>;

const NO_COL_HEADERS: PivotColHeader[] = [{ key: "__all__", values: [], depth: 0, isLeaf: true }];
// Coluna Total à direita (soma de todas as colunas da linha). O motor sempre
// calculou `rowTotals` e o Excel exportado sempre teve essa coluna — só a
// tabela na tela não mostrava.
const TOTAL_COL_KEY = "__total__";
const TOTAL_COL_HEADER: PivotColHeader = { key: TOTAL_COL_KEY, values: ["Total"], depth: 0, isLeaf: true };
const PERCENT_HEAT_RANGE: HeatRange = { min: 0, max: 1 };
const EMPTY_HEAT_RANGE: HeatRange = { min: 0, max: 0 };
const EMPTY_ROW_CELLS: PivotCellsByCol = new Map();
const EMPTY_TOTAL: Record<string, number | null> = {};
// A janela de linhas virtualizadas anda em saltos de N linhas: rolar dentro do
// salto não re-renderiza nada (o overscan cobre a folga).
const PIVOT_VIRTUAL_WINDOW_STEP = 6;
/** Acima de tantas colunas de valor (grupos de coluna × medidas), as colunas entram por janela. */
const PIVOT_COL_VIRTUAL_THRESHOLD = 48;
/** Grupos de coluna extras desenhados de cada lado da área visível. */
const PIVOT_COL_OVERSCAN = 2;
/** Largura média de um caractere em text-xs com tabular-nums (px). */
const PIVOT_CHAR_PX = 7.2;

/** Um cabeçalho de coluna do pivot (ou o Total) — ocupa uma coluna por medida. */
type ColGroup = { col: PivotColHeader; isTotal: boolean };

type ColWindow = {
  /** Grupos desenhados agora (todos, quando as colunas não estão virtualizadas). */
  groups: ColGroup[];
  /** Índice (entre todos os grupos) do 1º grupo desenhado. */
  start: number;
  virtual: boolean;
  /** Larguras fixas (colgroup + table-layout fixed): texto longo é cortado com "…". */
  fixed: boolean;
  /** Largura dos espaçadores à esquerda/direita da janela, em px. */
  leftPx: number;
  rightPx: number;
};

/**
 * Largura fixa de uma coluna de medida quando as colunas estão virtualizadas
 * (a janela precisa saber onde cada coluna começa). Estimada pelo maior
 * número que a medida exibe — total geral, mín/máx das células e totais de
 * coluna — e pelo rótulo do cabeçalho.
 */
function measureColumnWidth(m: PivotMeasure, pivot: PivotResult): number {
  let chars = 4;
  const consider = (v: number | null | undefined) => {
    if (v == null || !isFinite(v)) return;
    const len = fmtValue(m, v).length;
    if (len > chars) chars = len;
  };
  consider(pivot.grandTotal[m.id]);
  consider(pivot.measureMin[m.id]);
  consider(pivot.measureMax[m.id]);
  for (const totals of pivot.colTotals.values()) consider(totals[m.id]);
  const valuePx = chars * PIVOT_CHAR_PX + 20;
  // Rótulo em caixa alta + ícones de "mostrar como" e de ordenação.
  const headerPx = m.label.length * PIVOT_CHAR_PX + 48;
  return Math.round(Math.min(220, Math.max(76, valuePx, headerPx)));
}

function rowDimColumnWidth(idx: number, dimCount: number, label: string, rows: PivotRowHeader[], hasRowGroups: boolean): number {
  let chars = label.length;
  for (const row of rows) {
    const len = row.values[idx]?.length ?? 0;
    if (len > chars) chars = len;
    if (chars >= 48) {
      chars = 48;
      break;
    }
  }
  let px = chars * PIVOT_CHAR_PX + 24;
  if (hasRowGroups && idx < dimCount - 1) px += 24 + 9 * PIVOT_CHAR_PX; // botão de expandir + " subtotal"
  if (hasRowGroups && idx === dimCount - 1) px += 14; // recuo das folhas
  return Math.round(Math.min(360, Math.max(88, px)));
}

// ----- Tendência (minigráfico por linha) -----
/** Dimensões de tempo: com só elas nas colunas, cada linha vira uma série. */
const TIME_DIM_IDS = new Set(["fy", "periodo", "mesLabel"]);
const TREND_COL_WIDTH = 108;
const TREND_W = 84;
const TREND_H = 20;

const Sparkline = memo(function Sparkline({
  values,
  tone,
  label,
  format,
  height = TREND_H,
}: {
  values: Array<number | null | undefined>;
  tone?: PivotMeasure["tone"];
  label: string;
  format: (v: number) => string;
  /** Mais baixo na densidade compacta, pra não esticar a linha. */
  height?: number;
}) {
  const TREND_H = height;
  const points: Array<[number, number]> = [];
  values.forEach((v, i) => {
    if (v != null && isFinite(v)) points.push([i, v]);
  });
  if (points.length < 2) return <span className="text-[10px] text-muted-foreground/50">—</span>;
  let min = Infinity;
  let max = -Infinity;
  for (const [, v] of points) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min || 1;
  const pad = 2.5;
  const x = (i: number) => pad + (i / Math.max(1, values.length - 1)) * (TREND_W - pad * 2);
  const y = (v: number) => TREND_H - pad - ((v - min) / span) * (TREND_H - pad * 2);
  const line = points.map(([i, v], k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points[points.length - 1][0]).toFixed(1)},${TREND_H} L${x(points[0][0]).toFixed(1)},${TREND_H} Z`;
  const [lastI, last] = points[points.length - 1];
  const first = points[0][1];
  const change = first !== 0 ? (last - first) / Math.abs(first) : null;
  const color = tone === "budget" ? "hsl(var(--accent))" : "hsl(var(--primary))";
  const summary = `${label}: de ${format(first)} para ${format(last)}${change != null ? ` (${change >= 0 ? "+" : ""}${(change * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)` : ""}`;
  return (
    <svg width={TREND_W} height={TREND_H} viewBox={`0 0 ${TREND_W} ${TREND_H}`} role="img" aria-label={summary} className="block overflow-visible">
      <title>{summary}</title>
      <path d={area} fill={color} opacity={0.12} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(lastI)} cy={y(last)} r={2.2} fill={color} />
    </svg>
  );
});

// ----- Seleção estilo planilha -----
type CellPos = { r: number; c: number };
type CellSelection = { anchor: CellPos; focus: CellPos };
/** Acima disso, Ctrl+C avisa em vez de montar um texto gigante na memória. */
const PIVOT_COPY_MAX_CELLS = 200_000;

/** Valor exibido numa célula (com "mostrar como" aplicado), igual ao da tela. */
function displayValueAt(
  pivot: PivotResult,
  row: PivotRowHeader,
  group: ColGroup,
  m: PivotMeasure,
  showAs: ShowAsMode,
): number | null {
  const rowTotal = pivot.rowTotals.get(row.key) ?? EMPTY_TOTAL;
  if (group.isTotal) {
    return applyShowAs(rowTotal[m.id] ?? null, showAs, {
      rowTotal: rowTotal[m.id],
      colTotal: pivot.grandTotal[m.id],
      grandTotal: pivot.grandTotal[m.id],
    });
  }
  const raw = pivot.cells.get(row.key)?.get(group.col.key)?.[m.id] ?? null;
  return applyShowAs(raw, showAs, {
    rowTotal: rowTotal[m.id],
    colTotal: pivot.colTotals.get(group.col.key)?.[m.id],
    grandTotal: pivot.grandTotal[m.id],
  });
}

/**
 * Número pra colar no Excel em português: vírgula decimal, sem separador de
 * milhar (o Excel pt-BR reconhece como número), percentual com "%".
 */
function clipboardNumber(v: number | null, m: PivotMeasure, showAs: ShowAsMode): string {
  if (v == null || !isFinite(v)) return "";
  const opts = { maximumFractionDigits: 4, useGrouping: false } as const;
  if (showAs !== "normal" || m.format === "percent") return `${(v * 100).toLocaleString("pt-BR", opts)}%`;
  return (m.format === "tons" ? v / 1000 : v).toLocaleString("pt-BR", opts);
}

function withShadow(style: React.CSSProperties | undefined, boxShadow: string | undefined): React.CSSProperties | undefined {
  if (!boxShadow) return style;
  return style ? { ...style, boxShadow } : { boxShadow };
}

/** Rola o mínimo pra célula sair de baixo do cabeçalho/rodapé/colunas fixas. */
function ensureCellVisible(scroller: HTMLElement, td: HTMLElement): void {
  const box = scroller.getBoundingClientRect();
  const cell = td.getBoundingClientRect();
  const headBottom = scroller.querySelector("thead")?.getBoundingClientRect().bottom ?? box.top;
  const footTop = scroller.querySelector("tfoot")?.getBoundingClientRect().top ?? box.bottom;
  let stickyRight = box.left;
  for (const el of Array.from(td.parentElement?.children ?? [])) {
    if ((el as HTMLElement).dataset.ci !== undefined) break;
    if (getComputedStyle(el).position === "sticky") stickyRight = Math.max(stickyRight, el.getBoundingClientRect().right);
  }
  if (cell.top < headBottom) scroller.scrollTop -= headBottom - cell.top;
  else if (cell.bottom > footTop) scroller.scrollTop += cell.bottom - footTop;
  if (cell.left < stickyRight) scroller.scrollLeft -= stickyRight - cell.left;
  else if (cell.right > box.right) scroller.scrollLeft += cell.right - box.right;
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

const PivotHeader = memo(function PivotHeader({
  rowDims,
  colWindow,
  hasCols,
  measures,
  dimMap,
  sort,
  onToggleSort,
  showAsByMeasure,
  onOpenShowAsMenu,
  groupLabelStickyLeft,
  rowDimStickyLefts,
  colLevels,
  trendLabel,
  trendStickyLeft,
  onResizeMeasure,
}: {
  /** Arrastar a borda do cabeçalho de uma medida; null volta à largura automática. */
  onResizeMeasure: (measureId: string, width: number | null) => void;
  /** Coluna "Tendência": rótulo da medida, ou null quando não há. */
  trendLabel: string | null;
  /** Colunas virtualizadas: a Tendência fica fixa logo após as dimensões. */
  trendStickyLeft: number | null;
  /** Quantas dimensões de coluna — uma linha de cabeçalho por dimensão. */
  colLevels: number;
  rowDims: string[];
  colWindow: ColWindow;
  /** Colunas virtualizadas: o rótulo do grupo gruda logo após as colunas fixas. */
  groupLabelStickyLeft: number | null;
  /** Colunas virtualizadas: deslocamento `left` de cada coluna de dimensão (todas fixas). */
  rowDimStickyLefts: number[] | null;
  hasCols: boolean;
  measures: PivotMeasure[];
  dimMap: Map<string, DimMeta>;
  sort: SortState;
  onToggleSort: (colKey: string, measureId: string) => void;
  showAsByMeasure: ShowAsMap;
  onOpenShowAsMenu: (measureId: string, x: number, y: number, returnFocus: HTMLElement | null) => void;
}) {
  const headerPad = "py-1.5 px-2";
  const thBase = "border-b border-border/40 bg-card";
  const dimTh = cn(thBase, "text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground", headerPad);
  const spacer = (key: string) => (colWindow.virtual ? <th key={key} aria-hidden className={cn(thBase, "p-0")} /> : null);
  const totalSortIcon = (measureId: string) => {
    const isSorted = sort && sort.col === TOTAL_COL_KEY && sort.measure === measureId;
    if (!isSorted) return <ArrowUpDown className="h-3 w-3 opacity-20" />;
    return sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };
  // Borda arrastável do cabeçalho de medida (vale pra todas as colunas da medida).
  const resizeHandle = (m: PivotMeasure) => (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={`Ajustar a largura de ${m.label}`}
      title="Arraste para ajustar a largura · duplo clique volta ao automático"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onResizeMeasure(m.id, null);
      }}
      onMouseDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        const th = event.currentTarget.parentElement as HTMLElement;
        const startX = event.clientX;
        const startWidth = th.getBoundingClientRect().width;
        let frame = 0;
        const move = (ev: MouseEvent) => {
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => onResizeMeasure(m.id, startWidth + ev.clientX - startX));
        };
        const up = () => {
          window.removeEventListener("mousemove", move);
          window.removeEventListener("mouseup", up);
          document.body.style.cursor = "";
        };
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
        document.body.style.cursor = "col-resize";
      }}
      className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize select-none hover:bg-primary/40"
    />
  );
  // Rótulo de grupo de coluna: centralizado; com colunas virtualizadas, gruda
  // na borda (um grupo com várias medidas passa fácil da largura da tela).
  const groupLabel = (label: string) => (groupLabelStickyLeft === null ? label : (
    <span className="sticky inline-block max-w-full truncate align-bottom" style={{ left: groupLabelStickyLeft + 8 }}>
      {label}
    </span>
  ));
  // Uma linha de cabeçalho por dimensão de coluna: FY em cima, mês embaixo,
  // com o FY mesclado sobre os seus meses. (Antes: um rótulo só, "FY25/26 ·
  // Jan/26", repetido em cada coluna.)
  const levels = Math.max(1, colLevels);
  const levelRows = hasCols
    ? Array.from({ length: levels }, (_, level) => {
        const spans: Array<{ key: string; label: string; count: number; fullHeight: boolean }> = [];
        for (const { col, isTotal } of colWindow.groups) {
          // Total e "Outros" (Top N) não têm níveis: ocupam todas as linhas.
          const fullHeight = isTotal || col.key === PIVOT_OTHERS_COL_KEY;
          if (fullHeight) {
            if (level === 0) spans.push({ key: col.key, label: isTotal ? "Total" : col.values.join(" · "), count: 1, fullHeight: levels > 1 || isTotal });
            continue;
          }
          const label = levels === 1 ? col.values.join(" · ") : (col.values[level] ?? "");
          const prefix = levels === 1 ? col.key : col.values.slice(0, level + 1).join("\u001f");
          const last = spans[spans.length - 1];
          if (last && !last.fullHeight && last.key === prefix) last.count += 1;
          else spans.push({ key: prefix, label, count: 1, fullHeight: false });
        }
        return spans;
      })
    : [];
  return (
    <thead className="sticky top-0 z-20">
      {levelRows.map((spans, level) => (
        <tr key={`lvl-${level}`}>
          {rowDims.map((d, i) => (
            <th
              key={`rh-${d}`}
              className={cn(dimTh, (i === 0 || rowDimStickyLefts) && "sticky left-0 z-10")}
              style={rowDimStickyLefts && i > 0 ? { left: rowDimStickyLefts[i] } : undefined}
            >
              {level === 0 && (dimMap.get(d)?.label ?? d)}
            </th>
          ))}
          {rowDims.length === 0 && <th className={cn("sticky left-0 z-10", thBase, headerPad)} />}
          {level === 0 && trendLabel && (
            <th
              rowSpan={levels + 1}
              className={cn(dimTh, "border-l normal-case tracking-normal", trendStickyLeft !== null && "sticky z-10")}
              style={trendStickyLeft !== null ? { left: trendStickyLeft } : undefined}
            >
              <span className="flex items-center gap-1 uppercase tracking-wider">
                <TrendingUp className="h-3 w-3" /> Tendência
              </span>
              <span className="block truncate text-[10px] font-medium text-muted-foreground/70">{trendLabel}</span>
            </th>
          )}
          {spacer(`ls-l${level}`)}
          {spans.map((span) => {
            const isTotal = span.key === TOTAL_COL_KEY;
            const rowSpan = span.fullHeight && levels > 1 ? levels : undefined;
            return (
              <th
                key={`ch-${level}-${span.key}`}
                colSpan={span.count * measures.length}
                rowSpan={rowSpan}
                title={colWindow.virtual ? span.label : undefined}
                className={cn(
                  thBase,
                  isTotal ? "border-l-2 border-l-border/50" : "border-l",
                  "text-[11px] font-semibold",
                  level < levels - 1 && !rowSpan && "text-muted-foreground",
                  headerPad,
                  // Níveis de cima abrangem várias colunas: rótulo no começo do
                  // trecho (centralizado, sumia fora da tela).
                  groupLabelStickyLeft === null && (levels === 1 || level === levels - 1 || rowSpan) ? "text-center" : "text-left",
                )}
              >
                {groupLabel(span.label)}
              </th>
            );
          })}
          {spacer(`rs-l${level}`)}
        </tr>
      ))}
      <tr>
        {rowDims.map((d, idx) => (
          <th
            key={`rh2-${d}`}
            className={cn(dimTh, (idx === 0 || rowDimStickyLefts) && "sticky left-0 z-10")}
            style={rowDimStickyLefts && idx > 0 ? { left: rowDimStickyLefts[idx] } : undefined}
          >
            {!hasCols && (dimMap.get(d)?.label ?? d)}
          </th>
        ))}
        {/* Sem dimensões de linha, a 1ª coluna é um espaço reservado nas duas
            linhas do cabeçalho — antes faltava nesta quando havia colunas, e
            os rótulos das medidas ficavam deslocados uma coluna pra esquerda. */}
        {rowDims.length === 0 && <th className={cn("sticky left-0 z-10", thBase, headerPad)} />}
        {spacer("ls-2")}
        {colWindow.groups.map(({ col, isTotal }) =>
          measures.map((m, idx) => {
            if (isTotal) {
              const isSorted = sort && sort.col === TOTAL_COL_KEY && sort.measure === m.id;
              return (
                <th
                  key={`mh-total-${m.id}`}
                  onClick={() => onToggleSort(TOTAL_COL_KEY, m.id)}
                  title="Clique para ordenar pelo total da linha"
                  className={cn(
                    thBase,
                    "relative cursor-pointer select-none text-right text-[10px] font-semibold uppercase tracking-wider transition-colors hover:bg-secondary",
                    headerPad,
                    idx === 0 ? "border-l-2 border-l-border/50" : "border-l",
                    toneClass(m.tone),
                    isSorted && "text-primary",
                    colWindow.fixed && "truncate",
                  )}
                >
                  <span className="inline-flex items-center justify-end gap-1">
                    {m.label}
                    {totalSortIcon(m.id)}
                  </span>
                  {resizeHandle(m)}
                </th>
              );
            }
            const isSorted = sort && sort.col === col.key && sort.measure === m.id;
            const showAs = showAsByMeasure[m.id] ?? "normal";
            return (
              <th
                key={`mh-${col.key}-${m.id}`}
                onClick={() => onToggleSort(col.key, m.id)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  onOpenShowAsMenu(m.id, event.clientX, event.clientY, null);
                }}
                className={cn(
                  thBase,
                  "relative cursor-pointer select-none border-l text-right text-[10px] font-semibold uppercase tracking-wider transition-colors hover:bg-secondary",
                  headerPad,
                  toneClass(m.tone),
                  isSorted && "text-primary",
                  showAs !== "normal" && "text-primary shadow-[inset_0_-2px_0_hsl(var(--primary))]",
                  colWindow.fixed && "truncate",
                )}
                title="Clique para ordenar. Clique com o botão direito (ou no ⋯) para mostrar valores como."
              >
                <span className="group inline-flex items-center justify-end gap-1">
                  {m.label}
                  {showAs !== "normal" && (
                    <span className="rounded-full bg-primary/15 px-1 text-[9px] normal-case tracking-normal text-primary">%</span>
                  )}
                  {/* Achado 07 da análise de UX/UI: "mostrar como %" só existia via
                      clique-direito — baixa descoberta. Este gatilho visível abre o
                      mesmo menu (um só pra tabela inteira), sem tirar o clique-direito. */}
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      const rect = event.currentTarget.getBoundingClientRect();
                      onOpenShowAsMenu(m.id, rect.left, rect.bottom, event.currentTarget);
                    }}
                    className="rounded p-0.5 normal-case opacity-0 outline-none transition-opacity hover:bg-foreground/10 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-primary/60 group-hover:opacity-60 hover:opacity-100"
                    aria-label={`Mostrar ${m.label} como…`}
                    title="Mostrar valores como"
                  >
                    <MoreHorizontal className="h-3 w-3" />
                  </button>
                  {isSorted ? (
                    sort!.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                  ) : (
                    <ArrowUpDown className="h-3 w-3 opacity-20" />
                  )}
                </span>
                {resizeHandle(m)}
              </th>
            );
          }),
        )}
        {spacer("rs-2")}
      </tr>
    </thead>
  );
});

const PivotBodyRow = memo(function PivotBodyRow({
  row,
  index,
  virtualized,
  rowDims,
  hasRowGroups,
  expanded,
  colWindow,
  measures,
  cells,
  rowTotal,
  colTotals,
  grandTotal,
  viz,
  showAsByMeasure,
  rangeByMeasure,
  onToggleRowGroup,
  rowDimStickyLefts,
  selC0,
  selC1,
  selEdges,
  focusC,
  trendMeasure,
  trendCols,
  trendLeft,
  rowHeight,
  compact,
  outlierCols,
}: {
  /** Destaques ligados: colunas usadas pra média/desvio da linha (null = desligado). */
  outlierCols: PivotColHeader[] | null;
  rowHeight: number;
  compact: boolean;
  trendMeasure: PivotMeasure | null;
  trendCols: PivotColHeader[];
  trendLeft: number | null;
  rowDimStickyLefts: number[] | null;
  /** Esta linha é a 1ª (1) e/ou a última (2) da seleção — pra desenhar a borda do retângulo. */
  selEdges: number;
  /** Colunas selecionadas nesta linha (índices de coluna de valor), -1 = nenhuma. */
  selC0: number;
  selC1: number;
  /** Coluna com o foco do teclado nesta linha (-1 = nenhuma) — recebe tabIndex 0. */
  focusC: number;
  row: PivotRowHeader;
  index: number;
  virtualized: boolean;
  rowDims: string[];
  hasRowGroups: boolean;
  expanded: boolean;
  colWindow: ColWindow;
  measures: PivotMeasure[];
  cells: PivotCellsByCol;
  rowTotal: Record<string, number | null>;
  colTotals: Map<string, Record<string, number | null>>;
  grandTotal: Record<string, number | null>;
  viz: VizMode;
  showAsByMeasure: ShowAsMap;
  rangeByMeasure: Map<string, HeatRange>;
  onToggleRowGroup: (key: string) => void;
}) {
  const cellPad = compact ? "py-0.5 px-2" : "py-1 px-2";
  const isGroup = !row.isLeaf;
  const isGroupedLeaf = hasRowGroups && row.isLeaf && !!row.parentKey;
  const clip = colWindow.fixed && "overflow-hidden text-ellipsis";
  // Destaques automáticos: na linha, valores a 2+ desvios-padrão da média da
  // própria linha (ex.: o mês que destoou). Calculado sobre todas as colunas,
  // não só as desenhadas; só em folhas e com 6+ valores (abaixo disso nenhum
  // ponto consegue ficar a 2 desvios).
  const outliers = useMemo(() => {
    if (!outlierCols || !row.isLeaf || outlierCols.length < 6) return null;
    const found = new Map<string, number>();
    for (const m of measures) {
      const showAs = showAsByMeasure[m.id] ?? "normal";
      const values: Array<[string, number]> = [];
      for (const col of outlierCols) {
        const v = applyShowAs(cells.get(col.key)?.[m.id] ?? null, showAs, {
          rowTotal: rowTotal[m.id],
          colTotal: colTotals.get(col.key)?.[m.id],
          grandTotal: grandTotal[m.id],
        });
        if (v != null && isFinite(v)) values.push([col.key, v]);
      }
      if (values.length < 6) continue;
      const mean = values.reduce((sum, [, v]) => sum + v, 0) / values.length;
      const sd = Math.sqrt(values.reduce((sum, [, v]) => sum + (v - mean) ** 2, 0) / values.length);
      if (!(sd > 0)) continue;
      for (const [key, v] of values) {
        const z = (v - mean) / sd;
        if (Math.abs(z) >= 2) found.set(`${key}\u001f${m.id}`, z);
      }
    }
    return found.size ? found : null;
  }, [outlierCols, row.isLeaf, measures, showAsByMeasure, cells, rowTotal, colTotals, grandTotal]);
  // Seleção por sombras internas: um tom por cima da cor do heatmap (estilo
  // inline) e uma borda contornando o retângulo, como numa planilha.
  const selectClass = (c: number) =>
    c === focusC && selC0 >= 0 ? "outline outline-2 -outline-offset-2 outline-primary" : undefined;
  const selectShadow = (c: number): string | undefined => {
    if (selC0 < 0 || c < selC0 || c > selC1) return undefined;
    const edge = "hsl(var(--primary))";
    const shadows = ["inset 0 0 0 9999px hsl(var(--primary) / 0.24)"];
    if (c === selC0) shadows.push(`inset 2px 0 0 ${edge}`);
    if (c === selC1) shadows.push(`inset -2px 0 0 ${edge}`);
    if (selEdges & 1) shadows.push(`inset 0 2px 0 ${edge}`);
    if (selEdges & 2) shadows.push(`inset 0 -2px 0 ${edge}`);
    return shadows.reverse().join(", ");
  };
  return (
    <tr
      data-rk={row.key}
      data-ri={index}
      style={virtualized ? { height: rowHeight } : undefined}
      className={cn(
        "group border-b border-border/15 transition-colors hover:bg-primary/[0.06]",
        index % 2 === 0 && "bg-background/30",
      )}
    >
      {rowDims.map((_, idx) => {
        // Cada nível mostra o rótulo na coluna da sua dimensão: grupo de
        // profundidade d na coluna d; folha agrupada só na última.
        const labelCol = isGroup ? row.depth : isGroupedLeaf ? rowDims.length - 1 : -1;
        const value = labelCol < 0 ? row.values[idx] ?? "" : idx === labelCol ? row.values[idx] ?? "" : "";
        const shouldShowLeafIndent = isGroupedLeaf && idx === labelCol;
        const isLabelCell = isGroup && idx === row.depth;
        // Tom do subtotal por sombra interna (mantém opaco o fundo da célula
        // fixa); mais leve nos níveis mais fundos da hierarquia.
        const groupTint = isGroup ? `inset 0 0 0 9999px hsl(var(--secondary) / ${Math.max(0.12, 0.38 - row.depth * 0.12)})` : undefined;
        const cellStyle: React.CSSProperties | undefined =
          rowDimStickyLefts && idx > 0 ? { left: rowDimStickyLefts[idx], boxShadow: groupTint } : groupTint ? { boxShadow: groupTint } : undefined;
        return (
          <td
            key={`rv-${idx}`}
            style={cellStyle}
            className={cn(
              "text-foreground",
              cellPad,
              clip,
              idx === 0 && "sticky left-0 z-[1] bg-card font-medium",
              // Rolando dezenas de colunas pro lado, a 2ª dimensão (ex.: Marca
              // dentro da Categoria) sumia e a linha ficava sem identificação.
              idx > 0 && rowDimStickyLefts && "sticky z-[1] bg-card",
              isGroup && "font-semibold",
            )}
          >
            <span
              className="inline-flex min-w-0 max-w-full items-center gap-1.5"
              style={shouldShowLeafIndent ? { paddingLeft: "14px" } : undefined}
            >
              {isLabelCell && (
                <button
                  type="button"
                  aria-label={expanded ? "Recolher grupo" : "Expandir grupo"}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleRowGroup(row.key);
                  }}
                  className={cn(
                    "inline-flex shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                    compact ? "h-4 w-4" : "h-5 w-5",
                  )}
                >
                  {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </button>
              )}
              <span
                className={cn("min-w-0 truncate", isLabelCell && "text-foreground")}
                title={colWindow.fixed && value ? value : undefined}
              >
                {value}
                {isLabelCell ? " subtotal" : ""}
              </span>
            </span>
          </td>
        );
      })}
      {rowDims.length === 0 && (
        <td className={cn("sticky left-0 z-[1] bg-card font-semibold text-muted-foreground", cellPad)}>—</td>
      )}
      {trendMeasure && (
        <td
          className={cn("border-l border-border/10 px-2", compact ? "py-0" : "py-0.5", trendLeft !== null && "sticky z-[1] bg-card")}
          style={trendLeft !== null ? { left: trendLeft } : undefined}
        >
          <Sparkline
            values={trendCols.map((c) => cells.get(c.key)?.[trendMeasure.id])}
            tone={trendMeasure.tone}
            label={trendMeasure.label}
            format={(v) => fmtValue(trendMeasure, v)}
            height={compact ? 14 : TREND_H}
          />
        </td>
      )}
      {colWindow.virtual && <td aria-hidden className="p-0" />}
      {colWindow.groups.map(({ col, isTotal }, gi) => {
        const groupBase = (colWindow.start + gi) * measures.length;
        if (isTotal) {
          return measures.map((m, idx) => {
            const showAs = showAsByMeasure[m.id] ?? "normal";
            const c = groupBase + idx;
            // Na coluna Total, o "total da coluna" é o total geral.
            const displayValue = applyShowAs(rowTotal[m.id] ?? null, showAs, {
              rowTotal: rowTotal[m.id],
              colTotal: grandTotal[m.id],
              grandTotal: grandTotal[m.id],
            });
            return (
              <td
                key={`t-${m.id}`}
                data-ci={c}
                data-ck={TOTAL_COL_KEY}
                data-m={m.id}
                role="gridcell"
                aria-selected={c >= selC0 && c <= selC1}
                tabIndex={c === focusC ? 0 : -1}
                style={selectShadow(c) ? { boxShadow: selectShadow(c) } : undefined}
                title="Duplo clique (ou Enter) para ver as linhas que compõem o total da linha"
                className={cn(
                  "cursor-cell whitespace-nowrap bg-secondary/20 text-right font-semibold tabular-nums outline-none transition-colors hover:ring-1 hover:ring-primary/40 focus-visible:ring-2 focus-visible:ring-primary/60",
                  cellPad,
                  clip,
                  idx === 0 ? "border-l-2 border-border/40" : "border-l border-border/10",
                  toneClass(m.tone, displayValue),
                  selectClass(c),
                )}
              >
                {fmtPivotDisplay(m, displayValue, showAs)}
              </td>
            );
          });
        }
        const cell = cells.get(col.key);
        const canDrill = cell !== undefined;
        return measures.map((m, mi) => {
          const c = groupBase + mi;
          const z = outliers?.get(`${col.key}\u001f${m.id}`);
          const rawValue = cell?.[m.id] ?? null;
          const showAs = showAsByMeasure[m.id] ?? "normal";
          const displayValue = applyShowAs(rawValue, showAs, {
            rowTotal: rowTotal[m.id],
            colTotal: colTotals.get(col.key)?.[m.id],
            grandTotal: grandTotal[m.id],
          });
          const range = showAs === "normal" ? (rangeByMeasure.get(m.id) ?? EMPTY_HEAT_RANGE) : PERCENT_HEAT_RANGE;
          return (
            <td
              key={`v-${col.key}-${m.id}`}
              data-ci={c}
              data-ck={canDrill ? col.key : undefined}
              data-m={canDrill ? m.id : undefined}
              role="gridcell"
              aria-selected={c >= selC0 && c <= selC1}
              tabIndex={c === focusC ? 0 : -1}
              title={
                [
                  z !== undefined
                    ? `Fora do padrão da linha: ${Math.abs(z).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} desvios ${z > 0 ? "acima" : "abaixo"} da média`
                    : null,
                  canDrill ? "Duplo clique (ou Enter) para ver as linhas que compõem este valor" : null,
                ].filter(Boolean).join(" · ") || undefined
              }
              style={withShadow(cellBg(viz, m, displayValue, range), selectShadow(c))}
              className={cn(
                "cursor-cell whitespace-nowrap border-l border-border/10 text-right tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/60",
                cellPad,
                clip,
                isGroup && "bg-secondary/25 font-semibold",
                toneClass(m.tone, displayValue),
                canDrill && "hover:ring-1 hover:ring-primary/40",
                z !== undefined && "relative",
                selectClass(c),
              )}
            >
              {z !== undefined && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-1 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full",
                    z > 0 ? "bg-emerald-500" : "bg-rose-500",
                  )}
                />
              )}
              {fmtPivotDisplay(m, displayValue, showAs)}
            </td>
          );
        });
      })}
      {colWindow.virtual && <td aria-hidden className="p-0" />}
    </tr>
  );
});

const PivotTable = memo(function PivotTable({
  pivot,
  measures,
  rowDims,
  colDims,
  dimMap,
  viz,
  sort,
  setSort,
  sortedRows,
  expandedRowKeys,
  onToggleRowGroup,
  onOpenDrill,
  sourceRows,
  pivotConfig,
  trendMeasure,
  focusMode,
  density,
  stale,
  highlights,
}: {
  /** Destaques automáticos (valores fora do padrão da linha). */
  highlights: boolean;
  /** Modo foco: a tabela ganha a altura da tela. */
  focusMode: boolean;
  density: PivotDensity;
  /** Recalculando: mostra a tabela anterior esmaecida, com barra de progresso. */
  stale: boolean;
  /** Medida do minigráfico de tendência (null = sem coluna Tendência). */
  trendMeasure: PivotMeasure | null;
  pivot: PivotResult;
  measures: PivotMeasure[];
  rowDims: string[];
  colDims: string[];
  dimMap: Map<string, DimMeta>;
  viz: VizMode;
  sort: SortState;
  setSort: (s: SortState) => void;
  sortedRows: PivotRowHeader[];
  expandedRowKeys: Set<string>;
  onToggleRowGroup: (key: string) => void;
  onOpenDrill: (selection: DrillSelection) => void;
  sourceRows: PivotDetailRow[];
  pivotConfig: PivotConfig;
}) {
  const hasCols = colDims.length > 0 && pivot.colHeaders.length > 0;
  const hasRowGroups = useMemo(() => pivot.rowHeaders.some((row) => !row.isLeaf), [pivot.rowHeaders]);
  const cols = hasCols ? pivot.colHeaders : NO_COL_HEADERS;
  const [showAsByMeasure, setShowAsByMeasure] = useState<ShowAsMap>({});
  const [showAsMenu, setShowAsMenu] = useState<{ measureId: string; x: number; y: number } | null>(null);
  const showAsReturnFocusRef = useRef<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [windowStart, setWindowStart] = useState(0);
  const windowStartRef = useRef(0);
  const [colStart, setColStart] = useState(0);
  const colStartRef = useRef(0);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  // Com colunas, a coluna Total fecha a tabela (como no Excel exportado).
  const showTotal = hasCols;
  const shouldVirtualize = sortedRows.length > PIVOT_VIRTUAL_ROW_THRESHOLD;
  const compact = density === "compact";
  const rowHeight = compact ? 22 : PIVOT_VIRTUAL_ROW_HEIGHT;
  const compactText = "text-[11px] leading-4";

  const allGroups = useMemo<ColGroup[]>(() => {
    const groups: ColGroup[] = cols.map((col) => ({ col, isTotal: false }));
    if (showTotal) groups.push({ col: TOTAL_COL_HEADER, isTotal: true });
    return groups;
  }, [cols, showTotal]);
  const colVirtual = allGroups.length * measures.length > PIVOT_COL_VIRTUAL_THRESHOLD;
  // Larguras ajustadas pela pessoa (arrastar a borda do cabeçalho), por
  // medida — valem pra todas as colunas daquela medida.
  const [widthOverrides, setWidthOverrides] = useState<Record<string, number>>({});
  const hasOverrides = measures.some((m) => widthOverrides[m.id] !== undefined);
  // Larguras fixas (colgroup): sempre que as colunas são virtualizadas ou
  // alguma foi ajustada à mão.
  const fixedLayout = colVirtual || hasOverrides;
  const measureWidths = useMemo(
    () => (fixedLayout ? measures.map((m) => widthOverrides[m.id] ?? measureColumnWidth(m, pivot)) : []),
    [fixedLayout, measures, pivot, widthOverrides],
  );
  const groupWidth = Math.max(1, measureWidths.reduce((sum, w) => sum + w, 0));
  const handleResizeMeasure = useCallback((measureId: string, width: number | null) => {
    setWidthOverrides((prev) => {
      const next = { ...prev };
      if (width === null) delete next[measureId];
      else next[measureId] = Math.round(Math.min(480, Math.max(56, width)));
      return next;
    });
  }, []);
  const rowDimWidths = useMemo(() => {
    if (!fixedLayout) return [];
    if (rowDims.length === 0) return [64];
    return rowDims.map((d, idx) => rowDimColumnWidth(idx, rowDims.length, dimMap.get(d)?.label ?? d, pivot.rowHeaders, hasRowGroups));
  }, [fixedLayout, rowDims, dimMap, pivot.rowHeaders, hasRowGroups]);

  const colWindow = useMemo<ColWindow>(() => {
    if (!colVirtual) return { groups: allGroups, start: 0, virtual: false, fixed: fixedLayout, leftPx: 0, rightPx: 0 };
    const visibleCount = Math.ceil(Math.max(viewport.width, groupWidth) / groupWidth);
    const start = Math.min(colStart, Math.max(0, allGroups.length - 1));
    const end = Math.min(allGroups.length, start + visibleCount + PIVOT_COL_OVERSCAN * 2);
    return {
      groups: allGroups.slice(start, end),
      start,
      virtual: true,
      fixed: true,
      leftPx: start * groupWidth,
      rightPx: (allGroups.length - end) * groupWidth,
    };
  }, [colVirtual, fixedLayout, allGroups, colStart, viewport.width, groupWidth]);

  const trendCols = useMemo(
    () => (trendMeasure && hasCols ? pivot.colHeaders.filter((c) => c.key !== PIVOT_OTHERS_COL_KEY) : []),
    [trendMeasure, hasCols, pivot.colHeaders],
  );
  const trend = trendCols.length >= 3 ? trendMeasure : null;
  const outlierCols = useMemo(
    () => (highlights && hasCols ? pivot.colHeaders.filter((c) => c.key !== PIVOT_OTHERS_COL_KEY) : null),
    [highlights, hasCols, pivot.colHeaders],
  );
  const trendWidth = fixedLayout && trend ? TREND_COL_WIDTH : 0;
  const rowDimsWidth = rowDimWidths.reduce((sum, w) => sum + w, 0);
  const rowDimStickyLefts = useMemo(() => {
    if (!colVirtual || rowDims.length === 0) return null;
    let left = 0;
    return rowDimWidths.map((w) => {
      const offset = left;
      left += w;
      return offset;
    });
  }, [colVirtual, rowDims.length, rowDimWidths]);
  const tableWidth = fixedLayout ? rowDimsWidth + trendWidth + allGroups.length * groupWidth : undefined;
  const renderedColumnCount =
    Math.max(1, rowDims.length) + (trend ? 1 : 0) + (colWindow.virtual ? 2 : 0) + colWindow.groups.length * measures.length;
  // Com colunas virtualizadas, a Tendência fica fixa junto das dimensões.
  const trendLeft = colVirtual && trend ? rowDimsWidth : null;
  const frozenWidth = rowDimsWidth + trendWidth;

  const handleOpenCell = useCallback((row: PivotRowHeader, col: PivotColHeader, measure: PivotMeasure) => {
    // O total da linha é a mesma célula num pivot sem colunas.
    const isTotal = col.key === TOTAL_COL_KEY;
    const drillIndexes = getDrillRowsForCell(
      sourceRows as Record<string, unknown>[],
      isTotal ? { ...pivotConfig, cols: [] } : pivotConfig,
      row.key,
      isTotal ? "__all__" : col.key,
      col.key === PIVOT_OTHERS_COL_KEY ? new Set(cols.map((c) => c.key)) : undefined,
    );
    if (drillIndexes.length === 0) return;
    onOpenDrill({
      rowValues: row.values,
      colValues: col.values,
      measure,
      rows: drillIndexes.map((idx) => sourceRows[idx]).filter(Boolean),
    });
  }, [sourceRows, pivotConfig, onOpenDrill, cols]);

  // Clique e Enter/Espaço numa célula de valor: um único tratador no <tbody>
  // (lê linha/coluna/medida dos data-attributes) em vez de 2 closures por <td>.
  const rowByKey = useMemo(() => new Map(sortedRows.map((row) => [row.key, row])), [sortedRows]);
  const colByKey = useMemo(() => {
    const map = new Map(cols.map((col) => [col.key, col]));
    map.set(TOTAL_COL_KEY, TOTAL_COL_HEADER);
    return map;
  }, [cols]);
  const measureById = useMemo(() => new Map(measures.map((m) => [m.id, m])), [measures]);
  const openCellFrom = useCallback((target: EventTarget | null): boolean => {
    const td = (target as HTMLElement | null)?.closest?.("td[data-m]") as HTMLElement | null;
    if (!td) return false;
    const rowKey = (td.parentElement as HTMLElement | null)?.dataset.rk;
    const row = rowKey != null ? rowByKey.get(rowKey) : undefined;
    const col = td.dataset.ck != null ? colByKey.get(td.dataset.ck) : undefined;
    const measure = td.dataset.m ? measureById.get(td.dataset.m) : undefined;
    if (!row || !col || !measure) return false;
    handleOpenCell(row, col, measure);
    return true;
  }, [rowByKey, colByKey, measureById, handleOpenCell]);
  // ----- Seleção estilo planilha -----
  // Clique seleciona, arrastar/Shift+clique estende, duplo clique (ou Enter)
  // abre o detalhe — a convenção do Excel. Antes o clique simples abria o
  // detalhe e não havia como selecionar nem somar células.
  const [selection, setSelection] = useState<CellSelection | null>(null);
  const selectingRef = useRef(false);
  const pendingFocusRef = useRef<{ pos: CellPos; tries: number } | null>(null);
  const flatColCount = allGroups.length * measures.length;
  // Reordenar, recalcular ou trocar medidas muda o que está em cada posição.
  useEffect(() => {
    setSelection(null);
  }, [pivot, sortedRows, measures]);

  const selRange = selection
    ? {
        r0: Math.min(selection.anchor.r, selection.focus.r),
        r1: Math.max(selection.anchor.r, selection.focus.r),
        c0: Math.min(selection.anchor.c, selection.focus.c),
        c1: Math.max(selection.anchor.c, selection.focus.c),
      }
    : null;

  const cellAt = useCallback((pos: CellPos) => {
    const row = sortedRows[pos.r];
    const group = allGroups[Math.floor(pos.c / Math.max(1, measures.length))];
    const measure = measures[pos.c % Math.max(1, measures.length)];
    return row && group && measure ? { row, group, measure } : null;
  }, [sortedRows, allGroups, measures]);

  const posFromTarget = (target: EventTarget | null): CellPos | null => {
    const td = (target as HTMLElement | null)?.closest?.("td[data-ci]") as HTMLElement | null;
    const tr = td?.parentElement as HTMLElement | null;
    if (!td || tr?.dataset.ri === undefined) return null;
    return { r: Number(tr.dataset.ri), c: Number(td.dataset.ci) };
  };

  const handleBodyMouseDown = useCallback((event: React.MouseEvent) => {
    if (event.button !== 0) return;
    const pos = posFromTarget(event.target);
    if (!pos) return;
    event.preventDefault(); // arrastar seleciona células, não texto
    ((event.target as HTMLElement).closest("td") as HTMLElement | null)?.focus({ preventScroll: true });
    selectingRef.current = true;
    setSelection((prev) => (event.shiftKey && prev ? { anchor: prev.anchor, focus: pos } : { anchor: pos, focus: pos }));
  }, []);
  const handleBodyMouseOver = useCallback((event: React.MouseEvent) => {
    if (!selectingRef.current) return;
    const pos = posFromTarget(event.target);
    if (!pos) return;
    setSelection((prev) => (
      !prev || (prev.focus.r === pos.r && prev.focus.c === pos.c) ? prev : { anchor: prev.anchor, focus: pos }
    ));
  }, []);
  useEffect(() => {
    const stop = () => {
      selectingRef.current = false;
    };
    window.addEventListener("mouseup", stop);
    return () => window.removeEventListener("mouseup", stop);
  }, []);
  const handleBodyDoubleClick = useCallback((event: React.MouseEvent) => {
    openCellFrom(event.target);
  }, [openCellFrom]);

  const moveFocus = useCallback((next: CellPos, extend: boolean) => {
    const r = Math.min(Math.max(0, next.r), Math.max(0, sortedRows.length - 1));
    const c = Math.min(Math.max(0, next.c), Math.max(0, flatColCount - 1));
    pendingFocusRef.current = { pos: { r, c }, tries: 0 };
    setSelection((prev) => (extend && prev ? { anchor: prev.anchor, focus: { r, c } } : { anchor: { r, c }, focus: { r, c } }));
  }, [sortedRows.length, flatColCount]);

  // Foco do teclado: foca a célula de destino; se ela está fora da janela
  // virtualizada, rola até lá e foca no render seguinte.
  useLayoutEffect(() => {
    const pending = pendingFocusRef.current;
    const scroller = scrollRef.current;
    if (!pending || !scroller) return;
    const td = scroller.querySelector<HTMLElement>(`tbody tr[data-ri="${pending.pos.r}"] td[data-ci="${pending.pos.c}"]`);
    if (td) {
      pendingFocusRef.current = null;
      td.focus({ preventScroll: true });
      ensureCellVisible(scroller, td);
      return;
    }
    if (pending.tries++ >= 3) {
      pendingFocusRef.current = null;
      return;
    }
    if (shouldVirtualize) {
      scroller.scrollTop = Math.max(0, pending.pos.r * rowHeight - scroller.clientHeight / 2);
    }
    if (colVirtual) {
      scroller.scrollLeft = Math.max(
        0,
        Math.floor(pending.pos.c / Math.max(1, measures.length)) * groupWidth - (scroller.clientWidth - rowDimsWidth) / 2,
      );
    }
  });

  const copySelection = useCallback(async (withHeaders: boolean) => {
    const range = selRange;
    if (!range) return;
    const total = (range.r1 - range.r0 + 1) * (range.c1 - range.c0 + 1);
    if (total > PIVOT_COPY_MAX_CELLS) {
      toast.warning("Seleção grande demais para copiar", { description: "Use Exportar Excel para levar a tabela inteira." });
      return;
    }
    const clean = (s: string) => s.replace(/[\t\r\n]+/g, " ");
    const lines: string[] = [];
    if (withHeaders) {
      const head = rowDims.length ? rowDims.map((d) => dimMap.get(d)?.label ?? d) : [""];
      for (let c = range.c0; c <= range.c1; c++) {
        const at = cellAt({ r: range.r0, c });
        if (!at) continue;
        const colLabel = at.group.isTotal ? "Total" : at.group.col.values.join(" · ");
        head.push(clean(hasCols ? `${colLabel} | ${at.measure.label}` : at.measure.label));
      }
      lines.push(head.join("\t"));
    }
    for (let r = range.r0; r <= range.r1; r++) {
      const row = sortedRows[r];
      if (!row) continue;
      const out: string[] = [];
      if (withHeaders) {
        if (rowDims.length === 0) out.push("");
        rowDims.forEach((_, i) => {
          out.push(clean(!row.isLeaf ? (i === row.depth ? `${row.values[i] ?? ""} subtotal` : "") : (row.values[i] ?? "")));
        });
      }
      for (let c = range.c0; c <= range.c1; c++) {
        const at = cellAt({ r, c });
        if (!at) continue;
        const showAs = showAsByMeasure[at.measure.id] ?? "normal";
        out.push(clipboardNumber(displayValueAt(pivot, at.row, at.group, at.measure, showAs), at.measure, showAs));
      }
      lines.push(out.join("\t"));
    }
    const ok = await writeClipboard(lines.join("\n"));
    if (ok) {
      toast.success(`${total.toLocaleString("pt-BR")} ${total === 1 ? "célula copiada" : "células copiadas"}`, {
        description: withHeaders ? "Com cabeçalhos — cole no Excel ou num e-mail." : "Cole no Excel ou numa planilha.",
      });
    } else {
      toast.error("Não foi possível copiar para a área de transferência.");
    }
  }, [selRange, rowDims, dimMap, cellAt, hasCols, sortedRows, showAsByMeasure, pivot]);

  const handleBodyKeyDown = useCallback((event: React.KeyboardEvent) => {
    const key = event.key;
    const mod = event.ctrlKey || event.metaKey;
    if ((key === "Enter" || key === " ") && !mod) {
      if (openCellFrom(event.target)) event.preventDefault();
      return;
    }
    if (mod && key.toLowerCase() === "c") {
      event.preventDefault();
      void copySelection(event.shiftKey);
      return;
    }
    if (mod && key.toLowerCase() === "a") {
      event.preventDefault();
      if (sortedRows.length && flatColCount) {
        setSelection({ anchor: { r: 0, c: 0 }, focus: { r: sortedRows.length - 1, c: flatColCount - 1 } });
      }
      return;
    }
    if (key === "Escape") {
      if (selection) {
        event.preventDefault();
        event.stopPropagation();
        setSelection(null);
      }
      return;
    }
    // Como no Excel: Shift+seta move o canto que está sendo estendido; a seta
    // sozinha anda a partir da célula ativa (onde a seleção começou).
    const pos = (event.shiftKey ? selection?.focus : selection?.anchor) ?? posFromTarget(event.target);
    if (!pos) return;
    const page = Math.max(1, Math.floor((viewport.height || 400) / rowHeight) - 2);
    const lastR = sortedRows.length - 1;
    const lastC = flatColCount - 1;
    let next: CellPos | null = null;
    // Ctrl+seta vai até a borda, como numa planilha.
    if (key === "ArrowUp") next = { r: mod ? 0 : pos.r - 1, c: pos.c };
    else if (key === "ArrowDown") next = { r: mod ? lastR : pos.r + 1, c: pos.c };
    else if (key === "ArrowLeft") next = { r: pos.r, c: mod ? 0 : pos.c - 1 };
    else if (key === "ArrowRight") next = { r: pos.r, c: mod ? lastC : pos.c + 1 };
    else if (key === "PageDown") next = { r: pos.r + page, c: pos.c };
    else if (key === "PageUp") next = { r: pos.r - page, c: pos.c };
    else if (key === "Home") next = { r: mod ? 0 : pos.r, c: 0 };
    else if (key === "End") next = { r: mod ? lastR : pos.r, c: lastC };
    if (!next) return;
    event.preventDefault();
    moveFocus(next, event.shiftKey);
  }, [openCellFrom, copySelection, sortedRows.length, flatColCount, selection, viewport.height, moveFocus, rowHeight]);

  const selectionStats = useMemo(() => {
    if (!selection) return null;
    const r0 = Math.min(selection.anchor.r, selection.focus.r);
    const r1 = Math.max(selection.anchor.r, selection.focus.r);
    const c0 = Math.min(selection.anchor.c, selection.focus.c);
    const c1 = Math.max(selection.anchor.c, selection.focus.c);
    let cells = 0;
    let numeric = 0;
    let sum = 0;
    let min = Infinity;
    let max = -Infinity;
    const measureIds = new Set<string>();
    for (let r = r0; r <= r1; r++) {
      const row = sortedRows[r];
      if (!row) continue;
      for (let c = c0; c <= c1; c++) {
        const at = cellAt({ r, c });
        if (!at) continue;
        cells++;
        measureIds.add(at.measure.id);
        const v = displayValueAt(pivot, at.row, at.group, at.measure, showAsByMeasure[at.measure.id] ?? "normal");
        if (v == null || !isFinite(v)) continue;
        numeric++;
        sum += v;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    const single = measureIds.size === 1 ? measures.find((m) => measureIds.has(m.id)) ?? null : null;
    const showAs: ShowAsMode = single ? showAsByMeasure[single.id] ?? "normal" : "normal";
    // Percentuais não se somam (CM% de dois canais não é a soma dos dois).
    const additive = !!single && showAs === "normal" && single.format !== "percent" && single.agg === "sum" && !single.derive;
    return { cells, numeric, sum, min, max, avg: numeric ? sum / numeric : null, single, showAs, additive };
  }, [selection, sortedRows, cellAt, pivot, showAsByMeasure, measures]);

  const handleToggleSort = useCallback((colKey: string, measureId: string) => {
    if (sort && sort.col === colKey && sort.measure === measureId) {
      if (sort.dir === "desc") setSort({ col: colKey, measure: measureId, dir: "asc" });
      else setSort(null);
    } else {
      setSort({ col: colKey, measure: measureId, dir: "desc" });
    }
  }, [sort, setSort]);

  const handleChangeShowAs = useCallback((measureId: string, mode: ShowAsMode) => {
    setShowAsByMeasure((prev) => ({ ...prev, [measureId]: mode }));
  }, []);

  const handleOpenShowAsMenu = useCallback((measureId: string, x: number, y: number, returnFocus: HTMLElement | null) => {
    showAsReturnFocusRef.current = returnFocus;
    setShowAsMenu({ measureId, x, y });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const updateViewport = () => setViewport((prev) => (
      prev.width === el.clientWidth && prev.height === el.clientHeight
        ? prev
        : { width: el.clientWidth, height: el.clientHeight }
    ));
    updateViewport();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(updateViewport);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    if (shouldVirtualize) {
      const firstVisible = Math.floor(el.scrollTop / rowHeight);
      const next = Math.max(
        0,
        Math.floor(firstVisible / PIVOT_VIRTUAL_WINDOW_STEP) * PIVOT_VIRTUAL_WINDOW_STEP - PIVOT_VIRTUAL_OVERSCAN,
      );
      if (next !== windowStartRef.current) {
        windowStartRef.current = next;
        setWindowStart(next);
      }
    }
    if (colVirtual) {
      // As colunas de dimensão ficam fixas à esquerda e cobrem o começo da
      // área rolada — o 1º grupo visível é o que está sob scrollLeft.
      const next = Math.max(0, Math.floor(el.scrollLeft / groupWidth) - PIVOT_COL_OVERSCAN);
      if (next !== colStartRef.current) {
        colStartRef.current = next;
        setColStart(next);
      }
    }
  }, [shouldVirtualize, colVirtual, groupWidth, rowHeight]);

  const virtualRange = useMemo(() => {
    if (!shouldVirtualize) {
      return { rows: sortedRows, start: 0, topSpacer: 0, bottomSpacer: 0 };
    }
    const visibleCount = Math.ceil(Math.max(viewport.height, rowHeight) / rowHeight);
    const start = Math.min(windowStart, Math.max(0, sortedRows.length - 1));
    const end = Math.min(
      sortedRows.length,
      start + visibleCount + PIVOT_VIRTUAL_OVERSCAN * 2 + PIVOT_VIRTUAL_WINDOW_STEP,
    );
    return {
      rows: sortedRows.slice(start, end),
      start,
      topSpacer: start * rowHeight,
      bottomSpacer: Math.max(0, (sortedRows.length - end) * rowHeight),
    };
  }, [windowStart, shouldVirtualize, sortedRows, viewport.height, rowHeight]);

  // Mín/máx por medida vêm prontos da agregação (computePivot). A escala vai
  // do mínimo ao máximo — com 0→máx, uma CM% entre 29% e 32% ficava toda
  // da mesma cor.
  const rangeByMeasure = useMemo(() => {
    const map = new Map<string, HeatRange>();
    for (const m of measures) {
      map.set(m.id, { min: pivot.measureMin[m.id] ?? 0, max: pivot.measureMax[m.id] ?? 0 });
    }
    return map;
  }, [measures, pivot]);

  // Subtotais têm escala própria por nível da hierarquia: comparam-se entre
  // si (Categorias com Categorias), não com as folhas — senão, com tudo
  // recolhido, a tabela ficava sem cor nenhuma.
  const groupRangesByDepth = useMemo(() => {
    const byDepth = new Map<number, Map<string, HeatRange>>();
    for (const header of pivot.rowHeaders) {
      if (header.isLeaf) continue;
      const rowCells = pivot.cells.get(header.key);
      if (!rowCells) continue;
      let ranges = byDepth.get(header.depth);
      if (!ranges) {
        ranges = new Map();
        byDepth.set(header.depth, ranges);
      }
      for (const cell of rowCells.values()) {
        for (const m of measures) {
          const v = cell[m.id];
          if (v == null || !isFinite(v)) continue;
          const range = ranges.get(m.id);
          if (!range) ranges.set(m.id, { min: v, max: v });
          else {
            if (v < range.min) range.min = v;
            if (v > range.max) range.max = v;
          }
        }
      }
    }
    return byDepth;
  }, [pivot, measures]);

  // Reordenar por uma coluna: as linhas deslizam até a posição nova (FLIP)
  // em vez de pular — dá pra acompanhar pra onde cada uma foi. Só na troca
  // de ordenação, só nas linhas desenhadas, e nada com "reduzir movimento".
  const rowTopsRef = useRef(new Map<string, number>());
  const prevSortRef = useRef(sort);
  useLayoutEffect(() => {
    const tbody = scrollRef.current?.querySelector("tbody");
    if (!tbody) return;
    const trs = Array.from(tbody.querySelectorAll<HTMLElement>("tr[data-rk]"));
    const tops = new Map<string, number>();
    for (const tr of trs) tops.set(tr.dataset.rk!, tr.offsetTop);
    const sortChanged = prevSortRef.current !== sort;
    prevSortRef.current = sort;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (sortChanged && !reduceMotion && trs.length <= 120) {
      const moved: HTMLElement[] = [];
      for (const tr of trs) {
        const before = rowTopsRef.current.get(tr.dataset.rk!);
        const after = tops.get(tr.dataset.rk!)!;
        if (before === undefined || before === after) continue;
        tr.style.transition = "none";
        tr.style.transform = `translateY(${before - after}px)`;
        moved.push(tr);
      }
      if (moved.length) {
        requestAnimationFrame(() => {
          for (const tr of moved) {
            tr.style.transition = "transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1)";
            tr.style.transform = "";
          }
          window.setTimeout(() => {
            for (const tr of moved) tr.style.transition = "";
          }, 320);
        });
      }
    }
    rowTopsRef.current = tops;
  }, [sortedRows, sort]);

  const cellPad = compact ? "py-0.5 px-2" : "py-1 px-2";
  const clip = colWindow.fixed && "overflow-hidden text-ellipsis";

  if (measures.length === 0) {
    return (
      <GlassCard surface="panel" className="flex h-72 flex-col items-center justify-center gap-2 border-dashed border-border/50 text-sm">
        <Sigma className="h-10 w-10 text-muted-foreground/40" />
        <div className="text-muted-foreground">
          Adicione ao menos uma medida em <span className="font-semibold text-foreground">Valores</span>
        </div>
        <div className="text-[11px] text-muted-foreground/60">
          Clique em uma medida da paleta ou use um preset acima
        </div>
      </GlassCard>
    );
  }

  const showAsCurrent = showAsMenu ? (showAsByMeasure[showAsMenu.measureId] ?? "normal") : "normal";

  return (
    <GlassCard surface="panel" className="relative min-w-0 max-w-full overflow-hidden p-0">
      {stale && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-40 h-0.5 overflow-hidden" role="progressbar" aria-label="Recalculando a tabela">
          <div className="h-full w-full origin-left animate-[progress-indeterminate_1.1s_ease-in-out_infinite] bg-primary motion-reduce:animate-none" />
        </div>
      )}
      <div
        ref={scrollRef}
        className={cn(
          "relative min-w-0 max-w-full overflow-auto transition-opacity duration-200",
          focusMode ? "max-h-[calc(100vh-14rem)]" : "max-h-[68vh]",
          stale && "opacity-60",
        )}
        onScroll={handleScroll}
        aria-busy={stale}
      >
        <table
          role="grid"
          aria-multiselectable="true"
          className={cn("border-collapse", compact ? compactText : "text-xs", !colWindow.fixed && "min-w-full")}
          style={colWindow.fixed ? { tableLayout: "fixed", width: tableWidth } : undefined}
        >
          {colWindow.fixed && (
            <colgroup>
              {rowDimWidths.map((width, idx) => <col key={`rd-${idx}`} style={{ width }} />)}
              {trend && <col style={{ width: TREND_COL_WIDTH }} />}
              {colWindow.virtual && <col style={{ width: colWindow.leftPx }} />}
              {colWindow.groups.flatMap(({ col }) =>
                measureWidths.map((width, idx) => <col key={`c-${col.key}-${idx}`} style={{ width }} />),
              )}
              {colWindow.virtual && <col style={{ width: colWindow.rightPx }} />}
            </colgroup>
          )}
          <PivotHeader
            rowDims={rowDims}
            colWindow={colWindow}
            hasCols={hasCols}
            measures={measures}
            dimMap={dimMap}
            sort={sort}
            onToggleSort={handleToggleSort}
            showAsByMeasure={showAsByMeasure}
            onOpenShowAsMenu={handleOpenShowAsMenu}
            groupLabelStickyLeft={colWindow.virtual ? frozenWidth : null}
            rowDimStickyLefts={rowDimStickyLefts}
            colLevels={colDims.length}
            trendLabel={trend ? trend.label : null}
            trendStickyLeft={trendLeft}
            onResizeMeasure={handleResizeMeasure}
          />
          <tbody
            onMouseDown={handleBodyMouseDown}
            onMouseOver={handleBodyMouseOver}
            onDoubleClick={handleBodyDoubleClick}
            onKeyDown={handleBodyKeyDown}
          >
            {sortedRows.length === 0 && (
              <tr>
                <td
                  colSpan={renderedColumnCount}
                  className="px-3 py-12 text-center text-sm text-muted-foreground"
                >
                  Sem dados para exibir. Ajuste filtros ou desative "ocultar linhas vazias".
                </td>
              </tr>
            )}
            {shouldVirtualize && virtualRange.topSpacer > 0 && (
              <tr aria-hidden="true">
                <td colSpan={renderedColumnCount} style={{ height: virtualRange.topSpacer, padding: 0, border: 0 }} />
              </tr>
            )}
            {virtualRange.rows.map((rh, virtualIndex) => {
              const rowIndex = virtualRange.start + virtualIndex;
              const inSelection = !!selRange && rowIndex >= selRange.r0 && rowIndex <= selRange.r1;
              return (
              <PivotBodyRow
                key={rh.key}
                row={rh}
                index={rowIndex}
                selC0={inSelection ? selRange!.c0 : -1}
                selC1={inSelection ? selRange!.c1 : -1}
                selEdges={inSelection ? (rowIndex === selRange!.r0 ? 1 : 0) | (rowIndex === selRange!.r1 ? 2 : 0) : 0}
                // Foco itinerante: uma só célula é tabulável (a do foco, ou a
                // 1ª da tabela) — Tab entra/sai da grade, setas andam dentro.
                focusC={selection ? (selection.focus.r === rowIndex ? selection.focus.c : -1) : rowIndex === 0 ? 0 : -1}
                virtualized={shouldVirtualize}
                rowDims={rowDims}
                hasRowGroups={hasRowGroups}
                expanded={expandedRowKeys.has(rh.key)}
                colWindow={colWindow}
                measures={measures}
                cells={pivot.cells.get(rh.key) ?? EMPTY_ROW_CELLS}
                rowTotal={pivot.rowTotals.get(rh.key) ?? EMPTY_TOTAL}
                colTotals={pivot.colTotals}
                grandTotal={pivot.grandTotal}
                viz={viz}
                showAsByMeasure={showAsByMeasure}
                rangeByMeasure={rh.isLeaf ? rangeByMeasure : groupRangesByDepth.get(rh.depth) ?? rangeByMeasure}
                onToggleRowGroup={onToggleRowGroup}
                rowDimStickyLefts={rowDimStickyLefts}
                trendMeasure={trend}
                trendCols={trendCols}
                trendLeft={trendLeft}
                rowHeight={rowHeight}
                compact={compact}
                outlierCols={outlierCols}
              />
              );
            })}
            {shouldVirtualize && virtualRange.bottomSpacer > 0 && (
              <tr aria-hidden="true">
                <td colSpan={renderedColumnCount} style={{ height: virtualRange.bottomSpacer, padding: 0, border: 0 }} />
              </tr>
            )}
          </tbody>
          <tfoot className="sticky bottom-0 z-10">
            <tr className="border-t border-border/50 bg-card font-semibold shadow-[0_-8px_16px_rgba(15,23,42,0.08)]">
              <td
                colSpan={Math.max(1, rowDims.length)}
                className={cn("sticky left-0 z-[2] bg-card text-left text-[10px] uppercase tracking-wider text-muted-foreground", cellPad)}
              >
                Total
              </td>
              {trend && (
                <td
                  className={cn("border-l border-border/20 px-2 py-0.5", trendLeft !== null && "sticky z-[2] bg-card")}
                  style={trendLeft !== null ? { left: trendLeft } : undefined}
                >
                  <Sparkline
                    values={trendCols.map((c) => pivot.colTotals.get(c.key)?.[trend.id])}
                    tone={trend.tone}
                    label={`${trend.label} total`}
                    format={(v) => fmtValue(trend, v)}
                  />
                </td>
              )}
              {colWindow.virtual && <td aria-hidden className="p-0" />}
              {colWindow.groups.map(({ col, isTotal }) =>
                measures.map((m, idx) => {
                  const showAs = showAsByMeasure[m.id] ?? "normal";
                  if (isTotal) {
                    const rawValue = pivot.grandTotal[m.id] ?? null;
                    const displayValue = applyShowAs(rawValue, showAs, {
                      rowTotal: rawValue,
                      colTotal: rawValue,
                      grandTotal: rawValue,
                    });
                    return (
                      <td
                        key={`ft-total-${m.id}`}
                        className={cn(
                          "whitespace-nowrap text-right tabular-nums",
                          cellPad,
                          clip,
                          idx === 0 ? "border-l-2 border-border/40" : "border-l border-border/20",
                          toneClass(m.tone, displayValue),
                        )}
                      >
                        {fmtPivotDisplay(m, displayValue, showAs)}
                      </td>
                    );
                  }
                  const rawValue = pivot.colTotals.get(col.key)?.[m.id] ?? (col.key === "__all__" ? pivot.grandTotal[m.id] : null);
                  const displayValue = applyShowAs(rawValue, showAs, {
                    rowTotal: pivot.grandTotal[m.id],
                    colTotal: pivot.colTotals.get(col.key)?.[m.id],
                    grandTotal: pivot.grandTotal[m.id],
                  });
                  return (
                    <td
                      key={`ft-${col.key}-${m.id}`}
                      className={cn(
                        "whitespace-nowrap border-l border-border/20 text-right tabular-nums",
                        cellPad,
                        clip,
                        toneClass(m.tone, displayValue),
                      )}
                    >
                      {fmtPivotDisplay(m, displayValue, showAs)}
                    </td>
                  );
                }),
              )}
              {colWindow.virtual && <td aria-hidden className="p-0" />}
            </tr>
          </tfoot>
        </table>
      </div>
      {selectionStats && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/40 bg-card px-3 py-1.5 text-[11px] tabular-nums text-muted-foreground animate-fade-in"
        >
          <span>
            <strong className="font-semibold text-foreground">{selectionStats.cells.toLocaleString("pt-BR")}</strong>{" "}
            {selectionStats.cells === 1 ? "célula" : "células"}
          </span>
          {selectionStats.single && selectionStats.numeric > 0 ? (
            <>
              {selectionStats.additive && (
                <span>
                  Soma <strong className="font-semibold text-foreground">{fmtPivotDisplay(selectionStats.single, selectionStats.sum, selectionStats.showAs)}</strong>
                </span>
              )}
              {selectionStats.numeric > 1 && (
                <>
                  <span>
                    Média <strong className="font-semibold text-foreground">{fmtPivotDisplay(selectionStats.single, selectionStats.avg, selectionStats.showAs)}</strong>
                  </span>
                  <span>
                    Mín <strong className="font-semibold text-foreground">{fmtPivotDisplay(selectionStats.single, selectionStats.min, selectionStats.showAs)}</strong>
                  </span>
                  <span>
                    Máx <strong className="font-semibold text-foreground">{fmtPivotDisplay(selectionStats.single, selectionStats.max, selectionStats.showAs)}</strong>
                  </span>
                </>
              )}
            </>
          ) : !selectionStats.single ? (
            <span>Medidas diferentes — selecione uma medida só para ver soma e média</span>
          ) : null}
          <span className="ml-auto hidden text-muted-foreground/70 md:inline">
            Ctrl+C copia · Ctrl+Shift+C com cabeçalhos · duplo clique abre o detalhe · Esc limpa
          </span>
          <button
            type="button"
            onClick={() => void copySelection(false)}
            className="rounded-md px-1.5 py-0.5 font-medium text-primary outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            Copiar
          </button>
        </div>
      )}
      {/* Um único menu "mostrar como" pra tabela inteira (antes: um
          ContextMenu + um DropdownMenu do Radix por coluna × medida). A
          âncora vai pro <body> porque o GlassCard tem backdrop-filter, que
          vira o bloco de contenção de elementos position: fixed. */}
      <DropdownMenu
        open={showAsMenu !== null}
        onOpenChange={(open) => {
          if (!open) setShowAsMenu(null);
        }}
        modal={false}
      >
        {showAsMenu && createPortal(
          <DropdownMenuTrigger asChild>
            <span
              aria-hidden
              style={{ position: "fixed", left: showAsMenu.x, top: showAsMenu.y, width: 1, height: 1, pointerEvents: "none" }}
            />
          </DropdownMenuTrigger>,
          document.body,
        )}
        <DropdownMenuContent
          align="start"
          className="w-64"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            showAsReturnFocusRef.current?.focus();
          }}
        >
          <DropdownMenuLabel>Mostrar valores como</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {SHOW_AS_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.mode}
              onSelect={() => {
                if (showAsMenu) handleChangeShowAs(showAsMenu.measureId, option.mode);
              }}
              className="gap-2"
            >
              <Check className={cn("h-4 w-4", showAsCurrent === option.mode ? "opacity-100" : "opacity-0")} />
              <span>{option.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </GlassCard>
  );
});

// ============================================================
//                       EXPORT MENU
// ============================================================
function ExportMenu({
  pivot,
  measures,
  rowDims,
  colDims,
  dimMap,
  tableRef,
  modeLabel,
  sortedRows,
  onExportReady,
}: {
  pivot: PivotResult;
  measures: PivotMeasure[];
  rowDims: string[];
  colDims: string[];
  dimMap: Map<string, DimMeta>;
  tableRef: React.RefObject<HTMLDivElement>;
  modeLabel: string;
  sortedRows: PivotRowHeader[];
  onExportReady?: (fn: () => void) => void;
}) {
  const [exporting, setExporting] = useState(false);

  function xlsxFmt(format: PivotMeasure["format"]): string {
    switch (format) {
      case "currency": return "#,##0.00";
      case "percent": return "0.00%";
      case "kg": return "#,##0";
      case "tons": return "#,##0.000";
      default: return "#,##0.00";
    }
  }

  const exportXlsx = async () => {
    setExporting(true);
    // Achado 02 da análise de UX/UI: antes disso, o corpo inteiro da função
    // rodava síncrono sem nenhum await no meio — nem o spinner chegava a
    // pintar antes do main thread travar num pivot grande. Este primeiro
    // yield garante que "Exportando…" apareça na tela antes do trabalho
    // pesado começar; os yields dentro do loop abaixo (a cada 2.000 linhas)
    // devolvem o controle ao navegador periodicamente, então a aba continua
    // respondendo a scroll/clique em vez de congelar até terminar.
    await new Promise(requestAnimationFrame);
    try {
      const hasExplicitCols = colDims.length > 0 && pivot.colHeaders.length > 0;
      const exportCols = hasExplicitCols
        ? pivot.colHeaders
        : [{ key: "__all__", values: [], depth: 0, isLeaf: true }];

      // Linha de cabeçalho: sem prefixo "Total |" quando não há colunas configuradas
      const header: string[] = [
        ...rowDims.map((d) => dimMap.get(d)?.label ?? d),
        ...exportCols.flatMap((c) =>
          measures.map((m) =>
            hasExplicitCols ? `${c.values.join(" · ")} | ${m.label}` : m.label
          )
        ),
        ...(hasExplicitCols ? measures.map((m) => `Total | ${m.label}`) : []),
      ];

      // Mapa de formato por índice de coluna
      const colFormats: (string | null)[] = [
        ...rowDims.map(() => null),
        ...exportCols.flatMap(() => measures.map((m) => xlsxFmt(m.format))),
        ...(hasExplicitCols ? measures.map((m) => xlsxFmt(m.format)) : []),
      ];

      // null/undefined viram celula genuinamente vazia no aoa_to_sheet; "" cria uma
      // celula de texto vazio (conteudo "invisivel" que o Localizar/Substituir do
      // Excel nao trata como em branco).
      const safeNum = (v: number | null | undefined): number | null =>
        v !== null && v !== undefined && isFinite(v) ? Number(v) : null;

      const dataRows: (string | number | null)[][] = [];
      const EXPORT_CHUNK_SIZE = 2000;

      for (let i = 0; i < sortedRows.length; i++) {
        const rh = sortedRows[i];
        const row: (string | number | null)[] = [];
        rowDims.forEach((_, di) => {
          // Hierarquia: grupo de profundidade d na coluna d; folha agrupada
          // só na última coluna (as de cima já aparecem nos subtotais).
          if (!rh.isLeaf) {
            row.push(di === rh.depth ? `${rh.values[di] ?? ""} subtotal` : null);
          } else if (rh.parentKey && di < rowDims.length - 1) {
            row.push(null);
          } else if (rh.parentKey) {
            row.push(`  ${rh.values[di] ?? ""}`);
          } else {
            row.push(rh.values[di] ?? null);
          }
        });
        for (const c of exportCols) {
          const cell = pivot.cells.get(rh.key)?.get(c.key) ?? {};
          for (const m of measures) row.push(safeNum(cell[m.id]));
        }
        if (hasExplicitCols) {
          const rowTot = pivot.rowTotals.get(rh.key) ?? {};
          for (const m of measures) row.push(safeNum(rowTot[m.id]));
        }
        dataRows.push(row);

        if (i > 0 && i % EXPORT_CHUNK_SIZE === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      // Linha de rodapé com totais por coluna + grand total
      const footerRow: (string | number | null)[] = ["Total"];
      for (let i = 1; i < rowDims.length; i++) footerRow.push(null);
      for (const c of exportCols) {
        const colTot = pivot.colTotals.get(c.key) ?? {};
        for (const m of measures) footerRow.push(safeNum(colTot[m.id]));
      }
      if (hasExplicitCols) {
        for (const m of measures) footerRow.push(safeNum(pivot.grandTotal[m.id]));
      }
      dataRows.push(footerRow);

      const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);

      // Aplicar formatos numéricos nas células de dados (linha 0 é cabeçalho)
      const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
      for (let R = 1; R <= range.e.r; R++) {
        for (let C = 0; C < colFormats.length; C++) {
          const fmt = colFormats[C];
          if (!fmt) continue;
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          const cell = ws[addr];
          if (cell && cell.t === "n") cell.z = fmt;
        }
        if (R > 0 && R % EXPORT_CHUNK_SIZE === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      // Larguras de coluna
      ws["!cols"] = [
        ...rowDims.map(() => ({ wch: 25 })),
        ...exportCols.flatMap(() => measures.map(() => ({ wch: 14 }))),
        ...(hasExplicitCols ? measures.map(() => ({ wch: 14 })) : []),
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Pivot");
      XLSX.writeFile(wb, `pivot_${modeLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success("Arquivo exportado com sucesso.");
    } catch (err) {
      toast.error("Erro ao exportar: " + (err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (onExportReady) onExportReady(exportXlsx);
  }, [onExportReady, pivot, measures, rowDims, colDims, dimMap, modeLabel, sortedRows]);

  const exportPng = async () => {
    if (!tableRef.current) return;
    try {
      // Achado 03 da análise de UX/UI: acima do limite de virtualização, o
      // DOM só contém as linhas visíveis no momento — o PNG sairia cortado
      // sem explicação. Avisa antes de capturar em vez de deixar o usuário
      // descobrir sozinho que a imagem está incompleta.
      const colsVirtualized = colDims.length > 0
        && (pivot.colHeaders.length + 1) * measures.length > PIVOT_COL_VIRTUAL_THRESHOLD;
      if (sortedRows.length > PIVOT_VIRTUAL_ROW_THRESHOLD || colsVirtualized) {
        toast.warning("A imagem vai capturar só a parte da tabela visível na tela agora", {
          description: "Tabelas grandes são renderizadas por partes. Pra exportar tudo, use \"Exportar Excel\".",
        });
      }
      // Lê o token --background em vez de fixar uma cor: acompanha o tema
      // (claro/escuro) e qualquer futura mudança de paleta, em vez de
      // destoar silenciosamente da UI real (achado 09 da análise de UX/UI).
      const bgToken = getComputedStyle(document.documentElement).getPropertyValue("--background").trim();
      const dataUrl = await toPng(tableRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: bgToken ? `hsl(${bgToken})` : "#0b0b0f",
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `pivot_${modeLabel}_${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
    } catch (err) {
      console.error("PNG export failed", err);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          title="Exportar"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/50 bg-secondary/40 text-muted-foreground hover:text-foreground"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-1" align="end">
        <button
          onClick={exportXlsx}
          disabled={exporting}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-secondary/60 disabled:opacity-50"
        >
          {exporting
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <FileSpreadsheet className="h-3.5 w-3.5" />
          }
          {exporting ? "Exportando…" : "Excel (.xlsx)"}
        </button>
        <button
          onClick={exportPng}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-secondary/60"
        >
          <FileImage className="h-3.5 w-3.5" /> Imagem (.png)
        </button>
      </PopoverContent>
    </Popover>
  );
}
