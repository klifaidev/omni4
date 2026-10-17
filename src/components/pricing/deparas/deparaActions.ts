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
  removeComercialOverride,
  upsertComercialOverrides,
  type ComercialMapId,
} from "@/lib/deparaComercial";
import { computeDeParaHealth, type DeParaHealth } from "@/lib/deparaHealth";
import { useBudget } from "@/store/budget";
import { useDeParaCenter } from "@/store/deparaCenter";
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

/** Saúde dos De/Paras nas bases carregadas — recalcula a cada correção. */
export function useDeParaHealth(): DeParaHealth {
  const real = usePricing((s) => s.rows);
  const budget = useBudget((s) => s.rows);
  const version = useDeParaCenter((s) => s.version);
  return useMemo(() => computeDeParaHealth(real, budget), [real, budget, version]); // eslint-disable-line react-hooks/exhaustive-deps
}
