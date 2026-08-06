import { describe, expect, it, vi } from "vitest";
import type { CustomBlock, CustomSlideConfig } from "@/lib/customSlide";
import {
  bindEditorStore,
  commitExternalEditorChange,
  insertBlocksAction,
  redo,
  resizeGroupAction,
  syncFromParent,
  undo,
} from "./editorStore";

function config(text = "Titulo", x = 40): CustomSlideConfig {
  return {
    background: "FFFFFF",
    showHaraldFooter: true,
    blocks: [
      {
        id: "title-1",
        kind: "title",
        x,
        y: 40,
        w: 640,
        h: 80,
        z: 1,
        text,
        size: 42,
        bold: true,
        color: "C8102E",
        align: "left",
      },
    ],
  };
}

describe("editorStore undo/redo", () => {
  it("records local Yjs-backed editor changes as undoable external changes", () => {
    const onChange = vi.fn();
    const initial = config();
    const moved = config("Titulo", 120);

    bindEditorStore(initial, onChange, "slide-yjs-undo");
    commitExternalEditorChange("Mover bloco", moved);

    expect(undo()).toEqual(initial);
    expect(onChange).toHaveBeenLastCalledWith(initial);
    expect(redo()).toEqual(moved);
    expect(onChange).toHaveBeenLastCalledWith(moved);
  });

  it("does not add parent sync updates to the undo stack", () => {
    const initial = config();
    const remote = config("Remoto", 40);

    bindEditorStore(initial, vi.fn(), "slide-parent-sync");
    syncFromParent(remote);

    expect(undo()).toBeNull();
  });

  it("registers groups when inserting pre-grouped composite blocks", () => {
    const onChange = vi.fn();
    bindEditorStore(config(), onChange, "slide-story-group");

    const blocks: CustomBlock[] = [
      {
        id: "story-bg",
        kind: "shape",
        x: 60,
        y: 150,
        w: 520,
        h: 235,
        z: 1,
        shape: "roundRect",
        fill: "FFF7F8",
        groupId: "story-group",
      },
      {
        id: "story-title",
        kind: "title",
        x: 88,
        y: 172,
        w: 460,
        h: 38,
        z: 2,
        text: "Insight executivo",
        size: 24,
        bold: true,
        color: "C8102E",
        align: "left",
        groupId: "story-group",
      },
    ] as CustomBlock[];

    const ids = insertBlocksAction(blocks, "Adicionar bloco");
    const next = onChange.mock.calls.at(-1)?.[0] as CustomSlideConfig;

    expect(ids).toEqual(["story-bg", "story-title"]);
    expect(next.groups).toEqual([{ id: "story-group", memberIds: ["story-bg", "story-title"] }]);
    expect(next.blocks.find((block) => block.id === "story-bg")?.groupId).toBe("story-group");
    expect(next.blocks.find((block) => block.id === "story-title")?.groupId).toBe("story-group");
  });

  it("resizes grouped storytelling blocks proportionally as one element", () => {
    const onChange = vi.fn();
    bindEditorStore({
      background: "FFFFFF",
      showHaraldFooter: true,
      groups: [{ id: "story-group", memberIds: ["story-bg", "story-title"] }],
      blocks: [
        {
          id: "story-bg",
          kind: "shape",
          x: 60,
          y: 150,
          w: 520,
          h: 235,
          z: 1,
          shape: "roundRect",
          fill: "FFF7F8",
          groupId: "story-group",
        },
        {
          id: "story-title",
          kind: "title",
          x: 88,
          y: 172,
          w: 460,
          h: 38,
          z: 2,
          text: "Insight executivo",
          size: 24,
          bold: true,
          color: "C8102E",
          align: "left",
          groupId: "story-group",
        },
      ] as CustomBlock[],
    }, onChange, "slide-story-resize");

    resizeGroupAction(
      ["story-bg", "story-title"],
      { x: 60, y: 150, w: 520, h: 235 },
      { x: 60, y: 150, w: 1040, h: 470 },
    );
    const next = onChange.mock.calls.at(-1)?.[0] as CustomSlideConfig;
    const bg = next.blocks.find((block) => block.id === "story-bg");
    const title = next.blocks.find((block) => block.id === "story-title");

    expect(bg).toMatchObject({ x: 60, y: 150, w: 1040, h: 470 });
    expect(title).toMatchObject({ x: 116, y: 194, w: 920, h: 76 });
  });

  it("scales title and text font sizes when resizing a group", () => {
    const onChange = vi.fn();
    bindEditorStore({
      background: "FFFFFF",
      showHaraldFooter: true,
      groups: [{ id: "story-group", memberIds: ["story-title", "story-text"] }],
      blocks: [
        {
          id: "story-title",
          kind: "title",
          x: 100,
          y: 100,
          w: 300,
          h: 50,
          z: 1,
          text: "Insight",
          size: 24,
          bold: true,
          color: "C8102E",
          align: "left",
          groupId: "story-group",
        },
        {
          id: "story-text",
          kind: "text",
          x: 100,
          y: 160,
          w: 300,
          h: 90,
          z: 2,
          text: "Texto executivo",
          size: 16,
          color: "1C2430",
          align: "left",
          groupId: "story-group",
        },
      ] as CustomBlock[],
    }, onChange, "slide-story-font-resize");

    resizeGroupAction(
      ["story-title", "story-text"],
      { x: 100, y: 100, w: 300, h: 150 },
      { x: 100, y: 100, w: 600, h: 300 },
    );

    const next = onChange.mock.calls.at(-1)?.[0] as CustomSlideConfig;
    const title = next.blocks.find((block) => block.id === "story-title");
    const text = next.blocks.find((block) => block.id === "story-text");

    expect(title).toMatchObject({ size: 48 });
    expect(text).toMatchObject({ size: 32 });
  });
});
