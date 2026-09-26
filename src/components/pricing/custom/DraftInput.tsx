import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type CommitReason = "blur" | "enter" | "debounce" | "unmount";

// Era 350ms: o texto digitado no painel levava ~400ms para aparecer no slide.
// 90ms fica abaixo do que se percebe como atraso e ainda junta rajadas de
// teclas. O Desfazer agrupa edições seguidas do mesmo campo (editorStore),
// então enviar mais vezes não enche o histórico.
export const DRAFT_COMMIT_DELAY_MS = 90;

type DraftInputProps = Omit<ComponentProps<typeof Input>, "value" | "onChange" | "onBlur" | "onKeyDown"> & {
  value: string;
  onCommit: (value: string) => void;
  normalize?: (value: string) => string;
  commitDelayMs?: number;
};

export function DraftInput({
  value,
  onCommit,
  normalize,
  commitDelayMs = DRAFT_COMMIT_DELAY_MS,
  onFocus,
  className,
  ...props
}: DraftInputProps) {
  const [draft, setDraft] = useState(value);
  const focusedRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const latestValueRef = useRef(value);
  const pendingRawRef = useRef<string | null>(null);
  const commitRef = useRef<((raw: string, reason: CommitReason) => void) | null>(null);

  useEffect(() => {
    latestValueRef.current = value;
    if (!focusedRef.current) setDraft(value);
  }, [value]);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const commit = useCallback((raw: string, reason: CommitReason) => {
    clearTimer();
    pendingRawRef.current = null;
    const next = normalize ? normalize(raw) : raw;
    onCommit(next);
    latestValueRef.current = next;
    if (reason === "blur" || reason === "enter") setDraft(next);
  }, [clearTimer, normalize, onCommit]);

  useEffect(() => {
    commitRef.current = commit;
  });

  // Ao desmontar, grava o que ainda estava pendente no debounce — usando o
  // onCommit DESTA instância. Antes o timer era só cancelado: quem estivesse
  // digitando e trocasse de bloco perdia a última alteração (o navegador não
  // dispara blur quando o elemento focado é removido).
  useEffect(() => () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRawRef.current;
    pendingRawRef.current = null;
    if (pending != null) commitRef.current?.(pending, "unmount");
  }, []);

  return (
    <Input
      {...props}
      className={className}
      value={draft}
      onFocus={(event) => {
        focusedRef.current = true;
        onFocus?.(event);
      }}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        pendingRawRef.current = next;
        if (commitDelayMs > 0) {
          clearTimer();
          timerRef.current = window.setTimeout(() => commit(next, "debounce"), commitDelayMs);
        }
      }}
      onBlur={() => {
        focusedRef.current = false;
        commit(draft, "blur");
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          clearTimer();
          pendingRawRef.current = null;
          setDraft(latestValueRef.current);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

type DraftTextareaProps = Omit<ComponentProps<typeof Textarea>, "value" | "onChange" | "onBlur" | "onKeyDown"> & {
  value: string;
  onCommit: (value: string) => void;
  normalize?: (value: string) => string;
  commitDelayMs?: number;
};

export function DraftTextarea({
  value,
  onCommit,
  normalize,
  commitDelayMs = DRAFT_COMMIT_DELAY_MS,
  onFocus,
  className,
  ...props
}: DraftTextareaProps) {
  const [draft, setDraft] = useState(value);
  const focusedRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const latestValueRef = useRef(value);
  const pendingRawRef = useRef<string | null>(null);
  const commitRef = useRef<((raw: string, reason: CommitReason) => void) | null>(null);

  useEffect(() => {
    latestValueRef.current = value;
    if (!focusedRef.current) setDraft(value);
  }, [value]);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const commit = useCallback((raw: string, reason: CommitReason) => {
    clearTimer();
    pendingRawRef.current = null;
    const next = normalize ? normalize(raw) : raw;
    onCommit(next);
    latestValueRef.current = next;
    if (reason === "blur" || reason === "enter") setDraft(next);
  }, [clearTimer, normalize, onCommit]);

  useEffect(() => {
    commitRef.current = commit;
  });

  // Mesma proteção do DraftInput: grava o rascunho pendente ao desmontar,
  // com o onCommit desta instância (ver comentário lá).
  useEffect(() => () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRawRef.current;
    pendingRawRef.current = null;
    if (pending != null) commitRef.current?.(pending, "unmount");
  }, []);

  return (
    <Textarea
      {...props}
      className={className}
      value={draft}
      onFocus={(event) => {
        focusedRef.current = true;
        onFocus?.(event);
      }}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        pendingRawRef.current = next;
        if (commitDelayMs > 0) {
          clearTimer();
          timerRef.current = window.setTimeout(() => commit(next, "debounce"), commitDelayMs);
        }
      }}
      onBlur={() => {
        focusedRef.current = false;
        commit(draft, "blur");
      }}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          clearTimer();
          pendingRawRef.current = null;
          setDraft(latestValueRef.current);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

type DraftNumberInputProps = Omit<ComponentProps<typeof Input>, "type" | "value" | "onChange" | "onBlur" | "onKeyDown"> & {
  value: number | null | undefined;
  onCommit: (value: number | null) => void;
  min?: number;
  max?: number;
  fallback?: number | null;
  commitDelayMs?: number;
};

export function DraftNumberInput({
  value,
  onCommit,
  min,
  max,
  fallback = null,
  commitDelayMs = DRAFT_COMMIT_DELAY_MS,
  className,
  ...props
}: DraftNumberInputProps) {
  const clamp = useCallback((n: number) => {
    let next = n;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    return next;
  }, [max, min]);

  return (
    <DraftInput
      {...props}
      type="number"
      value={value == null ? "" : String(value)}
      commitDelayMs={commitDelayMs}
      className={cn(className)}
      normalize={(raw) => raw}
      onCommit={(raw) => {
        if (raw.trim() === "") {
          onCommit(fallback);
          return;
        }
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) onCommit(clamp(parsed));
      }}
    />
  );
}
