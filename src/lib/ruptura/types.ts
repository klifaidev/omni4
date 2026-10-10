// Inteligência de Ruptura — modelo consolidado da base de pesquisas de PDV.
//
// A planilha bruta traz uma linha por (pesquisa × SKU). A mesma loja é
// pesquisada várias vezes no mês (na base de referência, ~2,9 vezes), então
// somar linhas superconta: o modelo guarda UMA avaliação por
// mês × loja × SKU — a última do mês — e quantas pesquisas foram fundidas nela.
//
// Tudo é colunar (arrays paralelos) e com dicionários de texto, para caber em
// memória e no cache do Electron sem carregar as ~550 mil linhas de novo.

export const RUPTURA_MODEL_VERSION = 1;

/** Dimensões de texto da base, na ordem em que aparecem nos filtros. */
export const RUPTURA_DIMS = [
  "marca",
  "categoria",
  "linha",
  "sku",
  "rede",
  "bandeira",
  "pdv",
  "canal",
  "regional",
  "estado",
  "cidade",
] as const;

export type RupturaDim = (typeof RUPTURA_DIMS)[number];

/** Dimensões que pertencem ao produto (indexadas pelo SKU). */
export const RUPTURA_SKU_DIMS = ["marca", "categoria", "linha"] as const;
/** Dimensões que pertencem à loja (indexadas pela loja). */
export const RUPTURA_STORE_DIMS = ["rede", "bandeira", "pdv", "canal", "regional", "estado", "cidade"] as const;

export interface RupturaQuality {
  /** Linhas de dados lidas da aba (sem o cabeçalho). */
  rawRows: number;
  /** Linhas descartadas por falta de SKU, loja ou mês. */
  missingKey: number;
  /** Linhas com resposta vazia ou fora de Sim/Não — não contam como presença. */
  invalidResult: number;
  /** Respostas válidas lidas, antes da consolidação. */
  sim: number;
  nao: number;
  /** Linhas fundidas em uma avaliação já existente do mesmo mês × loja × SKU. */
  mergedDuplicates: number;
  /** Mesma pesquisa + SKU repetidos (linha duplicada de fato). */
  exactDuplicates: number;
  /** IDs de pesquisa distintos. */
  surveys: number;
  /** IDs de pesquisa que aparecem em mais de uma loja (não deveria acontecer). */
  surveysInManyStores: number;
  /** Nomes de PDV que aparecem em mais de uma loja (rede/bandeira/cidade/UF diferentes). */
  pdvHomonyms: number;
  /** Lojas cujo canal muda entre linhas (fica o primeiro). */
  storesWithManyChannels: number;
  /** SKUs cuja marca/categoria/linha muda entre linhas (fica a primeira). */
  skusWithManyHierarchies: number;
  /** Estados que não reconhecemos como UF (ficam fora do mapa). */
  unknownStates: string[];
  /** Menor e maior data de pesquisa (ISO, sem fuso). */
  firstDate: string | null;
  lastDate: string | null;
  /** Meses (índices de `months`) que têm pelo menos uma resposta "Não". */
  monthsWithNegatives: number[];
}

export interface RupturaModel {
  version: typeof RUPTURA_MODEL_VERSION;
  fileName: string;
  sheetName: string;
  /** "AAAA-MM", em ordem. */
  months: string[];
  dict: Record<RupturaDim, string[]>;
  /** Atributos por SKU (índice = índice em dict.sku). */
  skus: { marca: number[]; categoria: number[]; linha: number[] };
  /** Atributos por loja. A loja é Rede + Bandeira + PDV + Cidade + Estado. */
  stores: {
    rede: number[];
    bandeira: number[];
    pdv: number[];
    canal: number[];
    regional: number[];
    estado: number[];
    cidade: number[];
    /** Sigla da UF ou null quando o estado não foi reconhecido. */
    uf: (string | null)[];
  };
  /** Uma posição por avaliação consolidada (mês × loja × SKU). */
  cells: {
    month: number[];
    store: number[];
    sku: number[];
    /** 1 = Sim (ruptura), 0 = Não (produto presente) — resultado da última pesquisa do mês. */
    result: number[];
    /** Pesquisas do mês fundidas nesta avaliação. */
    evals: number[];
    /** Quantas dessas pesquisas deram Sim. */
    sims: number[];
  };
  quality: RupturaQuality;
}
