// Modo "Classificar SKUs" da Central de De/Paras: um SKU por vez, com tudo o
// que é preciso para decidir lado a lado —
//
// - cada campo da hierarquia com o que ele é HOJE (De/Para padrão, corrigido
//   no app, o que veio da base ou vazio), a SUGESTÃO (com o motivo e a
//   confiança) e a NOVA classificação, já preenchida com a sugestão confiável;
// - os SKUs mais parecidos com todas as colunas, para copiar um campo ou a
//   linha inteira com um clique;
// - fila com progresso, "Salvar e próximo" (Ctrl+Enter) e Alt+← / Alt+→.
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CornerDownLeft,
  Sparkles,
  Undo2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatNum } from "@/lib/format";
import {
  getDeParaBySku,
  getDeParaFieldOptions,
  getDeParaOverride,
  type DeParaEntry,
  type DeParaOverrideEntry,
} from "@/lib/depara";
import { shareLabel, type DeParaHealth, type PendingItem } from "@/lib/deparaHealth";
import { descTokens } from "@/lib/deparaSuggest";
import { getBaseHierarchy } from "@/lib/baseHierarchy";
import {
  DEPARA_FIELD_LABEL,
  HIER_FIELDS,
  classifySku,
  confidenceLevel,
  subcategoriasOf,
  type FieldSuggestion,
  type HierField,
  type SkuNeighbor,
} from "@/lib/skuClassify";
import { useBudget } from "@/store/budget";
import { useDeParaCenter } from "@/store/deparaCenter";
import { usePricing } from "@/store/pricing";
import { ValuePicker } from "./ValuePicker";
import { saveSkuEntries } from "./deparaActions";

const isBlank = (v?: string) => {
  const s = (v ?? "").trim();
  return !s || s.toUpperCase() === "TBD";
};

