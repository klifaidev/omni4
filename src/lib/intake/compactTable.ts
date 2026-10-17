// Tabela compacta (.omnib) — o formato em que o Omni4 guarda as bases.
//
// Um XLSX é um zip de XML: abrir a Base One (~30 MB) leva dezenas de segundos
// e mais de 1 GB de memória só para o leitor de planilha. Depois de reconhecer
// cada aba, guardamos só os dados, coluna a coluna:
// - textos viram um dicionário + códigos inteiros (8, 16 ou 32 bits, o menor
//   que couber) — "Setembro 2026" repetido 75 mil vezes é guardado uma vez;
// - colunas só de números viram Float64 binário (sem texto, sem parse);
// - o arquivo inteiro passa por gzip.
// Ler de volta é um JSON pequeno + views sobre o buffer: milissegundos.

export const COMPACT_TABLE_FORMAT = "omni-table";
export const COMPACT_TABLE_VERSION = 1;
export const COMPACT_TABLE_EXTENSION = ".omnib";

export type CompactValue = string | number | boolean;

export type CompactColumn =
  /** Só números (vazio = NaN). */
  | { type: "num"; values: Float64Array }
  /** Qualquer outra coisa: código 0 = vazio, código n = dict[n - 1]. */
  | { type: "dict"; dict: CompactValue[]; codes: Uint8Array | Uint16Array | Uint32Array };

export interface CompactTable {
  /** Linhas até o cabeçalho (inclusive), como vieram da planilha. */
  head: unknown[][];
  /** Linhas de dados (depois do cabeçalho). */
  rowCount: number;
  columns: CompactColumn[];
}

export interface CompactTableMeta {
  /** Que base esta tabela alimenta. */
  kind: string;
  /** Arquivo e aba de origem. */
  sourceName: string;
  sheetName: string;
  /** Tamanho do arquivo de origem, para mostrar o ganho da conversão. */
  sourceBytes?: number;
  createdAt: string;
}

const isEmpty = (v: unknown) => v === null || v === undefined || v === "";

/**
 * Monta a tabela compacta a partir das linhas da planilha. `headerRow` é a
 * linha do cabeçalho; tudo depois dela vira dado.
 */
export function toCompactTable(rows: ArrayLike<unknown>[], headerRow: number): CompactTable {
  const head = rows.slice(0, headerRow + 1).map((row) => Array.from(row ?? []));
  const data = rows.slice(headerRow + 1);
  // Linhas totalmente vazias no fim da aba não são dado.
  let rowCount = data.length;
  while (rowCount > 0 && isBlank(data[rowCount - 1])) rowCount--;

  let width = 0;
  for (const row of head) width = Math.max(width, row.length);
  for (let r = 0; r < rowCount; r++) width = Math.max(width, data[r]?.length ?? 0);

  const columns: CompactColumn[] = [];
  for (let c = 0; c < width; c++) {
    let numeric = true;
    for (let r = 0; r < rowCount; r++) {
      const v = data[r]?.[c];
      if (isEmpty(v)) continue;
      if (typeof v !== "number" || !Number.isFinite(v)) {
        numeric = false;
        break;
      }
    }
    if (numeric) {
      const values = new Float64Array(rowCount);
      for (let r = 0; r < rowCount; r++) {
        const v = data[r]?.[c];
        values[r] = isEmpty(v) ? NaN : (v as number);
      }
      columns.push({ type: "num", values });
      continue;
    }
    const dict: CompactValue[] = [];
    const index = new Map<CompactValue, number>();
    const raw = new Uint32Array(rowCount);
    for (let r = 0; r < rowCount; r++) {
      let v = data[r]?.[c];
      if (isEmpty(v)) continue;
      if (v instanceof Date) v = v.toISOString();
      else if (typeof v !== "number" && typeof v !== "boolean") v = String(v);
      const key = v as CompactValue;
      let code = index.get(key);
      if (code === undefined) {
        dict.push(key);
        code = dict.length;
        index.set(key, code);
      }
      raw[r] = code;
    }
    columns.push({ type: "dict", dict, codes: narrowCodes(raw, dict.length) });
  }
  return { head, rowCount, columns };
}

function isBlank(row: ArrayLike<unknown> | undefined): boolean {
  if (!row) return true;
  for (let i = 0; i < row.length; i++) if (!isEmpty(row[i])) return false;
  return true;
}

function narrowCodes(raw: Uint32Array, max: number): Uint8Array | Uint16Array | Uint32Array {
  if (max < 0xff) return Uint8Array.from(raw);
  if (max < 0xffff) return Uint16Array.from(raw);
  return raw;
}

/** Valor da célula (linha de dados `row`, coluna `col`); vazio = null. */
export function compactCell(table: CompactTable, row: number, col: number): CompactValue | null {
  const column = table.columns[col];
  if (!column) return null;
  if (column.type === "num") {
    const v = column.values[row];
    return Number.isNaN(v) ? null : v;
  }
  const code = column.codes[row];
  return code === 0 ? null : column.dict[code - 1];
}

/** Cabeçalho = última linha de `head`, como texto. */
export function compactHeaders(table: CompactTable): string[] {
  const header = table.head[table.head.length - 1] ?? [];
  const width = Math.max(header.length, table.columns.length);
  return Array.from({ length: width }, (_, i) => String(header[i] ?? "").trim());
}

