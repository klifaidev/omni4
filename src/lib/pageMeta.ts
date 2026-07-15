import {
  BarChart3,
  BellRing,
  Coins,
  FileSpreadsheet,
  Home,
  KanbanSquare,
  LineChart,
  Network,
  PackageSearch,
  Presentation,
  Radar,
  SlidersHorizontal,
  Sparkles,
  TableProperties,
  Target,
  TrendingUp,
  UserCheck,
  type LucideIcon,
} from "lucide-react";

export interface PageMeta {
  label: string;
  icon: LucideIcon;
}

export const PAGE_LABELS: Record<string, PageMeta> = {
  "/": { label: "Início", icon: Home },
  "/visao-geral": { label: "Visão Geral", icon: BarChart3 },
  "/bridge-pvm": { label: "Bridge PVM", icon: TrendingUp },
  "/dre": { label: "DRE", icon: FileSpreadsheet },
  "/canais": { label: "Canais", icon: Network },
  "/custos": { label: "Custos", icon: Coins },
  "/inovacao": { label: "Inovação", icon: Sparkles },
  "/abc": { label: "Portfólio de SKUs", icon: LineChart },
  "/budget": { label: "Budget", icon: Target },
  "/rolling": { label: "Rolling", icon: TrendingUp },
  "/detalhe": { label: "Tabela Dinâmica", icon: TableProperties },
  "/slides": { label: "Slides", icon: Presentation },
  "/atividades": { label: "Atividades", icon: KanbanSquare },
  "/alertas": { label: "Central de alertas", icon: BellRing },
  "/filtros": { label: "Filtros", icon: SlidersHorizontal },
  "/demanda": { label: "Demanda", icon: TrendingUp },
  "/estoque": { label: "Estoque", icon: PackageSearch },
  "/positivacao": { label: "Positivação", icon: UserCheck },
  "/farol": { label: "Farol de Cadastro", icon: Radar },
};

// Páginas não registradas no histórico de análises
export const NON_HISTORY_PATHS = new Set<string>(["/upload", "/atividades", "/alertas", "/filtros", "/demanda", "/farol"]);
