// Dados da Evolução mensal da Visão Geral — usados pela aba e pelo slide.
import { computeCanalTrend } from "@/lib/analytics";
import type { Metric, PricingRow } from "@/lib/types";

export interface EvolucaoMensalPoint {
  periodo: string;
  label: string;
  rol: number;
  volumeKg: number;
  /** Margem % (0–100) pela métrica escolhida (contribuição ou bruta). */
  margemPctNum: number;
}

export interface EvolucaoMensalParams {
  metric: Metric;
}

export function computeEvolucaoMensal(rows: PricingRow[], params: EvolucaoMensalParams): EvolucaoMensalPoint[] {
  return computeCanalTrend(rows, null, params.metric).map((p) => ({
    periodo: p.periodo,
    label: p.label,
    rol: p.rol,
    volumeKg: p.volumeKg,
    margemPctNum: p.margemPct * 100,
  }));
}