/** Linhas de dados como arrays (o formato que os leitores de base consomem). */
export function compactDataRows(table: CompactTable): unknown[][] {
  const width = table.columns.length;
  const rows: unknown[][] = new Array(table.rowCount);
  for (let r = 0; r < table.rowCount; r++) {
    const row = new Array(width);
    for (let c = 0; c < width; c++) row[c] = compactCell(table, r, c);
    rows[r] = row;
  }
  return rows;
}

/** Todas as linhas (cabeçalho incluso), para leitores que acham o cabeçalho sozinhos. */
export function compactAllRows(table: CompactTable): unknown[][] {
  return [...table.head, ...compactDataRows(table)];
}

/** Mantém só as linhas de dados em que `keep(row)` é verdadeiro. */
export function filterCompactRows(table: CompactTable, keep: (row: number) => boolean): CompactTable {
  const picked: number[] = [];
  for (let r = 0; r < table.rowCount; r++) if (keep(r)) picked.push(r);
  if (picked.length === table.rowCount) return table;
  const columns: CompactColumn[] = table.columns.map((column) => {
    if (column.type === "num") return { type: "num", values: Float64Array.from(picked, (r) => column.values[r]) };
    const source = column.codes;
    const codes = source instanceof Uint8Array
      ? new Uint8Array(picked.length)
      : source instanceof Uint16Array ? new Uint16Array(picked.length) : new Uint32Array(picked.length);
    picked.forEach((r, i) => { codes[i] = source[r]; });
    return { type: "dict", dict: column.dict, codes };
  });
  return { head: table.head, rowCount: picked.length, columns };
}

// ── Arquivo .omnib ───────────────────────────────────────────────────────
// [4 bytes: tamanho do cabeçalho JSON][cabeçalho JSON][blocos binários
// alinhados em 8 bytes], tudo em gzip.

interface FileHeader {
  format: typeof COMPACT_TABLE_FORMAT;
  version: number;
  meta: CompactTableMeta;
  head: unknown[][];
  rowCount: number;
  columns: Array<
    | { type: "num"; offset: number }
    | { type: "dict"; dict: CompactValue[]; bits: 8 | 16 | 32; offset: number }
  >;
}

const align8 = (n: number) => (n + 7) & ~7;

export async function encodeCompactTable(table: CompactTable, meta: CompactTableMeta): Promise<Uint8Array> {
  const blobs: Uint8Array[] = [];
  const columns: FileHeader["columns"] = [];
  let offset = 0;
  for (const column of table.columns) {
    const bytes = column.type === "num"
      ? new Uint8Array(column.values.buffer, column.values.byteOffset, column.values.byteLength)
      : new Uint8Array(column.codes.buffer, column.codes.byteOffset, column.codes.byteLength);
    if (column.type === "num") columns.push({ type: "num", offset });
    else columns.push({ type: "dict", dict: column.dict, bits: (column.codes.BYTES_PER_ELEMENT * 8) as 8 | 16 | 32, offset });
    blobs.push(bytes);
    offset = align8(offset + bytes.byteLength);
  }
  const header: FileHeader = {
    format: COMPACT_TABLE_FORMAT,
    version: COMPACT_TABLE_VERSION,
    meta,
    head: table.head,
    rowCount: table.rowCount,
    columns,
  };
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const dataStart = align8(4 + headerBytes.byteLength);
  const out = new Uint8Array(dataStart + offset);
  new DataView(out.buffer).setUint32(0, headerBytes.byteLength, true);
  out.set(headerBytes, 4);
  let cursor = dataStart;
  for (const bytes of blobs) {
    out.set(bytes, cursor);
    cursor = align8(cursor + bytes.byteLength);
  }
  return gzip(out);
}

export async function decodeCompactTable(gzipped: Uint8Array | ArrayBuffer): Promise<{ table: CompactTable; meta: CompactTableMeta }> {
  const bytes = await gunzip(gzipped instanceof Uint8Array ? gzipped : new Uint8Array(gzipped));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerLength = view.getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + headerLength))) as FileHeader;
  if (header.format !== COMPACT_TABLE_FORMAT || header.version !== COMPACT_TABLE_VERSION) {
    throw new Error("Arquivo .omnib de uma versão que este Omni4 não conhece.");
  }
  // Copia para um buffer próprio, começando em zero: as views tipadas exigem
  // offset alinhado ao tamanho do elemento.
  const dataStart = align8(4 + headerLength);
  const data = bytes.slice(dataStart);
  const n = header.rowCount;
  const columns: CompactColumn[] = header.columns.map((column) => {
    if (column.type === "num") return { type: "num", values: new Float64Array(data.buffer, column.offset, n) };
    const codes = column.bits === 8
      ? new Uint8Array(data.buffer, column.offset, n)
      : column.bits === 16
        ? new Uint16Array(data.buffer, column.offset, n)
        : new Uint32Array(data.buffer, column.offset, n);
    return { type: "dict", dict: column.dict, codes };
  });
  return { table: { head: header.head, rowCount: n, columns }, meta: header.meta };
}

export function isCompactTableName(name: string): boolean {
  return name.toLowerCase().endsWith(COMPACT_TABLE_EXTENSION);
}

async function pipe(bytes: Uint8Array, transform: ReadableWritablePair<Uint8Array, Uint8Array>): Promise<Uint8Array> {
  const stream = new Response(bytes).body!.pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  return pipe(bytes, new CompressionStream("gzip") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
}

function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  return pipe(bytes, new DecompressionStream("gzip") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
}
