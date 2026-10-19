// Painel de um visual da Ruptura no slide: de onde veio, período (ao vivo ou
// travado), opções, filtros da ruptura e o caminho de volta para a aba.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ExternalLink, Link2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MultiSelectFilter } from "@/components/pricing/MultiSelectFilter";
import type { RupturaVisualBlock, TabVisualPeriod } from "@/lib/customSlide";
import { filterOptions } from "@/lib/ruptura/metrics";
import type { RupturaDim } from "@/lib/ruptura/types";
import {
  resolveRupturaPeriod,
  rupturaPeriodOptions,
  rupturaPeriodRange,
  rupturaPeriodSummary,
} from "@/lib/rupturaVisualPeriod";
import { requestCloseSlidesEditor } from "@/lib/slidesEditorEvents";
import { useSlidesFlow } from "@/store/slidesFlow";
import { useRuptura } from "@/store/ruptura";
import { getRupturaVisual } from "@/components/ruptura/visuals/registry";
import { useRupturaModel } from "@/components/ruptura/visuals/useRupturaModel";
import { DIM_LABEL } from "@/components/ruptura/RupturaFilterBar";
import { cn } from "@/lib/utils";
import { flushPendingEditorEmit } from "../editorStore";
import { DraftInput } from "../DraftInput";
import { Row, Section, Segmented, SelectField, ToggleField } from "../chart/Inspector";

const WINDOW_CHOICES = [1, 3, 6, 12];
const PRIMARY: RupturaDim[] = ["marca", "categoria", "sku", "rede", "canal", "estado"];
const SECONDARY: RupturaDim[] = ["linha", "bandeira", "pdv", "regional", "cidade"];

