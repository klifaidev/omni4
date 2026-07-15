import type { CustomBlockKind } from "@/lib/customSlide";

export type SendToSlideTargetKind = CustomBlockKind | "slide:budget_evo" | "slide:bridge_pvm";

export interface SendToSlidePayload {
  source: {
    page: string;
    visualization: string;
  };
  target: {
    blockKind: SendToSlideTargetKind;
    blockLabel: string;
  };
  config: Record<string, unknown>;
  capturedAt?: string;
}

export const SEND_TO_SLIDE_EVENT = "omni:send-to-slide:capture";

export function captureSendToSlide(payload: SendToSlidePayload) {
  const detail = { ...payload, capturedAt: new Date().toISOString() };
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SEND_TO_SLIDE_EVENT, { detail }));
  }
  // Fase 16.2: apenas validação da configuração capturada.
  console.info("[Enviar para Slide]", detail);
  return detail;
}
