// CustomSlideEditor ? canvas WYSIWYG para o slide "Personalizado".
// Drag + resize unificado com suporte a rotação. Snap-to-grid de 10px com guias de alinhamento
// dinâmicas. Atalhos de teclado, registro do canvas para o exporter, menu
// de templates built-in / do usuário.

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback, type ReactNode } from "react";
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
  BarChart2, Hash, Map as MapIcon,
  Undo2, Redo2, Lock, Unlock, ChevronUp, ChevronsUp, ChevronsDown,
  AlignHorizontalJustifyCenter, AlignVerticalJustifyCenter,
  AlignStartHorizontal, AlignEndHorizontal,
  AlignStartVertical, AlignEndVertical,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
  Group as GroupIcon, Ungroup as UngroupIcon, Grid3x3,
  Play, Paintbrush, Search, Star, StickyNote,
  Eye, EyeOff, GripVertical, Loader2, Minus, MoreHorizontal,
  PanelRightClose,
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
  newBlock, newChartBlock, newPositivacaoChartBlock, BLOCK_LABELS, CHART_TYPE_LABELS,
  type CustomBlock, type CustomBlockKind, type CustomChartType, type CustomSlideConfig,
  type KpiBlock, type ChartBlock, type TopSkuBlock, type ShapeBlock, type TableBlock,
  type TitleBlock, type TextBlock, type DreBlock, type ImageBlock,
  isLineFamily,
  type ConditionalFormatMode, type ConditionalFormatRule, type TableGapColumn, type TableGapComparisonMode,
  type OmniBaseBlock,
  type OmniEvolucaoMensalBlock, type OmniHeatmapSazonalidadeBlock,
  type OmniHeroisOfensoresBlock, type OmniCanalTrendBlock, type OmniCanalMixBlock,
  type OmniCustoEvolucaoBlock, type OmniCustoComposicaoBlock, type OmniCustoPressaoBlock,
  type OmniPositivacaoBlock, type OmniUfMapBlock,
  type OmniPriceDecompBlock, type OmniBridgePvmBlock, type OmniFarolBlock,
  type OmniAbcCurvaBlock, type OmniPortfolioMatrixBlock, type OmniAbcBarsBlock,
  type OmniMetric, type OmniDim, type OmniHeroesVariant, type OmniAbcSortBy,
} from "@/lib/customSlide";
import { LINES as DRE_LINES } from "@/components/pricing/DreTable";
import { Section, Row, ToggleField, NumberStepper, ColorField, Segmented, Slider, SelectField } from "./chart/Inspector";
import { MultiSelectFilter } from "@/components/pricing/MultiSelectFilter";
import { ShapeHandleOverlay } from "./ShapeHandleOverlay";
import { BlockRenderer, CUSTOM_TABLE_MEASURES, CUSTOM_TABLE_DIMS, TABLE_COLUMN_RESIZE_HANDLE_CANCEL_SELECTOR } from "./BlockRenderer";
import { SlideFilterProvider } from "./SlideFilterContext";
import { useMonthsInfo, useFyList } from "@/store/selectors";
import { cn } from "@/lib/utils";
import haraldFooterPng from "@/assets/harald-footer-bar.png";
import { registerCustomCanvas } from "@/lib/customCanvasRegistry";
import { saveUserTemplate } from "@/lib/customTemplates";
import { TemplatePicker } from "./templates/TemplatePicker";
import { ShapeInspector } from "./ShapeInspector";
import {
  BgField,
  BlockAppearanceControls,
  BlockSpecificEditor,
  BrandKitPopover,
  ClearFiltersToolbar,
  clientToCanvas,
  ComparePeriodField,
  DataSourceBadge,
  GroupOverlay,
  MultiSelectInspector,
  PaletteButton,
  PaletteGroup,
  PalettePopover,
  PositionInputs,
  QuickLayoutButton,
  TextStyleButton,
} from "./inspectors/BlockInspectors";
import { RotatableBlock } from "./RotatableBlock";
import { Slider as UiSlider } from "@/components/ui/slider";
import { applyTemplateDeckToSlidesFlow } from "./deckNavigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { resolveTableFit, tableHeightWithExtraRows, type FitInfo } from "@/lib/customCapacity";
import { usePricing } from "@/store/pricing";
import { useBudget } from "@/store/budget";
import { useForecast } from "@/store/forecast";
import { useRolling } from "@/store/rolling";
import { budgetRowsAsPricingFiltered } from "@/lib/budgetAdapter";
import { forecastRowsAsPricingLatest } from "@/lib/forecastAdapter";
import { rollingRowsAsPricing } from "@/lib/rollingAdapter";
import { warmSpeculativeChartPaletteData } from "@/lib/slideDeckPreparation";
import { getCachedRowsSignature } from "@/lib/slideCalcCache";
import { computePivot, type PivotConfig } from "@/lib/pivot";
import { buildUnifiedRows } from "@/lib/pivotData";
import type { Filters, PricingRow } from "@/lib/types";
import { BlockFilters } from "./BlockFilters";
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
  ContextMenuSeparator, ContextMenuShortcut,
} from "@/components/ui/context-menu";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { SLIDE_HEX, SLIDE_PPT_HEX, SLIDE_RGBA } from "@/lib/slideColors";
import {
  getSourceFooterText,
  type SourceRowsByDataSource,
} from "@/lib/customSlideSourceFooter";

