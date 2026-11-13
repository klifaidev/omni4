import { toast } from "sonner";
import { exportDePara360Xlsx } from "@/lib/exportDeparaXlsx";
import { useBudget } from "@/store/budget";
import { usePricing } from "@/store/pricing";

/** Baixa o De/Para 360: todas as abas, com as correções feitas no app. */
export function useDownload360(pendingCount: number) {
  const realRows = usePricing((s) => s.rows);
  const budgetRows = useBudget((s) => s.rows);
  return async () => {
    try {
      await exportDePara360Xlsx([realRows, budgetRows]);
      if (pendingCount > 0) {
        toast.warning("De/Para 360 baixado com pendências em aberto", {
          description: `${pendingCount} pendência${pendingCount === 1 ? "" : "s"} ainda em aberto. SKUs sem De/Para saem com o PARA em branco; os demais De/Paras só levam o que já está mapeado.`,
          duration: 8000,
        });
      } else {
        toast.success("De/Para 360 baixado, com todas as correções feitas no app.");
      }
    } catch {
      toast.error("Falha ao gerar o De/Para 360.");
    }
  };
}
