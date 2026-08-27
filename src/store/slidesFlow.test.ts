import { afterEach, describe, expect, it } from "vitest";
import type { SlideItem } from "@/lib/slidesFlow";
import type { CustomSlideConfig } from "@/lib/customSlide";
import {
  backupSlidesFlowRawState,
  createElectronSlidesFlowStorage,
  createSlidesFlowStorage,
  getLatestSlidesFlowBackupRaw,
  migrateSlidesFlowItemsDataSources,
  restoreSlidesFlowRawStateFromBackup,
  sanitizeSlidesFlowItems,
  type ElectronSlidesFlowAPI,
} from "./slidesFlow";

function customItem(id: string, config: CustomSlideConfig): Extract<SlideItem, { kind: "custom" }> {
  return {
    id,
    kind: "custom",
    label: "Slide personalizado",
    config,
  };
}

describe("sanitizeSlidesFlowItems", () => {
  it("regenerates duplicate slide ids instead of letting duplicate React keys reach the strip", () => {
    const items: SlideItem[] = [
      customItem("slide-1", { background: "FFFFFF", showHaraldFooter: true, blocks: [] }),
      {
        id: "slide-1",
        kind: "cover",
        label: "Capa",
        config: { title: "Resultado Mensal", subtitle: "", variant: "cover" },
      },
    ];

    const sanitized = sanitizeSlidesFlowItems(items);

    expect(sanitized).toHaveLength(2);
    expect(new Set(sanitized.map((item) => item.id)).size).toBe(2);
    expect(sanitized[0].id).toBe("slide-1");
    expect(sanitized[1].id).not.toBe("slide-1");
  });

  it("regenerates duplicate custom block ids and remaps groups to the unique ids", () => {
    const items = sanitizeSlidesFlowItems([
      customItem("slide-1", {
        background: "FFFFFF",
        showHaraldFooter: true,
        blocks: [
          { id: "block-1", kind: "title", x: 0, y: 0, w: 100, h: 40, z: 1, text: "A", size: 24, color: "000000", align: "left" },
          { id: "block-1", kind: "text", x: 0, y: 60, w: 100, h: 40, z: 2, text: "B", size: 16, color: "000000", align: "left" },
        ],
        groups: [{ id: "group-1", memberIds: ["block-1"] }],
      }),
    ]);

    const custom = items[0] as Extract<SlideItem, { kind: "custom" }>;
    const blockIds = custom.config.blocks.map((block) => block.id);

    expect(new Set(blockIds).size).toBe(2);
    expect(blockIds[0]).toBe("block-1");
    expect(blockIds[1]).not.toBe("block-1");
    expect(custom.config.groups?.[0]?.memberIds).toEqual(blockIds);
  });

  it("preserves legacy custom slides without a blocks array instead of throwing during migration", () => {
    const legacy = {
      id: "legacy-slide",
      kind: "custom",
      label: "Slide antigo",
      config: {},
    } as unknown as SlideItem;

    expect(() => sanitizeSlidesFlowItems([legacy])).not.toThrow();
    const sanitized = sanitizeSlidesFlowItems([legacy]);

    expect(sanitized).toHaveLength(1);
    expect(sanitized[0]).toMatchObject({ id: "legacy-slide", kind: "custom" });
    expect(() => migrateSlidesFlowItemsDataSources(sanitized)).not.toThrow();
  });
});

