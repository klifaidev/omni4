// Entrada de bases da aba Bases: uma área só para a Base One (Real + Budget +
// Ruptura num arquivo), o CSV do KE30 ou qualquer planilha avulsa. Cada
// arquivo vira um cartão de revisão — o que foi reconhecido em cada aba, por
// quê, quais meses e o que já existe no app — e nada muda até "Aplicar".
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  EyeOff,
  FileSpreadsheet,
  Layers,
  Loader2,
  PackageX,
  Play,
  Target,
  Upload as UploadIcon,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatNum } from "@/lib/format";
import { useUploadGuard } from "@/store/uploadGuard";
import { usePricing } from "@/store/pricing";
import { useBudget } from "@/store/budget";
import { useRuptura } from "@/store/ruptura";
import {
  KIND_LABEL,
  applyIntake,
  findDuplicates,
  getDuplicatePolicy,
  intakeId,
  monthKeyLabel,
  monthRangeLabel,
  readIntakeFile,
  resolvePart,
  setDuplicatePolicy,
  type BaseKind,
  type DuplicateChoice,
  type DuplicateInfo,
  type DuplicatePolicy,
  type IntakeFile,
  type IntakePart,
} from "@/lib/intake/intake";

const ACCEPT = ".xlsx,.xls,.xlsm,.csv";

const KIND_STYLE: Record<BaseKind, { icon: typeof Database; text: string; bg: string }> = {
  real: { icon: Database, text: "text-primary", bg: "bg-primary/10" },
  budget: { icon: Target, text: "text-accent", bg: "bg-accent/10" },
  ruptura: { icon: PackageX, text: "text-destructive", bg: "bg-destructive/10" },
};

