// "Frase viva" da Tabela Dinâmica: descrever a tabela em português
// ("ROL e CM% por Marca × Mês, só Varejo") e montar linhas, colunas, medidas
// e filtros a partir disso — sem IA nem rede, só casando os nomes dos campos
// (e alguns sinônimos) e os valores presentes na base.

export type PhraseField = { id: string; label: string };

export type PhraseFilterMatch = { dim: string; values: string[]; term: string };

export type PivotPhraseResult = {
  values: string[];
  rows: string[];
  cols: string[];
  filters: PhraseFilterMatch[];
  /** Palavras que não foram reconhecidas (nem como campo, nem como valor). */
  unknown: string[];
  /** Algo foi reconhecido? */
  understood: boolean;
};

/**
 * Valores distintos por dimensão, pra reconhecer "só Varejo". Construir uma
 * vez por base (é uma passada sobre as linhas) e reusar.
 */
export type PhraseValueIndex = Record<string, string[]>;

/** Dimensões de tempo: sem um "×" explícito, vão pras colunas. */
const TIME_DIMS = new Set(["fy", "periodo", "mesLabel"]);

const MEASURE_SYNONYMS: Record<string, string[]> = {
  // "rol"/"cm"/"vol" sozinhos: no Comparativo os rótulos são "ROL Real" etc.
  rol_real: ["rol", "receita", "receita liquida", "faturamento", "vendas"],
  rol_budget: ["receita", "receita liquida", "faturamento", "vendas"],
  vol_real: ["vol", "volume", "kg", "toneladas"],
  vol_budget: ["vol", "volume", "kg", "toneladas"],
  cm_real: ["cm", "margem de contribuicao", "contribuicao"],
  cm_budget: ["margem de contribuicao", "contribuicao"],
  cm_pct_real: ["margem%", "margem de contribuicao%", "margem"],
  cm_pct_budget: ["margem%", "margem de contribuicao%", "margem"],
  mb_real: ["margem bruta"],
  mb_pct_real: ["margem bruta%"],
  rol_kg_real: ["preco", "preco medio", "preco/kg", "r$/kg", "rol/kg"],
  cm_kg_real: ["cm/kg"],
  cogs_real: ["custo", "cogs", "custo do produto"],
  cpv_budget: ["custo", "cogs"],
  rol_delta: ["delta", "variacao", "diferenca"],
  rol_delta_pct: ["delta%", "variacao%", "δ%"],
};

const DIM_SYNONYMS: Record<string, string[]> = {
  fy: ["ano fiscal", "ano", "anos"],
  mesLabel: ["mes", "meses", "mensal", "mes a mes"],
  periodo: ["periodos"],
  skuDesc: ["produto", "produtos", "descricao"],
  sku: ["codigo"],
  canalAjustado: ["canal", "canais"],
  canal: ["canais"],
  uf: ["estado", "estados"],
  regiao: ["regioes"],
  faixaPeso: ["peso", "gramatura"],
};

/** Palavras de ligação ignoradas ao apontar o que não foi entendido. */
const FILLER = new Set([
  "a", "o", "as", "os", "de", "do", "da", "dos", "das", "e", "em", "no", "na", "nos", "nas",
  "por", "com", "um", "uma", "mostrar", "mostre", "mostra", "ver", "quero", "me", "tabela",
  "pivot", "valores", "valor", "total", "totais", "cada", "x", "×", "vs", "vs.", "versus", "contra",
  "colunas", "coluna", "linhas", "linha", "so", "somente", "apenas", "para", "pra", "onde",
  "filtro", "filtrado", "filtrada", "filtrados", "filtradas", "filtrando", "ou",
]);

export function normalizePhrase(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s*%/g, "%")
    .replace(/\s+/g, " ")
    .trim();
}

type Term = { text: string; id: string; priority: number };

function isWordChar(ch: string | undefined): boolean {
  return !!ch && /[a-z0-9]/.test(ch);
}

function buildTerms(fields: PhraseField[], synonyms: Record<string, string[]>): Term[] {
  const terms: Term[] = [];
  for (const field of fields) {
    const label = normalizePhrase(field.label);
    terms.push({ text: label, id: field.id, priority: 0 });
    // "Canal (Real)" também responde por "canal"; "Inovação / Regular" por "inovacao".
    const base = label.replace(/\s*\(.*?\)\s*/g, " ").split(" / ")[0].trim();
    if (base && base !== label) terms.push({ text: base, id: field.id, priority: 1 });
    for (const syn of synonyms[field.id] ?? []) terms.push({ text: normalizePhrase(syn), id: field.id, priority: 2 });
  }
  // Plural simples de termos de uma palavra ("marcas", "categorias").
  for (const term of terms.slice()) {
    if (!term.text.includes(" ") && /[a-z]$/.test(term.text) && !term.text.endsWith("s")) {
      terms.push({ text: `${term.text}s`, id: term.id, priority: term.priority + 0.5 });
    }
  }
  // Mais longo primeiro (casa "cm r$/kg" antes de "cm"); empate → mais
  // prioritário (rótulo exato > rótulo sem o "(Real)" > sinônimo).
  return terms.sort((a, b) => b.text.length - a.text.length || a.priority - b.priority);
}

