// Bridge PVM em modo YTD (acumulado do ano fiscal): o ano fiscal começa em
// abril, então "YTD até Set/26" é Abr–Set/26 (FY26/27) contra a MESMA janela do
// ano fiscal anterior, Abr–Set/25 (FY25/26).
//
// A comparação é "maçã com maçã": só entram os meses que existem nos dois lados
// (um mês faltando num ano some do outro), e o mês escolhido precisa existir
// também no ano anterior — senão o "até Set/26" não seria honesto.
import { parsePeriodo, shiftPeriodo } from "./deckPeriod";
import { fiscalMonthIndex, fiscalYearStartYear } from "./fiscalYear";
import { monthLabel } from "./format";
import type { PricingRow } from "./types";

type MonthLike = { periodo: string };

/** O mesmo mês, um ano antes ("009.2026" → "009.2025"). */
export function ytdBasePeriodo(through: string): string | null {
  return shiftPeriodo(through, -12);
}

/** "FY26/27" a partir do ano em que o ano fiscal começa. */
function fyLabelFromStart(startYear: number): string {
  return `FY${String(startYear).slice(-2)}/${String(startYear + 1).slice(-2)}`;
}

/**
 * Meses que podem ser o "acumulado até": aqueles cujo mesmo mês existe um ano
 * antes. Na ordem recebida.
 */
export function ytdEligibleMonths<T extends MonthLike>(months: readonly T[]): T[] {
  const known = new Set(months.map((m) => m.periodo));
  return months.filter((m) => {
    const prev = ytdBasePeriodo(m.periodo);
    return prev != null && known.has(prev);
  });
}

export interface YtdSummary {
  /** "FY26/27" e "FY25/26". */
  compFy: string;
  baseFy: string;
  /** "Abr/26–Set/26" e "Abr/25–Set/25". */
  compRange: string;
  baseRange: string;
  /** Faltou algum mês no meio da janela (nos dois lados comparados só entram os que existem em ambos). */
  hasGaps: boolean;
  /** A janela comparada não começa em abril (falta o início do ano fiscal em um dos lados). */
  startsLate: boolean;
}

export interface YtdSplit {
  baseRows: PricingRow[];
  compRows: PricingRow[];
  /** Rótulos das duas pontas do Bridge: "YTD FY25/26" → "YTD FY26/27". */
  baseLabel: string;
  compLabel: string;
  summary: YtdSummary;
}

function rangeLabel(first: { mes: number; ano: number }, last: { mes: number; ano: number }): string {
  const a = monthLabel(first.mes, first.ano);
  return first.mes === last.mes && first.ano === last.ano ? a : `${a}–${monthLabel(last.mes, last.ano)}`;
}

/**
 * Separa as linhas das duas janelas YTD para o mês `through` ("009.2026").
 * `null` quando o mês é inválido ou não há o que comparar nos dois anos.
 */
export function ytdSplit(rows: readonly PricingRow[], through: string): YtdSplit | null {
  const t = parsePeriodo(through);
  if (!t) return null;
  const compStart = fiscalYearStartYear(t.mes, t.ano);
  const limit = fiscalMonthIndex(t.mes);

  const compCandidates: PricingRow[] = [];
  const baseCandidates: PricingRow[] = [];
  const compMonths = new Set<number>();
  const baseMonths = new Set<number>();
  for (const row of rows) {
    const start = fiscalYearStartYear(row.mes, row.ano);
    const idx = fiscalMonthIndex(row.mes);
    if (start === compStart && idx <= limit) {
      compCandidates.push(row);
      compMonths.add(idx);
    } else if (start === compStart - 1 && idx <= limit) {
      baseCandidates.push(row);
      baseMonths.add(idx);
    }
  }

  const shared = new Set([...compMonths].filter((idx) => baseMonths.has(idx)));
  if (shared.size === 0) return null;
  const compRows = compCandidates.filter((row) => shared.has(fiscalMonthIndex(row.mes)));
  const baseRows = baseCandidates.filter((row) => shared.has(fiscalMonthIndex(row.mes)));
  if (compRows.length === 0 || baseRows.length === 0) return null;

  const ordered = [...shared].sort((a, b) => a - b);
  const monthOf = (rs: PricingRow[], idx: number) => rs.find((r) => fiscalMonthIndex(r.mes) === idx)!;
  const compFirst = monthOf(compRows, ordered[0]);
  const compLast = monthOf(compRows, ordered[ordered.length - 1]);
  const baseFirst = monthOf(baseRows, ordered[0]);
  const baseLast = monthOf(baseRows, ordered[ordered.length - 1]);

  const compFy = compRows[0].fy || fyLabelFromStart(compStart);
  const baseFy = baseRows[0].fy || fyLabelFromStart(compStart - 1);
  return {
    baseRows,
    compRows,
    baseLabel: `YTD ${baseFy}`,
    compLabel: `YTD ${compFy}`,
    summary: {
      compFy,
      baseFy,
      compRange: rangeLabel(compFirst, compLast),
      baseRange: rangeLabel(baseFirst, baseLast),
      hasGaps: ordered.length !== ordered[ordered.length - 1] - ordered[0] + 1,
      startsLate: ordered[0] !== 1,
    },
  };
}
