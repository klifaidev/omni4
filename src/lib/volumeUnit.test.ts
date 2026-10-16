import { describe, expect, it } from "vitest";
import { detectVolumeUnit } from "./volumeUnit";

const rows = (n: number, volume: (i: number) => number) => Array.from({ length: n }, (_, i) => ({ volumeKg: volume(i) }));

describe("detectVolumeUnit", () => {
  it("base em toneladas: quase tudo abaixo de 1", () => {
    // 0,03 (30 kg) é a mediana das bases KE30 reais; poucas linhas passam de 1 t.
    const d = detectVolumeUnit(rows(1000, (i) => (i % 25 === 0 ? 2.5 : 0.03)));
    expect(d.guess).toBe("ton");
    expect(d.shareBelowOne).toBeGreaterThan(0.9);
  });

  it("base em quilos: linhas de dezenas de kg", () => {
    expect(detectVolumeUnit(rows(1000, (i) => 10 + (i % 90))).guess).toBe("kg");
  });

  it("ignora volume zero e negativo", () => {
    const d = detectVolumeUnit(rows(1000, (i) => (i % 2 ? 0 : -5)));
    expect(d.sampled).toBe(0);
    expect(d.guess).toBe("unknown");
  });

  it("amostra pequena demais não opina", () => {
    expect(detectVolumeUnit(rows(10, () => 0.01)).guess).toBe("unknown");
  });

  it("mistura sem maioria clara não opina", () => {
    expect(detectVolumeUnit(rows(1000, (i) => (i % 2 ? 0.05 : 30))).guess).toBe("unknown");
  });

  it("amostra uma base enorme sem varrer tudo", () => {
    const big = rows(1_000_000, () => 0.02);
    const d = detectVolumeUnit(big);
    expect(d.guess).toBe("ton");
    expect(d.sampled).toBeLessThanOrEqual(20_001);
  });
});

describe("formatNumFit e ticket médio", async () => {
  const { formatNumFit } = await import("./format");
  const { formatValue } = await import("./customKpi");

  it("nunca mostra 0,0 para um valor que não é zero", () => {
    expect(formatNumFit(0.0059, 1)).toBe("0,0059");
    expect(formatNumFit(0.04, 1)).toBe("0,040");
    expect(formatNumFit(0, 1)).toBe("0,0");
  });

  it("valores normais seguem as casas pedidas", () => {
    expect(formatNumFit(5.94, 1)).toBe("5,9");
    expect(formatNumFit(1234.5, 0)).toBe("1.235");
  });

  it("valor irrisório vira ~0 em vez de 0,0000", () => {
    expect(formatNumFit(0.00001, 1)).toBe("~0");
  });

  it("ticket médio pequeno aparece de verdade; em toneladas ganha /cliente", () => {
    expect(formatValue(0.0059, "auto", "ticketMedio")).toBe("0,0059 kg/cliente");
    expect(formatValue(5.9, "auto", "ticketMedio")).toBe("5,9 kg/cliente");
    expect(formatValue(5900, "tons", "ticketMedio")).toBe("5,9 t/cliente");
  });
});