type Scan = { ids: string[]; covered: boolean[] };

/** Acha os campos citados num trecho, sem sobreposição, na ordem em que aparecem. */
function scanFields(segment: string, terms: Term[], covered = new Array<boolean>(segment.length).fill(false)): Scan {
  const matches: Array<{ id: string; start: number }> = [];
  for (const term of terms) {
    if (!term.text) continue;
    const lastIsWord = isWordChar(term.text[term.text.length - 1]);
    let from = 0;
    for (;;) {
      const at = segment.indexOf(term.text, from);
      if (at < 0) break;
      from = at + 1;
      const end = at + term.text.length;
      if (isWordChar(segment[at - 1]) || (lastIsWord && isWordChar(segment[end]))) continue;
      let free = true;
      for (let i = at; i < end; i++) if (covered[i]) { free = false; break; }
      if (!free) continue;
      for (let i = at; i < end; i++) covered[i] = true;
      matches.push({ id: term.id, start: at });
    }
  }
  matches.sort((a, b) => a.start - b.start);
  const ids: string[] = [];
  for (const m of matches) if (!ids.includes(m.id)) ids.push(m.id);
  return { ids, covered };
}

function leftoverWords(text: string, covered: boolean[]): string[] {
  const out: string[] = [];
  let word = "";
  for (let i = 0; i <= text.length; i++) {
    const ch = text[i];
    if (ch !== undefined && !covered[i] && !/[\s,;:=|/]/.test(ch)) {
      word += ch;
      continue;
    }
    if (word && !FILLER.has(word)) out.push(word);
    word = "";
  }
  return out;
}

const FILTER_SPLIT = /\s(?:so|somente|apenas|filtrad[oa]s? por|filtrando|onde|para|pra)\s/;
const COLS_SPLIT = /\s(?:×|x|vs\.?|versus|contra)\s|\s(?:em|nas|por)\s+colunas?:?\s/;

function matchFilterItem(
  item: string,
  dimTerms: Term[],
  valueIndex: PhraseValueIndex,
  dimOrder: string[],
): PhraseFilterMatch | null {
  const pickIn = (dim: string, wantedText: string): PhraseFilterMatch | null => {
    const wanted = wantedText.split(/,|\se\s|\sou\s/).map((s) => s.trim()).filter(Boolean);
    if (wanted.length === 0) return null;
    const picked = (valueIndex[dim] ?? []).filter((v) => {
      const nv = normalizePhrase(v);
      return wanted.some((w) => nv === w || nv.includes(w));
    });
    return picked.length > 0 ? { dim, values: picked, term: item } : null;
  };
  // "marca: Harald, Melken" / "marca = Harald" — dimensão explícita.
  if (/[:=]/.test(item)) {
    const [head, ...tail] = item.split(/[:=]/);
    const dim = scanFields(head, dimTerms).ids[0];
    if (dim) return pickIn(dim, tail.join(" "));
  }
  // "canal varejo" — começa com o nome de uma dimensão: o resto é o valor
  // procurado só nela (desempata quando o mesmo valor existe em outro campo).
  const lead = scanFields(` ${item} `, dimTerms);
  const leadEnd = lead.covered.lastIndexOf(true);
  if (lead.ids.length > 0 && lead.covered[1] && leadEnd < item.length) {
    const scoped = pickIn(lead.ids[0], item.slice(leadEnd).trim());
    if (scoped) return scoped;
  }
  const wanted = item.replace(/[:=]/g, " ").trim();
  if (!wanted) return null;
  // Só o valor: procura em todas as dimensões. Exato vence "começa com", que
  // vence "contém como palavra"; empate → ordem das dimensões.
  let best: { rank: number; order: number; dim: string; values: string[] } | null = null;
  for (const [dim, values] of Object.entries(valueIndex)) {
    const order = dimOrder.indexOf(dim);
    let rank = 3;
    let hits: string[] = [];
    for (const value of values) {
      const nv = normalizePhrase(value);
      let r = 3;
      if (nv === wanted) r = 0;
      else if (nv.startsWith(wanted) && !isWordChar(nv[wanted.length])) r = 1;
      else {
        const at = nv.indexOf(wanted);
        if (at >= 0 && !isWordChar(nv[at - 1]) && !isWordChar(nv[at + wanted.length])) r = 2;
      }
      if (r < rank) {
        rank = r;
        hits = [value];
      } else if (r === rank && r < 3) {
        hits.push(value);
      }
    }
    if (rank === 3) continue;
    const better = !best
      || rank < best.rank
      || (rank === best.rank && order >= 0 && (best.order < 0 || order < best.order));
    if (better) best = { rank, order, dim, values: hits };
  }
  return best ? { dim: best.dim, values: best.values, term: item } : null;
}

