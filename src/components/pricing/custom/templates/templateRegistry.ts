// Slide Template Registry — 24 templates (Fase 1 + Fase 2).

import type { CustomBlock, CustomSlideConfig, KpiMeasureId, CustomChartType } from "@/lib/customSlide";

// Distributive Omit so each member of the discriminated union keeps its own props.
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
export type TemplateBlock = DistributiveOmit<CustomBlock, "id">;

export type TemplateCategory =
  | "todos"
  | "visao-geral"
  | "analise-resultado"
  | "narrativa-executiva"
  | "causa-efeito"
  | "comparativo"
  | "detalhamento"
  | "deck-completo"
  | "meus-modelos";

export interface TemplateSlide {
  title: string;
  background?: string;
  showHaraldFooter?: boolean;
  blocks: TemplateBlock[];
}

export interface SlideTemplate {
  id: string;
  name: string;
  category: Exclude<TemplateCategory, "todos" | "meus-modelos">;
  description: string;
  tags: string[];
  slides: TemplateSlide[];
  isDeck: boolean;
}

export const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  todos: "Todos",
  "visao-geral": "Visão geral",
  "analise-resultado": "Análise de resultado",
  "narrativa-executiva": "Narrativa executiva",
  "causa-efeito": "Causa e efeito",
  comparativo: "Comparativo",
  detalhamento: "Detalhamento",
  "deck-completo": "Deck completo",
  "meus-modelos": "Meus modelos",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const TITLE = (text: string, z = 1): TemplateBlock => ({
  kind: "title", z, x: 40, y: 30, w: 1240, h: 60,
  text, size: 32, bold: true, color: "C8102E", align: "left",
});

const TEXT = (
  text: string,
  x: number, y: number, w: number, h: number, z: number,
  size = 18, color = "475569", align: "left" | "center" | "right" = "left",
): TemplateBlock => ({
  kind: "text", z, x, y, w, h,
  text, size, color, align,
  fontFamily: "Inter",
  letterSpacing: 0,
  lineHeight: 1.28,
  textTransform: "none",
  padding: 0,
  backgroundColor: "",
  borderRadius: 0,
});

const SHAPE = (
  x: number, y: number, w: number, h: number, z: number,
  fill = "F8FAFC", strokeColor = "E2E8F0", radius = 12,
): TemplateBlock => ({
  kind: "shape", z, x, y, w, h,
  shape: "roundRect",
  fill,
  fillOpacity: 100,
  strokeColor,
  strokeWidth: 1,
  strokeStyle: "solid",
  radius,
  shadowEnabled: true,
  shadowColor: "000000",
  shadowOpacity: 10,
  shadowBlur: 12,
  shadowX: 0,
  shadowY: 4,
});

const KPI = (
  label: string, measure: KpiMeasureId,
  x: number, y: number, w: number, h: number, z: number, color = "1C2430",
): TemplateBlock => ({
  kind: "kpi", z, x, y, w, h,
  label, valueSize: 28, color,
  source: "dynamic", measure,
  periodMode: "all", periodValue: null, filters: {},
  format: "auto", manualValue: "", dataSource: "ke30",
});

interface ChartArgs {
  x: number; y: number; w: number; h: number; z: number;
  chartType: CustomChartType;
  measure?: KpiMeasureId;
  breakdown?: string | null;
  title?: string;
  style?: Record<string, unknown>;
  fieldWells?: Record<string, unknown>;
  sortConfig?: { field: "period" | "value" | "name"; dir: "asc" | "desc" };
  emitsCrossFilter?: boolean;
}
const CHART = (a: ChartArgs): TemplateBlock => ({
  kind: "chart", z: a.z, x: a.x, y: a.y, w: a.w, h: a.h,
  chartType: a.chartType,
  measure: a.measure ?? "rol",
  breakdown: a.breakdown ?? null,
  showGrid: true, showLegend: true, showLabels: false,
  filters: {},
  title: a.title,
  autoFit: true,
  dataSource: "ke30",
  ...(a.style ? { style: a.style as never } : {}),
  ...(a.fieldWells ? { fieldWells: a.fieldWells as never } : {}),
  ...(a.sortConfig ? { sortConfig: a.sortConfig } : {}),
  ...(a.emitsCrossFilter !== undefined ? { emitsCrossFilter: a.emitsCrossFilter } : {}),
});

