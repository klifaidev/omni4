import React, { useEffect, useRef, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, Copy, Filter as FilterIcon, GripVertical, MessageSquare, Plus, Sparkles, StickyNote, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScaledPreview } from "@/components/pricing/SlidePreview";
import { cn } from "@/lib/utils";
import { CANVAS_H, CANVAS_W } from "@/lib/customSlide";
import { SLIDE_CATALOG, isItemReady, metaOf, type SlideItem, type SlideKind } from "@/lib/slidesFlow";
import type { SlidePreflightIssue, SlidePreflightSeverity } from "@/lib/slidesPreflight";
import { SLIDE_ACCENT_BG, SLIDE_ICON_MAP } from "./slideUiTokens";
import { getUnresolvedCount, subscribe as subscribeComments } from "@/lib/slideComments";

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

export function EmptyFlow({
  onAdd,
  onOpenGallery,
  isOver,
}: {
  onAdd: (k: SlideKind) => void;
  onOpenGallery: () => void;
  isOver?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center gap-8 overflow-hidden rounded-3xl border bg-gradient-to-b from-card/40 to-card/10 px-8 py-16 text-center animate-fade-in transition-colors",
        isOver ? "border-primary/70 bg-primary/[0.06]" : "border-border/40",
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-24 h-64 opacity-60"
        style={{ background: "radial-gradient(60% 60% at 50% 50%, hsl(var(--primary)/0.18), transparent 70%)" }}
      />
      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
        <Sparkles className="h-8 w-8" />
      </div>
      <div className="relative max-w-md space-y-2">
        <h3 className="text-xl font-semibold tracking-tight">Comece sua apresentação</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {isOver
            ? "Solte aqui para adicionar à esteira."
            : "Escolha um template pronto para começar em segundos — ou monte do zero arrastando slides do catálogo à esquerda."}
        </p>
      </div>
      <div className="relative flex flex-col sm:flex-row items-center gap-2">
        <Button size="lg" onClick={onOpenGallery} className="gap-2 shadow-[0_8px_24px_-12px_hsl(var(--primary)/0.6)]">
          <Sparkles className="h-4 w-4" />
          Nova apresentação
        </Button>
        <span className="text-xs text-muted-foreground">ou clique nos modelos abaixo</span>
      </div>
      <div className="relative grid w-full max-w-2xl grid-cols-2 gap-2.5 sm:grid-cols-4">
        {SLIDE_CATALOG.map((s) => {
          const Icon = SLIDE_ICON_MAP[s.icon];
          return (
            <button
              key={s.kind}
              onClick={() => onAdd(s.kind)}
              className="group flex flex-col items-center gap-2 rounded-2xl border border-border/40 bg-card/50 p-4 text-center transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card hover:shadow-[0_8px_24px_-12px_hsl(var(--primary)/0.4)]"
            >
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl border transition-transform group-hover:scale-105", SLIDE_ACCENT_BG[s.accent])}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="text-xs font-medium leading-tight">{s.title}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DraggableCatalogItem({
  kind,
  onClick,
}: {
  kind: SlideKind;
  onClick: () => void;
}) {
  const meta = metaOf(kind);
  const Icon = SLIDE_ICON_MAP[meta.icon];
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `catalog:${kind}`,
    data: { source: "catalog", kind },
  });
  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
      {...attributes}
      {...listeners}
      className={cn(
        "group relative flex items-start gap-2.5 rounded-xl border border-border/40 bg-card/40 p-2.5 text-left transition-all duration-200 hover:-translate-y-px hover:border-primary/40 hover:bg-card hover:shadow-[0_6px_16px_-10px_hsl(var(--primary)/0.5)] cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
    >
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border", SLIDE_ACCENT_BG[meta.accent])}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-[13px] font-medium tracking-tight">
          <span className="truncate">{meta.title}</span>
          <Plus className="h-3 w-3 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground line-clamp-2">
          {meta.description}
        </p>
      </div>
    </button>
  );
}

export function FlowDropZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "flow-dropzone" });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-2xl transition-colors",
        isOver && "ring-2 ring-primary/50 ring-offset-2 ring-offset-background",
      )}
    >
      {children}
    </div>
  );
}

