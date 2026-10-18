// Período dos visuais enviados das abas para o slide (TabVisualBlock).
//
// "Ao vivo" mostra hoje exatamente os meses escolhidos na aba e anda junto
// com o mês de referência do deck: cada mês é guardado como "quantos meses
// antes da referência" — avançar a referência um mês avança o gráfico um mês.
// As linhas do deck já vêm cortadas na referência (useDeckPricingRows), então
// a referência é o último mês dessas linhas. "Travado" guarda a lista exata de
// meses e não muda — nem com o mês de referência, nem com "Avançar o deck".
import type { TabVisualPeriod } from "@/lib/customSlide";
import { parsePeriodo } from "@/lib/deckPeriod";
import { monthLabel } from "@/lib/format";
import { getSortedMonthPeriods } from "@/lib/relativePeriods";
import type { PricingRow } from "@/lib/types";

// Ordenar os meses de uma base de 1M+ linhas custa; a mesma base é lida por
// vários blocos e miniaturas, então guarda por referência das linhas.
const sortedCache = new WeakMap<readonly PricingRow[], string[]>();

/** Meses presentes nas linhas, do mais antigo ao mais recente. */
export function sortedPeriodsOf(rows: readonly PricingRow[]): string[] {
  let sorted = sortedCache.get(rows);
  if (!sorted) {
    sorted = getSortedMonthPeriods(rows).map((p) => p.value);
    sortedCache.set(rows, sorted);
  }
  return sorted;
}

function monthIndexOf(periodo: string): number | null {
  const point = parsePeriodo(periodo);
  return point ? point.ano * 12 + point.mes - 1 : null;
}

/** Meses (das linhas) que caem nos índices pedidos, em ordem. */
function periodsAtIndexes(all: readonly string[], indexes: readonly number[]): string[] {
  const wanted = new Set(indexes);
  return all.filter((p) => {
    const idx = monthIndexOf(p);
    return idx != null && wanted.has(idx);
  });
}

/** Meses que o visual mostra (`null` = todos os das linhas). */
export function resolveTabVisualPeriods(rows: readonly PricingRow[], period: TabVisualPeriod): string[] | null {
  if (period.mode === "locked") return period.periods;
  if (period.months == null && !period.offsets) return null;
  const all = sortedPeriodsOf(rows);
  const anchor = all.length ? monthIndexOf(all[all.length - 1]) : null;
  if (anchor == null) return [];
  if (period.offsets) return periodsAtIndexes(all, period.offsets.map((o) => anchor - o));
  const months = Math.max(1, period.months ?? 1);
  const end = anchor - Math.max(0, period.endOffset ?? 0);
  return periodsAtIndexes(all, Array.from({ length: months }, (_, i) => end - i));
}

function sortByIndex(selected: readonly string[]): string[] {
  return [...selected].sort((a, b) => (monthIndexOf(a) ?? 0) - (monthIndexOf(b) ?? 0));
}

/**
 * As duas leituras possíveis da seleção de meses da aba no momento do envio:
 * - ao vivo: os mesmos meses, contados a partir do mês de referência do deck
 *   (`anchorRows` = linhas do deck); hoje mostra exatamente o que foi escolhido;
 * - travado: exatamente os meses escolhidos (todos, se nada foi escolhido).
 */
export function tabVisualPeriodOptions(
  selected: readonly string[] | null,
  allSorted: readonly string[],
  anchorRows?: readonly PricingRow[],
): { live: TabVisualPeriod; locked: TabVisualPeriod } {
  const known = new Set(allSorted);
  const chosen = selected?.length ? sortByIndex(selected.filter((p) => known.has(p))) : [];
  if (chosen.length === 0 || chosen.length === allSorted.length) {
    return {
      live: { mode: "live", months: null },
      locked: { mode: "locked", periods: allSorted.length ? [...allSorted] : null },
    };
  }
  const anchorList = anchorRows ? sortedPeriodsOf(anchorRows) : allSorted;
  const anchor = monthIndexOf(anchorList[anchorList.length - 1] ?? allSorted[allSorted.length - 1]) ?? 0;
  const indexes = chosen.map((p) => monthIndexOf(p) ?? 0);
  const contiguous = indexes.every((idx, i) => i === 0 || idx === indexes[i - 1] + 1);
  const live: TabVisualPeriod = contiguous
    ? { mode: "live", months: chosen.length, endOffset: anchor - indexes[indexes.length - 1] }
    : { mode: "live", months: chosen.length, offsets: indexes.map((idx) => anchor - idx) };
  return { live, locked: { mode: "locked", periods: chosen } };
}

/** Padrão ao enviar: ao vivo — mostra os meses escolhidos e anda com o deck. */
export function defaultTabVisualPeriod(
  selected: readonly string[] | null,
  allSorted: readonly string[],
  anchorRows?: readonly PricingRow[],
): TabVisualPeriod {
  return tabVisualPeriodOptions(selected, allSorted, anchorRows).live;
}

function periodLabel(periodo: string): string {
  const point = parsePeriodo(periodo);
  return point ? monthLabel(point.mes, point.ano) : periodo;
}

/** Os meses que o visual mostra agora, por extenso ("Jan/26 – Set/26"). */
export function tabVisualPeriodRange(rows: readonly PricingRow[], period: TabVisualPeriod): string {
  const resolved = resolveTabVisualPeriods(rows, period);
  const shown = sortByIndex(resolved ?? sortedPeriodsOf(rows));
  if (shown.length === 0) return "nenhum mês com dados";
  if (shown.length === 1) return periodLabel(shown[0]);
  const indexes = shown.map((p) => monthIndexOf(p) ?? 0);
  const contiguous = indexes.every((idx, i) => i === 0 || idx === indexes[i - 1] + 1);
  if (contiguous) return `${periodLabel(shown[0])} – ${periodLabel(shown[shown.length - 1])}`;
  return `${shown.length} meses (${shown.map(periodLabel).join(", ")})`;
}

/** Frase curta do modo, para o painel e o diálogo de envio. */
export function tabVisualPeriodSummary(period: TabVisualPeriod): string {
  if (period.mode === "locked") return "Travado nos meses escolhidos";
  if (period.offsets || (period.endOffset ?? 0) > 0) {
    return "Ao vivo · os meses escolhidos avançam junto com o mês de referência do deck";
  }
  if (period.months == null) return "Ao vivo · todo o histórico até o mês de referência";
  return period.months === 1
    ? "Ao vivo · o mês de referência"
    : `Ao vivo · últimos ${period.months} meses até o mês de referência`;
}
