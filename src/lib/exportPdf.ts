// PDF export — captures each slide off-screen via html2canvas and assembles
// a landscape PDF using jsPDF. Uses the existing SlidePreview / CustomCanvasReadOnly
// renderers so the output matches what the user sees in the editor.

import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import React from "react";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import type { SlideItem } from "@/lib/slidesFlow";
import { CANVAS_W, CANVAS_H } from "@/lib/customSlide";
import { ScaledPreview } from "@/components/pricing/SlidePreview";
import { CustomCanvasReadOnly } from "@/components/pricing/custom/PresentationMode";

const SLIDE_W = 1333;
const SLIDE_H = 750;

async function renderSlideToCanvas(item: SlideItem): Promise<HTMLCanvasElement> {
  // Off-screen host
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-100000px";
  host.style.top = "0";
  host.style.width = `${SLIDE_W}px`;
  host.style.height = `${SLIDE_H}px`;
  host.style.background = "#FFFFFF";
  host.style.pointerEvents = "none";
  document.body.appendChild(host);

  const root = createRoot(host);

  try {
    const node =
      item.kind === "custom"
        ? React.createElement(
            "div",
            { style: { width: SLIDE_W, height: SLIDE_H, background: "#fff", overflow: "hidden" } },
            React.createElement(
              "div",
              {
                style: {
                  width: CANVAS_W,
                  height: CANVAS_H,
                  transform: `scale(${SLIDE_W / CANVAS_W})`,
                  transformOrigin: "top left",
                },
              },
              React.createElement(CustomCanvasReadOnly, { config: item.config }),
            ),
          )
        : React.createElement(
            "div",
            { style: { width: SLIDE_W, height: SLIDE_H, background: "#fff", overflow: "hidden" } },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            React.createElement(ScaledPreview, { item: item as any, targetWidth: SLIDE_W }),
          );

    root.render(node);

    // Wait for Recharts / images / fonts to settle.
    await new Promise((r) => setTimeout(r, 350));

    const canvas = await html2canvas(host, {
      scale: 3,
      useCORS: true,
      backgroundColor: "#FFFFFF",
      width: SLIDE_W,
      height: SLIDE_H,
      windowWidth: SLIDE_W,
      windowHeight: SLIDE_H,
      logging: false,
    });
    return canvas;
  } finally {
    setTimeout(() => {
      try { root.unmount(); } catch { /* noop */ }
      host.remove();
    }, 0);
  }
}

export async function exportToPdf(slideItems: SlideItem[], fileName: string): Promise<void> {
  if (slideItems.length === 0) return;

  const safeName = fileName.replace(/\.(pptx?|pdf)$/i, "") + ".pdf";
  // A4 landscape ~ 297×210mm; we use 16:9 page sized to match canvas exactly.
  // jsPDF accepts custom format. Use mm with 16:9 ratio: 297mm × 167.06mm.
  const pageW = 297;
  const pageH = (SLIDE_H / SLIDE_W) * pageW;

  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: [pageW, pageH] });

  const progressId = "export-pdf-progress";
  toast.loading(`Gerando slide 1 de ${slideItems.length}...`, { id: progressId });

  let failures = 0;

  for (let i = 0; i < slideItems.length; i++) {
    toast.loading(`Gerando slide ${i + 1} de ${slideItems.length}...`, { id: progressId });
    try {
      const canvas = await renderSlideToCanvas(slideItems[i]);
      const imgData = canvas.toDataURL("image/png");
      if (i > 0) pdf.addPage([pageW, pageH], "landscape");
      pdf.addImage(imgData, "PNG", 0, 0, pageW, pageH, undefined, "SLOW");
    } catch (err) {
      console.error("PDF slide capture failed", i, err);
      failures++;
      if (i > 0) pdf.addPage([pageW, pageH], "landscape");
      pdf.setFontSize(14);
      pdf.text(`Slide ${i + 1} ignorado — falha na captura.`, pageW / 2, pageH / 2, { align: "center" });
    }
  }

  pdf.save(safeName);

  if (failures > 0) {
    toast.warning(`PDF gerado com ${failures} slide(s) ignorado(s) por falha na captura.`, { id: progressId });
  } else {
    toast.success(`PDF gerado com ${slideItems.length} slide(s).`, { id: progressId });
  }
}
