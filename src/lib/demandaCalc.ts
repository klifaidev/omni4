import type { DemandaRow } from "./demanda";
import type { PricingRow } from "./types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------- Sazonalidade: Ind1 * fator ----------
export function sugestaoSazonalidade(row: DemandaRow, fator: number): number[] {
  const ind1 = row.indicadores[1];
  if (!ind1) return Array(12).fill(0);

  const base = ind1.valores.map((v) => v * fator);
  const nonZero = base.filter((v) => v > 0);
  const media = nonZero.length > 0 ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0;

  return base.map((v) => round2(v === 0 ? media : v));
}

// ---------- Tendência: regressão linear nos últimos nMeses do Ind3 ----------
export function sugestaoTendencia(row: DemandaRow, nMeses: number): number[] {
  const ind3 = row.indicadores[3];
  if (!ind3) return sugestaoAnterior(row);

  // collect last nMeses non-zero points (using actual array index as x)
  const pontos: { x: number; y: number }[] = [];
  for (let i = ind3.valores.length - 1; i >= 0 && pontos.length < nMeses; i--) {
    if (ind3.valores[i] > 0) pontos.unshift({ x: i, y: ind3.valores[i] });
  }

  if (pontos.length < 2) return sugestaoAnterior(row);

  const n = pontos.length;
  const sumX = pontos.reduce((a, p) => a + p.x, 0);
  const sumY = pontos.reduce((a, p) => a + p.y, 0);
  const sumXY = pontos.reduce((a, p) => a + p.x * p.y, 0);
  const sumX2 = pontos.reduce((a, p) => a + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;

  if (denom === 0) return sugestaoAnterior(row);

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  return Array.from({ length: 12 }, (_, i) => round2(Math.max(0, slope * i + intercept)));
}

// ---------- Anterior: copia Ind4 ----------
export function sugestaoAnterior(row: DemandaRow): number[] {
  const ind4 = row.indicadores[4];
  if (!ind4) return Array(12).fill(0);
  return ind4.valores.map((v) => round2(v));
}

// ---------- Score de Mix: margem + volume vs portfólio ----------
export function calcScoreMix(
  cod: number,
  pricingRows: PricingRow[],
  metric: "cm" | "mb",
): number | null {
  const codStr = String(cod);
  const skuRows = pricingRows.filter((r) => r.sku === codStr || Number(r.sku) === cod);
  if (skuRows.length === 0) return null;

  const allPeriods = Array.from(new Set(pricingRows.map((r) => r.periodo))).sort().slice(-3);
  if (allPeriods.length === 0) return null;

  const getM = (r: PricingRow) => (metric === "cm" ? r.contribMarginal : r.margemBruta);

  const skuRecent = skuRows.filter((r) => allPeriods.includes(r.periodo));
  if (skuRecent.length === 0) return null;

  const skuRol = skuRecent.reduce((a, r) => a + r.rol, 0);
  if (skuRol === 0) return null;
  const margSku = skuRecent.reduce((a, r) => a + getM(r), 0) / skuRol;
  const skuVol = skuRecent.reduce((a, r) => a + r.volumeKg, 0);

  const allRecent = pricingRows.filter((r) => allPeriods.includes(r.periodo));
  const allRol = allRecent.reduce((a, r) => a + r.rol, 0);
  if (allRol === 0) return null;
  const margMedia = allRecent.reduce((a, r) => a + getM(r), 0) / allRol;
  const uniqueSkus = new Set(allRecent.map((r) => r.sku ?? "")).size || 1;
  const volMedia = allRecent.reduce((a, r) => a + r.volumeKg, 0) / uniqueSkus;

  if (margMedia === 0) return null;

  const margRatio = margSku / margMedia;
  const volRatio = volMedia > 0 ? skuVol / volMedia : 1;

  let score = Math.min(10, (margRatio * 0.6 + volRatio * 0.4) * 5);
  if (margSku < 0) score = Math.min(score, 3);

  return Math.max(0, Math.round(score * 10) / 10);
}

// ---------- Acurácia histórica: compara Ind8 planejado vs Ind3 realizado ----------
export function calcAcuracia(
  row: DemandaRow,
  mesAtualIdx: number,
): { acuracia: number; bias: number } | null {
  const ind8 = row.indicadores[8];
  const ind3 = row.indicadores[3];
  if (!ind8 || !ind3) return null;

  const erros: number[] = [];
  const biases: number[] = [];

  for (let i = 0; i < mesAtualIdx; i++) {
    const plan = ind8.valores[i];
    const real = ind3.valores[i];
    if (real > 0 && plan > 0) {
      erros.push(Math.abs(plan - real) / real);
      biases.push((plan - real) / real);
    }
  }

  if (erros.length === 0) return null;

  const acuracia = Math.max(0, 1 - erros.reduce((a, b) => a + b, 0) / erros.length);
  const bias = biases.reduce((a, b) => a + b, 0) / biases.length;

  return {
    acuracia: Math.round(acuracia * 1000) / 1000,
    bias: Math.round(bias * 1000) / 1000,
  };
}

// ---------- Erros mensais para o gráfico de acurácia ----------
export function calcErrosMensais(
  row: DemandaRow,
  mesAtualIdx: number,
  labels: string[],
): { label: string; erro: number }[] {
  const ind8 = row.indicadores[8];
  const ind3 = row.indicadores[3];
  if (!ind8 || !ind3) return [];

  const result: { label: string; erro: number }[] = [];
  for (let i = 0; i < mesAtualIdx; i++) {
    const plan = ind8.valores[i];
    const real = ind3.valores[i];
    if (real > 0 && plan >= 0) {
      result.push({ label: labels[i] ?? `M${i}`, erro: round2(((plan - real) / real) * 100) });
    }
  }
  return result;
}

// ---------- Índices de sazonalidade: Ind1 / média anual ----------
export function calcSazonalidadeIdx(row: DemandaRow): number[] {
  const ind1 = row.indicadores[1];
  if (!ind1) return Array(12).fill(1) as number[];
  const nonZero = ind1.valores.filter((v) => v > 0);
  if (nonZero.length === 0) return Array(12).fill(1) as number[];
  const media = nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
  return ind1.valores.map((v) => (media > 0 ? round2(v / media) : 1));
}

// ---------- Badge de risco de forecast ----------
export interface RiscoBadge {
  nivel: "alto" | "medio" | "baixo";
  acuraciaStr: string;
  divergenciaStr: string;
}

export function calcRiscoBadge(
  row: DemandaRow,
  mesAtualIdx: number,
  fatorCrescimento: number,
  mesesTendencia: number,
): RiscoBadge {
  const ac = calcAcuracia(row, mesAtualIdx);
  const acuraciaNum = ac ? ac.acuracia * 100 : null;

  const saz = sugestaoSazonalidade(row, fatorCrescimento);
  const tend = sugestaoTendencia(row, mesesTendencia);
  const diffs: number[] = [];
  for (let i = mesAtualIdx + 1; i < 12; i++) {
    const s = saz[i] ?? 0;
    const t = tend[i] ?? 0;
    const max = Math.max(s, t);
    if (max > 0) diffs.push(Math.abs(s - t) / max);
  }
  const divergencia =
    diffs.length > 0 ? (diffs.reduce((a, b) => a + b, 0) / diffs.length) * 100 : 0;

  const isAlto = (acuraciaNum !== null && acuraciaNum < 70) || divergencia > 30;
  const isMedio = !isAlto && ((acuraciaNum !== null && acuraciaNum < 85) || divergencia > 15);

  return {
    nivel: isAlto ? "alto" : isMedio ? "medio" : "baixo",
    acuraciaStr: acuraciaNum !== null ? `${acuraciaNum.toFixed(0)}%` : "N/D",
    divergenciaStr: `${divergencia.toFixed(0)}%`,
  };
}
