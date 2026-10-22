import { afterEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { loadProcessedBase, PROCESSED_BASE_CACHE_VERSION } from "./processedBaseCache";

// O leitor de envelope é CommonJS (roda no processo principal do Electron).
const require = createRequire(import.meta.url);
const { splitProcessedEnvelope } = require("../../electron/processedCacheText.js") as {
  splitProcessedEnvelope: (text: unknown) => { header: Record<string, unknown>; payloadText: string } | null;
};

const signature = { nomeArquivo: "Base \"Real\", payload: Set.csv", tamanho: 123, ultimaModificacao: "2026-09-20T21:05:00.152Z" };
const payload = {
  file: { name: "Base Real Set.csv", rowCount: 2, months: ["009.2026"] },
  warnings: [],
  missing: { skus: [], canais: [], regioes: [], ufs: [] },
  rows: [
    { periodo: "009.2026", sku: "1", canal: "VAREJO", rol: 10, payload: "x" },
    { periodo: "009.2026", sku: "2", canal: "VAREJO", rol: 20, note: ',"payload":' },
  ],
};

// Exatamente como o main grava (bases:processed-save).
function envelopeText(p: unknown = payload) {
  return JSON.stringify({ version: PROCESSED_BASE_CACHE_VERSION, cacheKind: "ke30-parsed-csv", signature, savedAt: "2026-10-22T00:00:00.000Z", payload: p });
}

describe("envelope do cache lido sem montar o payload (processo principal)", () => {
  it("separa o cabeçalho e devolve o payload como texto idêntico", () => {
    const out = splitProcessedEnvelope(envelopeText())!;
    expect(out.header).toMatchObject({ version: PROCESSED_BASE_CACHE_VERSION, cacheKind: "ke30-parsed-csv", signature });
    expect(JSON.parse(out.payloadText)).toEqual(payload);
  });

  it("aspas e a palavra payload dentro dos dados não confundem a separação", () => {
    const out = splitProcessedEnvelope(envelopeText())!;
    expect((JSON.parse(out.payloadText) as typeof payload).rows[1].note).toBe(',"payload":');
  });

  it("formato desconhecido ou truncado vira 'sem cache'", () => {
    expect(splitProcessedEnvelope("")).toBeNull();
    expect(splitProcessedEnvelope("{}")).toBeNull();
    expect(splitProcessedEnvelope(JSON.stringify({ payload: payload, version: 1 }))).toBeNull();
    expect(splitProcessedEnvelope(envelopeText().slice(0, 200))).toBeNull();
    expect(splitProcessedEnvelope(undefined)).toBeNull();
  });
});

type Api = NonNullable<NonNullable<Window["electronAPI"]>["bases"]>;
function withApi(api: Partial<Api>) {
  (window as unknown as { electronAPI?: unknown }).electronAPI = { bases: api };
}

describe("loadProcessedBase", () => {
  afterEach(() => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  });

  it("formato atual: monta o payload a partir do texto", async () => {
    withApi({ carregarProcessado: async () => ({ ok: true, hit: true, payloadText: splitProcessedEnvelope(envelopeText())!.payloadText }) });
    const out = await loadProcessedBase("ke30", "Base Real Set.csv", "ke30-parsed-csv");
    expect(out).toEqual(payload);
  });

  it("formato antigo (objeto já montado) continua funcionando", async () => {
    withApi({ carregarProcessado: async () => ({ ok: true, hit: true, payload: structuredClone(payload) }) });
    expect(await loadProcessedBase("ke30", "Base Real Set.csv", "ke30-parsed-csv")).toEqual(payload);
  });

  it("textos repetidos voltam como a mesma string (memória)", async () => {
    withApi({ carregarProcessado: async () => ({ ok: true, hit: true, payloadText: JSON.stringify(payload) }) });
    const out = (await loadProcessedBase("ke30", "x.csv", "ke30-parsed-csv")) as unknown as { rows: { canal: string }[] };
    expect(out.rows[0].canal).toBe("VAREJO");
    expect(out.rows[1].canal).toBe(out.rows[0].canal);
  });

  it("texto corrompido é tratado como sem cache (a base é reprocessada)", async () => {
    withApi({ carregarProcessado: async () => ({ ok: true, hit: true, payloadText: '{"rows":[' }) });
    expect(await loadProcessedBase("ke30", "x.csv", "ke30-parsed-csv")).toBeNull();
  });

  it("cache em blocos: junta as linhas de cada bloco em texto, na ordem", async () => {
    const header = { file: payload.file, warnings: [], missing: payload.missing };
    withApi({
      carregarProcessado: async () => ({ ok: true, hit: false }),
      carregarProcessadoManifesto: async () => ({
        ok: true, hit: true,
        manifest: { version: PROCESSED_BASE_CACHE_VERSION, cacheKind: "ke30-parsed-csv", header, totalRows: 3, chunkSize: 2, chunks: 2, complete: true },
      }),
      carregarProcessadoChunk: async (_t, _n, _k, index) => index === 0
        ? { ok: true, rowsText: JSON.stringify([{ periodo: "1", n: 1 }, { periodo: "1", n: 2 }]) }
        : { ok: true, rows: [{ periodo: "1", n: 3 }] },
    });
    const out = (await loadProcessedBase("ke30", "x.csv", "ke30-parsed-csv")) as unknown as { rows: { n: number }[] };
    expect(out.rows.map((r) => r.n)).toEqual([1, 2, 3]);
  });

  it("bloco faltando ou contagem diferente invalida o cache em blocos", async () => {
    const header = { file: payload.file, warnings: [], missing: payload.missing };
    const manifest = { version: PROCESSED_BASE_CACHE_VERSION, cacheKind: "ke30-parsed-csv", header, totalRows: 5, chunkSize: 2, chunks: 1, complete: true };
    withApi({
      carregarProcessado: async () => ({ ok: true, hit: false }),
      carregarProcessadoManifesto: async () => ({ ok: true, hit: true, manifest }),
      carregarProcessadoChunk: async () => ({ ok: true, rowsText: "[]" }),
    });
    expect(await loadProcessedBase("ke30", "x.csv", "ke30-parsed-csv")).toBeNull();
    withApi({
      carregarProcessado: async () => ({ ok: true, hit: false }),
      carregarProcessadoManifesto: async () => ({ ok: true, hit: true, manifest: { ...manifest, totalRows: 0 } }),
      carregarProcessadoChunk: async () => ({ ok: true, rowsText: "não é json" }),
    });
    expect(await loadProcessedBase("ke30", "x.csv", "ke30-parsed-csv")).toBeNull();
  });
});
