// Exportador do slide "Personalizado" para PPTX.
// Estratégia: renderiza o slide inteiro como PNG de alta resolução usando
// CustomCanvasReadOnly (mesmo componente do exportPdf.ts) e insere a imagem
// cobrindo todo o slide no PPTX. Elimina captura bloco-a-bloco e todos os
// problemas de contexto React fora da árvore principal.

import type PptxGenJS from "pptxgenjs";
import React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import html2canvas from "html2canvas";
import { CANVAS_W, CANVAS_H, type CustomSlideConfig } from "./customSlide";
import haraldFooterPng from "@/assets/harald-footer-bar.png";
import { CustomCanvasReadOnly } from "@/components/pricing/custom/PresentationMode";

const SLIDE_W_IN = 13.33;
const SLIDE_H_IN = 7.5;
const FOOTER_H_IN = 0.85;

// 2× o canvas → alta resolução sem precisar de pixelRatio extra no html2canvas
const CAPTURE_W = CANVAS_W * 2; // 2666
const CAPTURE_H = CANVAS_H * 2; // 1500

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

// ---------------------------------------------------------------------------
async function renderSlideAsImage(config: CustomSlideConfig): Promise<string> {
  const host = document.createElement("div");
  host.style.cssText = [
    "position:fixed",
    `left:-${CAPTURE_W + 200}px`, "top:0",
    `width:${CAPTURE_W}px`, `height:${CAPTURE_H}px`,
    "background:#FFFFFF", "overflow:hidden", "pointer-events:none",
    "z-index:2147483647",
  ].join(";");
  document.body.appendChild(host);
  const root = createRoot(host);

  try {
    flushSync(() => {
      root.render(
        React.createElement("div", {
          style: { width: CAPTURE_W, height: CAPTURE_H, background: "#FFFFFF", overflow: "hidden" },
        },
          React.createElement("div", {
            style: {
              width: CANVAS_W, height: CANVAS_H,
              transform: `scale(${CAPTURE_W / CANVAS_W})`,
              transformOrigin: "top left",
            },
          },
            React.createElement(CustomCanvasReadOnly, { config }),
          ),
        ),
      );
    });

    // Fontes → frames → dados async
    if ((document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready) {
      await (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready;
    }
    await new Promise((r) => setTimeout(r, 800));
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }

    // Aguarda SVGs com geometria (Recharts precisa de ResizeObserver → render → paint)
    const hasGeom = () => {
      const svgs = host.querySelectorAll("svg");
      for (const svg of svgs) {
        if (svg.querySelector("path[d], rect, circle, polyline, polygon")) return true;
      }
      return svgs.length === 0;
    };
    let tries = 0;
    while (!hasGeom() && tries < 20) {
      await new Promise((r) => setTimeout(r, 100));
      tries++;
    }

    const canvas = await html2canvas(host, {
      scale: 1,
      useCORS: true,
      backgroundColor: "#FFFFFF",
      width: CAPTURE_W,
      height: CAPTURE_H,
      windowWidth: CAPTURE_W,
      windowHeight: CAPTURE_H,
      logging: false,
    });

    return canvas.toDataURL("image/png");
  } finally {
    setTimeout(() => { try { root.unmount(); } catch {} host.remove(); }, 0);
  }
}

// ---------------------------------------------------------------------------
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
      x: 0, y: 0,
      w: SLIDE_W_IN, h: SLIDE_H_IN,
    });
  } catch (err) {
    console.error("[customSlide export] falha ao renderizar slide:", err);
    slide.addText("Erro ao renderizar slide", {
      x: 1, y: 3, w: 11.33, h: 1,
      fontFace: "Calibri", fontSize: 18,
      color: "C8102E", align: "center", valign: "middle",
    });
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
