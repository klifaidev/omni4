import { useEffect, useState } from "react";

export function UpdateNotification() {
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!(window as any).electronAPI) return;

    const api = (window as any).electronAPI;

    api.onUpdateAvailable((version: string) => {
      setUpdateVersion(version);
    });

    api.onUpdateProgress((percent: number) => {
      setDownloading(true);
      setProgress(percent);
    });

    api.onUpdateDownloaded((_version: string) => {
      setDownloading(false);
      setReady(true);
    });
  }, []);

  if (!updateVersion) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-xl border border-border/40
                    bg-card/95 backdrop-blur-xl shadow-2xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center
                        flex-shrink-0 mt-0.5">
          <span className="text-primary text-sm">↑</span>
        </div>
        <div>
          <p className="text-sm font-medium">
            {ready ? "Pronto para atualizar" : `Nova versão ${updateVersion} disponível`}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {ready
              ? "Reinicie o app para aplicar a atualização."
              : downloading
              ? `Baixando... ${progress}%`
              : "Uma nova versão está disponível."}
          </p>
        </div>
      </div>

      {downloading && (
        <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {ready && (
        <button
          onClick={() => (window as any).electronAPI.installUpdate()}
          className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm
                     font-medium hover:bg-primary/90 transition-colors"
        >
          Reiniciar e atualizar
        </button>
      )}
    </div>
  );
}
