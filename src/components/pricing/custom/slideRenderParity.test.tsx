import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BlockRenderer } from "./BlockRenderer";
import { CustomCanvasReadOnly } from "./PresentationMode";
import { SlideFilterProvider } from "./SlideFilterContext";
import { ScaledPreview } from "@/components/pricing/SlidePreview";
import {
  CANVAS_H,
  CANVAS_W,
  newBlock,
  type CustomBlock,
  type CustomBlockKind,
  type CustomSlideConfig,
  type ImageBlock,
  type ShapeBlock,
  type TextBlock,
  type TitleBlock,
} from "@/lib/customSlide";
import { buildSimpleBlockLayout } from "@/lib/customSlideLayout";
import type { SlideItem } from "@/lib/slidesFlow";

afterEach(() => cleanup());

const BLOCK_KINDS: CustomBlockKind[] = [
  "title",
  "text",
  "kpi",
  "image",
  "shape",
  "bridge",
  "table",
  "chart",
  "topSku",
  "dre",
  "omni_evolucao_mensal",
  "omni_heatmap_sazonalidade",
  "omni_herois_ofensores",
  "omni_canal_trend",
  "omni_canal_mix",
  "omni_custo_evolucao",
  "omni_custo_composicao",
  "omni_custo_pressao",
  "omni_positivacao",
  "omni_uf_map",
  "omni_price_decomp",
  "omni_bridge_pvm",
  "omni_farol",
  "omni_abc_curva",
  "omni_portfolio_matrix",
  "omni_abc_bars",
];

function rotationOf(block: CustomBlock): number {
  if (block.kind === "title" || block.kind === "text" || block.kind === "image") return block.rotation ?? 0;
  return 0;
}

function referenceBlock(kind: CustomBlockKind, index: number): CustomBlock {
  const block = {
    ...newBlock(kind, index),
    id: `ref-${kind}`,
    x: 24 + (index % 3) * 420,
    y: 24 + Math.floor(index / 3) * 170,
    w: kind.startsWith("omni_") ? 380 : 360,
    h: kind === "title" || kind === "text" ? 120 : 145,
    z: index + 1,
    opacity: index % 2 === 0 ? 86 : 100,
    enterAnimation: index % 3 === 0 ? "fade" : "none",
  } as CustomBlock;

  if (block.kind === "title") {
    return {
      ...block,
      text: "Título com estilo",
      size: 34,
      bold: true,
      italic: true,
      color: "AA1028",
      align: "center",
      rotation: -8,
      lineHeight: 1.18,
      letterSpacing: 0.04,
      textTransform: "uppercase",
      padding: 10,
      backgroundColor: "FFF1F3",
      borderRadius: 14,
    } as TitleBlock;
  }

  if (block.kind === "text") {
    return {
      ...block,
      text: "Texto de referência\ncom duas linhas",
      size: 18,
      italic: true,
      color: "334155",
      align: "right",
      rotation: 6,
      lineHeight: 1.42,
      letterSpacing: 0.02,
      textTransform: "capitalize",
      padding: 8,
      backgroundColor: "F8FAFC",
      borderRadius: 10,
    } as TextBlock;
  }

  if (block.kind === "image") {
    return {
      ...block,
      src: "",
      fit: "cover",
      rotation: 5,
    } as ImageBlock;
  }

  if (block.kind === "shape") {
    return {
      ...block,
      shape: "roundRect",
      fill: "E30613",
      fillOpacity: 45,
      strokeColor: "1C2430",
      strokeWidth: 3,
      strokeStyle: "dashed",
      radius: 22,
      shadowEnabled: true,
      shadowColor: "000000",
      shadowOpacity: 35,
      shadowBlur: 12,
      shadowX: 4,
      shadowY: 6,
    } as ShapeBlock;
  }

  return block;
}