const CONFIDENCE_LABEL = { alta: "certeza alta", media: "certeza média", baixa: "certeza baixa" } as const;

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${formatNum(bytes / (1024 * 1024), 1)} MB`;
  return `${formatNum(bytes / 1024, 0)} KB`;
}

/** Meses já carregados no app, por tipo — reativo, para os avisos da revisão. */
function useLoadedMonths(): Record<BaseKind, Set<string>> {
  const realFiles = usePricing((s) => s.files);
  const budgetFiles = useBudget((s) => s.files);
  const rupturaModel = useRuptura((s) => s.model);
  return useMemo(() => {
    const toMonth = (p: string) => {
      const [mes, ano] = p.split(".");
      return `${ano}-${mes.slice(-2)}`;
    };
    return {
      real: new Set(realFiles.flatMap((f) => f.months).map(toMonth)),
      budget: new Set(budgetFiles.flatMap((f) => f.months).map(toMonth)),
      ruptura: new Set(rupturaModel?.months ?? []),
    };
  }, [realFiles, budgetFiles, rupturaModel]);
}

export function BaseIntake({ onApplied }: { onApplied?: () => void } = {}) {
  const [files, setFiles] = useState<IntakeFile[]>([]);
  const [drag, setDrag] = useState(false);
  const [applying, setApplying] = useState(false);
  const [policy, setPolicyState] = useState<DuplicatePolicy>(() => getDuplicatePolicy());
  const [dupDialog, setDupDialog] = useState<DuplicateInfo[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const loaded = useLoadedMonths();

  // A revisão mostra o que já existe; a ruptura salva precisa estar lida.
  useEffect(() => {
    void useRuptura.getState().loadSaved();
  }, []);

  const patchFile = useCallback((id: string, patch: (f: IntakeFile) => IntakeFile) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? patch(f) : f)));
  }, []);

  const addFiles = useCallback(async (list: FileList | File[]) => {
    const incoming = Array.from(list).filter((file) => /\.(xlsx|xls|xlsm|csv)$/i.test(file.name));
    if (incoming.length === 0) {
      toast.error("Formato não suportado. Use .xlsx, .xls, .xlsm ou .csv.");
      return;
    }
    const entries: IntakeFile[] = incoming.map((file) => ({
      id: intakeId("file"),
      file,
      status: "reading",
      progress: { label: "Na fila", fraction: null },
      parts: [],
    }));
    setFiles((prev) => [...prev.filter((f) => f.status !== "applied"), ...entries]);
    // Um arquivo por vez: dois XLSX grandes abertos juntos dobram a memória.
    for (const entry of entries) {
      try {
        const parts = await readIntakeFile(entry.file, (progress) => patchFile(entry.id, (f) => ({ ...f, progress })));
        patchFile(entry.id, (f) => ({ ...f, status: "ready", progress: undefined, parts }));
      } catch (err) {
        const error = err instanceof Error ? err.message : "Falha ao ler o arquivo.";
        patchFile(entry.id, (f) => ({ ...f, status: "error", progress: undefined, error }));
      }
    }
    if (inputRef.current) inputRef.current.value = "";
  }, [patchFile]);

  const setPartKind = useCallback((fileId: string, partId: string, kind: BaseKind | null) => {
    patchFile(fileId, (f) => ({
      ...f,
      parts: f.parts.map((p) => (p.id === partId ? resolvePart({ ...p, kind }, f.file.name) : p)),
    }));
  }, [patchFile]);

  const readyFiles = files.filter((f) => f.status === "ready");
  const readyParts = readyFiles.flatMap((f) => f.parts.filter((p) => p.kind && !p.error));
  const reading = files.some((f) => f.status === "reading");

  const runApply = useCallback(async (choice: DuplicateChoice) => {
    const targets = files.filter((f) => f.status === "ready");
    if (targets.length === 0) return;
    setApplying(true);
    try {
      const result = await applyIntake(targets, choice);
      setFiles((prev) => prev.map((f) => (f.status === "ready" && targets.includes(f) ? { ...f, status: "applied" } : f)));
      if (result.applied.length === 0) {
        toast.info("Nada novo para aplicar", { description: result.skipped.map((s) => s.reason).join(" · ") });
        return;
      }
      const summary = result.applied.map((a) => `${KIND_LABEL[a.kind]} ${monthRangeLabel(a.months)}`).join(" · ");
      toast.success("Bases atualizadas", {
        description: result.saved > 0
          ? `${summary}. Guardadas neste computador em ${formatBytes(result.savedBytes)}.`
          : summary,
      });
      result.saveErrors.forEach((e) => toast.error(`Não foi possível guardar: ${e}`));
      result.skipped.forEach((s) => toast.info(s.reason));
      onApplied?.();
    } catch (err) {
      toast.error("Falha ao aplicar as bases", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setApplying(false);
    }
  }, [files, onApplied]);

  const requestApply = useCallback(() => {
    const duplicates = findDuplicates(files.filter((f) => f.status === "ready"));
    if (duplicates.length === 0) return runApply("replace");
    const current = getDuplicatePolicy();
    if (current !== "ask") return runApply(current);
    setDupDialog(duplicates);
  }, [files, runApply]);

  // Aviso ao sair da aba com arquivos lidos e não aplicados.
  const setGuardPending = useUploadGuard((s) => s.setPending);
  const setGuardApply = useUploadGuard((s) => s.setApply);
  useEffect(() => {
    setGuardPending(readyFiles.length);
    setGuardApply(readyFiles.length > 0 ? () => runApply(getDuplicatePolicy() === "keep" ? "keep" : "replace") : null);
  }, [readyFiles.length, runApply, setGuardApply, setGuardPending]);
  useEffect(() => () => {
    setGuardPending(0);
    setGuardApply(null);
  }, [setGuardApply, setGuardPending]);

  const resetPolicy = () => {
    setDuplicatePolicy("ask");
    setPolicyState("ask");
    toast.success("O Omni4 volta a perguntar quando houver meses repetidos.");
  };

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={0}
        aria-label="Escolher arquivos de base"
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "group relative cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed border-border/60 bg-secondary/20 px-6 py-7 transition-all",
          "hover:border-primary/50 hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          drag && "scale-[1.005] border-primary bg-primary/10",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => e.target.files && void addFiles(e.target.files)}
        />
        <div className="flex flex-col items-center gap-4 text-center md:flex-row md:text-left">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
            <Layers className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold tracking-tight">Solte a Base One aqui</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Real, Budget e Ruptura num arquivo só. O Omni4 reconhece cada aba pelo conteúdo — nome e ordem das abas não importam.
              Também aceita o CSV do KE30 ou uma planilha avulsa.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-center gap-1.5">
            {(["real", "budget", "ruptura"] as const).map((kind) => {
              const { icon: Icon, text, bg } = KIND_STYLE[kind];
              return (
                <span key={kind} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold", bg, text)}>
                  <Icon className="h-3 w-3" /> {KIND_LABEL[kind]}
                </span>
              );
            })}
          </div>
        </div>
        <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground md:justify-start md:pl-[72px]">
          <UploadIcon className="h-3.5 w-3.5" /> Arraste ou clique · .xlsx, .xls, .xlsm ou .csv
        </div>
      </div>

      {files.map((entry) => (
        <IntakeFileCard
          key={entry.id}
          entry={entry}
          loaded={loaded}
          onRemove={() => setFiles((prev) => prev.filter((f) => f.id !== entry.id))}
          onKindChange={(partId, kind) => setPartKind(entry.id, partId, kind)}
        />
      ))}

      {(readyFiles.length > 0 || policy !== "ask") && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/60 px-4 py-3">
          <div className="text-[11px] text-muted-foreground">
            {readyFiles.length > 0 ? (
              <>
                <span className="font-medium text-foreground">
                  {readyParts.length} base{readyParts.length === 1 ? "" : "s"} pronta{readyParts.length === 1 ? "" : "s"}
                </span>{" "}
                para aplicar. Nada muda no app até você clicar em Aplicar.
              </>
            ) : (
              "Nenhum arquivo aguardando."
            )}
            {policy !== "ask" && (
              <span className="ml-1">
                Meses repetidos: <span className="font-medium text-foreground">{policy === "replace" ? "sempre substituir" : "sempre manter os atuais"}</span> ·{" "}
                <button type="button" className="font-medium text-primary hover:underline" onClick={resetPolicy}>
                  voltar a perguntar
                </button>
              </span>
            )}
          </div>
          {readyFiles.length > 0 && (
            <Button size="sm" onClick={requestApply} disabled={applying || reading || readyParts.length === 0} className="h-8 gap-1.5">
              {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Aplicar
            </Button>
          )}
        </div>
      )}

      <DuplicateDialog
        duplicates={dupDialog}
        onCancel={() => setDupDialog(null)}
        onChoose={(choice, remember) => {
          setDupDialog(null);
          if (remember) {
            setDuplicatePolicy(choice);
            setPolicyState(choice);
          }
          void runApply(choice);
        }}
      />
    </div>
  );
}

function IntakeFileCard({
  entry,
  loaded,
  onRemove,
  onKindChange,
}: {
  entry: IntakeFile;
  loaded: Record<BaseKind, Set<string>>;
  onRemove: () => void;
  onKindChange: (partId: string, kind: BaseKind | null) => void;
}) {
  const storedBytes = entry.parts.reduce((sum, p) => sum + (p.kind && p.kind === p.detected ? p.stored?.byteLength ?? 0 : 0), 0);
  const recognized = entry.parts.filter((p) => p.kind).length;
  const isWorkbook = entry.parts.some((p) => p.sheetName !== null) || !entry.file.name.toLowerCase().endsWith(".csv");

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/50">
      <div className="flex items-center gap-3 border-b border-border/40 px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary/60 text-muted-foreground">
          {entry.status === "reading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold">{entry.file.name}</span>
            <span className="text-[11px] text-muted-foreground">{formatBytes(entry.file.size)}</span>
            <FileStatus entry={entry} recognized={recognized} />
          </div>
          {entry.status === "reading" && (
            <div className="mt-1.5 max-w-md">
              <Progress value={entry.progress?.fraction == null ? undefined : entry.progress.fraction * 100} className="h-1" />
              <div className="mt-1 text-[10px] text-muted-foreground">{entry.progress?.label ?? "Lendo"}…</div>
            </div>
          )}
          {entry.status === "error" && <div className="mt-0.5 text-[11px] text-destructive">{entry.error}</div>}
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          disabled={entry.status === "reading"}
          aria-label={`Tirar ${entry.file.name} da revisão`}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {entry.parts.length > 0 && (
        <ul className="divide-y divide-border/30">
          {entry.parts.map((part) => (
            <PartRow
              key={part.id}
              part={part}
              applied={entry.status === "applied"}
              loaded={part.kind ? loaded[part.kind] : null}
              editable={entry.status === "ready" && part.sheetName !== null}
              onKindChange={(kind) => onKindChange(part.id, kind)}
            />
          ))}
        </ul>
      )}

      {isWorkbook && storedBytes > 0 && entry.status !== "error" && (
        <div className="flex items-center gap-2 border-t border-border/30 bg-secondary/20 px-4 py-2 text-[11px] text-muted-foreground">
          <Zap className="h-3.5 w-3.5 text-primary" />
          Guardado no formato compacto do Omni4: {formatBytes(entry.file.size)} → {" "}
          <span className="font-medium text-foreground">{formatBytes(storedBytes)}</span>
          {entry.file.size / storedBytes >= 2 && <span>({formatNum(entry.file.size / storedBytes, 0)}× menor, abre em segundos)</span>}
        </div>
      )}
    </div>
  );
}

function FileStatus({ entry, recognized }: { entry: IntakeFile; recognized: number }) {
  if (entry.status === "reading") return null;
  if (entry.status === "error") {
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-destructive"><AlertCircle className="h-3 w-3" /> Erro</span>;
  }
  if (entry.status === "applied") {
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-500"><CheckCircle2 className="h-3 w-3" /> Aplicado</span>;
  }
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
      {recognized === 0 ? "Nenhuma base reconhecida" : `${recognized} base${recognized === 1 ? "" : "s"} reconhecida${recognized === 1 ? "" : "s"}`}
    </span>
  );
}

function PartRow({
  part,
  applied,
  loaded,
  editable,
  onKindChange,
}: {
  part: IntakePart;
  applied: boolean;
  loaded: Set<string> | null;
  editable: boolean;
  onKindChange: (kind: BaseKind | null) => void;
}) {
  const style = part.kind ? KIND_STYLE[part.kind] : null;
  const Icon = style?.icon ?? EyeOff;
  const repeated = loaded ? part.months.filter((m) => loaded.has(m)) : [];
  const fresh = part.months.length - repeated.length;
  const manual = part.kind !== part.detected;

  const volume = part.real
    ? `${formatNum(part.real.rows.length, 0)} linhas`
    : part.budget
      ? `${formatNum(part.budget.rows.length, 0)} linhas`
      : part.ruptura && part.kind === "ruptura"
        ? `${formatNum(part.ruptura.quality.rawRows, 0)} respostas · ${formatNum(part.ruptura.cells.month.length, 0)} avaliações`
        : `${formatNum(part.dataRows, 0)} linhas`;

  return (
    <li className={cn("flex flex-wrap items-start gap-3 px-4 py-3", !part.kind && "opacity-70")}>
      <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", style ? cn(style.bg, style.text) : "bg-muted/40 text-muted-foreground")}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-semibold">{part.kind ? KIND_LABEL[part.kind] : "Ignorada"}</span>
          {part.sheetName !== null && (
            <span className="truncate text-[11px] text-muted-foreground">aba “{part.sheetName}”</span>
          )}
          {part.kind && !manual && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={cn(
                  "cursor-help rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                  part.confidence === "alta" ? "bg-emerald-500/10 text-emerald-500"
                    : part.confidence === "media" ? "bg-warning/15 text-warning"
                      : "bg-destructive/10 text-destructive",
                )}>
                  {CONFIDENCE_LABEL[part.confidence]}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">
                Reconhecida por: {part.evidence.join(" · ")}
              </TooltipContent>
            </Tooltip>
          )}
          {manual && part.kind && (
            <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              escolhida por você
            </span>
          )}
        </div>

        {part.error ? (
          <div className="mt-0.5 text-[11px] text-destructive">{part.error}</div>
        ) : part.kind ? (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">{monthRangeLabel(part.months)}</span>
            {part.months.length > 1 && <span>{part.months.length} meses</span>}
            <span>· {volume}</span>
            {!applied && repeated.length > 0 && (
              <span className="rounded-md bg-warning/10 px-1.5 py-0.5 font-medium text-warning">
                {repeated.length === part.months.length
                  ? `${repeated.length === 1 ? monthKeyLabel(repeated[0]) : `${repeated.length} meses`} já no app`
                  : `${repeated.length} mês(es) já no app · ${fresh} novo(s)`}
              </span>
            )}
            {applied && <span className="inline-flex items-center gap-1 text-emerald-500"><CheckCircle2 className="h-3 w-3" /> aplicada</span>}
          </div>
        ) : (
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {part.classification?.candidates.length
              ? "Não deu para ter certeza do que é esta aba — escolha o tipo ao lado se ela for uma base."
              : "Não parece Real, Budget nem Ruptura. Fica de fora."}
          </div>
        )}
      </div>
      {editable && (part.classification?.candidates.length ?? 0) > 0 && (
        <Select value={part.kind ?? "none"} onValueChange={(v) => onKindChange(v === "none" ? null : (v as BaseKind))}>
          <SelectTrigger className="h-7 w-[120px] shrink-0 text-xs" aria-label={`Tipo da aba ${part.sheetName}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="real">Real</SelectItem>
            <SelectItem value="budget">Budget</SelectItem>
            <SelectItem value="ruptura">Ruptura</SelectItem>
            <SelectItem value="none">Ignorar</SelectItem>
          </SelectContent>
        </Select>
      )}
    </li>
  );
}

