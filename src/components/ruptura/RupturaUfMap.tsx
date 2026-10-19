import { useMemo, useState } from "react";
import { GlassCard } from "@/components/pricing/GlassCard";
import { SendToSlideIconButton } from "@/components/pricing/SendToSlideHover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatNum, formatPct } from "@/lib/format";
import { groupByKey } from "@/lib/ruptura/metrics";
import { UF_NAMES, ufFromEstado } from "@/lib/ruptura/uf";
import { rupturaVisualPayload } from "@/lib/sendToSlide";
import { useRuptura } from "@/store/ruptura";
import { computeRupturaMap, effectiveMapMetric, RUPTURA_MAP_METRICS, UF_LIST, type RupturaMapMetric } from "./visuals/data";
import { RupturaMapVisual } from "./visuals/MapVisual";
import { RUPTURA_VISUAL_IDS } from "./visuals/registry";
import type { RupturaView } from "./useRupturaView";

export function RupturaUfMap({ view }: { view: RupturaView }) {
  const { model, predicate, withRate, period } = view;
  const filters = useRuptura((s) => s.filters);
  const setFilter = useRuptura((s) => s.setFilter);
  const [metric, setMetric] = useState<RupturaMapMetric>("occurrences");
  const [hover, setHover] = useState<string | null>(null);
  const effective = effectiveMapMetric(metric, withRate);

  const data = useMemo(() => computeRupturaMap(view, metric), [view, metric]);
  const rows = useMemo(() => new Map(data.rows.map((r) => [r.uf, r.row])), [data.rows]);
  const storeUf = useMemo(() => {
    const idx = new Map(UF_LIST.map((u, i) => [u, i]));
    return model.stores.uf.map((u) => (u ? idx.get(u) ?? -1 : -1));
  }, [model]);

  // Categorias mais afetadas só do estado sob o mouse (uma passada, sob demanda).
  const hoverCats = useMemo(() => {
    if (!hover) return [];
    const ufIdx = UF_LIST.indexOf(hover);
    const cat = model.skus.categoria;
    const cats = groupByKey(
      model,
      (i) => predicate(i) && storeUf[model.cells.store[i]] === ufIdx,
      (i) => cat[model.cells.sku[i]],
      (k) => model.dict.categoria[k],
      false,
    );
    return cats.slice(0, 3);
  }, [hover, model, predicate, storeUf]);

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
    <GlassCard className="group/send-slide flex h-full flex-col gap-3 p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium">Ruptura por estado</h2>
          <p className="text-[11px] text-muted-foreground">Clique num estado para filtrar a aba</p>
        </div>
        <div className="flex items-center gap-1">
          <ToggleGroup type="single" value={effective} onValueChange={(v) => v && setMetric(v as RupturaMapMetric)} className="gap-1">
            {RUPTURA_MAP_METRICS.map((m) => {
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
          <SendToSlideIconButton
            payload={rupturaVisualPayload({
              visualization: "Ruptura por estado",
              visualId: RUPTURA_VISUAL_IDS.mapa,
              params: { metric: effective },
              filters,
              period,
            })}
          />
        </div>
      </header>

      <div className="relative flex min-h-[260px] flex-1 flex-col">
        <RupturaMapVisual
          data={data}
          variant="tab"
          selectedUfs={selectedUfs}
          hover={hover}
          onHover={setHover}
          onToggle={toggleUf}
          className="h-full max-h-[420px] w-full"
        />

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
    </GlassCard>
  );
}