const TABLE = (
  x: number, y: number, w: number, h: number, z: number,
  rowDim: string,
  measures: string[] = ["rol_real", "vol_real", "cm_real", "mb_real"],
): TemplateBlock => ({
  kind: "table", z, x, y, w, h,
  source: "ke30", dataSource: "ke30",
  measures, rowDims: [rowDim], colDim: null, filters: {},
  autoFit: true, showOthers: false, exportNote: false,
});

interface TopArgs {
  x: number; y: number; w: number; h: number; z: number;
  title?: string;
  measure: KpiMeasureId;
  dim?: "sku" | "skuDesc" | "cliente" | "marca" | "categoria" | "canalAjustado";
  topN?: number;
  sortConfig?: { field: "period" | "value" | "name"; dir: "asc" | "desc" };
}
const TOP = (a: TopArgs): TemplateBlock => ({
  kind: "topSku", z: a.z, x: a.x, y: a.y, w: a.w, h: a.h,
  dim: a.dim ?? "marca",
  measure: a.measure,
  topN: a.topN ?? 10,
  periodMode: "all", periodValue: null,
  filters: {}, showShare: true,
  title: a.title,
  autoFit: true, showOthers: false, exportNote: false,
  dataSource: "ke30",
});

const WATERFALL_COLORS = {
  positiveColor: "#22c55e",
  negativeColor: "#ef4444",
  totalColor: "#3b82f6",
};

// ---------------------------------------------------------------------------
// VISÃO GERAL
// ---------------------------------------------------------------------------
const T01: SlideTemplate = {
  id: "T01", name: "Resumo Executivo", category: "visao-geral",
  description: "Visão consolidada do mês com KPIs principais e evolução em linha.",
  tags: ["KPI", "Linha", "Diretoria"], isDeck: false,
  slides: [{
    title: "Resumo Executivo",
    blocks: [
      TITLE("Resumo Executivo"),
      KPI("Receita Líquida", "rol",        40,  100, 410, 110, 2, "C8102E"),
      KPI("Margem Contrib.", "cm",        460,  100, 410, 110, 3),
      KPI("Volume",          "volume",    880,  100, 410, 110, 4),
      KPI("Preço Médio",     "precoMedio", 40,  225, 625, 100, 5),
      KPI("CM %",            "cmPct",     675,  225, 625, 100, 6),
      CHART({ x: 40, y: 340, w: 1250, h: 380, z: 7,
        chartType: "line", measure: "rol", title: "Evolução de Receita Líquida" }),
    ],
  }],
};

const T02: SlideTemplate = {
  id: "T02", name: "KPIs + Bridge PVM", category: "visao-geral",
  description: "4 KPIs no topo e Bridge de decomposição de resultado abaixo.",
  tags: ["KPI", "Bridge", "PVM"], isDeck: false,
  slides: [{
    title: "KPIs + Bridge PVM",
    blocks: [
      TITLE("KPIs + Bridge PVM"),
      KPI("Receita", "rol",         40, 100, 305, 110, 2, "C8102E"),
      KPI("Volume",  "volume",     355, 100, 305, 110, 3),
      KPI("Preço",   "precoMedio", 670, 100, 305, 110, 4),
      KPI("Margem",  "cm",         985, 100, 305, 110, 5),
      { kind: "bridge", z: 6, x: 40, y: 230, w: 1250, h: 490,
        base: null, comp: null, mode: "month", filters: {} },
    ],
  }],
};

