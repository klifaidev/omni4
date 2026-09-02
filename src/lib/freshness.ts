import { monthLabel } from "@/lib/format";

export interface FreshnessStatus {
  status: "empty" | "current" | "stale";
  lastLabel: string | null;
  lastPeriodo: string | null;
  monthsBehind: number;
  expectedLabel: string;
}

export function getFreshness(
  months: { mes: number; ano: number; periodo: string }[],
): FreshnessStatus {
  // Trabalhamos com fechamento mensal — o mês corrente nunca está fechado
  // ainda, então "atualizado" significa ter o fechamento do mês ANTERIOR
  // ao atual, não do mês corrente. new Date(ano, mes-1, 1) com mes=0 rola
  // corretamente pra dezembro do ano anterior quando estamos em janeiro.
  const now = new Date();
  const expectedDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const expectedMes = expectedDate.getMonth() + 1;
  const expectedAno = expectedDate.getFullYear();
  const expectedLabel = monthLabel(expectedMes, expectedAno);

  if (months.length === 0) {
    return { status: "empty", lastLabel: null, lastPeriodo: null, monthsBehind: 0, expectedLabel };
  }
  const last = months[months.length - 1];
  const lastLabel = monthLabel(last.mes, last.ano);
  const monthsBehind = (expectedAno - last.ano) * 12 + (expectedMes - last.mes);
  const status: FreshnessStatus["status"] = monthsBehind <= 0 ? "current" : "stale";
  return {
    status,
    lastLabel,
    lastPeriodo: last.periodo,
    monthsBehind: Math.max(0, monthsBehind),
    expectedLabel,
  };
}
