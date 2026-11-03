// Ações da Central de De/Paras: corrigir, desfazer e medir a saúde. Toda
// correção vale na hora para as bases já carregadas (Real e Budget) e fica
// guardada neste computador.
import { useMemo } from "react";
import { toast } from "sonner";
import {
  DEPARA_FIELDS,
  getDeParaOverride,
  removeDeParaOverride,
  restoreDeParaOverrides,
  upsertDeParaEntries,
  type DeParaEntry,
  type DeParaOverrideEntry,
} from "@/lib/depara";
import {
  COMERCIAL_MAP_IDS,
  getComercialOverridesSnapshot,
  removeComercialOverride,
  restoreComercialOverrides,
  upsertComercialOverrides,
  type ComercialMapId,
} from "@/lib/deparaComercial";
import type { DePara360Plan } from "@/lib/depara360";
import type { InovacaoEntry } from "@/lib/deparaInovacao";
import type { TipoBase } from "@/hooks/use-bases-locais";
import { computeDeParaHealth, type DeParaHealth } from "@/lib/deparaHealth";
import { memoizeByRows } from "@/lib/derivedCache";
import type { BudgetRow } from "@/lib/budget";
import type { PricingRow } from "@/lib/types";
import { useBudget } from "@/store/budget";
import { useDeParaCenter } from "@/store/deparaCenter";
import { useInovacaoDepara } from "@/store/inovacaoDepara";
import { usePricing } from "@/store/pricing";

function refreshSku(entries: Record<string, DeParaOverrideEntry>) {
  usePricing.getState().applySkuDeParaEntries(entries);
  useBudget.getState().applySkuDeParaEntries(entries);
  useDeParaCenter.getState().bump();
}

function refreshComercial() {
  usePricing.getState().applyComercialDePara();
  useBudget.getState().applyComercialDePara();
  useDeParaCenter.getState().bump();
}

type SkuFields = Partial<Record<keyof DeParaEntry, string | undefined>>;

/** Campos de produto como estão hoje nas linhas carregadas (1ª linha de cada SKU). */
function snapshotRowFields(skus: Set<string>, rows: Array<{ sku?: string } & SkuFields>): Record<string, SkuFields> {
  const out: Record<string, SkuFields> = {};
  for (const r of rows) {
    if (!r.sku || !skus.has(r.sku) || out[r.sku]) continue;
    out[r.sku] = Object.fromEntries(DEPARA_FIELDS.map((f) => [f, r[f]])) as SkuFields;
  }
  return out;
}

/** Corrige SKUs (um ou vários) e oferece desfazer — que volta tudo como estava. */
export function saveSkuEntries(entries: Record<string, DeParaOverrideEntry>, message?: string) {
  const skus = Object.keys(entries);
  if (skus.length === 0) return;
  const skuSet = new Set(skus);
  const previousOverrides = Object.fromEntries(skus.map((sku) => [sku, getDeParaOverride(sku)]));
  const previousReal = snapshotRowFields(skuSet, usePricing.getState().rows);
  const previousBudget = snapshotRowFields(skuSet, useBudget.getState().rows);
  upsertDeParaEntries(entries);
  refreshSku(entries);
  toast.success(message ?? (skus.length === 1 ? `SKU ${skus[0]} atualizado no De/Para.` : `${skus.length} SKUs atualizados no De/Para.`), {
    description: "Já vale para as bases carregadas e para as próximas.",
    duration: 8000,
    action: {
      label: "Desfazer",
      onClick: () => {
        restoreDeParaOverrides(previousOverrides);
        usePricing.getState().setSkuFields(previousReal);
        useBudget.getState().setSkuFields(previousBudget);
        useDeParaCenter.getState().bump();
        toast.success("Correção desfeita.");
      },
    },
  });
}

/** Desfaz a correção do app para os SKUs (volta ao De/Para padrão). */
export function undoSkuEntries(skus: string[]) {
  for (const sku of skus) removeDeParaOverride(sku);
  refreshSku(Object.fromEntries(skus.map((sku) => [sku, {}])));
  toast.success(skus.length === 1 ? `SKU ${skus[0]} voltou ao De/Para padrão.` : `${skus.length} SKUs voltaram ao De/Para padrão.`, {
    description: "Campos que o padrão não preenche voltam ao valor da base na próxima abertura do app.",
  });
}

export function saveComercialEntry(map: ComercialMapId, key: string, value: string, label: string) {
  upsertComercialOverrides(map, { [key]: value });
  refreshComercial();
  toast.success(`${label}: “${key.trim()}” → ${value}`, {
    duration: 8000,
    action: { label: "Desfazer", onClick: () => undoComercialEntry(map, key, label, true) },
  });
}

export function undoComercialEntry(map: ComercialMapId, key: string, label: string, silent = false) {
  removeComercialOverride(map, key);
  refreshComercial();
  if (!silent) toast.success(`${label}: “${key.trim()}” voltou ao mapeamento padrão.`);
}

