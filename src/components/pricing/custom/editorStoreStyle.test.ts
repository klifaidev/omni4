import { describe, expect, it, vi } from "vitest";
import type { CustomBlock, CustomSlideConfig } from "@/lib/customSlide";
import {
  bindEditorStore,
  canPasteElementStyleAction,
  copyElementStyleAction,
  pasteElementStyleAction,
} from "./editorStore";

function chart(id: string, style: Record<string, unknown>): CustomBlock {
  return {
    id, kind: "chart", x: 0, y: 0, w: 400, h: 300, z: 1,
    chartType: "bar", measure: "rol", showGrid: true, showLegend: true, showLabels: false,
    style,
  } as unknown as CustomBlock;
}

describe("pincel / copiar e colar estilo", () => {
  it("gráfico sem budgetGap não derruba o menu de colar depois de copiar (regressão)", () => {
    const cfg: CustomSlideConfig = {
      background: "FFFFFF", showHaraldFooter: true,
      blocks: [chart("a", { general: { titleShow: false } }), chart("b", {})],
    };
    bindEditorStore(cfg, vi.fn(), "slide-style-painter");
    expect(copyElementStyleAction("a")).toBe(true);
    expect(() => canPasteElementStyleAction("b")).not.toThrow();
    expect(canPasteElementStyleAction("b")).toBe(true);
  });

  it("colar em outro gráfico leva o visual e preserva a medida da linha do combo", () => {
    const cfg: CustomSlideConfig = {
      background: "FFFFFF", showHaraldFooter: true,
      blocks: [
        chart("a", { general: { titleShow: false }, measureLine: "cm" }),
        chart("b", { general: { titleShow: true }, measureLine: "volume" }),
      ],
    };
    bindEditorStore(cfg, vi.fn(), "slide-style-painter-2");
    copyElementStyleAction("a");
    expect(pasteElementStyleAction("b")).toBe(true);
  });
});
