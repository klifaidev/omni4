import { describe, expect, it } from "vitest";
import type { PricingRow } from "@/lib/types";
import {
  defaultTabVisualPeriod,
  resolveTabVisualPeriods,
  tabVisualPeriodOptions,
  tabVisualPeriodRange,
} from "./tabVisualPeriod";

const ALL = ["001.2026", "002.2026", "003.2026", "004.2026", "005.2026", "006.2026"];

function rowsFor(periods: string[]): PricingRow[] {
  return periods.map((periodo) => {
    const [mes, ano] = periodo.split(".").map(Number);
    return { periodo, mes, ano } as PricingRow;
  });
}

describe("tabVisualPeriod", () => {
  it("histórico todo vira ao vivo sem limite; travado guarda todos os meses de agora", () => {
    const options = tabVisualPeriodOptions(null, ALL);
    expect(options.live).toEqual({ mode: "live", months: null });
    expect(options.locked).toEqual({ mode: "locked", periods: ALL });
    expect(defaultTabVisualPeriod(null, ALL)).toEqual({ mode: "live", months: null });
  });

  it("ao vivo mostra hoje exatamente os meses escolhidos, mesmo no passado", () => {
    const rows = rowsFor(ALL);
    const live = defaultTabVisualPeriod(["001.2026", "002.2026", "003.2026"], ALL, rows);
    expect(live).toEqual({ mode: "live", months: 3, endOffset: 3 });
    expect(resolveTabVisualPeriods(rows, live)).toEqual(["001.2026", "002.2026", "003.2026"]);
  });

  it("ao vivo anda junto com o mês de referência", () => {
    const live = defaultTabVisualPeriod(["001.2026", "002.2026"], ALL, rowsFor(ALL));
    // Referência volta 2 meses (deck cortado em Abr): a janela recua 2 meses.
    const capped = rowsFor(["010.2025", "011.2025", "012.2025", ...ALL.slice(0, 4)]);
    expect(resolveTabVisualPeriods(capped, live)).toEqual(["011.2025", "012.2025"]);
  });

  it("seleção salteada guarda cada mês em relação à referência", () => {
    const rows = rowsFor(ALL);
    const live = defaultTabVisualPeriod(["006.2026", "002.2026"], ALL, rows);
    expect(live).toEqual({ mode: "live", months: 2, offsets: [4, 0] });
    expect(resolveTabVisualPeriods(rows, live)).toEqual(["002.2026", "006.2026"]);
  });

  it("travado não muda; ao vivo sem limite devolve todos", () => {
    const capped = rowsFor(ALL.slice(0, 4));
    expect(resolveTabVisualPeriods(capped, { mode: "live", months: 2 })).toEqual(["003.2026", "004.2026"]);
    expect(resolveTabVisualPeriods(capped, { mode: "live", months: null })).toBeNull();
    expect(resolveTabVisualPeriods(capped, { mode: "locked", periods: ["001.2026"] })).toEqual(["001.2026"]);
  });

  it("descreve o intervalo mostrado", () => {
    const rows = rowsFor(ALL);
    expect(tabVisualPeriodRange(rows, { mode: "live", months: 3 })).toBe("Abr/26 – Jun/26");
    expect(tabVisualPeriodRange(rows, { mode: "locked", periods: ["001.2026", "003.2026"] })).toBe("2 meses (Jan/26, Mar/26)");
  });
});
