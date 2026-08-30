// ============================================================================
// Slides (Beta) ? orquestrador de exportação multi-slide
//
// Fluxo:
//  1. Usuário arrasta slides do "Catálogo" para a "Esteira" (drop zone)
//  2. Cada slide tem painel de configuração próprio (filtros + parâmetros)
//  3. Pode salvar a esteira como Pré-definição (localStorage)
//  4. Exporta tudo num único PPTX preservando a ordem
// ============================================================================
import { useEffect, useMemo, useRef, useState, useCallback, type ComponentType } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDraggable,
  useDroppable,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Progress } from "@/components/ui/progress";
import { MultiSelectFilter } from "@/components/pricing/MultiSelectFilter";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowRight, BookOpen, Bookmark, ChevronLeft, ChevronRight, Copy, Download, FileText, Filter as FilterIcon,
  GitBranch, GripVertical, Image as ImageIcon, Layers, LayoutTemplate, Loader2, MessageSquare, CheckCheck, Send, Plus, Play, RotateCcw, Save, ShieldCheck, Sparkles, StickyNote, Trash2, Upload, X, MoreHorizontal,
  MonitorPlay, PanelRightClose, Share2, Timer,
  Search,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { usePricing } from "@/store/pricing";
import { useBudget } from "@/store/budget";
import { useFyList, useMonthsInfo } from "@/store/selectors";
import {
  useSlidesFlow, getSlidesFlowSaveStatus, subscribeSlidesFlowSaveStatus,
  type SlidesPreset, type SlidesFlowSaveStatus,
} from "@/store/slidesFlow";
import {
  SLIDE_CATALOG, defaultItem, isItemReady, metaOf,
  type SlideItem, type SlideKind,
} from "@/lib/slidesFlow";
import { smartDefaults } from "@/lib/slidesSmartDefaults";
import { warmSlideChartData } from "@/lib/slideDeckPreparation";
import { guardSlideReadOnly } from "@/lib/slidesReadOnly";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Filters, FilterKey, PricingRow } from "@/lib/types";
import type { BudgetRow } from "@/lib/budget";
import { SlidePreview, ScaledPreview, warmSlideThumbnail } from "@/components/pricing/SlidePreview";
import { CustomSlideEditor } from "@/components/pricing/custom/CustomSlideEditor";
import { TemplateGallery } from "@/components/pricing/custom/TemplateGallery";
import { ImportPptxDialog } from "@/components/pricing/custom/ImportPptxDialog";
import type { PptxSlide } from "@/components/pricing/custom/ImportPptxDialog";
import { CANVAS_W, CANVAS_H } from "@/lib/customSlide";
import type { CustomBlock, CustomSlideConfig, ImageBlock } from "@/lib/customSlide";
import { PresentationMode } from "@/components/pricing/custom/PresentationMode";
import type { SlideTemplate } from "@/lib/slideTemplates";
import { usePageTitle } from "@/hooks/use-page-title";
import { initials } from "@/lib/kanban";
import {
  addComment, deleteComment, getComments, getUnresolvedCount, reopenComment,
  resolveComment, subscribe as subscribeComments,
  type SlideComment, type SlideCommentEvent,
} from "@/lib/slideComments";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DraggableCatalogItem, EmptyFlow, FlowCard, FlowDropZone } from "@/components/pricing/slides/SlideCatalogFlow";
import { SLIDE_ACCENT_BG as ACCENT_BG, SLIDE_ICON_MAP as ICON_MAP } from "@/components/pricing/slides/slideUiTokens";
import { TransitionSelect } from "@/components/pricing/slides/TransitionSelect";
import { useIdleSlidePrecompute } from "@/components/pricing/slides/useIdleSlidePrecompute";
import { useIdleSlideChartPrecompute } from "@/components/pricing/slides/useIdleSlideChartPrecompute";
import { useThumbnailVisibilityScheduler } from "@/components/pricing/slides/useThumbnailVisibilityScheduler";
import { useSlideExport } from "@/hooks/useSlideExport";
import { strings } from "@/lib/i18n";

const t = strings.slides.beta;

type ExportFormat = "pptx" | "pdf";
type Icon = ComponentType<{ className?: string }>;
type SlideConfirmOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
};

function useSlideConfirm() {
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);
  const [options, setOptions] = useState<SlideConfirmOptions | null>(null);

  const requestConfirm = useCallback((nextOptions: SlideConfirmOptions) => new Promise<boolean>((resolve) => {
    resolverRef.current = resolve;
    setOptions(nextOptions);
  }), []);

  const close = useCallback((confirmed: boolean) => {
    resolverRef.current?.(confirmed);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  const dialog = (
    <AlertDialog open={!!options} onOpenChange={(open) => { if (!open) close(false); }}>
      <AlertDialogContent className="surface-overlay">
        <AlertDialogHeader>
          <AlertDialogTitle>{options?.title}</AlertDialogTitle>
          <AlertDialogDescription>{options?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => close(false)}>{t.common.cancelar}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => close(true)}
          >
            {options?.confirmLabel ?? t.common.excluir}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { requestConfirm, dialog };
}

/** Autoria local dos comentarios por slide — este app nao tem sistema de contas. */
const LOCAL_COMMENT_AUTHOR = { name: "Você", color: "#457B9D" };

function LocalSaveStatusBadge({ status }: { status: SlidesFlowSaveStatus }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 slides-type-badge",
      status === "error"
        ? "border-destructive/35 bg-destructive/10 text-destructive"
        : "border-success/35 bg-success/10 text-success",
    )}>
      {status === "saving" ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />}
      {status === "saving" ? t.localSaveStatus.saving : status === "error" ? t.localSaveStatus.error : t.localSaveStatus.saved}
    </span>
  );
}
const STRIP_THUMBNAIL_ESTIMATED_HEIGHT = 126;
const FLOW_CARD_ESTIMATED_HEIGHT = 98;
const SLIDE_PREVIEW_OVERSCAN = 8;
const DECK_PREP_THRESHOLD = 8;
const DECK_PREP_MAX_CHART_BLOCKS_PER_SLIDE = 2;
const DECK_PREP_MAX_CHART_BLOCKS_TOTAL = 40;

// Quantos slides preparamos de forma sincrona (bloqueando a abertura) quando o
// deck e grande: apenas o que realmente cabe na tira no momento em que ela
// abre (posicao de rolagem inicial = topo + a altura real da area visivel),
// mais a mesma margem de overscan usada pela virtualizacao da lista. O resto
// do deck fica a cargo do IntersectionObserver da tira (visible/preload,
// enquanto a pessoa rola) e do preenchimento em segundo plano via
// requestIdleCallback (useIdleSlidePrecompute / useIdleSlideChartPrecompute) —
// nunca bloqueando a abertura, mesmo com 48+ slides.
function estimateInitialVisibleSlideCount(): number {
  if (typeof window === "undefined") return DECK_PREP_THRESHOLD + SLIDE_PREVIEW_OVERSCAN;
  const viewportHeight = window.innerHeight || 900;
  return Math.max(1, Math.ceil(viewportHeight / FLOW_CARD_ESTIMATED_HEIGHT) + SLIDE_PREVIEW_OVERSCAN);
}

type DeckPreparationState = {
  visible: boolean;
  title: string;
  total: number;
  done: number;
  currentLabel: string;
  etaLabel: string;
  skipped: boolean;
};

function slideToastSuccess(message: string) {
  toast.success(message, { icon: <CheckCheck className="h-4 w-4 text-success" /> });
}

function slideToastInfo(message: string) {
  toast.info(message, { icon: <Sparkles className="h-4 w-4 text-primary" /> });
}

function slideToastError(message: string) {
  toast.error(message, { icon: <X className="h-4 w-4 text-destructive" /> });
}

function deckPreparationSignature(items: SlideItem[]): string {
  return `${items.length}:${items.map((item) => item.id).join("|")}`;
}

function formatDeckPreparationEta(startedAt: number, done: number, total: number): string {
  if (done <= 0 || done >= total) return done >= total ? t.deckPreparation.concluding : t.deckPreparation.calculatingEta;
  const elapsed = Date.now() - startedAt;
  const remainingMs = Math.max(0, Math.round((elapsed / done) * (total - done)));
  const seconds = Math.ceil(remainingMs / 1000);
  if (seconds <= 1) return t.deckPreparation.lessThanOneSecond;
  if (seconds < 60) return t.deckPreparation.secondsRemaining(seconds);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return t.deckPreparation.minutesRemaining(minutes, rest);
}

