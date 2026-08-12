import type { ReactNode } from "react";
import type { PVMResult, PVMSkuDetail } from "@/lib/analytics";
import { formatBRL } from "@/lib/format";

const EFFECT_LABELS: Record<keyof Pick<PVMResult, "volume" | "price" | "cost" | "freight" | "commission" | "others">, string> = {
  volume: "Volume",
  price: "Preco",
  cost: "Custo Variavel",
  freight: "Frete",
  commission: "Comissao",
  others: "Mix e Residuo Comercial",
};

type EffectKey = keyof typeof EFFECT_LABELS;

function strong(children: ReactNode, tone: "neutral" | "pos" | "neg" = "neutral") {
  return (
    <span
      className={
        tone === "pos"
          ? "font-semibold text-success"
          : tone === "neg"
            ? "font-semibold text-destructive"
            : "font-semibold text-primary"
      }
    >
      {children}
    </span>
  );
}

export function getSkuMixEffect(detail: PVMSkuDetail): number {
  return (detail.mixResidualEffect ?? 0) + (detail.skuOnlyEffect ?? 0);
}

export function buildPvmReading(result: PVMResult): ReactNode[] {
  const sentences: ReactNode[] = [];
  const delta = result.current - result.base;
  const deltaPct = result.base !== 0 ? delta / Math.abs(result.base) : 0;

  const fmt = (v: number) => formatBRL(v, { compact: true });

  if (delta >= 0) {
    sentences.push(
      <>
        A margem cresceu {strong(fmt(delta), "pos")} ({strong(`${(deltaPct * 100).toFixed(1)}%`, "pos")}) de{" "}
        {strong(result.baseLabel)} para {strong(result.currentLabel)}.
      </>,
    );
  } else {
    sentences.push(
      <>
        A margem recuou {strong(fmt(Math.abs(delta)), "neg")} ({strong(`${(deltaPct * 100).toFixed(1)}%`, "neg")}) de{" "}
        {strong(result.baseLabel)} para {strong(result.currentLabel)}.
      </>,
    );
  }

  const effects: Array<{ key: EffectKey; value: number }> = (
    ["volume", "price", "cost", "freight", "commission", "others"] as EffectKey[]
  ).map((key) => ({ key, value: result[key] }));

  const positives = effects.filter((effect) => effect.value > 0);
  const negatives = effects.filter((effect) => effect.value < 0);
  const sumPos = positives.reduce((sum, effect) => sum + effect.value, 0);
  const sumNeg = negatives.reduce((sum, effect) => sum + effect.value, 0);

  if (positives.length > 0) {
    const top = [...positives].sort((a, b) => b.value - a.value)[0];
    const share = sumPos > 0 ? top.value / sumPos : 0;
    sentences.push(
      <>
        O principal fator de ganho foi {strong(EFFECT_LABELS[top.key], "pos")} ({strong(`+${fmt(top.value)}`, "pos")}),
        representando {strong(`${(share * 100).toFixed(0)}%`)} da variacao total positiva.
      </>,
    );
  }

  let topNegKey: EffectKey | null = null;
  if (negatives.length > 0) {
    const top = [...negatives].sort((a, b) => a.value - b.value)[0];
    topNegKey = top.key;
    const share = sumNeg < 0 ? top.value / sumNeg : 0;
    sentences.push(
      <>
        A maior pressao veio de {strong(EFFECT_LABELS[top.key], "neg")} ({strong(fmt(top.value), "neg")}), representando{" "}
        {strong(`${(share * 100).toFixed(0)}%`)} da variacao negativa.
      </>,
    );
  }

  const skuScored = result.skuDetails.map((detail) => ({
    sku: detail.sku,
    name: detail.skuDesc?.trim() || detail.sku,
    pos: detail.priceEffect + detail.volumeEffect,
    neg:
      detail.priceEffect +
      detail.volumeEffect +
      detail.costEffect +
      detail.freightEffect +
      detail.commissionEffect +
      detail.othersEffect,
  }));
  const topSkuPos = [...skuScored].filter((sku) => sku.pos > 0).sort((a, b) => b.pos - a.pos)[0];
  if (topSkuPos) {
    sentences.push(
      <>
        O SKU mais impactante positivamente foi {strong(topSkuPos.name)} com {strong(`+${fmt(topSkuPos.pos)}`, "pos")} de
        contribuicao liquida.
      </>,
    );
  }

  const topSkuNeg = [...skuScored].filter((sku) => sku.neg < 0).sort((a, b) => a.neg - b.neg)[0];
  if (topSkuNeg) {
    sentences.push(
      <>
        O SKU com maior pressao negativa foi {strong(topSkuNeg.name)} com {strong(fmt(topSkuNeg.neg), "neg")} - avaliar
        pricing ou mix.
      </>,
    );
  }

  const allPositive = effects.every((effect) => effect.value >= 0);
  if (result.price < 0 && result.volume > 0) {
    sentences.push(
      <>
        <strong className="text-warning">Atencao:</strong> o crescimento de volume esta mascarando deterioracao de preco -
        revisar politica comercial.
      </>,
    );
  } else if (topNegKey === "cost") {
    sentences.push(
      <>
        A pressao de {strong("custo variavel", "neg")} e o principal detrator - priorizar revisao de fornecedores ou
        reformulacao.
      </>,
    );
  } else if (allPositive) {
    sentences.push(
      <>
        Resultado equilibrado - ganhos distribuidos entre {strong("preco", "pos")}, {strong("volume", "pos")} e{" "}
        {strong("eficiencia de custo", "pos")}.
      </>,
    );
  }

  return sentences;
}

