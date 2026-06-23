// CustomSlideEditor — canvas WYSIWYG para o slide "Personalizado".
// Drag + resize via react-rnd. Snap-to-grid de 10px com guias de alinhamento
// dinâmicas. Atalhos de teclado, registro do canvas para o exporter, menu
// de templates built-in / do usuário.

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Rnd } from "react-rnd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  ArrowDown, ArrowUp, Copy as CopyIcon, GitBranch, Image as ImageIcon,
  Layers as LayersIcon, Plus, Square, Table as TableIcon,
  Trash2, Type as TypeIcon, AlignLeft, ZoomIn, ZoomOut, Maximize2,
  BarChart3, Trophy, BookOpen, Save, X, ChevronDown,
  LineChart as LineChartIcon, BarChart as BarIcon, BarChartHorizontal,
  AreaChart as AreaIcon, PieChart as PieIcon, CircleDot,
  ScatterChart as ScatterIcon, Circle, Filter as FunnelIcon,
  Combine, Network, Radar as RadarIcon, Box as BoxIcon,
  BarChart2, Hash,
  Undo2, Redo2, Lock, Unlock, ChevronUp, ChevronsUp, ChevronsDown,
  AlignHorizontalJustifyCenter, AlignVerticalJustifyCenter,
  AlignStartHorizontal, AlignEndHorizontal,
  AlignStartVertical, AlignEndVertical,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
  Group as GroupIcon, Ungroup as UngroupIcon, Grid3x3,
  Play, Paintbrush, Search, Star, StickyNote,
  Eye, EyeOff, GripVertical, Minus,
} from "lucide-react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";

import {
  CANVAS_W, CANVAS_H, FOOTER_H,
  newBlock, newChartBlock, BLOCK_LABELS, CHART_TYPE_LABELS, KPI_MEASURES,
  BUDGET_UNAVAILABLE_MEASURES, BUDGET_UNAVAILABLE_HINT,
  FORECAST_UNAVAILABLE_MEASURES, FORECAST_UNAVAILABLE_HINT,
  ROLLING_UNAVAILABLE_MEASURES, ROLLING_UNAVAILABLE_HINT,
  isFromBudgetBase, isFromForecastBase, isFromRollingBase,
  type BlockDataSource,
  type CustomBlock, type CustomBlockKind, type CustomChartType, type CustomSlideConfig,
  type KpiBlock, type ChartBlock, type TopSkuBlock, type ShapeBlock,
  type TitleBlock, type TextBlock, type DreBlock, type ImageBlock,
  isLineFamily,
  type ConditionalFormatMode, type ConditionalFormatRule,
  type OmniBaseBlock,
  type OmniEvolucaoMensalBlock, type OmniHeatmapSazonalidadeBlock,
  type OmniHeroisOfensoresBlock, type OmniCanalTrendBlock, type OmniCanalMixBlock,
  type OmniCustoEvolucaoBlock, type OmniCustoComposicaoBlock, type OmniCustoPressaoBlock,
  type OmniPriceDecompBlock, type OmniBridgePvmBlock, type OmniFarolBlock,
  type OmniAbcCurvaBlock, type OmniPortfolioMatrixBlock, type OmniAbcBarsBlock,
  type OmniMetric, type OmniDim, type OmniHeroesVariant, type OmniAbcSortBy,
} from "@/lib/customSlide";
import { LINES as DRE_LINES } from "@/components/pricing/DreTable";
import { Section, Row, ToggleField, NumberStepper, ColorField, Segmented, Slider, SelectField } from "./chart/Inspector";
import { MultiSelectFilter } from "@/components/pricing/MultiSelectFilter";
import { ShapeHandleOverlay } from "./ShapeHandleOverlay";
import { BlockRenderer, CUSTOM_TABLE_MEASURES, CUSTOM_TABLE_DIMS } from "./BlockRenderer";
import { SlideFilterProvider, useSlideFilters, dimensionLabel } from "./SlideFilterContext";
import { useMonthsInfo, useFyList } from "@/store/selectors";
import { cn } from "@/lib/utils";
import haraldFooterPng from "@/assets/harald-footer-bar.png";
import { registerCustomCanvas } from "@/lib/customCanvasRegistry";
import { saveUserTemplate } from "@/lib/customTemplates";
import { TemplatePicker } from "./templates/TemplatePicker";
import { ShapeInspector } from "./ShapeInspector";
import { RotatableBlock } from "./RotatableBlock";
import { Slider as UiSlider } from "@/components/ui/slider";
import { useSlidesFlow } from "@/store/slidesFlow";
import { newId } from "@/lib/slidesFlow";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { resolveTableFit, type FitInfo } from "@/lib/customCapacity";
import { usePricing } from "@/store/pricing";
import { useBudget } from "@/store/budget";
import { useForecast } from "@/store/forecast";
import { useRolling } from "@/store/rolling";
import { computePivot, type PivotConfig } from "@/lib/pivot";
import { buildUnifiedRows } from "@/lib/pivotData";
import type { Filters } from "@/lib/types";
import { BlockFilters } from "./BlockFilters";
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
  ContextMenuSeparator, ContextMenuShortcut,
} from "@/components/ui/context-menu";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

function dataSourceLabel(ds: BlockDataSource | undefined): string {
  if (ds === "budget") return "Budget";
  if (ds === "forecast") return "Forecast";
  if (ds === "rolling") return "Rolling";
  if (ds === "budget_real") return "Real Bud.";
  return "KE30";
}

function dataSourceBadgeClass(ds: BlockDataSource | undefined): string {
  if (ds === "budget") return "bg-purple-500/15 text-purple-600 dark:text-purple-300";
  if (ds === "forecast") return "bg-amber-500/15 text-amber-700 dark:text-amber-200";
  if (ds === "rolling") return "bg-orange-500/15 text-orange-700 dark:text-orange-200";
  if (ds === "budget_real") return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300";
  return "bg-blue-500/15 text-blue-600 dark:text-blue-300";
}

function dataSourceActiveClass(ds: BlockDataSource): string {
  if (ds === "budget") return "bg-purple-500/20 text-purple-700 dark:text-purple-200";
  if (ds === "forecast") return "bg-amber-500/20 text-amber-800 dark:text-amber-100";
  if (ds === "rolling") return "bg-orange-500/20 text-orange-800 dark:text-orange-100";
  if (ds === "budget_real") return "bg-emerald-500/20 text-emerald-700 dark:text-emerald-200";
  return "bg-blue-500/20 text-blue-700 dark:text-blue-200";
}

function dataSourceDescription(ds: BlockDataSource | undefined): string {
  if (ds === "budget") return "Agregada (Budget): receita, volume, CM, CPV. Sem MB/Frete/Comissao.";
  if (ds === "forecast") return "Forecast: volume por SKU/mes do ultimo ciclo carregado, com filtros de produto.";
  if (ds === "rolling") return "Rolling: DRE por SKU/mes com receita, volume, custos, frete, comissao e CM.";
  if (ds === "budget_real") return "Realizado da planilha Budget (legado). Sem MB/Frete/Comissao.";
  return "Detalhada (KE30): receita, custos, margens, frete, comissao.";
}

function unavailableMeasuresForSource(ds: BlockDataSource | undefined): readonly string[] {
  if (isFromForecastBase(ds)) return FORECAST_UNAVAILABLE_MEASURES;
  if (isFromRollingBase(ds)) return ROLLING_UNAVAILABLE_MEASURES;
  if (isFromBudgetBase(ds)) return BUDGET_UNAVAILABLE_MEASURES;
  return [];
}

function unavailableHintForSource(ds: BlockDataSource | undefined): string | undefined {
  if (isFromForecastBase(ds)) return FORECAST_UNAVAILABLE_HINT;
  if (isFromRollingBase(ds)) return ROLLING_UNAVAILABLE_HINT;
  if (isFromBudgetBase(ds)) return BUDGET_UNAVAILABLE_HINT;
  return undefined;
}
import {
  useEditorBinding, useUndoRedoState,
  addBlockAction, addChartBlockAction, deleteBlockAction, duplicateBlockAction,
  patchBlockAction, bringForwardAction, sendBackAction, bringToFrontAction,
  sendToBackAction, toggleLockAction, undo as undoAction, redo as redoAction,
  setShowHaraldFooter as setShowHaraldFooterAction,
  setBackground as setBackgroundAction,
  setSpeakerNotesAction,
  useSelection, selectBlock, setSelection, clearSelection,
  selectAllOnSlide, enterGroupEdit, exitGroupEdit,
  deleteBlocksAction, duplicateBlocksAction,
  patchBlocksAction, nudgeBlocksAction,
  alignBlocksAction, groupBlocksAction, ungroupBlocksAction,
  resizeGroupAction,
  copyElementStyleAction, pasteElementStyleAction, canPasteElementStyleAction, useCopiedElementStyle,
  insertBlockAction, insertBlocksAction,
  type AlignKind,
} from "./editorStore";
import { useEditorPrefs, snapToGrid, type GridSize, setEditorPrefs, getEditorPrefs } from "./editorPrefs";
import { getTheme, type SlideTheme } from "@/lib/slideThemes";
import { computeSnap, boundsOf, groupBounds } from "./canvas/alignmentGuides";
import { PresentationMode } from "./PresentationMode";
import { InlineTextEditor, InlineTextToolbar } from "./InlineTextEditor";
import { AssetLibrary } from "./AssetLibrary";
import { Pencil, Images, HelpCircle, Keyboard, RotateCw, TrendingUp, Gauge, Zap, Activity, PanelTop, Sparkles, Target, ListChecks } from "lucide-react";
import {
  brandStyleTargetLabel,
  buildBrandStylePatch,
  getBrandStyleTarget,
  getBrandStylesForBlock,
  type SlideBrandStyle,
} from "@/lib/slideBrandKit";

// Cross-slide clipboard. Module-level so it survives editor remounts when
// the user navigates between slides via the side strip.
let crossSlideClipboard: CustomBlock | null = null;

type Icon = React.ComponentType<{ className?: string }>;
const PALETTE_RECENTS_KEY = "omni4.customSlide.paletteRecents";
const PALETTE_FAVORITES_KEY = "omni4.customSlide.paletteFavorites";

function localId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizePaletteText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// Group 1 — Charts (and chart-like data viz: KPI Card + Table + Bridge)
const CHART_PALETTE: ({ id: string; label: string; icon: Icon } & (
  | { kind: "chart"; chartType: CustomChartType }
  | { kind: Exclude<CustomBlockKind, "chart"> }
))[] = [
  { id: "line",          kind: "chart", chartType: "line",          label: "Linha",            icon: LineChartIcon },
  { id: "column",        kind: "chart", chartType: "column",        label: "Coluna",           icon: BarChart3 },
  { id: "stackedColumn", kind: "chart", chartType: "stackedColumn", label: "Coluna Empilhada", icon: BarChart3 },
  { id: "hbar",          kind: "chart", chartType: "hbar",          label: "Barra",            icon: BarChartHorizontal },
  { id: "stackedBar",    kind: "chart", chartType: "stackedBar",    label: "Barra Empilhada",  icon: BarChartHorizontal },
  { id: "area",          kind: "chart", chartType: "area",          label: "Área",             icon: AreaIcon },
  { id: "stackedArea",   kind: "chart", chartType: "stackedArea",   label: "Área Empilhada",   icon: AreaIcon },
  { id: "pie",           kind: "chart", chartType: "pie",           label: "Pizza",            icon: PieIcon },
  { id: "donut",         kind: "chart", chartType: "donut",         label: "Rosca",            icon: CircleDot },
  { id: "scatter",       kind: "chart", chartType: "scatter",       label: "Dispersão",        icon: ScatterIcon },
  { id: "bubble",        kind: "chart", chartType: "bubble",        label: "Bolha",            icon: Circle },
  { id: "funnel",        kind: "chart", chartType: "funnel",        label: "Funil",            icon: FunnelIcon },
  { id: "combo",         kind: "chart", chartType: "combo",         label: "Combinado",        icon: Combine },
  { id: "treemap",       kind: "chart", chartType: "treemap",       label: "Mapa de Árvore",   icon: Network },
  { id: "radar",         kind: "chart", chartType: "radar",         label: "Radar",            icon: RadarIcon },
  { id: "boxplot",       kind: "chart", chartType: "boxplot",       label: "Caixa",            icon: BoxIcon },
  { id: "histogram",     kind: "chart", chartType: "histogram",     label: "Histograma",       icon: BarChart2 },
  { id: "waterfall",     kind: "chart", chartType: "waterfall",     label: "Bridge",           icon: GitBranch },
  { id: "table",         kind: "table", label: "Tabela",                                       icon: TableIcon },
  { id: "kpi",           kind: "kpi",   label: "KPI Card",                                     icon: Hash },
];

// Group 2 — Visual elements
const ELEMENT_PALETTE: { id: string; kind: CustomBlockKind; label: string; icon: Icon }[] = [
  { id: "title",  kind: "title",  label: "Título",      icon: TypeIcon },
  { id: "text",   kind: "text",   label: "Texto",       icon: AlignLeft },
  { id: "image",  kind: "image",  label: "Imagem",      icon: ImageIcon },
  { id: "shape",  kind: "shape",  label: "Forma",       icon: Square },
  { id: "topSku", kind: "topSku", label: "Top Ranking", icon: Trophy },
  { id: "dre",    kind: "dre",    label: "DRE",         icon: TableIcon },
];

// Group 3 — Omni Analytics
type OmniPaletteEntry = { id: string; kind: CustomBlockKind; label: string; icon: Icon; group: string };
const OMNI_PALETTE: OmniPaletteEntry[] = [
  // Visão Geral
  { id: "omni_evolucao_mensal",      kind: "omni_evolucao_mensal",      label: "Evolução Mensal",      icon: TrendingUp,        group: "Visão Geral" },
  { id: "omni_heatmap_sazonalidade", kind: "omni_heatmap_sazonalidade", label: "Heatmap Sazonalidade", icon: Grid3x3,           group: "Visão Geral" },
  { id: "omni_herois_ofensores",     kind: "omni_herois_ofensores",     label: "Heróis/Ofensores",     icon: Zap,               group: "Visão Geral" },
  // Canais
  { id: "omni_canal_trend",          kind: "omni_canal_trend",          label: "Tendência Canal",       icon: Activity,          group: "Canais" },
  { id: "omni_canal_mix",            kind: "omni_canal_mix",            label: "Mix por Canal",         icon: LayersIcon,        group: "Canais" },
  // Custos
  { id: "omni_custo_evolucao",       kind: "omni_custo_evolucao",       label: "Evolução Custos",       icon: BarChart2,         group: "Custos" },
  { id: "omni_custo_composicao",     kind: "omni_custo_composicao",     label: "Composição Custos",     icon: BarChart3,         group: "Custos" },
  { id: "omni_custo_pressao",        kind: "omni_custo_pressao",        label: "Pressão de Custo",      icon: Activity,          group: "Custos" },
  // Preço / Bridge
  { id: "omni_price_decomp",         kind: "omni_price_decomp",         label: "Decomp. Preço",         icon: PanelTop,          group: "Preço" },
  { id: "omni_bridge_pvm",           kind: "omni_bridge_pvm",           label: "Bridge PVM",            icon: GitBranch,         group: "Preço" },
  // ABC / Farol
  { id: "omni_farol",                kind: "omni_farol",                label: "Farol Positivação",     icon: Gauge,             group: "ABC/Farol" },
  { id: "omni_abc_curva",            kind: "omni_abc_curva",            label: "Curva ABC",             icon: Network,           group: "ABC/Farol" },
  { id: "omni_portfolio_matrix",     kind: "omni_portfolio_matrix",     label: "Matriz Portfólio",      icon: ScatterIcon,       group: "ABC/Farol" },
  { id: "omni_abc_bars",             kind: "omni_abc_bars",             label: "Barras ABC",            icon: BarChartHorizontal, group: "ABC/Farol" },
];
const OMNI_GROUPS = ["Visão Geral", "Canais", "Custos", "Preço", "ABC/Farol"] as const;

interface Props {
  /** ID estável do slide — usado para registrar o canvas no exporter */
  slideId?: string;
  config: CustomSlideConfig;
  onChange: (next: CustomSlideConfig) => void;
  /** Colaboradores ativos (todos os slides) — filtrados internamente por slideId */
  collaborators?: import("@/lib/collaboration").CollabUser[];
  /** Callback de mouse-move em coordenadas do canvas (1280x720) */
  onCursorMove?: (x: number, y: number) => void;
}