function yieldDeckPreparationFrame(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function useVirtualPreviewWindow(count: number, estimatedItemHeight: number, overscan = SLIDE_PREVIEW_OVERSCAN) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const [range, setRange] = useState({ start: 0, end: Math.min(count, overscan + 1) });

  const computeRange = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      setRange({ start: 0, end: Math.min(count, overscan + 1) });
      return;
    }
    const scrollTop = viewport.scrollTop;
    const visibleHeight = viewport.clientHeight || estimatedItemHeight;
    const start = Math.max(0, Math.floor(scrollTop / estimatedItemHeight) - overscan);
    const end = Math.min(count, Math.ceil((scrollTop + visibleHeight) / estimatedItemHeight) + overscan);
    setRange((current) => (current.start === start && current.end === end ? current : { start, end }));
  }, [count, estimatedItemHeight, overscan]);

  const recompute = useCallback(() => {
    if (typeof window === "undefined") {
      computeRange();
      return;
    }
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      computeRange();
    });
  }, [computeRange]);

  useEffect(() => {
    recompute();
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(recompute);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [recompute]);

  useEffect(() => {
    recompute();
  }, [count, recompute]);

  useEffect(() => () => {
    if (frameRef.current !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(frameRef.current);
    }
  }, []);

  const isPreviewVisible = useCallback((index: number) => (
    index >= range.start && index < range.end
  ), [range.end, range.start]);
  const topSpacerHeight = range.start * estimatedItemHeight;
  const bottomSpacerHeight = Math.max(0, (count - range.end) * estimatedItemHeight);

  return {
    viewportRef,
    onScroll: recompute,
    isPreviewVisible,
    range,
    topSpacerHeight,
    bottomSpacerHeight,
  };
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
// Dimensões disponíveis para filtros por slide.
// Cada grupo é mostrado como um collapsible no painel.
const FILTER_GROUPS: Array<{
  title: string;
  variant: "comercial" | "sku" | "inovacao";
  keys: FilterKey[];
}> = [
  {
    title: t.filterGroups.comercial,
    variant: "comercial",
    keys: ["canal", "canalAjustado", "regiao", "uf", "regional", "mercado", "mercadoAjustado"],
  },
  {
    title: t.filterGroups.produto,
    variant: "sku",
    keys: ["marca", "categoria", "subcategoria", "formato", "sabor", "tecnologia", "faixaPeso", "sku"],
  },
  {
    title: t.filterGroups.inovacao,
    variant: "inovacao",
    keys: ["inovacao", "legado"],
  },
];

const FILTER_LABEL: Record<FilterKey, string> = t.filterLabels;

function uniqueValues(
  pricing: PricingRow[],
  budget: BudgetRow[],
  key: FilterKey,
): string[] {
  const set = new Set<string>();
  for (const r of pricing) {
    const v = (r as unknown as Record<string, unknown>)[key];
    if (typeof v === "string" && v) set.add(v);
  }
  for (const r of budget) {
    const v = (r as unknown as Record<string, unknown>)[key];
    if (typeof v === "string" && v) set.add(v);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

// Painel de configuração de filtros
// ----------------------------------------------------------------------------
function FiltersPanel({
  value,
  onChange,
  pricing,
  budget,
  readOnly = false,
}: {
  value: Filters;
  onChange: (next: Filters) => void;
  pricing: PricingRow[];
  budget: BudgetRow[];
  readOnly?: boolean;
}) {
  const setKey = (k: FilterKey, vals: string[]) => {
    if (readOnly) {
      toast.info(t.common.readOnlyToast);
      return;
    }
    const next = { ...value };
    if (vals.length === 0) delete next[k];
    else next[k] = vals;
    onChange(next);
  };

  const activeCount = Object.values(value).filter((v) => v && v.length > 0).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FilterIcon className="h-4 w-4 text-primary" />
          {t.filtersPanel.title}
          {activeCount > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {t.filtersPanel.activeCount(activeCount)}
            </Badge>
          )}
        </div>
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" disabled={readOnly} onClick={() => onChange({})}>
            <X className="h-3 w-3" /> {t.filtersPanel.clear}
          </Button>
        )}
      </div>

      <Tabs defaultValue={FILTER_GROUPS[0].title} className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-secondary/40">
          {FILTER_GROUPS.map((g) => (
            <TabsTrigger key={g.title} value={g.title} className="text-xs">
              {g.title}
            </TabsTrigger>
          ))}
        </TabsList>
        {FILTER_GROUPS.map((g) => (
          <TabsContent key={g.title} value={g.title} className="mt-3 space-y-3">
            {g.keys.map((k) => {
              const opts = uniqueValues(pricing, budget, k).map((v) => ({ value: v, label: v }));
              if (opts.length === 0) return null;
              return (
                <div key={k} className="space-y-1">
                  <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {FILTER_LABEL[k]}
                  </Label>
                  <MultiSelectFilter
                    options={opts}
                    selected={value[k] ?? []}
                    onChange={(vals) => setKey(k, vals)}
                    variant={g.variant}
                  />
                </div>
              );
            })}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Painéis de configuração específicos por tipo
// ----------------------------------------------------------------------------
function BridgePvmConfigPanel({
  item, onChange, readOnly = false,
}: {
  item: Extract<SlideItem, { kind: "bridge_pvm" }>;
  onChange: (next: SlideItem) => void;
  readOnly?: boolean;
}) {
  const fyList = useFyList();
  const months = useMonthsInfo();
  const cfg = item.config;

  const options = cfg.mode === "fy"
    ? fyList.map((f) => ({ value: f, label: f }))
    : months.map((m) => ({ value: m.periodo, label: m.label }));

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t.bridgePvmPanel.mode}</Label>
        <Select
          disabled={readOnly}
          value={cfg.mode}
          onValueChange={(v) => onChange({ ...item, config: { ...cfg, mode: v as "fy" | "month" | "ytd_budget", base: null, comp: null } })}
        >
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="month">{t.bridgePvmPanel.modeOptions.month}</SelectItem>
            <SelectItem value="fy">{t.bridgePvmPanel.modeOptions.fy}</SelectItem>
            <SelectItem value="ytd_budget">{t.bridgePvmPanel.modeOptions.ytdBudget}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {cfg.mode === "ytd_budget" ? (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {t.bridgePvmPanel.ytdBudgetHint}
        </div>
      ) : (
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <div className="space-y-1.5">
          <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t.bridgePvmPanel.base}</Label>
          <Select
            disabled={readOnly}
            value={cfg.base ?? undefined}
            onValueChange={(v) => onChange({ ...item, config: { ...cfg, base: v } })}
          >
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={t.bridgePvmPanel.choosePlaceholder} /></SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value} disabled={o.value === cfg.comp}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ArrowRight className="mb-2 h-4 w-4 text-muted-foreground" />
        <div className="space-y-1.5">
          <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t.bridgePvmPanel.comparison}</Label>
          <Select
            disabled={readOnly}
            value={cfg.comp ?? undefined}
            onValueChange={(v) => onChange({ ...item, config: { ...cfg, comp: v } })}
          >
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={t.bridgePvmPanel.choosePlaceholder} /></SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value} disabled={o.value === cfg.base}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      )}
    </div>
  );
}

