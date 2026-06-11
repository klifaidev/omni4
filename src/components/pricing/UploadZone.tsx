import { useCallback, useRef, useState } from "react";
import { Upload as UploadIcon, FileSpreadsheet, AlertCircle, Loader2 } from "lucide-react";
import { parseCsvFile } from "@/lib/csv";
import { usePricing } from "@/store/pricing";
import { useExistingPeriods } from "@/store/selectors";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { monthLabel } from "@/lib/format";

export function UploadZone({ compact = false }: { compact?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const addParsed = usePricing((s) => s.addParsed);
  const setParsingStart = usePricing((s) => s.setParsingStart);
  const setParsingEnd = usePricing((s) => s.setParsingEnd);
  const parsing = usePricing((s) => s.parsing);
  const existingMonths = useExistingPeriods();

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      setBusy(true);
      setParsingStart();
      const toastId = toast.loading("Processando CSV...");
      let totalRows = 0;
      let hadError = false;
      try {
        for (const file of Array.from(files)) {
          if (!file.name.toLowerCase().endsWith(".csv")) {
            toast.error(`${file.name}: apenas arquivos .csv são aceitos.`);
            continue;
          }
          const parsed = await parseCsvFile(file);
          if (parsed.rows.length === 0) {
            const msg = parsed.warnings[0] ?? "nenhuma linha válida encontrada.";
            toast.error(`${parsed.file.name}: ${msg}`, { duration: 8000 });
            continue;
          }
          if (parsed.warnings.length) {
            parsed.warnings.forEach((w) => toast.warning(`${parsed.file.name}: ${w}`));
          }
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
              `O arquivo "${parsed.file.name}" contém meses já carregados (${labels}). Deseja sobrescrever?`,
            );
            if (!replace) continue;
          }
          addParsed(parsed.rows, parsed.file, replace, parsed.missing);
          totalRows += parsed.rows.length;
          const m = parsed.missing;
          const missingTotal = m.skus.length + m.canais.length + m.regioes.length + m.ufs.length;
          toast.success(
            `${parsed.file.name}: ${parsed.rows.length.toLocaleString("pt-BR")} linhas em ${parsed.file.months.length} mês(es).`,
          );
          if (missingTotal > 0) {
            toast.warning(
              `${missingTotal} valor(es) sem mapeamento no De Para. Veja o alerta no topo.`,
              { duration: 8000 },
            );
          }
        }
      } catch (e) {
        console.error(e);
        hadError = true;
        toast.error("Falha ao processar arquivo.");
      } finally {
        toast.dismiss(toastId);
        if (hadError) {
          toast.error("Falha no parsing.");
        } else if (totalRows > 0) {
          toast.success(`${totalRows.toLocaleString("pt-BR")} linhas carregadas.`);
        }
        setBusy(false);
        setParsingEnd();
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [addParsed, existingMonths, setParsingStart, setParsingEnd],
  );

  const disabled = parsing || busy;

  return (
    <div
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        if (disabled) return;
        e.preventDefault();
        setDrag(false);
        if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
      }}
      onClick={() => {
        if (disabled) return;
        inputRef.current?.click();
      }}
      aria-disabled={disabled}
      className={cn(
        "group relative rounded-2xl border-2 border-dashed border-border/60 bg-secondary/20 transition-all",
        disabled
          ? "cursor-not-allowed opacity-70"
          : "cursor-pointer hover:border-primary/50 hover:bg-primary/5",
        drag && !disabled && "border-primary bg-primary/10 scale-[1.01]",
        compact ? "p-6" : "p-12",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />
      {disabled && (
        <div className="pointer-events-auto absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-2xl bg-background/70 backdrop-blur-sm">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Processando arquivo...</span>
        </div>
      )}
      <div className="flex flex-col items-center gap-3 text-center">
        <div
          className={cn(
            "flex items-center justify-center rounded-2xl bg-primary/10 transition-all group-hover:bg-primary/20",
            compact ? "h-12 w-12" : "h-16 w-16",
          )}
        >
          {busy ? (
            <AlertCircle className="h-6 w-6 animate-pulse text-primary" />
          ) : (
            <UploadIcon className={cn("text-primary", compact ? "h-5 w-5" : "h-7 w-7")} />
          )}
        </div>
        <div>
          <div className={cn("font-medium", compact ? "text-sm" : "text-base")}>
            {busy ? "Processando..." : "Arraste seus CSVs ou clique para selecionar"}
          </div>
          {!compact && (
            <div className="mt-1 text-xs text-muted-foreground">
              Suporta CSV BR (separador “;”, decimal “,”) e internacional. Múltiplos meses por upload.
            </div>
          )}
        </div>
        {!compact && (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Períodos no formato 005.2025</span>
          </div>
        )}
      </div>
    </div>
  );
}
