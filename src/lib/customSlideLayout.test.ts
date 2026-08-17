import { describe, expect, it } from "vitest";
import { buildSimpleBlockLayout } from "./customSlideLayout";
import type { ImageBlock, ShapeBlock, TextBlock, TitleBlock } from "./customSlide";

const base = {
  id: "b1",
  x: 0,
  y: 0,
  w: 320,
  h: 120,
  z: 1,
};

describe("customSlideLayout", () => {
  it("resolves title typography into an intermediate layout node", () => {
    const block: TitleBlock = {
      ...base,
      kind: "title",
      text: "Resumo Executivo",
      size: 32,
      bold: true,
      italic: true,
      color: "AA0000",
      align: "center",
      padding: 12,
      backgroundColor: "FFFFFF",
      borderRadius: 8,
    };

    expect(buildSimpleBlockLayout(block)).toMatchObject({
      kind: "text",
      role: "title",
      text: "Resumo Executivo",
      style: {
        alignItems: "center",
        justifyContent: "center",
        fontSize: 32,
        fontWeight: 700,
        fontStyle: "italic",
        color: "#AA0000",
        lineHeight: 1.1,
        textAlign: "center",
        padding: 12,
        backgroundColor: "#FFFFFF",
        borderRadius: 8,
      },
    });
  });

  it("keeps body text and temporary empty image states explicit", () => {
    const text: TextBlock = {
      ...base,
      kind: "text",
      text: "Linha 1\nLinha 2",
      size: 18,
      color: "222222",
      align: "right",
    };
    const image: ImageBlock = {
      ...base,
      kind: "image",
      src: "",
      fit: "cover",
    };

    expect(buildSimpleBlockLayout(text)).toMatchObject({
      kind: "text",
      role: "body",
      style: {
        alignItems: "flex-start",
        justifyContent: "flex-end",
        lineHeight: 1.3,
      },
    });
    expect(buildSimpleBlockLayout(image)).toMatchObject({
      kind: "image",
      src: null,
      fit: "cover",
      placeholder: {
        text: "Faça upload de uma imagem",
      },
    });
  });

  it("normalizes shape defaults once before rendering", () => {
    const shape: ShapeBlock = {
      ...base,
      kind: "shape",
      shape: "roundRect",
      fill: "E30613",
      fillOpacity: 50,
      radius: 16,
    } as ShapeBlock;

    const node = buildSimpleBlockLayout(shape);

    expect(node.kind).toBe("shape");
    if (node.kind === "shape") {
      expect(node.block.fill).toBe("E30613");
      expect(node.block.fillOpacity).toBe(50);
      expect(node.block.strokeStyle).toBe("solid");
    }
  });
});
