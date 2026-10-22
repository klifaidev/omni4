// Linhas da base para o worker dos Slides em formato de colunas.
//
// O worker recebia as linhas como objetos: o postMessage clona objeto por
// objeto, de forma síncrona, na thread da tela. Medido com as bases reais de
// um usuário (≈1,4 milhão de linhas por conjunto, até 3 conjuntos por deck),
// isso eram ~15 s de CPU na abertura dos Slides, com a tela parada por até 6 s
// seguidos, e ~1 GB de cópia por conjunto. Agora a tela monta uma coluna por
// campo (números em Float64Array, textos como códigos de um dicionário), em
// fatias curtas que devolvem a vez para a tela, e transfere os buffers sem
// cópia (~4x menos memória); o worker remonta os objetos — iguais aos
// originais, valor por valor (inclusive campos ausentes, undefined e null).
//
// Qualquer coisa fora do formato esperado (valor que não é texto nem número,
// ou um campo que mistura os dois) devolve null: quem chama envia as linhas do
// jeito antigo, e o resultado nunca muda.

const STATE_VALUE = 0;
const STATE_ABSENT = 1;
const STATE_UNDEFINED = 2;
const STATE_NULL = 3;

interface NumColumn {
  key: string;
  kind: "num";
  values: Float64Array;
  state: Uint8Array | null;
}

interface StrColumn {
  key: string;
  kind: "str";
  dict: string[];
  codes: Uint16Array | Int32Array;
  state: Uint8Array | null;
}

export type PackedColumn = NumColumn | StrColumn;

export interface PackedRows {
  n: number;
  columns: PackedColumn[];
}

/** Estado de montagem de uma coluna (fica só na tela). */
interface Builder {
  col: PackedColumn;
  index: Map<string, number> | null;
  lastValue: unknown;
  lastCode: number;
  seenAt: number;
}

const CHUNK_ROWS = 20_000;

