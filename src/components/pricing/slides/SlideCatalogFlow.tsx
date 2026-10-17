import React, { useEffect, useRef, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, Check, Copy, Eye, EyeOff, Filter as FilterIcon, FolderInput, FolderMinus, FolderPlus, GripVertical, MessageSquare, MoreHorizontal, Pencil, Plus, Sparkles, StickyNote, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SlideGroup } from "@/lib/slideGroups";
import { groupHex } from "./FlowGroup";
import { ScaledPreview } from "@/components/pricing/SlidePreview";
import { cn } from "@/lib/utils";
import { SLIDE_CATALOG, isItemReady, metaOf, slideDisplayName, type SlideItem, type SlideKind } from "@/lib/slidesFlow";
import { useDeckTokenValues } from "@/hooks/useDeckRows";
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
  if (severity === "info") return "Com observação";
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
  onOpen,
  onRemove,
  onDuplicate,
  onToggleHidden,
  checked = false,
  selectionMode = false,
  onToggleCheck,
  groups = [],
  onGroupWithThis,
  onMoveToGroup,
  onLeaveGroup,
}: {
  item: SlideItem;
  index: number;
  selected: boolean;
  preflightIssues?: SlidePreflightIssue[];
  previewVisible?: boolean;
  /** Clique no card (a página lê Ctrl/Cmd e Shift no evento). */
  onSelect: (event?: React.MouseEvent) => void;
  /** Slide marcado na seleção múltipla. */
  checked?: boolean;
  /** Há seleção múltipla em andamento: o número vira caixa de seleção em todos os cards. */
  selectionMode?: boolean;
  onToggleCheck?: () => void;
  groups?: SlideGroup[];
  onGroupWithThis?: () => void;
  onMoveToGroup?: (groupId: string) => void;
  onLeaveGroup?: () => void;
  /** Abre o slide no editor (duplo clique ou botão Editar). */
  onOpen?: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onToggleHidden: () => void;
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
  const isHidden = !!item.hidden;
  const tokenValues = useDeckTokenValues();
  const displayName = slideDisplayName(item, meta.title, tokenValues);
  const [, forceCommentsUpdate] = useState(0);
  const unresolvedCount = getUnresolvedCount(item.id);

  useEffect(() => subscribeComments(() => forceCommentsUpdate((n) => n + 1)), []);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          "group relative flex items-center gap-2 rounded-xl border bg-card/60 px-2.5 py-2 transition-all duration-200 animate-fade-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          selected || checked
            ? "border-primary/60 bg-primary/[0.06] shadow-[0_0_0_1px_hsl(var(--primary)/0.35),_0_8px_24px_-12px_hsl(var(--primary)/0.35)]"
            : "border-border/40 hover:-translate-y-px hover:border-border/70 hover:bg-card hover:shadow-[0_4px_16px_-8px_hsl(0_0%_0%/0.4)]",
          preflightSeverity === "error" && !selected && "border-destructive/50",
          preflightSeverity === "warning" && !selected && "border-warning/50",
          preflightSeverity === "info" && !selected && "border-primary/35",
          isHidden && "opacity-50",
        )}
        data-flow-id={item.id}
        onClick={(e) => onSelect(e)}
        onDoubleClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        tabIndex={0}
        role="button"
        aria-label={displayName}
        aria-pressed={selected || checked}
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

        {/* O número vira caixa de seleção ao passar o mouse — marca vários slides para agrupar. */}
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-label={`Selecionar o slide ${index + 1}`}
          title={checked ? "Tirar da seleção" : "Selecionar (Ctrl+clique soma, Shift+clique seleciona o intervalo)"}
          onClick={(e) => { e.stopPropagation(); onToggleCheck?.(); }}
          className="group/check relative flex h-6 w-6 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className={cn(
            "text-[10px] font-semibold tabular-nums tracking-wider text-muted-foreground/70 transition-opacity",
            (checked || selectionMode) ? "opacity-0" : "group-hover:opacity-0 group-focus-within:opacity-0",
          )}>
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className={cn(
            "absolute inset-0.5 flex items-center justify-center rounded border transition-all",
            checked
              ? "border-primary bg-primary text-primary-foreground opacity-100"
              : "border-muted-foreground/40 bg-background/60 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:border-primary",
            selectionMode && !checked && "opacity-100",
          )}>
            {checked && <Check className="h-3 w-3" strokeWidth={3} />}
          </span>
        </button>

        {/* 160px (antes 104): dá pra reconhecer o slide pela miniatura. */}
        <div className="pointer-events-none relative w-[104px] shrink-0 overflow-hidden rounded-md border border-border/50 bg-white shadow-sm sm:w-[160px]">
          <ScaledPreview
            item={item}
            targetWidth={160}
            deferUntilVisible={!previewVisible}
            staggerMount={selected ? "priority" : true}
          />
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
                title="Possui anotações do apresentador"
              >
                <StickyNote className="h-3 w-3" />
              </span>
            )}
          </div>
          {unresolvedCount > 0 && (
            <span
              className="absolute bottom-1 right-1 z-10 inline-flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-full border border-background/70 bg-card/95 px-1 text-[9px] font-semibold text-foreground shadow-sm"
              title={`${unresolvedCount} comentário(s) pendente(s)`}
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
            className="flex items-center gap-1.5 line-clamp-2 text-sm font-semibold leading-snug tracking-tight"
            title={displayName}
            aria-label={displayName}
          >
            {displayName}
            {isHidden && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-slate-500/15 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                <EyeOff className="h-2.5 w-2.5" /> Oculto
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          {filtersCount > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <FilterIcon className="h-3 w-3" /> {filtersCount}
            </span>
          )}
        </div>

        <div className={cn(
          "flex shrink-0 items-center gap-0.5 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100",
          selected ? "opacity-100" : "opacity-0",
        )}>
          {onOpen && (
            <Button
              variant="secondary" size="sm" className="h-7 gap-1 px-2 text-[11px]"
              onClick={(e) => { e.stopPropagation(); onOpen(); }}
              title="Editar slide (duplo clique no card)"
            >
              <Pencil className="h-3 w-3" />
              Editar
            </Button>
          )}
          <Button
            variant="ghost" size="icon" className="h-7 w-7"
            onClick={(e) => { e.stopPropagation(); onToggleHidden(); }}
            aria-label={isHidden ? "Mostrar" : "Ocultar"}
            aria-pressed={isHidden}
            title={isHidden ? "Mostrar slide (volta a entrar no export)" : "Ocultar slide (não entra no export)"}
          >
            {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost" size="icon" className="h-7 w-7"
            onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
            aria-label="Duplicar"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          {onGroupWithThis && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7"
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Agrupar"
                  title="Agrupar"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onSelect={onGroupWithThis}>
                  <FolderPlus className="mr-2 h-3.5 w-3.5" /> Novo grupo com este slide
                </DropdownMenuItem>
                {groups.filter((g) => g.id !== item.groupId).length > 0 && onMoveToGroup && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <FolderInput className="mr-2 h-3.5 w-3.5" /> Mover para o grupo
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-52">
                      <DropdownMenuLabel className="text-[11px] text-muted-foreground">Grupo de destino</DropdownMenuLabel>
                      {groups.filter((g) => g.id !== item.groupId).map((g) => (
                        <DropdownMenuItem key={g.id} onSelect={() => onMoveToGroup(g.id)}>
                          <span className="mr-2 h-2.5 w-2.5 rounded-full" style={{ background: groupHex(g.color) }} />
                          <span className="truncate">{g.name}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                {item.groupId && onLeaveGroup && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={onLeaveGroup}>
                      <FolderMinus className="mr-2 h-3.5 w-3.5" /> Tirar do grupo
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            aria-label="Remover"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
  );
});
