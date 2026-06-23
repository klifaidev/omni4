import { CANVAS_H, CANVAS_W, type CustomBlock } from "./customSlide";
import type { SlideItem } from "./slidesFlow";

export type SlidePreflightSeverity = "error" | "warning" | "info";

export interface SlidePreflightIssue {
  severity: SlidePreflightSeverity;
  slideId: string;
  slideNumber: number;
  slideLabel: string;
  blockId?: string;
  title: string;
  detail: string;
}

export interface SlidePreflightReport {
  issues: SlidePreflightIssue[];
  errors: number;
  warnings: number;
  infos: number;
}

export function buildSlidesPreflight(items: SlideItem[]): SlidePreflightReport {
  const issues: SlidePreflightIssue[] = [];

  items.forEach((item, index) => {
    const slideNumber = index + 1;
    const slideLabel = item.label || defaultSlideLabel(item.kind);

    if (item.kind === "cover") {
      if (!item.config.title.trim()) {
        issues.push(issue("error", item.id, slideNumber, slideLabel, "Capa sem titulo", "Informe um titulo antes de exportar."));
      }
      return;
    }

    if (item.kind === "bridge_pvm") {
      if (!item.config.base || !item.config.comp || item.config.base === item.config.comp) {
        issues.push(issue("error", item.id, slideNumber, slideLabel, "Bridge incompleta", "Selecione periodos base e comparacao diferentes."));
      }
      return;
    }

    if (item.kind === "budget_evo") {
      if (item.config.start && item.config.end && item.config.start > item.config.end) {
        issues.push(issue("warning", item.id, slideNumber, slideLabel, "Range invertido", "O periodo inicial parece estar depois do periodo final."));
      }
      return;
    }

    if (item.kind !== "custom") return;

    const blocks = item.config.blocks;
    if (blocks.length === 0) {
      issues.push(issue("info", item.id, slideNumber, slideLabel, "Slide em branco", "Este slide personalizado nao tem blocos."));
      return;
    }

    blocks.forEach((block) => {
      checkBlockBounds(block, item.id, slideNumber, slideLabel, issues);
      checkBlockContent(block, item.id, slideNumber, slideLabel, issues);
    });

    const hiddenCount = blocks.filter((block) => block.hidden).length;
    if (hiddenCount > 0) {
      issues.push(issue(
        "info",
        item.id,
        slideNumber,
        slideLabel,
        "Blocos ocultos",
        `${hiddenCount} bloco(s) oculto(s) nao entram na exportacao.`,
      ));
    }
  });

  return {
    issues,
    errors: issues.filter((i) => i.severity === "error").length,
    warnings: issues.filter((i) => i.severity === "warning").length,
    infos: issues.filter((i) => i.severity === "info").length,
  };
}

function checkBlockBounds(
  block: CustomBlock,
  slideId: string,
  slideNumber: number,
  slideLabel: string,
  issues: SlidePreflightIssue[],
) {
  const offLeft = block.x < 0;
  const offTop = block.y < 0;
  const offRight = block.x + block.w > CANVAS_W;
  const offBottom = block.y + block.h > CANVAS_H;
  if (offLeft || offTop || offRight || offBottom) {
    issues.push(issue(
      "warning",
      slideId,
      slideNumber,
      slideLabel,
      "Bloco pode sair cortado",
      `${blockLabel(block)} esta parcialmente fora da area do slide.`,
      block.id,
    ));
  }

  if (block.w < 24 || block.h < 18) {
    issues.push(issue(
      "warning",
      slideId,
      slideNumber,
      slideLabel,
      "Bloco muito pequeno",
      `${blockLabel(block)} esta com pouco espaco e pode ficar ilegivel no PPTX.`,
      block.id,
    ));
  }
}

function checkBlockContent(
  block: CustomBlock,
  slideId: string,
  slideNumber: number,
  slideLabel: string,
  issues: SlidePreflightIssue[],
) {
  if (block.kind === "title" || block.kind === "text") {
    const text = block.text.trim();
    if (!text) {
      issues.push(issue("info", slideId, slideNumber, slideLabel, "Texto vazio", "Ha um bloco de texto sem conteudo.", block.id));
      return;
    }

    const roughCapacity = Math.max(8, Math.floor((block.w * block.h) / Math.max(1, block.size * block.size * 0.38)));
    if (text.length > roughCapacity) {
      issues.push(issue(
        "warning",
        slideId,
        slideNumber,
        slideLabel,
        "Texto com risco de corte",
        `${blockLabel(block)} parece ter mais texto do que a area comporta.`,
        block.id,
      ));
    }
  }

  if (block.kind === "image") {
    if (!block.src) {
      issues.push(issue("error", slideId, slideNumber, slideLabel, "Imagem sem arquivo", "Ha uma imagem sem origem definida.", block.id));
    } else if (block.src.toLowerCase().includes(".svg") || block.src.startsWith("data:image/svg")) {
      issues.push(issue("info", slideId, slideNumber, slideLabel, "Imagem SVG", "SVG sera rasterizado na exportacao para preservar fidelidade.", block.id));
    }
  }

  if (block.kind === "chart" && block.w < 420) {
    issues.push(issue("warning", slideId, slideNumber, slideLabel, "Grafico estreito", "Graficos muito estreitos podem comprimir rotulos e legenda.", block.id));
  }

  if (block.kind === "table" && block.h < 180) {
    issues.push(issue("warning", slideId, slideNumber, slideLabel, "Tabela baixa", "Tabelas com pouca altura podem cortar linhas ou reduzir a legibilidade.", block.id));
  }

  if (block.kind === "dre" && block.h < 220) {
    issues.push(issue("warning", slideId, slideNumber, slideLabel, "DRE baixo", "DRE com pouca altura pode cortar linhas no PPTX.", block.id));
  }
}

function issue(
  severity: SlidePreflightSeverity,
  slideId: string,
  slideNumber: number,
  slideLabel: string,
  title: string,
  detail: string,
  blockId?: string,
): SlidePreflightIssue {
  return { severity, slideId, slideNumber, slideLabel, title, detail, blockId };
}

function defaultSlideLabel(kind: SlideItem["kind"]): string {
  if (kind === "bridge_pvm") return "Bridge";
  if (kind === "budget_evo") return "Budget Evolutivo";
  if (kind === "cover") return "Capa";
  return "Slide personalizado";
}

function blockLabel(block: CustomBlock): string {
  if (block.kind === "title") return "Titulo";
  if (block.kind === "text") return "Texto";
  if (block.kind === "kpi") return `KPI ${block.label || ""}`.trim();
  if (block.kind === "chart") return block.title ? `Grafico ${block.title}` : "Grafico";
  if (block.kind === "table") return "Tabela";
  if (block.kind === "dre") return "DRE";
  if (block.kind === "topSku") return block.title ? `Ranking ${block.title}` : "Ranking";
  if (block.kind === "image") return "Imagem";
  if (block.kind === "shape") return "Forma";
  return "Bloco";
}