/** Onde o De/Para de Inovação fica salvo no app instalado (useBasesLocais). */
export interface InovacaoDiskStorage {
  isElectron: boolean;
  salvarBase: (tipo: TipoBase, file: File) => Promise<unknown>;
  carregarBase: (tipo: TipoBase) => Promise<File[]>;
  deletarBase: (tipo: TipoBase) => Promise<unknown>;
}

/** Só a aba de Inovação, no formato que a abertura do app sabe ler. */
async function inovacaoWorkbookFile(map: Record<string, InovacaoEntry>): Promise<File> {
  const XLSX = await import("xlsx");
  const rows = Object.entries(map).map(([sku, v]) => ({
    SKU: sku,
    Classificacao: v.classificacao,
    "Ano de Lancamento": v.anoLancamento ?? "",
    Legado: v.legado ?? "",
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows, { header: ["SKU", "Classificacao", "Ano de Lancamento", "Legado"] }), "DePara Inovacao");
  const bytes = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new File([bytes], "De-Para 360 - Inovacao.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/**
 * Aplica o De/Para 360 (só o que muda) nas bases carregadas e nas próximas.
 * Devolve uma função que volta tudo como estava antes da importação.
 */
export async function applyDePara360(plan: DePara360Plan, fileName: string, disk: InovacaoDiskStorage): Promise<() => Promise<void>> {
  const skus = Object.keys(plan.sku);
  const skuSet = new Set(skus);
  const previousOverrides = Object.fromEntries(skus.map((sku) => [sku, getDeParaOverride(sku)]));
  const previousReal = snapshotRowFields(skuSet, usePricing.getState().rows);
  const previousBudget = snapshotRowFields(skuSet, useBudget.getState().rows);
  const previousComercial = getComercialOverridesSnapshot();
  const inovacaoBefore = useInovacaoDepara.getState();
  const previousInovacao = { map: inovacaoBefore.map, file: inovacaoBefore.file };
  let previousInovacaoDisk: File | undefined;

  if (skus.length) {
    upsertDeParaEntries(plan.sku);
    usePricing.getState().applySkuDeParaEntries(plan.sku);
    useBudget.getState().applySkuDeParaEntries(plan.sku);
  }

  if (plan.counts.comercial > 0) {
    for (const id of COMERCIAL_MAP_IDS) {
      if (Object.keys(plan.comercial[id]).length) upsertComercialOverrides(id, plan.comercial[id]);
    }
    usePricing.getState().applyComercialDePara();
    useBudget.getState().applyComercialDePara();
  }

  if (plan.inovacao) {
    if (disk.isElectron) previousInovacaoDisk = (await disk.carregarBase("deparaInovacao")).at(-1);
    useInovacaoDepara.getState().setDepara(plan.inovacao, {
      name: fileName,
      rowCount: Object.keys(plan.inovacao).length,
      uploadedAt: Date.now(),
    });
    usePricing.getState().reclassifyInovacao();
    useBudget.getState().reclassifyInovacao();
    if (disk.isElectron) {
      await disk.deletarBase("deparaInovacao");
      await disk.salvarBase("deparaInovacao", await inovacaoWorkbookFile(plan.inovacao));
    }
  }

  useDeParaCenter.getState().bump();

  return async () => {
    if (skus.length) {
      restoreDeParaOverrides(previousOverrides);
      usePricing.getState().setSkuFields(previousReal);
      useBudget.getState().setSkuFields(previousBudget);
    }
    if (plan.counts.comercial > 0) {
      restoreComercialOverrides(previousComercial);
      usePricing.getState().applyComercialDePara();
      useBudget.getState().applyComercialDePara();
    }
    if (plan.inovacao) {
      if (previousInovacao.file) useInovacaoDepara.getState().setDepara(previousInovacao.map, previousInovacao.file);
      else useInovacaoDepara.getState().clearDepara();
      usePricing.getState().reclassifyInovacao();
      useBudget.getState().reclassifyInovacao();
      if (disk.isElectron) {
        await disk.deletarBase("deparaInovacao");
        if (previousInovacaoDisk) await disk.salvarBase("deparaInovacao", previousInovacaoDisk);
      }
    }
    useDeParaCenter.getState().bump();
  };
}

// Guardada por base + versão dos De/Paras + mapa de Inovação: abrir a aba de novo
// não refaz a varredura; qualquer correção muda a versão e recalcula.
const cachedDeParaHealth = memoizeByRows(
  (real: PricingRow[], budget: BudgetRow[], _version: number, _inovacao: object) => computeDeParaHealth(real, budget),
  2,
);

/** Saúde dos De/Paras nas bases carregadas — recalcula a cada correção. */
export function useDeParaHealth(): DeParaHealth {
  const real = usePricing((s) => s.rows);
  const budget = useBudget((s) => s.rows);
  const version = useDeParaCenter((s) => s.version);
  const inovacaoMap = useInovacaoDepara((s) => s.map);
  return useMemo(
    () => cachedDeParaHealth(real, budget, version, inovacaoMap),
    [real, budget, version, inovacaoMap],
  );
}
