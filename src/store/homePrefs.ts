import { create } from "zustand";
import { persist } from "zustand/middleware";

export type HomeWidget = "kpis" | "alerts" | "shortcuts" | "activity_summary" | "trend_chart";
export type PinnedKpi = "rol" | "margem" | "volume" | "skus";

interface HomePrefsState {
  widgets: HomeWidget[];
  activeWidgets: Record<HomeWidget, boolean>;
  pinnedKpis: PinnedKpi[];
  setWidgets: (w: HomeWidget[]) => void;
  toggleWidget: (w: HomeWidget) => void;
  togglePinnedKpi: (k: PinnedKpi) => void;
  reset: () => void;
}

const DEFAULT_WIDGETS: HomeWidget[] = ["kpis", "alerts", "activity_summary", "shortcuts", "trend_chart"];
const DEFAULT_KPIS: PinnedKpi[] = ["rol", "margem", "volume", "skus"];

export const useHomePrefs = create<HomePrefsState>()(
  persist(
    (set) => ({
      widgets: DEFAULT_WIDGETS,
      activeWidgets: {
        kpis: true,
        alerts: true,
        shortcuts: true,
        activity_summary: true,
        trend_chart: true,
      },
      pinnedKpis: DEFAULT_KPIS,
      setWidgets: (widgets) => set({ widgets }),
      toggleWidget: (w) =>
        set((s) => ({
          activeWidgets: { ...s.activeWidgets, [w]: !s.activeWidgets[w] },
        })),
      togglePinnedKpi: (k) =>
        set((s) => {
          const has = s.pinnedKpis.includes(k);
          if (has && s.pinnedKpis.length === 1) return s; // mínimo 1
          const next = has ? s.pinnedKpis.filter((x) => x !== k) : [...s.pinnedKpis, k];
          // preserva a ordem canônica
          const order: PinnedKpi[] = ["rol", "margem", "volume", "skus"];
          return { pinnedKpis: order.filter((x) => next.includes(x)) };
        }),
      reset: () =>
        set({
          widgets: DEFAULT_WIDGETS,
          activeWidgets: { kpis: true, alerts: true, shortcuts: true, activity_summary: true, trend_chart: true },
          pinnedKpis: DEFAULT_KPIS,
        }),
    }),
    { name: "home-prefs-v1" },
  ),
);

export const WIDGET_LABEL: Record<HomeWidget, string> = {
  kpis: "KPIs",
  alerts: "Atenção necessária",
  activity_summary: "Resumo de atividades",
  shortcuts: "Atalhos rápidos",
  trend_chart: "Tendência recente",
};
