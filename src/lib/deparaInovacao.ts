// De Para — classifica SKUs como "Inovação" ou "Regular".
// Funciona para Base Real e Budget, usando o SKU como chave.
import raw from "@/data/depara_inovacao.json";

export type InovacaoClass = "Inovação" | "Regular";

interface InovacaoEntry {
  classificacao: string;
  anoLancamento?: number | string | null;
  legado?: string | null;
}

const MAP = raw as Record<string, InovacaoEntry>;

export function getInovacao(sku: string | undefined | null): InovacaoClass {
  if (!sku) return "Regular";
  const key = String(sku).trim();
  if (!key) return "Regular";
  const entry = MAP[key];
  if (entry && /inova/i.test(entry.classificacao)) return "Inovação";
  return "Regular";
}

/**
 * Retorna o "legado" do SKU (ex.: "1A", "2A", "3A") conforme o De Para de Inovação.
 * Funciona como chave para Base Real e Budget. Retorna undefined se não houver.
 */
export function getLegado(sku: string | undefined | null): string | undefined {
  if (!sku) return undefined;
  const key = String(sku).trim();
  if (!key) return undefined;
  const entry = MAP[key];
  const v = entry?.legado;
  if (v == null) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
}

export const INOVACAO_SKUS = Object.keys(MAP);
