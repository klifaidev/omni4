// Resumo automático no painel: prévia da frase no gráfico (com "Pôr no
// slide") e, no texto ligado, de onde ele vem e como desvincular.

import { useContext } from "react";
import { Link2Off, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ChartBlock, TextBlock } from "@/lib/customSlide";
import { strings } from "@/lib/i18n";
import { RichTextContent } from "../RichTextContent";
import { SlideBlocksContext, SlideIdContext, useSlideBlock } from "../SlideIdentity";
import { insertChartInsightAction, selectBlock, unlinkChartInsightAction } from "../editorStore";
import { useChartInsight } from "./useChartInsight";

const t = strings.slides.editor.insight;

export function ChartInsightCard({ block, readOnly }: { block: ChartBlock; readOnly?: boolean }) {
  const slideId = useContext(SlideIdContext);
  const blocks = useContext(SlideBlocksContext);
  const insight = useChartInsight(block, slideId);
  const linked = blocks?.find((b) => b.kind === "text" && b.insight?.chartId === block.id) ?? null;
  if (insight.status === "unsupported") return null;

  return (
    <div className="space-y-1.5 rounded-lg border border-primary/25 bg-primary/5 px-2.5 py-2" data-chart-insight>
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 text-[12px] font-semibold text-foreground">{t.title}</span>
        {linked ? (
          <Button type="button" size="sm" variant="ghost" className="h-6 shrink-0 px-2 text-[11px]"
            onClick={() => selectBlock(linked.id)}>
            {t.alreadyOnSlide} · {t.select}
          </Button>
        ) : (
          <Button type="button" size="sm" variant="secondary" className="h-6 shrink-0 px-2 text-[11px]"
            disabled={readOnly || insight.status !== "ready"}
            onClick={() => {
              if (insight.status !== "ready") return;
              if (insertChartInsightAction(block.id, insight.text)) toast.success(t.inserted, { duration: 2200 });
            }}>
            {t.insert}
          </Button>
        )}
      </div>
      <p className="text-[12px] leading-snug text-foreground/85" data-chart-insight-preview>
        {insight.status === "ready" ? <RichTextContent text={insight.text} /> : t.loading}
      </p>
      <p className="text-[10px] leading-snug text-muted-foreground">{t.hint}</p>
    </div>
  );
}

/** No texto ligado: de qual gráfico ele vem, e desvincular para editar. */
export function InsightLinkCard({ block, readOnly }: { block: TextBlock; readOnly?: boolean }) {
  const slideId = useContext(SlideIdContext);
  const linked = useSlideBlock(block.insight?.chartId);
  const chart = linked?.kind === "chart" ? linked : null;
  const insight = useChartInsight(chart, slideId);
  if (!block.insight) return null;
  const current = chart && insight.status === "ready" ? insight.text : block.text;

  return (
    <div className="space-y-1.5 rounded-lg border border-primary/25 bg-primary/5 px-2.5 py-2" data-insight-link>
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 text-[12px] font-semibold text-foreground">{t.title}</span>
        {chart && (
          <Button type="button" size="sm" variant="ghost" className="h-6 shrink-0 px-2 text-[11px]"
            onClick={() => selectBlock(chart.id)}>
            {t.selectChart}
          </Button>
        )}
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        {!chart ? t.chartGone
          : insight.status === "unsupported" ? t.unsupported
          : t.linkedTo(chart.title?.trim() || t.untitledChart)}
      </p>
      <Button type="button" size="sm" variant="outline" className="h-7 w-full gap-1.5 text-[11px]"
        disabled={readOnly} title={t.unlinkHint}
        onClick={() => {
          unlinkChartInsightAction(block.id, current);
          toast.success(t.unlinked, { duration: 2200 });
        }}>
        <Link2Off className="h-3.5 w-3.5" />
        {t.unlink}
      </Button>
    </div>
  );
}
