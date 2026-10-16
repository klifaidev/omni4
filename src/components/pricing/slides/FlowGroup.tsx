// Grupos na esteira: cabeçalho (arrastável, recolhível, renomeável), a faixa
// colorida que abraça os slides do grupo e a barra de ações da seleção.
import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import {
  Check, ChevronDown, ChevronRight, Copy, Eye, EyeOff, FolderMinus, FolderPlus, GripVertical,
  Layers, MoreHorizontal, Pencil, Trash2, Ungroup, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  estimatedMinutes, GROUP_COLORS, GROUP_COLOR_KEYS, groupDragId, type GroupColorKey, type SlideGroup,
} from "@/lib/slideGroups";

export const groupHex = (color: GroupColorKey) => GROUP_COLORS[color].hex;

/** Bolinhas de cor (troca a cor do grupo). */
function ColorDots({ value, onPick }: { value: GroupColorKey; onPick: (c: GroupColorKey) => void }) {
  return (
    <div className="grid grid-cols-5 gap-1.5 p-1.5" role="radiogroup" aria-label="Cor do grupo">
      {GROUP_COLOR_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          aria-label={GROUP_COLORS[key].label}
          title={GROUP_COLORS[key].label}
          onClick={(e) => { e.stopPropagation(); onPick(key); }}
          className="flex h-6 w-6 items-center justify-center rounded-full ring-offset-2 ring-offset-popover transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          style={{ background: GROUP_COLORS[key].hex, boxShadow: value === key ? `0 0 0 2px ${GROUP_COLORS[key].hex}55` : undefined }}
        >
          {value === key && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
        </button>
      ))}
    </div>
  );
}

export interface FlowGroupHeaderProps {
  group: SlideGroup;
  count: number;
  allHidden: boolean;
  /** Nomes dos primeiros slides — aparecem quando o grupo está recolhido. */
  previewNames: string[];
  startRename: boolean;
  onRenameStarted: () => void;
  onToggle: () => void;
  onRename: (name: string) => void;
  onColor: (c: GroupColorKey) => void;
  onToggleHidden: () => void;
  onDuplicate: () => void;
  onUngroup: () => void;
  onDelete: () => void;
  onSelectAll: () => void;
}