const T03: SlideTemplate = {
  id: "T03", name: "KPIs + Top Ranking", category: "visao-geral",
  description: "3 KPIs à esquerda e ranking de marcas/SKUs à direita.",
  tags: ["KPI", "Ranking", "Top N"], isDeck: false,
  slides: [{
    title: "KPIs + Top Ranking",
    blocks: [
      TITLE("KPIs + Top Ranking"),
      KPI("ROL",    "rol",     40, 100, 380, 140, 2, "C8102E"),
      KPI("Volume", "volume",  40, 260, 380, 140, 3),
      KPI("CM",     "cm",      40, 420, 380, 140, 4),
      TOP({ x: 460, y: 100, w: 833, h: 600, z: 5,
        title: "Top 10 marcas por ROL", measure: "rol", dim: "marca",
        sortConfig: { field: "value", dir: "desc" } }),
    ],
  }],
};

const T04: SlideTemplate = {
  id: "T04", name: "Painel de Categorias", category: "visao-geral",
  description: "KPIs comparativos e evolução por categoria em colunas agrupadas.",
  tags: ["Categoria", "Coluna", "Comparativo"], isDeck: false,
  slides: [{
    title: "Painel de Categorias",
    blocks: [
      TITLE("Painel de Categorias"),
      KPI("ROL",    "rol",     40, 100, 380, 100, 2, "C8102E"),
      KPI("Volume", "volume", 460, 100, 380, 100, 3),
      KPI("CM",     "cm",     880, 100, 380, 100, 4),
      CHART({ x: 40, y: 220, w: 1253, h: 500, z: 5,
        chartType: "column", measure: "rol", breakdown: "categoria",
        title: "ROL por categoria",
        style: { bar: { mode: "grouped" } } }),
    ],
  }],
};

const T05: SlideTemplate = {
  id: "T05", name: "Evolução Mensal", category: "visao-geral",
  description: "Evolução de receita e margem em combo chart com eixo secundário.",
  tags: ["Linha", "Combo", "Evolução"], isDeck: false,
  slides: [{
    title: "Evolução Mensal",
    blocks: [
      TITLE("Evolução Mensal"),
      KPI("ROL", "rol",  40, 100, 600, 100, 2, "C8102E"),
      KPI("CM",  "cm",  680, 100, 600, 100, 3),
      CHART({ x: 40, y: 220, w: 1253, h: 500, z: 4,
        chartType: "combo", measure: "rol", title: "ROL e CM ao longo do tempo",
        style: { measureLine: "cm", yAxis2: { show: true } } }),
    ],
  }],
};

// ---------------------------------------------------------------------------
// ANÁLISE DE RESULTADO
// ---------------------------------------------------------------------------
const T06: SlideTemplate = {
  id: "T06", name: "Resultado por Canal", category: "analise-resultado",
  description: "Receita e margem segmentadas por canal de venda.",
  tags: ["Canal", "Barra", "Comparativo"], isDeck: false,
  slides: [{
    title: "Resultado por Canal",
    blocks: [
      TITLE("Resultado por Canal"),
      KPI("ROL", "rol",  40, 100, 600, 100, 2, "C8102E"),
      KPI("CM",  "cm",  680, 100, 600, 100, 3),
      CHART({ x: 40, y: 220, w: 600, h: 500, z: 4,
        chartType: "hbar", measure: "rol", breakdown: "canalAjustado",
        title: "ROL por canal",
        sortConfig: { field: "value", dir: "desc" } }),
      CHART({ x: 680, y: 220, w: 613, h: 500, z: 5,
        chartType: "hbar", measure: "cm", breakdown: "canalAjustado",
        title: "CM por canal",
        sortConfig: { field: "value", dir: "desc" } }),
    ],
  }],
};

