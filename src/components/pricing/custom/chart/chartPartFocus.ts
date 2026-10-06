// "Clicar no que quer mudar": duplo clique numa parte do gráfico no slide
// (título, legenda, eixo, rótulo, barra/linha) abre e destaca a seção do
// painel que mexe naquilo — como o "Formatar" do PowerPoint.

import { useEffect, useRef } from "react";

export type ChartPart = "title" | "legend" | "axes" | "dataLabels" | "series" | "data";

const EVENT = "omni:chart-part-focus";
type Detail = { blockId: string; part: ChartPart };

/** Pedido guardado pra quando o painel ainda vai montar (ex.: estava na aba
 *  Filtros, ou o bloco acabou de ser selecionado pelo próprio duplo clique). */
let pending: Detail | null = null;

/** Qual parte do gráfico está sob o alvo do clique. A ordem importa: o
 *  título de um eixo também é um "label" do Recharts, mas pertence ao eixo. */
export function chartPartFromTarget(target: Element | null): ChartPart {
  if (!target) return "data";
  if (target.closest('[data-chart-part="title"]')) return "title";
  if (target.closest(".recharts-legend-wrapper")) return "legend";
  if (target.closest(".recharts-cartesian-axis, .recharts-cartesian-grid, .recharts-polar-grid, .recharts-polar-angle-axis, .recharts-polar-radius-axis")) return "axes";
  if (target.closest(".recharts-label-list")) return "dataLabels";
  if (target.closest(".recharts-bar-rectangle, .recharts-line, .recharts-area, .recharts-pie-sector, .recharts-scatter, .recharts-radar, .recharts-funnel-trapezoid, .recharts-treemap-depth-1, .recharts-curve, .recharts-dot")) return "series";
  return "data";
}

export function requestChartPartFocus(blockId: string, part: ChartPart) {
  pending = { blockId, part };
  window.dispatchEvent(new CustomEvent<Detail>(EVENT, { detail: pending }));
}

/** Escuta pedidos de foco pra um bloco; consome um pedido pendente ao montar. */
export function useChartPartFocus(blockId: string, onFocus: (part: ChartPart) => void) {
  const handlerRef = useRef(onFocus);
  handlerRef.current = onFocus;
  useEffect(() => {
    const consume = (d: Detail | null) => {
      if (!d || d.blockId !== blockId) return;
      pending = null;
      handlerRef.current(d.part);
    };
    consume(pending);
    const listener = (e: Event) => consume((e as CustomEvent<Detail>).detail);
    window.addEventListener(EVENT, listener);
    return () => window.removeEventListener(EVENT, listener);
  }, [blockId]);
}

/** Só avisa (sem consumir) — pra quem precisa reagir antes do painel montar. */
export function useChartPartFocusRequested(blockId: string, onRequest: () => void) {
  const handlerRef = useRef(onRequest);
  handlerRef.current = onRequest;
  useEffect(() => {
    const listener = (e: Event) => {
      if ((e as CustomEvent<Detail>).detail.blockId === blockId) handlerRef.current();
    };
    window.addEventListener(EVENT, listener);
    return () => window.removeEventListener(EVENT, listener);
  }, [blockId]);
}
