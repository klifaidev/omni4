import { Button } from "@/components/ui/button";
import { GlassCard } from "./GlassCard";
import { Download, FileSpreadsheet, ShieldCheck } from "lucide-react";
import { exportDeparasXlsx } from "@/lib/exportDeparaXlsx";
import { toast } from "sonner";

export function ExportDeparasCard() {
  const handleExport = () => {
    try {
      exportDeparasXlsx();
      toast.success("De Paras exportados com sucesso.");
    } catch (e) {
      console.error(e);
      toast.error("Falha ao exportar De Paras.");
    }
  };

  const sheets = [
    "SKU → Hierarquia (categoria, marca, formato…)",
    "SKU → Inovação (classificação + legado)",
    "Canal → Canal Ajustado",
    "Região → UF",
    "Região → Mercado Ajustado",
    "UF → Regional",
  ];

  return (
    <GlassCard>
      <header className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Exportar De Paras</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Baixe todos os mapeamentos em uma única planilha Excel para validação e auditoria.
            </p>
          </div>
        </div>
        <Button
          onClick={handleExport}
          size="sm"
          className="shrink-0 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Download className="h-3.5 w-3.5" />
          Baixar XLSX
        </Button>
      </header>

      <div className="rounded-lg border border-border/40 bg-secondary/30 p-3">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <FileSpreadsheet className="h-3.5 w-3.5" />
          Conteúdo da planilha
        </div>
        <ul className="grid grid-cols-1 gap-1.5 text-xs text-foreground/90 md:grid-cols-2">
          {sheets.map((s, i) => (
            <li key={s} className="flex items-start gap-2">
              <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                {i + 1}
              </span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </div>
    </GlassCard>
  );
}
