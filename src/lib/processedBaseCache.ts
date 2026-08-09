import type { ParsedBudget } from "@/lib/budget";
import type { ParsedCsv } from "@/lib/csv";
import type { TipoBase } from "@/hooks/use-bases-locais";
import { createStringInterner, type StringInterner } from "@/lib/stringIntern";

export const PROCESSED_BASE_CACHE_VERSION = 1;
const MAX_MONOLITHIC_CACHE_ROWS = 200_000;
const DEFAULT_CHUNKED_CACHE_ROWS = 50_000;
const MIN_CHUNKED_CACHE_ROWS = 1_000;
const TARGET_CHUNK_JSON_BYTES = 16 * 1024 * 1024;
const MAX_MONOLITHIC_CACHE_BYTES = 64 * 1024 * 1024;
const SAMPLE_ROWS_FOR_SIZE_ESTIMATE = 500;

export type ProcessedBaseCacheKind = "ke30-parsed-csv" | "budget-parsed-xlsx";

type ProcessedPayload = ParsedCsv | ParsedBudget;
type ProcessedHeader = Omit<ProcessedPayload, "rows">;

const KE30_INTERN_FIELDS = [
  "periodo",
  "fy",
  "marca",
  "canal",
  "categoria",
  "subcategoria",
  "formato",
  "sku",
  "skuDesc",
  "cliente",
  "gestorResp",
  "regiao",
  "uf",
  "regional",
  "canalAjustado",
  "mercadoAjustado",
  "mercado",
  "sabor",
  "tecnologia",
  "faixaPeso",
  "inovacao",
  "legado",
] as const;

const BUDGET_INTERN_FIELDS = [
  "periodo",
  "fy",
  "status",
  "kind",
  "canal",
  "canalAjustado",
  "sku",
  "skuDesc",
  "categoria",
  "subcategoria",
  "marca",
  "tecnologia",
  "formato",
  "mercado",
  "faixaPeso",
  "sabor",
  "inovacao",
  "legado",
] as const;

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

function estimateRowsJsonBytes(rows: unknown[]): { avgRowBytes: number; totalRowsBytes: number } {
  if (rows.length === 0) return { avgRowBytes: 2, totalRowsBytes: 2 };
  const sampleSize = Math.min(rows.length, SAMPLE_ROWS_FOR_SIZE_ESTIMATE);
  let sampleBytes = 2;
  for (let index = 0; index < sampleSize; index++) {
    const rowJson = JSON.stringify(rows[index]);
    sampleBytes += rowJson.length + 1;
  }
  const avgRowBytes = Math.max(2, sampleBytes / sampleSize);
  return {
    avgRowBytes,
    totalRowsBytes: Math.ceil(avgRowBytes * rows.length + 2),
  };
}

function computeChunkSize(avgRowBytes: number): number {
  if (!Number.isFinite(avgRowBytes) || avgRowBytes <= 0) return DEFAULT_CHUNKED_CACHE_ROWS;
  const estimatedRowsByBytes = Math.floor(TARGET_CHUNK_JSON_BYTES / avgRowBytes);
  return Math.max(MIN_CHUNKED_CACHE_ROWS, Math.min(DEFAULT_CHUNKED_CACHE_ROWS, estimatedRowsByBytes));
}

export function computeProcessedCachePlan(rows: unknown[]): {
  mode: "monolithic" | "chunked";
  chunkSize: number;
  estimatedBytes: number;
} {
  const estimate = estimateRowsJsonBytes(rows);
  const shouldChunk =
    rows.length > MAX_MONOLITHIC_CACHE_ROWS ||
    estimate.totalRowsBytes > MAX_MONOLITHIC_CACHE_BYTES;
  return {
    mode: shouldChunk ? "chunked" : "monolithic",
    chunkSize: shouldChunk ? computeChunkSize(estimate.avgRowBytes) : rows.length,
    estimatedBytes: estimate.totalRowsBytes,
  };
}

