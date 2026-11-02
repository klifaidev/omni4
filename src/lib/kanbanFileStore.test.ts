// Testa o armazenamento em arquivo do processo principal (electron/fileStore.js)
// com disco de verdade, numa pasta temporária, e um relógio controlado.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { createFileStore, isSafeStoreKey } = require("../../electron/fileStore.js") as {
  createFileStore: (o: Record<string, unknown>) => {
    read: (k: string) => { ok: boolean; value?: string | null; erro?: string };
    write: (k: string, v: unknown) => { ok: boolean; erro?: string };
    remove: (k: string) => { ok: boolean; erro?: string };
    latestBackup: (k: string) => { ok: boolean; value?: string | null; erro?: string };
  };
  isSafeStoreKey: (k: unknown) => boolean;
};

const KEY = "harald.kanban.v1";
const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const silent = { warn: () => undefined, error: () => undefined };

let dir: string;
let clock: number;

function makeStore(extra: Record<string, unknown> = {}) {
  return createFileStore({
    fs, path, getDir: () => dir, now: () => clock, log: silent,
    backupCount: 3, backupMinIntervalMs: 5 * MIN, dailyKeep: 3, ...extra,
  });
}
const json = (n: number) => JSON.stringify({ columns: [], cards: {}, n });
const files = () => fs.readdirSync(dir).sort();

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "omni-filestore-"));
  clock = new Date(2026, 10, 2, 9, 0, 0).getTime(); // 02/nov/2026 09:00 (hora local)
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("chave segura", () => {
  it("só aceita nomes simples", () => {
    expect(isSafeStoreKey(KEY)).toBe(true);
    for (const bad of ["", "..", "a/b", "a\\b", "..\\x", "x..y", "a b", "ç", 42, null, undefined, "x".repeat(201)]) {
      expect(isSafeStoreKey(bad)).toBe(false);
    }
  });

  it("chave perigosa nunca toca o disco", () => {
    const store = makeStore();
    expect(store.write("../fora", json(1))).toEqual({ ok: false, erro: "parametro_invalido" });
    expect(store.read("a/b").ok).toBe(false);
    expect(fs.readdirSync(dir)).toEqual([]);
    expect(fs.existsSync(path.join(dir, "..", "fora.json"))).toBe(false);
  });
});

describe("gravação", () => {
  it("lê de volta o que gravou, sem deixar arquivo temporário", () => {
    const store = makeStore();
    expect(store.read(KEY)).toEqual({ ok: true, value: null });
    expect(store.write(KEY, json(1))).toEqual({ ok: true });
    expect(store.read(KEY)).toEqual({ ok: true, value: json(1) });
    expect(files()).toEqual([`${KEY}.json`]);
  });

  it("recusa valor que não é texto ou é grande demais", () => {
    const store = makeStore({ maxBytes: 10 });
    expect(store.write(KEY, { a: 1 }).ok).toBe(false);
    expect(store.write(KEY, "x".repeat(11))).toEqual({ ok: false, erro: "valor_grande_demais" });
  });

  it("gravar o mesmo conteúdo não gasta backup", () => {
    const store = makeStore();
    store.write(KEY, json(1));
    clock += 10 * MIN;
    store.write(KEY, json(1));
    expect(files()).toEqual([`${KEY}.json`]);
  });

  it("uma queda no meio da gravação não estraga o arquivo bom (a troca é atômica)", () => {
    const store = makeStore();
    store.write(KEY, json(1));
    // Simula o resto de uma gravação interrompida: temporário pela metade ao lado do bom.
    fs.writeFileSync(path.join(dir, `${KEY}.json.tmp`), '{"columns":[');
    expect(store.read(KEY).value).toBe(json(1));
    expect(store.write(KEY, json(2)).ok).toBe(true);
    expect(store.read(KEY).value).toBe(json(2));
    expect(files().some((f) => f.endsWith(".tmp"))).toBe(false);
  });

  it("remove só o principal; os backups ficam", () => {
    const store = makeStore();
    store.write(KEY, json(1));
    clock += 6 * MIN;
    store.write(KEY, json(2));
    expect(store.remove(KEY).ok).toBe(true);
    expect(store.read(KEY).value).toBeNull();
    expect(store.latestBackup(KEY).value).toBe(json(1));
  });
});

