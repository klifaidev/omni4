import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChecklistItem,
  KanbanCard,
  KanbanColumn,
  KanbanState,
  PRIORITY_LABEL,
  PRIORITY_TONE,
  Priority,
  Recurrence,
  RECURRENCE_LABEL,
  COLUMN_ACCENTS,
  avatarHue,
  defaultState,
  dueStatus,
  formatDueShort,
  initials,
  loadState,
  newId,
  saveState,
} from "@/lib/kanban";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CalendarIcon,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Tag as TagIcon,
  Flag,
  X,
  GripVertical,
  CheckCircle2,
  Clock,
  AlertCircle,
  AlertTriangle,
  Kanban,
  List,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronRight as ChevronRightSmall,
  ArrowUp,
  ArrowDown,
  Search,
  BarChart3,
  Repeat2,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MultiSelectFilter } from "@/components/pricing/MultiSelectFilter";
import { KpiCard } from "@/components/pricing/KpiCard";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip as RTooltip,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";
import { usePageTitle } from "@/hooks/use-page-title";

type ViewMode = "kanban" | "list" | "calendar";
const VIEW_STORAGE_KEY = "atividades-viewmode";

/* ---------------------------------------------------------------- */
/* PAGE                                                              */
/* ---------------------------------------------------------------- */
export default function Atividades() {
  usePageTitle("Atividades");
  const [state, setState] = useState<KanbanState>(() => loadState());
  const [editingCard, setEditingCard] = useState<{ card?: KanbanCard; columnId: string } | null>(null);
  const [dragCard, setDragCard] = useState<{ cardId: string; fromCol: string } | null>(null);
  const [dragOver, setDragOver] = useState<{ colId: string; index: number } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const v = localStorage.getItem(VIEW_STORAGE_KEY);
      if (v === "kanban" || v === "list" || v === "calendar") return v;
    } catch {
      /* noop */
    }
    return "kanban";
  });

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, viewMode);
    } catch {
      /* noop */
    }
  }, [viewMode]);

  // persist
  useEffect(() => {
    saveState(state);
  }, [state]);

  const totalCards = Object.keys(state.cards).length;
  const doneCards = useMemo(() => {
    // heuristic: last column counts as "done"
    const last = state.columns[state.columns.length - 1];
    return last ? last.cardIds.length : 0;
  }, [state.columns]);

  /* ---------- filters ---------- */
  const [search, setSearch] = useState("");
  const [filterAssignees, setFilterAssignees] = useState<string[]>([]);
  const [filterPriority, setFilterPriority] = useState<"all" | "high" | "med" | "low">("all");
  const [filterTag, setFilterTag] = useState<string>("all");
  const [showMetrics, setShowMetrics] = useState(false);

  const assigneeOptions = useMemo(() => {
    const set = new Set<string>();
    Object.values(state.cards).forEach((c) => {
      if (c.assignee && c.assignee.trim()) set.add(c.assignee.trim());
    });
    return Array.from(set).sort().map((a) => ({ value: a, label: a }));
  }, [state.cards]);

  const tagOptions = useMemo(() => {
    const set = new Set<string>();
    Object.values(state.cards).forEach((c) => c.tags?.forEach((t) => t && set.add(t)));
    return Array.from(set).sort();
  }, [state.cards]);

  const matchCard = useMemo(() => {
    const q = search.trim().toLowerCase();
    const asgSet = new Set(filterAssignees);
    return (c: KanbanCard) => {
      if (q) {
        const hay = `${c.title ?? ""} ${c.description ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (asgSet.size > 0 && (!c.assignee || !asgSet.has(c.assignee))) return false;
      if (filterPriority !== "all" && c.priority !== filterPriority) return false;
      if (filterTag !== "all" && !(c.tags ?? []).includes(filterTag)) return false;
      return true;
    };
  }, [search, filterAssignees, filterPriority, filterTag]);

  const hasActiveFilters =
    !!search.trim() ||
    filterAssignees.length > 0 ||
    filterPriority !== "all" ||
    filterTag !== "all";

  function clearFilters() {
    setSearch("");
    setFilterAssignees([]);
    setFilterPriority("all");
    setFilterTag("all");
  }

  const filteredCount = useMemo(
    () => Object.values(state.cards).filter(matchCard).length,
    [state.cards, matchCard],
  );

  const dimmedIds = useMemo(() => {
    if (!hasActiveFilters) return undefined;
    const set = new Set<string>();
    Object.values(state.cards).forEach((c) => {
      if (!matchCard(c)) set.add(c.id);
    });
    return set;
  }, [state.cards, matchCard, hasActiveFilters]);

  // Filtered state used by list & calendar views (hides non-matching cards entirely)
  const filteredState = useMemo<KanbanState>(() => {
    if (!hasActiveFilters) return state;
    const cards: Record<string, KanbanCard> = {};
    Object.values(state.cards).forEach((c) => {
      if (matchCard(c)) cards[c.id] = c;
    });
    return {
      cards,
      columns: state.columns.map((col) => ({
        ...col,
        cardIds: col.cardIds.filter((id) => cards[id]),
      })),
    };
  }, [state, hasActiveFilters, matchCard]);

  /* ---------- metrics ---------- */
  const metrics = useMemo(() => {
    const all = Object.values(state.cards);
    const total = all.length;
    const lastCol = state.columns[state.columns.length - 1];
    const lastId = lastCol?.id;

    // "Em andamento": coluna cujo título contém "andamento" OU penúltima coluna como fallback
    const inProgressCol =
      state.columns.find((c) => c.title.toLowerCase().includes("andamento")) ??
      state.columns[state.columns.length - 2];
    const inProgress = inProgressCol ? inProgressCol.cardIds.length : 0;

    const todayIso = format(new Date(), "yyyy-MM-dd");
    let overdue = 0;
    state.columns.forEach((col) => {
      if (col.id === lastId) return;
      col.cardIds.forEach((id) => {
        const c = state.cards[id];
        if (c?.dueDate && c.dueDate < todayIso) overdue += 1;
      });
    });

    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let doneWeek = 0;
    if (lastCol) {
      lastCol.cardIds.forEach((id) => {
        const c = state.cards[id];
        if (!c) return;
        const refStr = c.dueDate ?? c.createdAt;
        if (!refStr) return;
        const t = new Date(refStr).getTime();
        if (!isNaN(t) && t >= weekAgo) doneWeek += 1;
      });
    }

    // Distribuição por responsável (top 8)
    const byAsg: Record<string, number> = {};
    all.forEach((c) => {
      const k = c.assignee?.trim() || "Sem responsável";
      byAsg[k] = (byAsg[k] ?? 0) + 1;
    });
    const byAssignee = Object.entries(byAsg)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    return { total, inProgress, overdue, doneWeek, byAssignee };
  }, [state]);


  /* ---------- column ops ---------- */
  function addColumn() {
    setState((s) => ({
      ...s,
      columns: [
        ...s.columns,
        { id: newId("col"), title: "Nova coluna", accent: "220 12% 65%", cardIds: [] },
      ],
    }));
  }
  function updateColumn(colId: string, patch: Partial<KanbanColumn>) {
    setState((s) => ({
      ...s,
      columns: s.columns.map((c) => (c.id === colId ? { ...c, ...patch } : c)),
    }));
  }
  function deleteColumn(colId: string) {
    setState((s) => {
      const col = s.columns.find((c) => c.id === colId);
      if (!col) return s;
      const newCards = { ...s.cards };
      col.cardIds.forEach((id) => delete newCards[id]);
      return {
        cards: newCards,
        columns: s.columns.filter((c) => c.id !== colId),
      };
    });
  }

  /* ---------- card ops ---------- */
  function saveCard(card: KanbanCard, columnId: string) {
    setState((s) => {
      const exists = !!s.cards[card.id];
      const cards = { ...s.cards, [card.id]: card };
      let columns = s.columns;
      if (!exists) {
        columns = s.columns.map((c) =>
          c.id === columnId ? { ...c, cardIds: [...c.cardIds, card.id] } : c,
        );
      }
      return { cards, columns };
    });
  }
  function deleteCard(cardId: string) {
    setState((s) => {
      const cards = { ...s.cards };
      delete cards[cardId];
      return {
        cards,
        columns: s.columns.map((c) => ({
          ...c,
          cardIds: c.cardIds.filter((id) => id !== cardId),
        })),
      };
    });
  }

  /* ---------- DnD ---------- */
  function moveCard(cardId: string, fromCol: string, toCol: string, toIndex: number) {
    setState((s) => {
      const columns = s.columns.map((c) => ({ ...c, cardIds: [...c.cardIds] }));
      const from = columns.find((c) => c.id === fromCol);
      const to = columns.find((c) => c.id === toCol);
      if (!from || !to) return s;
      const idx = from.cardIds.indexOf(cardId);
      if (idx >= 0) from.cardIds.splice(idx, 1);
      const insertAt = Math.min(toIndex, to.cardIds.length);
      to.cardIds.splice(insertAt, 0, cardId);
      return { ...s, columns };
    });
  }

  return (
    <div className="min-h-screen w-full">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border/40 bg-background/70 backdrop-blur-2xl">
        <div className="flex items-center justify-between px-8 py-5">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
              Workspace
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Atividades</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-4 px-3 text-xs text-muted-foreground sm:flex">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                {totalCards} {totalCards === 1 ? "atividade" : "atividades"}
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                {doneCards} concluída{doneCards === 1 ? "" : "s"}
              </span>
            </div>
            <ViewToggle mode={viewMode} onChange={setViewMode} />
            <button
              type="button"
              onClick={() => setShowMetrics((s) => !s)}
              aria-pressed={showMetrics}
              title="Métricas"
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                showMetrics
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/50 text-muted-foreground hover:bg-muted/40 hover:text-foreground",
              )}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Métricas
            </button>
            <Button
              size="sm"
              onClick={() => setEditingCard({ columnId: state.columns[0]?.id ?? "" })}
              className="gap-1.5 rounded-full bg-primary px-4 text-primary-foreground hover:bg-primary/90"
              disabled={state.columns.length === 0}
            >
              <Plus className="h-4 w-4" />
              Nova atividade
            </Button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border/30 px-8 py-3">
          <div className="relative min-w-[220px] flex-1 max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar atividades..."
              className="h-9 pl-8 text-xs"
            />
          </div>

          <div className="min-w-[180px]">
            <MultiSelectFilter
              options={assigneeOptions}
              selected={filterAssignees}
              onChange={setFilterAssignees}
              placeholder="Responsável"
            />
          </div>

          <ToggleGroup
            type="single"
            value={filterPriority}
            onValueChange={(v) => v && setFilterPriority(v as typeof filterPriority)}
            className="h-9 rounded-md border border-border/50 bg-secondary/40 p-0.5"
          >
            <ToggleGroupItem value="all" className="h-8 rounded px-2.5 text-[11px]">
              Todas
            </ToggleGroupItem>
            <ToggleGroupItem value="high" className="h-8 rounded px-2.5 text-[11px] data-[state=on]:bg-destructive/15 data-[state=on]:text-destructive">
              Alta
            </ToggleGroupItem>
            <ToggleGroupItem value="med" className="h-8 rounded px-2.5 text-[11px] data-[state=on]:bg-warning/15 data-[state=on]:text-warning">
              Média
            </ToggleGroupItem>
            <ToggleGroupItem value="low" className="h-8 rounded px-2.5 text-[11px]">
              Baixa
            </ToggleGroupItem>
          </ToggleGroup>

          <Select value={filterTag} onValueChange={setFilterTag}>
            <SelectTrigger className="h-9 w-[160px] border-border/50 bg-secondary/40 text-xs">
              <SelectValue placeholder="Tag" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as tags</SelectItem>
              {tagOptions.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasActiveFilters && (
            <>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                {filteredCount} de {totalCards} atividades
              </span>
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/15"
              >
                <X className="h-3 w-3" />
                Limpar filtros
              </button>
            </>
          )}
        </div>

        {/* Metrics panel */}
        {showMetrics && (
          <div className="border-t border-border/30 bg-muted/10 px-8 py-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiCard
                label="Total de atividades"
                value={String(metrics.total)}
                accent="blue"
              />
              <KpiCard
                label="Em andamento"
                value={String(metrics.inProgress)}
                accent="violet"
              />
              <KpiCard
                label="Vencidas"
                value={String(metrics.overdue)}
                accent="red"
              />
              <KpiCard
                label="Concluídas (7 dias)"
                value={String(metrics.doneWeek)}
                accent="green"
              />
            </div>

            <div className="mt-4 rounded-2xl border border-border/40 bg-card/40 p-4 backdrop-blur-xl">
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Distribuição por responsável
              </div>
              {metrics.byAssignee.length === 0 ? (
                <p className="text-[12px] italic text-muted-foreground">Sem dados.</p>
              ) : (
                <div style={{ width: "100%", height: Math.max(120, metrics.byAssignee.length * 28) }}>
                  <ResponsiveContainer>
                    <BarChart
                      layout="vertical"
                      data={metrics.byAssignee}
                      margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={140}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <RTooltip
                        cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
                        contentStyle={{
                          background: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="count" radius={[4, 4, 4, 4]} barSize={16}>
                        {metrics.byAssignee.map((_, i) => (
                          <Cell key={i} fill="hsl(var(--primary))" />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        )}
      </div>


      {/* Views */}
      {viewMode === "kanban" && (
        <div className="flex w-full gap-4 overflow-x-auto px-8 pb-10 pt-6">
          {state.columns.map((column) => (
            <Column
              key={column.id}
              column={column}
              cards={column.cardIds.map((id) => state.cards[id]).filter(Boolean)}
              isDragOver={dragOver?.colId === column.id}
              dragOverIndex={dragOver?.colId === column.id ? dragOver.index : -1}
              onAddCard={() => setEditingCard({ columnId: column.id })}
              onEditCard={(c) => setEditingCard({ card: c, columnId: column.id })}
              onDeleteCard={deleteCard}
              onUpdateColumn={(patch) => updateColumn(column.id, patch)}
              onDeleteColumn={() => deleteColumn(column.id)}
              onCardDragStart={(cardId) => setDragCard({ cardId, fromCol: column.id })}
              onCardDragEnd={() => {
                setDragCard(null);
                setDragOver(null);
              }}
              onColumnDragOver={(index) => {
                if (!dragCard) return;
                setDragOver({ colId: column.id, index });
              }}
              onColumnDrop={(index) => {
                if (!dragCard) return;
                moveCard(dragCard.cardId, dragCard.fromCol, column.id, index);
                setDragCard(null);
                setDragOver(null);
              }}
              dimmedIds={dimmedIds}
            />
          ))}

          {/* Add column */}
          <button
            type="button"
            onClick={addColumn}
            className="group flex h-14 w-[280px] shrink-0 items-center justify-center gap-2 rounded-2xl border border-dashed border-border/50 text-sm text-muted-foreground transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
            Adicionar coluna
          </button>
        </div>
      )}

      {viewMode === "list" && (
        <ListView
          state={filteredState}
          onEditCard={(c, colId) => setEditingCard({ card: c, columnId: colId })}
          onCompleteCard={(cardId, fromColId) => {
            const last = state.columns[state.columns.length - 1];
            if (!last) return;
            if (last.id === fromColId) return;
            moveCard(cardId, fromColId, last.id, last.cardIds.length);
            toast.success("Atividade marcada como concluída", {
              description: `Movida para "${last.title}"`,
            });
          }}
        />
      )}

      {viewMode === "calendar" && (
        <CalendarView
          state={filteredState}
          onEditCard={(c, colId) => setEditingCard({ card: c, columnId: colId })}
          onNewCardForDate={(date) => {
            const card: KanbanCard = {
              id: newId("card"),
              title: "",
              dueDate: format(date, "yyyy-MM-dd"),
              createdAt: new Date().toISOString(),
            };
            setEditingCard({ card, columnId: state.columns[0]?.id ?? "" });
          }}
        />
      )}

      {/* Dialog */}
      <CardDialog
        open={!!editingCard}
        onOpenChange={(o) => !o && setEditingCard(null)}
        initial={editingCard?.card}
        columnId={editingCard?.columnId ?? ""}
        columns={state.columns}
        onSave={(card, colId) => {
          saveCard(card, colId);
          setEditingCard(null);
        }}
        onMove={(card, toColId) => {
          // when moving via dialog, find current column then move
          const fromCol = state.columns.find((c) => c.cardIds.includes(card.id));
          if (fromCol && fromCol.id !== toColId) {
            moveCard(card.id, fromCol.id, toColId, state.columns.find((c) => c.id === toColId)?.cardIds.length ?? 0);
          }
        }}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* COLUMN                                                            */
/* ---------------------------------------------------------------- */
interface ColumnProps {
  column: KanbanColumn;
  cards: KanbanCard[];
  isDragOver: boolean;
  dragOverIndex: number;
  onAddCard: () => void;
  onEditCard: (c: KanbanCard) => void;
  onDeleteCard: (id: string) => void;
  onUpdateColumn: (patch: Partial<KanbanColumn>) => void;
  onDeleteColumn: () => void;
  onCardDragStart: (cardId: string) => void;
  onCardDragEnd: () => void;
  onColumnDragOver: (index: number) => void;
  onColumnDrop: (index: number) => void;
  dimmedIds?: Set<string>;
}

function Column(props: ColumnProps) {
  const {
    column,
    cards,
    isDragOver,
    dragOverIndex,
    onAddCard,
    onEditCard,
    onDeleteCard,
    onUpdateColumn,
    onDeleteColumn,
    onCardDragStart,
    onCardDragEnd,
    onColumnDragOver,
    onColumnDrop,
    dimmedIds,
  } = props;
  const overloaded = cards.length > 8;

  const [editTitle, setEditTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(column.title);
  useEffect(() => setTitleDraft(column.title), [column.title]);

  return (
    <div
      className={cn(
        "flex w-[300px] shrink-0 flex-col rounded-2xl border border-border/40 bg-card/40 backdrop-blur-xl transition-colors",
        isDragOver && "border-primary/40 bg-primary/[0.04]",
        overloaded && "border-warning/40 bg-warning/5",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        if (cards.length === 0) onColumnDragOver(0);
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (cards.length === 0) onColumnDrop(0);
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3.5 pt-3.5 pb-2">
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: `hsl(${column.accent})` }}
        />
        {editTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              if (titleDraft.trim()) onUpdateColumn({ title: titleDraft.trim() });
              setEditTitle(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setTitleDraft(column.title);
                setEditTitle(false);
              }
            }}
            className="flex-1 rounded-md bg-transparent px-1 text-sm font-medium outline-none ring-1 ring-primary/40"
          />
        ) : (
          <button
            onClick={() => setEditTitle(true)}
            className="flex-1 cursor-text truncate text-left text-sm font-medium"
          >
            {column.title}
          </button>
        )}
        <span className="rounded-full bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {cards.length}
        </span>
        {overloaded && (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning">
            <AlertTriangle className="h-3 w-3" />
            Sobrecarregada
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => setEditTitle(true)}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Renomear
            </DropdownMenuItem>
            <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Cor
            </div>
            <div className="grid grid-cols-7 gap-1 px-2 pb-2">
              {COLUMN_ACCENTS.map((a) => (
                <button
                  key={a.value}
                  onClick={() => onUpdateColumn({ accent: a.value })}
                  title={a.label}
                  className={cn(
                    "h-5 w-5 rounded-full border border-border/40 transition-transform hover:scale-110",
                    column.accent === a.value && "ring-2 ring-primary ring-offset-1 ring-offset-card",
                  )}
                  style={{ backgroundColor: `hsl(${a.value})` }}
                />
              ))}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={onDeleteColumn}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Excluir coluna
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Cards */}
      <div className="flex flex-1 flex-col gap-2 px-2.5 pb-2.5">
        {cards.map((card, i) => {
          const dim = dimmedIds?.has(card.id);
          return (
            <div
              key={card.id}
              className={cn(dim && "pointer-events-none opacity-35")}
            >
              {isDragOver && dragOverIndex === i && <DropIndicator />}
              <CardItem
                card={card}
                onEdit={() => onEditCard(card)}
                onDelete={() => onDeleteCard(card.id)}
                onDragStart={() => onCardDragStart(card.id)}
                onDragEnd={onCardDragEnd}
                onDragOverItem={() => onColumnDragOver(i)}
                onDropOnItem={() => onColumnDrop(i)}
              />
            </div>
          );
        })}
        {/* trailing drop zone */}
        <div
          className="min-h-[24px] flex-1"
          onDragOver={(e) => {
            e.preventDefault();
            onColumnDragOver(cards.length);
          }}
          onDrop={(e) => {
            e.preventDefault();
            onColumnDrop(cards.length);
          }}
        >
          {isDragOver && dragOverIndex >= cards.length && <DropIndicator />}
        </div>

        {/* Add card */}
        <button
          type="button"
          onClick={onAddCard}
          className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          Nova atividade
        </button>
      </div>
    </div>
  );
}

function DropIndicator() {
  return <div className="my-0.5 h-0.5 rounded-full bg-primary/70" />;
}

/* ---------------------------------------------------------------- */
/* CARD                                                              */
/* ---------------------------------------------------------------- */
interface CardItemProps {
  card: KanbanCard;
  onEdit: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOverItem: () => void;
  onDropOnItem: () => void;
}

function CardItem({
  card,
  onEdit,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOverItem,
  onDropOnItem,
}: CardItemProps) {
  const [hover, setHover] = useState(false);
  const status = dueStatus(card.dueDate);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOverItem();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDropOnItem();
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onEdit}
      className="group cursor-pointer rounded-xl border border-border/40 bg-card/80 p-3 shadow-[0_1px_2px_rgba(0,0,0,0.18)] backdrop-blur-md transition-all hover:-translate-y-px hover:border-border/70 hover:bg-card hover:shadow-[0_4px_14px_rgba(0,0,0,0.25)]"
    >
      {/* Top row: title + actions */}
      <div className="flex items-start gap-2">
        <GripVertical
          className={cn(
            "mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-opacity",
            hover ? "opacity-100" : "opacity-0",
          )}
        />
        <div className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-foreground">
          {card.title || <span className="italic text-muted-foreground">Sem título</span>}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm("Excluir esta atividade?")) onDelete();
          }}
          className={cn(
            "rounded p-0.5 text-muted-foreground transition-all hover:bg-destructive/15 hover:text-destructive",
            hover ? "opacity-100" : "opacity-0",
          )}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {card.description && (
        <p className="mt-1.5 line-clamp-2 pl-5 text-[11.5px] leading-relaxed text-muted-foreground">
          {card.description}
        </p>
      )}

      {/* Tags */}
      {card.tags && card.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1 pl-5">
          {card.tags.map((t) => (
            <span
              key={t}
              className="rounded-full border border-border/40 bg-muted/30 px-1.5 py-px text-[10px] text-muted-foreground"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Checklist progress */}
      {card.checklist && card.checklist.length > 0 && (
        <div className="mt-2 flex items-center gap-2 pl-5">
          <ChecklistProgressBar items={card.checklist} />
        </div>
      )}

      {/* Footer */}
      {(card.dueDate || card.assignee || card.priority || card.recurrence) && (
        <div className="mt-2.5 flex items-center justify-between gap-2 pl-5">
          <div className="flex items-center gap-1.5">
            {card.priority && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-medium",
                  PRIORITY_TONE[card.priority],
                )}
              >
                <Flag className="h-2.5 w-2.5" />
                {PRIORITY_LABEL[card.priority]}
              </span>
            )}
            {card.dueDate && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-medium",
                  status === "overdue" && "bg-destructive/15 text-destructive",
                  status === "today" && "bg-warning/15 text-warning",
                  status === "soon" && "bg-primary/15 text-primary",
                  status === "later" && "bg-muted/40 text-muted-foreground",
                )}
              >
                {status === "overdue" ? (
                  <AlertCircle className="h-2.5 w-2.5" />
                ) : (
                  <Clock className="h-2.5 w-2.5" />
                )}
                {formatDueShort(card.dueDate)}
              </span>
            )}
            {card.recurrence && (
              <span
                title={`Recorrência: ${RECURRENCE_LABEL[card.recurrence]}`}
                className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground/70"
              >
                <Repeat2 className="h-3 w-3" />
              </span>
            )}
          </div>
          {card.assignee && <Avatar name={card.assignee} />}
        </div>
      )}
    </div>
  );
}

function ChecklistProgressBar({ items }: { items: ChecklistItem[] }) {
  const total = items.length;
  const done = items.filter((i) => i.done).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const complete = total > 0 && done === total;
  return (
    <>
      <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-muted/40">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            complete ? "bg-success" : "bg-primary",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
        {done}/{total}
      </span>
    </>
  );
}

function Avatar({ name, size = 22 }: { name: string; size?: number }) {
  const hue = avatarHue(name);
  return (
    <span
      title={name}
      className="inline-flex items-center justify-center rounded-full text-[9px] font-semibold text-white shadow-sm ring-2 ring-card"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 30) % 360} 70% 45%))`,
      }}
    >
      {initials(name)}
    </span>
  );
}

