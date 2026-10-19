import type { CustomBlockKind } from "@/lib/customSlide";
import type { Filters } from "@/lib/types";
import type { RupturaFilters, RupturaPeriod } from "@/lib/ruptura/metrics";

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
  /** O que não cabe no elemento do slide — mostrado no diálogo antes de enviar. */
  notes?: string[];
  capturedAt?: string;
}

/**
 * Envio de um visual do catálogo (components/pricing/tabVisuals): o slide
 * recebe o mesmo componente da aba, com as opções, filtros e meses que a
 * pessoa está vendo — não uma tradução para outro elemento.
 */
export function tabVisualPayload(input: {
  page: string;
  visualization: string;
  visualId: string;
  params: Record<string, unknown>;
  filters: Filters;
  selectedPeriods: string[] | null;
}): SendToSlidePayload {
  return {
    source: { page: input.page, visualization: input.visualization },
    target: { blockKind: "tab_visual", blockLabel: "Igual à aba" },
    config: {
      visualId: input.visualId,
      params: input.params,
      filters: input.filters,
      selectedPeriods: input.selectedPeriods,
    },
  };
}

/**
 * Envio de um visual da aba Ruptura: o slide recebe o mesmo componente da aba,
 * com as opções, os filtros da ruptura e os meses que a pessoa está vendo.
 */
export function rupturaVisualPayload(input: {
  visualization: string;
  visualId: string;
  params: Record<string, unknown>;
  filters: RupturaFilters;
  /** Intervalo de meses da aba (índices da base); `null` = a base inteira. */
  period: RupturaPeriod | null;
}): SendToSlidePayload {
  return {
    source: { page: "Ruptura", visualization: input.visualization },
    target: { blockKind: "ruptura_visual", blockLabel: "Igual à aba" },
    config: {
      visualId: input.visualId,
      params: input.params,
      filters: input.filters,
      selectedPeriod: input.period,
    },
  };
}

export const SEND_TO_SLIDE_EVENT = "omni:send-to-slide:capture";

let latestSendToSlidePayload: SendToSlidePayload | null = null;

export function getLatestSendToSlidePayload() {
  return latestSendToSlidePayload;
}

export function captureSendToSlide(payload: SendToSlidePayload) {
  const detail = { ...payload, capturedAt: new Date().toISOString() };
  latestSendToSlidePayload = detail;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SEND_TO_SLIDE_EVENT, { detail }));
  }
  // Fase 16.2: apenas validação da configuração capturada.
  console.info("[Enviar para Slide]", detail);
  return detail;
}