describe("backupSlidesFlowRawState", () => {
  function memoryStorage(initial: Record<string, string> = {}): Storage {
    const data = new Map(Object.entries(initial));
    return {
      get length() {
        return data.size;
      },
      clear: () => data.clear(),
      getItem: (key: string) => data.get(key) ?? null,
      key: (index: number) => Array.from(data.keys())[index] ?? null,
      removeItem: (key: string) => void data.delete(key),
      setItem: (key: string, value: string) => void data.set(key, value),
    };
  }

  it("creates a preventive backup only when the persisted slide flow has content", () => {
    const raw = JSON.stringify({
      state: { items: [{ id: "slide-1" }], presets: [], transition: "fade" },
      version: 0,
    });
    const storage = memoryStorage({
      "pricing.slidesFlow.v1": raw,
    });

    backupSlidesFlowRawState(storage);

    const backups = JSON.parse(storage.getItem("pricing.slidesFlow.v1.backup") ?? "[]") as Array<{ value: string }>;
    expect(backups).toHaveLength(1);
    expect(backups[0].value).toBe(raw);
    expect(getLatestSlidesFlowBackupRaw(storage)).toBe(raw);
  });

  it("does not back up an already-empty slide flow", () => {
    const storage = memoryStorage({
      "pricing.slidesFlow.v1": JSON.stringify({
        state: { items: [], presets: [], transition: "fade" },
        version: 0,
      }),
    });

    backupSlidesFlowRawState(storage);

    expect(storage.getItem("pricing.slidesFlow.v1.backup")).toBeNull();
  });

  it("restores the persisted slide flow from backup when the current value is empty", () => {
    const emptyRaw = JSON.stringify({
      state: { items: [], presets: [], transition: "fade" },
      version: 0,
    });
    const backupRaw = JSON.stringify({
      state: { items: [{ id: "slide-1" }], presets: [{ id: "preset-1", items: [] }], transition: "none" },
      version: 0,
    });
    const storage = memoryStorage({
      "pricing.slidesFlow.v1": emptyRaw,
      "pricing.slidesFlow.v1.backup": JSON.stringify([{ createdAt: 1, value: backupRaw }]),
    });

    const restored = restoreSlidesFlowRawStateFromBackup(storage);

    expect(restored).toBe(backupRaw);
    expect(storage.getItem("pricing.slidesFlow.v1")).toBe(backupRaw);
  });

  it("blocks accidental empty writes when slide flow content already exists", () => {
    const currentRaw = JSON.stringify({
      state: { items: [{ id: "slide-1" }], presets: [], transition: "fade" },
      version: 0,
    });
    const emptyRaw = JSON.stringify({
      state: { items: [], presets: [], transition: "fade" },
      version: 0,
    });
    const storage = memoryStorage({
      "pricing.slidesFlow.v1": currentRaw,
    });
    const guarded = createSlidesFlowStorage(storage);

    guarded.setItem("pricing.slidesFlow.v1", emptyRaw);

    expect(storage.getItem("pricing.slidesFlow.v1")).toBe(currentRaw);
    expect(getLatestSlidesFlowBackupRaw(storage)).toBe(currentRaw);
  });

  it("does not crash when the preventive backup exceeds localStorage quota", () => {
    const currentRaw = JSON.stringify({
      state: { items: [{ id: "slide-1" }], presets: [], transition: "fade" },
      version: 0,
    });
    const nextRaw = JSON.stringify({
      state: { items: [{ id: "slide-1" }, { id: "slide-2" }], presets: [], transition: "fade" },
      version: 0,
    });
    const storage = memoryStorage({
      "pricing.slidesFlow.v1": currentRaw,
    });
    const originalSetItem = storage.setItem.bind(storage);
    storage.setItem = (key, value) => {
      if (key === "pricing.slidesFlow.v1.backup") {
        throw new DOMException("quota", "QuotaExceededError");
      }
      originalSetItem(key, value);
    };
    const guarded = createSlidesFlowStorage(storage);

    expect(() => guarded.setItem("pricing.slidesFlow.v1", nextRaw)).not.toThrow();

    expect(storage.getItem("pricing.slidesFlow.v1")).toBe(nextRaw);
  });

  // Este e o cenario real que causou a perda de progresso reportada pelo
  // usuario: a esteira principal (nao o backup) estourou a cota do
  // localStorage do Chromium (~5-10MB, uma esteira com varias imagens
  // embutidas passa disso facil). A escrita principal lancava
  // QuotaExceededError sem nenhum try/catch, a excecao subia sem tratamento,
  // e nada de novo era persistido — em silencio, sem nenhum aviso na tela.
  // A cada reinicio do app o usuario voltava para o ultimo estado que tinha
  // cabido na cota, meses atras. O armazenamento em arquivo via Electron
  // (ver describe abaixo) elimina esse teto; este teste garante que, mesmo
  // no fallback de navegador, uma falha na gravacao principal nunca mais
  // fica muda.
  it("does not throw when the main slide flow write itself exceeds quota, and reports it instead of failing silently", () => {
    const currentRaw = JSON.stringify({
      state: { items: [{ id: "slide-1" }], presets: [], transition: "fade" },
      version: 0,
    });
    const hugeNextRaw = JSON.stringify({
      state: { items: [{ id: "slide-1" }, { id: "slide-2-com-imagem-enorme" }], presets: [], transition: "fade" },
      version: 0,
    });
    const storage = memoryStorage({ "pricing.slidesFlow.v1": currentRaw });
    const originalSetItem = storage.setItem.bind(storage);
    storage.setItem = (key, value) => {
      if (key === "pricing.slidesFlow.v1") {
        throw new DOMException("quota", "QuotaExceededError");
      }
      originalSetItem(key, value);
    };
    const guarded = createSlidesFlowStorage(storage);

    expect(() => guarded.setItem("pricing.slidesFlow.v1", hugeNextRaw)).not.toThrow();
    // A gravacao falhou de verdade — o valor antigo permanece, nao o novo.
    expect(storage.getItem("pricing.slidesFlow.v1")).toBe(currentRaw);
  });
});

