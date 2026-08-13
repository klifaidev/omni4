import { describe, expect, it } from "vitest";
import type { SlideItem } from "@/lib/slidesFlow";
import type { CustomSlideConfig } from "@/lib/customSlide";
import {
  backupSlidesFlowRawState,
  createSlidesFlowStorage,
  getLatestSlidesFlowBackupRaw,
  migrateSlidesFlowItemsDataSources,
  restoreSlidesFlowRawStateFromBackup,
  sanitizeSlidesFlowItems,
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
});
