// Custom Slide — tipos e helpers para slide montado livremente pelo usuário.
// Sistema de coordenadas: 1333 x 750 (espelha SlidePreview e mapeia direto
// para 13.33" x 7.5" do LAYOUT_WIDE do PPT — basta dividir por 100).

import type { Filters } from "./types";

export const CANVAS_W = 1333;
export const CANVAS_H = 750;
// Faixa Harald no rodapé — mesma proporção do export (h ≈ 0.85" = 85 unidades)
export const FOOTER_H = 85;

export type CustomBlockKind =
  | "title"
  | "text"
  | "kpi"
  | "image"
  | "shape"
  | "bridge"
  | "table"
  | "chart"
  | "topSku"
  | "dre"
  // Omni Analytics — blocos que reusam componentes das abas analíticas
  | "omni_evolucao_mensal"
  | "omni_heatmap_sazonalidade"
  | "omni_herois_ofensores"
  | "omni_canal_trend"
  | "omni_canal_mix"
  | "omni_custo_evolucao"
  | "omni_custo_composicao"
  | "omni_custo_pressao"
  | "omni_price_decomp"
  | "omni_bridge_pvm"
  | "omni_farol"
  | "omni_abc_curva"
  | "omni_portfolio_matrix"
  | "omni_abc_bars";

export type BlockEnterAnimation = "none" | "fade" | "slide-up" | "pop";

export interface BaseBlock {
  id: string;
  kind: CustomBlockKind;
  x: number; y: number; w: number; h: number;
  z: number;
  /** Posição/tamanho bloqueados (move/resize desabilitados). Default false. */
  locked?: boolean;
  /** Group ID — when set the block belongs to a group and moves/resizes with siblings. */
  groupId?: string;
  /** Animação de entrada no modo apresentação. Default "none". */
  enterAnimation?: BlockEnterAnimation;
  /** Oculto visualmente no canvas (não exportado). Default false. */
  hidden?: boolean;
}

/** Group of blocks that move/resize as a unit. Bounding box is derived from members. */
export interface BlockGroup {
  id: string;
  memberIds: string[];
}

export interface TitleBlock extends BaseBlock {
  kind: "title";
  text: string;
  size: number;
  bold: boolean;
  italic?: boolean;
  color: string;
  align: "left" | "center" | "right";
  fontFamily?: string;
  letterSpacing?: number;
  lineHeight?: number;
  rotation?: number;
  textShadow?: string;
  opacity?: number;
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  padding?: number;
  backgroundColor?: string;
  borderRadius?: number;
}

export interface TextBlock extends BaseBlock {
  kind: "text";
  text: string;
  size: number;
  italic?: boolean;
  color: string;
  align: "left" | "center" | "right";
  fontFamily?: string;
  letterSpacing?: number;
  lineHeight?: number;
  rotation?: number;
  textShadow?: string;
  opacity?: number;
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  padding?: number;
  backgroundColor?: string;
  borderRadius?: number;
}

// ---------------------------------------------------------------------------
// KPI — agora suporta valor manual OU cálculo dinâmico a partir da base
// ---------------------------------------------------------------------------
export type KpiMeasureId =
  | "rol" | "volume" | "cm" | "mb" | "cv" | "frete" | "comissao"
  | "cmPct" | "mbPct" | "precoMedio";

export type KpiPeriodMode = "fy" | "month" | "all";
export type KpiFormat = "auto" | "currency" | "percent" | "tons" | "number";

/**
 * Fonte de dados do bloco.
 * - "ke30":   base detalhada (CSV KE30 — usePricing)
 * - "budget": base agregada / orçamentária (Excel Budget — useBudget)
 * Padrão histórico: "ke30".
 */
export type BlockDataSource = "ke30" | "budget" | "budget_real";

/** Medidas suportadas pela base Budget (subset do KpiMeasureId). */
export const BUDGET_SUPPORTED_MEASURES: ReadonlyArray<KpiMeasureId> = [
  "rol", "volume", "cm", "cv", "cmPct", "precoMedio",
];

export interface KpiBlock extends BaseBlock {
  kind: "kpi";
  label: string;
  /** Tamanho do texto do valor */
  valueSize: number;
  color: string;
  /** Modo de origem do valor */
  source: "manual" | "dynamic";
  /** Valor manual (usado quando source = manual) */
  manualValue?: string;
  /** Medida (usado quando source = dynamic) */
  measure?: KpiMeasureId;
  /** Período: fy/month/all */
  periodMode?: KpiPeriodMode;
  /** Período específico (FY string ou periodo "005.2025") */
  periodValue?: string | null;
  /** Filtros adicionais aplicados ao bloco */
  filters?: Filters;
  /** Formato; "auto" infere a partir da medida */
  format?: KpiFormat;
  /** Fonte de dados — default "ke30" para retro-compatibilidade. */
  dataSource?: BlockDataSource;
  /** Cor de fundo do card. Hex sem '#', "transparent", ou undefined (default F8FAFC). */
  cardBg?: string;
  /** Cross-filter participation — recebe filtros emitidos por outros blocos. Default true. */
  participatesInCrossFilter?: boolean;
}

