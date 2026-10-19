// "Converter em elemento editável" — no painel de um visual da aba. Mostra o
// que o visual vira e o que muda ANTES de aplicar; a troca é um passo só de
// desfazer (Ctrl+Z devolve o visual da aba).
import { useMemo, useState } from "react";
import { ArrowRight, Info, PencilRuler } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { TabVisualBlock } from "@/lib/customSlide";
import { useDeckPricingRows } from "@/hooks/useDeckRows";
import { canConvertToEditable, getEditableConversion } from "@/components/pricing/tabVisuals/toEditable";
import { getTabVisual } from "@/components/pricing/tabVisuals/registry";
import { flushPendingEditorEmit, replaceBlockAction } from "../editorStore";

export function ConvertToEditable({ block }: { block: TabVisualBlock }) {
  const [open, setOpen] = useState(false);
  const deckRows = useDeckPricingRows();
  const visual = getTabVisual(block.visualId);
  const available = canConvertToEditable(block.visualId);
  const conversion = useMemo(
    () => (open && available ? getEditableConversion(block, deckRows) : null),
    [open, available, block, deckRows],
  );

  if (!visual) return null;
  if (!available) {
    return (
      <p className="slides-type-helper">
        Este visual não tem um elemento editável equivalente — o período, as opções e os filtros se ajustam aqui no painel.
      </p>
    );
  }

  const apply = () => {
    if (!conversion) return;
    flushPendingEditorEmit();
    const id = replaceBlockAction(block.id, conversion.build(), "Converter em elemento editável");
    setOpen(false);
    if (id) toast.success(`Convertido em ${conversion.target.toLowerCase()}. Ctrl+Z desfaz.`);
  };

  return (
    <>
      <p className="slides-type-helper">
        Vira um elemento do próprio editor, para formatar tudo (cores, eixos, rótulos). Deixa de acompanhar o visual da aba.
      </p>
      <Button size="sm" variant="outline" className="h-8 w-full gap-1.5 text-[12px]" onClick={() => setOpen(true)}>
        <PencilRuler className="h-3.5 w-3.5" /> Converter em elemento editável
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Converter em elemento editável</DialogTitle>
            <DialogDescription>
              Troca o visual da aba por um elemento do editor, no mesmo lugar e tamanho.
            </DialogDescription>
          </DialogHeader>
          {conversion && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2">
                <span className="min-w-0 truncate text-muted-foreground">{visual.title}</span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 font-medium">{conversion.target}</span>
              </div>
              <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
                <div className="mb-1 flex items-center gap-1.5 font-semibold text-warning">
                  <Info className="h-3.5 w-3.5" /> O que muda
                </div>
                <ul className="list-disc space-y-1 pl-4 text-foreground/90">
                  <li>O elemento deixa de acompanhar o visual da aba: mudar o período, as opções ou os filtros aqui no painel não vale mais.</li>
                  {conversion.notes.map((note) => <li key={note}>{note}</li>)}
                </ul>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={apply} disabled={!conversion}>Converter</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