const T07: SlideTemplate = {
  id: "T07", name: "Resultado por Marca", category: "analise-resultado",
  description: "Comparativo de volume e receita entre marcas.",
  tags: ["Marca", "Coluna", "Comparativo"], isDeck: false,
  slides: [{
    title: "Resultado por Marca",
    blocks: [
      TITLE("Resultado por Marca"),
      CHART({ x: 40, y: 100, w: 600, h: 620, z: 2,
        chartType: "column", measure: "volume", breakdown: "marca",
        title: "Volume por marca" }),
      CHART({ x: 680, y: 100, w: 613, h: 620, z: 3,
        chartType: "column", measure: "rol", breakdown: "marca",
        title: "ROL por marca" }),
    ],
  }],
};

const T08: SlideTemplate = {
  id: "T08", name: "Resultado por Categoria", category: "analise-resultado",
  description: "Treemap de participação de receita e tabela de margens.",
  tags: ["Categoria", "Treemap", "Tabela"], isDeck: false,
  slides: [{
    title: "Resultado por Categoria",
    blocks: [
      TITLE("Resultado por Categoria"),
      CHART({ x: 40, y: 100, w: 700, h: 620, z: 2,
        chartType: "treemap", measure: "rol", breakdown: "categoria",
        title: "Participação por categoria",
        style: { treemap: { colorScheme: "categorical" } } }),
      TABLE(780, 100, 513, 620, 3, "categoria", ["rol_real", "cm_real", "mb_real"]),
    ],
  }],
};

const T09: SlideTemplate = {
  id: "T09", name: "Funil de Rentabilidade", category: "analise-resultado",
  description: "Waterfall decompondo a receita até a margem de contribuição.",
  tags: ["Waterfall", "Rentabilidade", "Decomposição"], isDeck: false,
  slides: [{
    title: "Funil de Rentabilidade",
    blocks: [
      TITLE("Funil de Rentabilidade"),
      KPI("ROL",  "rol",  40, 100, 380, 100, 2, "C8102E"),
      KPI("CV",   "cv",  460, 100, 380, 100, 3),
      KPI("CM",   "cm",  880, 100, 380, 100, 4),
      CHART({ x: 40, y: 220, w: 1253, h: 500, z: 5,
        chartType: "waterfall", measure: "rol", title: "Decomposição até margem",
        style: { waterfall: WATERFALL_COLORS } }),
    ],
  }],
};

const T10: SlideTemplate = {
  id: "T10", name: "Análise Ano a Ano", category: "analise-resultado",
  description: "Comparativo de evolução ano a ano com variação percentual.",
  tags: ["YoY", "Linha", "Variação"], isDeck: false,
  slides: [{
    title: "Análise Ano a Ano",
    blocks: [
      TITLE("Análise Ano a Ano"),
      CHART({ x: 40, y: 100, w: 1253, h: 380, z: 2,
        chartType: "line", measure: "rol", title: "Evolução de ROL" }),
      KPI("ROL",    "rol",     40, 500, 380, 140, 3, "C8102E"),
      KPI("Volume", "volume", 460, 500, 380, 140, 4),
      KPI("CM",     "cm",     880, 500, 380, 140, 5),
    ],
  }],
};

// ---------------------------------------------------------------------------
// CAUSA E EFEITO
// ---------------------------------------------------------------------------
const T11: SlideTemplate = {
  id: "T11", name: "Bridge de Preço × Volume × Mix", category: "causa-efeito",
  description: "Decomposição clássica PVM do resultado vs. período anterior.",
  tags: ["Bridge", "PVM", "Causa"], isDeck: false,
  slides: [{
    title: "Bridge PVM",
    blocks: [
      TITLE("Bridge de Preço × Volume × Mix"),
      { kind: "bridge", z: 2, x: 40, y: 100, w: 1250, h: 620,
        base: null, comp: null, mode: "month", filters: {} },
    ],
  }],
};

