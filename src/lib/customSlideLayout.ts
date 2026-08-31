import type { ImageBlock, ShapeBlock, TextBlock, TitleBlock } from "@/lib/customSlide";
import { ensureShapeBlock } from "@/lib/customSlide";
import { SLIDE_DEFAULT_FONT_FAMILY } from "@/lib/slideBrandKit";
import { SLIDE_HEX } from "@/lib/slideColors";

export type SimpleLayoutBlock = TitleBlock | TextBlock | ImageBlock | ShapeBlock;

export type CustomSlideLayoutNode =
  | {
      kind: "text";
      role: "title" | "body";
      text: string;
      style: {
        alignItems: "center" | "flex-start";
        justifyContent: "flex-start" | "center" | "flex-end";
        fontFamily: string;
        fontSize: number;
        fontWeight?: number;
        fontStyle?: "italic" | "normal";
        color: string;
        lineHeight: number;
        textAlign: "left" | "center" | "right";
        letterSpacing?: string;
        textShadow?: string;
        textTransform: "none" | "uppercase" | "lowercase" | "capitalize";
        padding: number;
        backgroundColor?: string;
        borderRadius?: number;
      };
    }
  | {
      kind: "image";
      src: string | null;
      fit: ImageBlock["fit"];
      placeholder: {
        background: string;
        border: string;
        color: string;
        fontFamily: string;
        fontSize: number;
        text: string;
      };
      frame: {
        border?: string;
        borderRadius?: number;
        boxShadow?: string;
      };
    }
  | {
      kind: "shape";
      block: ReturnType<typeof ensureShapeBlock>;
    };

function hexToRgba(hex: string, alphaPct: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(100, alphaPct)) / 100})`;
}

const justifyMap: Record<"left" | "center" | "right", "flex-start" | "center" | "flex-end"> = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
};

function textCommon(block: TitleBlock | TextBlock, role: "title" | "body"): Extract<CustomSlideLayoutNode, { kind: "text" }> {
  const isTitle = role === "title";
  return {
    kind: "text",
    role,
    text: block.text,
    style: {
      alignItems: isTitle ? "center" : "flex-start",
      justifyContent: justifyMap[block.align],
      fontFamily: block.fontFamily ?? SLIDE_DEFAULT_FONT_FAMILY,
      fontSize: block.size,
      fontWeight: isTitle ? (block.bold ? 700 : 400) : undefined,
      fontStyle: block.italic ? "italic" : "normal",
      color: `#${block.color}`,
      lineHeight: block.lineHeight ?? (isTitle ? 1.1 : 1.3),
      textAlign: block.align,
      letterSpacing: block.letterSpacing != null ? `${block.letterSpacing}em` : undefined,
      textShadow: block.textShadow || undefined,
      textTransform: block.textTransform ?? "none",
      padding: block.padding ?? 0,
      backgroundColor: block.backgroundColor && block.backgroundColor !== "transparent"
        ? `#${block.backgroundColor}`
        : undefined,
      borderRadius: block.borderRadius ?? undefined,
    },
  };
}

export function buildSimpleBlockLayout(block: SimpleLayoutBlock): CustomSlideLayoutNode {
  if (block.kind === "title") return textCommon(block, "title");
  if (block.kind === "text") return textCommon(block, "body");
  if (block.kind === "image") {
    const hasBorder = !!block.strokeColor && (block.strokeWidth ?? 0) > 0;
    return {
      kind: "image",
      src: block.src || null,
      fit: block.fit,
      placeholder: {
        background: SLIDE_HEX.gridSoft,
        border: `1px dashed ${SLIDE_HEX.slate400}`,
        color: SLIDE_HEX.slate500,
        fontFamily: "Calibri",
        fontSize: 14,
        text: "Faça upload de uma imagem",
      },
      frame: {
        border: hasBorder ? `${block.strokeWidth}px solid ${block.strokeColor}` : undefined,
        borderRadius: block.radius || undefined,
        boxShadow: block.shadowEnabled
          ? `${block.shadowX ?? 0}px ${block.shadowY ?? 4}px ${block.shadowBlur ?? 12}px ${hexToRgba(block.shadowColor ?? "#000000", block.shadowOpacity ?? 30)}`
          : undefined,
      },
    };
  }
  return {
    kind: "shape",
    block: ensureShapeBlock(block),
  };
}