describe("backups em rodízio", () => {
  it("guarda o conteúdo anterior e respeita o intervalo mínimo", () => {
    const store = makeStore();
    store.write(KEY, json(1));
    store.write(KEY, json(2)); // anterior (1) vira bak1
    expect(fs.readFileSync(path.join(dir, `${KEY}.json.bak1`), "utf8")).toBe(json(1));
    clock += 1 * MIN;
    store.write(KEY, json(3)); // dentro do intervalo: não gira
    expect(fs.readFileSync(path.join(dir, `${KEY}.json.bak1`), "utf8")).toBe(json(1));
    expect(fs.existsSync(path.join(dir, `${KEY}.json.bak2`))).toBe(false);
    clock += 6 * MIN;
    store.write(KEY, json(4)); // fora do intervalo: 3 vira bak1, 1 desce para bak2
    expect(fs.readFileSync(path.join(dir, `${KEY}.json.bak1`), "utf8")).toBe(json(3));
    expect(fs.readFileSync(path.join(dir, `${KEY}.json.bak2`), "utf8")).toBe(json(1));
  });

  it("mantém no máximo N cópias", () => {
    const store = makeStore();
    for (let i = 1; i <= 12; i += 1) {
      store.write(KEY, json(i));
      clock += 6 * MIN;
    }
    const baks = files().filter((f) => /\.bak\d+$/.test(f));
    expect(baks).toEqual([`${KEY}.json.bak1`, `${KEY}.json.bak2`, `${KEY}.json.bak3`]);
  });
});

describe("instantâneo diário", () => {
  it("um por dia, com o estado do fim do dia anterior, e só os últimos N", () => {
    const store = makeStore({ backupMinIntervalMs: 0 });
    store.write(KEY, json(1)); // dia 2
    clock += DAY;
    store.write(KEY, json(2)); // dia 3: instantâneo do dia 3 = estado 1
    store.write(KEY, json(3)); // ainda dia 3: não cria outro
    const dailies = () => files().filter((f) => f.includes(".daily-"));
    expect(dailies()).toEqual([`${KEY}.json.daily-2026-11-03`]);
    expect(fs.readFileSync(path.join(dir, dailies()[0]), "utf8")).toBe(json(1));
    for (let i = 4; i <= 9; i += 1) {
      clock += DAY;
      store.write(KEY, json(i));
    }
    expect(dailies()).toHaveLength(3);
    expect(dailies()[2]).toBe(`${KEY}.json.daily-2026-11-09`);
  });

  it("um engano percebido dias depois ainda tem de onde voltar", () => {
    const store = makeStore({ backupCount: 2, backupMinIntervalMs: 0 });
    store.write(KEY, json(1));
    clock += DAY;
    store.write(KEY, json(2)); // bom
    clock += 1 * MIN;
    store.write(KEY, JSON.stringify({ columns: [], cards: {}, apagado: true })); // engano
    clock += 1 * MIN;
    store.write(KEY, JSON.stringify({ columns: [], cards: {}, apagado: "de novo" }));
    // O rodízio (2 cópias) já só tem estados pós-engano; o diário guarda o do dia anterior.
    const backup = store.latestBackup(KEY).value as string;
    expect(JSON.parse(backup).apagado).toBeTruthy(); // mais recente primeiro
    fs.unlinkSync(path.join(dir, `${KEY}.json.bak1`));
    fs.unlinkSync(path.join(dir, `${KEY}.json.bak2`));
    expect(store.latestBackup(KEY).value).toBe(json(1));
  });
});

describe("arquivo ilegível", () => {
  it("vai para o lado e NÃO entra no rodízio (os backups bons ficam)", () => {
    const store = makeStore({ backupMinIntervalMs: 0 });
    store.write(KEY, json(1));
    store.write(KEY, json(2)); // bak1 = 1
    fs.writeFileSync(path.join(dir, `${KEY}.json`), '{"columns":[{"id":'); // corrompido
    expect(store.write(KEY, json(3)).ok).toBe(true);
    expect(store.read(KEY).value).toBe(json(3));
    expect(fs.readFileSync(path.join(dir, `${KEY}.json.bak1`), "utf8")).toBe(json(1));
    const aside = files().filter((f) => f.includes(".corrupt-"));
    expect(aside).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir, aside[0]), "utf8")).toBe('{"columns":[{"id":');
  });

  it("guarda só as últimas cópias ilegíveis", () => {
    const store = makeStore({ backupMinIntervalMs: 0 });
    store.write(KEY, json(1));
    for (let i = 0; i < 6; i += 1) {
      clock += 1000;
      fs.writeFileSync(path.join(dir, `${KEY}.json`), `{ruim ${i}`);
      store.write(KEY, json(10 + i));
    }
    expect(files().filter((f) => f.includes(".corrupt-"))).toHaveLength(3);
  });

  it("o backup devolvido pula cópias ilegíveis", () => {
    const store = makeStore({ backupMinIntervalMs: 0 });
    store.write(KEY, json(1));
    store.write(KEY, json(2));
    store.write(KEY, json(3)); // bak1 = 2, bak2 = 1
    fs.writeFileSync(path.join(dir, `${KEY}.json.bak1`), "lixo");
    expect(store.latestBackup(KEY).value).toBe(json(1));
  });

  it("sem nenhum backup legível devolve null", () => {
    const store = makeStore();
    expect(store.latestBackup(KEY)).toEqual({ ok: true, value: null });
    store.write(KEY, json(1));
    expect(store.latestBackup(KEY)).toEqual({ ok: true, value: null });
  });
});