const T12: SlideTemplate = {
  id: "T12", name: "Bridge por Marca", category: "causa-efeito",
  description: "Qual marca contribuiu mais ou menos para a variação do resultado.",
  tags: ["Bridge", "Marca", "Causa"], isDeck: false,
  slides: [{
    title: "Bridge por Marca",
    blocks: [
      TITLE("Bridge por Marca"),
      KPI("ROL", "rol", 40, 100, 400, 100, 2, "C8102E"),
      CHART({ x: 40, y: 220, w: 1253, h: 500, z: 3,
        chartType: "waterfall", measure: "rol", breakdown: "marca",
        title: "Variação por marca",
        style: { waterfall: WATERFALL_COLORS } }),
    ],
  }],
};

const T13: SlideTemplate = {
  id: "T13", name: "Bridge por Canal", category: "causa-efeito",
  description: "Decomposição da variação por canal de venda.",
  tags: ["Bridge", "Canal", "Causa"], isDeck: false,
  slides: [{
    title: "Bridge por Canal",
    blocks: [
      TITLE("Bridge por Canal"),
      KPI("Volume", "volume", 40, 100, 400, 100, 2, "C8102E"),
      CHART({ x: 40, y: 220, w: 1253, h: 500, z: 3,
        chartType: "waterfall", measure: "volume", breakdown: "canalAjustado",
        title: "Variação por canal",
        style: { waterfall: WATERFALL_COLORS } }),
    ],
  }],
};

const T14: SlideTemplate = {
  id: "T14", name: "Bridge por Categoria", category: "causa-efeito",
  description: "Quais categorias puxaram o resultado para cima ou para baixo.",
  tags: ["Bridge", "Categoria", "Causa"], isDeck: false,
  slides: [{
    title: "Bridge por Categoria",
    blocks: [
      TITLE("Bridge por Categoria"),
      KPI("ROL", "rol", 40, 100, 600, 100, 2, "C8102E"),
      KPI("CM",  "cm", 680, 100, 600, 100, 3),
      CHART({ x: 40, y: 220, w: 1253, h: 500, z: 4,
        chartType: "waterfall", measure: "rol", breakdown: "categoria",
        title: "Variação por categoria",
        style: { waterfall: WATERFALL_COLORS } }),
    ],
  }],
};

// ---------------------------------------------------------------------------
// COMPARATIVO
// ---------------------------------------------------------------------------
const T15: SlideTemplate = {
  id: "T15", name: "Realizado vs. Budget", category: "comparativo",
  description: "Comparativo entre resultado realizado e orçamento previsto.",
  tags: ["Budget", "Comparativo", "Realizado"], isDeck: false,
  slides: [{
    title: "Realizado vs. Budget",
    blocks: [
      TITLE("Realizado vs. Budget"),
      KPI("Receita (Realizado)", "rol",     40,  100, 410, 110, 2, "C8102E"),
      KPI("Volume (Realizado)",  "volume", 460,  100, 410, 110, 3),
      KPI("Margem (Realizado)",  "cm",     880,  100, 410, 110, 4),
      CHART({ x: 40, y: 230, w: 1250, h: 490, z: 5,
        chartType: "column", measure: "rol", breakdown: "marca",
        title: "Realizado por marca" }),
    ],
  }],
};

const T16: SlideTemplate = {
  id: "T16", name: "Top vs. Bottom Performers", category: "comparativo",
  description: "Rankings das marcas que mais cresceram e mais caíram.",
  tags: ["Ranking", "Comparativo", "Top", "Bottom"], isDeck: false,
  slides: [{
    title: "Top vs. Bottom Performers",
    blocks: [
      TITLE("Top vs. Bottom Performers"),
      TOP({ x: 40, y: 100, w: 600, h: 620, z: 2,
        title: "Top crescimento", measure: "rol", dim: "marca",
        sortConfig: { field: "value", dir: "desc" } }),
      TOP({ x: 680, y: 100, w: 613, h: 620, z: 3,
        title: "Maior queda", measure: "rol", dim: "marca",
        sortConfig: { field: "value", dir: "asc" } }),
    ],
  }],
};

