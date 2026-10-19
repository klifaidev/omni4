// Análise de Preço · Margem por UF. Peças usadas pela aba (interativas) e pelo
// slide (as mesmas, sem clique): o mapa, a legenda, o cartão da UF em foco e o
// ranking de volume.
import { BarChart3, Filter } from "lucide-react";
import { formatBRL, formatNum, formatPct } from "@/lib/format";
import { canColorState, type UfMapData, type UfMapPointData } from "./ufMapData";

const fmtRsKg = (v: number) => formatBRL(v, { digits: 2 });

function colorForMargin(value: number, min: number, max: number): string {
  const span = max - min;
  const t = span > 0 ? (value - min) / span : 0.5;
  return `hsl(${t * 220} 84% 54%)`;
}

export function MapMetric({
  label,
  value,
  helper,
  tone = "neutral",
}: {
  label: string;
  value: string;
  helper?: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  const color = tone === "positive" ? "text-success" : tone === "negative" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-md bg-secondary/40 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${color}`}>{value}</div>
      {helper && <div className="text-xs text-muted-foreground">{helper}</div>}
    </div>
  );
}

/** O mapa colorido por CM %. `onSelect` só existe na aba. */
export function UfMapSvg({
  map,
  selectedUf,
  onSelect,
  className = "h-[420px] w-full",
}: {
  map: UfMapData;
  selectedUf?: string | null;
  onSelect?: (uf: string) => void;
  className?: string;
}) {
  const dataByUf = new Map(map.data.map((point) => [point.uf, point]));
  const labelPointByUf = new Map(map.labelPoints.map((point) => [point.uf, point]));
  return (
    <svg viewBox="0 0 1000 912" role="img" aria-label="Mapa do Brasil por contribuição marginal percentual" className={className}>
      <defs>
        <filter id="uf-shadow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="8" stdDeviation="9" floodColor="#000000" floodOpacity="0.28" />
        </filter>
      </defs>
      {map.states.map((state) => {
        const stateData = dataByUf.get(state.uf);
        const hasVolume = Boolean(stateData && canColorState(stateData));
        const selectedState = selectedUf === state.uf;
        const labelPoint = labelPointByUf.get(state.uf);
        const transform =
          selectedState && labelPoint
            ? `translate(${labelPoint.x} ${labelPoint.y}) scale(1.045) translate(${-labelPoint.x} ${-labelPoint.y})`
            : undefined;
        return (
          <g key={state.uf} transform={transform} className="transition-transform duration-200">
            <path
              d={state.d}
              fill={hasVolume ? colorForMargin(stateData!.margemPct, map.minMargin, map.maxMargin) : "hsl(var(--muted) / 0.85)"}
              opacity={hasVolume ? 0.9 : 0.68}
              stroke={selectedState ? "hsl(var(--foreground))" : "hsl(var(--background))"}
              strokeWidth={selectedState ? 2.6 : 0.8}
              className={hasVolume && onSelect ? "cursor-pointer transition-opacity hover:opacity-100" : ""}
              filter={selectedState ? "url(#uf-shadow)" : undefined}
              onClick={() => hasVolume && onSelect?.(state.uf)}
            >
              <title>
                {state.name}
                {hasVolume
                  ? ` • CM ${formatPct(stateData!.margemPct)} • Vol ${formatPct(stateData!.volumeShare)}`
                  : " • sem volume no período"}
              </title>
            </path>
          </g>
        );
      })}
      {map.labelPoints.map((point) => {
        const stateData = dataByUf.get(point.uf);
        const hasVolume = Boolean(stateData && canColorState(stateData));
        return (
          <g
            key={point.uf}
            tabIndex={hasVolume && onSelect ? 0 : -1}
            role={onSelect ? "button" : undefined}
            aria-label={
              hasVolume
                ? `${point.label}: CM ${formatPct(stateData!.margemPct)}, ${formatPct(stateData!.volumeShare)} do volume`
                : `${point.label}: sem volume no período`
            }
            onClick={() => hasVolume && onSelect?.(point.uf)}
            onKeyDown={(event) => {
              if (hasVolume && onSelect && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                onSelect(point.uf);
              }
            }}
            className={hasVolume && onSelect ? "cursor-pointer outline-none" : "outline-none"}
          >
            <text
              x={point.x}
              y={point.y + 5}
              textAnchor="middle"
              paintOrder="stroke"
              stroke="#1f2937"
              strokeWidth={1.1}
              className="select-none fill-white text-[18px] font-black"
            >
              {point.uf}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function UfLegend({ map }: { map: UfMapData }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/35 px-3 py-2 text-[11px] text-muted-foreground">
      <span>Menor CM · <strong className="font-medium text-foreground">{formatPct(map.minMargin)}</strong></span>
      <div className="flex min-w-[220px] flex-1 items-center gap-2 sm:max-w-sm">
        <span>baixa</span>
        <div className="h-2 flex-1 rounded-full bg-gradient-to-r from-red-500 via-emerald-400 to-blue-500 shadow-[0_0_18px_hsl(var(--primary)/0.16)]" />
        <span>alta</span>
      </div>
      <span>Maior CM · <strong className="font-medium text-foreground">{formatPct(map.maxMargin)}</strong></span>
    </div>
  );
}

/** Cartão da UF em foco. `onApplyFilter` (só na aba) mostra o botão de filtrar a visão. */
export function UfFocusCard({ selected, onApplyFilter, compact }: { selected: UfMapPointData; onApplyFilter?: () => void; compact?: boolean }) {
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">UF em foco</div>
          <h3 className="mt-1 text-2xl font-semibold">{selected.label}</h3>
        </div>
        <span className="rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground">{selected.uf}</span>
      </div>
      <div className={compact ? "mt-3 grid grid-cols-2 gap-2" : "mt-4 grid gap-2"}>
        <MapMetric label="Contrib. Marginal %" value={formatPct(selected.margemPct)} />
        <MapMetric label="Preço médio" value={`${fmtRsKg(selected.precoMedio)}/kg`} />
        <MapMetric label="Importância no volume" value={formatPct(selected.volumeShare)} helper={`${formatNum(selected.volumeKg / 1000, 1)} t`} />
        <MapMetric
          label="Variação vs. base"
          value={
            selected.variacaoPreco === null
              ? "Sem base"
              : `${selected.variacaoPreco >= 0 ? "+" : "−"}${fmtRsKg(Math.abs(selected.variacaoPreco))}/kg`
          }
          tone={selected.variacaoPreco === null ? "neutral" : selected.variacaoPreco >= 0 ? "positive" : "negative"}
        />
      </div>
      {onApplyFilter && (
        <button
          type="button"
          onClick={onApplyFilter}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition hover:bg-primary hover:text-primary-foreground"
        >
          <Filter className="h-4 w-4" />
          Filtrar visão por {selected.uf}
        </button>
      )}
    </div>
  );
}

export function UfRanking({ map, onSelect, limit = 6 }: { map: UfMapData; onSelect?: (uf: string) => void; limit?: number }) {
  const ranked = [...map.active].sort((a, b) => b.volumeKg - a.volumeKg).slice(0, limit);
  return (
    <div className="rounded-lg border border-border/60 bg-background/55 p-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-medium">Ranking de volume</h3>
      </div>
      <div className="mt-3 space-y-2.5">
        {ranked.map((point) => (
          <button
            key={point.uf}
            type="button"
            onClick={() => onSelect?.(point.uf)}
            className={`w-full rounded-md px-2 py-2 text-left ${onSelect ? "hover:bg-secondary/50" : "cursor-default"}`}
          >
            <span className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span className="rounded-md bg-secondary px-2 py-1 text-center text-xs font-semibold">{point.uf}</span>
                <span className="truncate text-sm font-medium">{point.label}</span>
              </span>
              <span className="text-xs font-medium tabular-nums">{formatPct(point.margemPct)}</span>
            </span>
            <span className="mt-2 flex items-center gap-2">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(4, (point.volumeShare / Math.max(map.maxShare, 0.0001)) * 100)}%` }}
                />
              </span>
              <span className="w-14 text-right text-[11px] text-muted-foreground">{formatPct(point.volumeShare)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** O visual do slide: mapa + legenda, e ao lado a UF em foco (se escolhida) e o ranking. */
export function UfMapVisual({ data, params }: { data: UfMapData; params: Record<string, unknown> }) {
  const focus = typeof params.uf === "string" ? data.active.find((point) => point.uf === params.uf) ?? null : null;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-5">
      <div className="space-y-3">
        <UfMapSvg map={data} selectedUf={focus?.uf ?? null} className="h-[440px] w-full" />
        <UfLegend map={data} />
      </div>
      <aside className="space-y-4">
        {/* Com a UF em foco o painel divide a altura: cartão em 2 colunas e ranking de 4. */}
        {focus && <UfFocusCard selected={focus} compact />}
        <UfRanking map={data} limit={focus ? 4 : 6} />
      </aside>
    </div>
  );
}
