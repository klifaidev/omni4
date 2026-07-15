import type {
  CustomBlock,
  DreBlock,
  KpiBlock,
  ShapeBlock,
  TableBlock,
  TextBlock,
  TitleBlock,
} from "./customSlide";

export type SlideBrandStyleTarget = "text" | "kpi" | "shape" | "table" | "dre";

export const SLIDE_DEFAULT_FONT_LABEL = "Calibri";
export const SLIDE_DEFAULT_FONT_FAMILY = "Calibri, sans-serif";

export interface SlideBrandStyle {
  id: string;
  name: string;
  description: string;
  target: SlideBrandStyleTarget;
  preview: {
    bg: string;
    fg: string;
    accent: string;
  };
  patch: Partial<TitleBlock & TextBlock & KpiBlock & ShapeBlock & TableBlock & DreBlock>;
}

export const SLIDE_BRAND_STYLES: SlideBrandStyle[] = [
  {
    id: "text-executive-title",
    name: "Titulo executivo",
    description: "Titulo forte para abertura e chamadas principais.",
    target: "text",
    preview: { bg: "FFFFFF", fg: "C8102E", accent: "1C2430" },
    patch: {
      size: 42,
      bold: true,
      italic: false,
      color: "C8102E",
      align: "left",
      fontFamily: SLIDE_DEFAULT_FONT_FAMILY,
      letterSpacing: 0,
      lineHeight: 1.05,
      textShadow: "",
      opacity: 100,
      textTransform: "none",
      padding: 0,
      backgroundColor: "",
      borderRadius: 0,
    },
  },
  {
    id: "text-support-copy",
    name: "Texto de apoio",
    description: "Texto menor e legivel para bullets e narrativas.",
    target: "text",
    preview: { bg: "FFFFFF", fg: "475569", accent: "CBD5E1" },
    patch: {
      size: 18,
      italic: false,
      color: "475569",
      align: "left",
      fontFamily: SLIDE_DEFAULT_FONT_FAMILY,
      letterSpacing: 0,
      lineHeight: 1.35,
      textShadow: "",
      opacity: 100,
      textTransform: "none",
      padding: 0,
      backgroundColor: "",
      borderRadius: 0,
    },
  },
  {
    id: "text-callout-red",
    name: "Chamada vermelha",
    description: "Destaque com fundo suave para insights importantes.",
    target: "text",
    preview: { bg: "FFF1F2", fg: "C8102E", accent: "FDA4AF" },
    patch: {
      size: 20,
      bold: true,
      italic: false,
      color: "C8102E",
      align: "left",
      fontFamily: SLIDE_DEFAULT_FONT_FAMILY,
      letterSpacing: 0,
      lineHeight: 1.25,
      textShadow: "",
      opacity: 100,
      textTransform: "none",
      padding: 14,
      backgroundColor: "FFF1F2",
      borderRadius: 8,
    },
  },
  {
    id: "kpi-light",
    name: "KPI claro",
    description: "Card executivo claro com destaque Harald.",
    target: "kpi",
    preview: { bg: "F8FAFC", fg: "C8102E", accent: "E2E8F0" },
    patch: {
      valueSize: 34,
      color: "C8102E",
      cardBg: "F8FAFC",
    },
  },
  {
    id: "kpi-dark",
    name: "KPI escuro",
    description: "Card de alto contraste para slides escuros.",
    target: "kpi",
    preview: { bg: "1C2430", fg: "FFFFFF", accent: "C8102E" },
    patch: {
      valueSize: 32,
      color: "FFFFFF",
      cardBg: "1C2430",
    },
  },
  {
    id: "kpi-minimal",
    name: "KPI minimal",
    description: "Numero solto, sem moldura visual pesada.",
    target: "kpi",
    preview: { bg: "FFFFFF", fg: "1C2430", accent: "C8102E" },
    patch: {
      valueSize: 36,
      color: "1C2430",
      cardBg: "transparent",
    },
  },
  {
    id: "shape-soft-card",
    name: "Cartao suave",
    description: "Base clara para agrupar informacoes.",
    target: "shape",
    preview: { bg: "F8FAFC", fg: "1C2430", accent: "E2E8F0" },
    patch: {
      shape: "roundRect",
      fill: "F8FAFC",
      fillOpacity: 100,
      strokeColor: "E2E8F0",
      strokeWidth: 1,
      strokeStyle: "solid",
      radius: 12,
      shadowEnabled: true,
      shadowColor: "000000",
      shadowOpacity: 10,
      shadowBlur: 12,
      shadowX: 0,
      shadowY: 4,
    },
  },
  {
    id: "shape-harald-band",
    name: "Faixa Harald",
    description: "Faixa vermelha para separacao ou assinatura.",
    target: "shape",
    preview: { bg: "C8102E", fg: "FFFFFF", accent: "7F1022" },
    patch: {
      shape: "rect",
      fill: "C8102E",
      fillOpacity: 100,
      strokeColor: "C8102E",
      strokeWidth: 0,
      strokeStyle: "solid",
      radius: 0,
      shadowEnabled: false,
    },
  },
  {
    id: "shape-divider",
    name: "Linha divisoria",
    description: "Separador fino para organizar o slide.",
    target: "shape",
    preview: { bg: "FFFFFF", fg: "CBD5E1", accent: "64748B" },
    patch: {
      shape: "line",
      fill: "CBD5E1",
      strokeColor: "CBD5E1",
      strokeWidth: 0,
      radius: 0,
      lineThickness: 2,
      lineDirection: "horizontal",
      shadowEnabled: false,
    },
  },
  {
    id: "table-executive",
    name: "Tabela executiva",
    description: "Valores centralizados e leitura mais limpa.",
    target: "table",
    preview: { bg: "FFFFFF", fg: "1C2430", accent: "C8102E" },
    patch: {
      valueAlign: "center",
    },
  },
  {
    id: "dre-executive",
    name: "DRE executivo",
    description: "Header Harald e texto escuro para apresentacao.",
    target: "dre",
    preview: { bg: "FFFFFF", fg: "1C2430", accent: "C8102E" },
    patch: {
      fontSize: 11,
      headerColor: "#C8102E",
      textColor: "#1C2430",
      showTotal: true,
    },
  },
  {
    id: "dre-dark",
    name: "DRE escuro",
    description: "DRE preparado para slides em fundo escuro.",
    target: "dre",
    preview: { bg: "1C2430", fg: "F8FAFC", accent: "C8102E" },
    patch: {
      fontSize: 11,
      headerColor: "#C8102E",
      textColor: "#F8FAFC",
      showTotal: true,
    },
  },
];

