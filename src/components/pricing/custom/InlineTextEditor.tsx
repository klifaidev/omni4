// Edição inline de texto para blocos title/text — clone do comportamento
// Canva/PowerPoint: double-click no canvas → textarea posicionado sobre o
// bloco com mesma fonte/tamanho/cor/alinhamento. Toolbar flutuante de
// formatação acima/abaixo do bloco.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type MouseEvent } from "react";
import { Bold, Italic, AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import type { TitleBlock, TextBlock, CustomBlock } from "@/lib/customSlide";
import { cn } from "@/lib/utils";
import { SLIDE_DEFAULT_FONT_FAMILY } from "@/lib/slideBrandKit";
import { isSampleText } from "@/lib/sampleTexts";
import { toggleInlineMarker, type TextSelectionEdit } from "@/lib/richText";
import { TEXT_TOKENS, normalizeTokenName, tokenText } from "@/lib/textTokens";
import { useDeckTokenValues } from "@/hooks/useDeckRows";
import { strings } from "@/lib/i18n";

const tText = strings.slides.editor.inspectors.blocks.textTitle;

type TextLikeBlock = TitleBlock | TextBlock;

// Ponte entre a barra flutuante e o campo em edição (renderizados em lugares
// diferentes do canvas): B/I aplicam a marcação no trecho selecionado do campo
// e "Inserir valor" escreve no cursor. Só existe um campo em edição por vez.
interface InlineEditorApi {
  /** Marca/desmarca o trecho selecionado. `false` se não havia seleção. */
  toggleMarker: (marker: "**" | "*") => boolean;
  insert: (text: string) => void;
  exit: () => void;
  isOwnField: (el: Element | null) => boolean;
}
const inlineEditorBridge: { current: InlineEditorApi | null } = { current: null };

const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48];
const SWATCHES = [
  "1C2430", "FFFFFF", "C8102E", "0F62FE",
  "0E9F6E", "F59E0B", "94A3B8", "7C3AED",
];
const LOCAL_TEXT_COMMIT_DELAY_MS = 400;

interface EditorProps {
  block: TextLikeBlock;
  onPatch: (patch: Partial<CustomBlock>) => void;
  onExit: () => void;
}

