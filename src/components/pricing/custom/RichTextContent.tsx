// Conteúdo de blocos título/texto: **negrito**/*itálico* em trechos
// (lib/richText) e valores vivos como {mês} e {ROL do mês} (lib/textTokens).
// Só textos com valor conhecido assinam as bases do deck — o resto não
// re-renderiza quando os dados ou o mês de referência mudam.
import { memo, useMemo } from "react";
import { parseInlineMarkup } from "@/lib/richText";
import { hasTextTokens, normalizeTokenName, resolveTextTokens, SLIDE_POSITION_TOKENS } from "@/lib/textTokens";
import { useDeckTokenValues } from "@/hooks/useDeckRows";
import { useSlideNumber } from "./SlideIdentity";

export const RichTextContent = memo(function RichTextContent({ text }: { text: string }) {
  if (!hasTextTokens(text)) return <MarkupText text={text} />;
  return usesSlidePosition(text) ? <SlidePositionText text={text} /> : <TokenText text={text} />;
});

function usesSlidePosition(text: string): boolean {
  const lower = normalizeTokenName(text);
  return SLIDE_POSITION_TOKENS.some((tk) => lower.includes(`{${tk}}`));
}

function TokenText({ text }: { text: string }) {
  const resolved = resolveTextTokens(text, useDeckTokenValues());
  return <MarkupText text={resolved} />;
}

/** {slide} e {total de slides} dependem da posição no deck, não das bases. */
function SlidePositionText({ text }: { text: string }) {
  const deckValues = useDeckTokenValues();
  const { number, total } = useSlideNumber();
  const values = useMemo(() => {
    const merged = new Map(deckValues);
    merged.set("slide", number);
    merged.set("total de slides", total);
    return merged;
  }, [deckValues, number, total]);
  return <MarkupText text={resolveTextTokens(text, values)} />;
}

function MarkupText({ text }: { text: string }) {
  const segments = useMemo(() => parseInlineMarkup(text), [text]);
  // Texto sem marcação sai como texto puro — mesmo DOM de antes da formatação
  // parcial existir. Com marcação, um <span> único: o contêiner do bloco é
  // flex, e trechos soltos virariam itens flex lado a lado.
  if (!segments.some((s) => s.bold || s.italic)) return <>{text}</>;
  return (
    <span>
      {segments.map((s, i) => (s.bold || s.italic
        ? <span key={i} style={{ fontWeight: s.bold ? 700 : undefined, fontStyle: s.italic ? "italic" : undefined }}>{s.text}</span>
        : s.text))}
    </span>
  );
}
