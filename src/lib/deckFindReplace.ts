// Localizar e substituir no deck inteiro: títulos e textos dos slides
// personalizados, rótulos de KPI, títulos de gráficos/tabelas e capas.
// Bloco bloqueado aparece na busca mas não é alterado (e a contagem diz isso).

import type { CustomBlock } from "./customSlide";
import type { SlideItem } from "./slidesFlow";

export interface FindOptions {
  matchCase?: boolean;
}

export interface DeckMatch {
  itemId: string;
  /** Posição do slide na esteira (1, 2, 3…). */
  slideNumber: number;
  /** Bloco do slide personalizado (ausente para campos da capa). */
  blockId?: string;
  /** Onde o texto mora: "text", "label", "title", "subtitle". */
  field: string;
  /** Texto completo do campo (para mostrar o trecho). */
  text: string;
  /** Quantas ocorrências neste campo. */
  count: number;
  locked: boolean;
}

/** Campos de texto editáveis de cada tipo de bloco. */
function blockFields(b: CustomBlock): string[] {
  if (b.kind === "title" || b.kind === "text") return ["text"];
  if (b.kind === "kpi") return ["label"];
  const title = (b as { title?: unknown }).title;
  return typeof title === "string" ? ["title"] : [];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matcher(query: string, opts: FindOptions): RegExp {
  return new RegExp(escapeRegExp(query), opts.matchCase ? "g" : "gi");
}

function countIn(text: string, re: RegExp): number {
  re.lastIndex = 0;
  return text.match(re)?.length ?? 0;
}

export function findInDeck(items: readonly SlideItem[], query: string, opts: FindOptions = {}): DeckMatch[] {
  if (!query) return [];
  const re = matcher(query, opts);
  const out: DeckMatch[] = [];
  items.forEach((item, i) => {
    const slideNumber = i + 1;
    if (item.kind === "custom") {
      for (const b of item.config.blocks) {
        for (const field of blockFields(b)) {
          const text = (b as unknown as Record<string, unknown>)[field];
          if (typeof text !== "string") continue;
          const count = countIn(text, re);
          if (count) out.push({ itemId: item.id, slideNumber, blockId: b.id, field, text, count, locked: !!b.locked });
        }
      }
    } else if (item.kind === "cover") {
      for (const field of ["title", "subtitle"] as const) {
        const text = item.config[field];
        if (typeof text !== "string") continue;
        const count = countIn(text, re);
        if (count) out.push({ itemId: item.id, slideNumber, field, text, count, locked: false });
      }
    }
  });
  return out;
}

export interface ReplaceResult {
  items: SlideItem[];
  /** Ocorrências trocadas. */
  replaced: number;
  /** Ocorrências que ficaram porque o bloco está bloqueado. */
  skippedLocked: number;
  /** Ids dos slides que mudaram. */
  changedItemIds: string[];
}

/** Troca todas as ocorrências (ou só as dos slides em `onlyItemIds`).
 *  Não muda os objetos recebidos: devolve itens novos onde algo mudou. */
export function replaceInDeck(
  items: readonly SlideItem[],
  query: string,
  replacement: string,
  opts: FindOptions = {},
  onlyItemIds?: ReadonlySet<string>,
): ReplaceResult {
  if (!query) return { items: [...items], replaced: 0, skippedLocked: 0, changedItemIds: [] };
  const re = matcher(query, opts);
  let replaced = 0;
  let skippedLocked = 0;
  const changedItemIds: string[] = [];
  // Função de troca: o texto de substituição é literal (sem $1, $& etc.).
  const swap = (text: string) => {
    re.lastIndex = 0;
    return text.replace(re, () => replacement);
  };

  const next = items.map((item) => {
    if (onlyItemIds && !onlyItemIds.has(item.id)) return item;
    if (item.kind === "custom") {
      let changed = false;
      const blocks = item.config.blocks.map((b) => {
        let patch: Record<string, string> | null = null;
        for (const field of blockFields(b)) {
          const text = (b as unknown as Record<string, unknown>)[field];
          if (typeof text !== "string") continue;
          const count = countIn(text, re);
          if (!count) continue;
          if (b.locked) { skippedLocked += count; continue; }
          replaced += count;
          patch = { ...(patch ?? {}), [field]: swap(text) };
        }
        if (!patch) return b;
        changed = true;
        return { ...b, ...patch } as CustomBlock;
      });
      if (!changed) return item;
      changedItemIds.push(item.id);
      return { ...item, config: { ...item.config, blocks } } as SlideItem;
    }
    if (item.kind === "cover") {
      let config = item.config;
      for (const field of ["title", "subtitle"] as const) {
        const text = config[field];
        if (typeof text !== "string") continue;
        const count = countIn(text, re);
        if (!count) continue;
        replaced += count;
        config = { ...config, [field]: swap(text) };
      }
      if (config === item.config) return item;
      changedItemIds.push(item.id);
      return { ...item, config } as SlideItem;
    }
    return item;
  });
  return { items: next, replaced, skippedLocked, changedItemIds };
}
