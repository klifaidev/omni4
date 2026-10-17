// De Para — fonte de verdade para atributos de SKU.
// Sobrescreve qualquer valor vindo do CSV original.
import deparaJson from "@/data/depara.json";

export interface DeParaEntry {
  categoria: string;
  subcategoria: string;
  marca: string;
  tecnologia: string;
  formato: string;
  mercado: string;
  faixaPeso: string;
  sabor: string;
  skuDesc: string;
}

export type DeParaOverrideEntry = Partial<DeParaEntry>;

const RAW = deparaJson as Record<string, DeParaEntry>;
const OVERRIDES_STORAGE_KEY = "omni4.depara.skuOverrides.v1";

const EMPTY_ENTRY: DeParaEntry = {
  categoria: "",
  subcategoria: "",
  marca: "",
  tecnologia: "",
  formato: "",
  mercado: "",
  faixaPeso: "",
  sabor: "",
  skuDesc: "",
};

let runtimeOverrides: Record<string, DeParaOverrideEntry> = loadStoredOverrides();

function loadStoredOverrides(): Record<string, DeParaOverrideEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(OVERRIDES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, DeParaOverrideEntry>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function persistOverrides() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify(runtimeOverrides));
  } catch {
    // Sem persistência local disponível; mantém a correção em memória nesta sessão.
  }
  // Invalida o cache de bases já processadas: sem isso, na próxima abertura o app
  // recarregaria as linhas antigas (do disco) em vez de reaplicar o De/Para atualizado.
  void window.electronAPI?.bases?.invalidarProcessado?.();
}

/** Lookup direto por código SKU (string). */
export function getDeParaBySku(sku: string | undefined | null): DeParaEntry | null {
  if (!sku) return null;
  const key = String(sku).trim();
  if (!key) return null;
  const base = RAW[key];
  const override = runtimeOverrides[key];
  if (!base && !override) return null;
  return { ...EMPTY_ENTRY, ...(base ?? {}), ...(override ?? {}) };
}

export const DEPARA_SIZE = Object.keys(RAW).length;

/** Campos obrigatórios para considerar um SKU 100% mapeado no De Para. */
export const DEPARA_FIELDS: (keyof DeParaEntry)[] = [
  "categoria",
  "subcategoria",
  "marca",
  "tecnologia",
  "formato",
  "mercado",
  "faixaPeso",
  "sabor",
  "skuDesc",
];

const isBlank = (v?: string) => {
  const s = (v ?? "").trim();
  return !s || s.toUpperCase() === "TBD";
};

/**
 * Retorna a lista de campos faltantes do SKU no De Para.
 * - SKU ausente do De Para → todos os campos faltam.
 * - SKU presente, mas com algum campo em branco → retorna apenas esses.
 * - SKU 100% preenchido → array vazio.
 */
export function getMissingDeParaFields(sku: string | undefined | null): (keyof DeParaEntry)[] {
  const entry = getDeParaBySku(sku);
  if (!entry) return [...DEPARA_FIELDS];
  return DEPARA_FIELDS.filter((f) => isBlank(entry[f]));
}

export function upsertDeParaEntries(entries: Record<string, DeParaOverrideEntry>) {
  runtimeOverrides = { ...runtimeOverrides };
  for (const [sku, entry] of Object.entries(entries)) {
    runtimeOverrides[sku] = { ...(runtimeOverrides[sku] ?? {}), ...entry };
  }
  persistOverrides();
}

export function getDeParaOverrides(): Record<string, DeParaOverrideEntry> {
  return { ...runtimeOverrides };
}

export function getDeParaFieldOptions(field: keyof DeParaEntry): string[] {
  const values = new Set<string>();
  for (const entry of [...Object.values(RAW), ...Object.values(runtimeOverrides)]) {
    const value = entry[field]?.trim();
    if (!isBlank(value)) values.add(value);
  }
  return Array.from(values).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
}

export interface DeParaSkuSearchResult {
  sku: string;
  entry: DeParaEntry;
  missingFields: (keyof DeParaEntry)[];
  hasOverride: boolean;
}

const allSkuKeys = () => new Set([...Object.keys(RAW), ...Object.keys(runtimeOverrides)]);

/**
 * Busca SKUs (por código ou descrição) em todo o De/Para — completos ou não —
 * para permitir reclassificação manual mesmo de SKUs já mapeados.
 */
export function searchDeParaSkus(query: string, limit = 60): DeParaSkuSearchResult[] {
  const q = query.trim().toUpperCase();
  const keys = Array.from(allSkuKeys()).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const results: DeParaSkuSearchResult[] = [];
  for (const sku of keys) {
    const entry = getDeParaBySku(sku);
    if (!entry) continue;
    if (q) {
      const haystack = `${sku} ${entry.skuDesc}`.toUpperCase();
      if (!haystack.includes(q)) continue;
    }
    results.push({
      sku,
      entry,
      missingFields: getMissingDeParaFields(sku),
      hasOverride: Boolean(runtimeOverrides[sku]),
    });
    if (results.length >= limit) break;
  }
  return results;
}

/** Desfaz a correção feita no app para o SKU (volta ao De/Para padrão). */
export function removeDeParaOverride(sku: string) {
  if (!runtimeOverrides[sku]) return;
  runtimeOverrides = { ...runtimeOverrides };
  delete runtimeOverrides[sku];
  persistOverrides();
}

/** Correção atual do SKU no app (cópia), ou null. */
export function getDeParaOverride(sku: string): DeParaOverrideEntry | null {
  return runtimeOverrides[sku] ? { ...runtimeOverrides[sku] } : null;
}

/** Volta as correções dos SKUs exatamente ao estado guardado (null = sem correção). */
export function restoreDeParaOverrides(snapshot: Record<string, DeParaOverrideEntry | null>) {
  runtimeOverrides = { ...runtimeOverrides };
  for (const [sku, entry] of Object.entries(snapshot)) {
    if (entry) runtimeOverrides[sku] = { ...entry };
    else delete runtimeOverrides[sku];
  }
  persistOverrides();
}

export function hasDeParaOverride(sku: string): boolean {
  return Boolean(runtimeOverrides[sku]);
}

/** SKU está no De/Para padrão do app (não foi criado aqui)? */
export function isDefaultDeParaSku(sku: string): boolean {
  return Boolean(RAW[sku]);
}

export interface DeParaListEntry {
  sku: string;
  entry: DeParaEntry;
  source: "padrao" | "app";
  missingFields: (keyof DeParaEntry)[];
}

/** Todos os SKUs do De/Para (padrão + corrigidos/criados no app). */
export function listDeParaEntries(): DeParaListEntry[] {
  return Array.from(allSkuKeys())
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .map((sku) => ({
      sku,
      entry: getDeParaBySku(sku)!,
      source: runtimeOverrides[sku] ? "app" : "padrao",
      missingFields: getMissingDeParaFields(sku),
    }));
}

/** Entradas completas (todos os campos) — base das sugestões. */
export function completeDeParaEntries(): Array<{ sku: string; entry: DeParaEntry }> {
  const out: Array<{ sku: string; entry: DeParaEntry }> = [];
  for (const sku of allSkuKeys()) {
    if (getMissingDeParaFields(sku).length > 0) continue;
    out.push({ sku, entry: getDeParaBySku(sku)! });
  }
  return out;
}
