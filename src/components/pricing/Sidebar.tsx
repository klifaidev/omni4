import { NavLink } from "@/components/NavLink";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";

import { usePricing } from "@/store/pricing";
import { useMonthsInfo } from "@/store/selectors";
import { useSidebarState } from "@/store/sidebar";
import { useHistory } from "@/store/history";
import { useBookmarks } from "@/store/bookmarks";
import { PAGE_LABELS } from "@/lib/pageMeta";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useHasActiveFilters } from "./ActiveFiltersBar";
import {
  AlertTriangle,
  BarChart3,
  BellRing,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coins,
  Database,
  DollarSign,
  FileSpreadsheet,
  Home,
  KanbanSquare,
  LineChart,
  Monitor,
  Moon,
  Network,
  PackageSearch,
  Presentation,
  Radar,
  Search,
  SlidersHorizontal,
  Star,
  Sun,
  TableProperties,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import { useActiveAlertCount } from "@/store/alertHistory";
import { useTheme, type Theme } from "@/store/theme";
import { useMemo, useState } from "react";
import { GlobalSearch } from "./GlobalSearch";
import { useCommandPalette } from "@/store/commandPalette";

const dashItems = [
  { to: "/", label: "Início", icon: Home, end: true },
  { to: "/visao-geral", label: "Visão Geral", icon: BarChart3 },
  { to: "/filtros", label: "Filtros", icon: SlidersHorizontal },
  { to: "/bridge-pvm", label: "Bridge PVM", icon: TrendingUp },
  { to: "/preco", label: "Análise de Preço", icon: DollarSign },
  { to: "/farol", label: "Farol de Cadastro", icon: Radar },
  { to: "/dre", label: "DRE", icon: FileSpreadsheet },
  { to: "/canais", label: "Canais", icon: Network },
  { to: "/custos", label: "Custos", icon: Coins },
  { to: "/abc", label: "Portfólio de SKUs", icon: LineChart },
  { to: "/budget", label: "Budget", icon: Target },
  { to: "/detalhe", label: "Tabela Dinâmica", icon: TableProperties },
];

const workItems = [
  { to: "/alertas", label: "Alertas", icon: BellRing, alertBadge: true },
  { to: "/atividades", label: "Atividades", icon: KanbanSquare },
  { to: "/demanda", label: "Demanda", icon: TrendingUp },
  { to: "/estoque", label: "Estoque", icon: PackageSearch },
  { to: "/slides", label: "Slides", icon: Presentation },
] as { to: string; label: string; icon: typeof KanbanSquare; alertBadge?: boolean }[];

export function Sidebar() {
  const missing = usePricing((s) => s.missing);
  const monthsCount = useMonthsInfo().length;
  const hasFilters = useHasActiveFilters();
  const activeAlertCount = useActiveAlertCount();

  const collapsed = useSidebarState((s) => s.collapsed);
  const toggleCollapsed = useSidebarState((s) => s.toggleCollapsed);
  const mobileOpen = useSidebarState((s) => s.mobileOpen);
  const setMobileOpen = useSidebarState((s) => s.setMobileOpen);
  const [searchOpen, setSearchOpen] = useState(false);
  const openCommandPalette = useCommandPalette((s) => s.setOpen);

  const missingCount = useMemo(
    () => missing.skus.length + missing.canais.length + missing.regioes.length + missing.ufs.length,
    [missing],
  );

  // On mobile, the drawer is full-width sidebar (230px) regardless of `collapsed`.
  // On desktop (md+), `collapsed` controls the width.
  const desktopWidth = collapsed ? "md:w-14" : "md:w-[230px]";
  const closeMobile = () => setMobileOpen(false);

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={closeMobile}
          className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm md:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-[230px] flex-col border-r border-border/40 bg-sidebar/90 backdrop-blur-2xl transition-[transform,width] duration-200 ease-out md:sticky md:top-0 md:z-30 md:translate-x-0 md:bg-sidebar/60 ${desktopWidth} ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
        aria-label="Navegação principal"
      >
        {/* Logo + mobile close */}
        <div
          className={`flex items-center justify-center px-5 pb-7 pt-6 ${collapsed ? "md:px-3" : ""}`}
        >
          <div
            className={`leading-tight transition-opacity duration-150 ${
              collapsed ? "md:hidden" : ""
            }`}
          >
            <h1 className="bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-4xl font-bold tracking-tight text-transparent">
              OMNI4
            </h1>
          </div>
          {collapsed && (
            <h1 className="hidden bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-xl font-bold tracking-tight text-transparent md:block">
              O4
            </h1>
          )}
          <button
            onClick={closeMobile}
            aria-label="Fechar menu"
            className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Busca global (Ctrl/Cmd+K) */}
        <div className={`px-3 pb-3 ${collapsed ? "md:px-2" : ""}`}>
          <button
            type="button"
            onClick={() => openCommandPalette(true)}
            title="Buscar (Ctrl+K)"
            aria-label="Buscar"
            className={`flex w-full items-center gap-2 rounded-lg border border-border/50 bg-sidebar-accent/30 px-2.5 py-2 text-[12px] text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-primary/60 ${
              collapsed ? "md:justify-center md:px-2" : ""
            }`}
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className={`flex-1 text-left ${collapsed ? "md:hidden" : ""}`}>Buscar…</span>
            <kbd
              className={`ml-auto hidden rounded border border-border/60 bg-background/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground ${
                collapsed ? "md:hidden" : "md:inline-block"
              }`}
            >
              Ctrl+K
            </kbd>
          </button>
        </div>

        {/* Nav */}
        <nav className={`flex-1 overflow-y-auto ${collapsed ? "md:px-2" : "px-3"}`}>
          <FavoritesSection collapsed={collapsed} onNavigate={closeMobile} />
          <SectionLabel collapsed={collapsed}>Dashboards</SectionLabel>
          <ul className="space-y-0.5">
            {dashItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={closeMobile}
                  title={collapsed ? item.label : undefined}
                  aria-label={item.label}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-sidebar-foreground/80 outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-primary/60 ${
                    collapsed ? "md:justify-center md:px-2" : ""
                  }`}
                  activeClassName="bg-sidebar-accent text-sidebar-foreground !text-primary font-medium shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.15)]"
                >
                  <span className="relative inline-flex">
                    <item.icon className="h-4 w-4" />
                    {hasFilters && (
                      <span
                        className="absolute -right-1 -top-1 h-[5px] w-[5px] rounded-full bg-primary shadow-[0_0_4px_hsl(var(--primary))]"
                        title="Filtros ativos aplicados"
                      />
                    )}
                  </span>
                  <span
                    className={`transition-opacity duration-150 ${
                      collapsed ? "md:hidden" : ""
                    }`}
                  >
                    {item.label}
                  </span>
                </NavLink>
              </li>
            ))}
          </ul>

          <SectionLabel collapsed={collapsed} className="mt-6">
            Workspace
          </SectionLabel>
          <ul className="space-y-0.5">
            {workItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={closeMobile}
                  title={collapsed ? item.label : undefined}
                  aria-label={item.label}
                  className={`flex items-center justify-between gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-sidebar-foreground/80 outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-primary/60 ${
                    collapsed ? "md:justify-center md:px-2" : ""
                  }`}
                  activeClassName="bg-sidebar-accent text-sidebar-foreground !text-primary font-medium shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.15)]"
                >
                  <span className="flex items-center gap-2.5">
                    <span className="relative inline-flex">
                      <item.icon className="h-4 w-4" />
                      {item.alertBadge && activeAlertCount > 0 && collapsed && (
                        <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-destructive shadow-[0_0_4px_hsl(var(--destructive))]" />
                      )}
                    </span>
                    <span
                      className={`transition-opacity duration-150 ${
                        collapsed ? "md:hidden" : ""
                      }`}
                    >
                      {item.label}
                    </span>
                  </span>
                  {item.alertBadge && activeAlertCount > 0 && !collapsed && (
                    <Badge className="h-5 min-w-[20px] justify-center bg-destructive px-1.5 text-[10px] font-semibold text-destructive-foreground hover:bg-destructive">
                      {activeAlertCount}
                    </Badge>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>

          <SectionLabel collapsed={collapsed} className="mt-6">
            Dados
          </SectionLabel>
          <ul>
            <li>
              <NavLink
                to="/upload"
                onClick={closeMobile}
                title={collapsed ? "Upload / Bases" : undefined}
                aria-label="Upload / Bases"
                className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-[13px] text-sidebar-foreground/80 outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-primary/60 ${
                  collapsed ? "md:justify-center md:px-2" : ""
                }`}
                activeClassName="bg-sidebar-accent !text-primary font-medium shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.15)]"
              >
                <span className="flex items-center gap-2.5">
                  <Database className="h-4 w-4" />
                  <span
                    className={`transition-opacity duration-150 ${
                      collapsed ? "md:hidden" : ""
                    }`}
                  >
                    Upload / Bases
                  </span>
                  {missingCount > 0 && <AlertTriangle className="h-3.5 w-3.5 text-warning" />}
                </span>
                {(monthsCount > 0 || missingCount > 0) && !collapsed && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-semibold">
                    {missingCount > 0 ? `${monthsCount} · !` : monthsCount}
                  </Badge>
                )}
              </NavLink>
              </li>
            </ul>
        </nav>

        {/* Histórico recente — oculto quando sidebar está colapsada */}
        {!collapsed && <RecentHistory onNavigate={closeMobile} />}


        {/* Theme toggle */}
        <ThemeToggle collapsed={collapsed} />

        {/* Toggle collapse — só desktop */}
        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expandir sidebar" : "Colapsar sidebar"}
          title={collapsed ? "Expandir" : "Colapsar"}
          className="mx-3 mb-3 hidden h-8 items-center justify-center gap-2 rounded-lg border border-border/50 bg-sidebar-accent/30 text-xs text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-primary/60 md:inline-flex"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          {!collapsed && <span>Colapsar</span>}
        </button>
      </aside>

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}

