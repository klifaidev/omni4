// De Para Comercial — fonte de verdade para Canal Ajustado, UF,
// Mercado Ajustado e Regional. Sobrescreve qualquer valor vindo do CSV.
//
// O mapeamento padrão vem do app (depara_comercial.json); correções feitas na
// Central de De/Paras ficam guardadas neste computador e valem por cima dele.
import data from "@/data/depara_comercial.json";

interface DeParaComercial {
  canalToCanalAjustado: Record<string, string>;
  regiaoToUf: Record<string, string>;
  regiaoToMercadoAjustado: Record<string, string>;
  ufToRegional: Record<string, string>;
}

export type ComercialMapId = keyof DeParaComercial;

export const COMERCIAL_MAP_IDS: ComercialMapId[] = [
  "canalToCanalAjustado",
  "regiaoToUf",
  "regiaoToMercadoAjustado",
  "ufToRegional",
];

const RAW = data as DeParaComercial;
const OVERRIDES_STORAGE_KEY = "omni4.depara.comercialOverrides.v1";

type Overrides = Record<ComercialMapId, Record<string, string>>;

// Normaliza chave: lowercase, sem acentos, espaços colapsados.
export function normComercialKey(s: string | undefined | null): string {
  if (!s) return "";
  return String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const norm = normComercialKey;

function emptyOverrides(): Overrides {
  return { canalToCanalAjustado: {}, regiaoToUf: {}, regiaoToMercadoAjustado: {}, ufToRegional: {} };
}

function loadOverrides(): Overrides {
  const out = emptyOverrides();
  if (typeof window === "undefined") return out;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(OVERRIDES_STORAGE_KEY) ?? "{}") as Partial<Overrides>;
    for (const id of COMERCIAL_MAP_IDS) {
      const map = parsed?.[id];
      if (map && typeof map === "object") {
        for (const [k, v] of Object.entries(map)) if (typeof v === "string") out[id][k] = v;
      }
    }
  } catch {
    /* sem correções salvas */
  }
  return out;
}

let overrides: Overrides = loadOverrides();

function buildIndex(map: Record<string, string>): Map<string, string> {
  const idx = new Map<string, string>();
  for (const [k, v] of Object.entries(map)) {
    idx.set(norm(k), v);
  }
  return idx;
}

let indexes = buildIndexes();

function buildIndexes(): Record<ComercialMapId, Map<string, string>> {
  return Object.fromEntries(
    COMERCIAL_MAP_IDS.map((id) => [id, buildIndex({ ...RAW[id], ...overrides[id] })]),
  ) as Record<ComercialMapId, Map<string, string>>;
}

// Valores ajustados conhecidos (ex.: "ESPECIALIZADO"). Uma base que já traz o
// canal ajustado — o Budget traz — se mapeia para ele mesmo.
let canalAjustadoIdentity = buildCanalIdentity();

function buildCanalIdentity(): Map<string, string> {
  const idx = new Map<string, string>();
  for (const value of Object.values({ ...RAW.canalToCanalAjustado, ...overrides.canalToCanalAjustado })) {
    idx.set(norm(value), value);
  }
  return idx;
}

function persist() {
  indexes = buildIndexes();
  canalAjustadoIdentity = buildCanalIdentity();
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    /* sem armazenamento: vale nesta sessão */
  }
  // O cache das bases processadas guarda o resultado do De/Para: precisa ser refeito.
  void window.electronAPI?.bases?.invalidarProcessado?.();
}

export function getCanalAjustado(canalRaw: string | undefined | null): string | null {
  const k = norm(canalRaw);
  if (!k) return null;
  return indexes.canalToCanalAjustado.get(k) ?? canalAjustadoIdentity.get(k) ?? null;
}

export function getUfFromRegiao(regiaoRaw: string | undefined | null): string | null {
  const k = norm(regiaoRaw);
  if (!k) return null;
  return indexes.regiaoToUf.get(k) ?? null;
}

export function getMercadoAjustadoFromRegiao(regiaoRaw: string | undefined | null): string | null {
  const k = norm(regiaoRaw);
  if (!k) return null;
  return indexes.regiaoToMercadoAjustado.get(k) ?? null;
}

export function getRegionalFromUf(uf: string | undefined | null): string | null {
  const k = norm(uf);
  if (!k) return null;
  return indexes.ufToRegional.get(k) ?? null;
}

// ── Administração (Central de De/Paras) ──────────────────────────────────

export interface ComercialEntry {
  key: string;
  value: string;
  /** "padrao" = veio com o app; "app" = corrigido aqui (ou novo). */
  source: "padrao" | "app";
}

/** Todas as linhas do mapeamento, com a correção do app valendo por cima. */
export function getComercialEntries(id: ComercialMapId): ComercialEntry[] {
  const byKey = new Map<string, ComercialEntry>();
  for (const [key, value] of Object.entries(RAW[id])) byKey.set(norm(key), { key, value, source: "padrao" });
  for (const [key, value] of Object.entries(overrides[id])) byKey.set(norm(key), { key, value, source: "app" });
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key, "pt-BR"));
}

/** Valores já usados no mapeamento (para escolher em vez de digitar). */
export function getComercialValueOptions(id: ComercialMapId): string[] {
  const values = new Set<string>();
  for (const v of Object.values({ ...RAW[id], ...overrides[id] })) if (v.trim()) values.add(v.trim());
  return [...values].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function upsertComercialOverrides(id: ComercialMapId, entries: Record<string, string>) {
  overrides = { ...overrides, [id]: { ...overrides[id] } };
  for (const [key, value] of Object.entries(entries)) {
    // A chave guardada é o texto como aparece na base (a busca normaliza).
    for (const existing of Object.keys(overrides[id])) if (norm(existing) === norm(key)) delete overrides[id][existing];
    overrides[id][key] = value.trim();
  }
  persist();
}

/** Desfaz a correção feita no app (volta ao padrão, ou a "sem mapeamento"). */
export function removeComercialOverride(id: ComercialMapId, key: string) {
  overrides = { ...overrides, [id]: { ...overrides[id] } };
  for (const existing of Object.keys(overrides[id])) if (norm(existing) === norm(key)) delete overrides[id][existing];
  persist();
}

export function countComercialOverrides(): number {
  return COMERCIAL_MAP_IDS.reduce((sum, id) => sum + Object.keys(overrides[id]).length, 0);
}
