import type { ParsedBudget } from "@/lib/budget";
import type { ParsedCsv } from "@/lib/csv";
import type { TipoBase } from "@/hooks/use-bases-locais";

export const PROCESSED_BASE_CACHE_VERSION = 1;
const MAX_MONOLITHIC_CACHE_ROWS = 200_000;
const CHUNKED_CACHE_ROWS = 50_000;

export type ProcessedBaseCacheKind = "ke30-parsed-csv" | "budget-parsed-xlsx";

type ProcessedPayload = ParsedCsv | ParsedBudget;
type ProcessedHeader = Omit<ProcessedPayload, "rows">;

interface ChunkedManifest {
  version: number;
  cacheKind: ProcessedBaseCacheKind;
  header: ProcessedHeader;
  totalRows: number;
  chunkSize: number;
  chunks: number;
  complete: boolean;
}

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

function hasChunkedManifestShape(value: unknown): value is ChunkedManifest {
  const manifest = value as Partial<ChunkedManifest> | null;
  return (
    !!manifest &&
    manifest.version === PROCESSED_BASE_CACHE_VERSION &&
    typeof manifest.cacheKind === "string" &&
    typeof manifest.totalRows === "number" &&
    typeof manifest.chunkSize === "number" &&
    typeof manifest.chunks === "number" &&
    manifest.complete === true &&
    !!manifest.header &&
    hasFileShape((manifest.header as { file?: unknown }).file) &&
    Array.isArray((manifest.header as { warnings?: unknown }).warnings)
  );
}

function payloadHeader(payload: ProcessedPayload): ProcessedHeader {
  const { rows: _rows, ...header } = payload;
  return header as ProcessedHeader;
}

function withRows<T extends ProcessedPayload>(header: ProcessedHeader, rows: unknown[]): T | null {
  const payload = { ...header, rows };
  return hasParsedShape(payload) ? (payload as T) : null;
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

export async function loadProcessedBase<T extends ProcessedPayload>(
  tipo: TipoBase,
  nomeArquivo: string,
  cacheKind: ProcessedBaseCacheKind,
): Promise<T | null> {
  const api = window.electronAPI?.bases;
  if (!api?.carregarProcessado) return null;
  const result = await api.carregarProcessado(tipo, nomeArquivo, cacheKind, PROCESSED_BASE_CACHE_VERSION);
  if (result.ok && result.hit && hasParsedShape(result.payload)) return result.payload as T;

  const canLoadChunks = api.carregarProcessadoManifesto && api.carregarProcessadoChunk;
  if (!canLoadChunks) return null;
  const meta = await api.carregarProcessadoManifesto(tipo, nomeArquivo, cacheKind, PROCESSED_BASE_CACHE_VERSION);
  if (!meta.ok || !meta.hit || !hasChunkedManifestShape(meta.manifest)) return null;

  const rows: unknown[] = [];
  for (let index = 0; index < meta.manifest.chunks; index++) {
    const chunk = await api.carregarProcessadoChunk(tipo, nomeArquivo, cacheKind, index);
    if (!chunk.ok || !Array.isArray(chunk.rows)) return null;
    rows.push(...chunk.rows);
    await yieldToBrowser();
  }
  if (rows.length !== meta.manifest.totalRows) return null;
  return withRows<T>(meta.manifest.header, rows);
}

export async function saveProcessedBase(
  tipo: TipoBase,
  nomeArquivo: string,
  cacheKind: ProcessedBaseCacheKind,
  payload: ProcessedPayload,
): Promise<void> {
  const api = window.electronAPI?.bases;
  if (!api || !hasParsedShape(payload)) return;
  try {
    if (payload.rows.length > MAX_MONOLITHIC_CACHE_ROWS && api.iniciarProcessadoEmChunks && api.salvarProcessadoChunk && api.finalizarProcessadoEmChunks) {
      const chunkCount = Math.ceil(payload.rows.length / CHUNKED_CACHE_ROWS);
      const start = await api.iniciarProcessadoEmChunks(
        tipo,
        nomeArquivo,
        cacheKind,
        PROCESSED_BASE_CACHE_VERSION,
        payloadHeader(payload),
        payload.rows.length,
        CHUNKED_CACHE_ROWS,
      );
      if (!start.ok) return;
      for (let index = 0; index < chunkCount; index++) {
        const rows = payload.rows.slice(index * CHUNKED_CACHE_ROWS, (index + 1) * CHUNKED_CACHE_ROWS);
        const saved = await api.salvarProcessadoChunk(tipo, nomeArquivo, cacheKind, index, rows);
        if (!saved.ok) return;
        await yieldToBrowser();
      }
      await api.finalizarProcessadoEmChunks(tipo, nomeArquivo, cacheKind, chunkCount);
      return;
    }
    if (!api.salvarProcessado) return;
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
  window.setTimeout(() => {
    void saveProcessedBase(tipo, nomeArquivo, cacheKind, payload);
  }, 30000);
}
