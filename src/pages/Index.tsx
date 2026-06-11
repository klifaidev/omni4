import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { usePricing } from "@/store/pricing";
import { useBudget } from "@/store/budget";
import { useMonthsInfo } from "@/store/selectors";
import {
  applyFilters,
  computeKPIs,
  computeKPIComparison,
  getKpiComparisonContext,
  generateAlerts,
  type Alert,
} from "@/lib/analytics";
import { formatBRL, formatNum, formatPct, formatTon, monthLabel } from "@/lib/format";
import {
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  Sparkles,
  BarChart3,
  TrendingUp,
  Database,
  ArrowRight,
  Upload as UploadIcon,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Target,
  TrendingDown,
  Layers,
  Activity,
  Presentation,
  Lock,
  PlayCircle,
  Plus,
  Settings2,
  GripVertical,
  Check as CheckIcon,
} from "lucide-react";
import { QuickActivityDialog, type QuickActivityPrefill } from "@/components/atividades/QuickActivityDialog";
import { ActivitySummaryWidget } from "@/components/pricing/ActivitySummaryWidget";
import { TrendChartWidget } from "@/components/pricing/TrendChartWidget";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useHomePrefs, WIDGET_LABEL, type HomeWidget, type PinnedKpi } from "@/store/homePrefs";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAlertHistory } from "@/store/alertHistory";
import { useNotifications } from "@/store/notifications";
import { usePageTitle } from "@/hooks/use-page-title";
import { generateDemoData } from "@/lib/demoData";
import { toast } from "sonner";