function BudgetEvoConfigPanel({
  item, onChange, readOnly = false,
}: {
  item: Extract<SlideItem, { kind: "budget_evo" }>;
  onChange: (next: SlideItem) => void;
  readOnly?: boolean;
}) {
  const budgetRows = useBudget((s) => s.rows);
  const months = useMemo(() => {
    const map = new Map<string, { periodo: string; mes: number; ano: number; label: string }>();
    for (const r of budgetRows) {
      if (!map.has(r.periodo)) {
        map.set(r.periodo, { periodo: r.periodo, mes: r.mes, ano: r.ano, label: `${strings.slides.editor.blockRenderer.dre.months[r.mes-1]}/${String(r.ano).slice(-2)}` });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.ano - b.ano || a.mes - b.mes);
  }, [budgetRows]);

  const cfg = item.config;
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t.budgetEvoPanel.startMonth}</Label>
        <Select
          disabled={readOnly}
          value={cfg.start ?? "__auto__"}
          onValueChange={(v) => onChange({ ...item, config: { ...cfg, start: v === "__auto__" ? null : v } })}
        >
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__auto__">{t.budgetEvoPanel.autoStart}</SelectItem>
            {months.map((m) => <SelectItem key={m.periodo} value={m.periodo}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t.budgetEvoPanel.endMonth}</Label>
        <Select
          disabled={readOnly}
          value={cfg.end ?? "__auto__"}
          onValueChange={(v) => onChange({ ...item, config: { ...cfg, end: v === "__auto__" ? null : v } })}
        >
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__auto__">{t.budgetEvoPanel.autoEnd}</SelectItem>
            {months.map((m) => <SelectItem key={m.periodo} value={m.periodo}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function CoverConfigPanel({
  item, onChange, readOnly = false,
}: {
  item: Extract<SlideItem, { kind: "cover" }>;
  onChange: (next: SlideItem) => void;
  readOnly?: boolean;
}) {
  const cfg = item.config;
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t.coverPanel.style}</Label>
        <Select
          disabled={readOnly}
          value={cfg.variant}
          onValueChange={(v) => onChange({ ...item, config: { ...cfg, variant: v as "cover" | "divider" } })}
        >
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="cover">{t.coverPanel.styleOptions.cover}</SelectItem>
            <SelectItem value="divider">{t.coverPanel.styleOptions.divider}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t.coverPanel.title}</Label>
        <Input
          value={cfg.title}
          readOnly={readOnly}
          onChange={(e) => onChange({ ...item, config: { ...cfg, title: e.target.value } })}
          className="h-9 text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t.coverPanel.subtitle}</Label>
        <Textarea
          value={cfg.subtitle ?? ""}
          readOnly={readOnly}
          onChange={(e) => onChange({ ...item, config: { ...cfg, subtitle: e.target.value } })}
          rows={2}
          className="text-sm resize-none"
        />
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Trigger no inspector ? abre o editor fullscreen ao nível da página.
// ----------------------------------------------------------------------------
function CustomSlideFullscreenTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-border/40 bg-card/40 p-3 text-[12px] text-muted-foreground">
        {t.fullscreenTrigger.hint}
      </div>
      <Button onClick={onOpen} className="w-full gap-2" size="sm">
        <LayoutTemplate className="h-4 w-4" />
        {t.fullscreenTrigger.button}
      </Button>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Strip lateral de slides ? thumbnails empilhados verticalmente, ordenáveis.
// ----------------------------------------------------------------------------
function StripThumbnail({
  item, index, active, onClick,
  currentUser, onCommentEvent, previewVisible = true, thumbnailRef,
}: {
  item: SlideItem;
  index: number;
  active: boolean;
  onClick: () => void;
  currentUser: { name: string; color: string };
  onCommentEvent?: (event: SlideCommentEvent) => void;
  previewVisible?: boolean;
  /** Ref do IntersectionObserver da tira — ver useThumbnailVisibilityScheduler. */
  thumbnailRef?: (element: HTMLElement | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const meta = metaOf(item.kind);
  const Icon = ICON_MAP[meta.icon];
  const hasNotes = !!((item.config as { speakerNotes?: string }).speakerNotes ?? "").trim();
  const ready = isItemReady(item);
  const displayName = item.label ?? meta.title;

  // Subscribe to comment changes so the badge updates live.
  const [, force] = useState(0);
  useEffect(() => subscribeComments(() => force((n) => n + 1)), []);
  const unresolvedCount = getUnresolvedCount(item.id);
  const [commentsOpen, setCommentsOpen] = useState(false);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        "surface-raised group relative cursor-pointer rounded-md border transition-colors",
        active ? "border-primary ring-2 ring-primary/40" : "border-border/40 hover:border-border/80",
        !ready.ok && !active && "border-destructive/50",
      )}
    >
      {!ready.ok && (
        <div
          className="absolute right-1 top-1 z-10 flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-full border border-destructive/50 bg-destructive/10 px-1 text-[9px] font-semibold text-destructive shadow-sm"
          title={t.stripThumbnail.incompleteTitle(ready.reason)}
        >
          <AlertTriangle className="h-3 w-3" />
          1
        </div>
      )}
      {hasNotes && (
        <div
          className="absolute right-1 top-7 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-primary/40 bg-primary text-primary-foreground shadow-sm"
          title={t.stripThumbnail.hasNotesTitle}
        >
          <StickyNote className="h-3 w-3" />
        </div>
      )}
      <div className="flex items-center gap-1.5 px-1.5 pt-1.5 pb-0.5">
        <span className="text-[9px] font-semibold tabular-nums text-muted-foreground">
          {String(index + 1).padStart(2, "0")}
        </span>
        <Icon className="h-2.5 w-2.5 text-muted-foreground" />
        <span className="truncate text-[9px] text-muted-foreground">{meta.title}</span>
      </div>
      <div className="thumb px-1 pb-1">
        <div ref={thumbnailRef} className="pointer-events-none mx-auto w-full max-w-[132px] min-w-[82px] overflow-hidden rounded-sm">
          <ScaledPreview
            item={item}
            targetWidth={112}
            deferUntilVisible={!previewVisible}
            liveEditingActive={active}
          />
        </div>
      </div>
      <div
        className="line-clamp-2 min-h-[28px] px-1.5 pb-1.5 text-[11px] font-semibold leading-tight"
        title={displayName}
        aria-label={displayName}
      >
        {displayName}
      </div>
      {/* Botão de comentários (hover + sempre visível se houver não-resolvidos) */}
      <Popover open={commentsOpen} onOpenChange={setCommentsOpen} modal={false}>
        <PopoverTrigger asChild>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setCommentsOpen((v) => !v); }}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              "absolute bottom-1 right-1 z-10 flex h-5 items-center gap-0.5 rounded-full border border-background/70 bg-card/95 px-1 text-muted-foreground shadow-sm transition-opacity hover:text-foreground",
              unresolvedCount > 0 ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
            aria-label={t.stripThumbnail.commentsAriaLabel}
          >
            <MessageSquare className="h-3 w-3" />
            {unresolvedCount > 0 && (
              <span className="rounded-full bg-primary/90 px-1 text-[9px] font-semibold text-primary-foreground">
                {unresolvedCount}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="right" align="start" className="w-80 p-0"
          onInteractOutside={(e) => e.preventDefault()}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <CommentsThread
            slideId={item.id}
            slideLabel={displayName}
            currentUser={currentUser}
            onCommentEvent={onCommentEvent}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ----------------------------------------------------------------------------
// CommentsThread ? lista + input de novo comentário para um slide.
// ----------------------------------------------------------------------------
function CommentsThread({
  slideId, slideLabel, currentUser, onCommentEvent,
}: {
  slideId: string;
  slideLabel: string;
  currentUser: { name: string; color: string };
  onCommentEvent?: (event: SlideCommentEvent) => void;
}) {
  const [, force] = useState(0);
  useEffect(() => subscribeComments(() => force((n) => n + 1)), []);
  const comments = getComments(slideId);
  const [text, setText] = useState("");

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const c: SlideComment = {
      id: typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `c_${Math.random().toString(36).slice(2, 10)}`,
      slideId,
      author: currentUser.name || t.commentsThread.guestAuthor,
      authorColor: currentUser.color,
      text: trimmed,
      createdAt: Date.now(),
      resolved: false,
    };
    addComment(c);
    onCommentEvent?.({ type: "comment_add", comment: c, at: c.createdAt });
    setText("");
  };

  const emitCommentChange = (type: SlideCommentEvent["type"], comment: SlideComment) => {
    const at = Date.now();
    onCommentEvent?.({ type, comment: { ...comment, updatedAt: at }, at });
  };

  return (
    <div className="flex max-h-[60vh] flex-col">
      <div className="border-b border-border/40 px-3 py-2 text-xs font-semibold">
        {t.commentsThread.headerPrefix} <span className="text-muted-foreground">{slideLabel}</span>
      </div>
      <ScrollArea className="max-h-72 flex-1">
        <div className="space-y-3 p-3">
          {comments.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">{t.commentsThread.empty}</p>
          ) : comments.map((c) => (
            <div key={c.id} className="flex gap-2">
              <div
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-white"
                style={{ background: c.authorColor }}
              >
                {initials(c.author)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span className="font-semibold">{c.author}</span>
                  <span className="text-muted-foreground">
                    · {formatDistanceToNow(c.createdAt, { addSuffix: true, locale: ptBR })}
                  </span>
                  {!c.resolved ? (
                    <button
                      type="button"
                      onClick={() => {
                        const updated = { ...c, resolved: true, updatedAt: Date.now() };
                        resolveComment(slideId, c.id);
                        emitCommentChange("comment_resolve", updated);
                      }}
                      className="ml-auto inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                      title={t.commentsThread.resolveTitle}
                    >
                      <CheckCheck className="h-3 w-3" /> {t.commentsThread.resolve}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        const updated = { ...c, resolved: false, updatedAt: Date.now() };
                        reopenComment(slideId, c.id);
                        emitCommentChange("comment_reopen", updated);
                      }}
                      className="ml-auto inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                      title={t.commentsThread.reopenTitle}
                    >
                      {t.commentsThread.reopen}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      deleteComment(slideId, c.id);
                      emitCommentChange("comment_delete", c);
                    }}
                    className="inline-flex items-center rounded px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title={t.commentsThread.deleteTitle}
                  >
                    {t.commentsThread.delete}
                  </button>
                </div>
                <p className={cn(
                  "mt-0.5 break-words text-xs",
                  c.resolved && "text-muted-foreground line-through",
                )}>
                  {c.text}
                </p>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
      <div className="flex items-end gap-1.5 border-t border-border/40 p-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t.commentsThread.placeholder}
          rows={2}
          className="min-h-[40px] resize-none text-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault(); send();
            }
          }}
        />
        <Button size="sm" className="h-9 gap-1" onClick={send} disabled={!text.trim()}>
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function FullscreenCustomEditor({
  open, onOpenChange,
  currentUser, onCommentEvent, readOnly = false,
  isStandby = false, onMinimize,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  readOnly?: boolean;
  currentUser: { name: string; color: string };
  onCommentEvent?: (event: SlideCommentEvent) => void;
  isStandby?: boolean;
  onMinimize?: () => void;
}) {
  const items = useSlidesFlow((s) => s.items);
  const selectedId = useSlidesFlow((s) => s.selectedId);
  const select = useSlidesFlow((s) => s.select);
  const updateItem = useSlidesFlow((s) => s.updateItem);
  const addItem = useSlidesFlow((s) => s.addItem);
  const removeItem = useSlidesFlow((s) => s.removeItem);
  const reorder = useSlidesFlow((s) => s.reorder);

  const current = items.find((i) => i.id === selectedId) ?? null;
  const idx = current ? items.findIndex((i) => i.id === current.id) : -1;
  const isCustom = current?.kind === "custom";
  const { requestConfirm, dialog: confirmDialog } = useSlideConfirm();
  const [warmCustomSlideIds, setWarmCustomSlideIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !current || current.kind !== "custom") return;
    setWarmCustomSlideIds((previous) => [current.id, ...previous.filter((id) => id !== current.id)].slice(0, 3));
  }, [open, current]);

  useEffect(() => {
    if (!open || warmCustomSlideIds.length === 0) return;
    const warmItems = warmCustomSlideIds
      .map((id) => items.find((item) => item.id === id))
      .filter((item): item is SlideItem => !!item);
    warmItems.forEach((item, order) => {
      window.setTimeout(() => { void warmSlideThumbnail(item); }, order * 80);
    });
  }, [open, items, warmCustomSlideIds]);

  // Se o slide selecionado deixou de ser custom, fecha o editor.
  useEffect(() => {
    if (open && current && !isCustom) onOpenChange(false);
  }, [open, current, isCustom, onOpenChange]);

  // Navegação sequencial (apenas slides custom).
  const goRel = useCallback((offset: number) => {
    if (idx < 0) return;
    const dir = offset > 0 ? 1 : -1;
    for (let i = idx + dir; i >= 0 && i < items.length; i += dir) {
      if (items[i].kind === "custom") { select(items[i].id); return; }
    }
  }, [idx, items, select]);
  const hasPrev = idx > 0 && items.slice(0, idx).some((i) => i.kind === "custom");
  const hasNext = idx >= 0 && items.slice(idx + 1).some((i) => i.kind === "custom");

  // Atalhos Ctrl/Cmd + ? / ?. Capturamos antes do editor para evitar nudge.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); goRel(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); goRel(1); }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [open, goRel]);

  const stripSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const guardReadOnly = () => {
    if (!readOnly) return false;
    toast.info(t.common.readOnlyToast);
    return true;
  };
  const onStripDragEnd = (e: DragEndEvent) => {
    if (guardReadOnly()) return;
    if (!e.over || e.active.id === e.over.id) return;
    reorder(String(e.active.id), String(e.over.id));
  };

  const handleAddBlank = () => {
    if (guardReadOnly()) return;
    addItem("custom");
    const st = useSlidesFlow.getState();
    const created = st.items[st.items.length - 1];
    if (!created) return;
    // Move para logo após o slide atual, se houver.
    if (current && idx >= 0 && idx < items.length - 1) {
      const target = items[idx + 1];
      if (target) reorder(created.id, target.id);
    }
    select(created.id);
  };

  const handleRemoveCurrent = async () => {
    if (guardReadOnly()) return;
    if (!current) return;
    const hasContent = current.kind === "custom" && current.config.blocks.length > 0;
    if (hasContent) {
      const confirmed = await requestConfirm({
        title: t.fullscreenEditor.deleteConfirm.title,
        description: t.fullscreenEditor.deleteConfirm.description(current.label ?? "Slide", current.config.blocks.length),
        confirmLabel: t.fullscreenEditor.deleteConfirm.confirmLabel,
      });
      if (!confirmed) return;
    }
    const nextSel = items[idx + 1]?.id ?? items[idx - 1]?.id ?? null;
    removeItem(current.id);
    if (nextSel) {
      const after = useSlidesFlow.getState().items.find((i) => i.id === nextSel);
      select(nextSel);
      if (after?.kind !== "custom") onOpenChange(false);
    } else {
      onOpenChange(false);
    }
  };
  const stripPreviewWindow = useVirtualPreviewWindow(items.length, STRIP_THUMBNAIL_ESTIMATED_HEIGHT);
  const stripSortableIds = useMemo(() => items.map((item) => item.id), [items]);
  const stripThumbnailScheduler = useThumbnailVisibilityScheduler(stripPreviewWindow.viewportRef);

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[100vh] w-[100vw] max-w-none flex-col gap-3 rounded-none border-0 p-3 sm:rounded-none"
        style={{ height: "100vh", maxHeight: "100vh" }}
      >
        <DialogHeader className="flex flex-row items-center justify-between gap-3 space-y-0 px-1">
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => goRel(-1)} disabled={!hasPrev}>
              <ChevronLeft className="h-3.5 w-3.5" /> {t.fullscreenEditor.prev}
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => goRel(1)} disabled={!hasNext}>
              {t.fullscreenEditor.next} <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <span className="hidden text-[10px] text-muted-foreground/70 lg:inline">
              {t.fullscreenEditor.shortcutHint}
            </span>
          </div>
          {readOnly && (
            <Badge variant="outline" className="h-6 border-amber-500/50 bg-amber-500/10 px-2 text-[10px] font-semibold text-amber-600">
              {t.fullscreenEditor.readOnlyBadge}
            </Badge>
          )}
          <div className="flex flex-1 flex-col items-center gap-0.5">
            <DialogTitle className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {idx >= 0 ? t.fullscreenEditor.titleWithIndex(idx + 1, items.length) : t.fullscreenEditor.titleFallback}
            </DialogTitle>
            {current && (
              <Input
                value={current.label ?? ""}
                readOnly={readOnly}
                onChange={(e) => {
                  if (guardReadOnly()) return;
                  updateItem(current.id, (it) => ({ ...it, label: e.target.value } as SlideItem))
                }}
                placeholder={t.fullscreenEditor.slideNamePlaceholder}
                className="h-8 w-72 border-transparent bg-transparent text-center text-sm font-medium hover:border-border/60 focus-visible:bg-card"
              />
            )}
          </div>
          <DialogDescription className="sr-only">
            {t.fullscreenEditor.dialogDescription}
          </DialogDescription>
          <div className="flex w-[200px] items-center justify-end gap-2" />
        </DialogHeader>

        <div className="flex min-h-0 flex-1 gap-3">
          {/* Strip lateral */}
          <aside className="flex w-[120px] shrink-0 flex-col overflow-hidden rounded-lg border border-border/40 bg-card/30">
            <div className="border-b border-border/40 px-2 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t.fullscreenEditor.stripHeader(items.length)}
            </div>
            <div
              ref={stripPreviewWindow.viewportRef}
              onScroll={stripPreviewWindow.onScroll}
              className="flex-1 overflow-y-auto"
            >
              <DndContext sensors={stripSensors} collisionDetection={closestCenter} onDragEnd={onStripDragEnd}>
                <SortableContext items={stripSortableIds} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col gap-1.5 p-1.5">
                    {items.map((it, i) => (
                      <StripThumbnail
                        key={it.id}
                        item={it}
                        index={i}
                        active={it.id === current?.id}
                        currentUser={currentUser}
                        onCommentEvent={onCommentEvent}
                        previewVisible={stripPreviewWindow.isPreviewVisible(i) || it.id === current?.id}
                        thumbnailRef={stripThumbnailScheduler.getRefCallback(it)}
                        onClick={() => {
                          if (it.id === current?.id) return;
                          select(it.id);
                          if (it.kind !== "custom") onOpenChange(false);
                        }}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
            <div className="flex gap-1 border-t border-border/40 p-1.5">
              <Button
                variant="ghost" size="sm" className="h-7 flex-1 px-1"
                onClick={handleAddBlank}
                disabled={readOnly}
                title={t.fullscreenEditor.addBlankTitle}
              >
                <Plus className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost" size="sm" className="h-7 flex-1 px-1 text-destructive hover:text-destructive"
                onClick={handleRemoveCurrent}
                disabled={!current || readOnly}
                title={t.fullscreenEditor.removeCurrentTitle}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </aside>

          {/* Canvas do editor */}
          <div className="min-w-0 flex-1">
            {current && isCustom ? (
              <CustomSlideEditor
                slideId={current.id}
                config={(current as Extract<SlideItem, { kind: "custom" }>).config}
                onChange={(cfg) => {
                  if (readOnly) {
                    toast.info(t.common.readOnlyToast);
                    return;
                  }
                  updateItem(current.id, (it) =>
                    it.kind === "custom" ? ({ ...it, config: cfg } as SlideItem) : it,
                  );
                }}
                readOnly={readOnly}
                isStandby={isStandby}
                onMinimize={onMinimize}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {t.fullscreenEditor.emptySelection}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
    {confirmDialog}
    </>
  );
}

// ----------------------------------------------------------------------------
// Painel direito (inspector) ? depende do slide selecionado
// ----------------------------------------------------------------------------
function InspectorSection({
  value,
  title,
  description,
  children,
}: {
  value: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <AccordionItem value={value} className="surface-raised rounded-lg border border-border/50 px-3">
      <AccordionTrigger className="py-3 text-left hover:no-underline">
        <div className="space-y-0.5">
          <div className="slides-type-section">{title}</div>
          <p className="slides-type-helper leading-snug">{description}</p>
        </div>
      </AccordionTrigger>
      <AccordionContent className="pb-3 pt-0">
        {children}
      </AccordionContent>
    </AccordionItem>
  );
}

function Inspector({
  item,
  onOpenFullscreen,
  readOnly,
}: {
  item: SlideItem | null;
  onOpenFullscreen: () => void;
  readOnly: boolean;
}) {
  const updateItem = useSlidesFlow((s) => s.updateItem);
  const pricing = usePricing((s) => s.rows);
  const budget = useBudget((s) => s.rows);

  if (!item) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/40 text-muted-foreground/60">
          <Layers className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <p className="slides-type-section">{t.inspector.emptyTitle}</p>
          <p className="slides-type-helper">
            {t.inspector.emptyHint}
          </p>
        </div>
      </div>
    );
  }

  const meta = metaOf(item.kind);
  const Icon = ICON_MAP[meta.icon];
  const ready = isItemReady(item);
  const statusItems = [
    ...(!ready.ok ? [{ title: t.inspector.health.incompleteConfig, detail: ready.reason }] : []),
  ];
  const guardedUpdateItem = (updater: Parameters<typeof updateItem>[1]) => {
    if (readOnly) {
      toast.info(t.common.readOnlyToast);
      return;
    }
    updateItem(item.id, updater);
  };

  return (
    <ScrollArea className="h-full">
      <div className="space-y-5 p-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border", ACCENT_BG[meta.accent])}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="slides-type-label">{meta.title}</div>
            <Input
              value={item.label ?? ""}
              readOnly={readOnly}
              onChange={(e) => guardedUpdateItem((it) => ({ ...it, label: e.target.value } as SlideItem))}
              placeholder={meta.title}
              className="-ml-2 h-8 border-transparent bg-transparent px-2 slides-type-title hover:bg-secondary/40 focus-visible:bg-card"
            />
            <p className="mt-1 slides-type-helper">{meta.description}</p>
          </div>
        </div>

        <Separator />

        <Tabs defaultValue="status" className="space-y-4">
          <TabsList className="grid h-9 w-full grid-cols-4 rounded-lg bg-surface-raised p-1">
            <TabsTrigger value="status" className="text-[11px]">{t.inspector.tabs.status}</TabsTrigger>
            <TabsTrigger value="preview" className="text-[11px]">{t.inspector.tabs.preview}</TabsTrigger>
            <TabsTrigger value="config" className="text-[11px]">{t.inspector.tabs.config}</TabsTrigger>
            <TabsTrigger value="notes" className="text-[11px]">{t.inspector.tabs.notes}</TabsTrigger>
          </TabsList>

          <TabsContent value="status" className="mt-0 space-y-3">
            <div className="space-y-1">
              <div className="slides-type-section">{t.inspector.health.section}</div>
              <p className="slides-type-helper">{t.inspector.health.description}</p>
            </div>
            <div className={cn(
              "min-w-0 rounded-lg border p-3",
              ready.ok
                ? "border-success/40 bg-success/10 text-success"
                : "border-destructive/50 bg-destructive/10 text-destructive",
            )}>
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2 slides-type-section">
                  {ready.ok ? <ShieldCheck className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
                  {ready.ok ? t.inspector.health.ready : t.inspector.health.incomplete}
                </div>
                {statusItems.length > 0 && (
                  <Badge variant="outline" className="h-5 shrink-0 border-current/30 bg-background/50 px-1.5 slides-type-badge text-current">
                    {t.inspector.health.pointsCount(statusItems.length)}
                  </Badge>
                )}
              </div>
              <div className="mt-2 min-w-0 space-y-1.5 slides-type-helper leading-snug">
                {statusItems.length === 0 ? (
                  <p>{t.inspector.health.allGood}</p>
                ) : (
                  statusItems.map((statusItem, idx) => (
                    <div key={`${statusItem.title}-${idx}`} className="min-w-0 rounded-md bg-surface-base/70 px-2 py-1.5 [overflow-wrap:anywhere]">
                      <span className="font-medium">{statusItem.title}:</span>{" "}
                      <span className="break-words">{statusItem.detail}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="preview" className="mt-0 space-y-3">
            <div className="space-y-1">
              <div className="slides-type-section">{t.inspector.preview.section}</div>
              <p className="slides-type-helper">{t.inspector.preview.description}</p>
            </div>
            <div className="surface-raised rounded-lg border border-border/50 p-3">
              <SlidePreview item={item} />
            </div>
          </TabsContent>

          <TabsContent value="config" className="mt-0 space-y-3">
            <div className="space-y-1">
              <div className="slides-type-section">{t.inspector.config.section}</div>
              <p className="slides-type-helper">{t.inspector.config.description}</p>
            </div>
            <Accordion type="multiple" defaultValue={["period", "filters", "appearance"]} className="space-y-3">
              {(item.kind === "bridge_pvm" || item.kind === "budget_evo") && (
                <InspectorSection
                  value="period"
                  title={t.inspector.config.period.title}
                  description={t.inspector.config.period.description}
                >
                  {item.kind === "bridge_pvm" && (
                    <BridgePvmConfigPanel item={item} readOnly={readOnly} onChange={(next) => guardedUpdateItem(() => next)} />
                  )}
                  {item.kind === "budget_evo" && (
                    <BudgetEvoConfigPanel item={item} readOnly={readOnly} onChange={(next) => guardedUpdateItem(() => next)} />
                  )}
                </InspectorSection>
              )}

              {item.kind === "cover" && (
                <InspectorSection
                  value="appearance"
                  title={t.inspector.config.appearanceCover.title}
                  description={t.inspector.config.appearanceCover.description}
                >
                  <CoverConfigPanel item={item} readOnly={readOnly} onChange={(next) => guardedUpdateItem(() => next)} />
                </InspectorSection>
              )}

              {item.kind === "custom" && (
                <InspectorSection
                  value="appearance"
                  title={t.inspector.config.appearanceCustom.title}
                  description={t.inspector.config.appearanceCustom.description}
                >
                  <CustomSlideFullscreenTrigger onOpen={onOpenFullscreen} />
                </InspectorSection>
              )}

              {meta.supportsFilters && (item.kind === "bridge_pvm" || item.kind === "budget_evo") && (
                <InspectorSection
                  value="filters"
                  title={t.inspector.config.filters.title}
                  description={t.inspector.config.filters.description}
                >
                  <FiltersPanel
                    value={item.config.filters}
                    readOnly={readOnly}
                    onChange={(filters) => guardedUpdateItem((it) => {
                      if (it.kind !== "bridge_pvm" && it.kind !== "budget_evo") return it;
                      return { ...it, config: { ...it.config, filters } } as SlideItem;
                    })}
                    pricing={pricing}
                    budget={budget}
                  />
                </InspectorSection>
              )}
            </Accordion>
          </TabsContent>

          <TabsContent value="notes" className="mt-0 space-y-3">
            <div className="space-y-1">
              <div className="slides-type-section">{t.inspector.notes.section}</div>
              <p className="slides-type-helper">{t.inspector.notes.description}</p>
            </div>
            <div className="surface-raised rounded-lg border border-border/50 p-3">
              <SpeakerNotesInspector item={item} readOnly={readOnly} onChange={(notes) => guardedUpdateItem((it) => ({
                ...it,
                config: { ...(it.config as object), speakerNotes: notes },
              } as SlideItem))} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  );
}

function SpeakerNotesInspector({ item, onChange, readOnly = false }: { item: SlideItem; onChange: (v: string) => void; readOnly?: boolean }) {
  const MAX = 500;
  const value = ((item.config as { speakerNotes?: string }).speakerNotes ?? "");
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t.speakerNotes.label}
        </Label>
        <span className="text-[10px] tabular-nums text-muted-foreground">{value.length}/{MAX}</span>
      </div>
      <Textarea
        rows={4}
        value={value.slice(0, MAX)}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value.slice(0, MAX))}
        placeholder={t.speakerNotes.placeholder}
        className="resize-none text-xs"
        maxLength={MAX}
      />
    </div>
  );
}

