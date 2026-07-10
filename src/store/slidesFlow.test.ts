import { describe, expect, it } from "vitest";
import type { SlideItem } from "@/lib/slidesFlow";
import type { CustomSlideConfig } from "@/lib/customSlide";
import { sanitizeSlidesFlowItems } from "./slidesFlow";

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
});

