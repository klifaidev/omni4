// Período global do deck — ao lado do Filtro Global na barra da esteira.
// (1) Mês de referência: o deck enxerga o realizado só até ele (hooks
// useDeckPricingRows/useDeckBudgetRows). (2) Avançar: empurra +1 mês os
// períodos fixos de todo o deck, com Desfazer. Lógica em lib/deckPeriod.ts.
import { useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePricing } from "@/store/pricing";
import { useSlidesFlow } from "@/store/slidesFlow";
import { getSortedMonthPeriods } from "@/lib/relativePeriods";
import { advanceDeckFixedPeriods, parsePeriodo } from "@/lib/deckPeriod";
import { strings } from "@/lib/i18n";

const t = strings.slides.editor.inspectors.blocks.deckReference;
const AUTO = "__auto__";

export function DeckReferenceControl() {
  const [open, setOpen] = useState(false);
  // Base inteira (sem o corte): é daqui que se escolhe a referência.
  const pricing = usePricing((s) => s.rows);
  const reference = useSlidesFlow((s) => s.referencePeriod);
  const setReference = useSlidesFlow((s) => s.setReferencePeriod);

  const months = useMemo(() => getSortedMonthPeriods(pricing), [pricing]);
  const latest = months.at(-1) ?? null;
  const labelOf = (periodo: string | null) => months.find((m) => m.value === periodo)?.label ?? periodo ?? "";
  const manual = reference !== null;
  const hiddenMonths = manual ? months.filter((m) => isAfter(m.value, reference)).length : 0;

  const advance = () => {
    const before = useSlidesFlow.getState().items;
    const result = advanceDeckFixedPeriods(before, 1);
    if (result.changed === 0) {
      toast.info(t.advanceNone);
      return;
    }
    useSlidesFlow.setState({ items: result.items });
    const notes = [
      result.skippedFiscal > 0 ? t.advanceSkippedFiscal(result.skippedFiscal) : null,
      result.latest && latest && isAfter(result.latest, latest.value) ? t.advancePastData(latest.label) : null,
    ].filter(Boolean).join(" ");
    toast.success(t.advanceDone(result.changed, result.slides), {
      description: notes || undefined,
      duration: 10_000,
      action: {
        label: t.undo,
        onClick: () => {
          useSlidesFlow.setState({ items: before });
          toast.info(t.undone);
        },
      },
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={manual ? "default" : "outline"}
          size="sm"
          className="h-8 gap-1.5 px-2.5 text-xs"
          aria-label={t.ariaLabel}
          title={manual ? `${t.panelTitle}: ${labelOf(reference)}` : t.panelTitle}
        >
          <CalendarClock className="h-3.5 w-3.5" />
          {/* Só ícone abaixo de 2xl (mesma regra dos outros botões da barra);
              com referência manual o mês aparece sempre — é um estado a notar. */}
          {manual
            ? <span>{labelOf(reference)}</span>
            : <span className="hidden 2xl:inline">{t.buttonAuto}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] space-y-4 p-4">
        <div className="space-y-1.5">
          <div className="text-sm font-semibold text-foreground">{t.panelTitle}</div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">{t.panelDescription}</p>
          <Select
            value={reference ?? AUTO}
            onValueChange={(value) => setReference(value === AUTO ? null : value)}
          >
            <SelectTrigger className="h-9 text-xs" aria-label={t.ariaLabel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AUTO}>{latest ? t.autoOption(latest.label) : t.autoOptionEmpty}</SelectItem>
              {[...months].reverse().map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {manual && (
            <p className="text-[11px] text-primary">{t.manualHint(labelOf(reference), hiddenMonths)}</p>
          )}
        </div>
        <div className="space-y-2 border-t border-border/50 pt-3">
          <div className="text-sm font-semibold text-foreground">{t.advanceTitle}</div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">{t.advanceDescription}</p>
          <Button size="sm" variant="secondary" className="h-8 w-full" onClick={advance}>
            {t.advanceButton}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function isAfter(periodo: string, reference: string | null): boolean {
  const a = parsePeriodo(periodo);
  const b = parsePeriodo(reference);
  if (!a || !b) return false;
  return a.ano * 12 + a.mes > b.ano * 12 + b.mes;
}
