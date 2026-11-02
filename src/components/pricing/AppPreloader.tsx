import { useEffect, useState } from "react";
import { Database, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { preloadSavedBases, type BasesPreloadProgress } from "@/lib/preloadBases";
import { preloadSlidesRoute } from "@/lib/preloadSlidesRoute";
import { cn } from "@/lib/utils";
import { useKeptPages } from "@/store/keptPages";

const INITIAL_PROGRESS: BasesPreloadProgress = {
  status: "idle",
  percent: 0,
  label: "Preparando entrada",
  loaded: [],
  failed: [],
};

/** Teto de espera pelas abas: passou disso, a entrada libera e o resto continua por trás. */
const PAGE_WARMUP_CAP_MS = 30_000;

export function AppPreloader({ children }: { children: React.ReactNode }) {
  // basesReady: o app monta por baixo da tela de entrada e prepara as abas.
  const [basesReady, setBasesReady] = useState(false);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState<BasesPreloadProgress>(INITIAL_PROGRESS);
  const warmup = useKeptPages((s) => s.warmup);

  useEffect(() => {
    let alive = true;

    async function start() {
      void preloadSlidesRoute().catch(() => undefined);

      await preloadSavedBases((next) => {
        if (alive) setProgress(next);
      });

      if (!alive) return;
      setProgress((current) => ({ ...current, percent: 100 }));
      window.setTimeout(() => {
        if (alive) setBasesReady(true);
      }, 250);
    }

    start();

    return () => {
      alive = false;
    };
  }, []);

  // Sem nada preparando abas (os filhos montam antes deste efeito rodar), ou com
  // tudo pronto, libera. O teto garante que a entrada nunca fica presa.
  useEffect(() => {
    if (!basesReady) return;
    if (useKeptPages.getState().warmup.status !== "running") {
      setReady(true);
      return;
    }
    const cap = window.setTimeout(() => setReady(true), PAGE_WARMUP_CAP_MS);
    return () => window.clearTimeout(cap);
  }, [basesReady]);

  useEffect(() => {
    if (basesReady && warmup.status === "done") setReady(true);
  }, [basesReady, warmup.status]);

  // Mesma forma do retorno de baixo: o app já montado não pode remontar ao liberar.
  if (ready) return <>{children}{null}</>;

  const failed = progress.failed.length > 0;
  const preparingPages = basesReady && warmup.status === "running";
  const percent = preparingPages ? Math.round((warmup.done / Math.max(1, warmup.total)) * 100) : progress.percent;
  const label = preparingPages ? "Deixando as abas prontas" : progress.label;
  const detail = preparingPages ? warmup.label : progress.detail;

  return (
    <>
    {basesReady && children}
    <div className="fixed inset-0 z-[100] flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-[460px] rounded-lg border border-border/60 bg-card/80 p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
            {percent >= 100 ? (
              <Database className={cn("h-5 w-5", failed ? "text-warning" : "text-primary")} />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-semibold">OMNI4 Pricing Analytics</h1>
            <p className="truncate text-sm text-muted-foreground">{label}</p>
          </div>
          <span className="ml-auto text-sm font-semibold tabular-nums">{percent}%</span>
        </div>

        <Progress value={percent} className="mt-5 h-2" />

        <div className="mt-3 min-h-5 text-xs text-muted-foreground">
          {detail ?? "Carregando bases locais disponiveis antes de liberar o app."}
        </div>

        {(progress.loaded.length > 0 || progress.failed.length > 0) && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {progress.loaded.map((name) => (
              <span key={name} className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-500">
                {name}
              </span>
            ))}
            {progress.failed.map((name) => (
              <span key={name} className="rounded-full border border-warning/40 bg-warning/10 px-2 py-1 text-[10px] font-medium text-warning">
                {name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
    </>
  );
}
