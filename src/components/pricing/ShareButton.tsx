import { useLocation } from "react-router-dom";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePricing } from "@/store/pricing";
import { buildShareUrl } from "@/lib/shareUrl";
import { PAGE_LABELS, NON_HISTORY_PATHS } from "@/lib/pageMeta";

export function ShareButton() {
  const { pathname } = useLocation();
  const rows = usePricing((s) => s.rows);
  const filters = usePricing((s) => s.filters);
  const selectedPeriods = usePricing((s) => s.selectedPeriods);

  const eligible = !!PAGE_LABELS[pathname] && !NON_HISTORY_PATHS.has(pathname);
  if (!eligible || rows.length === 0) return null;

  const handleShare = async () => {
    const result = buildShareUrl(pathname, filters, selectedPeriods);
    if (!result.ok) {
      toast.error(result.error ?? "Não foi possível gerar o link.");
      return;
    }
    try {
      await navigator.clipboard.writeText(result.url);
      toast.success("Link copiado! Cole em qualquer lugar para compartilhar esta análise.");
    } catch {
      toast.error("Não foi possível copiar para a área de transferência.");
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9 text-muted-foreground hover:text-primary"
      onClick={handleShare}
      title="Compartilhar análise"
      aria-label="Compartilhar análise"
    >
      <Share2 className="h-4 w-4" />
    </Button>
  );
}
