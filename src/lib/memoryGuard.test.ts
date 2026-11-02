import { describe, expect, it, vi } from "vitest";

vi.mock("./slideCalcWorkerClient", () => ({ releaseAllSlideWorkerRows: vi.fn(), slideWorkerRowsHeld: () => 0 }));
vi.mock("./slideCalcCache", () => ({ clearSlideCalcCache: vi.fn() }));
vi.mock("./customTablePivot", () => ({ clearCustomTableCaches: vi.fn() }));
vi.mock("./pivotWorkerClient", () => ({ disposePivotWorker: vi.fn() }));

import { useKeptPages } from "@/store/keptPages";
import { memoryLevel, releaseRecomputableMemory, shouldActOnLevel } from "./memoryGuard";

describe("guarda de memória", () => {
  it("classifica a leitura pelos limites", () => {
    expect(memoryLevel(1000, 4000)).toBe("ok");
    expect(memoryLevel(2900, 4000)).toBe("high");
    expect(memoryLevel(3500, 4000)).toBe("critical");
  });

  it("leitura alta isolada (lixo ainda não coletado) não dispara nada", () => {
    expect(shouldActOnLevel("high", 1)).toBe(false);
    expect(shouldActOnLevel("high", 2)).toBe(true);
    expect(shouldActOnLevel("ok", 5)).toBe(false);
  });

  it("nível crítico age na primeira leitura", () => {
    expect(shouldActOnLevel("critical", 1)).toBe(true);
  });

  it("abas ocultas só são liberadas no nível crítico", () => {
    useKeptPages.setState({ mounted: ["/a", "/b"] });
    releaseRecomputableMemory("high");
    expect(useKeptPages.getState().mounted).toEqual(["/a", "/b"]);
    releaseRecomputableMemory("critical");
    expect(useKeptPages.getState().mounted).toEqual([]);
  });
});