const T17: SlideTemplate = {
  id: "T17", name: "Dispersão Preço × Margem", category: "comparativo",
  description: "Scatter posicionando marcas por preço médio e margem.",
  tags: ["Dispersão", "Scatter", "Preço", "Margem"], isDeck: false,
  slides: [{
    title: "Dispersão Preço × Margem",
    blocks: [
      TITLE("Dispersão Preço × Margem"),
      CHART({ x: 40, y: 100, w: 1253, h: 620, z: 2,
        chartType: "scatter", measure: "cm",
        title: "Marcas por preço × margem",
        fieldWells: { yMeasure: "cm", labelDim: "marca" },
        style: { dataLabels: { show: true, position: "right" } } }),
    ],
  }],
};

const T18: SlideTemplate = {
  id: "T18", name: "Bolha Estratégica", category: "comparativo",
  description: "Posicionamento de marcas por volume, preço e margem.",
  tags: ["Bolha", "Bubble", "Estratégico"], isDeck: false,
  slides: [{
    title: "Bolha Estratégica",
    blocks: [
      TITLE("Bolha Estratégica"),
      CHART({ x: 40, y: 100, w: 1253, h: 620, z: 2,
        chartType: "bubble", measure: "volume",
        title: "Marcas: preço × margem × volume",
        fieldWells: { yMeasure: "cm", colorDim: "categoria", labelDim: "marca" } }),
    ],
  }],
};

// ---------------------------------------------------------------------------
// DETALHAMENTO
// ---------------------------------------------------------------------------
const T19: SlideTemplate = {
  id: "T19", name: "Tabela Completa", category: "detalhamento",
  description: "Tabela dinâmica com todos os indicadores por categoria.",
  tags: ["Tabela", "Detalhamento"], isDeck: false,
  slides: [{
    title: "Tabela Completa",
    blocks: [
      TITLE("Detalhamento por Categoria"),
      TABLE(40, 100, 1250, 620, 2, "categoria"),
    ],
  }],
};

const T20: SlideTemplate = {
  id: "T20", name: "KPIs + Tabela", category: "detalhamento",
  description: "3 KPIs de destaque e tabela de detalhamento abaixo.",
  tags: ["KPI", "Tabela", "Detalhamento"], isDeck: false,
  slides: [{
    title: "KPIs + Tabela",
    blocks: [
      TITLE("KPIs + Tabela"),
      KPI("ROL",    "rol",     40,  100, 410, 110, 2, "C8102E"),
      KPI("Volume", "volume", 460,  100, 410, 110, 3),
      KPI("CM",     "cm",     880,  100, 410, 110, 4),
      TABLE(40, 230, 1250, 490, 5, "marca",
        ["rol_real", "vol_real", "cm_real", "precoMedio_real"]),
    ],
  }],
};

const T21: SlideTemplate = {
  id: "T21", name: "Radar de Categorias", category: "detalhamento",
  description: "Comparativo multidimensional de performance por categoria.",
  tags: ["Radar", "Categoria", "Multidimensional"], isDeck: false,
  slides: [{
    title: "Radar de Categorias",
    blocks: [
      TITLE("Radar de Categorias"),
      CHART({ x: 40, y: 100, w: 620, h: 620, z: 2,
        chartType: "radar", measure: "rol", breakdown: "categoria",
        title: "Performance por categoria",
        style: { radar: { fillArea: true, fillOpacity: 0.3, gridShape: "polygon" } } }),
      TABLE(700, 100, 593, 620, 3, "categoria"),
    ],
  }],
};

const T22: SlideTemplate = {
  id: "T22", name: "Linha + Tendência e Forecast", category: "detalhamento",
  description: "Evolução com tendência linear e projeção dos próximos meses.",
  tags: ["Linha", "Tendência", "Forecast"], isDeck: false,
  slides: [{
    title: "Linha + Tendência",
    blocks: [
      TITLE("Linha + Tendência e Forecast"),
      CHART({ x: 40, y: 100, w: 1253, h: 440, z: 2,
        chartType: "line", measure: "rol", title: "Evolução com projeção",
        style: {
          analytics: {
            trendline: { enabled: true, type: "linear", showR2: true,
              color: "#6366f1", thickness: 2, lineStyle: "dashed" },
            forecast: { enabled: true, periods: 3, band: true },
          },
        } }),
      KPI("ROL", "rol",  40, 560, 600, 140, 3, "C8102E"),
      KPI("CM",  "cm",  680, 560, 600, 140, 4),
    ],
  }],
};

