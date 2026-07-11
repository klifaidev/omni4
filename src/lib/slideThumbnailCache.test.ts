import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSlideThumbnailKey,
  clearSlideThumbnailCacheForTest,
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
});
