// Período dos visuais enviados das abas para o slide (TabVisualBlock).
//
// "Ao vivo" acompanha o mês de referência do deck: as linhas do deck já vêm
// cortadas nele (useDeckPricingRows), então "os últimos N meses" são os N
// mais recentes dessas linhas. "Travado" guarda a lista exata de meses e não
// muda — nem com o mês de referência, nem com "Avançar o deck".
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

/** Meses que o visual mostra (`null` = todos os das linhas). */
export function resolveTabVisualPeriods(rows: readonly PricingRow[], period: TabVisualPeriod): string[] | null {
  if (period.mode === "locked") return period.periods;
  if (period.months == null) return null;
  return sortedPeriodsOf(rows).slice(-Math.max(1, period.months));
}

function sortByIndex(selected: readonly string[], all: readonly string[]): string[] {
  const index = new Map(all.map((p, i) => [p, i]));
  return [...selected].sort((a, b) => (index.get(a) ?? -1) - (index.get(b) ?? -1));
}

/**
 * As duas leituras possíveis da seleção de meses da aba no momento do envio:
 * - ao vivo: a mesma janela (do 1º ao último mês escolhido), contada a partir
 *   do mês de referência;
 * - travado: exatamente os meses escolhidos (todos, se nada foi escolhido).
 */
export function tabVisualPeriodOptions(
  selected: readonly string[] | null,
  allSorted: readonly string[],
): { live: TabVisualPeriod; locked: TabVisualPeriod } {
  const chosen = selected?.length ? sortByIndex(selected.filter((p) => allSorted.includes(p)), allSorted) : [];
  const coversAll = chosen.length === 0 || chosen.length === allSorted.length;
  if (coversAll) {
    return {
      live: { mode: "live", months: null },
      locked: { mode: "locked", periods: allSorted.length ? [...allSorted] : null },
    };
  }
  const span = allSorted.indexOf(chosen[chosen.length - 1]) - allSorted.indexOf(chosen[0]) + 1;
  return {
    live: { mode: "live", months: span },
    locked: { mode: "locked", periods: chosen },
  };
}

/**
 * Padrão ao enviar: ao vivo quando a seleção termina no mês mais recente (ou
 * é o histórico todo) — é o "acompanhar o mês"; travado quando a pessoa
 * escolheu uma janela no passado, que ela claramente quer congelar.
 */
export function defaultTabVisualPeriod(
  selected: readonly string[] | null,
  allSorted: readonly string[],
): TabVisualPeriod {
  const options = tabVisualPeriodOptions(selected, allSorted);
  if (options.live.mode === "live" && options.live.months == null) return options.live;
  const chosen = options.locked.mode === "locked" ? options.locked.periods ?? [] : [];
  return chosen[chosen.length - 1] === allSorted[allSorted.length - 1] ? options.live : options.locked;
}

function periodLabel(periodo: string): string {
  const point = parsePeriodo(periodo);
  return point ? monthLabel(point.mes, point.ano) : periodo;
}

function rangeLabel(periods: readonly string[]): string {
  if (periods.length === 0) return "sem meses";
  if (periods.length === 1) return periodLabel(periods[0]);
  return `${periodLabel(periods[0])} – ${periodLabel(periods[periods.length - 1])}`;
}

/** Os meses que o visual mostra agora, por extenso ("Jan/26 – Set/26"). */
export function tabVisualPeriodRange(rows: readonly PricingRow[], period: TabVisualPeriod): string {
  const all = sortedPeriodsOf(rows);
  const resolved = resolveTabVisualPeriods(rows, period);
  const shown = resolved == null ? all : sortByIndex(resolved, all);
  const contiguous = shown.length > 1
    && all.indexOf(shown[shown.length - 1]) - all.indexOf(shown[0]) + 1 === shown.length;
  if (shown.length <= 1 || contiguous || period.mode === "live") return rangeLabel(shown);
  return `${shown.length} meses (${shown.map(periodLabel).join(", ")})`;
}

/** Frase curta do modo, para o painel e o diálogo de envio. */
export function tabVisualPeriodSummary(period: TabVisualPeriod): string {
  if (period.mode === "locked") return "Travado nos meses escolhidos";
  if (period.months == null) return "Ao vivo · todo o histórico até o mês de referência";
  return period.months === 1
    ? "Ao vivo · o mês de referência"
    : `Ao vivo · últimos ${period.months} meses até o mês de referência`;
}
