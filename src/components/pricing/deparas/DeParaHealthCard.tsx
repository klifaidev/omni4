// De/Paras na aba Bases: a saúde de cada mapeamento num relance (quanto do
// ROL já está classificado e quantos valores faltam), com atalho para
// resolver. Substitui o cartão de download e o alerta grande de pendências.
import { useState } from "react";
import { AlertTriangle, ArrowRight, Check, GitBranch, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/pricing/GlassCard";
import { cn } from "@/lib/utils";
import { formatPct } from "@/lib/format";
import { countComercialOverrides } from "@/lib/deparaComercial";
import { DEPARA_MAPS, DEPARA_MAP_BY_ID, coverageLabel } from "@/lib/deparaHealth";
import { listDeParaEntries } from "@/lib/depara";
import { useDeParaCenter } from "@/store/deparaCenter";
import { useInovacaoDepara } from "@/store/inovacaoDepara";
import { useDeParaHealth } from "./deparaActions";

export function DeParaHealthCard() {
  const health = useDeParaHealth();
  const openCenter = useDeParaCenter((s) => s.openCenter);
  const version = useDeParaCenter((s) => s.version);
  const inovacaoFile = useInovacaoDepara((s) => s.file);
  void version;
  const corrections = listDeParaEntries().filter((e) => e.source === "app").length + countComercialOverrides();

  return (
    <GlassCard>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">De/Paras</h3>
            <p className="mt-0.5 max-w-xl text-[11px] text-muted-foreground">
              Como as bases viram categorias, canais, UFs e regionais nas análises. Corrigir aqui vale na hora para o app inteiro.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => openCenter(health.pending.length ? "hierarquia" : "pendencias")}>
            <GitBranch className="h-3.5 w-3.5" /> Abrir central
          </Button>
          {health.pending.length > 0 && (
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => openCenter("pendencias")}>
              Resolver {health.pending.length} pendência{health.pending.length === 1 ? "" : "s"} <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </header>

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {DEPARA_MAPS.map((m) => {
          const h = health.maps[m.id];
          const pending = h.pending.length;
          const isInovacao = m.id === "inovacao";
          return (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => openCenter(m.id)}
                className="group w-full rounded-xl border border-border/40 bg-secondary/20 p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/[0.04]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold">{m.title}</span>
                  {!isInovacao && (pending > 0
                    ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-warning"><AlertTriangle className="h-3 w-3" /> {pending}</span>
                    : <Check className="h-3.5 w-3.5 text-emerald-500" />)}
                </div>
                {isInovacao ? (
                  <div className="mt-2 text-[11px] text-muted-foreground">Fonte: {inovacaoFile?.name ?? "padrão do app"}</div>
                ) : h.coverage === null ? (
                  <div className="mt-2 text-[11px] text-muted-foreground">Carregue o Real para medir</div>
                ) : (
                  <>
                    <div className="mt-2 flex items-baseline gap-1.5">
                      <span className="text-lg font-semibold tabular-nums tracking-tight">{coverageLabel(h.coverage)}</span>
                      <span className="text-[10px] text-muted-foreground">do ROL mapeado</span>
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-border/60">
                      <div className={cn("h-full rounded-full", h.coverage < 1 ? "bg-warning" : "bg-emerald-500")} style={{ width: `${Math.max(2, h.coverage * 100)}%` }} />
                    </div>
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {corrections > 0 && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          {corrections} correç{corrections === 1 ? "ão feita" : "ões feitas"} no app · aparecem como “no app” na central e podem ser desfeitas.
        </p>
      )}
    </GlassCard>
  );
}

/** Aviso compacto no topo da aba Bases quando há valores sem De/Para. */
export function DeParaPendingBanner() {
  const health = useDeParaHealth();
  const openCenter = useDeParaCenter((s) => s.openCenter);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || health.pending.length === 0) return null;
  const worst = health.pending.find((p) => !p.onlyBudget);
  const maps = new Set(health.pending.map((p) => p.map));

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-2.5">
      <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
      <div className="min-w-0 flex-1 text-xs">
        <span className="font-semibold text-warning">
          {health.pending.length} valor{health.pending.length === 1 ? "" : "es"} sem De/Para
        </span>{" "}
        <span className="text-muted-foreground">
          em {[...maps].map((m) => DEPARA_MAP_BY_ID[m].title).join(", ")}
          {worst ? ` · o que mais pesa é ${formatPct(worst.share, 2)} do ROL` : ""}.
        </span>
      </div>
      <Button size="sm" className="h-7 gap-1 px-2.5 text-xs" onClick={() => openCenter("pendencias")}>
        Resolver <ArrowRight className="h-3 w-3" />
      </Button>
      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" aria-label="Dispensar aviso" onClick={() => setDismissed(true)}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
