// Templates pré-definidos de apresentações para a galeria.
// Cada template retorna uma lista de SlideItem prontos para inserir na esteira.
import type { SlideItem, SlideKind } from "./slidesFlow";
import { defaultItem } from "./slidesFlow";
import {
  defaultCustomSlide, newBlock,
  type CustomSlideConfig, type CustomBlock,
  type TitleBlock, type KpiBlock, type TopSkuBlock, type ChartBlock, type TableBlock,
} from "./customSlide";

export type TemplateCategory =
  | "Resultado Mensal" | "Revisão de Preço" | "Kick-off" | "Ad hoc";

export interface TemplateCtx {
  months: { periodo: string; mes: number; ano: number }[];
  budgetMonths: { periodo: string; mes: number; ano: number }[];
}

export interface SlideTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  /** Dados necessários no ctx para este template funcionar corretamente. */
  requires?: Array<"months" | "budget">;
  /** Thumbnail SVG inline (representação esquemática do layout). */
  thumbnail: (props: { className?: string }) => JSX.Element;
  /** Constrói a lista de slides. Pode usar contexto (períodos disponíveis). */
  build: (ctx: TemplateCtx) => SlideItem[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mk<K extends SlideKind>(kind: K, patch?: (it: SlideItem) => SlideItem): SlideItem {
  const it = defaultItem(kind);
  return patch ? patch(it) : it;
}

function withSmartBridge(ctx: TemplateCtx, mode: "month" | "fy" = "month"): SlideItem {
  return mk("bridge_pvm", (it) => {
    if (it.kind !== "bridge_pvm") return it;
    if (ctx.months.length >= 2) {
      const last = ctx.months[ctx.months.length - 1];
      const prev = ctx.months[ctx.months.length - 2];
      it.config = { ...it.config, mode, base: prev.periodo, comp: last.periodo };
    }
    return it;
  });
}

function withSmartBudgetEvo(ctx: TemplateCtx): SlideItem {
  return mk("budget_evo", (it) => {
    if (it.kind !== "budget_evo") return it;
    if (ctx.budgetMonths.length > 0) {
      const last = ctx.budgetMonths[ctx.budgetMonths.length - 1];
      const fyStart = last.mes >= 4 ? last.ano : last.ano - 1;
      const prevFyStart = fyStart - 1;
      const candidate = `${String(4).padStart(3, "0")}.${prevFyStart}`;
      const has = ctx.budgetMonths.some((m) => m.periodo === candidate);
      it.config = {
        ...it.config,
        start: has ? candidate : ctx.budgetMonths[0].periodo,
        end: last.periodo,
      };
    }
    return it;
  });
}

function cover(title: string, subtitle = "", variant: "cover" | "divider" = "cover"): SlideItem {
  return mk("cover", (it) => {
    if (it.kind !== "cover") return it;
    it.config = { title, subtitle, variant };
    it.label = title;
    return it;
  });
}

function customSlide(label: string, builder: (z: number) => CustomBlock[]): SlideItem {
  return mk("custom", (it) => {
    if (it.kind !== "custom") return it;
    const cfg: CustomSlideConfig = defaultCustomSlide();
    const blocks = builder(cfg.blocks.length);
    cfg.blocks = [...cfg.blocks, ...blocks];
    it.config = cfg;
    it.label = label;
    return it;
  });
}

// Pequenos construtores de bloco com posicionamento.
function placeTitle(z: number, text: string): TitleBlock {
  const b = newBlock("title", z) as TitleBlock;
  return { ...b, text, x: 40, y: 30, w: 1240, h: 70 };
}

function placeKpi(z: number, x: number, label: string, measure: KpiBlock["measure"]): KpiBlock {
  const b = newBlock("kpi", z) as KpiBlock;
  return { ...b, x, y: 140, w: 280, h: 140, label, measure, periodMode: "all" };
}

function placeTopSku(z: number, x: number, w: number, title: string, measure: TopSkuBlock["measure"], topN = 5): TopSkuBlock {
  const b = newBlock("topSku", z) as TopSkuBlock;
  return { ...b, x, y: 310, w, h: 360, title, measure, topN, dim: "skuDesc" };
}

function placeChart(z: number, title: string, chartType: ChartBlock["chartType"], measure: ChartBlock["measure"], breakdown: ChartBlock["breakdown"] = null): ChartBlock {
  const b = newBlock("chart", z) as ChartBlock;
  return { ...b, x: 40, y: 130, w: 1240, h: 540, title, chartType, measure, breakdown };
}

function placeTable(z: number, title: string, rowDims: TableBlock["rowDims"], measures: TableBlock["measures"]): TableBlock {
  const b = newBlock("table", z) as TableBlock;
  return { ...b, x: 40, y: 130, w: 1240, h: 540, rowDims, measures, colDim: "periodo" };
}

// ---------------------------------------------------------------------------
// Thumbnails (SVG inline) — representam visualmente o layout do template
// ---------------------------------------------------------------------------
const SVG_BG = "hsl(var(--muted))";
const SVG_FG = "hsl(var(--primary))";
const SVG_LINE = "hsl(var(--border))";

function Frame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 160 90" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="160" height="90" rx="6" fill={SVG_BG} />
      {children}
    </svg>
  );
}

