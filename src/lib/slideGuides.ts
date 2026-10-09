// Guias de layout do editor: predefinições (centro, terços, colunas,
// margens) e arrumação das listas.

import type { SlideGuides } from "./customSlide";

export type GuidePreset = "center" | "thirds" | "columns12" | "margins";

export const EMPTY_GUIDES: SlideGuides = { v: [], h: [] };

/** Margem padrão das predefinições e da área segura (px do slide). */
export const DEFAULT_MARGIN = 40;
/** Vão entre colunas da grade de 12. */
const GUTTER = 16;

function uniqSorted(values: number[]): number[] {
  return Array.from(new Set(values.map((v) => Math.round(v)))).sort((a, b) => a - b);
}

/** Linhas de uma predefinição. `contentH` é a altura útil (sem a faixa de
 *  rodapé), para que "margens" e "terços" usem a área onde o conteúdo cabe. */
export function presetGuides(preset: GuidePreset, w: number, contentH: number, margin = DEFAULT_MARGIN): SlideGuides {
  switch (preset) {
    case "center":
      return { v: [w / 2], h: [contentH / 2] };
    case "thirds":
      return { v: [w / 3, (2 * w) / 3], h: [contentH / 3, (2 * contentH) / 3] };
    case "margins":
      return { v: [margin, w - margin], h: [margin, contentH - margin] };
    case "columns12": {
      // 12 colunas entre as margens, com vão fixo: guia no início e no fim
      // de cada coluna (o padrão de grade de layout).
      const inner = w - 2 * margin;
      const col = (inner - GUTTER * 11) / 12;
      const v: number[] = [];
      for (let i = 0; i < 12; i++) {
        const start = margin + i * (col + GUTTER);
        v.push(start, start + col);
      }
      return { v, h: [margin, contentH - margin] };
    }
  }
}

/** Junta guias (sem repetir, em ordem), preservando o travamento atual. */
export function mergeGuides(current: SlideGuides | undefined, add: SlideGuides): SlideGuides {
  return {
    v: uniqSorted([...(current?.v ?? []), ...add.v]),
    h: uniqSorted([...(current?.h ?? []), ...add.h]),
    locked: current?.locked,
  };
}
