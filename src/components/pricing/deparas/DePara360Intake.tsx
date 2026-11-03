// De/Para 360 na aba Bases, dentro do cartão de De/Paras: um arquivo com todos
// os De/Paras. Baixa-se depois de corrigir as pendências e manda-se para o
// time; quem recebe anexa aqui, na mesma área de soltar da Base One, confere o
// que muda e aplica.
import { useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  EyeOff,
  FileSpreadsheet,
  Layers,
  Loader2,
  Network,
  Package,
  Play,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatNum } from "@/lib/format";
import { DEPARA_MAPS, type DeParaMapId } from "@/lib/deparaHealth";
import { parseDePara360, planDePara360, type DePara360, type DePara360Plan } from "@/lib/depara360";
import { useBasesLocais } from "@/hooks/use-bases-locais";
import { FileDropCard } from "@/components/pricing/bases/FileDropCard";
import { applyDePara360 } from "./deparaActions";

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${formatNum(bytes / (1024 * 1024), 1)} MB`;
  return `${formatNum(bytes / 1024, 0)} KB`;
}

function summary360(counts: DePara360Plan["counts"]): string {
  const parts: string[] = [];
  if (counts.sku) parts.push(`${formatNum(counts.sku)} SKU${counts.sku === 1 ? "" : "s"} na hierarquia`);
  if (counts.comercial) parts.push(`${formatNum(counts.comercial)} valor${counts.comercial === 1 ? "" : "es"} comercia${counts.comercial === 1 ? "l" : "is"}`);
  if (counts.inovacao) parts.push(`${formatNum(counts.inovacao)} SKU${counts.inovacao === 1 ? "" : "s"} em Inovação`);
  return parts.join(" · ");
}

function changesFor(plan: DePara360Plan, id: DeParaMapId): number {
  if (id === "hierarquia") return plan.counts.sku;
  if (id === "inovacao") return plan.counts.inovacao;
  return Object.keys(plan.comercial[id]).length;
}

interface Entry360 {
  name: string;
  size: number;
  status: "reading" | "ready" | "applying" | "applied" | "error";
  file?: DePara360;
  plan?: DePara360Plan;
  undo?: () => Promise<void>;
  error?: string;
}

const CHIPS_360 = [
  { label: "Produto", icon: Package, className: "bg-primary/10 text-primary" },
  { label: "Inovação", icon: Sparkles, className: "bg-accent/10 text-accent" },
  { label: "Comercial", icon: Network, className: "bg-destructive/10 text-destructive" },
] as const;

export function DePara360Intake() {
  const basesLocais = useBasesLocais();
  const [entry, setEntry] = useState<Entry360 | null>(null);
  const busy = entry?.status === "reading" || entry?.status === "applying";

  const read = async (files: File[]) => {
    const selected = files.find((f) => /\.(xlsx|xls)$/i.test(f.name));
    if (!selected) {
      toast.error("Formato não suportado. Use .xlsx ou .xls.");
      return;
    }
    setEntry({ name: selected.name, size: selected.size, status: "reading" });
    try {
      const file = await parseDePara360(selected);
      setEntry({ name: selected.name, size: selected.size, status: "ready", file, plan: planDePara360(file) });
    } catch (err) {
      setEntry({
        name: selected.name,
        size: selected.size,
        status: "error",
        error: err instanceof Error ? err.message : "Falha ao ler o arquivo.",
      });
    }
  };

  const undoApplied = async (undo: () => Promise<void>) => {
    try {
      await undo();
      // Volta a ficar pronto para aplicar, já comparado com o app como está agora.
      setEntry((cur) => (cur && cur.status === "applied" && cur.file
        ? { ...cur, status: "ready", plan: planDePara360(cur.file), undo: undefined }
        : cur));
      toast.success("Importação do De/Para 360 desfeita.");
    } catch {
      toast.error("Falha ao desfazer a importação.");
    }
  };

  const apply = async () => {
    if (!entry?.file || !entry.plan) return;
    const { file, plan } = entry;
    setEntry({ ...entry, status: "applying" });
    try {
      const undo = await applyDePara360(plan, file.fileName, basesLocais);
      setEntry({ ...entry, status: "applied", undo });
      toast.success("De/Para 360 aplicado", {
        description: `${summary360(plan.counts)}. Já vale para as bases carregadas e para as próximas.`,
        duration: 10000,
        action: { label: "Desfazer", onClick: () => void undoApplied(undo) },
      });
    } catch {
      setEntry({ ...entry, status: "ready" });
      toast.error("Falha ao aplicar o De/Para 360.");
    }
  };

  const plan = entry?.plan;
  const total = plan ? plan.counts.sku + plan.counts.comercial + plan.counts.inovacao : 0;

  return (
    <div className="mb-4 space-y-3">
      <FileDropCard
        icon={Layers}
        title="Solte o De/Para 360 aqui"
        description="Hierarquia de SKU, Inovação e os De/Paras comerciais num arquivo só. O Omni4 reconhece cada aba pelas colunas — nome e ordem das abas não importam. Só o que for diferente do app muda."
        chips={CHIPS_360.map(({ label, icon: Icon, className }) => (
          <span key={label} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold", className)}>
            <Icon className="h-3 w-3" /> {label}
          </span>
        ))}
        hint="Arraste ou clique · .xlsx ou .xls"
        accept=".xlsx,.xls"
        ariaLabel="Escolher o arquivo De/Para 360"
        disabled={busy}
        onFiles={(files) => void read(files)}
      />

      {entry && (
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/50">
          <div className="flex items-center gap-3 border-b border-border/40 px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary/60 text-muted-foreground">
              {entry.status === "reading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-semibold">{entry.name}</span>
                <span className="text-[11px] text-muted-foreground">{formatBytes(entry.size)}</span>
                {entry.status === "error" && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-destructive"><AlertTriangle className="h-3 w-3" /> Erro</span>
                )}
                {entry.status === "applied" && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-500"><CheckCircle2 className="h-3 w-3" /> Aplicado</span>
                )}
                {(entry.status === "ready" || entry.status === "applying") && entry.file && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                    {entry.file.found.length} De/Para{entry.file.found.length === 1 ? "" : "s"} reconhecido{entry.file.found.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              {entry.status === "reading" && <div className="mt-0.5 text-[11px] text-muted-foreground">Lendo o arquivo…</div>}
              {entry.status === "error" && <div className="mt-0.5 text-[11px] text-destructive">{entry.error}</div>}
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => setEntry(null)}
              disabled={busy}
              aria-label={`Tirar ${entry.name} da revisão`}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {entry.file && plan && (
            <ul className="divide-y divide-border/30">
              {DEPARA_MAPS.map((m) => {
                const found = entry.file!.found.includes(m.id);
                const changes = found ? changesFor(plan, m.id) : 0;
                const unit = m.id === "hierarquia" || m.id === "inovacao" ? "SKU" : "valor";
                return (
                  <li key={m.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-3", !found && "opacity-70")}>
                    <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", found ? "bg-primary/10 text-primary" : "bg-muted/40 text-muted-foreground")}>
                      {found ? <Layers className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{m.title}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                        {!found ? (
                          "Não veio no arquivo — fica como está."
                        ) : changes === 0 ? (
                          <span className="inline-flex items-center gap-1"><Check className="h-3 w-3 text-emerald-500" /> igual ao app</span>
                        ) : (
                          <>
                            <span className="font-medium text-foreground">{formatNum(changes)} {unit}{changes === 1 ? "" : "s"} muda{changes === 1 ? "" : "m"}</span>
                            {entry.status === "applied" && <span className="inline-flex items-center gap-1 text-emerald-500"><CheckCircle2 className="h-3 w-3" /> aplicado</span>}
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {plan && entry && (entry.status === "ready" || entry.status === "applying" || entry.status === "applied") && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/60 px-4 py-3">
          <div className="text-[11px] text-muted-foreground">
            {entry.status === "applied" ? (
              "Aplicado. Já vale para as bases carregadas e para as próximas."
            ) : total > 0 ? (
              <>
                Pronto para aplicar: <span className="font-medium text-foreground">{summary360(plan.counts)}</span>. Nada muda no app até você clicar em Aplicar. Células vazias no arquivo não apagam nada.
              </>
            ) : (
              "O arquivo é igual ao que o app já usa. Nada a aplicar."
            )}
          </div>
          {entry.status === "applied" && entry.undo ? (
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => void undoApplied(entry.undo!)}>
              <RotateCcw className="h-3.5 w-3.5" /> Desfazer
            </Button>
          ) : (
            total > 0 && (
              <Button size="sm" className="h-8 gap-1.5" onClick={() => void apply()} disabled={busy}>
                {entry.status === "applying" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                Aplicar
              </Button>
            )
          )}
        </div>
      )}
    </div>
  );
}
