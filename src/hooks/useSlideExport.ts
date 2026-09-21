import { useCallback, useState } from "react";
import { toast } from "sonner";

import { itemToFlow, type SlideItem } from "@/lib/slidesFlow";
import type { Metric, PricingRow } from "@/lib/types";
import type { BudgetRow } from "@/lib/budget";

function normalizeExportFileName(name: string, extension: "pptx" | "pdf"): string {
  const trimmed = name.trim() || "apresentacao-pricing";
  const base = trimmed.replace(/\.(pptx?|pdf)$/i, "");
  return `${base}.${extension}`;
}

export function useSlideExport({
  items,
  readyAll,
  pricingRows,
  budgetRows,
  metric,
}: {
  items: SlideItem[];
  readyAll: boolean;
  pricingRows: PricingRow[];
  budgetRows: BudgetRow[];
  metric: Metric;
}) {
  const [exporting, setExporting] = useState(false);
  const [fileName, setFileName] = useState("apresentacao-pricing.pptx");

  // Slides marcados como ocultos na esteira não entram em nenhum export —
  // só ficam de fora da apresentação/arquivo gerado, continuam editáveis.
  const visibleItems = items.filter((i) => !i.hidden);

  const canExport = useCallback(() => {
    if (visibleItems.length === 0) return false;
    if (!readyAll) {
      toast.error("Existem slides incompletos. Configure-os antes de exportar.");
      return false;
    }
    return true;
  }, [visibleItems.length, readyAll]);

  const handleExportPdf = useCallback(async () => {
    if (!canExport()) return;
    setExporting(true);
    try {
      // jspdf (~470KB) só baixa quando o usuário clica em exportar PDF —
      // import estático aqui fazia essa biblioteca cair no caminho de
      // carregamento da página Slides inteira, mesmo pra quem nunca exporta.
      const { exportToPdf } = await import("@/lib/exportPdf");
      await exportToPdf(visibleItems, normalizeExportFileName(fileName, "pdf"));
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Falha ao gerar PDF.");
    } finally {
      setExporting(false);
    }
  }, [canExport, fileName, visibleItems]);

  const handleExport = useCallback(async () => {
    if (!canExport()) return;
    setExporting(true);
    try {
      const flow = visibleItems.map((i) => itemToFlow(i, { pricingRows, budgetRows, metric }));
      const bridgeIdx = visibleItems.findIndex((i) => i.kind === "bridge_pvm");
      // pptxgenjs + jszip (~520KB) mesma lógica do PDF acima: só baixa
      // quando o usuário realmente exporta.
      const { exportSlideFlow } = await import("@/lib/exportPpt");
      const { failedSlides } = await exportSlideFlow(
        flow, normalizeExportFileName(fileName, "pptx"), bridgeIdx >= 0 ? bridgeIdx + 1 : undefined,
      );
      if (failedSlides.length > 0) {
        toast.warning(
          `PPTX gerado, mas ${failedSlides.length} slide(s) não renderizaram a tempo: ${failedSlides.join(", ")}. Abra o arquivo e revise antes de apresentar.`,
        );
      } else {
        toast.success(`PPTX gerado com ${visibleItems.length} slide(s).`);
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Falha ao gerar PPTX.");
    } finally {
      setExporting(false);
    }
  }, [budgetRows, canExport, fileName, visibleItems, metric, pricingRows]);

  return {
    exporting,
    fileName,
    setFileName,
    handleExport,
    handleExportPdf,
  };
}
