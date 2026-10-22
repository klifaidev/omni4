// Dados do "Margem por UF" da Análise de Preço, usados pela aba e pelo slide.
// A cor de cada estado é a contribuição marginal % do período de comparação.
import brMapRaw from "@/assets/br.svg?raw";
import { getUfFromRegiao, getComercialDeParaVersion } from "@/lib/deparaComercial";
import type { PricingRow } from "@/lib/types";

export type UfMapPoint = {
  uf: string;
  label: string;
  x: number;
  y: number;
};

export type BrazilStatePath = {
  uf: string;
  name: string;
  d: string;
};

const SVG_UF_ID = /^BR([A-Z]{2})$/;

export const UF_MAP_POINTS: UfMapPoint[] = [
  { uf: "RR", label: "Roraima", x: 322, y: 48 },
  { uf: "AP", label: "Amapá", x: 466, y: 88 },
  { uf: "AM", label: "Amazonas", x: 230, y: 154 },
  { uf: "PA", label: "Pará", x: 432, y: 170 },
  { uf: "AC", label: "Acre", x: 110, y: 285 },
  { uf: "RO", label: "Rondônia", x: 220, y: 292 },
  { uf: "MT", label: "Mato Grosso", x: 350, y: 330 },
  { uf: "TO", label: "Tocantins", x: 502, y: 302 },
  { uf: "MA", label: "Maranhão", x: 595, y: 222 },
  { uf: "PI", label: "Piauí", x: 650, y: 270 },
  { uf: "CE", label: "Ceará", x: 720, y: 248 },
  { uf: "RN", label: "Rio Grande do Norte", x: 790, y: 260 },
  { uf: "PB", label: "Paraíba", x: 806, y: 298 },
  { uf: "PE", label: "Pernambuco", x: 778, y: 330 },
  { uf: "AL", label: "Alagoas", x: 760, y: 366 },
  { uf: "SE", label: "Sergipe", x: 742, y: 402 },
  { uf: "BA", label: "Bahia", x: 642, y: 400 },
  { uf: "GO", label: "Goiás", x: 470, y: 416 },
  { uf: "DF", label: "Distrito Federal", x: 520, y: 396 },
  { uf: "MS", label: "Mato Grosso do Sul", x: 380, y: 505 },
  { uf: "MG", label: "Minas Gerais", x: 570, y: 500 },
  { uf: "ES", label: "Espírito Santo", x: 680, y: 514 },
  { uf: "RJ", label: "Rio de Janeiro", x: 626, y: 568 },
  { uf: "SP", label: "São Paulo", x: 516, y: 585 },
  { uf: "PR", label: "Paraná", x: 458, y: 660 },
  { uf: "SC", label: "Santa Catarina", x: 500, y: 730 },
  { uf: "RS", label: "Rio Grande do Sul", x: 468, y: 820 },
];
const VALID_UFS = new Set(UF_MAP_POINTS.map((point) => point.uf));
const STATE_NAME_TO_UF = new Map(
  UF_MAP_POINTS.flatMap((point) => [
    [normalizeText(point.label), point.uf],
    [normalizeText(point.uf), point.uf],
  ]),
);
STATE_NAME_TO_UF.set(normalizeText("Brasília"), "DF");
STATE_NAME_TO_UF.set(normalizeText("Distrito Federal"), "DF");

function normalizeText(value: string | undefined | null): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUf(value: string | undefined | null): string | null {
  const text = normalizeText(value);
  if (!text) return null;
  if (VALID_UFS.has(text)) return text;
  const brCode = text.match(/\bBR\s*\/\s*([A-Z]{2})\b/)?.[1];
  if (brCode && VALID_UFS.has(brCode)) return brCode;
  const exactName = STATE_NAME_TO_UF.get(text);
  if (exactName) return exactName;
  for (const [name, uf] of STATE_NAME_TO_UF) {
    if (name.length > 2 && text.includes(name)) return uf;
  }
  return null;
}

// Memória por par (uf, região): a normalização de texto por linha custava
// ~2 s numa base de 1,5 milhão de linhas, mas os pares distintos são poucos.
const ROW_UF_CACHE_MAX = 20_000;
const rowUfCache = new Map<string, string | null>();
let rowUfCacheVersion = -1;

export function getRowUf(row: { uf?: string; regiao?: string }): string | null {
  // O último recurso (UF pela região) vem do De/Para Comercial, que pode ser
  // corrigido com o app aberto: a memória recomeça quando ele muda.
  const version = getComercialDeParaVersion();
  if (version !== rowUfCacheVersion) {
    rowUfCache.clear();
    rowUfCacheVersion = version;
  }
  const key = `${row.uf ?? ""}\u0001${row.regiao ?? ""}`;
  const cached = rowUfCache.get(key);
  if (cached !== undefined) return cached;
  const uf = normalizeUf(row.uf) ?? normalizeUf(row.regiao) ?? normalizeUf(getUfFromRegiao(row.regiao));
  if (rowUfCache.size >= ROW_UF_CACHE_MAX) rowUfCache.clear();
  rowUfCache.set(key, uf);
  return uf;
}

function decodeSvgText(value: string): string {
  const doc = new DOMParser().parseFromString(`<textarea>${value}</textarea>`, "text/html");
  return doc.querySelector("textarea")?.value ?? value;
}

