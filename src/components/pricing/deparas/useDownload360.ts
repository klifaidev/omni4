import { toast } from "sonner";
import { exportDePara360Xlsx } from "@/lib/exportDeparaXlsx";
import { useBudget } from "@/store/budget";
import { usePricing } from "@/store/pricing";

/** Baixa o De/Para 360: todas as abas, com as correções feitas no app. */
export function useDownload360(pendingCount: number) {
  const realRows = usePricing((s) => s.rows);
  const budgetRows = useBudget((s) => s.rows);
  return () => {
    try {
      exportDePara360Xlsx([realRows, budgetRows]);
      if (pendingCount > 0) {
        toast.warning("De/Para 360 baixado com pendências em aberto", {
          description: `${pendingCount} valor${pendingCount === 1 ? "" : "es"} das bases ainda sem De/Para não entra${pendingCount === 1 ? "" : "m"} no arquivo. Corrija em Pendências e baixe de novo.`,
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
