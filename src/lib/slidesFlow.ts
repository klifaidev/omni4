// Slides Flow — catálogo de slides reutilizáveis e conversão de "items"
// (configuração por slide) em SlideFlowItem prontos para o exporter.
//
// Cada item carrega:
//  - kind: tipo do slide ("bridge_pvm" | "budget_evo" | "cover")
//  - filters: filtros aplicados APENAS àquele slide
//  - config: parâmetros específicos do tipo (ex.: período base/comp)
//
// A construção dos dados acontece on-demand (no momento do export ou do
// preview), garantindo que sempre usem a base atual da memória.

import type { Filters, PricingRow, Metric } from "./types";
import type { BudgetRow } from "./budget";
import { applyFilters, calcPVM } from "./analytics";
import { applyBudgetFilters } from "./budget";
import { useBudget } from "@/store/budget";
import { useSlidesFlow } from "@/store/slidesFlow";
import { monthLabel } from "./format";
import {
  addBridgePvmSlides,
  addBudgetEvoSlide,
  addCoverSlide,
  type SlideFlowItem,
  type BudgetEvoRow,
} from "./exportPpt";
import { addCustomSlide } from "./exportCustomSlide";
import { defaultCustomSlide, type CustomSlideConfig } from "./customSlide";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
export type SlideKind = "bridge_pvm" | "budget_evo" | "cover" | "custom";

export interface BaseSlideItem {
  /** Identificador estável (uuid) — usado para drag/drop e keys */
  id: string;
  kind: SlideKind;
  /** Nome amigável customizável pelo usuário (opcional) */
  label?: string;
}

export interface BridgePvmSlideConfig {
  mode: "fy" | "month";
  base: string | null;
  comp: string | null;
  /** Filtros específicos deste slide (não afetam outros slides) */
  filters: Filters;
  /** Notas do apresentador (não exportadas para PPTX). */
  speakerNotes?: string;
}

export interface BudgetEvoSlideConfig {
  /** Período inicial (formato "005.2025"). null = primeiro disponível */
  start: string | null;
  end: string | null;
  filters: Filters;
  /** Notas do apresentador (não exportadas para PPTX). */
  speakerNotes?: string;
}

export interface CoverSlideConfig {
  title: string;
  subtitle?: string;
  variant: "cover" | "divider";
  /** Notas do apresentador (não exportadas para PPTX). */
  speakerNotes?: string;
}

export type SlideItem =
  | (BaseSlideItem & { kind: "bridge_pvm"; config: BridgePvmSlideConfig })
  | (BaseSlideItem & { kind: "budget_evo"; config: BudgetEvoSlideConfig })
  | (BaseSlideItem & { kind: "cover"; config: CoverSlideConfig })
  | (BaseSlideItem & { kind: "custom"; config: CustomSlideConfig });

// ---------------------------------------------------------------------------
// Catálogo (metadados de cada tipo)
// ---------------------------------------------------------------------------
export interface SlideTypeMeta {
  kind: SlideKind;
  title: string;
  description: string;
  /** Lucide icon name (resolvido na UI) */
  icon: "GitBranch" | "Target" | "BookOpen" | "LayoutTemplate";
  accent: "blue" | "amber" | "neutral";
  supportsFilters: boolean;
}

export const SLIDE_CATALOG: SlideTypeMeta[] = [
  {
    kind: "bridge_pvm",
    title: "Bridge",
    description: "Decomposição da variação de margem (Volume, Preço, Custo, Frete, Comissão, Outros) entre dois períodos.",
    icon: "GitBranch",
    accent: "blue",
    supportsFilters: true,
  },
  {
    kind: "budget_evo",
    title: "Budget Evolutivo",
    description: "Overview CM/VOL — Real vs Budget mês a mês, com 4 evolutivos (CM Abs, CM%, CM/Kg, Volume).",
    icon: "Target",
    accent: "amber",
    supportsFilters: true,
  },
  {
    kind: "cover",
    title: "Capa / Divisor",
    description: "Slide de abertura ou divisor de seção com título e subtítulo customizáveis.",
    icon: "BookOpen",
    accent: "neutral",
    supportsFilters: false,
  },
  {
    kind: "custom",
    title: "Personalizado",
    description: "Monte seu próprio slide arrastando blocos (título, KPI, bridge, tabela, imagem). Faixa Harald incluída.",
    icon: "LayoutTemplate",
    accent: "neutral",
    supportsFilters: false,
  },
];

