// Edição inline de texto para blocos title/text — clone do comportamento
// Canva/PowerPoint: double-click no canvas → textarea posicionado sobre o
// bloco com mesma fonte/tamanho/cor/alinhamento. Toolbar flutuante de
// formatação acima/abaixo do bloco.
import { useEffect, useRef, useState } from "react";
import type * as Y from "yjs";
import { Bold, Italic, AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import type { TitleBlock, TextBlock, CustomBlock } from "@/lib/customSlide";
import { cn } from "@/lib/utils";
import { setYTextValue } from "@/lib/customSlideYjs";

type TextLikeBlock = TitleBlock | TextBlock;

const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48];
const SWATCHES = [
  "1C2430", "FFFFFF", "C8102E", "0F62FE",
  "0E9F6E", "F59E0B", "94A3B8", "7C3AED",
];

interface EditorProps {
  block: TextLikeBlock;
  onPatch: (patch: Partial<CustomBlock>) => void;
  onExit: () => void;
  yText?: Y.Text | null;
  remoteSelections?: Array<{ id: string; name: string; color: string }>;
}

function useYTextValue(yText: Y.Text | null | undefined, fallback: string): string {
  const [value, setValue] = useState(() => yText?.toString() ?? fallback);
  useEffect(() => {
    if (!yText) {
      setValue(fallback);
      return;
    }
    const sync = () => setValue(yText.toString());
    sync();
    yText.observe(sync);
    return () => yText.unobserve(sync);
  }, [fallback, yText]);
  return value;
}

export function InlineTextEditor({ block, onPatch, onExit, yText, remoteSelections = [] }: EditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const isTitle = block.kind === "title";
  const value = useYTextValue(yText, block.text);
  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.focus();
    // Coloca o cursor no fim sem selecionar tudo (mais natural ao editar).
    const len = ta.value.length;
    ta.setSelectionRange(len, len);
  }, []);

  return (
    <>
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => {
        if (yText) {
          setYTextValue(yText, e.target.value);
        } else {
          onPatch({ text: e.target.value } as Partial<CustomBlock>);
        }
      }}
      onBlur={onExit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onExit();
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
        fontFamily: "Calibri, sans-serif",
        fontSize: block.size,
        fontWeight: isTitle && (block as TitleBlock).bold ? 700 : 400,
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
    {remoteSelections.length > 0 && (
      <div
        data-export-hide="true"
        className="pointer-events-none absolute right-1 top-1 z-[10000000] flex max-w-[70%] flex-wrap justify-end gap-1"
      >
        {remoteSelections.map((selection) => (
          <span
            key={selection.id}
            className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold text-white shadow-sm"
            style={{ background: selection.color }}
          >
            {selection.name}
          </span>
        ))}
      </div>
    )}
    </>
  );
}

interface ToolbarProps {
  block: TextLikeBlock;
  scale: number;
  onPatch: (patch: Partial<CustomBlock>) => void;
}

export function InlineTextToolbar({ block, scale, onPatch }: ToolbarProps) {
  const isTitle = block.kind === "title";
  // Se o bloco está perto do topo do canvas, mostra a toolbar abaixo.
  const placeBelow = block.y < 80;
  const inv = 1 / scale;

  return (
    <div
      data-export-hide="true"
      onMouseDown={(e) => {
        // Impede que o clique na toolbar tire foco do textarea (blur → exit).
        e.preventDefault();
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
      {isTitle && (
        <button
          type="button"
          aria-label="Negrito"
          onClick={() =>
            onPatch({ bold: !(block as TitleBlock).bold } as Partial<CustomBlock>)
          }
          className={cn(
            "h-7 w-7 rounded inline-flex items-center justify-center text-sm font-bold border",
            (block as TitleBlock).bold
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-transparent border-border hover:bg-accent",
          )}
        >
          <Bold className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        type="button"
        aria-label="Itálico"
        onClick={() => onPatch({ italic: !block.italic } as Partial<CustomBlock>)}
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
          value={`#${block.color}`}
          onChange={(e) => {
            const v = e.target.value.replace("#", "").toUpperCase();
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
    </div>
  );
}