const Page = (
  els: React.ReactNode,
  className?: string,
) => <Frame className={className}>{els}</Frame>;

// Layouts simples reutilizáveis.
const Cover = (
  <>
    <rect x="20" y="32" width="80" height="6" rx="1.5" fill={SVG_FG} />
    <rect x="20" y="44" width="50" height="3" rx="1" fill={SVG_LINE} />
    <rect x="20" y="68" width="120" height="2" rx="1" fill={SVG_FG} opacity="0.5" />
  </>
);
const BridgeBars = (
  <>
    <rect x="10" y="8" width="60" height="4" rx="1" fill={SVG_LINE} />
    {[
      { x: 14, h: 30 }, { x: 30, h: 18 }, { x: 46, h: 24 }, { x: 62, h: 14 },
      { x: 78, h: 22 }, { x: 94, h: 16 }, { x: 110, h: 28 }, { x: 126, h: 36 }, { x: 142, h: 32 },
    ].map((b, i) => (
      <rect key={i} x={b.x} y={80 - b.h} width="10" height={b.h} rx="1" fill={i === 0 || i === 8 ? SVG_FG : "hsl(var(--accent-foreground))"} opacity={i === 0 || i === 8 ? 1 : 0.6} />
    ))}
  </>
);
const BudgetLines = (
  <>
    <rect x="10" y="8" width="60" height="4" rx="1" fill={SVG_LINE} />
    <polyline points="10,72 30,60 50,64 70,52 90,58 110,46 130,52 150,40" fill="none" stroke={SVG_FG} strokeWidth="2" />
    <polyline points="10,68 30,66 50,58 70,56 90,50 110,52 130,44 150,46" fill="none" stroke={SVG_LINE} strokeWidth="2" strokeDasharray="3 2" />
  </>
);
const KpiGrid = (
  <>
    <rect x="10" y="8" width="60" height="4" rx="1" fill={SVG_LINE} />
    {[10, 50, 90, 130].map((x) => (
      <rect key={x} x={x} y={26} width="20" height="34" rx="2" fill="hsl(var(--card))" stroke={SVG_LINE} />
    ))}
    {[10, 50, 90, 130].map((x) => (
      <rect key={x} x={x + 3} y={36} width="14" height="6" rx="1" fill={SVG_FG} />
    ))}
  </>
);
const TableLayout = (
  <>
    <rect x="10" y="8" width="60" height="4" rx="1" fill={SVG_LINE} />
    {[24, 36, 48, 60, 72].map((y) => (
      <rect key={y} x={10} y={y} width={140} height={8} rx="1" fill="hsl(var(--card))" stroke={SVG_LINE} />
    ))}
    <rect x={10} y={24} width={140} height={8} rx="1" fill={SVG_FG} opacity="0.2" />
  </>
);
const TopSkuLayout = (
  <>
    <rect x="10" y="8" width="60" height="4" rx="1" fill={SVG_LINE} />
    {[0, 1, 2, 3, 4].map((i) => (
      <rect key={i} x={10} y={26 + i * 10} width={120 - i * 18} height={6} rx="1" fill={SVG_FG} opacity={1 - i * 0.15} />
    ))}
  </>
);

