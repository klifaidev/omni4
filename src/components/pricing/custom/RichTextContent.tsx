// Conteúdo de blocos título/texto: **negrito**/*itálico* em trechos
// (lib/richText) e valores vivos como {mês} e {ROL do mês} (lib/textTokens).
// Só textos com valor conhecido assinam as bases do deck — o resto não
// re-renderiza quando os dados ou o mês de referência mudam.
import { memo, useMemo } from "react";
import { parseInlineMarkup } from "@/lib/richText";
import { hasTextTokens, resolveTextTokens } from "@/lib/textTokens";
import { useDeckTokenValues } from "@/hooks/useDeckRows";

export const RichTextContent = memo(function RichTextContent({ text }: { text: string }) {
  return hasTextTokens(text) ? <TokenText text={text} /> : <MarkupText text={text} />;
});

function TokenText({ text }: { text: string }) {
  const resolved = resolveTextTokens(text, useDeckTokenValues());
  return <MarkupText text={resolved} />;
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
