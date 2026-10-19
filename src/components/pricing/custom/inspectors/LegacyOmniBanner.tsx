// Aviso no painel de um elemento "Omni Analytics" (aposentado da paleta): existe
// um visual igual à aba que mostra o mesmo conteúdo. A troca diz antes o que
// muda e é um passo só de desfazer.
import { useMemo, useState } from "react";
import { ArrowRight, Info, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CustomBlock } from "@/lib/customSlide";
import { useDeckPricingRows } from "@/hooks/useDeckRows";
import { canConvertOmni, getLegacyConversion } from "@/components/pricing/tabVisuals/fromOmni";
import { flushPendingEditorEmit, replaceBlockAction } from "../editorStore";

export function LegacyOmniBanner({ block }: { block: CustomBlock }) {
  const [open, setOpen] = useState(false);
  const deckRows = useDeckPricingRows();
  const available = canConvertOmni(block);
  const conversion = useMemo(
    () => (open && available ? getLegacyConversion(block, deckRows) : null),
    [open, available, block, deckRows],
  );
  if (!available) return null;

  const apply = () => {
    if (!conversion) return;
    flushPendingEditorEmit();
    const id = replaceBlockAction(block.id, conversion.build(), "Converter em elemento editável");
    setOpen(false);
    if (id) toast.success("Trocado pelo visual igual à aba. Ctrl+Z desfaz.");
  };

  return (
    <>
      <div className="mb-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-primary">
          <Sparkles className="h-3.5 w-3.5" /> Há um visual igual à aba para este elemento
        </div>
        <p className="mt-1 slides-type-helper">
          Este elemento é uma versão mais simples do gráfico da aba. O visual igual à aba mostra o mesmo gráfico, com todos os filtros e o período vivo.
        </p>
        <Button size="sm" variant="outline" className="mt-2 h-7 text-[11px]" onClick={() => setOpen(true)}>
          Trocar pelo visual da aba
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Trocar pelo visual igual à aba</DialogTitle>
            <DialogDescription>Troca o elemento no mesmo lugar e tamanho, mantendo filtros e meses.</DialogDescription>
          </DialogHeader>
          {conversion && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2">
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 font-medium">{conversion.target}</span>
              </div>
              {conversion.notes.length > 0 && (
                <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
                  <div className="mb-1 flex items-center gap-1.5 font-semibold text-warning">
                    <Info className="h-3.5 w-3.5" /> O que muda
                  </div>
                  <ul className="list-disc space-y-1 pl-4 text-foreground/90">
                    {conversion.notes.map((note) => <li key={note}>{note}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={apply} disabled={!conversion}>Trocar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
