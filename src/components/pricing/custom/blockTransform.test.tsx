import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CustomBlock } from "@/lib/customSlide";
import {
  applyBlockMove,
  applyMultiBlockMove,
  BlockRotationHandle,
  buildAltDragClones,
  clampFrameToBounds,
  computeGroupResizePatches,
  gestureLayerStyle,
  resizeFrameFromPointerDelta,
  resolveDraggableSiblings,
  snapBlockFrame,
} from "./blockTransform";

function shape(id: string, patch: Partial<CustomBlock> = {}): CustomBlock {
  return {
    id,
    kind: "shape",
    x: 10,
    y: 20,
    w: 100,
    h: 80,
    z: 1,
    shape: "rect",
    fill: "FFFFFF",
    radius: 0,
    ...patch,
  } as CustomBlock;
}

function title(id: string, patch: Partial<CustomBlock> = {}): CustomBlock {
  return {
    id,
    kind: "title",
    x: 100,
    y: 100,
    w: 300,
    h: 60,
    z: 1,
    text: "Titulo",
    size: 24,
    bold: true,
    color: "C8102E",
    align: "left",
    ...patch,
  } as CustomBlock;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("blockTransform", () => {
  it("moves one isolated block to the final dropped position", () => {
    const block = shape("a", { x: 40, y: 70 });

    expect(applyBlockMove(block, 125, 155)).toEqual({
      id: "a",
      patch: { x: 125, y: 155 },
    });
  });

  it("moves persisted group members together unless the active block is in group edit mode", () => {
    const blocks = [
      shape("a", { groupId: "g1" }),
      shape("b", { groupId: "g1" }),
      shape("c"),
    ];
    const groups = [{ id: "g1", memberIds: ["a", "b"] }];

    expect(resolveDraggableSiblings({
      id: "a",
      blocks,
      groups,
      groupEditMemberId: null,
      selectedIds: ["a"],
    })).toEqual(["a", "b"]);

    expect(resolveDraggableSiblings({
      id: "a",
      blocks,
      groups,
      groupEditMemberId: "a",
      selectedIds: ["a"],
    })).toEqual(["a"]);
  });

  it("moves all selected blocks together when the active block is part of a multi-selection", () => {
    const blocks = [shape("a"), shape("b"), shape("c")];

    expect(resolveDraggableSiblings({
      id: "b",
      blocks,
      groups: [],
      groupEditMemberId: null,
      selectedIds: ["a", "b"],
    })).toEqual(["a", "b"]);
  });

  it("moves multiple selected blocks by the same delta and preserves their relative positions", () => {
    const blocks = [
      shape("a", { x: 10, y: 20 }),
      shape("b", { x: 70, y: 95 }),
      shape("c", { x: 300, y: 300 }),
    ];

    const patches = applyMultiBlockMove(blocks, ["a", "b"], 24, -12);

    expect(patches).toEqual([
      { id: "a", patch: { x: 34, y: 8 } },
      { id: "b", patch: { x: 94, y: 83 } },
    ]);
    expect((patches[1].patch.x as number) - (patches[0].patch.x as number)).toBe(60);
    expect((patches[1].patch.y as number) - (patches[0].patch.y as number)).toBe(75);
  });

  it("preserves width/height ratio when resizing with aspect ratio locked", () => {
    const resized = resizeFrameFromPointerDelta({
      origin: { x: 100, y: 100, w: 200, h: 100 },
      dir: "e",
      clientDx: 80,
      clientDy: 0,
      scale: 1,
      rotation: 0,
      lockAspectRatio: true,
    });

    expect(resized.w).toBe(280);
    expect(resized.h).toBe(140);
    expect(resized.w / resized.h).toBeCloseTo(2);
  });

  it("keeps the opposite edge fixed when resizing from a single-side handle (not aspect-locked)", () => {
    const origin = { x: 100, y: 100, w: 200, h: 100 };

    // Arraste da alça direita ("e"): a borda esquerda (x) não deve se mover.
    const east = resizeFrameFromPointerDelta({
      origin, dir: "e", clientDx: 80, clientDy: 0, scale: 1, rotation: 0, lockAspectRatio: false,
    });
    expect(east.x).toBe(100);
    expect(east.w).toBe(280);
    expect(east.x + east.w).toBe(380); // borda direita seguiu o mouse

    // Arraste da alça esquerda ("w"): a borda direita (x + w) não deve se mover.
    const west = resizeFrameFromPointerDelta({
      origin, dir: "w", clientDx: -50, clientDy: 0, scale: 1, rotation: 0, lockAspectRatio: false,
    });
    expect(west.x + west.w).toBe(300); // borda direita original preservada
    expect(west.w).toBe(250);

    // Arraste da alça inferior ("s"): a borda superior (y) não deve se mover.
    const south = resizeFrameFromPointerDelta({
      origin, dir: "s", clientDx: 0, clientDy: 40, scale: 1, rotation: 0, lockAspectRatio: false,
    });
    expect(south.y).toBe(100);
    expect(south.h).toBe(140);

    // Canto inferior-direito ("se"): o canto superior-esquerdo oposto fica fixo.
    const se = resizeFrameFromPointerDelta({
      origin, dir: "se", clientDx: 30, clientDy: 20, scale: 1, rotation: 0, lockAspectRatio: false,
    });
    expect(se.x).toBe(100);
    expect(se.y).toBe(100);
  });

  it("resizes grouped blocks proportionally, including text font size", () => {
    const blocks = [
      shape("bg", { x: 60, y: 150, w: 520, h: 235 }),
      title("headline", { x: 88, y: 172, w: 460, h: 38, size: 24 }),
    ];

    const patches = computeGroupResizePatches(
      blocks,
      ["bg", "headline"],
      { x: 60, y: 150, w: 520, h: 235 },
      { x: 60, y: 150, w: 1040, h: 470 },
    );

    expect(patches).toEqual([
      { id: "bg", patch: { x: 60, y: 150, w: 1040, h: 470 } },
      { id: "headline", patch: { x: 116, y: 194, w: 920, h: 76, size: 48 } },
    ]);
  });

  it("snaps a dragged block exactly to a nearby sibling edge", () => {
    const blocks = [
      shape("moving", { x: 0, y: 0, w: 100, h: 80 }),
      shape("anchor", { x: 300, y: 180, w: 120, h: 90 }),
    ];

    const snap = snapBlockFrame(blocks, ["moving"], { x: 296, y: 180, w: 100, h: 80 });

    expect(snap.x).toBe(300);
    expect(snap.y).toBe(180);
    expect(snap.guides.v).toContain(300);
    expect(snap.guides.h).toContain(180);
  });

  it("allows a block to enter the bleed area but clamps it at the bleed limit", () => {
    const frame = clampFrameToBounds(
      { x: -60, y: -55, w: 100, h: 80 },
      0,
      { w: 500, h: 300, bleed: 24 },
    );

    expect(frame.x).toBe(-24);
    expect(frame.y).toBe(-24);
  });

  it("raises a block during a gesture and restores its original layer afterwards", () => {
    expect(gestureLayerStyle(7, true)).toEqual({ during: 9999998, after: 7 });
    expect(gestureLayerStyle(7, false)).toEqual({ during: 7, after: 7 });
  });

  it("builds Alt-drag clones with offsets, fresh ids, fresh group ids, and without locked blocks", () => {
    const ids = ["clone-group", "clone-a", "clone-b"];
    const createId = () => ids.shift() ?? "extra";
    const blocks = [
      shape("a", { x: 10, y: 20, z: 2, groupId: "g1" }),
      shape("b", { x: 40, y: 50, z: 3, groupId: "g1" }),
      shape("locked", { locked: true, groupId: "g1" }),
    ];

    const clones = buildAltDragClones({
      sourceIds: ["a", "b", "locked"],
      blocks,
      dx: 12,
      dy: -4,
      zTop: 10,
      createId,
    });

    expect(clones.map((block) => block.id)).toEqual(["clone-a", "clone-b"]);
    expect(clones.map((block) => block.groupId)).toEqual(["clone-group", "clone-group"]);
    expect(clones.map((block) => ({ x: block.x, y: block.y, z: block.z }))).toEqual([
      { x: 22, y: 16, z: 11 },
      { x: 52, y: 46, z: 12 },
    ]);
    expect(clones.some((block) => block.id === "locked")).toBe(false);
  });

  it("commits one rotation update for an entire gesture instead of one update per animation frame", () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    const onRotate = vi.fn();
    const block = title("rotating", { rotation: 0 });

    const { container } = render(
      <div data-custom-slide-canvas="true">
        <div>
          <div data-block-visual-id="rotating" />
          <BlockRotationHandle block={block} onRotate={onRotate} />
        </div>
      </div>,
    );
    const frame = container.querySelector("[data-block-visual-id='rotating']")?.parentElement as HTMLElement;
    frame.getBoundingClientRect = () => ({
      x: 100,
      y: 100,
      left: 100,
      top: 100,
      right: 300,
      bottom: 200,
      width: 200,
      height: 100,
      toJSON: () => ({}),
    });
    const handle = container.querySelector("[data-export-hide='true']") as HTMLElement;

    fireEvent.mouseDown(handle, { clientX: 200, clientY: 50, button: 0 });
    fireEvent.mouseMove(window, { clientX: 250, clientY: 100 });
    fireEvent.mouseMove(window, { clientX: 280, clientY: 130 });
    fireEvent.mouseUp(window);

    expect(onRotate).toHaveBeenCalledTimes(1);
    expect(onRotate).toHaveBeenCalledWith("rotating", expect.any(Number));
  });
});
