import { describe, expect, it } from "vitest";
import { computeSnap } from "./alignmentGuides";

describe("alignmentGuides", () => {
  it("snaps to nearby block edges and keeps guide coordinates stable", () => {
    const snap = computeSnap(
      { x: 103, y: 197, w: 120, h: 80 },
      [{ id: "anchor", x: 100, y: 200, w: 160, h: 90 }],
    );

    expect(snap.x).toBe(100);
    expect(snap.y).toBe(200);
    expect(snap.guides.v).toContain(100);
    expect(snap.guides.h).toContain(200);
  });

  it("does not snap when the moving block is outside tolerance", () => {
    const snap = computeSnap(
      { x: 120, y: 220, w: 120, h: 80 },
      [{ id: "anchor", x: 100, y: 200, w: 160, h: 90 }],
    );

    expect(snap.x).toBe(120);
    expect(snap.y).toBe(220);
    expect(snap.guides.v).not.toContain(100);
    expect(snap.guides.h).not.toContain(200);
  });
});
