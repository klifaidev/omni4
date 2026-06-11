// Templates built-in e armazenamento de templates do usuário (localStorage).

import type { CustomSlideConfig, CustomBlock } from "./customSlide";

function rid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function clone(blocks: CustomBlock[]): CustomBlock[] {
  return blocks.map((b) => ({ ...JSON.parse(JSON.stringify(b)), id: rid() }));
}

export interface CustomTemplate {
  id: string;
  name: string;
  description?: string;
  config: CustomSlideConfig;
  builtin?: boolean;
}

// ---------------------------------------------------------------------------
// Built-in templates
// ---------------------------------------------------------------------------
const TPL_KPIS_BRIDGE: CustomSlideConfig = {
  background: "FFFFFF", showHaraldFooter: true,
  blocks: [
    { id: rid(), kind: "title", z: 1, x: 40, y: 30, w: 1200, h: 60,
      text: "Resumo do mês", size: 36, bold: true, color: "C8102E", align: "left" },
    { id: rid(), kind: "kpi", z: 2, x: 40, y: 110, w: 290, h: 110,
      label: "ROL", valueSize: 30, color: "1C2430", source: "dynamic",
      measure: "rol", periodMode: "all", periodValue: null, filters: {}, format: "auto" },
    { id: rid(), kind: "kpi", z: 3, x: 350, y: 110, w: 290, h: 110,
      label: "Contrib. Marg.", valueSize: 30, color: "C8102E", source: "dynamic",
      measure: "cm", periodMode: "all", periodValue: null, filters: {}, format: "auto" },
    { id: rid(), kind: "kpi", z: 4, x: 660, y: 110, w: 290, h: 110,
      label: "CM %", valueSize: 30, color: "1C2430", source: "dynamic",
      measure: "cmPct", periodMode: "all", periodValue: null, filters: {}, format: "auto" },
    { id: rid(), kind: "kpi", z: 5, x: 970, y: 110, w: 290, h: 110,
      label: "Volume", valueSize: 30, color: "1C2430", source: "dynamic",
      measure: "volume", periodMode: "all", periodValue: null, filters: {}, format: "auto" },
    { id: rid(), kind: "bridge", z: 6, x: 40, y: 240, w: 1250, h: 380,
      base: null, comp: null, mode: "month", filters: {} },
  ],
};

const TPL_TABLE: CustomSlideConfig = {
  background: "FFFFFF", showHaraldFooter: true,
  blocks: [
    { id: rid(), kind: "title", z: 1, x: 40, y: 30, w: 1200, h: 60,
      text: "Detalhamento", size: 36, bold: true, color: "C8102E", align: "left" },
    { id: rid(), kind: "table", z: 2, x: 40, y: 110, w: 1250, h: 510,
      source: "ke30", measures: ["rol_real", "vol_real", "cm_real", "mb_real"],
      rowDims: ["marca"], colDim: "periodo", filters: {} },
  ],
};

const TPL_KPIS_TOPSKU: CustomSlideConfig = {
  background: "FFFFFF", showHaraldFooter: true,
  blocks: [
    { id: rid(), kind: "title", z: 1, x: 40, y: 30, w: 1200, h: 60,
      text: "Performance por SKU", size: 36, bold: true, color: "C8102E", align: "left" },
    { id: rid(), kind: "kpi", z: 2, x: 40, y: 110, w: 230, h: 110,
      label: "ROL", valueSize: 26, color: "1C2430", source: "dynamic",
      measure: "rol", periodMode: "all", periodValue: null, filters: {}, format: "auto" },
    { id: rid(), kind: "kpi", z: 3, x: 280, y: 110, w: 230, h: 110,
      label: "CM", valueSize: 26, color: "C8102E", source: "dynamic",
      measure: "cm", periodMode: "all", periodValue: null, filters: {}, format: "auto" },
    { id: rid(), kind: "kpi", z: 4, x: 520, y: 110, w: 230, h: 110,
      label: "Volume", valueSize: 26, color: "1C2430", source: "dynamic",
      measure: "volume", periodMode: "all", periodValue: null, filters: {}, format: "auto" },
    { id: rid(), kind: "topSku", z: 5, x: 40, y: 240, w: 1250, h: 380,
      dim: "skuDesc", measure: "cm", topN: 10,
      periodMode: "all", periodValue: null, filters: {}, showShare: true, title: "Top 10 SKUs por CM" },
  ],
};

