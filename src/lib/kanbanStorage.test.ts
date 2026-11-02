import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

import { toast } from "sonner";
import {
  getKanbanSaveInfo,
  hydrateKanban,
  KANBAN_STORAGE_KEY,
  parseKanbanState,
  persistKanbanState,
  readKanbanRaw,
  resetKanbanStorageForTest,
  retryKanbanSave,
  subscribeKanbanSaveStatus,
  type ElectronKanbanAPI,
} from "./kanbanStorage";
import { loadState, saveState, type KanbanState } from "./kanban";

const stateWith = (...titles: string[]): KanbanState => ({
  columns: [
    { id: "todo", title: "A fazer", accent: "0 0% 0%", cardIds: titles.map((_, i) => `c${i}`) },
    { id: "done", title: "Concluído", accent: "0 0% 0%", cardIds: [] },
  ],
  cards: Object.fromEntries(titles.map((t, i) => [`c${i}`, { id: `c${i}`, title: t, createdAt: "2026-01-01T00:00:00.000Z" }])),
});
const raw = (...titles: string[]) => JSON.stringify(stateWith(...titles));

interface FakeDisk {
  api: ElectronKanbanAPI;
  main: string | null;
  backup: string | null;
  saved: string[];
  readOk: boolean;
  writeOk: boolean;
  readDelay: Promise<void> | null;
}

function fakeDisk(init: Partial<Pick<FakeDisk, "main" | "backup" | "readOk" | "writeOk" | "readDelay">> = {}): FakeDisk {
  const d: FakeDisk = { main: null, backup: null, saved: [], readOk: true, writeOk: true, readDelay: null, ...init } as FakeDisk;
  d.api = {
    ler: async () => {
      if (d.readDelay) await d.readDelay;
      return d.readOk ? { ok: true, value: d.main } : { ok: false, erro: "EACCES: permissão negada" };
    },
    salvar: async (_k, v) => {
      if (!d.writeOk) return { ok: false, erro: "ENOSPC: disco cheio" };
      d.saved.push(v);
      d.main = v;
      return { ok: true };
    },
    remover: async () => ({ ok: true }),
    ultimoBackup: async () => ({ ok: true, value: d.backup }),
  };
  return d;
}

function useDisk(d: FakeDisk) {
  (window as unknown as { electronAPI?: unknown }).electronAPI = { kanban: d.api };
}

