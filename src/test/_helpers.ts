import type { PricingRow } from "@/lib/types";

export function makeRow(p: Partial<PricingRow> = {}): PricingRow {
  return {
    periodo: "005.2025",
    mes: 5,
    ano: 2025,
    fy: "FY25/26",
    fyNum: 2526,
    rol: 0,
    volumeKg: 0,
    cogs: 0,
    custoVariavel: 0,
    custoFixo: 0,
    margemBruta: 0,
    contribMarginal: 0,
    frete: 0,
    comissao: 0,
    ...p,
  };
}