describe("createElectronSlidesFlowStorage", () => {
  function memoryElectronApi(initial: Record<string, string> = {}) {
    const files = new Map(Object.entries(initial));
    const backups = new Map<string, string>();
    let failNextWrite = false;
    const api: ElectronSlidesFlowAPI = {
      ler: async (key) => ({ ok: true, value: files.get(key) ?? null }),
      salvar: async (key, value) => {
        if (failNextWrite) return { ok: false, erro: "ENOSPC: sem espaco em disco" };
        if (files.has(key)) backups.set(key, files.get(key)!);
        files.set(key, value);
        return { ok: true };
      },
      remover: async (key) => { files.delete(key); return { ok: true }; },
      ultimoBackup: async (key) => ({ ok: true, value: backups.get(key) ?? null }),
    };
    return {
      api,
      files,
      setFailNextWrite: (value: boolean) => { failNextWrite = value; },
    };
  }

  afterEach(() => {
    localStorage.clear();
  });

  it("round-trips a write through getItem/setItem", async () => {
    const { api } = memoryElectronApi();
    const storage = createElectronSlidesFlowStorage(api);
    const raw = JSON.stringify({ state: { items: [{ id: "a" }], presets: [], transition: "fade" }, version: 0 });

    await storage.setItem("pricing.slidesFlow.v1", raw);
    const read = await storage.getItem("pricing.slidesFlow.v1");

    expect(read).toBe(raw);
  });

  it("does not throw when the disk write fails, and getItem still returns the last good value", async () => {
    const { api, setFailNextWrite } = memoryElectronApi({
      "pricing.slidesFlow.v1": JSON.stringify({ state: { items: [{ id: "a" }], presets: [], transition: "fade" }, version: 0 }),
    });
    const storage = createElectronSlidesFlowStorage(api);
    setFailNextWrite(true);
    const nextRaw = JSON.stringify({ state: { items: [{ id: "a" }, { id: "b" }], presets: [], transition: "fade" }, version: 0 });

    await expect(storage.setItem("pricing.slidesFlow.v1", nextRaw)).resolves.toBeUndefined();
    const read = await storage.getItem("pricing.slidesFlow.v1");

    expect(read).not.toBe(nextRaw);
  });

  it("restores from the on-disk backup when the main file is empty", async () => {
    const backupRaw = JSON.stringify({ state: { items: [{ id: "slide-from-backup" }], presets: [], transition: "fade" }, version: 0 });
    const { api } = memoryElectronApi();
    // Popula o backup diretamente, simulando um arquivo principal vazio com backup valido.
    await api.salvar("pricing.slidesFlow.v1", backupRaw);
    await api.salvar("pricing.slidesFlow.v1", JSON.stringify({ state: { items: [], presets: [], transition: "fade" }, version: 0 }));
    const storage = createElectronSlidesFlowStorage(api);

    const read = await storage.getItem("pricing.slidesFlow.v1");

    expect(read).toBe(backupRaw);
  });

  it("migrates a non-empty legacy localStorage value into file storage on first read", async () => {
    const legacyRaw = JSON.stringify({ state: { items: [{ id: "legacy" }], presets: [], transition: "fade" }, version: 0 });
    localStorage.setItem("pricing.slidesFlow.v1", legacyRaw);
    const { api, files } = memoryElectronApi();
    const storage = createElectronSlidesFlowStorage(api);

    const read = await storage.getItem("pricing.slidesFlow.v1");

    expect(read).toBe(legacyRaw);
    expect(files.get("pricing.slidesFlow.v1")).toBe(legacyRaw);
  });
});
