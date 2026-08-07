import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
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
  RotateCcw,
  Rows3,
  Search,
  Sigma,
  Sparkles,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import * as XLSX from "xlsx";
import { toPng } from "html-to-image";
import { cn } from "@/lib/utils";
import { formatBRL, formatNum, formatPct } from "@/lib/format";
import {
  buildUnifiedRows,
  dimensionsForMode,
  type PivotMode,
} from "@/lib/pivotData";
import {
  getDrillRowsForCell,
  type PivotColHeader,
  type PivotConfig,
  type PivotMeasure,
  type PivotResult,
  type PivotRowHeader,
} from "@/lib/pivot";
import { computePivotAsync, createEmptyPivotResult } from "@/lib/pivotWorkerClient";
import type { PricingRow } from "@/lib/types";
import type { BudgetRow } from "@/lib/budget";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { exportTableCsv } from "@/lib/exportCsv";
import { toast } from "sonner";

type Zone = "rows" | "cols" | "values" | "filters";
type VizMode = "heatmap" | "plain";
type SortState = { col: string; measure: string; dir: "asc" | "desc" } | null;
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
    return val > 0 ? "text-emerald-300" : "text-rose-300";
  }
  if (tone === "budget") return "text-accent-foreground/90";
  return "text-foreground";
}

