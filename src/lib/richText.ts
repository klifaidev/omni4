// Formatação parcial em blocos de título/texto do Slide Personalizado.
//
// O texto continua sendo uma string simples (compatível com todo deck salvo);
// trechos marcados como **negrito** e *itálico* são desenhados formatados no
// slide — e, como o PPTX é a imagem do slide, também na exportação. A marcação
// só aparece enquanto se edita o texto.

export interface RichSegment {
  text: string;
  bold: boolean;
  italic: boolean;
}

// Fecha no primeiro "**" que não é seguido de outro "*": em "**muito *forte***"
// o negrito vai até o fim e o "*forte*" de dentro vira itálico.
const BOLD_RE = /\*\*(?=\S)([\s\S]*?\S)\*\*(?!\*)/g;
const ITALIC_RE = /\*(?=[^\s*])([^*]*?[^\s*])\*/g;

function splitBy(
  text: string,
  re: RegExp,
  style: Omit<RichSegment, "text">,
  apply: (seg: Omit<RichSegment, "text">) => Omit<RichSegment, "text">,
): RichSegment[] {
  const out: RichSegment[] = [];
  let last = 0;
  re.lastIndex = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), ...style });
    out.push({ text: m[1], ...apply(style) });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), ...style });
  return out;
}

/** Quebra o texto em trechos com o estilo de cada um. Sem marcação → 1 trecho. */
export function parseInlineMarkup(text: string): RichSegment[] {
  if (!text) return [];
  const base = { bold: false, italic: false };
  if (!text.includes("*")) return [{ text, ...base }];
  const byBold = splitBy(text, BOLD_RE, base, (s) => ({ ...s, bold: true }));
  const out: RichSegment[] = [];
  for (const seg of byBold) {
    const { text: segText, ...style } = seg;
    for (const part of splitBy(segText, ITALIC_RE, style, (s) => ({ ...s, italic: true }))) {
      if (part.text) out.push(part);
    }
  }
  return out;
}

export function hasInlineMarkup(text: string | null | undefined): boolean {
  if (!text || !text.includes("*")) return false;
  return parseInlineMarkup(text).some((s) => s.bold || s.italic);
}

/** Texto sem a marcação — para rótulos (camadas, avisos) e comparações. */
export function stripInlineMarkup(text: string): string {
  if (!text || !text.includes("*")) return text;
  return parseInlineMarkup(text).map((s) => s.text).join("");
}

export interface TextSelectionEdit {
  value: string;
  start: number;
  end: number;
}

/**
 * Liga/desliga a marcação (`**` ou `*`) em volta da seleção [start, end).
 * Se a seleção já está marcada (por dentro ou por fora dos marcadores), tira;
 * senão, envolve. Espaços nas pontas ficam de fora da marcação — "**texto **"
 * não seria reconhecido como negrito. Devolve a seleção cobrindo o mesmo texto.
 */
export function toggleInlineMarker(
  value: string,
  start: number,
  end: number,
  marker: "**" | "*",
): TextSelectionEdit {
  let s = Math.max(0, Math.min(start, end));
  let e = Math.min(value.length, Math.max(start, end));
  while (s < e && /\s/.test(value[s])) s++;
  while (e > s && /\s/.test(value[e - 1])) e--;
  if (s === e) return { value, start, end };
  const len = marker.length;
  const inner = value.slice(s, e);

  // Marcador por fora da seleção: **[texto]**
  if (value.slice(s - len, s) === marker && value.slice(e, e + len) === marker
    && !(marker === "*" && (value[s - len - 1] === "*" || value[e + len] === "*"))) {
    return {
      value: value.slice(0, s - len) + inner + value.slice(e + len),
      start: s - len,
      end: e - len,
    };
  }
  // Marcador dentro da seleção: [**texto**]
  if (inner.length > len * 2 && inner.startsWith(marker) && inner.endsWith(marker)
    && !(marker === "*" && inner.startsWith("**") && !inner.startsWith("***"))) {
    const stripped = inner.slice(len, inner.length - len);
    return { value: value.slice(0, s) + stripped + value.slice(e), start: s, end: s + stripped.length };
  }
  return {
    value: value.slice(0, s) + marker + inner + marker + value.slice(e),
    start: s + len,
    end: e + len,
  };
}