export function CustomSlideEditor({ slideId, config, onChange, collaborators, onCursorMove }: Props) {
  // Bind the parent's config <-> internal Zustand+temporal store first so
  // selection store reflects the right slide on initial render.
  useEditorBinding(config, onChange, slideId);
  const undoRedo = useUndoRedoState();
  const { selectedIds, groupEditMemberId } = useSelection();
  const prefs = useEditorPrefs();
  const copiedStyle = useCopiedElementStyle();
  const [presentOpen, setPresentOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [showLayers, setShowLayers] = useState(false);
  const [paletteSearch, setPaletteSearch] = useState("");
  const [recentPaletteIds, setRecentPaletteIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(PALETTE_RECENTS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string").slice(0, 6) : [];
    } catch {
      return [];
    }
  });
  const [favoritePaletteIds, setFavoritePaletteIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(PALETTE_FAVORITES_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string").slice(0, 12) : [];
    } catch {
      return [];
    }
  });
  const [canvasHovered, setCanvasHovered] = useState(false);

  const [fitScale, setFitScale] = useState(1);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  // Marquee selection rectangle (canvas-space coords).
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // Inline text editing (double-click no bloco title/text).
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  // Limpa inline edit se o bloco for excluído ou ficar bloqueado.
  useEffect(() => {
    if (!inlineEditId) return;
    const blk = config.blocks.find((b) => b.id === inlineEditId);
    if (!blk || blk.locked || (blk.kind !== "title" && blk.kind !== "text")) {
      setInlineEditId(null);
    }
  }, [inlineEditId, config.blocks]);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);

  // Calcula a escala para caber no contêiner mantendo a proporção 16:9
  useEffect(() => {
    function compute() {
      const el = wrapperRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const availW = Math.max(rect.width - 24, 100);
      const availH = Math.max(rect.height - 24, 100);
      const s = Math.min(availW / CANVAS_W, availH / CANVAS_H);
      setFitScale(s > 0 ? s : 0.1);
    }
    compute();
    const ro = new ResizeObserver(compute);
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!slideId) return;
    registerCustomCanvas(slideId, canvasRef.current);
    return () => registerCustomCanvas(slideId, null);
  }, [slideId]);

  // Ctrl+scroll to zoom canvas (reads/writes module-level prefs to avoid stale closure)
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setEditorPrefs({ zoom: Math.min(1.5, Math.max(0.5, getEditorPrefs().zoom + delta)) });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const scale = fitScale * prefs.zoom;
  scaleRef.current = scale;

  const selected = selectedIds.length === 1
    ? (config.blocks.find((b) => b.id === selectedIds[0]) ?? null)
    : null;
  const multiSelected = selectedIds.length > 1
    ? config.blocks.filter((b) => selectedIds.includes(b.id))
    : [];

  const updateBlock = (id: string, patch: Partial<CustomBlock>) => {
    const keys = Object.keys(patch);
    const isMove = keys.every((k) => k === "x" || k === "y");
    const isResize = keys.some((k) => k === "w" || k === "h");
    const isOrder = keys.length === 1 && keys[0] === "z";
    const isLock = keys.length === 1 && keys[0] === "locked";
    const label = isLock ? "Bloquear / Desbloquear"
      : isOrder ? "Alterar ordem"
      : isResize ? "Redimensionar bloco"
      : isMove ? "Mover bloco"
      : "Alterar dados";
    patchBlockAction(id, patch, label);
  };
  const addBlock = (kind: CustomBlockKind) => {
    const id = addBlockAction(kind);
    if (id) setSelection([id]);
  };
  const addChart = (chartType: CustomChartType) => {
    const id = addChartBlockAction(chartType);
    if (id) setSelection([id]);
  };
  const addInsightCard = () => {
    const x = 60;
    const y = 150;
    const blocks: CustomBlock[] = [
      {
        id: localId(), kind: "shape",
        x, y, w: 520, h: 235, z: 1,
        shape: "roundRect",
        fill: "FFF7F8",
        fillOpacity: 100,
        strokeColor: "FDA4AF",
        strokeWidth: 1,
        strokeStyle: "solid",
        radius: 14,
        rotation: 0,
        lineThickness: 2,
        lineDirection: "horizontal",
        arrowStart: false,
        arrowEnd: false,
        shadowEnabled: true,
        shadowColor: "000000",
        shadowOpacity: 10,
        shadowBlur: 12,
        shadowX: 0,
        shadowY: 4,
      } as CustomBlock,
      {
        id: localId(), kind: "title",
        x: x + 28, y: y + 22, w: 460, h: 38, z: 2,
        text: "Insight executivo",
        size: 24,
        bold: true,
        italic: false,
        color: "C8102E",
        align: "left",
        letterSpacing: 0,
        lineHeight: 1.05,
        textTransform: "none",
        padding: 0,
        backgroundColor: "",
        borderRadius: 0,
      } as CustomBlock,
      {
        id: localId(), kind: "text",
        x: x + 28, y: y + 74, w: 462, h: 88, z: 3,
        text: "O que aconteceu: descreva o movimento principal.\nPor que importa: conecte com margem, volume ou preco.\nAcao sugerida: indique a decisao esperada.",
        size: 17,
        italic: false,
        color: "1C2430",
        align: "left",
        letterSpacing: 0,
        lineHeight: 1.35,
        textTransform: "none",
        padding: 0,
        backgroundColor: "",
        borderRadius: 0,
      } as CustomBlock,
      {
        id: localId(), kind: "text",
        x: x + 28, y: y + 178, w: 462, h: 34, z: 4,
        text: "Proxima acao: validar plano com Comercial",
        size: 16,
        italic: false,
        color: "7F1022",
        align: "left",
        letterSpacing: 0,
        lineHeight: 1.2,
        textTransform: "none",
        padding: 8,
        backgroundColor: "FFE4E6",
        borderRadius: 8,
      } as CustomBlock,
    ];
    const ids = insertBlocksAction(blocks, "Adicionar bloco");
    if (ids.length > 0) {
      groupBlocksAction(ids);
      setSelection(ids);
    }
  };
  const addExecutiveSummaryCard = () => {
    const x = 60;
    const y = 90;
    const blocks: CustomBlock[] = [
      {
        id: localId(), kind: "shape",
        x, y, w: 1180, h: 230, z: 1,
        shape: "roundRect",
        fill: "F8FAFC",
        fillOpacity: 100,
        strokeColor: "E2E8F0",
        strokeWidth: 1,
        strokeStyle: "solid",
        radius: 14,
        rotation: 0,
        lineThickness: 2,
        lineDirection: "horizontal",
        arrowStart: false,
        arrowEnd: false,
        shadowEnabled: true,
        shadowColor: "000000",
        shadowOpacity: 8,
        shadowBlur: 14,
        shadowX: 0,
        shadowY: 5,
      } as CustomBlock,
      {
        id: localId(), kind: "title",
        x: x + 30, y: y + 24, w: 430, h: 42, z: 2,
        text: "Resumo executivo",
        size: 28,
        bold: true,
        italic: false,
        color: "C8102E",
        align: "left",
        letterSpacing: 0,
        lineHeight: 1.05,
        textTransform: "none",
        padding: 0,
        backgroundColor: "",
        borderRadius: 0,
      } as CustomBlock,
      {
        id: localId(), kind: "text",
        x: x + 30, y: y + 78, w: 1100, h: 38, z: 3,
        text: "Mensagem-chave: escreva em uma frase o principal recado do slide.",
        size: 22,
        italic: false,
        color: "1C2430",
        align: "left",
        letterSpacing: 0,
        lineHeight: 1.15,
        textTransform: "none",
        padding: 0,
        backgroundColor: "",
        borderRadius: 0,
      } as CustomBlock,
      {
        id: localId(), kind: "text",
        x: x + 30, y: y + 135, w: 340, h: 68, z: 4,
        text: "1. Resultado\nO indicador principal ficou acima/abaixo do esperado.",
        size: 16,
        italic: false,
        color: "334155",
        align: "left",
        letterSpacing: 0,
        lineHeight: 1.28,
        textTransform: "none",
        padding: 12,
        backgroundColor: "FFFFFF",
        borderRadius: 10,
      } as CustomBlock,
      {
        id: localId(), kind: "text",
        x: x + 420, y: y + 135, w: 340, h: 68, z: 5,
        text: "2. Causa\nExplique o driver: preco, volume, mix, custo ou canal.",
        size: 16,
        italic: false,
        color: "334155",
        align: "left",
        letterSpacing: 0,
        lineHeight: 1.28,
        textTransform: "none",
        padding: 12,
        backgroundColor: "FFFFFF",
        borderRadius: 10,
      } as CustomBlock,
      {
        id: localId(), kind: "text",
        x: x + 810, y: y + 135, w: 320, h: 68, z: 6,
        text: "3. Acao\nIndique a decisao ou o proximo passo recomendado.",
        size: 16,
        italic: false,
        color: "334155",
        align: "left",
        letterSpacing: 0,
        lineHeight: 1.28,
        textTransform: "none",
        padding: 12,
        backgroundColor: "FFFFFF",
        borderRadius: 10,
      } as CustomBlock,
    ];
    const ids = insertBlocksAction(blocks, "Adicionar bloco");
    if (ids.length > 0) {
      groupBlocksAction(ids);
      setSelection(ids);
    }
  };
  const addDecisionCard = () => {
    const x = 610;
    const y = 150;
    const blocks: CustomBlock[] = [
      {
        id: localId(), kind: "shape",
        x, y, w: 520, h: 235, z: 1,
        shape: "roundRect",
        fill: "F8FAFC",
        fillOpacity: 100,
        strokeColor: "CBD5E1",
        strokeWidth: 1,
        strokeStyle: "solid",
        radius: 14,
        rotation: 0,
        lineThickness: 2,
        lineDirection: "horizontal",
        arrowStart: false,
        arrowEnd: false,
        shadowEnabled: true,
        shadowColor: "000000",
        shadowOpacity: 10,
        shadowBlur: 12,
        shadowX: 0,
        shadowY: 4,
      } as CustomBlock,
      {
        id: localId(), kind: "title",
        x: x + 28, y: y + 22, w: 460, h: 38, z: 2,
        text: "Decisao requerida",
        size: 24,
        bold: true,
        italic: false,
        color: "1C2430",
        align: "left",
        letterSpacing: 0,
        lineHeight: 1.05,
        textTransform: "none",
        padding: 0,
        backgroundColor: "",
        borderRadius: 0,
      } as CustomBlock,
      {
        id: localId(), kind: "text",
        x: x + 28, y: y + 76, w: 462, h: 70, z: 3,
        text: "Recomendacao: descreva a decisao em uma frase.\nImpacto esperado: margem, volume ou preco.\nTrade-off: o que abrimos mao para capturar o ganho.",
        size: 16,
        italic: false,
        color: "334155",
        align: "left",
        letterSpacing: 0,
        lineHeight: 1.32,
        textTransform: "none",
        padding: 0,
        backgroundColor: "",
        borderRadius: 0,
      } as CustomBlock,
      {
        id: localId(), kind: "text",
        x: x + 28, y: y + 168, w: 142, h: 42, z: 4,
        text: "Dono\nComercial",
        size: 14,
        italic: false,
        color: "0F172A",
        align: "center",
        letterSpacing: 0,
        lineHeight: 1.22,
        textTransform: "none",
        padding: 7,
        backgroundColor: "E0F2FE",
        borderRadius: 8,
      } as CustomBlock,
      {
        id: localId(), kind: "text",
        x: x + 190, y: y + 168, w: 142, h: 42, z: 5,
        text: "Prazo\n30 dias",
        size: 14,
        italic: false,
        color: "0F172A",
        align: "center",
        letterSpacing: 0,
        lineHeight: 1.22,
        textTransform: "none",
        padding: 7,
        backgroundColor: "E0F2FE",
        borderRadius: 8,
      } as CustomBlock,
      {
        id: localId(), kind: "text",
        x: x + 352, y: y + 168, w: 138, h: 42, z: 6,
        text: "Status\nAberto",
        size: 14,
        italic: false,
        color: "7F1022",
        align: "center",
        letterSpacing: 0,
        lineHeight: 1.22,
        textTransform: "none",
        padding: 7,
        backgroundColor: "FFE4E6",
        borderRadius: 8,
      } as CustomBlock,
    ];
    const ids = insertBlocksAction(blocks, "Adicionar bloco");
    if (ids.length > 0) {
      groupBlocksAction(ids);
      setSelection(ids);
    }
  };
  const addRiskOpportunityCard = () => {
    const x = 60;
    const y = 420;
    const blocks: CustomBlock[] = [
      {
        id: localId(), kind: "shape",
        x, y, w: 520, h: 190, z: 1,
        shape: "roundRect",
        fill: "F8FAFC",
        fillOpacity: 100,
        strokeColor: "CBD5E1",
        strokeWidth: 1,
        strokeStyle: "solid",
        radius: 14,
        rotation: 0,
        lineThickness: 2,
        lineDirection: "horizontal",
        arrowStart: false,
        arrowEnd: false,
        shadowEnabled: true,
        shadowColor: "000000",
        shadowOpacity: 10,
        shadowBlur: 12,
        shadowX: 0,
        shadowY: 4,
      } as CustomBlock,
      {
        id: localId(), kind: "text",
        x: x + 24, y: y + 22, w: 216, h: 130, z: 2,
        text: "Risco\n\nO que pode piorar o resultado se nada for feito.",
        size: 17,
        italic: false,
        color: "991B1B",
        align: "left",
        letterSpacing: 0,
        lineHeight: 1.28,
        textTransform: "none",
        padding: 14,
        backgroundColor: "FEE2E2",
        borderRadius: 10,
      } as CustomBlock,
      {
        id: localId(), kind: "text",
        x: x + 280, y: y + 22, w: 216, h: 130, z: 3,
        text: "Oportunidade\n\nO que pode capturar ganho de margem, volume ou mix.",
        size: 17,
        italic: false,
        color: "075985",
        align: "left",
        letterSpacing: 0,
        lineHeight: 1.28,
        textTransform: "none",
        padding: 14,
        backgroundColor: "E0F2FE",
        borderRadius: 10,
      } as CustomBlock,
      {
        id: localId(), kind: "text",
        x: x + 24, y: y + 160, w: 472, h: 20, z: 4,
        text: "Priorize pelo impacto financeiro e pela velocidade de execucao.",
        size: 14,
        italic: false,
        color: "64748B",
        align: "center",
        letterSpacing: 0,
        lineHeight: 1.1,
        textTransform: "none",
        padding: 0,
        backgroundColor: "",
        borderRadius: 0,
      } as CustomBlock,
    ];
    const ids = insertBlocksAction(blocks, "Adicionar bloco");
    if (ids.length > 0) {
      groupBlocksAction(ids);
      setSelection(ids);
    }
  };
  const removeBlock = (id: string) => {
    deleteBlockAction(id);
    if (selectedIds.includes(id)) clearSelection();
  };
  const duplicateBlock = (id: string) => {
    const newId = duplicateBlockAction(id);
    if (newId) setSelection([newId]);
  };
  const bringForward = (id: string) => bringForwardAction(id);
  const sendBack = (id: string) => sendBackAction(id);
  const bringToFront = (id: string) => bringToFrontAction(id);
  const sendToBack = (id: string) => sendToBackAction(id);
  const toggleLock = (id: string) => toggleLockAction(id);

  const rememberPaletteUse = useCallback((id: string) => {
    setRecentPaletteIds((prev) => {
      const next = [id, ...prev.filter((item) => item !== id)].slice(0, 6);
      try {
        localStorage.setItem(PALETTE_RECENTS_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage failures; recents are a convenience only.
      }
      return next;
    });
  }, []);
  const runPaletteAction = useCallback((id: string, action: () => void) => {
    rememberPaletteUse(id);
    action();
  }, [rememberPaletteUse]);
  const togglePaletteFavorite = useCallback((id: string) => {
    setFavoritePaletteIds((prev) => {
      const exists = prev.includes(id);
      const next = exists ? prev.filter((item) => item !== id) : [id, ...prev].slice(0, 12);
      try {
        localStorage.setItem(PALETTE_FAVORITES_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage failures; favorites remain available in memory.
      }
      return next;
    });
  }, []);
  const paletteQuery = normalizePaletteText(paletteSearch.trim());
  const matchesPalette = useCallback((...parts: Array<string | undefined | null>) => {
    if (!paletteQuery) return true;
    return normalizePaletteText(parts.filter(Boolean).join(" ")).includes(paletteQuery);
  }, [paletteQuery]);
  const storytellingPalette = [
    { id: "story:summary", icon: ListChecks, label: "Resumo Exec.", keywords: "resumo executivo leitura abertura resultado causa acao", onClick: addExecutiveSummaryCard },
    { id: "story:insight", icon: StickyNote, label: "Insight", keywords: "insight executivo storytelling narrativa acao", onClick: addInsightCard },
    { id: "story:decision", icon: Target, label: "Decisao", keywords: "decisao recomendacao dono prazo status", onClick: addDecisionCard },
    { id: "story:risk", icon: Gauge, label: "Risco/Oportun.", keywords: "risco oportunidade priorizacao impacto", onClick: addRiskOpportunityCard },
  ];
  const paletteActions = [
    ...storytellingPalette,
    ...CHART_PALETTE.map((it) => ({
      id: `chart:${it.id}`,
      icon: it.icon,
      label: it.label,
      keywords: `${it.id} ${it.kind}`,
      onClick: () => { if (it.kind === "chart") addChart(it.chartType); else addBlock(it.kind); },
    })),
    ...ELEMENT_PALETTE.map((it) => ({
      id: `element:${it.id}`,
      icon: it.icon,
      label: it.label,
      keywords: `${it.id} ${it.kind}`,
      onClick: () => addBlock(it.kind),
    })),
    ...OMNI_PALETTE.map((it) => ({
      id: `omni:${it.id}`,
      icon: it.icon,
      label: it.label,
      keywords: `${it.id} ${it.kind} ${it.group}`,
      onClick: () => addBlock(it.kind),
    })),
  ];
  const recentPalette = paletteSearch.trim()
    ? []
    : recentPaletteIds
        .map((id) => paletteActions.find((it) => it.id === id))
        .filter((it): it is typeof paletteActions[number] => Boolean(it));
  const favoritePalette = paletteSearch.trim()
    ? []
    : favoritePaletteIds
        .map((id) => paletteActions.find((it) => it.id === id))
        .filter((it): it is typeof paletteActions[number] => Boolean(it));
  const visibleStorytellingPalette = storytellingPalette.filter((it) => matchesPalette(it.label, it.keywords));
  const visibleChartPalette = CHART_PALETTE.filter((it) => matchesPalette(it.label, it.id, it.kind));
  const visibleElementPalette = ELEMENT_PALETTE.filter((it) => matchesPalette(it.label, it.id, it.kind));
  const visibleOmniPalette = OMNI_PALETTE.filter((it) => matchesPalette(it.label, it.id, it.group));
  const hasPaletteResults = visibleStorytellingPalette.length > 0
    || visibleChartPalette.length > 0
    || visibleElementPalette.length > 0
    || visibleOmniPalette.length > 0;

  // Helper: ids that move together when dragging `id`.
  // If id belongs to a group (and we're not in group-edit mode for it),
  // and the selection includes any group member, drag the whole group.
  const draggableSiblings = useCallback((id: string): string[] => {
    if (groupEditMemberId === id) return [id];
    const blk = config.blocks.find((b) => b.id === id);
    if (!blk) return [id];
    if (blk.groupId) {
      const grp = (config.groups ?? []).find((g) => g.id === blk.groupId);
      if (grp) return grp.memberIds;
    }
    // Multi-selection move: if id is in selection and selection > 1, move all selected.
    if (selectedIds.includes(id) && selectedIds.length > 1) return selectedIds;
    return [id];
  }, [config.blocks, config.groups, groupEditMemberId, selectedIds]);

  // Helpers for clipboard + alignment shortcuts.
  const copySelectionToClipboard = useCallback((cut: boolean) => {
    if (selectedIds.length === 0) return;
    const blk = config.blocks.find((b) => b.id === selectedIds[0]);
    if (!blk) return;
    crossSlideClipboard = JSON.parse(JSON.stringify(blk)) as CustomBlock;
    if (cut) {
      if (selectedIds.length === 1) removeBlock(selectedIds[0]);
      else deleteBlocksAction(selectedIds);
      toast.success("Bloco cortado");
    } else {
      toast.success("Bloco copiado");
    }
  }, [selectedIds, config.blocks]);

  const pasteFromClipboard = useCallback(() => {
    if (!crossSlideClipboard) return;
    const src = crossSlideClipboard;
    const clone = JSON.parse(JSON.stringify(src)) as CustomBlock;
    clone.id = crypto.randomUUID();
    clone.locked = false;
    let x = src.x + 20;
    let y = src.y + 20;
    if (x + src.w > CANVAS_W || y + src.h > CANVAS_H) {
      x = Math.max(0, Math.round((CANVAS_W - src.w) / 2));
      y = Math.max(0, Math.round((CANVAS_H - src.h) / 2));
    }
    clone.x = x;
    clone.y = y;
    const newId = insertBlockAction(clone, "Adicionar bloco");
    if (newId) {
      setSelection([newId]);
      toast.success("Bloco colado");
    }
  }, []);

  const centerSelectedH = useCallback(() => {
    if (selectedIds.length !== 1) return;
    const b = config.blocks.find((x) => x.id === selectedIds[0]);
    if (!b) return;
    patchBlockAction(b.id, { x: Math.round((CANVAS_W - b.w) / 2) } as Partial<CustomBlock>, "Mover bloco");
  }, [selectedIds, config.blocks]);

  const centerSelectedV = useCallback(() => {
    if (selectedIds.length !== 1) return;
    const b = config.blocks.find((x) => x.id === selectedIds[0]);
    if (!b) return;
    patchBlockAction(b.id, { y: Math.round((CANVAS_H - b.h) / 2) } as Partial<CustomBlock>, "Mover bloco");
  }, [selectedIds, config.blocks]);

  // Atalhos de teclado
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inField = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      if (!inField && (e.metaKey || e.ctrlKey)) {
        const k = e.key.toLowerCase();
        if (k === "z" && !e.shiftKey) { e.preventDefault(); undoAction(); return; }
        if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); redoAction(); return; }
        if (k === "a") { e.preventDefault(); selectAllOnSlide(); return; }
        if (k === "c" && !e.shiftKey) { e.preventDefault(); copySelectionToClipboard(false); return; }
        if (k === "x" && !e.shiftKey) { e.preventDefault(); copySelectionToClipboard(true); return; }
        if (k === "v" && !e.shiftKey) { e.preventDefault(); pasteFromClipboard(); return; }
        if (k === "g" && !e.shiftKey) {
          e.preventDefault();
          if (selectedIds.length >= 2) { groupBlocksAction(selectedIds); toast.success("Blocos agrupados"); }
          return;
        }
        if (k === "g" && e.shiftKey) {
          e.preventDefault();
          if (selectedIds.length > 0) { ungroupBlocksAction(selectedIds); toast.success("Grupo desfeito"); }
          return;
        }
        if (e.shiftKey && k === "h") { e.preventDefault(); centerSelectedH(); return; }
        if (e.shiftKey && k === "v") { e.preventDefault(); centerSelectedV(); return; }
      }
      // F5 / Cmd+Shift+P → presentation mode (works even with no selection).
      if (!inField && (e.key === "F5" || ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "p"))) {
        e.preventDefault();
        setPresentOpen(true);
        return;
      }
      // "?" → open shortcuts dialog.
      if (!inField && (e.key === "?" || (e.shiftKey && e.key === "/"))) {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (inField) return;
      if (e.key === "Escape") {
        if (groupEditMemberId) exitGroupEdit();
        else clearSelection();
        return;
      }
      if (selectedIds.length === 0) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (selectedIds.length === 1) removeBlock(selectedIds[0]);
        else deleteBlocksAction(selectedIds);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (selectedIds.length === 1) duplicateBlock(selectedIds[0]);
        else duplicateBlocksAction(selectedIds);
        return;
      }
      if (selectedIds.length === 1 && (e.metaKey || e.ctrlKey)) {
        if (e.shiftKey && e.key === "]") { e.preventDefault(); bringToFrontAction(selectedIds[0]); return; }
        if (e.shiftKey && e.key === "[") { e.preventDefault(); sendToBackAction(selectedIds[0]); return; }
        if (e.key === "]") { e.preventDefault(); bringForward(selectedIds[0]); return; }
        if (e.key === "[") { e.preventDefault(); sendBack(selectedIds[0]); return; }
      }

      // Arrow nudge — works for single or multi. Shift = 40px, normal = 10px.
      const step = e.shiftKey ? 40 : 10;
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      if (dx !== 0 || dy !== 0) {
        e.preventDefault();
        nudgeBlocksAction(
          selectedIds,
          dx, dy,
          selectedIds.length > 1 ? "Mover blocos" : "Mover bloco",
        );
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedIds, groupEditMemberId, config.blocks, copySelectionToClipboard, pasteFromClipboard, centerSelectedH, centerSelectedV]);

  // Colar imagem do clipboard (Ctrl+V com imagem copiada / print de tela)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const active = document.activeElement;
      const inField =
        active?.tagName === "INPUT" ||
        active?.tagName === "TEXTAREA" ||
        (active as HTMLElement)?.isContentEditable;
      if (inField) return;

      const items = Array.from(e.clipboardData?.items ?? []);
      const imageItem = items.find((item) => item.type.startsWith("image/"));
      if (!imageItem) return;

      e.preventDefault();
      const file = imageItem.getAsFile();
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const W = 600, H = 400;
        const id = addBlockAction("image");
        if (!id) return;
        patchBlockAction(
          id,
          { src: dataUrl, w: W, h: H,
            x: Math.round((CANVAS_W - W) / 2),
            y: Math.round((CANVAS_H - H) / 2),
          } as Partial<CustomBlock>,
          "Colar imagem",
        );
        setSelection([id]);
        toast.success("Imagem colada no slide.");
      };
      reader.readAsDataURL(file);
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  // Smart guides — compute lines + snap target for the dragging block.
  // Snap is applied by react-rnd via onDrag's returned coords; we mutate
  // d.x / d.y directly which Rnd respects on next frame.
  const computeGuides = useCallback((activeIds: string[], x: number, y: number, w: number, h: number) => {
    const excl = new Set(activeIds);
    const others = boundsOf(config.blocks, excl);
    const snap = computeSnap({ x, y, w, h }, others);
    setGuides(snap.guides);
    return snap;
  }, [config.blocks]);

  // Layers panel data
  const layersSorted = useMemo(
    () => [...config.blocks].sort((a, b) => b.z - a.z),
    [config.blocks],
  );
  const hiddenCount = config.blocks.filter((b) => b.hidden).length;
  const lockedCount = config.blocks.filter((b) => b.locked).length;
  const handleLayerDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = layersSorted.findIndex((b) => b.id === active.id);
    const newIndex = layersSorted.findIndex((b) => b.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(layersSorted, oldIndex, newIndex);
    patchBlocksAction(
      reordered.map((blk, i) => ({ id: blk.id, patch: { z: reordered.length - i } as Partial<CustomBlock> })),
      "Reordenar camadas",
    );
  }, [layersSorted]);

  // Templates
  const [tplOpen, setTplOpen] = useState(false);
  const [saveTplOpen, setSaveTplOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [assetsOpen, setAssetsOpen] = useState(false);
  const refreshUserTpls = () => { /* picker reloads internally */ };

  return (
    <SlideFilterProvider slideKey={slideId}>
    <div className={cn("grid h-full min-h-0 gap-3", showLayers ? "grid-cols-[180px_240px_minmax(0,1fr)_380px]" : "grid-cols-[180px_minmax(0,1fr)_380px]")}>
      {/* ====== Paleta ====== */}
      <ScrollArea className="rounded-lg border border-border/40 bg-card/40">
        <div className="flex flex-col gap-1 p-2">
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Modelos
          </div>
          <Button size="sm" variant="outline" className="h-7 justify-start gap-2 text-xs"
            onClick={() => setTplOpen(true)}>
            <BookOpen className="h-3.5 w-3.5" /> Aplicar modelo
          </Button>
          <Button size="sm" variant="ghost" className="h-7 justify-start gap-2 text-xs"
            onClick={() => setSaveTplOpen(true)}
            disabled={config.blocks.length === 0}>
            <Save className="h-3.5 w-3.5" /> Salvar como modelo
          </Button>
          <Button size="sm" variant="outline" className="h-7 justify-start gap-2 text-xs"
            onClick={() => setAssetsOpen(true)}>
            <Images className="h-3.5 w-3.5" /> Assets
          </Button>
          <div className="relative px-1 pt-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={paletteSearch}
              onChange={(e) => setPaletteSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setPaletteSearch("");
                }
              }}
              placeholder="Buscar blocos..."
              className="h-8 pl-7 pr-7 text-xs"
            />
            {paletteSearch && (
              <button
                type="button"
                onClick={() => setPaletteSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label="Limpar busca"
                title="Limpar busca"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Separator className="my-2" />

          {!hasPaletteResults && (
            <div className="rounded-md border border-dashed border-border/70 p-3 text-center text-[11px] text-muted-foreground">
              Nenhum bloco encontrado.
            </div>
          )}

          {favoritePalette.length > 0 && (
            <>
              <PaletteGroup title="Favoritos" defaultOpen>
                {favoritePalette.map((it) => (
                  <PaletteButton
                    key={it.id}
                    icon={it.icon}
                    label={it.label}
                    onClick={() => runPaletteAction(it.id, it.onClick)}
                    favorite
                    onToggleFavorite={() => togglePaletteFavorite(it.id)}
                  />
                ))}
              </PaletteGroup>
              <Separator className="my-2" />
            </>
          )}

          {recentPalette.length > 0 && (
            <>
              <PaletteGroup title="Recentes" defaultOpen>
                {recentPalette.map((it) => (
                  <PaletteButton
                    key={it.id}
                    icon={it.icon}
                    label={it.label}
                    onClick={() => runPaletteAction(it.id, it.onClick)}
                    favorite={favoritePaletteIds.includes(it.id)}
                    onToggleFavorite={() => togglePaletteFavorite(it.id)}
                  />
                ))}
              </PaletteGroup>
              <Separator className="my-2" />
            </>
          )}

          {visibleChartPalette.length > 0 && (
            <>
              <PaletteGroup title="Gráficos" defaultOpen>
                {visibleChartPalette.map((it) => (
                  <PaletteButton
                    key={it.id}
                    icon={it.icon}
                    label={it.label}
                    onClick={() => runPaletteAction(`chart:${it.id}`, () => it.kind === "chart" ? addChart(it.chartType) : addBlock(it.kind))}
                    favorite={favoritePaletteIds.includes(`chart:${it.id}`)}
                    onToggleFavorite={() => togglePaletteFavorite(`chart:${it.id}`)}
                  />
                ))}
              </PaletteGroup>
              <Separator className="my-2" />
            </>
          )}

          {visibleStorytellingPalette.length > 0 && (
            <>
              <PaletteGroup title="Storytelling" defaultOpen>
                {visibleStorytellingPalette.map((it) => (
                  <PaletteButton
                    key={it.id}
                    icon={it.icon}
                    label={it.label}
                    onClick={() => runPaletteAction(it.id, it.onClick)}
                    favorite={favoritePaletteIds.includes(it.id)}
                    onToggleFavorite={() => togglePaletteFavorite(it.id)}
                  />
                ))}
              </PaletteGroup>
              <Separator className="my-2" />
            </>
          )}

          {visibleElementPalette.length > 0 && (
            <>
              <PaletteGroup title="Elementos" defaultOpen>
                {visibleElementPalette.map((it) => (
                  <PaletteButton
                    key={it.id}
                    icon={it.icon}
                    label={it.label}
                    onClick={() => runPaletteAction(`element:${it.id}`, () => addBlock(it.kind))}
                    favorite={favoritePaletteIds.includes(`element:${it.id}`)}
                    onToggleFavorite={() => togglePaletteFavorite(`element:${it.id}`)}
                  />
                ))}
              </PaletteGroup>
              <Separator className="my-2" />
            </>
          )}

          {visibleOmniPalette.length > 0 && (
            <>
              <PaletteGroup title="Omni Analytics">
                {OMNI_GROUPS.map((group) => {
                  const groupItems = visibleOmniPalette.filter((it) => it.group === group);
                  if (groupItems.length === 0) return null;
                  return (
                    <div key={group}>
                      <div className="px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                        {group}
                      </div>
                      {groupItems.map((it) => (
                        <PaletteButton
                          key={it.id}
                          icon={it.icon}
                          label={it.label}
                          onClick={() => runPaletteAction(`omni:${it.id}`, () => addBlock(it.kind))}
                          favorite={favoritePaletteIds.includes(`omni:${it.id}`)}
                          onToggleFavorite={() => togglePaletteFavorite(`omni:${it.id}`)}
                        />
                      ))}
                    </div>
                  );
                })}
              </PaletteGroup>
              <Separator className="my-2" />
            </>
          )}
          <div className="px-2">
            <Label className="text-[10px] uppercase text-muted-foreground">Fundo do slide</Label>
            <BgField label="" value={config.background}
              onChange={(v) => setBackgroundAction(v)} />
          </div>
          <div className="mt-2 flex items-center justify-between px-2 text-[11px]">
            <span className="text-muted-foreground">Faixa Harald</span>
            <Switch
              checked={config.showHaraldFooter}
              onCheckedChange={(v) => setShowHaraldFooterAction(v)}
            />
          </div>
          <p className="mt-2 px-2 text-[10px] leading-relaxed text-muted-foreground">
            Atalhos: <kbd>Ctrl+Z</kbd> desfazer · <kbd>Ctrl+Shift+Z</kbd> refazer · <kbd>Del</kbd> excluir · <kbd>Ctrl+D</kbd> duplicar · <kbd>Ctrl+]</kbd>/<kbd>Ctrl+[</kbd> ordem · <kbd>setas</kbd> mover (Shift = 10px)
          </p>
        </div>
      </ScrollArea>

      {/* ====== Layers Panel ====== */}
      {showLayers && (
        <div className="flex min-h-0 flex-col rounded-lg border border-border/40 bg-card/40">
          <div className="shrink-0 border-b border-border/40 px-2 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Camadas</span>
              <Badge variant="secondary" className="text-[9px] uppercase">
                {config.blocks.length} itens
              </Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {hiddenCount > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 gap-1 px-2 text-[10px]"
                  onClick={() => patchBlocksAction(
                    config.blocks.filter((b) => b.hidden).map((b) => ({ id: b.id, patch: { hidden: false } as Partial<CustomBlock> })),
                    "Mostrar blocos",
                  )}
                >
                  <Eye className="h-3 w-3" /> Mostrar {hiddenCount}
                </Button>
              )}
              {lockedCount > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 gap-1 px-2 text-[10px]"
                  onClick={() => patchBlocksAction(
                    config.blocks.filter((b) => b.locked).map((b) => ({ id: b.id, patch: { locked: false } as Partial<CustomBlock> })),
                    "Desbloquear blocos",
                  )}
                >
                  <Unlock className="h-3 w-3" /> Desbloquear {lockedCount}
                </Button>
              )}
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="space-y-0.5 p-1">
              <DndContext collisionDetection={closestCenter} onDragEnd={handleLayerDragEnd}>
                <SortableContext items={layersSorted.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                  {layersSorted.map((blk) => (
                    <SortableLayerItem
                      key={blk.id}
                      blk={blk}
                      isSelected={selectedIds.includes(blk.id)}
                      onSelect={() => setSelection([blk.id])}
                      onToggleHidden={() =>
                        patchBlockAction(
                          blk.id,
                          { hidden: !blk.hidden } as Partial<CustomBlock>,
                          blk.hidden ? "Mostrar bloco" : "Ocultar bloco",
                        )
                      }
                      onToggleLock={() => toggleLock(blk.id)}
                      onToFront={() => bringToFront(blk.id)}
                      onToBack={() => sendToBack(blk.id)}
                      zIndex={blk.z}
                      onDelete={() => deleteBlockAction(blk.id)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          </ScrollArea>
        </div>
      )}

      {/* ====== Canvas ====== */}
      <div className="flex min-h-0 min-w-0 flex-col gap-2">
        <ClearFiltersToolbar />
        <div
          ref={wrapperRef}
          className="relative min-h-0 flex-1 overflow-auto rounded-lg border border-border/40 bg-secondary/20"
          onMouseDown={(e) => {
            // Marquee selection — only if mousedown is on the wrapper itself
            // (i.e. canvas background, not a block / Rnd handle / inspector).
            if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset?.canvasBg) return;
            const isChartElement = (el: Element | null): boolean => {
              while (el && el !== e.currentTarget) {
                if ((el as HTMLElement).dataset?.chartCanvas !== undefined) return true;
                el = el.parentElement;
              }
              return false;
            };
            if (isChartElement(e.target as Element)) return;
            // Begin marquee in canvas-space coords.
            const startCanvas = clientToCanvas(canvasRef.current, e.clientX, e.clientY, scaleRef.current);
            if (!startCanvas) return;
            const startX = startCanvas.x;
            const startY = startCanvas.y;
            setMarquee({ x: startX, y: startY, w: 0, h: 0 });
            const move = (ev: MouseEvent) => {
              const cur = clientToCanvas(canvasRef.current, ev.clientX, ev.clientY, scaleRef.current);
              if (!cur) return;
              setMarquee({
                x: Math.min(startX, cur.x),
                y: Math.min(startY, cur.y),
                w: Math.abs(cur.x - startX),
                h: Math.abs(cur.y - startY),
              });
            };
            const up = (ev: MouseEvent) => {
              window.removeEventListener("mousemove", move);
              window.removeEventListener("mouseup", up);
              // If mouseup landed inside a chart, do not clear selection.
              let el = ev.target as Element | null;
              while (el) {
                if ((el as HTMLElement).dataset?.chartCanvas !== undefined) {
                  setMarquee(null);
                  return;
                }
                el = el.parentElement;
              }
              const end = clientToCanvas(canvasRef.current, ev.clientX, ev.clientY, scaleRef.current);
              setMarquee(null);
              if (!end) { clearSelection(); return; }
              const rect = {
                x: Math.min(startX, end.x), y: Math.min(startY, end.y),
                w: Math.abs(end.x - startX), h: Math.abs(end.y - startY),
              };
              if (rect.w < 4 && rect.h < 4) { clearSelection(); return; }
              const hitIds = config.blocks
                .filter((b) => b.x < rect.x + rect.w && b.x + b.w > rect.x
                            && b.y < rect.y + rect.h && b.y + b.h > rect.y)
                .map((b) => b.id);
              setSelection(hitIds);
            };
            window.addEventListener("mousemove", move);
            window.addEventListener("mouseup", up);
          }}
        >
          <div
            className="relative"
            data-canvas-bg="true"
            style={{
              width: CANVAS_W * scale,
              height: CANVAS_H * scale,
              margin: "12px auto",
            }}
            onMouseEnter={() => setCanvasHovered(true)}
            onMouseLeave={() => setCanvasHovered(false)}
          >
            <div
              data-canvas-bg="true"
              style={{
                position: "absolute", top: 0, left: 0,
                width: CANVAS_W, height: CANVAS_H,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                boxShadow: "0 10px 40px hsl(0 0% 0% / 0.25)",
              }}
            >
            <div
              ref={canvasRef}
              data-canvas-bg="true"
              style={{
                width: CANVAS_W,
                height: CANVAS_H,
                background: config.background === "transparent" ? "#FFFFFF" : `#${config.background}`,
                backgroundImage: config.backgroundImage ? `url(${config.backgroundImage})` : undefined,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
                position: "relative",
                overflow: "hidden",
              }}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes("application/x-slide-asset")) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                }
              }}
              onDrop={(e) => {
                const src = e.dataTransfer.getData("application/x-slide-asset");
                if (!src) return;
                e.preventDefault();
                const pos = clientToCanvas(canvasRef.current, e.clientX, e.clientY, scaleRef.current);
                const id = addBlockAction("image");
                if (id) {
                  const w = 360, h = 220;
                  const x = pos ? Math.max(0, pos.x - w / 2) : 60;
                  const y = pos ? Math.max(0, pos.y - h / 2) : 60;
                  patchBlockAction(id, { src, w, h, x, y } as Partial<CustomBlock>, "Alterar dados");
                  setSelection([id]);
                }
              }}
              onMouseMove={(e) => {
                if (!onCursorMove) return;
                const pos = clientToCanvas(canvasRef.current, e.clientX, e.clientY, scaleRef.current);
                if (pos) onCursorMove(pos.x, pos.y);
              }}
            >
              {/* Paste-image hint — shown when canvas is hovered with no selection */}
              {canvasHovered && selectedIds.length === 0 && (
                <div
                  data-edit-only="true"
                  style={{
                    position: "absolute", inset: 0, pointerEvents: "none", zIndex: 9998,
                    border: "2px solid rgba(59,130,246,0.55)",
                    borderRadius: 2,
                    animation: "omni-paste-pulse 2s ease-in-out infinite",
                  }}
                >
                  <style>{`@keyframes omni-paste-pulse{0%,100%{border-color:rgba(59,130,246,0.55)}50%{border-color:rgba(59,130,246,0.15)}}`}</style>
                  <div style={{
                    position: "absolute", bottom: 10, left: "50%",
                    transform: "translateX(-50%)",
                    background: "rgba(37,99,235,0.82)",
                    color: "#fff", padding: "3px 10px",
                    borderRadius: 4, fontSize: 10, whiteSpace: "nowrap",
                    letterSpacing: "0.02em",
                  }}>
                    Ctrl+V para colar imagem
                  </div>
                </div>
              )}
              {/* Snap-to-grid background — dot pattern, behind blocks. */}
              {prefs.gridEnabled && (
                <svg
                  data-export-hide="true"
                  width={CANVAS_W} height={CANVAS_H}
                  style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }}
                >
                  <defs>
                    <pattern id="harald-grid-dots" x={0} y={0}
                      width={prefs.gridSize} height={prefs.gridSize}
                      patternUnits="userSpaceOnUse">
                      <circle cx={prefs.gridSize / 2} cy={prefs.gridSize / 2}
                        r={0.75} fill="rgba(0,0,0,0.12)" />
                    </pattern>
                  </defs>
                  <rect width={CANVAS_W} height={CANVAS_H} fill="url(#harald-grid-dots)" />
                </svg>
              )}

              {[...config.blocks].sort((a, b) => a.z - b.z).map((blk) => {
                const isSelected = selectedIds.includes(blk.id);
                const isInlineEditable =
                  (blk.kind === "title" || blk.kind === "text") && !blk.locked;
                const isEditing = inlineEditId === blk.id && isInlineEditable;
                const isRotatable = blk.kind === "title" || blk.kind === "text" || blk.kind === "image";
                const rotation = isRotatable ? ((blk as TitleBlock | TextBlock | ImageBlock).rotation ?? 0) : 0;
                const useRotatableBlock = isRotatable && rotation !== 0;
                // Shape-specific Rnd config — contextual handles override.
                let shapeResize: boolean | Record<string, boolean> = !blk.locked;
                let shapeDisableDrag = !!blk.locked;
                let shapeLockAspect = false;
                if (blk.kind === "shape" && !blk.locked) {
                  const sb = blk as ShapeBlock;
                  if (isLineFamily(sb.shape)) {
                    shapeResize = false;
                    shapeDisableDrag = true; // overlay owns move
                  } else if (sb.shape === "circle") {
                    shapeLockAspect = true;
                    shapeResize = { top: true, bottom: true, left: true, right: true,
                      topLeft: false, topRight: false, bottomLeft: false, bottomRight: false };
                  } else if (sb.shape === "ellipse") {
                    shapeResize = { top: true, bottom: true, left: true, right: true,
                      topLeft: false, topRight: false, bottomLeft: false, bottomRight: false };
                  } else if (sb.shape === "triangle" || sb.shape === "right-triangle") {
                    shapeResize = false; // overlay vertex handles only
                  }
                }
                if (isEditing) {
                  shapeResize = false;
                  shapeDisableDrag = true;
                }
                return (
                <ContextMenu key={blk.id}>
                  <ContextMenuTrigger asChild>
                    {useRotatableBlock ? (
                      /* ---- bloco com rotação: RotatableBlock (sem Rnd) ---- */
                      <RotatableBlock
                        x={blk.x} y={blk.y} w={blk.w} h={blk.h}
                        rotation={rotation}
                        scale={scale}
                        isSelected={isSelected}
                        isLocked={!!blk.locked}
                        isEditing={isEditing}
                        onMove={(nx, ny) => updateBlock(blk.id, { x: nx, y: ny })}
                        onResize={(nx, ny, nw, nh) =>
                          updateBlock(blk.id, { x: nx, y: ny, w: nw, h: nh })
                        }
                        onSelect={(additive) => {
                          selectBlock(blk.id, { additive: !!additive });
                          if (inlineEditId && inlineEditId !== blk.id) setInlineEditId(null);
                        }}
                        onDoubleClick={isInlineEditable ? () => {
                          setInlineEditId(blk.id);
                          selectBlock(blk.id);
                        } : undefined}
                        style={{ zIndex: blk.z }}
                      >
                        <div data-block-id={blk.id} data-block-kind={blk.kind} style={{
                          width: "100%", height: "100%",
                          pointerEvents: "none",
                          visibility: blk.hidden ? "hidden" : "visible",
                        }}>
                          <BlockRenderer block={blk} isEditing={isEditing} />
                        </div>
                        {isEditing && (
                          <InlineTextEditor
                            block={blk as TitleBlock | TextBlock}
                            onPatch={(patch) => patchBlockAction(blk.id, patch, "Alterar estilo")}
                            onExit={() => setInlineEditId(null)}
                          />
                        )}
                        {isInlineEditable && !isEditing && !blk.locked && (
                          <div
                            data-export-hide="true"
                            className="opacity-0 group-hover/block:opacity-100 transition-opacity"
                            style={{
                              position: "absolute", top: 4, right: 4,
                              width: 18, height: 18, borderRadius: 4,
                              background: "hsl(var(--background) / 0.9)",
                              border: "1px solid hsl(var(--border))",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              zIndex: 999990, pointerEvents: "none",
                            }}
                            title="Duplo-clique para editar"
                          >
                            <Pencil className="h-3 w-3 text-muted-foreground" />
                          </div>
                        )}
                        <DataSourceBadge block={blk} />
                        {blk.locked && (
                          <div
                            data-export-hide="true"
                            style={{
                              position: "absolute", top: 4, right: 4,
                              width: 18, height: 18, borderRadius: 4,
                              background: "hsl(var(--background) / 0.9)",
                              border: "1px solid hsl(var(--border))",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              zIndex: 999990, pointerEvents: "none",
                            }}
                            title="Bloco bloqueado"
                          >
                            <Lock className="h-3 w-3 text-muted-foreground" />
                          </div>
                        )}
                        {isSelected && !blk.locked && !isEditing && (
                          <BlockRotationHandle
                            block={blk as TitleBlock | TextBlock | ImageBlock}
                          />
                        )}
                      </RotatableBlock>
                    ) : (
                      /* ---- bloco sem rotação: Rnd normal ---- */
                      <Rnd
                        size={{ width: blk.w, height: blk.h }}
                        position={{ x: blk.x, y: blk.y }}
                        bounds="parent"
                        scale={scale}
                        lockAspectRatio={shapeLockAspect}
                        disableDragging={shapeDisableDrag}
                        enableResizing={shapeResize}
                        onDragStart={(_e, _d) => {
                          if (!selectedIds.includes(blk.id)) selectBlock(blk.id);
                        }}
                        onDrag={(_, d) => {
                          const ids = draggableSiblings(blk.id);
                          const snap = computeGuides(ids, d.x, d.y, blk.w, blk.h);
                          if (snap.guides.v.length || snap.guides.h.length) {
                            d.x = snap.x; d.y = snap.y;
                          }
                        }}
                        onResize={(_, __, refEl, ___, pos) => {
                          const w = parseInt(refEl.style.width, 10);
                          const h = parseInt(refEl.style.height, 10);
                          const snap = computeGuides([blk.id], pos.x, pos.y, w, h);
                          void snap;
                        }}
                        onDragStop={(_, d) => {
                          setGuides({ v: [], h: [] });
                          const ids = draggableSiblings(blk.id);
                          let dx = d.x - blk.x;
                          let dy = d.y - blk.y;
                          if (prefs.gridEnabled) {
                            const sx = snapToGrid(d.x, prefs.gridSize);
                            const sy = snapToGrid(d.y, prefs.gridSize);
                            dx = sx - blk.x;
                            dy = sy - blk.y;
                          }
                          if (ids.length === 1) {
                            updateBlock(blk.id, { x: blk.x + dx, y: blk.y + dy });
                          } else {
                            const patches = ids
                              .map((id) => config.blocks.find((b) => b.id === id))
                              .filter((b): b is CustomBlock => !!b && !b.locked)
                              .map((b) => ({ id: b.id, patch: { x: b.x + dx, y: b.y + dy } as Partial<CustomBlock> }));
                            patchBlocksAction(patches, "Mover blocos");
                          }
                        }}
                        onResizeStop={(_, __, refEl, ___, pos) => {
                          setGuides({ v: [], h: [] });
                          let w = parseInt(refEl.style.width, 10);
                          let h = parseInt(refEl.style.height, 10);
                          let x = pos.x, y = pos.y;
                          if (prefs.gridEnabled) {
                            x = snapToGrid(x, prefs.gridSize);
                            y = snapToGrid(y, prefs.gridSize);
                            w = Math.max(prefs.gridSize, snapToGrid(w, prefs.gridSize));
                            h = Math.max(prefs.gridSize, snapToGrid(h, prefs.gridSize));
                          }
                          updateBlock(blk.id, { w, h, x, y });
                        }}
                        onMouseDown={(e) => {
                          if (isEditing) { return; }
                          e.stopPropagation();
                          const wasSelected = selectedIds.includes(blk.id);
                          const shift = (e as MouseEvent).shiftKey;
                          selectBlock(blk.id, { additive: shift });
                          if (inlineEditId && inlineEditId !== blk.id) { setInlineEditId(null); }
                          if (blk.locked && wasSelected && !shift && (e as MouseEvent).button === 0) {
                            toast("Bloco bloqueado. Clique com botão direito para desbloquear.", { duration: 1800 });
                          }
                        }}
                        onDoubleClick={(e) => {
                          if (isInlineEditable) {
                            e.stopPropagation();
                            setInlineEditId(blk.id);
                            selectBlock(blk.id);
                            return;
                          }
                          if (blk.groupId) {
                            e.stopPropagation();
                            enterGroupEdit(blk.id);
                          }
                        }}
                        style={{ zIndex: isEditing ? 9999998 : blk.z }}
                        className={cn(
                          "group/block",
                          isSelected
                            ? "outline outline-2 outline-offset-1 outline-primary"
                            : "outline outline-1 outline-transparent hover:outline-primary/40",
                        )}
                      >
                        <div data-block-id={blk.id} data-block-kind={blk.kind} style={{
                          width: "100%", height: "100%",
                          pointerEvents: blk.kind === "chart" ? "auto" : "none",
                          visibility: blk.hidden ? "hidden" : "visible",
                        }}>
                          <BlockRenderer block={blk} isEditing={isEditing} />
                        </div>
                        {isEditing && (
                          <InlineTextEditor
                            block={blk as TitleBlock | TextBlock}
                            onPatch={(patch) => patchBlockAction(blk.id, patch, "Alterar estilo")}
                            onExit={() => setInlineEditId(null)}
                          />
                        )}
                        {isInlineEditable && !isEditing && !blk.locked && (
                          <div
                            data-export-hide="true"
                            className="opacity-0 group-hover/block:opacity-100 transition-opacity"
                            style={{
                              position: "absolute", top: 4, right: 4,
                              width: 18, height: 18, borderRadius: 4,
                              background: "hsl(var(--background) / 0.9)",
                              border: "1px solid hsl(var(--border))",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              zIndex: 999990, pointerEvents: "none",
                            }}
                            title="Duplo-clique para editar"
                          >
                            <Pencil className="h-3 w-3 text-muted-foreground" />
                          </div>
                        )}
                        <DataSourceBadge block={blk} />
                        {blk.locked && (
                          <div
                            data-export-hide="true"
                            style={{
                              position: "absolute", top: 4, right: 4,
                              width: 18, height: 18, borderRadius: 4,
                              background: "hsl(var(--background) / 0.9)",
                              border: "1px solid hsl(var(--border))",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              zIndex: 999990, pointerEvents: "none",
                            }}
                            title="Bloco bloqueado"
                          >
                            <Lock className="h-3 w-3 text-muted-foreground" />
                          </div>
                        )}
                        {isSelected && !blk.locked && !isEditing && isRotatable && (
                          <BlockRotationHandle
                            block={blk as TitleBlock | TextBlock | ImageBlock}
                          />
                        )}
                      </Rnd>
                    )}
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-56">
                    <ContextMenuItem onSelect={() => duplicateBlock(blk.id)}>
                      Duplicar <ContextMenuShortcut>Ctrl+D</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => removeBlock(blk.id)} className="text-destructive focus:text-destructive">
                      Excluir <ContextMenuShortcut>Del</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onSelect={() => bringForward(blk.id)}>
                      Trazer para frente <ContextMenuShortcut>Ctrl+]</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => bringToFront(blk.id)}>
                      Trazer para a frente de tudo
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => sendBack(blk.id)}>
                      Enviar para trás <ContextMenuShortcut>Ctrl+[</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => sendToBack(blk.id)}>
                      Enviar para o fundo
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onSelect={() => toggleLock(blk.id)}>
                      {blk.locked ? "Desbloquear posição" : "Bloquear posição"}
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onSelect={() => {
                      if (copyElementStyleAction(blk.id)) toast.success("Estilo copiado");
                    }}>
                      Copiar estilo
                    </ContextMenuItem>
                    <ContextMenuItem
                      disabled={!canPasteElementStyleAction(blk.id)}
                      onSelect={() => {
                        if (pasteElementStyleAction(blk.id)) toast.success("Estilo colado");
                      }}>
                      Colar estilo
                    </ContextMenuItem>
                    {selectedIds.length >= 2 && (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem onSelect={() => { groupBlocksAction(selectedIds); toast.success("Blocos agrupados"); }}>
                          Agrupar <ContextMenuShortcut>Ctrl+G</ContextMenuShortcut>
                        </ContextMenuItem>
                      </>
                    )}
                    {blk.groupId && (
                      <ContextMenuItem onSelect={() => { ungroupBlocksAction([blk.id]); toast.success("Grupo desfeito"); }}>
                        Desagrupar <ContextMenuShortcut>Ctrl+Shift+G</ContextMenuShortcut>
                      </ContextMenuItem>
                    )}
                  </ContextMenuContent>
                </ContextMenu>
                );
              })}

              {/* Inline text edit toolbar. */}
              {(() => {
                if (!inlineEditId) return null;
                const blk = config.blocks.find((b) => b.id === inlineEditId);
                if (!blk || (blk.kind !== "title" && blk.kind !== "text")) return null;
                return (
                  <InlineTextToolbar
                    block={blk as TitleBlock | TextBlock}
                    scale={scale}
                    onPatch={(patch) =>
                      patchBlockAction(blk.id, patch, "Alterar estilo")
                    }
                  />
                );
              })()}

              {/* Contextual handles for selected shape blocks. */}
              {config.blocks
                .filter((b): b is ShapeBlock =>
                  b.kind === "shape" && selectedIds.includes(b.id) && !b.locked)
                .map((sb) => (
                  <ShapeHandleOverlay key={`sh-${sb.id}`} block={sb}
                    scale={scale} canvasEl={canvasRef.current} />
                ))}

              {/* Group outlines + resize handles. */}
              {(config.groups ?? []).map((g) => {
                const members = g.memberIds
                  .map((id) => config.blocks.find((b) => b.id === id))
                  .filter((b): b is CustomBlock => !!b);
                const bb = groupBounds(members);
                if (!bb) return null;
                const active = members.some((b) => selectedIds.includes(b.id));
                const isGroupEditing = !!groupEditMemberId
                  && members.some((m) => m.id === groupEditMemberId);
                const showHandles = active && !isGroupEditing;
                return (
                  <GroupOverlay
                    key={`grp-${g.id}`}
                    bounds={bb}
                    active={active}
                    showHandles={showHandles}
                    memberIds={members.map((m) => m.id)}
                    scaleRef={scaleRef}
                  />
                );
              })}

              {/* Smart guides overlay (B8.3). */}
              <svg
                data-export-hide="true"
                width={CANVAS_W} height={CANVAS_H}
                style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 999998 }}
              >
                {guides.v.map((x, i) => (
                  <line key={`gv-${i}`} x1={x} x2={x} y1={0} y2={CANVAS_H}
                    stroke="#3B82F6" strokeWidth={1} />
                ))}
                {guides.h.map((y, i) => (
                  <line key={`gh-${i}`} y1={y} y2={y} x1={0} x2={CANVAS_W}
                    stroke="#3B82F6" strokeWidth={1} />
                ))}
              </svg>

              {/* Marquee selection rectangle (B8.2). */}
              {marquee && (
                <div
                  data-export-hide="true"
                  style={{
                    position: "absolute",
                    left: marquee.x, top: marquee.y,
                    width: marquee.w, height: marquee.h,
                    border: "1px dashed #3B82F6",
                    background: "rgba(59,130,246,0.08)",
                    pointerEvents: "none",
                    zIndex: 999999,
                  }}
                />
              )}

              {/* Cursores de colaboradores remotos (filtrados pelo slide atual) */}
              {collaborators && collaborators
                .filter((c) => c.slideId === slideId
                  && typeof c.cursorX === "number" && typeof c.cursorY === "number")
                .map((c) => (
                  <div
                    key={`cursor-${c.id}`}
                    data-export-hide="true"
                    style={{
                      position: "absolute",
                      left: c.cursorX, top: c.cursorY,
                      pointerEvents: "none",
                      zIndex: 9999,
                      transition: "transform 50ms linear",
                      transform: "translate(0,0)",
                    }}
                  >
                    <svg width={12} height={18} viewBox="0 0 12 18" style={{ display: "block" }}>
                      <path d="M0 0 L0 14 L4 10 L7 17 L9 16 L6 9 L11 9 Z"
                        fill={c.color} stroke="#fff" strokeWidth={1} />
                    </svg>
                    <span
                      style={{
                        position: "absolute", top: 14, left: 12,
                        background: c.color, color: "#fff",
                        fontSize: 10, padding: "1px 6px",
                        borderRadius: 999, whiteSpace: "nowrap",
                        fontWeight: 500,
                      }}
                    >
                      {c.name}
                    </span>
                  </div>
                ))}

              {/* Faixa Harald (não editável, sempre por cima) */}
              {config.showHaraldFooter && (
                <img
                  src={haraldFooterPng}
                  alt=""
                  style={{
                    position: "absolute", left: 0, bottom: 0,
                    width: CANVAS_W, height: FOOTER_H,
                    pointerEvents: "none", zIndex: 99999,
                  }}
                />
              )}
            </div>
            </div>
          </div>
        </div>

        {/* Barra de zoom + undo/redo */}
        <div className="flex shrink-0 items-center justify-center gap-1 rounded-lg border border-border/40 bg-card/40 px-2 py-1">
          <Button size="icon" variant="ghost" className="h-7 w-7"
            onClick={undoAction} disabled={!undoRedo.canUndo}
            title={undoRedo.undoLabel ? `Desfazer: ${undoRedo.undoLabel.toLowerCase()}` : "Desfazer (Ctrl+Z)"}>
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7"
            onClick={redoAction} disabled={!undoRedo.canRedo}
            title={undoRedo.redoLabel ? `Refazer: ${undoRedo.redoLabel.toLowerCase()}` : "Refazer (Ctrl+Shift+Z)"}>
            <Redo2 className="h-3.5 w-3.5" />
          </Button>
          <Separator orientation="vertical" className="mx-1 h-5" />
          <BrandKitPopover selected={selected} />
          <PalettePopover
            theme={getTheme(config.theme)}
            blocks={config.blocks}
            selected={selected}
          />
          <Separator orientation="vertical" className="mx-1 h-5" />
          <Button size="icon" variant="ghost" className="h-7 w-7"
            onClick={() => prefs.setZoom(prefs.zoom - 0.1)}
            title="Diminuir zoom (Ctrl+Scroll ↓)">
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <button
            className="min-w-[36px] cursor-pointer rounded px-1 py-0.5 text-center text-[11px] tabular-nums text-muted-foreground transition-colors hover:text-primary"
            onClick={() => prefs.setZoom(1.0)}
            title="Clique para redefinir zoom para 100%"
          >
            {Math.round(prefs.zoom * 100)}%
          </button>
          <Button size="icon" variant="ghost" className="h-7 w-7"
            onClick={() => prefs.setZoom(prefs.zoom + 0.1)}
            title="Aumentar zoom (Ctrl+Scroll ↑)">
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]"
            onClick={() => prefs.setZoom(1.0)} title="Ajustar à tela">
            <Maximize2 className="h-3 w-3" /> Ajustar
          </Button>
          <Separator orientation="vertical" className="mx-1 h-5" />
          <Button size="icon" variant={prefs.gridEnabled ? "default" : "ghost"}
            className="h-7 w-7"
            onClick={() => prefs.setGridEnabled(!prefs.gridEnabled)}
            title={prefs.gridEnabled ? "Grade ligada — clique para desligar" : "Ativar grade"}>
            <Grid3x3 className="h-3.5 w-3.5" />
          </Button>
          {prefs.gridEnabled && (
            <Select value={String(prefs.gridSize)}
              onValueChange={(v) => prefs.setGridSize(parseInt(v, 10) as GridSize)}>
              <SelectTrigger className="h-7 w-[64px] text-[11px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[4, 8, 16, 32].map((s) => (
                  <SelectItem key={s} value={String(s)}>{s} px</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Badge variant="secondary" className="ml-2 text-[9px] uppercase">16:9</Badge>
          <Separator orientation="vertical" className="mx-1 h-5" />
          <Button size="sm" variant="default" className="h-7 gap-1 px-2 text-[11px]"
            onClick={() => setPresentOpen(true)}
            title="Apresentar (F5)">
            <Play className="h-3 w-3" /> Apresentar
          </Button>
          <Separator orientation="vertical" className="mx-1 h-5" />
          <Button
            size="icon"
            variant={showLayers ? "default" : "ghost"}
            className="relative h-7 w-7"
            onClick={() => setShowLayers((s) => !s)}
            title="Painel de camadas"
          >
            <LayersIcon className="h-3.5 w-3.5" />
            {hiddenCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-white leading-none">
                {hiddenCount}
              </span>
            )}
          </Button>
          <Separator orientation="vertical" className="mx-1 h-5" />
          <Button size="icon" variant="ghost" className="h-7 w-7"
            onClick={() => setShortcutsOpen(true)}
            title="Atalhos de teclado (?)">
            <HelpCircle className="h-3.5 w-3.5" />
          </Button>
        </div>

        <SpeakerNotesBar
          value={config.speakerNotes ?? ""}
          onChange={(v) => setSpeakerNotesAction(v)}
        />
      </div>

      {/* ====== Inspector ====== */}
      <div className="min-w-0 min-h-0 flex flex-col rounded-lg border border-border/40 bg-card/40">
        {/* Contextual header — shows which block is being edited */}
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border/30 px-3">
          {(selected || multiSelected.length >= 2) ? (
            <>
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/10 text-muted-foreground">
                {multiSelected.length >= 2
                  ? <GroupIcon className="h-3 w-3" />
                  : blockIcon(selected!)}
              </div>
              <span className="flex-1 truncate text-[12px] font-medium">
                {multiSelected.length >= 2
                  ? `${multiSelected.length} blocos selecionados`
                  : BLOCK_LABELS[selected!.kind]}
              </span>
              <button
                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
                onClick={() => clearSelection()}
                title="Fechar seleção"
              >
                <X className="h-3 w-3" />
              </button>
            </>
          ) : (
            <span className="text-[11px] text-muted-foreground">Nenhum bloco selecionado</span>
          )}
        </div>
        {/* Scrollable content */}
        <ScrollArea className="flex-1">
        <div className="min-w-0 space-y-3 p-3">
          {multiSelected.length >= 2 ? (
            <MultiSelectInspector
              selectedIds={selectedIds}
              blocks={multiSelected}
              hasGroup={multiSelected.some((b) => !!b.groupId)}
            />
          ) : !selected ? (
            <div className="space-y-2 px-1 text-[12px] text-muted-foreground">
              <p className="font-medium text-foreground">Slide personalizado</p>
              <p>Adicione blocos pela paleta à esquerda. Clique em um bloco para editar suas propriedades aqui.</p>
              <p>Arraste pelas bordas para mover, use os cantos para redimensionar. Linhas azuis mostram alinhamento com outros blocos.</p>
              <p>Segure <kbd>Shift</kbd> e clique para selecionar vários blocos. Arraste no fundo para selecionar com retângulo.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="text-[10px]">{BLOCK_LABELS[selected.kind]}</Badge>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => bringForward(selected.id)} title="Trazer pra frente">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => sendBack(selected.id)} title="Enviar pra trás">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => duplicateBlock(selected.id)} title="Duplicar">
                    <CopyIcon className="h-3.5 w-3.5" />
                  </Button>
                  {(
                    <Button
                      size="icon"
                      variant={copiedStyle.hasCopy && copiedStyle.sourceId === selected.id ? "default" : "ghost"}
                      className="h-7 w-7"
                      disabled={copiedStyle.hasCopy && copiedStyle.sourceId !== selected.id && !canPasteElementStyleAction(selected.id)}
                      onClick={() => {
                        if (copiedStyle.hasCopy && copiedStyle.sourceId !== selected.id && canPasteElementStyleAction(selected.id)) {
                          if (pasteElementStyleAction(selected.id)) toast.success("Estilo colado");
                        } else {
                          if (copyElementStyleAction(selected.id)) toast.success("Estilo copiado");
                        }
                      }}
                      title={copiedStyle.hasCopy && copiedStyle.sourceId !== selected.id
                        ? "Colar estilo neste bloco"
                        : "Copiar estilo deste bloco"}>
                      <Paintbrush className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" className="h-7 w-7"
                    onClick={() => toggleLock(selected.id)}
                    title={selected.locked ? "Desbloquear posição" : "Bloquear posição"}>
                    {selected.locked
                      ? <Unlock className="h-3.5 w-3.5" />
                      : <Lock className="h-3.5 w-3.5" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 hover:text-destructive" onClick={() => removeBlock(selected.id)} title="Remover">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <PositionInputs block={selected} onChange={(p) => updateBlock(selected.id, p)} />
              <Separator />
              <BlockSpecificEditor block={selected} onChange={(p) => updateBlock(selected.id, p)} />
            </>
          )}
        </div>
        </ScrollArea>
      </div>

      {/* Asset library */}
      <AssetLibrary open={assetsOpen} onOpenChange={setAssetsOpen} />

      {/* Templates picker */}
      <TemplatePicker
        open={tplOpen}
        onOpenChange={setTplOpen}
        onApply={(cfg) => { onChange(cfg); toast.success("Modelo aplicado"); }}
        onApplyDeck={(configs, mode, name) => {
          const state = useSlidesFlow.getState();
          const items = [...state.items];
          const idx = items.findIndex((i) => i.id === slideId);
          if (idx < 0) return;
          // Build new SlideItems for each deck slide.
          const newItems = configs.map((cfg, i) => ({
            id: newId(),
            kind: "custom" as const,
            label: `${name} · ${i + 1}`,
            config: cfg,
          }));
          if (mode === "replace") {
            // Replace current with first, insert rest after.
            const first = newItems[0];
            const rest = newItems.slice(1);
            items.splice(idx, 1, first, ...rest);
            useSlidesFlow.setState({ items, selectedId: first.id });
            onChange(first.config);
          } else {
            items.splice(idx + 1, 0, ...newItems);
            useSlidesFlow.setState({ items, selectedId: newItems[0].id });
          }
          toast.success(`Deck aplicado — ${configs.length} slides criados`);
        }}
      />

      {/* Save template dialog */}
      <Dialog open={saveTplOpen} onOpenChange={setSaveTplOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Salvar modelo</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input autoFocus value={tplName} onChange={(e) => setTplName(e.target.value)}
              placeholder="Ex.: Resumo mensal" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveTplOpen(false)}>Cancelar</Button>
            <Button disabled={!tplName.trim()}
              onClick={() => {
                saveUserTemplate(tplName.trim(), config);
                refreshUserTpls();
                setSaveTplOpen(false);
                setTplName("");
                toast.success("Modelo salvo");
              }}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    {presentOpen && (
      <PresentationMode
        currentSlideId={slideId}
        currentConfig={config}
        onClose={() => setPresentOpen(false)}
      />
    )}
    <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </SlideFilterProvider>
  );
}

