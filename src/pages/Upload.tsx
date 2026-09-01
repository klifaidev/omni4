import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { MissingMappingsAlert } from "@/components/pricing/MissingMappingsAlert";
import { UploadQueue } from "@/components/pricing/UploadQueue";
import { ExportDeparasCard } from "@/components/pricing/ExportDeparasCard";
import { CustomTableEditorDialog } from "@/components/pricing/CustomTableEditorDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePricing } from "@/store/pricing";
import { useBudget, getBudgetMonthsInfo } from "@/store/budget";
import {
  CUSTOM_TABLES_FILE,
  createCustomTableDraft,
  parseCustomTablesPayload,
  serializeCustomTables,
  useCustomTables,
  type CustomTable,
} from "@/store/customTables";
import { useInovacaoDepara } from "@/store/inovacaoDepara";
import { useMonthsInfo } from "@/store/selectors";
import { Trash2, FileSpreadsheet, Calendar, CheckCircle2, AlertTriangle, Database, Target, Sparkles, Loader2, HardDrive, Clock, Pencil, Plus } from "lucide-react";
import { monthLabel } from "@/lib/format";
import { getFreshness, type FreshnessStatus } from "@/lib/freshness";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateDemoData } from "@/lib/demoData";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useUploadGuard } from "@/store/uploadGuard";
import { usePageTitle } from "@/hooks/use-page-title";
import { parseCsvFile, type ParsedCsv } from "@/lib/csv";
import { parseBudgetFile, type ParsedBudget } from "@/lib/budget";
import { parseInovacaoDeparaFile } from "@/lib/parseDeparaInovacao";
import { loadProcessedBase, saveProcessedBaseInBackground } from "@/lib/processedBaseCache";
import { useBasesLocais, type InfoArquivoBase, type TipoBase, type InfoBase } from "@/hooks/use-bases-locais";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const EXPECTED_COLS = [
  "Periodo (ex.: 005.2025)",
  "Marca, Canal, Categoria, Subcategoria",
  "SKU, Descrição SKU, Cliente",
  "Região, Mercado, Sabor, Tecnologia, Faixa de Peso",
  "ROL (Receita Op. Líquida)",
  "Volume (kg), CMV / Custo",
  "Margem Bruta, Contribuição Marginal",
];

function arquivosDaBase(base: InfoBase | undefined): InfoArquivoBase[] {
  if (!base) return [];
  if (base.arquivos?.length) return base.arquivos;
  return base.nomeArquivos.map((nomeArquivo) => ({
    nomeArquivo,
    tamanho: 0,
    ultimaModificacao: base.ultimaModificacao,
  }));
}



function FreshnessBadge({ f }: { f: FreshnessStatus }) {
  if (f.status === "empty") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
        <Calendar className="h-3 w-3" /> Sem dados
      </span>
    );
  }
  if (f.status === "current") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-500">
        <CheckCircle2 className="h-3 w-3" /> Atualizado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-[11px] font-medium text-warning">
      <AlertTriangle className="h-3 w-3" />
      Desatualizado · {f.monthsBehind} {f.monthsBehind === 1 ? "mês" : "meses"} atrás
    </span>
  );
}

function StatusHeroCard({
  title,
  subtitle,
  icon: Icon,
  freshness,
  accent,
  rightSlot,
}: {
  title: string;
  subtitle: string;
  icon: typeof Database;
  freshness: FreshnessStatus;
  accent: "primary" | "accent";
  rightSlot?: React.ReactNode;
}) {
  const accentClasses =
    accent === "primary"
      ? "from-primary/15 to-primary/0 border-primary/20 [&_.acc]:text-primary [&_.acc-bg]:bg-primary/15"
      : "from-accent/15 to-accent/0 border-accent/20 [&_.acc]:text-accent [&_.acc-bg]:bg-accent/15";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-gradient-to-br p-5",
        accentClasses,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="acc-bg flex h-10 w-10 items-center justify-center rounded-xl">
            <Icon className="acc h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight">{title}</div>
            <div className="text-[11px] text-muted-foreground">{subtitle}</div>
          </div>
        </div>
        <FreshnessBadge f={freshness} />
      </div>

      <div className="mt-5 flex items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Último mês carregado
          </div>
          <div className="mt-1 text-3xl font-semibold tracking-tight">
            {freshness.lastLabel ?? "—"}
          </div>
          {freshness.status === "stale" && (
            <div className="mt-1 text-[11px] text-warning">
              Esperado: <span className="font-medium">{freshness.expectedLabel}</span>
            </div>
          )}
          {freshness.status === "current" && (
            <div className="mt-1 text-[11px] text-muted-foreground">
              Em dia com {freshness.expectedLabel}
            </div>
          )}
        </div>
        {rightSlot}
      </div>
    </div>
  );
}

