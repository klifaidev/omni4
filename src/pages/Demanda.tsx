import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Upload as UploadIcon,
  FileSpreadsheet,
  X,
  Settings2,
  Download,
  ChevronDown,
  ChevronUp,
  Zap,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  TrendingUp,
  HardDrive,
} from "lucide-react";
import { toast } from "sonner";
import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DemandaGrid } from "@/components/demanda/DemandaGrid";
import { DemandaSkuDrawer } from "@/components/demanda/DemandaSkuDrawer";
import { parseDemandaXlsx } from "@/lib/parseDemanda";
import { exportDemandaXlsx } from "@/lib/exportDemanda";
import { useDemanda } from "@/store/demanda";
import { usePricing } from "@/store/pricing";
import { usePageTitle } from "@/hooks/use-page-title";
import { useBasesLocais } from "@/hooks/use-bases-locais";
import type { MetodoSugestao } from "@/lib/demanda";
import { cn } from "@/lib/utils";

const METODO_LABELS: Record<MetodoSugestao, string> = {
  sazonalidade: "Sazonalidade",
  tendencia: "Tendência",
  anterior: "Anterior",
};

// ─── Upload Screen ─────────────────────────────────────────────────────────────
function DemandaUploadWithRef({ onFile }: { onFile: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);

  const handle = useCallback(
    async (file: File) => {
      setBusy(true);
      await onFile(file);
      setBusy(false);
    },
    [onFile],
  );

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div
        className="w-full max-w-[480px] rounded-3xl bg-card/60 p-8 shadow-2xl backdrop-blur-xl"
      >
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/8">
            <TrendingUp className="h-8 w-8 text-primary/60" />
          </div>
          <div>
            <h2 className="text-2xl font-light tracking-tight text-foreground">
              Revisão de Demanda
            </h2>
            <p className="mx-auto mt-1.5 max-w-[320px] text-center text-sm text-muted-foreground">
              Carregue a planilha mensal de forecast para preencher e exportar.
            </p>
          </div>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files[0];
            if (f) handle(f);
          }}
          className={cn(
            "rounded-2xl border-2 border-dashed border-primary/20 p-12 text-center transition-all duration-200",
            "hover:border-primary/60 hover:bg-primary/5",
            drag && "scale-[1.02] border-primary bg-primary/5 shadow-[0_0_30px_hsl(var(--primary)/0.15)]",
          )}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50">
              {busy ? (
                <FileSpreadsheet className="h-6 w-6 animate-pulse text-primary" />
              ) : (
                <UploadIcon className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <p className="text-sm font-medium text-foreground">
              {busy ? "Processando…" : "Arraste o arquivo aqui"}
            </p>
          </div>
        </div>

        {/* Button + hint */}
        <div className="mt-4 flex flex-col items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handle(e.target.files[0])}
          />
          <Button
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            Selecionar arquivo
          </Button>
          <p className="text-xs text-muted-foreground">
            Apenas arquivos .xlsx · Aba{" "}
            <span className="font-medium text-foreground/70">'Base Geral Com Fórmula'</span>{" "}
            obrigatória
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function Demanda() {
  usePageTitle("Demanda");

  const deck = useDemanda((s) => s.deck);
  const edits = useDemanda((s) => s.edits);
  const config = useDemanda((s) => s.config);
  const canalAtivo = useDemanda((s) => s.canalAtivo);
  const skuDrawerOpen = useDemanda((s) => s.skuDrawerOpen);
  const sessionRestored = useDemanda((s) => s.sessionRestored);

  const loadDeck = useDemanda((s) => s.loadDeck);
  const clearDeck = useDemanda((s) => s.clearDeck);
  const setEdit = useDemanda((s) => s.setEdit);
  const setEditsForSku = useDemanda((s) => s.setEditsForSku);
  const clearSkuEdits = useDemanda((s) => s.clearSkuEdits);
  const applyMetodo = useDemanda((s) => s.applyMetodo);
  const applyMetodoCanalTodo = useDemanda((s) => s.applyMetodoCanalTodo);
  const setCanalAtivo = useDemanda((s) => s.setCanalAtivo);
  const setSkuDrawerOpen = useDemanda((s) => s.setSkuDrawerOpen);
  const setConfig = useDemanda((s) => s.setConfig);
  const dismissSessionRestored = useDemanda((s) => s.dismissSessionRestored);

  const pricingRows = usePricing((s) => s.rows);
  const metric = usePricing((s) => s.metric);

  const [configOpen, setConfigOpen] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [exportWarnings, setExportWarnings] = useState<{ message: string }[]>([]);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [gridVisible, setGridVisible] = useState(true);
  const originalFileRef = useRef<File | null>(null);

  const basesLocais = useBasesLocais();
  const autoLoadedRef = useRef(false);
  const [savedDemandaBanner, setSavedDemandaBanner] = useState<{ nomeArquivo: string; data: string } | null>(null);

  // Canal fade animation on canal change
  useEffect(() => {
    setGridVisible(false);
    const t = setTimeout(() => setGridVisible(true), 80);
    return () => clearTimeout(t);
  }, [canalAtivo]);

  // Canal list
  const canais = useMemo(
    () => (deck ? Array.from(new Set(deck.rows.map((r) => r.sku.regional))).sort() : []),
    [deck],
  );

  const canalCounts = useMemo(() => {
    if (!deck) return {} as Record<string, number>;
    const out: Record<string, number> = {};
    for (const r of deck.rows) out[r.sku.regional] = (out[r.sku.regional] ?? 0) + 1;
    return out;
  }, [deck]);

  const canalProgress = useMemo(() => {
    if (!deck) return {} as Record<string, number>;
    const out: Record<string, number> = {};
    for (const canal of canais) {
      const total = canalCounts[canal] ?? 0;
      const edited = Object.keys(edits[canal] ?? {}).length;
      out[canal] = total > 0 ? Math.round((edited / total) * 100) : 0;
    }
    return out;
  }, [deck, canais, canalCounts, edits]);

  // Which canals are fully reviewed
  const canalAllReviewed = useMemo(() => {
    if (!deck) return {} as Record<string, boolean>;
    const out: Record<string, boolean> = {};
    for (const canal of canais) {
      const cRows = deck.rows.filter((r) => r.sku.regional === canal);
      out[canal] =
        cRows.length > 0 &&
        cRows.every((r) => Object.keys(edits[canal]?.[r.sku.cod] ?? {}).length > 0);
    }
    return out;
  }, [deck, canais, edits]);

  // Pending review count for active canal
  const pendingReviewCount = useMemo(() => {
    if (!deck || !canalAtivo) return 0;
    return deck.rows
      .filter((r) => r.sku.regional === canalAtivo)
      .filter((r) => Object.keys(edits[canalAtivo]?.[r.sku.cod] ?? {}).length === 0).length;
  }, [deck, canalAtivo, edits]);

  // Summary stats
  const summary = useMemo(() => {
    if (!deck || !canalAtivo) return null;
    const canalRows = deck.rows.filter((r) => r.sku.regional === canalAtivo);
    const mesAtual = deck.meses.mesAtualIdx;
    const futureIdxs = Array.from({ length: 12 }, (_, i) => i).filter((i) => i > mesAtual);

    let totalPlanejado = 0;
    let totalAnterior = 0;
    let semRevisao = 0;

    for (const row of canalRows) {
      const hasEdit = Object.keys(edits[canalAtivo]?.[row.sku.cod] ?? {}).length > 0;
      if (!hasEdit) semRevisao++;
      for (const i of futureIdxs) {
        totalPlanejado +=
          edits[canalAtivo]?.[row.sku.cod]?.[i] ?? row.indicadores[8]?.valores[i] ?? 0;
        totalAnterior += row.indicadores[4]?.valores[i] ?? 0;
      }
    }

    const varPct = totalAnterior > 0 ? (totalPlanejado / totalAnterior - 1) * 100 : null;
    return { totalPlanejado, varPct, semRevisao, total: canalRows.length, futureIdxs };
  }, [deck, canalAtivo, edits]);

  // SKUs above average canal growth
  const skusAcimaMedio = useMemo(() => {
    if (!deck || !canalAtivo || !summary) return null;
    const canalRows = deck.rows.filter((r) => r.sku.regional === canalAtivo);
    const growthRates = canalRows.map((row) => {
      const cVol = summary.futureIdxs.reduce(
        (s, i) => s + (edits[canalAtivo]?.[row.sku.cod]?.[i] ?? row.indicadores[8]?.valores[i] ?? 0),
        0,
      );
      const pVol = summary.futureIdxs.reduce(
        (s, i) => s + (row.indicadores[4]?.valores[i] ?? 0),
        0,
      );
      return pVol > 0 ? cVol / pVol - 1 : 0;
    });
    if (growthRates.length === 0) return null;
    const avg = growthRates.reduce((a, b) => a + b, 0) / growthRates.length;
    return { above: growthRates.filter((g) => g > avg).length, total: canalRows.length };
  }, [deck, canalAtivo, edits, summary]);

  // Mix margem delta (conditional on pricing data)
  const mixDelta = useMemo(() => {
    if (!deck || !canalAtivo || pricingRows.length === 0 || !summary) return null;
    const canalRows = deck.rows.filter((r) => r.sku.regional === canalAtivo);
    let currentVol = 0, currentMargemW = 0, priorVol = 0, priorMargemW = 0;
    let hasPricing = false;

    for (const row of canalRows) {
      const codStr = String(row.sku.cod);
      const sp = pricingRows.filter((r) => r.sku === codStr || Number(r.sku) === row.sku.cod);
      if (!sp.length) continue;
      const rol = sp.reduce((a, r) => a + r.rol, 0);
      if (rol === 0) continue;
      const m = sp.reduce((a, r) => a + (metric === "cm" ? r.contribMarginal : r.margemBruta), 0) / rol;
      hasPricing = true;
      const cVol = summary.futureIdxs.reduce(
        (s, i) => s + (edits[canalAtivo]?.[row.sku.cod]?.[i] ?? row.indicadores[8]?.valores[i] ?? 0),
        0,
      );
      const pVol = summary.futureIdxs.reduce(
        (s, i) => s + (row.indicadores[4]?.valores[i] ?? 0),
        0,
      );
      currentVol += cVol; currentMargemW += m * cVol;
      priorVol += pVol; priorMargemW += m * pVol;
    }

    if (!hasPricing || currentVol === 0 || priorVol === 0) return null;
    return ((currentMargemW / currentVol) - (priorMargemW / priorVol)) * 100;
  }, [deck, canalAtivo, edits, pricingRows, metric, summary]);

  // Top 3 changes vs prior cycle
  const top3Changes = useMemo(() => {
    if (!deck || !canalAtivo || !summary) return [];
    return deck.rows
      .filter((r) => r.sku.regional === canalAtivo)
      .map((row) => {
        const cVol = summary.futureIdxs.reduce(
          (s, i) => s + (edits[canalAtivo]?.[row.sku.cod]?.[i] ?? row.indicadores[8]?.valores[i] ?? 0),
          0,
        );
        const pVol = summary.futureIdxs.reduce(
          (s, i) => s + (row.indicadores[4]?.valores[i] ?? 0),
          0,
        );
        return {
          desc: row.sku.descricao,
          absChange: cVol - pVol,
          pctChange: pVol > 0 ? (cVol / pVol - 1) * 100 : 0,
        };
      })
      .sort((a, b) => Math.abs(b.absChange) - Math.abs(a.absChange))
      .slice(0, 3)
      .filter((r) => Math.abs(r.absChange) > 0.01);
  }, [deck, canalAtivo, edits, summary]);

  // ─── Handlers ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!basesLocais.isElectron || deck !== null || autoLoadedRef.current) return;
    autoLoadedRef.current = true;
    basesLocais.infoBasesSalvas().then((info) => {
      if (info.demanda) {
        setSavedDemandaBanner({
          nomeArquivo: info.demanda.nomeArquivo,
          data: new Date(info.demanda.ultimaModificacao).toLocaleDateString("pt-BR"),
        });
      }
    });
  }, [deck, basesLocais.isElectron, basesLocais.infoBasesSalvas]);

  const handleLoadSavedDemanda = useCallback(async () => {
    setSavedDemandaBanner(null);
    toast.info("Carregando base de Demanda salva...");
    try {
      const file = await basesLocais.carregarBase("demanda");
      if (file) {
        const parsed = await parseDemandaXlsx(file);
        originalFileRef.current = file;
        loadDeck(parsed);
        toast.success(`${parsed.rows.length} SKUs carregados de ${parsed.nomeArquivo}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar base de Demanda salva.");
    }
  }, [basesLocais.carregarBase, loadDeck]);

  const handleFileDrop = useCallback(
    async (file: File) => {
      originalFileRef.current = file;
      try {
        const parsed = await parseDemandaXlsx(file);
        loadDeck(parsed);
        toast.success(`${parsed.rows.length} SKUs carregados de ${parsed.nomeArquivo}`);
        if (basesLocais.isElectron) {
          await basesLocais.salvarBase("demanda", file);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao processar o arquivo.");
      }
    },
    [loadDeck, basesLocais.isElectron, basesLocais.salvarBase],
  );

  const handleZeroSkuFuture = useCallback(
    (canal: string, cod: number, futureMesIndices: number[]) => {
      const patch: Record<number, number> = {};
      for (const i of futureMesIndices) patch[i] = 0;
      setEditsForSku(canal, cod, patch);
    },
    [setEditsForSku],
  );

  const getExportWarnings = useCallback(() => {
    if (!deck) return [];
    const warnings: { message: string }[] = [];
    const mesAtual = deck.meses.mesAtualIdx;
    const futureIdxs = Array.from({ length: 12 }, (_, i) => i).filter((i) => i > mesAtual);

    for (const canal of canais) {
      const cRows = deck.rows.filter((r) => r.sku.regional === canal);
      if (!cRows.length) continue;

      const unreviewed = cRows.filter(
        (r) => Object.keys(edits[canal]?.[r.sku.cod] ?? {}).length === 0,
      ).length;
      if (unreviewed / cRows.length > 0.3) {
        warnings.push({
          message: `Canal "${canal}": ${unreviewed} de ${cRows.length} SKUs (${Math.round((unreviewed / cRows.length) * 100)}%) ainda não foram revisados.`,
        });
      }

      const zeroSkus: string[] = [];
      for (const row of cRows) {
        if (zeroSkus.length >= 3) break;
        const allZero = futureIdxs.every(
          (i) => (edits[canal]?.[row.sku.cod]?.[i] ?? row.indicadores[8]?.valores[i] ?? 0) === 0,
        );
        if (allZero) zeroSkus.push(row.sku.descricao.slice(0, 25));
      }
      if (zeroSkus.length)
        warnings.push({ message: `Canal "${canal}": SKUs com meses futuros zerados: ${zeroSkus.join("; ")}.` });

      const highVarSkus: string[] = [];
      for (const row of cRows) {
        if (highVarSkus.length >= 3) break;
        const cVol = futureIdxs.reduce(
          (s, i) => s + (edits[canal]?.[row.sku.cod]?.[i] ?? row.indicadores[8]?.valores[i] ?? 0),
          0,
        );
        const pVol = futureIdxs.reduce((s, i) => s + (row.indicadores[4]?.valores[i] ?? 0), 0);
        if (pVol > 0 && Math.abs((cVol - pVol) / pVol) > 0.5) {
          const pct = Math.round((cVol / pVol - 1) * 100);
          highVarSkus.push(`${row.sku.descricao.slice(0, 20)} (${pct > 0 ? "+" : ""}${pct}%)`);
        }
      }
      if (highVarSkus.length)
        warnings.push({
          message: `Canal "${canal}": SKUs com variação >50% vs ciclo anterior: ${highVarSkus.join("; ")}.`,
        });
    }
    return warnings;
  }, [deck, canais, edits]);

  const doExport = useCallback(async () => {
    if (!deck || !originalFileRef.current) {
      toast.error("Arquivo original não disponível. Recarregue a planilha.");
      return;
    }
    try {
      await exportDemandaXlsx(originalFileRef.current, deck, edits);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao exportar.");
    }
  }, [deck, edits]);

  const handleExport = useCallback(async () => {
    if (!deck) return;
    if (!originalFileRef.current) {
      toast.error("Arquivo original não disponível. Recarregue a planilha.");
      return;
    }
    const warnings = getExportWarnings();
    if (warnings.length > 0) {
      setExportWarnings(warnings);
      setShowExportDialog(true);
      return;
    }
    await doExport();
  }, [deck, getExportWarnings, doExport]);

  if (!deck) {
    return (
      <div className="flex flex-1 flex-col">
        <Topbar title="Demanda" />
        {savedDemandaBanner && (
          <div className="mx-8 mt-4 flex items-center justify-between rounded-xl border border-primary/30 bg-primary/8 px-4 py-3">
            <div className="flex items-center gap-2 text-sm">
              <HardDrive className="h-4 w-4 shrink-0 text-primary" />
              <span>
                Base de Demanda salva encontrada:{" "}
                <strong>{savedDemandaBanner.nomeArquivo}</strong> · {savedDemandaBanner.data}
              </span>
            </div>
            <div className="ml-4 flex shrink-0 items-center gap-2">
              <Button size="sm" onClick={handleLoadSavedDemanda}>
                Carregar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSavedDemandaBanner(null)}>
                Ignorar
              </Button>
            </div>
          </div>
        )}
        <DemandaUploadWithRef onFile={handleFileDrop} />
      </div>
    );
  }

  const cycleLabel = deck.meses.labels[deck.meses.mesAtualIdx] ?? "";

  return (
    <div className="flex flex-1 flex-col">
      <Topbar
        title={deck.nomeArquivo}
        subtitle={`Ciclo ${cycleLabel}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Exportar
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  Nova planilha
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Substituir planilha?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Todos os preenchimentos atuais serão perdidos.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => { clearDeck(); originalFileRef.current = null; }}
                  >
                    Substituir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        }
      />

      {/* Export validation dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Avisos antes de exportar
            </DialogTitle>
            <DialogDescription>
              Foram encontrados {exportWarnings.length} aviso{exportWarnings.length > 1 ? "s" : ""}.
              Você pode exportar assim mesmo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {exportWarnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg bg-warning/8 px-3 py-2 text-xs text-warning-foreground">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                <span>{w.message}</span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExportDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                setShowExportDialog(false);
                await doExport();
              }}
            >
              Exportar mesmo assim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex-1 space-y-4 p-4 md:p-6">
        {/* Session restored banner */}
        {sessionRestored && (
          <div className="flex items-center justify-between rounded-xl border border-warning/30 bg-warning/8 px-4 py-2.5 text-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <span className="text-foreground/80">
                Edições anteriores restauradas da sessão. Verifique antes de exportar.
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-muted-foreground"
              onClick={dismissSessionRestored}
            >
              Dispensar
            </Button>
          </div>
        )}

        {/* Canal control bar: pills + review toggle */}
        <div className="sticky top-[65px] z-10 -mx-4 border-b border-border/30 bg-background/80 px-4 py-2.5 backdrop-blur-xl md:-mx-6 md:px-6">
          <div className="flex items-center justify-between gap-3">
            {/* Canal pills */}
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              {canais.map((canal) => (
                <button
                  key={canal}
                  type="button"
                  onClick={() => { setCanalAtivo(canal); setReviewMode(false); }}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition-all duration-150",
                    canalAtivo === canal
                      ? "border border-primary/30 bg-primary/15 font-medium text-primary"
                      : "border border-transparent bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {canal}
                  <span
                    className={cn(
                      "inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-medium",
                      canalAtivo === canal
                        ? "bg-primary/20 text-primary"
                        : "bg-muted-foreground/20 text-muted-foreground",
                    )}
                  >
                    {canalCounts[canal] ?? 0}
                  </span>
                  {canalAllReviewed[canal] ? (
                    <CheckCircle2 className="h-3 w-3 text-success" />
                  ) : canalProgress[canal] > 0 ? (
                    <span className="text-[10px] text-success">{canalProgress[canal]}%</span>
                  ) : null}
                </button>
              ))}
            </div>

            {/* Review mode toggle */}
            {canalAtivo && (
              <button
                type="button"
                onClick={() => setReviewMode((v) => !v)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-all",
                  reviewMode
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-border/40 bg-card/40 text-muted-foreground hover:border-primary/30",
                )}
              >
                <Zap className="h-3 w-3" />
                Revisão
                {pendingReviewCount > 0 ? (
                  <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-warning/20 px-1 text-[10px] font-medium text-warning">
                    {pendingReviewCount}
                  </span>
                ) : (
                  <CheckCircle2 className="h-3 w-3 text-success" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Config panel */}
        <GlassCard className="p-4">
          <button
            type="button"
            onClick={() => setConfigOpen((v) => !v)}
            className="flex w-full items-center justify-between text-sm font-medium text-foreground"
          >
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              Configurações de projeção
            </div>
            {configOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {configOpen && (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-2 block text-xs font-medium text-muted-foreground">
                  Fator de crescimento:{" "}
                  <span className="text-foreground">{config.fatorCrescimento.toFixed(2)}x</span>
                </label>
                <Slider
                  min={0.8}
                  max={1.3}
                  step={0.01}
                  value={[config.fatorCrescimento]}
                  onValueChange={([v]) => setConfig({ fatorCrescimento: v })}
                  className="w-full"
                />
                <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                  <span>0.80x</span><span>1.30x</span>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium text-muted-foreground">
                  Meses para tendência
                </label>
                <Select
                  value={String(config.mesesTendencia)}
                  onValueChange={(v) => setConfig({ mesesTendencia: parseInt(v, 10) })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[3, 4, 6].map((n) => (
                      <SelectItem key={n} value={String(n)} className="text-xs">
                        {n} meses
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {canalAtivo && (
                <div>
                  <label className="mb-2 block text-xs font-medium text-muted-foreground">
                    Aplicar ao canal todo
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {(["sazonalidade", "tendencia", "anterior"] as MetodoSugestao[]).map((m) => (
                      <Button
                        key={m}
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => applyMetodoCanalTodo(canalAtivo, m)}
                      >
                        {METODO_LABELS[m]}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </GlassCard>

        {/* Grid with fade animation */}
        {canalAtivo && (
          <GlassCard className="overflow-hidden p-0">
            <div
              className="transition-opacity duration-150"
              style={{ opacity: gridVisible ? 1 : 0 }}
            >
              <DemandaGrid
                canal={canalAtivo}
                deck={deck}
                edits={edits}
                pricingRows={pricingRows}
                metric={metric}
                reviewMode={reviewMode}
                onEdit={setEdit}
                onApplyMetodo={applyMetodo}
                onSkuClick={setSkuDrawerOpen}
                onClearSkuEdits={clearSkuEdits}
                onZeroSkuFuture={handleZeroSkuFuture}
              />
            </div>
          </GlassCard>
        )}

        {/* Enhanced summary card */}
        {summary && (
          <GlassCard className="p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              Resumo — {canalAtivo}
            </h3>

            {/* KPI grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {/* Vol. Planejado */}
              <div className="rounded-xl bg-card/50 p-3">
                <div className="text-xs text-muted-foreground">Vol. Planejado</div>
                <div className="mt-1 text-lg font-semibold tabular-nums">
                  {summary.totalPlanejado.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                </div>
              </div>

              {/* Var. vs Ciclo Ant. */}
              {summary.varPct !== null && (
                <div className="rounded-xl bg-card/50 p-3">
                  <div className="text-xs text-muted-foreground">Var. vs Ciclo Ant.</div>
                  <div
                    className={cn(
                      "mt-1 flex items-center gap-1 text-lg font-semibold tabular-nums",
                      summary.varPct >= 0 ? "text-success" : "text-destructive",
                    )}
                  >
                    {summary.varPct >= 0 ? (
                      <ArrowUp className="h-4 w-4" />
                    ) : (
                      <ArrowDown className="h-4 w-4" />
                    )}
                    {summary.varPct >= 0 ? "+" : ""}{summary.varPct.toFixed(1)}%
                  </div>
                </div>
              )}

              {/* Mix Margem (conditional) */}
              {mixDelta !== null && (
                <div className="rounded-xl bg-card/50 p-3">
                  <div className="text-xs text-muted-foreground">Mix de Margem</div>
                  <div
                    className={cn(
                      "mt-1 text-sm font-semibold",
                      mixDelta >= 0 ? "text-success" : "text-destructive",
                    )}
                  >
                    {mixDelta >= 0 ? "Melhorando " : "Deteriorando "}
                    <span className="text-lg">
                      {mixDelta >= 0 ? "+" : ""}{mixDelta.toFixed(1)}pp
                    </span>
                  </div>
                </div>
              )}

              {/* SKUs acima média */}
              {skusAcimaMedio && (
                <div className="rounded-xl bg-card/50 p-3">
                  <div className="text-xs text-muted-foreground">Acima da média</div>
                  <div className="mt-1 text-lg font-semibold tabular-nums">
                    {skusAcimaMedio.above}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">
                      / {skusAcimaMedio.total}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">SKUs acima do canal</div>
                </div>
              )}

              {/* Sem revisão */}
              <div className="rounded-xl bg-card/50 p-3">
                <div className="text-xs text-muted-foreground">Sem revisão</div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-warning">
                  {summary.semRevisao} / {summary.total}
                </div>
              </div>

              {/* Revisados */}
              <div className="rounded-xl bg-card/50 p-3">
                <div className="text-xs text-muted-foreground">Revisados</div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-success">
                  {summary.total - summary.semRevisao} / {summary.total}
                </div>
              </div>
            </div>

            {/* Top 3 changes */}
            {top3Changes.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Maiores variações vs ciclo anterior
                </p>
                <div className="space-y-1.5">
                  {top3Changes.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-xs"
                    >
                      <span className="max-w-[200px] truncate text-foreground/80">{item.desc}</span>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "tabular-nums",
                            item.absChange >= 0 ? "text-success" : "text-destructive",
                          )}
                        >
                          {item.absChange >= 0 ? "+" : ""}
                          {item.absChange.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "h-5 px-1.5 text-[9px]",
                            item.absChange >= 0
                              ? "border-success/40 bg-success/10 text-success"
                              : "border-destructive/40 bg-destructive/10 text-destructive",
                          )}
                        >
                          {item.absChange >= 0 ? "Aumento" : "Redução"}{" "}
                          {Math.abs(item.pctChange).toFixed(0)}%
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </GlassCard>
        )}
      </div>

      {/* SKU Drawer */}
      <DemandaSkuDrawer
        drawerKey={skuDrawerOpen}
        rows={deck.rows}
        meses={deck.meses}
        edits={edits}
        pricingRows={pricingRows}
        metric={metric}
        fatorCrescimento={config.fatorCrescimento}
        mesesTendencia={config.mesesTendencia}
        onClose={() => setSkuDrawerOpen(null)}
        onApplyMetodo={applyMetodo}
      />
    </div>
  );
}
