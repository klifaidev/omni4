// Exportador do slide "Personalizado" para PPTX.
// Estratégia: blocos simples (title/text/kpi/shape/image) viram elementos
// nativos editáveis. Blocos de dados (bridge/chart/table/topSku) são
// renderizados como PNG fiel ao canvas — capturados do DOM se disponível,
// ou montados off-screen via React no momento do export.

import type PptxGenJS from "pptxgenjs";
import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { toPng } from "html-to-image";
import {
  CANVAS_W, CANVAS_H, type CustomSlideConfig, type CustomBlock,
  type TitleBlock, type TextBlock, type KpiBlock, type ImageBlock,
  type ShapeBlock, type ShapeType, KPI_MEASURES, ensureShapeBlock, isLineFamily,
} from "./customSlide";
import haraldFooterPng from "@/assets/harald-footer-bar.png";
import { usePricing } from "@/store/pricing";
import { computeKpiBlock } from "./customKpi";
import { getCustomCanvas } from "./customCanvasRegistry";
import { BlockRenderer } from "@/components/pricing/custom/BlockRenderer";
import { SlideFilterProvider } from "@/components/pricing/custom/SlideFilterContext";

const SLIDE_W_IN = 13.33;
const SLIDE_H_IN = 7.5;
const FOOTER_H_IN = 0.85;

const SX = SLIDE_W_IN / CANVAS_W;
const SY = SLIDE_H_IN / CANVAS_H;

const BOX = (b: CustomBlock) => ({
  x: b.x * SX, y: b.y * SY, w: b.w * SX, h: b.h * SY,
});