function withRows<T extends ProcessedPayload>(header: ProcessedHeader, rows: unknown[]): T | null {
  const payload = { ...header, rows };
  return hasParsedShape(payload) ? (payload as T) : null;
}

function internRowFields(row: unknown, fields: readonly string[], intern: StringInterner): void {
  if (!row || typeof row !== "object") return;
  const record = row as Record<string, unknown>;
  for (const field of fields) {
    const value = record[field];
    if (typeof value === "string") record[field] = intern(value);
  }
}

function internProcessedRows(rows: unknown[], cacheKind: ProcessedBaseCacheKind, intern: StringInterner): void {
  const fields = cacheKind === "budget-parsed-xlsx" ? BUDGET_INTERN_FIELDS : KE30_INTERN_FIELDS;
  for (const row of rows) internRowFields(row, fields, intern);
}

function internProcessedPayload<T extends ProcessedPayload>(
  payload: T,
  cacheKind: ProcessedBaseCacheKind,
  intern = createStringInterner(),
): T {
  internProcessedRows(payload.rows, cacheKind, intern);
  return payload;
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
  if (result.ok && result.hit && hasParsedShape(result.payload)) {
    return internProcessedPayload(result.payload as T, cacheKind);
  }

  const canLoadChunks = api.carregarProcessadoManifesto && api.carregarProcessadoChunk;
  if (!canLoadChunks) return null;
  const meta = await api.carregarProcessadoManifesto(tipo, nomeArquivo, cacheKind, PROCESSED_BASE_CACHE_VERSION);
  if (!meta.ok || !meta.hit || !hasChunkedManifestShape(meta.manifest)) return null;

  const rows: unknown[] = [];
  const intern = createStringInterner();
  for (let index = 0; index < meta.manifest.chunks; index++) {
    const chunk = await api.carregarProcessadoChunk(tipo, nomeArquivo, cacheKind, index);
    if (!chunk.ok || !Array.isArray(chunk.rows)) return null;
    internProcessedRows(chunk.rows, cacheKind, intern);
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
    const plan = computeProcessedCachePlan(payload.rows);
    if (plan.mode === "chunked") {
      if (!api.iniciarProcessadoEmChunks || !api.salvarProcessadoChunk || !api.finalizarProcessadoEmChunks) {
        console.warn("Cache processado grande sem suporte a chunks; salvamento ignorado:", tipo, nomeArquivo);
        return;
      }
      let chunkSize = plan.chunkSize;
      let chunkCount = Math.ceil(payload.rows.length / chunkSize);
      const start = await api.iniciarProcessadoEmChunks(
        tipo,
        nomeArquivo,
        cacheKind,
        PROCESSED_BASE_CACHE_VERSION,
        payloadHeader(payload),
        payload.rows.length,
        chunkSize,
      );
      if (!start.ok) return;
      for (let index = 0; index < chunkCount; index++) {
        const rows = payload.rows.slice(index * chunkSize, (index + 1) * chunkSize);
        const saved = await api.salvarProcessadoChunk(tipo, nomeArquivo, cacheKind, index, rows);
        if (!saved.ok) {
          if (chunkSize <= MIN_CHUNKED_CACHE_ROWS) {
            console.warn("Falha ao salvar chunk minimo do cache processado:", tipo, nomeArquivo, saved.erro);
            return;
          }
          chunkSize = Math.max(MIN_CHUNKED_CACHE_ROWS, Math.floor(chunkSize / 2));
          chunkCount = Math.ceil(payload.rows.length / chunkSize);
          index = -1;
          const restart = await api.iniciarProcessadoEmChunks(
            tipo,
            nomeArquivo,
            cacheKind,
            PROCESSED_BASE_CACHE_VERSION,
            payloadHeader(payload),
            payload.rows.length,
            chunkSize,
          );
          if (!restart.ok) return;
          await yieldToBrowser();
          continue;
        }
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