export function parsePivotPhrase(
  text: string,
  dims: PhraseField[],
  measures: PhraseField[],
  valueIndex: PhraseValueIndex = {},
): PivotPhraseResult {
  const norm = ` ${normalizePhrase(text)} `;
  if (!norm.trim()) return { values: [], rows: [], cols: [], filters: [], unknown: [], understood: false };

  const dimTerms = buildTerms(dims, DIM_SYNONYMS);
  const measureTerms = buildTerms(measures, MEASURE_SYNONYMS);
  const dimOrder = dims.map((d) => d.id);

  // 1) Filtros: tudo depois de "só/somente/apenas/filtrado por/onde/para".
  //    ", Varejo" no fim também é filtro quando nada ali é nome de campo.
  let main = norm;
  let filterPart = "";
  const filterAt = norm.search(FILTER_SPLIT);
  if (filterAt >= 0) {
    main = `${norm.slice(0, filterAt)} `;
    filterPart = norm.slice(filterAt).replace(FILTER_SPLIT, " ");
  } else {
    const porAt = norm.indexOf(" por ");
    const comma = norm.lastIndexOf(",");
    if (porAt >= 0 && comma > porAt) {
      const tail = ` ${norm.slice(comma + 1)}`;
      if (scanFields(tail, dimTerms).ids.length === 0 && scanFields(tail, measureTerms).ids.length === 0) {
        main = `${norm.slice(0, comma)} `;
        filterPart = tail;
      }
    }
  }

  // 2) Medidas em qualquer parte; dimensões depois de "por" (ou em qualquer
  //    parte, se não houver "por").
  const covered = new Array<boolean>(main.length).fill(false);
  const values = scanFields(main, measureTerms, covered).ids;
  const porAt = main.indexOf(" por ");
  const dimStart = porAt >= 0 ? porAt + 4 : 0;
  const dimText = main.slice(dimStart);
  const colsRel = dimText.search(COLS_SPLIT);

  let rows: string[];
  let cols: string[];
  const scanRegion = (from: number, to: number) => {
    // Escaneia só [from, to) de `main`, marcando o mesmo vetor de cobertura.
    const masked = main.split("").map((ch, i) => (i >= from && i < to ? ch : " ")).join("");
    return scanFields(masked, dimTerms, covered).ids;
  };
  if (colsRel >= 0) {
    const colsAt = dimStart + colsRel;
    rows = scanRegion(dimStart, colsAt + 1);
    cols = scanRegion(colsAt + 1, main.length).filter((id) => !rows.includes(id));
  } else {
    const found = scanRegion(dimStart, main.length);
    const time = found.filter((id) => TIME_DIMS.has(id));
    const other = found.filter((id) => !TIME_DIMS.has(id));
    // Convenção de pivot: o tempo atravessa as colunas.
    if (time.length > 0 && other.length > 0) {
      rows = other;
      cols = time;
    } else {
      rows = found;
      cols = [];
    }
  }
  const unknown = leftoverWords(main, covered);

  // 3) Filtros por valor. "marca: A, B" fica inteiro; o resto separa por
  //    vírgula / "e".
  const filters: PhraseFilterMatch[] = [];
  if (filterPart.trim()) {
    const items = filterPart
      .split(";")
      .flatMap((chunk) => (/[:=]/.test(chunk) ? [chunk] : chunk.split(/,|\se\s/)))
      .map((s) => s.trim())
      .filter(Boolean);
    for (const item of items) {
      const match = matchFilterItem(item, dimTerms, valueIndex, dimOrder);
      if (!match) {
        unknown.push(...item.split(/\s+/).filter((w) => w && !FILLER.has(w)));
        continue;
      }
      const existing = filters.find((f) => f.dim === match.dim);
      if (existing) {
        for (const v of match.values) if (!existing.values.includes(v)) existing.values.push(v);
      } else {
        filters.push(match);
      }
    }
  }

  const understood = values.length + rows.length + cols.length + filters.length > 0;
  return { values, rows, cols, filters, unknown: Array.from(new Set(unknown)), understood };
}

/** A montagem atual descrita como frase — mostrada na barra quando vazia. */
export function describePivotLayout(
  layout: { rows: string[]; cols: string[]; values: string[]; filterVals?: Record<string, string[]> },
  labelOf: (id: string) => string,
): string {
  const parts: string[] = [];
  if (layout.values.length) parts.push(layout.values.map(labelOf).join(", "));
  if (layout.rows.length || layout.cols.length) {
    const rows = layout.rows.map(labelOf).join(" › ");
    const cols = layout.cols.map(labelOf).join(" › ");
    parts.push(`por ${rows || "—"}${cols ? ` × ${cols}` : ""}`);
  }
  const filters = Object.entries(layout.filterVals ?? {}).filter(([, vals]) => vals.length > 0);
  if (filters.length) {
    parts.push(
      `só ${filters
        .map(([dim, vals]) => `${labelOf(dim)}: ${vals.length > 2 ? `${vals.slice(0, 2).join(", ")} +${vals.length - 2}` : vals.join(", ")}`)
        .join("; ")}`,
    );
  }
  return parts.join(" ");
}