// ---------------------------------------------------------------------------
// Renderizadores nativos (texto / KPI / forma / imagem)
// ---------------------------------------------------------------------------
function resolveFontFace(fontFamily: string | undefined): string {
  if (!fontFamily) return "Calibri";
  // fontFamily pode vir como "Inter, sans-serif" — pegar só o primeiro token
  return fontFamily.split(",")[0].trim().replace(/['"]/g, "") || "Calibri";
}

function renderTitle(slide: PptxGenJS.Slide, b: TitleBlock) {
  slide.addText(b.text || "", {
    ...BOX(b),
    fontFace: resolveFontFace(b.fontFamily),
    fontSize: Math.max(8, Math.round(b.size * 0.75)),
    bold: b.bold, italic: b.italic ?? false, color: b.color, align: b.align,
    valign: "middle", margin: 0, wrap: true, fit: "shrink",
    rotate: b.rotation ?? 0,
  });
}
function renderText(slide: PptxGenJS.Slide, b: TextBlock) {
  slide.addText(b.text || "", {
    ...BOX(b),
    fontFace: resolveFontFace(b.fontFamily),
    fontSize: Math.max(8, Math.round(b.size * 0.75)),
    italic: b.italic ?? false, color: b.color, align: b.align,
    valign: "top", margin: 0, wrap: true,
    rotate: b.rotation ?? 0,
  });
}
function renderKpi(slide: PptxGenJS.Slide, b: KpiBlock,
  pricing: ReturnType<typeof usePricing.getState>["rows"]) {
  const box = BOX(b);
  const value = computeKpiBlock(pricing, b);
  const measureLabel = b.source === "dynamic"
    ? KPI_MEASURES.find((m) => m.id === b.measure)?.label ?? "" : "";
  const cardBg = b.cardBg ?? "F8FAFC";
  if (cardBg !== "transparent") {
    slide.addShape("roundRect", {
      ...box, fill: { color: cardBg },
      line: { color: "E2E8F0", width: 0.75 }, rectRadius: 0.08,
    });
  }
  slide.addText(b.label || measureLabel || "KPI", {
    x: box.x + 0.1, y: box.y + 0.08, w: box.w - 0.2, h: 0.25,
    fontFace: "Calibri", fontSize: 9, color: "64748B", margin: 0, charSpacing: 1,
  });
  slide.addText(value, {
    x: box.x + 0.1, y: box.y + 0.32, w: box.w - 0.2, h: box.h - 0.5,
    fontFace: "Calibri",
    fontSize: Math.max(14, Math.round(b.valueSize * 0.75)),
    bold: true, color: b.color, valign: "middle", margin: 0, fit: "shrink",
  });
  if (b.source === "dynamic" && measureLabel) {
    slide.addText(measureLabel, {
      x: box.x + 0.1, y: box.y + box.h - 0.22, w: box.w - 0.2, h: 0.18,
      fontFace: "Calibri", fontSize: 8, color: "94A3B8", margin: 0,
    });
  }
}
const PPTX_SHAPE_MAP: Record<ShapeType, string> = {
  rect: "rect", roundRect: "roundRect",
  circle: "ellipse", ellipse: "ellipse",
  triangle: "triangle", "right-triangle": "rtTriangle",
  diamond: "diamond", pentagon: "pentagon", hexagon: "hexagon",
  "star-4": "star4", "star-5": "star5", "star-6": "star6",
  line: "line", "dashed-line": "line",
  arrow: "rightArrow", "double-arrow": "leftRightArrow",
  "callout-rect": "wedgeRectCallout", "callout-rounded": "wedgeRoundRectCallout",
  chevron: "chevron", ribbon: "ribbon",
  "brace-left": "leftBrace", "brace-right": "rightBrace",
  "bracket-left": "leftBracket", "bracket-right": "rightBracket",
};

function dashTypeFor(s: "solid" | "dashed" | "dotted"): string {
  return s === "dashed" ? "dash" : s === "dotted" ? "dot" : "solid";
}

function renderShape(slide: PptxGenJS.Slide, raw: ShapeBlock) {
  const b = ensureShapeBlock(raw);
  const box = BOX(b);
  const pptxShape = PPTX_SHAPE_MAP[b.shape] ?? "rect";
  const isLine = isLineFamily(b.shape);

  const shadow = b.shadowEnabled ? {
    type: "outer" as const,
    color: b.shadowColor,
    opacity: b.shadowOpacity / 100,
    blur: b.shadowBlur,
    offset: Math.max(Math.abs(b.shadowX), Math.abs(b.shadowY)),
    angle: 135,
  } : undefined;

  if (isLine) {
    const dash = b.shape === "dashed-line" ? "dash" : dashTypeFor(b.strokeStyle);
    // approximate orientation via box geometry — pptx "line" goes from top-left to bottom-right of the box
    const dir = b.lineDirection;
    let lineBox = box;
    if (dir === "horizontal") {
      lineBox = { x: box.x, y: box.y + box.h / 2, w: box.w, h: 0 };
    } else if (dir === "vertical") {
      lineBox = { x: box.x + box.w / 2, y: box.y, w: 0, h: box.h };
    }
    slide.addShape(pptxShape as never, {
      ...lineBox,
      line: {
        color: b.fill,
        width: Math.max(0.5, b.lineThickness * 0.75),
        dashType: dash as never,
        beginArrowType: (b.arrowStart ? "triangle" : "none") as never,
        endArrowType: ((b.arrowEnd || b.shape === "arrow" || b.shape === "double-arrow") ? "triangle" : "none") as never,
      },
      rotate: b.rotation || 0,
      ...(shadow ? { shadow } : {}),
    });
    return;
  }

  const isTransparentFill = b.fill === "transparent";
  const opts: Record<string, unknown> = {
    ...box,
    fill: isTransparentFill
      ? { type: "none" }
      : { color: b.fill, transparency: 100 - b.fillOpacity },
    line: b.strokeWidth > 0 ? {
      color: b.strokeColor,
      width: b.strokeWidth * 0.75,
      dashType: dashTypeFor(b.strokeStyle),
    } : { type: "none" },
    rotate: b.rotation || 0,
  };
  if (shadow) opts.shadow = shadow;
  if (pptxShape === "roundRect" || b.shape === "callout-rect" || b.shape === "callout-rounded") {
    // PptxGenJS rectRadius is a fraction of the smaller box dimension (0..0.5)
    const minDim = Math.min(box.w, box.h);
    opts.rectRadius = Math.max(0, Math.min(0.5, (b.radius * SX) / Math.max(0.01, minDim)));
  }
  slide.addShape(pptxShape as never, opts);
}
function renderImage(slide: PptxGenJS.Slide, b: ImageBlock) {
  if (!b.src) return;
  const box = BOX(b);
  slide.addImage({
    data: b.src.startsWith("data:") ? b.src : undefined,
    path: b.src.startsWith("data:") ? undefined : b.src,
    ...box,
    sizing: { type: b.fit === "cover" ? "cover" : "contain", w: box.w, h: box.h },
    rotate: b.rotation ?? 0,
  });
}

// ---------------------------------------------------------------------------
// PNG capture — DOM ao vivo OU offscreen
// ---------------------------------------------------------------------------
async function waitFonts() {
  if ((document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready) {
    await (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready;
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
}

async function captureNode(
  node: HTMLElement,
  bgColor: string | undefined = "#FFFFFF",
  opts: { w?: number; h?: number; resetTransform?: boolean; pixelRatio?: number } = {},
): Promise<string> {
  const width = Math.max(1, opts.w ?? Math.ceil(node.offsetWidth || node.getBoundingClientRect().width));
  const height = Math.max(1, opts.h ?? Math.ceil(node.offsetHeight || node.getBoundingClientRect().height));
  const styleOverride: Record<string, string> = {
    width: `${width}px`,
    height: `${height}px`,
  };
  if (opts.resetTransform) styleOverride.transform = "none";
  return toPng(node, {
    width,
    height,
    pixelRatio: opts.pixelRatio ?? 4,
    backgroundColor: bgColor,
    cacheBust: true,
    style: styleOverride,
    filter: (n) => {
      if (!(n instanceof Element)) return true;
      if (n.getAttribute("data-edit-only") === "true") return false;
      const cls = n.getAttribute("class") ?? "";
      return !/react-resizable-handle|outline-primary/.test(cls);
    },
  });
}

function isBlockTransparent(block: CustomBlock): boolean {
  if (block.kind === "chart") {
    const bg = (block.style as { general?: { background?: string } } | undefined)?.general?.background;
    return bg === "transparent";
  }
  return false;
}

async function renderBlockOffscreen(block: CustomBlock): Promise<string> {
  const transparent = isBlockTransparent(block);
  const bgCss = transparent ? "transparent" : "#FFFFFF";
  const host = document.createElement("div");
  // Posiciona completamente fora do viewport via left negativo, sem transform,
  // para evitar artefatos de compositing de GPU em elementos translateados.
  host.style.cssText = [
    "position:fixed",
    `left:-${block.w + 200}px`, "top:0",
    `width:${block.w}px`, `height:${block.h}px`,
    `background:${bgCss}`, "overflow:hidden", "pointer-events:none",
    "z-index:2147483647",
  ].join(";");
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => {
      root.render(
        React.createElement(SlideFilterProvider, { slideKey: `export-${block.id}` },
          React.createElement("div", {
            style: { width: block.w, height: block.h, background: bgCss, overflow: "hidden" },
          }, React.createElement(BlockRenderer, { block })),
        ),
      );
    });
    await waitFonts();
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    await new Promise((r) => setTimeout(r, 500));
    const hasGeom = () => {
      const svgs = host.querySelectorAll("svg");
      for (const svg of svgs) {
        if (svg.querySelector("path, rect, circle, polyline, polygon")) return true;
      }
      return svgs.length === 0;
    };
    let tries = 0;
    while (!hasGeom() && tries < 15) {
      await new Promise((r) => setTimeout(r, 150));
      tries++;
    }
    return await captureNode(host, transparent ? undefined : "#FFFFFF", {
      w: block.w,
      h: block.h,
      pixelRatio: 2,
    });
  } finally {
    setTimeout(() => { try { root.unmount(); } catch {} host.remove(); }, 0);
  }
}

async function renderBlockAsImage(
  slide: PptxGenJS.Slide, block: CustomBlock, slideId?: string,
) {
  const box = BOX(block);
  const transparent = isBlockTransparent(block);
  try {
    const canvas = slideId ? getCustomCanvas(slideId) : null;
    const liveNode = canvas?.querySelector(`[data-block-id="${block.id}"]`) as HTMLElement | null;
    await waitFonts();
    let dataUrl: string;
    if (liveNode) {
      // Preferir captura do DOM ao vivo: já tem todos os contexts, dados reais
      // e charts renderizados. resetTransform remove o rotate do bloco (adicionado
      // pela tela de edição); dimensões explícitas ignoram qualquer scale do editor.
      dataUrl = await captureNode(liveNode, transparent ? undefined : "#FFFFFF", {
        w: block.w,
        h: block.h,
        resetTransform: true,
        pixelRatio: 4,
      });
    } else {
      // Fallback offscreen: usado quando o slide não está visível no editor
      // (nenhum CustomSlideEditor montado para esse slideId).
      dataUrl = await renderBlockOffscreen(block);
    }
    slide.addImage({
      data: dataUrl,
      x: box.x, y: box.y, w: box.w, h: box.h,
    });
  } catch (err) {
    console.error("[customSlide export] falha ao renderizar bloco", block.kind, err);
    slide.addText(`Falha ao renderizar (${block.kind})`, {
      ...box, fontFace: "Calibri", fontSize: 10, color: "C8102E",
      align: "center", valign: "middle", italic: true,
    });
  }
}

// ---------------------------------------------------------------------------
async function fetchAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function addCustomSlide(
  pptx: PptxGenJS,
  config: CustomSlideConfig,
  opts?: { slideId?: string; onNavigate?: () => Promise<void> | void },
) {
  // Navega para o slide no editor antes de capturar, garantindo que
  // CustomSlideEditor esteja montado e liveNode esteja disponível.
  if (opts?.onNavigate) {
    await opts.onNavigate();
    // Aguarda o editor montar e os charts terminarem de renderizar.
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  const slide = pptx.addSlide();
  if (config.background && config.background !== "transparent") {
    slide.background = { color: config.background };
  }
  const pricing = usePricing.getState().rows;

  const sorted = [...config.blocks].sort((a, b) => a.z - b.z);
  for (const blk of sorted) {
    try {
      switch (blk.kind) {
        case "title":  renderTitle(slide, blk); break;
        case "text":   renderText(slide, blk); break;
        case "kpi":    renderKpi(slide, blk, pricing); break;
        case "shape":  renderShape(slide, blk); break;
        case "image":  renderImage(slide, blk); break;
        // Blocos de dados — captura PNG fiel ao canvas
        case "table":
        case "topSku":
        case "chart":
        case "bridge":
        case "dre":
        // Omni Analytics — todos exportados como imagem
        case "omni_evolucao_mensal":
        case "omni_heatmap_sazonalidade":
        case "omni_herois_ofensores":
        case "omni_canal_trend":
        case "omni_canal_mix":
        case "omni_custo_evolucao":
        case "omni_custo_composicao":
        case "omni_custo_pressao":
        case "omni_price_decomp":
        case "omni_bridge_pvm":
        case "omni_farol":
        case "omni_abc_curva":
        case "omni_portfolio_matrix":
        case "omni_abc_bars":
          await renderBlockAsImage(slide, blk, opts?.slideId);
          break;
      }
    } catch (err) {
      console.error("[customSlide export] erro no bloco", blk.kind, err);
    }
  }

  if (config.showHaraldFooter) {
    try {
      const footerData = await fetchAsDataUrl(haraldFooterPng);
      slide.addImage({
        data: footerData,
        x: 0, y: SLIDE_H_IN - FOOTER_H_IN,
        w: SLIDE_W_IN, h: FOOTER_H_IN,
      });
    } catch (err) {
      console.error("[customSlide export] rodapé Harald não pôde ser carregado", err);
    }
  }
}