// ----------------------------------------------------------------------------
// Diálogos de presets
// ----------------------------------------------------------------------------
function SavePresetDialog({
  triggerClassName = "h-8 w-8 text-muted-foreground",
  triggerLabel,
}: {
  triggerClassName?: string;
  triggerLabel?: string;
}) {
  const items = useSlidesFlow((s) => s.items);
  const savePreset = useSlidesFlow((s) => s.savePreset);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size={triggerLabel ? "sm" : "icon"}
          className={triggerClassName}
          disabled={items.length === 0}
          aria-label={t.savePresetDialog.triggerAriaLabel}
          title={t.savePresetDialog.triggerAriaLabel}
        >
          <Save className="h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.savePresetDialog.dialogTitle}</DialogTitle>
          <DialogDescription>
            {t.savePresetDialog.description(items.length)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t.savePresetDialog.name}</Label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.savePresetDialog.namePlaceholder}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t.savePresetDialog.descriptionLabel}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder={t.savePresetDialog.descriptionPlaceholder}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>{t.common.cancelar}</Button>
          <Button
            onClick={() => {
              const p = savePreset(name, description);
              toast.success(t.savePresetDialog.savedToast(p.name));
              setName(""); setDescription("");
              setOpen(false);
            }}
            disabled={!name.trim()}
          >
            {t.common.salvar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function safePresetFileName(name: string): string {
  const cleaned = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || "modelo-slides";
}

function exportPresetModel(preset: SlidesPreset) {
  const payload = {
    schema: "omni4.slidesPresetExport.v1",
    exportedAt: new Date().toISOString(),
    preset: {
      id: preset.id,
      name: preset.name,
      description: preset.description,
      createdAt: preset.createdAt,
      updatedAt: preset.updatedAt,
      items: preset.items,
    },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safePresetFileName(preset.name)}.omni4-modelo.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function readPresetModelFile(file: File): Promise<SlidesPreset> {
  const text = await file.text();
  const payload = JSON.parse(text) as {
    schema?: string;
    preset?: Partial<SlidesPreset>;
  };
  if (payload.schema !== "omni4.slidesPresetExport.v1") {
    throw new Error(t.presets.invalidFile);
  }
  if (!payload.preset || !Array.isArray(payload.preset.items)) {
    throw new Error(t.presets.missingItems);
  }
  const now = Date.now();
  return {
    id: typeof payload.preset.id === "string" ? payload.preset.id : `${now}`,
    name: typeof payload.preset.name === "string" ? payload.preset.name : file.name.replace(/\.omni4-modelo\.json$/i, ""),
    description: typeof payload.preset.description === "string" ? payload.preset.description : undefined,
    items: payload.preset.items,
    createdAt: typeof payload.preset.createdAt === "number" ? payload.preset.createdAt : now,
    updatedAt: typeof payload.preset.updatedAt === "number" ? payload.preset.updatedAt : now,
  } as SlidesPreset;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function usePersistentWidth(key: string, initial: number, min: number, max: number) {
  const [width, setWidthState] = useState(() => {
    if (typeof window === "undefined") return initial;
    const stored = Number(window.localStorage.getItem(key));
    return Number.isFinite(stored) ? clampNumber(stored, min, max) : initial;
  });

  const setWidth = useCallback((next: number) => {
    const clamped = clampNumber(Math.round(next), min, max);
    setWidthState(clamped);
    try {
      window.localStorage.setItem(key, String(clamped));
    } catch {
      // Layout persistence is a convenience.
    }
  }, [key, max, min]);

  return [width, setWidth] as const;
}

function ResizeHandle({
  side,
  onResize,
}: {
  side: "left" | "right";
  onResize: (delta: number) => void;
}) {
  return (
    <button
      type="button"
      aria-label={t.resizeHandleAriaLabel}
      className={cn(
        "absolute top-0 z-30 h-full w-2 cursor-col-resize bg-transparent transition-colors hover:bg-primary/20",
        side === "right" ? "-right-1" : "-left-1",
      )}
      onPointerDown={(e) => {
        e.preventDefault();
        const startX = e.clientX;
        const handleMove = (ev: PointerEvent) => {
          const rawDelta = ev.clientX - startX;
          onResize(side === "right" ? rawDelta : -rawDelta);
        };
        const handleUp = () => {
          window.removeEventListener("pointermove", handleMove);
          window.removeEventListener("pointerup", handleUp);
        };
        window.addEventListener("pointermove", handleMove);
        window.addEventListener("pointerup", handleUp, { once: true });
      }}
    />
  );
}

type SlidesRailTab = "catalog" | "templates" | "assets" | "presets";

function QuickAddSlideButton({
  onAdd,
}: {
  onAdd: (kind: SlideKind) => void;
}) {
  const common: SlideKind[] = ["custom", "bridge_pvm", "budget_evo", "cover"];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="mx-auto mt-5 flex min-h-16 w-[172px] items-center justify-center gap-2 rounded-2xl border border-primary/35 bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[0_18px_45px_-22px_hsl(var(--primary)/0.9)] transition hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-[0_22px_52px_-24px_hsl(var(--primary)/0.95)] disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={t.quickAdd.ariaLabel}
          title={t.quickAdd.ariaLabel}
        >
          <Plus className="h-5 w-5" />
          {t.quickAdd.button}
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-56 p-2">
        <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t.quickAdd.popoverHeader}
        </div>
        {common.map((kind) => {
          const meta = metaOf(kind);
          const Icon = ICON_MAP[meta.icon];
          return (
            <button
              key={kind}
              type="button"
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs transition-colors hover:bg-secondary"
              onClick={() => onAdd(kind)}
            >
              <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg border", ACCENT_BG[meta.accent])}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block font-medium">{meta.title}</span>
                <span className="block truncate text-[10px] text-muted-foreground">{meta.description}</span>
              </span>
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

function ShareActionButton({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: Icon;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-20 flex-col items-center justify-center gap-2 rounded-lg border border-border/50 bg-background text-xs font-medium transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Icon className="h-5 w-5 text-primary" />
      <span>{label}</span>
    </button>
  );
}

function PresetsPanel({ onLoadedDeck }: { onLoadedDeck?: (items: SlideItem[], name: string) => void }) {
  const presets = useSlidesFlow((s) => s.presets);
  const loadPreset = useSlidesFlow((s) => s.loadPreset);
  const deletePreset = useSlidesFlow((s) => s.deletePreset);
  const overwritePreset = useSlidesFlow((s) => s.overwritePreset);
  const importPreset = useSlidesFlow((s) => s.importPreset);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const { requestConfirm, dialog: confirmDialog } = useSlideConfirm();

  const handleImportPresetFile = async (file: File | null | undefined) => {
    if (!file) return;
    try {
      const preset = await readPresetModelFile(file);
      const imported = importPreset(preset);
      toast.success(t.presets.importedToast(imported.name));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.presets.importError);
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const importControl = (
    <>
      <input
        ref={importInputRef}
        type="file"
        accept=".omni4-modelo.json,application/json"
        className="hidden"
        onChange={(event) => void handleImportPresetFile(event.target.files?.[0])}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 text-xs"
        onClick={() => importInputRef.current?.click()}
      >
        <Upload className="h-3.5 w-3.5" />
        {t.presets.importButton}
      </Button>
    </>
  );

  if (presets.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/50 bg-secondary/10 px-4 py-6 text-center text-xs text-muted-foreground">
        <div className="mb-3">{importControl}</div>
        {t.presets.empty}
      </div>
    );
  }
  return (
    <>
    <div className="mb-2 flex justify-end">
      {importControl}
    </div>
    <div className="space-y-1.5">
      {presets
        .slice()
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((p) => (
          <div key={p.id} className="group flex flex-wrap items-center gap-2 rounded-lg border border-border/40 bg-card/50 p-2 transition-colors hover:border-border/70">
            <Bookmark className="h-3.5 w-3.5 shrink-0 text-primary" />
            <div className="min-w-[110px] flex-1">
              <div className="truncate text-xs font-medium">{p.name}</div>
              <div className="text-[10px] text-muted-foreground">
                {p.items.length} slide(s) · {new Date(p.updatedAt).toLocaleDateString("pt-BR")}
              </div>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <Button
                variant="ghost" size="icon" className="h-6 w-6"
                title={t.presets.loadTitle}
                onClick={() => {
                  loadPreset(p.id);
                  onLoadedDeck?.(useSlidesFlow.getState().items, p.name);
                  toast.success(t.presets.loadedToast(p.name));
                }}
              >
                <RotateCcw className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost" size="icon" className="h-6 w-6"
                title={t.presets.overwriteTitle}
                onClick={() => { overwritePreset(p.id); toast.success(t.presets.overwrittenToast(p.name)); }}
              >
                <Save className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost" size="icon" className="h-6 w-6"
                title={t.presets.exportTitle}
                onClick={() => {
                  exportPresetModel(p);
                  toast.success(t.presets.exportedToast(p.name));
                }}
              >
                <Download className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost" size="icon" className="h-6 w-6 hover:text-destructive"
                title={t.presets.deleteTitle}
                onClick={async () => {
                  const confirmed = await requestConfirm({
                    title: t.presets.deleteConfirm.title,
                    description: t.presets.deleteConfirm.description(p.name, p.items.length),
                    confirmLabel: t.presets.deleteConfirm.confirmLabel,
                  });
                  if (confirmed) deletePreset(p.id);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
    </div>
    {confirmDialog}
    </>
  );
}

// ----------------------------------------------------------------------------
// Página
// ----------------------------------------------------------------------------
interface SlidesBetaProps {
  onMinimize?: () => void;
  isStandby?: boolean;
}

export default function SlidesBeta({ onMinimize, isStandby = false }: SlidesBetaProps) {
  usePageTitle(t.page.title, !isStandby);
  const reduceMotion = useReducedMotion();
  const items = useSlidesFlow((s) => s.items);
  const selectedId = useSlidesFlow((s) => s.selectedId);
  const select = useSlidesFlow((s) => s.select);
  const addItem = useSlidesFlow((s) => s.addItem);
  const updateItem = useSlidesFlow((s) => s.updateItem);
  const removeItem = useSlidesFlow((s) => s.removeItem);
  const duplicateItem = useSlidesFlow((s) => s.duplicateItem);
  const duplicateDeck = useSlidesFlow((s) => s.duplicateDeck);
  const reorder = useSlidesFlow((s) => s.reorder);
  const clearItems = useSlidesFlow((s) => s.clearItems);
  const transition = useSlidesFlow((s) => s.transition);

  const months = useMonthsInfo();
  const budgetRowsAll = useBudget((s) => s.rows);
  const budgetMonths = useMemo(() => {
    const map = new Map<string, { periodo: string; mes: number; ano: number }>();
    for (const r of budgetRowsAll) {
      if (!map.has(r.periodo)) map.set(r.periodo, { periodo: r.periodo, mes: r.mes, ano: r.ano });
    }
    return Array.from(map.values()).sort((a, b) => a.ano - b.ano || a.mes - b.mes);
  }, [budgetRowsAll]);

  const addWithDefaults = (kind: SlideKind): string | null => {
    addItem(kind);
    // O zustand atualiza items síncronamente; pegamos o último item criado.
    const state = useSlidesFlow.getState();
    const created = state.items[state.items.length - 1];
    if (!created) return null;
    const def = smartDefaults(kind, { months, budgetMonths });
    if (def) {
      updateItem(created.id, (it) => {
        if (it.kind === "bridge_pvm" && created.kind === "bridge_pvm") {
          return { ...it, config: { ...it.config, ...def } } as SlideItem;
        }
        if (it.kind === "budget_evo" && created.kind === "budget_evo") {
          return { ...it, config: { ...it.config, ...def } } as SlideItem;
        }
        return it;
      });
    }
    return created.id;
  };

  const addSlideFromShortcut = (kind: SlideKind): string | null => {
    const id = addWithDefaults(kind);
    if (id && typeof window !== "undefined" && window.innerWidth < 1200) {
      setActiveRailTab(null);
    }
    return id;
  };


  const pricingRows = usePricing((s) => s.rows);
  const budgetRows = useBudget((s) => s.rows);
  const metric = usePricing((s) => s.metric);

  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [dragging, setDragging] = useState<{ source: "catalog"; kind: SlideKind } | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [presentationOpen, setPresentationOpen] = useState(false);
  const [presentationPresenterMode, setPresentationPresenterMode] = useState(false);
  const [activeRailTab, setActiveRailTab] = useState<SlidesRailTab | null>(null);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [leftPanelWidth, setLeftPanelWidth] = usePersistentWidth("omni4.slides.leftPanelWidth", 320, 300, 460);
  const [rightPanelWidth, setRightPanelWidth] = usePersistentWidth("omni4.slides.rightPanelWidth", 360, 340, 540);
  const springTransition = reduceMotion
    ? { duration: 0.01 }
    : { type: "spring" as const, stiffness: 360, damping: 34, mass: 0.85 };
  const [templateApplying, setTemplateApplying] = useState(false);
  const [importApplying, setImportApplying] = useState(false);
  const [deckPreparation, setDeckPreparation] = useState<DeckPreparationState | null>(null);
  const deckPreparationGenerationRef = useRef(0);
  const deckPreparationSkippedRef = useRef(false);
  const preparedDeckSignaturesRef = useRef(new Set<string>());
  const initialDeckPreparationCheckedRef = useRef(false);
  const [exportConfirm, setExportConfirm] = useState<ExportFormat | null>(null);
  const filteredSlideCatalog = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    if (!q) return SLIDE_CATALOG;
    return SLIDE_CATALOG.filter((slide) => {
      const meta = metaOf(slide.kind);
      return `${meta.title} ${meta.description} ${slide.kind}`.toLowerCase().includes(q);
    });
  }, [catalogSearch]);

  const startDeckPreparation = useCallback((deckItems: SlideItem[], title: string = t.deckPreparation.defaultTitle) => {
    if (deckItems.length <= DECK_PREP_THRESHOLD) return false;
    if (typeof window === "undefined") return false;
    const signature = deckPreparationSignature(deckItems);
    if (preparedDeckSignaturesRef.current.has(signature)) return false;

    deckPreparationGenerationRef.current += 1;
    const generation = deckPreparationGenerationRef.current;
    deckPreparationSkippedRef.current = false;
    // So preparamos de forma sincrona o que ja esta de fato visivel na tira
    // quando o deck abre (rolagem comeca no topo). O resto fica para o
    // IntersectionObserver da tira (visible/preload, ao rolar) e para o
    // preenchimento em segundo plano via requestIdleCallback — sem isso, um
    // deck de 48 slides fazia 48 capturas reais de DOM em fila sequencial
    // (MAX_THUMBNAIL_RENDERERS = 1) antes de devolver o controle a pessoa.
    const queuedItems = deckItems.slice(0, Math.min(deckItems.length, estimateInitialVisibleSlideCount()));
    const total = queuedItems.length;
    const startedAt = Date.now();
    let warmedChartBlocks = 0;

    setDeckPreparation({
      visible: true,
      title,
      total,
      done: 0,
      currentLabel: t.deckPreparation.preparingSlideN(total),
      etaLabel: t.deckPreparation.calculatingEta,
      skipped: false,
    });

    void (async () => {
      for (let index = 0; index < queuedItems.length; index += 1) {
        if (generation !== deckPreparationGenerationRef.current) return;
        const item = queuedItems[index];
        const slideName = item.label || metaOf(item.kind).title;
        setDeckPreparation((previous) => previous && generation === deckPreparationGenerationRef.current
          ? {
              ...previous,
              visible: !deckPreparationSkippedRef.current,
              currentLabel: t.deckPreparation.preparingSlideNOf(index + 1, total, slideName),
              etaLabel: formatDeckPreparationEta(startedAt, index, total),
              skipped: deckPreparationSkippedRef.current,
            }
          : previous);

        try {
          // Sem useData:false aqui: a tira sempre le a variante "rich" (padrao
          // de useSlideThumbnailKey), entao gerar a variante "light" seria uma
          // segunda captura de DOM inteira que ninguem le — desperdicio que
          // dobrava o tempo de abertura antes desta correcao.
          await warmSlideThumbnail(item, { priority: "visible" });
          const remainingChartBudget = Math.max(0, DECK_PREP_MAX_CHART_BLOCKS_TOTAL - warmedChartBlocks);
          if (remainingChartBudget > 0) {
            warmedChartBlocks += await warmSlideChartData(item, {
              maxBlocks: Math.min(DECK_PREP_MAX_CHART_BLOCKS_PER_SLIDE, remainingChartBudget),
              onBlock: yieldDeckPreparationFrame,
            });
          }
        } catch {
          // Uma miniatura ou calculo com erro nao deve impedir o restante do deck de aquecer.
        }

        const done = index + 1;
        setDeckPreparation((previous) => previous && generation === deckPreparationGenerationRef.current
          ? {
              ...previous,
              visible: !deckPreparationSkippedRef.current,
              done,
              currentLabel: done >= total ? t.deckPreparation.done : t.deckPreparation.preparingNextOf(Math.min(done + 1, total), total),
              etaLabel: formatDeckPreparationEta(startedAt, done, total),
              skipped: deckPreparationSkippedRef.current,
            }
          : previous);
        await yieldDeckPreparationFrame();
      }

      if (generation !== deckPreparationGenerationRef.current) return;
      preparedDeckSignaturesRef.current.add(signature);
      setDeckPreparation(null);
    })();

    return true;
  }, []);

  const skipDeckPreparationOverlay = useCallback(() => {
    deckPreparationSkippedRef.current = true;
    setDeckPreparation((previous) => previous ? { ...previous, visible: false, skipped: true } : previous);
    slideToastInfo(t.deckPreparation.skippedToast);
  }, []);

  const { requestConfirm, dialog: confirmDialog } = useSlideConfirm();
  // Status REAL de gravacao da esteira (nao um "achismo"): vem direto do
  // resultado da escrita em disco/localStorage feito pelo zustand persist —
  // ver subscribeSlidesFlowSaveStatus em src/store/slidesFlow.ts. Antes,
  // este indicador so verificava se um localStorage.getItem nao lançava
  // excecao, o que e sempre verdade e nunca refletia se a gravacao
  // realmente aconteceu — por isso uma falha de gravacao (ex.: cota do
  // localStorage estourada) podia ficar meses mostrando "Salvo localmente"
  // enquanto nada de novo era persistido.
  const [localSaveStatus, setLocalSaveStatus] = useState<SlidesFlowSaveStatus>(
    () => getSlidesFlowSaveStatus().status,
  );
  const [localSaveError, setLocalSaveError] = useState<string | null>(
    () => getSlidesFlowSaveStatus().error,
  );

  useEffect(() => subscribeSlidesFlowSaveStatus((status, error) => {
    setLocalSaveStatus(status);
    setLocalSaveError(error);
  }), []);

  const openPresentation = (presenter = false) => {
    setPresentationPresenterMode(presenter);
    setPresentationOpen(true);
  };

  const applyTemplate = (tpl: SlideTemplate) => {
    setTemplateApplying(true);
    window.setTimeout(() => {
      try {
    const built = tpl.build({ months, budgetMonths });
    if (built.length === 0) {
      // "Em Branco" ? apenas fecha o modal.
      setTemplateApplying(false);
      return;
    }
    // Insere cada slide via addItem + updateItem para reaproveitar a lógica
    // do store (sem precisar de uma nova action setItems).
    for (const slide of built) {
      addItem(slide.kind);
      const state = useSlidesFlow.getState();
      const created = state.items[state.items.length - 1];
      if (!created) continue;
      updateItem(created.id, () => ({ ...slide, id: created.id } as SlideItem));
    }
        const nextDeck = useSlidesFlow.getState().items;
        slideToastSuccess(t.page.templateAppliedToast(tpl.name));
        setTemplateApplying(false);
        startDeckPreparation(nextDeck, t.deckPreparation.preparingTemplate(tpl.name));
        return;
      } catch {
        slideToastError(t.page.templateApplyError);
      } finally {
        setTemplateApplying(false);
      }
    }, 180);
  };

  const selected = useMemo(() => items.find((i) => i.id === selectedId) ?? null, [items, selectedId]);
  useIdleSlidePrecompute(items, selectedId);
  useIdleSlideChartPrecompute(items, selectedId);
  useEffect(() => {
    if (initialDeckPreparationCheckedRef.current || items.length === 0) return;
    initialDeckPreparationCheckedRef.current = true;
    startDeckPreparation(items, t.deckPreparation.defaultTitle);
  }, [items, startDeckPreparation]);
  const readyAll = items.every((i) => isItemReady(i).ok);
  const {
    exporting,
    fileName,
    setFileName,
    handleExport,
    handleExportPdf,
  } = useSlideExport({
    items,
    readyAll,
    pricingRows,
    budgetRows,
    metric,
  });

  const exportDisabledReason = useMemo(() => {
    if (items.length === 0) return t.page.exportDisabledReason.noSlides;
    const incomplete = items.filter((i) => !isItemReady(i).ok).length;
    if (incomplete > 0) {
      return t.page.exportDisabledReason.incomplete(incomplete);
    }
    return null;
  }, [items]);

  const confirmExport = async () => {
    const format = exportConfirm;
    setExportConfirm(null);
    if (format === "pdf") await handleExportPdf();
    else await handleExport();
  };

  const flowPreviewWindow = useVirtualPreviewWindow(items.length, FLOW_CARD_ESTIMATED_HEIGHT);
  const flowSortableIds = useMemo(() => items.map((item) => item.id), [items]);
  const flowThumbnailScheduler = useThumbnailVisibilityScheduler(flowPreviewWindow.viewportRef);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const onDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as { source?: string; kind?: SlideKind } | undefined;
    if (data?.source === "catalog" && data.kind) setDragging({ source: "catalog", kind: data.kind });
  };
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const { active, over } = e;
    if (!over) return;
    const activeData = active.data.current as { source?: string; kind?: SlideKind } | undefined;

    // Drop vindo do catálogo ? adiciona à esteira
    if (activeData?.source === "catalog" && activeData.kind) {
      const newId = addWithDefaults(activeData.kind);
      if (!newId) return;
      // Se soltou sobre um item existente, move para essa posição
      const overId = String(over.id);
      const currentItems = useSlidesFlow.getState().items;
      const targetIdx = currentItems.findIndex((i) => i.id === overId);
      if (targetIdx >= 0 && overId !== newId) {
        reorder(newId, overId);
      }
      select(newId);
      return;
    }

    // Reordenação dentro da esteira
    if (active.id === over.id) return;
    reorder(String(active.id), String(over.id));
  };

  return (
    <>
      <Topbar
        title={t.page.title}
        showPeriodStrip={false}
        subtitle={t.page.subtitle}
      />
      {localSaveStatus === "error" && (
        <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 md:px-8">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 text-xs text-destructive sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
              <div className="space-y-0.5">
                <p className="font-medium">{t.page.saveErrorBanner.message}</p>
                <p className="text-destructive/80">
                  {t.page.saveErrorBanner.detail}
                  {localSaveError ? t.page.saveErrorBanner.technicalDetail(localSaveError) : ""}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 shrink-0 gap-2 border-destructive/40 bg-background/70 text-destructive hover:bg-destructive/10"
              onClick={() => setExportConfirm("pptx")}
              disabled={items.length === 0}
            >
              <Download className="h-3.5 w-3.5" />
              {t.page.saveErrorBanner.exportNow}
            </Button>
          </div>
        </div>
      )}
      <AnimatePresence initial={false}>
        {deckPreparation?.visible && (
          <motion.div
            key="deck-preparation"
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/70 px-4 backdrop-blur-md"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0 }}
            transition={springTransition}
          >
          <motion.div
            className="surface-overlay w-full max-w-md rounded-2xl border border-border/60 p-5 shadow-2xl"
            initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
            transition={springTransition}
          >
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
              <div className="min-w-0 space-y-1">
                <div className="slides-type-section text-sm">{deckPreparation.title}</div>
                <p className="slides-type-helper leading-snug">
                  {t.deckPreparation.dialogHint}
                </p>
              </div>
            </div>
            <Progress
              value={Math.round((deckPreparation.done / Math.max(1, deckPreparation.total)) * 100)}
              className="h-2"
            />
            <div className="mt-3 flex items-center justify-between gap-3 text-xs">
              <div className="min-w-0">
                <div className="truncate font-medium text-foreground">{deckPreparation.currentLabel}</div>
                <div className="text-muted-foreground">{deckPreparation.etaLabel}</div>
              </div>
              <div className="shrink-0 font-semibold tabular-nums text-primary">
                {deckPreparation.done}/{deckPreparation.total}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-4 w-full text-muted-foreground"
              onClick={skipDeckPreparationOverlay}
            >
              {t.deckPreparation.skipButton}
            </Button>
          </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
      >
      <div
        className="grid h-[calc(100vh-3.5rem)] min-h-0 gap-0 overflow-hidden transition-[grid-template-columns] duration-200 ease-out"
        style={{
          gridTemplateColumns: `56px minmax(0,1fr) ${inspectorOpen ? `${rightPanelWidth}px` : "36px"}`,
        }}
      >
        {/* ===== Coluna esquerda: catálogo + presets ===== */}
        <aside className="surface-panel relative z-50 flex min-h-0 border-r border-border/40">
          <div className="flex w-14 flex-col items-center gap-1 border-r border-border/40 bg-surface-panel/80 py-3">
            {([
              { id: "catalog" as const, label: t.page.railTabs.catalog, icon: LayoutTemplate },
              { id: "templates" as const, label: t.page.railTabs.templates, icon: Sparkles },
              { id: "assets" as const, label: t.page.railTabs.assets, icon: ImageIcon },
              { id: "presets" as const, label: t.page.railTabs.presets, icon: Bookmark },
            ]).map((tab) => {
              const Icon = tab.icon;
              const active = activeRailTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveRailTab(active ? null : tab.id)}
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground",
                    active && "bg-primary/15 text-primary ring-1 ring-primary/20",
                  )}
                  aria-label={tab.label}
                  title={tab.label}
                >
                  <Icon className="h-5 w-5" />
                </button>
              );
            })}
          </div>

          <AnimatePresence initial={false}>
          {activeRailTab && (
            <motion.div
              key="slides-rail-panel"
              className="surface-overlay absolute left-14 top-0 z-40 flex h-full min-h-0 flex-col border-r border-border/50"
              style={{ width: leftPanelWidth }}
              initial={reduceMotion ? false : { opacity: 0, x: -18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -14 }}
              transition={springTransition}
            >
              <ResizeHandle side="right" onResize={(delta) => setLeftPanelWidth(leftPanelWidth + delta)} />
              <div className="flex items-center justify-between border-b border-border/40 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  {activeRailTab === "catalog" && <LayoutTemplate className="h-4 w-4 text-primary" />}
                  {activeRailTab === "templates" && <Sparkles className="h-4 w-4 text-primary" />}
                  {activeRailTab === "assets" && <ImageIcon className="h-4 w-4 text-primary" />}
                  {activeRailTab === "presets" && <Bookmark className="h-4 w-4 text-primary" />}
                  <span className="slides-type-section">
                    {activeRailTab === "catalog" ? t.page.railTabs.catalog : activeRailTab === "templates" ? t.page.railTabs.templates : activeRailTab === "assets" ? t.page.railTabs.assets : t.page.railTabs.presets}
                  </span>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setActiveRailTab(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <ScrollArea className="flex-1">
                <div className="space-y-3 p-3">
                  {activeRailTab === "catalog" && (
                    <>
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={catalogSearch}
                          onChange={(e) => setCatalogSearch(e.target.value)}
                          placeholder={t.page.catalog.searchPlaceholder}
                          className="h-9 bg-surface-base pl-8 text-sm"
                        />
                      </div>
                      <Button
                        className="h-12 w-full justify-start gap-3 rounded-lg"
                        onClick={() => addSlideFromShortcut("custom")}
                      >
                        <Plus className="h-4 w-4" />
                        <span className="flex flex-col items-start leading-tight">
                          <span className="slides-type-section">{t.page.catalog.blankSlide}</span>
                          <span className="slides-type-helper font-normal opacity-80">{t.page.catalog.blankSlideHint}</span>
                        </span>
                      </Button>
                      <div className="slides-type-label text-muted-foreground/60">
                        {t.page.catalog.availableSlides}
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {filteredSlideCatalog.map((s) => (
                          <DraggableCatalogItem
                            key={s.kind}
                            kind={s.kind}
                            onClick={() => addSlideFromShortcut(s.kind)}
                          />
                        ))}
                      </div>
                      {filteredSlideCatalog.length === 0 && (
                        <div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
                          {t.page.catalog.noneFound}
                        </div>
                      )}
                    </>
                  )}
                  {activeRailTab === "templates" && (
                    <div className="space-y-2">
                      <Button className="w-full justify-start gap-2" variant="outline" onClick={() => setGalleryOpen(true)}>
                        <Sparkles className="h-4 w-4" /> {t.page.templates.openGallery}
                      </Button>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {t.page.templates.hint}
                      </p>
                    </div>
                  )}
                  {activeRailTab === "assets" && (
                    <div className="space-y-2 rounded-xl border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
                      <ImageIcon className="mx-auto h-6 w-6 text-muted-foreground/70" />
                      {t.page.assets.hint}
                      <Button className="mt-2 w-full gap-2" size="sm" variant="outline" onClick={() => setImportOpen(true)}>
                        <Upload className="h-3.5 w-3.5" /> {t.page.assets.importButton}
                      </Button>
                    </div>
                  )}
                  {activeRailTab === "presets" && (
                    <PresetsPanel
                      onLoadedDeck={(loadedItems, name) => {
                        startDeckPreparation(loadedItems, t.deckPreparation.preparingModel(name));
                      }}
                    />
                  )}
                </div>
              </ScrollArea>
            </motion.div>
          )}
          </AnimatePresence>
        </aside>

        {/* ===== Coluna central: esteira ===== */}
        <main className="surface-base relative flex flex-col overflow-hidden">
          {/* Header da esteira */}
          <div className="surface-panel flex items-center justify-between gap-2 border-b border-border/40 px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <h2 className="slides-type-section">{t.page.esteira.title}</h2>
              <Badge variant="secondary" className="h-5 px-2 slides-type-badge tabular-nums">
                {items.length} {t.page.esteira.slideCount(items.length)}
              </Badge>
              {items.length > 0 && (
                 <span className="slides-type-label text-muted-foreground/70 tabular-nums">
                  {t.page.esteira.minutesEstimate(Math.max(1, Math.round((items.length * 30) / 60)))}
                </span>
              )}
              {!readyAll && items.length > 0 && (
                 <Badge variant="outline" className="h-5 border-warning/40 px-2 slides-type-badge text-warning">
                  {t.page.esteira.incomplete}
                </Badge>
              )}
              <LocalSaveStatusBadge status={localSaveStatus} />
            </div>
            <TooltipProvider delayDuration={200}>
              <div className="flex items-center gap-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline" size="sm" className="h-8 gap-1.5"
                      onClick={() => setGalleryOpen(true)}
                      aria-label={t.page.esteira.templatesAriaLabel}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      {t.page.esteira.templatesButton}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t.page.esteira.templatesTooltip}</TooltipContent>
                </Tooltip>
                {onMinimize && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5"
                        onClick={onMinimize}
                        aria-label={t.page.esteira.minimizeAriaLabel}
                      >
                        <PanelRightClose className="h-3.5 w-3.5" />
                        {t.page.esteira.minimizeButton}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t.page.esteira.minimizeTooltip}</TooltipContent>
                  </Tooltip>
                )}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5" aria-label={t.page.esteira.shareAriaLabel}>
                      <Share2 className="h-3.5 w-3.5" />
                      {t.page.esteira.shareButton}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="surface-overlay w-[360px] p-4">
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-2">
                        <ShareActionButton icon={Download} label="PPTX" disabled={!!exportDisabledReason || exporting} onClick={() => setExportConfirm("pptx")} />
                        <ShareActionButton icon={FileText} label="PDF" disabled={!!exportDisabledReason || exporting} onClick={() => setExportConfirm("pdf")} />
                        <ShareActionButton icon={Play} label={t.page.esteira.present} disabled={items.length === 0} onClick={() => openPresentation(false)} />
                      </div>
                      {exportDisabledReason && (
                        <p className="text-[11px] leading-relaxed text-muted-foreground">{exportDisabledReason}</p>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground" aria-label={t.page.esteira.moreAriaLabel}>
                      <MoreHorizontal className="h-4 w-4" />
                      {t.page.esteira.moreButton}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="surface-overlay w-72 p-2">
                    <div className="px-2 pb-1 slides-type-label text-muted-foreground/70">{t.page.esteira.moreOptions}</div>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-secondary"
                      onClick={() => setImportOpen(true)}
                    >
                      <Upload className="h-4 w-4 text-muted-foreground" />
                      {t.page.esteira.importPptx}
                    </button>
                    <SavePresetDialog triggerClassName="h-8 w-full justify-start gap-2 px-2 text-xs text-muted-foreground" triggerLabel={t.page.esteira.savePreset} />
                    {items.length > 0 && (
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => {
                          duplicateDeck();
                          toast.success(t.page.esteira.duplicatedToast(items.length));
                        }}
                      >
                        <Copy className="h-4 w-4 text-muted-foreground" />
                        {t.page.esteira.duplicateDeck}
                      </button>
                    )}
                    {items.length > 0 && (
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => {
                          void requestConfirm({
                            title: t.page.esteira.clearConfirm.title,
                            description: t.page.esteira.clearConfirm.description(items.length),
                            confirmLabel: t.page.esteira.clearConfirm.confirmLabel,
                          }).then((confirmed) => {
                            if (confirmed) clearItems();
                          });
                        }}
                      >
                        <X className="h-4 w-4" />
                        {t.page.esteira.clearDeck}
                      </button>
                    )}
                    <div className="mt-2 border-t border-border/40 px-2 pt-2">
                      <Label className="slides-type-label">{t.page.esteira.fileName}</Label>
                      <Input
                        value={fileName}
                        onChange={(e) => setFileName(e.target.value)}
                        className="mt-1.5 h-8 text-xs"
                        placeholder={t.page.esteira.fileNamePlaceholder}
                      />
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline" size="sm" className="hidden"
                      onClick={() => setImportOpen(true)}
                      aria-label={t.page.esteira.importPptxAriaLabel}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {t.page.esteira.importPptx}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t.page.esteira.importPptxTooltip}</TooltipContent>
                </Tooltip>
                <SavePresetDialog triggerClassName="hidden" />
                {items.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost" size="icon" className="hidden"
                        onClick={() => {
                          duplicateDeck();
                          toast.success(t.page.esteira.duplicatedToast(items.length));
                        }}
                        aria-label={t.page.esteira.duplicateDeckAriaLabel}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t.page.esteira.duplicateDeckTooltip}</TooltipContent>
                  </Tooltip>
                )}
                {items.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost" size="icon" className="hidden"
                        onClick={() => {
                          void requestConfirm({
                            title: t.page.esteira.clearConfirm.title,
                            description: t.page.esteira.clearConfirm.description(items.length),
                            confirmLabel: t.page.esteira.clearConfirm.confirmLabel,
                          }).then((confirmed) => {
                            if (confirmed) clearItems();
                          });
                        }}
                        aria-label={t.page.esteira.clearDeckAriaLabel}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t.page.esteira.clearDeckTooltip}</TooltipContent>
                  </Tooltip>
                )}
                <div className="mx-2 h-6 w-px bg-border/50" />
                <TransitionSelect />
                <div className="mx-1 h-5 w-px bg-border/50" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="default" size="sm" className="h-10 gap-2 rounded-r-none px-4 text-sm font-semibold shadow-[0_14px_34px_-20px_hsl(var(--primary)/0.9)]"
                      disabled={items.length === 0}
                      onClick={() => openPresentation(false)}
                      aria-label={t.page.esteira.startPresentationAriaLabel}
                    >
                      <Play className="h-4 w-4" />
                      {t.page.esteira.present}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t.page.esteira.startPresentation}</TooltipContent>
                </Tooltip>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="default"
                      size="sm"
                      className="-ml-1.5 h-10 rounded-l-none border-l border-primary-foreground/20 px-2 shadow-[0_14px_34px_-20px_hsl(var(--primary)/0.9)]"
                      disabled={items.length === 0}
                      aria-label={t.page.esteira.presentationModeAriaLabel}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="surface-overlay w-72 p-1.5">
                    <DropdownMenuItem className="items-start gap-3 rounded-md p-3" onClick={() => openPresentation(false)}>
                      <MonitorPlay className="mt-0.5 h-4 w-4 text-primary" />
                      <span className="space-y-0.5">
                        <span className="block slides-type-section">{t.page.esteira.fullscreenMode.title}</span>
                        <span className="block slides-type-helper">{t.page.esteira.fullscreenMode.description}</span>
                      </span>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="items-start gap-3 rounded-md p-3" onClick={() => openPresentation(true)}>
                      <Timer className="mt-0.5 h-4 w-4 text-primary" />
                      <span className="space-y-0.5">
                        <span className="block slides-type-section">{t.page.esteira.presenterMode.title}</span>
                        <span className="block slides-type-helper">{t.page.esteira.presenterMode.description}</span>
                      </span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className="hidden" />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost" size="icon" className="hidden"
                      aria-label={t.page.esteira.fileNameAriaLabel}
                      title={t.page.esteira.fileNameTitle(fileName)}
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="surface-overlay w-72 p-3">
                    <Label className="slides-type-label">
                      {t.page.esteira.fileName}
                    </Label>
                    <Input
                      value={fileName}
                      onChange={(e) => setFileName(e.target.value)}
                      className="mt-1.5 h-9 text-sm"
                      placeholder={t.page.esteira.fileNamePlaceholder}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </TooltipProvider>
          </div>

          {/* Conteúdo da esteira */}
          <div
            ref={flowPreviewWindow.viewportRef}
            onScroll={flowPreviewWindow.onScroll}
            className="flex-1 overflow-y-auto"
          >
            <div className="mx-auto max-w-3xl px-4 py-5">
              <FlowDropZone>
                {items.length === 0 ? (
                  <EmptyFlow onAdd={addWithDefaults} onOpenGallery={() => setGalleryOpen(true)} />
                ) : (
                  <SortableContext items={flowSortableIds} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {items.map((item, idx) => (
                        <FlowCard
                          key={item.id}
                          item={item}
                          index={idx}
                          selected={selectedId === item.id}
                          previewVisible={flowPreviewWindow.isPreviewVisible(idx) || selectedId === item.id}
                          thumbnailRef={flowThumbnailScheduler.getRefCallback(item)}
                          onSelect={() => select(item.id)}
                          onRemove={() => removeItem(item.id)}
                          onDuplicate={() => duplicateItem(item.id)}
                        />
                      ))}
                      <QuickAddSlideButton onAdd={addSlideFromShortcut} />
                    </div>
                  </SortableContext>
                )}
              </FlowDropZone>
            </div>
          </div>
          {(templateApplying || importApplying || exporting) && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/55 backdrop-blur-sm">
              <div className="surface-overlay flex min-w-[260px] items-center gap-3 rounded-xl border border-border/60 px-4 py-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <div>
                  <div className="slides-type-section">
                    {exporting ? t.page.esteira.loadingExporting : importApplying ? t.page.esteira.loadingImporting : t.page.esteira.loadingTemplate}
                  </div>
                  <div className="slides-type-helper">
                    {exporting ? t.page.esteira.loadingExportingHint : t.page.esteira.loadingDefaultHint}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* ===== Coluna direita: inspector (recolhível) ===== */}
        <aside className="surface-panel relative flex min-h-0 flex-col border-l border-border/40 transition-all duration-200 ease-out">
          {inspectorOpen && (
            <ResizeHandle side="left" onResize={(delta) => setRightPanelWidth(rightPanelWidth + delta)} />
          )}
          <button
            type="button"
            onClick={() => setInspectorOpen((v) => !v)}
            className="surface-raised absolute left-0 top-20 z-10 flex h-9 w-7 -translate-x-1/2 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-all hover:scale-105 hover:text-foreground"
            aria-label={inspectorOpen ? t.page.inspectorAside.collapseAriaLabel : t.page.inspectorAside.expandAriaLabel}
            title={inspectorOpen ? t.page.inspectorAside.collapseTitle : t.page.inspectorAside.expandTitle}
          >
            {inspectorOpen ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </button>
          {inspectorOpen ? (
            <Inspector
              item={selected}
              readOnly={false}
              onOpenFullscreen={() => setFullscreenOpen(true)}
            />
          ) : (
            <div className="flex h-full items-center justify-center px-1 text-[10px] font-medium uppercase tracking-[0.25em] text-muted-foreground/70 [writing-mode:vertical-rl]">
              {t.page.inspectorAside.collapsedLabel}
            </div>
          )}
        </aside>
      </div>
      <DragOverlay>
        {dragging ? (() => {
          const meta = metaOf(dragging.kind);
          const Icon = ICON_MAP[meta.icon];
          return (
            <div className="flex items-center gap-2 rounded-xl border border-primary/50 bg-card px-3 py-2 shadow-xl">
              <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg border", ACCENT_BG[meta.accent])}>
                <Icon className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium">{meta.title}</span>
            </div>
          );
        })() : null}
      </DragOverlay>
      </DndContext>
      <Dialog open={!!exportConfirm} onOpenChange={(open) => !open && setExportConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-4 w-4 text-primary" />
              {t.page.exportConfirm.title}
            </DialogTitle>
            <DialogDescription>
              {t.page.exportConfirm.description}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-lg border border-border/50 bg-muted/20 p-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{t.page.exportConfirm.file}</span>
              <span className="text-right font-medium">{fileName.replace(/\.(pptx?|pdf)$/i, "")}.{exportConfirm ?? "pptx"}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{t.page.exportConfirm.format}</span>
              <span className="font-medium uppercase">{exportConfirm ?? "pptx"}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{t.page.exportConfirm.slides}</span>
              <span className="font-medium">{items.length}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExportConfirm(null)}>{t.common.cancelar}</Button>
            <Button onClick={confirmExport} disabled={exporting || !!exportDisabledReason} className="gap-2">
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {t.page.exportConfirm.confirmButton}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <TemplateGallery
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        ctx={{ months, budgetMonths }}
        onSelect={applyTemplate}
      />
      <ImportPptxDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={(slides: PptxSlide[], selectedIndices: number[]) => {
          setImportApplying(true);
          setImportOpen(false);
          window.setTimeout(() => {
            try {
              for (const idx of selectedIndices) {
                const slide = slides[idx];
                if (!slide) continue;
                addItem("custom");
                const state = useSlidesFlow.getState();
                const created = state.items[state.items.length - 1];
                if (!created) continue;
                const imageBlock: ImageBlock = {
                  id: crypto.randomUUID(),
                  kind: "image",
                  x: 0, y: 0,
                  w: CANVAS_W, h: CANVAS_H,
                  z: 1,
                  src: slide.thumbnailDataUrl ?? "",
                  fit: "cover",
                };
                updateItem(created.id, (it) =>
                  it.kind === "custom"
                    ? {
                        ...it,
                        label: t.page.importDialog.importedSlideLabel(slide.numero),
                        config: {
                          background: "FFFFFF",
                          showHaraldFooter: false,
                          blocks: slide.thumbnailDataUrl ? [imageBlock] : [],
                        },
                      } as typeof it
                    : it,
                );
              }
              slideToastSuccess(t.page.importDialog.successToast(selectedIndices.length));
              const nextDeck = useSlidesFlow.getState().items;
              setImportApplying(false);
              startDeckPreparation(nextDeck, t.deckPreparation.preparingImported);
              return;
            } catch {
              slideToastError(t.page.importDialog.errorToast);
            } finally {
              setImportApplying(false);
            }
          }, 180);
        }}
      />
      <FullscreenCustomEditor
        open={fullscreenOpen}
        onOpenChange={setFullscreenOpen}
        currentUser={LOCAL_COMMENT_AUTHOR}
        readOnly={false}
        isStandby={isStandby}
        onMinimize={onMinimize}
      />

      {confirmDialog}

      {presentationOpen && (
        <PresentationMode
          currentSlideId={selectedId ?? items[0]?.id}
          initialPresenterMode={presentationPresenterMode}
          onClose={() => setPresentationOpen(false)}
        />
      )}
    </>
  );
}

// ----------------------------------------------------------------------------
// TransitionSelect ? chooses the deck-wide slide transition.
// ----------------------------------------------------------------------------
