import { useMemo, useState } from "react";
import brMapRaw from "@/assets/br.svg?raw";
import { GlassCard } from "@/components/pricing/GlassCard";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatNum, formatPct } from "@/lib/format";
import { groupByKey, type RupturaGroupRow } from "@/lib/ruptura/metrics";
import { UF_NAMES, ufFromEstado } from "@/lib/ruptura/uf";
import { useRuptura } from "@/store/ruptura";
import { cn } from "@/lib/utils";
import type { RupturaView } from "./useRupturaView";

type MapMetric = "occurrences" | "storesAffected" | "rate";

const METRICS: Array<{ id: MapMetric; label: string }> = [
  { id: "occurrences", label: "Ocorrências" },
  { id: "storesAffected", label: "Lojas afetadas" },
  { id: "rate", label: "Taxa" },
];

type StatePath = { uf: string; d: string };
type LabelPoint = { uf: string; x: number; y: number };

const SVG_UF_ID = /^BR([A-Z]{2})$/;

function parseBrazilSvg(raw: string): { states: StatePath[]; points: LabelPoint[] } {
  const doc = new DOMParser().parseFromString(raw, "image/svg+xml");
  const states = Array.from(doc.querySelectorAll("g#features path"))
    .map((p) => {
      const m = (p.getAttribute("id") ?? "").match(SVG_UF_ID);
      const d = p.getAttribute("d") ?? "";
      return m && d ? { uf: m[1], d } : null;
    })
    .filter((s): s is StatePath => !!s);
  const points = Array.from(doc.querySelectorAll("g#label_points circle"))
    .map((c) => {
      const m = (c.getAttribute("id") ?? "").match(SVG_UF_ID);
      return m ? { uf: m[1], x: Number(c.getAttribute("cx") ?? 0), y: Number(c.getAttribute("cy") ?? 0) } : null;
    })
    .filter((p): p is LabelPoint => !!p && p.x > 0 && p.y > 0);
  return { states, points };
}

function metricValue(row: RupturaGroupRow | undefined, metric: MapMetric): number | null {
  if (!row) return null;
  if (metric === "rate") return row.rate;
  return row[metric];
}

function fmt(metric: MapMetric, v: number): string {
  return metric === "rate" ? formatPct(v) : formatNum(v);
}