function ThemeToggle({ collapsed }: { collapsed: boolean }) {
  const theme = useTheme((s) => s.theme);
  const setTheme = useTheme((s) => s.setTheme);
  const opts: { value: Theme; icon: typeof Sun; label: string }[] = [
    { value: "light", icon: Sun, label: "Claro" },
    { value: "system", icon: Monitor, label: "Sistema" },
    { value: "dark", icon: Moon, label: "Escuro" },
  ];
  return (
    <div
      className={`mx-3 mb-2 flex items-center gap-1 overflow-hidden rounded-lg border border-border/50 bg-sidebar-accent/30 p-1 ${
        collapsed ? "md:flex-col" : ""
      }`}
    >
      {opts.map((o) => {
        const Icon = o.icon;
        const active = theme === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => setTheme(o.value)}
            aria-label={o.label}
            aria-pressed={active}
            title={o.label}
            className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] transition-colors ${
              active
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className={collapsed ? "md:hidden" : ""}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function SectionLabel({
  children,
  collapsed,
  className = "",
}: {
  children: React.ReactNode;
  collapsed: boolean;
  className?: string;
}) {
  if (collapsed) {
    return <div className={`mx-1 my-2 hidden h-px bg-border/40 md:block ${className}`} />;
  }
  return (
    <div
      className={`px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70 ${className}`}
    >
      {children}
    </div>
  );
}

function relativeTime(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} d`;
}

function RecentHistory({ onNavigate }: { onNavigate: () => void }) {
  const entries = useHistory((s) => s.entries);
  const clearHistory = useHistory((s) => s.clearHistory);
  const setFilter = usePricing((s) => s.setFilter);
  const clearFilters = usePricing((s) => s.clearFilters);
  const setSelectedPeriods = usePricing((s) => s.setSelectedPeriods);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const recent = entries.slice(0, 8);
  if (recent.length === 0) return null;

  const handleClick = (e: typeof entries[number]) => {
    clearFilters();
    for (const [k, v] of Object.entries(e.filters)) {
      if (v && v.length > 0) setFilter(k as Parameters<typeof setFilter>[0], v as string[]);
    }
    setSelectedPeriods(e.selectedPeriods);
    navigate(e.page);
    setOpen(false);
    onNavigate();
  };

  return (
    <div className="mx-3 mb-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors ${
              open
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border/50 bg-sidebar-accent/30 text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              Histórico recente
            </span>
            <ChevronRight className={`h-3 w-3 transition-transform ${open ? "translate-x-0.5" : ""}`} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="right"
          align="end"
          sideOffset={12}
          className="w-80 border-border/60 bg-popover/95 p-2 backdrop-blur-xl"
        >
          <div className="mb-2 flex items-center justify-between px-2 pt-1">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <Clock className="h-3 w-3" />
              Histórico recente
            </div>
            <button
              type="button"
              onClick={clearHistory}
              className="rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground/80 hover:bg-sidebar-accent hover:text-foreground"
            >
              Limpar
            </button>
          </div>
          <ul className="max-h-[60vh] space-y-0.5 overflow-y-auto">
            {recent.map((e) => {
              const Icon = PAGE_LABELS[e.page]?.icon ?? Clock;
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => handleClick(e)}
                    className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-sidebar-accent"
                    title={`${e.pageLabel} — ${e.summary}`}
                  >
                    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-medium text-foreground">
                        {e.pageLabel}
                      </div>
                      <div className="truncate text-[10px] text-muted-foreground">{e.summary}</div>
                    </div>
                    <span className="shrink-0 text-[9px] text-muted-foreground/70">
                      {relativeTime(e.visitedAt)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}


function FavoritesSection({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate: () => void;
}) {
  const bookmarks = useBookmarks((s) => s.bookmarks);
  const removeBookmark = useBookmarks((s) => s.removeBookmark);
  const setFilter = usePricing((s) => s.setFilter);
  const clearFilters = usePricing((s) => s.clearFilters);
  const setSelectedPeriods = usePricing((s) => s.setSelectedPeriods);
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);

  if (bookmarks.length === 0) return null;

  const MAX = 8;
  const visible = showAll ? bookmarks : bookmarks.slice(0, MAX);
  const hasMore = bookmarks.length > MAX;

  const apply = (b: typeof bookmarks[number]) => {
    clearFilters();
    for (const [k, v] of Object.entries(b.filters)) {
      if (v && v.length > 0) setFilter(k as Parameters<typeof setFilter>[0], v as string[]);
    }
    setSelectedPeriods(b.selectedPeriods);
    navigate(b.page);
    onNavigate();
  };

  return (
    <div className="mb-3">
      <SectionLabel collapsed={collapsed}>Favoritos</SectionLabel>
      <ul className="space-y-0.5">
        {visible.map((b) => {
          const Icon = PAGE_LABELS[b.page]?.icon ?? Star;
          return (
            <li key={b.id}>
              <div
                className={`group flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent ${
                  collapsed ? "md:justify-center md:px-2" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => apply(b)}
                  title={b.name}
                  aria-label={b.name}
                  className={`flex min-w-0 flex-1 items-center gap-2 text-left outline-none focus-visible:text-foreground ${
                    collapsed ? "md:justify-center" : ""
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                  <span className={`truncate ${collapsed ? "md:hidden" : ""}`}>{b.name}</span>
                </button>
                {!collapsed && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeBookmark(b.id);
                    }}
                    aria-label="Remover favorito"
                    className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 hover:bg-sidebar-accent hover:text-foreground group-hover:flex"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {hasMore && !collapsed && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-1 w-full rounded-md px-2.5 py-1 text-[10px] text-muted-foreground/70 hover:bg-sidebar-accent hover:text-foreground"
        >
          {showAll ? "Mostrar menos" : `Ver todos (${bookmarks.length})`}
        </button>
      )}
    </div>
  );
}