/* ---------------------------------------------------------------- */
/* DIALOG                                                            */
/* ---------------------------------------------------------------- */
interface CardDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: KanbanCard;
  columnId: string;
  columns: KanbanColumn[];
  onSave: (card: KanbanCard, columnId: string) => void;
  onMove: (card: KanbanCard, toColId: string) => void;
}

function CardDialog({
  open,
  onOpenChange,
  initial,
  columnId,
  columns,
  onSave,
  onMove,
}: CardDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState<Priority | "none">("none");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [recurrence, setRecurrence] = useState<Recurrence | "none">("none");
  const [colId, setColId] = useState(columnId);

  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? "");
    setDescription(initial?.description ?? "");
    setDueDate(initial?.dueDate ? new Date(initial.dueDate + "T00:00:00") : undefined);
    setAssignee(initial?.assignee ?? "");
    setPriority(initial?.priority ?? "none");
    setTags(initial?.tags ?? []);
    setTagDraft("");
    setChecklist(initial?.checklist ?? []);
    setRecurrence(initial?.recurrence ?? "none");
    setColId(columnId);
  }, [open, initial, columnId]);

  function addTag() {
    const v = tagDraft.trim();
    if (!v || tags.includes(v)) return;
    setTags((s) => [...s, v]);
    setTagDraft("");
  }

  function handleSave() {
    if (!title.trim() && !description.trim()) {
      onOpenChange(false);
      return;
    }
    const card: KanbanCard = {
      id: initial?.id ?? newId("card"),
      title: title.trim(),
      description: description.trim() || undefined,
      dueDate: dueDate ? format(dueDate, "yyyy-MM-dd") : undefined,
      assignee: assignee.trim() || undefined,
      priority: priority === "none" ? undefined : priority,
      tags: tags.length ? tags : undefined,
      checklist: checklist.length ? checklist : undefined,
      recurrence: recurrence === "none" ? null : recurrence,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    };
    onSave(card, colId);
    if (initial && colId !== columnId) onMove(card, colId);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar atividade" : "Nova atividade"}</DialogTitle>
          <DialogDescription className="sr-only">
            Cadastre os dados da atividade
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            autoFocus
            placeholder="Título"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="border-0 bg-transparent px-0 text-base font-medium shadow-none focus-visible:ring-0"
          />
          <Textarea
            placeholder="Descrição (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="resize-none border-0 bg-muted/30 text-sm"
          />

          <div className="grid grid-cols-2 gap-3">
            {/* Coluna */}
            <Field label="Status">
              <Select value={colId} onValueChange={setColId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Coluna" />
                </SelectTrigger>
                <SelectContent>
                  {columns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: `hsl(${c.accent})` }}
                        />
                        {c.title}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {/* Prioridade */}
            <Field label="Prioridade">
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority | "none")}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem prioridade</SelectItem>
                  <SelectItem value="low">Baixa</SelectItem>
                  <SelectItem value="med">Média</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            {/* Prazo */}
            <Field label="Prazo">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-9 w-full justify-start text-left font-normal",
                      !dueDate && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {dueDate ? format(dueDate, "dd/MM/yyyy") : "Definir prazo"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dueDate}
                    onSelect={setDueDate}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                  {dueDate && (
                    <div className="border-t border-border p-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs"
                        onClick={() => setDueDate(undefined)}
                      >
                        Limpar prazo
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </Field>

            {/* Responsável */}
            <Field label="Responsável">
              <Input
                placeholder="Nome"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className="h-9"
              />
            </Field>

            {/* Recorrência */}
            <Field label="Recorrência">
              <Select
                value={recurrence}
                onValueChange={(v) => setRecurrence(v as Recurrence | "none")}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não repete</SelectItem>
                  <SelectItem value="weekly">Semanalmente</SelectItem>
                  <SelectItem value="biweekly">A cada 2 semanas</SelectItem>
                  <SelectItem value="monthly">Mensalmente</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          {/* Tags */}
          <Field label="Tags">
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background p-2">
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                >
                  <TagIcon className="h-2.5 w-2.5 text-muted-foreground" />
                  {t}
                  <button
                    onClick={() => setTags(tags.filter((x) => x !== t))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
              <input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addTag();
                  } else if (e.key === "Backspace" && !tagDraft && tags.length) {
                    setTags(tags.slice(0, -1));
                  }
                }}
                onBlur={addTag}
                placeholder={tags.length ? "" : "Adicionar tag e Enter"}
                className="flex-1 min-w-[120px] bg-transparent text-xs outline-none"
              />
            </div>
          </Field>

          {/* Checklist */}
          <ChecklistEditor items={checklist} onChange={setChecklist} />
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {initial ? "Salvar" : "Criar atividade"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* CHECKLIST EDITOR                                                  */
/* ---------------------------------------------------------------- */
function ChecklistEditor({
  items,
  onChange,
}: {
  items: ChecklistItem[];
  onChange: (next: ChecklistItem[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const total = items.length;
  const done = items.filter((i) => i.done).length;

  function add() {
    const v = draft.trim();
    if (!v) return;
    onChange([...items, { id: newId("chk"), text: v, done: false }]);
    setDraft("");
  }

  function toggle(id: string) {
    onChange(items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  }

  function remove(id: string) {
    onChange(items.filter((i) => i.id !== id));
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex((i) => i.id === active.id);
    const newIdx = items.findIndex((i) => i.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    onChange(arrayMove(items, oldIdx, newIdx));
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Checklist
        </div>
        {total > 0 && (
          <div className="text-[11px] text-muted-foreground">
            {done} de {total} concluído{total === 1 ? "" : "s"}
          </div>
        )}
      </div>

      {total > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1 rounded-md border border-input bg-background p-1.5">
              {items.map((item) => (
                <ChecklistRow
                  key={item.id}
                  item={item}
                  onToggle={() => toggle(item.id)}
                  onRemove={() => remove(item.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Adicionar item..."
          className="h-9 text-xs"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={add}
          disabled={!draft.trim()}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Adicionar
        </Button>
      </div>
    </div>
  );
}

function ChecklistRow({
  item,
  onToggle,
  onRemove,
}: {
  item: ChecklistItem;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex items-center gap-2 rounded px-1.5 py-1 hover:bg-muted/40"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing"
        aria-label="Reordenar"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <Checkbox
        checked={item.done}
        onCheckedChange={onToggle}
        aria-label="Marcar item"
      />
      <span
        className={cn(
          "flex-1 text-[12.5px]",
          item.done && "text-muted-foreground line-through",
        )}
      >
        {item.text}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100"
        aria-label="Excluir item"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* VIEW TOGGLE                                                       */
/* ---------------------------------------------------------------- */
function ViewToggle({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
}) {
  const items: Array<{ id: ViewMode; icon: typeof Kanban; label: string }> = [
    { id: "kanban", icon: Kanban, label: "Kanban" },
    { id: "list", icon: List, label: "Lista" },
    { id: "calendar", icon: CalendarDays, label: "Calendário" },
  ];
  return (
    <div className="flex items-center gap-0.5 rounded-full border border-border/50 bg-card/40 p-0.5 backdrop-blur-sm">
      {items.map((it) => {
        const Icon = it.icon;
        const active = mode === it.id;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onChange(it.id)}
            title={it.label}
            aria-label={it.label}
            aria-pressed={active}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* LIST VIEW                                                         */
/* ---------------------------------------------------------------- */
type SortKey = "priority" | "title" | "column" | "assignee" | "dueDate" | "tags";
type SortDir = "asc" | "desc";

const PRIORITY_RANK: Record<Priority, number> = { high: 3, med: 2, low: 1 };

function ListView({
  state,
  onEditCard,
  onCompleteCard,
}: {
  state: KanbanState;
  onEditCard: (c: KanbanCard, colId: string) => void;
  onCompleteCard: (cardId: string, fromColId: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const lastColId = state.columns[state.columns.length - 1]?.id;

  function toggleSort(k: SortKey) {
    if (sortKey === k) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(k);
      setSortDir("asc");
    }
  }

  function sortCards(cards: KanbanCard[], colTitle: string): KanbanCard[] {
    if (!sortKey) return cards;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...cards].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      switch (sortKey) {
        case "priority":
          av = a.priority ? PRIORITY_RANK[a.priority] : 0;
          bv = b.priority ? PRIORITY_RANK[b.priority] : 0;
          break;
        case "title":
          av = (a.title ?? "").toLowerCase();
          bv = (b.title ?? "").toLowerCase();
          break;
        case "column":
          av = colTitle.toLowerCase();
          bv = colTitle.toLowerCase();
          break;
        case "assignee":
          av = (a.assignee ?? "").toLowerCase();
          bv = (b.assignee ?? "").toLowerCase();
          break;
        case "dueDate":
          av = a.dueDate ?? "9999-99-99";
          bv = b.dueDate ?? "9999-99-99";
          break;
        case "tags":
          av = (a.tags?.[0] ?? "").toLowerCase();
          bv = (b.tags?.[0] ?? "").toLowerCase();
          break;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }

  const Header = ({ k, label, className }: { k: SortKey; label: string; className?: string }) => (
    <button
      type="button"
      onClick={() => toggleSort(k)}
      className={cn(
        "flex items-center gap-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {label}
      {sortKey === k && (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
    </button>
  );

  return (
    <div className="px-8 pb-10 pt-6">
      {/* Column headers */}
      <div className="mb-3 grid grid-cols-[28px_28px_minmax(0,3fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_minmax(0,1.4fr)] items-center gap-3 px-3">
        <span />
        <Header k="priority" label="Pri." />
        <Header k="title" label="Título" />
        <Header k="column" label="Status" />
        <Header k="assignee" label="Resp." />
        <Header k="dueDate" label="Prazo" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Progresso
        </span>
        <Header k="tags" label="Tags" />
      </div>

      <div className="space-y-3">
        {state.columns.map((column) => {
          const cards = sortCards(
            column.cardIds.map((id) => state.cards[id]).filter(Boolean),
            column.title,
          );
          const isCollapsed = !!collapsed[column.id];
          return (
            <div
              key={column.id}
              className="overflow-hidden rounded-2xl border border-border/40 bg-card/40 backdrop-blur-xl"
            >
              <button
                type="button"
                onClick={() => setCollapsed((s) => ({ ...s, [column.id]: !s[column.id] }))}
                className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/20"
              >
                {isCollapsed ? (
                  <ChevronRightSmall className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: `hsl(${column.accent})` }}
                />
                <span className="text-sm font-medium">{column.title}</span>
                <span className="rounded-full bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {cards.length}
                </span>
              </button>

              {!isCollapsed && (
                <div className="divide-y divide-border/30 border-t border-border/30">
                  {cards.length === 0 && (
                    <div className="px-4 py-3 text-[12px] italic text-muted-foreground">
                      Nenhuma atividade
                    </div>
                  )}
                  {cards.map((card) => {
                    const status = dueStatus(card.dueDate);
                    const isDone = column.id === lastColId;
                    return (
                      <div
                        key={card.id}
                        onClick={() => onEditCard(card, column.id)}
                        className="group grid cursor-pointer grid-cols-[28px_28px_minmax(0,3fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_minmax(0,1.4fr)] items-center gap-3 border-l-2 px-3 py-2.5 transition-colors hover:bg-muted/20"
                        style={{ borderLeftColor: `hsl(${column.accent})` }}
                      >
                        <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-center">
                          <Checkbox
                            checked={isDone}
                            onCheckedChange={() => {
                              if (!isDone) onCompleteCard(card.id, column.id);
                            }}
                            aria-label="Marcar como concluída"
                          />
                        </div>
                        <div className="flex items-center justify-center">
                          {card.priority ? (
                            <Flag
                              className={cn(
                                "h-3.5 w-3.5",
                                card.priority === "high" && "text-destructive",
                                card.priority === "med" && "text-warning",
                                card.priority === "low" && "text-muted-foreground",
                              )}
                            />
                          ) : (
                            <span className="text-muted-foreground/40">·</span>
                          )}
                        </div>
                        <div className={cn("truncate text-[13px]", isDone && "text-muted-foreground line-through")}>
                          {card.title || <span className="italic text-muted-foreground">Sem título</span>}
                        </div>
                        <div className="truncate text-[12px] text-muted-foreground">{column.title}</div>
                        <div className="flex items-center gap-1.5 truncate text-[12px] text-muted-foreground">
                          {card.assignee ? (
                            <>
                              <Avatar name={card.assignee} size={18} />
                              <span className="truncate">{card.assignee}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </div>
                        <div className="text-[12px]">
                          {card.dueDate ? (
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-medium",
                                status === "overdue" && "bg-destructive/15 text-destructive",
                                status === "today" && "bg-warning/15 text-warning",
                                status === "soon" && "bg-primary/15 text-primary",
                                status === "later" && "bg-muted/40 text-muted-foreground",
                              )}
                            >
                              {formatDueShort(card.dueDate)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {card.checklist && card.checklist.length > 0 ? (
                            <ChecklistProgressBar items={card.checklist} />
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {card.tags?.slice(0, 3).map((t) => (
                            <span
                              key={t}
                              className="rounded-full border border-border/40 bg-muted/30 px-1.5 py-px text-[10px] text-muted-foreground"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* CALENDAR VIEW                                                     */
/* ---------------------------------------------------------------- */
const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function CalendarView({
  state,
  onEditCard,
  onNewCardForDate,
}: {
  state: KanbanState;
  onEditCard: (c: KanbanCard, colId: string) => void;
  onNewCardForDate: (date: Date) => void;
}) {
  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  // Build a map: cardId -> columnId
  const cardToCol = useMemo(() => {
    const m: Record<string, string> = {};
    state.columns.forEach((c) => c.cardIds.forEach((id) => (m[id] = c.id)));
    return m;
  }, [state.columns]);

  const colById = useMemo(() => {
    const m: Record<string, KanbanColumn> = {};
    state.columns.forEach((c) => (m[c.id] = c));
    return m;
  }, [state.columns]);

  // Group cards by dueDate (yyyy-mm-dd) and "no date"
  const { byDate, noDate } = useMemo(() => {
    const byDate: Record<string, KanbanCard[]> = {};
    const noDate: KanbanCard[] = [];
    Object.values(state.cards).forEach((c) => {
      if (c.dueDate) {
        (byDate[c.dueDate] ||= []).push(c);
      } else {
        noDate.push(c);
      }
    });
    return { byDate, noDate };
  }, [state.cards]);

  // Build month grid days
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay(); // 0 = Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;

  const cells: Array<{ date: Date; inMonth: boolean }> = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - startWeekday + 1;
    const d = new Date(year, month, dayNum);
    cells.push({ date: d, inMonth: d.getMonth() === month });
  }

  function fmtKey(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  const todayKey = fmtKey(today);

  return (
    <div className="px-8 pb-10 pt-6">
      <div className="rounded-2xl border border-border/40 bg-card/40 p-4 backdrop-blur-xl">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-medium">
            {MONTH_NAMES[month]} {year}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCursor(new Date(year, month - 1, 1))}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              aria-label="Mês anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
              className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => setCursor(new Date(year, month + 1, 1))}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              aria-label="Próximo mês"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Weekday labels */}
        <div className="mb-1 grid grid-cols-7 gap-1">
          {WEEKDAY_LABELS.map((w) => (
            <div
              key={w}
              className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              {w}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell, i) => {
            const key = fmtKey(cell.date);
            const cards = byDate[key] ?? [];
            const isToday = key === todayKey;
            return (
              <div
                key={i}
                onClick={() => {
                  if (cards.length === 0) onNewCardForDate(cell.date);
                }}
                className={cn(
                  "group flex min-h-[96px] cursor-pointer flex-col gap-1 rounded-lg border border-border/30 p-1.5 transition-colors",
                  cell.inMonth ? "bg-background/40" : "bg-muted/10 opacity-50",
                  "hover:border-primary/40 hover:bg-primary/[0.04]",
                )}
              >
                <div
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium",
                    isToday
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {cell.date.getDate()}
                </div>
                <div className="flex flex-col gap-0.5">
                  {cards.slice(0, 4).map((card) => {
                    const col = colById[cardToCol[card.id]];
                    const accent = col?.accent ?? "220 12% 65%";
                    const title = (card.title || "Sem título").slice(0, 20);
                    return (
                      <button
                        key={card.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (col) onEditCard(card, col.id);
                        }}
                        className="truncate rounded-md px-1.5 py-0.5 text-left text-[10px] font-medium transition-opacity hover:opacity-80"
                        style={{
                          backgroundColor: `hsl(${accent} / 0.18)`,
                          color: `hsl(${accent})`,
                          borderLeft: `2px solid hsl(${accent})`,
                        }}
                        title={card.title || "Sem título"}
                      >
                        {title}
                        {(card.title?.length ?? 0) > 20 ? "…" : ""}
                      </button>
                    );
                  })}
                  {cards.length > 4 && (
                    <span className="px-1.5 text-[10px] text-muted-foreground">
                      +{cards.length - 4} mais
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sem prazo */}
      <div className="mt-6 rounded-2xl border border-border/40 bg-card/40 p-4 backdrop-blur-xl">
        <div className="mb-3 flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-sm font-medium">Sem prazo</h3>
          <span className="rounded-full bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {noDate.length}
          </span>
        </div>
        {noDate.length === 0 ? (
          <p className="text-[12px] italic text-muted-foreground">
            Todas as atividades têm prazo definido.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {noDate.map((card) => {
              const col = colById[cardToCol[card.id]];
              const accent = col?.accent ?? "220 12% 65%";
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => col && onEditCard(card, col.id)}
                  className="inline-flex max-w-[260px] items-center gap-2 truncate rounded-lg border border-border/40 bg-card/60 px-2.5 py-1.5 text-[12px] transition-colors hover:bg-card"
                  style={{ borderLeft: `2px solid hsl(${accent})` }}
                >
                  <span className="truncate">{card.title || "Sem título"}</span>
                  {col && (
                    <span className="text-[10px] text-muted-foreground">· {col.title}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
