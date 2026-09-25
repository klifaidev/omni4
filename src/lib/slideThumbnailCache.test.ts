import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSlideThumbnailKey,
  clearSlideThumbnailCacheForTest,
  getLastGoodSlideThumbnail,
  getSlideThumbnail,
  markSlideThumbnailRendering,
  setSlideThumbnail,
  subscribeSlideThumbnail,
} from "./slideThumbnailCache";

describe("slideThumbnailCache", () => {
  afterEach(() => {
    clearSlideThumbnailCacheForTest();
  });

  it("builds a stable key for equal slide content", () => {
    const a = buildSlideThumbnailKey({ slideId: "s1", config: { b: 2, a: 1 } });
    const b = buildSlideThumbnailKey({ config: { a: 1, b: 2 }, slideId: "s1" });

    expect(a).toBe(b);
  });

  it("stores generated thumbnails in memory", () => {
    const key = buildSlideThumbnailKey({ slideId: "s1" });

    markSlideThumbnailRendering(key);
    expect(getSlideThumbnail(key)?.status).toBe("rendering");

    setSlideThumbnail(key, "data:image/png;base64,test");

    expect(getSlideThumbnail(key)).toMatchObject({
      status: "ready",
      dataUrl: "data:image/png;base64,test",
    });
  });

  it("notifies subscribers when a thumbnail changes", () => {
    const key = buildSlideThumbnailKey({ slideId: "s1" });
    const listener = vi.fn();
    const unsubscribe = subscribeSlideThumbnail(key, listener);

    setSlideThumbnail(key, "data:image/png;base64,test");
    unsubscribe();
    setSlideThumbnail(key, "data:image/png;base64,next");

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("mantém a última miniatura pronta por item.id mesmo com uma chave nova (edição), evitando o flash de placeholder ao sair da edição", () => {
    const keyBefore = buildSlideThumbnailKey({ slideId: "s1", version: 1 });
    setSlideThumbnail(keyBefore, "data:image/png;base64,antes", "s1");
    expect(getLastGoodSlideThumbnail("s1")).toBe("data:image/png;base64,antes");

    // Edição do slide muda o conteúdo -> chave nova, ainda sem entrada em `entries`.
    const keyAfter = buildSlideThumbnailKey({ slideId: "s1", version: 2 });
    expect(getSlideThumbnail(keyAfter)).toBeUndefined();
    // Mas o fallback por item.id continua valendo a versão anterior.
    expect(getLastGoodSlideThumbnail("s1")).toBe("data:image/png;base64,antes");

    setSlideThumbnail(keyAfter, "data:image/png;base64,depois", "s1");
    expect(getLastGoodSlideThumbnail("s1")).toBe("data:image/png;base64,depois");
  });

  it("não confunde o fallback por item.id entre slides diferentes", () => {
    setSlideThumbnail(buildSlideThumbnailKey({ slideId: "s1" }), "data:image/png;base64,s1", "s1");
    setSlideThumbnail(buildSlideThumbnailKey({ slideId: "s2" }), "data:image/png;base64,s2", "s2");

    expect(getLastGoodSlideThumbnail("s1")).toBe("data:image/png;base64,s1");
    expect(getLastGoodSlideThumbnail("s2")).toBe("data:image/png;base64,s2");
    expect(getLastGoodSlideThumbnail("s3")).toBeUndefined();
  });
});
