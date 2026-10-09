// Qual slide está sendo desenhado — para valores vivos que dependem da
// posição no deck, como {slide} e {total de slides}. Provido pelo editor e
// pelo desenho somente-leitura (apresentação, miniaturas, exportação).

import { createContext, useContext } from "react";
import { useSlidesFlow } from "@/store/slidesFlow";
import type { CustomBlock } from "@/lib/customSlide";

export const SlideIdContext = createContext<string | undefined>(undefined);

/** Blocos do slide sendo desenhado — para um bloco ler outro (o resumo
 *  automático lê o gráfico ao qual está ligado). */
export const SlideBlocksContext = createContext<readonly CustomBlock[] | null>(null);

export function useSlideBlock(id: string | undefined): CustomBlock | null {
  const blocks = useContext(SlideBlocksContext);
  if (!id || !blocks) return null;
  return blocks.find((b) => b.id === id) ?? null;
}

/** Número do slide e total, contando só os slides visíveis (ocultos não
 *  entram na apresentação nem na exportação). "—" fora de um deck ou em
 *  slide oculto. */
export function useSlideNumber(): { number: string; total: string } {
  const slideId = useContext(SlideIdContext);
  // Seletor devolve uma string: só re-renderiza quando a numeração muda.
  const packed = useSlidesFlow((s) => {
    const visible = s.items.filter((it) => !it.hidden);
    const i = slideId ? visible.findIndex((it) => it.id === slideId) : -1;
    return `${i >= 0 ? i + 1 : "—"}|${visible.length || "—"}`;
  });
  const [number, total] = packed.split("|");
  return { number, total };
}
