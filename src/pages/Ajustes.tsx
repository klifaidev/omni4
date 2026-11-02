import type { ReactNode } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { UpdateCard } from "@/components/ajustes/UpdateCard";
import { GlassCard } from "@/components/pricing/GlassCard";
import { Topbar } from "@/components/pricing/Topbar";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePageTitle } from "@/hooks/use-page-title";
import { useHomePrefs, WIDGET_LABEL, type HomeWidget, type PinnedKpi } from "@/store/homePrefs";
import { useSidebarState } from "@/store/sidebar";
import { useTheme, type Theme } from "@/store/theme";

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "system", label: "Sistema", icon: Monitor },
  { value: "dark", label: "Escuro", icon: Moon },
];

const KPI_LABEL: Record<PinnedKpi, string> = { rol: "ROL", margem: "Margem", volume: "Volume", skus: "SKUs" };

function Setting({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export default function Ajustes() {
  usePageTitle("Ajustes");
  const theme = useTheme((s) => s.theme);
  const setTheme = useTheme((s) => s.setTheme);
  const collapsed = useSidebarState((s) => s.collapsed);
  const setCollapsed = useSidebarState((s) => s.setCollapsed);
  const widgets = useHomePrefs((s) => s.widgets);
  const activeWidgets = useHomePrefs((s) => s.activeWidgets);
  const toggleWidget = useHomePrefs((s) => s.toggleWidget);
  const pinnedKpis = useHomePrefs((s) => s.pinnedKpis);
  const togglePinnedKpi = useHomePrefs((s) => s.togglePinnedKpi);
  const resetHome = useHomePrefs((s) => s.reset);

  return (
    <div>
      <Topbar title="Ajustes" subtitle="Atualize o app e deixe-o do seu jeito" showPeriodStrip={false} />
      <div className="mx-auto max-w-3xl space-y-6 px-8 py-6">
        <UpdateCard />

        <GlassCard>
          <h2 className="mb-4 text-sm font-semibold">Aparência</h2>
          <div className="divide-y divide-border/40">
            <Setting label="Tema">
              <ToggleGroup
                type="single"
                size="sm"
                value={theme}
                onValueChange={(value) => { if (value) setTheme(value as Theme); }}
              >
                {THEMES.map(({ value, label, icon: Icon }) => (
                  <ToggleGroupItem key={value} value={value} className="gap-1.5 text-xs">
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Setting>
            <Setting label="Menu lateral recolhido" hint="Mostra só os ícones e deixa mais espaço para os gráficos.">
              <Switch checked={collapsed} onCheckedChange={setCollapsed} aria-label="Menu lateral recolhido" />
            </Setting>
          </div>
        </GlassCard>

        <GlassCard>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Início</h2>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={resetHome}>Restaurar padrão</Button>
          </div>
          <div className="divide-y divide-border/40">
            {widgets.map((widget: HomeWidget) => (
              <Setting key={widget} label={WIDGET_LABEL[widget]}>
                <Switch
                  checked={activeWidgets[widget]}
                  onCheckedChange={() => toggleWidget(widget)}
                  aria-label={WIDGET_LABEL[widget]}
                />
              </Setting>
            ))}
            <Setting label="Indicadores em destaque" hint="Pelo menos um fica sempre visível.">
              <ToggleGroup type="multiple" size="sm" value={pinnedKpis}>
                {(Object.keys(KPI_LABEL) as PinnedKpi[]).map((kpi) => (
                  <ToggleGroupItem key={kpi} value={kpi} className="text-xs" onClick={() => togglePinnedKpi(kpi)}>
                    {KPI_LABEL[kpi]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Setting>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
