// Dados dos visuais da aba Custos, usados pela aba e pelo slide. Os gráficos
// da aba mostram o HISTÓRICO (só filtros de dimensão) — o mês escolhido vale
// só para os KPIs do topo.
import type { PricingRow } from "@/lib/types";

export type CompositionRow = {
  periodo: string;
  label: string;
  /** ano * 12 + mês — ordem cronológica. */
  order: number;
  materiaPrima: number;
  embalagem: number;
  mod: number;
  cif: number;
  rol: number;
  hasMP: boolean;
  hasEmb: boolean;
  hasMod: boolean;
  hasCif: boolean;
};

export interface CompositionTotals {
  materiaPrima: number;
  embalagem: number;
  mod: number;
  cif: number;
  rol: number;
  hasMP: boolean;
  hasEmb: boolean;
  hasMod: boolean;
  hasCif: boolean;
}

/** Composição do custo variável por mês (Matéria Prima, Embalagem, MOD, CIF). */
export function buildComposition(source: PricingRow[]): CompositionRow[] {
  const map = new Map<string, CompositionRow>();
  for (const r of source) {
    const cur = map.get(r.periodo) ?? {
      periodo: r.periodo,
      label: `${String(r.mes).padStart(2, "0")}/${String(r.ano).slice(-2)}`,
      order: r.ano * 12 + r.mes,
      materiaPrima: 0, embalagem: 0, mod: 0, cif: 0, rol: 0,
      hasMP: false, hasEmb: false, hasMod: false, hasCif: false,
    };
    cur.rol += r.rol;
    if (r.materiaPrima != null) { cur.materiaPrima += r.materiaPrima; cur.hasMP = true; }
    if (r.embalagem != null) { cur.embalagem += r.embalagem; cur.hasEmb = true; }
    if (r.mod != null) { cur.mod += r.mod; cur.hasMod = true; }
    if (r.cif != null) { cur.cif += r.cif; cur.hasCif = true; }
    map.set(r.periodo, cur);
  }
  // Ordem cronológica (antes era alfabética pelo código do período, que
  // intercalava os anos: 09/24 seguido de 10/25).
  return Array.from(map.values()).sort((a, b) => a.order - b.order);
}

export function compositionTotals(source: CompositionRow[]): CompositionTotals {
  return source.reduce<CompositionTotals>(
    (acc, r) => {
      acc.materiaPrima += r.materiaPrima;
      acc.embalagem += r.embalagem;
      acc.mod += r.mod;
      acc.cif += r.cif;
      acc.rol += r.rol;
      acc.hasMP = acc.hasMP || r.hasMP;
      acc.hasEmb = acc.hasEmb || r.hasEmb;
      acc.hasMod = acc.hasMod || r.hasMod;
      acc.hasCif = acc.hasCif || r.hasCif;
      return acc;
    },
    { materiaPrima: 0, embalagem: 0, mod: 0, cif: 0, rol: 0, hasMP: false, hasEmb: false, hasMod: false, hasCif: false },
  );
}

export function hasCompositionData(t: CompositionTotals): boolean {
  return (t.hasMP && t.materiaPrima !== 0)
    || (t.hasEmb && t.embalagem !== 0)
    || (t.hasMod && t.mod !== 0)
    || (t.hasCif && t.cif !== 0);
}
