// Filtro cruzado do editor de Slides: clicar numa barra, fatia, linha de
// tabela ou estado do mapa filtra os OUTROS blocos do slide.
//
// Regras (o que fazia o recurso "às vezes não funcionar"):
// - O filtro vale para as LINHAS da base, não para o que o bloco desenha: um
//   gráfico de ROL por mês recebe "Marca: Melken" e passa a mostrar o ROL da
//   Melken por mês. Antes, só blocos que exibiam a própria dimensão reagiam.
// - Comparação tolerante: espaços, caixa e acento não importam, e os rótulos
//   de vazio ("Sem marca", "—", "não atribuído") casam com o campo vazio.
// - "Outros (5)" vira filtro de exclusão: tudo menos os itens mostrados.
// - Dimensão que a base do bloco não tem (Cliente na base Budget) não zera o
//   bloco: o filtro é "não aplicável" e o bloco diz isso.
// - Clicar num período não apaga os outros filtros.
import { monthLabel } from "./format";

export interface CrossFilter {
  sourceBlockId: string;
  /** "marca", "canalAjustado", "uf", "period"… */
  dimension: string;
  values: string[];
  /** true = tudo MENOS `values` (clique em "Outros"). */
  exclude?: boolean;
  /** Texto do chip quando difere dos valores ("Outros (5)"). */
  label?: string;
  /** Nome do bloco que filtrou (título do gráfico), para o chip. */
  sourceLabel?: string;
}

export const isPeriodDim = (dim: string) => dim === "period" || dim === "periodo";

export const DIM_ALIASES: Record<string, string[]> = {
  marca: ["marca", "marcaDesc", "marca_id"],
  canal: ["canal", "canalAjustado", "canalDesc"],
  canalAjustado: ["canalAjustado", "canal", "canalDesc"],
  categoria: ["categoria", "categoriaDesc"],
  subcategoria: ["subcategoria", "subcategoriaDesc"],
  cliente: ["cliente", "clienteDesc", "clienteNome"],
  sku: ["sku", "skuDesc", "skuCod"],
  skuDesc: ["skuDesc", "sku", "skuCod"],
  uf: ["uf", "estado"],
  regiao: ["regiao", "região", "regiaoDesc"],
};

const DIM_LABELS: Record<string, string> = {
  marca: "Marca", canal: "Canal", canalAjustado: "Canal",
  categoria: "Categoria", subcategoria: "Subcategoria",
  cliente: "Cliente", sku: "SKU", skuDesc: "SKU",
  uf: "UF", regiao: "Região", periodo: "Período", period: "Período",
  regional: "Regional", formato: "Formato", mercado: "Mercado", mercadoAjustado: "Mercado",
  sabor: "Sabor", tecnologia: "Tecnologia", faixaPeso: "Faixa de peso", gestorResp: "Gestor",
  inovacao: "Inovação", legado: "Legado", fy: "Ano fiscal",
};

export function dimensionLabel(d: string): string {
  return DIM_LABELS[d] ?? d.charAt(0).toUpperCase() + d.slice(1);
}

/** Valor bruto do campo, procurando pelos sinônimos da dimensão. */
export function resolveFieldValue(row: Record<string, unknown>, dimension: string): string {
  const candidates = DIM_ALIASES[dimension] ?? [dimension];
  for (const key of candidates) {
    const v = row[key];
    if (v !== undefined && v !== null && String(v) !== "") return String(v);
  }
  return "";
}

const EMPTY_LIKE = /^(—|-|–|sem .+|\(sem .+\)|n[aã]o atribu[ií]do|\(vazio\)|vazio)$/;

/** Forma de comparar: sem acento, caixa ou espaços; rótulos de vazio = "". */
export function normalizeFilterValue(value: unknown): string {
  const text = String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return EMPTY_LIKE.test(text) ? "" : text;
}

/** "Outros (5)" — a fatia que agrupa o resto. */
export const OTHERS_LABEL_RE = /^outros \(\d+\)$/i;

type RowLike = Record<string, unknown>;

function rowPeriodKeys(row: RowLike): string[] {
  const mes = Number(row.mes ?? 0);
  const ano = Number(row.ano ?? 0);
  const keys: string[] = [];
  if (mes && ano) keys.push(normalizeFilterValue(monthLabel(mes, ano)));
  if (row.periodo != null) keys.push(normalizeFilterValue(row.periodo));
  if (row.fy != null) keys.push(normalizeFilterValue(row.fy));
  return keys;
}

/** A linha passa no filtro? */
export function rowMatches(row: RowLike, filter: CrossFilter, wanted?: Set<string>): boolean {
  const set = wanted ?? new Set(filter.values.map(normalizeFilterValue));
  const hit = isPeriodDim(filter.dimension)
    ? rowPeriodKeys(row).some((k) => set.has(k))
    : set.has(normalizeFilterValue(resolveFieldValue(row, filter.dimension)));
  return filter.exclude ? !hit : hit;
}

