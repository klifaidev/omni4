// Eventos da aba Slides que partem de dentro do editor e precisam chegar à
// página (que é dona do estado de aberto/fechado do editor em tela cheia).

/** Fecha o editor em tela cheia (ex.: "Abrir na aba" de um visual). */
export const CLOSE_SLIDES_EDITOR_EVENT = "omni:slides-editor:close";

export function requestCloseSlidesEditor(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CLOSE_SLIDES_EDITOR_EVENT));
}
