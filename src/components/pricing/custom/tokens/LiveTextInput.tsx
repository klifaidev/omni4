// Campo de texto dos painéis do editor que aceita valores vivos: "{" abre a
// lista, o botão { } faz o mesmo, e embaixo aparece como o texto vai ficar
// no slide ("Volume médio {período}" → "Volume médio julho/2026").
//
// Mesmo contrato do DraftInput: grava ~90ms depois de parar de digitar, no
// Enter/blur e ao desmontar; Esc desfaz o que não foi gravado.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Braces } from "lucide-react";
import { cn } from "@/lib/utils";
import { findUnknownTokens, hasTextTokens, normalizeTokenName, resolveTextTokens } from "@/lib/textTokens";
import { stripInlineMarkup } from "@/lib/richText";
import { useDeckTokenValues } from "@/hooks/useDeckRows";
import { DRAFT_COMMIT_DELAY_MS } from "../DraftInput";
import { TokenSuggestions, useTokenAutocomplete } from "./TokenAutocomplete";

interface LiveTextInputProps {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Campo de várias linhas (conteúdo de blocos de texto). */
  multiline?: boolean;
  rows?: number;
  /** Valores só deste bloco ({período} do cartão), para a lista e a prévia. */
  blockValues?: Record<string, string>;
  "aria-label"?: string;
}

export function LiveTextInput({
  value,
  onCommit,
  placeholder,
  className,
  multiline,
  rows = 3,
  blockValues,
  "aria-label": ariaLabel,
}: LiveTextInputProps) {
  const [draft, setDraft] = useState(value);
  const fieldRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const focusedRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const pendingRef = useRef<string | null>(null);
  const latestRef = useRef(value);
  const onCommitRef = useRef(onCommit);
  const caretRef = useRef<number | null>(null);
  useEffect(() => { onCommitRef.current = onCommit; }, [onCommit]);

  useEffect(() => {
    latestRef.current = value;
    if (!focusedRef.current) setDraft(value);
  }, [value]);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const commit = useCallback((raw: string) => {
    clearTimer();
    pendingRef.current = null;
    latestRef.current = raw;
    onCommitRef.current(raw);
  }, [clearTimer]);

  const schedule = useCallback((raw: string) => {
    pendingRef.current = raw;
    clearTimer();
    timerRef.current = window.setTimeout(() => commit(raw), DRAFT_COMMIT_DELAY_MS);
  }, [clearTimer, commit]);

  useEffect(() => () => {
    clearTimer();
    if (pendingRef.current != null) onCommitRef.current(pendingRef.current);
  }, [clearTimer]);

  // Trocar o valor de um campo controlado joga o cursor pro fim: repõe.
  useLayoutEffect(() => {
    const caret = caretRef.current;
    const el = fieldRef.current;
    if (caret == null || !el) return;
    caretRef.current = null;
    el.focus();
    el.setSelectionRange(caret, caret);
  }, [draft]);

  const setText = useCallback((text: string, caret: number) => {
    caretRef.current = caret;
    setDraft(text);
    schedule(text);
  }, [schedule]);

  const auto = useTokenAutocomplete({ includeBlock: !!blockValues, apply: setText });

  const deckValues = useDeckTokenValues();
  const blockKey = blockValues ? JSON.stringify(blockValues) : "";
  const values = useMemo(() => {
    if (!blockKey) return deckValues;
    const merged = new Map(deckValues);
    for (const [k, v] of Object.entries(JSON.parse(blockKey) as Record<string, string>)) merged.set(normalizeTokenName(k), v);
    return merged;
  }, [deckValues, blockKey]);

  const preview = hasTextTokens(draft) ? stripInlineMarkup(resolveTextTokens(draft, values)) : null;
  const unknown = findUnknownTokens(draft);

  const caretOf = () => fieldRef.current?.selectionStart ?? draft.length;
  const sync = () => auto.update(fieldRef.current?.value ?? draft, caretOf());

  const fieldProps = {
    ref: fieldRef,
    value: draft,
    placeholder,
    "aria-label": ariaLabel,
    "aria-autocomplete": "list" as const,
    "aria-expanded": auto.open,
    onFocus: () => { focusedRef.current = true; },
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const next = e.target.value;
      setDraft(next);
      schedule(next);
      auto.update(next, e.target.selectionStart ?? next.length);
    },
    onClick: sync,
    onKeyUp: (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") sync();
    },
    onBlur: () => {
      focusedRef.current = false;
      auto.close();
      commit(draft);
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (auto.handleKeyDown(e, draft, caretOf())) return;
      if (e.key === "Enter" && !multiline) e.currentTarget.blur();
      if (e.key === "Escape") {
        clearTimer();
        pendingRef.current = null;
        setDraft(latestRef.current);
        e.currentTarget.blur();
      }
    },
    className: cn(
      "w-full rounded-md border border-input bg-background px-2 pr-8 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/50",
      multiline ? "py-1.5 leading-snug" : "h-8",
      className,
    ),
  };

  return (
    <div className="w-full">
      <div className="relative">
        {multiline ? <textarea rows={rows} {...fieldProps} /> : <input type="text" {...fieldProps} />}
        <button
          type="button"
          title="Inserir valor vivo (ou digite { no texto)"
          aria-label="Inserir valor vivo"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const el = fieldRef.current;
            el?.focus();
            focusedRef.current = true;
            const caret = el?.selectionStart ?? draft.length;
            auto.openAt(draft, caret);
          }}
          className={cn(
            "absolute right-1 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary",
            multiline ? "top-1" : "top-1/2 -translate-y-1/2",
            auto.open && "bg-primary/10 text-primary",
          )}
        >
          <Braces className="h-3.5 w-3.5" />
        </button>
      </div>
      {preview !== null && (
        <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
          No slide: <span className="text-foreground">{preview}</span>
        </p>
      )}
      {unknown.length > 0 && (
        <p className="mt-1 text-[10px] leading-snug text-warning">
          {unknown.join(", ")} não é um valor conhecido — digite {"{"} para ver a lista.
        </p>
      )}
      <TokenSuggestions
        anchorRef={fieldRef}
        open={auto.open}
        query={auto.query}
        items={auto.items}
        active={auto.active}
        values={values}
        onHover={auto.setActive}
        onPick={(def) => auto.pick(def, draft, caretOf())}
        onClose={auto.close}
      />
    </div>
  );
}
