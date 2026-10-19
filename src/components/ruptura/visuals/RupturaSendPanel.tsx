// Parte do diálogo "Enviar para Slide" quando o envio é um visual da Ruptura:
// a prévia real (o mesmo componente, no visual do slide e com os dados que o
// slide vai mostrar), o que vai junto e o período.
import { useMemo } from "react";
import { Filter, Link2, Lock } from "lucide-react";
import type { TabVisualPeriod } from "@/lib/customSlide";
import type { RupturaFilters } from "@/lib/ruptura/metrics";
import type { RupturaModel } from "@/lib/ruptura/types";
import { resolveRupturaPeriod, rupturaPeriodRange, rupturaPeriodSummary } from "@/lib/rupturaVisualPeriod";
import { SLIDE_HEX } from "@/lib/slideColors";
import { TabVisualSurface } from "@/components/pricing/tabVisuals/TabVisualSurface";
import { cn } from "@/lib/utils";
import { DIM_LABEL } from "../RupturaFilterBar";
import { computeRupturaVisual, type RupturaVisualDefinition } from "./registry";

export function RupturaSendPanel({
  visual,
  model,
  reference,
  params,
  filters,
  period,
  options,
  onPeriodChange,
}: {
  visual: RupturaVisualDefinition;
  model: RupturaModel;
  reference: string | null;
  params: Record<string, unknown>;
  filters: RupturaFilters;
  period: TabVisualPeriod;
  options: { live: TabVisualPeriod; locked: TabVisualPeriod };
  onPeriodChange: (period: TabVisualPeriod) => void;
}) {
  const history = visual.scope?.(params) === "history";
  const data = useMemo(
    () => computeRupturaVisual(visual, model, { params, filters, period }, reference),
    [visual, model, params, filters, period, reference],
  );
  const range = useMemo(
    () => rupturaPeriodRange(
      model,
      history ? { from: 0, to: model.months.length - 1 } : resolveRupturaPeriod(model, period, reference),
    ),
    [model, history, period, reference],
  );
  const chips = Object.entries(filters).filter(([, values]) => values && values.length > 0) as Array<[keyof typeof DIM_LABEL, string[]]>;
  const Visual = visual.Component;

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
      <div className="overflow-hidden rounded-xl border border-border/60 bg-white p-3 shadow-sm">
        <div style={{ fontFamily: "Calibri, Arial, sans-serif", fontSize: 15, fontWeight: 700, color: SLIDE_HEX.chart2, padding: "0 4px 6px" }}>
          {visual.title}
        </div>
        <div className="h-[230px]">
          {data == null || visual.isEmpty(data as never)
            ? <div className="flex h-full items-center justify-center text-sm text-slate-500">Sem dados para estes filtros e meses.</div>
            : (
              <TabVisualSurface layout={visual.layout} designWidth={visual.designWidth}>
                <Visual data={data as never} params={params} variant="slide" />
              </TabVisualSurface>
            )}
        </div>
      </div>

      <div className="space-y-4 text-xs">
        <div>
          <div className="mb-1.5 font-semibold text-foreground">Vai igual à aba</div>
          <p className="text-muted-foreground">
            O mesmo visual, no estilo do slide. Dá para trocar as opções, os filtros e os meses depois, no painel do elemento.
          </p>
        </div>

        <div>
          <div className="mb-1.5 flex items-center gap-1.5 font-semibold text-foreground">
            <Filter className="h-3.5 w-3.5" /> Filtros
          </div>
          {chips.length === 0 ? (
            <span className="text-muted-foreground">Sem filtros — a base inteira.</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {chips.map(([key, values]) => (
                <span key={key} className="rounded-full border border-border/60 bg-secondary/50 px-2 py-0.5 text-[11px]">
                  {DIM_LABEL[key]}: {values.length <= 2 ? values.join(", ") : `${values.length} selecionados`}
                </span>
              ))}
            </div>
          )}
        </div>

        {history ? (
          <div>
            <div className="mb-1.5 font-semibold text-foreground">Meses</div>
            <p className="text-muted-foreground">
              Como na aba, a linha do tempo mostra a base inteira ({range}) e acompanha o mês mais recente.
            </p>
          </div>
        ) : (
          <div>
            <div className="mb-1.5 font-semibold text-foreground">Meses</div>
            <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Período no slide">
              {(["live", "locked"] as const).map((mode) => {
                const active = period.mode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onPeriodChange(options[mode])}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[12px] font-medium transition-colors",
                      active ? "border-primary bg-primary/10 text-foreground" : "border-border/60 text-muted-foreground hover:bg-secondary/40",
                    )}
                  >
                    {mode === "live" ? <Link2 className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                    {mode === "live" ? "Ao vivo" : "Travado"}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-muted-foreground">
              {rupturaPeriodSummary(period)}. No slide: <span className="font-medium text-foreground">{range}</span>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
