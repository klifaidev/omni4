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
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { MultiSelectFilter } from "@/components/pricing/MultiSelectFilter";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowRight, Bell, BookOpen, Bookmark, ChevronLeft, ChevronRight, Copy, Download, FileText, Filter as FilterIcon,
  GitBranch, GripVertical, Image as ImageIcon, Layers, LayoutTemplate, Loader2, MessageSquare, History, CheckCheck, Send, Plus, Play, RotateCcw, Save, ShieldCheck, SlidersHorizontal, Sparkles, StickyNote, Target, Trash2, Upload, Users2, X,
  MonitorPlay, RefreshCw, Share2, Timer,
  Search,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { usePricing } from "@/store/pricing";
import { useBudget } from "@/store/budget";
import { useFyList, useMonthsInfo } from "@/store/selectors";
import { useSlidesFlow, type SlidesPreset } from "@/store/slidesFlow";
import {
  SLIDE_CATALOG, defaultItem, isItemReady, metaOf,
  type SlideItem, type SlideKind,
} from "@/lib/slidesFlow";
import { buildSlidesPreflight, type SlidePreflightIssue, type SlidePreflightSeverity } from "@/lib/slidesPreflight";
import { smartDefaults } from "@/lib/slidesSmartDefaults";
import { guardSlideReadOnly } from "@/lib/slidesReadOnly";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Filters, FilterKey, PricingRow } from "@/lib/types";
import type { BudgetRow } from "@/lib/budget";
import { SlidePreview, ScaledPreview } from "@/components/pricing/SlidePreview";
import { CustomSlideEditor } from "@/components/pricing/custom/CustomSlideEditor";
import { TemplateGallery } from "@/components/pricing/custom/TemplateGallery";
import { ImportPptxDialog } from "@/components/pricing/custom/ImportPptxDialog";
import type { PptxSlide } from "@/components/pricing/custom/ImportPptxDialog";
import { CANVAS_W, CANVAS_H } from "@/lib/customSlide";
import type { CustomBlock, CustomSlideConfig, ImageBlock } from "@/lib/customSlide";
import { PresentationMode } from "@/components/pricing/custom/PresentationMode";
import { ActiveFiltersBar } from "@/components/pricing/ActiveFiltersBar";
import type { SlideTemplate } from "@/lib/slideTemplates";
import { usePageTitle } from "@/hooks/use-page-title";
import { useCollaboration } from "@/hooks/use-collaboration";
import type { CollabUser } from "@/lib/collaboration";
import { initials } from "@/lib/kanban";
import {
  addComment, deleteComment, getComments, getUnresolvedCount, reopenComment,
  replaceComments, resolveComment, setCommentStorageScope, subscribe as subscribeComments,
  type SlideComment, type SlideCommentEvent,
} from "@/lib/slideComments";
import { readLog, clearLog, subscribeLog, type ChangeLogEntry } from "@/lib/slideChangeLog";
import { formatDistanceToNow, format as formatDate } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DraggableCatalogItem, EmptyFlow, FlowCard, FlowDropZone } from "@/components/pricing/slides/SlideCatalogFlow";
import { SLIDE_ACCENT_BG as ACCENT_BG, SLIDE_ICON_MAP as ICON_MAP } from "@/components/pricing/slides/slideUiTokens";
import { PreflightPopover } from "@/components/pricing/slides/SlidesPreflightPopover";
import { TransitionSelect } from "@/components/pricing/slides/TransitionSelect";
import { useSlideExport } from "@/hooks/useSlideExport";
import {
  createPersistentCollabRoom,
  getPersistentCollabRoleLabel,
  joinPersistentCollabRoom,
  loadPersistentCollabComments,
  normalizeCollabCode,
  savePersistentCollabComment,
  savePersistentCollabSnapshot,
  type CreatePersistentRoomResult,
  type PersistentCollabRole,
} from "@/lib/persistentCollab";
import {
  isEdgeFunctionQuotaError,
  recordCollabDegradedLog,
  type CollabDegradedReason,
} from "@/lib/collabDegradedMode";
import {
  createSupabaseYjsProvider,
  getTextAwarenessStates,
  type SupabaseYjsProvider,
  type YjsTextAwarenessState,
} from "@/lib/supabaseYjsProvider";
import {
  customSlideConfigToYDoc,
  yDocToCustomSlideConfig,
} from "@/lib/customSlideYjs";

type ExportFormat = "pptx" | "pdf";
type Icon = ComponentType<{ className?: string }>;
const CUSTOM_YJS_STORE_SYNC_MS = 120;
const APP_VERSION = (() => {
  const fallback = import.meta.env.VITE_APP_VERSION ?? "omni4-slides-client";
  if (typeof window === "undefined") return fallback;
  return localStorage.getItem("omni4.collab.testAppVersion") || fallback;
})();
const COLLAB_PROTOCOL_VERSION = 1;
const DOWNLOAD_URL = "https://github.com/klifaidev/omni4/releases/latest";

function slideToastSuccess(message: string) {
  toast.success(message, { icon: <CheckCheck className="h-4 w-4 text-success" /> });
}

function slideToastInfo(message: string) {
  toast.info(message, { icon: <Sparkles className="h-4 w-4 text-primary" /> });
}

function slideToastError(message: string) {
  toast.error(message, { icon: <X className="h-4 w-4 text-destructive" /> });
}

function stableBlock(prev: CustomBlock | undefined, next: CustomBlock): CustomBlock {
  if (!prev) return next;
  return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
}

function mergeCustomSlideConfigRefs(prev: CustomSlideConfig, next: CustomSlideConfig): CustomSlideConfig {
  const prevById = new Map(prev.blocks.map((block) => [block.id, block]));
  let blocksChanged = prev.blocks.length !== next.blocks.length;
  const blocks = next.blocks.map((block, index) => {
    const stable = stableBlock(prevById.get(block.id), block);
    if (stable !== prev.blocks[index]) blocksChanged = true;
    return stable;
  });
  return {
    ...next,
    blocks: blocksChanged ? blocks : prev.blocks,
    groups: JSON.stringify(prev.groups ?? []) === JSON.stringify(next.groups ?? [])
      ? prev.groups
      : next.groups,
  };
}

function versionParts(version: string): number[] {
  const clean = version.replace(/^v/i, "").match(/\d+(?:\.\d+)*/)?.[0] ?? "";
  return clean.split(".").filter(Boolean).map((part) => Number(part));
}

