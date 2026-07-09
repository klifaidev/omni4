import type { BlockDataSource } from "@/lib/customSlide";

type SourceCounts = {
  pricing: number;
  budget: number;
  forecast: number;
  rolling: number;
};

export function missingLocalDataLabel(
  dataSource: BlockDataSource | undefined,
  counts: SourceCounts,
): string | null {
  if (!dataSource || dataSource === "ke30") return counts.pricing > 0 ? null : "KE30";
  if (dataSource === "budget" || dataSource === "budget_real") return counts.budget > 0 ? null : "Budget";
  if (dataSource === "forecast") return counts.forecast > 0 ? null : "Forecast";
  if (dataSource === "rolling") return counts.rolling > 0 ? null : "Rolling";
  return null;
}

export function localDataMissingMessage(label: string): string {
  return `Dados locais não encontrados para este filtro — carregue a base ${label} para ver os valores.`;
}