export function getBrandStyleTarget(block: CustomBlock | null | undefined): SlideBrandStyleTarget | null {
  if (!block) return null;
  if (block.kind === "title" || block.kind === "text") return "text";
  if (block.kind === "kpi") return "kpi";
  if (block.kind === "shape") return "shape";
  if (block.kind === "table") return "table";
  if (block.kind === "dre") return "dre";
  return null;
}

export function getBrandStylesForBlock(block: CustomBlock | null | undefined): SlideBrandStyle[] {
  const target = getBrandStyleTarget(block);
  if (!target) return [];
  return SLIDE_BRAND_STYLES.filter((style) => style.target === target);
}

export function buildBrandStylePatch(style: SlideBrandStyle, block: CustomBlock): Partial<CustomBlock> {
  const patch = { ...style.patch } as Record<string, unknown>;

  if (block.kind === "text") {
    delete patch.bold;
  }

  if (block.kind === "shape") {
    const isDivider = style.id === "shape-divider";
    if (isDivider) {
      patch.h = Math.max(4, Math.min(block.h, 12));
    }
  }

  return patch as Partial<CustomBlock>;
}

export function brandStyleTargetLabel(target: SlideBrandStyleTarget | null): string {
  if (target === "text") return "Texto";
  if (target === "kpi") return "KPI";
  if (target === "shape") return "Forma";
  if (target === "table") return "Tabela";
  if (target === "dre") return "DRE";
  return "Bloco";
}
