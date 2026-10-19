// Ruptura · cartões de indicadores. O mesmo desenho na aba e no slide: a aba
// põe o cartão de vidro e a dica de cálculo; o slide, um cartão limpo, maior.
import { ArrowDownRight, ArrowUpRight, Info, Minus } from "lucide-react";
import { GlassCard } from "@/components/pricing/GlassCard";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatNum } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TabVisualVariant } from "@/components/pricing/tabVisuals/visualTheme";
import type { ReactNode } from "react";
import type { RupturaDelta, RupturaKpiData } from "./data";

/** O que o cartão desenha (o cartão "Oportunidade financeira" da aba não tem id de indicador). */
export type RupturaKpiCardData = Pick<RupturaKpiData, "label" | "value" | "sub" | "unavailable" | "delta" | "deltaLabel" | "help">;

function DeltaPill({ delta, label, slide }: { delta: RupturaDelta; label: string; slide: boolean }) {
  if (!delta) return null;
  const v = delta.value;
  const dir = Math.abs(v) < 1e-9 ? "flat" : v > 0 ? "up" : "down";
  const text = delta.kind === "pp"
    ? `${v > 0 ? "+" : v < 0 ? "−" : ""}${formatNum(Math.abs(v) * 100, 1)} p.p.`
    : `${v > 0 ? "+" : v < 0 ? "−" : ""}${formatNum(Math.abs(v) * 100, 1)}%`;
  // Em ruptura, subir é ruim: alta em vermelho, queda em verde.
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium tabular-nums",
          slide ? "text-[13px]" : "text-[11px]",
          dir === "up" && "bg-destructive/15 text-destructive",
          dir === "down" && "bg-success/15 text-success",
          dir === "flat" && "bg-muted text-muted-foreground",
        )}
      >
        {dir === "up" && <ArrowUpRight className={slide ? "h-3.5 w-3.5" : "h-3 w-3"} />}
        {dir === "down" && <ArrowDownRight className={slide ? "h-3.5 w-3.5" : "h-3 w-3"} />}
        {dir === "flat" && <Minus className={slide ? "h-3.5 w-3.5" : "h-3 w-3"} />}
        {text}
      </span>
      <span className={cn("text-muted-foreground", slide ? "text-[13px]" : "text-[11px]")}>{label}</span>
    </span>
  );
}

/** Um cartão de indicador. */
export function RupturaKpiCard({ data, variant, action }: { data: RupturaKpiCardData; variant: TabVisualVariant; action?: ReactNode }) {
  const slide = variant === "slide";
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className={cn("font-medium uppercase tracking-[0.14em] text-muted-foreground", slide ? "text-[13px]" : "text-[11px]")}>
          {data.label}
        </span>
        <div className="-mr-1 -mt-1 flex shrink-0 items-center">
          {action}
          {!slide && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="rounded p-1.5 text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  aria-label={`Como calculamos: ${data.label}`}
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[300px] text-xs leading-relaxed">{data.help}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
      <div
        className={cn(
          "font-light leading-tight tabular-nums",
          slide ? "text-[44px]" : "text-2xl",
          data.unavailable ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {data.value}
      </div>
      <div className={cn("text-muted-foreground", slide ? "text-[13px]" : "text-xs")}>{data.sub}</div>
      {data.delta && data.deltaLabel && <DeltaPill delta={data.delta} label={data.deltaLabel} slide={slide} />}
    </>
  );

  if (slide) {
    return (
      <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-2xl border border-border bg-white p-5">
        {body}
      </div>
    );
  }
  return <GlassCard surface="raised" className="flex min-w-0 flex-1 flex-col gap-2 p-4">{body}</GlassCard>;
}

/** O visual "um cartão" do catálogo. */
export function RupturaKpiVisual({ data, variant }: { data: RupturaKpiData; variant: TabVisualVariant }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" style={{ minWidth: 0 }}>
      <RupturaKpiCard data={data} variant={variant} />
    </div>
  );
}

/** O visual "painel de indicadores": os cinco cartões lado a lado. */
export function RupturaKpiStripVisual({ data, variant }: { data: RupturaKpiData[]; variant: TabVisualVariant }) {
  return (
    <div className="flex w-full gap-3">
      {data.map((card) => <RupturaKpiCard key={card.id} data={card} variant={variant} />)}
    </div>
  );
}
