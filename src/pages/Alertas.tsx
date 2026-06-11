import { useMemo, useState } from "react";
import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAlertHistory, type AlertRecord } from "@/store/alertHistory";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BellOff,
  CheckCircle2,
  Target,
  Trash2,
  TrendingDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { usePageTitle } from "@/hooks/use-page-title";

type FilterTab = "all" | "active" | "resolved" | "dismissed";

const ICONS: Record<string, typeof AlertCircle> = {
  "trending-down": TrendingDown,
  "alert-triangle": AlertTriangle,
  "alert-circle": AlertCircle,
  target: Target,
};

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const SEVERITY_BADGE: Record<AlertRecord["severity"], string> = {
  high: "bg-destructive/15 text-destructive border border-destructive/30",
  medium: "bg-warning/15 text-warning border border-warning/30",
  low: "bg-muted text-muted-foreground border border-border/60",
};

const SEVERITY_LABEL: Record<AlertRecord["severity"], string> = {
  high: "Alta",
  medium: "Média",
  low: "Baixa",
};

export default function Alertas() {
  usePageTitle("Central de alertas");
  const records = useAlertHistory((s) => s.records);
  const resolveAlert = useAlertHistory((s) => s.resolveAlert);
  const dismissAlert = useAlertHistory((s) => s.dismissAlert);
  const clearAll = useAlertHistory((s) => s.clearAll);
  const navigate = useNavigate();
  const [tab, setTab] = useState<FilterTab>("active");

  const counts = useMemo(() => {
    const c = { all: records.length, active: 0, resolved: 0, dismissed: 0 };
    for (const r of records) {
      if (r.status === "active") c.active++;
      else if (r.status === "resolved") c.resolved++;
      else c.dismissed++;
    }
    return c;
  }, [records]);

  const filtered = useMemo(() => {
    const list = tab === "all" ? records : records.filter((r) => r.status === tab);
    return [...list].sort((a, b) => b.detectedAt - a.detectedAt);
  }, [records, tab]);

  return (
    <>
      <Topbar title="Central de alertas" subtitle="Histórico persistido de alertas detectados no portfólio" />
      <div className="space-y-6 px-8 py-6">
        <GlassCard>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <ToggleGroup
              type="single"
              value={tab}
              onValueChange={(v) => v && setTab(v as FilterTab)}
              variant="outline"
              size="sm"
            >
              <ToggleGroupItem value="all">Todos ({counts.all})</ToggleGroupItem>
              <ToggleGroupItem value="active">Ativos ({counts.active})</ToggleGroupItem>
              <ToggleGroupItem value="resolved">Resolvidos ({counts.resolved})</ToggleGroupItem>
              <ToggleGroupItem value="dismissed">Ignorados ({counts.dismissed})</ToggleGroupItem>
            </ToggleGroup>
            {records.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-muted-foreground hover:text-destructive"
                onClick={() => {
                  clearAll();
                  toast.success("Histórico de alertas limpo.");
                }}
              >
                <Trash2 className="h-4 w-4" />
                Limpar tudo
              </Button>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 text-success/60" />
              <span>
                {records.length === 0
                  ? "Nenhum alerta registrado ainda. Os alertas serão capturados automaticamente conforme você navegar pelas análises."
                  : "Nenhum alerta nesta categoria."}
              </span>
            </div>
          ) : (
            <ul className="space-y-2">
              {filtered.map((r) => {
                const Icon = ICONS[r.icon] ?? AlertCircle;
                const resolved = r.status === "resolved";
                const dismissed = r.status === "dismissed";
                const inactive = resolved || dismissed;
                return (
                  <li
                    key={r.id}
                    className={cn(
                      "flex flex-wrap items-start gap-3 rounded-xl border border-border/40 bg-card/40 p-3 transition-colors",
                      inactive && "opacity-70",
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                        SEVERITY_BADGE[r.severity],
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="secondary"
                          className={cn("px-1.5 text-[10px] font-bold", SEVERITY_BADGE[r.severity])}
                        >
                          {SEVERITY_LABEL[r.severity]}
                        </Badge>
                        {resolved && (
                          <Badge variant="secondary" className="bg-success/15 text-success border border-success/30 px-1.5 text-[10px]">
                            Resolvido
                          </Badge>
                        )}
                        {dismissed && (
                          <Badge variant="secondary" className="px-1.5 text-[10px]">
                            Ignorado
                          </Badge>
                        )}
                      </div>
                      <div
                        className={cn(
                          "mt-1 text-sm",
                          inactive && "line-through decoration-muted-foreground/40",
                        )}
                      >
                        {r.message}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span>Detectado: {fmtDate(r.detectedAt)}</span>
                        {r.resolvedAt && (
                          <span>
                            {resolved ? "Resolvido em" : "Ignorado em"}: {fmtDate(r.resolvedAt)}
                          </span>
                        )}
                        {r.dataSnapshot && <span>· {r.dataSnapshot}</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1.5 px-2 text-xs"
                        onClick={() => navigate(r.page)}
                      >
                        Ver
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                      {r.status === "active" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1.5 px-2 text-xs"
                            onClick={() => {
                              resolveAlert(r.id);
                              toast.success("Alerta marcado como resolvido.");
                            }}
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Resolver
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
                            onClick={() => {
                              dismissAlert(r.id);
                              toast.success("Alerta ignorado.");
                            }}
                          >
                            <BellOff className="h-3 w-3" />
                            Ignorar
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </GlassCard>
      </div>
    </>
  );
}