function cellBg(viz: VizMode, m: PivotMeasure, v: number | null, max: number): React.CSSProperties | undefined {
  if (viz === "plain" || max === 0 || v === null || !isFinite(v) || v === 0) return undefined;
  const pct = Math.min(100, (Math.abs(v) / max) * 100);
  const alpha = 0.06 + (pct / 100) * 0.42;
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
}: {
  realRows: PricingRow[];
  budgetRows: BudgetRow[];
  onExportReady?: (fn: () => void) => void;
}) {
  const [mode, setMode] = useState<PivotMode>("real");
  const [rowsDims, setRowsDims] = useState<string[]>(["marca"]);
  const [colsDims, setColsDims] = useState<string[]>(["fy"]);
  const [valueIds, setValueIds] = useState<string[]>(["rol_real", "cm_real", "cm_pct_real"]);
  const [filterDims, setFilterDims] = useState<string[]>([]);
  const [filterVals, setFilterVals] = useState<Record<string, string[]>>({});
  const [paletteQuery, setPaletteQuery] = useState("");

  // UX state
  const [viz, setViz] = useState<VizMode>("heatmap");
  const [hideEmpty, setHideEmpty] = useState(true);
  const [sort, setSort] = useState<SortState>(null);
  const [highlightRow, setHighlightRow] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [drillSelection, setDrillSelection] = useState<DrillSelection | null>(null);
  const [expandedRowKeys, setExpandedRowKeys] = useState<Set<string>>(() => new Set());

  const tableRef = useRef<HTMLDivElement>(null);
  const pivotRequestRef = useRef(0);

  useEffect(() => {
    const def = defaultConfig(mode);
    setRowsDims(def.rows);
    setColsDims(def.cols);
    setValueIds(def.values);
    setFilterDims([]);
    setFilterVals({});
    setSort(null);
  }, [mode]);

  const measureCatalog = useMemo(() => measuresFor(mode), [mode]);
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

  // Dataset filtrado pelos filtros activos — base para os popovers em cascata
  const filteredForCascade = useMemo(() => {
    return (unified as unknown as Record<string, unknown>[]).filter((row) => {
      for (const [dim, vals] of Object.entries(filterValsForEngine)) {
        if (vals.length === 0) continue;
        const rowVal = String(row[dim] ?? "—");
        if (!vals.includes(rowVal)) return false;
      }
      return true;
    });
  }, [unified, filterValsForEngine]);

  // Valores distintos por dimensão — só para dims activas em filtros, usando Set para O(1) dedup.
  // Complexidade: O(n × |filterDims|). Quando não há filtros activos, retorna {} imediatamente.
  const allValuesByDim = useMemo(() => {
    if (filterDims.length === 0) return {} as Record<string, string[]>;
    const sets: Record<string, Set<string>> = {};
    for (const row of filteredForCascade) {
      for (const id of filterDims) {
        const val = String((row as Record<string, unknown>)[id] ?? "—");
        if (!sets[id]) sets[id] = new Set<string>();
        sets[id].add(val);
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
  }, [filteredForCascade, filterDims]);

  const pivotConfig = useMemo<PivotConfig>(
    () => ({
      rows: rowsDims,
      cols: colsDims,
      values: selectedMeasures,
      filters: filterValsForEngine,
    }),
    [rowsDims, colsDims, selectedMeasures, filterValsForEngine],
  );
  const [pivot, setPivot] = useState<PivotResult>(() => createEmptyPivotResult());
  const [pivotLoading, setPivotLoading] = useState(false);

  useEffect(() => {
    const requestId = ++pivotRequestRef.current;
    let cancelled = false;
    setPivotLoading(true);

    computePivotAsync(unified as unknown as Record<string, unknown>[], pivotConfig)
      .then((result) => {
        if (cancelled || requestId !== pivotRequestRef.current) return;
        setPivot(result);
      })
      .catch((error) => {
        if (cancelled || requestId !== pivotRequestRef.current) return;
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
  }, [unified, pivotConfig]);

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

  // sortedRows: aplica hideEmpty + sort do usuário dentro de cada grupo, preservando a ordem dos grupos
  const sortedRows = useMemo(() => {
    const hasGroups = pivot.rowHeaders.some((row) => !row.isLeaf);
    const rowHasValue = (rh: PivotRowHeader) => {
        const rowMap = pivot.cells.get(rh.key);
        if (!rowMap) return false;
        for (const cellRecord of rowMap.values()) {
          if (selectedMeasures.some((m) => cellRecord[m.id] !== null && cellRecord[m.id] !== undefined)) {
            return true;
          }
        }
        return false;
    };
    const filterLeaves = (rows: PivotRowHeader[]) => hideEmpty ? rows.filter(rowHasValue) : rows;
    const sortLeaves = (rows: PivotRowHeader[]) => {
      if (!sort) return rows;
      const getter = (k: string) => {
        const v = pivot.cells.get(k)?.get(sort.col)?.[sort.measure];
        return v ?? 0;
      };
      return [...rows].sort((a, b) => {
        const va = getter(a.key);
        const vb = getter(b.key);
        return sort.dir === "asc" ? va - vb : vb - va;
      });
    };

    if (!hasGroups) return sortLeaves(filterLeaves(pivot.leafRowHeaders));

    const childrenByParent = new Map<string, PivotRowHeader[]>();
    for (const leaf of filterLeaves(pivot.leafRowHeaders)) {
      const parent = leaf.parentKey ?? "";
      const current = childrenByParent.get(parent) ?? [];
      current.push(leaf);
      childrenByParent.set(parent, current);
    }

    const rows: PivotRowHeader[] = [];
    for (const header of pivot.rowHeaders) {
      if (header.isLeaf) continue;
      const children = sortLeaves(childrenByParent.get(header.key) ?? []);
      if (hideEmpty && children.length === 0 && !rowHasValue(header)) continue;
      rows.push(header);
      rows.push(...children);
    }
    return rows;
  }, [pivot, selectedMeasures, sort, hideEmpty]);

  const visibleRows = useMemo(
    () => sortedRows.filter((row) => !row.isLeaf || !row.parentKey || expandedRowKeys.has(row.parentKey)),
    [expandedRowKeys, sortedRows],
  );

  // ----- Drag & Drop (HTML5) -----
  const [dragging, setDragging] = useState<{ id: string; from: Zone | "palette" } | null>(null);
  const [dragOver, setDragOver] = useState<Zone | null>(null);

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
      <div className="surface-raised relative overflow-hidden rounded-2xl border border-border/50 p-4 backdrop-blur-xl">
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
                  onClick={() => !disabled && setMode(m)}
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
            measures={selectedMeasures}
            rowDims={rowsDims}
            colDims={colsDims}
            dimMap={dimMap}
            tableRef={tableRef}
            modeLabel={MODE_LABEL[mode]}
            sortedRows={sortedRows}
            onExportReady={onExportReady}
          />

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
        </div>
      </div>

      {/* ═════════════════ MAIN GRID ═════════════════ */}
      <div className={cn("grid grid-cols-1 gap-4", paletteOpen ? "lg:grid-cols-[260px_1fr]" : "lg:grid-cols-[44px_1fr]")}>
        {/* PALETTE */}
        <aside className="surface-panel relative space-y-3 rounded-2xl border border-border/40 p-3 backdrop-blur-xl">
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
                  {measureCatalog.filter((m) => matchesQuery(m.label)).map((m) => (
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
            </>
          )}
        </aside>

        {/* CONFIG ZONES + TABLE */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <DropZone
              label="Filtros"
              icon={<FilterIcon className="h-3.5 w-3.5" />}
              accent="muted"
              zone="filters"
              count={filterDims.length}
              dragOver={dragOver === "filters"}
              setDragOver={setDragOver}
              onDrop={() => handleDrop("filters")}
            >
              {filterDims.length === 0 && <Hint>Arraste uma dimensão</Hint>}
              {filterDims.map((id) => {
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
              setDragOver={setDragOver}
              onDrop={() => handleDrop("cols")}
            >
              {colsDims.length === 0 && <Hint>Sem colunas</Hint>}
              {colsDims.map((id) => (
                <Chip
                  key={id}
                  label={dimMap.get(id)?.label ?? id}
                  closable
                  onRemove={() => removeFromZone(id, "cols")}
                  currentZone="cols"
                  fieldKind="dimension"
                  onMoveToZone={(zone) => moveFieldToZone(id, "cols", zone)}
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
              setDragOver={setDragOver}
              onDrop={() => handleDrop("rows")}
            >
              {rowsDims.length === 0 && <Hint>Sem linhas</Hint>}
              {rowsDims.map((id) => (
                <Chip
                  key={id}
                  label={dimMap.get(id)?.label ?? id}
                  closable
                  onRemove={() => removeFromZone(id, "rows")}
                  currentZone="rows"
                  fieldKind="dimension"
                  onMoveToZone={(zone) => moveFieldToZone(id, "rows", zone)}
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
              setDragOver={setDragOver}
              onDrop={() => handleDrop("values")}
            >
              {valueIds.length === 0 && <Hint>Arraste medidas</Hint>}
              {valueIds.map((id) => {
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

          <div ref={tableRef}>
            <PivotTable
              pivot={pivot}
              measures={selectedMeasures}
              rowDims={rowsDims}
              colDims={colsDims}
              dimMap={dimMap}
              viz={viz}
              sort={sort}
              setSort={setSort}
              sortedRows={visibleRows}
              expandedRowKeys={expandedRowKeys}
              onToggleRowGroup={(key) => {
                setExpandedRowKeys((prev) => {
                  const next = new Set(prev);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                });
              }}
              highlightRow={highlightRow}
              setHighlightRow={setHighlightRow}
              onOpenDrill={(selection) => setDrillSelection(selection)}
              sourceRows={unifiedRecords}
              pivotConfig={pivotConfig}
            />
          </div>
        </div>
      </div>
      <DrillThroughSheet
        selection={drillSelection}
        dimMap={dimMap}
        measures={selectedMeasures}
        onOpenChange={(open) => {
          if (!open) setDrillSelection(null);
        }}
      />
    </div>
  );
}

// ============================================================
//                       SUB-COMPONENTS
// ============================================================
function Hint({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] italic text-muted-foreground/60">{children}</span>;
}

function FieldMoveMenu({
  label,
  currentZone,
  fieldKind,
  onMoveToZone,
  onRemove,
}: {
  label: string;
  currentZone: Zone;
  fieldKind: PivotFieldKind;
  onMoveToZone: (zone: Zone) => void;
  onRemove: () => void;
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

function DrillThroughSheet({
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

  return (
    <Sheet open={!!selection} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-[92vw] flex-col gap-4 p-0 sm:max-w-3xl">
        <SheetHeader className="border-b border-border/40 px-5 py-4">
          <SheetTitle>Detalhe da célula</SheetTitle>
          <SheetDescription>
            {selection ? `${selection.measure.label} · ${context}` : "Linhas originais da base"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex items-center justify-between gap-3 px-5">
          <div className="text-xs text-muted-foreground">
            {selection?.rows.length.toLocaleString("pt-BR") ?? 0} linhas encontradas
            {selection && selection.rows.length > previewRows.length && ` · exibindo primeiras ${previewRows.length.toLocaleString("pt-BR")}`}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            disabled={!selection || selection.rows.length === 0 || columns.length === 0}
            onClick={() => {
              if (!selection) return;
              exportTableCsv(
                selection.rows,
                columns,
                `drill_pivot_${selection.measure.id}_${new Date().toISOString().slice(0, 10)}.csv`,
              );
            }}
          >
            <Download className="h-3.5 w-3.5" />
            Exportar CSV
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 pb-5">
          {previewRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/50 px-4 py-10 text-center text-sm text-muted-foreground">
              Nenhuma linha encontrada para esta célula.
            </div>
          ) : (
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10">
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      className="border-b border-border/40 bg-background px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
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
                      <td key={column.key} className="max-w-[220px] truncate px-2 py-1.5">
                        {formatDrillValue(row[column.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </SheetContent>
    </Sheet>
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
  onClick,
  draggable,
  onDragStart,
  onDragEnd,
  onDragOverChip,
  onDropOnChip,
}: {
  label: string;
  tone?: PivotMeasure["tone"];
  closable?: boolean;
  faded?: boolean;
  onRemove?: () => void;
  currentZone?: Zone;
  fieldKind?: PivotFieldKind;
  onMoveToZone?: (zone: Zone) => void;
  onClick?: () => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDragOverChip?: (e: React.DragEvent) => void;
  onDropOnChip?: () => void;
}) {
  const toneRing =
    tone === "budget"
      ? "border-accent/40 bg-accent/10 text-accent-foreground hover:bg-accent/20"
      : tone === "delta"
        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
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
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => onChange([])}>
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
        />
      </span>
    </span>
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
        "surface-panel relative min-h-[78px] overflow-hidden rounded-xl border p-2.5 transition-all",
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
        {count > 0 && (
          <span className="rounded-full bg-secondary/80 px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
            {count}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

// ============================================================
//                         TABLE
// ============================================================
interface DimMeta { id: string; label: string; group: string }

function PivotTable({
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
  highlightRow,
  setHighlightRow,
  onOpenDrill,
  sourceRows,
  pivotConfig,
}: {
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
  highlightRow: string | null;
  setHighlightRow: (k: string | null) => void;
  onOpenDrill: (selection: DrillSelection) => void;
  sourceRows: PivotDetailRow[];
  pivotConfig: PivotConfig;
}) {
  const hasCols = colDims.length > 0 && pivot.colHeaders.length > 0;
  const hasRowGroups = pivot.rowHeaders.some((row) => !row.isLeaf);
  const cols = hasCols ? pivot.colHeaders : [{ key: "__all__", values: [], depth: 0, isLeaf: true }];
  const [showAsByMeasure, setShowAsByMeasure] = useState<Record<string, ShowAsMode>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const totalColumnCount = Math.max(1, rowDims.length) + cols.length * measures.length;
  const shouldVirtualize = sortedRows.length > PIVOT_VIRTUAL_ROW_THRESHOLD;
  const openDrill = (row: PivotRowHeader, col: PivotColHeader, measure: PivotMeasure) => {
    const drillIndexes = getDrillRowsForCell(
      sourceRows as Record<string, unknown>[],
      pivotConfig,
      row.key,
      col.key,
    );
    if (drillIndexes.length === 0) return;
    onOpenDrill({
      rowValues: row.values,
      colValues: col.values,
      measure,
      rows: drillIndexes.map((idx) => sourceRows[idx]).filter(Boolean),
    });
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const updateViewport = () => setViewportHeight(el.clientHeight);
    updateViewport();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(updateViewport);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const virtualRange = useMemo(() => {
    if (!shouldVirtualize) {
      return {
        rows: sortedRows,
        start: 0,
        topSpacer: 0,
        bottomSpacer: 0,
      };
    }

    const visibleCount = Math.ceil(Math.max(viewportHeight, PIVOT_VIRTUAL_ROW_HEIGHT) / PIVOT_VIRTUAL_ROW_HEIGHT);
    const maxStart = Math.max(0, sortedRows.length - 1);
    const start = Math.min(
      maxStart,
      Math.max(0, Math.floor(scrollTop / PIVOT_VIRTUAL_ROW_HEIGHT) - PIVOT_VIRTUAL_OVERSCAN),
    );
    const end = Math.min(
      sortedRows.length,
      start + visibleCount + PIVOT_VIRTUAL_OVERSCAN * 2,
    );

    return {
      rows: sortedRows.slice(start, end),
      start,
      topSpacer: start * PIVOT_VIRTUAL_ROW_HEIGHT,
      bottomSpacer: Math.max(0, (sortedRows.length - end) * PIVOT_VIRTUAL_ROW_HEIGHT),
    };
  }, [scrollTop, shouldVirtualize, sortedRows, viewportHeight]);

  const maxByMeasure = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of measures) {
      let max = 0;
      for (const rh of sortedRows) {
        for (const c of cols) {
          const v = pivot.cells.get(rh.key)?.get(c.key)?.[m.id] ?? 0;
          if (isFinite(v)) max = Math.max(max, Math.abs(v));
        }
      }
      map.set(m.id, max);
    }
    return map;
  }, [measures, sortedRows, cols, pivot]);

  function toggleSort(colKey: string, measureId: string) {
    if (sort && sort.col === colKey && sort.measure === measureId) {
      if (sort.dir === "desc") setSort({ col: colKey, measure: measureId, dir: "asc" });
      else setSort(null);
    } else {
      setSort({ col: colKey, measure: measureId, dir: "desc" });
    }
  }

  function showAsFor(measureId: string): ShowAsMode {
    return showAsByMeasure[measureId] ?? "normal";
  }

  const cellPad = "py-1 px-2";
  const headerPad = "py-1.5 px-2";

  if (measures.length === 0) {
    return (
      <div className="surface-panel flex h-72 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/50 text-sm">
        <Sigma className="h-10 w-10 text-muted-foreground/40" />
        <div className="text-muted-foreground">
          Adicione ao menos uma medida em <span className="font-semibold text-foreground">Valores</span>
        </div>
        <div className="text-[11px] text-muted-foreground/60">
          Clique em uma medida da paleta ou use um preset acima
        </div>
      </div>
    );
  }

  return (
    <div className="surface-panel overflow-hidden rounded-2xl border border-border/40 backdrop-blur-xl">
      <div
        ref={scrollRef}
        className="relative max-h-[68vh] overflow-auto"
        onScroll={(e) => {
          if (shouldVirtualize) setScrollTop(e.currentTarget.scrollTop);
        }}
      >
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-20">
            {hasCols && (
              <tr>
                {rowDims.map((d, i) => (
                  <th
                    key={`rh-${d}`}
                    className={cn(
                      "border-b border-border/40 bg-card/95 backdrop-blur text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
                      headerPad,
                      i === 0 && "sticky left-0 z-10",
                    )}
                  >
                    {dimMap.get(d)?.label ?? d}
                  </th>
                ))}
                {rowDims.length === 0 && (
                  <th className={cn("sticky left-0 z-10 border-b border-border/40 bg-card/95 backdrop-blur", headerPad)} />
                )}
                {cols.map((c) => (
                  <th
                    key={`ch-${c.key}`}
                    colSpan={measures.length}
                    className={cn(
                      "border-b border-l border-border/40 bg-card/95 backdrop-blur text-center text-[11px] font-semibold",
                      headerPad,
                    )}
                  >
                    {c.values.join(" · ") || ""}
                  </th>
                ))}
              </tr>
            )}
            <tr>
              {rowDims.map((d, idx) => (
                <th
                  key={`rh2-${d}`}
                  className={cn(
                    "border-b border-border/40 bg-card/95 backdrop-blur text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
                    headerPad,
                    idx === 0 && "sticky left-0 z-10",
                  )}
                >
                  {!hasCols && (dimMap.get(d)?.label ?? d)}
                </th>
              ))}
              {rowDims.length === 0 && !hasCols && (
                <th className={cn("sticky left-0 z-10 border-b border-border/40 bg-card/95 backdrop-blur", headerPad)} />
              )}
              {cols.map((c) =>
                measures.map((m) => {
                  const isSorted = sort && sort.col === c.key && sort.measure === m.id;
                  const showAs = showAsFor(m.id);
                  return (
                    <ContextMenu key={`mh-menu-${c.key}-${m.id}`}>
                      <ContextMenuTrigger asChild>
                        <th
                          key={`mh-${c.key}-${m.id}`}
                          onClick={() => toggleSort(c.key, m.id)}
                          className={cn(
                            "cursor-pointer select-none border-b border-l border-border/40 bg-card/95 backdrop-blur text-right text-[10px] font-semibold uppercase tracking-wider transition-colors hover:bg-secondary/80",
                            headerPad,
                            toneClass(m.tone),
                            isSorted && "text-primary",
                            showAs !== "normal" && "bg-primary/10 text-primary",
                          )}
                          title="Clique para ordenar. Clique com o botão direito para mostrar valores como."
                        >
                          <span className="inline-flex items-center justify-end gap-1">
                            {m.label}
                            {showAs !== "normal" && (
                              <span className="rounded-full bg-primary/15 px-1 text-[9px] normal-case tracking-normal text-primary">%</span>
                            )}
                            {isSorted ? (
                              sort!.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                            ) : (
                              <ArrowUpDown className="h-3 w-3 opacity-20" />
                            )}
                          </span>
                        </th>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-64">
                        <ContextMenuLabel>Mostrar valores como</ContextMenuLabel>
                        <ContextMenuSeparator />
                        {SHOW_AS_OPTIONS.map((option) => (
                          <ContextMenuItem
                            key={option.mode}
                            onSelect={() => setShowAsByMeasure((prev) => ({ ...prev, [m.id]: option.mode }))}
                            className="gap-2"
                          >
                            <Check className={cn("h-4 w-4", showAs === option.mode ? "opacity-100" : "opacity-0")} />
                            <span>{option.label}</span>
                          </ContextMenuItem>
                        ))}
                      </ContextMenuContent>
                    </ContextMenu>
                  );
                }),
              )}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 && (
              <tr>
                <td
                  colSpan={totalColumnCount}
                  className="px-3 py-12 text-center text-sm text-muted-foreground"
                >
                  Sem dados para exibir. Ajuste filtros ou desative "ocultar linhas vazias".
                </td>
              </tr>
            )}
            {shouldVirtualize && virtualRange.topSpacer > 0 && (
              <tr aria-hidden="true">
                <td colSpan={totalColumnCount} style={{ height: virtualRange.topSpacer, padding: 0, border: 0 }} />
              </tr>
            )}
            {virtualRange.rows.map((rh, virtualIndex) => {
              const i = virtualRange.start + virtualIndex;
              const isHL = highlightRow === rh.key;
              return (
                <tr
                  key={rh.key}
                  style={shouldVirtualize ? { height: PIVOT_VIRTUAL_ROW_HEIGHT } : undefined}
                  onMouseEnter={() => setHighlightRow(rh.key)}
                  onMouseLeave={() => setHighlightRow(null)}
                  className={cn(
                    "group border-b border-border/15 transition-colors",
                    i % 2 === 0 && "bg-background/30",
                    isHL && "bg-primary/[0.06]",
                  )}
                >
                  {rowDims.map((_, idx) => {
                    const isGroup = !rh.isLeaf;
                    const isGroupedLeaf = hasRowGroups && rh.isLeaf && rh.parentKey;
                    const value = isGroup
                      ? (idx === 0 ? rh.values[0] : "")
                      : isGroupedLeaf && idx === 0
                        ? ""
                        : rh.values[idx] ?? "";
                    const shouldShowLeafIndent = Boolean(isGroupedLeaf && idx === Math.min(1, rowDims.length - 1));
                    return (
                      <td
                        key={`rv-${rh.key}-${idx}`}
                        className={cn(
                          "text-foreground",
                          cellPad,
                          idx === 0 && "sticky left-0 z-[1] bg-card/85 backdrop-blur font-medium group-hover:bg-card",
                          isGroup && "bg-secondary/35 font-semibold",
                        )}
                      >
                        <span
                          className="inline-flex min-w-0 items-center gap-1.5"
                          style={shouldShowLeafIndent ? { paddingLeft: `${rh.depth * 14}px` } : undefined}
                        >
                          {isGroup && idx === 0 && (
                            <button
                              type="button"
                              aria-label={expandedRowKeys.has(rh.key) ? "Recolher grupo" : "Expandir grupo"}
                              onClick={(event) => {
                                event.stopPropagation();
                                onToggleRowGroup(rh.key);
                              }}
                              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                            >
                              {expandedRowKeys.has(rh.key)
                                ? <ChevronDown className="h-3.5 w-3.5" />
                                : <ChevronRight className="h-3.5 w-3.5" />}
                            </button>
                          )}
                          <span className={cn("truncate", isGroup && idx === 0 && "text-foreground")}>
                            {value}
                            {isGroup && idx === 0 ? " subtotal" : ""}
                          </span>
                        </span>
                      </td>
                    );
                  })}
                  {rowDims.length === 0 && (
                    <td className={cn("sticky left-0 z-[1] bg-card/85 backdrop-blur font-semibold text-muted-foreground", cellPad)}>—</td>
                  )}
                  {cols.map((c) => {
                    const cell = pivot.cells.get(rh.key)?.get(c.key) ?? {};
                    return measures.map((m) => {
                      const rawValue = cell[m.id] ?? null;
                      const showAs = showAsFor(m.id);
                      const displayValue = applyShowAs(rawValue, showAs, {
                        rowTotal: pivot.rowTotals.get(rh.key)?.[m.id],
                        colTotal: pivot.colTotals.get(c.key)?.[m.id],
                        grandTotal: pivot.grandTotal[m.id],
                      });
                      const max = showAs === "normal" ? (maxByMeasure.get(m.id) ?? 0) : 1;
                      const canDrill = pivot.cells.get(rh.key)?.has(c.key) ?? false;
                      return (
                        <td
                          key={`v-${rh.key}-${c.key}-${m.id}`}
                          role="button"
                          tabIndex={canDrill ? 0 : -1}
                          title={canDrill ? "Clique para ver as linhas que compõem este valor" : undefined}
                          onClick={() => {
                            if (!canDrill) return;
                            openDrill(rh, c, m);
                          }}
                          onKeyDown={(event) => {
                            if (!canDrill) return;
                            if (event.key !== "Enter" && event.key !== " ") return;
                            event.preventDefault();
                            openDrill(rh, c, m);
                          }}
                          style={cellBg(viz, m, displayValue, max)}
                          className={cn(
                            "border-l border-border/10 text-right tabular-nums transition-colors",
                            cellPad,
                            !rh.isLeaf && "bg-secondary/25 font-semibold",
                            toneClass(m.tone, displayValue),
                            canDrill && "cursor-zoom-in outline-none hover:ring-1 hover:ring-primary/40 focus-visible:ring-2 focus-visible:ring-primary/60",
                          )}
                        >
                          {fmtPivotDisplay(m, displayValue, showAs)}
                        </td>
                      );
                    });
                  })}
                </tr>
              );
            })}
            {shouldVirtualize && virtualRange.bottomSpacer > 0 && (
              <tr aria-hidden="true">
                <td colSpan={totalColumnCount} style={{ height: virtualRange.bottomSpacer, padding: 0, border: 0 }} />
              </tr>
            )}
          </tbody>
          <tfoot className="sticky bottom-0 z-10">
            <tr className="border-t border-border/50 bg-card/95 font-semibold shadow-[0_-8px_16px_rgba(15,23,42,0.08)] backdrop-blur">
              <td
                colSpan={Math.max(1, rowDims.length)}
                className={cn("sticky left-0 z-[2] bg-card/95 text-left text-[10px] uppercase tracking-wider text-muted-foreground", cellPad)}
              >
                Total
              </td>
              {cols.map((c) =>
                measures.map((m) => {
                  const rawValue = pivot.colTotals.get(c.key)?.[m.id] ?? (c.key === "__all__" ? pivot.grandTotal[m.id] : null);
                  const showAs = showAsFor(m.id);
                  const displayValue = applyShowAs(rawValue, showAs, {
                    rowTotal: pivot.grandTotal[m.id],
                    colTotal: pivot.colTotals.get(c.key)?.[m.id],
                    grandTotal: pivot.grandTotal[m.id],
                  });
                  return (
                    <td
                      key={`ft-${c.key}-${m.id}`}
                      className={cn(
                        "border-l border-border/20 text-right tabular-nums",
                        cellPad,
                        toneClass(m.tone, displayValue),
                      )}
                    >
                      {fmtPivotDisplay(m, displayValue, showAs)}
                    </td>
                  );
                }),
              )}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

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

      const safeNum = (v: number | null | undefined): number | "" =>
        v !== null && v !== undefined && isFinite(v) ? Number(v) : "";

      const dataRows: (string | number)[][] = [];

      for (const rh of sortedRows) {
        const row: (string | number)[] = [];
        rowDims.forEach((_, i) => {
          if (!rh.isLeaf) {
            row.push(i === 0 ? `${rh.values[0] ?? ""} subtotal` : "");
          } else if (rh.parentKey && i === 0) {
            row.push("");
          } else if (rh.parentKey && i === Math.min(1, rowDims.length - 1)) {
            row.push(`  ${rh.values[i] ?? ""}`);
          } else {
            row.push(rh.values[i] ?? "");
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
      }

      // Linha de rodapé com totais por coluna + grand total
      const footerRow: (string | number)[] = ["Total"];
      for (let i = 1; i < rowDims.length; i++) footerRow.push("");
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
      const dataUrl = await toPng(tableRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#0b0b0f",
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
