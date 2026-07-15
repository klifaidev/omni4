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

const RAW = deparaJson as Record<string, DeParaEntry>;
const OVERRIDES_STORAGE_KEY = "omni4.depara.skuOverrides.v1";

let runtimeOverrides: Record<string, DeParaEntry> = loadStoredOverrides();

function loadStoredOverrides(): Record<string, DeParaEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(OVERRIDES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, DeParaEntry>;
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
}

/** Lookup direto por código SKU (string). */
export function getDeParaBySku(sku: string | undefined | null): DeParaEntry | null {
  if (!sku) return null;
  const key = String(sku).trim();
  if (!key) return null;
  return runtimeOverrides[key] ?? RAW[key] ?? null;
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

export function upsertDeParaEntries(entries: Record<string, DeParaEntry>) {
  runtimeOverrides = { ...runtimeOverrides, ...entries };
  persistOverrides();
}

export function getDeParaOverrides(): Record<string, DeParaEntry> {
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
