// Saúde dos De/Paras: o que das bases carregadas está sem mapeamento, e quanto
// isso pesa. Calculado das linhas em memória (sempre atual — inclusive depois
// de uma correção), com o impacto medido em ROL do Real: a pendência que mais
// pesa aparece primeiro.
import type { BudgetRow } from "@/lib/budget";
import { getMissingDeParaFields, type DeParaEntry } from "@/lib/depara";
import { getInovacaoMap } from "@/lib/deparaInovacao";
import type { ComercialMapId } from "@/lib/deparaComercial";
import type { PricingRow } from "@/lib/types";

export type DeParaMapId = "hierarquia" | "inovacao" | ComercialMapId;

export const DEPARA_MAPS: Array<{
  id: DeParaMapId;
  title: string;
  from: string;
  to: string;
  group: "Produto" | "Comercial";
  description: string;
}> = [
  { id: "hierarquia", title: "SKU → Hierarquia", from: "SKU", to: "Categoria, marca, formato…", group: "Produto", description: "Categoria, subcategoria, marca, tecnologia, formato, mercado, faixa de peso, sabor e descrição de cada SKU." },
  { id: "inovacao", title: "SKU → Inovação", from: "SKU", to: "Inovação / Regular", group: "Produto", description: "Classificação Inovação/Regular, ano de lançamento e legado por SKU." },
  { id: "canalToCanalAjustado", title: "Canal → Canal Ajustado", from: "Canal distrib.", to: "Canal Ajustado", group: "Comercial", description: "Padroniza o canal bruto do KE30 no canal usado nas análises." },
  { id: "regiaoToUf", title: "Região → UF", from: "Região", to: "UF", group: "Comercial", description: "Estado a partir da região do KE30." },
  { id: "regiaoToMercadoAjustado", title: "Região → Mercado", from: "Região", to: "Mercado Ajustado", group: "Comercial", description: "Mercado padronizado a partir da região." },
  { id: "ufToRegional", title: "UF → Regional", from: "UF", to: "Regional", group: "Comercial", description: "Regional comercial a partir do estado." },
];

export const DEPARA_MAP_BY_ID = Object.fromEntries(DEPARA_MAPS.map((m) => [m.id, m])) as Record<DeParaMapId, (typeof DEPARA_MAPS)[number]>;

export interface PendingItem {
  id: string;
  map: DeParaMapId;
  /** Valor como aparece na base (SKU, canal, região, UF). */
  key: string;
  /** Descrição de apoio (nome do SKU). */
  label?: string;
  /** ROL do Real que passa por este valor. */
  rol: number;
  /** |ROL| / ROL total do Real. */
  share: number;
  rows: number;
  /** Só aparece no Budget (sem ROL do Real para medir). */
  onlyBudget: boolean;
  missingFields?: (keyof DeParaEntry)[];
}

export interface MapHealth {
  map: DeParaMapId;
  /** Parte do ROL do Real já mapeada (0–1); null quando não há Real carregado. */
  coverage: number | null;
  /** Valores distintos deste mapa nas bases carregadas. */
  keysInUse: number;
  pending: PendingItem[];
}

export interface DeParaHealth {
  totalRol: number;
  maps: Record<DeParaMapId, MapHealth>;
  /** Todas as pendências, da que mais pesa para a que menos pesa. */
  pending: PendingItem[];
  hasData: boolean;
}

const UNASSIGNED = new Set(["", "nao atribuido", "não atribuído", "#"]);

function isUnassigned(value: string | undefined): boolean {
  if (!value) return true;
  const text = value.trim().toLowerCase();
  return UNASSIGNED.has(text) || UNASSIGNED.has(text.normalize("NFD").replace(/[̀-ͯ]/g, ""));
}

interface Acc {
  rol: number;
  rows: number;
  label?: string;
  budgetOnly: boolean;
}

function bump(map: Map<string, Acc>, key: string, rol: number, label: string | undefined, fromBudget: boolean) {
  let acc = map.get(key);
  if (!acc) map.set(key, (acc = { rol: 0, rows: 0, label, budgetOnly: fromBudget }));
  acc.rol += rol;
  acc.rows++;
  if (!fromBudget) acc.budgetOnly = false;
  if (!acc.label && label) acc.label = label;
}

