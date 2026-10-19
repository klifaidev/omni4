// Ruptura · mapa por estado. Mesmo desenho na aba (com clique e foco por
// estado) e no slide (parado; sem passar o mouse, o valor aparece no estado).
import { useMemo } from "react";
import { brazilSvg } from "@/components/pricing/tabVisuals/ufMapData";
import { cn } from "@/lib/utils";
import { UF_NAMES } from "@/lib/ruptura/uf";
import type { TabVisualVariant } from "@/components/pricing/tabVisuals/visualTheme";
import { formatMapValue, RUPTURA_MAP_METRICS, type RupturaMapData } from "./data";
import { rupturaPalette } from "./theme";

export function RupturaMapVisual({
  data,
  variant,
  selectedUfs,
  hover,
  onHover,
  onToggle,
  className,
}: {
  data: RupturaMapData;
  variant: TabVisualVariant;
  selectedUfs?: Set<string | null>;
  hover?: string | null;
  onHover?: (uf: string | null) => void;
  onToggle?: (uf: string) => void;
  className?: string;
}) {
  const slide = variant === "slide";
  const palette = rupturaPalette(variant);
  const geo = useMemo(() => brazilSvg(), []);
  const byUf = useMemo(() => new Map(data.rows.map((r) => [r.uf, r])), [data.rows]);
  const metricLabel = RUPTURA_MAP_METRICS.find((m) => m.id === data.metric)?.label.toLowerCase() ?? "";
  const interactive = !!onToggle;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3">
      <div className="relative min-h-0 flex-1">
        <svg
          viewBox="0 0 1000 912"
          role="img"
          aria-label="Mapa do Brasil com a ruptura por estado"
          className={className ?? "h-full w-full"}
          preserveAspectRatio="xMidYMid meet"
        >
          {geo.states.map((s) => {
            const row = byUf.get(s.uf);
            const has = row !== undefined;
            const v = row?.value ?? null;
            const t = has && v !== null && data.max > 0 ? v / data.max : 0;
            const selected = !!selectedUfs?.has(s.uf);
            return (
              <path
                key={s.uf}
                d={s.d}
                role={has && interactive ? "button" : undefined}
                tabIndex={has && interactive ? 0 : undefined}
                aria-label={has ? `${UF_NAMES[s.uf]}: ${v === null ? "sem valor" : formatMapValue(data.metric, v)}` : `${UF_NAMES[s.uf]}: sem pesquisas`}
                onMouseEnter={onHover ? () => onHover(s.uf) : undefined}
                onMouseLeave={onHover ? () => onHover(null) : undefined}
                onFocus={onHover ? () => onHover(s.uf) : undefined}
                onBlur={onHover ? () => onHover(null) : undefined}
                onClick={interactive ? () => has && onToggle!(s.uf) : undefined}
                onKeyDown={interactive ? (e) => { if (has && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onToggle!(s.uf); } } : undefined}
                className={cn("outline-none", !slide && "transition-[fill,opacity]", has && interactive && "cursor-pointer")}
                style={{
                  fill: has ? palette.heat(t) : palette.mapEmpty,
                  stroke: selected ? palette.mapStrokeSelected : hover === s.uf ? "hsl(var(--foreground) / 0.6)" : palette.mapStroke,
                  strokeWidth: selected ? 3 : 1.2,
                }}
              />
            );
          })}
          {geo.labelPoints.map((p) => {
            const row = byUf.get(p.uf);
            if (!row) return null;
            return (
              <g key={p.uf} className="pointer-events-none select-none" style={{ fontWeight: 600, fill: palette.mapLabel }}>
                <text x={p.x} y={p.y + (slide ? 2 : 5)} textAnchor="middle" style={{ fontSize: 22 }}>{p.uf}</text>
                {/* Sem passar o mouse no slide: o valor vem escrito no estado. */}
                {slide && row.value !== null && (
                  <text x={p.x} y={p.y + 26} textAnchor="middle" style={{ fontSize: 20, fontWeight: 500 }}>
                    {formatMapValue(data.metric, row.value)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className={cn("flex items-center gap-3 text-muted-foreground", slide ? "text-[13px]" : "text-[10px]")}>
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: palette.mapEmpty }} /> sem pesquisas
        </span>
        <span className="inline-flex items-center gap-1.5">
          menos
          <span className="h-2.5 w-20 rounded-sm" style={{ background: palette.heatGradient }} />
          mais {metricLabel}
        </span>
      </div>
    </div>
  );
}
