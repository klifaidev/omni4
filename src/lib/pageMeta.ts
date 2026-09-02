import {
  BarChart3,
  BellRing,
  Coins,
  FileSpreadsheet,
  Home,
  KanbanSquare,
  Layers3,
  LineChart,
  Network,
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
  "/mix": { label: "Mix", icon: Layers3 },
  "/dre": { label: "DRE", icon: FileSpreadsheet },
  "/canais": { label: "Canais", icon: Network },
  "/custos": { label: "Custos", icon: Coins },
  "/inovacao": { label: "Inovação", icon: Sparkles },
  "/margem-target": { label: "Margem Target", icon: Target },
  "/abc": { label: "Portfólio de SKUs", icon: LineChart },
  "/budget": { label: "Budget", icon: Target },
  "/detalhe": { label: "Tabela Dinâmica", icon: TableProperties },
  "/slides": { label: "Slides", icon: Presentation },
  "/atividades": { label: "Atividades", icon: KanbanSquare },
  "/alertas": { label: "Central de alertas", icon: BellRing },
  "/filtros": { label: "Filtros", icon: SlidersHorizontal },
  "/positivacao": { label: "Positivação", icon: UserCheck },
  "/farol": { label: "Farol de Cadastro", icon: Radar },
};

// Páginas não registradas no histórico de análises
export const NON_HISTORY_PATHS = new Set<string>(["/upload", "/atividades", "/alertas", "/filtros", "/farol"]);