function DuplicateDialog({
  duplicates,
  onCancel,
  onChoose,
}: {
  duplicates: DuplicateInfo[] | null;
  onCancel: () => void;
  onChoose: (choice: DuplicateChoice, remember: boolean) => void;
}) {
  const [remember, setRemember] = useState(false);
  // Mantém a lista durante a animação de fechar (senão a janela encolhe).
  const [shown, setShown] = useState<DuplicateInfo[]>([]);
  useEffect(() => {
    if (!duplicates) return;
    setRemember(false);
    setShown(duplicates);
  }, [duplicates]);

  return (
    <AlertDialog open={duplicates !== null} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Alguns meses já estão no Omni4</AlertDialogTitle>
          <AlertDialogDescription>
            Os meses novos entram de qualquer jeito. Escolha o que fazer com os que já foram carregados:
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="space-y-1.5">
          {(duplicates ?? shown).map((d) => {
            const { icon: Icon, text, bg } = KIND_STYLE[d.kind];
            return (
              <li key={d.part.id} className="flex items-center gap-2.5 rounded-lg border border-border/50 bg-secondary/30 px-3 py-2">
                <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md", bg, text)}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="text-sm font-medium">{KIND_LABEL[d.kind]}</span>
                <span className="ml-auto text-right text-xs text-muted-foreground">
                  {monthRangeLabel(d.months)}
                  {d.months.length > 1 && ` · ${d.months.length} meses`}
                </span>
              </li>
            );
          })}
        </ul>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1 text-sm">
          <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} className="mt-0.5" />
          <span>
            Não perguntar de novo
            <span className="block text-[11px] text-muted-foreground">
              Usa esta escolha todo mês. Dá para voltar a perguntar aqui na aba Bases.
            </span>
          </span>
        </label>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel onClick={onCancel}>Cancelar</AlertDialogCancel>
          <Button variant="outline" onClick={() => onChoose("keep", remember)}>Manter os atuais</Button>
          <Button onClick={() => onChoose("replace", remember)}>Substituir</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