// ---------------------------------------------------------------------------
// Layers panel helpers

function blockIcon(blk: CustomBlock) {
  const cls = "h-3 w-3 shrink-0";
  switch (blk.kind) {
    case "title":  return <TypeIcon className={cls} />;
    case "text":   return <AlignLeft className={cls} />;
    case "image":  return <ImageIcon className={cls} />;
    case "shape":  return <Square className={cls} />;
    case "table":  return <TableIcon className={cls} />;
    case "dre":    return <TableIcon className={cls} />;
    case "kpi":    return <Hash className={cls} />;
    case "topSku": return <Trophy className={cls} />;
    case "bridge": return <GitBranch className={cls} />;
    default:       return <BarChart3 className={cls} />;
  }
}

function blockLayerName(blk: CustomBlock): string {
  if (blk.kind === "title" || blk.kind === "text") {
    const t = (blk as { text: string }).text;
    return t ? t.slice(0, 20) + (t.length > 20 ? "…" : "") : BLOCK_LABELS[blk.kind];
  }
  if (blk.kind === "chart") {
    const cb = blk as ChartBlock;
    return cb.title || CHART_TYPE_LABELS[cb.chartType] || "Gráfico";
  }
  return BLOCK_LABELS[blk.kind];
}

function SortableLayerItem({
  blk, isSelected, onSelect, onToggleHidden, onToggleLock, onToFront, onToBack, onDelete, zIndex,
}: {
  blk: CustomBlock;
  isSelected: boolean;
  onSelect: () => void;
  onToggleHidden: () => void;
  onToggleLock: () => void;
  onToFront: () => void;
  onToBack: () => void;
  onDelete: () => void;
  zIndex: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: blk.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className={cn(
        "group rounded-md border border-transparent px-1.5 py-1.5 text-[10px] cursor-pointer select-none transition-colors",
        isSelected ? "border-primary/40 bg-primary/10" : "hover:border-border/60 hover:bg-secondary/60",
        blk.hidden && "opacity-50",
      )}
      onClick={onSelect}
    >
      <div className="flex items-center gap-1">
        <span
          {...attributes}
          {...listeners}
          className="shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing"
          onClick={(e) => e.stopPropagation()}
          title="Arrastar camada"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-background/70 text-muted-foreground">
          {blockIcon(blk)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">{blockLayerName(blk)}</span>
            <span className="shrink-0 rounded bg-muted px-1 text-[9px] tabular-nums text-muted-foreground">z{zIndex}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-[9px] text-muted-foreground">
            <span className="truncate">{BLOCK_LABELS[blk.kind]}</span>
            {blk.locked && <span className="rounded bg-amber-500/15 px-1 text-amber-700 dark:text-amber-200">bloq.</span>}
            {blk.hidden && <span className="rounded bg-slate-500/15 px-1">oculto</span>}
          </div>
        </div>
      </div>
      <div className="mt-1 flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={(e) => { e.stopPropagation(); onToggleHidden(); }}
          title={blk.hidden ? "Mostrar bloco" : "Ocultar bloco"}
        >
          {blk.hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={(e) => { e.stopPropagation(); onToggleLock(); }}
          title={blk.locked ? "Desbloquear posicao" : "Bloquear posicao"}
        >
          {blk.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={(e) => { e.stopPropagation(); onToFront(); }}
          title="Trazer para frente de tudo"
        >
          <ChevronsUp className="h-3 w-3" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={(e) => { e.stopPropagation(); onToBack(); }}
          title="Enviar para o fundo"
        >
          <ChevronsDown className="h-3 w-3" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-6 w-6 hover:bg-destructive/20 hover:text-destructive"
          title="Excluir bloco"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function PositionInputs({ block, onChange }: {
  block: CustomBlock; onChange: (p: Partial<CustomBlock>) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {(["x", "y", "w", "h"] as const).map((k) => (
        <div key={k}>
          <Label className="text-[9px] uppercase text-muted-foreground">{k}</Label>
          <Input
            type="number"
            className="h-7 px-1.5 text-[11px]"
            value={block[k]}
            onChange={(e) => onChange({ [k]: parseInt(e.target.value, 10) || 0 } as never)}
          />
        </div>
      ))}
    </div>
  );
}

function BlockSpecificEditor({ block, onChange }: {
  block: CustomBlock; onChange: (p: Partial<CustomBlock>) => void;
}) {
  switch (block.kind) {
    case "title":
    case "text":
      return <TextTitleInspector block={block as TitleBlock | TextBlock} onChange={onChange as (p: Partial<TitleBlock | TextBlock>) => void} />;

    case "kpi":
      return <FilteredInspector
        block={block}
        design={<KpiInspector block={block} onChange={onChange} />}
        filters={block.filters ?? {}}
        onFiltersChange={(f) => onChange({ filters: f } as never)}
        onChange={onChange}
      />;

    case "image":
      return (
        <div className="space-y-2">
          <Label className="text-[10px] uppercase text-muted-foreground">Upload</Label>
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
            <Label className="text-[10px] uppercase text-muted-foreground">Ajuste</Label>
            <Select value={block.fit} onValueChange={(v) => onChange({ fit: v as "contain"|"cover" } as never)}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="contain">Conter</SelectItem>
                <SelectItem value="cover">Cobrir</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
      />;

    case "table":
      return <FilteredInspector
        block={block}
        design={<TableBlockEditor block={block} onChange={onChange} />}
        filters={block.filters}
        onFiltersChange={(f) => onChange({ filters: f } as never)}
        onChange={onChange}
      />;

    case "chart":
      return <FilteredInspector
        block={block}
        design={<ChartBlockEditor block={block} onChange={onChange} />}
        filters={block.filters}
        onFiltersChange={(f) => onChange({ filters: f } as never)}
        onChange={onChange}
      />;

    case "topSku":
      return <FilteredInspector
        block={block}
        design={<TopSkuBlockEditor block={block} onChange={onChange} />}
        filters={block.filters}
        onFiltersChange={(f) => onChange({ filters: f } as never)}
        onChange={onChange}
      />;

    case "dre":
      return <FilteredInspector
        block={block}
        design={<DreBlockInspector block={block} onChange={onChange as (patch: Partial<DreBlock>) => void} />}
        filters={(block as DreBlock).filters ?? {}}
        onFiltersChange={(f) => onChange({ filters: f } as never)}
        onChange={onChange}
      />;

    // Omni Analytics inspectors
    case "omni_evolucao_mensal":
      return <OmniEvolucaoInspector block={block as OmniEvolucaoMensalBlock} onChange={onChange as (p: Partial<OmniEvolucaoMensalBlock>) => void} />;
    case "omni_heatmap_sazonalidade":
      return <OmniMetricInspector block={block as OmniHeatmapSazonalidadeBlock} onChange={onChange as (p: Partial<OmniHeatmapSazonalidadeBlock>) => void} label="Heatmap Sazonalidade" />;
    case "omni_herois_ofensores":
      return <OmniHeroisInspector block={block as OmniHeroisOfensoresBlock} onChange={onChange as (p: Partial<OmniHeroisOfensoresBlock>) => void} />;
    case "omni_canal_trend":
      return <OmniCanalTrendInspector block={block as OmniCanalTrendBlock} onChange={onChange as (p: Partial<OmniCanalTrendBlock>) => void} />;
    case "omni_canal_mix":
      return <OmniMetricInspector block={block as OmniCanalMixBlock} onChange={onChange as (p: Partial<OmniCanalMixBlock>) => void} label="Mix por Canal" />;
    case "omni_custo_evolucao":
      return <OmniCustoInspector block={block as OmniCustoEvolucaoBlock} onChange={onChange as (p: Partial<OmniCustoEvolucaoBlock>) => void} />;
    case "omni_custo_composicao":
      return <OmniCustoInspector block={block as OmniCustoComposicaoBlock} onChange={onChange as (p: Partial<OmniCustoComposicaoBlock>) => void} />;
    case "omni_custo_pressao":
      return <OmniCustoPressaoInspector block={block as OmniCustoPressaoBlock} onChange={onChange as (p: Partial<OmniCustoPressaoBlock>) => void} />;
    case "omni_price_decomp":
      return <OmniPriceDecompInspector block={block as OmniPriceDecompBlock} onChange={onChange as (p: Partial<OmniPriceDecompBlock>) => void} />;
    case "omni_bridge_pvm":
      return <OmniBridgePvmInspector block={block as OmniBridgePvmBlock} onChange={onChange as (p: Partial<OmniBridgePvmBlock>) => void} />;
    case "omni_farol":
      return <OmniFarolInspector block={block as OmniFarolBlock} onChange={onChange as (p: Partial<OmniFarolBlock>) => void} />;
    case "omni_abc_curva":
      return <OmniAbcCurvaInspector block={block as OmniAbcCurvaBlock} onChange={onChange as (p: Partial<OmniAbcCurvaBlock>) => void} />;
    case "omni_portfolio_matrix":
      return <OmniDimMetricInspector block={block as OmniPortfolioMatrixBlock} onChange={onChange as (p: Partial<OmniPortfolioMatrixBlock>) => void} label="Matriz Portfólio" />;
    case "omni_abc_bars":
      return <OmniHeroisInspector block={block as OmniAbcBarsBlock} onChange={onChange as (p: Partial<OmniAbcBarsBlock>) => void} />;
  }
}

// Wrapper com abas Design / Filtros — dá aos blocos de dados a UX
// próxima do PowerPoint (painel de formatação à direita).
// Inclui o seletor de Fonte de Dados PINADO no topo (não-colapsável).
function FilteredInspector({
  block, design, filters, onFiltersChange, onChange,
}: {
  block: CustomBlock;
  design: React.ReactNode;
  filters: Filters;
  onFiltersChange: (f: Filters) => void;
  onChange: (p: Partial<CustomBlock>) => void;
}) {
  const ds = (block as { dataSource?: BlockDataSource }).dataSource ?? "ke30";
  const [pendingSource, setPendingSource] = useState<BlockDataSource | null>(null);
  const hasBudget = useBudget((s) => s.rows.length > 0);
  const hasForecast = useForecast((s) => s.rows.length > 0);
  const hasRolling = useRolling((s) => s.rows.length > 0);

  // Bridge não tem fonte selecionável (sempre KE30 — usa cálculo PVM).
  const showPicker = block.kind !== "bridge";

  const applySwitch = (next: BlockDataSource) => {
    if (next === ds) return;
    setPendingSource(next);
  };

  const confirmSwitch = () => {
    if (!pendingSource) return;
    const unavailable = unavailableMeasuresForSource(pendingSource);
    // Reset filtros + medida quando a fonte muda — campos podem não existir.
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
      }
    }
    onChange(patch);
    setPendingSource(null);
  };

  const dsBadgeLabel = dataSourceLabel(ds);
  const dsBadgeCls = ds === "forecast"
    ? "bg-amber-500/15 text-amber-700 dark:text-amber-200"
    : ds === "ke30"
    ? "bg-blue-500/15 text-blue-600 dark:text-blue-300"
    : ds === "budget"
      ? "bg-purple-500/15 text-purple-600 dark:text-purple-300"
      : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300";
  const sourceOptions: BlockDataSource[] = [
    "ke30",
    ...(hasBudget ? (["budget"] as BlockDataSource[]) : []),
    ...(hasForecast ? (["forecast"] as BlockDataSource[]) : []),
    ...(hasRolling ? (["rolling"] as BlockDataSource[]) : []),
  ];
  const dsDesc = ds === "forecast"
    ? "Forecast: volume por SKU/mes do ultimo ciclo carregado, com filtros de produto."
    : ds === "ke30"
    ? "Detalhada (KE30): receita, custos, margens, frete, comissão."
    : ds === "budget"
      ? "Agregada (Budget): receita, volume, CM, CPV. Sem MB/Frete/Comissão."
      : "Realizado da planilha Budget (linhas com kind=real). Sem MB/Frete/Comissão.";

  return (
    <div className="space-y-2">
      {showPicker && (
        <div className="rounded-md border border-border/60 bg-secondary/30 p-2">
          <div className="mb-1.5 flex items-center justify-between">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-foreground">
              Fonte de Dados
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
                Carregue Budget ou Forecast para mais opcoes.
              </p>
            </div>
          )}
          <p className="mt-1 text-[9px] leading-snug text-muted-foreground">{dsDesc}</p>
        </div>
      )}

      <Tabs defaultValue="design" className="w-full">
        <TabsList className="grid h-8 w-full grid-cols-2">
          <TabsTrigger value="design" className="text-[11px]">Design</TabsTrigger>
          <TabsTrigger value="filters" className="text-[11px]">Filtros</TabsTrigger>
        </TabsList>
        <TabsContent value="design" className="mt-2 space-y-2">
          {design}
        </TabsContent>
        <TabsContent value="filters" className="mt-2">
          <BlockFilters filters={filters} onChange={onFiltersChange} dataSource={ds} />
        </TabsContent>
      </Tabs>

      <Dialog open={!!pendingSource} onOpenChange={(v) => !v && setPendingSource(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trocar fonte de dados?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Trocar a fonte de dados irá redefinir os filtros deste bloco
            (e a medida, se ela não existir na nova base). Deseja continuar?
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingSource(null)}>Cancelar</Button>
            <Button onClick={confirmSwitch}>Trocar para {dataSourceLabel(pendingSource ?? "ke30")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
      <Input className="h-7 text-xs" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
      <Input type="number" className="h-7 text-xs" value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)} />
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
  backgroundColor: "#FFFFFF",
};

/** Background color picker with "Sem fundo" toggle. value: hex sem '#' OR "transparent". */
function BgField({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  const isT = value === "transparent";
  const v = isT ? "" : (value || "").replace("#", "");
  return (
    <div>
      <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
      <label className="mt-1 mb-1 flex cursor-pointer items-center justify-between text-[10px] text-muted-foreground">
        <span>Sem fundo</span>
        <Switch checked={isT} className="scale-75"
          onCheckedChange={(c) => onChange(c ? "transparent" : "FFFFFF")} />
      </label>
      <div className="flex items-center gap-1">
        <input type="color" disabled={isT} value={`#${v || "FFFFFF"}`}
          onChange={(e) => onChange(e.target.value.replace("#", ""))}
          className="h-7 w-7 cursor-pointer rounded border border-border bg-transparent disabled:cursor-not-allowed"
          style={isT ? CHECKER_BG : undefined} />
        <Input className="h-7 text-xs font-mono" value={v} disabled={isT}
          onChange={(e) => onChange(e.target.value.replace("#", ""))} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI inspector — Manual ou Dinâmico
// ---------------------------------------------------------------------------
function KpiInspector({ block, onChange }: {
  block: KpiBlock; onChange: (p: Partial<CustomBlock>) => void;
}) {
  const months = useMonthsInfo();
  const fyList = useFyList();
  const periodMode = block.periodMode ?? "all";
  const periodOpts = periodMode === "fy"
    ? fyList.map((f) => ({ value: f, label: f }))
    : periodMode === "month"
      ? months.map((m) => ({ value: m.periodo, label: m.label }))
      : [];

  return (
    <div className="space-y-2">
      <Field label="Rótulo" value={block.label}
        onChange={(v) => onChange({ label: v } as never)} />

      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">Origem do valor</Label>
        <Select value={block.source}
          onValueChange={(v) => onChange({ source: v as "manual"|"dynamic" } as never)}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="dynamic">Dinâmico (calcular da base)</SelectItem>
            <SelectItem value="manual">Manual (digitar valor)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {block.source === "manual" ? (
        <Field label="Valor" value={block.manualValue ?? ""}
          onChange={(v) => onChange({ manualValue: v } as never)} />
      ) : (
        <>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Medida</Label>
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
                      {m.label}{disabled ? " — indisponível" : ""}
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
              <Label className="text-[10px] uppercase text-muted-foreground">Período</Label>
              <Select value={periodMode}
                onValueChange={(v) => onChange({ periodMode: v as never, periodValue: null } as never)}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="month">Mês</SelectItem>
                  <SelectItem value="fy">Ano fiscal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {periodMode !== "all" && (
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">Valor</Label>
                <Select value={block.periodValue ?? ""}
                  onValueChange={(v) => onChange({ periodValue: v } as never)}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="..." /></SelectTrigger>
                  <SelectContent>
                    {periodOpts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Formato</Label>
            <Select value={block.format ?? "auto"}
              onValueChange={(v) => onChange({ format: v as never } as never)}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Automático</SelectItem>
                <SelectItem value="currency">Moeda (R$)</SelectItem>
                <SelectItem value="percent">Percentual</SelectItem>
                <SelectItem value="tons">Toneladas</SelectItem>
                <SelectItem value="number">Número</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      <Separator />
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Tamanho do valor" value={block.valueSize}
          onChange={(v) => onChange({ valueSize: v } as never)} />
        <Field label="Cor (hex)" value={block.color}
          onChange={(v) => onChange({ color: v.replace("#", "") } as never)} />
      </div>
      <BgField label="Fundo do card"
        value={block.cardBg ?? "F8FAFC"}
        onChange={(v) => onChange({ cardBg: v } as never)} />
      <Separator />
      <div className="flex items-center justify-between">
        <Label className="text-[10px] uppercase text-muted-foreground">
          Reagir a filtros do slide
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
        <Label className="text-[10px] uppercase text-muted-foreground">Modo</Label>
        <Select value={block.mode}
          onValueChange={(v) => onChange({ mode: v as "fy"|"month", base: null, comp: null } as never)}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="month">Mês a mês</SelectItem>
            <SelectItem value="fy">Ano fiscal</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">Base</Label>
          <Select value={block.base ?? ""} onValueChange={(v) => onChange({ base: v } as never)}>
            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="..." /></SelectTrigger>
            <SelectContent>
              {opts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">Comparação</Label>
          <Select value={block.comp ?? ""} onValueChange={(v) => onChange({ comp: v } as never)}>
            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="..." /></SelectTrigger>
            <SelectContent>
              {opts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

function TableBlockEditor({ block, onChange }: {
  block: Extract<CustomBlock, { kind: "table" }>;
  onChange: (p: Partial<CustomBlock>) => void;
}) {
  const dims = CUSTOM_TABLE_DIMS;
  const pricing = usePricing((s) => s.rows);
  const budget = useBudget((s) => s.rows);
  const totalRows = useMemo(() => {
    const measures = CUSTOM_TABLE_MEASURES.filter((m) => block.measures.includes(m.id));
    if (!measures.length) return 0;
    const unified = buildUnifiedRows(pricing, budget, "real");
    const cfg: PivotConfig = {
      rows: block.rowDims, cols: block.colDim ? [block.colDim] : [],
      values: measures,
      filters: Object.fromEntries(Object.entries(block.filters).map(([k, v]) => [k, v ?? []])),
    };
    return computePivot(unified as unknown as Record<string, unknown>[], cfg).rowHeaders.length;
  }, [pricing, budget, block.rowDims, block.colDim, block.measures, block.filters]);
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

  // Quando o usuário liga "Outros" e a tabela está truncada,
  // crescemos a altura para garantir que a linha apareça no canvas.
  const handleShowOthers = (v: boolean) => {
    const patch: Partial<typeof block> = { showOthers: v };
    if (v && fit.truncated) {
      const extraRows = 1; // linha "Outros"
      const ROW_H = 26;
      const needed = block.h + extraRows * ROW_H + 4;
      const maxH = CANVAS_H - block.y;
      patch.h = Math.min(maxH, needed);
    }
    onChange(patch as never);
  };

  return (
    <div className="space-y-3">
      <TruncationAlert blockId={block.id} fit={fit} unitPlural="linhas" />

      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">Linhas (dimensões)</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 w-full justify-start text-xs">
              {block.rowDims.length ? block.rowDims.map((d) => dims.find((x) => x.id === d)?.label).join(", ") : "Selecionar..."}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="max-h-72 w-64 overflow-auto p-2" align="start">
            {dims.map((d) => (
              <button key={d.id as string}
                onClick={() => toggleRowDim(d.id as string)}
                className={cn(
                  "flex w-full items-center justify-between rounded px-2 py-1 text-xs hover:bg-secondary",
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
        <Label className="text-[10px] uppercase text-muted-foreground">Coluna (opcional)</Label>
        <Select value={block.colDim ?? "__none__"}
          onValueChange={(v) => onChange({ colDim: v === "__none__" ? null : v } as never)}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— Sem coluna —</SelectItem>
            {dims.map((d) => <SelectItem key={d.id as string} value={d.id as string}>{d.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">Medidas</Label>
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
                  "flex w-full items-center justify-between rounded px-2 py-1 text-xs hover:bg-secondary",
                  block.measures.includes(m.id) && "bg-primary/10 text-primary",
                  disabled && "cursor-not-allowed opacity-40 hover:bg-transparent",
                )}
              >
                <span>{m.label}{disabled ? " — indisponível" : ""}</span>
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
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">Ordenar por</Label>
          <Select value={block.sortMeasure ?? block.measures[0]}
            onValueChange={(v) => onChange({ sortMeasure: v } as never)}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CUSTOM_TABLE_MEASURES.filter((m) => block.measures.includes(m.id))
                .map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">Alinhamento dos valores</Label>
        <div className="mt-1 flex gap-1">
          {(["left", "center", "right"] as const).map((a) => (
            <Button
              key={a}
              size="sm"
              variant={(block.valueAlign ?? "right") === a ? "default" : "outline"}
              className="h-6 flex-1 text-[10px]"
              onClick={() => onChange({ valueAlign: a } as never)}
            >
              {a === "left" ? "←" : a === "center" ? "↔" : "→"}
            </Button>
          ))}
        </div>
      </div>

      {block.measures.length > 0 && (
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">Formatação condicional</Label>
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
                      <SelectItem value="none">Nenhuma</SelectItem>
                      <SelectItem value="heatmap">Heatmap</SelectItem>
                      <SelectItem value="above_avg">Acima/Abaixo da média</SelectItem>
                      <SelectItem value="data_bar">Barra de dados</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {rule.mode === "heatmap" && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="w-8 text-[10px] text-muted-foreground">Mín</span>
                      <input type="color" value={`#${rule.colorMin ?? "F8696B"}`}
                        onChange={(e) => setRule({ colorMin: e.target.value.slice(1) })}
                        className="h-5 w-8 cursor-pointer rounded border-0 p-0" />
                      <span className="w-8 text-[10px] text-muted-foreground">Meio</span>
                      <input type="color" value={`#${rule.colorMid ?? "FFEB84"}`}
                        onChange={(e) => setRule({ colorMid: e.target.value.slice(1) })}
                        className="h-5 w-8 cursor-pointer rounded border-0 p-0" />
                      <span className="w-8 text-[10px] text-muted-foreground">Máx</span>
                      <input type="color" value={`#${rule.colorMax ?? "63BE7B"}`}
                        onChange={(e) => setRule({ colorMax: e.target.value.slice(1) })}
                        className="h-5 w-8 cursor-pointer rounded border-0 p-0" />
                    </div>
                    <Select value={rule.scope ?? "table"}
                      onValueChange={(v) => setRule({ scope: v as "table" | "column" | "row" })}>
                      <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="table">Escala global (tabela inteira)</SelectItem>
                        <SelectItem value="column">Escala por coluna</SelectItem>
                        <SelectItem value="row">Escala por linha</SelectItem>
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
        <ToggleRow label="Auto-ajustar ao tamanho"
          value={block.autoFit !== false}
          onChange={(v) => onChange({ autoFit: v } as never)} />
        {block.autoFit === false && (
          <NumField label="Máx. linhas" value={block.maxRows ?? fit.shown}
            onChange={(v) => onChange({ maxRows: v } as never)} />
        )}
        <ToggleRow label="Linha “Outros”" value={!!block.showOthers}
          onChange={handleShowOthers} />
        <ToggleRow label="Nota no slide exportado" value={!!block.exportNote}
          onChange={(v) => onChange({ exportNote: v } as never)} />
        <p className="text-[10px] text-muted-foreground">
          Mostrando {fit.shown} de {fit.total}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
import { ChartInspector } from "./chart/ChartInspector";
function ChartBlockEditor({ block, onChange }: {
  block: ChartBlock; onChange: (p: Partial<CustomBlock>) => void;
}) {
  return <ChartInspector block={block} onChange={onChange as never} />;
}

function TopSkuBlockEditor({ block, onChange }: {
  block: TopSkuBlock; onChange: (p: Partial<CustomBlock>) => void;
}) {
  const months = useMonthsInfo();
  const fyList = useFyList();
  const periodOpts = block.periodMode === "fy"
    ? fyList.map((f) => ({ value: f, label: f }))
    : block.periodMode === "month"
      ? months.map((m) => ({ value: m.periodo, label: m.label }))
      : [];
  return (
    <div className="space-y-2">
      <Field label="Título" value={block.title ?? ""}
        onChange={(v) => onChange({ title: v } as never)} />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">Ranquear por</Label>
          <Select value={block.dim}
            onValueChange={(v) => onChange({ dim: v as never } as never)}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="skuDesc">Descrição SKU</SelectItem>
              <SelectItem value="sku">SKU</SelectItem>
              <SelectItem value="cliente">Cliente</SelectItem>
              <SelectItem value="marca">Marca</SelectItem>
              <SelectItem value="categoria">Categoria</SelectItem>
              <SelectItem value="canalAjustado">Canal Ajustado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">Medida</Label>
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
                    {m.label}{disabled ? " — indisponível" : ""}
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
        <Label className="text-[10px] uppercase text-muted-foreground">Período</Label>
        <Select value={block.periodMode}
          onValueChange={(v) => onChange({ periodMode: v as never, periodValue: null } as never)}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="month">Mês</SelectItem>
            <SelectItem value="fy">Ano fiscal</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {block.periodMode !== "all" && (
        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">Valor do período</Label>
          <Select value={block.periodValue ?? ""}
            onValueChange={(v) => onChange({ periodValue: v } as never)}>
            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="..." /></SelectTrigger>
            <SelectContent>
              {periodOpts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      <NumField label="Top N" value={block.topN}
        onChange={(v) => onChange({ topN: Math.max(1, Math.min(50, v)) } as never)} />
      <ToggleRow label="Mostrar % do total" value={block.showShare}
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
  { value: "Calibri, sans-serif", label: "Calibri" },
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
      <Section title="Conteúdo" defaultOpen>
        <Textarea
          rows={isTitle ? 2 : 4}
          value={block.text}
          onChange={(e) => onChange({ text: e.target.value })}
          className="text-xs"
        />
      </Section>

      <Section title="Tipografia" defaultOpen>
        <Row label="Fonte">
          <Select value={block.fontFamily ?? "Calibri, sans-serif"}
            onValueChange={(v) => onChange({ fontFamily: v })}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FONT_FAMILIES.map((f) => (
                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Tamanho (px)">
          <SliderWithInput value={block.size} min={8} max={200} unit="px"
            onChange={(v) => onChange({ size: v })} />
        </Row>
        <Row label="Cor">
          <ColorField value={`#${block.color}`} onChange={(c) => onChange({ color: c.replace("#", "") })} />
        </Row>
        <Row label="Alinhamento">
          <Segmented
            value={block.align}
            onChange={(v) => onChange({ align: v as "left" | "center" | "right" })}
            options={[{ value: "left", label: "Esq" }, { value: "center", label: "Centro" }, { value: "right", label: "Dir" }]}
          />
        </Row>
        {isTitle && (
          <ToggleField label="Negrito" value={(block as TitleBlock).bold}
            onChange={(v) => onChange({ bold: v } as Partial<TitleBlock>)} />
        )}
        <ToggleField label="Itálico" value={block.italic ?? false}
          onChange={(v) => onChange({ italic: v })} />
        <Row label="Transform">
          <Segmented
            value={block.textTransform ?? "none"}
            onChange={(v) => onChange({ textTransform: v as TitleBlock["textTransform"] })}
            options={[
              { value: "none", label: "Aa" },
              { value: "uppercase", label: "AA" },
              { value: "lowercase", label: "aa" },
              { value: "capitalize", label: "Ab" },
            ]}
          />
        </Row>
        <Row label="Espaç. letras">
          <SliderWithInput value={block.letterSpacing ?? 0} min={-0.1} max={0.5} step={0.01} unit="em"
            onChange={(v) => onChange({ letterSpacing: v })} />
        </Row>
        <Row label="Altura linha">
          <SliderWithInput value={block.lineHeight ?? (isTitle ? 1.1 : 1.3)} min={0.8} max={3} step={0.05} unit="×"
            onChange={(v) => onChange({ lineHeight: v })} />
        </Row>
      </Section>

      <Section title="Rotação" defaultOpen={false}>
        <Row label="Girar">
          <SliderWithInput value={block.rotation ?? 0} min={-180} max={180} unit="°"
            onChange={(v) => onChange({ rotation: v })} />
        </Row>
        <Row label="">
          <button className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
            onClick={() => onChange({ rotation: 0 })} title="Resetar rotação">
            ↺ Zerar rotação
          </button>
        </Row>
      </Section>

      <Section title="Aparência" defaultOpen={false}>
        <Row label="Opacidade">
          <SliderWithInput value={block.opacity ?? 100} min={10} max={100} unit="%"
            onChange={(v) => onChange({ opacity: v })} />
        </Row>
        <Row label="Sombra texto">
          <Input className="h-7 text-xs" placeholder="2px 2px 4px #000000"
            value={block.textShadow ?? ""}
            onChange={(e) => onChange({ textShadow: e.target.value })} />
        </Row>
        <Row label="Padding (px)">
          <SliderWithInput value={block.padding ?? 0} min={0} max={60} unit="px"
            onChange={(v) => onChange({ padding: v })} />
        </Row>
        <Row label="Fundo (hex)">
          <Input className="h-7 text-xs" placeholder="transparent"
            value={block.backgroundColor ?? ""}
            onChange={(e) => onChange({ backgroundColor: e.target.value.replace("#", "") || undefined })} />
        </Row>
        <Row label="Borda arred.">
          <SliderWithInput value={block.borderRadius ?? 0} min={0} max={40} unit="px"
            onChange={(v) => onChange({ borderRadius: v })} />
        </Row>
      </Section>

      <Section title="Animação" defaultOpen={false}>
        <Row label="Entrada">
          <Select
            value={(block as { enterAnimation?: string }).enterAnimation ?? "none"}
            onValueChange={(v) => onChange({ enterAnimation: v } as never)}
          >
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhuma</SelectItem>
              <SelectItem value="fade">Fade</SelectItem>
              <SelectItem value="slide-up">Subir</SelectItem>
              <SelectItem value="pop">Pop</SelectItem>
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
          Fonte de Dados
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
  const allMonths = [...months].sort((a, b) =>
    a.ano !== b.ano ? a.ano - b.ano : a.mes - b.mes,
  );

  return (
    <div className="space-y-2">
      <DreSourcePicker block={block} onChange={onChange} />
      <Section title="Períodos" defaultOpen>
        <Row label="Modo">
          <Segmented
            value={block.periodMode}
            onChange={(v) => onChange({ periodMode: v as "month" | "fy" })}
            options={[{ value: "month", label: "Mês" }, { value: "fy", label: "Ano" }]}
          />
        </Row>
        <Row label="Períodos">
          <MultiSelectFilter
            options={allMonths.map((m) => ({ value: m.periodo, label: m.label }))}
            selected={block.periodos ?? []}
            onChange={(v) => onChange({ periodos: v.length === 0 ? null : v })}
            placeholder="Últimos 6 meses"
          />
        </Row>
      </Section>

      <Section title="Linhas exibidas" defaultOpen>
        <div className="space-y-0.5">
          {DRE_LINES.map((line) => (
            <div key={line.id} className="flex items-center justify-between py-0.5">
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
            </div>
          ))}
          <button
            className="mt-1 text-[10px] text-primary hover:underline"
            onClick={() => onChange({ linhas: null })}
          >
            Mostrar todas
          </button>
        </div>
      </Section>

      <Section title="Aparência" defaultOpen>
        <Row label="Fonte (px)">
          <NumberStepper value={block.fontSize} min={8} max={18}
            onChange={(v) => onChange({ fontSize: v })} />
        </Row>
        <Row label="Cor header">
          <ColorField value={block.headerColor}
            onChange={(c) => onChange({ headerColor: c })} />
        </Row>
        <Row label="Cor texto">
          <ColorField value={block.textColor}
            onChange={(c) => onChange({ textColor: c })} />
        </Row>
        <ToggleField label="Mostrar Budget" value={block.showBudget}
          onChange={(v) => onChange({ showBudget: v })} />
        <ToggleField
          label="Mostrar variação (último vs penúltimo)"
          value={block.showVariacao ?? false}
          onChange={(v) => onChange({ showVariacao: v })}
        />
        {(block.showVariacao ?? false) && (
          <Row label="Tipo de variação">
            <Segmented
              value={block.variacaoTipo ?? "percentual"}
              onChange={(v) => onChange({ variacaoTipo: v as "absoluta" | "percentual" | "ambas" })}
              options={[
                { value: "percentual", label: "%" },
                { value: "absoluta", label: "Δ" },
                { value: "ambas", label: "Ambas" },
              ]}
            />
          </Row>
        )}
      </Section>

      <Section title="Formatação Condicional" defaultOpen={false}>
        {(() => {
          const cf = block.conditionalFormat ?? {
            enabled: false, scope: "row" as const, colorMin: "#DC2626",
            colorMid: "#FFFFFF", colorMax: "#16A34A",
            applyTo: "cell" as const, linhasAtivas: [],
          };
          const upd = (patch: Partial<NonNullable<DreBlock["conditionalFormat"]>>) =>
            onChange({ conditionalFormat: { ...cf, ...patch } });
          return (
            <>
              <ToggleField label="Ativar" value={cf.enabled}
                onChange={(v) => upd({ enabled: v })} />
              {cf.enabled && (
                <>
                  <Row label="Escopo">
                    <Segmented value={cf.scope} onChange={(v) => upd({ scope: v as "row" | "table" })}
                      options={[{ value: "row", label: "Linha" }, { value: "table", label: "Tabela" }]} />
                  </Row>
                  <Row label="Aplicar em">
                    <Segmented value={cf.applyTo} onChange={(v) => upd({ applyTo: v as "cell" | "text" })}
                      options={[{ value: "cell", label: "Fundo" }, { value: "text", label: "Texto" }]} />
                  </Row>
                  <Row label="Cor mín">
                    <ColorField value={cf.colorMin} onChange={(c) => upd({ colorMin: c })} />
                  </Row>
                  <Row label="Cor meio">
                    <ColorField value={cf.colorMid} onChange={(c) => upd({ colorMid: c })} />
                  </Row>
                  <Row label="Cor máx">
                    <ColorField value={cf.colorMax} onChange={(c) => upd({ colorMax: c })} />
                  </Row>
                  <div className="space-y-0.5">
                    <span className="text-[10px] uppercase text-muted-foreground">Linhas ativas</span>
                    {DRE_LINES.map((line) => (
                      <div key={line.id} className="flex items-center justify-between py-0.5">
                        <span className="text-[11px] text-muted-foreground">{line.label}</span>
                        <input type="checkbox" className="h-3.5 w-3.5"
                          checked={cf.linhasAtivas.includes(line.id)}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...cf.linhasAtivas, line.id]
                              : cf.linhasAtivas.filter((id) => id !== line.id);
                            upd({ linhasAtivas: next });
                          }} />
                      </div>
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

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}

// (FitControls compartilhado removido — apenas tabela usa estes toggles agora,
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
        Mostrando {fit.shown} de {fit.total} {unitPlural} — aumente a altura do bloco para ver mais
        {" ou ative “Linha Outros” para agregar o restante."}
      </AlertDescription>
      <button
        onClick={() => { dismissedTruncations.set(blockId, key); force((n) => n + 1); }}
        className="absolute right-1 top-1 rounded p-0.5 hover:bg-amber-100"
        aria-label="Fechar"
      >
        <X className="h-3 w-3 text-amber-700" />
      </button>
    </Alert>
  );
}

function PaletteGroup({
  title, defaultOpen = true, children,
}: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
        <span>{title}</span>
        <ChevronDown className={cn("h-3 w-3 transition-transform", open ? "" : "-rotate-90")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-0.5 pt-1">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function PaletteButton({
  icon: Icon, label, onClick, favorite = false, onToggleFavorite,
}: {
  icon: Icon;
  label: string;
  onClick: () => void;
  favorite?: boolean;
  onToggleFavorite?: () => void;
}) {
  return (
    <div className="group flex items-center rounded-md hover:bg-secondary">
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] font-medium"
      >
        <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="truncate">{label}</span>
      </button>
      {onToggleFavorite && (
        <button
          type="button"
          title={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          className={cn(
            "mr-1 rounded p-0.5 transition-colors",
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

// Badge "KE30" / "Budget" mostrado no canto superior-esquerdo de cada bloco
// de dados durante a edição. Marcado data-edit-only para o exporter remover.
function DataSourceBadge({ block }: { block: CustomBlock }) {
  const kinds: CustomBlockKind[] = ["chart", "kpi", "table", "topSku"];
  if (!kinds.includes(block.kind)) return null;
  const ds = (block as { dataSource?: BlockDataSource }).dataSource ?? "ke30";
  const bgColor = ds === "ke30"
    ? "rgba(37,99,235,0.92)"
    : ds === "budget"
      ? "rgba(147,51,234,0.92)"
      : ds === "forecast"
        ? "rgba(217,119,6,0.92)"
      : "rgba(5,150,105,0.92)";
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
        color: "#fff",
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
// ClearFiltersToolbar — slide-level cross-filter clear button (Part B.6)
// ---------------------------------------------------------------------------
function ClearFiltersToolbar() {
  const { filters, clearAll } = useSlideFilters();
  if (filters.length === 0) return null;
  const summary = filters
    .map((f) => `${dimensionLabel(f.dimension)}: ${f.values.join(", ")}`)
    .join(" · ");
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5">
      <FunnelIcon className="h-3.5 w-3.5 text-primary" />
      <span className="flex-1 truncate text-[11px] text-foreground/90" title={summary}>
        Filtros cruzados ativos · {summary}
      </span>
      <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={clearAll}>
        Limpar filtros ({filters.length})
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rotation handle — child of Rnd, NOT inside the rotated content div
// ---------------------------------------------------------------------------
function BlockRotationHandle({ block }: { block: TitleBlock | TextBlock | ImageBlock }) {
  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const rndEl = (e.currentTarget as HTMLElement).parentElement;
    if (!rndEl) return;
    const rect = rndEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const startRot = block.rotation ?? 0;
    const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
    let raf: number | null = null;

    const onMove = (ev: MouseEvent) => {
      if (raf !== null) cancelAnimationFrame(raf);
      const evX = ev.clientX; const evY = ev.clientY;
      const shiftKey = ev.shiftKey;
      raf = requestAnimationFrame(() => {
        const angle = Math.atan2(evY - cy, evX - cx) * (180 / Math.PI);
        let newRot = startRot + (angle - startAngle);
        if (shiftKey) newRot = Math.round(newRot / 15) * 15;
        newRot = ((newRot % 360) + 360) % 360;
        if (newRot > 180) newRot -= 360;
        patchBlockAction(block.id, { rotation: Math.round(newRot) } as never, "Rotacionar");
        raf = null;
      });
    };
    const onUp = () => {
      if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      data-export-hide="true"
      style={{
        position: "absolute",
        top: -28,
        left: "50%",
        transform: "translateX(-50%)",
        width: 16,
        height: 16,
        borderRadius: "50%",
        background: "white",
        border: "2px solid hsl(var(--primary))",
        cursor: "crosshair",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 999995,
        pointerEvents: "all",
      }}
      onMouseDown={handleMouseDown}
    >
      <RotateCw style={{ width: 8, height: 8, color: "hsl(var(--primary))" }} />
    </div>
  );
}

function clientToCanvas(
  canvasEl: HTMLDivElement | null,
  clientX: number,
  clientY: number,
  scale: number,
): { x: number; y: number } | null {
  if (!canvasEl) return null;
  const r = canvasEl.getBoundingClientRect();
  return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale };
}

// ---------------------------------------------------------------------------
// Multi-selection inspector (B8.2)
// ---------------------------------------------------------------------------
function MultiSelectInspector({ selectedIds, blocks, hasGroup }: {
  selectedIds: string[];
  blocks: CustomBlock[];
  hasGroup: boolean;
}) {
  const align = (k: AlignKind) => alignBlocksAction(selectedIds, k);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Badge variant="secondary" className="text-[10px]">
          Multi-seleção ({blocks.length} blocos)
        </Badge>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7"
            onClick={() => duplicateBlocksAction(selectedIds)}
            title="Duplicar todos (Ctrl+D)">
            <CopyIcon className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 hover:text-destructive"
            onClick={() => deleteBlocksAction(selectedIds)}
            title="Excluir todos (Del)">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <Separator />

      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">Alinhamento</Label>
        <div className="mt-1 grid grid-cols-3 gap-1">
          <Button size="icon" variant="outline" className="h-8" title="Esquerda" onClick={() => align("left")}>
            <AlignStartVertical className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="outline" className="h-8" title="Centro horizontal" onClick={() => align("centerH")}>
            <AlignHorizontalJustifyCenter className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="outline" className="h-8" title="Direita" onClick={() => align("right")}>
            <AlignEndVertical className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="outline" className="h-8" title="Topo" onClick={() => align("top")}>
            <AlignStartHorizontal className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="outline" className="h-8" title="Centro vertical" onClick={() => align("centerV")}>
            <AlignVerticalJustifyCenter className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="outline" className="h-8" title="Base" onClick={() => align("bottom")}>
            <AlignEndHorizontal className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">Distribuir</Label>
        <div className="mt-1 grid grid-cols-2 gap-1">
          <Button size="sm" variant="outline" className="h-8 gap-1 text-[11px]"
            disabled={blocks.length < 3}
            onClick={() => align("distH")}>
            <AlignHorizontalDistributeCenter className="h-3.5 w-3.5" /> Horizontal
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1 text-[11px]"
            disabled={blocks.length < 3}
            onClick={() => align("distV")}>
            <AlignVerticalDistributeCenter className="h-3.5 w-3.5" /> Vertical
          </Button>
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-2 gap-1">
        <Button size="sm" variant="outline" className="h-8 gap-1 text-[11px]"
          onClick={() => { groupBlocksAction(selectedIds); toast.success("Blocos agrupados"); }}>
          <GroupIcon className="h-3.5 w-3.5" /> Agrupar
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1 text-[11px]"
          disabled={!hasGroup}
          onClick={() => { ungroupBlocksAction(selectedIds); toast.success("Grupo desfeito"); }}>
          <UngroupIcon className="h-3.5 w-3.5" /> Desagrupar
        </Button>
      </div>

      <p className="text-[10px] leading-snug text-muted-foreground">
        Atalhos: <kbd>Ctrl+A</kbd> selecionar tudo · <kbd>Ctrl+G</kbd> agrupar · <kbd>Ctrl+Shift+G</kbd> desagrupar · <kbd>setas</kbd> mover (Shift = 40px)
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GroupOverlay — dashed bbox + 8 resize handles for the active group (B8 fix).
// Drag preview is local; on mouseup a single labeled action commits the
// proportional scale to every member ("Redimensionar grupo" — undoable).
// ---------------------------------------------------------------------------
function GroupOverlay({
  bounds, active, showHandles, memberIds, scaleRef,
}: {
  bounds: { x: number; y: number; w: number; h: number };
  active: boolean;
  showHandles: boolean;
  memberIds: string[];
  scaleRef: React.MutableRefObject<number>;
}) {
  const [preview, setPreview] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const bb = preview ?? bounds;

  type HandleDir = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

  const startResize = (dir: HandleDir, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const origin = { ...bounds };
    const startX = e.clientX;
    const startY = e.clientY;
    const sc = scaleRef.current || 1;
    const move = (ev: MouseEvent) => {
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
      setPreview({ x, y, w, h });
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setPreview((p) => {
        if (p) resizeGroupAction(memberIds, origin, p);
        return null;
      });
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
    background: "#3B82F6",
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
          border: `1px dashed ${active ? "#3B82F6" : "rgba(59,130,246,0.35)"}`,
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
// PalettePopover — paleta de cores rápidas (cores usadas + cores do tema)
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

function BrandKitPopover({ selected }: { selected: CustomBlock | null }) {
  const target = getBrandStyleTarget(selected);
  const styles = getBrandStylesForBlock(selected);

  const apply = (style: SlideBrandStyle) => {
    if (!selected) {
      toast.info("Selecione um bloco para aplicar um estilo.");
      return;
    }
    patchBlockAction(selected.id, buildBrandStylePatch(style, selected), "Alterar estilo");
    toast.success(`Estilo aplicado: ${style.name}`);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-[11px]"
          title="Brand Kit"
        >
          <Sparkles className="h-3.5 w-3.5" /> Brand Kit
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="space-y-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Estilos oficiais
            </div>
            <div className="text-xs text-muted-foreground">
              {selected
                ? `${brandStyleTargetLabel(target)} selecionado`
                : "Selecione um texto, KPI, forma, tabela ou DRE."}
            </div>
          </div>

          {styles.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/70 p-3 text-xs text-muted-foreground">
              Este tipo de bloco ainda nao tem estilos de Brand Kit.
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

function PalettePopover({
  theme, blocks, selected,
}: {
  theme: SlideTheme;
  blocks: CustomBlock[];
  selected: CustomBlock | null;
}) {
  const used = collectUsedColors(blocks);
  const canApply = !!selected && (
    selected.kind === "title" || selected.kind === "text" ||
    selected.kind === "kpi" || selected.kind === "shape"
  );

  const apply = (hex: string) => {
    if (!selected) {
      toast.info("Selecione um bloco para aplicar a cor.");
      return;
    }
    if (selected.kind === "shape") {
      patchBlockAction(selected.id, { fill: hex } as Partial<CustomBlock>, "Alterar estilo");
    } else if (
      selected.kind === "title" || selected.kind === "text" || selected.kind === "kpi"
    ) {
      patchBlockAction(selected.id, { color: hex } as Partial<CustomBlock>, "Alterar estilo");
    } else {
      toast.info("Este bloco não suporta cor direta.");
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm" variant="ghost"
          className="h-7 gap-1 px-2 text-[11px]"
          title="Paleta de cores"
        >
          <Paintbrush className="h-3.5 w-3.5" /> Paleta
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="space-y-3">
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Cores deste slide
            </div>
            {used.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">Nenhuma cor usada ainda.</p>
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
                  />
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Tema · {theme.name}
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
                />
              ))}
            </div>
          </div>
          {!canApply && (
            <p className="text-[10px] text-muted-foreground">
              Selecione um título, texto, KPI ou forma para aplicar.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ----------------------------------------------------------------------------
// SpeakerNotesBar — colapsável no rodapé do editor de canvas.
// ----------------------------------------------------------------------------
function SpeakerNotesBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const MAX = 500;
  const trimmed = value.slice(0, MAX);
  return (
    <div className="shrink-0 rounded-lg border border-border/40 bg-card/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-secondary/40"
      >
        <StickyNote className="h-3.5 w-3.5" />
        Anotações do apresentador
        {value.trim() && <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[9px]">{value.length}</Badge>}
        <ChevronUp className={cn("ml-auto h-3 w-3 transition-transform", !open && "rotate-180")} />
      </button>
      {open && (
        <div className="relative px-3 pb-2">
          <Textarea
            value={trimmed}
            onChange={(e) => onChange(e.target.value.slice(0, MAX))}
            placeholder="Adicione notas para o apresentador..."
            className="h-[80px] resize-none text-xs"
            maxLength={MAX}
          />
          <span className="pointer-events-none absolute bottom-3 right-5 text-[10px] tabular-nums text-muted-foreground">
            {trimmed.length}/{MAX}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ShortcutsDialog — painel de referência rápida dos atalhos do editor.
function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
  const sections: { title: string; items: [string, string][] }[] = [
    {
      title: "Edição",
      items: [
        [`${mod} + Z`, "Desfazer"],
        [`${mod} + Y  ·  ${mod} + Shift + Z`, "Refazer"],
        [`${mod} + D`, "Duplicar bloco selecionado"],
        ["Delete  ·  Backspace", "Excluir bloco selecionado"],
        [`${mod} + A`, "Selecionar todos os blocos"],
        ["Esc", "Desselecionar / sair da edição inline"],
      ],
    },
    {
      title: "Área de transferência",
      items: [
        [`${mod} + C`, "Copiar bloco"],
        [`${mod} + V`, "Colar bloco (mantém ao mudar de slide)"],
        [`${mod} + X`, "Cortar bloco"],
      ],
    },
    {
      title: "Camadas",
      items: [
        [`${mod} + ]`, "Trazer para frente"],
        [`${mod} + [`, "Enviar para trás"],
        [`${mod} + Shift + ]`, "Trazer para a frente de tudo"],
        [`${mod} + Shift + [`, "Enviar para o fundo"],
      ],
    },
    {
      title: "Alinhamento",
      items: [
        [`${mod} + Shift + H`, "Centralizar horizontalmente"],
        [`${mod} + Shift + V`, "Centralizar verticalmente"],
      ],
    },
    {
      title: "Mover",
      items: [
        ["← → ↑ ↓", "Mover 10 px"],
        ["Shift + setas", "Mover 40 px"],
      ],
    },
    {
      title: "Apresentação & ajuda",
      items: [
        ["F5", "Iniciar apresentação"],
        [`${mod} + Shift + P`, "Iniciar apresentação"],
        ["?", "Abrir este painel"],
      ],
    },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-4 w-4" /> Atalhos de teclado
          </DialogTitle>
        </DialogHeader>
        <div className="grid max-h-[60vh] grid-cols-1 gap-4 overflow-y-auto pr-1 sm:grid-cols-2">
          {sections.map((sec) => (
            <div key={sec.title} className="rounded-md border border-border/40 bg-card/40 p-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {sec.title}
              </div>
              <ul className="space-y-1.5">
                {sec.items.map(([k, desc]) => (
                  <li key={k} className="flex items-start justify-between gap-3 text-[12px]">
                    <span className="text-foreground/90">{desc}</span>
                    <kbd className="shrink-0 rounded border border-border/60 bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                      {k}
                    </kbd>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Omni Analytics Inspector helpers
// ---------------------------------------------------------------------------

const OMNI_METRIC_OPTIONS: { value: OmniMetric; label: string }[] = [
  { value: "cm",        label: "Contrib. Marginal" },
  { value: "mb",        label: "Margem Bruta" },
  { value: "rol",       label: "ROL" },
  { value: "volume",    label: "Volume (Kg)" },
  { value: "margemPct", label: "Margem %" },
];

const OMNI_DIM_OPTIONS: { value: OmniDim; label: string }[] = [
  { value: "skuDesc",       label: "SKU" },
  { value: "marca",         label: "Marca" },
  { value: "categoria",     label: "Categoria" },
  { value: "canalAjustado", label: "Canal" },
  { value: "cliente",       label: "Cliente" },
  { value: "sku",           label: "SKU (código)" },
];

const OMNI_SORTBY_OPTIONS: { value: OmniAbcSortBy; label: string }[] = [
  { value: "margem",    label: "CM Absoluto" },
  { value: "margemPct", label: "CM %" },
  { value: "volume",    label: "Volume" },
];

function OmniTitleSection({ showTitle, title, defaultTitle, onChange }: {
  showTitle: boolean;
  title?: string;
  defaultTitle: string;
  onChange: (patch: { showTitle?: boolean; title?: string }) => void;
}) {
  return (
    <Section label="Título">
      <Row label="Mostrar">
        <ToggleField value={showTitle} onChange={(v) => onChange({ showTitle: v })} label="" />
      </Row>
      {showTitle && (
        <Row label="Texto">
          <input
            className="h-7 w-full rounded border border-border/50 bg-background px-2 text-xs"
            value={title ?? defaultTitle}
            onChange={(e) => onChange({ title: e.target.value })}
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
  const unique = (field: keyof import("@/lib/types").PricingRow) =>
    Array.from(new Set(rows.map((r) => r[field] as string | undefined).filter(Boolean))).sort() as string[];

  const dimOpt = (field: keyof import("@/lib/types").PricingRow, placeholder: string) => [
    { value: "", label: placeholder },
    ...unique(field).map((v) => ({ value: v, label: v })),
  ];

  return (
    <Section label="Filtros">
      <Row label="Períodos">
        <MultiSelectFilter
          selected={block.periodos ?? []}
          options={unique("periodo").map((v) => ({ value: v, label: v }))}
          onChange={(v) => onChange({ periodos: v.length ? v : null })}
          placeholder="Todos"
        />
      </Row>
      <Row label="Canal">
        <SelectField
          value={block.canalAjustado ?? ""}
          options={dimOpt("canalAjustado", "Todos")}
          onChange={(v) => onChange({ canalAjustado: v || null })}
        />
      </Row>
      <Row label="Categoria">
        <SelectField
          value={block.categoria ?? ""}
          options={dimOpt("categoria", "Todas")}
          onChange={(v) => onChange({ categoria: v || null })}
        />
      </Row>
      <Row label="Subcategoria">
        <SelectField
          value={block.subcategoria ?? ""}
          options={dimOpt("subcategoria", "Todas")}
          onChange={(v) => onChange({ subcategoria: v || null })}
        />
      </Row>
      <Row label="Marca">
        <SelectField
          value={block.marca ?? ""}
          options={dimOpt("marca", "Todas")}
          onChange={(v) => onChange({ marca: v || null })}
        />
      </Row>
      <Row label="Formato">
        <SelectField
          value={block.formato ?? ""}
          options={dimOpt("formato", "Todos")}
          onChange={(v) => onChange({ formato: v || null })}
        />
      </Row>
      <Row label="Regional">
        <SelectField
          value={block.regional ?? ""}
          options={dimOpt("regional", "Todas")}
          onChange={(v) => onChange({ regional: v || null })}
        />
      </Row>
      <Row label="UF">
        <SelectField
          value={block.uf ?? ""}
          options={dimOpt("uf", "Todas")}
          onChange={(v) => onChange({ uf: v || null })}
        />
      </Row>
    </Section>
  );
}

/** Shared: Metric + Título + Filtros */
function OmniMetricInspector({ block, onChange, label }: {
  block: OmniBaseBlock & { metric: OmniMetric };
  onChange: (p: Partial<OmniBaseBlock> & { metric?: OmniMetric }) => void;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <OmniTitleSection showTitle={block.showTitle} title={block.title} defaultTitle={label} onChange={onChange} />
      <Section label="Dados">
        <Row label="Métrica">
          <SelectField value={block.metric} onChange={(v) => onChange({ metric: v as OmniMetric })} options={OMNI_METRIC_OPTIONS} />
        </Row>
      </Section>
      <OmniFiltersSection block={block} onChange={onChange} />
    </div>
  );
}

/** Evolução Mensal */
function OmniEvolucaoInspector({ block, onChange }: {
  block: OmniEvolucaoMensalBlock;
  onChange: (p: Partial<OmniEvolucaoMensalBlock>) => void;
}) {
  return (
    <div className="space-y-2">
      <OmniTitleSection showTitle={block.showTitle} title={block.title} defaultTitle="Evolução Mensal" onChange={onChange} />
      <Section label="Dados">
        <Row label="Métrica">
          <SelectField value={block.metric} onChange={(v) => onChange({ metric: v as OmniMetric })} options={OMNI_METRIC_OPTIONS} />
        </Row>
        <Row label="Tipo">
          <SelectField value={block.chartType} onChange={(v) => onChange({ chartType: v as "line" | "bar" | "area" })}
            options={[{ value: "line", label: "Linha" }, { value: "bar", label: "Barra" }, { value: "area", label: "Área" }]} />
        </Row>
        <Row label="Legenda">
          <ToggleField value={block.showLegend} onChange={(v) => onChange({ showLegend: v })} label="" />
        </Row>
      </Section>
      <OmniFiltersSection block={block} onChange={onChange as (p: Partial<OmniBaseBlock>) => void} />
    </div>
  );
}

/** Heróis / Ofensores + Barras ABC (shared) */
function OmniHeroisInspector({ block, onChange }: {
  block: OmniHeroisOfensoresBlock | OmniAbcBarsBlock;
  onChange: (p: Partial<OmniHeroisOfensoresBlock & OmniAbcBarsBlock>) => void;
}) {
  const label = block.kind === "omni_herois_ofensores" ? "Heróis/Ofensores" : "Barras ABC";
  return (
    <div className="space-y-2">
      <OmniTitleSection showTitle={block.showTitle} title={block.title} defaultTitle={label} onChange={onChange} />
      <Section label="Dados">
        <Row label="Dimensão">
          <SelectField value={block.dim} onChange={(v) => onChange({ dim: v as OmniDim })} options={OMNI_DIM_OPTIONS} />
        </Row>
        <Row label="Métrica">
          <SelectField value={block.metric} onChange={(v) => onChange({ metric: v as OmniMetric })} options={OMNI_METRIC_OPTIONS} />
        </Row>
        <Row label="Ordenar por">
          <SelectField value={block.sortBy} onChange={(v) => onChange({ sortBy: v as OmniAbcSortBy })} options={OMNI_SORTBY_OPTIONS} />
        </Row>
        <Row label="Exibir">
          <SelectField value={block.variant} onChange={(v) => onChange({ variant: v as OmniHeroesVariant })}
            options={[{ value: "both", label: "Ambos" }, { value: "hero", label: "Apenas Heróis" }, { value: "villain", label: "Apenas Ofensores" }]} />
        </Row>
        <Row label="Top N">
          <NumberStepper value={block.topN} min={3} max={20} step={1} onChange={(v) => onChange({ topN: v })} />
        </Row>
      </Section>
      <OmniFiltersSection block={block} onChange={onChange as (p: Partial<OmniBaseBlock>) => void} />
    </div>
  );
}

/** Canal Trend */
function OmniCanalTrendInspector({ block, onChange }: {
  block: OmniCanalTrendBlock;
  onChange: (p: Partial<OmniCanalTrendBlock>) => void;
}) {
  return (
    <div className="space-y-2">
      <OmniTitleSection showTitle={block.showTitle} title={block.title} defaultTitle="Tendência Canal" onChange={onChange} />
      <Section label="Dados">
        <Row label="Métrica">
          <SelectField value={block.metric} onChange={(v) => onChange({ metric: v as OmniMetric })} options={OMNI_METRIC_OPTIONS} />
        </Row>
        <Row label="Legenda">
          <ToggleField value={block.showLegend} onChange={(v) => onChange({ showLegend: v })} label="" />
        </Row>
      </Section>
      <OmniFiltersSection block={block} onChange={onChange as (p: Partial<OmniBaseBlock>) => void} />
    </div>
  );
}

/** Custo (Evolução e Composição compartilham) */
function OmniCustoInspector({ block, onChange }: {
  block: OmniCustoEvolucaoBlock | OmniCustoComposicaoBlock;
  onChange: (p: Partial<OmniCustoEvolucaoBlock & OmniCustoComposicaoBlock>) => void;
}) {
  const label = block.kind === "omni_custo_evolucao" ? "Evolução de Custos" : "Composição de Custos";
  return (
    <div className="space-y-2">
      <OmniTitleSection showTitle={block.showTitle} title={block.title} defaultTitle={label} onChange={onChange} />
      <Section label="Dados">
        <Row label="Visão">
          <SelectField value={block.viewMode} onChange={(v) => onChange({ viewMode: v as "pct" | "abs" | "kg" })}
            options={[
              { value: "pct", label: "% do ROL" },
              { value: "abs", label: "Absoluto" },
              ...(block.kind === "omni_custo_evolucao" ? [{ value: "kg" as const, label: "Por Kg" }] : []),
            ]} />
        </Row>
        <Row label="Legenda">
          <ToggleField value={block.showLegend} onChange={(v) => onChange({ showLegend: v })} label="" />
        </Row>
      </Section>
      <OmniFiltersSection block={block} onChange={onChange as (p: Partial<OmniBaseBlock>) => void} />
    </div>
  );
}

/** Pressão de Custo */
function OmniCustoPressaoInspector({ block, onChange }: {
  block: OmniCustoPressaoBlock;
  onChange: (p: Partial<OmniCustoPressaoBlock>) => void;
}) {
  return (
    <div className="space-y-2">
      <OmniTitleSection showTitle={block.showTitle} title={block.title} defaultTitle="Pressão de Custo sobre Receita" onChange={onChange} />
      <Section label="Dados">
        <Row label="Custo Variável">
          <ToggleField value={block.showCustoVariavel} onChange={(v) => onChange({ showCustoVariavel: v })} label="" />
        </Row>
        <Row label="Custo Fixo">
          <ToggleField value={block.showCustoFixo} onChange={(v) => onChange({ showCustoFixo: v })} label="" />
        </Row>
        <Row label="Legenda">
          <ToggleField value={block.showLegend} onChange={(v) => onChange({ showLegend: v })} label="" />
        </Row>
      </Section>
      <OmniFiltersSection block={block} onChange={onChange as (p: Partial<OmniBaseBlock>) => void} />
    </div>
  );
}

/** Price Decomp */
function OmniPriceDecompInspector({ block, onChange }: {
  block: OmniPriceDecompBlock;
  onChange: (p: Partial<OmniPriceDecompBlock>) => void;
}) {
  return (
    <div className="space-y-2">
      <OmniTitleSection showTitle={block.showTitle} title={block.title} defaultTitle="Decomposição de Preço" onChange={onChange} />
      <Section label="Períodos">
        <Row label="Modo">
          <SelectField value={block.periodMode} onChange={(v) => onChange({ periodMode: v as "fy" | "month" })}
            options={[{ value: "month", label: "Mensal" }, { value: "fy", label: "Anual (FY)" }]} />
        </Row>
        <Row label="Base"><input className="h-7 w-full rounded border border-border/50 bg-background px-2 text-xs" placeholder="auto"
          value={block.base ?? ""} onChange={(e) => onChange({ base: e.target.value || null })} /></Row>
        <Row label="Comp."><input className="h-7 w-full rounded border border-border/50 bg-background px-2 text-xs" placeholder="auto"
          value={block.comp ?? ""} onChange={(e) => onChange({ comp: e.target.value || null })} /></Row>
      </Section>
      <OmniFiltersSection block={block} onChange={onChange as (p: Partial<OmniBaseBlock>) => void} />
    </div>
  );
}

/** Bridge PVM */
function OmniBridgePvmInspector({ block, onChange }: {
  block: OmniBridgePvmBlock;
  onChange: (p: Partial<OmniBridgePvmBlock>) => void;
}) {
  return (
    <div className="space-y-2">
      <OmniTitleSection showTitle={block.showTitle} title={block.title} defaultTitle="Bridge PVM" onChange={onChange} />
      <Section label="Períodos">
        <Row label="Modo">
          <SelectField value={block.periodMode} onChange={(v) => onChange({ periodMode: v as "fy" | "month" })}
            options={[{ value: "month", label: "Mensal" }, { value: "fy", label: "Anual (FY)" }]} />
        </Row>
        <Row label="Base"><input className="h-7 w-full rounded border border-border/50 bg-background px-2 text-xs" placeholder="auto"
          value={block.base ?? ""} onChange={(e) => onChange({ base: e.target.value || null })} /></Row>
        <Row label="Comp."><input className="h-7 w-full rounded border border-border/50 bg-background px-2 text-xs" placeholder="auto"
          value={block.comp ?? ""} onChange={(e) => onChange({ comp: e.target.value || null })} /></Row>
      </Section>
      <OmniFiltersSection block={block} onChange={onChange as (p: Partial<OmniBaseBlock>) => void} />
    </div>
  );
}

/** Farol */
function OmniFarolInspector({ block, onChange }: {
  block: OmniFarolBlock;
  onChange: (p: Partial<OmniFarolBlock>) => void;
}) {
  return (
    <div className="space-y-2">
      <OmniTitleSection showTitle={block.showTitle} title={block.title} defaultTitle="Farol de Positivação" onChange={onChange} />
      <Section label="Exibição">
        <Row label="Gauge">
          <ToggleField value={block.showGauge} onChange={(v) => onChange({ showGauge: v })} label="" />
        </Row>
      </Section>
      <Section label="Período">
        <Row label="Período Ref."><input className="h-7 w-full rounded border border-border/50 bg-background px-2 text-xs" placeholder="auto"
          value={block.periodoRef ?? ""} onChange={(e) => onChange({ periodoRef: e.target.value || null })} /></Row>
        <Row label="Período Comp."><input className="h-7 w-full rounded border border-border/50 bg-background px-2 text-xs" placeholder="auto (último)"
          value={block.periodoComp ?? ""} onChange={(e) => onChange({ periodoComp: e.target.value || null })} /></Row>
      </Section>
      <OmniFiltersSection block={block} onChange={onChange as (p: Partial<OmniBaseBlock>) => void} />
    </div>
  );
}

/** ABC Curva */
function OmniAbcCurvaInspector({ block, onChange }: {
  block: OmniAbcCurvaBlock;
  onChange: (p: Partial<OmniAbcCurvaBlock>) => void;
}) {
  return (
    <div className="space-y-2">
      <OmniTitleSection showTitle={block.showTitle} title={block.title} defaultTitle="Curva ABC" onChange={onChange} />
      <Section label="Dados">
        <Row label="Dimensão">
          <SelectField value={block.dim} onChange={(v) => onChange({ dim: v as OmniDim })} options={OMNI_DIM_OPTIONS} />
        </Row>
        <Row label="Tabela">
          <ToggleField value={block.showTable} onChange={(v) => onChange({ showTable: v })} label="" />
        </Row>
      </Section>
      <OmniFiltersSection block={block} onChange={onChange as (p: Partial<OmniBaseBlock>) => void} />
    </div>
  );
}

/** Portfolio Matrix + generic dim/metric */
function OmniDimMetricInspector({ block, onChange, label }: {
  block: OmniBaseBlock & { dim: OmniDim };
  onChange: (p: Partial<OmniBaseBlock> & { dim?: OmniDim }) => void;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <OmniTitleSection showTitle={block.showTitle} title={block.title} defaultTitle={label} onChange={onChange} />
      <Section label="Dados">
        <Row label="Dimensão">
          <SelectField value={block.dim} onChange={(v) => onChange({ dim: v as OmniDim })} options={OMNI_DIM_OPTIONS} />
        </Row>
        <Row label="Métrica">
          <SelectField value={block.metric} onChange={(v) => onChange({ metric: v as OmniMetric })} options={OMNI_METRIC_OPTIONS} />
        </Row>
      </Section>
      <OmniFiltersSection block={block} onChange={onChange as (p: Partial<OmniBaseBlock>) => void} />
    </div>
  );
}