const TIPO_LABELS: Record<TipoBase, string> = {
  ke30: "KE30 (Real)",
  budget: "Budget",
  demanda: "Demanda",
  personalizado: "Personalizado",
  deparaInovacao: "De/Para Inovação",
};

function formatFileSize(bytes: number) {
  return bytes >= 1024 * 1024
    ? (bytes / (1024 * 1024)).toFixed(1) + " MB"
    : (bytes / 1024).toFixed(1) + " KB";
}

export default function Upload() {
  usePageTitle("Upload / Bases");
  const files = usePricing((s) => s.files);
  const removeFile = usePricing((s) => s.removeFile);
  const clearAll = usePricing((s) => s.clearAll);
  const addParsed = usePricing((s) => s.addParsed);
  const parsing = usePricing((s) => s.parsing);
  const isDemoData = usePricing((s) => s.isDemoData);
  const setDemoMode = usePricing((s) => s.setDemoMode);
  const months = useMonthsInfo();

  const budgetRows = useBudget((s) => s.rows);
  const budgetFiles = useBudget((s) => s.files);
  const removeBudgetFile = useBudget((s) => s.removeBudgetFile);
  const clearBudget = useBudget((s) => s.clearBudget);
  const addBudget = useBudget((s) => s.addBudget);
  const budgetMonths = useMemo(() => getBudgetMonthsInfo(budgetRows), [budgetRows]);

  const customTables = useCustomTables((s) => s.tables);
  const setCustomTables = useCustomTables((s) => s.setTables);
  const [customEditorOpen, setCustomEditorOpen] = useState(false);
  const [editingCustomTable, setEditingCustomTable] = useState<CustomTable | null>(null);

  const setParsingStart = usePricing((s) => s.setParsingStart);
  const setParsingEnd = usePricing((s) => s.setParsingEnd);
  const setInovacaoDepara = useInovacaoDepara((s) => s.setDepara);

  const realFreshness = useMemo(() => getFreshness(months), [months]);
  const budgetFreshness = useMemo(() => getFreshness(budgetMonths), [budgetMonths]);

  const basesLocais = useBasesLocais();
  const autoLoadedRef = useRef(false);
  const [infoSalvas, setInfoSalvas] = useState<Record<string, InfoBase>>({});
  const [pendingSaveQueue, setPendingSaveQueue] = useState<Array<{ tipo: TipoBase; file: File; dataExistente: string }>>([]);
  const [basesSalvas, setBasesSalvas] = useState<Record<string, boolean>>({});
  const [deletePending, setDeletePending] = useState<{ tipo: TipoBase; nomeArquivo?: string } | null>(null);

  const refreshInfoSalvas = useCallback(async () => {
    if (!basesLocais.isElectron) return;
    const info = await basesLocais.infoBasesSalvas();
    setInfoSalvas(info as Record<string, InfoBase>);
    setBasesSalvas({
      ke30: !!info.ke30,
      budget: !!info.budget,
      demanda: !!info.demanda,
      deparaInovacao: !!info.deparaInovacao,
      personalizado: !!info.personalizado,
    });
  }, [basesLocais.isElectron, basesLocais.infoBasesSalvas]);

  const persistCustomTables = useCallback(async (tables: CustomTable[], successMessage?: string) => {
    setCustomTables(tables);
    if (!basesLocais.isElectron) {
      if (successMessage) toast.success(successMessage);
      return;
    }
    const file = new File(
      [serializeCustomTables(tables)],
      CUSTOM_TABLES_FILE,
      { type: "application/json", lastModified: Date.now() },
    );
    const result = await basesLocais.salvarBase("personalizado", file);
    if (result.ok) {
      if (successMessage) toast.success(successMessage);
      await refreshInfoSalvas();
    } else {
      toast.error("Falha ao salvar tabelas personalizadas localmente.");
    }
  }, [basesLocais.isElectron, basesLocais.salvarBase, refreshInfoSalvas, setCustomTables]);

  useEffect(() => { refreshInfoSalvas(); }, [refreshInfoSalvas]);

  useEffect(() => {
    if (!basesLocais.isElectron || autoLoadedRef.current) return;
    autoLoadedRef.current = true;
    async function autoLoad() {
      const info = await basesLocais.infoBasesSalvas();
      if (info.deparaInovacao) {
        try {
          const savedFiles = await basesLocais.carregarBase("deparaInovacao");
          const latest = savedFiles[savedFiles.length - 1];
          if (latest) {
            const parsed = await parseInovacaoDeparaFile(latest);
            if (parsed.file.rowCount > 0) {
              setInovacaoDepara(parsed.map, parsed.file);
            }
          }
        } catch { toast.error("Erro ao carregar De/Para de Inovação salvo."); }
      }
      if (info.personalizado) {
        try {
          const savedFiles = await basesLocais.carregarBase("personalizado");
          const libraryFile = savedFiles.find((file) => file.name === CUSTOM_TABLES_FILE) ?? savedFiles[savedFiles.length - 1];
          if (libraryFile) {
            setCustomTables(parseCustomTablesPayload(await libraryFile.text()));
          }
        } catch {
          toast.error("Erro ao carregar tabelas personalizadas salvas.");
        }
      }
      if (files.length === 0 && info.ke30) {
        toast.info("Carregando base KE30 salva...");
        try {
          setParsingStart();
          const savedFiles = arquivosDaBase(info.ke30);
          for (const arquivo of savedFiles) {
            let parsed = await loadProcessedBase<ParsedCsv>("ke30", arquivo.nomeArquivo, "ke30-parsed-csv");
            if (!parsed) {
              const file = await basesLocais.carregarArquivo("ke30", arquivo.nomeArquivo);
              if (!file) continue;
              parsed = await parseCsvFile(file);
              if (parsed.rows.length > 0) {
                saveProcessedBaseInBackground("ke30", arquivo.nomeArquivo, "ke30-parsed-csv", parsed);
              }
            }
            if (parsed.rows.length > 0) {
              addParsed(parsed.rows, parsed.file, false, parsed.missing);
            }
          }
          if (savedFiles.length > 0) toast.success(`Base KE30 carregada: ${savedFiles.length} arquivo(s)`);
        } catch { toast.error("Erro ao carregar base KE30 salva."); }
        finally { setParsingEnd(); }
      }
      if (budgetRows.length === 0 && info.budget) {
        toast.info("Carregando base Budget salva...");
        try {
          setParsingStart();
          const savedFiles = arquivosDaBase(info.budget);
          for (const arquivo of savedFiles) {
            let parsed = await loadProcessedBase<ParsedBudget>("budget", arquivo.nomeArquivo, "budget-parsed-xlsx");
            if (!parsed) {
              const file = await basesLocais.carregarArquivo("budget", arquivo.nomeArquivo);
              if (!file) continue;
              parsed = await parseBudgetFile(file);
              if (parsed.rows.length > 0) {
                saveProcessedBaseInBackground("budget", arquivo.nomeArquivo, "budget-parsed-xlsx", parsed);
              }
            }
            if (parsed.rows.length > 0) {
              addBudget(parsed.rows, parsed.file, false);
            }
          }
          if (savedFiles.length > 0) toast.success(`Base Budget carregada: ${savedFiles.length} arquivo(s)`);
        } catch { toast.error("Erro ao carregar base Budget salva."); }
        finally { setParsingEnd(); }
      }
      await refreshInfoSalvas();
    }
    autoLoad();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAfterApply = useCallback(
    async (applied: { tipo: TipoBase; file: File; parsed?: ParsedCsv | ParsedBudget }[]) => {
      const toConfirm: Array<{ tipo: TipoBase; file: File; dataExistente: string }> = [];
      for (const { tipo, file, parsed } of applied) {
        try {
          const infoAtual = await basesLocais.infoBasesSalvas();
          const jaExiste = infoAtual[tipo]?.nomeArquivos?.includes(file.name);
          if (jaExiste) {
            toConfirm.push({
              tipo,
              file,
              dataExistente: new Date(infoAtual[tipo]!.ultimaModificacao).toLocaleDateString("pt-BR"),
            });
          } else {
            const resultado = await basesLocais.salvarBase(tipo, file);
            if (resultado?.ok) {
              if (tipo === "ke30" && parsed) {
                saveProcessedBaseInBackground("ke30", file.name, "ke30-parsed-csv", parsed);
              }
              if (tipo === "budget" && parsed) {
                saveProcessedBaseInBackground("budget", file.name, "budget-parsed-xlsx", parsed);
              }
              toast.success(`Base ${tipo.toUpperCase()} salva localmente.`);
            } else {
              toast.error(`Falha ao salvar base ${tipo.toUpperCase()} localmente.`);
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "erro desconhecido";
          console.error(`Erro ao salvar base ${tipo}:`, err);
          toast.error(`Erro ao salvar base ${tipo.toUpperCase()}: ${msg}`);
        }
      }
      await refreshInfoSalvas();
      if (toConfirm.length > 0) setPendingSaveQueue(toConfirm);
    },
    [basesLocais.infoBasesSalvas, basesLocais.salvarBase, refreshInfoSalvas],
  );

  const handleDeleteBase = useCallback(
    async (tipo: TipoBase, nomeArquivo?: string) => {
      await basesLocais.deletarBase(tipo, nomeArquivo);
      if (tipo === "personalizado" && (!nomeArquivo || nomeArquivo === CUSTOM_TABLES_FILE)) {
        setCustomTables([]);
      }
      toast.success(nomeArquivo ? `Arquivo "${nomeArquivo}" removido.` : "Base local removida.");
      setDeletePending(null);
      await refreshInfoSalvas();
    },
    [basesLocais.deletarBase, refreshInfoSalvas, setCustomTables],
  );

  const handleSaveFileFromQueue = useCallback(
    async (tipo: TipoBase, file: File) => {
      const info = await basesLocais.infoBasesSalvas();
      const jaExiste = info[tipo]?.nomeArquivos?.includes(file.name);
      if (jaExiste) {
        setPendingSaveQueue((prev) => [
          ...prev,
          {
            tipo: tipo as TipoBase,
            file,
            dataExistente: new Date(info[tipo]!.ultimaModificacao).toLocaleDateString("pt-BR"),
          },
        ]);
      } else {
        const resultado = await basesLocais.salvarBase(tipo as TipoBase, file);
        if (resultado?.ok) {
          toast.success(`Base ${TIPO_LABELS[tipo]} salva localmente.`);
          await refreshInfoSalvas();
        } else {
          toast.error(`Falha ao salvar base ${TIPO_LABELS[tipo]} localmente.`);
        }
      }
    },
    [basesLocais.infoBasesSalvas, basesLocais.salvarBase, refreshInfoSalvas],
  );

  const savedTypesSet = useMemo(
    () => new Set(Object.entries(basesSalvas).filter(([, v]) => v).map(([k]) => k)),
    [basesSalvas],
  );

  const openCustomTable = useCallback((table?: CustomTable) => {
    setEditingCustomTable(table ?? createCustomTableDraft());
    setCustomEditorOpen(true);
  }, []);

  const handleSaveCustomTable = useCallback(async (table: CustomTable) => {
    const exists = customTables.some((current) => current.id === table.id);
    const next = exists
      ? customTables.map((current) => (current.id === table.id ? table : current))
      : [...customTables, table];
    await persistCustomTables(next, exists ? "Tabela personalizada atualizada." : "Tabela personalizada criada.");
  }, [customTables, persistCustomTables]);

  const handleDeleteCustomTable = useCallback(async (id: string) => {
    const table = customTables.find((current) => current.id === id);
    const next = customTables.filter((current) => current.id !== id);
    await persistCustomTables(next, table ? `Tabela "${table.name}" removida.` : "Tabela removida.");
  }, [customTables, persistCustomTables]);

  const handleLoadDemo = () => {
    clearAll();
    clearBudget();
    const demo = generateDemoData();
    addParsed(demo.realRows, demo.realFile, true, { skus: [], canais: [], regioes: [], ufs: [] });
    addBudget(demo.budgetRows, demo.budgetFile, true);
    setDemoMode(true);
    toast.success("Dados de demonstração carregados", {
      description: `${demo.realRows.length.toLocaleString("pt-BR")} linhas Real · ${demo.budgetRows.length.toLocaleString("pt-BR")} linhas Budget · ${demo.realFile.months.length} meses`,
    });
  };

  const handleRemoveDemo = () => {
    clearAll();
    clearBudget();
    setDemoMode(false);
    toast.success("Dados de demonstração removidos");
  };

  // Guard: avisar se sair sem aplicar
  const navigate = useNavigate();
  const promptingRef = useRef(false);
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (useUploadGuard.getState().pending > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const onClick = (e: MouseEvent) => {
      const { pending, apply } = useUploadGuard.getState();
      if (pending === 0 || promptingRef.current) return;
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest("a") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("http") || anchor.target === "_blank") return;
      if (href === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      promptingRef.current = true;
      const toastId = toast.warning("Você tem arquivos não aplicados", {
        description: `${pending} arquivo(s) na fila ainda não foram aplicados. Deseja sair mesmo assim?`,
        duration: 15000,
        onDismiss: () => { promptingRef.current = false; },
        onAutoClose: () => { promptingRef.current = false; },
        action: {
          label: "Aplicar e sair",
          onClick: async () => {
            try { if (apply) await apply(); } finally {
              promptingRef.current = false;
              toast.dismiss(toastId);
              navigate(href);
            }
          },
        },
        cancel: {
          label: "Sair sem aplicar",
          onClick: () => {
            promptingRef.current = false;
            toast.dismiss(toastId);
            navigate(href);
          },
        },
      });
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [navigate]);

  return (
    <>
      <Topbar title="Upload / Bases" subtitle="Gerencie Real, Budget e tabelas personalizadas" />
      <div className="space-y-6 px-8 py-6">
        <MissingMappingsAlert />

        {isDemoData && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/30 bg-warning/10 px-5 py-3 animate-fade-in">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
              <div className="text-sm text-foreground">
                Você está visualizando <span className="font-semibold">dados de demonstração</span>. Os dados reais ainda não foram carregados.
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={handleRemoveDemo} className="shrink-0 gap-2 border-warning/40 text-warning hover:bg-warning/15 hover:text-warning">
              <Trash2 className="h-4 w-4" />
              Remover dados demo
            </Button>
          </div>
        )}

        {/* Demo data — para apresentações */}
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="text-sm font-semibold">Modo apresentação</div>
              <div className="text-[11px] text-muted-foreground">
                Carrega dados aleatórios (Real + Budget · 12 meses) para demonstrar todas as funcionalidades.
                Substitui o que estiver carregado.
              </div>
            </div>
          </div>
          <Button onClick={handleLoadDemo} className="shrink-0 gap-2">
            <Sparkles className="h-4 w-4" />
            {isDemoData ? "Recarregar demo" : "Carregar dados demo"}
          </Button>
        </div>


        {/* Status hero — Real | Budget */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <StatusHeroCard
            title="Base Real"
            subtitle="Vendas, custos e margens efetivos"
            icon={Database}
            accent="primary"
            freshness={realFreshness}
            rightSlot={
              <div className="text-right">
                <div className="text-xs text-muted-foreground">{months.length} mês(es)</div>
                <div className="text-xs text-muted-foreground">{files.length} arquivo(s)</div>
              </div>
            }
          />
          <StatusHeroCard
            title="Base Budget"
            subtitle="Previsão orçamentária do ano"
            icon={Target}
            accent="accent"
            freshness={budgetFreshness}
            rightSlot={
              <div className="text-right">
                <div className="text-xs text-muted-foreground">{budgetMonths.length} mês(es)</div>
                <div className="text-xs text-muted-foreground">{budgetFiles.length} arquivo(s)</div>
              </div>
            }
          />
        </div>

        {/* Upload em fila com botão Aplicar */}
        <GlassCard className="relative">
          <header className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Upload de bases</h3>
              <p className="text-[11px] text-muted-foreground">
                Adicione vários arquivos (Real e Budget). O app só será atualizado quando você clicar em <span className="font-medium text-foreground">Aplicar</span>.
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Badge variant="secondary" className="text-[10px]">.csv (Real)</Badge>
              <Badge variant="secondary" className="text-[10px]">.xlsx (Budget)</Badge>
            </div>
          </header>
          <UploadQueue
            onAfterApply={basesLocais.isElectron ? handleAfterApply : undefined}
            savedTypes={basesLocais.isElectron ? savedTypesSet : undefined}
            onSaveFile={basesLocais.isElectron ? handleSaveFileFromQueue : undefined}
            onDeleteFile={basesLocais.isElectron ? (t) => setDeletePending({ tipo: t as TipoBase }) : undefined}
            isElectron={basesLocais.isElectron}
          />
          {parsing && (
            <div className="pointer-events-auto absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-2xl bg-background/70 backdrop-blur-sm">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Processando arquivo...</span>
            </div>
          )}
        </GlassCard>

        <GlassCard>
          <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Personalizado</h3>
                <p className="max-w-2xl text-[11px] text-muted-foreground">
                  Crie tabelas livres dentro do Omni4, colando dados do Excel ou digitando diretamente numa grade editável.
                </p>
              </div>
            </div>
            <Button className="gap-2" onClick={() => openCustomTable()}>
              <Plus className="h-4 w-4" />
              Inserir dados
            </Button>
          </header>

          {customTables.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-center">
              <div className="text-sm font-medium">Nenhuma tabela personalizada ainda</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Use para metas, concorrentes, premissas ou qualquer base pequena que não venha de arquivo.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {customTables.map((table) => {
                const filledRows = table.rows.filter((row) => row.some((cell) => String(cell ?? "").trim() !== "")).length;
                return (
                  <div key={table.id} className="rounded-xl border border-border/50 bg-secondary/20 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold" title={table.name}>{table.name}</div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {table.columns.length} coluna(s) · {filledRows} linha(s) preenchida(s)
                        </div>
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          Atualizada em {new Date(table.updatedAt).toLocaleString("pt-BR")}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openCustomTable(table)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteCustomTable(table.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>

        {/* Meses + arquivos da base Real */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <GlassCard>
            <header className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-medium">
                <Calendar className="mr-2 inline h-4 w-4" /> Meses Real
              </h3>
              <Badge variant="secondary">{months.length}</Badge>
            </header>
            {months.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum mês carregado.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {months.map((m) => (
                  <div key={m.periodo} className="rounded-lg border border-border/40 bg-secondary/30 p-3 text-center">
                    <div className="text-sm font-semibold">{m.label}</div>
                    <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{m.fy}</div>
                    <div className="mt-1 text-[10px] text-muted-foreground">{m.rowCount.toLocaleString("pt-BR")} linhas</div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          <GlassCard>
            <header className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-medium">
                <Calendar className="mr-2 inline h-4 w-4" /> Meses Budget
              </h3>
              <Badge variant="secondary">{budgetMonths.length}</Badge>
            </header>
            {budgetMonths.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum mês de Budget carregado.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {budgetMonths.map((m) => (
                  <div key={m.periodo} className="rounded-lg border border-accent/20 bg-accent/5 p-3 text-center">
                    <div className="text-sm font-semibold">{monthLabel(m.mes, m.ano)}</div>
                    <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{m.fy}</div>
                    <div className="mt-1 text-[10px] text-muted-foreground">{m.rowCount.toLocaleString("pt-BR")} linhas</div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </div>

        {/* Arquivos */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <GlassCard>
            <header className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-medium">
                <FileSpreadsheet className="mr-2 inline h-4 w-4" /> Arquivos Real
              </h3>
              {files.length > 0 && (
                <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={clearAll}>
                  Limpar tudo
                </Button>
              )}
            </header>
            {files.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum arquivo carregado.</p>
            ) : (
              <ul className="space-y-2">
                {files.map((f) => (
                  <li key={f.name} className="flex items-center justify-between rounded-lg border border-border/40 bg-secondary/30 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{f.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {f.rowCount.toLocaleString("pt-BR")} linhas · {f.months.length} mês(es)
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeFile(f.name)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>

          <GlassCard>
            <header className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-medium">
                <FileSpreadsheet className="mr-2 inline h-4 w-4" /> Arquivos Budget
              </h3>
              {budgetFiles.length > 0 && (
                <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={clearBudget}>
                  Limpar tudo
                </Button>
              )}
            </header>
            {budgetFiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum arquivo de Budget.</p>
            ) : (
              <ul className="space-y-2">
                {budgetFiles.map((f) => (
                  <li key={f.name} className="flex items-center justify-between rounded-lg border border-accent/20 bg-accent/5 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{f.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {f.rowCount.toLocaleString("pt-BR")} linhas · {f.months.length} mês(es)
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeBudgetFile(f.name)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>
        </div>

        <ExportDeparasCard />

        {basesLocais.isElectron && Object.keys(infoSalvas).length > 0 && (
          <GlassCard>
            <header className="mb-4 flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-medium">Bases salvas localmente</h3>
            </header>
            <div className="space-y-2">
              {(["ke30", "budget", "demanda", "deparaInovacao", "personalizado"] as const).map((tipo) => {
                const info = infoSalvas[tipo];
                if (!info) return null;
                return (
                  <div key={tipo} className="space-y-1">
                    <div className="flex items-center gap-2 px-1 pb-0.5">
                      <span className="text-sm font-medium">{TIPO_LABELS[tipo]}</span>
                      <Badge variant="secondary" className="text-[10px]">{info.quantidade} arquivo(s)</Badge>
                      <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {new Date(info.ultimaModificacao).toLocaleString("pt-BR")} · {formatFileSize(info.tamanhoTotal)}
                      </span>
                    </div>
                    {info.nomeArquivos.map((nome) => (
                      <div key={nome} className="flex items-center justify-between rounded-lg border border-border/40 bg-secondary/30 px-3 py-2">
                        <span className="truncate text-sm">{nome}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeletePending({ tipo, nomeArquivo: nome })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </GlassCard>
        )}

        <GlassCard>
          <h3 className="mb-3 text-sm font-medium">Colunas esperadas no CSV (Real)</h3>
          <ul className="grid grid-cols-1 gap-1.5 text-xs text-muted-foreground md:grid-cols-2">
            {EXPECTED_COLS.map((c) => (
              <li key={c} className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                {c}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Aceita separadores “;” ou “,”, decimais BR (1.234,56) ou internacional (1234.56).
            Linhas com ROL ≤ 0 são descartadas.
          </p>
        </GlassCard>
      </div>

      {/* Dialog: confirmar substituição de base salva (processa fila) */}
      <CustomTableEditorDialog
        open={customEditorOpen}
        table={editingCustomTable}
        onOpenChange={setCustomEditorOpen}
        onSave={handleSaveCustomTable}
      />

      <AlertDialog
        open={pendingSaveQueue.length > 0}
        onOpenChange={(open) => { if (!open) setPendingSaveQueue((prev) => prev.slice(1)); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Substituir arquivo salvo?</AlertDialogTitle>
            <AlertDialogDescription>
              O arquivo{" "}
              <span className="font-medium">{pendingSaveQueue[0]?.file.name}</span> já está salvo na base{" "}
              {pendingSaveQueue[0] ? TIPO_LABELS[pendingSaveQueue[0].tipo] : ""}. Deseja substituí-lo?
              {pendingSaveQueue.length > 1 && (
                <span className="ml-1 text-muted-foreground">
                  ({pendingSaveQueue.length - 1} mais na fila)
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingSaveQueue((prev) => prev.slice(1))}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const current = pendingSaveQueue[0];
                if (!current) return;
                const resultado = await basesLocais.salvarBase(current.tipo, current.file);
                if (resultado?.ok) {
                  toast.success(`Base ${TIPO_LABELS[current.tipo]} substituída e salva localmente.`);
                } else {
                  toast.error(`Falha ao substituir base ${TIPO_LABELS[current.tipo]}.`);
                }
                setPendingSaveQueue((prev) => prev.slice(1));
                await refreshInfoSalvas();
              }}
            >
              Substituir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: confirmar exclusão de base salva */}
      <AlertDialog open={deletePending !== null} onOpenChange={(open) => { if (!open) setDeletePending(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover arquivo salvo?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletePending?.nomeArquivo
                ? <>Remover o arquivo <span className="font-medium">"{deletePending.nomeArquivo}"</span> da base {TIPO_LABELS[deletePending.tipo]}?</>
                : <>Remover a base {deletePending ? TIPO_LABELS[deletePending.tipo] : ""} salva localmente?</>}
              {" "}Os dados desta sessão não serão afetados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletePending(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletePending && handleDeleteBase(deletePending.tipo, deletePending.nomeArquivo)}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