function SlideSourceFooterEditor({
  config,
  rowsBySource,
  readOnly,
}: {
  config: CustomSlideConfig;
  rowsBySource: SourceRowsByDataSource;
  readOnly: boolean;
}) {
  const text = getSourceFooterText(config, rowsBySource);
  if (!text && config.sourceFooter?.mode !== "manual") return null;

  const mode = config.sourceFooter?.mode ?? "auto";
  const manualText = config.sourceFooter?.manualText ?? "";
  const footerColor = config.showHaraldFooter ? SLIDE_HEX.white : SLIDE_HEX.slate500;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={readOnly}
          title={readOnly ? text : "Editar fonte de dados do rodape"}
          aria-label="Fonte de dados do slide"
          style={{
            position: "absolute",
            left: 40,
            bottom: config.showHaraldFooter ? 13 : 18,
            maxWidth: 720,
            zIndex: SLIDE_SOURCE_FOOTER_Z_INDEX,
            border: 0,
            background: "transparent",
            padding: 0,
            margin: 0,
            color: footerColor,
            fontFamily: "Calibri, sans-serif",
            fontSize: 11,
            fontStyle: "italic",
            fontWeight: 700,
            lineHeight: 1.1,
            textAlign: "left",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            cursor: readOnly ? "default" : "pointer",
            pointerEvents: readOnly ? "none" : "auto",
          }}
        >
          {text || "Fonte: "}
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-80 space-y-3">
        <div>
          <p className="text-sm font-semibold">Fonte do rodape</p>
          <p className="text-xs text-muted-foreground">Use o texto automatico ou escreva uma fonte personalizada para este slide.</p>
        </div>
        <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
          <span className="text-xs font-medium">Automatico</span>
          <Switch
            checked={mode === "auto"}
            onCheckedChange={(checked) => {
              setSourceFooterAction(checked
                ? { mode: "auto" }
                : { mode: "manual", manualText: text });
            }}
          />
        </div>
        {mode === "manual" ? (
          <div className="space-y-1.5">
            <Label className="text-xs">Texto manual</Label>
            <DraftInput
              value={manualText}
              onCommit={(value) => setSourceFooterAction({ mode: "manual", manualText: value })}
              placeholder="Ex.: Fonte: KE30 - Abr/25 a Mar/26"
            />
          </div>
        ) : (
          <div className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
            {text || "Nenhuma fonte detectada nos blocos deste slide."}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
import {
  useEditorBinding, useUndoRedoState,
  addBlockAction, addChartBlockAction, deleteBlockAction, duplicateBlockAction,
  patchBlockAction, bringForwardAction, sendBackAction, bringToFrontAction,
  sendToBackAction, toggleLockAction,
  setShowHaraldFooter as setShowHaraldFooterAction,
  setBackground as setBackgroundAction,
  setSpeakerNotesAction,
  setSourceFooterAction,
  useSelection, selectBlock, setSelection, clearSelection,
  selectAllOnSlide, enterGroupEdit, exitGroupEdit,
  deleteBlocksAction, duplicateBlocksAction,
  patchBlocksAction, nudgeBlocksAction,
  alignBlocksAction, groupBlocksAction, ungroupBlocksAction,
  resizeGroupAction,
  copyElementStyleAction, pasteElementStyleAction, canPasteElementStyleAction,
  insertBlockAction, insertBlocksAction,
  undo as undoAction, redo as redoAction,
  type AlignKind,
} from "./editorStore";
import type { GridSize } from "./editorPrefs";
import { useSlideEditorScale } from "./useSlideEditorScale";
import { getTheme } from "@/lib/slideThemes";
import { groupBounds } from "./canvas/alignmentGuides";
import { PresentationMode } from "./PresentationMode";
import { InlineTextEditor, InlineTextToolbar } from "./InlineTextEditor";
import { DraftInput, DraftNumberInput, DraftTextarea } from "./DraftInput";
import { AssetLibrary } from "./AssetLibrary";
import { Pencil, Images, HelpCircle, Keyboard, TrendingUp, Gauge, Zap, Activity, PanelTop, Sparkles, Target, ListChecks } from "lucide-react";
import { BlockRotationHandle, TRANSFORM_BLEED, useBlockTransform } from "./blockTransform";
import {
  SLIDE_BRAND_STYLES,
} from "@/lib/slideBrandKit";
import { isSlidePerfEnabled, markSlidePerf, measureSlidePerf, recordSlidePerfEvent, recordSlideRender } from "@/lib/slidesPerfCounters";

// Cross-slide clipboard. Module-level so it survives editor remounts when
// the user navigates between slides via the side strip.
let crossSlideClipboard: CustomBlock | null = null;

type Icon = React.ComponentType<{ className?: string }>;
const PALETTE_RECENTS_KEY = "omni4.customSlide.paletteRecents";
const PALETTE_FAVORITES_KEY = "omni4.customSlide.paletteFavorites";
const SLIDE_SOURCE_FOOTER_Z_INDEX = 2147483647;
const SPECULATIVE_CHART_WARM_MAX = 10;
type PaletteCategory = "favorites" | "models" | "charts" | "elements" | "story" | "omni" | "assets";
type PalettePanelSide = "right" | "left";

function localId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function asNewBlockGroup(blocks: CustomBlock[]): CustomBlock[] {
  const groupId = localId();
  return blocks.map((block) => ({ ...block, groupId }) as CustomBlock);
}

function normalizePaletteText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// Group 1 ? Charts (and chart-like data viz: KPI Card + Table + Bridge)
const CHART_PALETTE: ({ id: string; label: string; icon: Icon } & (
  | { kind: "chart"; chartType: CustomChartType; preset?: "positivacao" }
  | { kind: Exclude<CustomBlockKind, "chart"> }
))[] = [
  { id: "line",          kind: "chart", chartType: "line",          label: "Linha",            icon: LineChartIcon },
  { id: "positivacao",   kind: "chart", chartType: "line",          label: "Positivação",      icon: LineChartIcon, preset: "positivacao" },
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
  { id: "mapaBrasil",    kind: "chart", chartType: "mapaBrasil",    label: "Mapa do Brasil",   icon: MapIcon },
  { id: "radar",         kind: "chart", chartType: "radar",         label: "Radar",            icon: RadarIcon },
  { id: "boxplot",       kind: "chart", chartType: "boxplot",       label: "Caixa",            icon: BoxIcon },
  { id: "histogram",     kind: "chart", chartType: "histogram",     label: "Histograma",       icon: BarChart2 },
  { id: "waterfall",     kind: "chart", chartType: "waterfall",     label: "Bridge",           icon: GitBranch },
  { id: "table",         kind: "table", label: "Tabela",                                       icon: TableIcon },
  { id: "kpi",           kind: "kpi",   label: "KPI Card",                                     icon: Hash },
];

// Group 2 ? Visual elements
const ELEMENT_PALETTE: { id: string; kind: CustomBlockKind; label: string; icon: Icon }[] = [
  { id: "title",  kind: "title",  label: "Título",      icon: TypeIcon },
  { id: "text",   kind: "text",   label: "Texto",       icon: AlignLeft },
  { id: "image",  kind: "image",  label: "Imagem",      icon: ImageIcon },
  { id: "shape",  kind: "shape",  label: "Forma",       icon: Square },
  { id: "topSku", kind: "topSku", label: "Top Ranking", icon: Trophy },
  { id: "dre",    kind: "dre",    label: "DRE",         icon: TableIcon },
];

// Group 3 ? Omni Analytics
type OmniPaletteEntry = { id: string; kind: CustomBlockKind; label: string; icon: Icon; group: string };
const OMNI_PALETTE: OmniPaletteEntry[] = [
  // Visão Geral
  { id: "omni_evolucao_mensal",      kind: "omni_evolucao_mensal",      label: "Evolução Mensal",      icon: TrendingUp,        group: "Visão Geral" },
  { id: "omni_positivacao",          kind: "omni_positivacao",          label: "Positivação",          icon: LineChartIcon,     group: "Visão Geral" },
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
  { id: "omni_uf_map",               kind: "omni_uf_map",               label: "Mapa por UF",           icon: Network,           group: "Preço" },
  { id: "omni_bridge_pvm",           kind: "omni_bridge_pvm",           label: "Bridge PVM",            icon: GitBranch,         group: "Preço" },
  // ABC / Farol
  { id: "omni_farol",                kind: "omni_farol",                label: "Farol Positivação",     icon: Gauge,             group: "ABC/Farol" },
  { id: "omni_abc_curva",            kind: "omni_abc_curva",            label: "Curva ABC",             icon: Network,           group: "ABC/Farol" },
  { id: "omni_portfolio_matrix",     kind: "omni_portfolio_matrix",     label: "Matriz Portfólio",      icon: ScatterIcon,       group: "ABC/Farol" },
  { id: "omni_abc_bars",             kind: "omni_abc_bars",             label: "Barras ABC",            icon: BarChartHorizontal, group: "ABC/Farol" },
];
const OMNI_GROUPS = ["Visão Geral", "Canais", "Custos", "Preço", "ABC/Farol"] as const;

interface Props {
  /** ID estável do slide ? usado para registrar o canvas no exporter */
  slideId?: string;
  config: CustomSlideConfig;
  onChange: (next: CustomSlideConfig) => void;
  readOnly?: boolean;
  /** True when the Slides workspace is kept alive but hidden in standby. */
  isStandby?: boolean;
  onMinimize?: () => void;
}

function areCustomSlideEditorPropsEqual(prev: Props, next: Props): boolean {
  return prev.slideId === next.slideId
    && prev.config === next.config
    && prev.readOnly === next.readOnly
    && prev.isStandby === next.isStandby
    && prev.onMinimize === next.onMinimize;
}

export const CustomSlideEditor = memo(function CustomSlideEditor({
  slideId,
  config,
  onChange,
  readOnly = false,
  isStandby = false,
  onMinimize,
}: Props) {
  if (isSlidePerfEnabled()) recordSlideRender("CustomSlideEditor", slideId);
  // Bind the parent's config <-> internal Zustand+temporal store first so
  // selection store reflects the right slide on initial render.
  useEditorBinding(config, onChange, slideId);
  const undoRedo = useUndoRedoState();
  const { selectedIds, groupEditMemberId } = useSelection();
  const pricingRows = usePricing((s) => s.rows);
  const budgetRows = useBudget((s) => s.rows);
  const forecastRows = useForecast((s) => s.rows);
  const rollingRows = useRolling((s) => s.rows);
  const sourceFooterRows = useMemo<SourceRowsByDataSource>(() => ({
    ke30: pricingRows,
    budget: budgetRowsAsPricingFiltered(budgetRows, "budget"),
    budget_real: budgetRowsAsPricingFiltered(budgetRows, "real"),
    forecast: forecastRowsAsPricingLatest(forecastRows),
    rolling: rollingRowsAsPricing(rollingRows),
  }), [pricingRows, budgetRows, forecastRows, rollingRows]);
  useEffect(() => {
    if (!isSlidePerfEnabled()) return;
    recordSlidePerfEvent("slides.customEditor.commit", {
      slideId,
      blockCount: config.blocks.length,
      chartCount: config.blocks.filter((block) => block.kind === "chart").length,
      selectedCount: selectedIds.length,
    });
  });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasShellRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const paletteRailRef = useRef<HTMLDivElement>(null);
  const inspectorStyleRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);
  const speculativeChartWarmSignaturesRef = useRef<Set<string>>(new Set());
  const { prefs, scale, scaleKey } = useSlideEditorScale(wrapperRef, canvasShellRef);
  const [presentOpen, setPresentOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [showLayers, setShowLayers] = useState(false);
  const [zoomEditing, setZoomEditing] = useState(false);
  const [palettePanelOpen, setPalettePanelOpen] = useState(false);
  const [activePaletteCategory, setActivePaletteCategory] = useState<PaletteCategory>("models");
  const [palettePanelSide, setPalettePanelSide] = useState<PalettePanelSide>("right");
  const [templateApplying, setTemplateApplying] = useState(false);
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
  const [fileDragOverCanvas, setFileDragOverCanvas] = useState(false);
  const [spacePanActive, setSpacePanActive] = useState(false);
  const [canvasPanning, setCanvasPanning] = useState(false);
  const [styleFocusRequest, setStyleFocusRequest] = useState(0);
  const [stylePanelHighlight, setStylePanelHighlight] = useState(false);

  // Marquee selection rectangle (canvas-space coords).
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const fileDragDepthRef = useRef(0);
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
  const openPaletteCategory = useCallback((category: PaletteCategory) => {
    setActivePaletteCategory(category);
    setPalettePanelOpen((open) => !(open && activePaletteCategory === category));
  }, [activePaletteCategory]);

  useLayoutEffect(() => {
    if (!palettePanelOpen) return;
    const updateSide = () => {
      const rail = paletteRailRef.current;
      if (!rail) return;
      const rect = rail.getBoundingClientRect();
      const panelWidth = 260;
      const gap = 8;
      const margin = 12;
      const fitsRight = rect.right + gap + panelWidth <= window.innerWidth - margin;
      const fitsLeft = rect.left - gap - panelWidth >= margin;
      setPalettePanelSide(fitsRight || !fitsLeft ? "right" : "left");
    };
    updateSide();
    window.addEventListener("resize", updateSide);
    return () => window.removeEventListener("resize", updateSide);
  }, [palettePanelOpen, activePaletteCategory]);

  useEffect(() => {
    if (!slideId) return;
    registerCustomCanvas(slideId, canvasRef.current);
    return () => registerCustomCanvas(slideId, null);
  }, [slideId]);

  scaleRef.current = scale;

  const selected = selectedIds.length === 1
    ? (config.blocks.find((b) => b.id === selectedIds[0]) ?? null)
    : null;
  const multiSelected = selectedIds.length > 1
    ? config.blocks.filter((b) => selectedIds.includes(b.id))
    : [];
  const selectedIsSinglePersistedGroup = (() => {
    if (multiSelected.length < 2) return false;
    const groupIds = Array.from(new Set(multiSelected.map((b) => b.groupId).filter(Boolean)));
    if (groupIds.length !== 1) return false;
    const group = (config.groups ?? []).find((g) => g.id === groupIds[0]);
    if (!group || group.memberIds.length !== selectedIds.length) return false;
    const selectedSet = new Set(selectedIds);
    return group.memberIds.every((id) => selectedSet.has(id));
  })();
  const multiSelectionBounds = multiSelected.length >= 2 ? groupBounds(multiSelected) : null;
  const notifyReadOnly = useCallback(() => {
    toast.info("Modo somente leitura");
  }, []);
  const canEdit = useCallback(() => {
    if (!readOnly) return true;
    notifyReadOnly();
    return false;
  }, [notifyReadOnly, readOnly]);
  const focusSelectedBlockStyle = useCallback(() => {
    setStyleFocusRequest(Date.now());
  }, []);
  useEffect(() => {
    if (!styleFocusRequest || !selected) return;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let rafId = 0;
    const focusStylePanel = () => {
      const scope = inspectorStyleRef.current;
      if (!scope) return;
      const target = scope.querySelector<HTMLElement>("[data-style-panel-target='true']") ?? scope;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      setStylePanelHighlight(true);
      const focusable = target.querySelector<HTMLElement>(
        "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]):not([data-inspector-section-toggle='true']), [tabindex]:not([tabindex='-1'])",
      );
      focusable?.focus({ preventScroll: true });
      timeoutId = window.setTimeout(() => setStylePanelHighlight(false), 1000);
    };
    rafId = window.requestAnimationFrame(() => {
      rafId = window.requestAnimationFrame(focusStylePanel);
    });
    return () => {
      window.cancelAnimationFrame(rafId);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [selected, styleFocusRequest]);
  const handleUndo = useCallback(() => {
    undoAction();
  }, []);
  const handleRedo = useCallback(() => {
    redoAction();
  }, []);
  const maxBlockZ = useCallback(() => (
    config.blocks.reduce((max, block) => Math.max(max, block.z), 0)
  ), [config.blocks]);
  const updateBlock = useCallback((id: string, patch: Partial<CustomBlock>) => {
    if (!canEdit()) return;
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
  }, [canEdit]);

  const blockTransformActions = useMemo(() => ({
    canEdit,
    insertBlocks: insertBlocksAction,
    maxBlockZ,
    patchBlocks: patchBlocksAction,
    resizeGroup: resizeGroupAction,
    selectBlock,
    setSelection,
    updateBlock,
  }), [canEdit, maxBlockZ, updateBlock]);
  const blockTransform = useBlockTransform({
    blocks: config.blocks,
    groups: config.groups,
    selectedIds,
    groupEditMemberId,
    gridEnabled: prefs.gridEnabled,
    gridSize: prefs.gridSize,
    actions: blockTransformActions,
  });
  const { guides, clearGuides } = blockTransform;

  const fitImageToCanvas = useCallback((naturalW: number, naturalH: number, anchor?: { x: number; y: number }, offset = 0) => {
    const maxW = CANVAS_W * 0.62;
    const maxH = (CANVAS_H - FOOTER_H) * 0.68;
    const safeW = Math.max(1, naturalW || 600);
    const safeH = Math.max(1, naturalH || 400);
    const ratio = Math.min(maxW / safeW, maxH / safeH, 1);
    const w = Math.max(120, Math.round(safeW * ratio));
    const h = Math.max(80, Math.round(safeH * ratio));
    const centeredX = Math.round((CANVAS_W - w) / 2);
    const centeredY = Math.round((CANVAS_H - FOOTER_H - h) / 2);
    const x = anchor ? Math.round(anchor.x - w / 2 + offset) : centeredX;
    const y = anchor ? Math.round(anchor.y - h / 2 + offset) : centeredY;
    return {
      w,
      h,
      x: Math.max(0, Math.min(CANVAS_W - w, x)),
      y: Math.max(0, Math.min(CANVAS_H - h, y)),
    };
  }, []);

  const readImageBounds = useCallback((src: string, anchor?: { x: number; y: number }, offset = 0) =>
    new Promise<{ w: number; h: number; x: number; y: number }>((resolve) => {
      const img = new window.Image();
      img.onload = () => resolve(fitImageToCanvas(img.naturalWidth, img.naturalHeight, anchor, offset));
      img.onerror = () => resolve(fitImageToCanvas(600, 400, anchor, offset));
      img.src = src;
    }), [fitImageToCanvas]);

  const readFileAsDataUrl = useCallback((file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    }), []);

  const isImageFile = useCallback((file: File) => (
    file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name)
  ), []);

  const insertImageFiles = useCallback(async (files: File[], anchor?: { x: number; y: number }) => {
    if (!canEdit() || files.length === 0) return;
    const imageFiles = files.filter(isImageFile);
    const rejected = files.length - imageFiles.length;
    if (rejected > 0) {
      toast.warning(rejected === 1
        ? "O arquivo arrastado não é uma imagem."
        : `${rejected} arquivos ignorados porque não são imagens.`);
    }
    if (imageFiles.length === 0) return;

    try {
      const blocks = await Promise.all(imageFiles.map(async (file, index) => {
        const src = await readFileAsDataUrl(file);
        const bounds = await readImageBounds(src, anchor, index * 18);
        return {
          id: crypto.randomUUID(),
          kind: "image",
          z: 1,
          src,
          fit: "contain",
          ...bounds,
        } as ImageBlock;
      }));
      const ids = insertBlocksAction(blocks as CustomBlock[], imageFiles.length > 1 ? "Inserir imagens" : "Inserir imagem");
      if (ids.length > 0) setSelection(ids);
      toast.success(imageFiles.length === 1
        ? "Imagem inserida no slide."
        : `${imageFiles.length} imagens inseridas no slide.`);
    } catch {
      toast.error("Não foi possível inserir a imagem arrastada.");
    }
  }, [canEdit, insertBlocksAction, isImageFile, readFileAsDataUrl, readImageBounds, setSelection]);

  const insertImageDataUrl = useCallback(async (src: string, anchor?: { x: number; y: number }) => {
    if (!canEdit()) return;
    const bounds = await readImageBounds(src, anchor);
    const block: ImageBlock = {
      id: crypto.randomUUID(),
      kind: "image",
      z: 1,
      src,
      fit: "contain",
      ...bounds,
    };
    const id = insertBlockAction(block, "Colar imagem");
    if (id) setSelection([id]);
  }, [canEdit, insertBlockAction, readImageBounds, setSelection]);

  const addBlock = useCallback((kind: CustomBlockKind) => {
    if (!canEdit()) return;
    const perfEnabled = isSlidePerfEnabled();
    const startMark = perfEnabled ? `slides:addBlockClick:${performance.now()}` : "";
    if (perfEnabled) markSlidePerf(startMark);
    const id = addBlockAction(kind);
    if (id) setSelection([id]);
    if (perfEnabled) {
      measureSlidePerf("slides.addBlock.clickToReturn", startMark, undefined, {
        kind,
        blockId: id ?? undefined,
        mode: "local",
        previousBlockCount: config.blocks.length,
      });
    }
  }, [canEdit, config.blocks.length]);
  const addChart = useCallback((chartType: CustomChartType, preset?: "positivacao") => {
    if (!canEdit()) return;
    const perfEnabled = isSlidePerfEnabled();
    const startMark = perfEnabled ? `slides:addChartClick:${performance.now()}` : "";
    if (perfEnabled) markSlidePerf(startMark);
    const id = preset === "positivacao"
      ? insertBlockAction(newPositivacaoChartBlock(0) as CustomBlock)
      : addChartBlockAction(chartType);
    if (id) setSelection([id]);
    if (perfEnabled) {
      measureSlidePerf("slides.addChart.clickToReturn", startMark, undefined, {
        chartType,
        preset,
        blockId: id ?? undefined,
        mode: "local",
        previousBlockCount: config.blocks.length,
      });
    }
  }, [canEdit, config.blocks.length]);
  const insertTextStyle = useCallback((styleId: string, text: string, x: number, y: number, w: number, h: number) => {
    if (!canEdit()) return;
    const style = SLIDE_BRAND_STYLES.find((item) => item.id === styleId);
    const block = {
      ...(newBlock("text", 0) as TextBlock),
      id: localId(),
      x, y, w, h,
      text,
      ...(style?.patch ?? {}),
    } as TextBlock;
    const id = insertBlockAction(block as CustomBlock, "Adicionar bloco");
    if (id) setSelection([id]);
  }, [canEdit]);
  const insertQuickLayout = useCallback((layout: "kpis" | "chartInsight" | "table" | "heroNumber" | "bridgeComment") => {
    if (!canEdit()) return;
    const title = (text: string, x: number, y: number, w: number, h: number, size = 34) => ({
      ...(newBlock("title", 0) as TitleBlock),
      id: localId(), x, y, w, h, text, size, bold: true, color: SLIDE_PPT_HEX.chart1, align: "left",
    }) as CustomBlock;
    const text = (content: string, x: number, y: number, w: number, h: number, size = 18) => ({
      ...(newBlock("text", 0) as TextBlock),
      id: localId(), x, y, w, h, text: content, size, color: "475569", lineHeight: 1.3,
    }) as CustomBlock;
    const kpi = (label: string, measure: KpiBlock["measure"], x: number) => ({
      ...(newBlock("kpi", 0) as KpiBlock),
      id: localId(), x, y: 155, w: 285, h: 145, label, measure, periodMode: "all", valueSize: 34,
    }) as CustomBlock;
    const shape = (x: number, y: number, w: number, h: number, fill = "F8FAFC") => ({
      ...(newBlock("shape", 0) as ShapeBlock),
      id: localId(), x, y, w, h, shape: "roundRect", fill, strokeColor: "E2E8F0", strokeWidth: 1, radius: 14, shadowEnabled: true,
    }) as CustomBlock;
    const chart = (x: number, y: number, w: number, h: number, chartType: CustomChartType = "line") => ({
      ...(newChartBlock(chartType, 0) as ChartBlock),
      id: localId(), x, y, w, h, title: "Evolucao do indicador", measure: "cmPct",
    }) as CustomBlock;
    const table = () => ({
      ...(newBlock("table", 0) as TableBlock),
      id: localId(), x: 60, y: 150, w: 1210, h: 500, title: "Tabela executiva", rowDims: ["categoria"], measures: ["rol_real", "cm_real", "cmPct_real"],
    }) as CustomBlock;

    const blocksByLayout: Record<typeof layout, CustomBlock[]> = {
      kpis: [
        title("Titulo da analise", 60, 45, 940, 60),
        kpi("ROL", "rol", 60),
        kpi("CM%", "cmPct", 370),
        kpi("Volume", "volume", 680),
        kpi("MB%", "mbPct", 990),
      ],
      chartInsight: [
        title("Evolucao e insight", 60, 45, 940, 60),
        chart(60, 145, 770, 500, "line"),
        shape(870, 145, 390, 250, "FFF7F8"),
        text("Insight executivo\n\nExplique a causa, impacto e proxima acao.", 900, 180, 330, 170, 20),
      ],
      table: [
        title("Tabela executiva", 60, 45, 940, 60),
        table(),
      ],
      heroNumber: [
        title("Numero em destaque", 60, 45, 940, 60),
        shape(80, 165, 520, 330, "FFF1F2"),
        text("R$ 0,0 mi", 120, 220, 440, 110, 62),
        text("Resumo do principal indicador e leitura executiva.", 125, 345, 410, 80, 22),
      ],
      bridgeComment: [
        title("Bridge de margem", 60, 45, 940, 60),
        { ...(newBlock("omniBridgePvm", 0) as OmniBridgePvmBlock), id: localId(), x: 60, y: 145, w: 790, h: 500 } as CustomBlock,
        shape(890, 145, 360, 260, "F8FAFC"),
        text("Comentario\n\nDestaque os principais ofensores e alavancas.", 920, 180, 300, 160, 20),
      ],
    };
    const ids = insertBlocksAction(blocksByLayout[layout], "Adicionar layout rapido");
    if (ids.length > 0) setSelection(ids);
  }, [canEdit]);
  const addInsightCard = () => {
    const x = 60;
    const y = 150;
    const blocks = asNewBlockGroup([
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
        color: SLIDE_PPT_HEX.chart1,
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
    ]);
    const ids = insertBlocksAction(blocks, "Adicionar bloco");
    if (ids.length > 0) {
      setSelection(ids);
    }
  };
  const addExecutiveSummaryCard = () => {
    const x = 60;
    const y = 90;
    const blocks = asNewBlockGroup([
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
        color: SLIDE_PPT_HEX.chart1,
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
    ]);
    const ids = insertBlocksAction(blocks, "Adicionar bloco");
    if (ids.length > 0) {
      setSelection(ids);
    }
  };
  const addDecisionCard = () => {
    const x = 610;
    const y = 150;
    const blocks = asNewBlockGroup([
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
    ]);
    const ids = insertBlocksAction(blocks, "Adicionar bloco");
    if (ids.length > 0) {
      setSelection(ids);
    }
  };
  const addRiskOpportunityCard = () => {
    const x = 60;
    const y = 420;
    const blocks = asNewBlockGroup([
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
    ]);
    const ids = insertBlocksAction(blocks, "Adicionar bloco");
    if (ids.length > 0) {
      setSelection(ids);
    }
  };
  const removeBlock = useCallback((id: string) => {
    if (!canEdit()) return;
    deleteBlockAction(id);
    if (selectedIds.includes(id)) clearSelection();
  }, [canEdit, selectedIds]);
  const duplicateBlock = useCallback((id: string) => {
    if (!canEdit()) return;
    const newId = duplicateBlockAction(id);
    if (newId) setSelection([newId]);
  }, [canEdit]);
  const removeBlocks = useCallback((ids: string[]) => {
    if (!canEdit() || ids.length === 0) return;
    deleteBlocksAction(ids);
  }, [canEdit]);
  const duplicateBlocks = useCallback((ids: string[]) => {
    if (!canEdit() || ids.length === 0) return;
    duplicateBlocksAction(ids);
  }, [canEdit]);
  const bringForward = useCallback((id: string) => { if (canEdit()) bringForwardAction(id); }, [canEdit]);
  const sendBack = useCallback((id: string) => { if (canEdit()) sendBackAction(id); }, [canEdit]);
  const bringToFront = useCallback((id: string) => { if (canEdit()) bringToFrontAction(id); }, [canEdit]);
  const sendToBack = useCallback((id: string) => { if (canEdit()) sendToBackAction(id); }, [canEdit]);
  const toggleLock = useCallback((id: string) => { if (canEdit()) toggleLockAction(id); }, [canEdit]);

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
    if (!canEdit()) return;
    rememberPaletteUse(id);
    action();
  }, [canEdit, rememberPaletteUse]);
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
  const isPaletteSearching = paletteSearch.trim().length > 0;
  const showPaletteCategory = useCallback((category: PaletteCategory) => (
    isPaletteSearching || activePaletteCategory === category
  ), [activePaletteCategory, isPaletteSearching]);
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
      onClick: () => { if (it.kind === "chart") addChart(it.chartType, it.preset); else addBlock(it.kind); },
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
  const recentPalette = isPaletteSearching
    ? []
    : recentPaletteIds
        .map((id) => paletteActions.find((it) => it.id === id))
        .filter((it): it is typeof paletteActions[number] => Boolean(it));
  const favoritePalette = isPaletteSearching
    ? []
    : favoritePaletteIds
        .map((id) => paletteActions.find((it) => it.id === id))
        .filter((it): it is typeof paletteActions[number] => Boolean(it));
  const visibleStorytellingPalette = storytellingPalette.filter((it) => matchesPalette(it.label, it.keywords));
  const visibleChartPalette = CHART_PALETTE.filter((it) => matchesPalette(it.label, it.id, it.kind));
  const visibleElementPalette = ELEMENT_PALETTE.filter((it) => matchesPalette(it.label, it.id, it.kind));
  const visibleOmniPalette = OMNI_PALETTE.filter((it) => matchesPalette(it.label, it.id, it.group));
  const chartWarmDataSignature = useMemo(() => [
    slideId,
    getCachedRowsSignature(pricingRows),
    getCachedRowsSignature(budgetRows),
    getCachedRowsSignature(forecastRows),
    getCachedRowsSignature(rollingRows),
  ].join("|"), [slideId, pricingRows, budgetRows, forecastRows, rollingRows]);
  useEffect(() => {
    if (isStandby || !palettePanelOpen || activePaletteCategory !== "charts" || visibleChartPalette.length === 0) return;
    if (speculativeChartWarmSignaturesRef.current.has(chartWarmDataSignature)) return;
    speculativeChartWarmSignaturesRef.current.add(chartWarmDataSignature);
    let cancelled = false;
    const yieldToUi = () => new Promise<void>((resolve) => {
      window.setTimeout(resolve, 0);
    });
    void (async () => {
      try {
        await warmSpeculativeChartPaletteData({
          slideId,
          maxCharts: SPECULATIVE_CHART_WARM_MAX,
          onChart: async () => {
            await yieldToUi();
            if (cancelled) throw new Error("cancelled");
          },
        });
      } catch {
        // Speculative warming is best-effort; a failed worker/cache fill should never affect editing.
      }
    })();
    return () => { cancelled = true; };
  }, [activePaletteCategory, chartWarmDataSignature, isStandby, palettePanelOpen, slideId, visibleChartPalette.length]);
  const hasPaletteResults = isPaletteSearching
    ? visibleStorytellingPalette.length > 0
      || visibleChartPalette.length > 0
      || visibleElementPalette.length > 0
      || visibleOmniPalette.length > 0
    : activePaletteCategory === "models"
      || activePaletteCategory === "assets"
      || (activePaletteCategory === "favorites" && (favoritePalette.length > 0 || recentPalette.length > 0))
      || (activePaletteCategory === "charts" && visibleChartPalette.length > 0)
      || activePaletteCategory === "elements"
      || (activePaletteCategory === "story" && visibleStorytellingPalette.length > 0)
      || (activePaletteCategory === "omni" && visibleOmniPalette.length > 0);

  // Helpers for clipboard + alignment shortcuts.
  const copySelectionToClipboard = useCallback((cut: boolean) => {
    if (selectedIds.length === 0) return;
    if (cut && !canEdit()) return;
    const blk = config.blocks.find((b) => b.id === selectedIds[0]);
    if (!blk) return;
    crossSlideClipboard = JSON.parse(JSON.stringify(blk)) as CustomBlock;
    if (cut) {
      if (selectedIds.length === 1) removeBlock(selectedIds[0]);
      else removeBlocks(selectedIds);
    } else {
      toast.success("Bloco copiado");
    }
  }, [canEdit, config.blocks, removeBlock, removeBlocks, selectedIds]);

  const pasteFromClipboard = useCallback(() => {
    if (!canEdit()) return;
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
    }
  }, [canEdit]);

  const centerSelectedH = useCallback(() => {
    if (!canEdit()) return;
    if (selectedIds.length !== 1) return;
    const b = config.blocks.find((x) => x.id === selectedIds[0]);
    if (!b) return;
    patchBlockAction(b.id, { x: Math.round((CANVAS_W - b.w) / 2) } as Partial<CustomBlock>, "Mover bloco");
  }, [canEdit, selectedIds, config.blocks]);

  const centerSelectedV = useCallback(() => {
    if (!canEdit()) return;
    if (selectedIds.length !== 1) return;
    const b = config.blocks.find((x) => x.id === selectedIds[0]);
    if (!b) return;
    patchBlockAction(b.id, { y: Math.round((CANVAS_H - b.h) / 2) } as Partial<CustomBlock>, "Mover bloco");
  }, [canEdit, selectedIds, config.blocks]);

  // Atalhos de teclado
  useEffect(() => {
    const isEditingTarget = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    };
    const onSpaceDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (inlineEditId || isEditingTarget(e.target)) return;
      e.preventDefault();
      setSpacePanActive(true);
    };
    const onSpaceUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      setSpacePanActive(false);
    };
    const onWindowBlur = () => {
      setSpacePanActive(false);
      setCanvasPanning(false);
    };
    window.addEventListener("keydown", onSpaceDown);
    window.addEventListener("keyup", onSpaceUp);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("keydown", onSpaceDown);
      window.removeEventListener("keyup", onSpaceUp);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [inlineEditId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inField = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      if (!inField && (e.metaKey || e.ctrlKey)) {
        const k = e.key.toLowerCase();
        if (k === "z" && !e.shiftKey) { e.preventDefault(); if (canEdit()) handleUndo(); return; }
        if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); if (canEdit()) handleRedo(); return; }
        if (k === "0") { e.preventDefault(); prefs.setZoom(1.0); return; }
        if (k === "a") { e.preventDefault(); selectAllOnSlide(); return; }
        if (k === "c" && !e.shiftKey) { e.preventDefault(); copySelectionToClipboard(false); return; }
        if (k === "x" && !e.shiftKey) { e.preventDefault(); copySelectionToClipboard(true); return; }
        // Ctrl/Cmd+V is handled by the native paste event so image clipboard
        // items from screenshots can be detected before falling back to blocks.
        if (k === "g" && !e.shiftKey) {
          e.preventDefault();
          if (!canEdit()) return;
          if (selectedIds.length >= 2) groupBlocksAction(selectedIds);
          return;
        }
        if (k === "g" && e.shiftKey) {
          e.preventDefault();
          if (!canEdit()) return;
          if (selectedIds.length > 0) ungroupBlocksAction(selectedIds);
          return;
        }
        if (e.shiftKey && k === "h") { e.preventDefault(); centerSelectedH(); return; }
        if (e.shiftKey && k === "v") { e.preventDefault(); centerSelectedV(); return; }
      }
      // F5 / Cmd+Shift+P ? presentation mode (works even with no selection).
      if (!inField && (e.key === "F5" || ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "p"))) {
        e.preventDefault();
        setPresentOpen(true);
        return;
      }
      // "?" ? open shortcuts dialog.
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
        if (!canEdit()) return;
        if (selectedIds.length === 1) removeBlock(selectedIds[0]);
        else removeBlocks(selectedIds);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (!canEdit()) return;
        if (selectedIds.length === 1) duplicateBlock(selectedIds[0]);
        else duplicateBlocks(selectedIds);
        return;
      }
      if (selectedIds.length === 1 && (e.metaKey || e.ctrlKey)) {
        if (e.shiftKey && e.key === "]") { e.preventDefault(); if (canEdit()) bringToFrontAction(selectedIds[0]); return; }
        if (e.shiftKey && e.key === "[") { e.preventDefault(); if (canEdit()) sendToBackAction(selectedIds[0]); return; }
        if (e.key === "]") { e.preventDefault(); bringForward(selectedIds[0]); return; }
        if (e.key === "[") { e.preventDefault(); sendBack(selectedIds[0]); return; }
      }

      // Arrow nudge ? works for single or multi. Shift = 40px, normal = 10px.
      const step = e.shiftKey ? 40 : 10;
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      if (dx !== 0 || dy !== 0) {
        e.preventDefault();
        if (!canEdit()) return;
        nudgeBlocksAction(
          selectedIds,
          dx, dy,
          selectedIds.length > 1 ? "Mover blocos" : "Mover bloco",
        );
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canEdit, selectedIds, groupEditMemberId, config.blocks, copySelectionToClipboard, pasteFromClipboard, centerSelectedH, centerSelectedV, prefs, removeBlock, removeBlocks, duplicateBlock, duplicateBlocks, bringForward, sendBack, handleUndo, handleRedo]);

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
      if (!imageItem) {
        if (crossSlideClipboard && canEdit()) {
          e.preventDefault();
          pasteFromClipboard();
        }
        return;
      }
      if (!canEdit()) return;

      e.preventDefault();
      const file = imageItem.getAsFile();
      if (!file) return;

      void readFileAsDataUrl(file)
        .then((dataUrl) => insertImageDataUrl(dataUrl))
        .then(() => toast.success("Imagem colada no slide."))
        .catch(() => toast.error("Não foi possível colar a imagem."));
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [canEdit, insertImageDataUrl, pasteFromClipboard, readFileAsDataUrl]);

  // Layers panel data
  const layersSorted = useMemo(
    () => [...config.blocks].sort((a, b) => b.z - a.z),
    [config.blocks],
  );
  const hiddenCount = config.blocks.filter((b) => b.hidden).length;
  const lockedCount = config.blocks.filter((b) => b.locked).length;
  const handleLayerDragEnd = useCallback((event: DragEndEvent) => {
    if (!canEdit()) return;
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
  }, [canEdit, layersSorted]);

  // Templates
  const [tplOpen, setTplOpen] = useState(false);
  const [saveTplOpen, setSaveTplOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [assetsOpen, setAssetsOpen] = useState(false);
  const refreshUserTpls = () => { /* picker reloads internally */ };

  return (
    <SlideFilterProvider slideKey={slideId}>
    <div className={cn("surface-base relative grid h-full min-h-0 gap-3", showLayers ? "grid-cols-[56px_240px_minmax(0,1fr)_380px]" : "grid-cols-[56px_minmax(0,1fr)_380px]")}>
      {templateApplying && (
        <div className="absolute inset-0 z-[99999999] flex items-center justify-center bg-background/55 backdrop-blur-sm">
          <div className="surface-overlay flex items-center gap-3 rounded-xl border border-border/60 px-4 py-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div>
              <div className="slides-type-section">Aplicando modelo</div>
              <div className="slides-type-helper">Atualizando blocos do canvas.</div>
            </div>
          </div>
        </div>
      )}
      {/* ====== Paleta ====== */}
      <div className="relative z-40 min-h-0">
        <div ref={paletteRailRef} className="surface-panel flex h-full flex-col items-center gap-1 rounded-lg border border-border/40 p-1.5">
          <TooltipProvider delayDuration={180}>
          {([
            { label: "Favoritos", icon: Star },
            { label: "Modelos", icon: BookOpen },
            { label: "Gráficos", icon: BarChart3 },
            { label: "Elementos", icon: Square },
            { label: "Story", icon: StickyNote },
            { label: "Omni", icon: LayersIcon },
            { label: "Assets", icon: Images },
          ]).map((item) => {
            const Icon = item.icon;
            const category: PaletteCategory = item.label === "Favoritos" ? "favorites"
              : item.label === "Modelos" ? "models"
              : item.label.startsWith("Gr") ? "charts"
              : item.label === "Elementos" ? "elements"
              : item.label === "Story" ? "story"
              : item.label === "Omni" ? "omni"
              : "assets";
            const isActive = palettePanelOpen && activePaletteCategory === category;
            return (
              <Tooltip key={item.label}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "relative flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                      isActive && "bg-primary/15 text-primary shadow-sm ring-1 ring-primary/25",
                    )}
                    onClick={() => openPaletteCategory(category)}
                    aria-label={`Abrir categoria ${item.label}`}
                    aria-pressed={isActive}
                  >
                    {isActive && <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-primary" aria-hidden="true" />}
                    <Icon className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          })}
          </TooltipProvider>
        </div>
        {palettePanelOpen && (
          <div
            className={cn(
              "surface-overlay absolute top-0 z-50 flex h-full w-[260px] max-w-[calc(100vw-24px)] flex-col rounded-lg border border-border/50",
              palettePanelSide === "right" ? "left-[calc(100%+8px)]" : "right-[calc(100%+8px)]",
            )}
          >
            <div className="flex items-center justify-between border-b border-border/40 px-3 py-2">
              <span className="slides-type-label">Blocos</span>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => setPalettePanelOpen(false)}
                aria-label="Fechar painel de blocos"
                title="Fechar painel de blocos"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-1 p-2">
          {showPaletteCategory("models") && !isPaletteSearching && (
            <>
              <div className="px-2 py-1 slides-type-label">
                Modelos
              </div>
              <Button size="sm" variant="outline" className="h-7 justify-start gap-2 slides-type-badge"
                onClick={() => { if (canEdit()) setTplOpen(true); }}
                disabled={readOnly}>
                <BookOpen className="h-3.5 w-3.5" /> Aplicar modelo
              </Button>
              <Button size="sm" variant="ghost" className="h-7 justify-start gap-2 slides-type-badge"
                onClick={() => setSaveTplOpen(true)}
                disabled={config.blocks.length === 0 || readOnly}>
                <Save className="h-3.5 w-3.5" /> Salvar como modelo
              </Button>
            </>
          )}
          {showPaletteCategory("assets") && !isPaletteSearching && (
            <>
              <div className="px-2 py-1 slides-type-label">
                Assets
              </div>
              <Button size="sm" variant="outline" className="h-7 justify-start gap-2 slides-type-badge"
                onClick={() => { if (canEdit()) setAssetsOpen(true); }}
                disabled={readOnly}>
                <Images className="h-3.5 w-3.5" /> Abrir biblioteca
              </Button>
            </>
          )}
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
            <div className="rounded-md border border-dashed border-border/70 p-3 text-center slides-type-helper">
              Nenhum bloco encontrado.
            </div>
          )}

          {showPaletteCategory("favorites") && favoritePalette.length > 0 && (
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

          {showPaletteCategory("favorites") && recentPalette.length > 0 && (
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

          {showPaletteCategory("models") && !isPaletteSearching && (
            <>
              <PaletteGroup title="Layouts rapidos" defaultOpen>
                <QuickLayoutButton label="Titulo + KPIs" description="Titulo executivo com quatro indicadores." onClick={() => insertQuickLayout("kpis")} />
                <QuickLayoutButton label="Grafico + insight" description="Grafico grande com caixa de leitura." onClick={() => insertQuickLayout("chartInsight")} />
                <QuickLayoutButton label="Tabela executiva" description="Titulo e tabela pronta para analise." onClick={() => insertQuickLayout("table")} />
                <QuickLayoutButton label="Numero em destaque" description="Hero number com comentario curto." onClick={() => insertQuickLayout("heroNumber")} />
                <QuickLayoutButton label="Bridge + comentario" description="Bridge PVM com bloco de narrativa." onClick={() => insertQuickLayout("bridgeComment")} />
              </PaletteGroup>
              <Separator className="my-2" />
            </>
          )}

          {showPaletteCategory("elements") && !isPaletteSearching && (
            <>
              <PaletteGroup title="Texto" defaultOpen>
                <TextStyleButton
                  label="Adicionar titulo"
                  className="text-[20px] font-bold text-primary"
                  onClick={() => insertTextStyle("text-executive-title", "Adicionar titulo", 80, 70, 760, 70)}
                />
                <TextStyleButton
                  label="Adicionar subtitulo"
                  className="text-[15px] font-semibold text-foreground"
                  onClick={() => insertTextStyle("text-support-copy", "Adicionar subtitulo", 80, 150, 700, 48)}
                />
                <TextStyleButton
                  label="Corpo de texto"
                  className="text-[12px] text-muted-foreground"
                  onClick={() => insertTextStyle("text-support-copy", "Corpo de texto", 80, 220, 560, 90)}
                />
              </PaletteGroup>
              <Separator className="my-2" />
            </>
          )}

          {showPaletteCategory("charts") && visibleChartPalette.length > 0 && (
            <>
              <PaletteGroup title="Gráficos" defaultOpen>
                {visibleChartPalette.map((it) => (
                  <PaletteButton
                    key={it.id}
                    icon={it.icon}
                    label={it.label}
                    onClick={() => runPaletteAction(`chart:${it.id}`, () => it.kind === "chart" ? addChart(it.chartType, it.preset) : addBlock(it.kind))}
                    favorite={favoritePaletteIds.includes(`chart:${it.id}`)}
                    onToggleFavorite={() => togglePaletteFavorite(`chart:${it.id}`)}
                  />
                ))}
              </PaletteGroup>
              <Separator className="my-2" />
            </>
          )}

          {showPaletteCategory("story") && visibleStorytellingPalette.length > 0 && (
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

          {showPaletteCategory("elements") && visibleElementPalette.length > 0 && (
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

          {showPaletteCategory("omni") && visibleOmniPalette.length > 0 && (
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
          {showPaletteCategory("models") && !isPaletteSearching && (
            <>
              <div className="px-2">
                <Label className="text-[10px] uppercase text-muted-foreground">Fundo do slide</Label>
                <BgField label="" value={config.background}
                  onChange={(v) => { if (canEdit()) setBackgroundAction(v); }} />
              </div>
              <div className="mt-2 flex items-center justify-between px-2 text-[11px]">
                <span className="text-muted-foreground">Faixa Harald</span>
                <Switch
                  checked={config.showHaraldFooter}
                  disabled={readOnly}
                  onCheckedChange={(v) => { if (canEdit()) setShowHaraldFooterAction(v); }}
                />
              </div>
            </>
          )}
          <p className="mt-2 px-2 text-[10px] leading-relaxed text-muted-foreground">
            Atalhos: <kbd>Ctrl+Z</kbd> desfazer · <kbd>Ctrl+Shift+Z</kbd> refazer · <kbd>Del</kbd> excluir · <kbd>Ctrl+D</kbd> duplicar · <kbd>Ctrl+]</kbd>/<kbd>Ctrl+[</kbd> ordem · <kbd>setas</kbd> mover (Shift = 10px)
          </p>
        </div>
      </ScrollArea>
          </div>
        )}
      </div>

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
                  disabled={readOnly}
                  onClick={() => {
                    if (!canEdit()) return;
                    patchBlocksAction(
                      config.blocks.filter((b) => b.hidden).map((b) => ({ id: b.id, patch: { hidden: false } as Partial<CustomBlock> })),
                      "Mostrar blocos",
                    );
                  }}
                >
                  <Eye className="h-3 w-3" /> Mostrar {hiddenCount}
                </Button>
              )}
              {lockedCount > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 gap-1 px-2 text-[10px]"
                  disabled={readOnly}
                  onClick={() => {
                    if (!canEdit()) return;
                    patchBlocksAction(
                      config.blocks.filter((b) => b.locked).map((b) => ({ id: b.id, patch: { locked: false } as Partial<CustomBlock> })),
                      "Desbloquear blocos",
                    );
                  }}
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
                        canEdit() && patchBlockAction(
                          blk.id,
                          { hidden: !blk.hidden } as Partial<CustomBlock>,
                          blk.hidden ? "Mostrar bloco" : "Ocultar bloco",
                        )
                      }
                      onToggleLock={() => toggleLock(blk.id)}
                      onToFront={() => bringToFront(blk.id)}
                      onToBack={() => sendToBack(blk.id)}
                      zIndex={blk.z}
                      onDelete={() => { if (canEdit()) deleteBlockAction(blk.id); }}
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
          className={cn(
            "continuous-corner-lg relative min-h-0 flex-1 overflow-auto border border-border/40 bg-secondary/20",
            spacePanActive && !canvasPanning && "cursor-grab",
            canvasPanning && "cursor-grabbing select-none",
          )}
          onMouseDownCapture={(e) => {
            if (!spacePanActive || e.button !== 0) return;
            const target = e.target as HTMLElement | null;
            if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
            e.preventDefault();
            e.stopPropagation();
            clearGuides();
            setMarquee(null);
            setCanvasPanning(true);
            const el = e.currentTarget;
            const startX = e.clientX;
            const startY = e.clientY;
            const startScrollLeft = el.scrollLeft;
            const startScrollTop = el.scrollTop;
            const move = (ev: MouseEvent) => {
              el.scrollLeft = startScrollLeft - (ev.clientX - startX);
              el.scrollTop = startScrollTop - (ev.clientY - startY);
            };
            const up = () => {
              window.removeEventListener("mousemove", move);
              window.removeEventListener("mouseup", up);
              window.removeEventListener("blur", up);
              setCanvasPanning(false);
            };
            window.addEventListener("mousemove", move);
            window.addEventListener("mouseup", up);
            window.addEventListener("blur", up);
          }}
          onMouseDown={(e) => {
            if (spacePanActive) return;
            // Marquee selection ? only if mousedown is on the wrapper itself
            // (i.e. canvas background, not a block handle / inspector).
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
            ref={canvasShellRef}
            className="relative"
            data-canvas-bg="true"
            style={{
              width: CANVAS_W * scale,
              height: CANVAS_H * scale,
              margin: "12px auto",
            }}
            onMouseEnter={() => setCanvasHovered(true)}
            onMouseLeave={() => {
              setCanvasHovered(false);
              setFileDragOverCanvas(false);
              fileDragDepthRef.current = 0;
            }}
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
              data-custom-slide-canvas="true"
              style={{
                width: CANVAS_W,
                height: CANVAS_H,
                background: config.background === "transparent" ? SLIDE_HEX.white : `#${config.background}`,
                backgroundImage: config.backgroundImage ? `url(${config.backgroundImage})` : undefined,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
                position: "relative",
                overflow: "hidden",
              }}
              onDragEnter={(e) => {
                if (e.dataTransfer.types.includes("Files")) {
                  fileDragDepthRef.current += 1;
                  setFileDragOverCanvas(true);
                }
              }}
              onDragLeave={(e) => {
                if (!e.dataTransfer.types.includes("Files")) return;
                fileDragDepthRef.current = Math.max(0, fileDragDepthRef.current - 1);
                if (fileDragDepthRef.current === 0) setFileDragOverCanvas(false);
              }}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes("application/x-slide-asset") || e.dataTransfer.types.includes("Files")) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                  if (e.dataTransfer.types.includes("Files")) setFileDragOverCanvas(true);
                }
              }}
              onDrop={(e) => {
                setFileDragOverCanvas(false);
                fileDragDepthRef.current = 0;
                if (readOnly) {
                  if (e.dataTransfer.types.includes("application/x-slide-asset") || e.dataTransfer.types.includes("Files")) {
                    e.preventDefault();
                  }
                  notifyReadOnly();
                  return;
                }
                const src = e.dataTransfer.getData("application/x-slide-asset");
                const pos = clientToCanvas(canvasRef.current, e.clientX, e.clientY, scaleRef.current);
                if (!src) {
                  const files = Array.from(e.dataTransfer.files ?? []);
                  if (files.length === 0) return;
                  e.preventDefault();
                  void insertImageFiles(files, pos ?? undefined);
                  return;
                }
                e.preventDefault();
                const id = addBlockAction("image");
                if (id) {
                  const w = 360, h = 220;
                  const x = pos ? Math.max(0, pos.x - w / 2) : 60;
                  const y = pos ? Math.max(0, pos.y - h / 2) : 60;
                  patchBlockAction(id, { src, w, h, x, y } as Partial<CustomBlock>, "Alterar dados");
                  setSelection([id]);
                }
              }}
            >
              {/* Paste-image hint ? shown when canvas is hovered with no selection */}
              {(fileDragOverCanvas || (canvasHovered && selectedIds.length === 0)) && (
                <div
                  data-edit-only="true"
                  style={{
                    position: "absolute", inset: 0, pointerEvents: "none", zIndex: 9998,
                    border: `2px solid ${fileDragOverCanvas ? "hsl(var(--primary))" : SLIDE_RGBA.editorSelectionBorder}`,
                    borderRadius: 2,
                    animation: "omni-paste-pulse 2s ease-in-out infinite",
                    background: fileDragOverCanvas ? "hsl(var(--primary) / 0.06)" : undefined,
                  }}
                >
                  <style>{`@keyframes omni-paste-pulse{0%,100%{border-color:hsl(var(--editor-selection) / 0.55)}50%{border-color:hsl(var(--editor-selection) / 0.15)}}`}</style>
                  <div style={{
                    position: "absolute", bottom: 10, left: "50%",
                    transform: "translateX(-50%)",
                    background: SLIDE_RGBA.editorSelectionBadge,
                    color: SLIDE_HEX.white, padding: "3px 10px",
                    borderRadius: 4, fontSize: 10, whiteSpace: "nowrap",
                    letterSpacing: "0.02em",
                  }}>
                    {fileDragOverCanvas ? "Solte para inserir imagem" : "Ctrl+V para colar imagem"}
                  </div>
                </div>
              )}
              {/* Snap-to-grid background ? dot pattern, behind blocks. */}
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

              {config.blocks.length === 0 && (
                <div
                  data-export-hide="true"
                  className="absolute inset-0 z-[2] flex items-center justify-center p-8 transition-opacity duration-200"
                >
                  <div className="max-w-md rounded-2xl border border-dashed border-border/60 bg-background/80 p-5 text-center shadow-sm backdrop-blur-sm">
                    <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div className="text-sm font-semibold">Canvas em branco</div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Use a paleta ao lado ou comece com um bloco rápido para montar o slide.
                    </p>
                    {!readOnly && (
                      <div className="mt-4 flex justify-center gap-2">
                        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => addBlock("title")}>
                          <TypeIcon className="h-3.5 w-3.5" /> Título
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => addChart("line")}>
                          <LineChartIcon className="h-3.5 w-3.5" /> Gráfico
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {[...config.blocks].sort((a, b) => a.z - b.z).map((blk) => {
                const isSelected = selectedIds.includes(blk.id);
                const isInlineEditable =
                  (blk.kind === "title" || blk.kind === "text") && !blk.locked && !readOnly;
                const isEditing = inlineEditId === blk.id && isInlineEditable;
                const isRotatable = blk.kind === "title" || blk.kind === "text" || blk.kind === "image";
                const rotation = isRotatable ? ((blk as TitleBlock | TextBlock | ImageBlock).rotation ?? 0) : 0;
                const blockAriaLabel = `${isSelected ? "Selecionado: " : ""}${BLOCK_LABELS[blk.kind]}`;
                // Shape-specific resize config; contextual overlays own special geometry handles.
                let shapeResize: boolean | Record<string, boolean> = !blk.locked && !readOnly;
                let shapeDisableDrag = !!blk.locked || readOnly;
                let shapeLockAspect = false;
                if (blk.kind === "shape" && !blk.locked && !readOnly) {
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
                if (selectedIds.length > 1 && isSelected) {
                  shapeResize = false;
                }
                if (spacePanActive) {
                  shapeResize = false;
                  shapeDisableDrag = true;
                }
                const blockFrameHandlers = blockTransform.getBlockFrameHandlers(blk, shapeLockAspect);
                return (
                <ContextMenu key={blk.id}>
                  <ContextMenuTrigger asChild>

                      <RotatableBlock
                        x={blk.x} y={blk.y} w={blk.w} h={blk.h}
                        rotation={rotation}
                        scale={scale}
                        isSelected={isSelected}
                        isLocked={!!blk.locked || readOnly || spacePanActive}
                        isEditing={isEditing}
                        showResizeHandles={selectedIds.length <= 1}
                        bounds={{ w: CANVAS_W, h: CANVAS_H, bleed: TRANSFORM_BLEED }}
                        cancel={TABLE_COLUMN_RESIZE_HANDLE_CANCEL_SELECTOR}
                        lockAspectRatio={blockFrameHandlers.lockAspectRatio}
                        disableDragging={shapeDisableDrag}
                        enableResizing={shapeResize}
                        onResizeStart={blockFrameHandlers.onResizeStart}
                        onMoveStart={blockFrameHandlers.onMoveStart}
                        onMove={blockFrameHandlers.onMove}
                        onResize={blockFrameHandlers.onResize}
                        onMoveEnd={blockFrameHandlers.onMoveEnd}
                        onResizeEnd={blockFrameHandlers.onResizeEnd}
                        onSelect={(additive) => {
                          const wasSelected = selectedIds.includes(blk.id);
                          selectBlock(blk.id, { additive: !!additive });
                          if (inlineEditId && inlineEditId !== blk.id) setInlineEditId(null);
                          if (blk.locked && wasSelected && !additive) {
                            toast("Bloco bloqueado. Clique com botão direito para desbloquear.", { duration: 1800 });
                          }
                        }}
                        onDoubleClick={isInlineEditable ? () => {
                          setInlineEditId(blk.id);
                          selectBlock(blk.id);
                        } : blk.groupId ? () => enterGroupEdit(blk.id) : undefined}
                        style={{ zIndex: blockFrameHandlers.zIndex(isEditing) }}
                        className={cn(
                          blockFrameHandlers.isAltDragFlashing && "shadow-[0_0_0_4px_hsl(var(--warning)/0.35)]",
                          isSelected
                            ? "outline outline-2 outline-offset-1 outline-primary"
                            : "outline outline-1 outline-transparent hover:outline-primary/40",
                        )}
                        tabIndex={0}
                        role="button"
                        aria-label={blockAriaLabel}
                        aria-pressed={isSelected}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            selectBlock(blk.id, { additive: e.shiftKey });
                          }
                        }}
                        data-block-frame-id={blk.id}
                      >
                        <div data-block-id={blk.id} data-block-visual-id={blk.id} data-block-kind={blk.kind} style={{
                          width: "100%", height: "100%",
                          pointerEvents: blk.kind === "chart" || blk.kind === "table" ? "auto" : "none",
                          visibility: blk.hidden ? "hidden" : "visible",
                        }}>
                          <BlockRenderer
                            block={blk}
                            isEditing={isEditing}
                            cacheSlideId={slideId}
                            onPatch={(patch) => updateBlock(blk.id, patch)}
                          />
                        </div>
                        {isEditing && (
                          <InlineTextEditor
                            block={blk as TitleBlock | TextBlock}
                            onPatch={(patch) => { if (canEdit()) patchBlockAction(blk.id, patch, "Alterar estilo"); }}
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
                        {isSelected && !blk.locked && !readOnly && !isEditing && !spacePanActive && isRotatable && (
                          <BlockRotationHandle
                            block={blk as TitleBlock | TextBlock | ImageBlock}
                            onRotate={(id, rotationValue) => {
                              patchBlockAction(id, { rotation: rotationValue } as Partial<CustomBlock>, "Rotacionar");
                            }}
                          />
                        )}
                      </RotatableBlock>

                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-56">
                    <ContextMenuItem disabled={readOnly} onSelect={() => duplicateBlock(blk.id)}>
                      Duplicar <ContextMenuShortcut>Ctrl+D</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuItem disabled={readOnly} onSelect={() => removeBlock(blk.id)} className="text-destructive focus:text-destructive">
                      Excluir <ContextMenuShortcut>Del</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem disabled={readOnly} onSelect={() => bringForward(blk.id)}>
                      Trazer para frente <ContextMenuShortcut>Ctrl+]</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuItem disabled={readOnly} onSelect={() => bringToFront(blk.id)}>
                      Trazer para a frente de tudo
                    </ContextMenuItem>
                    <ContextMenuItem disabled={readOnly} onSelect={() => sendBack(blk.id)}>
                      Enviar para trás <ContextMenuShortcut>Ctrl+[</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuItem disabled={readOnly} onSelect={() => sendToBack(blk.id)}>
                      Enviar para o fundo
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem disabled={readOnly} onSelect={() => toggleLock(blk.id)}>
                      {blk.locked ? "Desbloquear posição" : "Bloquear posição"}
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onSelect={() => {
                      if (copyElementStyleAction(blk.id)) toast.success("Estilo copiado");
                    }}>
                      Copiar estilo
                    </ContextMenuItem>
                    <ContextMenuItem
                      disabled={readOnly || !canPasteElementStyleAction(blk.id)}
                      onSelect={() => {
                        if (canEdit() && pasteElementStyleAction(blk.id)) toast.success("Estilo colado");
                      }}>
                      Colar estilo
                    </ContextMenuItem>
                    {selectedIds.length >= 2 && (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem disabled={readOnly} onSelect={() => { if (canEdit()) groupBlocksAction(selectedIds); }}>
                          Agrupar <ContextMenuShortcut>Ctrl+G</ContextMenuShortcut>
                        </ContextMenuItem>
                      </>
                    )}
                    {blk.groupId && (
                      <ContextMenuItem disabled={readOnly} onSelect={() => { if (canEdit()) ungroupBlocksAction([blk.id]); }}>
                        Desagrupar <ContextMenuShortcut>Ctrl+Shift+G</ContextMenuShortcut>
                      </ContextMenuItem>
                    )}
                  </ContextMenuContent>
                </ContextMenu>
                );
              })}

              {selected && !readOnly && !inlineEditId && selectedIds.length === 1 && (
                <FloatingBlockToolbar
                  block={selected}
                  onDuplicate={() => duplicateBlock(selected.id)}
                  onDelete={() => removeBlock(selected.id)}
                  onForward={() => bringForward(selected.id)}
                  onBack={() => sendBack(selected.id)}
                onToFront={() => bringToFront(selected.id)}
                onToBack={() => sendToBack(selected.id)}
                onToggleLock={() => toggleLock(selected.id)}
                onStyle={focusSelectedBlockStyle}
              />
              )}

              {/* Inline text edit toolbar. */}
              {(() => {
                if (!inlineEditId || readOnly) return null;
                const blk = config.blocks.find((b) => b.id === inlineEditId);
                if (!blk || (blk.kind !== "title" && blk.kind !== "text")) return null;
                return (
                  <InlineTextToolbar
                    block={blk as TitleBlock | TextBlock}
                    scale={scale}
                    onPatch={(patch) => { if (canEdit()) patchBlockAction(blk.id, patch, "Alterar estilo"); }}
                  />
                );
              })()}

              {/* Contextual handles for selected shape blocks. */}
              {config.blocks
                .filter((b): b is ShapeBlock =>
                  b.kind === "shape" && selectedIds.includes(b.id) && !b.locked && !readOnly)
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
                const showHandles = active && !isGroupEditing && !readOnly;
                return (
                  <GroupOverlay
                    key={`grp-${g.id}`}
                    bounds={bb}
                    active={active}
                    showHandles={showHandles}
                    members={members}
                    scaleRef={scaleRef}
                    canvasEl={canvasRef.current}
                  />
                );
              })}

              {multiSelectionBounds && !selectedIsSinglePersistedGroup && !readOnly && !groupEditMemberId && (
                <GroupOverlay
                  key={`multi-${selectedIds.join("-")}`}
                  bounds={multiSelectionBounds}
                  active
                  showHandles
                  members={multiSelected}
                  scaleRef={scaleRef}
                  canvasEl={canvasRef.current}
                />
              )}

              {/* Smart guides overlay (B8.3). */}
              <svg
                data-export-hide="true"
                width={CANVAS_W} height={CANVAS_H}
                style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 999998 }}
              >
                {guides.v.map((x, i) => (
                  <line key={`gv-${i}`} x1={x} x2={x} y1={0} y2={CANVAS_H}
                    stroke={SLIDE_HEX.blue} strokeWidth={1} />
                ))}
                {guides.h.map((y, i) => (
                  <line key={`gh-${i}`} y1={y} y2={y} x1={0} x2={CANVAS_W}
                    stroke={SLIDE_HEX.blue} strokeWidth={1} />
                ))}
                {guides.equalSpacing.map((guide, i) => {
                  const label = `${guide.gap}px`;
                  if (guide.axis === "x") {
                    const y = Math.min(CANVAS_H - 12, Math.max(12, (guide.crossStart + guide.crossEnd) / 2));
                    return (
                      <g key={`geqx-${i}`}>
                        <line x1={guide.anchorStart} x2={guide.movingStart} y1={y} y2={y}
                          stroke="hsl(var(--warning))" strokeWidth={1.5} strokeDasharray="5 4" />
                        <line x1={guide.movingEnd} x2={guide.anchorEnd} y1={y} y2={y}
                          stroke="hsl(var(--warning))" strokeWidth={1.5} strokeDasharray="5 4" />
                        <text x={(guide.start + guide.end) / 2} y={y - 6} textAnchor="middle"
                          fill="hsl(var(--warning))" fontSize={11} fontWeight={700}>{label}</text>
                      </g>
                    );
                  }
                  const x = Math.min(CANVAS_W - 12, Math.max(12, (guide.crossStart + guide.crossEnd) / 2));
                  return (
                    <g key={`geqy-${i}`}>
                      <line x1={x} x2={x} y1={guide.anchorStart} y2={guide.movingStart}
                        stroke="hsl(var(--warning))" strokeWidth={1.5} strokeDasharray="5 4" />
                      <line x1={x} x2={x} y1={guide.movingEnd} y2={guide.anchorEnd}
                        stroke="hsl(var(--warning))" strokeWidth={1.5} strokeDasharray="5 4" />
                      <text x={x + 8} y={(guide.start + guide.end) / 2} dominantBaseline="middle"
                        fill="hsl(var(--warning))" fontSize={11} fontWeight={700}>{label}</text>
                    </g>
                  );
                })}
              </svg>

              {/* Marquee selection rectangle (B8.2). */}
              {marquee && (
                <div
                  data-export-hide="true"
                  style={{
                    position: "absolute",
                    left: marquee.x, top: marquee.y,
                    width: marquee.w, height: marquee.h,
                    border: `1px dashed ${SLIDE_HEX.blue}`,
                    background: SLIDE_RGBA.editorSelectionBg,
                    pointerEvents: "none",
                    zIndex: 999999,
                  }}
                />
              )}

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
              <SlideSourceFooterEditor config={config} rowsBySource={sourceFooterRows} readOnly={readOnly} />
            </div>
            </div>
          </div>
        </div>

        {/* Barra de zoom + undo/redo */}
        <div className="flex shrink-0 items-center justify-center gap-1 rounded-lg border border-border/40 bg-card/40 px-2 py-1">
          <Button size="icon" variant="ghost" className="h-7 w-7"
            onClick={() => { if (canEdit()) handleUndo(); }} disabled={!undoRedo.canUndo || readOnly}
            title={undoRedo.undoLabel ? `Desfazer: ${undoRedo.undoLabel.toLowerCase()}` : "Desfazer (Ctrl+Z)"}
            aria-label={undoRedo.undoLabel ? `Desfazer ${undoRedo.undoLabel.toLowerCase()}` : "Desfazer"}>
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7"
            onClick={() => { if (canEdit()) handleRedo(); }} disabled={!undoRedo.canRedo || readOnly}
            title={undoRedo.redoLabel ? `Refazer: ${undoRedo.redoLabel.toLowerCase()}` : "Refazer (Ctrl+Shift+Z)"}
            aria-label={undoRedo.redoLabel ? `Refazer ${undoRedo.redoLabel.toLowerCase()}` : "Refazer"}>
            <Redo2 className="h-3.5 w-3.5" />
          </Button>
          <Separator orientation="vertical" className="mx-1 h-5" />
          <BrandKitPopover selected={selected} readOnly={readOnly} canEdit={canEdit} />
          <PalettePopover
            theme={getTheme(config.theme)}
            blocks={config.blocks}
            selected={selected}
            readOnly={readOnly}
            canEdit={canEdit}
          />
          <Separator orientation="vertical" className="mx-1 h-5" />
          <div className="flex min-w-[210px] items-center gap-2 rounded-md bg-background/50 px-2 py-1">
            <UiSlider
              value={[Math.round(prefs.zoom * 100)]}
              min={50}
              max={150}
              step={1}
              onValueChange={([v]) => prefs.setZoom((v ?? 100) / 100)}
              className="w-28"
            />
            {zoomEditing ? (
              <Input
                autoFocus
                className="h-6 w-14 px-1 text-center text-[11px]"
                defaultValue={String(Math.round(prefs.zoom * 100))}
                onBlur={(e) => {
                  const next = Number(e.currentTarget.value);
                  if (Number.isFinite(next)) prefs.setZoom(next / 100);
                  setZoomEditing(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") setZoomEditing(false);
                }}
              />
            ) : (
              <button
                className="min-w-[42px] rounded px-1 py-0.5 text-center text-[11px] tabular-nums text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
                onClick={() => setZoomEditing(true)}
                title="Editar zoom"
                aria-label={`Editar zoom atual: ${Math.round(prefs.zoom * 100)}%`}
              >
                {Math.round(prefs.zoom * 100)}%
              </button>
            )}
            <Button size="icon" variant="ghost" className="h-6 w-6"
              onClick={() => prefs.setZoom(1.0)} title="Ajustar à tela (Ctrl+0)" aria-label="Ajustar zoom à tela">
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Separator orientation="vertical" className="mx-1 h-5" />
          <Button size="icon" variant={prefs.gridEnabled ? "default" : "ghost"}
            className="h-7 w-7"
            onClick={() => prefs.setGridEnabled(!prefs.gridEnabled)}
            title={prefs.gridEnabled ? "Grade ligada - clique para desligar" : "Ativar grade"}
            aria-label={prefs.gridEnabled ? "Desativar grade" : "Ativar grade"}
            aria-pressed={prefs.gridEnabled}>
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
          {onMinimize && (
            <>
              <Separator orientation="vertical" className="mx-1 h-5" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 transition-transform hover:-translate-x-0.5"
                    onClick={onMinimize}
                    title="Minimizar Slides"
                    aria-label="Minimizar editor de Slides em standby"
                  >
                    <PanelRightClose className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Minimizar Slides e manter este canvas em standby</TooltipContent>
              </Tooltip>
            </>
          )}
          <Separator orientation="vertical" className="mx-1 h-5" />
          <Button
            size="icon"
            variant={showLayers ? "default" : "ghost"}
            className="relative h-7 w-7"
            onClick={() => setShowLayers((s) => !s)}
            title="Painel de camadas"
            aria-label={showLayers ? "Ocultar painel de camadas" : "Mostrar painel de camadas"}
            aria-pressed={showLayers}
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
            title="Atalhos de teclado (?)"
            aria-label="Abrir ajuda de atalhos de teclado">
            <HelpCircle className="h-3.5 w-3.5" />
          </Button>
        </div>

        <SpeakerNotesBar
          value={config.speakerNotes ?? ""}
          onChange={(v) => { if (canEdit()) setSpeakerNotesAction(v); }}
        />
      </div>

      {/* ====== Inspector ====== */}
      <div className="min-w-0 min-h-0 flex flex-col rounded-lg border border-border/40 bg-card/40">
        {/* Contextual header ? shows which block is being edited */}
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
                aria-label="Limpar selecao"
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
              readOnly={readOnly}
              canEdit={canEdit}
              onDuplicate={() => duplicateBlocks(selectedIds)}
              onDelete={() => removeBlocks(selectedIds)}
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
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="secondary" className="slides-type-badge">{BLOCK_LABELS[selected.kind]}</Badge>
                  {selected.locked && (
                    <Badge variant="outline" className="slides-type-badge gap-1">
                      <Lock className="h-3 w-3" /> Bloqueado
                    </Badge>
                  )}
                </div>
                <p className="slides-type-helper">
                  Configure o bloco aqui. Acoes rapidas como duplicar, camadas e excluir ficam na toolbar sobre o bloco.
                </p>
              </div>

              <PositionInputs block={selected} onChange={(p) => updateBlock(selected.id, p)} />
              <BlockAppearanceControls block={selected} onChange={(p) => updateBlock(selected.id, p)} />
              <Separator />
              <div
                ref={inspectorStyleRef}
                className={cn(
                  "rounded-lg transition-[box-shadow,background-color] duration-300",
                  stylePanelHighlight && "bg-primary/5 shadow-[0_0_0_2px_hsl(var(--primary)/0.35)]",
                )}
              >
                <BlockSpecificEditor
                  block={selected}
                  onChange={(p) => updateBlock(selected.id, p)}
                  styleFocusRequest={styleFocusRequest}
                />
              </div>
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
        onApply={(cfg) => {
          if (!canEdit()) return;
          setTemplateApplying(true);
          window.setTimeout(() => {
            onChange(cfg);
            setTemplateApplying(false);
            toast.success("Modelo aplicado");
          }, 180);
        }}
        onApplyDeck={(configs, mode, name) => {
          if (!canEdit()) return;
          setTemplateApplying(true);
          window.setTimeout(() => {
            const replacement = applyTemplateDeckToSlidesFlow({ currentSlideId: slideId, configs, mode, name });
            if (replacement) onChange(replacement);
            setTemplateApplying(false);
            toast.success(`Deck aplicado — ${configs.length} slides criados`);
          }, 180);
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
}, areCustomSlideEditorPropsEqual);

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

function FloatingBlockToolbar({
  block,
  onDuplicate,
  onDelete,
  onForward,
  onBack,
  onToFront,
  onToBack,
  onToggleLock,
  onStyle,
}: {
  block: CustomBlock;
  onDuplicate: () => void;
  onDelete: () => void;
  onForward: () => void;
  onBack: () => void;
  onToFront: () => void;
  onToBack: () => void;
  onToggleLock: () => void;
  onStyle: () => void;
}) {
  const toolbarW = 334;
  const x = Math.min(Math.max(block.x + block.w / 2 - toolbarW / 2, 8), CANVAS_W - toolbarW - 8);
  const y = block.y < 52 ? Math.min(block.y + block.h + 10, CANVAS_H - 44) : block.y - 46;
  const iconButton = (label: string, onClick: () => void, icon: ReactNode) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClick} title={label} aria-label={label}>
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
  return (
    <TooltipProvider delayDuration={160}>
    <div
      data-export-hide="true"
      className="absolute z-[9999999] flex h-9 items-center gap-1 rounded-full border border-border/60 bg-card/95 px-1.5 shadow-xl backdrop-blur-md transition-all duration-200"
      style={{ left: x, top: y, width: toolbarW }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      aria-label="Acoes rapidas do bloco selecionado"
    >
      {iconButton("Editar estilo do bloco", onStyle, <Paintbrush className="h-3.5 w-3.5" />)}
      <Separator orientation="vertical" className="h-5" />
      <span className="px-1 text-[10px] font-semibold uppercase text-muted-foreground">Camada</span>
      {iconButton("Enviar uma camada para tras", onBack, <ArrowDown className="h-3.5 w-3.5" />)}
      {iconButton("Trazer uma camada para frente", onForward, <ArrowUp className="h-3.5 w-3.5" />)}
      <Separator orientation="vertical" className="h-5" />
      {iconButton("Duplicar bloco", onDuplicate, <CopyIcon className="h-3.5 w-3.5" />)}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={onToggleLock}
            title={block.locked ? "Desbloquear posicao do bloco" : "Bloquear posicao do bloco"}
            aria-label={block.locked ? "Desbloquear posicao do bloco" : "Bloquear posicao do bloco"}
            aria-pressed={!!block.locked}
          >
            {block.locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{block.locked ? "Desbloquear posicao do bloco" : "Bloquear posicao do bloco"}</TooltipContent>
      </Tooltip>
      <Popover>
        <PopoverTrigger asChild>
          <Button size="icon" variant="ghost" className="h-7 w-7" title="Mais ações" aria-label="Abrir mais ações do bloco">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="center" className="w-48 p-1">
          <button className="w-full rounded px-2 py-1.5 text-left text-xs outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary/60" onClick={onToFront}>
            Trazer para a frente de tudo
          </button>
          <button className="w-full rounded px-2 py-1.5 text-left text-xs outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-primary/60" onClick={onToBack}>
            Enviar para o fundo
          </button>
          <button className="w-full rounded px-2 py-1.5 text-left text-xs text-destructive outline-none hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-destructive/60" onClick={onDelete}>
            Excluir bloco
          </button>
        </PopoverContent>
      </Popover>
    </div>
    </TooltipProvider>
  );
}

function blockLayerName(blk: CustomBlock): string {
  if (blk.kind === "title" || blk.kind === "text") {
    const t = (blk as { text: string }).text;
    return t ? t.slice(0, 20) + (t.length > 20 ? "?" : "") : BLOCK_LABELS[blk.kind];
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
        "group rounded-md border border-transparent px-1.5 py-1.5 text-[10px] cursor-pointer select-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        isSelected ? "border-primary/40 bg-primary/10" : "hover:border-border/60 hover:bg-secondary/60",
        blk.hidden && "opacity-50",
      )}
      onClick={onSelect}
      tabIndex={0}
      role="button"
      aria-label={`Camada ${blockLayerName(blk)}`}
      aria-pressed={isSelected}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
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
          aria-label={blk.hidden ? "Mostrar bloco" : "Ocultar bloco"}
          aria-pressed={!blk.hidden}
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
          aria-label={blk.locked ? "Desbloquear posição do bloco" : "Bloquear posição do bloco"}
          aria-pressed={!!blk.locked}
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
          aria-label="Trazer bloco para a frente de tudo"
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
          aria-label="Enviar bloco para o fundo"
        >
          <ChevronsDown className="h-3 w-3" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-6 w-6 hover:bg-destructive/20 hover:text-destructive"
          title="Excluir bloco"
          aria-label="Excluir bloco"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function SpeakerNotesBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const MAX = 500;
  const trimmed = value.slice(0, MAX);
  return (
    <div className="surface-raised shrink-0 rounded-lg border border-border/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-1.5 slides-type-helper font-medium hover:bg-secondary/40"
      >
        <StickyNote className="h-3.5 w-3.5" />
        Anotações do apresentador
        {value.trim() && <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[9px] font-semibold">{value.length}</Badge>}
        <ChevronUp className={cn("ml-auto h-3 w-3 transition-transform", !open && "rotate-180")} />
      </button>
      {open && (
        <div className="relative px-3 pb-2">
          <DraftTextarea
            value={trimmed}
            normalize={(next) => next.slice(0, MAX)}
            onCommit={onChange}
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
// ShortcutsDialog ? painel de referência rápida dos atalhos do editor.
function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "Cmd" : "Ctrl";
  const sections: { title: string; items: [string, string][] }[] = [
    {
      title: "Edicao",
      items: [
        [`${mod} + Z`, "Desfazer"],
        [`${mod} + Y  ?  ${mod} + Shift + Z`, "Refazer"],
        [`${mod} + D`, "Duplicar bloco selecionado"],
        ["Delete  ?  Backspace", "Excluir bloco selecionado"],
        [`${mod} + A`, "Selecionar todos os blocos"],
        ["Esc", "Desselecionar / sair da edicao inline"],
      ],
    },
    {
      title: "Area de transferencia",
      items: [
        [`${mod} + C`, "Copiar bloco"],
        [`${mod} + V`, "Colar bloco (mant?m ao mudar de slide)"],
        [`${mod} + X`, "Cortar bloco"],
      ],
    },
    {
      title: "Camadas",
      items: [
        [`${mod} + ]`, "Trazer para frente"],
        [`${mod} + [`, "Enviar para tras"],
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
        ["? ? ? ?", "Mover 10 px"],
        ["Shift + setas", "Mover 40 px"],
      ],
    },
    {
      title: "Canvas",
      items: [
        [`${mod} + 0`, "Resetar zoom para 100%"],
        [`${mod} + scroll`, "Dar zoom mantendo o cursor no mesmo ponto"],
        ["Espaco + arrastar", "Navegar pelo canvas"],
        ["Shift + redimensionar", "Travar proporcao do bloco"],
        ["Tab", "Navegar por blocos e pain?is"],
        ["Enter / Espa?o", "Selecionar bloco focado"],
      ],
    },
    {
      title: "Apresentacao & ajuda",
      items: [
        ["F5", "Iniciar apresentacao"],
        [`${mod} + Shift + P`, "Iniciar apresentacao"],
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

/** Positivação */
function OmniPositivacaoInspector({ block, onChange }: {
  block: OmniPositivacaoBlock;
  onChange: (p: Partial<OmniPositivacaoBlock>) => void;
}) {
  return (
    <div className="space-y-2">
      <OmniTitleSection showTitle={block.showTitle} title={block.title} defaultTitle="Positivação" onChange={onChange} />
      <Section label="Dados">
        <Row label="Dimensão">
          <SelectField
            value={block.dim}
            onChange={(v) => onChange({ dim: v as OmniPositivacaoBlock["dim"] })}
            options={[
              { value: "categoria", label: "Categoria" },
              { value: "marca", label: "Marca" },
              { value: "canalAjustado", label: "Canal" },
              { value: "gestorResp", label: "Gestor Resp." },
              { value: "sku", label: "SKU" },
              { value: "skuDesc", label: "SKU Desc." },
            ]}
          />
        </Row>
        <Row label="Tipo">
          <SelectField
            value={block.chartType}
            onChange={(v) => onChange({ chartType: v as OmniPositivacaoBlock["chartType"] })}
            options={[{ value: "line", label: "Linha" }, { value: "bar", label: "Barra" }, { value: "area", label: "Área" }]}
          />
        </Row>
        <Row label="Top N">
          <NumberStepper value={block.topN ?? 8} min={3} max={12} step={1} onChange={(v) => onChange({ topN: v })} />
        </Row>
        <Row label="Legenda">
          <ToggleField value={block.showLegend} onChange={(v) => onChange({ showLegend: v })} label="" />
        </Row>
      </Section>
      <OmniFiltersSection block={block} onChange={onChange as (p: Partial<OmniBaseBlock>) => void} />
    </div>
  );
}

/** Mapa por UF */
function OmniUfMapInspector({ block, onChange }: {
  block: OmniUfMapBlock;
  onChange: (p: Partial<OmniUfMapBlock>) => void;
}) {
  return (
    <div className="space-y-2">
      <OmniTitleSection showTitle={block.showTitle} title={block.title} defaultTitle="Mapa por UF" onChange={onChange} />
      <Section label="Dados">
        <Row label="Métrica">
          <SelectField value={block.metric} onChange={(v) => onChange({ metric: v as OmniMetric })} options={OMNI_METRIC_OPTIONS} />
        </Row>
        <Row label="Rótulo">
          <SelectField
            value={block.labelMode}
            onChange={(v) => onChange({ labelMode: v as OmniUfMapBlock["labelMode"] })}
            options={[
              { value: "uf", label: "UF" },
              { value: "value", label: "Valor" },
              { value: "both", label: "UF + valor" },
            ]}
          />
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
  const months = useMonthsInfo();
  const fyList = useFyList();
  const opts = block.periodMode === "fy"
    ? fyList.map((f) => ({ value: f, label: f }))
    : months.map((m) => ({ value: m.periodo, label: m.label }));
  return (
    <div className="space-y-2">
      <OmniTitleSection showTitle={block.showTitle} title={block.title} defaultTitle="Decomposição de Preço" onChange={onChange} />
      <Section label="Períodos">
        <Row label="Modo">
          <SelectField value={block.periodMode} onChange={(v) => {
            const nextMode = v as "fy" | "month";
            onChange({
              periodMode: nextMode,
              base: null,
              comp: null,
              baseSelectionMode: block.baseSelectionMode ?? "relative",
              baseRelativePeriod: nextMode === "fy" ? "latest_fy_minus_2" : "latest_month_minus_2",
              compSelectionMode: block.compSelectionMode ?? "relative",
              compRelativePeriod: nextMode === "fy" ? "latest_fy_minus_1" : "latest_month_minus_1",
            });
          }} options={[{ value: "month", label: "Mensal" }, { value: "fy", label: "Anual (FY)" }]} />
        </Row>
        <Row label="Base">
          <ComparePeriodField label="Base" mode={block.periodMode} fixedValue={block.base}
            selectionMode={block.baseSelectionMode} relativeValue={block.baseRelativePeriod} options={opts}
            onChange={(p) => onChange({ base: p.value, baseSelectionMode: p.selectionMode, baseRelativePeriod: p.relativePeriod })} />
        </Row>
        <Row label="Comp.">
          <ComparePeriodField label="Comparação" mode={block.periodMode} fixedValue={block.comp}
            selectionMode={block.compSelectionMode} relativeValue={block.compRelativePeriod} options={opts}
            onChange={(p) => onChange({ comp: p.value, compSelectionMode: p.selectionMode, compRelativePeriod: p.relativePeriod })} />
        </Row>
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
  const months = useMonthsInfo();
  const fyList = useFyList();
  const opts = block.periodMode === "fy"
    ? fyList.map((f) => ({ value: f, label: f }))
    : months.map((m) => ({ value: m.periodo, label: m.label }));
  return (
    <div className="space-y-2">
      <OmniTitleSection showTitle={block.showTitle} title={block.title} defaultTitle="Bridge PVM" onChange={onChange} />
      <Section label="Períodos">
        <Row label="Modo">
          <SelectField value={block.periodMode} onChange={(v) => {
            const nextMode = v as "fy" | "month" | "ytd_budget";
            onChange({
              periodMode: nextMode,
              base: null,
              comp: null,
              baseSelectionMode: block.baseSelectionMode ?? "relative",
              baseRelativePeriod: nextMode === "fy" ? "latest_fy_minus_2" : "latest_month_minus_2",
              compSelectionMode: block.compSelectionMode ?? "relative",
              compRelativePeriod: nextMode === "fy" ? "latest_fy_minus_1" : "latest_month_minus_1",
            });
          }} options={[{ value: "month", label: "Mensal" }, { value: "fy", label: "Anual (FY)" }, { value: "ytd_budget", label: "YTD Real vs Budget" }]} />
        </Row>
        {block.periodMode === "ytd_budget" ? (
          <div className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-[11px] text-muted-foreground">
            Real acumulado do FY atual contra o Budget dos mesmos meses realizados.
          </div>
        ) : (
          <>
        <Row label="Base">
          <ComparePeriodField label="Base" mode={block.periodMode} fixedValue={block.base}
            selectionMode={block.baseSelectionMode} relativeValue={block.baseRelativePeriod} options={opts}
            onChange={(p) => onChange({ base: p.value, baseSelectionMode: p.selectionMode, baseRelativePeriod: p.relativePeriod })} />
        </Row>
        <Row label="Comp.">
          <ComparePeriodField label="Comparação" mode={block.periodMode} fixedValue={block.comp}
            selectionMode={block.compSelectionMode} relativeValue={block.compRelativePeriod} options={opts}
            onChange={(p) => onChange({ comp: p.value, compSelectionMode: p.selectionMode, compRelativePeriod: p.relativePeriod })} />
        </Row>
          </>
        )}
      </Section>
      <OmniFiltersSection block={block} onChange={onChange as (p: Partial<OmniBaseBlock>) => void} />
    </div>
  );
}

function buildFarolSkuOptions(rows: import("@/lib/types").PricingRow[]) {
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

function FarolSkuField({
  id,
  value,
  options,
  onChange,
}: {
  id: string;
  value: string | null;
  options: { sku: string; label: string }[];
  onChange: (sku: string | null) => void;
}) {
  return (
    <>
      <DraftInput
        className="h-7 px-2 text-xs"
        list={id}
        placeholder="auto"
        value={value ?? ""}
        normalize={(next) => next.trim()}
        onCommit={(next) => onChange(next || null)}
      />
      <datalist id={id}>
        {options.slice(0, 600).map((o) => (
          <option key={o.sku} value={o.sku}>{o.label}</option>
        ))}
      </datalist>
    </>
  );
}

/** Farol */
function OmniFarolInspector({ block, onChange }: {
  block: OmniFarolBlock;
  onChange: (p: Partial<OmniFarolBlock>) => void;
}) {
  const rows = usePricing((s) => s.rows);
  const skuOptions = useMemo(() => buildFarolSkuOptions(rows), [rows]);

  return (
    <div className="space-y-2">
      <OmniTitleSection showTitle={block.showTitle} title={block.title} defaultTitle="Farol de Positivação" onChange={onChange} />
      <Section label="Comparação">
        <Row label="SKU base">
          <FarolSkuField id={`farol-sku-ref-${block.id}`} value={block.skuRef ?? null} options={skuOptions} onChange={(skuRef) => onChange({ skuRef })} />
        </Row>
        <Row label="SKU comparado">
          <FarolSkuField id={`farol-sku-comp-${block.id}`} value={block.skuComp ?? null} options={skuOptions} onChange={(skuComp) => onChange({ skuComp })} />
        </Row>
        <Row label="Janela">
          <SelectField
            value={String(block.periodoMeses ?? 3)}
            options={[
              { value: "3", label: "Últimos 3 meses" },
              { value: "6", label: "Últimos 6 meses" },
              { value: "12", label: "Últimos 12 meses" },
            ]}
            onChange={(v) => onChange({ periodoMeses: Number(v) || 3 })}
          />
        </Row>
      </Section>
      <Section label="Exibição">
        <Row label="Gauge">
          <ToggleField value={block.showGauge} onChange={(v) => onChange({ showGauge: v })} label="" />
        </Row>
        <Row label="Legenda">
          <ToggleField value={block.showCaption ?? true} onChange={(v) => onChange({ showCaption: v })} label="" />
        </Row>
        <Row label="Números">
          <ToggleField value={block.showStats ?? true} onChange={(v) => onChange({ showStats: v })} label="" />
        </Row>
        <Row label="Tema">
          <Segmented
            value={block.gaugeTheme ?? "dark"}
            onChange={(v) => onChange({ gaugeTheme: v as "dark" | "light" })}
            options={[
              { value: "dark", label: "Escuro" },
              { value: "light", label: "Claro" },
            ]}
          />
        </Row>
        <Row label="Tamanho">
          <Slider value={block.gaugeScale ?? 55} min={40} max={75} step={5} onChange={(v) => onChange({ gaugeScale: v })} suffix="%" />
        </Row>
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
