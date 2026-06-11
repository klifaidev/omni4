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

/** Lookup direto por código SKU (string). */
export function getDeParaBySku(sku: string | undefined | null): DeParaEntry | null {
  if (!sku) return null;
  const key = String(sku).trim();
  if (!key) return null;
  return RAW[key] ?? null;
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