export function parseBrazilSvg(raw: string): { states: BrazilStatePath[]; labelPoints: UfMapPoint[] } {
  const doc = new DOMParser().parseFromString(raw, "image/svg+xml");
  const states = Array.from(doc.querySelectorAll("g#features path"))
    .map((path) => {
      const id = path.getAttribute("id") ?? "";
      const match = id.match(SVG_UF_ID);
      const d = path.getAttribute("d") ?? "";
      if (!match || !d) return null;
      return {
        uf: match[1],
        name: decodeSvgText(path.getAttribute("name") ?? match[1]),
        d,
      };
    })
    .filter(Boolean) as BrazilStatePath[];

  const labelPoints = Array.from(doc.querySelectorAll("g#label_points circle"))
    .map((circle) => {
      const id = circle.getAttribute("id") ?? "";
      const match = id.match(SVG_UF_ID);
      if (!match) return null;
      return {
        uf: match[1],
        label: decodeSvgText(circle.getAttribute("class") ?? match[1]),
        x: Number(circle.getAttribute("cx") ?? 0),
        y: Number(circle.getAttribute("cy") ?? 0),
      };
    })
    .filter((point): point is UfMapPoint => Boolean(point && point.x && point.y));

  return { states, labelPoints };
}


export interface UfMapPointData {
  uf: string;
  label: string;
  x: number;
  y: number;
  rol: number;
  volumeKg: number;
  contribMarginal: number;
  margemPct: number;
  precoMedio: number;
  volumeShare: number;
  precoBase: number | null;
  variacaoPreco: number | null;
  /** Valores de UF como aparecem nas linhas (para filtrar a visão na aba). */
  filterValues: string[];
}

export interface UfMapData {
  states: BrazilStatePath[];
  labelPoints: UfMapPoint[];
  data: UfMapPointData[];
  /** UFs com volume no período (as que ganham cor). */
  active: UfMapPointData[];
  minMargin: number;
  maxMargin: number;
  maxShare: number;
}

let brazilSvgCache: ReturnType<typeof parseBrazilSvg> | null = null;
export function brazilSvg() {
  brazilSvgCache ??= parseBrazilSvg(brMapRaw);
  return brazilSvgCache;
}

export function canColorState(point: { volumeKg: number; x: number; y: number }): boolean {
  return point.volumeKg > 0 && point.x > 0 && point.y > 0;
}

/** Margem, preço e volume por UF no período de comparação (e o preço na base). */
export function computeUfMap(
  rows: PricingRow[],
  base: string | null,
  comp: string | null,
  periodMode: "month" | "fy",
): UfMapData {
  const { states, labelPoints } = brazilSvg();
  const labelPointByUf = new Map(labelPoints.map((point) => [point.uf, point]));
  const matches = (periodo: string, fy: string, target: string | null) =>
    !!target && (periodMode === "fy" ? fy === target : periodo === target);

  const compByUf = new Map<string, { rol: number; volumeKg: number; contribMarginal: number; filterValues: Set<string> }>();
  const baseByUf = new Map<string, { rol: number; volumeKg: number }>();
  if (comp) {
    for (const row of rows) {
      // Só as linhas dos dois períodos comparados interessam: o período é
      // checado antes de resolver a UF (antes, a UF era resolvida para toda a
      // base). Mesmo resultado.
      const inComp = matches(row.periodo, row.fy, comp);
      const inBase = matches(row.periodo, row.fy, base);
      if (!inComp && !inBase) continue;
      const uf = getRowUf(row);
      if (!uf) continue;
      if (inComp) {
        const cur = compByUf.get(uf) ?? { rol: 0, volumeKg: 0, contribMarginal: 0, filterValues: new Set<string>() };
        cur.rol += row.rol;
        cur.volumeKg += row.volumeKg;
        cur.contribMarginal += row.contribMarginal;
        if (row.uf) cur.filterValues.add(row.uf);
        compByUf.set(uf, cur);
      }
      if (inBase) {
        const cur = baseByUf.get(uf) ?? { rol: 0, volumeKg: 0 };
        cur.rol += row.rol;
        cur.volumeKg += row.volumeKg;
        baseByUf.set(uf, cur);
      }
    }
  }

  const totalVolume = Array.from(compByUf.values()).reduce((acc, cur) => acc + Math.max(0, cur.volumeKg), 0);
  const data: UfMapPointData[] = comp
    ? states.map((state) => {
        const compValue = compByUf.get(state.uf) ?? { rol: 0, volumeKg: 0, contribMarginal: 0, filterValues: new Set<string>() };
        const baseValue = baseByUf.get(state.uf);
        const precoMedio = compValue.volumeKg > 0 ? compValue.rol / compValue.volumeKg : 0;
        const precoBase = baseValue && baseValue.volumeKg > 0 ? baseValue.rol / baseValue.volumeKg : null;
        const point = labelPointByUf.get(state.uf);
        return {
          uf: state.uf,
          label: point?.label ?? state.name,
          x: point?.x ?? 0,
          y: point?.y ?? 0,
          rol: compValue.rol,
          volumeKg: compValue.volumeKg,
          contribMarginal: compValue.contribMarginal,
          margemPct: compValue.rol > 0 ? compValue.contribMarginal / compValue.rol : 0,
          precoMedio,
          volumeShare: totalVolume > 0 && compValue.volumeKg > 0 ? compValue.volumeKg / totalVolume : 0,
          precoBase,
          variacaoPreco: precoBase !== null ? precoMedio - precoBase : null,
          filterValues: Array.from(compValue.filterValues),
        };
      })
    : [];

  const active = data.filter(canColorState);
  const margins = active.map((point) => point.margemPct).filter(Number.isFinite);
  return {
    states,
    labelPoints,
    data,
    active,
    minMargin: margins.length ? Math.min(...margins) : 0,
    maxMargin: margins.length ? Math.max(...margins) : 0,
    maxShare: Math.max(...active.map((point) => point.volumeShare), 0),
  };
}
