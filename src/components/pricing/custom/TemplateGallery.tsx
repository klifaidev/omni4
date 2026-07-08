// Galeria visual de templates de apresentação. Modal que abre na tela vazia
// ou pelo botão "Templates" da toolbar.
import { useMemo, useState, Component, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Sparkles, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  SLIDE_TEMPLATES, TEMPLATE_CATEGORIES,
  type TemplateCtx, type TemplateCategory, type SlideTemplate,
} from "@/lib/slideTemplates";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ctx: TemplateCtx;
  onSelect: (template: SlideTemplate) => void;
}

export function TemplateGallery({ open, onOpenChange, ctx, onSelect }: Props) {
  const [category, setCategory] = useState<"Todos" | TemplateCategory>("Todos");

  const filtered = useMemo(
    () => category === "Todos"
      ? SLIDE_TEMPLATES
      : SLIDE_TEMPLATES.filter((t) => t.category === category),
    [category],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[88vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/40">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-4 w-4 text-primary" />
            Comece com um template
          </DialogTitle>
          <DialogDescription>
            Escolha um modelo pronto e personalize. Os períodos são preenchidos automaticamente com os dados disponíveis.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-1.5 px-6 py-3 border-b border-border/40 bg-muted/20">
          {TEMPLATE_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={cn(
                "h-7 rounded-full border px-3 text-xs font-medium transition-colors",
                category === c
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border/60 bg-background hover:bg-muted",
              )}
            >
              {c}
            </button>
          ))}
        </div>

        <ScrollArea className="flex-1 max-h-[calc(88vh-160px)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
            {filtered.length === 0 && (
              <div className="col-span-full flex min-h-[260px] items-center justify-center">
                <div className="max-w-sm rounded-2xl border border-dashed border-border/60 bg-muted/20 p-6 text-center">
                  <Sparkles className="mx-auto mb-3 h-8 w-8 text-muted-foreground/70" />
                  <div className="text-sm font-semibold">Nenhum template encontrado</div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Tente outra categoria ou volte para Todos para ver a biblioteca completa.
                  </p>
                </div>
              </div>
            )}
            {filtered.map((tpl) => (
              <TemplateCard key={tpl.id} template={tpl} ctx={ctx} onSelect={() => {
                onSelect(tpl);
                onOpenChange(false);
              }} />
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// Error boundary for thumbnail rendering (C26)
class ThumbErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-muted/30 text-muted-foreground text-xs gap-1">
          <AlertTriangle className="h-3 w-3" /> Pré-visualização indisponível
        </div>
      );
    }
    return this.props.children;
  }
}

function TemplateCard({ template, ctx, onSelect }: { template: SlideTemplate; ctx: TemplateCtx; onSelect: () => void }) {
  const Thumb = template.thumbnail;

  // C25: Check ctx requirements
  const missing: string[] = [];
  if (template.requires?.includes("months") && ctx.months.length < 2) missing.push("períodos de pricing");
  if (template.requires?.includes("budget") && ctx.budgetMonths.length === 0) missing.push("dados de budget");
  const disabled = missing.length > 0;

  return (
    <div
      className={cn(
        "group relative rounded-xl border border-border/60 bg-card p-3 transition-all",
        disabled
          ? "opacity-60 cursor-not-allowed"
          : "hover:border-primary hover:shadow-[0_8px_24px_-12px_hsl(var(--primary)/0.5)]",
      )}
    >
      <div className="relative aspect-video rounded-lg overflow-hidden border border-border/40 bg-muted/30">
        <ThumbErrorBoundary>
          <Thumb className="w-full h-full" />
        </ThumbErrorBoundary>
        {disabled && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Badge variant="destructive" className="text-[10px] gap-1">
              <AlertTriangle className="h-2.5 w-2.5" /> Requer dados
            </Badge>
          </div>
        )}
      </div>
      <div className="mt-3 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold leading-snug">{template.name}</h3>
          <Badge variant="outline" className="shrink-0 h-5 text-[10px] font-normal">
            {template.category}
          </Badge>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">
          {template.description}
        </p>
      </div>
      <div className={cn(
        "absolute inset-0 flex items-end justify-center p-4 transition-opacity bg-gradient-to-t from-card via-card/80 to-transparent rounded-xl",
        disabled ? "opacity-0 pointer-events-none" : "opacity-0 group-hover:opacity-100",
      )}>
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => {
            if (disabled) {
              toast.warning(`Este template requer: ${missing.join(" e ")}.`);
              return;
            }
            onSelect();
          }}
          className="shadow-md"
        >
          Usar este template
        </Button>
      </div>
    </div>
  );
}