function compareVersions(a: string, b: string): number {
  const aa = versionParts(a);
  const bb = versionParts(b);
  const max = Math.max(aa.length, bb.length);
  for (let i = 0; i < max; i += 1) {
    const diff = (aa[i] ?? 0) - (bb[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

function triggerUpdateNow(): void {
  const api = (window as unknown as { electronAPI?: { checkForUpdates?: () => void } }).electronAPI;
  if (api?.checkForUpdates) {
    api.checkForUpdates();
    slideToastInfo("Verificando atualizações...");
    return;
  }
  window.open(DOWNLOAD_URL, "_blank", "noopener,noreferrer");
}

async function retryAsync<T>(operation: () => Promise<T>, attempts = 2, delayMs = 900): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await new Promise((resolve) => window.setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
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
    title: "Comercial",
    variant: "comercial",
    keys: ["canal", "canalAjustado", "regiao", "uf", "regional", "mercado", "mercadoAjustado"],
  },
  {
    title: "Produto",
    variant: "sku",
    keys: ["marca", "categoria", "subcategoria", "formato", "sabor", "tecnologia", "faixaPeso", "sku"],
  },
  {
    title: "Inovação",
    variant: "inovacao",
    keys: ["inovacao", "legado"],
  },
];

const FILTER_LABEL: Record<FilterKey, string> = {
  marca: "Marca",
  canal: "Canal",
  canalAjustado: "Canal Ajustado",
  categoria: "Categoria",
  subcategoria: "Subcategoria",
  formato: "Formato",
  sku: "SKU",
  regiao: "Região",
  uf: "UF",
  regional: "Regional",
  mercado: "Mercado",
  mercadoAjustado: "Mercado Ajustado",
  sabor: "Sabor",
  tecnologia: "Tecnologia",
  faixaPeso: "Faixa de Peso",
  inovacao: "Inovação",
  legado: "Legado",
};

const PREFLIGHT_SEVERITY_RANK: Record<SlidePreflightSeverity, number> = {
  error: 3,
  warning: 2,
  info: 1,
};

function highestPreflightSeverity(issues: SlidePreflightIssue[]): SlidePreflightSeverity | null {
  return issues.reduce<SlidePreflightSeverity | null>((highest, issue) => {
    if (!highest) return issue.severity;
    return PREFLIGHT_SEVERITY_RANK[issue.severity] > PREFLIGHT_SEVERITY_RANK[highest] ? issue.severity : highest;
  }, null);
}

function preflightSeverityLabel(severity: SlidePreflightSeverity | null): string {
  if (severity === "error") return "Incompleto";
  if (severity === "warning") return "Com alerta";
  if (severity === "info") return "Com observacao";
  return "Pronto";
}

function preflightSeverityClasses(severity: SlidePreflightSeverity | null): string {
  if (severity === "error") return "border-destructive/50 bg-destructive/10 text-destructive";
  if (severity === "warning") return "border-warning/50 bg-warning/10 text-warning";
  if (severity === "info") return "border-primary/40 bg-primary/10 text-primary";
  return "border-success/40 bg-success/10 text-success";
}

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
      toast.info("Modo somente leitura");
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
          Filtros do slide
          {activeCount > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {activeCount} ativo(s)
            </Badge>
          )}
        </div>
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" disabled={readOnly} onClick={() => onChange({})}>
            <X className="h-3 w-3" /> Limpar
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
        <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Modo</Label>
        <Select
          disabled={readOnly}
          value={cfg.mode}
          onValueChange={(v) => onChange({ ...item, config: { ...cfg, mode: v as "fy" | "month", base: null, comp: null } })}
        >
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="month">Mês a mês</SelectItem>
            <SelectItem value="fy">Ano fiscal</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <div className="space-y-1.5">
          <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Base</Label>
          <Select
            disabled={readOnly}
            value={cfg.base ?? undefined}
            onValueChange={(v) => onChange({ ...item, config: { ...cfg, base: v } })}
          >
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Escolha..." /></SelectTrigger>
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
          <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Comparação</Label>
          <Select
            disabled={readOnly}
            value={cfg.comp ?? undefined}
            onValueChange={(v) => onChange({ ...item, config: { ...cfg, comp: v } })}
          >
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Escolha..." /></SelectTrigger>
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
        map.set(r.periodo, { periodo: r.periodo, mes: r.mes, ano: r.ano, label: `${["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][r.mes-1]}/${String(r.ano).slice(-2)}` });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.ano - b.ano || a.mes - b.mes);
  }, [budgetRows]);

  const cfg = item.config;
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Mês inicial</Label>
        <Select
          disabled={readOnly}
          value={cfg.start ?? "__auto__"}
          onValueChange={(v) => onChange({ ...item, config: { ...cfg, start: v === "__auto__" ? null : v } })}
        >
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__auto__">Automático (FY anterior)</SelectItem>
            {months.map((m) => <SelectItem key={m.periodo} value={m.periodo}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Mês final</Label>
        <Select
          disabled={readOnly}
          value={cfg.end ?? "__auto__"}
          onValueChange={(v) => onChange({ ...item, config: { ...cfg, end: v === "__auto__" ? null : v } })}
        >
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__auto__">Automático (último disponível)</SelectItem>
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
        <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Estilo</Label>
        <Select
          disabled={readOnly}
          value={cfg.variant}
          onValueChange={(v) => onChange({ ...item, config: { ...cfg, variant: v as "cover" | "divider" } })}
        >
          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="cover">Capa principal (vermelha)</SelectItem>
            <SelectItem value="divider">Divisor de seção (branco)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Título</Label>
        <Input
          value={cfg.title}
          readOnly={readOnly}
          onChange={(e) => onChange({ ...item, config: { ...cfg, title: e.target.value } })}
          className="h-9 text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Subtítulo (opcional)</Label>
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
        O editor de slide personalizado abre em tela cheia, com strip lateral
        para navegar entre os slides do deck.
      </div>
      <Button onClick={onOpen} className="w-full gap-2" size="sm">
        <LayoutTemplate className="h-4 w-4" />
        Abrir editor em tela cheia
      </Button>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Strip lateral de slides ? thumbnails empilhados verticalmente, ordenáveis.
// ----------------------------------------------------------------------------
function StripThumbnail({
  item, index, active, onClick, editingUsers,
  currentUser, onCommentEvent, preflightIssues = [],
}: {
  item: SlideItem;
  index: number;
  active: boolean;
  onClick: () => void;
  editingUsers?: CollabUser[];
  currentUser: { name: string; color: string };
  onCommentEvent?: (event: SlideCommentEvent) => void;
  preflightIssues?: SlidePreflightIssue[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const editors = editingUsers ?? [];
  const firstEditorColor = editors[0]?.color;
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    ...(firstEditorColor ? { borderColor: firstEditorColor, borderWidth: 2 } : {}),
  };
  const meta = metaOf(item.kind);
  const Icon = ICON_MAP[meta.icon];
  const hasNotes = !!((item.config as { speakerNotes?: string }).speakerNotes ?? "").trim();
  const preflightSeverity = highestPreflightSeverity(preflightIssues);

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
        "group relative cursor-pointer rounded-md border bg-card transition-colors",
        active ? "border-primary ring-2 ring-primary/40" : "border-border/40 hover:border-border/80",
        preflightSeverity === "error" && !active && "border-destructive/50",
        preflightSeverity === "warning" && !active && "border-warning/50",
        preflightSeverity === "info" && !active && "border-primary/35",
        preflightSeverity && "shadow-[0_0_0_1px_hsl(var(--background))]",
      )}
    >
      {preflightSeverity && (
        <div
          className={cn(
            "absolute left-1 top-1 z-10 flex h-4 w-4 items-center justify-center rounded-full border bg-background shadow-sm",
            preflightSeverityClasses(preflightSeverity),
          )}
          title={`${preflightSeverityLabel(preflightSeverity)}: ${preflightIssues.length} ponto(s) no preflight`}
        >
          <AlertTriangle className="h-2.5 w-2.5" />
        </div>
      )}
      {hasNotes && (
        <div
          className="absolute right-1 top-1 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-primary/90 text-primary-foreground shadow-sm"
          title="Possui anotações do apresentador"
        >
          <StickyNote className="h-2.5 w-2.5" />
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
        <div className="pointer-events-none mx-auto w-full max-w-[132px] min-w-[82px] overflow-hidden rounded-sm">
          <ScaledPreview item={item} targetWidth={112} />
        </div>
      </div>
      <div className="truncate px-1.5 pb-1.5 text-[10px] font-medium" title={item.label ?? meta.title}>
        {item.label ?? meta.title}
      </div>
      {editors.length > 1 && (
        <div
          className="absolute bottom-1 right-1 z-10 rounded-full px-1.5 py-0.5 text-[9px] font-semibold text-white shadow-sm"
          style={{ background: firstEditorColor ?? "#333" }}
          title={`${editors.length} pessoas editando`}
        >
          +{editors.length - 1}
        </div>
      )}

      {/* Botão de comentários (hover + sempre visível se houver não-resolvidos) */}
      <Popover open={commentsOpen} onOpenChange={setCommentsOpen} modal={false}>
        <PopoverTrigger asChild>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setCommentsOpen((v) => !v); }}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              "absolute left-1 top-1 z-10 flex h-5 items-center gap-0.5 rounded-md bg-card/90 px-1 text-muted-foreground shadow-sm transition-opacity hover:text-foreground",
              unresolvedCount > 0 ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
            aria-label="Comentários do slide"
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
            slideLabel={item.label ?? meta.title}
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
    const t = text.trim();
    if (!t) return;
    const c: SlideComment = {
      id: typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `c_${Math.random().toString(36).slice(2, 10)}`,
      slideId,
      author: currentUser.name || "Convidado",
      authorColor: currentUser.color,
      text: t,
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
        Comentários ? <span className="text-muted-foreground">{slideLabel}</span>
      </div>
      <ScrollArea className="max-h-72 flex-1">
        <div className="space-y-3 p-3">
          {comments.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">Sem comentários ainda.</p>
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
                      title="Marcar como resolvido"
                    >
                      <CheckCheck className="h-3 w-3" /> Resolver
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
                      title="Reabrir comentario"
                    >
                      Reabrir
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      deleteComment(slideId, c.id);
                      emitCommentChange("comment_delete", c);
                    }}
                    className="inline-flex items-center rounded px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title="Excluir comentario"
                  >
                    Excluir
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
          placeholder="Escreva um comentário?"
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
  open, onOpenChange, collaborators, isConnected, updateCursor, updateSlideId,
  currentUser, onCommentEvent, preflightIssuesBySlide, readOnly = false,
  yjsCollabReady = false, getCollabYDoc, textAwarenessBySlide = {},
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  readOnly?: boolean;
  preflightIssuesBySlide: Map<string, SlidePreflightIssue[]>;
  collaborators?: CollabUser[];
  isConnected?: boolean;
  updateCursor?: (x: number, y: number) => void;
  updateSlideId?: (slideId: string | null) => void;
  currentUser: { name: string; color: string };
  onCommentEvent?: (event: SlideCommentEvent) => void;
  yjsCollabReady?: boolean;
  getCollabYDoc?: (item: Extract<SlideItem, { kind: "custom" }>) => Y.Doc | null;
  textAwarenessBySlide?: Record<string, YjsTextAwarenessState[]>;
}) {
  const items = useSlidesFlow((s) => s.items);
  const selectedId = useSlidesFlow((s) => s.selectedId);
  const select = useSlidesFlow((s) => s.select);
  const updateItem = useSlidesFlow((s) => s.updateItem);
  const updateItemFromCollab = useSlidesFlow((s) => s.updateItemFromCollab);
  const addItem = useSlidesFlow((s) => s.addItem);
  const removeItem = useSlidesFlow((s) => s.removeItem);
  const reorder = useSlidesFlow((s) => s.reorder);

  const current = items.find((i) => i.id === selectedId) ?? null;
  const idx = current ? items.findIndex((i) => i.id === current.id) : -1;
  const isCustom = current?.kind === "custom";
  const currentCustomYDoc = current?.kind === "custom" && getCollabYDoc ? getCollabYDoc(current) : null;

  // Se o slide selecionado deixou de ser custom, fecha o editor.
  useEffect(() => {
    if (open && current && !isCustom) onOpenChange(false);
  }, [open, current, isCustom, onOpenChange]);

  // Atualiza o slideId do usuário local no presence sempre que a seleção muda.
  useEffect(() => {
    if (!updateSlideId) return;
    if (open && isCustom && current) updateSlideId(current.id);
    else if (!open) updateSlideId(null);
  }, [open, current, isCustom, updateSlideId]);

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
    toast.info("Modo somente leitura");
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

  const handleRemoveCurrent = () => {
    if (guardReadOnly()) return;
    if (!current) return;
    const hasContent = current.kind === "custom" && current.config.blocks.length > 0;
    if (hasContent && !confirm(`Remover "${current.label ?? "slide"}"? Os blocos serão perdidos.`)) return;
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[100vh] w-[100vw] max-w-none flex-col gap-3 rounded-none border-0 p-3 sm:rounded-none"
        style={{ height: "100vh", maxHeight: "100vh" }}
      >
        <DialogHeader className="flex flex-row items-center justify-between gap-3 space-y-0 px-1">
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => goRel(-1)} disabled={!hasPrev}>
              <ChevronLeft className="h-3.5 w-3.5" /> Anterior
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => goRel(1)} disabled={!hasNext}>
              Próximo <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <span className="hidden text-[10px] text-muted-foreground/70 lg:inline">
              Ctrl + ? / ?
            </span>
          </div>
          {readOnly && (
            <Badge variant="outline" className="h-6 border-amber-500/50 bg-amber-500/10 px-2 text-[10px] font-semibold text-amber-600">
              Somente leitura
            </Badge>
          )}
          <div className="flex flex-1 flex-col items-center gap-0.5">
            <DialogTitle className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {idx >= 0 ? `Slide ${idx + 1} de ${items.length}` : "Editor de slide"}
            </DialogTitle>
            {current && (
              <Input
                value={current.label ?? ""}
                readOnly={readOnly}
                onChange={(e) => {
                  if (guardReadOnly()) return;
                  updateItem(current.id, (it) => ({ ...it, label: e.target.value } as SlideItem))
                }}
                placeholder="Nome do slide"
                className="h-8 w-72 border-transparent bg-transparent text-center text-sm font-medium hover:border-border/60 focus-visible:bg-card"
              />
            )}
          </div>
          <DialogDescription className="sr-only">
            Editor de slide personalizado com strip lateral de navegação.
          </DialogDescription>
          <div className="flex w-[200px] items-center justify-end gap-2">
            {isConnected && (
              <span className="relative inline-flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
            )}
            {(collaborators ?? []).length > 0 && (
              <TooltipProvider delayDuration={150}>
                <div className="flex items-center">
                  {(collaborators ?? []).slice(0, 4).map((c, i) => {
                    const slideIdx = items.findIndex((it) => it.id === c.slideId);
                    const tip = slideIdx >= 0
                      ? `${c.name} ? editando slide ${slideIdx + 1}`
                      : `${c.name} ? sem slide ativo`;
                    return (
                      <Tooltip key={c.id}>
                        <TooltipTrigger asChild>
                          <div
                            className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-background text-[11px] font-medium text-white"
                            style={{ background: c.color, marginLeft: i === 0 ? 0 : -8 }}
                          >
                            {initials(c.name)}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">{tip}</TooltipContent>
                      </Tooltip>
                    );
                  })}
                  {(collaborators ?? []).length > 4 && (
                    <div
                      className="ml-[-8px] flex h-7 min-w-[28px] items-center justify-center rounded-full border-2 border-background bg-muted px-1.5 text-[11px] font-medium text-foreground"
                    >
                      +{(collaborators ?? []).length - 4}
                    </div>
                  )}
                </div>
              </TooltipProvider>
            )}
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 gap-3">
          {/* Strip lateral */}
          <aside className="flex w-[120px] shrink-0 flex-col overflow-hidden rounded-lg border border-border/40 bg-card/30">
            <div className="border-b border-border/40 px-2 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              Slides ({items.length})
            </div>
            <ScrollArea className="flex-1">
              <DndContext sensors={stripSensors} collisionDetection={closestCenter} onDragEnd={onStripDragEnd}>
                <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col gap-1.5 p-1.5">
                    {items.map((it, i) => (
                      <StripThumbnail
                        key={it.id}
                        item={it}
                        index={i}
                        active={it.id === current?.id}
                        editingUsers={(collaborators ?? []).filter((c) => c.slideId === it.id)}
                        currentUser={currentUser}
                        onCommentEvent={onCommentEvent}
                        preflightIssues={preflightIssuesBySlide.get(it.id) ?? []}
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
            </ScrollArea>
            <div className="flex gap-1 border-t border-border/40 p-1.5">
              <Button
                variant="ghost" size="sm" className="h-7 flex-1 px-1"
                onClick={handleAddBlank}
                disabled={readOnly}
                title="Adicionar slide em branco"
              >
                <Plus className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost" size="sm" className="h-7 flex-1 px-1 text-destructive hover:text-destructive"
                onClick={handleRemoveCurrent}
                disabled={!current || readOnly}
                title="Remover slide atual"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </aside>

          {/* Canvas do editor */}
          <div className="min-w-0 flex-1">
            {current && isCustom ? (
              <CustomSlideEditor
                key={current.id}
                slideId={current.id}
                config={(current as Extract<SlideItem, { kind: "custom" }>).config}
                onChange={(cfg) => {
                  if (readOnly) {
                    toast.info("Modo somente leitura");
                    return;
                  }
                  if (yjsCollabReady) {
                    // Em sala ativa, o canvas customizado é sincronizado pelo Y.Doc.
                    // Refletimos no store local sem rebroadcastar o fluxo legado deck-op.
                    updateItemFromCollab({ id: current.id, patch: { config: cfg } as Partial<SlideItem> });
                    return;
                  }
                  updateItem(current.id, (it) =>
                    it.kind === "custom" ? ({ ...it, config: cfg } as SlideItem) : it,
                  );
                }}
                readOnly={readOnly}
                collaborators={collaborators}
                onCursorMove={updateCursor}
                collabYDoc={currentCustomYDoc}
                textAwareness={textAwarenessBySlide[current.id] ?? []}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Selecione um slide personalizado na strip ao lado.
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
    <AccordionItem value={value} className="rounded-lg border border-border/50 bg-card/35 px-3">
      <AccordionTrigger className="py-3 text-left hover:no-underline">
        <div className="space-y-0.5">
          <div className="text-sm font-semibold tracking-tight">{title}</div>
          <p className="text-[11px] font-normal leading-snug text-muted-foreground">{description}</p>
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
  preflightIssues = [],
}: {
  item: SlideItem | null;
  onOpenFullscreen: () => void;
  readOnly: boolean;
  preflightIssues?: SlidePreflightIssue[];
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
          <p className="text-sm font-medium tracking-tight">Nenhum slide selecionado</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Selecione um slide na esteira para ver a prévia e ajustar filtros.
          </p>
        </div>
      </div>
    );
  }

  const meta = metaOf(item.kind);
  const Icon = ICON_MAP[meta.icon];
  const ready = isItemReady(item);
  const preflightSeverity = highestPreflightSeverity(preflightIssues);
  const statusSeverity: SlidePreflightSeverity | null = !ready.ok || preflightSeverity === "error"
    ? "error"
    : preflightSeverity;
  const statusItems = [
    ...(!ready.ok ? [{ title: "Config incompleta", detail: ready.reason }] : []),
    ...preflightIssues.map((issue) => ({ title: issue.title, detail: issue.detail })),
  ];
  const guardedUpdateItem = (updater: Parameters<typeof updateItem>[1]) => {
    if (readOnly) {
      toast.info("Modo somente leitura");
      return;
    }
    updateItem(item.id, updater);
  };

  return (
    <ScrollArea className="h-full">
      <div className="space-y-5 p-5">
        <div className="flex items-start gap-3">
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border", ACCENT_BG[meta.accent])}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{meta.title}</div>
            <Input
              value={item.label ?? ""}
              readOnly={readOnly}
              onChange={(e) => guardedUpdateItem((it) => ({ ...it, label: e.target.value } as SlideItem))}
              placeholder={meta.title}
              className="-ml-2 h-8 border-transparent bg-transparent px-2 text-base font-medium hover:bg-secondary/40 focus-visible:bg-card"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">{meta.description}</p>
          </div>
        </div>

        <Separator />

        <div className={cn("rounded-lg border p-3", preflightSeverityClasses(statusSeverity))}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              {statusSeverity ? <AlertTriangle className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
              {preflightSeverityLabel(statusSeverity)}
            </div>
            {statusItems.length > 0 && (
              <Badge variant="outline" className="h-5 border-current/30 bg-background/50 px-1.5 text-[10px] text-current">
                {statusItems.length} ponto(s)
              </Badge>
            )}
          </div>
          <div className="mt-2 space-y-1.5 text-[11px] leading-snug">
            {statusItems.length === 0 ? (
              <p>Todos os campos essenciais estao preenchidos e nenhum risco foi encontrado.</p>
            ) : (
              statusItems.map((statusItem, idx) => (
                <div key={`${statusItem.title}-${idx}`} className="rounded-md bg-background/55 px-2 py-1.5">
                  <span className="font-medium">{statusItem.title}:</span>{" "}
                  <span>{statusItem.detail}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <Separator />

        <Accordion type="multiple" defaultValue={["preview", "period", "filters", "appearance", "notes"]} className="space-y-3">
          <InspectorSection
            value="preview"
            title="Previa"
            description="Mostra como este slide vai entrar na apresentacao."
          >
            <SlidePreview item={item} />
          </InspectorSection>

          {(item.kind === "bridge_pvm" || item.kind === "budget_evo") && (
            <InspectorSection
              value="period"
              title="Periodo"
              description="Define a janela de dados usada neste slide."
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
              title="Aparencia"
              description="Controla textos e estilo visual da capa ou divisor."
            >
              <CoverConfigPanel item={item} readOnly={readOnly} onChange={(next) => guardedUpdateItem(() => next)} />
            </InspectorSection>
          )}

          {item.kind === "custom" && (
            <InspectorSection
              value="appearance"
              title="Aparencia"
              description="Abre o Canva para ajustar blocos, layout e visual do slide."
            >
              <CustomSlideFullscreenTrigger onOpen={onOpenFullscreen} />
            </InspectorSection>
          )}

          {meta.supportsFilters && (item.kind === "bridge_pvm" || item.kind === "budget_evo") && (
            <InspectorSection
              value="filters"
              title="Filtros"
              description="Refina os dados deste slide sem alterar o restante do deck."
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

          <InspectorSection
            value="notes"
            title="Notas"
            description="Guarda lembretes para quem for apresentar este slide."
          >
            <SpeakerNotesInspector item={item} readOnly={readOnly} onChange={(notes) => guardedUpdateItem((it) => ({
              ...it,
              config: { ...(it.config as object), speakerNotes: notes },
            } as SlideItem))} />
          </InspectorSection>
        </Accordion>
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
          Anotações do apresentador
        </Label>
        <span className="text-[10px] tabular-nums text-muted-foreground">{value.length}/{MAX}</span>
      </div>
      <Textarea
        rows={4}
        value={value.slice(0, MAX)}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value.slice(0, MAX))}
        placeholder="Adicione notas para o apresentador..."
        className="resize-none text-xs"
        maxLength={MAX}
      />
    </div>
  );
}

// ----------------------------------------------------------------------------
// Diálogos de presets
// ----------------------------------------------------------------------------
function SavePresetDialog() {
  const items = useSlidesFlow((s) => s.items);
  const savePreset = useSlidesFlow((s) => s.savePreset);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"
          disabled={items.length === 0}
          aria-label="Salvar pré-definição"
          title="Salvar pré-definição"
        >
          <Save className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Salvar pré-definição</DialogTitle>
          <DialogDescription>
            Capture esta esteira de {items.length} slide(s) para reutilizar em apresentações futuras.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Check semanal de resultado"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição (opcional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Notas sobre quando usar esta pré-definição"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            onClick={() => {
              const p = savePreset(name, description);
              toast.success(`Pré-definição "${p.name}" salva.`);
              setName(""); setDescription("");
              setOpen(false);
            }}
            disabled={!name.trim()}
          >
            Salvar
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
      aria-label="Redimensionar painel"
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
  readOnly,
}: {
  onAdd: (kind: SlideKind) => void;
  readOnly: boolean;
}) {
  const common: SlideKind[] = ["custom", "bridge_pvm", "budget_evo", "cover"];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={readOnly}
          className="mx-auto mt-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-primary/50 bg-primary/10 text-primary shadow-[0_10px_30px_-18px_hsl(var(--primary)/0.8)] transition hover:scale-105 hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Adicionar slide"
          title="Adicionar slide"
        >
          <Plus className="h-7 w-7" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-56 p-2">
        <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Adicionar slide
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

function PresetsPanel() {
  const presets = useSlidesFlow((s) => s.presets);
  const loadPreset = useSlidesFlow((s) => s.loadPreset);
  const deletePreset = useSlidesFlow((s) => s.deletePreset);
  const overwritePreset = useSlidesFlow((s) => s.overwritePreset);

  if (presets.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/50 bg-secondary/10 px-4 py-6 text-center text-xs text-muted-foreground">
        Nenhuma pré-definição salva ainda.
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {presets
        .slice()
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((p) => (
          <div key={p.id} className="group flex items-center gap-2 rounded-lg border border-border/40 bg-card/50 p-2 transition-colors hover:border-border/70">
            <Bookmark className="h-3.5 w-3.5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{p.name}</div>
              <div className="text-[10px] text-muted-foreground">
                {p.items.length} slide(s) · {new Date(p.updatedAt).toLocaleDateString("pt-BR")}
              </div>
            </div>
            <Button
              variant="ghost" size="icon" className="h-6 w-6"
              title="Carregar"
              onClick={() => { loadPreset(p.id); toast.success(`"${p.name}" carregado.`); }}
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost" size="icon" className="h-6 w-6"
              title="Sobrescrever com a esteira atual"
              onClick={() => { overwritePreset(p.id); toast.success(`"${p.name}" atualizado.`); }}
            >
              <Save className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost" size="icon" className="h-6 w-6"
              title="Exportar modelo"
              onClick={() => {
                exportPresetModel(p);
                toast.success(`Modelo "${p.name}" exportado.`);
              }}
            >
              <Download className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost" size="icon" className="h-6 w-6 hover:text-destructive"
              title="Excluir"
              onClick={() => { if (confirm(`Excluir "${p.name}"?`)) deletePreset(p.id); }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Página
// ----------------------------------------------------------------------------
export default function SlidesBeta() {
  usePageTitle("Slides");
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
  const applySnapshotFromCollab = useSlidesFlow((s) => s.applySnapshotFromCollab);
  const updateItemFromCollab = useSlidesFlow((s) => s.updateItemFromCollab);

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
    if (viewOnly) { toast.info("Modo somente leitura"); return null; }
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
  const setMetric = usePricing((s) => s.setMetric);
  const pricingFilters = usePricing((s) => s.filters);
  const selectedPeriods = usePricing((s) => s.selectedPeriods);
  const setPricingFilter = usePricing((s) => s.setFilter);
  const clearPricingFilters = usePricing((s) => s.clearFilters);
  const togglePeriod = usePricing((s) => s.togglePeriod);
  const setAllPeriods = usePricing((s) => s.setAllPeriods);

  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [dragging, setDragging] = useState<{ source: "catalog"; kind: SlideKind } | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [presentationOpen, setPresentationOpen] = useState(false);
  const [presentationPresenterMode, setPresentationPresenterMode] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeRailTab, setActiveRailTab] = useState<SlidesRailTab | null>(null);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [leftPanelWidth, setLeftPanelWidth] = usePersistentWidth("omni4.slides.leftPanelWidth", 292, 220, 420);
  const [rightPanelWidth, setRightPanelWidth] = usePersistentWidth("omni4.slides.rightPanelWidth", 340, 280, 520);
  const [templateApplying, setTemplateApplying] = useState(false);
  const [importApplying, setImportApplying] = useState(false);
  const [exportConfirm, setExportConfirm] = useState<ExportFormat | null>(null);
  const filteredSlideCatalog = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    if (!q) return SLIDE_CATALOG;
    return SLIDE_CATALOG.filter((slide) => {
      const meta = metaOf(slide.kind);
      return `${meta.title} ${meta.description} ${slide.kind}`.toLowerCase().includes(q);
    });
  }, [catalogSearch]);

  // ====== Colaboração em tempo real ======
  const [collabOpen, setCollabOpen] = useState(false);
  const [collabName, setCollabName] = useState<string>(() =>
    typeof window === "undefined" ? "" : localStorage.getItem("collab-username") ?? "",
  );
  const [roomId, setRoomId] = useState<string | null>(null);
  const [persistentRoomDbId, setPersistentRoomDbId] = useState<string | null>(null);
  const [persistentCollabCode, setPersistentCollabCode] = useState<string | null>(null);
  const [persistentCollabContentKey, setPersistentCollabContentKey] = useState<CryptoKey | null>(null);
  const [persistentCollabRole, setPersistentCollabRole] = useState<PersistentCollabRole | null>(null);
  const [createdPersistentRoom, setCreatedPersistentRoom] = useState<CreatePersistentRoomResult | null>(null);
  const [collabJoinCode, setCollabJoinCode] = useState("");
  const [collabBusy, setCollabBusy] = useState<"create" | "join" | null>(null);
  const [collabSnapshotVersion, setCollabSnapshotVersion] = useState<number | null>(null);
  const [collabSaveStatus, setCollabSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [edgeDegradedSince, setEdgeDegradedSince] = useState<number | null>(null);
  const [degradedNow, setDegradedNow] = useState(() => Date.now());
  const [isFollowingHost, setIsFollowingHost] = useState(false);
  const [lastHostUpdateNotice, setLastHostUpdateNotice] = useState<string | null>(null);
  const lastSavedSnapshotRef = useRef<string>("");
  const saveTimerRef = useRef<number | null>(null);
  const savingRef = useRef(false);
  const customYDocsRef = useRef<Map<string, Y.Doc>>(new Map());
  const customYProvidersRef = useRef<Map<string, SupabaseYjsProvider>>(new Map());
  const customYAwarenessRef = useRef<Map<string, Awareness>>(new Map());
  const customYSyncDisposersRef = useRef<Map<string, () => void>>(new Map());
  const customYSyncTimersRef = useRef<Map<string, number>>(new Map());
  const [textAwarenessBySlide, setTextAwarenessBySlide] = useState<Record<string, YjsTextAwarenessState[]>>({});
  const setCollabBroadcast = useSlidesFlow((s) => s.setCollabBroadcast);

  const [viewOnly, setViewOnly] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const guardViewOnly = useCallback(() => {
    return guardSlideReadOnly(viewOnly, () => slideToastInfo("Modo somente leitura"));
  }, [viewOnly]);

  const selectedSlideIndex = useMemo(
    () => (selectedId ? items.findIndex((item) => item.id === selectedId) : -1),
    [items, selectedId],
  );
  const selectedSlideIndexForPresence = selectedSlideIndex >= 0 ? selectedSlideIndex : null;
  const collabActivity = presentationOpen
    ? "presenting"
    : selectedId ? "editing" : "idle";

  const handleRemoteCollabEvent = useCallback((event: import("@/lib/collaboration").CollabEvent) => {
    if (event.type === "bring_to_slide") {
      if (event.role !== "host") return;
      const payload = event.payload as { slideId?: string | null };
      if (payload.slideId && items.some((item) => item.id === payload.slideId)) {
        select(payload.slideId);
      }
      return;
    }
    if (event.type === "notify_host_update" && persistentCollabRole === "host") {
      const payload = event.payload as { fromName?: string; appVersion?: string };
      const message = `${payload.fromName ?? "Um convidado"} está em uma versão mais nova (${payload.appVersion ?? "desconhecida"}).`;
      setLastHostUpdateNotice(message);
      toast.info(message, { icon: <Bell className="h-4 w-4 text-primary" /> });
    }
  }, [items, persistentCollabRole, select]);

  const { collaborators, isConnected, channel: realtimeChannel, degraded: realtimeDegraded, broadcast, updateCursor, updateSlideId, broadcastComment, userId: collabUserId } = useCollaboration(
    roomId,
    collabName,
    persistentCollabRole,
    {
      appVersion: APP_VERSION,
      collabProtocolVersion: COLLAB_PROTOCOL_VERSION,
      currentSlideId: selectedId,
      currentSlideIndex: selectedSlideIndexForPresence,
      activity: collabActivity,
      isFollowingHost,
      onRemoteEvent: handleRemoteCollabEvent,
    },
  );
  const degradedActive = realtimeDegraded.active || edgeDegradedSince !== null;
  const degradedSince = realtimeDegraded.since ?? edgeDegradedSince;
  const degradedReason: CollabDegradedReason | null = realtimeDegraded.reason ?? (edgeDegradedSince ? "edge_function_quota" : null);
  const degradedLongRunning = degradedActive && degradedSince !== null && degradedNow - degradedSince >= 15 * 60_000;

  const activateEdgeDegraded = useCallback((detail?: string) => {
    const now = Date.now();
    setEdgeDegradedSince((current) => current ?? now);
    setCollabSaveStatus("error");
    recordCollabDegradedLog({
      at: new Date(now).toISOString(),
      action: "activated",
      reason: "edge_function_quota",
      roomId,
      detail,
    });
  }, [roomId]);

  const recoverEdgeDegraded = useCallback(() => {
    setEdgeDegradedSince((current) => {
      if (current) {
        recordCollabDegradedLog({
          at: new Date().toISOString(),
          action: "recovered",
          reason: "edge_function_quota",
          roomId,
        });
      }
      return null;
    });
  }, [roomId]);

  useEffect(() => {
    if (!degradedActive) return;
    const id = window.setInterval(() => setDegradedNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [degradedActive]);

  // Cor estável do usuário local (mesmo cálculo do hook de colaboração).
  const currentUserColor = useMemo(() => {
    const id = collabUserId ?? collabName ?? "anon";
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    const palette = ["#E63946", "#457B9D", "#2A9D8F", "#E9C46A", "#F4A261", "#A8DADC", "#8338EC", "#06D6A0", "#FFB703", "#FB8500", "#3A86FF", "#FF006E"];
    return palette[h % palette.length];
  }, [collabUserId, collabName]);
  const currentUser = useMemo(
    () => ({ name: collabName || "Convidado", color: currentUserColor }),
    [collabName, currentUserColor],
  );
  const yjsCollabReady = !!roomId && !!persistentCollabContentKey && !!realtimeChannel;

  const getOrCreateCustomYDoc = useCallback((item: Extract<SlideItem, { kind: "custom" }>): Y.Doc => {
    const existing = customYDocsRef.current.get(item.id);
    if (existing) return existing;
    const doc = customSlideConfigToYDoc(item.config);
    customYDocsRef.current.set(item.id, doc);
    return doc;
  }, []);

  const syncCustomYDocToStore = useCallback((slideId: string, doc: Y.Doc) => {
    const config = yDocToCustomSlideConfig(doc);
    const current = useSlidesFlow.getState().items.find((item) => item.id === slideId);
    const mergedConfig = current?.kind === "custom"
      ? mergeCustomSlideConfigRefs(current.config, config)
      : config;
    updateItemFromCollab({
      id: slideId,
      patch: { config: mergedConfig } as Partial<SlideItem>,
    });
  }, [updateItemFromCollab]);

  const scheduleCustomYDocStoreSync = useCallback((slideId: string, doc: Y.Doc) => {
    const currentTimer = customYSyncTimersRef.current.get(slideId);
    if (currentTimer !== undefined) window.clearTimeout(currentTimer);
    const timer = window.setTimeout(() => {
      customYSyncTimersRef.current.delete(slideId);
      syncCustomYDocToStore(slideId, doc);
    }, CUSTOM_YJS_STORE_SYNC_MS);
    customYSyncTimersRef.current.set(slideId, timer);
  }, [syncCustomYDocToStore]);

  const ensureCustomYProvider = useCallback((item: Extract<SlideItem, { kind: "custom" }>) => {
    if (!persistentCollabContentKey || !realtimeChannel || !collabUserId) return null;
    const doc = getOrCreateCustomYDoc(item);
    if (!customYSyncDisposersRef.current.has(item.id)) {
      const sync = () => scheduleCustomYDocStoreSync(item.id, doc);
      doc.on("update", sync);
      customYSyncDisposersRef.current.set(item.id, () => doc.off("update", sync));
    }
    if (customYProvidersRef.current.has(item.id)) return doc;

    const awareness = new Awareness(doc);
    awareness.setLocalStateField("user", currentUser);
    const updateAwareness = () => {
      setTextAwarenessBySlide((current) => ({
        ...current,
        [item.id]: getTextAwarenessStates(awareness, awareness.clientID),
      }));
    };
    awareness.on("update", updateAwareness);
    customYAwarenessRef.current.set(item.id, awareness);

    const provider = createSupabaseYjsProvider({
      doc,
      channel: realtimeChannel,
      contentKey: persistentCollabContentKey,
      clientId: collabUserId,
      eventName: `custom-slide-yjs:${item.id}`,
      awarenessEventName: `custom-slide-yjs-awareness:${item.id}`,
      awareness,
      throttleMs: 120,
      onSendFailure: () => {
        recordCollabDegradedLog({
          at: new Date().toISOString(),
          action: "activated",
          reason: "realtime_channel_error",
          roomId,
          detail: `custom-slide-yjs:${item.id}`,
        });
      },
    });
    customYProvidersRef.current.set(item.id, provider);
    return doc;
  }, [
    collabUserId,
    currentUser,
    getOrCreateCustomYDoc,
    persistentCollabContentKey,
    realtimeChannel,
    roomId,
    scheduleCustomYDocStoreSync,
  ]);

  useEffect(() => {
    customYProvidersRef.current.forEach((provider) => provider.destroy());
    customYProvidersRef.current.clear();
    customYAwarenessRef.current.forEach((awareness) => awareness.destroy());
    customYAwarenessRef.current.clear();
    customYSyncTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    customYSyncTimersRef.current.clear();
    setTextAwarenessBySlide({});
  }, [persistentCollabContentKey, realtimeChannel, roomId]);

  useEffect(() => {
    customYAwarenessRef.current.forEach((awareness) => {
      awareness.setLocalStateField("user", currentUser);
    });
  }, [currentUser]);

  useEffect(() => {
    if (roomId) return;
    setPersistentCollabContentKey(null);
    customYProvidersRef.current.forEach((provider) => provider.destroy());
    customYProvidersRef.current.clear();
    customYAwarenessRef.current.forEach((awareness) => awareness.destroy());
    customYAwarenessRef.current.clear();
    customYSyncTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    customYSyncTimersRef.current.clear();
    customYSyncDisposersRef.current.forEach((dispose) => dispose());
    customYSyncDisposersRef.current.clear();
    customYDocsRef.current.clear();
    setTextAwarenessBySlide({});
  }, [roomId]);

  useEffect(() => () => {
    customYProvidersRef.current.forEach((provider) => provider.destroy());
    customYProvidersRef.current.clear();
    customYAwarenessRef.current.forEach((awareness) => awareness.destroy());
    customYAwarenessRef.current.clear();
    customYSyncTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    customYSyncTimersRef.current.clear();
    customYSyncDisposersRef.current.forEach((dispose) => dispose());
    customYSyncDisposersRef.current.clear();
    customYDocsRef.current.clear();
  }, []);

  const hostParticipant = useMemo(
    () => collaborators.find((user) => user.role === "host") ?? null,
    [collaborators],
  );
  const appVersionComparison = hostParticipant?.appVersion
    ? compareVersions(APP_VERSION, hostParticipant.appVersion)
    : 0;
  const localAppOutdated = !!roomId && persistentCollabRole !== "host" && !!hostParticipant?.appVersion && appVersionComparison < 0;
  const hostAppOutdated = !!roomId && persistentCollabRole !== "host" && !!hostParticipant?.appVersion && appVersionComparison > 0;
  const protocolMismatch = !!roomId && !!hostParticipant?.collabProtocolVersion
    && hostParticipant.collabProtocolVersion !== COLLAB_PROTOCOL_VERSION;

  useEffect(() => {
    if (!protocolMismatch) return;
    setViewOnly(true);
  }, [protocolMismatch]);

  useEffect(() => {
    if (!isFollowingHost || !hostParticipant?.currentSlideId) return;
    if (hostParticipant.currentSlideId === selectedId) return;
    if (!items.some((item) => item.id === hostParticipant.currentSlideId)) return;
    select(hostParticipant.currentSlideId);
  }, [hostParticipant?.currentSlideId, isFollowingHost, items, select, selectedId]);

  const bringEveryoneToCurrentSlide = useCallback(() => {
    if (persistentCollabRole !== "host" || !selectedId) return;
    broadcast({
      type: "bring_to_slide",
      payload: { slideId: selectedId },
      userId: collabUserId ?? "local",
      ts: Date.now(),
    });
    slideToastSuccess("Participantes chamados para este slide.");
  }, [broadcast, collabUserId, persistentCollabRole, selectedId]);

  const notifyHostAboutVersion = useCallback(() => {
    if (!hostParticipant || !roomId) return;
    broadcast({
      type: "notify_host_update",
      payload: { fromName: collabName || "Convidado", appVersion: APP_VERSION },
      userId: collabUserId ?? "local",
      ts: Date.now(),
    });
    slideToastSuccess("Host notificado sobre a versão.");
  }, [broadcast, collabName, collabUserId, hostParticipant, roomId]);

  const handleCommentEvent = useCallback((event: SlideCommentEvent) => {
    if (!roomId) return;
    if (persistentCollabRole === "viewer") return;
    broadcastComment(event);
    if (!persistentRoomDbId || !persistentCollabCode) return;
    void retryAsync(
      () => savePersistentCollabComment({
        roomId: persistentRoomDbId,
        code: persistentCollabCode,
        comment: event.comment,
        status: event.type === "comment_delete"
          ? "deleted"
          : event.comment.resolved ? "resolved" : "open",
      }),
      3,
      1200,
    ).then(() => {
      recoverEdgeDegraded();
    }).catch((error) => {
      if (isEdgeFunctionQuotaError(error) || (error instanceof Error && error.message === "SUPABASE_EDGE_FUNCTION_QUOTA")) {
        activateEdgeDegraded("save-collab-comment");
        slideToastInfo("Comentario mantido localmente. Vamos tentar sincronizar quando o servico normalizar.");
        return;
      }
      slideToastError("Nao foi possivel salvar o comentario na sala.");
    });
  }, [activateEdgeDegraded, broadcastComment, persistentCollabCode, persistentCollabRole, persistentRoomDbId, recoverEdgeDegraded, roomId]);

  useEffect(() => {
    if (roomId) {
      setCollabBroadcast(broadcast, collabUserId);
    } else {
      setCollabBroadcast(null, null);
    }
    return () => setCollabBroadcast(null, null);
  }, [roomId, broadcast, collabUserId, setCollabBroadcast]);

  useEffect(() => {
    setCommentStorageScope(roomId);
    return () => setCommentStorageScope(null);
  }, [roomId]);

  const currentSnapshotSignature = useMemo(
    () => JSON.stringify({ items, selectedId, transition }),
    [items, selectedId, transition],
  );

  const saveCollabSnapshotNow = useCallback(async () => {
    if (
      !persistentRoomDbId ||
      !persistentCollabCode ||
      !collabSnapshotVersion ||
      persistentCollabRole === "viewer" ||
      savingRef.current
    ) {
      return;
    }
    if (lastSavedSnapshotRef.current === currentSnapshotSignature) {
      setCollabSaveStatus("saved");
      return;
    }

    savingRef.current = true;
    setCollabSaveStatus("saving");
    try {
      const result = await retryAsync(() => savePersistentCollabSnapshot({
        roomId: persistentRoomDbId,
        code: persistentCollabCode,
        expectedPreviousVersion: collabSnapshotVersion,
        items,
        selectedSlideId: selectedId,
        transition,
        appVersion: APP_VERSION,
      }), 3, 1200);
      lastSavedSnapshotRef.current = currentSnapshotSignature;
      setCollabSnapshotVersion(result.version);
      setCollabSaveStatus("saved");
      recoverEdgeDegraded();
    } catch (error) {
      if (isEdgeFunctionQuotaError(error) || (error instanceof Error && error.message === "SUPABASE_EDGE_FUNCTION_QUOTA")) {
        activateEdgeDegraded("save-collab-snapshot");
        slideToastInfo("Salvamento online temporariamente indisponivel. Suas edicoes continuam nesta sessao.");
      }
      setCollabSaveStatus("error");
    } finally {
      savingRef.current = false;
    }
  }, [
    collabSnapshotVersion,
    currentSnapshotSignature,
    items,
    persistentCollabCode,
    persistentCollabRole,
    persistentRoomDbId,
    activateEdgeDegraded,
    recoverEdgeDegraded,
    selectedId,
    transition,
  ]);

  useEffect(() => {
    if (!roomId || persistentCollabRole === "viewer" || !persistentRoomDbId || !persistentCollabCode) return;
    if (!lastSavedSnapshotRef.current || lastSavedSnapshotRef.current === currentSnapshotSignature) return;
    setCollabSaveStatus("saving");
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void saveCollabSnapshotNow();
    }, 1200);
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [
    currentSnapshotSignature,
    persistentCollabCode,
    persistentCollabRole,
    persistentRoomDbId,
    roomId,
    saveCollabSnapshotNow,
  ]);

  useEffect(() => {
    if (!roomId || persistentCollabRole === "viewer") return;
    const flush = () => {
      void saveCollabSnapshotNow();
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [persistentCollabRole, roomId, saveCollabSnapshotNow]);

  const handleCreatePersistentRoom = async () => {
    if (guardViewOnly()) return null;
    const name = collabName.trim() || "Convidado";
    if (typeof window !== "undefined") {
      localStorage.setItem("collab-username", name);
    }
    setCollabName(name);
    setCollabBusy("create");
    try {
      const created = await createPersistentCollabRoom({
        items,
        selectedSlideId: selectedId,
        transition,
        appVersion: APP_VERSION,
      });
      setCreatedPersistentRoom(created);
      setPersistentCollabRole("host");
      setPersistentRoomDbId(created.roomId);
      setPersistentCollabCode(created.editorCode);
      setPersistentCollabContentKey(created.contentKey);
      setRoomId(created.roomPublicId);
      setCollabSnapshotVersion(created.latestSnapshotVersion);
      lastSavedSnapshotRef.current = JSON.stringify({ items, selectedId, transition });
      setCommentStorageScope(created.roomPublicId);
      replaceComments([]);
      setViewOnly(false);
      recoverEdgeDegraded();
      slideToastSuccess("Sala colaborativa criada.");
    } catch (error) {
      if (isEdgeFunctionQuotaError(error) || (error instanceof Error && error.message === "SUPABASE_EDGE_FUNCTION_QUOTA")) {
        activateEdgeDegraded("create-collab-room");
        slideToastError("Criacao de sala temporariamente indisponivel. O deck local continua preservado.");
      } else {
        slideToastError("Nao foi possivel criar a sala colaborativa.");
      }
    } finally {
      setCollabBusy(null);
    }
  };

  const handleJoinPersistentRoom = async () => {
    const normalizedCode = normalizeCollabCode(collabJoinCode);
    if (!normalizedCode) {
      slideToastInfo("Informe um codigo de convite.");
      return;
    }
    setCollabJoinCode(normalizedCode);
    setCollabBusy("join");
    try {
      const joined = await joinPersistentCollabRoom(normalizedCode);
      if (items.length > 0) {
        const shouldReplace = window.confirm(
          "Entrar nesta sala vai substituir a esteira local pelo snapshot mais recente da sala. Continuar?",
        );
        if (!shouldReplace) return;
      }
      applySnapshotFromCollab(joined.state);
      const persistedComments = await loadPersistentCollabComments({
        roomId: joined.roomId,
        code: normalizedCode,
      });
      setCommentStorageScope(joined.roomPublicId);
      replaceComments(persistedComments);
      setCreatedPersistentRoom(null);
      setPersistentCollabRole(joined.role);
      setPersistentRoomDbId(joined.roomId);
      setPersistentCollabCode(normalizedCode);
      setPersistentCollabContentKey(joined.contentKey);
      setRoomId(joined.roomPublicId);
      setCollabSnapshotVersion(joined.latestSnapshotVersion);
      lastSavedSnapshotRef.current = JSON.stringify({
        items: joined.state.items,
        selectedId: joined.state.selectedId,
        transition: joined.state.transition,
      });
      setViewOnly(joined.role === "viewer");
      recoverEdgeDegraded();
      slideToastSuccess(joined.role === "viewer" ? "Entrada como visualizador confirmada." : "Entrada como editor confirmada.");
      setCollabOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("UNSUPPORTED") || message.includes("SNAPSHOT")) {
        slideToastError("Snapshot incompatível com esta versão do app.");
      } else if (message.includes("CORRUPTED")) {
        slideToastError("Snapshot da sala está corrompido ou não pode ser lido.");
      } else if (message.includes("SUPABASE_EDGE_FUNCTION_QUOTA")) {
        activateEdgeDegraded("join-collab-room");
        slideToastError("Entrada em sala temporariamente indisponivel. Seu deck local continua preservado.");
      } else if (message.includes("INVALID") || message.includes("EXPIRED") || message.includes("EMPTY_CODE")) {
        slideToastError("Código inválido ou expirado.");
      } else {
        slideToastError("Não foi possível entrar na sala. Verifique sua conexão e tente novamente.");
      }
    } finally {
      setCollabBusy(null);
    }
  };

  const copyText = (value: string, message: string) => {
    navigator.clipboard?.writeText(value);
    slideToastSuccess(message);
  };
  const openPresentation = (presenter = false) => {
    setPresentationPresenterMode(presenter);
    setPresentationOpen(true);
  };

  const applyTemplate = (tpl: SlideTemplate) => {
    if (guardViewOnly()) return;
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
        slideToastSuccess(`Template "${tpl.name}" aplicado`);
      } catch {
        slideToastError("Não foi possível aplicar o template.");
      } finally {
        setTemplateApplying(false);
      }
    }, 180);
  };

  const selected = useMemo(() => items.find((i) => i.id === selectedId) ?? null, [items, selectedId]);
  const readyAll = items.every((i) => isItemReady(i).ok);
  const preflight = useMemo(() => buildSlidesPreflight(items), [items]);
  const preflightIssuesBySlide = useMemo(() => {
    const map = new Map<string, SlidePreflightIssue[]>();
    for (const issue of preflight.issues) {
      const current = map.get(issue.slideId) ?? [];
      current.push(issue);
      map.set(issue.slideId, current);
    }
    return map;
  }, [preflight.issues]);
  const {
    exporting,
    fileName,
    setFileName,
    handleExport,
    handleExportPdf,
  } = useSlideExport({
    items,
    readyAll,
    preflightErrors: preflight.errors,
    pricingRows,
    budgetRows,
    metric,
  });

  const globalActiveFilterCount = useMemo(() => {
    let n = 0;
    if (selectedPeriods !== null) n++;
    n += Object.values(pricingFilters).filter((v) => v && v.length > 0).length;
    return n;
  }, [selectedPeriods, pricingFilters]);

  const exportDisabledReason = useMemo(() => {
    if (items.length === 0) return "Adicione ao menos um slide para exportar.";
    const incomplete = items.filter((i) => !isItemReady(i).ok).length;
    if (incomplete > 0) {
      return `Existem ${incomplete} slide${incomplete > 1 ? "s" : ""} incompleto${incomplete > 1 ? "s" : ""} - abra o preflight para ver quais.`;
    }
    if (preflight.errors > 0) {
      return `Existem ${preflight.errors} erro${preflight.errors > 1 ? "s" : ""} de preflight - abra o preflight para revisar.`;
    }
    return null;
  }, [items, preflight.errors]);

  const globalFilterSummary = useMemo(() => {
    const parts: string[] = [];
    if (selectedPeriods !== null) parts.push(`${selectedPeriods.length} período${selectedPeriods.length > 1 ? "s" : ""}`);
    for (const [key, values] of Object.entries(pricingFilters)) {
      if (values && values.length > 0) parts.push(`${key}: ${values.length}`);
    }
    return parts.length ? parts.join(" · ") : "Nenhum filtro global aplicado";
  }, [pricingFilters, selectedPeriods]);

  const confirmExport = async () => {
    const format = exportConfirm;
    setExportConfirm(null);
    if (format === "pdf") await handleExportPdf();
    else await handleExport();
  };

  const saveLocalCollabSafetyCopy = useCallback(() => {
    const payload = {
      exportedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      collabProtocolVersion: COLLAB_PROTOCOL_VERSION,
      roomId,
      selectedId,
      transition,
      items,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `omni4-sala-colaborativa-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    slideToastSuccess("Copia local salva.");
  }, [items, roomId, selectedId, transition]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const onDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as { source?: string; kind?: SlideKind } | undefined;
    if (data?.source === "catalog" && data.kind) setDragging({ source: "catalog", kind: data.kind });
  };
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    if (guardViewOnly()) return;
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
        title="Slides"
        subtitle="Monte uma apresentação combinando slides com filtros independentes"
      />
      {viewOnly && (
        <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-amber-700 md:px-8">
          Somente leitura
        </div>
      )}
      {degradedActive && (
        <div className="border-b border-warning/25 bg-warning/10 px-4 py-2 md:px-8">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 text-xs text-warning-foreground sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-warning" />
              <div className="space-y-0.5">
                <p className="font-medium">
                  {degradedReason === "edge_function_quota"
                    ? "Salvamento online temporariamente indisponivel."
                    : "Colaboracao ao vivo temporariamente indisponivel."}
                </p>
                <p className="text-muted-foreground">
                  {degradedReason === "edge_function_quota"
                    ? "Suas edicoes continuam nesta sessao. Salve uma copia local se precisar de uma seguranca extra."
                    : "Suas edicoes continuam sendo salvas normalmente e vao sincronizar automaticamente assim que a conexao for restabelecida."}
                </p>
              </div>
            </div>
            {degradedLongRunning && (
              <Button size="sm" variant="outline" className="h-8 gap-2 bg-background/70" onClick={saveLocalCollabSafetyCopy}>
                <Download className="h-3.5 w-3.5" />
                Salvar copia local
              </Button>
            )}
          </div>
        </div>
      )}
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
        <aside className="relative z-50 flex min-h-0 border-r border-border/40 bg-sidebar/70">
          <div className="flex w-14 flex-col items-center gap-1 border-r border-border/40 py-3">
            {([
              { id: "catalog" as const, label: "Catálogo", icon: LayoutTemplate },
              { id: "templates" as const, label: "Templates", icon: Sparkles },
              { id: "assets" as const, label: "Assets", icon: ImageIcon },
              { id: "presets" as const, label: "Modelos", icon: Bookmark },
            ]).map((tab) => {
              const Icon = tab.icon;
              const active = activeRailTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveRailTab(active ? null : tab.id)}
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-card hover:text-foreground",
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

          {activeRailTab && (
            <div
              className="absolute left-14 top-0 z-40 flex h-full min-h-0 flex-col border-r border-border/50 bg-sidebar/95 shadow-2xl backdrop-blur-xl"
              style={{ width: leftPanelWidth }}
            >
              <ResizeHandle side="right" onResize={(delta) => setLeftPanelWidth(leftPanelWidth + delta)} />
              <div className="flex items-center justify-between border-b border-border/40 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  {activeRailTab === "catalog" && <LayoutTemplate className="h-4 w-4 text-primary" />}
                  {activeRailTab === "templates" && <Sparkles className="h-4 w-4 text-primary" />}
                  {activeRailTab === "assets" && <ImageIcon className="h-4 w-4 text-primary" />}
                  {activeRailTab === "presets" && <Bookmark className="h-4 w-4 text-primary" />}
                  <span className="text-sm font-semibold">
                    {activeRailTab === "catalog" ? "Catálogo" : activeRailTab === "templates" ? "Templates" : activeRailTab === "assets" ? "Assets" : "Modelos"}
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
                          placeholder="Buscar slides..."
                          className="h-9 bg-background pl-8 text-sm"
                        />
                      </div>
                      <Button
                        className="h-12 w-full justify-start gap-3 rounded-lg"
                        onClick={() => addSlideFromShortcut("custom")}
                        disabled={viewOnly}
                      >
                        <Plus className="h-4 w-4" />
                        <span className="flex flex-col items-start leading-tight">
                          <span className="text-sm font-semibold">Slide em branco</span>
                          <span className="text-[11px] font-normal opacity-80">Canvas livre para montar sua analise.</span>
                        </span>
                      </Button>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
                        Slides disponíveis
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
                          Nenhum slide encontrado.
                        </div>
                      )}
                    </>
                  )}
                  {activeRailTab === "templates" && (
                    <div className="space-y-2">
                      <Button className="w-full justify-start gap-2" variant="outline" onClick={() => { if (guardViewOnly()) return; setGalleryOpen(true); }}>
                        <Sparkles className="h-4 w-4" /> Abrir galeria
                      </Button>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        A galeria abre sem empurrar o canvas e permite aplicar apresentações prontas.
                      </p>
                    </div>
                  )}
                  {activeRailTab === "assets" && (
                    <div className="space-y-2 rounded-xl border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
                      <ImageIcon className="mx-auto h-6 w-6 text-muted-foreground/70" />
                      Importe PPTX ou use imagens dentro do slide personalizado.
                      <Button className="mt-2 w-full gap-2" size="sm" variant="outline" onClick={() => { if (guardViewOnly()) return; setImportOpen(true); }}>
                        <Upload className="h-3.5 w-3.5" /> Importar PPTX
                      </Button>
                    </div>
                  )}
                  {activeRailTab === "presets" && <PresetsPanel />}
                </div>
              </ScrollArea>
            </div>
          )}
        </aside>

        {/* ===== Coluna central: esteira ===== */}
        <main className="relative flex flex-col overflow-hidden bg-background/60">
          {/* Header da esteira */}
          <div className="flex items-center justify-between gap-2 border-b border-border/40 bg-card/30 px-4 py-2.5 backdrop-blur-xl">
            <div className="flex items-center gap-2.5">
              <h2 className="text-sm font-semibold tracking-tight">Esteira</h2>
              <Badge variant="secondary" className="h-5 px-2 text-[10px] font-semibold tabular-nums">
                {items.length} {items.length === 1 ? "slide" : "slides"}
              </Badge>
              {items.length > 0 && (
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 tabular-nums">
                  ~{Math.max(1, Math.round((items.length * 30) / 60))} min
                </span>
              )}
              {!readyAll && items.length > 0 && (
                <Badge variant="outline" className="h-5 border-warning/40 px-2 text-[10px] text-warning">
                  Incompleto
                </Badge>
              )}
              {roomId && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
                    <span className="relative inline-flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
                    </span>
                    Sala ativa
                    <span className="text-muted-foreground">- {getPersistentCollabRoleLabel(persistentCollabRole)}</span>
                    {collabSnapshotVersion && (
                      <span className="text-muted-foreground">- v{collabSnapshotVersion}</span>
                    )}
                    {persistentCollabRole !== "viewer" && collabSaveStatus !== "idle" && (
                      <span className={cn(
                        "text-muted-foreground",
                        collabSaveStatus === "error" && "text-destructive",
                        collabSaveStatus === "saved" && "text-success",
                      )}>
                        - {collabSaveStatus === "saving"
                          ? "Salvando..."
                          : collabSaveStatus === "saved" ? "Salvo" : "Erro ao salvar"}
                      </span>
                    )}
                    {isConnected && collaborators.length > 0 && (
                      <span className="text-muted-foreground">- {collaborators.length}</span>
                    )}
                  </span>
                  <span className="hidden max-w-[520px] truncate text-[10px] text-muted-foreground xl:inline">
                    A sala sincroniza estrutura, layout e comentarios. As bases de dados continuam locais em cada computador.
                  </span>
                </div>
              )}
            </div>
            <TooltipProvider delayDuration={200}>
              <div className="flex items-center gap-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline" size="sm" className="h-8 gap-1.5"
                      onClick={() => { if (guardViewOnly()) return; setGalleryOpen(true); }}
                      aria-label="Abrir galeria de templates"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Templates
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Galeria de templates</TooltipContent>
                </Tooltip>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5" aria-label="Abrir menu de compartilhamento">
                      <Share2 className="h-3.5 w-3.5" />
                      Compartilhar
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-[360px] p-4">
                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <Users2 className="h-4 w-4 text-primary" />
                          Sala colaborativa persistente
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          Crie uma sala segura ou entre com um codigo recebido.
                        </p>
                      </div>
                      <div className="space-y-3 rounded-lg border border-border/50 bg-muted/20 p-3">
                        {roomId ? (
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-xs font-medium">Sala ativa</p>
                              <p className="font-mono text-[11px] text-muted-foreground">{roomId}</p>
                            </div>
                            <Badge variant="outline" className="border-success/40 bg-success/10 text-success">
                              {getPersistentCollabRoleLabel(persistentCollabRole)}
                            </Badge>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">Nenhuma sala ativa neste deck.</p>
                        )}
                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                          A sala sincroniza estrutura, layout e comentarios. As bases de dados continuam locais em cada computador.
                        </p>
                        {roomId && (
                          <div className="space-y-2 rounded-lg border border-border/40 bg-background/70 p-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Participantes
                              </p>
                              <Badge variant="secondary" className="h-5 text-[10px]">{collaborators.length}</Badge>
                            </div>
                            <div className="space-y-1.5">
                              {collaborators.map((user) => (
                                <div key={user.id} className="flex items-center gap-2 rounded-md bg-muted/30 px-2 py-1.5 text-[11px]">
                                  <span className="h-2 w-2 rounded-full" style={{ background: user.color }} />
                                  <span className="min-w-0 flex-1 truncate">
                                    <span className="font-medium">{user.name || "Convidado"}</span>
                                    <span className="text-muted-foreground">
                                      {" — "}{getPersistentCollabRoleLabel(user.role ?? null)} · v{user.appVersion ?? "?"}
                                      {typeof user.currentSlideIndex === "number" ? ` · Slide ${user.currentSlideIndex + 1}` : " · Sem slide"}
                                      {user.activity === "presenting" ? " · Apresentando" : user.activity === "editing" ? " · Editando" : " · Ocioso"}
                                    </span>
                                  </span>
                                </div>
                              ))}
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {persistentCollabRole !== "host" && (
                                <Button
                                  variant={isFollowingHost ? "default" : "outline"}
                                  size="sm"
                                  className="h-8 gap-2 text-xs"
                                  onClick={() => setIsFollowingHost((value) => !value)}
                                >
                                  <Target className="h-3.5 w-3.5" />
                                  {isFollowingHost ? "Seguindo host" : "Seguir host"}
                                </Button>
                              )}
                              {persistentCollabRole === "host" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 gap-2 text-xs"
                                  disabled={!selectedId}
                                  onClick={bringEveryoneToCurrentSlide}
                                >
                                  <Users2 className="h-3.5 w-3.5" />
                                  Trazer todos
                                </Button>
                              )}
                            </div>
                          </div>
                        )}
                        {roomId && protocolMismatch && (
                          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
                            Protocolo incompatível. Edição colaborativa bloqueada; você pode permanecer em visualização.
                          </div>
                        )}
                        {roomId && localAppOutdated && !protocolMismatch && (
                          <div className="space-y-2 rounded-lg border border-warning/30 bg-warning/10 p-2 text-[11px] text-warning">
                            <p>Você está em uma versão anterior à do host. Atualize para editar com segurança.</p>
                            <div className="flex gap-2">
                              <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={triggerUpdateNow}>
                                <RefreshCw className="h-3 w-3" /> Atualizar agora
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setViewOnly(true)}>
                                Entrar em modo visualização
                              </Button>
                            </div>
                          </div>
                        )}
                        {roomId && hostAppOutdated && !protocolMismatch && (
                          <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/10 p-2 text-[11px] text-primary">
                            <p>Seu app está mais novo que o do host.</p>
                            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={notifyHostAboutVersion}>
                              <Bell className="h-3 w-3" /> Notificar host
                            </Button>
                          </div>
                        )}
                        {lastHostUpdateNotice && persistentCollabRole === "host" && (
                          <div className="rounded-lg border border-primary/25 bg-primary/10 p-2 text-[11px] text-primary">
                            {lastHostUpdateNotice}
                          </div>
                        )}
                        <Button className="w-full gap-2" onClick={() => setCollabOpen(true)}>
                          <Users2 className="h-3.5 w-3.5" />
                          Abrir colaboracao
                        </Button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <ShareActionButton icon={Download} label="PPTX" disabled={!!exportDisabledReason || exporting} onClick={() => setExportConfirm("pptx")} />
                        <ShareActionButton icon={FileText} label="PDF" disabled={!!exportDisabledReason || exporting} onClick={() => setExportConfirm("pdf")} />
                        <ShareActionButton icon={Play} label="Apresentar" disabled={items.length === 0} onClick={() => openPresentation(false)} />
                      </div>
                      {exportDisabledReason && (
                        <p className="text-[11px] leading-relaxed text-muted-foreground">{exportDisabledReason}</p>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline" size="sm" className="h-8 gap-1.5"
                      onClick={() => { if (guardViewOnly()) return; setImportOpen(true); }}
                      aria-label="Importar slides de PowerPoint"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Importar PPTX
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Importar slides de um arquivo .pptx</TooltipContent>
                </Tooltip>
                <SavePresetDialog />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="hidden">
                    <Button
                      variant="outline" size="sm" className="h-8 gap-1.5 rounded-r-none"
                      onClick={() => setCollabOpen(true)}
                      aria-label="Iniciar colaboração"
                    >
                      <Users2 className="h-3.5 w-3.5" />
                      Colaborar
                    </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {roomId ? `Sala ativa: ${roomId}` : "Abrir sala persistente por código"}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost" size="sm" className="h-8 gap-1.5"
                      onClick={() => setHistoryOpen(true)}
                      aria-label="Histórico de alterações"
                    >
                      <History className="h-3.5 w-3.5" />
                      Histórico
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Log de alterações da sala</TooltipContent>
                </Tooltip>
                {items.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"
                        onClick={() => {
                          if (guardViewOnly()) return;
                          duplicateDeck();
                          toast.success(`Deck duplicado (${items.length} slides)`);
                        }}
                        disabled={viewOnly}
                        aria-label="Duplicar deck"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Duplicar deck inteiro</TooltipContent>
                  </Tooltip>
                )}
                {items.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"
                        onClick={() => {
                          if (guardViewOnly()) return;
                          if (confirm("Limpar a esteira atual?")) clearItems();
                        }}
                        disabled={viewOnly}
                        aria-label="Limpar esteira"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Limpar esteira</TooltipContent>
                  </Tooltip>
                )}
                <div className="mx-1 h-5 w-px bg-border/50" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline" size="sm" className="relative h-8 gap-1.5"
                      onClick={() => setFiltersOpen((v) => !v)}
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      Filtros
                      {globalActiveFilterCount > 0 && (
                        <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                          {globalActiveFilterCount}
                        </span>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{filtersOpen ? "Fechar filtros" : "Abrir filtros"}</TooltipContent>
                </Tooltip>
                <TransitionSelect />
                <div className="mx-1 h-5 w-px bg-border/50" />
                <PreflightPopover
                  issues={preflight.issues}
                  errors={preflight.errors}
                  warnings={preflight.warnings}
                  onSelectSlide={select}
                />
                <div className="mx-1 h-5 w-px bg-border/50" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline" size="sm" className="h-8 gap-1.5"
                      disabled={items.length === 0}
                      onClick={() => openPresentation(false)}
                      aria-label="Iniciar apresentação"
                    >
                      <Play className="h-3.5 w-3.5" />
                      Apresentar
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Iniciar apresentação</TooltipContent>
                </Tooltip>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2"
                      disabled={items.length === 0}
                      aria-label="Escolher modo de apresentacao"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-72 p-1.5">
                    <DropdownMenuItem className="items-start gap-3 rounded-md p-3" onClick={() => openPresentation(false)}>
                      <MonitorPlay className="mt-0.5 h-4 w-4 text-primary" />
                      <span className="space-y-0.5">
                        <span className="block text-sm font-medium">Tela cheia</span>
                        <span className="block text-xs text-muted-foreground">Apresente o deck no modo atual de tela cheia.</span>
                      </span>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="items-start gap-3 rounded-md p-3" onClick={() => openPresentation(true)}>
                      <Timer className="mt-0.5 h-4 w-4 text-primary" />
                      <span className="space-y-0.5">
                        <span className="block text-sm font-medium">Visao do apresentador</span>
                        <span className="block text-xs text-muted-foreground">Ja abre com notas do apresentador e timer ativos.</span>
                      </span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className="mx-1 h-5 w-px bg-border/50" />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"
                      aria-label="Nome do arquivo"
                      title={`Nome do arquivo: ${fileName}`}
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-72 p-3">
                    <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Nome do arquivo
                    </Label>
                    <Input
                      value={fileName}
                      onChange={(e) => setFileName(e.target.value)}
                      className="mt-1.5 h-9 text-sm"
                      placeholder="apresentacao.pptx"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </TooltipProvider>
          </div>

          {/* Barra de filtros ativos */}
          {globalActiveFilterCount > 0 && <ActiveFiltersBar />}

          {/* Conteúdo da esteira */}
          <ScrollArea className="flex-1">
            <div className="mx-auto max-w-2xl px-4 py-5">
              <FlowDropZone>
                {items.length === 0 ? (
                  <EmptyFlow onAdd={addWithDefaults} onOpenGallery={() => { if (guardViewOnly()) return; setGalleryOpen(true); }} />
                ) : (
                  <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {items.map((item, idx) => (
                        <FlowCard
                          key={item.id}
                          item={item}
                          index={idx}
                          selected={selectedId === item.id}
                          preflightIssues={preflightIssuesBySlide.get(item.id) ?? []}
                          onSelect={() => select(item.id)}
                          onRemove={() => { if (viewOnly) { toast.info("Modo somente leitura"); return; } removeItem(item.id); }}
                          onDuplicate={() => { if (guardViewOnly()) return; duplicateItem(item.id); }}
                        />
                      ))}
                      <QuickAddSlideButton onAdd={addSlideFromShortcut} readOnly={viewOnly} />
                    </div>
                  </SortableContext>
                )}
              </FlowDropZone>
            </div>
          </ScrollArea>
          {/* Painel de filtros (drawer lateral direito) */}
          <div
            className={cn(
              "absolute right-0 top-0 z-40 flex h-full w-[280px] flex-col border-l border-border/40 bg-card/95 backdrop-blur-xl transition-transform duration-200",
              filtersOpen ? "translate-x-0" : "translate-x-full",
            )}
          >
            <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4" />
                <span className="text-sm font-medium">Filtros</span>
                {globalActiveFilterCount > 0 && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                    {globalActiveFilterCount}
                  </Badge>
                )}
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setFiltersOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-5 p-4">
                {/* Período */}
                <div className="space-y-2">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Período
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => setAllPeriods()}
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                        selectedPeriods === null
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border/60 text-muted-foreground hover:border-primary/40",
                      )}
                    >
                      Todos
                    </button>
                    {months.map((m) => (
                      <button
                        key={m.periodo}
                        onClick={() => togglePeriod(m.periodo)}
                        className={cn(
                          "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                          selectedPeriods?.includes(m.periodo)
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border/60 text-muted-foreground hover:border-primary/40",
                        )}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Marca */}
                {(() => {
                  const opts = uniqueValues(pricingRows, budgetRows, "marca").map((v) => ({ value: v, label: v }));
                  if (opts.length === 0) return null;
                  return (
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Marca
                      </Label>
                      <MultiSelectFilter
                        options={opts}
                        selected={pricingFilters.marca ?? []}
                        onChange={(vals) => setPricingFilter("marca", vals)}
                        variant="sku"
                      />
                    </div>
                  );
                })()}

                {/* Canal */}
                {(() => {
                  const opts = uniqueValues(pricingRows, budgetRows, "canal").map((v) => ({ value: v, label: v }));
                  if (opts.length === 0) return null;
                  return (
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Canal
                      </Label>
                      <MultiSelectFilter
                        options={opts}
                        selected={pricingFilters.canal ?? []}
                        onChange={(vals) => setPricingFilter("canal", vals)}
                        variant="comercial"
                      />
                    </div>
                  );
                })()}

                {/* Categoria */}
                {(() => {
                  const opts = uniqueValues(pricingRows, budgetRows, "categoria").map((v) => ({ value: v, label: v }));
                  if (opts.length === 0) return null;
                  return (
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Categoria
                      </Label>
                      <MultiSelectFilter
                        options={opts}
                        selected={pricingFilters.categoria ?? []}
                        onChange={(vals) => setPricingFilter("categoria", vals)}
                        variant="sku"
                      />
                    </div>
                  );
                })()}

                {/* Métrica */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Métrica
                  </Label>
                  <div className="flex gap-2">
                    {(["cm", "mb"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setMetric(m)}
                        className={cn(
                          "flex-1 rounded-lg border py-1.5 text-xs font-medium transition-colors uppercase",
                          metric === m
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border/60 text-muted-foreground hover:border-primary/40",
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </ScrollArea>

            {globalActiveFilterCount > 0 && (
              <div className="border-t border-border/40 p-3">
                <Button
                  variant="outline" size="sm" className="w-full gap-1.5"
                  onClick={() => { clearPricingFilters(); setAllPeriods(); }}
                >
                  <X className="h-3.5 w-3.5" />
                  Limpar filtros
                </Button>
              </div>
            )}
          </div>
          {(templateApplying || importApplying || exporting) && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/55 backdrop-blur-sm">
              <div className="flex min-w-[260px] items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 shadow-2xl">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <div>
                  <div className="text-sm font-medium">
                    {exporting ? "Preparando exportação" : importApplying ? "Inserindo slides no deck" : "Aplicando template"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {exporting ? "Renderizando os slides e gerando o arquivo." : "Organizando os slides e atualizando a esteira."}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* ===== Coluna direita: inspector (recolhível) ===== */}
        <aside className="relative flex min-h-0 flex-col border-l border-border/40 bg-sidebar/40 transition-all duration-200 ease-out">
          {inspectorOpen && (
            <ResizeHandle side="left" onResize={(delta) => setRightPanelWidth(rightPanelWidth + delta)} />
          )}
          <button
            type="button"
            onClick={() => setInspectorOpen((v) => !v)}
            className="absolute left-0 top-20 z-10 flex h-9 w-7 -translate-x-1/2 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground shadow-md transition-all hover:scale-105 hover:text-foreground"
            aria-label={inspectorOpen ? "Recolher painel" : "Expandir painel"}
            title={inspectorOpen ? "Recolher prévia e filtros" : "Expandir prévia e filtros"}
          >
            {inspectorOpen ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </button>
          {inspectorOpen ? (
            <Inspector
              item={selected}
              readOnly={viewOnly}
              preflightIssues={selected ? preflightIssuesBySlide.get(selected.id) ?? [] : []}
              onOpenFullscreen={() => setFullscreenOpen(true)}
            />
          ) : (
            <div className="flex h-full items-center justify-center px-1 text-[10px] font-medium uppercase tracking-[0.25em] text-muted-foreground/70 [writing-mode:vertical-rl]">
              Prévia & Filtros
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
              Confirmar exportação
            </DialogTitle>
            <DialogDescription>
              Revise o resumo antes de gerar o arquivo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-lg border border-border/50 bg-muted/20 p-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Arquivo</span>
              <span className="text-right font-medium">{fileName.replace(/\.(pptx?|pdf)$/i, "")}.{exportConfirm ?? "pptx"}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Formato</span>
              <span className="font-medium uppercase">{exportConfirm ?? "pptx"}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Slides</span>
              <span className="font-medium">{items.length}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Filtros globais</span>
              <span className="max-w-[220px] text-right font-medium">{globalFilterSummary}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Preflight</span>
              <span className={cn("font-medium", preflight.errors > 0 ? "text-destructive" : preflight.warnings > 0 ? "text-warning" : "text-success")}>
                {preflight.errors > 0 ? `${preflight.errors} erro(s)` : preflight.warnings > 0 ? `${preflight.warnings} aviso(s)` : "Pronto"}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExportConfirm(null)}>Cancelar</Button>
            <Button onClick={confirmExport} disabled={exporting || !!exportDisabledReason} className="gap-2">
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Confirmar exportação
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
          if (guardViewOnly()) return;
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
                        label: `Slide ${slide.numero} (importado)`,
                        config: {
                          background: "FFFFFF",
                          showHaraldFooter: false,
                          blocks: slide.thumbnailDataUrl ? [imageBlock] : [],
                        },
                      } as typeof it
                    : it,
                );
              }
              slideToastSuccess(
                `${selectedIndices.length} slide${selectedIndices.length > 1 ? "s" : ""} importado${selectedIndices.length > 1 ? "s" : ""} com sucesso.`,
              );
            } catch {
              slideToastError("Não foi possível inserir os slides importados.");
            } finally {
              setImportApplying(false);
            }
          }, 180);
        }}
      />
      <FullscreenCustomEditor
        open={fullscreenOpen}
        onOpenChange={setFullscreenOpen}
        collaborators={collaborators}
        isConnected={isConnected}
        updateCursor={updateCursor}
        updateSlideId={updateSlideId}
        currentUser={currentUser}
        onCommentEvent={handleCommentEvent}
        preflightIssuesBySlide={preflightIssuesBySlide}
        readOnly={viewOnly}
        yjsCollabReady={yjsCollabReady}
        getCollabYDoc={ensureCustomYProvider}
        textAwarenessBySlide={textAwarenessBySlide}
      />

      <Dialog open={collabOpen} onOpenChange={setCollabOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users2 className="h-4 w-4 text-primary" />
              Colaboracao
            </DialogTitle>
            <DialogDescription>
              Crie uma sala persistente ou entre com um codigo recebido. O conteudo da sala fica criptografado.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
            A sala sincroniza estrutura, layout e comentarios. As bases de dados continuam locais em cada computador.
          </div>
          {roomId && (
            <div className="space-y-3 rounded-lg border border-success/30 bg-success/10 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-success">Sala ativa</p>
                  <p className="font-mono text-[11px] text-muted-foreground">{roomId}</p>
                  {collabSnapshotVersion && (
                    <p className="text-[11px] text-muted-foreground">Snapshot v{collabSnapshotVersion}</p>
                  )}
                </div>
                <Badge variant="outline" className="border-success/40 bg-background/80 text-success">
                  {getPersistentCollabRoleLabel(persistentCollabRole)}
                </Badge>
              </div>
              <div className="space-y-1.5 rounded-md bg-background/60 p-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Participantes</p>
                {collaborators.map((user) => (
                  <p key={user.id} className="truncate text-[11px]">
                    <span className="font-medium">{user.name || "Convidado"}</span>
                    <span className="text-muted-foreground">
                      {" — "}{getPersistentCollabRoleLabel(user.role ?? null)} · v{user.appVersion ?? "?"}
                      {typeof user.currentSlideIndex === "number" ? ` · Slide ${user.currentSlideIndex + 1}` : " · Sem slide"}
                      {user.activity === "presenting" ? " · Apresentando" : user.activity === "editing" ? " · Editando" : " · Ocioso"}
                    </span>
                  </p>
                ))}
              </div>
            </div>
          )}
          <Tabs defaultValue="create" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="create">Criar sala</TabsTrigger>
              <TabsTrigger value="join">Entrar com codigo</TabsTrigger>
            </TabsList>
            <TabsContent value="create" className="mt-4 space-y-4">
              <div className="space-y-2 rounded-lg border border-border/50 bg-muted/20 p-3">
                <Label htmlFor="collab-name" className="text-xs">Seu nome</Label>
                <Input
                  id="collab-name"
                  value={collabName}
                  disabled={viewOnly || collabBusy === "create"}
                  onChange={(e) => setCollabName(e.target.value)}
                  placeholder="Ex.: Alice"
                />
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  A sala salva snapshots Yjs criptografados. Exportacao e preflight continuam usando a estrutura normal do deck.
                </p>
                <Button className="w-full gap-2" onClick={handleCreatePersistentRoom} disabled={viewOnly || collabBusy === "create"}>
                  {collabBusy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Criar sala
                </Button>
              </div>
              {createdPersistentRoom && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2 rounded-lg border border-border/60 bg-card/70 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold">Codigo de editor</p>
                        <p className="text-[11px] text-muted-foreground">Pode editar quando a sincronizacao for ativada.</p>
                      </div>
                      <Badge variant="secondary">Editor</Badge>
                    </div>
                    <Input readOnly value={createdPersistentRoom.editorCode} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                    <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => copyText(createdPersistentRoom.editorCode, "Codigo de editor copiado.")}>
                      <Copy className="h-3.5 w-3.5" />
                      Copiar editor
                    </Button>
                  </div>
                  <div className="space-y-2 rounded-lg border border-border/60 bg-card/70 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold">Codigo de visualizador</p>
                        <p className="text-[11px] text-muted-foreground">Entra sem permissao de edicao.</p>
                      </div>
                      <Badge variant="outline">Viewer</Badge>
                    </div>
                    <Input readOnly value={createdPersistentRoom.viewerCode} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                    <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => copyText(createdPersistentRoom.viewerCode, "Codigo de visualizador copiado.")}>
                      <Copy className="h-3.5 w-3.5" />
                      Copiar viewer
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
            <TabsContent value="join" className="mt-4 space-y-4">
              <div className="space-y-2 rounded-lg border border-border/50 bg-muted/20 p-3">
                <Label htmlFor="collab-code" className="text-xs">Codigo recebido</Label>
                <Input
                  id="collab-code"
                  value={collabJoinCode}
                  onChange={(e) => setCollabJoinCode(e.target.value)}
                  onBlur={() => setCollabJoinCode((value) => normalizeCollabCode(value))}
                  onKeyDown={(e) => { if (e.key === "Enter") void handleJoinPersistentRoom(); }}
                  placeholder="ED_ABC123-... ou VW_ABC123-..."
                  className="font-mono text-sm"
                />
                <Button className="w-full gap-2" onClick={handleJoinPersistentRoom} disabled={collabBusy === "join"}>
                  {collabBusy === "join" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users2 className="h-4 w-4" />}
                  Entrar com codigo
                </Button>
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            {roomId && (
              <Button
                variant="ghost"
                onClick={() => {
                  setRoomId(null);
                  setPersistentCollabRole(null);
                  setCreatedPersistentRoom(null);
                  setCollabSnapshotVersion(null);
                  setPersistentRoomDbId(null);
                  setPersistentCollabCode(null);
                  setIsFollowingHost(false);
                  setLastHostUpdateNotice(null);
                  setViewOnly(false);
                  setCollabOpen(false);
                }}
              >
                Encerrar sala local
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <HistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} />

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
// HistoryDialog ? log de alterações da sala de colaboração.
// ----------------------------------------------------------------------------
function HistoryDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [, force] = useState(0);
  useEffect(() => subscribeLog(() => force((n) => n + 1)), []);
  const entries: ChangeLogEntry[] = [...readLog()].reverse();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            Histórico de alterações
          </DialogTitle>
          <DialogDescription>
            ?ltimas {entries.length} {entries.length === 1 ? "alteração" : "alterações"} recebidas.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          {entries.length === 0 ? (
            <p className="px-1 py-6 text-center text-xs text-muted-foreground">
              Nenhuma alteração registrada ainda.
            </p>
          ) : (
            <ul className="space-y-2 pr-2">
              {entries.map((e) => (
                <li key={e.eventId} className="flex items-start gap-2 rounded-md border border-border/40 bg-card/40 px-2 py-1.5">
                  <div
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-white"
                    style={{ background: e.userColor ?? "#666" }}
                  >
                    {initials(e.userName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs">{e.description}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatDate(new Date(e.ts), "dd/MM HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => { clearLog(); toast.success("Histórico limpo"); }}
            disabled={entries.length === 0}
          >
            Limpar histórico
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----------------------------------------------------------------------------
// TransitionSelect ? chooses the deck-wide slide transition.
// ----------------------------------------------------------------------------
