// Mapas de cabeçalho das bases — nome normalizado da coluna → campo do app.
//
// Ficam num módulo sem dependências pesadas para que o worker que lê planilhas
// (e o classificador de abas) usem exatamente o mesmo vocabulário dos leitores
// de Real e Budget.
import type { PricingRow } from "@/lib/types";

// Map of normalized header → canonical field
// Keys are normalized via normHeader (lowercase, no accents/spaces/punct).
export const REAL_HEADER_MAP: Record<string, keyof PricingRow | "ignore"> = {
  // period
  periodo: "periodo",
  periodoano: "periodo",          // "Período/ano"
  mes: "periodo",
  mesano: "periodo",
  anomes: "periodo",
  competencia: "periodo",
  data: "periodo",
  // dims — marca
  marca: "marca",
  "02marca": "marca",
  brand: "marca",
  // canal
  canal: "canal",
  canalvenda: "canal",
  canaldevenda: "canal",
  canaldistrib: "canal",          // "Canal distrib."
  canaldistribuicao: "canal",
  channel: "canal",
  // categoria
  categoria: "categoria",
  "01categoria": "categoria",
  category: "categoria",
  familia: "categoria",
  "03familia": "categoria",
  // subcategoria / formato
  subcategoria: "subcategoria",
  "04formato": "subcategoria",
  formato: "subcategoria",
  subcategory: "subcategoria",
  // sku / artigo
  sku: "sku",
  artigo: "sku",
  codsku: "sku",
  codigosku: "sku",
  codigo: "sku",
  cdsku: "sku",
  // descrição produto
  descricaosku: "skuDesc",
  descricao: "skuDesc",
  descsku: "skuDesc",
  produto: "skuDesc",
  product: "skuDesc",
  item: "skuDesc",
  // cliente
  cliente: "cliente",
  client: "cliente",
  customer: "cliente",
  razaosocial: "cliente",
  gestorresp: "gestorResp",
  gestorresponsavel: "gestorResp",
  responsavel: "gestorResp",
  gerente: "gestorResp",
  // região
  regiao: "regiao",
  uf: "regiao",
  estado: "regiao",
  region: "regiao",
  // mercado
  mercado: "mercado",
  "05mercado": "mercado",
  market: "mercado",
  // sabor
  sabor: "sabor",
  "07sabor": "sabor",
  flavor: "sabor",
  // tecnologia
  tecnologia: "tecnologia",
  technology: "tecnologia",
  // faixa peso
  faixapeso: "faixaPeso",
  faixadepeso: "faixaPeso",
  "06faixadepeso": "faixaPeso",
  weightrange: "faixaPeso",
  // measures — receita
  rol: "rol",
  receita: "rol",
  receitaliquida: "rol",
  recliquida: "rol",              // "Rec. Líquida"
  receitaoperacionalliquida: "rol",
  netrevenue: "rol",
  netsales: "rol",
  faturamento: "rol",
  faturamentoliquido: "rol",
  vendaliquida: "rol",
  // volume
  volume: "volumeKg",
  volumekg: "volumeKg",
  kg: "volumeKg",
  pesoliquido: "volumeKg",        // "Peso líquido"
  qtdkg: "volumeKg",
  quantidade: "volumeKg",
  qtde: "volumeKg",
  // custo
  cogs: "cogs",
  cmv: "cogs",
  cpv: "cogs",                    // "CPV"
  custo: "cogs",
  custototal: "cogs",
  custovariavel: "cogs",
  // margem bruta
  margembruta: "margemBruta",
  mb: "margemBruta",
  grossmargin: "margemBruta",
  // contribuição marginal
  contribuicaomarginal: "contribMarginal",
  contribmarginal: "contribMarginal",
  cm: "contribMarginal",
  margemcontribuicao: "contribMarginal",
  // frete sobre vendas
  frete: "frete",
  fretesobrevendas: "frete",
  fretevendas: "frete",
  freight: "frete",
  // comissão
  comissao: "comissao",
  comissaorepres: "comissao",
  comissaorepresentante: "comissao",
  comissaorepresentantes: "comissao",
  commission: "comissao",
  // CPV components (Matéria Prima e Embalagem) — exibidos no DRE
  materiaprima: "materiaPrima",
  materiaprimaajustado: "materiaPrima",
  materiaprimaajust: "materiaPrima",
  mp: "materiaPrima",
  rawmaterial: "materiaPrima",
  embalagem: "embalagem",
  embalagemajustado: "embalagem",
  embalagemajust: "embalagem",
  packaging: "embalagem",
  // custo fixo components (MOD e CIF)
  mod: "mod",
  modajustado: "mod",
  maodeobra: "mod",
  maodeobraajustado: "mod",
  cif: "cif",
  cifajustado: "cif",
  // STATUS é apenas ignorada aqui (a separação Real/Budget acontece na aba Budget,
  // a partir do XLSX de Budget — o CSV Real importa todas as linhas).
  status: "ignore",
  // explicit ignores (avoid noise in unmapped list)
  ctbmg: "ignore",                // "Ctb. Mg. %"
  centro: "ignore",
};

// Header canonical map (normalized → canonical key)
export const BUDGET_HEADER_MAP: Record<string, string> = {
  canal: "canal",
  channel: "canal",
  sku: "sku",
  artigo: "sku",
  codigo: "sku",
  codsku: "sku",
  descricaodoproduto: "skuDesc",
  descricaoproduto: "skuDesc",
  descricao: "skuDesc",
  produto: "skuDesc",
  data: "periodo",
  datacorreta: "periodo",
  periodo: "periodo",
  mes: "periodo",
  competencia: "periodo",
  volume: "volume",
  qtde: "volume",
  quantidade: "volume",
  receita: "receita",
  rol: "receita",
  cm: "cm",
  contribuicaomarginal: "cm",
  contribmarginal: "cm",
  cpv: "cpv",
  cmv: "cpv",
  custo: "cpv",
  status: "status",
};