beforeEach(() => {
  resetKanbanStorageForTest();
  localStorage.clear();
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.info).mockClear();
});
afterEach(() => {
  delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("validação do que está salvo", () => {
  it("aceita estado bem formado e recusa o resto", () => {
    expect(parseKanbanState(raw("a"))).not.toBeNull();
    expect(parseKanbanState(JSON.stringify({ columns: [], cards: {} }))).not.toBeNull();
    for (const bad of [null, undefined, "", "{", "[]", "null", '{"columns":[]}', '{"columns":{},"cards":{}}',
      '{"columns":[{"id":"x"}],"cards":{}}', '{"columns":[null],"cards":{}}', '{"columns":[],"cards":[]}']) {
      expect(parseKanbanState(bad as string | null | undefined)).toBeNull();
    }
  });
});

describe("modo disco — abertura", () => {
  it("lê o arquivo e entrega o estado a quem chamar loadState", async () => {
    const d = fakeDisk({ main: raw("Fechar o mês") });
    useDisk(d);
    await hydrateKanban();
    expect(loadState().cards.c0.title).toBe("Fechar o mês");
    expect(getKanbanSaveInfo()).toMatchObject({ mode: "disk", blocked: false, status: "idle" });
    expect(d.saved).toEqual([]); // abrir não grava nada
  });

  it("migra do localStorage antigo uma única vez, sem apagar a origem", async () => {
    localStorage.setItem(KANBAN_STORAGE_KEY, raw("Atividade antiga"));
    const d = fakeDisk({ main: null });
    useDisk(d);
    await hydrateKanban();
    expect(d.saved).toEqual([raw("Atividade antiga")]);
    expect(loadState().cards.c0.title).toBe("Atividade antiga");
    expect(localStorage.getItem(KANBAN_STORAGE_KEY)).toBe(raw("Atividade antiga")); // origem intacta
  });

  it("depois de migrar, o arquivo manda — o localStorage velho não volta a valer", async () => {
    localStorage.setItem(KANBAN_STORAGE_KEY, raw("Velha"));
    const d = fakeDisk({ main: raw("Nova no disco") });
    useDisk(d);
    await hydrateKanban();
    expect(loadState().cards.c0.title).toBe("Nova no disco");
    expect(d.saved).toEqual([]);
  });

  it("primeira vez de tudo: começa do zero sem gravar", async () => {
    const d = fakeDisk();
    useDisk(d);
    await hydrateKanban();
    expect(readKanbanRaw()).toBeNull();
    expect(loadState().columns.length).toBeGreaterThan(0); // estado padrão
    expect(d.saved).toEqual([]);
  });

  it("arquivo ilegível: volta do backup mais recente, regrava e avisa", async () => {
    const d = fakeDisk({ main: '{"columns":[{"id":', backup: raw("Do backup") });
    useDisk(d);
    await hydrateKanban();
    expect(loadState().cards.c0.title).toBe("Do backup");
    expect(d.saved).toEqual([raw("Do backup")]);
    expect(toast.info).toHaveBeenCalledTimes(1);
  });

  it("arquivo ilegível e sem backup: ainda tenta a versão antiga do localStorage", async () => {
    localStorage.setItem(KANBAN_STORAGE_KEY, raw("Legado"));
    const d = fakeDisk({ main: "lixo", backup: null });
    useDisk(d);
    await hydrateKanban();
    expect(loadState().cards.c0.title).toBe("Legado");
  });

  it("backup ilegível não é usado", async () => {
    const d = fakeDisk({ main: null, backup: "lixo" });
    useDisk(d);
    await hydrateKanban();
    expect(readKanbanRaw()).toBeNull();
  });

  it("falha ao ler o disco: mostra o que der, mas NÃO grava nada por cima", async () => {
    const d = fakeDisk({ readOk: false, backup: raw("Backup visível") });
    useDisk(d);
    await hydrateKanban();
    const info = getKanbanSaveInfo();
    expect(info).toMatchObject({ status: "error", blocked: true });
    expect(info.error).toMatch(/permissão negada/);
    expect(loadState().cards.c0.title).toBe("Backup visível");
    expect(persistKanbanState(stateWith("Edição nova"))).toBe(false);
    expect(retryKanbanSave(stateWith("Edição nova"))).toBe(false);
    expect(d.saved).toEqual([]);
  });

  it("disco que não responde: depois de 8 s trata como falha de leitura e bloqueia a gravação", async () => {
    vi.useFakeTimers();
    const d = fakeDisk({ readDelay: new Promise(() => undefined), backup: null });
    useDisk(d);
    const done = hydrateKanban();
    await vi.advanceTimersByTimeAsync(8_001);
    await done;
    expect(getKanbanSaveInfo()).toMatchObject({ status: "error", blocked: true });
    expect(getKanbanSaveInfo().error).toMatch(/tempo esgotado/);
    expect(persistKanbanState(stateWith("x"))).toBe(false);
    expect(d.saved).toEqual([]);
  });
});

describe("modo disco — gravação", () => {
  it("quem lê logo depois de gravar já vê o novo estado (antes de o disco responder)", async () => {
    const d = fakeDisk({ main: raw("antes") });
    useDisk(d);
    await hydrateKanban();
    saveState(stateWith("depois"));
    expect(loadState().cards.c0.title).toBe("depois");
    expect(getKanbanSaveInfo().status).toBe("saving");
    await vi.waitFor(() => expect(getKanbanSaveInfo().status).toBe("saved"));
    expect(d.main).toBe(raw("depois"));
  });

  it("gravar o mesmo conteúdo de novo não vai ao disco", async () => {
    const d = fakeDisk({ main: raw("igual") });
    useDisk(d);
    await hydrateKanban();
    saveState(stateWith("igual")); // o que a tela faz ao abrir
    saveState(stateWith("igual"));
    expect(d.saved).toEqual([]);
    expect(getKanbanSaveInfo().status).toBe("idle");
  });

  it("várias edições seguidas: a última sempre vence e o status fecha em 'salvo'", async () => {
    const d = fakeDisk({ main: raw("a") });
    useDisk(d);
    await hydrateKanban();
    const seen: string[] = [];
    const off = subscribeKanbanSaveStatus((s) => seen.push(s));
    saveState(stateWith("b"));
    saveState(stateWith("c"));
    saveState(stateWith("d"));
    await vi.waitFor(() => expect(getKanbanSaveInfo().status).toBe("saved"));
    off();
    expect(d.main).toBe(raw("d"));
    expect(d.saved[d.saved.length - 1]).toBe(raw("d"));
    expect(seen[0]).toBe("saving");
    expect(seen[seen.length - 1]).toBe("saved");
  });

  it("disco cheio: vira erro visível (com o motivo), avisa uma vez e a sessão continua em memória", async () => {
    const d = fakeDisk({ main: raw("a"), writeOk: false });
    useDisk(d);
    await hydrateKanban();
    saveState(stateWith("b"));
    await vi.waitFor(() => expect(getKanbanSaveInfo().status).toBe("error"));
    expect(getKanbanSaveInfo().error).toMatch(/disco cheio/);
    expect(loadState().cards.c0.title).toBe("b");
    saveState(stateWith("c"));
    await vi.waitFor(() => expect(getKanbanSaveInfo().status).toBe("error"));
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it("'tentar de novo' regrava mesmo sendo o mesmo conteúdo e volta a 'salvo'", async () => {
    const d = fakeDisk({ main: raw("a"), writeOk: false });
    useDisk(d);
    await hydrateKanban();
    saveState(stateWith("b"));
    await vi.waitFor(() => expect(getKanbanSaveInfo().status).toBe("error"));
    d.writeOk = true;
    expect(retryKanbanSave(stateWith("b"))).toBe(true);
    await vi.waitFor(() => expect(getKanbanSaveInfo().status).toBe("saved"));
    expect(d.main).toBe(raw("b"));
    expect(getKanbanSaveInfo().error).toBeNull();
  });

  it("uma exceção do IPC também vira erro (nunca fica 'salvando' para sempre)", async () => {
    const d = fakeDisk({ main: raw("a") });
    d.api.salvar = async () => { throw new Error("canal fechado"); };
    useDisk(d);
    await hydrateKanban();
    saveState(stateWith("b"));
    await vi.waitFor(() => expect(getKanbanSaveInfo().status).toBe("error"));
    expect(getKanbanSaveInfo().error).toMatch(/canal fechado/);
  });

  it("falha numa gravação e sucesso na seguinte: termina em 'salvo' com o último conteúdo", async () => {
    const d = fakeDisk({ main: raw("a") });
    let calls = 0;
    const original = d.api.salvar;
    d.api.salvar = async (k, v) => (++calls === 1 ? { ok: false, erro: "falha passageira" } : original(k, v));
    useDisk(d);
    await hydrateKanban();
    saveState(stateWith("b"));
    saveState(stateWith("c")); // entra na fila enquanto a primeira ainda está em andamento
    await vi.waitFor(() => expect(getKanbanSaveInfo().status).toBe("saved"));
    expect(d.main).toBe(raw("c"));
  });
});

describe("modo navegador (localStorage)", () => {
  it("grava, reporta 'salvo' e lê de volta", () => {
    saveState(stateWith("x"));
    expect(localStorage.getItem(KANBAN_STORAGE_KEY)).toBe(raw("x"));
    expect(getKanbanSaveInfo()).toMatchObject({ status: "saved", mode: "browser" });
    expect(loadState().cards.c0.title).toBe("x");
  });

  it("guarda o conteúdo anterior como backup e o usa se o principal ficar ilegível", () => {
    saveState(stateWith("primeiro"));
    saveState(stateWith("segundo"));
    expect(JSON.parse(localStorage.getItem(`${KANBAN_STORAGE_KEY}.backup`) as string)[0].value).toBe(raw("primeiro"));
    localStorage.setItem(KANBAN_STORAGE_KEY, "{corrompido");
    expect(loadState().cards.c0.title).toBe("primeiro");
    expect(localStorage.getItem(KANBAN_STORAGE_KEY)).toBe(raw("primeiro")); // principal restaurado
  });

  it("não vira três cópias idênticas a cada tecla (intervalo mínimo entre backups)", () => {
    saveState(stateWith("a"));
    saveState(stateWith("b"));
    saveState(stateWith("c"));
    saveState(stateWith("d"));
    const backups = JSON.parse(localStorage.getItem(`${KANBAN_STORAGE_KEY}.backup`) as string);
    expect(backups).toHaveLength(1);
    expect(backups[0].value).toBe(raw("a"));
  });

  it("cota cheia: erro visível com o motivo, aviso uma vez, e 'tentar de novo' funciona depois", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("cota excedida", "QuotaExceededError");
    });
    saveState(stateWith("a"));
    expect(getKanbanSaveInfo()).toMatchObject({ status: "error", mode: "browser" });
    expect(getKanbanSaveInfo().error).toMatch(/cota excedida/);
    saveState(stateWith("b"));
    expect(toast.error).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    expect(retryKanbanSave(stateWith("b"))).toBe(true);
    expect(getKanbanSaveInfo().status).toBe("saved");
    expect(localStorage.getItem(KANBAN_STORAGE_KEY)).toBe(raw("b"));
  });

  it("principal ilegível e nenhum backup: devolve o que há, sem inventar", () => {
    localStorage.setItem(KANBAN_STORAGE_KEY, "{corrompido");
    expect(readKanbanRaw()).toBe("{corrompido");
    expect(loadState().cards).toEqual({}); // estado padrão — e nada foi sobrescrito
    expect(localStorage.getItem(KANBAN_STORAGE_KEY)).toBe("{corrompido");
  });
});
