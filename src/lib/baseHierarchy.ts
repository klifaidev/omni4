// Hierarquia como veio na base original (KE30), por SKU — antes do De/Para
// sobrescrever. Ex.: marca "B1 Top", categoria "A1 Chocolates".
//
// Serve para aprender a tradução base → De/Para com os SKUs já classificados
// ("B1 Top" virou "Top" em 72 de 72 SKUs) e sugerir o mesmo para os novos.
// Fica só em memória; cada leitura de base (arquivo novo ou cache) registra.

export type BaseHierField = "categoria" | "subcategoria" | "marca" | "tecnologia" | "formato" | "mercado" | "faixaPeso" | "sabor";

export type BaseHierarchy = Record<string, Partial<Record<BaseHierField, string>>>;

export const BASE_HIER_FIELDS: BaseHierField[] = [
  "categoria", "subcategoria", "marca", "tecnologia", "formato", "mercado", "faixaPeso", "sabor",
];

const UNASSIGNED = /^(#|tbd|n[aã]o atribu[ií]do)$/i;

/** Valor da base que vale a pena guardar (não vazio, não "não atribuído"). */
export function usableBaseValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && !UNASSIGNED.test(text) ? text : null;
}

const registry = new Map<string, Partial<Record<BaseHierField, string>>>();
let stamp = 0;

/** Junta o que uma base trouxe ao que já se sabe (não apaga o que já existia). */
export function registerBaseHierarchy(map: BaseHierarchy | undefined): void {
  if (!map) return;
  let changed = false;
  for (const [sku, fields] of Object.entries(map)) {
    const current = registry.get(sku) ?? {};
    for (const f of BASE_HIER_FIELDS) {
      const v = fields[f];
      if (v && current[f] === undefined) {
        current[f] = v;
        changed = true;
      }
    }
    registry.set(sku, current);
  }
  if (changed) stamp++;
}

export function getBaseHierarchy(sku: string): Partial<Record<BaseHierField, string>> | undefined {
  return registry.get(sku);
}

export function allBaseHierarchy(): ReadonlyMap<string, Partial<Record<BaseHierField, string>>> {
  return registry;
}

/** Muda sempre que algo novo é registrado. */
export function baseHierarchyStamp(): number {
  return stamp;
}

/** Só para testes. */
export function clearBaseHierarchy(): void {
  registry.clear();
  stamp++;
}
