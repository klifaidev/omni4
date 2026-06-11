import { useMemo } from "react";
import { Link } from "react-router-dom";
import { GlassCard } from "@/components/pricing/GlassCard";
import { loadState, formatDueShort, PRIORITY_TONE, PRIORITY_LABEL, type KanbanState } from "@/lib/kanban";
import { ArrowRight, ListChecks, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

function readKanban(): KanbanState | null {
  try {
    const raw = localStorage.getItem("harald.kanban.v1");
    if (!raw) return loadState();
    return loadState();
  } catch {
    return null;
  }
}

export function ActivitySummaryWidget() {
  const state = useMemo(readKanban, []);
  const stats = useMemo(() => {
    if (!state) return null;
    const lastColId = state.columns[state.columns.length - 1]?.id;
    const lastColIds = new Set(state.columns.find((c) => c.id === lastColId)?.cardIds ?? []);
    const todayIso = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const all = Object.values(state.cards);
    const open = all.filter((c) => !lastColIds.has(c.id));
    const overdue = open.filter((c) => c.dueDate && c.dueDate < todayIso);
    const completedThisWeek = all.filter(
      (c) => lastColIds.has(c.id) && new Date(c.createdAt) >= weekAgo,
    );
    const upcoming = [...open]
      .filter((c) => c.dueDate)
      .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1))
      .slice(0, 3);

    return {
      open: open.length,
      overdue: overdue.length,
      completed: completedThisWeek.length,
      upcoming,
      total: all.length,
    };
  }, [state]);

  return (
    <GlassCard>
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-medium">Atividades</h3>
        </div>
        <Link
          to="/atividades"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Ver todas <ArrowRight className="h-3 w-3" />
        </Link>
      </header>

      {!stats || stats.total === 0 ? (
        <div className="flex flex-col items-start gap-3 py-4">
          <p className="text-sm text-muted-foreground">Nenhuma atividade cadastrada.</p>
          <Link
            to="/atividades"
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/15"
          >
            <Plus className="h-3.5 w-3.5" />
            Criar primeira atividade
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <MiniKpi label="Abertas" value={stats.open} accent="text-primary" />
            <MiniKpi
              label="Vencidas"
              value={stats.overdue}
              accent={stats.overdue > 0 ? "text-destructive" : "text-muted-foreground"}
            />
            <MiniKpi label="Concluídas (7d)" value={stats.completed} accent="text-success" />
          </div>

          {stats.upcoming.length > 0 && (
            <ul className="mt-4 space-y-1.5">
              {stats.upcoming.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-2 rounded-lg border border-border/40 bg-card/30 px-2.5 py-1.5"
                >
                  <span className="flex-1 truncate text-xs">{c.title}</span>
                  {c.priority && (
                    <span
                      className={cn(
                        "rounded-full border px-1.5 py-0.5 text-[9px] font-medium",
                        PRIORITY_TONE[c.priority],
                      )}
                    >
                      {PRIORITY_LABEL[c.priority]}
                    </span>
                  )}
                  {c.dueDate && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatDueShort(c.dueDate)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </GlassCard>
  );
}

function MiniKpi({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-card/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-light tabular-nums", accent)}>{value}</div>
    </div>
  );
}
