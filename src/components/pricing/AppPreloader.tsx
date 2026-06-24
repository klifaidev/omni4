import { useEffect, useState } from "react";
import { Database, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { preloadSavedBases, type BasesPreloadProgress } from "@/lib/preloadBases";
import { cn } from "@/lib/utils";

const INITIAL_PROGRESS: BasesPreloadProgress = {
  status: "idle",
  percent: 0,
  label: "Preparando entrada",
  loaded: [],
  failed: [],
};

export function AppPreloader({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState<BasesPreloadProgress>(INITIAL_PROGRESS);

  useEffect(() => {
    let alive = true;

    preloadSavedBases((next) => {
      if (!alive) return;
      setProgress(next);
    }).finally(() => {
      if (!alive) return;
      setProgress((current) => ({ ...current, percent: 100 }));
      window.setTimeout(() => {
        if (alive) setReady(true);
      }, 250);
    });

    return () => {
      alive = false;
    };
  }, []);

  if (ready) return <>{children}</>;

  const failed = progress.failed.length > 0;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-[460px] rounded-lg border border-border/60 bg-card/80 p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
            {progress.percent >= 100 ? (
              <Database className={cn("h-5 w-5", failed ? "text-warning" : "text-primary")} />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-semibold">OMNI4 Pricing Analytics</h1>
            <p className="truncate text-sm text-muted-foreground">{progress.label}</p>
          </div>
          <span className="ml-auto text-sm font-semibold tabular-nums">{progress.percent}%</span>
        </div>

        <Progress value={progress.percent} className="mt-5 h-2" />

        <div className="mt-3 min-h-5 text-xs text-muted-foreground">
          {progress.detail ?? "Carregando bases locais disponiveis antes de liberar o app."}
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
  );
}