function defaultYield(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Monta as colunas, `yieldEvery` linhas por vez, devolvendo a vez para a tela
 * entre as fatias. Devolve null se as linhas não couberem no formato.
 */
export async function packRows(
  rows: readonly object[],
  yieldFn: () => Promise<void> = defaultYield,
  yieldEvery = CHUNK_ROWS,
): Promise<PackedRows | null> {
  const n = rows.length;
  const builders: Builder[] = [];
  const byKey = new Map<string, Builder>();
  // Campos ainda sem tipo conhecido (só undefined/null até aqui).
  const pending = new Map<string, Array<[number, number]>>();
  // Linhas da mesma base têm os campos na mesma ordem: a coluna é achada pela
  // posição do campo, sem procurar pelo nome.
  const posKeys: string[] = [];
  const posBuilders: (Builder | undefined)[] = [];

  const setState = (b: Builder, i: number, state: number) => {
    if (!b.col.state) b.col.state = new Uint8Array(n);
    b.col.state[i] = state;
  };

  const create = (key: string, value: unknown, row: number): Builder | null => {
    let col: PackedColumn;
    if (typeof value === "number") col = { key, kind: "num", values: new Float64Array(n), state: null };
    else if (typeof value === "string") col = { key, kind: "str", dict: [], codes: new Uint16Array(n), state: null };
    else return null;
    const b: Builder = { col, index: col.kind === "str" ? new Map() : null, lastValue: undefined, lastCode: -1, seenAt: -1 };
    if (row > 0) {
      col.state = new Uint8Array(n);
      col.state.fill(STATE_ABSENT, 0, row);
    }
    // Linhas anteriores que tinham o campo com undefined/null.
    const marks = pending.get(key);
    if (marks) {
      for (const [r, state] of marks) setState(b, r, state);
      pending.delete(key);
    }
    builders.push(b);
    byKey.set(key, b);
    return b;
  };

  for (let start = 0; start < n; start += yieldEvery) {
    const end = Math.min(n, start + yieldEvery);
    for (let i = start; i < end; i++) {
      const row = rows[i] as Record<string, unknown>;
      let pos = 0;
      let seen = 0;
      for (const key in row) {
        const value = row[key];
        let b = posKeys[pos] === key ? posBuilders[pos] : byKey.get(key);
        if (value === undefined || value === null) {
          const state = value === undefined ? STATE_UNDEFINED : STATE_NULL;
          if (b) {
            setState(b, i, state);
            b.seenAt = i;
            seen++;
          } else {
            let marks = pending.get(key);
            if (!marks) pending.set(key, (marks = []));
            marks.push([i, state]);
          }
        } else {
          if (!b) {
            const created = create(key, value, i);
            if (!created) return null;
            b = created;
          }
          b.seenAt = i;
          seen++;
          const col = b.col;
          if (col.kind === "num") {
            if (typeof value !== "number") return null;
            col.values[i] = value;
          } else {
            if (typeof value !== "string") return null;
            if (value === b.lastValue) {
              col.codes[i] = b.lastCode;
            } else {
              let code = b.index!.get(value);
              if (code === undefined) {
                code = col.dict.length;
                col.dict.push(value);
                b.index!.set(value, code);
                if (code > 0xffff && col.codes instanceof Uint16Array) {
                  const wider = new Int32Array(n);
                  wider.set(col.codes);
                  col.codes = wider;
                }
              }
              col.codes[i] = code;
              b.lastValue = value;
              b.lastCode = code;
            }
          }
        }
        posKeys[pos] = key;
        posBuilders[pos] = b;
        pos++;
      }
      // Campos que esta linha não tem.
      if (seen !== builders.length) {
        for (const b of builders) if (b.seenAt !== i) setState(b, i, STATE_ABSENT);
      }
    }
    if (end < n) await yieldFn();
  }

  const columns = builders.map((b) => b.col);
  // Campos que só tiveram undefined/null: coluna de texto vazia, só estados.
  for (const [key, marks] of pending) {
    const state = new Uint8Array(n).fill(STATE_ABSENT);
    for (const [r, s] of marks) state[r] = s;
    columns.push({ key, kind: "str", dict: [], codes: new Uint16Array(n), state });
  }
  return { n, columns };
}

/** Buffers para transferir (sem cópia) junto do postMessage. */
export function packedTransferList(packed: PackedRows): ArrayBuffer[] {
  const out: ArrayBuffer[] = [];
  for (const col of packed.columns) {
    out.push((col.kind === "num" ? col.values : col.codes).buffer as ArrayBuffer);
    if (col.state) out.push(col.state.buffer as ArrayBuffer);
  }
  return out;
}

/** Remonta os objetos (roda no worker). */
export function unpackRows<T = Record<string, unknown>>(packed: PackedRows): T[] {
  const { n, columns } = packed;
  const out = new Array<T>(n);
  for (let i = 0; i < n; i++) {
    const row: Record<string, unknown> = {};
    for (const col of columns) {
      const state = col.state ? col.state[i] : STATE_VALUE;
      if (state === STATE_ABSENT) continue;
      if (state === STATE_UNDEFINED) row[col.key] = undefined;
      else if (state === STATE_NULL) row[col.key] = null;
      else row[col.key] = col.kind === "num" ? col.values[i] : col.dict[col.codes[i]];
    }
    out[i] = row as T;
  }
  return out;
}

// ── Envio em partes (tela → worker) ──────────────────────────────────────

/** Linhas por parte (cada parte: ~20-35 ms de tela com bases reais). */
export const UPLOAD_PART_ROWS = 20_000;

export type RowsRegisterMessage =
  | { type: "registerStart"; rowsKey: string; total: number }
  | { type: "registerPart"; rowsKey: string; part: PackedRows }
  | { type: "registerEnd"; rowsKey: string }
  | { type: "register"; rowsKey: string; rows: object[] };

export function isRowsRegisterMessage(message: unknown): message is RowsRegisterMessage {
  const type = (message as { type?: unknown } | null)?.type;
  return type === "registerStart" || type === "registerPart" || type === "registerEnd" || type === "register";
}

/**
 * Entrega um conjunto de linhas a um worker em partes no formato de colunas,
 * devolvendo a vez para a tela entre elas. `stillValid` é consultado entre as
 * partes: se o worker foi trocado/encerrado no meio, o envio é abandonado
 * (rejeita). Se alguma parte não couber no formato, o conjunto inteiro vai do
 * jeito antigo (objetos) — o worker substitui o que tinha recebido.
 */
export async function uploadRowsInParts(
  target: { postMessage: (message: unknown, transfer?: Transferable[]) => void },
  rowsKey: string,
  rows: readonly object[],
  stillValid: () => boolean,
  yieldFn: () => Promise<void> = defaultYield,
): Promise<void> {
  target.postMessage({ type: "registerStart", rowsKey, total: rows.length });
  for (let start = 0; start < rows.length; start += UPLOAD_PART_ROWS) {
    const part = await packRows(rows.slice(start, start + UPLOAD_PART_ROWS), yieldFn, Infinity);
    if (!stillValid()) throw new Error("Worker reiniciado durante o envio das linhas.");
    if (!part) {
      target.postMessage({ type: "register", rowsKey, rows });
      return;
    }
    target.postMessage({ type: "registerPart", rowsKey, part }, packedTransferList(part));
    await yieldFn();
    if (!stillValid()) throw new Error("Worker reiniciado durante o envio das linhas.");
  }
  target.postMessage({ type: "registerEnd", rowsKey });
}

// ── Recebimento (no worker) ──────────────────────────────────────────────

/**
 * Monta, no worker, os conjuntos recebidos em partes. `store` é o mapa de
 * conjuntos prontos do worker; um conjunto só aparece nele quando chega inteiro.
 */
export function createRowsReceiver<Row extends object>(store: Map<string, Row[]>) {
  const incoming = new Map<string, Row[]>();
  return {
    handle(message: RowsRegisterMessage): void {
      if (message.type === "registerStart") {
        incoming.set(message.rowsKey, []);
        store.delete(message.rowsKey);
        return;
      }
      if (message.type === "registerPart") {
        const target = incoming.get(message.rowsKey);
        if (!target) return;
        for (const row of unpackRows<Row>(message.part)) target.push(row);
        return;
      }
      if (message.type === "registerEnd") {
        const rows = incoming.get(message.rowsKey);
        incoming.delete(message.rowsKey);
        if (rows) store.set(message.rowsKey, rows);
        return;
      }
      incoming.delete(message.rowsKey);
      store.set(message.rowsKey, message.rows as Row[]);
    },
    release(rowsKey?: string): void {
      if (rowsKey) incoming.delete(rowsKey);
      else incoming.clear();
    },
  };
}
