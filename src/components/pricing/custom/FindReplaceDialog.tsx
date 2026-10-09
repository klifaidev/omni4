// Localizar e substituir no deck inteiro (Ctrl+F / Ctrl+H no editor).
// O slide aberto muda pelo histórico do editor (Ctrl+Z desfaz); os outros
// slides mudam direto na esteira, com "Desfazer" no aviso.

import { useMemo, useState } from "react";
import { Lock, Search } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useSlidesFlow } from "@/store/slidesFlow";
import { findInDeck, replaceInDeck, type DeckMatch } from "@/lib/deckFindReplace";
import type { CustomBlock } from "@/lib/customSlide";
import type { SlideItem } from "@/lib/slidesFlow";
import { strings } from "@/lib/i18n";

const t = strings.slides.editor.findReplace;

type BlockPatch = { id: string; patch: Partial<CustomBlock> };

/** Trecho do texto com a ocorrência destacada. */
function Snippet({ text, query, matchCase }: { text: string; query: string; matchCase: boolean }) {
  const hay = matchCase ? text : text.toLowerCase();
  const needle = matchCase ? query : query.toLowerCase();
  const at = hay.indexOf(needle);
  if (at < 0) return <span>{text}</span>;
  const start = Math.max(0, at - 24);
  const end = Math.min(text.length, at + query.length + 40);
  return (
    <span>
      {start > 0 && "…"}
      {text.slice(start, at)}
      <mark className="rounded-sm bg-amber-300/70 px-0.5 text-foreground dark:bg-amber-400/40">{text.slice(at, at + query.length)}</mark>
      {text.slice(at + query.length, end)}
      {end < text.length && "…"}
    </span>
  );
}

export function FindReplaceDialog({
  open, onOpenChange, currentItemId, onApplyCurrent, onUndoCurrent, onGoTo, flushPending, readOnly,
}: {
  open: boolean;
  /** Grava na esteira o que o editor ainda segura (gravação com atraso). */
  flushPending: () => void;
  onOpenChange: (v: boolean) => void;
  /** Slide aberto no editor — muda pelo histórico do editor. */
  currentItemId?: string;
  onApplyCurrent: (patches: BlockPatch[]) => void;
  onUndoCurrent: () => void;
  onGoTo: (match: DeckMatch) => void;
  readOnly?: boolean;
}) {
  const items = useSlidesFlow((s) => s.items);
  const updateItem = useSlidesFlow((s) => s.updateItem);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [onlyCurrent, setOnlyCurrent] = useState(false);

  const scopeIds = useMemo(
    () => (onlyCurrent && currentItemId ? new Set([currentItemId]) : undefined),
    [onlyCurrent, currentItemId],
  );
  const matches = useMemo(() => {
    const all = findInDeck(items, query, { matchCase });
    return scopeIds ? all.filter((m) => scopeIds.has(m.itemId)) : all;
  }, [items, query, matchCase, scopeIds]);
  const total = matches.reduce((s, m) => s + m.count, 0);
  const lockedTotal = matches.filter((m) => m.locked).reduce((s, m) => s + m.count, 0);
  const slideCount = new Set(matches.map((m) => m.itemId)).size;

  const replaceAll = () => {
    if (readOnly || !query || total === lockedTotal) return;
    // O slide aberto grava na esteira com atraso: garante o estado fresco.
    flushPending();
    const fresh = useSlidesFlow.getState().items;
    const r = replaceInDeck(fresh, query, replacement, { matchCase }, scopeIds);
    if (r.replaced === 0) return;
    const before = new Map(fresh.map((it) => [it.id, it]));
    let currentChanged = false;
    const otherBefore: SlideItem[] = [];
    for (const id of r.changedItemIds) {
      const next = r.items.find((it) => it.id === id)!;
      const prev = before.get(id)!;
      if (id === currentItemId && next.kind === "custom" && prev.kind === "custom") {
        // Slide aberto: só os campos de texto que mudaram, pelo histórico do editor.
        const patches: BlockPatch[] = [];
        next.config.blocks.forEach((b, i) => {
          const old = prev.config.blocks[i];
          if (old && old !== b) {
            const patch: Record<string, unknown> = {};
            for (const k of ["text", "label", "title"] as const) {
              const nv = (b as unknown as Record<string, unknown>)[k];
              if (nv !== (old as unknown as Record<string, unknown>)[k]) patch[k] = nv;
            }
            patches.push({ id: b.id, patch: patch as Partial<CustomBlock> });
          }
        });
        if (patches.length) { onApplyCurrent(patches); currentChanged = true; }
      } else {
        otherBefore.push(prev);
        updateItem(id, () => next);
      }
    }
    toast.success(t.replacedToast(r.replaced, r.changedItemIds.length), {
      description: r.skippedLocked ? t.skippedLocked(r.skippedLocked) : undefined,
      duration: 6000,
      action: {
        label: t.undo,
        onClick: () => {
          for (const prev of otherBefore) updateItem(prev.id, () => prev);
          if (currentChanged) onUndoCurrent();
        },
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Search className="h-4 w-4" /> {t.title}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-[1fr_1fr] gap-2">
          <div className="space-y-1">
            <Label htmlFor="fr-find" className="text-[12px] text-muted-foreground">{t.findLabel}</Label>
            <Input id="fr-find" autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder={t.findPlaceholder} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fr-replace" className="text-[12px] text-muted-foreground">{t.replaceLabel}</Label>
            <Input id="fr-replace" value={replacement} onChange={(e) => setReplacement(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") replaceAll(); }}
              placeholder={t.replacePlaceholder} className="h-9" disabled={readOnly} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <label className="flex items-center gap-2 text-[12px]">
            <Switch checked={matchCase} onCheckedChange={setMatchCase} /> {t.matchCase}
          </label>
          {currentItemId && (
            <label className="flex items-center gap-2 text-[12px]">
              <Switch checked={onlyCurrent} onCheckedChange={setOnlyCurrent} /> {t.onlyCurrent}
            </label>
          )}
        </div>

        <div className="rounded-md border border-border/50">
          <div className="flex items-center justify-between border-b border-border/50 px-3 py-2 text-[12px] text-muted-foreground">
            <span aria-live="polite">
              {!query ? t.typeToSearch : total === 0 ? t.noMatches : t.summary(total, slideCount)}
            </span>
            {lockedTotal > 0 && (
              <span className="flex items-center gap-1"><Lock className="h-3 w-3" /> {t.lockedCount(lockedTotal)}</span>
            )}
          </div>
          <ScrollArea className="max-h-64">
            <ul className="divide-y divide-border/40">
              {matches.map((m) => (
                <li key={`${m.itemId}-${m.blockId ?? ""}-${m.field}`}>
                  <button type="button" onClick={() => onGoTo(m)}
                    className={cn(
                      "flex w-full items-start gap-3 px-3 py-2 text-left text-[12px] hover:bg-secondary/60 focus-visible:bg-secondary/60 focus-visible:outline-none",
                      m.itemId === currentItemId && "bg-primary/5",
                    )}>
                    <span className="mt-0.5 w-14 shrink-0 text-muted-foreground">{t.slideN(m.slideNumber)}</span>
                    <span className="min-w-0 flex-1 truncate">
                      <Snippet text={m.text} query={query} matchCase={matchCase} />
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {m.locked ? <Lock className="h-3 w-3" aria-label={t.locked} /> : m.count > 1 ? `×${m.count}` : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t.close}</Button>
          <Button onClick={replaceAll} disabled={readOnly || !query || total === lockedTotal}>
            {t.replaceAll(total - lockedTotal)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
