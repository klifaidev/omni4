// Hierarquia como veio na base original (KE30), por SKU — antes do De/Para
// sobrescrever. Ex.: marca "B1 Top", categoria "A1 Chocolates".
//
// Serve para aprender a tradução base → De/Para com os SKUs já classificados
// ("B1 Top" virou "Top" em 72 de 72 SKUs) e para a coluna DE do De/Para 360.
// Fica guardada neste computador: um SKU visto em qualquer base (ou na
// planilha DE/PARA do time) continua com o DE mesmo fora dos meses carregados.
import { normHeader } from "./format";

export type BaseHierField = "categoria" | "subcategoria" | "marca" | "tecnologia" | "formato" | "mercado" | "faixaPeso" | "sabor";

export type BaseHierarchy = Record<string, Partial<Record<BaseHierField, string>>>;

export const BASE_HIER_FIELDS: BaseHierField[] = [
  "categoria", "subcategoria", "marca", "tecnologia", "formato", "mercado", "faixaPeso", "sabor",
];

/**
 * Coluna da base → nível da hierarquia. É um mapa próprio porque o leitor da
 * base junta colunas ("03 Família" vira categoria, "04 Formato" vira
 * subcategoria); aqui cada nível da KE30 fica no seu lugar.
 */
const RAW_HIER_HEADERS: Record<BaseHierField, string[]> = {
  categoria: ["01 Categoria", "Categoria"],
  subcategoria: ["Subcategoria"],
  marca: ["02 Marca", "Marca"],
  tecnologia: ["03 Família", "Família", "Tecnologia"],
  formato: ["04 Formato", "Formato"],
  mercado: ["05 Mercado", "Mercado"],
  faixaPeso: ["06 Faixa de Peso", "Faixa de Peso", "Faixa Peso"],
  sabor: ["07 Sabor", "Sabor"],
};

/** Índice da coluna de cada nível (o primeiro apelido presente vence). */
export function baseHierarchyColumns(headers: string[]): [number, BaseHierField][] {
  const norm = headers.map((h) => normHeader(String(h ?? "").trim()));
  const out: [number, BaseHierField][] = [];
  for (const field of BASE_HIER_FIELDS) {
    for (const alias of RAW_HIER_HEADERS[field]) {
      const index = norm.indexOf(normHeader(alias));
      if (index >= 0) {
        out.push([index, field]);
        break;
      }
    }
  }
  return out;
}

const UNASSIGNED = /^(#|tbd|n[aã]o atribu[ií]do)$/i;

/** Valor da base que vale a pena guardar (não vazio, não "não atribuído"). */
export function usableBaseValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && !UNASSIGNED.test(text) ? text : null;
}

const STORAGE_KEY = "omni4.baseHierarchy.v1";

const registry = new Map<string, Partial<Record<BaseHierField, string>>>();
let stamp = 0;

// Gravado compacto: lista de valores + por SKU o índice de cada nível.
interface Stored {
  values: string[];
  skus: Record<string, (number | null)[]>;
}

function load(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const stored = JSON.parse(raw) as Stored;
    for (const [sku, idx] of Object.entries(stored.skus ?? {})) {
      const fields: Partial<Record<BaseHierField, string>> = {};
      BASE_HIER_FIELDS.forEach((f, i) => {
        const v = idx[i];
        if (v != null && stored.values[v] !== undefined) fields[f] = stored.values[v];
      });
      registry.set(sku, fields);
    }
  } catch {
    // Arquivo corrompido: recomeça do que as bases trouxerem.
  }
}

function save(): void {
  if (typeof window === "undefined") return;
  try {
    const values: string[] = [];
    const index = new Map<string, number>();
    const skus: Stored["skus"] = {};
    for (const [sku, fields] of registry) {
      skus[sku] = BASE_HIER_FIELDS.map((f) => {
        const v = fields[f];
        if (v === undefined) return null;
        let i = index.get(v);
        if (i === undefined) {
          i = values.push(v) - 1;
          index.set(v, i);
        }
        return i;
      });
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ values, skus } satisfies Stored));
  } catch {
    // Sem espaço: vale nesta sessão.
  }
}

load();

/**
 * Junta o que uma base trouxe ao que já se sabe. Por padrão a base mais nova
 * vence (a classificação da KE30 pode mudar); com `onlyMissing` só completa
 * o que falta (ex.: DE vindo da planilha do time).
 */
export function registerBaseHierarchy(map: BaseHierarchy | undefined, options: { onlyMissing?: boolean } = {}): void {
  if (!map) return;
  let changed = false;
  for (const [sku, fields] of Object.entries(map)) {
    const current = registry.get(sku) ?? {};
    for (const f of BASE_HIER_FIELDS) {
      const v = fields[f];
      if (!v || current[f] === v) continue;
      if (options.onlyMissing && current[f] !== undefined) continue;
      current[f] = v;
      changed = true;
    }
    registry.set(sku, current);
  }
  if (changed) {
    stamp++;
    save();
  }
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
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // sem armazenamento
  }
}
