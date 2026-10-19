// Período de um visual da Ruptura no slide.
//
// A base de ruptura tem os próprios meses ("AAAA-MM", em model.months) e a aba
// trabalha com um intervalo de índices (RupturaPeriod). No slide o período é
// guardado como receita, no mesmo formato dos outros visuais das abas:
// - ao vivo: os últimos N meses até o mês mais recente da base — limitado ao
//   mês de referência do deck, se houver (`endOffset` recua o fim);
// - travado: os meses escolhidos ao enviar, que não mudam mais.
import type { TabVisualPeriod } from "@/lib/customSlide";
import { parsePeriodo } from "@/lib/deckPeriod";
import { monthKeyLabel, type RupturaPeriod } from "@/lib/ruptura/metrics";
import type { RupturaModel } from "@/lib/ruptura/types";

/** "MM.AAAA" (referência do deck) → "AAAA-MM", ou null. */
function referenceKey(reference: string | null | undefined): string | null {
  const point = parsePeriodo(reference);
  return point ? `${point.ano}-${String(point.mes).padStart(2, "0")}` : null;
}

/** Último mês da base que o deck enxerga (índice em model.months), ou -1. */
export function rupturaAnchorIndex(model: RupturaModel, reference?: string | null): number {
  const limit = referenceKey(reference);
  if (!limit) return model.months.length - 1;
  let anchor = -1;
  for (let i = 0; i < model.months.length; i++) if (model.months[i] <= limit) anchor = i;
  return anchor;
}

/** Intervalo de meses que o visual mostra. Vazio (from > to) se a base não alcança o deck. */
export function resolveRupturaPeriod(
  model: RupturaModel,
  period: TabVisualPeriod,
  reference?: string | null,
): RupturaPeriod {
  const anchor = rupturaAnchorIndex(model, reference);
  if (anchor < 0) return { from: 0, to: -1 };
  if (period.mode === "locked") {
    if (!period.periods?.length) return { from: 0, to: anchor };
    const indexes = period.periods.map((key) => model.months.indexOf(key)).filter((i) => i >= 0);
    if (indexes.length === 0) return { from: 0, to: anchor };
    return { from: Math.min(...indexes), to: Math.max(...indexes) };
  }
  const to = Math.max(0, anchor - Math.max(0, period.endOffset ?? 0));
  if (period.months == null) return { from: 0, to };
  return { from: Math.max(0, to - Math.max(1, period.months) + 1), to };
}

/**
 * As duas leituras do período da aba no momento do envio:
 * - ao vivo: a mesma janela, contada a partir do mês mais recente do deck;
 * - travado: exatamente os meses que estão na aba.
 */
export function rupturaPeriodOptions(
  model: RupturaModel,
  selected: RupturaPeriod | null,
  reference?: string | null,
): { live: TabVisualPeriod; locked: TabVisualPeriod } {
  const last = model.months.length - 1;
  const anchor = Math.max(0, rupturaAnchorIndex(model, reference));
  const from = Math.max(0, Math.min(selected?.from ?? 0, last));
  const to = Math.max(from, Math.min(selected?.to ?? last, last));
  const full = from === 0 && to === last;
  if (full) {
    return { live: { mode: "live", months: null }, locked: { mode: "locked", periods: [...model.months] } };
  }
  return {
    live: { mode: "live", months: to - from + 1, endOffset: Math.max(0, anchor - to) },
    locked: { mode: "locked", periods: model.months.slice(from, to + 1) },
  };
}

/** Os meses que o visual mostra agora, por extenso ("Jan/26 – Set/26"). */
export function rupturaPeriodRange(model: RupturaModel, period: RupturaPeriod): string {
  if (period.to < period.from || !model.months[period.from] || !model.months[period.to]) return "nenhum mês com dados";
  const a = monthKeyLabel(model.months[period.from]);
  return period.from === period.to ? a : `${a} – ${monthKeyLabel(model.months[period.to])}`;
}

/** Frase curta do modo, para o painel e o diálogo de envio. */
export function rupturaPeriodSummary(period: TabVisualPeriod): string {
  if (period.mode === "locked") return "Travado nos meses escolhidos";
  if ((period.endOffset ?? 0) > 0) return "Ao vivo · os meses escolhidos avançam junto com a base de ruptura";
  if (period.months == null) return "Ao vivo · todo o histórico até o mês mais recente";
  return period.months === 1
    ? "Ao vivo · o mês mais recente"
    : `Ao vivo · últimos ${period.months} meses da base`;
}
