// Conteúdo de textos do slide: **negrito**/*itálico* em trechos
// (lib/richText) e valores vivos como {mês} e {ROL do mês} (lib/textTokens).
// Vale para blocos título/texto e para todo título de bloco (rótulo do
// cartão, título de gráfico, tabela, Top SKU, blocos analíticos).
// Só textos com valor conhecido assinam as bases do deck — o resto não
// re-renderiza quando os dados ou o mês de referência mudam.
import { createContext, memo, useContext, useMemo, type ReactNode } from "react";
import { parseInlineMarkup, stripInlineMarkup } from "@/lib/richText";
import { hasTextTokens, normalizeTokenName, resolveTextTokens, SLIDE_POSITION_TOKENS } from "@/lib/textTokens";
import { useDeckTokenValues } from "@/hooks/useDeckRows";
import { useSlideNumber } from "./SlideIdentity";

const EMPTY_VALUES: ReadonlyMap<string, string> = new Map();

/**
 * Valores que só existem dentro de um bloco — ex.: {período} de um cartão de
 * KPI vira o período DELE ("julho/2026"), não o mês do deck.
 */
const BlockTokenContext = createContext<ReadonlyMap<string, string>>(EMPTY_VALUES);

export function BlockTokenProvider({ values, children }: { values: Record<string, string>; children: ReactNode }) {
  const map = useMemo(
    () => new Map(Object.entries(values).map(([k, v]) => [normalizeTokenName(k), v])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(values)],
  );
  return <BlockTokenContext.Provider value={map}>{children}</BlockTokenContext.Provider>;
}

export const RichTextContent = memo(function RichTextContent({ text }: { text: string }) {
  if (!hasTextTokens(text)) return <MarkupText text={text} />;
  return <TokenText text={text} />;
});

function usesSlidePosition(text: string): boolean {
  const lower = normalizeTokenName(text);
  return SLIDE_POSITION_TOKENS.some((tk) => lower.includes(`{${tk}}`));
}

/** Valores do deck + do slide ({slide}) + do bloco ({período}) + `extra`. */
function useTokenValuesFor(text: string, extra?: Record<string, string>): ReadonlyMap<string, string> {
  const deckValues = useDeckTokenValues();
  const blockValues = useContext(BlockTokenContext);
  const { number, total } = useSlideNumber();
  const needsPosition = usesSlidePosition(text);
  const extraKey = extra ? JSON.stringify(extra) : "";
  return useMemo(() => {
    if (!needsPosition && blockValues.size === 0 && !extraKey) return deckValues;
    const merged = new Map(deckValues);
    for (const [k, v] of blockValues) merged.set(k, v);
    if (extraKey) for (const [k, v] of Object.entries(JSON.parse(extraKey) as Record<string, string>)) merged.set(normalizeTokenName(k), v);
    if (needsPosition) {
      merged.set("slide", number);
      merged.set("total de slides", total);
    }
    return merged;
  }, [deckValues, blockValues, needsPosition, number, total, extraKey]);
}

function TokenText({ text }: { text: string }) {
  const values = useTokenValuesFor(text);
  return <MarkupText text={resolveTextTokens(text, values)} />;
}

/**
 * Para textos que viram string (título de eixo do gráfico, medida do cartão):
 * devolve o texto com os valores resolvidos e sem a marcação ** / *.
 */
export function useResolvedText(text: string | null | undefined, extra?: Record<string, string>): string {
  const raw = text ?? "";
  const values = useTokenValuesFor(raw, extra);
  return useMemo(
    // Sem valor vivo, o texto volta igual (nem a marcação é mexida).
    () => (hasTextTokens(raw) ? stripInlineMarkup(resolveTextTokens(raw, values)) : raw),
    [raw, values],
  );
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
