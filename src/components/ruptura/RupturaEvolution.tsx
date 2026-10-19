import { useMemo, useState } from "react";
import { GlassCard } from "@/components/pricing/GlassCard";
import { SendToSlideIconButton } from "@/components/pricing/SendToSlideHover";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatNum } from "@/lib/format";
import { rupturaVisualPayload } from "@/lib/sendToSlide";
import { useRuptura } from "@/store/ruptura";
import { computeRupturaEvolution, effectiveEvoMetric, RUPTURA_EVO_METRICS, type RupturaEvoMetric } from "./visuals/data";
import { RupturaEvolutionVisual } from "./visuals/EvolutionVisual";
import { RUPTURA_VISUAL_IDS } from "./visuals/registry";
import type { RupturaView } from "./useRupturaView";

export function RupturaEvolution({ view }: { view: RupturaView }) {
  const { model, period, withRate } = view;
  const filters = useRuptura((s) => s.filters);
  const setPeriod = useRuptura((s) => s.setPeriod);
  const [metric, setMetric] = useState<RupturaEvoMetric>("occurrences");
  const [constantStores, setConstantStores] = useState(false);
  const effective = effectiveEvoMetric(metric, withRate);

  // A linha do tempo mostra a base inteira (com os demais filtros); o período
  // escolhido aparece destacado e pode ser trocado clicando nos meses.
  const data = useMemo(
    () => computeRupturaEvolution(view, filters, { metric, sameStores: constantStores }),
    [view, filters, metric, constantStores],
  );

  const fullSelected = period.from === 0 && period.to === model.months.length - 1;

  const onPick = (month: number, extend: boolean) => {
    if (extend) setPeriod({ from: Math.min(period.from, month), to: Math.max(period.to, month) });
    else setPeriod({ from: month, to: month });
  };

  return (
    <GlassCard className="group/send-slide flex h-full flex-col gap-3 p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium">Evolução mensal</h2>
          <p className="text-[11px] text-muted-foreground">Clique num mês para analisá-lo; Shift+clique estende o intervalo</p>
        </div>
        <div className="flex items-center gap-1">
          <ToggleGroup type="single" value={effective} onValueChange={(v) => v && setMetric(v as RupturaEvoMetric)} className="gap-1">
            {RUPTURA_EVO_METRICS.map((m) => (
              <ToggleGroupItem
                key={m.id}
                value={m.id}
                disabled={m.id === "rate" && !withRate}
                title={m.id === "rate" && !withRate ? "Disponível quando a base trouxer respostas “Não”" : undefined}
                className="h-7 px-2 text-[11px]"
              >
                {m.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <SendToSlideIconButton
            payload={rupturaVisualPayload({
              visualization: "Evolução mensal da ruptura",
              visualId: RUPTURA_VISUAL_IDS.evolucao,
              params: { metric: effective, sameStores: constantStores ? "same" : "all" },
              filters,
              period,
            })}
          />
        </div>
      </header>

      <RupturaEvolutionVisual
        data={data}
        variant="tab"
        months={model.months}
        selection={fullSelected ? null : period}
        onPick={onPick}
        footerRight={(
          <label className="inline-flex cursor-pointer items-center gap-2">
            <Switch checked={constantStores} onCheckedChange={setConstantStores} aria-label="Comparar só as mesmas lojas" />
            Mesmas lojas em todo o período
            {constantStores && <span className="tabular-nums">({formatNum(data.sameStoresCount)} lojas)</span>}
          </label>
        )}
      />
    </GlassCard>
  );
}