const UNASSIGNED = /^(#|tbd|n[aã]o atribu[ií]do)$/i;

/**
 * Só pré-preenche sugestões de confiança alta (medido: acertam 94–97%); as
 * médias e baixas ficam a um clique, para a pessoa decidir.
 */
const PREFILL_CONFIDENCE = 0.7;

// ── Fila ─────────────────────────────────────────────────────────────────

export function SkuClassifier({ health }: { health: DeParaHealth }) {
  const session = useDeParaCenter((s) => s.classify);
  const goTo = useDeParaCenter((s) => s.goToClassify);
  const stop = useDeParaCenter((s) => s.stopClassify);
  const start = useDeParaCenter((s) => s.startClassify);
  const pendingBySku = useMemo(
    () => new Map(health.maps.hierarquia.pending.map((p) => [p.key, p])),
    [health],
  );

  if (!session) return null;
  const { queue, index, saved } = session;
  const done = index >= queue.length;
  const sku = queue[Math.min(index, queue.length - 1)];
  const progress = queue.length ? saved.length / queue.length : 0;
  const stillPending = queue.filter((s) => pendingBySku.has(s));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border/50 px-5 py-2.5">
        <Button size="sm" variant="ghost" className="h-8 gap-1.5 px-2 text-xs" onClick={stop}>
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar à lista
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3 text-[11px]">
            <span className="font-semibold text-foreground">
              Classificar SKUs
              {!done && <span className="ml-2 font-normal tabular-nums text-muted-foreground">{index + 1} de {formatNum(queue.length)}</span>}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {formatNum(saved.length)} salvo{saved.length === 1 ? "" : "s"} nesta fila
            </span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-border/60" aria-hidden>
            <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            aria-label="SKU anterior"
            title="SKU anterior (Alt+←)"
            disabled={index === 0}
            onClick={() => goTo(index - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            aria-label="Próximo SKU"
            title="Próximo SKU sem salvar (Alt+→)"
            disabled={done}
            onClick={() => goTo(index + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {done ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          <div className="text-sm font-semibold">Fim da fila</div>
          <p className="max-w-sm text-xs text-muted-foreground">
            {formatNum(saved.length)} SKU{saved.length === 1 ? "" : "s"} salvo{saved.length === 1 ? "" : "s"}.{" "}
            {stillPending.length
              ? `${formatNum(stillPending.length)} desta fila ainda têm campos em aberto.`
              : "Nenhum SKU desta fila ficou com campo em aberto."}
          </p>
          <div className="mt-2 flex gap-2">
            {stillPending.length > 0 && (
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => start(stillPending)}>
                Revisar os {formatNum(stillPending.length)} que faltam
              </Button>
            )}
            <Button size="sm" className="h-8 text-xs" onClick={stop}>Voltar à lista</Button>
          </div>
        </div>
      ) : (
        <SkuWorkbench
          key={sku}
          sku={sku}
          pending={pendingBySku.get(sku)}
          wasSaved={saved.includes(sku)}
          onPrev={index > 0 ? () => goTo(index - 1) : undefined}
          onNext={() => goTo(index + 1)}
        />
      )}
    </div>
  );
}

// ── Um SKU ───────────────────────────────────────────────────────────────

type CurrentOrigin = "app" | "padrao" | "base" | "vazio";

interface CurrentValue {
  value: string;
  origin: CurrentOrigin;
  /** Como o campo veio na base original, quando difere do valor de hoje. */
  raw?: string;
  /** Outros valores que a base traz para o mesmo SKU. */
  baseOthers: number;
}

/** O valor mais comum de cada campo nas linhas da base, para este SKU. */
function useBaseValues(sku: string) {
  const realRows = usePricing((s) => s.rows);
  return useMemo(() => {
    const counts: Partial<Record<HierField | "skuDesc", Map<string, number>>> = {};
    let rows = 0;
    for (const r of realRows) {
      if (r.sku !== sku) continue;
      rows++;
      for (const f of [...HIER_FIELDS, "skuDesc"] as const) {
        const v = r[f]?.trim();
        if (!v || UNASSIGNED.test(v)) continue;
        const map = counts[f] ?? new Map<string, number>();
        map.set(v, (map.get(v) ?? 0) + 1);
        counts[f] = map;
      }
    }
    const top: Partial<Record<HierField | "skuDesc", { value: string; others: number }>> = {};
    for (const [f, map] of Object.entries(counts) as Array<[HierField | "skuDesc", Map<string, number>]>) {
      const sorted = [...map].sort((a, b) => b[1] - a[1]);
      top[f] = { value: sorted[0][0], others: sorted.length - 1 };
    }
    return { top, rows };
  }, [realRows, sku]);
}

function SkuWorkbench({
  sku,
  pending,
  wasSaved,
  onPrev,
  onNext,
}: {
  sku: string;
  pending?: PendingItem;
  wasSaved: boolean;
  onPrev?: () => void;
  onNext: () => void;
}) {
  const version = useDeParaCenter((s) => s.version);
  const markClassified = useDeParaCenter((s) => s.markClassified);
  const budgetRows = useBudget((s) => s.rows);
  const base = useBaseValues(sku);

  const current = useMemo(() => getDeParaBySku(sku), [sku, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const override = useMemo(() => getDeParaOverride(sku), [sku, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const budgetDesc = useMemo(() => budgetRows.find((r) => r.sku === sku && r.skuDesc)?.skuDesc, [budgetRows, sku]);

  const originalDesc = current?.skuDesc || pending?.label || base.top.skuDesc?.value || budgetDesc || "";
  const [desc, setDesc] = useState(originalDesc);
  const [manual, setManual] = useState<Partial<Record<HierField, string>>>({});

  const rawBase = useMemo(() => getBaseHierarchy(sku) ?? {}, [sku, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const currentOf = useCallback((f: HierField): CurrentValue => {
    const value = current?.[f] ?? "";
    const raw = rawBase[f];
    if (!isBlank(value)) {
      return {
        value,
        origin: !isBlank(override?.[f]) ? "app" : "padrao",
        baseOthers: 0,
        raw: raw && raw !== value ? raw : undefined,
      };
    }
    const fromBase = raw ? { value: raw, others: 0 } : base.top[f];
    if (fromBase) return { value: fromBase.value, origin: "base", baseOthers: fromBase.others };
    // "TBD" no De/Para: marcado como a definir.
    return { value: value.trim(), origin: "vazio", baseOthers: 0 };
  }, [current, override, base, rawBase]);

  const isPendingField = (f: HierField) => isBlank(current?.[f]);

  // Só os campos sem De/Para: nos demais a linha já mostra o próprio De/Para.
  const baseValues = useMemo(() => {
    const out: Partial<Record<HierField, string>> = {};
    for (const f of HIER_FIELDS) if (base.top[f] && isBlank(current?.[f])) out[f] = base.top[f]!.value;
    return out;
  }, [base, current]);

  // Sugestão para o que falta, já considerando o que o SKU tem e o que a
  // pessoa escolheu (escolher a categoria reorienta a subcategoria).
  const known = useMemo(() => {
    const k: Partial<DeParaEntry> = {};
    for (const f of HIER_FIELDS) {
      if (manual[f] !== undefined) k[f] = manual[f];
      else if (!isBlank(current?.[f])) k[f] = current![f];
    }
    return k;
  }, [current, manual]);
  const suggestion = useMemo(
    () => classifySku({ sku, description: desc, known, baseValues, stamp: version }),
    [sku, desc, known, baseValues, version],
  );
  // A sugestão original de cada campo em aberto (antes das escolhas da pessoa),
  // para continuar visível depois que ela escolhe.
  const original = useMemo(() => {
    const k: Partial<DeParaEntry> = {};
    for (const f of HIER_FIELDS) if (!isBlank(current?.[f])) k[f] = current![f];
    return classifySku({ sku, description: desc, known: k, baseValues, stamp: version });
  }, [sku, desc, current, baseValues, version]);
  // Conferência do que já está preenchido: o que a descrição diria sozinha.
  const audit = useMemo(
    () => classifySku({ sku, description: desc, known: {}, baseValues, stamp: version }),
    [sku, desc, baseValues, version],
  );

  const valueOf = useCallback((f: HierField): { value: string; fromSuggestion: boolean } => {
    if (manual[f] !== undefined) return { value: manual[f]!, fromSuggestion: false };
    if (!isBlank(current?.[f])) return { value: current![f], fromSuggestion: false };
    const s = suggestion.fields[f];
    return s && s.confidence >= PREFILL_CONFIDENCE ? { value: s.value, fromSuggestion: true } : { value: "", fromSuggestion: false };
  }, [manual, current, suggestion]);

  const options = useMemo(
    () => Object.fromEntries(HIER_FIELDS.map((f) => [f, getDeParaFieldOptions(f)])) as Record<HierField, string[]>,
    [version], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const categoriaNow = valueOf("categoria").value;
  const subsOfCategoria = useMemo(() => subcategoriasOf(categoriaNow, version), [categoriaNow, version]);

  const setField = (f: HierField, value: string) => setManual((m) => ({ ...m, [f]: value }));
  const resetField = (f: HierField) => setManual((m) => {
    const next = { ...m };
    delete next[f];
    return next;
  });
  const copyNeighbor = (n: SkuNeighbor) => {
    setManual(Object.fromEntries(HIER_FIELDS.map((f) => [f, n.entry[f]])));
    toast.success(`Campos copiados do SKU ${n.sku}.`, { description: "Confira e salve." });
  };

  const pendingCount = HIER_FIELDS.filter(isPendingField).length + (isBlank(current?.skuDesc) ? 1 : 0);
  const draftEntry = (): DeParaOverrideEntry => {
    const entry: DeParaOverrideEntry = {};
    for (const f of HIER_FIELDS) {
      const v = valueOf(f).value.trim();
      if (v && v !== (current?.[f] ?? "")) entry[f] = v;
    }
    const d = desc.trim();
    if (d && d !== (current?.skuDesc ?? "")) entry.skuDesc = d;
    return entry;
  };
  const stillOpen = HIER_FIELDS.filter((f) => isBlank(valueOf(f).value)).length + (desc.trim() ? 0 : 1);
  const changes = Object.keys(draftEntry()).length;

  const save = (andNext: boolean) => {
    const entry = draftEntry();
    if (Object.keys(entry).length === 0) {
      if (andNext) onNext();
      else toast.info("Nada mudou neste SKU.");
      return;
    }
    saveSkuEntries(
      { [sku]: entry },
      stillOpen === 0
        ? `SKU ${sku} classificado.`
        : `SKU ${sku} salvo — ainda falta${stillOpen === 1 ? "" : "m"} ${stillOpen} campo${stillOpen === 1 ? "" : "s"}.`,
    );
    markClassified(sku);
    setManual({});
    if (andNext) onNext();
  };

  // Atalhos: Ctrl+Enter salva e segue; Alt+← / Alt+→ navegam.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        save(true);
      } else if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        onNext();
      } else if (e.altKey && e.key === "ArrowLeft" && onPrev) {
        e.preventDefault();
        onPrev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const descWords = useMemo(() => new Set(descTokens(desc)), [desc]);
  const wordsInDesc = (value?: string) => {
    const words = descTokens(value);
    return words.length > 0 && words.every((w) => descWords.has(w));
  };
  const suggestedCount = HIER_FIELDS.filter((f) => valueOf(f).fromSuggestion).length;
  // Sugestões para campos em aberto que ainda não estão na nova classificação.
  const toReview = HIER_FIELDS.filter((f) => {
    const sug = suggestion.fields[f];
    return isPendingField(f) && manual[f] === undefined && sug && sug.value !== valueOf(f).value;
  });
  const acceptRest = () =>
    setManual((m) => ({ ...m, ...Object.fromEntries(toReview.map((f) => [f, suggestion.fields[f]!.value])) }));

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {/* SKU */}
        <div className="mb-4 flex flex-wrap items-start gap-x-6 gap-y-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-lg font-semibold tracking-tight">{sku}</span>
              {pending ? (
                <span className="rounded-full bg-warning/12 px-2 py-0.5 text-[10px] font-semibold text-warning">
                  {pendingCount === HIER_FIELDS.length + 1 ? "SKU novo" : `${pendingCount} campo${pendingCount === 1 ? "" : "s"} em aberto`}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">
                  <Check className="h-3 w-3" /> {wasSaved ? "Salvo" : "Completo"}
                </span>
              )}
            </div>
            <Input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              aria-label="Descrição do SKU"
              placeholder="Descrição do SKU (ajuda a encontrar os parecidos)"
              className={cn(
                "mt-1.5 h-8 max-w-xl border-transparent bg-transparent px-1.5 text-[13px] text-muted-foreground shadow-none hover:border-border/60 focus-visible:border-border",
                isBlank(desc) && "border-warning/50 bg-warning/5",
              )}
            />
          </div>
          {pending && (
            <div className="text-right">
              <div className={cn("text-sm font-semibold tabular-nums", pending.share >= 0.005 ? "text-destructive" : "text-foreground")}>
                {pending.onlyBudget ? "Só no Budget" : shareLabel(pending.share)}
              </div>
              <div className="text-[10px] text-muted-foreground">{formatNum(pending.rows)} linhas nas bases</div>
            </div>
          )}
        </div>

        {/* Hoje × sugestão × nova */}
        {(suggestedCount > 0 || toReview.length > 0) && (
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {suggestedCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-primary" />
                {suggestedCount} campo{suggestedCount === 1 ? "" : "s"} já preenchido{suggestedCount === 1 ? "" : "s"} pela sugestão (confiança alta)
              </span>
            )}
            {toReview.length > 0 && (
              <>
                <span>
                  {toReview.length} sugest{toReview.length === 1 ? "ão" : "ões"} de confiança média ou baixa para conferir
                </span>
                <Button size="sm" variant="ghost" className="ml-auto h-7 gap-1.5 px-2 text-[11px]" onClick={acceptRest}>
                  <Wand2 className="h-3 w-3" /> Usar {toReview.length === 1 ? "essa sugestão" : `as ${toReview.length}`}
                </Button>
              </>
            )}
          </div>
        )}
        <div className="overflow-x-auto rounded-xl border border-border/50">
          <table className="w-full min-w-[720px] text-xs">
            <thead className="bg-secondary/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="w-[124px] px-3 py-2 font-medium">Campo</th>
                <th className="w-[26%] px-2 py-2 font-medium">Hoje</th>
                <th className="px-2 py-2 font-medium">Sugestão</th>
                <th className="w-[30%] px-2 py-2 font-medium">Nova classificação</th>
              </tr>
            </thead>
            <tbody>
              {HIER_FIELDS.map((f) => {
                const now = currentOf(f);
                const pendingField = isPendingField(f);
                const { value, fromSuggestion } = valueOf(f);
                const changed = !!value && value !== (current?.[f] ?? "");
                const audited = audit.fields[f];
                // Só alerta num campo preenchido quando quase nada apoia o valor atual.
                const currentSupported = !!audited && (
                  audited.alternatives.some((a) => a.value === current?.[f] && a.share >= 0.08) ||
                  // O valor atual está escrito na própria descrição ("PASTA LEITE CONDENSADO").
                  wordsInDesc(current?.[f])
                );
                const sug = pendingField
                  ? manual[f] !== undefined ? original.fields[f] : suggestion.fields[f]
                  : currentSupported && manual[f] === undefined ? undefined : audited;
                return (
                  <tr key={f} className={cn("border-t border-border/40 align-top", pendingField && "bg-warning/[0.03]")}>
                    <td className="px-3 py-2">
                      <div className={cn("flex items-center gap-1.5 font-medium", pendingField && "text-warning")}>
                        <span
                          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", pendingField ? "bg-warning" : "bg-emerald-500/70")}
                          aria-hidden
                        />
                        {DEPARA_FIELD_LABEL[f]}
                        {pendingField && <span className="sr-only"> (em aberto)</span>}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <CurrentCell now={now} />
                    </td>
                    <td className="px-2 py-2">
                      <SuggestionCell
                        suggestion={sug}
                        applied={!!sug && sug.value === value}
                        pendingField={pendingField}
                        onUse={(v) => setField(f, v)}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1">
                        <ValuePicker
                          value={value}
                          options={options[f]}
                          highlightEmpty
                          placeholder="Escolher…"
                          ariaLabel={`Nova ${DEPARA_FIELD_LABEL[f].toLowerCase()} do SKU ${sku}`}
                          priority={f === "subcategoria" ? subsOfCategoria : undefined}
                          priorityLabel={f === "subcategoria" && categoriaNow ? `Em ${categoriaNow}` : undefined}
                          className={cn(changed && "border-primary/50 bg-primary/[0.06] text-foreground")}
                          onChange={(v) => setField(f, v)}
                        />
                        {manual[f] !== undefined && (
                          <button
                            type="button"
                            onClick={() => resetField(f)}
                            aria-label={`Desfazer a escolha de ${DEPARA_FIELD_LABEL[f].toLowerCase()}`}
                            title="Voltar ao valor anterior"
                            className="rounded p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                          >
                            <Undo2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {(fromSuggestion || (changed && !pendingField)) && (
                      <div className="mt-1 text-[10px] leading-none">
                        {fromSuggestion && (
                          <span className="inline-flex items-center gap-1 text-primary">
                            <Sparkles className="h-2.5 w-2.5" /> preenchido pela sugestão
                          </span>
                        )}
                        {!fromSuggestion && changed && !pendingField && (
                          <span className="text-muted-foreground">
                            antes: <span className="line-through">{current?.[f]}</span>
                          </span>
                        )}
                      </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* SKUs parecidos */}
        <section className="mt-5">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-xs font-semibold">
              {suggestion.basis === "campos" ? `SKUs com ${suggestion.basisLabel}` : "SKUs parecidos"}
              {suggestion.basis === "campos" && (
                <span className="ml-2 font-normal text-muted-foreground">sem descrição para comparar — base nos campos já preenchidos</span>
              )}
            </h4>
            <span className="text-[10px] text-muted-foreground">
              Clique num valor para usá-lo, ou em “Copiar” para trazer a linha inteira.
            </span>
          </div>
          {suggestion.neighbors.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 px-4 py-6 text-center text-[11px] text-muted-foreground">
              {isBlank(desc)
                ? "Escreva a descrição do SKU para encontrar os parecidos."
                : "Nenhum SKU classificado tem descrição parecida. Preencha à mão ou ajuste a descrição."}
            </div>
          ) : (
            <NeighborsTable
              neighbors={suggestion.neighbors}
              showScore={suggestion.basis === "descricao"}
              valueOf={(f) => valueOf(f).value}
              onPick={setField}
              onCopy={copyNeighbor}
            />
          )}
        </section>
      </div>

      <footer className="flex flex-wrap items-center gap-3 border-t border-border/50 bg-card/80 px-5 py-2.5">
        <div className="mr-auto text-[11px] text-muted-foreground">
          {changes === 0
            ? "Nada alterado ainda."
            : `${changes} campo${changes === 1 ? "" : "s"} para salvar${suggestedCount ? ` · ${suggestedCount} pela sugestão` : ""}`}
          {stillOpen > 0 && changes > 0 && <span className="text-warning"> · {stillOpen} ainda em aberto</span>}
          <span className="ml-3 hidden text-[10px] lg:inline">
            <kbd className="rounded border border-border/60 px-1 font-sans">Ctrl</kbd>+<kbd className="rounded border border-border/60 px-1 font-sans">Enter</kbd> salva e segue ·{" "}
            <kbd className="rounded border border-border/60 px-1 font-sans">Alt</kbd>+<kbd className="rounded border border-border/60 px-1 font-sans">←</kbd>/<kbd className="rounded border border-border/60 px-1 font-sans">→</kbd> navega
          </span>
        </div>
        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onNext}>
          Pular
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs" disabled={changes === 0} onClick={() => save(false)}>
          Salvar
        </Button>
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => save(true)}>
          {changes === 0 ? "Próximo" : "Salvar e próximo"}
          {changes === 0 ? <ArrowRight className="h-3.5 w-3.5" /> : <CornerDownLeft className="h-3.5 w-3.5" />}
        </Button>
      </footer>
    </>
  );
}

// ── Células ──────────────────────────────────────────────────────────────

const ORIGIN_LABEL: Record<CurrentOrigin, string> = {
  app: "corrigido no app",
  padrao: "De/Para padrão",
  base: "veio da base, sem De/Para",
  vazio: "sem valor",
};

function CurrentCell({ now }: { now: CurrentValue }) {
  if (now.origin === "vazio") {
    return (
      <div>
        <span className="text-muted-foreground">{now.value || "—"}</span>
        <div className="mt-0.5 text-[10px] text-muted-foreground/80">{now.value ? "a definir no De/Para" : ORIGIN_LABEL.vazio}</div>
      </div>
    );
  }
  return (
    <div className="min-w-0">
      <span className={cn("block truncate", now.origin === "base" && "italic")} title={now.value}>{now.value}</span>
      <div className={cn("mt-0.5 text-[10px]", now.origin === "app" ? "text-primary" : "text-muted-foreground/80")}>
        {ORIGIN_LABEL[now.origin]}
        {now.baseOthers > 0 && ` (+${now.baseOthers} outro${now.baseOthers === 1 ? "" : "s"})`}
      </div>
      {now.raw && (
        <div className="truncate text-[10px] text-muted-foreground/70" title={`Como veio na base: ${now.raw}`}>
          na base: <span className="italic">{now.raw}</span>
        </div>
      )}
    </div>
  );
}

const LEVEL_STYLE = {
  alta: { label: "Alta", dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
  media: { label: "Média", dot: "bg-warning", text: "text-warning" },
  baixa: { label: "Baixa", dot: "bg-muted-foreground/50", text: "text-muted-foreground" },
} as const;

function SuggestionCell({
  suggestion,
  applied,
  pendingField,
  onUse,
}: {
  suggestion?: FieldSuggestion;
  applied: boolean;
  pendingField: boolean;
  onUse: (value: string) => void;
}) {
  if (!suggestion) {
    return <span className="text-[11px] text-muted-foreground/70">{pendingField ? "Sem pista — escolha à mão" : "—"}</span>;
  }
  const level = LEVEL_STYLE[confidenceLevel(suggestion.confidence)];
  // Campo já preenchido: só chama atenção quando os parecidos discordam com força.
  if (!pendingField && applied) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
        <Check className="h-3 w-3" /> confere com os parecidos
      </span>
    );
  }
  if (!pendingField && confidenceLevel(suggestion.confidence) !== "alta") {
    return <span className="text-[11px] text-muted-foreground/70">—</span>;
  }
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        {applied ? (
          <span className="inline-flex min-w-0 items-center gap-1 font-medium text-foreground">
            <Check className="h-3 w-3 shrink-0 text-primary" />
            <span className="truncate" title={suggestion.value}>{suggestion.value}</span>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onUse(suggestion.value)}
            title={`Usar ${suggestion.value}`}
            className={cn(
              "inline-flex min-w-0 items-center gap-1 rounded-md border px-1.5 py-0.5 font-medium transition-colors",
              pendingField
                ? "border-primary/30 bg-primary/[0.06] text-primary hover:bg-primary/15"
                : "border-warning/40 bg-warning/10 text-warning hover:bg-warning/20",
            )}
          >
            <Wand2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{suggestion.value}</span>
          </button>
        )}
        <span className={cn("inline-flex shrink-0 items-center gap-1 text-[10px]", level.text)} title={`Confiança ${Math.round(suggestion.confidence * 100)}%`}>
          <span className={cn("h-1.5 w-1.5 rounded-full", level.dot)} aria-hidden />
          {level.label}
        </span>
      </div>
      <div className="mt-0.5 text-[10px] leading-snug text-muted-foreground" title={altTitle(suggestion)}>
        {!pendingField && <span className="text-warning">Os parecidos indicam outro valor · </span>}
        {suggestion.reason}
      </div>
    </div>
  );
}

function altTitle(s: FieldSuggestion): string | undefined {
  if (s.alternatives.length === 0) return undefined;
  return `Outras possibilidades: ${s.alternatives.map((a) => `${a.value} (${Math.round(a.share * 100)}%)`).join(", ")}`;
}

function HighlightedDesc({ text, shared }: { text: string; shared: string[] }) {
  const set = new Set(shared);
  return (
    <>
      {text.split(/(\s+)/).map((part, i) => {
        const token = descTokens(part)[0];
        return token && set.has(token)
          ? <strong key={i} className="font-semibold text-foreground">{part}</strong>
          : <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

function NeighborsTable({
  neighbors,
  showScore,
  valueOf,
  onPick,
  onCopy,
}: {
  neighbors: SkuNeighbor[];
  showScore: boolean;
  valueOf: (f: HierField) => string;
  onPick: (f: HierField, value: string) => void;
  onCopy: (n: SkuNeighbor) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border/50">
      <table className="w-full min-w-[1080px] text-[11px]">
        <thead className="bg-secondary/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="sticky left-0 z-10 bg-secondary/90 px-3 py-2 font-medium backdrop-blur">SKU</th>
            {HIER_FIELDS.map((f) => (
              <th key={f} className="px-1.5 py-2 font-medium">{DEPARA_FIELD_LABEL[f]}</th>
            ))}
            <th className="w-16 px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          {neighbors.map((n) => (
            <tr key={n.sku} className="group border-t border-border/40 align-top">
              <td className="sticky left-0 z-10 w-[230px] bg-card px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-semibold">{n.sku}</span>
                  {showScore && (
                    <span className="rounded bg-secondary px-1 text-[9px] tabular-nums text-muted-foreground" title="Quão parecida é a descrição">
                      {Math.round(n.score * 100)}%
                    </span>
                  )}
                </div>
                <div className="mt-0.5 line-clamp-2 text-[10.5px] leading-snug text-muted-foreground" title={n.entry.skuDesc}>
                  <HighlightedDesc text={n.entry.skuDesc} shared={n.shared} />
                </div>
              </td>
              {HIER_FIELDS.map((f) => {
                const same = n.entry[f] === valueOf(f);
                return (
                  <td key={f} className="px-1 py-1.5">
                    <button
                      type="button"
                      onClick={() => onPick(f, n.entry[f])}
                      title={same ? `${n.entry[f]} — igual à nova classificação` : `Usar ${n.entry[f]} em ${DEPARA_FIELD_LABEL[f].toLowerCase()}`}
                      className={cn(
                        "w-full rounded-md px-1.5 py-1 text-left leading-snug transition-colors",
                        same
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          : "text-muted-foreground hover:bg-primary/10 hover:text-foreground",
                      )}
                    >
                      {n.entry[f]}
                    </button>
                  </td>
                );
              })}
              <td className="px-2 py-1.5 text-right">
                <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => onCopy(n)}>
                  Copiar
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
