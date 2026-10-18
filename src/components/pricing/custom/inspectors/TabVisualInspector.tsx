// Painel de um visual enviado de uma aba: de onde veio, período (ao vivo ou
// travado), opções do visual e o caminho de volta para a aba.
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink, Link2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { TabVisualBlock, TabVisualPeriod } from "@/lib/customSlide";
import type { Filters, FilterKey } from "@/lib/types";
import {
  resolveTabVisualPeriods,
  sortedPeriodsOf,
  tabVisualPeriodOptions,
  tabVisualPeriodRange,
  tabVisualPeriodSummary,
} from "@/lib/tabVisualPeriod";
import { requestCloseSlidesEditor } from "@/lib/slidesEditorEvents";
import { useDeckPricingRows } from "@/hooks/useDeckRows";
import { usePricing } from "@/store/pricing";
import { getTabVisual } from "@/components/pricing/tabVisuals/registry";
import { flushPendingEditorEmit } from "../editorStore";
import { DraftInput } from "../DraftInput";
import { Row, Section, Segmented, SelectField, ToggleField } from "../chart/Inspector";

const WINDOW_CHOICES = [1, 3, 6, 12, 24];

export function TabVisualInspector({ block, onChange }: {
  block: TabVisualBlock;
  onChange: (patch: Partial<TabVisualBlock>) => void;
}) {
  const navigate = useNavigate();
  const visual = getTabVisual(block.visualId);
  const deckRows = useDeckPricingRows();
  const range = useMemo(() => tabVisualPeriodRange(deckRows, block.period), [deckRows, block.period]);

  if (!visual) {
    return <p className="slides-type-helper">Este visual não existe nesta versão do app.</p>;
  }

  const live = block.period.mode === "live";
  const setMode = (mode: "live" | "locked") => {
    if (mode === block.period.mode) return;
    const all = sortedPeriodsOf(deckRows);
    // Travar congela exatamente o que está na tela agora; destravar volta a
    // acompanhar o mês de referência com a mesma janela.
    const shown = resolveTabVisualPeriods(deckRows, block.period);
    const options = tabVisualPeriodOptions(shown, all);
    onChange({ period: mode === "live" ? options.live : options.locked });
  };

  const months = block.period.mode === "live" ? block.period.months : null;
  const windowOptions = [
    { value: "all", label: "Todo o histórico" },
    ...[...new Set([...WINDOW_CHOICES, ...(months ? [months] : [])])]
      .sort((a, b) => a - b)
      .map((n) => ({ value: String(n), label: n === 1 ? "Só o mês de referência" : `Últimos ${n} meses` })),
  ];

  const openInTab = () => {
    flushPendingEditorEmit();
    const pricing = usePricing.getState();
    pricing.clearFilters();
    for (const [key, values] of Object.entries(block.filters ?? {}) as Array<[FilterKey, string[] | undefined]>) {
      if (values?.length) pricing.setFilter(key as keyof Filters, values);
    }
    // Os meses que o slide mostra; "todos" só se forem mesmo todos os da aba
    // (com mês de referência, o deck vê menos meses que a aba).
    const shown = resolveTabVisualPeriods(deckRows, block.period) ?? sortedPeriodsOf(deckRows);
    pricing.setSelectedPeriods(shown.length === sortedPeriodsOf(pricing.rows).length ? null : shown);
    visual.applyParamsToTab(block.params);
    requestCloseSlidesEditor();
    navigate(visual.route);
    toast.info(`${visual.page} aberta com os filtros e meses deste slide.`);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">Igual à aba · {visual.page}</div>
        <div className="mt-0.5 text-[12px] font-medium text-foreground">{visual.title}</div>
        <p className="mt-1 slides-type-helper">
          É o mesmo gráfico da aba, no visual do slide. Os dados vêm das bases carregadas.
        </p>
        <Button size="sm" variant="outline" className="mt-2 h-7 gap-1.5 text-[11px]" onClick={openInTab}>
          <ExternalLink className="h-3.5 w-3.5" /> Abrir na aba
        </Button>
      </div>

      <Section title="Período" defaultOpen>
        <Segmented<"live" | "locked">
          value={block.period.mode}
          onChange={setMode}
          options={[
            { value: "live", label: "Ao vivo", icon: <Link2 className="h-3 w-3" />, title: "Acompanha o mês de referência do deck" },
            { value: "locked", label: "Travado", icon: <Lock className="h-3 w-3" />, title: "Fica nos meses de agora" },
          ]}
        />
        {live && (
          <Row label="Janela">
            <SelectField
              value={months == null ? "all" : String(months)}
              onChange={(v) => onChange({ period: { mode: "live", months: v === "all" ? null : Number(v) } satisfies TabVisualPeriod })}
              options={windowOptions}
            />
          </Row>
        )}
        <p className="slides-type-helper">
          {tabVisualPeriodSummary(block.period)}. Mostrando agora: <span className="font-medium text-foreground">{range}</span>.
        </p>
      </Section>

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

      <Section title="Título" defaultOpen>
        <ToggleField label="Mostrar título" value={block.showTitle} onChange={(v) => onChange({ showTitle: v })} />
        {block.showTitle && (
          <DraftInput value={block.title} onCommit={(v) => onChange({ title: v })} placeholder={visual.title} />
        )}
      </Section>
    </div>
  );
}
