import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { SlidePreflightIssue } from "@/lib/slidesPreflight";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";

export function PreflightPopover({
  issues,
  errors,
  warnings,
  onSelectSlide,
}: {
  issues: SlidePreflightIssue[];
  errors: number;
  warnings: number;
  onSelectSlide?: (slideId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const status = errors > 0 ? "error" : warnings > 0 ? "warning" : "ok";
  const label = status === "ok" ? "Pronto" : errors > 0 ? `${errors} erro` : `${warnings} alerta`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={status === "ok" ? "outline" : "ghost"}
          size="sm"
          className={cn(
            "relative h-8 gap-1.5",
            status === "error" && "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15",
            status === "warning" && "border-amber-500/40 bg-amber-500/10 text-amber-600 hover:bg-amber-500/15 dark:text-amber-300",
          )}
          title="Preflight de exportacao"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Preflight
          <Badge
            variant={status === "ok" ? "secondary" : "outline"}
            className="ml-0.5 h-4 px-1.5 text-[9px]"
          >
            {label}
          </Badge>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-3">
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <ShieldCheck className={cn(
              "mt-0.5 h-4 w-4",
              status === "ok" && "text-emerald-500",
              status === "warning" && "text-amber-500",
              status === "error" && "text-destructive",
            )} />
            <div>
              <div className="text-sm font-semibold">Preflight de exportacao</div>
              <p className="text-xs text-muted-foreground">
                Checagem rapida para reduzir risco de corte, perda de imagem ou bloco incompleto no PPTX.
              </p>
            </div>
          </div>

          {issues.length === 0 ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300">
              Nenhum risco encontrado na esteira atual.
            </div>
          ) : (
            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {issues.map((item, idx) => (
                <button
                  type="button"
                  key={`${item.slideId}-${item.blockId ?? "slide"}-${idx}`}
                  onClick={() => {
                    onSelectSlide?.(item.slideId);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full rounded-lg border p-2.5 text-left text-xs transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    item.severity === "error" && "border-destructive/30 bg-destructive/10",
                    item.severity === "warning" && "border-warning/30 bg-warning/10",
                    item.severity === "info" && "border-border/60 bg-muted/30",
                  )}
                  aria-label={`Ir para slide ${item.slideNumber}: ${item.title}`}
                >
                  <div className="flex items-center gap-2 font-semibold">
                    <span className="rounded bg-background/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      Slide {item.slideNumber}
                    </span>
                    <span>{item.title}</span>
                  </div>
                  <div className="mt-1 text-muted-foreground">{item.detail}</div>
                </button>
              ))}
            </div>
          )}

          {errors > 0 && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
              Corrija os erros criticos para liberar a exportacao.
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