export interface ImageBlock extends BaseBlock {
  kind: "image";
  src: string;
  fit: "contain" | "cover";
  rotation?: number;
}

export type ShapeType =
  | "rect" | "roundRect" | "circle" | "ellipse"
  | "triangle" | "right-triangle" | "diamond"
  | "pentagon" | "hexagon"
  | "star-4" | "star-5" | "star-6"
  | "line" | "dashed-line" | "arrow" | "double-arrow"
  | "callout-rect" | "callout-rounded"
  | "chevron" | "ribbon"
  | "brace-left" | "brace-right" | "bracket-left" | "bracket-right";

export type ShapeStrokeStyle = "solid" | "dashed" | "dotted";
export type ShapeLineDirection = "horizontal" | "vertical" | "diagonal-down" | "diagonal-up";

export interface ShapeBlock extends BaseBlock {
  kind: "shape";
  shape: ShapeType;
  // Fill
  fill: string;
  fillOpacity?: number;
  // Stroke
  strokeColor?: string;
  strokeWidth?: number;
  strokeStyle?: ShapeStrokeStyle;
  // Geometry
  radius: number;
  rotation?: number;
  // Line-specific
  lineThickness?: number;
  lineDirection?: ShapeLineDirection;
  arrowStart?: boolean;
  arrowEnd?: boolean;
  // Shadow
  shadowEnabled?: boolean;
  shadowColor?: string;
  shadowOpacity?: number;
  shadowBlur?: number;
  shadowX?: number;
  shadowY?: number;
  // ---- Custom-handle geometry (added with contextual handles) ----
  /** Line family endpoints in slide coordinates. Bbox derives from these. */
  p1?: { x: number; y: number };
  p2?: { x: number; y: number };
  /** Chevron notch depth as a fraction 0..0.5 of width. Default 0.22. */
  notchDepth?: number;
  /** Triangle vertices (relative 0..1 within bbox). 3 entries when set. */
  vertices?: { x: number; y: number }[];
}

export const LINE_FAMILY_SHAPES: ReadonlyArray<ShapeType> = [
  "line", "dashed-line", "arrow", "double-arrow",
];

export function isLineFamily(s: ShapeType): boolean {
  return LINE_FAMILY_SHAPES.includes(s);
}

