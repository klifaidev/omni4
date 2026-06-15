// Exportador do slide "Personalizado" para PPTX.
// Renderiza o canvas salvo como PNG de alta densidade e insere a imagem
// cobrindo todo o slide no PPTX.

import type PptxGenJS from "pptxgenjs";
import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import html2canvas from "html2canvas";
import { CANVAS_W, CANVAS_H, type CustomSlideConfig } from "./customSlide";
import { CustomCanvasReadOnly } from "@/components/pricing/custom/PresentationMode";

const SLIDE_W_IN = 13.33;
const SLIDE_H_IN = 7.5;

// 1333 x 750 em 3x = 3999 x 2250 px, equivalente a ~300 DPI no slide wide.
const EXPORT_SCALE = 3;
const LEGACY_SCALE = 2;

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
  // Recharts e alguns blocos Omni dependem de ResizeObserver + paint.
  for (let i = 0; i < 30; i++) {
    await nextFrame();
    if (hasRenderableSvgGeometry(root)) return;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
}

function canvasLooksBlank(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;

  const sample = 64;
  const stepX = Math.max(1, Math.floor(canvas.width / sample));
  const stepY = Math.max(1, Math.floor(canvas.height / sample));
  let seen = 0;
  let nonWhite = 0;

  for (let y = 0; y < canvas.height; y += stepY) {
    for (let x = 0; x < canvas.width; x += stepX) {
      const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
      seen++;
      if (a > 8 && (r < 245 || g < 245 || b < 245)) nonWhite++;
    }
  }

  return seen > 0 && nonWhite / seen < 0.002;
}

async function captureHost(host: HTMLElement, scale: number): Promise<HTMLCanvasElement> {
  return html2canvas(host, {
    scale,
    useCORS: true,
    backgroundColor: "#FFFFFF",
    width: host.offsetWidth,
    height: host.offsetHeight,
    windowWidth: host.offsetWidth,
    windowHeight: host.offsetHeight,
    logging: false,
    ignoreElements: (el) => {
      if (!(el instanceof HTMLElement)) return false;
      return el.dataset.exportHide === "true"
        || el.dataset.html2canvasIgnore === "true";
    },
  });
}

async function renderSlideAsImage(config: CustomSlideConfig): Promise<string> {
  const host = document.createElement("div");
  host.style.cssText = [
    "position:fixed",
    `left:-${CANVAS_W + 200}px`,
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

    let canvas = await captureHost(host, EXPORT_SCALE);
    if (config.blocks.length > 0 && canvasLooksBlank(canvas)) {
      console.warn("[customSlide export] captura principal vazia; usando fallback legado.");
      canvas = await renderLegacyCanvas(config);
    }

    return canvas.toDataURL("image/png");
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

async function renderLegacyCanvas(config: CustomSlideConfig): Promise<HTMLCanvasElement> {
  const captureW = CANVAS_W * LEGACY_SCALE;
  const captureH = CANVAS_H * LEGACY_SCALE;
  const host = document.createElement("div");
  host.style.cssText = [
    "position:fixed",
    `left:-${captureW + 200}px`,
    "top:0",
    `width:${captureW}px`,
    `height:${captureH}px`,
    "background:#FFFFFF",
    "overflow:hidden",
    "pointer-events:none",
    "z-index:2147483647",
  ].join(";");
  document.body.appendChild(host);
  const root = createRoot(host);

  try {
    flushSync(() => {
      root.render(
        React.createElement(
          "div",
          { style: { width: captureW, height: captureH, background: "#FFFFFF", overflow: "hidden" } },
          React.createElement(
            "div",
            {
              style: {
                width: CANVAS_W,
                height: CANVAS_H,
                transform: `scale(${LEGACY_SCALE})`,
                transformOrigin: "top left",
              },
            },
            React.createElement(CustomCanvasReadOnly, { config }),
          ),
        ),
      );
    });

    await waitForFonts();
    await waitForImages(host);
    await waitForChartPaint(host);
    await nextFrame();
    await nextFrame();

    return captureHost(host, 1);
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
