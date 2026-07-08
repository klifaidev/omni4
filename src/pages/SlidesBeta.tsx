// ============================================================================
// Slides (Beta) ? orquestrador de exportação multi-slide
//
// Fluxo:
//  1. Usuário arrasta slides do "Catálogo" para a "Esteira" (drop zone)
//  2. Cada slide tem painel de configuração próprio (filtros + parâmetros)
//  3. Pode salvar a esteira como Pré-definição (localStorage)
//  4. Exporta tudo num único PPTX preservando a ordem
// ============================================================================
import { useEffect, useMemo, useState, useCallback } from "react";
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
import { MultiSelectFilter } from "@/components/pricing/MultiSelectFilter";
import { toast } from "sonner";
import {
  ArrowRight, BookOpen, Bookmark, ChevronLeft, ChevronRight, Copy, Download, FileText, Filter as FilterIcon,
  GitBranch, GripVertical, Image as ImageIcon, Layers, LayoutTemplate, MessageSquare, History, CheckCheck, Send, Plus, Play, RotateCcw, Save, ShieldCheck, SlidersHorizontal, Sparkles, StickyNote, Target, Trash2, Upload, Users2, X,
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
import { buildSlidesPreflight, type SlidePreflightIssue } from "@/lib/slidesPreflight";
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
import type { ImageBlock } from "@/lib/customSlide";
import { PresentationMode } from "@/components/pricing/custom/PresentationMode";
import { ActiveFiltersBar } from "@/components/pricing/ActiveFiltersBar";
import type { SlideTemplate } from "@/lib/slideTemplates";
import { usePageTitle } from "@/hooks/use-page-title";
import { useCollaboration } from "@/hooks/use-collaboration";
import type { CollabUser } from "@/lib/collaboration";
import { initials } from "@/lib/kanban";
import { Switch } from "@/components/ui/switch";
import {
  addComment, resolveComment, getComments, getUnresolvedCount, subscribe as subscribeComments,
  type SlideComment,
} from "@/lib/slideComments";
import { readLog, clearLog, subscribeLog, type ChangeLogEntry } from "@/lib/slideChangeLog";
import { formatDistanceToNow, format as formatDate } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DraggableCatalogItem, EmptyFlow, FlowCard, FlowDropZone } from "@/components/pricing/slides/SlideCatalogFlow";
import { SLIDE_ACCENT_BG as ACCENT_BG, SLIDE_ICON_MAP as ICON_MAP } from "@/components/pricing/slides/slideUiTokens";
import { PreflightPopover } from "@/components/pricing/slides/SlidesPreflightPopover";
import { TransitionSelect } from "@/components/pricing/slides/TransitionSelect";
import { useSlideExport } from "@/hooks/useSlideExport";