/** Garante todos os campos novos com defaults — backward compat. */
export function ensureShapeBlock(b: ShapeBlock): Required<Omit<ShapeBlock, "groupId" | "locked">> & ShapeBlock {
  const isLine = isLineFamily(b.shape);
  // Migrate line-family blocks without p1/p2 to the new endpoint model.
  let p1 = b.p1;
  let p2 = b.p2;
  if (isLine && (!p1 || !p2)) {
    const dir = b.lineDirection ?? "horizontal";
    const x = b.x, y = b.y, w = b.w, h = b.h;
    if (dir === "vertical")            { p1 = { x: x + w / 2, y };       p2 = { x: x + w / 2, y: y + h }; }
    else if (dir === "diagonal-down")  { p1 = { x, y };                  p2 = { x: x + w, y: y + h }; }
    else if (dir === "diagonal-up")    { p1 = { x, y: y + h };           p2 = { x: x + w, y }; }
    else                               { p1 = { x, y: y + h / 2 };       p2 = { x: x + w, y: y + h / 2 }; }
  }
  // Default vertices for triangle / right-triangle.
  let vertices = b.vertices;
  if (!vertices) {
    if (b.shape === "triangle")            vertices = [{ x: 0.5, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    else if (b.shape === "right-triangle") vertices = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    else                                    vertices = [];
  }
  return {
    ...b,
    fillOpacity: b.fillOpacity ?? 100,
    strokeColor: b.strokeColor ?? "CBD5E1",
    strokeWidth: b.strokeWidth ?? 0,
    strokeStyle: b.strokeStyle ?? "solid",
    rotation: b.rotation ?? 0,
    lineThickness: b.lineThickness ?? 2,
    lineDirection: b.lineDirection ?? "horizontal",
    arrowStart: b.arrowStart ?? false,
    arrowEnd: b.arrowEnd ?? (b.shape === "arrow" || b.shape === "double-arrow"),
    shadowEnabled: b.shadowEnabled ?? false,
    shadowColor: b.shadowColor ?? "000000",
    shadowOpacity: b.shadowOpacity ?? 30,
    shadowBlur: b.shadowBlur ?? 8,
    shadowX: b.shadowX ?? 2,
    shadowY: b.shadowY ?? 2,
    p1: p1 ?? { x: b.x, y: b.y + b.h / 2 },
    p2: p2 ?? { x: b.x + b.w, y: b.y + b.h / 2 },
    notchDepth: b.notchDepth ?? 0.22,
    vertices,
  } as never;
}

export const SHAPE_LABELS: Record<ShapeType, string> = {
  rect: "Retângulo", roundRect: "Retângulo arred.", circle: "Círculo", ellipse: "Elipse",
  triangle: "Triângulo", "right-triangle": "Triângulo retângulo", diamond: "Losango",
  pentagon: "Pentágono", hexagon: "Hexágono",
  "star-4": "Estrela 4", "star-5": "Estrela 5", "star-6": "Estrela 6",
  line: "Linha", "dashed-line": "Linha tracejada", arrow: "Seta", "double-arrow": "Seta dupla",
  "callout-rect": "Balão retangular", "callout-rounded": "Balão arredondado",
  chevron: "Chevron", ribbon: "Faixa",
  "brace-left": "Chave esq.", "brace-right": "Chave dir.",
  "bracket-left": "Colchete esq.", "bracket-right": "Colchete dir.",
};

export const SHAPE_GROUPS: { label: string; shapes: ShapeType[] }[] = [
  { label: "Básicas", shapes: ["rect","roundRect","circle","ellipse","triangle","right-triangle","diamond","pentagon","hexagon"] },
  { label: "Estrelas", shapes: ["star-4","star-5","star-6"] },
  { label: "Linhas", shapes: ["line","dashed-line","arrow","double-arrow"] },
  { label: "Balões", shapes: ["callout-rect","callout-rounded"] },
  { label: "Setas e Faixas", shapes: ["chevron","ribbon"] },
  { label: "Colchetes", shapes: ["brace-left","brace-right","bracket-left","bracket-right"] },
];

export interface BridgeBlock extends BaseBlock {
  kind: "bridge";
  base: string | null;
  comp: string | null;
  mode: "fy" | "month";
  filters: Filters;
}

export interface TableBlock extends BaseBlock {
  kind: "table";
  source: "ke30";
  /** Fonte de dados — default "ke30". */
  dataSource?: BlockDataSource;
  measures: string[];
  rowDims: string[];
  colDim: string | null;
  filters: Filters;
  /** Se true, calcula N de linhas a partir da altura. Default: true */
  autoFit?: boolean;
  /** Limite manual de linhas quando autoFit=false. */
  maxRows?: number;
  /** Agrega o restante numa linha "Outros". Default: false */
  showOthers?: boolean;
  /** Imprime nota "Mostrando X de Y" no PPT exportado. Default: false */
  exportNote?: boolean;
  /** Medida usada para ordenar/ranquear linhas. Default: primeira de measures. */
  sortMeasure?: string;
  /** Alinhamento das células de valor. Default "right". */
  valueAlign?: "left" | "center" | "right";
  /** Formatação condicional por medida. Chave = id da medida. */
  conditionalFormats?: Record<string, ConditionalFormatRule>;
}

export type ConditionalFormatMode = "none" | "heatmap" | "above_avg" | "data_bar";

export interface ConditionalFormatRule {
  mode: ConditionalFormatMode;
  /** Para heatmap: cor do valor mínimo (hex sem #). Default "F8696B". */
  colorMin?: string;
  /** Para heatmap: cor do valor máximo (hex sem #). Default "63BE7B". */
  colorMax?: string;
  /** Para heatmap: cor do meio (hex sem #). Se definido, cria gradiente 3 pontos. */
  colorMid?: string;
  /** Escopo do cálculo: "column" ou "table". Default "table". */
  scope?: "column" | "table" | "row";
}

// ---------------------------------------------------------------------------
// Chart — gráfico ao longo do tempo / categorias
// ---------------------------------------------------------------------------
export type CustomChartType =
  | "line" | "bar" | "column" | "hbar"
  | "stackedColumn" | "stackedBar" | "stackedArea"
  | "pie" | "donut" | "bubble" | "area"
  | "scatter" | "combo" | "waterfall"
  | "funnel" | "treemap" | "radar" | "boxplot" | "histogram";

// Importação tardia para evitar ciclo
import type { ChartStyle } from "@/components/pricing/custom/chart/types";

export interface ChartBlock extends BaseBlock {
  kind: "chart";
  chartType: CustomChartType;
  measure: KpiMeasureId;
  /** Quebra opcional por dimensão (ex.: marca, canal). null = série única */
  breakdown: string | null;
  /** @deprecated — usar style.grid.show */
  showGrid: boolean;
  /** @deprecated — usar style.general.legendShow */
  showLegend: boolean;
  /** @deprecated — usar style.dataLabels.show */
  showLabels: boolean;
  filters: Filters;
  title?: string;
  /** Auto-ajustar nº de séries pela altura do bloco. Default: true */
  autoFit?: boolean;
  /** Limite manual de séries quando autoFit=false. */
  maxSeries?: number;
  /** Agrega séries restantes em uma série "Outros". Default: false */
  showOthers?: boolean;
  /** Imprime nota "Mostrando X de Y" no PPT. Default: false */
  exportNote?: boolean;
  /** Estilo PowerPoint-grade — opcional p/ retro-compatibilidade. */
  style?: Partial<ChartStyle>;
  /** Fonte de dados — default "ke30". */
  dataSource?: BlockDataSource;
  /** Power BI-style axis field wells (Part B.1). When present, takes precedence over measure/breakdown for the relevant slot. */
  fieldWells?: {
    xDim?: string | null;
    yMeasure?: KpiMeasureId;
    colorDim?: string | null;
    tooltipMeasure?: KpiMeasureId | null;
    labelDim?: string | null;
  };
  /** Sort control (Part B.5) */
  sortConfig?: { field: "period" | "value" | "name"; dir: "asc" | "desc" };
  /** Cross-filter participation (Part B.6) — receives filters emitted by other blocks. Default true. */
  participatesInCrossFilter?: boolean;
  /** Cross-filter emission (Part B.6) — emits filter when user clicks a data point. Default true. */
  emitsCrossFilter?: boolean;
}

// ---------------------------------------------------------------------------
// Top SKUs / Top X — ranking
// ---------------------------------------------------------------------------
export interface TopSkuBlock extends BaseBlock {
  kind: "topSku";
  /** Dimensão a ranquear */
  dim: "sku" | "skuDesc" | "cliente" | "marca" | "categoria" | "canalAjustado";
  measure: KpiMeasureId;
  topN: number;
  periodMode: KpiPeriodMode;
  periodValue?: string | null;
  filters: Filters;
  showShare: boolean;
  title?: string;
  /** Auto-ajustar nº de itens pela altura. Default: true */
  autoFit?: boolean;
  /** Agrega itens restantes em "Outros". Default: false */
  showOthers?: boolean;
  /** Imprime nota "Mostrando X de Y" no PPT. Default: false */
  exportNote?: boolean;
  /** Fonte de dados — default "ke30". */
  dataSource?: BlockDataSource;
}

export interface DreBlock extends BaseBlock {
  kind: "dre";
  /** Períodos a exibir. null = últimos 6 meses disponíveis. */
  periodos: string[] | null;
  /** Modo de período. Default "month". */
  periodMode: "month" | "fy";
  /** Linhas a exibir (IDs de DreLine). null = todas. */
  linhas: string[] | null;
  /** Mostrar colunas de Budget quando disponíveis. Default false. */
  showBudget: boolean;
  /** Tamanho da fonte. Default 11. */
  fontSize: number;
  /** Cor do header. Default "#C8102E". */
  headerColor: string;
  /** Cor do texto. Default "#1C2430". */
  textColor: string;
  /** Mostrar linha de totais. Default true. */
  showTotal: boolean;
  /** Fonte de dados. Default "ke30". */
  dataSource?: BlockDataSource;
  showVariacao?: boolean;
  variacaoTipo?: "absoluta" | "percentual" | "ambas";
  conditionalFormat?: {
    enabled: boolean;
    scope: "row" | "table";
    colorMin: string;
    colorMid: string;
    colorMax: string;
    applyTo: "cell" | "text";
    linhasAtivas: string[];
  };
}

// ---------------------------------------------------------------------------
// Omni Analytics Blocks — reusam componentes das abas analíticas
// ---------------------------------------------------------------------------
export type OmniMetric = "cm" | "mb" | "rol" | "volume" | "margemPct";
export type OmniDim = "sku" | "skuDesc" | "cliente" | "marca" | "categoria" | "canalAjustado";
export type OmniAbcSortBy = "margem" | "volume" | "margemPct";
export type OmniHeroesVariant = "hero" | "villain" | "both";

export interface OmniBaseBlock extends BaseBlock {
  /** Métrica principal de agregação/exibição */
  metric: OmniMetric;
  /** Mostrar título no topo do bloco */
  showTitle: boolean;
  /** Mostrar legenda no gráfico */
  showLegend: boolean;
  /** Título customizado — se vazio usa label padrão do tipo */
  title?: string;
  // Filtros dimensionais completos
  periodos: string[] | null;
  canal: string | null;
  canalAjustado: string | null;
  categoria: string | null;
  subcategoria: string | null;
  marca: string | null;
  formato: string | null;
  regional: string | null;
  uf: string | null;
}

export interface OmniEvolucaoMensalBlock extends OmniBaseBlock {
  kind: "omni_evolucao_mensal";
  /** Dimensão de quebra (ex.: marca, canal). null = totais */
  breakdown: OmniDim | null;
  chartType: "line" | "bar" | "area";
}

export interface OmniHeatmapSazonalidadeBlock extends OmniBaseBlock {
  kind: "omni_heatmap_sazonalidade";
}

export interface OmniHeroisOfensoresBlock extends OmniBaseBlock {
  kind: "omni_herois_ofensores";
  dim: OmniDim;
  variant: OmniHeroesVariant;
  sortBy: OmniAbcSortBy;
  topN: number;
}

export interface OmniCanalTrendBlock extends OmniBaseBlock {
  kind: "omni_canal_trend";
  // canal herdado de OmniBaseBlock — null = todos os canais somados
}

export interface OmniCanalMixBlock extends OmniBaseBlock {
  kind: "omni_canal_mix";
}

export interface OmniCustoEvolucaoBlock extends OmniBaseBlock {
  kind: "omni_custo_evolucao";
  /** "pct" = % do ROL; "kg" = por Kg; "abs" = absoluto */
  viewMode: "pct" | "kg" | "abs";
}

export interface OmniCustoComposicaoBlock extends OmniBaseBlock {
  kind: "omni_custo_composicao";
  viewMode: "pct" | "abs";
}

export interface OmniCustoPressaoBlock extends OmniBaseBlock {
  kind: "omni_custo_pressao";
  showCustoVariavel: boolean;
  showCustoFixo: boolean;
}

export interface OmniPriceDecompBlock extends OmniBaseBlock {
  kind: "omni_price_decomp";
  /** Período base (string "FY YYYY" ou periodo "005.2025"). null = auto */
  base: string | null;
  /** Período comparação. null = auto */
  comp: string | null;
  periodMode: "fy" | "month";
}

export interface OmniBridgePvmBlock extends OmniBaseBlock {
  kind: "omni_bridge_pvm";
  base: string | null;
  comp: string | null;
  periodMode: "fy" | "month";
}

export interface OmniFarolBlock extends OmniBaseBlock {
  kind: "omni_farol";
  /** Período referência. null = auto (último período disponível) */
  periodoRef: string | null;
  /** Período comparação. null = auto */
  periodoComp: string | null;
  showGauge: boolean;
}

export interface OmniAbcCurvaBlock extends OmniBaseBlock {
  kind: "omni_abc_curva";
  dim: OmniDim;
  showTable: boolean;
}

export interface OmniPortfolioMatrixBlock extends OmniBaseBlock {
  kind: "omni_portfolio_matrix";
  dim: OmniDim;
}

export interface OmniAbcBarsBlock extends OmniBaseBlock {
  kind: "omni_abc_bars";
  dim: OmniDim;
  variant: OmniHeroesVariant;
  sortBy: OmniAbcSortBy;
  topN: number;
}

export type OmniBlock =
  | OmniEvolucaoMensalBlock
  | OmniHeatmapSazonalidadeBlock
  | OmniHeroisOfensoresBlock
  | OmniCanalTrendBlock
  | OmniCanalMixBlock
  | OmniCustoEvolucaoBlock
  | OmniCustoComposicaoBlock
  | OmniCustoPressaoBlock
  | OmniPriceDecompBlock
  | OmniBridgePvmBlock
  | OmniFarolBlock
  | OmniAbcCurvaBlock
  | OmniPortfolioMatrixBlock
  | OmniAbcBarsBlock;

export type CustomBlock =
  | TitleBlock | TextBlock | KpiBlock | ImageBlock
  | ShapeBlock | BridgeBlock | TableBlock | ChartBlock | TopSkuBlock | DreBlock
  | OmniBlock;

export interface CustomSlideConfig {
  blocks: CustomBlock[];
  background: string;
  showHaraldFooter: boolean;
  /** ID do tema visual aplicado (slideThemes.ts). Default "harald-classic". */
  theme?: string;
  /** Imagem de fundo (data URL ou URL importada). Sobreposta à cor de fundo. */
  backgroundImage?: string;
  /** Block groups (B8.2). Optional for retro-compat. */
  groups?: BlockGroup[];
  /** Notas do apresentador (não exportadas para PPTX). */
  speakerNotes?: string;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------
function rid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultCustomSlide(): CustomSlideConfig {
  return {
    background: "FFFFFF",
    showHaraldFooter: true,
    blocks: [
      {
        id: rid(), kind: "title", z: 1,
        x: 40, y: 30, w: 1240, h: 70,
        text: "Título do slide", size: 44, bold: true,
        color: "C8102E", align: "left",
      } as TitleBlock,
    ],
  };
}

export function newBlock(kind: CustomBlockKind, zTop: number): CustomBlock {
  const id = rid();
  const z = zTop + 1;
  switch (kind) {
    case "title":
      return { id, kind, z, x: 60, y: 60, w: 1200, h: 70,
        text: "Novo título", size: 40, bold: true, color: "C8102E", align: "left" };
    case "text":
      return { id, kind, z, x: 60, y: 150, w: 600, h: 60,
        text: "Clique para editar este texto.", size: 18, color: "1C2430", align: "left" };
    case "kpi":
      return {
        id, kind, z, x: 60, y: 200, w: 280, h: 130,
        label: "ROL", valueSize: 36, color: "C8102E",
        source: "dynamic",
        measure: "rol",
        periodMode: "all",
        periodValue: null,
        filters: {},
        format: "auto",
        manualValue: "",
        dataSource: "ke30",
      };
    case "image":
      return { id, kind, z, x: 80, y: 220, w: 360, h: 220, src: "", fit: "contain" };
    case "shape":
      return { id, kind, z, x: 80, y: 240, w: 240, h: 140,
        shape: "rect", fill: "EEF2F6", fillOpacity: 100,
        strokeColor: "CBD5E1", strokeWidth: 0, strokeStyle: "solid",
        radius: 8, rotation: 0,
        lineThickness: 2, lineDirection: "horizontal",
        arrowStart: false, arrowEnd: true,
        shadowEnabled: false, shadowColor: "000000",
        shadowOpacity: 30, shadowBlur: 8, shadowX: 2, shadowY: 2 };
    case "bridge":
      return { id, kind, z, x: 60, y: 200, w: 1200, h: 380,
        base: null, comp: null, mode: "month", filters: {} };
    case "table":
      return { id, kind, z, x: 60, y: 200, w: 1200, h: 360,
        source: "ke30", dataSource: "ke30",
        measures: ["rol_real", "cm_real"],
        rowDims: ["marca"], colDim: "periodo", filters: {},
        autoFit: true, showOthers: false, exportNote: false };
    case "chart":
      return {
        id, kind, z, x: 60, y: 180, w: 1200, h: 380,
        chartType: "line", measure: "cm", breakdown: null,
        showGrid: true, showLegend: true, showLabels: false,
        filters: {}, title: "Evolução",
        autoFit: true, showOthers: false, exportNote: false,
        dataSource: "ke30",
      };
    case "topSku":
      return {
        id, kind, z, x: 60, y: 180, w: 700, h: 420,
        dim: "skuDesc", measure: "cm", topN: 10,
        periodMode: "all", periodValue: null,
        filters: {}, showShare: true, title: "Top SKUs",
        autoFit: true, showOthers: false, exportNote: false,
        dataSource: "ke30",
      };
    case "dre":
      return {
        id, kind, z,
        x: 60, y: 180, w: 1200, h: 400,
        periodos: null,
        periodMode: "month",
        linhas: null,
        showBudget: false,
        fontSize: 11,
        headerColor: "#C8102E",
        textColor: "#1C2430",
        showTotal: true,
        dataSource: "ke30",
      } as DreBlock;
    // --- Omni Analytics ---
    case "omni_evolucao_mensal":
      return { id, kind, z, x: 60, y: 160, w: 1200, h: 400,
        showTitle: true, showLegend: true, title: "Evolução Mensal",
        metric: "cm", breakdown: null, chartType: "line",
        periodos: null, canal: null, canalAjustado: null, categoria: null,
        subcategoria: null, marca: null, formato: null, regional: null, uf: null,
      } as OmniEvolucaoMensalBlock;
    case "omni_heatmap_sazonalidade":
      return { id, kind, z, x: 60, y: 160, w: 1200, h: 340,
        showTitle: true, showLegend: false, title: "Heatmap Sazonalidade",
        metric: "margemPct",
        periodos: null, canal: null, canalAjustado: null, categoria: null,
        subcategoria: null, marca: null, formato: null, regional: null, uf: null,
      } as OmniHeatmapSazonalidadeBlock;
    case "omni_herois_ofensores":
      return { id, kind, z, x: 60, y: 160, w: 580, h: 380,
        showTitle: true, showLegend: false, title: "Heróis e Ofensores",
        metric: "cm", dim: "skuDesc", variant: "both", sortBy: "margem", topN: 5,
        periodos: null, canal: null, canalAjustado: null, categoria: null,
        subcategoria: null, marca: null, formato: null, regional: null, uf: null,
      } as OmniHeroisOfensoresBlock;
    case "omni_canal_trend":
      return { id, kind, z, x: 60, y: 160, w: 1200, h: 380,
        showTitle: true, showLegend: true, title: "Tendência por Canal",
        metric: "margemPct",
        periodos: null, canal: null, canalAjustado: null, categoria: null,
        subcategoria: null, marca: null, formato: null, regional: null, uf: null,
      } as OmniCanalTrendBlock;
    case "omni_canal_mix":
      return { id, kind, z, x: 60, y: 160, w: 1200, h: 380,
        showTitle: true, showLegend: true, title: "Mix por Canal",
        metric: "rol",
        periodos: null, canal: null, canalAjustado: null, categoria: null,
        subcategoria: null, marca: null, formato: null, regional: null, uf: null,
      } as OmniCanalMixBlock;
    case "omni_custo_evolucao":
      return { id, kind, z, x: 60, y: 160, w: 1200, h: 380,
        showTitle: true, showLegend: true, title: "Evolução de Custos",
        metric: "cm", viewMode: "pct",
        periodos: null, canal: null, canalAjustado: null, categoria: null,
        subcategoria: null, marca: null, formato: null, regional: null, uf: null,
      } as OmniCustoEvolucaoBlock;
    case "omni_custo_composicao":
      return { id, kind, z, x: 60, y: 160, w: 1200, h: 380,
        showTitle: true, showLegend: true, title: "Composição de Custos",
        metric: "cm", viewMode: "pct",
        periodos: null, canal: null, canalAjustado: null, categoria: null,
        subcategoria: null, marca: null, formato: null, regional: null, uf: null,
      } as OmniCustoComposicaoBlock;
    case "omni_custo_pressao":
      return { id, kind, z, x: 60, y: 160, w: 600, h: 300,
        showTitle: true, showLegend: true, title: "Pressão de Custo sobre Receita",
        metric: "cm", showCustoVariavel: true, showCustoFixo: true,
        periodos: null, canal: null, canalAjustado: null, categoria: null,
        subcategoria: null, marca: null, formato: null, regional: null, uf: null,
      } as OmniCustoPressaoBlock;
    case "omni_price_decomp":
      return { id, kind, z, x: 60, y: 160, w: 1200, h: 380,
        showTitle: true, showLegend: false, title: "Decomposição de Preço",
        metric: "cm", base: null, comp: null, periodMode: "month",
        periodos: null, canal: null, canalAjustado: null, categoria: null,
        subcategoria: null, marca: null, formato: null, regional: null, uf: null,
      } as OmniPriceDecompBlock;
    case "omni_bridge_pvm":
      return { id, kind, z, x: 60, y: 160, w: 1200, h: 400,
        showTitle: true, showLegend: false, title: "Bridge PVM",
        metric: "cm", base: null, comp: null, periodMode: "month",
        periodos: null, canal: null, canalAjustado: null, categoria: null,
        subcategoria: null, marca: null, formato: null, regional: null, uf: null,
      } as OmniBridgePvmBlock;
    case "omni_farol":
      return { id, kind, z, x: 200, y: 160, w: 500, h: 420,
        showTitle: true, showLegend: false, title: "Farol de Positivação",
        metric: "cm", periodoRef: null, periodoComp: null, showGauge: true,
        periodos: null, canal: null, canalAjustado: null, categoria: null,
        subcategoria: null, marca: null, formato: null, regional: null, uf: null,
      } as OmniFarolBlock;
    case "omni_abc_curva":
      return { id, kind, z, x: 60, y: 160, w: 1200, h: 460,
        showTitle: true, showLegend: false, title: "Curva ABC",
        metric: "rol", dim: "skuDesc", showTable: false,
        periodos: null, canal: null, canalAjustado: null, categoria: null,
        subcategoria: null, marca: null, formato: null, regional: null, uf: null,
      } as OmniAbcCurvaBlock;
    case "omni_portfolio_matrix":
      return { id, kind, z, x: 60, y: 160, w: 1200, h: 460,
        showTitle: true, showLegend: false, title: "Matriz de Portfólio",
        metric: "cm", dim: "skuDesc",
        periodos: null, canal: null, canalAjustado: null, categoria: null,
        subcategoria: null, marca: null, formato: null, regional: null, uf: null,
      } as OmniPortfolioMatrixBlock;
    case "omni_abc_bars":
      return { id, kind, z, x: 60, y: 160, w: 580, h: 380,
        showTitle: true, showLegend: false, title: "Barras ABC",
        metric: "cm", dim: "skuDesc", variant: "hero", sortBy: "margem", topN: 5,
        periodos: null, canal: null, canalAjustado: null, categoria: null,
        subcategoria: null, marca: null, formato: null, regional: null, uf: null,
      } as OmniAbcBarsBlock;
  }
}

/** Cria um ChartBlock já com chartType específico (para a paleta de gráficos). */
export function newChartBlock(chartType: CustomChartType, zTop: number): ChartBlock {
  const base = newBlock("chart", zTop) as ChartBlock;
  const out: ChartBlock = { ...base, chartType, title: CHART_TYPE_LABELS[chartType] };
  if (chartType === "waterfall") {
    out.title = "Bridge PVM";
    out.breakdown = null;
    out.emitsCrossFilter = false;
    out.style = {
      ...(out.style ?? {}),
      waterfall: {
        mode: "pvm",
        pvm: { base: null, comp: null, periodMode: "month" },
      } as never,
    };
  }
  return out;
}

export const CHART_TYPE_LABELS: Record<CustomChartType, string> = {
  line: "Linha",
  area: "Área",
  stackedArea: "Área Empilhada",
  bar: "Coluna",
  column: "Coluna Agrupada",
  stackedColumn: "Coluna Empilhada",
  hbar: "Barra",
  stackedBar: "Barra Empilhada",
  combo: "Combinado",
  pie: "Pizza",
  donut: "Rosca",
  bubble: "Bolha",
  scatter: "Dispersão",
  waterfall: "Bridge",
  funnel: "Funil",
  treemap: "Mapa de Árvore",
  radar: "Radar",
  boxplot: "Caixa",
  histogram: "Histograma",
};

export const BLOCK_LABELS: Record<CustomBlockKind, string> = {
  title: "Título",
  text: "Texto",
  kpi: "KPI",
  image: "Imagem",
  shape: "Forma",
  bridge: "Bridge",
  table: "Tabela",
  chart: "Gráfico",
  topSku: "Top Ranking",
  dre: "DRE",
  // Omni Analytics
  omni_evolucao_mensal: "Evolução Mensal",
  omni_heatmap_sazonalidade: "Heatmap Sazonalidade",
  omni_herois_ofensores: "Heróis e Ofensores",
  omni_canal_trend: "Tendência Canal",
  omni_canal_mix: "Mix por Canal",
  omni_custo_evolucao: "Evolução de Custos",
  omni_custo_composicao: "Composição de Custos",
  omni_custo_pressao: "Pressão de Custo sobre Receita",
  omni_price_decomp: "Decomposição de Preço",
  omni_bridge_pvm: "Bridge PVM",
  omni_farol: "Farol de Positivação",
  omni_abc_curva: "Curva ABC / Pareto",
  omni_portfolio_matrix: "Matriz de Portfólio",
  omni_abc_bars: "Barras ABC",
};

// ---------------------------------------------------------------------------
// Catálogo de medidas KPI/chart
// ---------------------------------------------------------------------------
export const KPI_MEASURES: { id: KpiMeasureId; label: string; format: Exclude<KpiFormat, "auto"> }[] = [
  { id: "rol",        label: "ROL",                 format: "currency" },
  { id: "volume",     label: "Volume (Kg)",         format: "tons" },
  { id: "cm",         label: "Contrib. Marginal",   format: "currency" },
  { id: "cv",         label: "Custo Variável",      format: "currency" },
  { id: "mb",         label: "Margem Bruta",        format: "currency" },
  { id: "frete",      label: "Frete",               format: "currency" },
  { id: "comissao",   label: "Comissão",            format: "currency" },
  { id: "cmPct",      label: "CM %",                format: "percent" },
  { id: "mbPct",      label: "MB %",                format: "percent" },
  { id: "precoMedio", label: "Preço Médio (R$/Kg)", format: "currency" },
];

// Medidas que NÃO existem na base Budget (apenas KE30 tem custos detalhados).
export const BUDGET_UNAVAILABLE_MEASURES: readonly string[] = [
  "mb", "mbPct", "frete", "comissao",
];

export const BUDGET_UNAVAILABLE_HINT =
  "Indisponível na fonte Budget — a base Budget não contém custos detalhados (Margem Bruta, Frete, Comissão).";

/** Retorna true se a fonte de dados é derivada da planilha Budget (budget ou budget_real). */
export function isFromBudgetBase(ds: BlockDataSource | undefined): boolean {
  return ds === "budget" || ds === "budget_real";
}

/** Migra valores antigos de dataSource para o esquema atual. */
export function migrateDataSource(ds: string | undefined): BlockDataSource {
  if (ds === "real") return "ke30";
  if (ds === "budget" || ds === "budget_real" || ds === "ke30") return ds;
  return "ke30";
}

export function isMeasureAvailable(
  measureId: string,
  dataSource: BlockDataSource | undefined,
): boolean {
  if (!isFromBudgetBase(dataSource)) return true;
  return !BUDGET_UNAVAILABLE_MEASURES.includes(measureId);
}