export function metaOf(kind: SlideKind): SlideTypeMeta {
  return SLIDE_CATALOG.find((s) => s.kind === kind)!;
}

// ---------------------------------------------------------------------------
// Default factories
// ---------------------------------------------------------------------------
export function newId(): string {
  // crypto.randomUUID disponível em browsers modernos
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultItem(kind: SlideKind): SlideItem {
  const id = newId();
  switch (kind) {
    case "bridge_pvm":
      return {
        id, kind, label: "Bridge",
        config: { mode: "month", base: null, comp: null, filters: {} },
      };
    case "budget_evo":
      return {
        id, kind, label: "Budget Evolutivo",
        config: { start: null, end: null, filters: {} },
      };
    case "cover":
      return {
        id, kind, label: "Capa",
        config: { title: "Resultado Mensal", subtitle: "", variant: "cover" },
      };
    case "custom":
      return {
        id, kind, label: "Slide personalizado",
        config: defaultCustomSlide(),
      };
  }
}

// ---------------------------------------------------------------------------
// Conversão item → SlideFlowItem (com builders)
// ---------------------------------------------------------------------------
export interface BuildContext {
  pricingRows: PricingRow[];
  budgetRows: BudgetRow[];
  metric: Metric;
}

export function itemToFlow(item: SlideItem, ctx: BuildContext): SlideFlowItem {
  switch (item.kind) {
    case "bridge_pvm": {
      const cfg = item.config;
      return {
        build: async (pptx) => {
          if (!cfg.base || !cfg.comp || cfg.base === cfg.comp) {
            throw new Error(`Bridge PVM "${item.label}": selecione períodos base e comparação distintos.`);
          }
          const filtered = applyFilters(ctx.pricingRows, cfg.filters, null);
          // Para o modo mês, montamos labels legíveis
          const labels = cfg.mode === "month"
            ? {
                base: labelOfPeriod(filtered, cfg.base),
                comp: labelOfPeriod(filtered, cfg.comp),
              }
            : undefined;
          const result = calcPVM(filtered, ctx.metric, cfg.base, cfg.comp, cfg.mode, labels);
          await addBridgePvmSlides(pptx, result, filtered, { onlyOverview: true });
        },
      };
    }
    case "budget_evo": {
      const cfg = item.config;
      return {
        build: (pptx) => {
          const monthly = computeBudgetEvoMonthly(ctx.budgetRows, cfg.filters, cfg.start, cfg.end);
          if (monthly.length === 0) {
            throw new Error(`Budget Evolutivo "${item.label}": sem dados para o range selecionado.`);
          }
          const accum = monthly
            .filter((m) => m.realCm !== 0 || m.realVol !== 0)
            .reduce(
              (acc, m) => ({
                cmGap: acc.cmGap + (m.realCm - m.budCm),
                volGap: acc.volGap + (m.realVol - m.budVol),
              }),
              { cmGap: 0, volGap: 0 },
            );
          addBudgetEvoSlide(pptx, monthly, accum);
        },
      };
    }
    case "cover": {
      const cfg = item.config;
      return {
        build: async (pptx) => {
          await addCoverSlide(pptx, {
            title: cfg.title || "Apresentação",
            subtitle: cfg.subtitle,
            variant: cfg.variant,
          });
        },
      };
    }
    case "custom": {
      const cfg = item.config;
      const id = item.id;
      return {
        build: async (pptx) => {
          await addCustomSlide(pptx, cfg, {
            slideId: id,
            // Navega para o slide antes de capturar, garantindo que o
            // CustomSlideEditor esteja montado e os liveNodes disponíveis.
            onNavigate: () => {
              useSlidesFlow.getState().select(id);
            },
          });
        },
      };
    }
  }
}

function labelOfPeriod(rows: PricingRow[], periodo: string): string {
  const r = rows.find((x) => x.periodo === periodo);
  if (r) return monthLabel(r.mes, r.ano);
  // fallback: parse "MMM.YYYY"
  const m = /^(\d{2,3})\.(\d{4})$/.exec(periodo);
  if (m) return monthLabel(parseInt(m[1], 10), parseInt(m[2], 10));
  return periodo;
}

// ---------------------------------------------------------------------------
// Budget evo: replicação da lógica usada em Budget.tsx para gerar BudgetEvoRow[]
// ---------------------------------------------------------------------------
export function computeBudgetEvoMonthly(
  budgetRows: BudgetRow[],
  filters: Filters,
  start: string | null,
  end: string | null,
): BudgetEvoRow[] {
  const filtered = applyBudgetFilters(budgetRows, filters, null);

  type Acc = {
    periodo: string; mes: number; ano: number; label: string;
    realRol: number; budRol: number;
    realCm: number; budCm: number;
    realVol: number; budVol: number;
  };
  const map = new Map<string, Acc>();
  const ensure = (r: BudgetRow) => {
    let x = map.get(r.periodo);
    if (!x) {
      x = {
        periodo: r.periodo, mes: r.mes, ano: r.ano,
        label: monthLabel(r.mes, r.ano),
        realRol: 0, budRol: 0, realCm: 0, budCm: 0, realVol: 0, budVol: 0,
      };
      map.set(r.periodo, x);
    }
    return x;
  };
  for (const r of filtered) {
    const x = ensure(r);
    if (r.kind === "real") { x.realRol += r.receita; x.realCm += r.cm; x.realVol += r.volumeKg; }
    else { x.budRol += r.receita; x.budCm += r.cm; x.budVol += r.volumeKg; }
  }

  let monthly = Array.from(map.values()).sort((a, b) => a.ano - b.ano || a.mes - b.mes);

  if (start || end) {
    const periods = monthly.map((m) => m.periodo);
    const si = start ? periods.indexOf(start) : 0;
    const ei = end ? periods.indexOf(end) : periods.length - 1;
    if (si >= 0 && ei >= 0) {
      const [a, b] = si <= ei ? [si, ei] : [ei, si];
      monthly = monthly.slice(a, b + 1);
    }
  }

  return monthly.map((x) => ({
    label: x.label,
    periodo: x.periodo,
    realCm: x.realCm, budCm: x.budCm,
    realCmPct: x.realRol ? x.realCm / x.realRol : null,
    budCmPct: x.budRol ? x.budCm / x.budRol : null,
    realCmKg: x.realVol ? x.realCm / x.realVol : null,
    budCmKg: x.budVol ? x.budCm / x.budVol : null,
    realVol: x.realVol, budVol: x.budVol,
  }));
}

// ---------------------------------------------------------------------------
// Validação leve (UI mostra estado "incompleto")
// ---------------------------------------------------------------------------
export function isItemReady(item: SlideItem): { ok: boolean; reason?: string } {
  switch (item.kind) {
    case "bridge_pvm":
      if (!item.config.base || !item.config.comp) return { ok: false, reason: "Defina período base e comparação." };
      if (item.config.base === item.config.comp) return { ok: false, reason: "Base e comparação devem ser diferentes." };
      return { ok: true };
    case "budget_evo":
      if (useBudget.getState().rows.length === 0)
        return { ok: false, reason: "Carregue dados de Budget antes de usar este slide." };
      if (!item.config.start || !item.config.end)
        return { ok: false, reason: "Configure o período do slide de Budget." };
      return { ok: true };
    case "cover":
      if (!item.config.title.trim()) return { ok: false, reason: "Título obrigatório." };
      return { ok: true };
    case "custom":
      if (item.config.blocks.length === 0) return { ok: false, reason: "Adicione ao menos um bloco." };
      return { ok: true };
  }
}
