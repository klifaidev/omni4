// De Para Comercial — fonte de verdade para Canal Ajustado, UF,
// Mercado Ajustado e Regional. Sobrescreve qualquer valor vindo do CSV.
import data from "@/data/depara_comercial.json";

interface DeParaComercial {
  canalToCanalAjustado: Record<string, string>;
  regiaoToUf: Record<string, string>;
  regiaoToMercadoAjustado: Record<string, string>;
  ufToRegional: Record<string, string>;
}

const RAW = data as DeParaComercial;

// Normaliza chave: lowercase, sem acentos, espaços colapsados.
function norm(s: string | undefined | null): string {
  if (!s) return "";
  return String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function buildIndex(map: Record<string, string>): Map<string, string> {
  const idx = new Map<string, string>();
  for (const [k, v] of Object.entries(map)) {
    idx.set(norm(k), v);
  }
  return idx;
}

const CANAL_IDX = buildIndex(RAW.canalToCanalAjustado);
const REGIAO_UF_IDX = buildIndex(RAW.regiaoToUf);
const REGIAO_MERC_IDX = buildIndex(RAW.regiaoToMercadoAjustado);
const UF_REGIONAL_IDX = buildIndex(RAW.ufToRegional);

export function getCanalAjustado(canalRaw: string | undefined | null): string | null {
  const k = norm(canalRaw);
  if (!k) return null;
  return CANAL_IDX.get(k) ?? null;
}

export function getUfFromRegiao(regiaoRaw: string | undefined | null): string | null {
  const k = norm(regiaoRaw);
  if (!k) return null;
  return REGIAO_UF_IDX.get(k) ?? null;
}

export function getMercadoAjustadoFromRegiao(regiaoRaw: string | undefined | null): string | null {
  const k = norm(regiaoRaw);
  if (!k) return null;
  return REGIAO_MERC_IDX.get(k) ?? null;
}

export function getRegionalFromUf(uf: string | undefined | null): string | null {
  const k = norm(uf);
  if (!k) return null;
  return UF_REGIONAL_IDX.get(k) ?? null;
}
