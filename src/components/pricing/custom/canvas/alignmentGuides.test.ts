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
    expect(snap.guides.equalSpacing).toEqual([]);
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
    expect(snap.guides.equalSpacing).toEqual([]);
  });

  it("snaps horizontally when the moving block has equal spacing between neighbors", () => {
    const snap = computeSnap(
      { x: 255, y: 100, w: 100, h: 80 },
      [
        { id: "left", x: 80, y: 100, w: 120, h: 80 },
        { id: "right", x: 410, y: 100, w: 120, h: 80 },
      ],
    );

    expect(snap.x).toBe(255);
    expect(snap.guides.equalSpacing).toEqual([
      expect.objectContaining({ axis: "x", gap: 55, start: 200, end: 410 }),
    ]);
  });

  it("snaps vertically when the moving block has equal spacing between neighbors", () => {
    const snap = computeSnap(
      { x: 100, y: 256, w: 100, h: 80 },
      [
        { id: "top", x: 100, y: 60, w: 100, h: 140 },
        { id: "bottom", x: 100, y: 390, w: 100, h: 120 },
      ],
    );

    expect(snap.y).toBe(255);
    expect(snap.guides.equalSpacing).toEqual([
      expect.objectContaining({ axis: "y", gap: 55, start: 200, end: 390 }),
    ]);
  });
});