function referenceSlides(): CustomSlideConfig[] {
  const simpleKinds = ["title", "text", "image", "shape"] as CustomBlockKind[];
  const coreKinds = ["kpi", "bridge", "table", "chart", "topSku", "dre"] as CustomBlockKind[];
  const omniKinds = BLOCK_KINDS.filter((kind) => kind.startsWith("omni_"));
  return [simpleKinds, coreKinds, omniKinds.slice(0, 8), omniKinds.slice(8)].map((kinds, slideIndex) => ({
    background: slideIndex % 2 === 0 ? "FFFFFF" : "F8FAFC",
    showHaraldFooter: slideIndex % 2 === 0,
    blocks: kinds.map((kind, index) => referenceBlock(kind, slideIndex * 10 + index)),
  }));
}

function EditCanvas({ config }: { config: CustomSlideConfig }) {
  const sorted = [...config.blocks].sort((a, b) => a.z - b.z);
  return (
    <SlideFilterProvider slideKey="reference-edit">
      <div
        data-reference-canvas="edit"
        style={{
          width: CANVAS_W,
          height: CANVAS_H,
          background: config.background === "transparent" ? "#FFFFFF" : `#${config.background}`,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {sorted.map((block) => {
          const rotation = rotationOf(block);
          return (
            <div
              key={block.id}
              data-slide-block-id={block.id}
              data-slide-block-kind={block.kind}
              style={{
                position: "absolute",
                left: block.x,
                top: block.y,
                width: block.w,
                height: block.h,
                zIndex: block.z,
                transform: rotation ? `rotate(${rotation}deg)` : undefined,
                transformOrigin: "50% 50%",
                visibility: block.hidden ? "hidden" : "visible",
              }}
            >
              <BlockRenderer block={block} readOnly={false} onPatch={() => undefined} />
            </div>
          );
        })}
      </div>
    </SlideFilterProvider>
  );
}

function PresentationCanvas({ config }: { config: CustomSlideConfig }) {
  return (
    <SlideFilterProvider slideKey="reference-presentation">
      <CustomCanvasReadOnly config={config} slideId="reference-presentation" />
    </SlideFilterProvider>
  );
}

function ThumbnailCanvas({ config }: { config: CustomSlideConfig }) {
  const item: SlideItem = {
    id: "reference-thumbnail",
    kind: "custom",
    label: "Referência",
    config,
  };
  return (
    <SlideFilterProvider slideKey="reference-thumbnail">
      <ScaledPreview item={item} targetWidth={320} mode="live" />
    </SlideFilterProvider>
  );
}

type BlockSignature = {
  id: string;
  kind: string;
  box: Record<string, string>;
  contentOpacity: string;
  text: string;
};

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function styleValue(style: CSSStyleDeclaration, key: keyof CSSStyleDeclaration): string {
  const value = style[key];
  return typeof value === "string" ? value : "";
}

function blockSignatures(container: HTMLElement): BlockSignature[] {
  return Array.from(container.querySelectorAll<HTMLElement>("[data-slide-block-id]"))
    .map((el) => {
      const style = el.style;
      return {
        id: el.dataset.slideBlockId ?? "",
        kind: el.dataset.slideBlockKind ?? "",
        box: {
          left: styleValue(style, "left"),
          top: styleValue(style, "top"),
          width: styleValue(style, "width"),
          height: styleValue(style, "height"),
          zIndex: styleValue(style, "zIndex"),
          transform: styleValue(style, "transform"),
          visibility: styleValue(style, "visibility"),
        },
        contentOpacity: el.firstElementChild instanceof HTMLElement ? styleValue(el.firstElementChild.style, "opacity") : "",
        text: normalizeText(el.textContent ?? ""),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function renderSignatures(ui: React.ReactElement): BlockSignature[] {
  const { container, unmount } = render(ui);
  const signatures = blockSignatures(container);
  unmount();
  return signatures;
}

function diffCount(a: BlockSignature[], b: BlockSignature[]): number {
  const left = JSON.stringify(a);
  const right = JSON.stringify(b);
  if (left === right) return 0;
  let count = 0;
  const byId = new Map(b.map((item) => [item.id, item]));
  for (const item of a) {
    if (JSON.stringify(item) !== JSON.stringify(byId.get(item.id))) count += 1;
  }
  return count + Math.abs(a.length - b.length);
}

describe("slide render context parity", () => {
  it("keeps every custom block kind covered by the reference slides", () => {
    const covered = new Set(referenceSlides().flatMap((slide) => slide.blocks.map((block) => block.kind)));
    expect([...covered].sort()).toEqual([...BLOCK_KINDS].sort());
  });

  it("renders reference slides with matching block signatures in edit, presentation, and thumbnail contexts", () => {
    const tolerance = 0;

    for (const config of referenceSlides()) {
      const edit = renderSignatures(<EditCanvas config={config} />);
      const presentation = renderSignatures(<PresentationCanvas config={config} />);
      const thumbnail = renderSignatures(<ThumbnailCanvas config={config} />);

      expect(diffCount(edit, presentation)).toBeLessThanOrEqual(tolerance);
      expect(diffCount(presentation, thumbnail)).toBeLessThanOrEqual(tolerance);
    }
  });

  it("applies base visual properties for every block type in every context", () => {
    for (const config of referenceSlides()) {
      const byId = new Map(config.blocks.map((block) => [block.id, block]));
      const contexts = [
        renderSignatures(<EditCanvas config={config} />),
        renderSignatures(<PresentationCanvas config={config} />),
        renderSignatures(<ThumbnailCanvas config={config} />),
      ];

      for (const signatures of contexts) {
        for (const signature of signatures) {
          const block = byId.get(signature.id);
          expect(block).toBeDefined();
          if (!block) continue;
          const rotation = rotationOf(block);
          const opacity = block.opacity == null ? 100 : Math.max(0, Math.min(100, block.opacity));

          expect(signature.kind).toBe(block.kind);
          expect(signature.box.left).toBe(`${block.x}px`);
          expect(signature.box.top).toBe(`${block.y}px`);
          expect(signature.box.width).toBe(`${block.w}px`);
          expect(signature.box.height).toBe(`${block.h}px`);
          expect(signature.box.zIndex).toBe(String(block.z));
          expect(signature.box.transform).toBe(rotation ? `rotate(${rotation}deg)` : "");
          expect(signature.box.visibility).toBe(block.hidden ? "hidden" : "visible");
          expect(signature.contentOpacity).toBe(opacity === 100 ? "" : String(opacity / 100));
        }
      }
    }
  });
});

describe("simple block visual property coverage", () => {
  it("maps title and text model style properties into visible layout styles", () => {
    const title = referenceBlock("title", 0) as TitleBlock;
    const text = referenceBlock("text", 1) as TextBlock;

    expect(buildSimpleBlockLayout(title)).toMatchObject({
      kind: "text",
      text: "Título com estilo",
      style: {
        fontSize: 34,
        fontWeight: 700,
        fontStyle: "italic",
        color: "#AA1028",
        textAlign: "center",
        lineHeight: 1.18,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        padding: 10,
        backgroundColor: "#FFF1F3",
        borderRadius: 14,
      },
    });

    expect(buildSimpleBlockLayout(text)).toMatchObject({
      kind: "text",
      text: "Texto de referência\ncom duas linhas",
      style: {
        fontSize: 18,
        fontStyle: "italic",
        color: "#334155",
        textAlign: "right",
        lineHeight: 1.42,
        letterSpacing: "0.02em",
        textTransform: "capitalize",
        padding: 8,
        backgroundColor: "#F8FAFC",
        borderRadius: 10,
      },
    });
  });

  it("maps image and shape model style properties into visible layout nodes", () => {
    const image = referenceBlock("image", 2) as ImageBlock;
    const shape = referenceBlock("shape", 3) as ShapeBlock;

    expect(buildSimpleBlockLayout(image)).toMatchObject({
      kind: "image",
      src: null,
      fit: "cover",
    });

    expect(buildSimpleBlockLayout(shape)).toMatchObject({
      kind: "shape",
      block: {
        shape: "roundRect",
        fill: "E30613",
        fillOpacity: 45,
        strokeColor: "1C2430",
        strokeWidth: 3,
        strokeStyle: "dashed",
        radius: 22,
        shadowEnabled: true,
        shadowColor: "000000",
        shadowOpacity: 35,
        shadowBlur: 12,
        shadowX: 4,
        shadowY: 6,
      },
    });
  });
});
