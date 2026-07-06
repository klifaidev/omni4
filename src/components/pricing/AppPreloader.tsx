import { useEffect, useState } from "react";
import { Database, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { preloadSavedBases, type BasesPreloadProgress } from "@/lib/preloadBases";
import { cn } from "@/lib/utils";

type Unsubscribe = () => void;

interface StartupElectronApi {
  onUpdateStatus?: (callback: (status: string) => void) => Unsubscribe;
  onUpdateAvailable?: (callback: (version: string) => void) => Unsubscribe;
  onUpdateProgress?: (callback: (percent: number) => void) => Unsubscribe;
  onUpdateDownloaded?: (callback: (version: string) => void) => Unsubscribe;
  onUpdateNotAvailable?: (callback: (version: string) => void) => Unsubscribe;
  onUpdateError?: (callback: (message: string) => void) => Unsubscribe;
  checkForUpdates?: () => void;
  installUpdate?: () => void;
}

const INITIAL_PROGRESS: BasesPreloadProgress = {
  status: "idle",
  percent: 0,
  label: "Preparando entrada",
  loaded: [],
  failed: [],
};

function startupUpdateApi(): StartupElectronApi | null {
  const api = (window as unknown as { electronAPI?: StartupElectronApi }).electronAPI;
  return api?.checkForUpdates ? api : null;
}

function checkStartupUpdate(
  onProgress: (progress: BasesPreloadProgress) => void,
): Promise<"none" | "error" | "installing"> {
  const api = startupUpdateApi();
  if (!api) return Promise.resolve("none");

  onProgress({
    status: "loading",
    percent: 2,
    label: "Verificando atualizações",
    detail: "Antes de carregar as bases, vamos confirmar se existe uma versão nova.",
    loaded: [],
    failed: [],
  });

  return new Promise((resolve) => {
    let settled = false;
    let updateFound = false;
    let lastPercent = 2;
    const cleanups: Unsubscribe[] = [];

    const cleanup = () => {
      while (cleanups.length) cleanups.pop()?.();
    };

    const finish = (result: "none" | "error" | "installing") => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    cleanups.push(api.onUpdateStatus?.((status) => {
      onProgress({
        status: "loading",
        percent: Math.max(lastPercent, 5),
        label: "Verificando atualizações",
        detail: status,
        loaded: [],
        failed: [],
      });
    }) ?? (() => undefined));

    cleanups.push(api.onUpdateAvailable?.((version) => {
      updateFound = true;
      lastPercent = 10;
      onProgress({
        status: "loading",
        percent: lastPercent,
        label: `Atualização ${version} encontrada`,
        detail: "Baixando a nova versão antes de carregar as bases.",
        loaded: [],
        failed: [],
      });
    }) ?? (() => undefined));

    cleanups.push(api.onUpdateProgress?.((percent) => {
      updateFound = true;
      lastPercent = Math.max(10, Math.min(98, Math.round(percent)));
      onProgress({
        status: "loading",
        percent: lastPercent,
        label: "Baixando atualização",
        detail: `${lastPercent}% concluído. O app será reiniciado para aplicar a versão nova.`,
        loaded: [],
        failed: [],
      });
    }) ?? (() => undefined));

    cleanups.push(api.onUpdateDownloaded?.((version) => {
      updateFound = true;
      onProgress({
        status: "loading",
        percent: 100,
        label: `Atualização ${version} pronta`,
        detail: "Reiniciando para aplicar a atualização. Depois disso, as bases serão carregadas na nova versão.",
        loaded: [],
        failed: [],
      });
      window.setTimeout(() => {
        api.installUpdate?.();
        finish("installing");
      }, 650);
    }) ?? (() => undefined));

    cleanups.push(api.onUpdateNotAvailable?.(() => {
      onProgress({
        status: "done",
        percent: 100,
        label: "Aplicativo atualizado",
        detail: "Nenhuma atualização pendente. Iniciando carregamento das bases.",
        loaded: [],
        failed: [],
      });
      window.setTimeout(() => finish("none"), 250);
    }) ?? (() => undefined));

    cleanups.push(api.onUpdateError?.((message) => {
      onProgress({
        status: "error",
        percent: Math.max(lastPercent, 100),
        label: "Não foi possível verificar atualização",
        detail: message || "O app continuará abrindo com a versão atual.",
        loaded: [],
        failed: ["Atualização"],
      });
      window.setTimeout(() => finish("error"), 650);
    }) ?? (() => undefined));

    window.setTimeout(() => {
      if (settled || updateFound) return;
      onProgress({
        status: "error",
        percent: 100,
        label: "Verificação de atualização demorou demais",
        detail: "O app continuará abrindo com a versão atual.",
        loaded: [],
        failed: ["Atualização"],
      });
      window.setTimeout(() => finish("error"), 650);
    }, 25_000);

    api.checkForUpdates?.();
  });
}

export function AppPreloader({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState<BasesPreloadProgress>(INITIAL_PROGRESS);

  useEffect(() => {
    let alive = true;

    async function start() {
      const updateResult = await checkStartupUpdate((next) => {
        if (!alive) return;
        setProgress(next);
      });

      if (!alive || updateResult === "installing") return;

      await preloadSavedBases((next) => {
        if (!alive) return;
        setProgress(next);
      });

      if (!alive) return;
      setProgress((current) => ({ ...current, percent: 100 }));
      window.setTimeout(() => {
        if (alive) setReady(true);
      }, 250);
    }

    start();

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