export function computeDeParaHealth(real: PricingRow[], budget: BudgetRow[]): DeParaHealth {
  let totalRol = 0;
  for (const r of real) totalRol += Math.abs(r.rol || 0);

  const missingCache = new Map<string, (keyof DeParaEntry)[]>();
  const missingOf = (sku: string) => {
    let fields = missingCache.get(sku);
    if (!fields) missingCache.set(sku, (fields = getMissingDeParaFields(sku)));
    return fields;
  };
  const inovacao = getInovacaoMap();

  const pendingAcc: Record<Exclude<DeParaMapId, "inovacao">, Map<string, Acc>> = {
    hierarquia: new Map(),
    canalToCanalAjustado: new Map(),
    regiaoToUf: new Map(),
    regiaoToMercadoAjustado: new Map(),
    ufToRegional: new Map(),
  };
  const inUse: Record<DeParaMapId, Set<string>> = {
    hierarquia: new Set(), inovacao: new Set(), canalToCanalAjustado: new Set(),
    regiaoToUf: new Set(), regiaoToMercadoAjustado: new Set(), ufToRegional: new Set(),
  };
  const uncovered: Record<DeParaMapId, number> = {
    hierarquia: 0, inovacao: 0, canalToCanalAjustado: 0, regiaoToUf: 0, regiaoToMercadoAjustado: 0, ufToRegional: 0,
  };

  for (const r of real) {
    const rol = r.rol || 0;
    const weight = Math.abs(rol);
    if (!isUnassigned(r.sku)) {
      inUse.hierarquia.add(r.sku);
      inUse.inovacao.add(r.sku);
      if (missingOf(r.sku).length > 0) {
        bump(pendingAcc.hierarquia, r.sku, rol, r.skuDesc, false);
        uncovered.hierarquia += weight;
      }
      if (!inovacao[r.sku]) uncovered.inovacao += weight;
    }
    if (r.canal) {
      inUse.canalToCanalAjustado.add(r.canal);
      if (!r.canalAjustado) {
        bump(pendingAcc.canalToCanalAjustado, r.canal, rol, undefined, false);
        uncovered.canalToCanalAjustado += weight;
      }
    }
    if (r.regiao) {
      inUse.regiaoToUf.add(r.regiao);
      inUse.regiaoToMercadoAjustado.add(r.regiao);
      if (!r.uf) {
        bump(pendingAcc.regiaoToUf, r.regiao, rol, undefined, false);
        uncovered.regiaoToUf += weight;
      }
      if (!r.mercadoAjustado) {
        bump(pendingAcc.regiaoToMercadoAjustado, r.regiao, rol, undefined, false);
        uncovered.regiaoToMercadoAjustado += weight;
      }
    }
    if (r.uf) {
      inUse.ufToRegional.add(r.uf);
      if (!r.regional) {
        bump(pendingAcc.ufToRegional, r.uf, rol, undefined, false);
        uncovered.ufToRegional += weight;
      }
    }
  }

  // Budget: SKU e canal também passam pelos De/Paras. Sem ROL do Real para
  // medir, entram como "só no Budget" (depois das pendências com peso).
  for (const b of budget) {
    if (b.sku && !isUnassigned(b.sku) && missingOf(b.sku).length > 0 && !pendingAcc.hierarquia.has(b.sku)) {
      bump(pendingAcc.hierarquia, b.sku, 0, b.skuDesc, true);
    } else if (b.sku && pendingAcc.hierarquia.get(b.sku)?.budgetOnly) {
      pendingAcc.hierarquia.get(b.sku)!.rows++;
    }
    if (b.canal && !b.canalAjustado && !isUnassigned(b.canal)) {
      const acc = pendingAcc.canalToCanalAjustado.get(b.canal);
      if (acc) acc.rows++;
      else bump(pendingAcc.canalToCanalAjustado, b.canal, 0, undefined, true);
    }
  }

  const maps = {} as Record<DeParaMapId, MapHealth>;
  const all: PendingItem[] = [];
  for (const { id } of DEPARA_MAPS) {
    const pending: PendingItem[] = [];
    if (id !== "inovacao") {
      for (const [key, acc] of pendingAcc[id]) {
        pending.push({
          id: `${id}:${key}`,
          map: id,
          key,
          label: acc.label,
          rol: acc.rol,
          share: totalRol > 0 ? Math.abs(acc.rol) / totalRol : 0,
          rows: acc.rows,
          onlyBudget: acc.budgetOnly,
          missingFields: id === "hierarquia" ? missingOf(key) : undefined,
        });
      }
    }
    pending.sort(byImpact);
    maps[id] = {
      map: id,
      coverage: totalRol > 0 ? Math.max(0, 1 - uncovered[id] / totalRol) : null,
      keysInUse: inUse[id].size,
      pending,
    };
    all.push(...pending);
  }
  all.sort(byImpact);
  return { totalRol, maps, pending: all, hasData: real.length > 0 || budget.length > 0 };
}

/** Peso no ROL: "0,59%", "<0,01%" ou "sem ROL" (linhas zeradas). */
export function shareLabel(share: number): string {
  if (share <= 0) return "sem ROL";
  if (share < 0.0001) return "<0,01% do ROL";
  return `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(share * 100)}% do ROL`;
}

/** "97,7%", ">99,99%" quando falta pouco (nunca "100%" com pendência) ou "100%". */
export function coverageLabel(coverage: number): string {
  if (coverage >= 1) return "100%";
  if (coverage > 0.9999) return ">99,99%";
  const digits = coverage > 0.995 ? 2 : 1;
  return `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(coverage * 100)}%`;
}

function byImpact(a: PendingItem, b: PendingItem): number {
  if (a.onlyBudget !== b.onlyBudget) return a.onlyBudget ? 1 : -1;
  return Math.abs(b.rol) - Math.abs(a.rol) || b.rows - a.rows || a.key.localeCompare(b.key, "pt-BR");
}