export function RupturaUfMap({ view }: { view: RupturaView }) {
  const { model, predicate, withRate } = view;
  const filters = useRuptura((s) => s.filters);
  const setFilter = useRuptura((s) => s.setFilter);
  const [metric, setMetric] = useState<MapMetric>("occurrences");
  const [hover, setHover] = useState<string | null>(null);
  const effective: MapMetric = metric === "rate" && !withRate ? "occurrences" : metric;

  const geo = useMemo(() => parseBrazilSvg(brMapRaw), []);
  const ufList = useMemo(() => Object.keys(UF_NAMES).sort(), []);
  const storeUf = useMemo(() => {
    const idx = new Map(ufList.map((u, i) => [u, i]));
    return model.stores.uf.map((u) => (u ? idx.get(u) ?? -1 : -1));
  }, [model, ufList]);

  const rows = useMemo(() => {
    const out = groupByKey(model, predicate, (i) => storeUf[model.cells.store[i]], (k) => ufList[k] ?? "—", withRate);
    return new Map(out.filter((r) => r.key >= 0).map((r) => [ufList[r.key], r]));
  }, [model, predicate, storeUf, ufList, withRate]);

  // Categorias mais afetadas só do estado sob o mouse (uma passada, sob demanda).
  const hoverCats = useMemo(() => {
    if (!hover) return [];
    const ufIdx = ufList.indexOf(hover);
    const cat = model.skus.categoria;
    const cats = groupByKey(
      model,
      (i) => predicate(i) && storeUf[model.cells.store[i]] === ufIdx,
      (i) => cat[model.cells.sku[i]],
      (k) => model.dict.categoria[k],
      false,
    );
    return cats.slice(0, 3);
  }, [hover, model, predicate, storeUf, ufList]);

  const values = [...rows.values()].map((r) => metricValue(r, effective)).filter((v): v is number => v !== null);
  const max = values.length ? Math.max(...values) : 0;
  const selectedUfs = new Set((filters.estado ?? []).map((e) => ufFromEstado(e)).filter(Boolean));

  const toggleUf = (uf: string) => {
    const labels = model.dict.estado.filter((label) => ufFromEstado(label) === uf);
    if (labels.length === 0) return;
    const current = filters.estado ?? [];
    const on = labels.every((l) => current.includes(l));
    setFilter("estado", on ? current.filter((c) => !labels.includes(c)) : [...new Set([...current, ...labels])]);
  };

  const hovered = hover ? rows.get(hover) : undefined;

  return (
    <GlassCard className="flex h-full flex-col gap-3 p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium">Ruptura por estado</h2>
          <p className="text-[11px] text-muted-foreground">Clique num estado para filtrar a aba</p>
        </div>
        <ToggleGroup type="single" value={effective} onValueChange={(v) => v && setMetric(v as MapMetric)} className="gap-1">
          {METRICS.map((m) => {
            const disabled = m.id === "rate" && !withRate;
            const item = (
              <ToggleGroupItem key={m.id} value={m.id} disabled={disabled} className="h-7 px-2 text-[11px]" aria-label={m.label}>
                {m.label}
              </ToggleGroupItem>
            );
            return disabled ? (
              <Tooltip key={m.id}>
                <TooltipTrigger asChild><span>{item}</span></TooltipTrigger>
                <TooltipContent className="text-xs">Disponível quando a base trouxer respostas “Não”.</TooltipContent>
              </Tooltip>
            ) : item;
          })}
        </ToggleGroup>
      </header>

      <div className="relative min-h-[260px] flex-1">
        <svg viewBox="0 0 1000 912" role="img" aria-label="Mapa do Brasil com a ruptura por estado" className="h-full max-h-[420px] w-full">
          {geo.states.map((s) => {
            const row = rows.get(s.uf);
            const v = metricValue(row, effective);
            const has = row !== undefined;
            const t = has && v !== null && max > 0 ? v / max : 0;
            const selected = selectedUfs.has(s.uf);
            return (
              <path
                key={s.uf}
                d={s.d}
                role={has ? "button" : undefined}
                tabIndex={has ? 0 : undefined}
                aria-label={has ? `${UF_NAMES[s.uf]}: ${v === null ? "sem valor" : fmt(effective, v)}` : `${UF_NAMES[s.uf]}: sem pesquisas`}
                onMouseEnter={() => setHover(s.uf)}
                onMouseLeave={() => setHover((h) => (h === s.uf ? null : h))}
                onFocus={() => setHover(s.uf)}
                onBlur={() => setHover((h) => (h === s.uf ? null : h))}
                onClick={() => has && toggleUf(s.uf)}
                onKeyDown={(e) => { if (has && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggleUf(s.uf); } }}
                className={cn("transition-[fill,opacity] outline-none", has && "cursor-pointer")}
                style={{
                  fill: has ? `hsl(var(--destructive) / ${(0.14 + 0.78 * t).toFixed(3)})` : "hsl(var(--muted) / 0.55)",
                  stroke: selected ? "hsl(var(--foreground))" : hover === s.uf ? "hsl(var(--foreground) / 0.6)" : "hsl(var(--background))",
                  strokeWidth: selected ? 3 : 1.2,
                }}
              />
            );
          })}
          {geo.points.map((p) => (rows.has(p.uf) ? (
            <text key={p.uf} x={p.x} y={p.y + 5} textAnchor="middle" className="pointer-events-none select-none" style={{ fontSize: 22, fontWeight: 600, fill: "hsl(var(--foreground) / 0.85)" }}>
              {p.uf}
            </text>
          ) : null))}
        </svg>

        {hover && (
          <div className="pointer-events-none absolute right-0 top-0 w-[220px] rounded-xl border border-border/50 bg-popover/95 p-3 text-xs shadow-lg backdrop-blur" role="status">
            <div className="mb-1.5 font-medium">{UF_NAMES[hover]}</div>
            {hovered ? (
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 tabular-nums">
                <dt className="text-muted-foreground">Lojas com registro</dt><dd className="text-right">{formatNum(hovered.storesSurveyed)}</dd>
                <dt className="text-muted-foreground">Lojas afetadas</dt><dd className="text-right">{formatNum(hovered.storesAffected)}</dd>
                <dt className="text-muted-foreground">Ocorrências</dt><dd className="text-right">{formatNum(hovered.occurrences)}</dd>
                <dt className="text-muted-foreground">Taxa</dt><dd className="text-right">{hovered.rate === null ? "indisponível" : formatPct(hovered.rate)}</dd>
                <dt className="text-muted-foreground">Receita / margem potencial</dt><dd className="text-right">indisponível</dd>
              </dl>
            ) : (
              <p className="text-muted-foreground">Sem pesquisas no recorte (não é zero: o estado não foi pesquisado).</p>
            )}
            {hovered && hoverCats.length > 0 && (
              <div className="mt-2 border-t border-border/40 pt-1.5">
                <div className="mb-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Categorias mais afetadas</div>
                {hoverCats.map((c) => (
                  <div key={c.key} className="flex justify-between gap-2"><span className="truncate">{c.label}</span><span className="tabular-nums text-muted-foreground">{formatPct(c.share, 0)}</span></div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "hsl(var(--muted) / 0.55)" }} /> sem pesquisas</span>
        <span className="inline-flex items-center gap-1.5">
          menos
          <span className="h-2.5 w-20 rounded-sm" style={{ background: "linear-gradient(90deg, hsl(var(--destructive) / 0.14), hsl(var(--destructive) / 0.92))" }} />
          mais {METRICS.find((m) => m.id === effective)?.label.toLowerCase()}
        </span>
      </div>
    </GlassCard>
  );
}
