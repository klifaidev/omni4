import { afterEach, describe, expect, it } from "vitest";
import {
  clearSlideCalcCache,
  getOrComputeSlideCalc,
  getSlideCalcCacheSize,
  resetSlideCalcCacheMaxEntriesForTest,
  setSlideCalcCacheMaxEntriesForTest,
  slideDataSignature,
} from "./slideCalcCache";

describe("slideCalcCache", () => {
  afterEach(() => {
    clearSlideCalcCache();
    resetSlideCalcCacheMaxEntriesForTest();
  });

  it("does not recompute the same slide/block/filter twice", () => {
    let calls = 0;
    const input = {
      op: "test",
      slideId: "slide-1",
      blockId: "block-1",
      dataSource: "ke30",
      dataSignature: "rows-v1",
      params: { filters: { canal: ["Direto"] } },
    };

    const first = getOrComputeSlideCalc(input, () => {
      calls += 1;
      return { value: 42 };
    });
    const second = getOrComputeSlideCalc(input, () => {
      calls += 1;
      return { value: 99 };
    });

    expect(first).toBe(second);
    expect(first.value).toBe(42);
    expect(calls).toBe(1);
  });

  it("recomputes when filters or data signature change", () => {
    let calls = 0;
    const base = {
      op: "test",
      slideId: "slide-1",
      blockId: "block-1",
      dataSource: "ke30",
      dataSignature: "rows-v1",
    };

    const first = getOrComputeSlideCalc({ ...base, params: { filters: { canal: ["Direto"] } } }, () => {
      calls += 1;
      return "direto";
    });
    const second = getOrComputeSlideCalc({ ...base, params: { filters: { canal: ["Indireto"] } } }, () => {
      calls += 1;
      return "indireto";
    });
    const third = getOrComputeSlideCalc({ ...base, dataSignature: "rows-v2", params: { filters: { canal: ["Direto"] } } }, () => {
      calls += 1;
      return "direto-v2";
    });

    expect([first, second, third]).toEqual(["direto", "indireto", "direto-v2"]);
    expect(calls).toBe(3);
  });

  it("caps cache growth with LRU eviction", () => {
    setSlideCalcCacheMaxEntriesForTest(3);

    for (let i = 0; i < 10; i += 1) {
      getOrComputeSlideCalc({ op: "test", slideId: `slide-${i}`, blockId: "block", dataSignature: "v1" }, () => i);
    }

    expect(getSlideCalcCacheSize()).toBe(3);
  });

  it("changes data signature when loaded rows change", () => {
    const rowsA = [{ periodo: "001.2026", sku: "A", rol: 10 }];
    const rowsB = [{ periodo: "001.2026", sku: "A", rol: 20 }];

    expect(slideDataSignature(rowsA)).not.toBe(slideDataSignature(rowsB));
  });
});