// ---------------------------------------------------------------------------
// NARRATIVA EXECUTIVA
// ---------------------------------------------------------------------------
const T25: SlideTemplate = {
  id: "T25", name: "Highlights do Mes", category: "narrativa-executiva",
  description: "Resumo pronto para diretoria: mensagem-chave, KPIs e evolucao principal.",
  tags: ["Storytelling", "Highlights", "Diretoria"], isDeck: false,
  slides: [{
    title: "Highlights do Mes",
    blocks: [
      TITLE("Month Highlights"),
      TEXT("Use este espaco para escrever a leitura executiva do mes em 3 bullets: o que aconteceu, por que aconteceu e qual decisao precisa ser tomada.", 40, 105, 520, 120, 2, 17, "475569"),
      KPI("Volume (Tons)", "volume", 610, 80, 250, 120, 3, "C8102E"),
      KPI("Contrib. Marg.", "cm", 885, 80, 250, 120, 4, "C8102E"),
      KPI("CM %", "cmPct", 1160, 80, 130, 120, 5, "C8102E"),
      TOP({ x: 610, y: 245, w: 320, h: 430, z: 6,
        title: "Heroes - Volume", measure: "volume", dim: "skuDesc", topN: 5,
        sortConfig: { field: "value", dir: "desc" } }),
      TOP({ x: 965, y: 245, w: 325, h: 430, z: 7,
        title: "Heroes - Contr. Marg.", measure: "cm", dim: "skuDesc", topN: 5,
        sortConfig: { field: "value", dir: "desc" } }),
      TEXT("Decisao sugerida", 40, 280, 520, 32, 8, 20, "C8102E"),
      SHAPE(40, 325, 520, 210, 9, "FFF1F2", "FDA4AF", 12),
      TEXT("1. Priorizar os SKUs com maior impacto positivo.\n2. Enderecar os ofensores com plano comercial.\n3. Revisar preco/mix onde houver perda de margem.", 65, 355, 470, 140, 10, 18, "7F1022"),
    ],
  }],
};

const T26: SlideTemplate = {
  id: "T26", name: "O que mudou e por que", category: "narrativa-executiva",
  description: "Diagnostico visual com evolucao, bridge e ranking de causas.",
  tags: ["Diagnostico", "Bridge", "Causas"], isDeck: false,
  slides: [{
    title: "O que mudou e por que",
    blocks: [
      TITLE("O que mudou e por que"),
      TEXT("Comece pela variacao total, depois mostre a causa e finalize com os itens responsaveis.", 40, 88, 760, 38, 2, 16, "64748B"),
      KPI("Variacao de ROL", "rol", 40, 145, 300, 115, 3, "C8102E"),
      KPI("Variacao de Volume", "volume", 360, 145, 300, 115, 4, "1C2430"),
      KPI("Variacao de CM", "cm", 680, 145, 300, 115, 5, "1C2430"),
      { kind: "bridge", z: 6, x: 40, y: 290, w: 760, h: 400,
        base: null, comp: null, mode: "month", filters: {} },
      TOP({ x: 835, y: 145, w: 455, h: 545, z: 7,
        title: "Principais causas por SKU", measure: "cm", dim: "skuDesc", topN: 8,
        sortConfig: { field: "value", dir: "asc" } }),
    ],
  }],
};