// ----------------------------------------------------------------------------
// Smart defaults ? calculados no momento de criar o slide a partir das bases
// disponíveis. Bridge: mês anterior vs último mês. Budget Evo: primeiro mês
// do FY anterior ? último disponível.
// ----------------------------------------------------------------------------
function smartDefaults(
  kind: SlideKind,
  ctx: { months: { periodo: string; mes: number; ano: number }[]; budgetMonths: { periodo: string; mes: number; ano: number }[] },
): Partial<SlideItem["config"]> | null {
  if (kind === "bridge_pvm" && ctx.months.length >= 2) {
    const last = ctx.months[ctx.months.length - 1];
    const prev = ctx.months[ctx.months.length - 2];
    return { mode: "month", base: prev.periodo, comp: last.periodo, filters: {} } as never;
  }
  if (kind === "budget_evo" && ctx.budgetMonths.length > 0) {
    const last = ctx.budgetMonths[ctx.budgetMonths.length - 1];
    const fyStart = last.mes >= 4 ? last.ano : last.ano - 1;
    const prevFyStart = fyStart - 1;
    const defaultStart = `${String(4).padStart(3, "0")}.${prevFyStart}`;
    const has = ctx.budgetMonths.some((m) => m.periodo === defaultStart);
    return {
      start: has ? defaultStart : ctx.budgetMonths[0].periodo,
      end: last.periodo,
      filters: {},
    } as never;
  }
  return null;
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
  currentUser, onAddComment,
}: {
  item: SlideItem;
  index: number;
  active: boolean;
  onClick: () => void;
  editingUsers?: CollabUser[];
  currentUser: { name: string; color: string };
  onAddComment?: (c: SlideComment) => void;
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
      )}
    >
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
            onAddComment={onAddComment}
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
  slideId, slideLabel, currentUser, onAddComment,
}: {
  slideId: string;
  slideLabel: string;
  currentUser: { name: string; color: string };
  onAddComment?: (c: SlideComment) => void;
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
    onAddComment?.(c);
    setText("");
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
                  {!c.resolved && (
                    <button
                      type="button"
                      onClick={() => resolveComment(slideId, c.id)}
                      className="ml-auto inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Marcar como resolvido"
                    >
                      <CheckCheck className="h-3 w-3" /> Resolver
                    </button>
                  )}
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
  currentUser, onAddComment, readOnly = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  readOnly?: boolean;
  collaborators?: CollabUser[];
  isConnected?: boolean;
  updateCursor?: (x: number, y: number) => void;
  updateSlideId?: (slideId: string | null) => void;
  currentUser: { name: string; color: string };
  onAddComment?: (c: SlideComment) => void;
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
  const goRel = (offset: number) => {
    if (idx < 0) return;
    const dir = offset > 0 ? 1 : -1;
    for (let i = idx + dir; i >= 0 && i < items.length; i += dir) {
      if (items[i].kind === "custom") { select(items[i].id); return; }
    }
  };
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
  }, [open, idx, items]);

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
                        onAddComment={onAddComment}
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
                onChange={(cfg) =>
                  readOnly ? toast.info("Modo somente leitura") : updateItem(current.id, (it) =>
                    it.kind === "custom" ? ({ ...it, config: cfg } as SlideItem) : it,
                  )
                }
                readOnly={readOnly}
                collaborators={collaborators}
                onCursorMove={updateCursor}
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
function Inspector({ item, onOpenFullscreen, readOnly }: { item: SlideItem | null; onOpenFullscreen: () => void; readOnly: boolean }) {
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

        {/* Live preview */}
        <SlidePreview item={item} />

        <Separator />

        {item.kind === "bridge_pvm" && (
          <BridgePvmConfigPanel item={item} readOnly={readOnly} onChange={(next) => guardedUpdateItem(() => next)} />
        )}
        {item.kind === "budget_evo" && (
          <BudgetEvoConfigPanel item={item} readOnly={readOnly} onChange={(next) => guardedUpdateItem(() => next)} />
        )}
        {item.kind === "cover" && (
          <CoverConfigPanel item={item} readOnly={readOnly} onChange={(next) => guardedUpdateItem(() => next)} />
        )}
        {item.kind === "custom" && (
          <CustomSlideFullscreenTrigger onOpen={onOpenFullscreen} />
        )}

        {meta.supportsFilters && (item.kind === "bridge_pvm" || item.kind === "budget_evo") && (
          <>
            <Separator />
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
          </>
        )}

        <Separator />
        <SpeakerNotesInspector item={item} readOnly={readOnly} onChange={(notes) => guardedUpdateItem((it) => ({
          ...it,
          config: { ...(it.config as object), speakerNotes: notes },
        } as SlideItem))} />
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
      updateItem(created.id, (it) => ({
        ...it,
        config: { ...(it as any).config, ...def },
      } as SlideItem));
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeRailTab, setActiveRailTab] = useState<SlidesRailTab | null>(null);
  const [leftPanelWidth, setLeftPanelWidth] = usePersistentWidth("omni4.slides.leftPanelWidth", 292, 220, 420);
  const [rightPanelWidth, setRightPanelWidth] = usePersistentWidth("omni4.slides.rightPanelWidth", 340, 280, 520);

  // ====== Colaboração em tempo real ======
  const [collabOpen, setCollabOpen] = useState(false);
  const [collabName, setCollabName] = useState<string>(() =>
    typeof window === "undefined" ? "" : localStorage.getItem("collab-username") ?? "",
  );
  const [roomId, setRoomId] = useState<string | null>(null);
  const setCollabBroadcast = useSlidesFlow((s) => s.setCollabBroadcast);

  const [viewOnly, setViewOnly] = useState(false);
  const [guestReadOnly, setGuestReadOnly] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const guardViewOnly = useCallback(() => {
    if (!viewOnly) return false;
    toast.info("Modo somente leitura");
    return true;
  }, [viewOnly]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hashQuery = window.location.hash.includes("?")
      ? window.location.hash.slice(window.location.hash.indexOf("?"))
      : "";
    const params = new URLSearchParams(window.location.search || hashQuery);
    const room = params.get("room");
    const name = params.get("name");
    const mode = params.get("mode");
    if (room) setRoomId(room);
    if (name) setCollabName(decodeURIComponent(name));
    if (mode === "view") setViewOnly(true);
  }, []);

  const { collaborators, isConnected, broadcast, updateCursor, updateSlideId, broadcastComment, userId: collabUserId } = useCollaboration(
    roomId,
    collabName,
  );

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

  const handleAddComment = useCallback((c: SlideComment) => {
    if (roomId) broadcastComment(c);
  }, [roomId, broadcastComment]);

  useEffect(() => {
    if (roomId) {
      setCollabBroadcast(broadcast, collabUserId);
    } else {
      setCollabBroadcast(null, null);
    }
    return () => setCollabBroadcast(null, null);
  }, [roomId, broadcast, collabUserId, setCollabBroadcast]);

  const startCollab = () => {
    const name = collabName.trim() || "Convidado";
    if (typeof window !== "undefined") {
      localStorage.setItem("collab-username", name);
    }
    setCollabName(name);
    const newRoom = Math.random().toString(36).slice(2, 10);
    setRoomId(newRoom);
    setCollabOpen(false);
  };

  const applyTemplate = (tpl: SlideTemplate) => {
    if (guardViewOnly()) return;
    const built = tpl.build({ months, budgetMonths });
    if (built.length === 0) {
      // "Em Branco" ? apenas fecha o modal.
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
    toast.success(`Template "${tpl.name}" aplicado`);
  };

  const selected = useMemo(() => items.find((i) => i.id === selectedId) ?? null, [items, selectedId]);
  const readyAll = items.every((i) => isItemReady(i).ok);
  const preflight = useMemo(() => buildSlidesPreflight(items), [items]);
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
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
      >
      <div
        className="grid h-[calc(100vh-3.5rem)] min-h-0 gap-0 overflow-hidden"
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
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
                        Slides disponíveis
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {SLIDE_CATALOG.map((s) => (
                          <DraggableCatalogItem
                            key={s.kind}
                            kind={s.kind}
                            onClick={() => addSlideFromShortcut(s.kind)}
                          />
                        ))}
                      </div>
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
                <span className="inline-flex items-center gap-1.5 rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
                  <span className="relative inline-flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
                  </span>
                  Ao vivo
                  {isConnected && collaborators.length > 0 && (
                    <span className="text-muted-foreground">· {collaborators.length}</span>
                  )}
                </span>
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
                    <Button
                      variant="outline" size="sm" className="h-8 gap-1.5"
                      onClick={() => setCollabOpen(true)}
                      aria-label="Iniciar colaboração"
                    >
                      <Users2 className="h-3.5 w-3.5" />
                      Colaborar
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {roomId ? `Sala ativa: ${roomId}` : "Compartilhar sessão em tempo real"}
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
                <div className="mx-1 h-5 w-px bg-border/50" />
                <TransitionSelect />
                <div className="mx-1 h-5 w-px bg-border/50" />
                <PreflightPopover issues={preflight.issues} errors={preflight.errors} warnings={preflight.warnings} />
                <div className="mx-1 h-5 w-px bg-border/50" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline" size="sm" className="h-8 gap-1.5"
                      disabled={items.length === 0}
                      onClick={() => setPresentationOpen(true)}
                      aria-label="Iniciar apresentação"
                    >
                      <Play className="h-3.5 w-3.5" />
                      Apresentar
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Iniciar apresentação</TooltipContent>
                </Tooltip>
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
                <div className="inline-flex items-center rounded-md shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.5)]">
                  <Button
                    size="sm" className="h-8 gap-2 rounded-r-none"
                    disabled={items.length === 0 || exporting || !readyAll}
                    onClick={handleExport}
                  >
                    <Download className="h-4 w-4" />
                    {exporting ? "Gerando..." : "Exportar PPTX"}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        className="h-8 rounded-l-none border-l border-primary-foreground/20 px-2"
                        disabled={items.length === 0 || exporting || !readyAll}
                        aria-label="Mais formatos de exportação"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={handleExport} disabled={exporting}>
                        <Download className="mr-2 h-4 w-4" /> Exportar PPTX
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleExportPdf} disabled={exporting}>
                        <FileText className="mr-2 h-4 w-4" /> Exportar PDF
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
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
        </main>

        {/* ===== Coluna direita: inspector (recolhível) ===== */}
        <aside className="relative flex min-h-0 flex-col border-l border-border/40 bg-sidebar/40">
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
            <Inspector item={selected} readOnly={viewOnly} onOpenFullscreen={() => setFullscreenOpen(true)} />
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
          setImportOpen(false);
          toast.success(
            `${selectedIndices.length} slide${selectedIndices.length > 1 ? "s" : ""} importado${selectedIndices.length > 1 ? "s" : ""} com sucesso.`,
          );
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
        onAddComment={handleAddComment}
        readOnly={viewOnly}
      />

      <Dialog open={collabOpen} onOpenChange={setCollabOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users2 className="h-4 w-4 text-primary" />
              Iniciar colaboração
            </DialogTitle>
            <DialogDescription>
              Compartilhe o link da sala ? alterações no deck aparecem em tempo real para todos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="collab-name" className="text-xs">Seu nome</Label>
            <Input
              id="collab-name"
              value={collabName}
              onChange={(e) => setCollabName(e.target.value)}
              placeholder="Ex.: Alice"
              onKeyDown={(e) => {
                if (e.key === "Enter") startCollab();
              }}
              autoFocus
            />
            {roomId && (
              <p className="pt-2 text-xs text-muted-foreground">
                Sala ativa: <span className="font-mono text-foreground">{roomId}</span>
              </p>
            )}
            {roomId && (
              <div className="space-y-2 rounded-md border border-border/40 bg-muted/30 p-2">
                <Label className="text-xs">Link de convite</Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    readOnly
                    value={`${window.location.origin}/#/slides?room=${roomId}&name=Convidado${guestReadOnly ? "&mode=view" : ""}`}
                    className="h-8 font-mono text-[10px]"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <Button
                    size="sm" variant="outline" className="h-8 gap-1"
                    onClick={() => {
                      const url = `${window.location.origin}/#/slides?room=${roomId}&name=Convidado${guestReadOnly ? "&mode=view" : ""}`;
                      navigator.clipboard?.writeText(url);
                      toast.success("Link copiado!");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" /> Copiar
                  </Button>
                </div>
                <label className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-[11px] text-muted-foreground">
                    Modo somente leitura para convidados
                  </span>
                  <Switch checked={guestReadOnly} onCheckedChange={setGuestReadOnly} />
                </label>
              </div>
            )}
          </div>
          <DialogFooter>
            {roomId && (
              <Button
                variant="ghost"
                onClick={() => {
                  setRoomId(null);
                  setCollabOpen(false);
                }}
              >
                Encerrar sala
              </Button>
            )}
            <Button onClick={startCollab}>
              {roomId ? "Nova sala" : "Iniciar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <HistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} />

      {presentationOpen && (
        <PresentationMode
          currentSlideId={selectedId ?? items[0]?.id}
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