export const FlowCard = React.memo(function FlowCard({
  item,
  index,
  selected,
  preflightIssues = [],
  previewVisible = true,
  onSelect,
  onRemove,
  onDuplicate,
}: {
  item: SlideItem;
  index: number;
  selected: boolean;
  preflightIssues?: SlidePreflightIssue[];
  previewVisible?: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const meta = metaOf(item.kind);
  const Icon = SLIDE_ICON_MAP[meta.icon];
  const ready = isItemReady(item);
  const filtersCount = (item.kind === "bridge_pvm" || item.kind === "budget_evo")
    ? Object.values(item.config.filters).filter((v) => v && v.length > 0).length
    : 0;
  const preflightSeverity = highestPreflightSeverity(preflightIssues);
  const statusSeverity: SlidePreflightSeverity | null = !ready.ok ? "error" : preflightSeverity;
  const statusCount = preflightIssues.length + (!ready.ok ? 1 : 0);
  const hasNotes = !!((item.config as { speakerNotes?: string }).speakerNotes ?? "").trim();
  const displayName = item.label || meta.title;
  const [, forceCommentsUpdate] = useState(0);
  const hoverPreviewTimerRef = useRef<number | null>(null);
  const [hoverPreviewReady, setHoverPreviewReady] = useState(false);
  const unresolvedCount = getUnresolvedCount(item.id);

  const resetHoverPreviewDelay = () => {
    if (hoverPreviewTimerRef.current) window.clearTimeout(hoverPreviewTimerRef.current);
    setHoverPreviewReady(false);
    hoverPreviewTimerRef.current = window.setTimeout(() => {
      setHoverPreviewReady(true);
      hoverPreviewTimerRef.current = null;
    }, 200);
  };

  const clearHoverPreviewDelay = () => {
    if (hoverPreviewTimerRef.current) window.clearTimeout(hoverPreviewTimerRef.current);
    hoverPreviewTimerRef.current = null;
    setHoverPreviewReady(false);
  };

  useEffect(() => clearHoverPreviewDelay, []);
  useEffect(() => subscribeComments(() => forceCommentsUpdate((n) => n + 1)), []);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            ref={setNodeRef}
            style={style}
            className={cn(
              "group relative flex items-center gap-2 rounded-xl border bg-card/60 px-2.5 py-2 transition-all duration-200 animate-fade-in",
              selected
                ? "border-primary/60 bg-primary/[0.06] shadow-[0_0_0_1px_hsl(var(--primary)/0.35),_0_8px_24px_-12px_hsl(var(--primary)/0.35)]"
                : "border-border/40 hover:-translate-y-px hover:border-border/70 hover:bg-card hover:shadow-[0_4px_16px_-8px_hsl(0_0%_0%/0.4)]",
              preflightSeverity === "error" && !selected && "border-destructive/50",
              preflightSeverity === "warning" && !selected && "border-warning/50",
              preflightSeverity === "info" && !selected && "border-primary/35",
            )}
            onClick={onSelect}
            onMouseEnter={resetHoverPreviewDelay}
            onMouseMove={resetHoverPreviewDelay}
            onMouseLeave={clearHoverPreviewDelay}
          >
            <button
              className="flex h-7 w-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground/30 transition-colors hover:text-muted-foreground active:cursor-grabbing"
              {...attributes}
              {...listeners}
              onClick={(e) => e.stopPropagation()}
              aria-label="Reordenar"
            >
              <GripVertical className="h-4 w-4" />
            </button>

            <span className="w-6 shrink-0 text-center text-[10px] font-semibold tabular-nums tracking-wider text-muted-foreground/70">
              {String(index + 1).padStart(2, "0")}
            </span>

            <div className="pointer-events-none relative w-[84px] shrink-0 overflow-hidden rounded-md border border-border/50 bg-white shadow-sm sm:w-[104px]">
              {previewVisible ? (
                <ScaledPreview item={item} targetWidth={104} />
              ) : (
                <div
                  aria-hidden
                  className="rounded-lg bg-muted/40"
                  style={{ width: "100%", aspectRatio: `${CANVAS_W} / ${CANVAS_H}` }}
                />
              )}
              <div className="absolute right-1 top-1 z-10 flex flex-col items-end gap-1">
                {statusSeverity && (
                  <span
                    className={cn(
                      "inline-flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-full border px-1 text-[9px] font-semibold shadow-sm",
                      statusSeverity === "error" && "border-destructive/40 bg-destructive text-destructive-foreground",
                      statusSeverity === "warning" && "border-warning/40 bg-warning text-warning-foreground",
                      statusSeverity === "info" && "border-primary/40 bg-primary text-primary-foreground",
                    )}
                    title={!ready.ok ? `Incompleto: ${ready.reason}` : `${preflightSeverityLabel(statusSeverity)}: ${preflightIssues.length} ponto(s) no preflight`}
                  >
                    <AlertTriangle className="h-3 w-3" />
                    {statusCount}
                  </span>
                )}
                {hasNotes && (
                  <span
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-primary/40 bg-primary text-primary-foreground shadow-sm"
                    title="Possui anotacoes do apresentador"
                  >
                    <StickyNote className="h-3 w-3" />
                  </span>
                )}
              </div>
              {unresolvedCount > 0 && (
                <span
                  className="absolute bottom-1 right-1 z-10 inline-flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-full border border-background/70 bg-card/95 px-1 text-[9px] font-semibold text-foreground shadow-sm"
                  title={`${unresolvedCount} comentario(s) pendente(s)`}
                >
                  <MessageSquare className="h-3 w-3" />
                  {unresolvedCount}
                </span>
              )}
            </div>

            <div className={cn("hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg border min-[1500px]:flex", SLIDE_ACCENT_BG[meta.accent])}>
              <Icon className="h-4 w-4" />
            </div>

            <div className="min-w-0 flex-[1_1_260px] pr-1">
              <div
                className="line-clamp-2 text-sm font-semibold leading-snug tracking-tight"
                title={displayName}
                aria-label={displayName}
              >
                {displayName}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
              {filtersCount > 0 && (
                <span className="inline-flex items-center gap-0.5">
                  <FilterIcon className="h-3 w-3" /> {filtersCount}
                </span>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              <Button
                variant="ghost" size="icon" className="h-7 w-7"
                onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
                aria-label="Duplicar"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive"
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                aria-label="Remover"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="left" align="center" sideOffset={12} className="p-1.5 border border-border/60 bg-card">
          <div className="overflow-hidden rounded-md border border-border/40 bg-white" style={{ width: 200, height: 113 }}>
            {hoverPreviewReady ? (
              <ScaledPreview item={item} targetWidth={200} />
            ) : (
              <div aria-hidden className="h-full w-full bg-muted/35" />
            )}
          </div>
          <div className="mt-1 px-1 text-[10px] font-medium text-muted-foreground tabular-nums">
            Slide {index + 1} · {item.label || meta.title}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
