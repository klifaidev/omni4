import { useEffect } from "react";
import { Sparkles, Layers, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePricing } from "@/store/pricing";

type Mode = "all" | "Inovação" | "Regular";

/**
 * Toggle tri-estado para o filtro Inovação / Regular.
 * Quando "Inovação" está ativo, aplica `data-mode="inovacao"` no <html>,
 * o que ativa um tema alternativo (accent violeta-magenta + aurora de fundo)
 * sem precisar mexer em componentes individuais — tudo via CSS tokens.
 */
export function InnovationToggle() {
  const filters = usePricing((s) => s.filters);
  const setFilter = usePricing((s) => s.setFilter);

  const current: Mode =
    filters.inovacao?.[0] === "Inovação"
      ? "Inovação"
      : filters.inovacao?.[0] === "Regular"
        ? "Regular"
        : "all";

  // Aplica/remove o tema "Inovação" no <html>
  useEffect(() => {
    const root = document.documentElement;
    if (current === "Inovação") {
      root.setAttribute("data-mode", "inovacao");
    } else {
      root.removeAttribute("data-mode");
    }
    return () => {
      root.removeAttribute("data-mode");
    };
  }, [current]);

  const apply = (m: Mode) => {
    if (m === "all") setFilter("inovacao", []);
    else setFilter("inovacao", [m]);
  };

  const items: { value: Mode; label: string; icon: React.ElementType }[] = [
    { value: "all", label: "Todos", icon: Layers },
    { value: "Inovação", label: "Inovação", icon: Sparkles },
    { value: "Regular", label: "Regular", icon: Package },
  ];

  return (
    <div
      className={cn(
        "relative inline-flex items-center gap-0.5 rounded-full border p-0.5 backdrop-blur-xl transition-all duration-500",
        current === "Inovação"
          ? "border-accent/50 bg-accent/10 shadow-[0_0_24px_-4px_hsl(var(--accent)/0.45)]"
          : "border-border/60 bg-secondary/40",
      )}
      role="tablist"
      aria-label="Modo de visualização: Inovação ou Regular"
    >
      {items.map((it) => {
        const active = current === it.value;
        const Icon = it.icon;
        const isInov = it.value === "Inovação";
        return (
          <button
            key={it.value}
            role="tab"
            aria-selected={active}
            onClick={() => apply(it.value)}
            className={cn(
              "group relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-300",
              active
                ? isInov
                  ? "bg-gradient-to-r from-accent via-accent to-primary text-accent-foreground shadow-[0_4px_16px_-4px_hsl(var(--accent)/0.6)]"
                  : "bg-foreground/10 text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon
              className="h-3.5 w-3.5 transition-transform duration-300"
            />
            <span>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}