export const FlowGroupHeader = memo(function FlowGroupHeader({
  group, count, allHidden, previewNames, startRename, onRenameStarted,
  onToggle, onRename, onColor, onToggleHidden, onDuplicate, onUngroup, onDelete, onSelectAll,
}: FlowGroupHeaderProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({ id: groupDragId(group.id) });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(group.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const hex = groupHex(group.color);
  const collapsed = !!group.collapsed;

  useEffect(() => {
    if (!startRename) return;
    setDraft(group.name);
    setEditing(true);
    onRenameStarted();
  }, [startRename, group.name, onRenameStarted]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== group.name) onRename(next);
    else setDraft(group.name);
  };

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="relative"
    >
      {/* Pilha: dá a ideia de "vários slides aqui dentro" quando recolhido. */}
      {collapsed && count > 1 && (
        <>
          <div aria-hidden className="absolute inset-x-3 -bottom-1 h-2 rounded-b-xl border border-t-0" style={{ borderColor: `${hex}40`, background: `${hex}10` }} />
          {count > 2 && <div aria-hidden className="absolute inset-x-6 -bottom-2 h-2 rounded-b-xl border border-t-0" style={{ borderColor: `${hex}28`, background: `${hex}08` }} />}
        </>
      )}
      <div
        className={cn(
          "group/header relative flex items-center gap-2 rounded-xl border px-2 py-1.5 transition-all duration-200",
          isOver && "ring-2 ring-primary/60",
        )}
        style={{ borderColor: `${hex}55`, background: `linear-gradient(90deg, ${hex}1f, ${hex}0d)` }}
        data-flow-group={group.id}
      >
        <button
          className="flex h-7 w-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground/40 transition-colors hover:text-muted-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
          aria-label={`Mover o grupo ${group.name}`}
          title="Arraste para mover o grupo inteiro"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Expandir ${group.name}` : `Recolher ${group.name}`}
          title={collapsed ? "Expandir grupo" : "Recolher grupo"}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Mudar a cor do grupo"
              title="Mudar a cor"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              style={{ background: `${hex}26`, color: hex }}
            >
              <Layers className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-auto">
            <DropdownMenuLabel className="text-[11px] text-muted-foreground">Cor do grupo</DropdownMenuLabel>
            <ColorDots value={group.color} onPick={onColor} />
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              maxLength={80}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") commit();
                if (e.key === "Escape") { setDraft(group.name); setEditing(false); }
              }}
              aria-label="Nome do grupo"
              className="h-7 w-full rounded-md border border-primary/50 bg-background px-2 text-sm font-semibold outline-none ring-2 ring-primary/30"
            />
          ) : (
            <button
              type="button"
              onClick={onSelectAll}
              onDoubleClick={() => { setDraft(group.name); setEditing(true); }}
              title="Clique para selecionar o grupo · duplo clique para renomear"
              className="flex max-w-full items-baseline gap-2 truncate rounded-md px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className="truncate text-sm font-semibold tracking-tight">{group.name}</span>
              {allHidden && (
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-slate-500/15 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                  <EyeOff className="h-2.5 w-2.5" /> Oculto
                </span>
              )}
            </button>
          )}
          {collapsed && previewNames.length > 0 && !editing && (
            <div className="truncate px-1 text-[11px] text-muted-foreground">
              {previewNames.join(" · ")}{count > previewNames.length ? ` · +${count - previewNames.length}` : ""}
            </div>
          )}
        </div>

        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium tabular-nums"
          style={{ background: `${hex}1f`, color: hex }}
          title="Slides no grupo · duração estimada"
        >
          {count} {count === 1 ? "slide" : "slides"} · ~{estimatedMinutes(count)} min
        </span>

        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-200 group-hover/header:opacity-100 group-focus-within/header:opacity-100">
          <Button
            variant="ghost" size="icon" className="h-7 w-7"
            onClick={onToggleHidden}
            aria-label={allHidden ? "Mostrar o grupo" : "Ocultar o grupo"}
            title={allHidden ? "Mostrar todos os slides do grupo" : "Ocultar o grupo (não entra no export nem na apresentação)"}
          >
            {allHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Mais ações do grupo">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={() => { setDraft(group.name); setEditing(true); }}>
                <Pencil className="mr-2 h-3.5 w-3.5" /> Renomear
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <span className="mr-2 h-3.5 w-3.5 rounded-full" style={{ background: hex }} /> Cor
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-auto">
                  <ColorDots value={group.color} onPick={onColor} />
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem onSelect={onToggleHidden}>
                {allHidden ? <Eye className="mr-2 h-3.5 w-3.5" /> : <EyeOff className="mr-2 h-3.5 w-3.5" />}
                {allHidden ? "Mostrar todos" : "Ocultar todos"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onDuplicate}>
                <Copy className="mr-2 h-3.5 w-3.5" /> Duplicar grupo
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onUngroup}>
                <Ungroup className="mr-2 h-3.5 w-3.5" /> Desagrupar (mantém os slides)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir grupo e slides
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
});

/** Faixa colorida que abraça os slides de um grupo aberto. */
export function FlowGroupBody({ color, children }: { color: GroupColorKey; children: ReactNode }) {
  const hex = groupHex(color);
  return (
    <div
      className="ml-3 space-y-2 border-l-2 pb-1 pl-3 pt-2"
      style={{ borderColor: `${hex}80` }}
      role="group"
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Barra da seleção múltipla
// ---------------------------------------------------------------------------

export interface FlowSelectionBarProps {
  count: number;
  groups: SlideGroup[];
  anyGrouped: boolean;
  allHidden: boolean;
  onGroup: () => void;
  onMoveToGroup: (groupId: string) => void;
  onLeaveGroup: () => void;
  onToggleHidden: () => void;
  onDelete: () => void;
  onClear: () => void;
}

export function FlowSelectionBar({
  count, groups, anyGrouped, allHidden, onGroup, onMoveToGroup, onLeaveGroup, onToggleHidden, onDelete, onClear,
}: FlowSelectionBarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Ações para os slides selecionados"
      className="surface-overlay pointer-events-auto absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 animate-fade-in items-center gap-1 rounded-2xl border border-primary/30 px-2 py-1.5 shadow-[0_18px_40px_-16px_hsl(0_0%_0%/0.6)]"
    >
      <span className="px-2 text-xs font-semibold tabular-nums">
        {count} {count === 1 ? "slide" : "slides"}
      </span>
      <div className="mx-1 h-5 w-px bg-border/60" />
      <Button size="sm" className="h-8 gap-1.5 px-3 text-xs" onClick={onGroup} title="Agrupar (Ctrl+G)">
        <FolderPlus className="h-3.5 w-3.5" /> Agrupar
        <kbd className="ml-1 hidden rounded bg-primary-foreground/20 px-1 text-[9px] font-medium sm:inline">Ctrl G</kbd>
      </Button>
      {groups.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-8 gap-1 px-2 text-xs">
              Mover para <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top" className="w-56">
            <DropdownMenuLabel className="text-[11px] text-muted-foreground">Grupo de destino</DropdownMenuLabel>
            {groups.map((g) => (
              <DropdownMenuItem key={g.id} onSelect={() => onMoveToGroup(g.id)}>
                <span className="mr-2 h-2.5 w-2.5 rounded-full" style={{ background: groupHex(g.color) }} />
                <span className="truncate">{g.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {anyGrouped && (
        <Button size="sm" variant="ghost" className="h-8 gap-1.5 px-2 text-xs" onClick={onLeaveGroup} title="Tirar do grupo">
          <FolderMinus className="h-3.5 w-3.5" /> Tirar do grupo
        </Button>
      )}
      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onToggleHidden} aria-label={allHidden ? "Mostrar" : "Ocultar"} title={allHidden ? "Mostrar slides" : "Ocultar slides"}>
        {allHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </Button>
      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:text-destructive" onClick={onDelete} aria-label="Excluir" title="Excluir slides selecionados">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
      <div className="mx-1 h-5 w-px bg-border/60" />
      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onClear} aria-label="Limpar seleção" title="Limpar seleção (Esc)">
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
