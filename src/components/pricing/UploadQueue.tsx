import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUploadGuard } from "@/store/uploadGuard";
import {
  Upload as UploadIcon,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Database,
  Target,
  Play,
  Trash2,
} from "lucide-react";
import { parseCsvFile, type ParsedCsv } from "@/lib/csv";
import { parseBudgetFile, type ParsedBudget } from "@/lib/budget";
import { usePricing } from "@/store/pricing";
import { useBudget } from "@/store/budget";
import { useExistingPeriods } from "@/store/selectors";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { monthLabel } from "@/lib/format";

type Kind = "real" | "budget";
type Status = "parsing" | "ready" | "error" | "applied";

interface QueueItem {
  id: string;
  kind: Kind;
  fileName: string;
  status: Status;
  errorMsg?: string;
  warnings: string[];
  rowCount: number;
  months: string[];
  duplicateMonths: string[];
  // Conteúdo parseado pendente de commit:
  realPayload?: ParsedCsv;
  budgetPayload?: ParsedBudget;
}

let _idSeq = 0;
const nextId = () => `q_${Date.now()}_${++_idSeq}`;

export function UploadQueue() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);

  const realInput = useRef<HTMLInputElement>(null);
  const budgetInput = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState<Kind | null>(null);

  const addParsedReal = usePricing((s) => s.addParsed);
  const addBudget = useBudget((s) => s.addBudget);
  const realExisting = useExistingPeriods();
  const budgetRows = useBudget((s) => s.rows);
  const budgetExisting = useMemo(() => new Set(budgetRows.map((r) => r.periodo)), [budgetRows]);

  const enqueueFiles = useCallback(
    async (kind: Kind, files: FileList | File[]) => {
      setBusy(true);
      const list = Array.from(files);
      // Cria placeholders já com status "parsing"
      const placeholders: QueueItem[] = list.map((f) => ({
        id: nextId(),
        kind,
        fileName: f.name,
        status: "parsing",
        warnings: [],
        rowCount: 0,
        months: [],
        duplicateMonths: [],
      }));
      setItems((prev) => [...prev, ...placeholders]);

      // Processa em sequência para não travar a UI
      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        const placeholder = placeholders[i];
        try {
          if (kind === "real") {
            if (!file.name.toLowerCase().endsWith(".csv")) {
              throw new Error("Apenas .csv aceito para Base Real.");
            }
            const parsed = await parseCsvFile(file);
            if (parsed.rows.length === 0) {
              throw new Error(parsed.warnings[0] ?? "nenhuma linha válida.");
            }
            const dup = parsed.file.months.filter((m) => realExisting.has(m));
            setItems((prev) =>
              prev.map((it) =>
                it.id === placeholder.id
                  ? {
                      ...it,
                      status: "ready",
                      warnings: parsed.warnings,
                      rowCount: parsed.rows.length,
                      months: parsed.file.months,
                      duplicateMonths: dup,
                      realPayload: parsed,
                    }
                  : it,
              ),
            );
          } else {
            const lower = file.name.toLowerCase();
            if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
              throw new Error("Apenas .xlsx/.xls aceito para Budget.");
            }
            const parsed = await parseBudgetFile(file);
            if (parsed.rows.length === 0) {
              throw new Error(parsed.warnings[0] ?? "nenhuma linha válida.");
            }
            const dup = parsed.file.months.filter((m) => budgetExisting.has(m));
            setItems((prev) =>
              prev.map((it) =>
                it.id === placeholder.id
                  ? {
                      ...it,
                      status: "ready",
                      warnings: parsed.warnings,
                      rowCount: parsed.rows.length,
                      months: parsed.file.months,
                      duplicateMonths: dup,
                      budgetPayload: parsed,
                    }
                  : it,
              ),
            );
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Falha ao processar arquivo.";
          setItems((prev) =>
            prev.map((it) =>
              it.id === placeholder.id
                ? { ...it, status: "error", errorMsg: msg }
                : it,
            ),
          );
        }
      }
      setBusy(false);
      if (realInput.current) realInput.current.value = "";
      if (budgetInput.current) budgetInput.current.value = "";
    },
    [realExisting, budgetExisting],
  );

  const removeItem = (id: string) =>
    setItems((prev) => prev.filter((it) => it.id !== id));

  const clearQueue = () => setItems((prev) => prev.filter((it) => it.status === "applied"));

  const readyItems = items.filter((it) => it.status === "ready");
  const errorCount = items.filter((it) => it.status === "error").length;
  const parsingCount = items.filter((it) => it.status === "parsing").length;

  // Conflitos: meses já presentes no store
  const allDuplicateMonths = readyItems.flatMap((it) =>
    it.duplicateMonths.map((m) => ({ kind: it.kind, periodo: m })),
  );
  const hasDuplicates = allDuplicateMonths.length > 0;

  const applyAll = async () => {
    if (readyItems.length === 0) return;
    let confirmReplace = false;
    if (hasDuplicates) {
      const labels = Array.from(new Set(allDuplicateMonths.map((d) => `${d.kind}:${formatPeriodLabel(d.periodo)}`))).join(", ");
      confirmReplace = window.confirm(
        `Alguns meses já estão carregados (${labels}). Sobrescrever?`,
      );
      if (!confirmReplace) return;
    }
    setApplying(true);
    try {
      for (const it of readyItems) {
        if (it.kind === "real" && it.realPayload) {
          addParsedReal(
            it.realPayload.rows,
            it.realPayload.file,
            it.duplicateMonths.length > 0 ? confirmReplace : false,
            it.realPayload.missing,
          );
        } else if (it.kind === "budget" && it.budgetPayload) {
          addBudget(
            it.budgetPayload.rows,
            it.budgetPayload.file,
            it.duplicateMonths.length > 0 ? confirmReplace : false,
          );
        }
      }
      const counts = readyItems.reduce(
        (acc, it) => {
          acc[it.kind]++;
          acc.rows += it.rowCount;
          return acc;
        },
        { real: 0, budget: 0, rows: 0 },
      );
      toast.success(
        `Aplicado: ${counts.real} arquivo(s) Real + ${counts.budget} Budget · ${counts.rows.toLocaleString("pt-BR")} linhas.`,
      );
      setItems((prev) =>
        prev.map((it) =>
          it.status === "ready" ? { ...it, status: "applied" } : it,
        ),
      );
    } finally {
      setApplying(false);
    }
  };

  // Expose pending state + apply handler globally for navigation guard
  const setGuardPending = useUploadGuard((s) => s.setPending);
  const setGuardApply = useUploadGuard((s) => s.setApply);
  useEffect(() => {
    setGuardPending(readyItems.length);
    setGuardApply(readyItems.length > 0 ? applyAll : null);
  });
  useEffect(() => {
    return () => {
      setGuardPending(0);
      setGuardApply(null);
    };
  }, [setGuardPending, setGuardApply]);

  return (
    <div className="space-y-4">
      {/* Drop zones lado a lado */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DropZone
          kind="real"
          icon={Database}
          title="Adicionar arquivos Real"
          subtitle="Arraste CSVs ou clique"
          accent="primary"
          accept=".csv"
          drag={drag === "real"}
          onDragChange={(d) => setDrag(d ? "real" : null)}
          inputRef={realInput}
          busy={busy}
          onFiles={(f) => enqueueFiles("real", f)}
        />
        <DropZone
          kind="budget"
          icon={Target}
          title="Adicionar arquivos Budget"
          subtitle="Arraste XLSX ou clique"
          accent="accent"
          accept=".xlsx,.xls"
          drag={drag === "budget"}
          onDragChange={(d) => setDrag(d ? "budget" : null)}
          inputRef={budgetInput}
          busy={busy}
          onFiles={(f) => enqueueFiles("budget", f)}
        />
      </div>

      {/* Fila */}
      {items.length > 0 && (
        <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Fila de upload</h3>
              <span className="text-[11px] text-muted-foreground">
                {items.length} arquivo{items.length > 1 ? "s" : ""}
                {parsingCount > 0 && ` · ${parsingCount} processando`}
                {readyItems.length > 0 && ` · ${readyItems.length} pronto${readyItems.length > 1 ? "s" : ""}`}
                {errorCount > 0 && ` · ${errorCount} com erro`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {items.some((it) => it.status === "applied" || it.status === "error") && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
                  onClick={clearQueue}
                >
                  <Trash2 className="mr-1 h-3 w-3" />
                  Limpar concluídos
                </Button>
              )}
              <Button
                size="sm"
                onClick={applyAll}
                disabled={readyItems.length === 0 || busy || applying}
                className="h-8 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {applying ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                Aplicar {readyItems.length > 0 ? `(${readyItems.length})` : "tudo"}
              </Button>
            </div>
          </div>

          {parsingCount > 0 && (
            <div className="mb-3">
              <Progress value={undefined} className="h-1" />
              <p className="mt-1 text-[10px] text-muted-foreground">
                Processando arquivos… o app só será atualizado quando você clicar em Aplicar.
              </p>
            </div>
          )}

          <ul className="space-y-2">
            {items.map((it) => (
              <QueueRow key={it.id} item={it} onRemove={() => removeItem(it.id)} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function DropZone({
  kind,
  icon: Icon,
  title,
  subtitle,
  accent,
  accept,
  drag,
  onDragChange,
  inputRef,
  busy,
  onFiles,
}: {
  kind: Kind;
  icon: typeof Database;
  title: string;
  subtitle: string;
  accent: "primary" | "accent";
  accept: string;
  drag: boolean;
  onDragChange: (d: boolean) => void;
  inputRef: React.RefObject<HTMLInputElement>;
  busy: boolean;
  onFiles: (f: FileList | File[]) => void;
}) {
  const accentClasses =
    accent === "primary"
      ? "hover:border-primary/50 hover:bg-primary/5 [&.is-drag]:border-primary [&.is-drag]:bg-primary/10 [&_.icon-bg]:bg-primary/10 [&_.icon-bg]:group-hover:bg-primary/20 [&_.icon]:text-primary"
      : "hover:border-accent/50 hover:bg-accent/5 [&.is-drag]:border-accent [&.is-drag]:bg-accent/10 [&_.icon-bg]:bg-accent/10 [&_.icon-bg]:group-hover:bg-accent/20 [&_.icon]:text-accent";

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); onDragChange(true); }}
      onDragLeave={() => onDragChange(false)}
      onDrop={(e) => {
        e.preventDefault();
        onDragChange(false);
        if (e.dataTransfer.files) onFiles(e.dataTransfer.files);
      }}
      onClick={() => !busy && inputRef.current?.click()}
      className={cn(
        "group cursor-pointer rounded-2xl border-2 border-dashed border-border/60 bg-secondary/20 p-6 transition-all",
        accentClasses,
        drag && "is-drag scale-[1.01]",
        busy && "cursor-wait opacity-70",
      )}
      data-kind={kind}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={(e) => e.target.files && onFiles(e.target.files)}
      />
      <div className="flex items-center gap-3">
        <div className="icon-bg flex h-12 w-12 items-center justify-center rounded-xl transition-all">
          {busy ? (
            <Loader2 className="icon h-5 w-5 animate-spin" />
          ) : (
            <Icon className="icon h-5 w-5" />
          )}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-[11px] text-muted-foreground">{subtitle}</div>
        </div>
        <div className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground">
          <UploadIcon className="h-3.5 w-3.5" />
          {accept}
        </div>
      </div>
    </div>
  );
}

function QueueRow({ item, onRemove }: { item: QueueItem; onRemove: () => void }) {
  const Icon =
    item.status === "parsing" ? Loader2
    : item.status === "ready" ? FileSpreadsheet
    : item.status === "applied" ? CheckCircle2
    : AlertCircle;

  const colorClass =
    item.status === "ready" ? "text-primary"
    : item.status === "applied" ? "text-emerald-500"
    : item.status === "error" ? "text-destructive"
    : "text-muted-foreground";

  const bgClass =
    item.kind === "real" ? "border-primary/20 bg-primary/[0.04]" : "border-accent/20 bg-accent/[0.04]";

  return (
    <li className={cn("rounded-lg border px-3 py-2.5", bgClass)}>
      <div className="flex items-start gap-3">
        <Icon
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0",
            colorClass,
            item.status === "parsing" && "animate-spin",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">{item.fileName}</span>
            <span className={cn(
              "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
              item.kind === "real" ? "bg-primary/15 text-primary" : "bg-accent/15 text-accent",
            )}>
              {item.kind === "real" ? "Real" : "Budget"}
            </span>
            <span className={cn("shrink-0 text-[10px] font-medium uppercase tracking-wider", colorClass)}>
              {labelForStatus(item.status)}
            </span>
          </div>
          {item.status === "parsing" && (
            <div className="mt-1.5">
              <Progress value={undefined} className="h-1" />
            </div>
          )}
          {item.status === "ready" && (
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {item.rowCount.toLocaleString("pt-BR")} linhas · {item.months.length} mês(es): {item.months.map(formatPeriodLabel).join(", ")}
              {item.duplicateMonths.length > 0 && (
                <span className="ml-1 font-medium text-warning">
                  · {item.duplicateMonths.length} mês(es) já existe(m) — será sobrescrito
                </span>
              )}
            </div>
          )}
          {item.status === "applied" && (
            <div className="mt-0.5 text-[11px] text-emerald-500/80">
              Aplicado: {item.rowCount.toLocaleString("pt-BR")} linhas em {item.months.length} mês(es).
            </div>
          )}
          {item.status === "error" && (
            <div className="mt-0.5 text-[11px] text-destructive">
              {item.errorMsg ?? "Falha ao processar."}
            </div>
          )}
          {item.warnings.length > 0 && item.status === "ready" && (
            <ul className="mt-1 space-y-0.5">
              {item.warnings.slice(0, 3).map((w, i) => (
                <li key={i} className="text-[10px] text-warning">⚠ {w}</li>
              ))}
            </ul>
          )}
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          aria-label="Remover da fila"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </li>
  );
}

function labelForStatus(s: Status) {
  switch (s) {
    case "parsing": return "Processando";
    case "ready":   return "Pronto";
    case "applied": return "Aplicado";
    case "error":   return "Erro";
  }
}

function formatPeriodLabel(periodo: string) {
  const [mes, ano] = periodo.split(".").map((x) => parseInt(x, 10));
  return monthLabel(mes, ano);
}
