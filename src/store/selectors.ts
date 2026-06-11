import { useMemo } from "react";
import { usePricing } from "./pricing";
import type { MonthInfo, PricingRow } from "@/lib/types";
import { monthLabel } from "@/lib/format";
import { applyFilters } from "@/lib/analytics";

/** Indica se, dados os filtros + períodos atuais, restam linhas a serem analisadas. */
export function useHasFilteredData(): boolean {
  const rows = usePricing((s) => s.rows);
  const filters = usePricing((s) => s.filters);
  const selected = usePricing((s) => s.selectedPeriods);
  return useMemo(
    () => applyFilters(rows, filters, selected).length > 0,
    [rows, filters, selected],
  );
}

export function useMonthsInfo(): MonthInfo[] {
  const rows = usePricing((s) => s.rows);
  return useMemo(() => {
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
  }, [rows]);
}

export function useFyList(): string[] {
  const rows = usePricing((s) => s.rows);
  return useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(r.fy);
    return Array.from(set).sort();
  }, [rows]);
}

export function useExistingPeriods(): Set<string> {
  const rows = usePricing((s) => s.rows);
  return useMemo(() => {
    const set = new Set<string>();
    for (const r of rows as PricingRow[]) set.add(r.periodo);
    return set;
  }, [rows]);
}
