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
import { SlideFilterProvider } from "@/components/pricing/custom/SlideFilterContext";

const SLIDE_W_IN = 13.33;
const SLIDE_H_IN = 7.5;

// 1333 x 750 em 4x = 5332 x 3000 px. Prioriza fidelidade premium no PPTX.
const EXPORT_SCALE = 4;
const LEGACY_SCALE = 2;
const EXPORT_CAPTURE_CSS = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
  }
  .recharts-surface * {
    animation: none !important;
    transition: none !important;
  }
  table, thead, tbody, tr, th, td {
    vertical-align: middle !important;
  }
  th, td {
    line-height: 1.15 !important;
  }
`;

function isLikelySvgSource(src: string | undefined): src is string {
  if (!src) return false;
  const s = src.trim().toLowerCase();
  return s.startsWith("data:image/svg+xml")
    || s.startsWith("blob:")
    || s.endsWith(".svg")
    || s.includes(".svg?");
}

function svgDataUrlToText(src: string): string | null {
  const comma = src.indexOf(",");
  if (!src.toLowerCase().startsWith("data:image/svg+xml") || comma < 0) return null;
  const meta = src.slice(0, comma).toLowerCase();
  const payload = src.slice(comma + 1);
  try {
    return meta.includes(";base64")
      ? decodeURIComponent(escape(atob(payload)))
      : decodeURIComponent(payload);
  } catch {
    try {
      return atob(payload);
    } catch {
      return null;
    }
  }
}

async function loadSvgText(src: string): Promise<string | null> {
  const fromDataUrl = svgDataUrlToText(src);
  if (fromDataUrl) return fromDataUrl;
  try {
    const res = await fetch(src);
    const text = await res.text();
    return text.includes("<svg") ? text : null;
  } catch {
    return null;
  }
}

async function rasterizeSvgSource(src: string, width: number, height: number): Promise<string> {
  if (!isLikelySvgSource(src)) return src;
  const svg = await loadSvgText(src);
  if (!svg) return src;

  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Falha ao rasterizar SVG do slide."));
    });

    const scale = EXPORT_SCALE;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return src;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } catch {
    return src;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function prepareConfigForExport(config: CustomSlideConfig): Promise<CustomSlideConfig> {
  const blocks = await Promise.all(config.blocks.map(async (block) => {
    if (block.kind !== "image" || !isLikelySvgSource(block.src)) return block;
    const src = await rasterizeSvgSource(block.src, block.w, block.h);
    return src === block.src ? block : { ...block, src };
  }));
  const backgroundImage = config.backgroundImage && isLikelySvgSource(config.backgroundImage)
    ? await rasterizeSvgSource(config.backgroundImage, CANVAS_W, CANVAS_H)
    : config.backgroundImage;
  return { ...config, blocks, backgroundImage };
}

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
  // Recharts e blocos Omni dependem de ResizeObserver + paint assíncrono.
  for (let i = 0; i < 50; i++) {
    await nextFrame();
    if (hasRenderableSvgGeometry(root)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
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

  return seen > 0 && nonWhite / seen < 0.0005;
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
  const exportConfig = await prepareConfigForExport(config);
  const host = document.createElement("div");
  host.style.cssText = [
    "position:fixed",
    "left:0",
    `top:-${CANVAS_H + 200}px`,
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
      root.render(
        React.createElement(
          SlideFilterProvider,
          { slideKey: "export" },
          React.createElement("style", null, EXPORT_CAPTURE_CSS),
          React.createElement(CustomCanvasReadOnly, { config: exportConfig }),
        ),
      );
    });

    await new Promise((r) => setTimeout(r, 500));
    await waitForFonts();
    await waitForImages(host);
    await waitForChartPaint(host);
    await nextFrame();
    await nextFrame();

    let canvas = await captureHost(host, EXPORT_SCALE);
    if (exportConfig.blocks.length > 0 && canvasLooksBlank(canvas)) {
      console.warn("[customSlide export] captura principal vazia; usando fallback legado.");
      canvas = await renderLegacyCanvas(exportConfig);
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
    "left:0",
    `top:-${captureH + 200}px`,
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
        React.createElement(SlideFilterProvider, { slideKey: "export" },
          React.createElement("style", null, EXPORT_CAPTURE_CSS),
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
        ),
      );
    });

    await new Promise((r) => setTimeout(r, 500));
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
