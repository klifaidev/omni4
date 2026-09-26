// Galeria visual de templates de apresentação. Modal que abre na tela vazia
// ou pelo botão "Templates" da toolbar.
import { useEffect, useMemo, useRef, useState, Component, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Sparkles, AlertTriangle, Search, Clock, LayoutTemplate } from "lucide-react";
import { toast } from "sonner";
import { ScaledPreview } from "@/components/pricing/SlidePreview";
import {
  SLIDE_TEMPLATES, TEMPLATE_CATEGORIES,
  type TemplateCtx, type TemplateCategory, type SlideTemplate,
} from "@/lib/slideTemplates";

const RECENT_TEMPLATES_KEY = "omni4.slides.recentTemplates";

function readRecentTemplates(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_TEMPLATES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
}

function rememberTemplateUse(id: string) {
  const next = [id, ...readRecentTemplates().filter((item) => item !== id)].slice(0, 6);
  try {
    localStorage.setItem(RECENT_TEMPLATES_KEY, JSON.stringify(next));
  } catch {
    // Recents are a convenience only.
  }
  return next;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ctx: TemplateCtx;
  onSelect: (template: SlideTemplate) => void;
}

export function TemplateGallery({ open, onOpenChange, ctx, onSelect }: Props) {
  const [category, setCategory] = useState<"Todos" | TemplateCategory>("Todos");
  const [query, setQuery] = useState("");
  const [recentIds, setRecentIds] = useState<string[]>(() => readRecentTemplates());
  const normalizedQuery = query.trim().toLowerCase();

  const filtered = useMemo(
    () => SLIDE_TEMPLATES.filter((t) => {
      const matchesCategory = category === "Todos" || t.category === category;
      const haystack = `${t.name} ${t.description} ${t.category}`.toLowerCase();
      const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    }),
    [category, normalizedQuery],
  );
  const recentTemplates = useMemo(
    () => recentIds
      .map((id) => SLIDE_TEMPLATES.find((tpl) => tpl.id === id))
      .filter((tpl): tpl is SlideTemplate => Boolean(tpl)),
    [recentIds],
  );
  const applyTemplate = (tpl: SlideTemplate) => {
    setRecentIds(rememberTemplateUse(tpl.id));
    onSelect(tpl);
    onOpenChange(false);
  };
  const blankTemplate = SLIDE_TEMPLATES.find((tpl) => tpl.id === "slide-unico") ?? SLIDE_TEMPLATES.find((tpl) => tpl.category === "Deck em branco");

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

        <div className="space-y-3 border-b border-border/40 bg-muted/20 px-6 py-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar templates por análise, deck ou conteúdo..."
              className="h-10 bg-background pl-9"
            />
          </div>
          <Button
            className="h-12 w-full justify-start gap-3 rounded-lg text-left shadow-[0_10px_30px_-18px_hsl(var(--primary)/0.9)]"
            onClick={() => blankTemplate && applyTemplate(blankTemplate)}
            disabled={!blankTemplate}
          >
            <LayoutTemplate className="h-4 w-4" />
            <span className="flex flex-col items-start leading-tight">
              <span className="text-sm font-semibold">Slide em branco</span>
              <span className="text-[11px] font-normal opacity-80">Comece do zero com um canvas limpo.</span>
            </span>
          </Button>
          <div className="flex flex-wrap items-center gap-1.5">
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
        </div>

        <ScrollArea className="flex-1 max-h-[calc(88vh-160px)]">
          <div className="space-y-5 p-6">
            {recentTemplates.length > 0 && !normalizedQuery && category === "Todos" && (
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Clock className="h-4 w-4 text-primary" />
                  Usados recentemente
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {recentTemplates.map((tpl) => (
                    <TemplateCard key={tpl.id} template={tpl} ctx={ctx} onSelect={() => applyTemplate(tpl)} />
                  ))}
                </div>
              </section>
            )}
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
              <TemplateCard key={tpl.id} template={tpl} ctx={ctx} onSelect={() => applyTemplate(tpl)} />
            ))}
            </section>
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

const LIVE_PREVIEW_MAX_SLIDES = 4;

// Prévia real do template (só no hover): os slides que ele vai criar, montados
// com a base carregada — em vez do desenho esquemático, a pessoa vê os números
// dela antes de aplicar. Renderiza sob demanda para abrir a galeria continuar leve.
function TemplateLivePreview({ template, ctx, fallback }: { template: SlideTemplate; ctx: TemplateCtx; fallback: ReactNode }) {
  const slides = useMemo(() => template.build(ctx).slice(0, LIVE_PREVIEW_MAX_SLIDES), [template, ctx]);
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    setBoxW(Math.floor(el.getBoundingClientRect().width));
  }, []);
  if (slides.length === 0) return <>{fallback}</>;
  const single = slides.length === 1;
  const gap = 2;
  const slideW = single ? boxW : Math.floor((boxW - gap) / 2);
  return (
    <div
      ref={boxRef}
      className={cn("grid h-full w-full content-center bg-slate-200", single ? "grid-cols-1" : "grid-cols-2")}
      style={{ gap }}
    >
      {slideW > 0 && slides.map((slide) => (
        <div key={slide.id} className="overflow-hidden bg-white">
          <ScaledPreview item={slide} targetWidth={slideW} staggerMount />
        </div>
      ))}
    </div>
  );
}

function TemplateCard({ template, ctx, onSelect }: { template: SlideTemplate; ctx: TemplateCtx; onSelect: () => void }) {
  const Thumb = template.thumbnail;
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewTimer = useRef<number | null>(null);

  // C25: Check ctx requirements
  const missing: string[] = [];
  if (template.requires?.includes("months") && ctx.months.length < 2) missing.push("períodos de pricing");
  if (template.requires?.includes("budget") && ctx.budgetMonths.length === 0) missing.push("dados de budget");
  const disabled = missing.length > 0;

  return (
    <div
      onMouseEnter={() => {
        previewTimer.current = window.setTimeout(() => setPreviewOpen(true), 180);
      }}
      onMouseLeave={() => {
        if (previewTimer.current) window.clearTimeout(previewTimer.current);
        previewTimer.current = null;
        setPreviewOpen(false);
      }}
      className={cn(
        "group relative rounded-xl border border-border/60 bg-card p-3 transition-all",
        disabled
          ? "opacity-60 cursor-not-allowed"
          : "hover:border-primary hover:shadow-[0_8px_24px_-12px_hsl(var(--primary)/0.5)]",
      )}
    >
      <div className="relative aspect-video rounded-lg overflow-hidden border border-border/40 bg-muted/30">
        <ThumbErrorBoundary>
          {/* No hover, o desenho esquemático dá lugar aos slides reais do
              template com a base carregada — no próprio card (uma janela
              flutuante ficava cortada pela área de rolagem da galeria). */}
          {previewOpen && !disabled
            ? <TemplateLivePreview template={template} ctx={ctx} fallback={<Thumb className="w-full h-full" />} />
            : <Thumb className="w-full h-full" />}
        </ThumbErrorBoundary>
        {previewOpen && !disabled && (
          <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-background/85 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground shadow-sm">
            Prévia com os seus dados
          </span>
        )}
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
