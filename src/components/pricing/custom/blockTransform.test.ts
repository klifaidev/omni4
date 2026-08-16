import { describe, expect, it } from "vitest";

import type { CustomBlock } from "@/lib/customSlide";
import { buildAltDragClones, resolveDraggableSiblings } from "./blockTransform";

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

describe("blockTransform", () => {
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
});
