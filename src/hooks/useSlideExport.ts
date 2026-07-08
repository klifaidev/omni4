import { useCallback, useState } from "react";
import { toast } from "sonner";

import { exportSlideFlow } from "@/lib/exportPpt";
import { exportToPdf } from "@/lib/exportPdf";
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
  preflightErrors,
  pricingRows,
  budgetRows,
  metric,
}: {
  items: SlideItem[];
  readyAll: boolean;
  preflightErrors: number;
  pricingRows: PricingRow[];
  budgetRows: BudgetRow[];
  metric: Metric;
}) {
  const [exporting, setExporting] = useState(false);
  const [fileName, setFileName] = useState("apresentacao-pricing.pptx");

  const canExport = useCallback(() => {
    if (items.length === 0) return false;
    if (!readyAll) {
      toast.error("Existem slides incompletos. Configure-os antes de exportar.");
      return false;
    }
    if (preflightErrors > 0) {
      toast.error("O preflight encontrou erro critico antes da exportacao.");
      return false;
    }
    return true;
  }, [items.length, preflightErrors, readyAll]);

  const handleExportPdf = useCallback(async () => {
    if (!canExport()) return;
    setExporting(true);
    try {
      await exportToPdf(items, normalizeExportFileName(fileName, "pdf"));
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Falha ao gerar PDF.");
    } finally {
      setExporting(false);
    }
  }, [canExport, fileName, items]);

  const handleExport = useCallback(async () => {
    if (!canExport()) return;
    setExporting(true);
    try {
      const flow = items.map((i) => itemToFlow(i, { pricingRows, budgetRows, metric }));
      const bridgeIdx = items.findIndex((i) => i.kind === "bridge_pvm");
      await exportSlideFlow(flow, normalizeExportFileName(fileName, "pptx"), bridgeIdx >= 0 ? bridgeIdx + 1 : undefined);
      toast.success(`PPTX gerado com ${items.length} slide(s).`);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Falha ao gerar PPTX.");
    } finally {
      setExporting(false);
    }
  }, [budgetRows, canExport, fileName, items, metric, pricingRows]);

  return {
    exporting,
    fileName,
    setFileName,
    handleExport,
    handleExportPdf,
  };
}
