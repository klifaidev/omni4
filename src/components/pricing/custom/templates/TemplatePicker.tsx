// New 3-column template picker modal.

import { useEffect, useMemo, useState } from "react";
import { Search, X, Trash2, Layers } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  TEMPLATE_REGISTRY, CATEGORY_LABELS, templateToSlideConfig, templateToSlideConfigs,
  type SlideTemplate, type TemplateCategory,
} from "./templateRegistry";
import { TemplateThumbnail } from "./Thumbnail";
import type { CustomSlideConfig } from "@/lib/customSlide";
import {
  loadUserTemplates, deleteUserTemplate, applyTemplate as applyUserTpl,
  type CustomTemplate,
} from "@/lib/customTemplates";

const LAST_CAT_KEY = "harald.templatePicker.lastCategory";

export type DeckApplyMode = "replace" | "after";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onApply: (config: CustomSlideConfig) => void;
  /** Optional: when provided, deck templates use this instead of falling back to slide 1. */
  onApplyDeck?: (configs: CustomSlideConfig[], mode: DeckApplyMode, name: string) => void;
}

type AnyTpl =
  | { kind: "builtin"; tpl: SlideTemplate }
  | { kind: "user"; tpl: CustomTemplate };

export function TemplatePicker({ open, onOpenChange, onApply, onApplyDeck }: Props) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [category, setCategory] = useState<TemplateCategory>(() => {
    if (typeof localStorage === "undefined") return "todos";
    return (localStorage.getItem(LAST_CAT_KEY) as TemplateCategory) ?? "todos";
  });
  const [userTpls, setUserTpls] = useState<CustomTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deckTpl, setDeckTpl] = useState<SlideTemplate | null>(null);

  // Load user templates whenever opened
  useEffect(() => {
    if (open) setUserTpls(loadUserTemplates());
  }, [open]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim().toLowerCase()), 150);
    return () => clearTimeout(t);
  }, [search]);

  // Persist category
  useEffect(() => {
    if (typeof localStorage !== "undefined") localStorage.setItem(LAST_CAT_KEY, category);
  }, [category]);

  const all: AnyTpl[] = useMemo(() => [
    ...TEMPLATE_REGISTRY.map((tpl) => ({ kind: "builtin" as const, tpl })),
    ...userTpls.map((tpl) => ({ kind: "user" as const, tpl })),
  ], [userTpls]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { todos: all.length, "meus-modelos": userTpls.length };
    for (const t of TEMPLATE_REGISTRY) c[t.category] = (c[t.category] ?? 0) + 1;
    return c;
  }, [all.length, userTpls.length]);

  const visibleCategories: TemplateCategory[] = [
    "todos", "visao-geral", "analise-resultado", "narrativa-executiva", "causa-efeito",
    "comparativo", "detalhamento", "deck-completo", "meus-modelos",
  ];

  const filtered = useMemo(() => {
    return all.filter((it) => {
      if (category === "todos") {
        // include all
      } else if (category === "meus-modelos") {
        if (it.kind !== "user") return false;
      } else {
        if (it.kind !== "builtin" || it.tpl.category !== category) return false;
      }
      if (debounced) {
        const hay = it.kind === "builtin"
          ? `${it.tpl.name} ${it.tpl.description} ${it.tpl.tags.join(" ")}`
          : `${it.tpl.name} ${it.tpl.description ?? ""}`;
        if (!hay.toLowerCase().includes(debounced)) return false;
      }
      return true;
    });
  }, [all, category, debounced]);

  // Auto-select first visible
  useEffect(() => {
    if (!open) return;
    const first = filtered[0];
    const firstId = first ? itemId(first) : null;
    if (!selectedId || !filtered.some((it) => itemId(it) === selectedId)) {
      setSelectedId(firstId);
    }
  }, [filtered, open, selectedId]);

  const selected = filtered.find((it) => itemId(it) === selectedId) ?? filtered[0] ?? null;

  function handleApply(it: AnyTpl) {
    if (it.kind === "builtin" && it.tpl.isDeck && onApplyDeck) {
      setDeckTpl(it.tpl);
      return;
    }
    const cfg = it.kind === "builtin"
      ? templateToSlideConfig(it.tpl)
      : applyUserTpl(it.tpl);
    onApply(cfg);
    onOpenChange(false);
  }

  function applyDeck(mode: DeckApplyMode) {
    if (!deckTpl || !onApplyDeck) return;
    const configs = templateToSlideConfigs(deckTpl);
    onApplyDeck(configs, mode, deckTpl.name);
    setDeckTpl(null);
    onOpenChange(false);
  }

  function handleDeleteUser(id: string) {
    deleteUserTemplate(id);
    setUserTpls(loadUserTemplates());
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[860px] gap-0 p-0 overflow-hidden"
        style={{ width: 860 }}
      >
        <DialogTitle className="sr-only">Aplicar modelo</DialogTitle>
        <div className="flex h-[600px]">
          {/* Left rail */}
          <aside className="flex w-[220px] shrink-0 flex-col border-r bg-muted/30 p-3">
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar modelo..."
                className="h-8 pl-7 text-[13px]"
                autoFocus
              />
            </div>
            <nav className="flex flex-col gap-0.5 overflow-y-auto pr-1">
              {visibleCategories.map((cat) => {
                const count = counts[cat] ?? 0;
                const active = category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={cn(
                      "flex h-8 items-center justify-between rounded-md px-2.5 text-left text-[13px] transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground hover:bg-secondary",
                    )}
                  >
                    <span className="truncate">{CATEGORY_LABELS[cat]}</span>
                    <span className={cn(
                      "ml-2 text-[11px] tabular-nums",
                      active ? "text-primary-foreground/80" : "text-muted-foreground",
                    )}>{count}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Center grid */}
          <div className="flex w-[360px] shrink-0 flex-col border-r">
            <div className="border-b px-4 py-2.5 text-[13px] font-medium">
              {CATEGORY_LABELS[category]}
              <span className="ml-2 text-muted-foreground">{filtered.length}</span>
            </div>
            <div className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto p-3 content-start">
              {filtered.length === 0 && (
                <div className="col-span-2 flex h-full items-center justify-center py-12">
                  <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 p-5 text-center">
                    <Search className="mx-auto mb-2 h-7 w-7 text-muted-foreground/70" />
                    <div className="text-sm font-semibold text-foreground">Nenhum modelo encontrado</div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Ajuste a busca ou escolha outra categoria.
                    </p>
                  </div>
                </div>
              )}
              {filtered.map((it) => {
                const id = itemId(it);
                const name = it.tpl.name;
                const blocks = it.kind === "builtin"
                  ? it.tpl.slides[0].blocks
                  : (it.tpl.config.blocks as never);
                const active = id === selectedId;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSelectedId(id)}
                    onDoubleClick={() => handleApply(it)}
                    className={cn(
                      "group flex flex-col gap-1.5 rounded-md p-1.5 text-left transition-all",
                      active
                        ? "bg-primary/5 ring-2 ring-primary"
                        : "ring-1 ring-border/40 hover:shadow-md hover:ring-border",
                    )}
                  >
                    <div className="overflow-hidden rounded-sm bg-background">
                      <TemplateThumbnail blocks={blocks} width={160} height={100} />
                    </div>
                    <div className="px-1 text-[12px] font-medium leading-tight line-clamp-2">{name}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right preview */}
          <section className="flex flex-1 flex-col p-4">
            {selected ? (
              <>
                <div className="mb-3 overflow-hidden rounded-md border bg-background">
                  <TemplateThumbnail
                    blocks={selected.kind === "builtin"
                      ? selected.tpl.slides[0].blocks
                      : (selected.tpl.config.blocks as never)}
                    width={256} height={144}
                  />
                </div>
                <div className="flex items-center gap-2 text-[15px] font-medium leading-tight">
                  {selected.tpl.name}
                  {selected.kind === "builtin" && selected.tpl.isDeck && (
                    <Badge variant="default" className="h-5 gap-1 rounded-full px-2 text-[10px] font-normal">
                      <Layers className="h-3 w-3" /> Deck · {selected.tpl.slides.length} slides
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-[12px] leading-snug text-muted-foreground line-clamp-3">
                  {selected.kind === "builtin"
                    ? selected.tpl.description
                    : (selected.tpl.description ?? `${selected.tpl.config.blocks.length} blocos`)}
                </p>
                {selected.kind === "builtin" && selected.tpl.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {selected.tpl.tags.map((t) => (
                      <Badge key={t} variant="secondary" className="h-5 rounded-full px-2 text-[10px] font-normal">
                        {t}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="mt-auto flex flex-col gap-2 pt-3">
                  <Button
                    className="h-10 w-full"
                    onClick={() => handleApply(selected)}
                  >
                    Aplicar modelo
                  </Button>
                  {selected.kind === "user" && (
                    <Button
                      variant="ghost" size="sm"
                      className="h-8 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteUser(selected.tpl.id)}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remover modelo
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
                Selecione um modelo
              </div>
            )}
          </section>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="absolute right-3 top-3 rounded-sm p-1 text-muted-foreground hover:bg-secondary"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
      </DialogContent>

      {/* Deck confirmation */}
      <AlertDialog open={!!deckTpl} onOpenChange={(v) => { if (!v) setDeckTpl(null); }}>
        <AlertDialogContent className="max-w-[420px]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Deck com {deckTpl?.slides.length ?? 0} slides
            </AlertDialogTitle>
            <AlertDialogDescription>
              Este modelo cria {deckTpl?.slides.length ?? 0} slides prontos para
              edição. Como deseja aplicar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <Button onClick={() => applyDeck("after")}>
              Adicionar após slide atual
            </Button>
            <Button variant="outline" onClick={() => applyDeck("replace")}>
              Substituir slide atual
            </Button>
            <Button variant="ghost" onClick={() => setDeckTpl(null)}>
              Cancelar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function itemId(it: AnyTpl): string {
  return it.kind === "builtin" ? `b:${it.tpl.id}` : `u:${it.tpl.id}`;
}
