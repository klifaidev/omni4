// Autocompletar de valores vivos: digitar "{" em qualquer texto do slide abre
// a lista de valores ({mês}, {ROL do mês}…) já com o que cada um vale agora
// no deck; o que se digita depois filtra, ↑↓ escolhe e Enter/Tab insere.
//
// A lista nunca tira o foco do campo (mousedown com preventDefault): no
// editor do canvas, perder o foco encerraria a edição do texto.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";
import {
  findTokenQuery,
  insertToken,
  matchTokens,
  normalizeTokenName,
  TEXT_TOKENS,
  TOKEN_GROUP_LABELS,
  type TextTokenDef,
  type TextTokenGroup,
  type TokenQuery,
} from "@/lib/textTokens";

const GROUP_ORDER: TextTokenGroup[] = ["block", "date", "number", "change", "ytd", "deck"];

export interface TokenAutocompleteOptions {
  /** Mostra "Deste bloco" ({período}) — só onde o bloco tem período próprio. */
  includeBlock?: boolean;
  /** Mostra {slide} / {total de slides}. */
  includeDeck?: boolean;
  /** Grava o texto novo e põe o cursor em `caret`. */
  apply: (text: string, caret: number) => void;
}

export function useTokenAutocomplete({ includeBlock = false, includeDeck = true, apply }: TokenAutocompleteOptions) {
  const [query, setQuery] = useState<TokenQuery | null>(null);
  const [active, setActive] = useState(0);
  const applyRef = useRef(apply);
  useEffect(() => { applyRef.current = apply; }, [apply]);

  const catalog = useMemo(
    () => TEXT_TOKENS.filter((tk) => (includeBlock || tk.group !== "block") && (includeDeck || tk.group !== "deck")),
    [includeBlock, includeDeck],
  );
  const items = useMemo(() => {
    if (!query) return [];
    if (!query.query.trim()) {
      return GROUP_ORDER.flatMap((g) => catalog.filter((tk) => tk.group === g));
    }
    return matchTokens(query.query, catalog);
  }, [query, catalog]);

  useEffect(() => setActive(0), [query?.query]);

  /** Chame a cada mudança de texto ou cursor. */
  const update = useCallback((text: string, caret: number) => {
    setQuery(findTokenQuery(text, caret));
  }, []);

  const close = useCallback(() => setQuery(null), []);

  /** Abre a lista sem "{" digitado (botão "Valor vivo"): a "{" entra no cursor. */
  const openAt = useCallback((text: string, caret: number) => {
    const next = text.slice(0, caret) + "{" + text.slice(caret);
    applyRef.current(next, caret + 1);
    setQuery({ start: caret, query: "" });
  }, []);

  const pick = useCallback((def: TextTokenDef, text: string, caret: number) => {
    const res = insertToken(text, query, caret, def);
    applyRef.current(res.text, res.caret);
    setQuery(null);
  }, [query]);

  /** true quando a tecla foi usada pela lista (o campo não deve tratá-la). */
  const handleKeyDown = useCallback((e: KeyboardEvent, text: string, caret: number): boolean => {
    if (!query) return false;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setQuery(null);
      return true;
    }
    if (items.length === 0) return false;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + delta + items.length) % items.length);
      return true;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      pick(items[Math.min(active, items.length - 1)], text, caret);
      return true;
    }
    return false;
  }, [query, items, active, pick]);

  return { query, items, active, setActive, update, close, openAt, pick, handleKeyDown, open: query !== null };
}

interface TokenSuggestionsProps {
  anchorRef: RefObject<HTMLElement>;
  open: boolean;
  query: TokenQuery | null;
  items: TextTokenDef[];
  active: number;
  values: ReadonlyMap<string, string>;
  onHover: (index: number) => void;
  onPick: (def: TextTokenDef) => void;
  onClose: () => void;
}

export function TokenSuggestions({ anchorRef, open, query, items, active, values, onHover, onPick, onClose }: TokenSuggestionsProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const grouped = !!query && !query.query.trim();

  // Mantém a opção ativa à vista ao navegar com as setas.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-token-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <PopoverPrimitive.Anchor virtualRef={anchorRef as RefObject<{ getBoundingClientRect: () => DOMRect }>} />
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={8}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          // O Esc é do campo (fecha só a lista): se a camada fechasse antes, o
          // campo veria o Esc com a lista já fechada e sairia da edição.
          onEscapeKeyDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          data-export-hide="true"
          data-inline-text-toolbar="true"
          className="z-[10000000] w-[300px] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl"
        >
          <div className="flex items-baseline justify-between gap-2 border-b border-border/60 px-3 py-2">
            <span className="text-[11px] font-semibold">Valores vivos</span>
            <span className="text-[10px] text-muted-foreground">mudam com o mês de referência</span>
          </div>
          <div ref={listRef} role="listbox" aria-label="Valores vivos" className="max-h-[280px] overflow-y-auto py-1">
            {items.length === 0 && (
              <p className="px-3 py-3 text-xs text-muted-foreground">
                Nenhum valor com “{query?.query}”. Continue digitando ou apague a “{"{"}”.
              </p>
            )}
            {items.map((tk, i) => {
              const showGroup = grouped && (i === 0 || items[i - 1].group !== tk.group);
              const current = values.get(normalizeTokenName(tk.label));
              return (
                <div key={tk.label}>
                  {showGroup && (
                    <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {TOKEN_GROUP_LABELS[tk.group]}
                    </div>
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    data-token-index={i}
                    title={tk.description}
                    onMouseEnter={() => onHover(i)}
                    onMouseDown={(e) => { e.preventDefault(); onPick(tk); }}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-xs",
                      i === active ? "bg-primary/15 text-foreground" : "hover:bg-muted/60",
                    )}
                  >
                    <span className="min-w-0 truncate">{tk.label}</span>
                    {/* Sem base, o exemplo; com base mas sem o dado (ex.: falta o ano anterior), avisa — nunca um número inventado. */}
                    <span className={cn("shrink-0 tabular-nums", current === "—" ? "italic text-muted-foreground/70" : "text-muted-foreground")}>
                      {current === undefined ? `ex.: ${tk.hint}` : current === "—" ? "sem dado" : current}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
          <div className="border-t border-border/60 px-3 py-1.5 text-[10px] text-muted-foreground">
            ↑↓ escolher · Enter inserir · Esc fechar
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
