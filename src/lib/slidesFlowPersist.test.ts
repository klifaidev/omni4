import { describe, expect, it, vi } from "vitest";
import type { StateStorage } from "zustand/middleware";
import {
  ASSET_MIN_LENGTH,
  createDeferredPackedStorage,
  deserializePersisted,
  flushPendingPersist,
  packAssets,
  serializePersisted,
  unpackAssets,
} from "./slidesFlowPersist";
import {
  getRegisteredRowKeysForTest,
  registerRowsForTest,
  resetSlideWorkerForTest,
  slideWorkerRowsHeld,
  WORKER_ROWS_BUDGET,
} from "./slideCalcWorkerClient";
import { memoryLevel } from "./memoryGuard";

const bigImage = (seed: string) => `data:image/png;base64,${seed.repeat(Math.ceil(ASSET_MIN_LENGTH / seed.length) + 10)}`;

describe("gravação compacta da esteira", () => {
  const img = bigImage("AAAB");
  const slide = (id: string) => ({ id, kind: "custom", config: { blocks: [{ id: "i", kind: "image", src: img }, { id: "t", kind: "title", text: "Olá" }] } });
  const state = {
    items: [slide("a")],
    presets: [{ id: "p1", items: [slide("a")] }, { id: "p2", items: [slide("a")] }],
  };

  it("a mesma imagem em vários lugares é gravada uma vez só", () => {
    const raw = serializePersisted({ state, version: 0 });
    const occurrences = raw.split(img).length - 1;
    expect(occurrences).toBe(1);
    expect(raw.length).toBeLessThan(img.length * 1.2);
  });

  it("ida e volta devolve exatamente o estado original", () => {
    const back = deserializePersisted<typeof state>(serializePersisted({ state, version: 3 }));
    expect(back).toEqual({ state, version: 3 });
  });

  it("lê o formato antigo (sem assets)", () => {
    const legacy = JSON.stringify({ state, version: 0 });
    expect(deserializePersisted<typeof state>(legacy).state).toEqual(state);
  });

  it("textos comuns e imagens pequenas ficam onde estão", () => {
    const small = { a: "data:image/png;base64,AAAA", b: "x".repeat(ASSET_MIN_LENGTH + 5) };
    const { packed, assets } = packAssets(small);
    expect(packed).toEqual(small);
    expect(assets).toEqual({});
  });

  it("referência sem imagem (arquivo cortado) vira vazio, sem quebrar", () => {
    expect(unpackAssets({ src: "omni-asset:zz-1" }, {})).toEqual({ src: "" });
  });

  it("junta alterações seguidas numa gravação e grava ao forçar", async () => {
    vi.useFakeTimers();
    const writes: string[] = [];
    const raw: StateStorage = { getItem: () => null, setItem: (_n, v) => { writes.push(v); }, removeItem: () => {} };
    const storage = createDeferredPackedStorage<{ n: number }>(() => raw, 500);
    storage.setItem("k", { state: { n: 1 }, version: 0 });
    storage.setItem("k", { state: { n: 2 }, version: 0 });
    storage.setItem("k", { state: { n: 3 }, version: 0 });
    expect(writes).toHaveLength(0);
    vi.advanceTimersByTime(600);
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0]).state.n).toBe(3);
    storage.setItem("k", { state: { n: 4 }, version: 0 });
    flushPendingPersist();
    expect(writes).toHaveLength(2);
    vi.useRealTimers();
  });
});

describe("teto de memória do worker dos Slides", () => {
  it("libera os conjuntos menos usados quando passa do teto", () => {
    resetSlideWorkerForTest();
    expect(registerRowsForTest("base", 1_200_000)).toBe(true);
    expect(registerRowsForTest("budget", 300_000)).toBe(true);
    expect(registerRowsForTest("base", 1_200_000)).toBe(false); // já está lá: não reenvia
    expect(registerRowsForTest("ajuste", 100_000)).toBe(true); // cabe: nada sai
    expect(getRegisteredRowKeysForTest()).toEqual(["budget", "base", "ajuste"]);
    expect(registerRowsForTest("julho", 1_200_000)).toBe(true); // passa do teto
    // Saem os menos usados até caber: budget e a base antiga; o recorte recente fica.
    expect(getRegisteredRowKeysForTest()).toEqual(["ajuste", "julho"]);
    expect(slideWorkerRowsHeld()).toBeLessThanOrEqual(WORKER_ROWS_BUDGET);
  });

  it("nunca guarda mais que o teto, nem com dezenas de recortes", () => {
    resetSlideWorkerForTest();
    for (let i = 0; i < 40; i++) registerRowsForTest(`recorte-${i}`, 400_000);
    expect(slideWorkerRowsHeld()).toBeLessThanOrEqual(WORKER_ROWS_BUDGET);
  });
});

describe("guarda de memória", () => {
  it("classifica o uso da memória", () => {
    expect(memoryLevel(1000, 4000)).toBe("ok");
    expect(memoryLevel(3000, 4000)).toBe("high");
    expect(memoryLevel(3600, 4000)).toBe("critical");
    expect(memoryLevel(10, 0)).toBe("ok");
  });
});