const SAMPLE = 2000;

/** A base tem essa dimensão? (Cliente não existe no Budget, por exemplo.) */
export function dimensionAvailable(rows: readonly RowLike[], dimension: string): boolean {
  if (rows.length === 0) return true; // sem linhas não há o que dizer
  const step = Math.max(1, Math.floor(rows.length / SAMPLE));
  for (let i = 0; i < rows.length; i += step) {
    const row = rows[i];
    if (isPeriodDim(dimension) ? rowPeriodKeys(row).length > 0 : resolveFieldValue(row, dimension) !== "") return true;
  }
  return false;
}

export interface CrossFilterResult<T> {
  rows: T[];
  /** Filtros que valeram para este bloco. */
  applied: CrossFilter[];
  /** Filtros que este bloco não consegue aplicar, com o motivo. */
  skipped: Array<{ filter: CrossFilter; reason: "dimension" | "time" }>;
}

/**
 * Aplica os filtros às linhas de um bloco. `ignorePeriod`: blocos que mostram
 * a evolução no tempo não somem com o clique num mês — destacam o mês.
 */
export function applyCrossFilters<T>(
  rows: readonly T[],
  filters: readonly CrossFilter[],
  opts: { ignorePeriod?: boolean } = {},
): CrossFilterResult<T> {
  const applied: CrossFilter[] = [];
  const skipped: CrossFilterResult<T>["skipped"] = [];
  const asRows = rows as unknown as readonly RowLike[];
  for (const f of filters) {
    if (f.values.length === 0) continue;
    if (opts.ignorePeriod && isPeriodDim(f.dimension)) skipped.push({ filter: f, reason: "time" });
    else if (!dimensionAvailable(asRows, f.dimension)) skipped.push({ filter: f, reason: "dimension" });
    else applied.push(f);
  }
  if (applied.length === 0) return { rows: rows as T[], applied, skipped };
  const sets = applied.map((f) => new Set(f.values.map(normalizeFilterValue)));
  const out = (rows as unknown as RowLike[]).filter((row) => applied.every((f, i) => rowMatches(row, f, sets[i])));
  return { rows: out as unknown as T[], applied, skipped };
}

/** Texto do chip: "Marca: Melken", "Canal: 3 valores", "Marca: Outros (5)". */
export function describeFilter(f: CrossFilter): string {
  const what = f.label ?? (f.values.length === 1 ? f.values[0] : `${f.values.length} valores`);
  return `${dimensionLabel(f.dimension)}: ${f.exclude && !f.label ? `todos menos ${what}` : what}`;
}

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

export type CrossFilterAction =
  | { type: "set"; filter: CrossFilter }
  | { type: "toggle"; filter: CrossFilter }
  | { type: "clear"; sourceBlockId: string }
  | { type: "clearAll" }
  | { type: "removeValue"; sourceBlockId: string; value: string };

/** Um filtro por bloco de origem; clicar no mesmo valor de novo desfaz. */
export function crossFilterReducer(filters: CrossFilter[], action: CrossFilterAction): CrossFilter[] {
  switch (action.type) {
    case "set": {
      const others = filters.filter((f) => f.sourceBlockId !== action.filter.sourceBlockId);
      const cur = filters.find((f) => f.sourceBlockId === action.filter.sourceBlockId);
      // Mesmo clique de novo = desfazer.
      if (cur && cur.dimension === action.filter.dimension && !!cur.exclude === !!action.filter.exclude
        && cur.values.length === action.filter.values.length
        && cur.values.every((v) => action.filter.values.includes(v))) {
        return others;
      }
      return [...others, action.filter];
    }
    case "toggle": {
      const cur = filters.find((f) => f.sourceBlockId === action.filter.sourceBlockId);
      if (!cur || cur.dimension !== action.filter.dimension || cur.exclude || action.filter.exclude) {
        return crossFilterReducer(filters, { type: "set", filter: action.filter });
      }
      const set = new Set(cur.values);
      for (const v of action.filter.values) {
        if (set.has(v)) set.delete(v);
        else set.add(v);
      }
      const others = filters.filter((f) => f.sourceBlockId !== action.filter.sourceBlockId);
      if (set.size === 0) return others;
      return [...others, { ...cur, values: Array.from(set), label: undefined }];
    }
    case "removeValue": {
      return filters.flatMap((f) => {
        if (f.sourceBlockId !== action.sourceBlockId) return [f];
        if (f.exclude || f.label) return [];
        const values = f.values.filter((v) => v !== action.value);
        return values.length ? [{ ...f, values }] : [];
      });
    }
    case "clear":
      return filters.filter((f) => f.sourceBlockId !== action.sourceBlockId);
    case "clearAll":
      return [];
  }
}
