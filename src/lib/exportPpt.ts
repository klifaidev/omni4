import PptxGenJS from "pptxgenjs";
import JSZip from "jszip";
import type { PVMResult, PVMSkuDetail } from "./analytics";
import type { PricingRow } from "./types";
import { monthLabel } from "./format";
import haraldFooterPng from "@/assets/harald-footer.png";
import haraldFooterBarPng from "@/assets/harald-footer-bar.png";

// Slide widescreen 13.33" x 7.5". Imagem original 1222x78 (~15.67:1).
// Altura calculada para preencher toda a largura mantendo proporção.
const HARALD_FOOTER_W = 13.33;
const HARALD_FOOTER_H = 0.85;
const HARALD_FOOTER_Y = 7.5 - HARALD_FOOTER_H;

// PptxGenJS exige `data:` em base64 OU uma URL acessível em `path:`.
// O import do Vite devolve apenas uma URL com hash, então pré-carregamos
// a imagem como data URI uma única vez.
let haraldFooterDataUri: string | null = null;
async function getHaraldFooterDataUri(): Promise<string> {
  if (haraldFooterDataUri) return haraldFooterDataUri;
  const res = await fetch(haraldFooterBarPng);
  const blob = await res.blob();
  haraldFooterDataUri = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return haraldFooterDataUri;
}

/**
 * Adiciona o rodapé Harald (arco vermelho + logo) em um slide.
 * Deve ser chamada como PRIMEIRO addImage/addShape/addText do slide,
 * para que fique atrás de todos os demais elementos.
 */
function addHaraldFooter(slide: PptxGenJS.Slide) {
  if (!haraldFooterDataUri) return; // será adicionado após preload
  slide.addImage({
    data: haraldFooterDataUri,
    x: 0,
    y: HARALD_FOOTER_Y,
    w: HARALD_FOOTER_W,
    h: HARALD_FOOTER_H,
  });
}

// ---------------------------------------------------------------------------
// Paleta inspirada no slide "OVERVIEW DRE & BRIDGE" da Harald
// ---------------------------------------------------------------------------
const PPT_COLORS = {
  ink: "1C2430",
  muted: "667085",
  line: "D0D5DD",
  surface: "F8FAFC",
  surfaceAlt: "EEF2F6",
  positive: "16A34A",
  negative: "DC2626",
  base: "1D4ED8",
  // Harald deck
  haraldRed: "C8102E",
  haraldRedDark: "8B0A1E",
  // Tabela DRE — heatmap
  heatGreenStrong: "63BE7B",
  heatGreen: "A6D89A",
  heatYellow: "F8E78D",
  heatOrange: "F0A874",
  heatRedStrong: "F8696B",
  // Cores efeitos (slides de detalhe)
  volume: "0F766E",
  price: "7C3AED",
  cost: "EA580C",
  freight: "2563EB",
  commission: "C2410C",
  others: "6B7280",
};

type EffectKey = keyof Pick<PVMSkuDetail, "volumeEffect" | "priceEffect" | "costEffect">;

const EFFECT_CONFIG: Array<{ key: EffectKey; label: string; color: string }> = [
  { key: "volumeEffect", label: "Efeito Volume", color: PPT_COLORS.volume },
  { key: "priceEffect", label: "Efeito Preço", color: PPT_COLORS.price },
  { key: "costEffect", label: "Efeito Custo Variável", color: PPT_COLORS.cost },
];

// ---------------------------------------------------------------------------
// Formatação numérica fiel ao slide da Harald (sem "R$", milhar com ponto,
// negativos com sinal, "0" quando nulo)
// ---------------------------------------------------------------------------
const fmtIntBR = (v: number) => {
  if (!isFinite(v) || v === 0) return "0";
  return Math.round(v).toLocaleString("pt-BR");
};

const fmtSignedIntBR = (v: number) => {
  if (!isFinite(v) || Math.round(v) === 0) return "0";
  const r = Math.round(v);
  return r < 0
    ? `-${Math.abs(r).toLocaleString("pt-BR")}`
    : r.toLocaleString("pt-BR");
};

