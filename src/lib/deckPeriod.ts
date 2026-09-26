// Período global do deck (aba Slides).
//
// 1. Mês de referência: o deck passa a "enxergar" o realizado só até esse
//    mês. Tudo que é relativo ("mês mais recente - 1", "últimos 6 meses",
//    FY mais recente) conta a partir dele, e gráficos de evolução param nele —
//    dá pra apresentar o fechamento de julho com agosto já carregado. O plano
//    de Budget não é cortado (o Budget Evolutivo mostra os meses futuros).
//
// 2. Avançar o deck: empurra os períodos FIXOS (escolhidos à mão) +N meses,
//    em blocos e slides nativos. É o que transforma o deck do mês passado no
//    deste mês.

import type { SlideItem } from "@/lib/slidesFlow";

type MonthPoint = { mes: number; ano: number };

/** "008.2026" → { mes: 8, ano: 2026 }. Outros formatos (FY) → null. */
export function parsePeriodo(periodo: string | null | undefined): MonthPoint | null {
  const match = /^(\d{1,3})\.(\d{4})$/.exec(periodo?.trim() ?? "");
  if (!match) return null;
  const mes = Number(match[1]);
  const ano = Number(match[2]);
  return mes >= 1 && mes <= 12 ? { mes, ano } : null;
}

const monthIndex = ({ mes, ano }: MonthPoint) => ano * 12 + (mes - 1);

export function shiftPeriodo(periodo: string, months: number): string | null {
  const point = parsePeriodo(periodo);
  if (!point) return null;
  const idx = monthIndex(point) + months;
  const ano = Math.floor(idx / 12);
  const mes = (idx % 12) + 1;
  return `${String(mes).padStart(3, "0")}.${ano}`;
}

// ---------------------------------------------------------------------------
// 1. Mês de referência
// ---------------------------------------------------------------------------

const capCache = new WeakMap<readonly object[], Map<string, readonly object[]>>();

/**
 * Linhas com mês depois da referência saem. `keep` decide linhas que nunca
 * são cortadas (ex.: plano de Budget). Cache por (array, referência): trocar
 * a referência recalcula uma vez; o mesmo array de entrada devolve o mesmo
 * array de saída (os memos dos blocos seguem estáveis).
 */
export function capRowsAtReference<T extends { mes: number; ano: number }>(
  rows: readonly T[],
  reference: string | null,
  keep?: (row: T) => boolean,
): T[] {
  const ref = parsePeriodo(reference);
  if (!ref) return rows as T[];
  const cacheKey = `${reference}|${keep ? "k" : ""}`;
  let byRef = capCache.get(rows);
  const cached = byRef?.get(cacheKey);
  if (cached) return cached as T[];
  const limit = monthIndex(ref);
  const capped = rows.filter((row) => (keep?.(row) ?? false) || monthIndex(row) <= limit);
  if (!byRef) {
    byRef = new Map();
    capCache.set(rows, byRef);
  }
  byRef.set(cacheKey, capped);
  return capped;
}

// ---------------------------------------------------------------------------
// 2. Avançar períodos fixos
// ---------------------------------------------------------------------------

export interface AdvanceDeckResult {
  items: SlideItem[];
  /** Campos de período alterados. */
  changed: number;
  /** Slides com ao menos uma alteração. */
  slides: number;
  /** Períodos fixos em ano fiscal — não mudam num avanço mensal. */
  skippedFiscal: number;
  /** Maior mês resultante (para avisar quando passa da base). */
  latest: string | null;
}

type Rec = Record<string, unknown>;

export function advanceDeckFixedPeriods(items: SlideItem[], months = 1): AdvanceDeckResult {
  let changed = 0;
  let skippedFiscal = 0;
  let latest: string | null = null;
  const touched = new Set<string>();

  const track = (value: string) => {
    const point = parsePeriodo(value);
    const current = parsePeriodo(latest);
    if (point && (!current || monthIndex(point) > monthIndex(current))) latest = value;
  };
  /** Avança um período fixo; devolve o novo valor (ou o original se não é mês). */
  const shiftOne = (slideId: string, value: unknown): unknown => {
    if (typeof value !== "string" || !value) return value;
    const next = shiftPeriodo(value, months);
    if (!next) {
      skippedFiscal++;
      return value;
    }
    changed++;
    touched.add(slideId);
    track(next);
    return next;
  };
  const shiftList = (slideId: string, values: unknown): unknown =>
    Array.isArray(values) ? values.map((v) => shiftOne(slideId, v)) : values;
  const isFixed = (mode: unknown) => mode !== "relative";

  const next = items.map((original) => {
    const item = JSON.parse(JSON.stringify(original)) as SlideItem;
    const cfg = item.config as unknown as Rec;

    if (item.kind === "bridge_pvm") {
      if (cfg.mode === "month") {
        cfg.base = shiftOne(item.id, cfg.base);
        cfg.comp = shiftOne(item.id, cfg.comp);
      } else if (cfg.base || cfg.comp) {
        skippedFiscal++;
      }
      return item;
    }
    if (item.kind === "budget_evo") {
      cfg.start = shiftOne(item.id, cfg.start);
      cfg.end = shiftOne(item.id, cfg.end);
      return item;
    }
    if (item.kind !== "custom") return item;

    for (const raw of item.config.blocks) {
      const b = raw as unknown as Rec;
      switch (b.kind) {
        case "kpi":
        case "topSku":
          if (isFixed(b.periodSelectionMode) && b.periodValue) {
            if (b.periodMode === "month") b.periodValue = shiftOne(item.id, b.periodValue);
            else if (b.periodMode === "fy") skippedFiscal++;
          }
          break;
        case "table": {
          const mf = b.monthFilter as Rec | null | undefined;
          if (mf && mf.mode === "fixed") mf.periods = shiftList(item.id, mf.periods);
          break;
        }
        case "dre":
          if (isFixed(b.periodosSelectionMode) && Array.isArray(b.periodos)) {
            if (b.periodMode === "month") b.periodos = shiftList(item.id, b.periodos);
            else skippedFiscal++;
          }
          break;
        case "bridge":
          if (b.mode === "month") {
            if (isFixed(b.baseSelectionMode)) b.base = shiftOne(item.id, b.base);
            if (isFixed(b.compSelectionMode)) b.comp = shiftOne(item.id, b.comp);
          } else if (b.base || b.comp) {
            skippedFiscal++;
          }
          break;
        case "chart": {
          const pvm = ((b.style as Rec | undefined)?.waterfall as Rec | undefined)?.pvm as Rec | undefined;
          if (pvm && pvm.periodMode === "month") {
            pvm.base = shiftOne(item.id, pvm.base);
            pvm.comp = shiftOne(item.id, pvm.comp);
          }
          break;
        }
        default:
          if (typeof b.kind === "string" && b.kind.startsWith("omni_")) {
            b.periodos = shiftList(item.id, b.periodos);
            if ("base" in b || "comp" in b) {
              if (b.periodMode === "month") {
                if (isFixed(b.baseSelectionMode)) b.base = shiftOne(item.id, b.base);
                if (isFixed(b.compSelectionMode)) b.comp = shiftOne(item.id, b.comp);
              } else if (b.base || b.comp) {
                skippedFiscal++;
              }
            }
            if ("periodoRef" in b) b.periodoRef = shiftOne(item.id, b.periodoRef);
            if ("periodoComp" in b) b.periodoComp = shiftOne(item.id, b.periodoComp);
          }
      }
    }
    return item;
  });

  return { items: next, changed, slides: touched.size, skippedFiscal, latest };
}
