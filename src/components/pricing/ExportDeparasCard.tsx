import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GlassCard } from "./GlassCard";
import {
  Download,
  FileSpreadsheet,
  GitBranch,
  RefreshCw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import {
  exportDeparasXlsx,
  exportInovacaoDeparaAtualXlsx,
  exportInovacaoDeparaModeloXlsx,
} from "@/lib/exportDeparaXlsx";
import { parseInovacaoDeparaFile } from "@/lib/parseDeparaInovacao";
import { useBasesLocais } from "@/hooks/use-bases-locais";
import { useInovacaoDepara } from "@/store/inovacaoDepara";
import { usePricing } from "@/store/pricing";
import { useBudget } from "@/store/budget";
import { useForecast } from "@/store/forecast";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const DEPARAS = [
  {
    id: "hierarquia",
    title: "SKU - Hierarquia",
    description: "Categoria, marca, tecnologia, formato, mercado, peso e sabor por SKU.",
    status: "Somente download",
  },
  {
    id: "inovacao",
    title: "SKU - Inovação",
    description: "Classificação Inovação/Regular, ano de lançamento e legado por SKU.",
    status: "Administrável",
    editable: true,
  },
  {
    id: "canal",
    title: "Canal - Canal Ajustado",
    description: "Padronização do canal bruto para o canal usado nas análises.",
    status: "Somente download",
  },
  {
    id: "regiaoUf",
    title: "Região - UF",
    description: "Extração da UF a partir da região da base Real.",
    status: "Somente download",
  },
  {
    id: "regiaoMercado",
    title: "Região - Mercado Ajustado",
    description: "Padronização do mercado a partir da região.",
    status: "Somente download",
  },
  {
    id: "ufRegional",
    title: "UF - Regional",
    description: "Agrupamento comercial regional a partir da UF.",
    status: "Somente download",
  },
];

export function ExportDeparasCard() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const basesLocais = useBasesLocais();
  const file = useInovacaoDepara((s) => s.file);
  const map = useInovacaoDepara((s) => s.map);
  const setDepara = useInovacaoDepara((s) => s.setDepara);
  const clearDepara = useInovacaoDepara((s) => s.clearDepara);
  const reclassifyPricing = usePricing((s) => s.reclassifyInovacao);
  const reclassifyBudget = useBudget((s) => s.reclassifyInovacao);
  const reclassifyForecast = useForecast((s) => s.reclassifyInovacao);

  const reclassify = () => {
    reclassifyPricing();
    reclassifyBudget();
    reclassifyForecast();
  };

  const handleExportAll = () => {
    try {
      exportDeparasXlsx();
      toast.success("De Paras exportados com sucesso.");
    } catch (e) {
      console.error(e);
      toast.error("Falha ao exportar De Paras.");
    }
  };

  const handleImportInovacao = async (selected: File | undefined) => {
    if (!selected) return;
    try {
      setBusy(true);
      const parsed = await parseInovacaoDeparaFile(selected);
      if (parsed.file.rowCount === 0) {
        toast.error(parsed.warnings[0] ?? "Nenhum SKU válido encontrado no De/Para.");
        return;
      }
      setDepara(parsed.map, parsed.file);
      reclassify();
      if (basesLocais.isElectron) {
        await basesLocais.salvarBase("deparaInovacao", selected);
      }
      toast.success(`De/Para de Inovação substituído: ${parsed.file.rowCount.toLocaleString("pt-BR")} SKU(s).`);
      parsed.warnings.forEach((warning) => toast.warning(warning));
    } catch (e) {
      console.error(e);
      toast.error("Falha ao importar De/Para de Inovação.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleRestoreDefault = async () => {
    clearDepara();
    reclassify();
    if (basesLocais.isElectron) await basesLocais.deletarBase("deparaInovacao");
    toast.success("De/Para de Inovação restaurado para o padrão do app.");
  };

  return (
    <GlassCard>
      <header className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Central de De/Paras</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Baixe, audite e substitua mapeamentos usados nas bases do app.
            </p>
          </div>
        </div>
        <Button
          onClick={() => setOpen(true)}
          size="sm"
          className="shrink-0 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <GitBranch className="h-3.5 w-3.5" />
          Gerenciar
        </Button>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <SummaryTile label="De/Paras disponíveis" value={DEPARAS.length.toLocaleString("pt-BR")} />
        <SummaryTile label="SKUs de inovação" value={Object.keys(map).length.toLocaleString("pt-BR")} />
        <SummaryTile label="Fonte de inovação" value={file?.name ?? "Padrão do app"} truncate />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Central de De/Paras</DialogTitle>
          </DialogHeader>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/50 bg-secondary/30 p-3">
            <div>
              <div className="text-sm font-medium">Pacote completo de auditoria</div>
              <div className="text-[11px] text-muted-foreground">
                Baixa todos os De/Paras em uma única planilha com abas separadas.
              </div>
            </div>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={handleExportAll}>
              <Download className="h-3.5 w-3.5" />
              Baixar todos
            </Button>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => handleImportInovacao(e.target.files?.[0])}
          />

          <div className="max-h-[56vh] space-y-2 overflow-auto pr-1">
            {DEPARAS.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "rounded-lg border border-border/50 bg-card/60 p-3",
                  item.editable && "border-amber-500/30 bg-amber-500/[0.04]",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                      <h4 className="text-sm font-semibold">{item.title}</h4>
                      <Badge variant={item.editable ? "default" : "secondary"} className="text-[10px]">
                        {item.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{item.description}</p>
                    {item.id === "inovacao" && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Ativo: <span className="font-medium text-foreground">{file?.name ?? "Padrão do app"}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {item.id === "inovacao" ? (
                      <>
                        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={exportInovacaoDeparaAtualXlsx}>
                          <Download className="h-3.5 w-3.5" />
                          Atual
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={exportInovacaoDeparaModeloXlsx}>
                          <FileSpreadsheet className="h-3.5 w-3.5" />
                          Modelo
                        </Button>
                        <Button size="sm" className="h-8 gap-1.5" disabled={busy} onClick={() => inputRef.current?.click()}>
                          {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                          Substituir
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 text-destructive" onClick={handleRestoreDefault}>
                          Restaurar padrão
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={handleExportAll}>
                        <Download className="h-3.5 w-3.5" />
                        Baixar
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </GlassCard>
  );
}

function SummaryTile({ label, value, truncate }: { label: string; value: string; truncate?: boolean }) {
  return (
    <div className="rounded-lg border border-border/40 bg-secondary/30 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-sm font-semibold", truncate && "truncate")}>{value}</div>
    </div>
  );
}
