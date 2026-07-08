import { describe, expect, it } from "vitest";
import {
  serializePersistentCollabSnapshot,
  snapshotToSlidesState,
  validatePersistentCollabSnapshot,
} from "@/lib/persistentCollabSnapshot";
import type { SlideItem } from "@/lib/slidesFlow";

describe("persistentCollabSnapshot", () => {
  it("serializes complete slide structure without raw rendered data or image payloads", () => {
    const items: SlideItem[] = [
      {
        id: "custom-1",
        kind: "custom",
        label: "Executivo",
        config: {
          background: "#FFFFFF",
          showHaraldFooter: true,
          theme: "harald-classic",
          blocks: [
            {
              id: "title-1",
              kind: "title",
              x: 10,
              y: 20,
              w: 400,
              h: 80,
              z: 1,
              text: "Resultado Mensal",
              size: 42,
              bold: true,
              color: "#111111",
              align: "left",
            },
            {
              id: "image-1",
              kind: "image",
              x: 20,
              y: 120,
              w: 300,
              h: 160,
              z: 2,
              src: "data:image/png;base64,secret",
              fit: "contain",
            },
            {
              id: "chart-1",
              kind: "chart",
              x: 360,
              y: 120,
              w: 500,
              h: 260,
              z: 3,
              chartType: "line",
              measure: "cm",
              breakdown: null,
              showGrid: true,
              showLegend: true,
              showLabels: false,
              filters: { canal: ["Direto"] },
              data: [{ value: 123 }],
              series: [{ name: "Real", value: 123 }],
            } as never,
          ],
        },
      },
    ];

    const snapshot = serializePersistentCollabSnapshot({
      items,
      selectedSlideId: "custom-1",
      transition: "fade",
      appVersion: "test",
      version: 1,
    });
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.collabProtocolVersion).toBe(1);
    expect(snapshot.items[0].title).toBe("Resultado Mensal");
    expect(serialized).not.toContain("data:image/png");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("\"value\":123");
    expect(validatePersistentCollabSnapshot(snapshot)).toEqual(snapshot);
    expect(snapshotToSlidesState(snapshot).items).toHaveLength(1);
  });
});
