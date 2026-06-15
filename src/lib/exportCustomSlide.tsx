// Exportador do slide "Personalizado" para PPTX.
// Renderiza o slide inteiro como PNG em alta densidade e insere a imagem
// cobrindo todo o slide no PPTX.

import type PptxGenJS from "pptxgenjs";
import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { toPng } from "html-to-image";
import { CANVAS_W, CANVAS_H, type CustomSlideConfig } from "./customSlide";
import { CustomCanvasReadOnly } from "@/components/pricing/custom/PresentationMode";

const SLIDE_W_IN = 13.33;
const SLIDE_H_IN = 7.5;

// 1333 x 750 em 3x = 3999 x 2250 px, equivalente a ~300 DPI no slide wide.
const EXPORT_PIXEL_RATIO = 3;

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitForFonts(): Promise<void> {
  const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
  if (fonts?.ready) await fonts.ready;
}

async function waitForImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(images.map(async (img) => {
    if (img.complete && img.naturalWidth > 0) return;
    if (typeof img.decode === "function") {
      try {
        await img.decode();
        return;
      } catch {
        // Algumas imagens data/blob rejeitam decode, mas ainda pintam no browser.
      }
    }
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
      setTimeout(done, 1500);
    });
  }));
}

function hasRenderableSvgGeometry(root: HTMLElement): boolean {
  const svgs = Array.from(root.querySelectorAll("svg"));
  if (svgs.length === 0) return true;
  return svgs.every((svg) => {
    const box = svg.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return false;
    return !!svg.querySelector(
      "path[d], rect, circle, ellipse, line, polyline, polygon, text, tspan",
    );
  });
}

async function waitForChartPaint(root: HTMLElement): Promise<void> {
  for (let i = 0; i < 30; i++) {
    await nextFrame();
    if (hasRenderableSvgGeometry(root)) return;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
}

async function renderSlideAsImage(config: CustomSlideConfig): Promise<string> {
  const host = document.createElement("div");
  host.style.cssText = [
    "position:fixed",
    "left:-100000px",
    "top:0",
    `width:${CANVAS_W}px`,
    `height:${CANVAS_H}px`,
    "background:#FFFFFF",
    "overflow:hidden",
    "pointer-events:none",
    "z-index:2147483647",
  ].join(";");
  document.body.appendChild(host);
  const root = createRoot(host);

  try {
    flushSync(() => {
      root.render(React.createElement(CustomCanvasReadOnly, { config }));
    });

    await waitForFonts();
    await waitForImages(host);
    await waitForChartPaint(host);
    await nextFrame();
    await nextFrame();

    return toPng(host, {
      cacheBust: true,
      backgroundColor: "#FFFFFF",
      width: CANVAS_W,
      height: CANVAS_H,
      pixelRatio: EXPORT_PIXEL_RATIO,
      filter: (node) => {
        if (!(node instanceof HTMLElement)) return true;
        return node.dataset.exportHide !== "true"
          && node.dataset.html2canvasIgnore !== "true";
      },
    });
  } finally {
    setTimeout(() => {
      try {
        root.unmount();
      } catch {
        // noop
      }
      host.remove();
    }, 0);
  }
}

export async function addCustomSlide(
  pptx: PptxGenJS,
  config: CustomSlideConfig,
  opts?: { slideId?: string },
): Promise<void> {
  const slide = pptx.addSlide();

  try {
    const dataUrl = await renderSlideAsImage(config);
    slide.addImage({
      data: dataUrl,
      x: 0,
      y: 0,
      w: SLIDE_W_IN,
      h: SLIDE_H_IN,
    });
  } catch (err) {
    console.error("[customSlide export] falha ao renderizar slide:", opts?.slideId, err);
    slide.addText("Erro ao renderizar slide", {
      x: 1,
      y: 3,
      w: 11.33,
      h: 1,
      fontFace: "Calibri",
      fontSize: 18,
      color: "C8102E",
      align: "center",
      valign: "middle",
    });
  }
}
