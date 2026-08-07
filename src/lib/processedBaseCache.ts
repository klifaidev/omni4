import type { ParsedBudget } from "@/lib/budget";
import type { ParsedCsv } from "@/lib/csv";
import type { TipoBase } from "@/hooks/use-bases-locais";

export const PROCESSED_BASE_CACHE_VERSION = 1;
const MAX_AUTO_CACHE_ROWS = 200_000;

export type ProcessedBaseCacheKind = "ke30-parsed-csv" | "budget-parsed-xlsx";

type ProcessedPayload = ParsedCsv | ParsedBudget;

function hasFileShape(value: unknown): value is { name: string; rowCount: number; months: string[] } {
  const file = value as { name?: unknown; rowCount?: unknown; months?: unknown } | null;
  return (
    !!file &&
    typeof file.name === "string" &&
    typeof file.rowCount === "number" &&
    Array.isArray(file.months)
  );
}

function hasParsedShape(value: unknown): value is ProcessedPayload {
  const payload = value as { rows?: unknown; file?: unknown; warnings?: unknown } | null;
  return (
    !!payload &&
    Array.isArray(payload.rows) &&
    hasFileShape(payload.file) &&
    Array.isArray(payload.warnings)
  );
}

function canAutoCachePayload(payload: ProcessedPayload): boolean {
  return payload.rows.length <= MAX_AUTO_CACHE_ROWS;
}

export async function loadProcessedBase<T extends ProcessedPayload>(
  tipo: TipoBase,
  nomeArquivo: string,
  cacheKind: ProcessedBaseCacheKind,
): Promise<T | null> {
  const api = window.electronAPI?.bases;
  if (!api?.carregarProcessado) return null;
  const result = await api.carregarProcessado(tipo, nomeArquivo, cacheKind, PROCESSED_BASE_CACHE_VERSION);
  if (!result.ok || !result.hit || !hasParsedShape(result.payload)) return null;
  return result.payload as T;
}

export async function saveProcessedBase(
  tipo: TipoBase,
  nomeArquivo: string,
  cacheKind: ProcessedBaseCacheKind,
  payload: ProcessedPayload,
): Promise<void> {
  const api = window.electronAPI?.bases;
  if (!api?.salvarProcessado || !hasParsedShape(payload)) return;
  if (!canAutoCachePayload(payload)) return;
  try {
    await api.salvarProcessado(tipo, nomeArquivo, cacheKind, PROCESSED_BASE_CACHE_VERSION, payload);
  } catch (error) {
    console.warn("Nao foi possivel salvar cache processado da base:", tipo, nomeArquivo, error);
  }
}

export function saveProcessedBaseInBackground(
  tipo: TipoBase,
  nomeArquivo: string,
  cacheKind: ProcessedBaseCacheKind,
  payload: ProcessedPayload,
): void {
  if (!hasParsedShape(payload)) return;
  if (!canAutoCachePayload(payload)) return;
  window.setTimeout(() => {
    void saveProcessedBase(tipo, nomeArquivo, cacheKind, payload);
  }, 30000);
}
