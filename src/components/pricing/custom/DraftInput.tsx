import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type CommitReason = "blur" | "enter" | "debounce";

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
  commitDelayMs = 350,
  onFocus,
  className,
  ...props
}: DraftInputProps) {
  const [draft, setDraft] = useState(value);
  const focusedRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const latestValueRef = useRef(value);

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
    const next = normalize ? normalize(raw) : raw;
    onCommit(next);
    latestValueRef.current = next;
    if (reason !== "debounce") setDraft(next);
  }, [clearTimer, normalize, onCommit]);

  useEffect(() => clearTimer, [clearTimer]);

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
  commitDelayMs = 350,
  onFocus,
  className,
  ...props
}: DraftTextareaProps) {
  const [draft, setDraft] = useState(value);
  const focusedRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const latestValueRef = useRef(value);

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
    const next = normalize ? normalize(raw) : raw;
    onCommit(next);
    latestValueRef.current = next;
    if (reason !== "debounce") setDraft(next);
  }, [clearTimer, normalize, onCommit]);

  useEffect(() => clearTimer, [clearTimer]);

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
  commitDelayMs = 350,
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