export interface MixReadingDriver {
  label: string;
  value: number;
}

export function buildMixReading(
  result: PVMResult,
  drivers: {
    categories?: MixReadingDriver[];
    channels?: MixReadingDriver[];
    marginPp?: number;
  } = {},
): ReactNode[] {
  const sentences: ReactNode[] = [];
  const mixTotal = result.skuDetails.reduce((sum, detail) => sum + getSkuMixEffect(detail), 0);
  const fmt = (value: number) => formatBRL(value, { compact: true });
  const marginText = typeof drivers.marginPp === "number" && isFinite(drivers.marginPp)
    ? `, equivalente a ${Math.abs(drivers.marginPp).toFixed(1)} p.p. de margem no periodo comparado`
    : "";

  if (Math.abs(mixTotal) < 1) {
    sentences.push(
      <>
        O mix ficou praticamente neutro entre {strong(result.baseLabel)} e {strong(result.currentLabel)}, sem pressao
        material sobre a margem consolidada.
      </>,
    );
  } else if (mixTotal > 0) {
    sentences.push(
      <>
        O mix ajudou a margem em {strong(`+${fmt(mixTotal)}`, "pos")}{marginText}, indicando migracao para uma
        composicao mais rentavel.
      </>,
    );
  } else {
    sentences.push(
      <>
        O mix pressionou a margem em {strong(fmt(mixTotal), "neg")}{marginText}, indicando migracao para uma composicao
        menos rentavel.
      </>,
    );
  }

  const topCategoryPos = drivers.categories?.filter((item) => item.value > 0).sort((a, b) => b.value - a.value)[0];
  const topCategoryNeg = drivers.categories?.filter((item) => item.value < 0).sort((a, b) => a.value - b.value)[0];
  if (topCategoryPos || topCategoryNeg) {
    sentences.push(
      <>
        Em categorias, {topCategoryPos ? <>{strong(topCategoryPos.label)} foi o principal apoio ({strong(`+${fmt(topCategoryPos.value)}`, "pos")})</> : "nao houve apoio material"}
        {topCategoryNeg ? <> enquanto {strong(topCategoryNeg.label)} foi a maior pressao ({strong(fmt(topCategoryNeg.value), "neg")})</> : ""}.
      </>,
    );
  }

  const topChannelPos = drivers.channels?.filter((item) => item.value > 0).sort((a, b) => b.value - a.value)[0];
  const topChannelNeg = drivers.channels?.filter((item) => item.value < 0).sort((a, b) => a.value - b.value)[0];
  if (topChannelPos || topChannelNeg) {
    sentences.push(
      <>
        Por canal, {topChannelPos ? <>{strong(topChannelPos.label)} mais contribuiu positivamente ({strong(`+${fmt(topChannelPos.value)}`, "pos")})</> : "nao houve ganho relevante"}
        {topChannelNeg ? <> e {strong(topChannelNeg.label)} concentrou a maior deterioracao ({strong(fmt(topChannelNeg.value), "neg")})</> : ""}.
      </>,
    );
  }

  const skuDrivers = result.skuDetails
    .map((detail) => ({ label: detail.skuDesc?.trim() || detail.sku, value: getSkuMixEffect(detail) }))
    .filter((item) => Math.abs(item.value) >= 1);
  const topSku = [...skuDrivers].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];
  if (topSku) {
    sentences.push(
      <>
        O SKU que mais explica o mix e {strong(topSku.label)} ({strong(topSku.value > 0 ? `+${fmt(topSku.value)}` : fmt(topSku.value), topSku.value > 0 ? "pos" : "neg")}).
      </>,
    );
  }

  return sentences;
}
