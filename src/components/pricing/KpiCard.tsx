import { cn } from "@/lib/utils";
import { GlassCard } from "./GlassCard";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { SendToSlideHover } from "./SendToSlideHover";
import type { SendToSlidePayload } from "@/lib/sendToSlide";

interface KpiCardProps {
  label: string;
  value: string;
  subValue?: string;
  delta?: number; // 0..1 for percent change (e.g. 0.04 = +4%)
  deltaLabel?: string; // e.g. "vs. mês anterior"
  glow?: "blue" | "green" | "red" | "none";
  accent?: "blue" | "green" | "red" | "amber" | "violet";
  className?: string;
  sendToSlide?: SendToSlidePayload;
}

const accentColor: Record<NonNullable<KpiCardProps["accent"]>, string> = {
  blue: "text-primary",
  green: "text-success",
  red: "text-destructive",
  amber: "text-warning",
  violet: "text-accent",
};

function formatDeltaPct(d: number): string {
  const sign = d > 0 ? "+" : d < 0 ? "−" : "";
  return `${sign}${Math.abs(d * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

export function KpiCard({ label, value, subValue, delta, deltaLabel, glow = "none", accent = "blue", className, sendToSlide }: KpiCardProps) {
  const hasDelta = typeof delta === "number" && isFinite(delta);
  const dir = hasDelta ? (delta! > 0 ? "up" : delta! < 0 ? "down" : "flat") : null;

  const card = (
    <GlassCard glow={glow} hoverable className={cn("relative overflow-hidden animate-fade-up", className)}>
      <div className="flex flex-col gap-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
        <div className={cn("break-words text-3xl font-light leading-tight tabular-nums", accentColor[accent])}>
          {value}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {subValue && <span>{subValue}</span>}
          {hasDelta && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                dir === "up" && "bg-success/15 text-success",
                dir === "down" && "bg-destructive/15 text-destructive",
                dir === "flat" && "bg-muted text-muted-foreground",
              )}
            >
              {dir === "up" && <ArrowUpRight className="h-3 w-3" />}
              {dir === "down" && <ArrowDownRight className="h-3 w-3" />}
              {dir === "flat" && <Minus className="h-3 w-3" />}
              {formatDeltaPct(delta!)}
            </span>
          )}
          {hasDelta && deltaLabel && (
            <span className="text-[11px] text-muted-foreground">{deltaLabel}</span>
          )}
        </div>
      </div>
    </GlassCard>
  );

  if (!sendToSlide) return card;

  return (
    <SendToSlideHover
      payload={{
        ...sendToSlide,
        config: {
          ...sendToSlide.config,
          displayValue: value,
          displaySubValue: subValue,
          delta,
          deltaLabel,
        },
      }}
    >
      {card}
    </SendToSlideHover>
  );
}
