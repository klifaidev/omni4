import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { BridgeEffectCard, BridgeRankingVisual } from "@/components/pricing/tabVisuals/BridgeVisuals";
import {
  BRIDGE_EFFECT_INFO, BRIDGE_RANKING_EFFECTS, computeBridgeEffects, computeBridgeRanking,
  type BridgeRankingEffect, type BridgeRankingLevel, type BridgeScope,
} from "@/components/pricing/tabVisuals/bridgeData";
import { TAB_VISUAL_IDS } from "@/components/pricing/tabVisuals/registry";
import { tabVisualPayload, captureSendToSlide, type SendToSlidePayload } from "@/lib/sendToSlide";
import { sortedPeriodsOf } from "@/lib/tabVisualPeriod";
import { getDeckPricingRows } from "@/hooks/useDeckRows";
import { Waterfall } from "@/components/pricing/Waterfall";
import { EmptyState } from "@/components/pricing/EmptyState";
import { SendToSlideIconButton } from "@/components/pricing/SendToSlideHover";
import { usePricing } from "@/store/pricing";
import { useFyList, useMonthsInfo } from "@/store/selectors";
import { applyFilters, calcPVM, type PVMResult } from "@/lib/analytics";
import { buildPvmReading as buildSharedPvmReading } from "@/lib/pvmReading";
import { exportPvmCsv } from "@/lib/exportCsv";
import { formatBRL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowRight, BookOpen, Calendar, CalendarDays, Download, Info, Plus, Send, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { QuickActivityDialog, type QuickActivityPrefill } from "@/components/atividades/QuickActivityDialog";
import { toast } from "sonner";
import { usePageTitle } from "@/hooks/use-page-title";
import type { PricingRow } from "@/lib/types";

export default function BridgePvm() {
  usePageTitle("Bridge PVM");
  const rows = usePricing((s) => s.rows);
  const metric = usePricing((s) => s.metric);
  const filters = usePricing((s) => s.filters);
  const fyList = useFyList();
  const months = useMonthsInfo();
  const pvmMode = usePricing((s) => s.pvmMode);
  const pvmBase = usePricing((s) => s.pvmBase);
  const pvmComp = usePricing((s) => s.pvmComp);
  const setPvm = usePricing((s) => s.setPvm);
  const setPvmMode = usePricing((s) => s.setPvmMode);
  const selectedPeriods = usePricing((s) => s.selectedPeriods);
  const [showFilterNote, setShowFilterNote] = useState(true);
  const [exportingPpt, setExportingPpt] = useState(false);
  const lastAutoPvmPairRef = useRef<{ mode: "fy" | "month"; base: string; comp: string } | null>(null);

  const options = useMemo(
    () =>
      pvmMode === "fy"
        ? fyList.map((fy) => ({ value: fy, label: fy }))
        : months.map((m) => ({ value: m.periodo, label: m.label })),
    [pvmMode, fyList, months],
  );

  const defaultPvmPair = useMemo(() => {
    if (options.length < 2) return null;
    const baseIndex = pvmMode === "month" ? options.length - 2 : 0;
    return {
      mode: pvmMode,
      base: options[baseIndex].value,
      comp: options[options.length - 1].value,
    };
  }, [options, pvmMode]);

  // Defaults: month mode opens with latest month vs immediately previous.
  // FY mode keeps the historical first vs last behavior. If the user is still
  // on the previous automatic pair and new data arrives, advance the default.
  useEffect(() => {
    if (!defaultPvmPair) return;
    const values = new Set(options.map((o) => o.value));
    const baseOk = pvmBase && values.has(pvmBase);
    const compOk = pvmComp && values.has(pvmComp);
    const previousAutoPair = lastAutoPvmPairRef.current;
    const isCurrentAutoPair =
      previousAutoPair &&
      previousAutoPair.mode === pvmMode &&
      previousAutoPair.base === pvmBase &&
      previousAutoPair.comp === pvmComp;

    if (!baseOk || !compOk || isCurrentAutoPair) {
      lastAutoPvmPairRef.current = defaultPvmPair;
      if (pvmBase !== defaultPvmPair.base || pvmComp !== defaultPvmPair.comp) {
        setPvm(defaultPvmPair.base, defaultPvmPair.comp);
      }
    }
  }, [defaultPvmPair, options, pvmBase, pvmComp, pvmMode, setPvm]);

  const filtered = useMemo(() => applyFilters(rows, filters, null), [rows, filters]);

  const result = useMemo(() => {
    if (!pvmBase || !pvmComp || pvmBase === pvmComp) return null;
    const labels =
      pvmMode === "month"
        ? {
            base: months.find((m) => m.periodo === pvmBase)?.label ?? pvmBase,
            comp: months.find((m) => m.periodo === pvmComp)?.label ?? pvmComp,
          }
        : undefined;
    return calcPVM(filtered, metric, pvmBase, pvmComp, pvmMode, labels);
  }, [filtered, metric, pvmBase, pvmComp, pvmMode, months]);

  // Tudo que os cartões de efeito e os rankings precisam (e o que vai para o slide).
  const scope = useMemo<BridgeScope | null>(
    () => (result && pvmBase && pvmComp ? { result, rows: filtered, base: pvmBase, comp: pvmComp, periodMode: pvmMode } : null),
    [result, filtered, pvmBase, pvmComp, pvmMode],
  );
  const deckAnchor = sortedPeriodsOf(getDeckPricingRows()).at(-1) ?? null;
  // A comparação vai "ao vivo": base e comparação andam com o mês de referência do deck.
  const bridgeSend = (visualId: string, visualization: string, extra: Record<string, unknown> = {}): SendToSlidePayload =>
    tabVisualPayload({
      page: "Bridge PVM",
      visualization,
      visualId,
      params: { base: pvmBase, comp: pvmComp, periodMode: pvmMode, anchor: deckAnchor, follow: "live", metric, ...extra },
      filters,
      selectedPeriods: null,
    });

  if (rows.length === 0) {
    return (
      <>
        <Topbar title="Bridge PVM" />
        <div className="px-8 py-6"><EmptyState
          title="Configure os períodos para comparar"
          message="Carregue ao menos dois meses de dados para calcular a decomposição de variação de margem por Volume, Preço e Custo."
          actionLabel="Ir para Upload"
          actionTo="/upload"
        /></div>
      </>
    );
  }

  const notEnough =
    (pvmMode === "fy" && fyList.length < 2) || (pvmMode === "month" && months.length < 2);

  return (
    <>
      <Topbar title="Bridge PVM" subtitle="Decomposição da variação de Contribuição Marginal" />
      <div className="space-y-6 px-8 py-6">
        <GlassCard className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Comparar por
              </div>
              <ToggleGroup
                type="single"
                value={pvmMode}
                onValueChange={(v) => v && setPvmMode(v as "fy" | "month")}
                className="mt-1.5 inline-flex rounded-full border border-border/50 bg-secondary/30 p-1"
              >
                <ToggleGroupItem
                  value="fy"
                  className="h-8 gap-1.5 rounded-full px-4 text-xs data-[state=on]:bg-primary/20 data-[state=on]:text-primary data-[state=on]:shadow-sm"
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  Ano Fiscal
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="month"
                  className="h-8 gap-1.5 rounded-full px-4 text-xs data-[state=on]:bg-primary/20 data-[state=on]:text-primary data-[state=on]:shadow-sm"
                >
                  <Calendar className="h-3.5 w-3.5" />
                  Mês
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>

          {notEnough ? (
            <p className="text-sm text-muted-foreground">
              {pvmMode === "fy"
                ? `Carregue ao menos dois anos fiscais. Você tem: ${fyList.join(", ") || "—"}`
                : `Carregue ao menos dois meses para comparar.`}
            </p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <PeriodSelect
                label={pvmMode === "fy" ? "Base (FY)" : "Período base"}
                tooltip="Período independente dos filtros de mês do Topbar."
                value={pvmBase}
                onChange={(v) => setPvm(v, pvmComp)}
                options={options}
              />
              <div className="flex h-10 items-center text-primary/60">
                <ArrowRight className="h-5 w-5" />
              </div>
              <PeriodSelect
                label={pvmMode === "fy" ? "Comparação (FY)" : "Período de comparação"}
                tooltip="Período independente dos filtros de mês do Topbar."
                value={pvmComp}
                onChange={(v) => setPvm(pvmBase, v)}
                options={options}
                excludeValue={pvmBase}
              />
              {pvmBase && pvmComp && pvmBase === pvmComp && (
                <p className="pb-2.5 text-xs text-warning">Selecione períodos diferentes.</p>
              )}
            </div>
          )}
        </GlassCard>

        {selectedPeriods !== null && showFilterNote && (
          <Alert className="relative border-primary/30 bg-primary/5 text-foreground">
            <Info className="h-4 w-4 text-primary" />
            <AlertDescription className="pr-8 text-sm">
              Os filtros de período do Topbar não afetam o Bridge PVM. A comparação usa exclusivamente os
              períodos "Base" e "Comparação" selecionados acima. Os demais filtros (Marca, Canal etc.)
              continuam sendo aplicados.
            </AlertDescription>
            <button
              type="button"
              onClick={() => setShowFilterNote(false)}
              aria-label="Fechar aviso"
              className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </Alert>
        )}

        {result && (
          <>
            <EffectKpis scope={scope} send={bridgeSend} />


            <GlassCard glow="blue" className="group/send-slide">
              <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-medium">
                    Bridge {result.baseLabel} → {result.currentLabel}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Variação total: {formatBRL(result.current - result.base, { compact: true })}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      setExportingPpt(true);
                      const { exportBridgePvmPpt } = await import("@/lib/exportPpt");
                      await exportBridgePvmPpt(result, filtered);
                      toast.success("PPTX exportado com gráficos e tabelas editáveis.");
                    } catch (error) {
                      console.error(error);
                      toast.error("Não foi possível gerar o PPTX da Bridge PVM.");
                    } finally {
                      setExportingPpt(false);
                    }
                  }}
                  className="gap-2"
                  disabled={exportingPpt}
                >
                  <Download className="h-4 w-4" />
                  {exportingPpt ? "Gerando PPTX..." : "Exportar PPTX"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportPvmCsv(result)}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  Exportar CSV (auditoria)
                </Button>
                {/* Vai para um slide Bridge PVM do deck: mesma comparação e filtros, gráfico e PPTX editáveis. */}
                <SendToSlideIconButton
                  payload={{
                    source: { page: "Bridge PVM", visualization: `Bridge ${result.baseLabel} → ${result.currentLabel}` },
                    target: { blockKind: "slide:bridge_pvm", blockLabel: "Bridge PVM" },
                    config: { metric, filters, selectedPeriods, base: pvmBase, comp: pvmComp, periodMode: pvmMode },
                  }}
                />
                </div>
              </header>
              <Waterfall data={result} labelAngle={-35} />
            </GlassCard>

            <PvmReadingCard result={result} />

            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-medium text-foreground">Categorias por efeito</h2>
                <p className="text-xs text-muted-foreground">
                  Categorias que mais ajudam ou pressionam Volume, Preço e Custo Variável.
                </p>
              </div>
              <div className="grid gap-4 xl:grid-cols-4">
                {BRIDGE_RANKING_EFFECTS.map((effect) => (
                  <EffectRankingCard key={`categoria-${effect.key}`} scope={scope} level="categoria" effect={effect.key} send={bridgeSend} />
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-medium text-foreground">SKUs por efeito</h2>
                <p className="text-xs text-muted-foreground">
                  SKUs que explicam os principais ganhos e ofensores dentro de cada efeito.
                </p>
              </div>
              <div className="grid gap-4 xl:grid-cols-4">
              {BRIDGE_RANKING_EFFECTS.map((effect) => (
                <EffectRankingCard key={`sku-${effect.key}`} scope={scope} level="sku" effect={effect.key} send={bridgeSend} />
              ))}
              </div>
            </section>
          </>
        )}
      </div>
    </>
  );
}

function PeriodSelect({
  label,
  tooltip,
  value,
  onChange,
  options,
  excludeValue,
}: {
  label: string;
  tooltip?: string;
  value: string | null;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  excludeValue?: string | null;
}) {
  return (
    <div>
      <label
        className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
        title={tooltip}
      >
        {label}
      </label>
      <Select value={value ?? undefined} onValueChange={onChange}>
        <SelectTrigger className="h-10 w-48 border-border/50 bg-secondary/40 text-sm">
          <SelectValue placeholder="Escolha..." />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} disabled={o.value === excludeValue}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

type BridgeSend = (visualId: string, visualization: string, extra?: Record<string, unknown>) => SendToSlidePayload;

function EffectRankingCard({
  scope,
  level,
  effect,
  send,
}: {
  scope: BridgeScope | null;
  level: BridgeRankingLevel;
  effect: BridgeRankingEffect;
  send: BridgeSend;
}) {
  const data = useMemo(() => computeBridgeRanking(scope, level, effect), [scope, level, effect]);
  if (!data) return null;
  const by = level === "sku" ? "SKU" : "categoria";
  return (
    <GlassCard className="group/send-slide space-y-4">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-medium">{data.title}</h2>
          <p className="text-xs text-muted-foreground">{data.subtitle}</p>
        </div>
        <SendToSlideIconButton
          payload={send(
            level === "sku" ? TAB_VISUAL_IDS.bridgeRankingSku : TAB_VISUAL_IDS.bridgeRankingCategoria,
            `${data.title} — heróis e ofensores por ${by}`,
            { effect },
          )}
        />
      </header>
      <BridgeRankingVisual data={data} variant="tab" />
    </GlassCard>
  );
}

// ---------- Leitura do resultado ----------

function PvmReadingCard({ result }: { result: PVMResult }) {
  const sentences = useMemo(() => buildSharedPvmReading(result), [result]);
  const [prefill, setPrefill] = useState<QuickActivityPrefill | null>(null);

  return (
    <GlassCard>
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <BookOpen className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-medium">Leitura do resultado</h2>
          <p className="text-[11px] text-muted-foreground">Interpretação automática do bridge</p>
        </div>
      </div>
      <ol className="space-y-2.5">
        {sentences.map((s, i) => (
          <PvmReadingItem
            key={i}
            index={i}
            sentence={s}
            onCreateActivity={(text) =>
              setPrefill({ title: text.slice(0, 80), tags: ["bridge-pvm"] })
            }
          />
        ))}
      </ol>
      <QuickActivityDialog
        open={!!prefill}
        onOpenChange={(o) => !o && setPrefill(null)}
        prefill={prefill ?? undefined}
      />
    </GlassCard>
  );
}

function PvmReadingItem({
  index,
  sentence,
  onCreateActivity,
}: {
  index: number;
  sentence: React.ReactNode;
  onCreateActivity: (text: string) => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  return (
    <li className="group flex items-start gap-3 rounded-xl border border-border/40 bg-secondary/20 p-3 text-sm leading-relaxed text-foreground/90">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
        {index + 1}
      </span>
      <span ref={ref} className="flex-1">
        {sentence}
      </span>
      <button
        type="button"
        onClick={() => {
          const text = ref.current?.textContent?.trim() ?? "";
          if (text) onCreateActivity(text);
        }}
        className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground/70 opacity-0 transition-all hover:bg-muted/60 hover:text-foreground group-hover:opacity-100"
        title="Criar atividade a partir desta leitura"
      >
        <Plus className="h-3 w-3" />
        Atividade
      </button>
    </li>
  );
}

// ---------- KpiCards de efeito com tooltip + % do total ----------

function EffectKpis({ scope, send }: { scope: BridgeScope | null; send: BridgeSend }) {
  const data = useMemo(() => computeBridgeEffects(scope), [scope]);
  if (!data) return null;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            Efeitos da variação · <span className="font-medium text-foreground">{data.baseLabel} → {data.currentLabel}</span>
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => captureSendToSlide(send(TAB_VISUAL_IDS.bridgeEfeitos, `Efeitos do Bridge ${data.baseLabel} → ${data.currentLabel}`))}
          >
            <Send className="h-3.5 w-3.5" /> Enviar efeitos para Slide
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {data.cards.map((card, i) => {
            const delayClass = i === 0 ? "" : i === 1 ? "animation-delay-100" : i === 2 ? "animation-delay-200" : "animation-delay-300";
            return (
              <Tooltip key={card.id}>
                <TooltipTrigger asChild>
                  <div className="cursor-help">
                    <BridgeEffectCard
                      data={card}
                      variant="tab"
                      className={delayClass}
                      action={(
                        <SendToSlideIconButton
                          className="h-6 w-6"
                          payload={send(TAB_VISUAL_IDS.bridgeEfeito, `${card.label} — ${data.baseLabel} → ${data.currentLabel}`, { effect: card.id })}
                        />
                      )}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                  <div className="mb-1 flex items-center gap-1 font-medium">
                    <Info className="h-3 w-3" />
                    {BRIDGE_EFFECT_INFO[card.id].label}
                  </div>
                  {card.description}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
