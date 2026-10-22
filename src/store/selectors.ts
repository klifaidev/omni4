import { usePricing } from "./pricing";
import type { MonthInfo, PricingRow } from "@/lib/types";
import { monthLabel } from "@/lib/format";
import { applyFilters } from "@/lib/analytics";
import { memoizeByRows } from "@/lib/derivedCache";

// Derivados da base usados por quase toda tela (barra lateral, topo, filtros,
// páginas). Antes, cada componente que chamava o hook varria todas as linhas
// por conta própria — e de novo a cada tela aberta. Agora a varredura é uma só
// por base (memória por identidade do array; ver lib/derivedCache.ts) e o
// resultado é compartilhado: quem recebe não deve alterá-lo.

export const computeMonthsInfo = memoizeByRows((rows: PricingRow[]): MonthInfo[] => {
  const map = new Map<string, MonthInfo>();
  for (const r of rows) {
    const cur = map.get(r.periodo);
    if (cur) cur.rowCount++;
    else
      map.set(r.periodo, {
        periodo: r.periodo,
        mes: r.mes,
        ano: r.ano,
        fy: r.fy,
        fyNum: r.fyNum,
        rowCount: 1,
        label: monthLabel(r.mes, r.ano),
      });
  }
  return Array.from(map.values()).sort((a, b) => a.ano - b.ano || a.mes - b.mes);
});

const computeFyList = memoizeByRows((rows: PricingRow[]): string[] => {
  const set = new Set<string>();
  for (const r of rows) set.add(r.fy);
  return Array.from(set).sort();
});

const computeExistingPeriods = memoizeByRows((rows: PricingRow[]): Set<string> => {
  const set = new Set<string>();
  for (const r of rows) set.add(r.periodo);
  return set;
});

/** Indica se, dados os filtros + períodos atuais, restam linhas a serem analisadas. */
export function useHasFilteredData(): boolean {
  const rows = usePricing((s) => s.rows);
  const filters = usePricing((s) => s.filters);
  const selected = usePricing((s) => s.selectedPeriods);
  // applyFilters já é memorizado (e sem filtro devolve a própria base).
  return applyFilters(rows, filters, selected).length > 0;
}

export function useMonthsInfo(): MonthInfo[] {
  return computeMonthsInfo(usePricing((s) => s.rows));
}

export function useFyList(): string[] {
  return computeFyList(usePricing((s) => s.rows));
}

export function useExistingPeriods(): Set<string> {
  return computeExistingPeriods(usePricing((s) => s.rows));
}