const Multi = (parts: React.ReactNode[]) => (
  <Frame>
    {parts.map((p, i) => {
      const cols = Math.min(parts.length, 3);
      const w = 160 / cols;
      const x = (i % cols) * w;
      const y = Math.floor(i / cols) * 45;
      return (
        <g key={i} transform={`translate(${x + 4}, ${y + 4}) scale(${(w - 8) / 160}, ${(45 - 8) / 90})`}>
          <rect width="160" height="90" rx="3" fill="hsl(var(--card))" stroke={SVG_LINE} />
          {p}
        </g>
      );
    })}
  </Frame>
);

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
export const SLIDE_TEMPLATES: SlideTemplate[] = [
  // ------- Resultado Mensal -------
  {
    id: "resultado-mensal-completo",
    name: "Resultado Mensal Completo",
    description: "Capa, Bridge PVM, Budget Evolutivo, KPIs e Top SKUs.",
    category: "Resultado Mensal",
    requires: ["months", "budget"],
    thumbnail: ({ className }) => Multi([Cover, BridgeBars, BudgetLines, KpiGrid, TopSkuLayout]),
    build: (ctx) => [
      cover("Resultado Mensal", "Visão consolidada do período"),
      withSmartBridge(ctx, "month"),
      withSmartBudgetEvo(ctx),
      customSlide("KPIs do mês", (z) => [
        placeTitle(z + 1, "KPIs do mês"),
        placeKpi(z + 2, 40, "ROL", "rol"),
        placeKpi(z + 3, 360, "CM%", "cmPct"),
        placeKpi(z + 4, 680, "Volume", "volume"),
        placeKpi(z + 5, 1000, "MB", "mb"),
      ]),
      customSlide("Top SKUs", (z) => [
        placeTitle(z + 1, "Top SKUs por margem"),
        placeTopSku(z + 2, 40, 1240, "Top 10 SKUs", "cm", 10),
      ]),
    ],
  },
  {
    id: "resultado-mensal-rapido",
    name: "Resultado Mensal Rápido",
    description: "Capa, Bridge PVM e KPIs essenciais.",
    category: "Resultado Mensal",
    requires: ["months"],
    thumbnail: ({ className }) => Multi([Cover, BridgeBars, KpiGrid]),
    build: (ctx) => [
      cover("Resultado Mensal", "Resumo executivo"),
      withSmartBridge(ctx, "month"),
      customSlide("KPIs", (z) => [
        placeTitle(z + 1, "Indicadores do mês"),
        placeKpi(z + 2, 40, "ROL", "rol"),
        placeKpi(z + 3, 360, "CM%", "cmPct"),
        placeKpi(z + 4, 680, "Volume", "volume"),
        placeKpi(z + 5, 1000, "MB%", "mbPct"),
      ]),
    ],
  },
  {
    id: "resultado-quinzenal",
    name: "Resultado Quinzenal",
    description: "Capa, Bridge PVM e Heróis & Ofensores.",
    category: "Resultado Mensal",
    requires: ["months"],
    thumbnail: ({ className }) => Multi([Cover, BridgeBars, TopSkuLayout]),
    build: (ctx) => [
      cover("Resultado Quinzenal", "Acompanhamento de meio de mês", "divider"),
      withSmartBridge(ctx, "month"),
      customSlide("Heróis e Ofensores", (z) => [
        placeTitle(z + 1, "Top 5 Heróis e Ofensores"),
        placeTopSku(z + 2, 40, 600, "Top 5 Heróis", "cm", 5),
        { ...placeTopSku(z + 3, 660, 620, "Top 5 Ofensores", "cm", 5), measure: "cm" } as TopSkuBlock,
      ]),
    ],
  },

  // ------- Revisão de Preço -------
  {
    id: "revisao-pricing",
    name: "Revisão de Pricing",
    description: "Divisor, tabela por SKU, margem por canal e Bridge PVM.",
    category: "Revisão de Preço",
    requires: ["months"],
    thumbnail: ({ className }) => Multi([Cover, TableLayout, BudgetLines, BridgeBars]),
    build: (ctx) => [
      cover("Revisão de Pricing", "Análise por SKU e canal", "divider"),
      customSlide("Pivot por SKU", (z) => [
        placeTitle(z + 1, "Performance por SKU"),
        placeTable(z + 2, "Pivot SKU", ["skuDesc"], ["rol_real", "cm_real", "cmPct_real"]),
      ]),
      customSlide("Margem por canal", (z) => [
        placeTitle(z + 1, "Margem % por canal"),
        placeChart(z + 2, "CM% por canal", "line", "cmPct", "canal"),
      ]),
      withSmartBridge(ctx, "month"),
    ],
  },
  {
    id: "analise-canal",
    name: "Análise de Canal",
    description: "Capa, evolução de margem por canal e tabela detalhada.",
    category: "Revisão de Preço",
    thumbnail: ({ className }) => Multi([Cover, BudgetLines, TableLayout]),
    build: () => [
      cover("Análise de Canal", "Performance por canal de venda"),
      customSlide("Margem por canal", (z) => [
        placeTitle(z + 1, "Evolução de margem por canal"),
        placeChart(z + 2, "CM% por canal", "line", "cmPct", "canal"),
      ]),
      customSlide("Tabela de canais", (z) => [
        placeTitle(z + 1, "Detalhamento por canal"),
        placeTable(z + 2, "Canais", ["canal"], ["rol_real", "cm_real", "cmPct_real", "vol_real"]),
      ]),
    ],
  },

  // ------- Kick-off -------
  {
    id: "kickoff-periodo",
    name: "Kick-off de Período",
    description: "Capa, KPIs do FY, Budget Evolutivo e Top SKUs do FY.",
    category: "Kick-off",
    requires: ["budget"],
    thumbnail: ({ className }) => Multi([Cover, KpiGrid, BudgetLines, TopSkuLayout]),
    build: (ctx) => [
      cover("Kick-off do Período", "Visão estratégica do FY"),
      customSlide("KPIs do FY", (z) => [
        placeTitle(z + 1, "Indicadores do ano fiscal"),
        placeKpi(z + 2, 40, "ROL FY", "rol"),
        placeKpi(z + 3, 360, "CM% FY", "cmPct"),
        placeKpi(z + 4, 680, "Volume FY", "volume"),
        placeKpi(z + 5, 1000, "MB FY", "mb"),
      ]),
      withSmartBudgetEvo(ctx),
      customSlide("Top SKUs do FY", (z) => [
        placeTitle(z + 1, "Top SKUs do ano fiscal"),
        placeTopSku(z + 2, 40, 1240, "Top 10 SKUs FY", "cm", 10),
      ]),
    ],
  },

  // ------- Ad hoc -------
  {
    id: "slide-unico",
    name: "Slide Único",
    description: "Apenas 1 slide personalizado em branco com título.",
    category: "Ad hoc",
    thumbnail: ({ className }) => Page(<>
      <rect x="20" y="20" width="80" height="6" rx="1.5" fill={SVG_FG} />
      <rect x="20" y="34" width="120" height="48" rx="2" fill="hsl(var(--card))" stroke={SVG_LINE} />
    </>, className),
    build: () => [
      customSlide("Slide em branco", (z) => [placeTitle(z + 1, "Novo slide")]),
    ],
  },
  {
    id: "deck-basico",
    name: "Deck Básico",
    description: "Capa e 2 slides personalizados em branco.",
    category: "Ad hoc",
    thumbnail: ({ className }) => Multi([Cover,
      <><rect x="20" y="20" width="80" height="6" rx="1.5" fill={SVG_FG} /></>,
      <><rect x="20" y="20" width="80" height="6" rx="1.5" fill={SVG_FG} /></>,
    ]),
    build: () => [
      cover("Apresentação", ""),
      customSlide("Slide 1", (z) => [placeTitle(z + 1, "Slide 1")]),
      customSlide("Slide 2", (z) => [placeTitle(z + 1, "Slide 2")]),
    ],
  },
  {
    id: "em-branco",
    name: "Em Branco",
    description: "Comece do zero, sem nenhum slide pré-criado.",
    category: "Ad hoc",
    thumbnail: ({ className }) => Page(<>
      <rect x="40" y="36" width="80" height="18" rx="2" fill="hsl(var(--card))" stroke={SVG_LINE} strokeDasharray="3 2" />
    </>, className),
    build: () => [],
  },
];

export const TEMPLATE_CATEGORIES: ("Todos" | TemplateCategory)[] = [
  "Todos", "Resultado Mensal", "Revisão de Preço", "Kick-off", "Ad hoc",
];
