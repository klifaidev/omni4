import { describe, expect, it, vi } from "vitest";
import type { CustomSlideConfig } from "@/lib/customSlide";
import {
  bindEditorStore,
  commitExternalEditorChange,
  redo,
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
});