export function InlineTextEditor({ block, onPatch, onExit }: EditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const isTitle = block.kind === "title";
  const externalValue = block.text;
  const [draftValue, setDraftValue] = useState(externalValue);
  const pendingValueRef = useRef(externalValue);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localDirtyRef = useRef(false);
  const onPatchRef = useRef(onPatch);

  useEffect(() => {
    onPatchRef.current = onPatch;
  }, [onPatch]);

  const clearCommitTimer = useCallback(() => {
    if (!commitTimerRef.current) return;
    clearTimeout(commitTimerRef.current);
    commitTimerRef.current = null;
  }, []);

  const commitTextValue = useCallback((value: string) => {
    clearCommitTimer();
    localDirtyRef.current = false;
    pendingValueRef.current = value;
    if (block.text !== value) {
      onPatchRef.current({ text: value } as Partial<CustomBlock>);
    }
  }, [block.text, clearCommitTimer]);

  const scheduleTextCommit = useCallback((value: string) => {
    pendingValueRef.current = value;
    localDirtyRef.current = true;
    clearCommitTimer();
    commitTimerRef.current = setTimeout(() => {
      commitTextValue(pendingValueRef.current);
    }, LOCAL_TEXT_COMMIT_DELAY_MS);
  }, [clearCommitTimer, commitTextValue]);

  useEffect(() => {
    if (localDirtyRef.current) return;
    pendingValueRef.current = externalValue;
    setDraftValue(externalValue);
  }, [externalValue]);

  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.focus();
    // Texto de exemplo ("Título do slide", "Clique para editar este texto.")
    // entra selecionado: a primeira tecla substitui, como o marcador do
    // PowerPoint. Texto real: cursor no fim, sem selecionar tudo.
    if (isSampleText(ta.value)) {
      ta.select();
      return;
    }
    const len = ta.value.length;
    ta.setSelectionRange(len, len);
  }, []);

  useEffect(() => () => {
    if (localDirtyRef.current) commitTextValue(pendingValueRef.current);
    clearCommitTimer();
  }, [clearCommitTimer, commitTextValue]);

  // Trocar o valor de um textarea controlado joga o cursor pro fim; a seleção
  // pedida pela edição (B/I, inserir valor) é reposta logo depois do commit.
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);
  useLayoutEffect(() => {
    const sel = pendingSelectionRef.current;
    const ta = ref.current;
    if (!sel || !ta) return;
    pendingSelectionRef.current = null;
    ta.focus();
    ta.setSelectionRange(sel.start, sel.end);
  }, [draftValue]);

  const applyEdit = useCallback((edit: TextSelectionEdit) => {
    pendingSelectionRef.current = { start: edit.start, end: edit.end };
    setDraftValue(edit.value);
    scheduleTextCommit(edit.value);
  }, [scheduleTextCommit]);

  const toggleMarker = useCallback((marker: "**" | "*") => {
    const ta = ref.current;
    if (!ta || ta.selectionStart === ta.selectionEnd) return false;
    const edit = toggleInlineMarker(ta.value, ta.selectionStart, ta.selectionEnd, marker);
    if (edit.value === ta.value) return false;
    applyEdit(edit);
    return true;
  }, [applyEdit]);

  const onExitRef = useRef(onExit);
  useEffect(() => { onExitRef.current = onExit; }, [onExit]);

  useEffect(() => {
    const api: InlineEditorApi = {
      toggleMarker,
      insert: (text) => {
        const ta = ref.current;
        if (!ta) return;
        const start = ta.selectionStart;
        const caret = start + text.length;
        applyEdit({ value: ta.value.slice(0, start) + text + ta.value.slice(ta.selectionEnd), start: caret, end: caret });
      },
      exit: () => onExitRef.current(),
      isOwnField: (el) => !!el && el === ref.current,
    };
    inlineEditorBridge.current = api;
    return () => {
      if (inlineEditorBridge.current === api) inlineEditorBridge.current = null;
    };
  }, [toggleMarker, applyEdit]);

  return (
    <>
    <textarea
      ref={ref}
      value={draftValue}
      onChange={(e) => {
        const nextValue = e.target.value;
        setDraftValue(nextValue);
        scheduleTextCommit(nextValue);
      }}
      onBlur={(event) => {
        if (localDirtyRef.current) commitTextValue(pendingValueRef.current);
        const nextTarget = event.relatedTarget as HTMLElement | null;
        if (nextTarget?.closest("[data-inline-text-toolbar='true']")) return;
        onExit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onExit();
          return;
        }
        // Ctrl/Cmd+B e +I: com trecho selecionado, formata só o trecho;
        // sem seleção, o bloco inteiro (mesmo efeito dos botões da barra).
        const mod = e.ctrlKey || e.metaKey;
        const k = e.key.toLowerCase();
        if (mod && !e.shiftKey && !e.altKey && (k === "b" || k === "i")) {
          e.preventDefault();
          e.stopPropagation();
          if (!toggleMarker(k === "b" ? "**" : "*")) {
            onPatchRef.current(
              (k === "b" ? { bold: !block.bold } : { italic: !block.italic }) as Partial<CustomBlock>,
            );
          }
          return;
        }
        // Impede atalhos do editor (Delete, setas) de propagar.
        e.stopPropagation();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        padding: 0,
        margin: 0,
        border: "none",
        outline: "none",
        resize: "none",
        background: "transparent",
        fontFamily: block.fontFamily ?? SLIDE_DEFAULT_FONT_FAMILY,
        fontSize: block.size,
        fontWeight: block.bold ? 700 : 400,
        fontStyle: block.italic ? "italic" : "normal",
        color: `#${block.color}`,
        textAlign: block.align,
        lineHeight: isTitle ? 1.1 : 1.3,
        whiteSpace: "pre-wrap",
        overflow: "hidden",
        cursor: "text",
        pointerEvents: "auto",
        display: "flex",
        // Aproximação do display:flex original (centralizado para title,
        // top para text). Em <textarea> não há flex; usamos paddingTop
        // para títulos para alinhar verticalmente ao centro.
      }}
      data-export-hide="true"
    />
    </>
  );
}

interface ToolbarProps {
  block: TextLikeBlock;
  scale: number;
  onPatch: (patch: Partial<CustomBlock>) => void;
}

