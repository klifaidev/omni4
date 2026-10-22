import { useEffect, useState } from "react";
import { Database, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { preloadSavedBases, type BasesPreloadProgress } from "@/lib/preloadBases";
import { preloadSlidesRoute } from "@/lib/preloadSlidesRoute";
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

type StartupUpdateResult = "none" | "error" | "installing";

/** Quanto a entrada espera pela resposta do servidor de atualização depois que
 *  as bases já carregaram. Medido nos logs do app: a resposta típica chega em
 *  0,3 s (p95 1,6 s); sem rede, levava até 25 s com a tela parada. */
const UPDATE_GRACE_MS = 1500;

interface StartupUpdateCheck {
  result: Promise<StartupUpdateResult>;
  /** Uma versão nova foi anunciada (vai baixar e reiniciar o app). */
  found: () => boolean;
  /** Desliga os ouvintes da entrada: a partir daqui, o aviso dentro do app
   *  (UpdateNotification) é quem cuida de uma atualização que chegar depois —
   *  sem reiniciar sozinho no meio do trabalho. */
  cancel: () => void;
}

/**
 * Verificação de atualização da entrada. `onProgress` recebe `true` em
 * `takesOver` quando o progresso é da atualização em si (encontrada, baixando,
 * pronta) e deve aparecer no lugar do carregamento das bases.
 */
function checkStartupUpdate(
  onProgress: (progress: BasesPreloadProgress, takesOver: boolean) => void,
): StartupUpdateCheck {
  const api = startupUpdateApi();
  if (!api) return { result: Promise.resolve("none"), found: () => false, cancel: () => undefined };

  onProgress({
    status: "loading",
    percent: 2,
    label: "Verificando atualizações",
    detail: "Confirmando se existe uma versão nova enquanto as bases carregam.",
    loaded: [],
    failed: [],
  }, false);

  let settled = false;
  let updateFound = false;
  let lastPercent = 2;
  const cleanups: Unsubscribe[] = [];
  let resolveResult: (result: StartupUpdateResult) => void = () => undefined;

  const cleanup = () => {
    while (cleanups.length) cleanups.pop()?.();
  };

  const finish = (result: StartupUpdateResult) => {
    if (settled) return;
    settled = true;
    cleanup();
    resolveResult(result);
  };

  const result = new Promise<StartupUpdateResult>((resolve) => {
    resolveResult = resolve;

    cleanups.push(api.onUpdateStatus?.((status) => {
      onProgress({
        status: "loading",
        percent: Math.max(lastPercent, 5),
        label: "Verificando atualizações",
        detail: status,
        loaded: [],
        failed: [],
      }, updateFound);
    }) ?? (() => undefined));

    cleanups.push(api.onUpdateAvailable?.((version) => {
      updateFound = true;
      lastPercent = 10;
      onProgress({
        status: "loading",
        percent: lastPercent,
        label: `Atualização ${version} encontrada`,
        detail: "Baixando a nova versão. O app será reiniciado para aplicá-la.",
        loaded: [],
        failed: [],
      }, true);
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
      }, true);
    }) ?? (() => undefined));

    cleanups.push(api.onUpdateDownloaded?.((version) => {
      updateFound = true;
      onProgress({
        status: "loading",
        percent: 100,
        label: `Atualização ${version} pronta`,
        detail: "Reiniciando para aplicar a atualização.",
        loaded: [],
        failed: [],
      }, true);
      window.setTimeout(() => {
        if (settled) return;
        api.installUpdate?.();
        finish("installing");
      }, 650);
    }) ?? (() => undefined));

    cleanups.push(api.onUpdateNotAvailable?.(() => {
      finish("none");
    }) ?? (() => undefined));

    cleanups.push(api.onUpdateError?.((message) => {
      if (updateFound) {
        onProgress({
          status: "error",
          percent: 100,
          label: "Não foi possível baixar a atualização",
          detail: message || "O app continuará abrindo com a versão atual.",
          loaded: [],
          failed: ["Atualização"],
        }, true);
      }
      finish("error");
    }) ?? (() => undefined));

    window.setTimeout(() => {
      if (settled || updateFound) return;
      finish("error");
    }, 25_000);

    api.checkForUpdates?.();
  });

  return {
    result,
    found: () => updateFound,
    cancel: () => finish("none"),
  };
}

function waitMs(ms: number): Promise<"pending"> {
  return new Promise((resolve) => window.setTimeout(() => resolve("pending"), ms));
}

export function AppPreloader({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState<BasesPreloadProgress>(INITIAL_PROGRESS);

  useEffect(() => {
    let alive = true;

    async function start() {
      // Atualização e bases em paralelo. Antes, as bases só começavam depois
      // da resposta do servidor de atualização (0,3 a 1,6 s normalmente; até
      // 25 s sem rede, segundo os logs do app). Uma versão nova encontrada
      // durante a entrada continua sendo baixada e aplicada antes de liberar
      // o app — só não segura mais o carregamento das bases.
      let updateTakesOver = false;
      let basesReported = false;
      const update = checkStartupUpdate((next, takesOver) => {
        if (!alive) return;
        if (takesOver) updateTakesOver = true;
        if (takesOver || !basesReported) setProgress(next);
      });

      void preloadSlidesRoute().catch(() => undefined);

      await preloadSavedBases((next) => {
        if (!alive) return;
        basesReported = true;
        if (!updateTakesOver) setProgress(next);
      });

      if (!alive) return;
      const outcome = update.found()
        ? await update.result
        : await Promise.race([update.result, waitMs(UPDATE_GRACE_MS)]);
      if (!alive || outcome === "installing") return;
      update.cancel();
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
