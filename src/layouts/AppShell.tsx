import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { UpdateNotification } from "@/components/UpdateNotification";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Sidebar } from "@/components/pricing/Sidebar";
import { ActiveFiltersBar } from "@/components/pricing/ActiveFiltersBar";
import { NoResultsBanner } from "@/components/pricing/NoResultsBanner";
import { ShortcutsHelp } from "@/components/pricing/ShortcutsHelp";
import { CommandPalette } from "@/components/pricing/CommandPalette";
import { SendToSlideDestinationDialog } from "@/components/pricing/SendToSlideDestinationDialog";
import { useCommandPalette } from "@/store/commandPalette";
import { useNotifications } from "@/store/notifications";
import { loadState as loadKanban } from "@/lib/kanban";
import { useSidebarState } from "@/store/sidebar";
import { useTheme, applyTheme } from "@/store/theme";
import { usePricing } from "@/store/pricing";
import { useHistory } from "@/store/history";
import { useMonthsInfo } from "@/store/selectors";
import { PAGE_LABELS, NON_HISTORY_PATHS } from "@/lib/pageMeta";
import { hasShareParams, parseShareParams } from "@/lib/shareUrl";

const NAV_MAP: Record<string, { path: string; label: string }> = {
  h: { path: "/", label: "Home" },
  v: { path: "/visao-geral", label: "Visão Geral" },
  b: { path: "/bridge-pvm", label: "Bridge PVM" },
  d: { path: "/dre", label: "DRE" },
  c: { path: "/canais", label: "Canais" },
  p: { path: "/abc", label: "Portfólio de SKUs" },
  u: { path: "/budget", label: "Budget" },
  s: { path: "/slides", label: "Slides" },
};

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