export function InlineTextToolbar({ block, scale, onPatch }: ToolbarProps) {
  const [hexDraft, setHexDraft] = useState(`#${block.color}`);
  // "Inserir valor" mostra o que cada valor vale agora neste deck.
  const tokenValues = useDeckTokenValues();
  // Se o bloco está perto do topo do canvas, mostra a toolbar abaixo.
  const placeBelow = block.y < 80;
  const inv = 1 / scale;
  const keepTextFocus = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  useEffect(() => {
    setHexDraft(`#${block.color}`);
  }, [block.color]);

  // Foco saindo de um controle da barra (tamanho, inserir valor, cor) para
  // fora dela e do campo: encerra a edição, como o blur do próprio campo faz.
  const onToolbarBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Element | null;
    if (next && event.currentTarget.contains(next)) return;
    if (inlineEditorBridge.current?.isOwnField(next)) return;
    inlineEditorBridge.current?.exit();
  };

  return (
    <div
      data-export-hide="true"
      data-inline-text-toolbar="true"
      onBlur={onToolbarBlur}
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        left: block.x + block.w / 2,
        top: placeBelow ? block.y + block.h + 8 : block.y - 8,
        transform: placeBelow
          ? `translate(-50%, 0) scale(${inv})`
          : `translate(-50%, -100%) scale(${inv})`,
        transformOrigin: placeBelow ? "top center" : "bottom center",
        zIndex: 9999999,
        display: "flex",
        gap: 4,
        alignItems: "center",
        padding: "6px 8px",
        background: "hsl(var(--background))",
        border: "1px solid hsl(var(--border))",
        borderRadius: 8,
        boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
        pointerEvents: "auto",
      }}
      className="text-foreground"
    >
      <button
        type="button"
        aria-label="Negrito"
        title="Negrito (Ctrl+B) — no trecho selecionado ou no bloco inteiro"
        onMouseDown={keepTextFocus}
        onClick={() => {
          if (!inlineEditorBridge.current?.toggleMarker("**")) {
            onPatch({ bold: !block.bold } as Partial<CustomBlock>);
          }
        }}
        className={cn(
          "h-7 w-7 rounded inline-flex items-center justify-center text-sm font-bold border",
          block.bold
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-transparent border-border hover:bg-accent",
        )}
      >
        <Bold className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label="Itálico"
        title="Itálico (Ctrl+I) — no trecho selecionado ou no bloco inteiro"
        onMouseDown={keepTextFocus}
        onClick={() => {
          if (!inlineEditorBridge.current?.toggleMarker("*")) {
            onPatch({ italic: !block.italic } as Partial<CustomBlock>);
          }
        }}
        className={cn(
          "h-7 w-7 rounded inline-flex items-center justify-center border",
          block.italic
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-transparent border-border hover:bg-accent",
        )}
      >
        <Italic className="h-3.5 w-3.5" />
      </button>

      <select
        aria-label="Tamanho da fonte"
        value={block.size}
        onChange={(e) =>
          onPatch({ size: Number(e.target.value) } as Partial<CustomBlock>)
        }
        className="h-7 rounded border border-border bg-background px-1 text-xs"
      >
        {FONT_SIZES.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-1 border-l border-border pl-2 ml-1">
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Cor ${c}`}
            onMouseDown={keepTextFocus}
            onClick={() => onPatch({ color: c } as Partial<CustomBlock>)}
            className={cn(
              "h-5 w-5 rounded-full border",
              block.color.toUpperCase() === c
                ? "ring-2 ring-primary ring-offset-1"
                : "border-border",
            )}
            style={{ background: `#${c}` }}
          />
        ))}
        <input
          type="text"
          aria-label="Cor (hex)"
          value={hexDraft}
          onChange={(e) => {
            const next = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
            setHexDraft(next.toUpperCase());
            const v = next.replace("#", "").toUpperCase();
            if (/^[0-9A-F]{6}$/.test(v)) {
              onPatch({ color: v } as Partial<CustomBlock>);
            }
          }}
          className="h-7 w-20 rounded border border-border bg-background px-1 text-xs font-mono"
        />
      </div>

      <div className="flex items-center gap-0.5 border-l border-border pl-2 ml-1">
        {(["left", "center", "right"] as const).map((a) => {
          const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight;
          return (
            <button
              key={a}
              type="button"
              aria-label={`Alinhar ${a}`}
              onMouseDown={keepTextFocus}
              onClick={() => onPatch({ align: a } as Partial<CustomBlock>)}
              className={cn(
                "h-7 w-7 rounded inline-flex items-center justify-center border",
                block.align === a
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent border-border hover:bg-accent",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          );
        })}
      </div>

      <div className="border-l border-border pl-2 ml-1">
        <select
          aria-label={tText.insertValue}
          value=""
          onChange={(e) => {
            const value = e.target.value;
            if (value) inlineEditorBridge.current?.insert(value);
          }}
          className="h-7 max-w-[150px] rounded border border-border bg-background px-1 text-xs"
        >
          <option value="">{tText.insertValue}</option>
          {(["date", "number"] as const).map((group) => (
            <optgroup key={group} label={tText.tokenGroups[group]}>
              {TEXT_TOKENS.filter((tk) => tk.group === group).map((tk) => (
                <option key={tk.label} value={tokenText(tk)}>
                  {tk.label} — {tokenValues.get(normalizeTokenName(tk.label)) ?? tk.hint}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
    </div>
  );
}
