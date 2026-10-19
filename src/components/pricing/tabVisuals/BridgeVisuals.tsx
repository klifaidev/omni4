// Bridge PVM · cartões de efeito e rankings (heróis e ofensores). O mesmo
// desenho na aba e no slide: a aba põe o cartão de vidro, as dicas e o botão de
// enviar; o slide, um cartão limpo no tema claro.
import type { ReactNode } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { KpiCard } from "@/components/pricing/KpiCard";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BridgeEffectCardData, BridgeEffectsData, BridgeRankingData, BridgeRankingItem, BridgeRankingEffect } from "./bridgeData";
import type { TabVisualVariant } from "./visualTheme";

/** Um cartão de efeito (Δ Volume, Δ Preço…). */
export function BridgeEffectCard({
  data,
  variant,
  className,
  action,
  periodLabel,
  compact,
}: {
  data: BridgeEffectCardData;
  variant: TabVisualVariant;
  className?: string;
  action?: ReactNode;
  /** "Ago/26 → Set/26": no slide o cartão sozinho diz de que comparação vem. */
  periodLabel?: string;
  /** Painel com seis cartões: o valor sai menor para não quebrar a linha. */
  compact?: boolean;
}) {
  const value = formatBRL(data.value, { compact: true });
  const sub = `% do total: ${data.share.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
  if (variant === "tab") {
    return (
      <KpiCard className={className} label={data.label} value={value} subValue={sub} accent={data.value >= 0 ? "green" : "red"} action={action} />
    );
  }
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-2xl border border-border bg-white p-5">
      <span className="text-[13px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{data.label}</span>
      <div className={cn("whitespace-nowrap font-light leading-tight tabular-nums", compact ? "text-[26px]" : "text-[34px]", data.value >= 0 ? "text-success" : "text-destructive")}>{value}</div>
      <div className="text-[14px] text-muted-foreground">{sub}</div>
      {periodLabel && <div className="text-[13px] font-medium text-foreground/70">{periodLabel}</div>}
    </div>
  );
}

/** O visual "um cartão de efeito" do catálogo. */
export function BridgeEffectVisual({ data, params, variant }: { data: BridgeEffectsData; params: Record<string, unknown>; variant: TabVisualVariant }) {
  const card = data.cards.find((c) => c.id === params.effect) ?? data.cards[0];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <BridgeEffectCard data={card} variant={variant} periodLabel={`${data.baseLabel} → ${data.currentLabel}`} />
    </div>
  );
}

/** O visual "painel de efeitos": os seis cartões lado a lado. */
export function BridgeEffectsStripVisual({ data, variant }: { data: BridgeEffectsData; variant: TabVisualVariant }) {
  return (
    <div className="flex w-full gap-3">
      {data.cards.map((card) => <BridgeEffectCard key={card.id} data={card} variant={variant} compact />)}
    </div>
  );
}

function EffectList({
  title,
  icon: Icon,
  items,
  effect,
  emptyLabel,
  tone,
  variant,
}: {
  title: string;
  icon: typeof TrendingUp;
  items: BridgeRankingItem[];
  effect: BridgeRankingEffect;
  emptyLabel: string;
  tone: "positive" | "negative";
  variant: TabVisualVariant;
}) {
  const slide = variant === "slide";
  // Na aba o "positivo" é a cor principal (azul); no slide a principal é o vermelho da marca — ali o ganho é verde.
  const positiveText = slide ? "text-success" : "text-primary";
  return (
    <section className="space-y-2">
      <div className={cn("flex items-center gap-2 font-medium text-foreground", slide ? "text-[16px]" : "text-sm")}>
        <Icon className={cn("h-4 w-4", tone === "positive" ? positiveText : "text-destructive")} />
        {title}
      </div>

      {items.length === 0 ? (
        <div className={cn("rounded-xl border border-dashed border-border/60 bg-secondary/20 px-3 py-4 text-muted-foreground", slide ? "text-[13px]" : "text-xs")}>
          {emptyLabel}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div
              key={`${title}-${effect}-${item.id}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-secondary/20 px-3 py-2"
            >
              <div className="min-w-0">
                <div className={cn("font-semibold uppercase tracking-wider text-muted-foreground", slide ? "text-[12px]" : "text-[11px]")}>#{index + 1}</div>
                <div className={cn("truncate font-medium text-foreground", slide ? "text-[15px]" : "text-sm")} title={item.name}>{item.name}</div>
                {item.subLabel && <div className={cn("truncate text-muted-foreground", slide ? "text-[12px]" : "text-[10px]")}>{item.subLabel}</div>}
              </div>
              <div className={cn("font-semibold", slide ? "text-[15px]" : "text-sm", tone === "positive" ? positiveText : "text-destructive")}>
                {formatBRL(item[effect], { compact: true })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Heróis e ofensores de um efeito (a aba põe título e subtítulo em volta). */
export function BridgeRankingVisual({ data, variant }: { data: BridgeRankingData; params?: Record<string, unknown>; variant: TabVisualVariant }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2" style={variant === "slide" ? { gridTemplateColumns: "1fr 1fr" } : undefined}>
      <EffectList
        title="Heróis"
        icon={TrendingUp}
        items={data.heroes}
        effect={data.effect}
        emptyLabel="Sem impactos positivos relevantes no recorte atual."
        tone="positive"
        variant={variant}
      />
      <EffectList
        title="Ofensores"
        icon={TrendingDown}
        items={data.offenders}
        effect={data.effect}
        emptyLabel="Sem impactos negativos relevantes no recorte atual."
        tone="negative"
        variant={variant}
      />
    </div>
  );
}