export default function Index() {
  usePageTitle("");
  const rows = usePricing((s) => s.rows);
  const filters = usePricing((s) => s.filters);
  const selected = usePricing((s) => s.selectedPeriods);
  const metric = usePricing((s) => s.metric);
  const isDemoData = usePricing((s) => s.isDemoData);
  const budgetRows = useBudget((s) => s.rows);
  const addParsed = usePricing((s) => s.addParsed);
  const clearAll = usePricing((s) => s.clearAll);
  const setDemoMode = usePricing((s) => s.setDemoMode);
  const addBudget = useBudget((s) => s.addBudget);
  const clearBudget = useBudget((s) => s.clearBudget);
  const months = useMonthsInfo();
  const navigate = useNavigate();

  const handleLoadDemo = () => {
    clearAll();
    clearBudget();
    const demo = generateDemoData();
    addParsed(demo.realRows, demo.realFile, true, { skus: [], canais: [], regioes: [], ufs: [] });
    addBudget(demo.budgetRows, demo.budgetFile, true);
    setDemoMode(true);
    toast.success("Dados de demonstração carregados", {
      description: "Explore as análises à vontade.",
    });
    navigate("/visao-geral");
  };

  const filtered = useMemo(() => applyFilters(rows, filters, selected), [rows, filters, selected]);
  const kpis = useMemo(() => computeKPIs(filtered, metric), [filtered, metric]);

  const comparison = useMemo(() => {
    const ctx = getKpiComparisonContext(rows, filters, selected);
    if (!ctx) return null;
    const cmp = computeKPIComparison(filtered, ctx.previousRows, metric);
    return { ...cmp, label: ctx.label };
  }, [rows, filters, selected, filtered, metric]);

  const allAlerts = useMemo(
    () => generateAlerts(rows, budgetRows, metric),
    [rows, budgetRows, metric],
  );
  const alerts = useMemo(() => allAlerts.slice(0, 5), [allAlerts]);

  const syncAlerts = useAlertHistory((s) => s.syncAlerts);
  const addNotification = useNotifications((s) => s.addNotification);
  const lastMonth = months.length ? months[months.length - 1] : null;
  useEffect(() => {
    if (rows.length === 0) return;
    const snapshot = lastMonth
      ? `${monthLabel(lastMonth.mes, lastMonth.ano)} · ${lastMonth.fy}`
      : "";
    syncAlerts(allAlerts, snapshot);
    const existing = new Set(
      useNotifications
        .getState()
        .notifications.filter((n) => n.type === "alert")
        .map((n) => n.body),
    );
    for (const a of allAlerts) {
      if (a.severity !== "high") continue;
      if (existing.has(a.message)) continue;
      addNotification({
        type: "alert",
        title: "Alerta de pricing",
        body: a.message,
        href: a.page,
      });
      existing.add(a.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allAlerts, rows.length]);

  const empty = rows.length === 0;

  const [quickPrefill, setQuickPrefill] = useState<QuickActivityPrefill | null>(null);

  function handleAlertCreateActivity(alert: Alert) {
    setQuickPrefill({
      title: alert.message,
      tags: ["alerta-pricing", alert.severity],
      priority:
        alert.severity === "high" ? "high" : alert.severity === "medium" ? "med" : undefined,
    });
  }

  return (
    <>
      <Topbar
        title="Pricing Analytics — Harald"
        subtitle="Painel executivo de pricing e lucratividade B2B"
      />

      <div className="space-y-6 px-8 py-6 animate-fade-up">
        {empty ? (
          <>
            <GlassCard className="relative overflow-hidden p-10 glow-blue">
              <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
              <div className="relative space-y-6">
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-primary">
                    <Sparkles className="h-3 w-3" /> Bem-vindo
                  </div>
                  <h2 className="text-3xl font-light tracking-tight">
                    Comece carregando seus <span className="text-primary">CSVs mensais</span>.
                  </h2>
                  <p className="max-w-2xl text-sm text-muted-foreground">
                    Detectamos automaticamente os meses, alertamos duplicidades e geramos análises completas:
                    KPIs, Bridge PVM, ABC de SKUs e tabela detalhada.
                  </p>
                </div>

                {/* Stepper */}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {[
                    { n: 1, icon: UploadIcon, title: "Upload", text: "Carregue seus CSVs mensais de KE30" },
                    { n: 2, icon: BarChart3, title: "Análise", text: "Explore KPIs, Bridge PVM e Portfólio de SKUs" },
                    { n: 3, icon: Presentation, title: "Slides", text: "Exporte sua análise como apresentação PPTX" },
                  ].map((s) => (
                    <div
                      key={s.n}
                      className="flex items-center gap-4 rounded-2xl border border-border/60 bg-card/40 p-4 backdrop-blur-sm"
                    >
                      <div className="text-4xl font-extralight tabular-nums text-primary/60">
                        {s.n}
                      </div>
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                        <s.icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{s.title}</div>
                        <div className="text-xs text-muted-foreground">{s.text}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* CTAs */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <Link
                    to="/upload"
                    className="group inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-glow transition-all hover:bg-primary/90"
                  >
                    <UploadIcon className="h-4 w-4" />
                    Ir para Upload
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                  <button
                    onClick={handleLoadDemo}
                    className="inline-flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 px-5 py-2.5 text-sm font-medium text-primary transition-all hover:bg-primary/10"
                  >
                    <PlayCircle className="h-4 w-4" />
                    Ver com dados de demonstração
                  </button>
                </div>
              </div>
            </GlassCard>

            {/* O que você vai encontrar aqui */}
            <div>
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                O que você vai encontrar aqui
              </h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <FeaturePreview
                  icon={BarChart3}
                  title="KPIs em tempo real"
                  text="ROL, margem, volume e SKUs ativos."
                  preview={<PreviewKpis />}
                />
                <FeaturePreview
                  icon={TrendingUp}
                  title="Bridge PVM"
                  text="Decomponha variação por Volume, Preço, Custo, Mix."
                  preview={<PreviewBridge />}
                />
                <FeaturePreview
                  icon={Database}
                  title="Filtros dinâmicos"
                  text="Marca, canal, categoria, região e mais."
                  preview={<PreviewFilters />}
                />
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 pt-2 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              Seus dados ficam apenas no seu navegador — nenhuma informação é enviada para servidores.
            </div>
          </>
        ) : (
          <>
            {/* Linha de status */}
            {lastMonth && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
                  <Activity className="h-3 w-3" />
                  {monthLabel(lastMonth.mes, lastMonth.ano)}
                </span>
                <span className="rounded-full border border-border/60 bg-card/40 px-3 py-1 text-[11px] text-muted-foreground">
                  {lastMonth.fy}
                </span>
                <span className="rounded-full border border-border/60 bg-card/40 px-3 py-1 text-[11px] text-muted-foreground">
                  {months.length} {months.length === 1 ? "mês carregado" : "meses carregados"}
                </span>
              </div>
            )}

            {isDemoData && (
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 animate-fade-in">
                <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                <div className="flex-1 text-xs text-foreground">
                  Você está visualizando <span className="font-semibold">dados de demonstração</span>. Os dados reais ainda não foram carregados.
                </div>
                <Link to="/upload" className="text-xs font-medium text-warning underline-offset-2 hover:underline">
                  Gerenciar bases →
                </Link>
              </div>
            )}

            <HomeWidgets
              kpis={kpis}
              metric={metric}
              comparison={comparison}
              months={months}
              alerts={alerts}
              onAlertClick={(p) => navigate(p)}
              onAlertCreateActivity={handleAlertCreateActivity}
            />
          </>
        )}
      </div>
      <QuickActivityDialog
        open={!!quickPrefill}
        onOpenChange={(o) => !o && setQuickPrefill(null)}
        prefill={quickPrefill ?? undefined}
      />
    </>
  );
}

const ALERT_ICONS: Record<string, typeof AlertCircle> = {
  "trending-down": TrendingDown,
  "alert-triangle": AlertTriangle,
  "alert-circle": AlertCircle,
  target: Target,
};

function AlertCard({
  alert,
  onClick,
  onCreateActivity,
}: {
  alert: Alert;
  onClick: () => void;
  onCreateActivity: () => void;
}) {
  const Icon = ALERT_ICONS[alert.icon] ?? AlertCircle;
  const tone =
    alert.severity === "high"
      ? "border-destructive/40 bg-destructive/5 hover:border-destructive/70 text-destructive"
      : alert.severity === "medium"
      ? "border-warning/40 bg-warning/5 hover:border-warning/70 text-warning"
      : "border-border/60 bg-card/40 hover:border-primary/40 text-muted-foreground";
  return (
    <div
      className={cn(
        "group flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 transition-all",
        tone,
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <button
        type="button"
        onClick={onClick}
        className="flex flex-1 items-center gap-3 text-left"
      >
        <span className="flex-1 text-sm text-foreground">{alert.message}</span>
      </button>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCreateActivity();
              }}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-muted/60 hover:text-foreground"
              aria-label="Criar atividade"
            >
              <Plus className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Criar atividade a partir deste alerta
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <button
        type="button"
        onClick={onClick}
        aria-label="Ir para o detalhe"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 transition-all hover:text-foreground group-hover:translate-x-0.5"
      >
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function ShortcutCard({
  to,
  icon: Icon,
  title,
  desc,
}: {
  to: string;
  icon: typeof TrendingUp;
  title: string;
  desc: string;
}) {
  return (
    <Link
      to={to}
      className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-border/60 bg-card/40 p-5 transition-all hover:border-primary/50 hover:shadow-glow"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1">
        <h4 className="text-sm font-medium">{title}</h4>
        <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  );
}

function formatDeltaPct(d: number): string {
  const sign = d > 0 ? "+" : d < 0 ? "−" : "";
  return `${sign}${Math.abs(d * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function Stat({
  label,
  value,
  sub,
  accent,
  delta,
  deltaLabel,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: string;
  delta?: number;
  deltaLabel?: string;
}) {
  const hasDelta = typeof delta === "number" && isFinite(delta);
  const dir = hasDelta ? (delta! > 0 ? "up" : delta! < 0 ? "down" : "flat") : null;
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className={`mt-2 text-3xl font-light tabular-nums ${accent}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      {hasDelta && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
              dir === "up" && "bg-success/15 text-success",
              dir === "down" && "bg-destructive/15 text-destructive",
              dir === "flat" && "bg-muted text-muted-foreground",
            )}
          >
            {dir === "up" && <ArrowUpRight className="h-3 w-3" />}
            {dir === "down" && <ArrowDownRight className="h-3 w-3" />}
            {dir === "flat" && <Minus className="h-3 w-3" />}
            {formatDeltaPct(delta!)}
          </span>
          {deltaLabel && <span className="text-[11px] text-muted-foreground">{deltaLabel}</span>}
        </div>
      )}
    </div>
  );
}

function FeaturePreview({
  icon: Icon,
  title,
  text,
  preview,
}: {
  icon: typeof BarChart3;
  title: string;
  text: string;
  preview: ReactNode;
}) {
  return (
    <GlassCard hoverable className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-primary" />
        <h3 className="text-sm font-medium">{title}</h3>
      </div>
      <div className="rounded-xl border border-border/50 bg-background/40 p-3">
        {preview}
      </div>
      <p className="text-xs text-muted-foreground">{text}</p>
    </GlassCard>
  );
}

function PreviewKpis() {
  const items = [
    { label: "ROL", val: "R$ 12,4M", tone: "text-primary" },
    { label: "CM%", val: "32,1%", tone: "text-success" },
    { label: "Vol.", val: "1,8 kt", tone: "text-warning" },
    { label: "SKUs", val: "284", tone: "text-accent" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((i) => (
        <div key={i.label} className="rounded-lg bg-card/60 px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
            {i.label}
          </div>
          <div className={cn("text-sm font-light tabular-nums", i.tone)}>{i.val}</div>
        </div>
      ))}
    </div>
  );
}

function PreviewBridge() {
  const bars = [
    { h: 70, tone: "bg-primary/70" },
    { h: 45, tone: "bg-success/70" },
    { h: 30, tone: "bg-destructive/70" },
    { h: 55, tone: "bg-warning/70" },
    { h: 80, tone: "bg-accent/70" },
  ];
  return (
    <div className="flex h-20 items-end justify-between gap-1.5">
      {bars.map((b, i) => (
        <div
          key={i}
          className={cn("flex-1 rounded-t-sm", b.tone)}
          style={{ height: `${b.h}%` }}
        />
      ))}
    </div>
  );
}

function PreviewFilters() {
  const chips = ["Marca A", "Sul", "Indústria", "Q4", "+3"];
  return (
    <div className="flex h-20 flex-wrap content-start gap-1.5">
      {chips.map((c) => (
        <span
          key={c}
          className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] text-primary"
        >
          {c}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------
// Home widgets — customizáveis e ordenáveis
// ---------------------------------------------------------------

interface HomeWidgetsProps {
  kpis: ReturnType<typeof import("@/lib/analytics").computeKPIs>;
  metric: ReturnType<typeof usePricing.getState>["metric"];
  comparison: { deltaPct: { rol: number; margem: number; volumeKg: number; skus: number }; label: string } | null;
  months: ReturnType<typeof useMonthsInfo>;
  alerts: Alert[];
  onAlertClick: (page: string) => void;
  onAlertCreateActivity: (a: Alert) => void;
}

function HomeWidgets({ kpis, metric, comparison, months, alerts, onAlertClick, onAlertCreateActivity }: HomeWidgetsProps) {
  const widgets = useHomePrefs((s) => s.widgets);
  const activeWidgets = useHomePrefs((s) => s.activeWidgets);
  const setWidgets = useHomePrefs((s) => s.setWidgets);
  const toggleWidget = useHomePrefs((s) => s.toggleWidget);
  const [editing, setEditing] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = widgets.indexOf(active.id as HomeWidget);
    const newIdx = widgets.indexOf(over.id as HomeWidget);
    if (oldIdx < 0 || newIdx < 0) return;
    setWidgets(arrayMove(widgets, oldIdx, newIdx));
  };

  const visibleWidgets = editing ? widgets : widgets.filter((w) => activeWidgets[w]);

  const renderWidget = (w: HomeWidget) => {
    switch (w) {
      case "kpis":
        return <KpisWidget kpis={kpis} metric={metric} comparison={comparison} months={months} editing={editing} />;
      case "alerts":
        return (
          <AlertsWidget alerts={alerts} onClick={onAlertClick} onCreateActivity={onAlertCreateActivity} />
        );
      case "shortcuts":
        return <ShortcutsWidget />;
      case "activity_summary":
        return <ActivitySummaryWidget />;
      case "trend_chart":
        return <TrendChartWidget />;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1 text-xs font-medium transition-colors",
            editing
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-card/40 text-muted-foreground hover:text-foreground",
          )}
        >
          {editing ? <CheckIcon className="h-3.5 w-3.5" /> : <Settings2 className="h-3.5 w-3.5" />}
          {editing ? "Concluir" : "Personalizar"}
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={visibleWidgets} strategy={verticalListSortingStrategy}>
          <div className="space-y-4">
            {visibleWidgets.map((w) => (
              <SortableWidget
                key={w}
                id={w}
                editing={editing}
                active={activeWidgets[w]}
                onToggle={() => toggleWidget(w)}
              >
                {renderWidget(w)}
              </SortableWidget>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableWidget({
  id,
  editing,
  active,
  onToggle,
  children,
}: {
  id: HomeWidget;
  editing: boolean;
  active: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (!editing) {
    return <div>{children}</div>;
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-2xl border border-dashed border-primary/30 bg-background/30 p-2 transition-opacity",
        isDragging && "opacity-60",
        !active && "opacity-50",
      )}
    >
      <div className="mb-2 flex items-center gap-2 px-2">
        <button
          type="button"
          className="cursor-grab text-muted-foreground/60 hover:text-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
          aria-label="Arrastar"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="text-xs font-medium">{WIDGET_LABEL[id]}</span>
        <div className="ml-auto">
          <Switch checked={active} onCheckedChange={onToggle} />
        </div>
      </div>
      <div className={cn(!active && "pointer-events-none")}>{children}</div>
    </div>
  );
}

function KpisWidget({
  kpis,
  metric,
  comparison,
  months,
  editing,
}: {
  kpis: HomeWidgetsProps["kpis"];
  metric: HomeWidgetsProps["metric"];
  comparison: HomeWidgetsProps["comparison"];
  months: HomeWidgetsProps["months"];
  editing: boolean;
}) {
  const pinned = useHomePrefs((s) => s.pinnedKpis);
  const toggle = useHomePrefs((s) => s.togglePinnedKpi);

  const ALL_KPIS: Array<{
    key: PinnedKpi;
    label: string;
    value: string;
    sub?: string;
    accent: string;
    delta?: number;
  }> = [
    {
      key: "rol",
      label: "ROL Total",
      value: formatBRL(kpis.rol, { compact: true }),
      accent: "text-primary",
      delta: comparison?.deltaPct.rol,
    },
    {
      key: "margem",
      label: metric === "cm" ? "Contrib. Marginal" : "Margem Bruta",
      value: formatBRL(kpis.margem, { compact: true }),
      sub: formatPct(kpis.margemPct),
      accent: "text-success",
      delta: comparison?.deltaPct.margem,
    },
    {
      key: "volume",
      label: "Volume",
      value: formatTon(kpis.volumeKg),
      accent: "text-warning",
      delta: comparison?.deltaPct.volumeKg,
    },
    {
      key: "skus",
      label: "SKUs ativos",
      value: formatNum(kpis.skus),
      sub: `${months.length} mês(es)`,
      accent: "text-accent",
      delta: comparison?.deltaPct.skus,
    },
  ];

  const items = ALL_KPIS.filter((k) => pinned.includes(k.key));
  const cols = items.length === 1 ? "md:grid-cols-1" : items.length === 2 ? "md:grid-cols-2" : items.length === 3 ? "md:grid-cols-3" : "md:grid-cols-4";

  return (
    <>
      <GlassCard className={cn("grid grid-cols-2 gap-6 p-6", cols)}>
        {items.map((i) => (
          <Stat
            key={i.key}
            label={i.label}
            value={i.value}
            sub={i.sub}
            accent={i.accent}
            delta={i.delta}
            deltaLabel={comparison?.label}
          />
        ))}
      </GlassCard>
      {editing && (
        <div className="mt-2 flex flex-wrap items-center gap-4 rounded-xl border border-border/40 bg-card/30 px-3 py-2">
          <span className="text-[11px] font-medium text-muted-foreground">Mostrar:</span>
          {(["rol", "margem", "volume", "skus"] as const).map((k) => (
            <label key={k} className="flex cursor-pointer items-center gap-1.5 text-xs">
              <Checkbox
                checked={pinned.includes(k)}
                onCheckedChange={() => toggle(k)}
                disabled={pinned.length === 1 && pinned.includes(k)}
              />
              {k === "rol" ? "ROL" : k === "margem" ? "Margem" : k === "volume" ? "Volume" : "SKUs ativos"}
            </label>
          ))}
        </div>
      )}
    </>
  );
}

function AlertsWidget({
  alerts,
  onClick,
  onCreateActivity,
}: {
  alerts: Alert[];
  onClick: (page: string) => void;
  onCreateActivity: (a: Alert) => void;
}) {
  return (
    <GlassCard
      className={cn(
        "border-l-4",
        alerts.length > 0 ? "border-l-warning" : "border-l-success",
      )}
    >
      <header className="mb-3 flex items-center gap-2">
        {alerts.length > 0 ? (
          <AlertTriangle className="h-4 w-4 text-warning" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-success" />
        )}
        <h3 className="text-sm font-medium">Atenção necessária</h3>
        {alerts.length > 0 && (
          <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning">
            {alerts.length} {alerts.length === 1 ? "alerta" : "alertas"}
          </span>
        )}
      </header>
      {alerts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Tudo certo — nenhum ponto de atenção no período atual.
        </p>
      ) : (
        <div className="space-y-2">
          {alerts.map((a) => (
            <AlertCard
              key={a.id}
              alert={a}
              onClick={() => onClick(a.page)}
              onCreateActivity={() => onCreateActivity(a)}
            />
          ))}
        </div>
      )}
      <Link
        to="/alertas"
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        Ver histórico completo
        <ArrowRight className="h-3 w-3" />
      </Link>
    </GlassCard>
  );
}

function ShortcutsWidget() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <ShortcutCard to="/bridge-pvm" icon={TrendingUp} title="Bridge PVM" desc="O que explica a variação de margem entre dois períodos?" />
      <ShortcutCard to="/abc" icon={Layers} title="Portfólio de SKUs" desc="Quais SKUs sustentam o portfólio e quais drenam margem?" />
      <ShortcutCard to="/budget" icon={Target} title="Budget" desc="Vou fechar o ano dentro do budget? Onde está o gap?" />
      <ShortcutCard to="/canais" icon={BarChart3} title="Canais" desc="Quais canais estão crescendo ou perdendo margem?" />
    </div>
  );
}