const fmtDecimalBR = (v: number, digits = 2) => {
  if (!isFinite(v)) return "—";
  return v.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

const fmtPctBR = (v: number, digits = 1) => {
  if (!isFinite(v)) return "—";
  return `${(v * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
};

// Moeda absoluta no padrão das apresentações Harald: "R$ 1.234.567" (sem
// sufixos compactos, milhar com ponto, sem casas decimais).
const brl = (value: number) => {
  if (!isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
};

// Mantido por compatibilidade — agora idêntico ao `brl` (sem compactar).
const brlCompact = (value: number) => brl(value);

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_");
}

function getEffectRankings(details: PVMSkuDetail[], effectKey: EffectKey) {
  const heroes = [...details]
    .filter((item) => item[effectKey] > 0)
    .sort((a, b) => b[effectKey] - a[effectKey])
    .slice(0, 5);

  const offenders = [...details]
    .filter((item) => item[effectKey] < 0)
    .sort((a, b) => a[effectKey] - b[effectKey])
    .slice(0, 5);

  return { heroes, offenders };
}

// ---------------------------------------------------------------------------
// Heatmap por linha (vermelho → amarelo → verde) usado na DRE da Harald.
// Para linhas "negativas" (custos, frete, etc.) o sinal é invertido para
// que valores menores em módulo (menos custo) fiquem verdes.
// ---------------------------------------------------------------------------
function lerpColor(hexA: string, hexB: string, t: number) {
  const a = [parseInt(hexA.slice(0, 2), 16), parseInt(hexA.slice(2, 4), 16), parseInt(hexA.slice(4, 6), 16)];
  const b = [parseInt(hexB.slice(0, 2), 16), parseInt(hexB.slice(2, 4), 16), parseInt(hexB.slice(4, 6), 16)];
  const c = a.map((av, i) => Math.round(av + (b[i] - av) * t));
  return c.map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function heatColor(value: number, min: number, max: number, invert = false): string {
  if (!isFinite(value) || max === min) return "FFFFFF";
  let t = (value - min) / (max - min); // 0..1
  if (invert) t = 1 - t;
  t = Math.max(0, Math.min(1, t));
  // Gradiente: vermelho (0) → laranja (.25) → amarelo (.5) → verde claro (.75) → verde forte (1)
  const stops = [
    PPT_COLORS.heatRedStrong,
    PPT_COLORS.heatOrange,
    PPT_COLORS.heatYellow,
    PPT_COLORS.heatGreen,
    PPT_COLORS.heatGreenStrong,
  ];
  const seg = t * (stops.length - 1);
  const i = Math.floor(seg);
  const f = seg - i;
  if (i >= stops.length - 1) return stops[stops.length - 1];
  return lerpColor(stops[i], stops[i + 1], f);
}

// ---------------------------------------------------------------------------
// Agrega métricas mensais para a tabela DRE do slide Overview
// ---------------------------------------------------------------------------
interface DreMonth {
  periodo: string;
  mes: number;
  ano: number;
  label: string;
  volumeKg: number;
  rol: number;
  custoVariavel: number;
  materiaPrima: number;
  somaCif: number;
  embalagem: number;
  freteSobreVendas: number;
  comissaoRepres: number;
  contribMarginal: number;
}

function aggregateDreByMonth(rows: PricingRow[]): DreMonth[] {
  const map = new Map<string, DreMonth>();
  for (const r of rows) {
    const cur = map.get(r.periodo) ?? {
      periodo: r.periodo,
      mes: r.mes,
      ano: r.ano,
      label: monthLabel(r.mes, r.ano).toLowerCase(),
      volumeKg: 0,
      rol: 0,
      custoVariavel: 0,
      materiaPrima: 0,
      somaCif: 0,
      embalagem: 0,
      freteSobreVendas: 0,
      comissaoRepres: 0,
      contribMarginal: 0,
    };
    cur.volumeKg += r.volumeKg;
    cur.rol += r.rol;
    cur.custoVariavel += r.custoVariavel ?? 0;
    cur.materiaPrima += r.materiaPrima ?? 0;
    cur.embalagem += r.embalagem ?? 0;
    // "Soma de CIF" do deck Harald = custo fixo/CIF agregado
    cur.somaCif += r.cif ?? 0;
    cur.freteSobreVendas += r.frete ?? 0;
    cur.comissaoRepres += r.comissao ?? 0;
    cur.contribMarginal += r.contribMarginal;
    map.set(r.periodo, cur);
  }
  return Array.from(map.values()).sort((a, b) => a.ano - b.ano || a.mes - b.mes);
}

// ---------------------------------------------------------------------------
// SLIDE 1 — Overview DRE & Bridge (estilo Harald)
// Layout fiel ao PNG de referência:
//   • Título em vermelho no topo
//   • Selo "DRE" rotacionado à esquerda + tabela DRE mensal com heatmap
//   • Selo "BRIDGE" rotacionado à esquerda + waterfall minimalista
//     (totais como retângulos pretos, deltas como linha curta vermelha)
//   • Rodapé arco vermelho + logo Harald (imagem)
// ---------------------------------------------------------------------------
function addOverviewDreBridgeSlide(
  pptx: PptxGenJS,
  result: PVMResult,
  rows: PricingRow[],
) {
  const slide = pptx.addSlide();
  slide.background = { color: "FFFFFF" };

  // Rodapé Harald (precisa ser o PRIMEIRO elemento para ficar atrás dos demais)
  addHaraldFooter(slide);

  // ---- Título ---------------------------------------------------------
  slide.addText("OVERVIEW DRE & BRIDGE", {
    x: 0.4,
    y: 0.25,
    w: 9,
    h: 0.55,
    fontFace: "Calibri",
    fontSize: 28,
    bold: true,
    color: PPT_COLORS.haraldRed,
    margin: 0,
  });

  // ---- "DRE" lateral (centralizado verticalmente com a tabela) ---------
  // Tabela: y=0.95 → 4.39  (centro ≈ 2.67)
  slide.addText("DRE", {
    x: -0.15,
    y: 2.47,
    w: 1.0,
    h: 0.4,
    fontFace: "Calibri",
    fontSize: 21,
    bold: true,
    color: PPT_COLORS.haraldRed,
    rotate: 270,
    align: "center",
    valign: "middle",
    margin: 0,
  });

  // ---- "BRIDGE" lateral (centralizado verticalmente com a bridge) ------
  // Bridge: y=4.95 → 6.35  (centro ≈ 5.65)
  slide.addText("BRIDGE", {
    x: -0.25,
    y: 5.45,
    w: 1.2,
    h: 0.4,
    fontFace: "Calibri",
    fontSize: 21,
    bold: true,
    color: PPT_COLORS.haraldRed,
    rotate: 270,
    align: "center",
    valign: "middle",
    margin: 0,
    objectName: "bridge_side_label",
  });

  // ---- Tabela DRE mensal ---------------------------------------------
  const allMonths = aggregateDreByMonth(rows);
  // Limita a últimos 10 meses para caber bem no slide
  const months = allMonths.slice(-10);

  const tableX = 0.85;
  const tableY = 0.95;
  const tableW = 12.1;
  const labelColW = 2.05;
  const dataW = tableW - labelColW;
  const colCount = months.length || 1;
  const colW = dataW / colCount;

  // Linhas com extrator de valor + tipo (positivo=verde alto / inverso=verde baixo)
  type Line = {
    label: string;
    get: (m: DreMonth) => number;
    fmt: (v: number) => string;
    invert?: boolean; // true para custos (menor é melhor)
    bold?: boolean;
    boxed?: boolean; // borda destacada (vermelha) como no deck
    boxColor?: string;
    noHeat?: boolean;
  };

  const lines: Line[] = [
    { label: "Volume (Tons)", get: (m) => m.volumeKg, fmt: (v) => fmtIntBR(v), bold: true, boxed: true, boxColor: PPT_COLORS.haraldRed },
    { label: "Receita Operacional Líquida", get: (m) => m.rol, fmt: (v) => fmtIntBR(v), noHeat: true },
    { label: "ROL (R$/Kg)", get: (m) => (m.volumeKg > 0 ? m.rol / m.volumeKg : 0), fmt: (v) => fmtDecimalBR(v, 2), bold: true, boxed: true, boxColor: PPT_COLORS.heatGreenStrong },
    { label: "Custo Variável", get: (m) => -m.custoVariavel, fmt: (v) => fmtSignedIntBR(v), invert: true, noHeat: true },
    { label: "Custo Variável (R$/Kg)", get: (m) => (m.volumeKg > 0 ? -m.custoVariavel / m.volumeKg : 0), fmt: (v) => fmtDecimalBR(v, 2), bold: true },
    { label: "Frete sobre Vendas", get: (m) => -m.freteSobreVendas, fmt: (v) => fmtSignedIntBR(v), invert: true, noHeat: true },
    { label: "Frete (R$/Kg)", get: (m) => (m.volumeKg > 0 ? -m.freteSobreVendas / m.volumeKg : 0), fmt: (v) => fmtDecimalBR(v, 2) },
    { label: "Comissão Repres", get: (m) => -m.comissaoRepres, fmt: (v) => fmtSignedIntBR(v), invert: true, noHeat: true },
    { label: "Comissão (%/ROL)", get: (m) => (m.rol > 0 ? -m.comissaoRepres / m.rol : 0), fmt: (v) => fmtPctBR(v, 1), invert: true, noHeat: true },
    { label: "Comissão (R$/Kg)", get: (m) => (m.volumeKg > 0 ? -m.comissaoRepres / m.volumeKg : 0), fmt: (v) => fmtDecimalBR(v, 2) },
    { label: "Contrib. Marginal", get: (m) => m.contribMarginal, fmt: (v) => fmtIntBR(v), bold: true, boxed: true, boxColor: PPT_COLORS.haraldRed, noHeat: true },
    { label: "Contrib. Marginal (%/ROL)", get: (m) => (m.rol > 0 ? m.contribMarginal / m.rol : 0), fmt: (v) => fmtPctBR(v, 1), noHeat: true },
    { label: "Contrib. Marginal (R$/Kg)", get: (m) => (m.volumeKg > 0 ? m.contribMarginal / m.volumeKg : 0), fmt: (v) => fmtDecimalBR(v, 2), bold: true },
  ];

  type Cell = { text: string; options: PptxGenJS.TableCellProps };

  // Cabeçalho mensal
  const header: Cell[] = [
    {
      text: "Valores",
      options: {
        bold: true,
        color: "FFFFFF",
        fill: { color: PPT_COLORS.haraldRed },
        align: "center",
        valign: "middle",
        fontSize: 10,
        margin: 0.02,
      },
    },
    ...months.map((m) => ({
      text: m.label,
      options: {
        bold: true,
        color: "FFFFFF",
        fill: { color: PPT_COLORS.haraldRed },
        align: "center" as const,
        valign: "middle" as const,
        fontSize: 10,
        margin: 0.02,
      },
    })),
  ];

  const rowsTbl: Cell[][] = [header];

  lines.forEach((ln) => {
    const values = months.map(ln.get);
    const valid = values.filter((v) => isFinite(v));
    const min = valid.length ? Math.min(...valid) : 0;
    const max = valid.length ? Math.max(...valid) : 0;

    const cells: Cell[] = [
      {
        text: ln.label,
        options: {
          bold: ln.bold,
          color: PPT_COLORS.ink,
          fill: { color: "FFFFFF" },
          align: "left",
          valign: "middle",
          fontSize: 10,
          margin: 0.04,
        },
      },
      ...values.map((v) => {
        const fill = ln.noHeat ? "FFFFFF" : heatColor(v, min, max, ln.invert);
        return {
          text: ln.fmt(v),
          options: {
            bold: ln.bold,
            color: PPT_COLORS.ink,
            fill: { color: fill },
            align: "center" as const,
            valign: "middle" as const,
            fontSize: 10,
            margin: 0.02,
          },
        };
      }),
    ];
    rowsTbl.push(cells);
  });

  const headerH = 0.22;
  const rowH = 0.20; // altura fixa por linha (compactada para não invadir a bridge)

  slide.addTable(rowsTbl, {
    x: tableX,
    y: tableY,
    w: tableW,
    colW: [labelColW, ...Array(colCount).fill(colW)],
    rowH: [headerH, ...Array(lines.length).fill(rowH)],
    border: { pt: 0.5, color: "FFFFFF" },
    fontFace: "Calibri",
    fontSize: 10,
    valign: "middle",
    autoPage: false,
  });

  // (Quadrados vermelhos/verdes removidos — serão adicionados manualmente após exportação.)

  // ---- BRIDGE minimalista ---------------------------------------------
  // Replica o estilo do PNG: totais como retângulos pretos cheios,
  // deltas como linha horizontal curta vermelha posicionada no topo
  // do "patamar" do delta. Valor numérico acima.
  type Step = { label: string; value: number; type: "total" | "delta" };
  // Ordem do deck Harald: PP / Volume / Frete / Comissão / Outros / Preço / Custo / Total
  const steps: Step[] = [
    { label: `Contrib. Marginal ${result.baseLabel}`, value: result.base, type: "total" },
    { label: "Efeito volume", value: result.volume, type: "delta" },
    { label: "Efeito frete", value: result.freight, type: "delta" },
    { label: "Efeito comissão", value: result.commission, type: "delta" },
    { label: "Efeito outros", value: result.others, type: "delta" },
    { label: "Efeito preço", value: result.price, type: "delta" },
    { label: "Efeito custo variável", value: result.cost, type: "delta" },
    { label: `Contrib. Marginal ${result.currentLabel}`, value: result.current, type: "total" },
  ];

  // Geometria start/end (mesmo princípio do componente Waterfall)
  const geom: { start: number; end: number; value: number; type: "total" | "delta" }[] = [];
  let running = 0;
  steps.forEach((s) => {
    if (s.type === "total") {
      geom.push({ start: 0, end: s.value, value: s.value, type: "total" });
      running = s.value;
    } else {
      const end = running + s.value;
      geom.push({ start: running, end, value: s.value, type: "delta" });
      running = end;
    }
  });

  // Range incluindo o zero
  const allVals = geom.flatMap((g) => [g.start, g.end, 0]);
  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);
  const range = maxV - minV || 1;
  const yMin = minV - range * 0.08;
  const yMax = maxV + range * 0.18; // espaço extra para labels acima

  // Plot area (encurtada para dar respiro do rodapé vermelho)
  const plotX = 0.95;
  const plotY = 4.95;
  const plotW = 12.0;
  const plotH = 1.4; // bar area (sem labels de eixo)
  const labelStripY = plotY + plotH + 0.05;
  const labelStripH = 0.3;

  const colSlot = plotW / steps.length;
  const barW = colSlot * 0.42;

  // Mapeia valor → y dentro do plot (origem em cima)
  const yOf = (v: number) => plotY + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  geom.forEach((g, i) => {
    const s = steps[i];
    const cx = plotX + colSlot * i + colSlot / 2;
    const xBar = cx - barW / 2;

    if (s.type === "total") {
      // Retângulo preto cheio, do zero (ou do topo até zero) ao valor
      const yTop = yOf(Math.max(0, g.value));
      const yBot = yOf(Math.min(0, g.value));
      slide.addShape("rect", {
        x: xBar,
        y: yTop,
        w: barW,
        h: Math.max(0.04, yBot - yTop),
        fill: { color: "000000" },
        line: { color: "000000", width: 0 },
        objectName: `bridge_bar_${i}`,
      });
    } else {
      // Linha vermelha curta no topo do "patamar" do delta
      const hi = Math.max(g.start, g.end);
      const y = yOf(hi);
      slide.addShape("rect", {
        x: xBar,
        y: y - 0.025,
        w: barW,
        h: 0.05,
        fill: { color: PPT_COLORS.haraldRed },
        line: { color: PPT_COLORS.haraldRed, width: 0 },
        objectName: `bridge_bar_${i}`,
      });
    }

    // Label numérico acima do topo da barra/linha — valor absoluto pt-BR
    const valText = s.type === "total"
      ? fmtIntBR(s.value)
      : fmtSignedIntBR(s.value);
    const topY = s.type === "total" ? yOf(Math.max(0, g.value)) : yOf(Math.max(g.start, g.end));
    const gapIn = 0.04 / 2.54; // 0.04 cm de respiro vertical entre o número e a barra
    const valH = 0.28;
    slide.addText(valText, {
      x: cx - colSlot / 2,
      y: Math.max(plotY - 0.05, topY - valH - gapIn),
      w: colSlot,
      h: valH,
      fontFace: "Calibri",
      fontSize: 11,
      color: PPT_COLORS.ink,
      align: "center",
      valign: "bottom",
      margin: 0,
      objectName: `bridge_value_${i}`,
    });

    // Label da categoria (abaixo do plot)
    slide.addText(s.label, {
      x: cx - colSlot / 2,
      y: labelStripY,
      w: colSlot,
      h: labelStripH,
      fontFace: "Calibri",
      fontSize: 9,
      color: PPT_COLORS.muted,
      align: "center",
      valign: "top",
      margin: 0,
      objectName: `bridge_label_${i}`,
    });
  });
}

// ---------------------------------------------------------------------------
// SLIDE 2 — Tabela "Resumo editável" (mantida do export anterior)
// ---------------------------------------------------------------------------
function addBridgeTableSlide(pptx: PptxGenJS, result: PVMResult) {
  const slide = pptx.addSlide();
  slide.background = { color: "FFFFFF" };
  addHaraldFooter(slide);

  slide.addText("Bridge PVM — Resumo editável", {
    x: 0.6,
    y: 0.45,
    w: 9,
    h: 0.4,
    fontFace: "Aptos Display",
    fontSize: 22,
    bold: true,
    color: PPT_COLORS.ink,
    margin: 0,
  });
  slide.addText(`${result.baseLabel} → ${result.currentLabel}`, {
    x: 0.6,
    y: 0.9,
    w: 6,
    h: 0.3,
    fontFace: "Aptos",
    fontSize: 11,
    color: PPT_COLORS.muted,
    margin: 0,
  });

  const tableRows: PptxGenJS.TableRow[] = [
    [
      { text: "Linha", options: { bold: true, color: "FFFFFF", fill: { color: PPT_COLORS.ink }, align: "center" } },
      { text: "Valor", options: { bold: true, color: "FFFFFF", fill: { color: PPT_COLORS.ink }, align: "center" } },
    ],
    [
      { text: `Margem base (${result.baseLabel})` },
      { text: brl(result.base), options: { align: "right" } },
    ],
    [{ text: "Efeito Volume" }, { text: brl(result.volume), options: { align: "right" } }],
    [{ text: "Efeito Preço" }, { text: brl(result.price), options: { align: "right" } }],
    [{ text: "Efeito Custo Variável" }, { text: brl(result.cost), options: { align: "right" } }],
    [{ text: "Efeito Frete" }, { text: brl(result.freight), options: { align: "right" } }],
    [{ text: "Efeito Comissão" }, { text: brl(result.commission), options: { align: "right" } }],
    [{ text: "Efeito Outros" }, { text: brl(result.others), options: { align: "right" } }],
    [
      { text: `Margem atual (${result.currentLabel})`, options: { bold: true, fill: { color: PPT_COLORS.surfaceAlt } } },
      { text: brl(result.current), options: { bold: true, align: "right", fill: { color: PPT_COLORS.surfaceAlt } } },
    ],
  ];

  slide.addTable(tableRows, {
    x: 2.5,
    y: 1.5,
    w: 5,
    h: 4.8,
    colW: [3, 2],
    border: { pt: 1, color: PPT_COLORS.line },
    margin: 0.08,
    fontFace: "Aptos",
    fontSize: 11,
    color: PPT_COLORS.ink,
    fill: { color: PPT_COLORS.surface },
    valign: "middle",
  });
}

// ---------------------------------------------------------------------------
// SLIDES 3+ — Heróis e Ofensores por efeito (mantidos do export anterior)
// ---------------------------------------------------------------------------
function addEffectSlide(pptx: PptxGenJS, result: PVMResult, effect: { key: EffectKey; label: string; color: string }) {
  const slide = pptx.addSlide();
  slide.background = { color: "FFFFFF" };
  addHaraldFooter(slide);

  const { heroes, offenders } = getEffectRankings(result.skuDetails, effect.key);
  const chartItems = [...heroes, ...offenders]
    .sort((a, b) => b[effect.key] - a[effect.key])
    .slice(0, 10);

  slide.addText(effect.label, {
    x: 0.6,
    y: 0.45,
    w: 5,
    h: 0.35,
    fontFace: "Aptos Display",
    fontSize: 22,
    bold: true,
    color: PPT_COLORS.ink,
    margin: 0,
  });
  slide.addText("Top 5 heróis e ofensores por SKU", {
    x: 0.6,
    y: 0.86,
    w: 4,
    h: 0.25,
    fontFace: "Aptos",
    fontSize: 10,
    color: PPT_COLORS.muted,
    margin: 0,
  });

  slide.addChart(
    "bar",
    [
      {
        name: effect.label,
        labels: chartItems.map((item) => item.sku),
        values: chartItems.map((item) => item[effect.key]),
      },
    ],
    {
      x: 0.6,
      y: 1.35,
      w: 5.25,
      h: 5.25,
      chartColors: [effect.color],
      catAxisLabelFontFace: "Aptos",
      catAxisLabelFontSize: 10,
      valAxisLabelFontFace: "Aptos",
      valAxisLabelFontSize: 9,
      valGridLine: { color: "E5E7EB", size: 1 },
      showLegend: false,
      showValue: true,
      dataLabelPosition: "outEnd",
      dataLabelColor: PPT_COLORS.ink,
      showTitle: false,
      showValAxisTitle: false,
      showCatAxisTitle: false,
    },
  );

  const asTableRows = (title: string, items: PVMSkuDetail[], toneColor: string) => {
    const rows: PptxGenJS.TableRow[] = [
      [
        { text: title, options: { bold: true, color: "FFFFFF", fill: { color: toneColor } } },
        { text: "Impacto", options: { bold: true, color: "FFFFFF", fill: { color: toneColor }, align: "right" } },
      ],
    ];

    if (items.length === 0) {
      rows.push([
        { text: "Sem SKUs relevantes no recorte atual", options: { italic: true, color: PPT_COLORS.muted } },
        { text: "—", options: { align: "right", color: PPT_COLORS.muted } },
      ]);
      return rows;
    }

    items.forEach((item) => {
      rows.push([
        { text: item.sku },
        { text: brl(item[effect.key]), options: { align: "right" } },
      ]);
    });

    return rows;
  };

  slide.addTable(asTableRows("Heróis", heroes, PPT_COLORS.positive), {
    x: 6.15,
    y: 1.35,
    w: 3.2,
    h: 2.45,
    colW: [2.15, 1.05],
    border: { pt: 1, color: PPT_COLORS.line },
    margin: 0.05,
    fontFace: "Aptos",
    fontSize: 9,
    color: PPT_COLORS.ink,
    fill: { color: PPT_COLORS.surface },
    valign: "middle",
  });

  slide.addTable(asTableRows("Ofensores", offenders, PPT_COLORS.negative), {
    x: 6.15,
    y: 4.08,
    w: 3.2,
    h: 2.45,
    colW: [2.15, 1.05],
    border: { pt: 1, color: PPT_COLORS.line },
    margin: 0.05,
    fontFace: "Aptos",
    fontSize: 9,
    color: PPT_COLORS.ink,
    fill: { color: PPT_COLORS.surface },
    valign: "middle",
  });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
// Builders públicos para reutilização no fluxo de slides multi-export.
export async function addBridgePvmSlides(
  pptx: PptxGenJS,
  result: PVMResult,
  rows: PricingRow[] = [],
  opts: { onlyOverview?: boolean } = {},
) {
  await getHaraldFooterDataUri();
  addOverviewDreBridgeSlide(pptx, result, rows);
  if (opts.onlyOverview) return;
  addBridgeTableSlide(pptx, result);
  EFFECT_CONFIG.forEach((effect) => addEffectSlide(pptx, result, effect));
}

export async function exportBridgePvmPpt(result: PVMResult, rows: PricingRow[] = []) {
  await getHaraldFooterDataUri(); // pré-carrega o rodapé como base64
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
  pptx.author = "Lovable";
  pptx.company = "Lovable";
  pptx.subject = "Bridge PVM";
  pptx.title = `Bridge PVM ${result.baseLabel} vs ${result.currentLabel}`;
  pptx.theme = {
    headFontFace: "Calibri",
    bodyFontFace: "Calibri",
  };

  await addBridgePvmSlides(pptx, result, rows);

  // Gera o PPTX em memória, agrupa elementos da bridge num único objeto
  // (slide 1) e dispara o download.
  const rawBlob = (await pptx.write({ outputType: "blob" })) as Blob;
  const grouped = await groupBridgeElements(rawBlob);

  const fileName = `bridge_pvm_${safeName(result.baseLabel)}_vs_${safeName(result.currentLabel)}.pptx`;
  triggerDownload(grouped, fileName);
}

// ---------------------------------------------------------------------------
// Pós-processamento: envolve todos os shapes/textos da bridge no slide 1
// (cujo cNvPr@name começa com "bridge_") dentro de um único <p:grpSp>,
// preservando suas posições absolutas. Resultado: um clique seleciona o
// gráfico inteiro e o redimensionamento mantém todos os elementos alinhados.
// ---------------------------------------------------------------------------
async function groupBridgeElements(blob: Blob, bridgeSlideIndex = 1): Promise<Blob> {
  const zip = await JSZip.loadAsync(blob);
  const slidePath = `ppt/slides/slide${bridgeSlideIndex}.xml`;
  const file = zip.file(slidePath);
  if (!file) return blob;
  const xml = await file.async("string");

  // Extrai os elementos cujo nome começa com "bridge_". Tratamos <p:sp> e
  // <p:grpSp> (defensivo) — todos os marcadores que adicionamos são <p:sp>.
  const tagPattern = /<p:sp\b[\s\S]*?<\/p:sp>/g;
  const matches: { full: string; index: number; length: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = tagPattern.exec(xml)) !== null) {
    const full = m[0];
    // Lê o name do cNvPr
    const nameMatch = full.match(/<p:cNvPr\b[^>]*\bname="([^"]+)"/);
    if (nameMatch && nameMatch[1].startsWith("bridge_")) {
      matches.push({ full, index: m.index, length: full.length });
    }
  }

  if (matches.length < 2) return blob; // nada a agrupar

  // Calcula o bounding box (em EMU) somando os <a:off> e <a:ext> de cada sp.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const offRe = /<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"\s*\/>/;
  const extRe = /<a:ext\s+cx="(\d+)"\s+cy="(\d+)"\s*\/>/;
  for (const item of matches) {
    const off = item.full.match(offRe);
    const ext = item.full.match(extRe);
    if (!off || !ext) continue;
    const x = parseInt(off[1], 10);
    const y = parseInt(off[2], 10);
    const cx = parseInt(ext[1], 10);
    const cy = parseInt(ext[2], 10);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + cx > maxX) maxX = x + cx;
    if (y + cy > maxY) maxY = y + cy;
  }
  if (!isFinite(minX) || !isFinite(minY)) return blob;
  const grpX = minX;
  const grpY = minY;
  const grpCX = maxX - minX;
  const grpCY = maxY - minY;

  // Remove os matches do XML original (de trás pra frente para preservar índices)
  let mutated = xml;
  const sorted = [...matches].sort((a, b) => b.index - a.index);
  for (const item of sorted) {
    mutated = mutated.slice(0, item.index) + mutated.slice(item.index + item.length);
  }

  // Monta o <p:grpSp> com os elementos extraídos.
  // chOff/chExt iguais a off/ext ⇒ sem transformação adicional nos filhos
  // (o redimensionamento do grupo escala tudo proporcionalmente).
  const childrenXml = matches.map((it) => it.full).join("");
  const grpXml =
    `<p:grpSp>` +
      `<p:nvGrpSpPr>` +
        `<p:cNvPr id="9001" name="BridgeGroup"/>` +
        `<p:cNvGrpSpPr/>` +
        `<p:nvPr/>` +
      `</p:nvGrpSpPr>` +
      `<p:grpSpPr>` +
        `<a:xfrm>` +
          `<a:off x="${grpX}" y="${grpY}"/>` +
          `<a:ext cx="${grpCX}" cy="${grpCY}"/>` +
          `<a:chOff x="${grpX}" y="${grpY}"/>` +
          `<a:chExt cx="${grpCX}" cy="${grpCY}"/>` +
        `</a:xfrm>` +
      `</p:grpSpPr>` +
      childrenXml +
    `</p:grpSp>`;

  // Insere o grupo logo antes do </p:spTree>
  mutated = mutated.replace("</p:spTree>", `${grpXml}</p:spTree>`);

  zip.file(slidePath, mutated);
  return zip.generateAsync({
    type: "blob",
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    compression: "DEFLATE",
  });
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ===========================================================================
// SLIDE — Overview CM/VOL (Budget): 4 evolutivos Real vs Budget
// Réplica do slide mensal de resultado da Harald.
// ===========================================================================
export interface BudgetEvoRow {
  label: string;
  periodo: string;
  realCm: number; budCm: number;
  realCmPct: number | null; budCmPct: number | null;
  realCmKg: number | null; budCmKg: number | null;
  realVol: number; budVol: number;
}

// Formatos pt-BR alinhados ao padrão das apresentações da Harald:
// inteiros com separador de milhar (ponto). Ex.: 4.341.
const fmtMoneyAbs = (v: number) => Math.round(v).toLocaleString("pt-BR");
const fmtTonAbs = (v: number) => Math.round(v).toLocaleString("pt-BR");

function smoothPathD(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

function plotLineRow(
  slide: PptxGenJS.Slide,
  opts: {
    x: number; y: number; w: number; h: number;
    title: string;
    headerNote?: string;
    data: BudgetEvoRow[];
    realGet: (r: BudgetEvoRow) => number | null;
    budGet: (r: BudgetEvoRow) => number | null;
    fmt: (v: number) => string;
    deltaFmt?: (delta: number) => string;
  },
) {
  const { x, y, w, h, title, headerNote, data, realGet, budGet, fmt, deltaFmt } = opts;

  // Title rotated 90° to the left (vertical, reading bottom to top)
  slide.addText(title, {
    x: x - 0.15, y: y + h / 2 - 0.4, w: 0.8, h: 0.8,
    fontFace: "Calibri", fontSize: 16, bold: true,
    color: PPT_COLORS.haraldRed,
    align: "center", valign: "middle", margin: 0,
    rotate: 270,
  });

  if (headerNote) {
    slide.addText(headerNote, {
      x: x + w * 0.55, y: y - 0.05, w: w * 0.45, h: 0.25,
      fontFace: "Calibri", fontSize: 10, bold: true,
      color: PPT_COLORS.haraldRed, align: "center", valign: "top", margin: 0,
    });
  }

  const plotX = x + 0.7;
  const plotY = y + 0.05;
  const plotW = w - 0.75;
  const plotH = h - 0.1;

  const allVals: number[] = [];
  data.forEach((r) => {
    const a = realGet(r); const b = budGet(r);
    if (a != null && isFinite(a)) allVals.push(a);
    if (b != null && isFinite(b)) allVals.push(b);
  });
  if (allVals.length === 0) return;
  let minV = Math.min(...allVals);
  let maxV = Math.max(...allVals);
  if (minV === maxV) { minV -= 1; maxV += 1; }
  const pad = (maxV - minV) * 0.25;
  const yMin = minV - pad; const yMax = maxV + pad;

  const colW = plotW / Math.max(1, data.length);
  const yOf = (v: number) => plotY + (1 - (v - yMin) / (yMax - yMin)) * plotH;
  const xOf = (i: number) => plotX + colW * (i + 0.5);

  // Build smooth curves rendered as inline SVG image (rounded, no markers, no month labels)
  const SCALE = 100;
  const realPts: { x: number; y: number }[] = [];
  const budPts: { x: number; y: number }[] = [];
  data.forEach((r, i) => {
    const a = realGet(r);
    const b = budGet(r);
    const px = (xOf(i) - plotX) * SCALE;
    if (a != null && isFinite(a)) realPts.push({ x: px, y: (yOf(a) - plotY) * SCALE });
    if (b != null && isFinite(b)) budPts.push({ x: px, y: (yOf(b) - plotY) * SCALE });
  });

  const svgW = plotW * SCALE;
  const svgH = plotH * SCALE;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" preserveAspectRatio="none">`
    + `<path d="${smoothPathD(realPts)}" stroke="#${PPT_COLORS.haraldRed}" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
    + `<path d="${smoothPathD(budPts)}" stroke="#000000" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="14,8"/>`
    + `</svg>`;
  const svgData = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
  slide.addImage({ data: svgData, x: plotX, y: plotY, w: plotW, h: plotH });

  // Separador vertical Real / Budget + nota de variação
  const sepColIdx = data.findIndex((m) => {
    const rv = realGet(m);
    const bv = budGet(m);
    return (rv == null || rv === 0) && bv != null && (bv as number) !== 0;
  });
  if (sepColIdx > 0) {
    const sepX = plotX + (sepColIdx - 0.5) * colW;
    slide.addShape("line", {
      x: sepX, y: plotY + 0.05, w: 0, h: plotH - 0.1,
      line: { color: "C8102E", width: 1.5, dashType: "solid" },
    });
    if (deltaFmt) {
      const totalReal = data.reduce((s, m) => { const v = realGet(m); return v && v > 0 ? s + v : s; }, 0);
      const totalBud  = data.reduce((s, m) => { const v = budGet(m);  return v && v > 0 ? s + v : s; }, 0);
      const delta = totalReal - totalBud;
      slide.addText(deltaFmt(delta), {
        x: sepX - 0.8, y: plotY - 0.3, w: 1.6, h: 0.25,
        fontFace: "Calibri", fontSize: 11, bold: true,
        color: delta >= 0 ? PPT_COLORS.positive : "C8102E",
        align: "center", valign: "middle", margin: 0,
      });
      slide.addShape("line", {
        x: sepX - 0.8, y: plotY - 0.08, w: 1.6, h: 0,
        line: { color: "C8102E", width: 1 },
      });
    }
  }

  // Smart label placement: per month, larger value above, smaller below
  // Labels horizontal, font 10, bold, no wrapping
  const labelW = Math.max(colW * 1.6, 0.7);
  const labelH = 0.2;
  const labelGap = 0.04;
  data.forEach((r, i) => {
    const a = realGet(r);
    const b = budGet(r);
    const cx = xOf(i);
    const items: { v: number; color: string }[] = [];
    if (a != null && isFinite(a)) items.push({ v: a, color: PPT_COLORS.haraldRed });
    if (b != null && isFinite(b)) items.push({ v: b, color: "000000" });
    if (items.length === 0) return;
    items.sort((p, q) => q.v - p.v);
    items.forEach((it, idx) => {
      const cy = yOf(it.v);
      const goAbove = idx === 0;
      const ly = goAbove ? cy - labelH - labelGap : cy + labelGap;
      slide.addText(fmt(it.v), {
        x: cx - labelW / 2, y: ly, w: labelW, h: labelH,
        fontFace: "Calibri", fontSize: 10, bold: true, color: it.color,
        align: "center", valign: "middle", margin: 0,
        wrap: false,
      });
    });
  });
}

function plotVolBars(
  slide: PptxGenJS.Slide,
  opts: { x: number; y: number; w: number; h: number; data: BudgetEvoRow[]; accumGapTons: number },
) {
  const { x, y, w, h, data, accumGapTons } = opts;
  slide.addText("VOLUME", {
    x: x - 0.35, y: y + h / 2 - 0.15, w: 1.2, h: 0.3,
    fontFace: "Calibri", fontSize: 16, bold: true, color: PPT_COLORS.haraldRed,
    align: "center", valign: "middle", margin: 0,
    rotate: 270, wrap: false,
  });
  slide.addText(`${accumGapTons.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} Tons`, {
    x: x + w * 0.55, y: y - 0.05, w: w * 0.45, h: 0.25,
    fontFace: "Calibri", fontSize: 12, bold: true,
    color: PPT_COLORS.haraldRed, align: "center", valign: "top", margin: 0,
  });

  const plotX = x + 0.7;
  const plotY = y + 0.05;
  const plotW = w - 0.75;
  const plotH = h - 0.1;

  const allVals: number[] = [];
  data.forEach((r) => {
    if (r.realVol) allVals.push(r.realVol);
    if (r.budVol) allVals.push(r.budVol);
  });
  if (allVals.length === 0) return;
  const maxV = Math.max(...allVals) * 1.25;
  const yOf = (v: number) => plotY + (1 - v / maxV) * plotH;

  const colW = plotW / Math.max(1, data.length);
  const barW = colW * 0.36;

  // For rotated text, w is the unrotated width (= visual height after rotation),
  // h is the unrotated height (= visual width). Keep w tight so text sits near the bar.
  const labelW = 0.45;
  const labelH = 0.22;
  const labelGap = 0.04;

  data.forEach((r, i) => {
    const cx = plotX + colW * (i + 0.5);
    if (r.realVol > 0) {
      const yT = yOf(r.realVol);
      slide.addShape("rect", {
        x: cx - barW - 0.01, y: yT, w: barW, h: plotY + plotH - yT,
        fill: { color: PPT_COLORS.haraldRed },
        line: { color: PPT_COLORS.haraldRed, width: 0 },
      });
      slide.addText(fmtTonAbs(r.realVol), {
        x: cx - barW - 0.01 + barW / 2 - labelW / 2,
        y: yT - labelW - 0.02,
        w: labelW, h: labelH,
        fontFace: "Calibri", fontSize: 10, bold: true, color: PPT_COLORS.haraldRed,
        align: "center", valign: "middle", margin: 0,
        rotate: 270, wrap: false,
      });
    }
    if (r.budVol > 0) {
      const yT = yOf(r.budVol);
      slide.addShape("rect", {
        x: cx + 0.01, y: yT, w: barW, h: plotY + plotH - yT,
        fill: { color: "000000" },
        line: { color: "000000", width: 0 },
      });
      slide.addText(fmtTonAbs(r.budVol), {
        x: cx + 0.01 + barW / 2 - labelW / 2,
        y: yT - labelW - 0.02,
        w: labelW, h: labelH,
        fontFace: "Calibri", fontSize: 10, bold: true, color: "000000",
        align: "center", valign: "middle", margin: 0,
        rotate: 270, wrap: false,
      });
    }
    slide.addText(r.label, {
      x: plotX + colW * i, y: y + h - 0.12, w: colW, h: 0.22,
      fontFace: "Calibri", fontSize: 8, bold: true, color: PPT_COLORS.muted,
      align: "center", valign: "top", margin: 0,
      rotate: 315,
    });
  });

  // Separador vertical Real / Budget + nota de variação em volume
  const sepColIdxV = data.findIndex((r) => r.realVol === 0 && r.budVol > 0);
  if (sepColIdxV > 0) {
    const sepX = plotX + (sepColIdxV - 0.5) * colW;
    slide.addShape("line", {
      x: sepX, y: plotY + 0.05, w: 0, h: plotH - 0.1,
      line: { color: "C8102E", width: 1.5, dashType: "solid" },
    });
    const volDelta = accumGapTons;
    const volDeltaLabel = (volDelta >= 0 ? "+" : "-") + fmtTonAbs(Math.abs(volDelta)) + " Tons";
    slide.addText(volDeltaLabel, {
      x: sepX - 0.8, y: plotY - 0.3, w: 1.6, h: 0.25,
      fontFace: "Calibri", fontSize: 11, bold: true,
      color: volDelta >= 0 ? PPT_COLORS.positive : "C8102E",
      align: "center", valign: "middle", margin: 0,
    });
  }

  // Legenda posicionada abaixo das barras
  const legY = plotY + plotH + 0.05;
  const legX = plotX + plotW - 1.5;
  slide.addShape("rect", { x: legX, y: legY + 0.05, w: 0.2, h: 0.1, fill: { color: PPT_COLORS.haraldRed }, line: { color: PPT_COLORS.haraldRed, width: 0 } });
  slide.addText("REAL", { x: legX + 0.23, y: legY, w: 0.4, h: 0.2, fontFace: "Calibri", fontSize: 9, bold: true, color: PPT_COLORS.haraldRed, margin: 0 });
  slide.addShape("rect", { x: legX + 0.75, y: legY + 0.05, w: 0.2, h: 0.1, fill: { color: "000000" }, line: { color: "000000", width: 0 } });
  slide.addText("BUDGET", { x: legX + 0.98, y: legY, w: 0.52, h: 0.2, fontFace: "Calibri", fontSize: 9, bold: true, color: "000000", margin: 0 });
}

export function addBudgetEvoSlide(
  pptx: PptxGenJS,
  monthly: BudgetEvoRow[],
  accumGap: { cmGap: number; volGap: number },
) {
  const slide = pptx.addSlide();
  slide.background = { color: "FFFFFF" };
  addHaraldFooter(slide);

  slide.addText("Overview CM/VOL", {
    x: 0.4, y: 0.15, w: 9, h: 0.5,
    fontFace: "Calibri", fontSize: 28, bold: true,
    color: PPT_COLORS.ink, margin: 0,
  });
  // Barra decorativa vermelha abaixo do título
  slide.addShape("rect", {
    x: 0.4, y: 0.68, w: 2.6, h: 0.04,
    fill: { color: PPT_COLORS.haraldRed },
    line: { color: PPT_COLORS.haraldRed, width: 0 },
  });

  const rowH = 1.35;
  const rowX = 0.35;
  const rowW = 12.6;
  let curY = 0.95;

  const addSep = (atY: number) => slide.addShape("line", {
    x: rowX, y: atY, w: rowW, h: 0,
    line: { color: "E2E8F0", width: 0.5 },
  });

  plotLineRow(slide, {
    x: rowX, y: curY, w: rowW, h: rowH,
    title: "CM ABS",
    headerNote: fmtMoneyAbs(accumGap.cmGap),
    data: monthly,
    realGet: (r) => r.realCm || null,
    budGet: (r) => r.budCm || null,
    fmt: (v) => fmtMoneyAbs(v),
    deltaFmt: (delta) => (delta >= 0 ? "+" : "") + fmtMoneyAbs(delta / 1000) + " Mi",
  });
  curY += rowH;
  addSep(curY);

  plotLineRow(slide, {
    x: rowX, y: curY, w: rowW, h: rowH,
    title: "CM/%",
    data: monthly,
    realGet: (r) => r.realCmPct || null,
    budGet: (r) => r.budCmPct || null,
    fmt: (v) => `${(v * 100).toFixed(1)}%`,
  });
  curY += rowH;
  addSep(curY);

  plotLineRow(slide, {
    x: rowX, y: curY, w: rowW, h: rowH,
    title: "CM/Kg",
    data: monthly,
    realGet: (r) => r.realCmKg || null,
    budGet: (r) => r.budCmKg || null,
    fmt: (v) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  });
  curY += rowH;
  addSep(curY);

  plotVolBars(slide, {
    x: rowX, y: curY, w: rowW, h: rowH - 0.1,
    data: monthly,
    accumGapTons: accumGap.volGap,
  });

  // Texto de fonte/crédito sobre o rodapé
  slide.addText("FONTE: KE30 – OMNI4 Pricing Analytics", {
    x: 0.4, y: 7.0, w: 8, h: 0.2,
    fontFace: "Calibri", fontSize: 7, color: "FFFFFF", italic: true, margin: 0,
  });
}

export async function exportBudgetEvoPpt(
  monthly: BudgetEvoRow[],
  accumGap: { cmGap: number; volGap: number },
) {
  await getHaraldFooterDataUri();
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = "Overview CM/VOL — Real vs Budget";
  addBudgetEvoSlide(pptx, monthly, accumGap);
  const blob = (await pptx.write({ outputType: "blob" })) as Blob;
  triggerDownload(blob, `overview_cm_vol_real_vs_budget.pptx`);
}

// ===========================================================================
// SLIDE — Capa / divisor customizável
// ===========================================================================
export interface CoverSlideOptions {
  title: string;
  subtitle?: string;
  /** "cover" = capa principal (vermelha cheia). "divider" = divisor sóbrio (branco). */
  variant?: "cover" | "divider";
}

export async function addCoverSlide(pptx: PptxGenJS, opts: CoverSlideOptions) {
  await getHaraldFooterDataUri();
  const slide = pptx.addSlide();
  const isDivider = opts.variant === "divider";
  slide.background = { color: isDivider ? "FFFFFF" : PPT_COLORS.haraldRed };
  if (isDivider) addHaraldFooter(slide);

  const titleColor = isDivider ? PPT_COLORS.haraldRed : "FFFFFF";
  const subColor = isDivider ? PPT_COLORS.muted : "FFFFFF";

  if (isDivider) {
    slide.addShape("rect", {
      x: 0.4, y: 3.0, w: 0.6, h: 0.08,
      fill: { color: PPT_COLORS.haraldRed }, line: { color: PPT_COLORS.haraldRed, width: 0 },
    });
  }

  slide.addText(opts.title, {
    x: 0.6, y: 3.2, w: 12, h: 1.2,
    fontFace: "Calibri", fontSize: 44, bold: true,
    color: titleColor, margin: 0, valign: "middle",
  });
  if (opts.subtitle) {
    slide.addText(opts.subtitle, {
      x: 0.62, y: 4.4, w: 12, h: 0.6,
      fontFace: "Calibri", fontSize: 18,
      color: subColor, margin: 0, valign: "middle",
    });
  }
}

// ===========================================================================
// Multi-slide flow exporter — usado pela aba "Slides (Beta)"
// ===========================================================================
export interface SlideFlowItem {
  build: (pptx: PptxGenJS) => Promise<void> | void;
}

export async function exportSlideFlow(
  items: SlideFlowItem[],
  fileName = "apresentacao.pptx",
  bridgeSlideIndex?: number,
) {
  if (items.length === 0) throw new Error("Nenhum slide no fluxo.");
  await getHaraldFooterDataUri();
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Lovable";
  pptx.company = "Lovable";
  pptx.title = "Apresentação Pricing Analytics";
  pptx.theme = { headFontFace: "Calibri", bodyFontFace: "Calibri" };

  for (const item of items) {
    await item.build(pptx);
  }

  const rawBlob = (await pptx.write({ outputType: "blob" })) as Blob;
  const grouped = await groupBridgeElements(rawBlob, bridgeSlideIndex ?? 1);
  triggerDownload(grouped, fileName);
}

