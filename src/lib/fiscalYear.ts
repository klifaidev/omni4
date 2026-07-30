export interface FiscalMonthLike {
  mes: number;
  ano: number;
}

export function fiscalYearStartYear(month: number, year: number): number {
  return month >= 4 ? year : year - 1;
}

export function isInFiscalYearStart(row: FiscalMonthLike, fiscalYearStart: number): boolean {
  return fiscalYearStartYear(row.mes, row.ano) === fiscalYearStart;
}

export function latestFiscalYearStartYear<T extends FiscalMonthLike>(rows: T[]): number | null {
  if (rows.length === 0) return null;
  const latest = rows.reduce((acc, row) => {
    const accRank = acc.ano * 12 + acc.mes;
    const rowRank = row.ano * 12 + row.mes;
    return rowRank > accRank ? row : acc;
  }, rows[0]);
  return fiscalYearStartYear(latest.mes, latest.ano);
}

export function isCurrentFiscalYearMonth<T extends FiscalMonthLike>(
  row: T,
  currentFiscalYearStart: number | null,
): boolean {
  if (currentFiscalYearStart == null) return true;
  return isInFiscalYearStart(row, currentFiscalYearStart);
}