export default function AppShell() {
  const setCollapsed = useSidebarState((s) => s.setCollapsed);
  const theme = useTheme((s) => s.theme);
  const navigate = useNavigate();
  const clearFilters = usePricing((s) => s.clearFilters);
  const filters = usePricing((s) => s.filters);
  const selectedPeriods = usePricing((s) => s.selectedPeriods);
  const months = useMonthsInfo();
  const addEntry = useHistory((s) => s.addEntry);
  const location = useLocation();
  const setFilter = usePricing((s) => s.setFilter);
  const setSelectedPeriods = usePricing((s) => s.setSelectedPeriods);
  const [helpOpen, setHelpOpen] = useState(false);
  const commandOpen = useCommandPalette((s) => s.open);
  const setCommandOpen = useCommandPalette((s) => s.setOpen);

  // Restaura filtros a partir da URL compartilhada (uma vez no mount)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hasShareParams(window.location.search)) return;
    const parsed = parseShareParams(window.location.search);
    if (parsed.filters) {
      clearFilters();
      for (const [k, v] of Object.entries(parsed.filters)) {
        if (v && v.length > 0) setFilter(k as Parameters<typeof setFilter>[0], v as string[]);
      }
    }
    if (parsed.selectedPeriods !== undefined) {
      setSelectedPeriods(parsed.selectedPeriods);
    }
    toast.info("Filtros restaurados do link compartilhado.", { duration: 2500 });
    // Limpa os params da URL para não re-aplicar em recargas/navegação
    const cleanUrl = window.location.pathname + window.location.hash;
    window.history.replaceState({}, "", cleanUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Registra a página visitada no histórico (debounced para capturar filtros já aplicados)
  useEffect(() => {
    const meta = PAGE_LABELS[location.pathname];
    if (!meta || NON_HISTORY_PATHS.has(location.pathname)) return;
    const handle = window.setTimeout(() => {
      const parts: string[] = [];
      const filterEntries = Object.entries(filters).filter(([, v]) => v && v.length > 0);
      for (const [key, vals] of filterEntries.slice(0, 2)) {
        const list = vals as string[];
        const shown = list.length === 1 ? list[0] : `${list[0]} +${list.length - 1}`;
        parts.push(`${key}: ${shown}`);
      }
      if (selectedPeriods && selectedPeriods.length > 0) {
        const labels = selectedPeriods
          .map((p) => months.find((m) => m.periodo === p)?.label ?? p)
          .slice(0, 2);
        const periodTxt =
          selectedPeriods.length > 2 ? `${labels.join(", ")} +${selectedPeriods.length - 2}` : labels.join(", ");
        parts.push(periodTxt);
      }
      const summary = parts.length > 0 ? parts.join(" · ") : "Sem filtros";
      addEntry({
        page: location.pathname,
        pageLabel: meta.label,
        filters,
        selectedPeriods,
        summary,
      });
    }, 600);
    return () => window.clearTimeout(handle);
  }, [location.pathname, filters, selectedPeriods, months, addEntry]);

  // Aplica tema (classe `light` / `dark` no <html>) e reage a mudanças do sistema quando "system"
  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system" || typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-color-scheme: light)");
    const handler = () => applyTheme("system");
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [theme]);

  // Auto-colapsar quando viewport < 1400px; expandir acima disso
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 1399px)");
    const apply = (matches: boolean) => setCollapsed(matches);
    apply(mql.matches);
    const handler = (e: MediaQueryListEvent) => apply(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [setCollapsed]);

  // Atalhos de teclado globais
  const chordRef = useRef<{ active: boolean; timer: number | null }>({ active: false, timer: null });
  useEffect(() => {
    const clearChord = () => {
      if (chordRef.current.timer !== null) {
        window.clearTimeout(chordRef.current.timer);
      }
      chordRef.current = { active: false, timer: null };
    };

    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(document.activeElement)) return;

      const key = e.key.toLowerCase();

      // Segundo passo do chord G + letra
      if (chordRef.current.active) {
        if (key === "f") {
          e.preventDefault();
          const grid = document.querySelector<HTMLElement>('[data-shortcut-target="filter-grid"]');
          const first = grid?.querySelector<HTMLElement>(
            'button, [role="combobox"], input, [tabindex]:not([tabindex="-1"])',
          );
          first?.focus();
          clearChord();
          return;
        }
        const target = NAV_MAP[key];
        if (target) {
          e.preventDefault();
          navigate(target.path);
          toast.info(`Navegando para ${target.label}`, { duration: 1500 });
        }
        clearChord();
        return;
      }

      // Início do chord
      if (key === "g") {
        e.preventDefault();
        chordRef.current.active = true;
        chordRef.current.timer = window.setTimeout(clearChord, 800);
        return;
      }

      // Escape: limpar filtros (se não houver dialog/popover aberto)
      if (e.key === "Escape") {
        const hasOverlay = document.querySelector(
          '[role="dialog"][data-state="open"], [data-radix-popper-content-wrapper]',
        );
        if (!hasOverlay) {
          clearFilters();
        }
        return;
      }

      // "?" abre a ajuda
      if (e.key === "?" || (e.shiftKey && key === "/")) {
        e.preventDefault();
        setHelpOpen(true);
      }
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      clearChord();
    };
  }, [navigate, clearFilters]);

  // Atalho global Ctrl/Cmd+K → command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        if (isTypingTarget(document.activeElement) && (e.target as HTMLElement)?.closest?.('[cmdk-root]') === null) {
          // permite digitar livremente em campos, mas ainda intercepta Cmd+K em qualquer lugar
        }
        e.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setCommandOpen]);

  // Scan diário do Kanban → notificações de atividades a vencer / atrasadas
  useEffect(() => {
    if (typeof window === "undefined") return;
    const todayIso = new Date().toISOString().slice(0, 10);
    try {
      if (localStorage.getItem("notif-checked-date") === todayIso) return;
      const kanban = loadKanban();
      const lastColId = kanban.columns[kanban.columns.length - 1]?.id;
      const add = useNotifications.getState().addNotification;
      const existing = new Set(
        useNotifications
          .getState()
          .notifications.filter((n) => n.type === "activity_due" || n.type === "activity_overdue")
          .map((n) => `${n.type}:${n.body}`),
      );
      for (const card of Object.values(kanban.cards)) {
        if (!card.dueDate) continue;
        const inLastCol = lastColId
          ? kanban.columns.find((c) => c.id === lastColId)?.cardIds.includes(card.id)
          : false;
        if (card.dueDate === todayIso) {
          const key = `activity_due:${card.title}`;
          if (existing.has(key)) continue;
          add({
            type: "activity_due",
            title: "Atividade vence hoje",
            body: card.title,
            href: "/atividades",
          });
          existing.add(key);
        } else if (card.dueDate < todayIso && !inLastCol) {
          const key = `activity_overdue:${card.title}`;
          if (existing.has(key)) continue;
          add({
            type: "activity_overdue",
            title: "Atividade em atraso",
            body: card.title,
            href: "/atividades",
          });
          existing.add(key);
        }
      }
      localStorage.setItem("notif-checked-date", todayIso);
    } catch {
      /* noop */
    }
  }, []);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <ActiveFiltersBar />
        <NoResultsBanner />
        <Outlet />
      </main>
      <ShortcutsHelp open={helpOpen} onOpenChange={setHelpOpen} />
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      <SendToSlideDestinationDialog />
      <UpdateNotification />
    </div>
  );
}