const TPL_BRIDGE_TABLE: CustomSlideConfig = {
  background: "FFFFFF", showHaraldFooter: true,
  blocks: [
    { id: rid(), kind: "title", z: 1, x: 40, y: 30, w: 1200, h: 60,
      text: "Bridge + Detalhe", size: 36, bold: true, color: "C8102E", align: "left" },
    { id: rid(), kind: "bridge", z: 2, x: 40, y: 110, w: 760, h: 510,
      base: null, comp: null, mode: "month", filters: {} },
    { id: rid(), kind: "table", z: 3, x: 820, y: 110, w: 470, h: 510,
      source: "ke30", measures: ["cm_real", "mb_real"],
      rowDims: ["marca"], colDim: null, filters: {} },
  ],
};

const TPL_CHART: CustomSlideConfig = {
  background: "FFFFFF", showHaraldFooter: true,
  blocks: [
    { id: rid(), kind: "title", z: 1, x: 40, y: 30, w: 1200, h: 60,
      text: "Evolução", size: 36, bold: true, color: "C8102E", align: "left" },
    { id: rid(), kind: "chart", z: 2, x: 40, y: 110, w: 1250, h: 510,
      chartType: "line", measure: "cm", breakdown: null,
      showGrid: true, showLegend: true, showLabels: true,
      filters: {}, title: "CM ao longo do tempo" },
  ],
};

const TPL_BLANK: CustomSlideConfig = {
  background: "FFFFFF", showHaraldFooter: true, blocks: [],
};

export const BUILTIN_TEMPLATES: CustomTemplate[] = [
  { id: "blank",         name: "Em branco",            description: "Comece do zero.",                              config: TPL_BLANK,         builtin: true },
  { id: "kpis_bridge",   name: "KPIs + Bridge",        description: "4 KPIs no topo e Bridge PVM abaixo.",         config: TPL_KPIS_BRIDGE,   builtin: true },
  { id: "table_full",    name: "Tabela cheia",         description: "Tabela dinâmica ocupando o slide.",           config: TPL_TABLE,         builtin: true },
  { id: "kpis_topsku",   name: "KPIs + Top SKUs",      description: "3 KPIs e ranking de SKUs.",                   config: TPL_KPIS_TOPSKU,   builtin: true },
  { id: "bridge_table",  name: "Bridge + Tabela",      description: "Bridge à esquerda, tabela à direita.",        config: TPL_BRIDGE_TABLE,  builtin: true },
  { id: "chart_full",    name: "Gráfico cheio",        description: "Gráfico de evolução em destaque.",            config: TPL_CHART,         builtin: true },
];

export function applyTemplate(tpl: CustomTemplate): CustomSlideConfig {
  return {
    background: tpl.config.background,
    showHaraldFooter: tpl.config.showHaraldFooter,
    blocks: clone(tpl.config.blocks),
  };
}

// ---------------------------------------------------------------------------
// User templates (localStorage)
// ---------------------------------------------------------------------------
const STORE_KEY = "harald.customTemplates";

export function loadUserTemplates(): CustomTemplate[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as CustomTemplate[];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

export function saveUserTemplate(name: string, config: CustomSlideConfig): CustomTemplate {
  const tpl: CustomTemplate = {
    id: rid(), name,
    config: { ...config, blocks: JSON.parse(JSON.stringify(config.blocks)) },
  };
  const list = loadUserTemplates();
  list.push(tpl);
  localStorage.setItem(STORE_KEY, JSON.stringify(list));
  return tpl;
}

export function deleteUserTemplate(id: string): void {
  const list = loadUserTemplates().filter((t) => t.id !== id);
  localStorage.setItem(STORE_KEY, JSON.stringify(list));
}