export function RupturaVisualInspector({ block, onChange }: {
  block: RupturaVisualBlock;
  onChange: (patch: Partial<RupturaVisualBlock>) => void;
}) {
  const navigate = useNavigate();
  const visual = getRupturaVisual(block.visualId);
  const { model } = useRupturaModel();
  const reference = useSlidesFlow((s) => s.referencePeriod);
  const [moreFilters, setMoreFilters] = useState(() => SECONDARY.some((d) => (block.filters[d]?.length ?? 0) > 0));

  const shown = useMemo(
    () => (model ? resolveRupturaPeriod(model, block.period, reference) : null),
    [model, block.period, reference],
  );

  if (!visual) return <p className="slides-type-helper">Este visual não existe nesta versão do app.</p>;

  const history = visual.scope?.(block.params) === "history";
  const live = block.period.mode === "live";
  const range = model && shown ? rupturaPeriodRange(model, history ? { from: 0, to: model.months.length - 1 } : shown) : "—";

  const setMode = (mode: "live" | "locked") => {
    if (mode === block.period.mode || !model || !shown) return;
    // Travar congela os meses que estão na tela; destravar volta a acompanhar a base com a mesma janela.
    const options = rupturaPeriodOptions(model, shown, reference);
    onChange({ period: mode === "live" ? options.live : options.locked });
  };

  const livePeriod = block.period.mode === "live" ? block.period : null;
  const months = livePeriod?.months ?? null;
  const custom = !!livePeriod && (livePeriod.endOffset ?? 0) > 0;
  const windowValue = custom ? "custom" : months == null ? "all" : String(months);
  const windowOptions = [
    ...(custom ? [{ value: "custom", label: "Meses escolhidos na aba" }] : []),
    { value: "all", label: "Todo o histórico" },
    ...[...new Set([...WINDOW_CHOICES, ...(months && !custom ? [months] : [])])]
      .sort((a, b) => a - b)
      .map((n) => ({ value: String(n), label: n === 1 ? "Só o mês mais recente" : `Últimos ${n} meses` })),
  ];

  const openInTab = () => {
    if (!model || !shown) return;
    flushPendingEditorEmit();
    const store = useRuptura.getState();
    store.clearFilters();
    for (const [dim, values] of Object.entries(block.filters) as Array<[RupturaDim, string[] | undefined]>) {
      if (values?.length) store.setFilter(dim, values);
    }
    store.setPeriod(shown);
    requestCloseSlidesEditor();
    navigate(visual.route);
    toast.info("Ruptura aberta com os filtros e meses deste slide.");
  };

  const setFilter = (dim: RupturaDim, values: string[]) => {
    const next = { ...block.filters, [dim]: values };
    if (values.length === 0) delete next[dim];
    onChange({ filters: next });
  };
  const activeFilters = Object.values(block.filters).filter((v) => v && v.length > 0).length;

  const renderFilter = (dim: RupturaDim) => (
    <label key={dim} className="flex min-w-0 flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{DIM_LABEL[dim]}</span>
      <MultiSelectFilter
        options={model && shown ? filterOptions(model, block.filters, shown, dim).map((v) => ({ value: v, label: v })) : []}
        selected={block.filters[dim] ?? []}
        onChange={(next) => setFilter(dim, next)}
        placeholder="Todos"
      />
    </label>
  );

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">Igual à aba · {visual.page}</div>
        <div className="mt-0.5 text-[12px] font-medium text-foreground">{visual.title}</div>
        <p className="mt-1 slides-type-helper">
          É o mesmo visual da aba, no estilo do slide. Os dados vêm da base de ruptura carregada.
        </p>
        <Button size="sm" variant="outline" className="mt-2 h-7 gap-1.5 text-[11px]" onClick={openInTab} disabled={!model}>
          <ExternalLink className="h-3.5 w-3.5" /> Abrir na aba
        </Button>
      </div>

      {history ? (
        <Section title="Período" defaultOpen>
          <p className="slides-type-helper">
            Como na aba, a linha do tempo mostra a base inteira até o mês mais recente. Mostrando agora:{" "}
            <span className="font-medium text-foreground">{range}</span>.
          </p>
        </Section>
      ) : (
        <Section title="Período" defaultOpen>
          <Segmented<"live" | "locked">
            value={block.period.mode}
            onChange={setMode}
            options={[
              { value: "live", label: "Ao vivo", icon: <Link2 className="h-3 w-3" />, title: "Acompanha o mês mais recente da base" },
              { value: "locked", label: "Travado", icon: <Lock className="h-3 w-3" />, title: "Fica nos meses de agora" },
            ]}
          />
          {live && (
            <Row label="Janela">
              <SelectField
                value={windowValue}
                onChange={(v) => {
                  if (v === "custom") return;
                  onChange({ period: { mode: "live", months: v === "all" ? null : Number(v) } satisfies TabVisualPeriod });
                }}
                options={windowOptions}
              />
            </Row>
          )}
          <p className="slides-type-helper">
            {rupturaPeriodSummary(block.period)}. Mostrando agora: <span className="font-medium text-foreground">{range}</span>.
          </p>
        </Section>
      )}

      {visual.params.length > 0 && (
        <Section title="Opções" defaultOpen>
          {visual.params.map((control) => (
            <Row key={control.key} label={control.label}>
              <SelectField
                value={String(block.params[control.key] ?? visual.defaultParams[control.key] ?? control.options[0]?.value)}
                onChange={(v) => onChange({ params: { ...block.params, [control.key]: v } })}
                options={control.options}
              />
            </Row>
          ))}
        </Section>
      )}

      <Section title={activeFilters > 0 ? `Filtros (${activeFilters})` : "Filtros"} defaultOpen={activeFilters > 0}>
        {model ? (
          <div className="space-y-2.5">
            {PRIMARY.map(renderFilter)}
            {moreFilters && SECONDARY.map(renderFilter)}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-[11px] text-muted-foreground"
              onClick={() => setMoreFilters((v) => !v)}
              aria-expanded={moreFilters}
            >
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", moreFilters && "rotate-180")} />
              {moreFilters ? "Menos filtros" : "Mais filtros (linha, bandeira, PDV, regional, cidade)"}
            </Button>
            {activeFilters > 0 && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => onChange({ filters: {} })}>
                Limpar filtros
              </Button>
            )}
          </div>
        ) : (
          <p className="slides-type-helper">Carregue a base de ruptura para escolher filtros.</p>
        )}
      </Section>

      <Section title="Título" defaultOpen>
        <ToggleField label="Mostrar título" value={block.showTitle} onChange={(v) => onChange({ showTitle: v })} />
        {block.showTitle && (
          <DraftInput value={block.title} onCommit={(v) => onChange({ title: v })} placeholder={visual.title} />
        )}
      </Section>
    </div>
  );
}