const T27: SlideTemplate = {
  id: "T27", name: "Decisao e plano de acao", category: "narrativa-executiva",
  description: "Slide de fechamento com decisao, dono, impacto e acompanhamento.",
  tags: ["Plano", "Acao", "Decisao"], isDeck: false,
  slides: [{
    title: "Decisao e plano de acao",
    blocks: [
      TITLE("Decisao e plano de acao"),
      TEXT("Objetivo da decisao", 45, 115, 360, 28, 2, 18, "C8102E"),
      TEXT("Descreva em uma frase qual decisao precisa ser tomada e qual resultado esperado.", 45, 150, 520, 70, 3, 22, "1C2430"),
      SHAPE(610, 100, 210, 120, 4, "F8FAFC", "E2E8F0", 12),
      TEXT("Impacto", 635, 125, 160, 22, 5, 14, "64748B", "center"),
      KPI("CM", "cm", 625, 145, 180, 70, 6, "C8102E"),
      SHAPE(840, 100, 210, 120, 7, "F8FAFC", "E2E8F0", 12),
      TEXT("Prazo", 865, 125, 160, 22, 8, 14, "64748B", "center"),
      TEXT("30 dias", 875, 155, 140, 42, 9, 30, "1C2430", "center"),
      SHAPE(1070, 100, 210, 120, 10, "F8FAFC", "E2E8F0", 12),
      TEXT("Dono", 1095, 125, 160, 22, 11, 14, "64748B", "center"),
      TEXT("Comercial", 1090, 155, 170, 42, 12, 28, "1C2430", "center"),
      TABLE(40, 270, 1250, 390, 13, "marca", ["rol_real", "vol_real", "cm_real", "cmPct_real"]),
    ],
  }],
};

// ---------------------------------------------------------------------------
// DECK COMPLETO (T23, T24)
// ---------------------------------------------------------------------------
function slidesFrom(...tpls: SlideTemplate[]): TemplateSlide[] {
  return tpls.flatMap((t) => t.slides);
}

const T23: SlideTemplate = {
  id: "T23", name: "Deck Mensal Completo", category: "deck-completo",
  description: "6 slides para revisão mensal completa de resultados.",
  tags: ["Deck", "Mensal", "Completo", "Diretoria"],
  isDeck: true,
  slides: slidesFrom(T01, T11, T06, T07, T15, T19),
};

const T24: SlideTemplate = {
  id: "T24", name: "Deck de Categoria", category: "deck-completo",
  description: "4 slides para análise profunda de uma categoria.",
  tags: ["Deck", "Categoria", "Análise Profunda"],
  isDeck: true,
  slides: slidesFrom(T04, T14, T21, T19),
};

const T28: SlideTemplate = {
  id: "T28", name: "Deck Executivo de Decisao", category: "deck-completo",
  description: "3 slides para abrir a conversa, explicar a causa e fechar com plano.",
  tags: ["Deck", "Narrativa", "Diretoria", "Decisao"],
  isDeck: true,
  slides: slidesFrom(T25, T26, T27),
};

// ---------------------------------------------------------------------------
// REGISTRY
// ---------------------------------------------------------------------------
export const TEMPLATE_REGISTRY: SlideTemplate[] = [
  T01, T02, T03, T04, T05,
  T06, T07, T08, T09, T10,
  T25, T26, T27,
  T11, T12, T13, T14,
  T15, T16, T17, T18,
  T19, T20, T21, T22,
  T23, T24, T28,
];

function rid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function slideToConfig(slide: TemplateSlide): CustomSlideConfig {
  return {
    background: slide.background ?? "FFFFFF",
    showHaraldFooter: slide.showHaraldFooter ?? true,
    blocks: slide.blocks.map((b) => ({
      ...JSON.parse(JSON.stringify(b)),
      id: rid(),
    })) as CustomBlock[],
  };
}

export function templateToSlideConfig(tpl: SlideTemplate): CustomSlideConfig {
  return slideToConfig(tpl.slides[0]);
}

export function templateToSlideConfigs(tpl: SlideTemplate): CustomSlideConfig[] {
  return tpl.slides.map(slideToConfig);
}
