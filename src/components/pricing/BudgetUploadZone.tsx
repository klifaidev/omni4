import { useCallback, useMemo, useRef, useState } from "react";
import { Upload as UploadIcon, FileSpreadsheet, AlertCircle } from "lucide-react";
import { parseBudgetFile } from "@/lib/budget";
import { useBudget } from "@/store/budget";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { monthLabel } from "@/lib/format";

export function BudgetUploadZone({ compact = false }: { compact?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const addBudget = useBudget((s) => s.addBudget);
  const budgetRows = useBudget((s) => s.rows);
  const existingMonths = useMemo(() => new Set(budgetRows.map((r) => r.periodo)), [budgetRows]);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      setBusy(true);
      try {
        for (const file of Array.from(files)) {
          const lower = file.name.toLowerCase();
          if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
            toast.error(`${file.name}: apenas .xlsx/.xls são aceitos para Budget.`);
            continue;
          }
          const parsed = await parseBudgetFile(file);
          if (parsed.rows.length === 0) {
            const msg = parsed.warnings[0] ?? "nenhuma linha válida.";
            toast.error(`${parsed.file.name}: ${msg}`, { duration: 8000 });
            continue;
          }
          parsed.warnings.forEach((w) => toast.warning(`${parsed.file.name}: ${w}`));

          const dup = parsed.file.months.filter((m) => existingMonths.has(m));
          let replace = false;
          if (dup.length > 0) {
            const labels = dup
              .map((p) => {
                const [mes, ano] = p.split(".").map((x) => parseInt(x, 10));
                return monthLabel(mes, ano);
              })
              .join(", ");
            replace = window.confirm(
              `O arquivo "${parsed.file.name}" contém meses já carregados no Budget (${labels}). Deseja sobrescrever?`,
            );
            if (!replace) continue;
          }
          addBudget(parsed.rows, parsed.file, replace);
          toast.success(
            `Budget — ${parsed.file.name}: ${parsed.rows.length.toLocaleString("pt-BR")} linhas em ${parsed.file.months.length} mês(es).`,
          );
        }
      } catch (e) {
        console.error(e);
        toast.error("Falha ao processar arquivo de Budget.");
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [addBudget, existingMonths],
  );

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "group cursor-pointer rounded-2xl border-2 border-dashed border-border/60 bg-secondary/20 transition-all",
        "hover:border-accent/60 hover:bg-accent/5",
        drag && "border-accent bg-accent/10 scale-[1.01]",
        compact ? "p-6" : "p-12",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />
      <div className="flex flex-col items-center gap-3 text-center">
        <div
          className={cn(
            "flex items-center justify-center rounded-2xl bg-accent/10 transition-all group-hover:bg-accent/20",
            compact ? "h-12 w-12" : "h-16 w-16",
          )}
        >
          {busy ? (
            <AlertCircle className="h-6 w-6 animate-pulse text-accent" />
          ) : (
            <UploadIcon className={cn("text-accent", compact ? "h-5 w-5" : "h-7 w-7")} />
          )}
        </div>
        <div>
          <div className={cn("font-medium", compact ? "text-sm" : "text-base")}>
            {busy ? "Processando..." : "Arraste o Excel do Budget ou clique"}
          </div>
          {!compact && (
            <div className="mt-1 text-xs text-muted-foreground">
              Suporta .xlsx — colunas: CANAL, Sku, data, VOLUME, RECEITA, CM, CPV.
            </div>
          )}
        </div>
        {!compact && (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Categoria/marca/faixa de peso são puxados do De Para por SKU</span>
          </div>
        )}
      </div>
    </div>
  );
}
