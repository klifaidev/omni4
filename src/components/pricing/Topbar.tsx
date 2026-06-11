import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePricing } from "@/store/pricing";
import { useMonthsInfo } from "@/store/selectors";
import { useSidebarState } from "@/store/sidebar";
import { cn } from "@/lib/utils";
import { getFreshness } from "@/lib/freshness";
import { InnovationToggle } from "./InnovationToggle";
import { BookmarkButton } from "./BookmarkButton";
import { ShareButton } from "./ShareButton";
import { NotificationsPanel } from "./NotificationsPanel";
import { useNotifications } from "@/store/notifications";
import { AlertTriangle, Menu, Sparkles, CalendarRange, Bell } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

interface TopbarProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function Topbar({ title, subtitle, actions }: TopbarProps) {
  const months = useMonthsInfo();
  const selected = usePricing((s) => s.selectedPeriods);
  const togglePeriod = usePricing((s) => s.togglePeriod);
  const setAll = usePricing((s) => s.setAllPeriods);

  const setSelected = usePricing((s) => s.setSelectedPeriods);

  const allSelected = selected === null;

  const handleMonthClick = (periodo: string, e: React.MouseEvent) => {
    // Shift/Ctrl/Cmd-click: toggle (multi-select). Plain click: select only this one.
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      togglePeriod(periodo);
      return;
    }
    if (allSelected) {
      setSelected([periodo]);
      return;
    }
    // If only this one is selected, clicking again returns to "Todos"
    if (selected!.length === 1 && selected![0] === periodo) {
      setAll();
      return;
    }
    setSelected([periodo]);
  };

  const inovActive = usePricing((s) => s.filters.inovacao?.[0] === "Inovação");
  const setMobileOpen = useSidebarState((s) => s.setMobileOpen);

  const freshness = useMemo(() => getFreshness(months), [months]);
  const isStale = freshness.status === "stale";

  // Breadcrumb de período
  const periodBadge = (() => {
    if (months.length === 0) return null;
    const fy = months[months.length - 1].fy;
    const activeMonths = allSelected ? months : months.filter((m) => selected!.includes(m.periodo));
    if (activeMonths.length === 0) return null;
    const first = activeMonths[0].label;
    const last = activeMonths[activeMonths.length - 1].label;
    const range = activeMonths.length === 1 ? first : `${first} – ${last}`;
    return `${range} · ${fy}`;
  })();

  return (
    <header className="sticky top-0 z-20 border-b border-border/40 bg-background/60 px-4 py-4 backdrop-blur-2xl md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu de navegação"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-card/50 text-muted-foreground outline-none transition-colors hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/60 md:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-gradient-primary">{title}</h1>
              {inovActive && (
                <span className="inline-flex animate-fade-in items-center gap-1 rounded-full border border-accent/40 bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                  <Sparkles className="h-3 w-3" />
                  Modo Inovação
                </span>
              )}
            </div>
            {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {periodBadge && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      "hidden items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium sm:inline-flex",
                      isStale
                        ? "border-warning/40 bg-warning/10 text-warning"
                        : "border-border/60 bg-card/40 text-muted-foreground",
                    )}
                  >
                    {isStale ? (
                      <AlertTriangle className="h-3 w-3 text-warning" />
                    ) : (
                      <CalendarRange className="h-3 w-3 text-primary" />
                    )}
                    {periodBadge}
                    {isStale && (
                      <span
                        aria-hidden
                        className="ml-0.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-warning"
                      />
                    )}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {isStale ? (
                    <>
                      Último dado: {freshness.lastLabel}. Esperado: {freshness.expectedLabel}.
                    </>
                  ) : (
                    "Período ativo no app"
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {actions}
          <BookmarkButton />
          <ShareButton />
          <NotificationsBell />
          <InnovationToggle />
        </div>

        {months.length > 0 && (
          <MonthsStrip
            months={months}
            selected={selected}
            allSelected={allSelected}
            onAll={() => setAll()}
            onMonthClick={handleMonthClick}
          />
        )}
      </div>
    </header>
  );
}

function NotificationsBell() {
  const unread = useNotifications((s) => s.notifications.filter((n) => !n.read).length);
  const label = unread > 9 ? "9+" : String(unread);
  return (
    <NotificationsPanel>
      <button
        type="button"
        aria-label="Notificações"
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-card/50 text-muted-foreground outline-none transition-colors hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-semibold leading-none text-destructive-foreground h-4">
            {label}
          </span>
        )}
      </button>
    </NotificationsPanel>
  );
}

interface MonthsStripProps {
  months: ReturnType<typeof useMonthsInfo>;
  selected: string[] | null;
  allSelected: boolean;
  onAll: () => void;
  onMonthClick: (periodo: string, e: React.MouseEvent) => void;
}

function MonthsStrip({ months, selected, allSelected, onAll, onMonthClick }: MonthsStripProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeBtnRef = useRef<HTMLButtonElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const updateEdges = () => {
    const el = scrollerRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
  };

  useEffect(() => {
    updateEdges();
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateEdges, { passive: true });
    const ro = new ResizeObserver(updateEdges);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateEdges);
      ro.disconnect();
    };
  }, [months.length]);

  // Scroll para o mês ativo (quando a seleção muda via código)
  useEffect(() => {
    if (allSelected) return;
    activeBtnRef.current?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
  }, [selected, allSelected]);

  // Único mês ativo (para focar com scrollIntoView)
  const focusPeriod = !allSelected && selected && selected.length === 1 ? selected[0] : null;

  return (
    <div className="flex w-full items-center gap-1.5">
      <Button
        size="sm"
        variant={allSelected ? "default" : "outline"}
        className={cn(
          "h-7 shrink-0 rounded-full px-3 text-xs",
          allSelected && "bg-primary/20 text-primary hover:bg-primary/25 border border-primary/30",
        )}
        onClick={onAll}
        title="Selecionar todos os meses"
      >
        Todos
      </Button>

      <div className="relative min-w-0 flex-1">
        <div
          ref={scrollerRef}
          className="no-scrollbar flex items-center gap-1.5 overflow-x-auto"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {months.map((m) => {
            const active = !allSelected && selected!.includes(m.periodo);
            return (
              <Button
                key={m.periodo}
                ref={m.periodo === focusPeriod ? activeBtnRef : undefined}
                size="sm"
                variant="outline"
                className={cn(
                  "h-7 shrink-0 rounded-full border-border/60 bg-secondary/40 px-3 text-xs transition-colors",
                  active && "border-primary/40 bg-primary/15 text-primary",
                )}
                onClick={(e) => onMonthClick(m.periodo, e)}
                title="Clique para focar apenas neste mês • Shift/Ctrl-clique para múltipla seleção"
              >
                {m.label}
              </Button>
            );
          })}
        </div>

        {/* Fade esquerda — só quando há conteúdo escondido à esquerda */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-background/80 to-transparent transition-opacity duration-150",
            atStart ? "opacity-0" : "opacity-100",
          )}
        />
        {/* Fade direita */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background/80 to-transparent transition-opacity duration-150",
            atEnd ? "opacity-0" : "opacity-100",
          )}
        />
      </div>

      {!allSelected && (
        <span className="ml-1 hidden shrink-0 text-[10px] text-muted-foreground/70 md:inline">
          Shift-clique p/ múltipla
        </span>
      )}
    </div>
  );
}
