import { describe, expect, it } from "vitest";
import type { PricingRow } from "@/lib/types";
import {
  defaultTabVisualPeriod,
  resolveTabVisualPeriods,
  tabVisualPeriodOptions,
  tabVisualPeriodRange,
} from "./tabVisualPeriod";

const ALL = ["001.2026", "002.2026", "003.2026", "004.2026", "005.2026"];

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

  it("janela que termina no mês mais recente: ao vivo com o mesmo tamanho", () => {
    const selected = ["005.2026", "003.2026", "004.2026"];
    expect(defaultTabVisualPeriod(selected, ALL)).toEqual({ mode: "live", months: 3 });
    expect(tabVisualPeriodOptions(selected, ALL).locked).toEqual({ mode: "locked", periods: ["003.2026", "004.2026", "005.2026"] });
  });

  it("janela no passado: travado por padrão", () => {
    expect(defaultTabVisualPeriod(["001.2026", "002.2026"], ALL)).toEqual({ mode: "locked", periods: ["001.2026", "002.2026"] });
  });

  it("ao vivo conta a partir do último mês das linhas (já cortadas no mês de referência)", () => {
    const capped = rowsFor(ALL.slice(0, 4));
    expect(resolveTabVisualPeriods(capped, { mode: "live", months: 2 })).toEqual(["003.2026", "004.2026"]);
    expect(resolveTabVisualPeriods(capped, { mode: "live", months: null })).toBeNull();
    expect(resolveTabVisualPeriods(capped, { mode: "locked", periods: ["001.2026"] })).toEqual(["001.2026"]);
  });

  it("descreve o intervalo mostrado", () => {
    const rows = rowsFor(ALL);
    expect(tabVisualPeriodRange(rows, { mode: "live", months: 3 })).toBe("Mar/26 – Mai/26");
    expect(tabVisualPeriodRange(rows, { mode: "locked", periods: ["001.2026", "003.2026"] })).toBe("2 meses (Jan/26, Mar/26)");
  });
});
