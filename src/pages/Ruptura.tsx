import { useEffect, useRef } from "react";
import { FileSpreadsheet, Loader2, PackageX, RefreshCw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RupturaFilterBar } from "@/components/ruptura/RupturaFilterBar";
import { RupturaKpis, RupturaQualityStrip, periodLabel } from "@/components/ruptura/RupturaKpis";
import { RupturaUfMap } from "@/components/ruptura/RupturaUfMap";
import { RupturaEvolution } from "@/components/ruptura/RupturaEvolution";
import { CategoryRanking, ChannelRanking, HierarchyRanking, SkuRanking } from "@/components/ruptura/RupturaRankings";
import { RupturaPending } from "@/components/ruptura/RupturaPending";
import { useRupturaView } from "@/components/ruptura/useRupturaView";
import { usePageTitle } from "@/hooks/use-page-title";
import { formatNum } from "@/lib/format";
import type { RupturaModel } from "@/lib/ruptura/types";
import { useRuptura } from "@/store/ruptura";

const ACCEPT = ".xlsx,.xls,.xlsm,.csv";

function useFilePicker(onFile: (file: File) => void) {
  const ref = useRef<HTMLInputElement>(null);
  const input = (
    <input
      ref={ref}
      type="file"
      accept={ACCEPT}
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (file) onFile(file);
      }}
    />
  );
  return { input, open: () => ref.current?.click() };
}

export default function Ruptura() {
  usePageTitle("Inteligência de Ruptura");
  const model = useRuptura((s) => s.model);
  const status = useRuptura((s) => s.status);
  const error = useRuptura((s) => s.error);
  const loadSaved = useRuptura((s) => s.loadSaved);
  const importFile = useRuptura((s) => s.importFile);
  const removeBase = useRuptura((s) => s.removeBase);

  useEffect(() => { void loadSaved(); }, [loadSaved]);

  useEffect(() => {
    if (error && model) toast.error(error);
  }, [error, model]);

  const picker = useFilePicker((file) => { void importFile(file); });
  const busy = status === "loading" || status === "checking";

  return (
    <>
      <Topbar
        title="Inteligência de Ruptura"
        subtitle={model ? `Pesquisas de PDV · ${model.fileName}` : "Pesquisas de ausência de produto nos pontos de venda"}
        showPeriodStrip={false}
        actions={model ? (
          <div className="flex items-center gap-1.5">
            {picker.input}
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={picker.open} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Trocar base
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              aria-label="Remover a base de ruptura"
              disabled={busy}
              onClick={() =>
                toast.warning("Remover a base de ruptura?", {
                  description: "O arquivo salvo neste computador será apagado.",
                  action: { label: "Remover", onClick: () => { void removeBase(); } },
                })
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : undefined}
      />
      <div className="space-y-5 px-4 py-6 md:px-8">
        {model ? <Dashboard model={model} /> : <EmptyRuptura onPick={picker.open} input={picker.input} />}
      </div>
    </>
  );
}

function EmptyRuptura({ onPick, input }: { onPick: () => void; input: React.ReactNode }) {
  const status = useRuptura((s) => s.status);
  const progress = useRuptura((s) => s.progress);
  const error = useRuptura((s) => s.error);
  const importFile = useRuptura((s) => s.importFile);
  const busy = status === "loading" || status === "checking";

  return (
    <GlassCard
      className="mx-auto flex max-w-2xl flex-col items-center gap-5 py-12 text-center"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file && !busy) void importFile(file);
      }}
    >
      {input}
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <PackageX className="h-6 w-6" />}
      </div>
      {busy ? (
        <div className="w-full max-w-sm space-y-2">
          <h2 className="text-base font-medium">{progress?.label ?? "Preparando"}…</h2>
          <Progress value={progress?.fraction === null || progress?.fraction === undefined ? undefined : progress.fraction * 100} className="h-1.5" />
          <p className="text-xs text-muted-foreground">Bases com centenas de milhares de linhas levam até um minuto. A tela continua livre.</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <h2 className="text-base font-medium">Carregue a base de pesquisas de ruptura</h2>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              Planilha com uma linha por pesquisa × SKU: Produto (SKU), Rede, Bandeira, PDV, Estado, Data e “Produto em Ruptura”
              (Sim/Não). A aba “Base de Dados” é usada quando existir.
            </p>
          </div>
          <Button onClick={onPick} className="gap-2">
            <Upload className="h-4 w-4" /> Escolher arquivo
          </Button>
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <FileSpreadsheet className="h-3.5 w-3.5" /> .xlsx, .xls ou .csv · ou arraste o arquivo para cá
          </p>
          {error && <p role="alert" className="max-w-md rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
        </>
      )}
    </GlassCard>
  );
}

function Dashboard({ model }: { model: RupturaModel }) {
  const view = useRupturaView(model);
  const status = useRuptura((s) => s.status);
  const progress = useRuptura((s) => s.progress);

  return (
    <>
      {status === "loading" && progress && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {progress.label}…
        </div>
      )}
      <RupturaFilterBar model={model} />
      <div className="space-y-2">
        <p className="text-[11px] text-muted-foreground">
          Recorte: <span className="font-medium text-foreground">{periodLabel(model, view.period)}</span> ·{" "}
          <span className="tabular-nums">{formatNum(view.totals.evaluations)}</span> avaliações
        </p>
        <RupturaKpis view={view} />
        <RupturaQualityStrip model={model} />
      </div>
      {view.totals.evaluations === 0 ? (
        <GlassCard className="py-10 text-center text-sm text-muted-foreground">Nenhuma avaliação para os filtros escolhidos.</GlassCard>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-5">
            <div className="xl:col-span-2"><RupturaUfMap view={view} /></div>
            <div className="xl:col-span-3"><RupturaEvolution view={view} /></div>
          </div>
          <div className="grid items-start gap-4 2xl:grid-cols-2">
            <CategoryRanking view={view} />
            <ChannelRanking view={view} />
          </div>
          <HierarchyRanking view={view} />
          <SkuRanking view={view} />
        </>
      )}
      <RupturaPending />
    </>
  );
}
