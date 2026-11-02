import { useEffect, useRef, useState, type DragEvent } from "react";
import { AlertTriangle, FileUp, Loader2, ShieldCheck } from "lucide-react";
import { GlassCard } from "@/components/pricing/GlassCard";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { updateErrorMessage, type UpdatePrepareResult } from "@/lib/updateFile";

type Stage =
  | { name: "idle"; error?: string }
  | { name: "checking"; percent: number }
  | { name: "ready"; version: string; currentVersion: string }
  | { name: "installing"; version: string };

export function UpdateCard() {
  const api = window.electronAPI?.updates;
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>({ name: "idle" });
  const [dragging, setDragging] = useState(false);
  const zoneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!api) return;
    void api.info().then((info) => setCurrentVersion(info.version));
    return api.onProgress((percent) => {
      setStage((current) => (current.name === "checking" ? { ...current, percent } : current));
    });
  }, [api]);

  const prepare = async (run: () => Promise<UpdatePrepareResult>) => {
    setStage({ name: "checking", percent: 0 });
    let result: UpdatePrepareResult;
    try {
      result = await run();
    } catch {
      result = { ok: false, erro: "nao_lido" };
    }
    if (result.ok === true) {
      setStage({ name: "ready", version: result.version, currentVersion: result.currentVersion });
    } else if (result.erro === "cancelado") {
      setStage({ name: "idle" });
    } else {
      setStage({ name: "idle", error: updateErrorMessage(result.erro, result.version, result.currentVersion) });
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (!api || !file || stage.name === "checking" || stage.name === "installing") return;
    void prepare(() => api.prepare(file));
  };

  const install = async (version: string) => {
    if (!api) return;
    setStage({ name: "installing", version });
    const result = await api.install();
    // Com sucesso o app fecha sozinho; esta tela só continua viva se algo falhou.
    if (!result.ok) {
      setStage({ name: "idle", error: updateErrorMessage(result.erro ?? "nao_preparado") });
    }
  };

  const cancel = () => {
    void api?.discard();
    setStage({ name: "idle" });
  };

  return (
    <GlassCard>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Atualização</h2>
        {currentVersion && (
          <span className="text-xs text-muted-foreground">
            Versão instalada: <span className="font-medium tabular-nums text-foreground">{currentVersion}</span>
          </span>
        )}
      </div>

      {!api && (
        <p className="mt-3 text-sm text-muted-foreground">A atualização por arquivo funciona no app instalado.</p>
      )}

      {api && stage.name === "ready" && (
        <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-sm font-medium">
                Atualizar de <span className="tabular-nums">{stage.currentVersion}</span> para{" "}
                <span className="tabular-nums">{stage.version}</span>?
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Arquivo conferido. O app fecha, instala a nova versão e reabre sozinho. Suas bases, slides e atividades
                continuam como estão.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void install(stage.version)}>Atualizar e reiniciar</Button>
            <Button size="sm" variant="ghost" onClick={cancel}>Cancelar</Button>
          </div>
        </div>
      )}

      {api && stage.name === "installing" && (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-border/60 p-4 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Instalando a versão {stage.version}. O app vai reabrir sozinho.
        </div>
      )}

      {api && stage.name === "checking" && (
        <div className="mt-4 rounded-lg border border-border/60 p-4">
          <div className="flex items-center gap-3 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Conferindo o arquivo
            <span className="ml-auto font-medium tabular-nums">{stage.percent}%</span>
          </div>
          <Progress value={stage.percent} className="mt-3 h-1.5" />
        </div>
      )}

      {api && stage.name === "idle" && (
        <>
          <div
            ref={zoneRef}
            data-testid="update-drop-zone"
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
              setDragging(true);
            }}
            onDragLeave={(event) => {
              if (!zoneRef.current?.contains(event.relatedTarget as Node | null)) setDragging(false);
            }}
            onDrop={onDrop}
            className={cn(
              "mt-4 flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-8 text-center transition-colors",
              dragging ? "border-primary bg-primary/10" : "border-border/70",
            )}
          >
            <FileUp className={cn("h-6 w-6", dragging ? "text-primary" : "text-muted-foreground")} />
            <div>
              <p className="text-sm font-medium">Arraste aqui o arquivo de atualização</p>
              <p className="mt-1 text-xs text-muted-foreground">
                É o arquivo que termina em .omni4update. O app só instala arquivos assinados pelo OMNI4.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => void prepare(() => api.choose())}>
              Escolher arquivo
            </Button>
          </div>
          {stage.error && (
            <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {stage.error}
            </p>
          )}
        </>
      )}
    </GlassCard>
  );
}
