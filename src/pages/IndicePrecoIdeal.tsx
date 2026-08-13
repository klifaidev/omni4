import { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { AlertTriangle, ArrowRightLeft, BadgeCheck, BarChart3, Camera, Download, Gauge, RotateCcw, Search, ShieldCheck, Sparkles, Star } from "lucide-react";
import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { EmptyState } from "@/components/pricing/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePageTitle } from "@/hooks/use-page-title";
import { usePricing } from "@/store/pricing";
import { useBudget } from "@/store/budget";
import { applyFilters } from "@/lib/analytics";
import { budgetRowsAsPricingFiltered } from "@/lib/budgetAdapter";
import { formatBRL, formatNum } from "@/lib/format";
import { exportTableCsv } from "@/lib/exportCsv";
import {
  STORAGE_KEY as MARGIN_TARGET_STORAGE_KEY,
  buildCategoryTargets,
  buildSkuTargetsForCategory,
  getPeriodOptions,
  loadSettings as loadMarginTargetSettings,
  resolvePremise,
  rowsForPath,
  type TargetSettings,
} from "@/lib/marginTarget";
import {
  calculatePricePredictionResiduals,
  calibratePriceIndices,
  predictIdealPrice,
  type CalibratedPriceIndex,
  type PriceIndexDimension,
  type PriceIndexValues,
  type PricePredictionResidual,
} from "@/lib/priceIndexModel";
import type { PricingRow } from "@/lib/types";
import { cn } from "@/lib/utils";

type MatrixConfig = {
  referenceValue?: string;
  manualOverrides: Record<string, number>;
};

type StoredConfig = Partial<Record<PriceIndexDimension, MatrixConfig>>;

type SkuPriceSuggestion = {
  sku: string;
  name: string;
  category: string;
  sabor: string;
  faixaPeso: string;
  formato: string;
  volumeKg: number;
  rol: number;
  actualPrice: number | null;
  costPerKg: number | null;
  suggestedMarginPct: number | null;
  targetMarginPct: number | null;
  targetGapPp: number | null;
  suggestedPrice: number;
  delta: number | null;
  deltaPct: number | null;
  guardrailViolations: GuardrailViolation[];
};

type SkuOption = {
  sku: string;
  label: string;
  volumeKg: number;
  actualPrice: number | null;
};

type GuardrailConfig = {
  minMarginPct: number;
  priceCoherenceTolerancePct: number;
  competitiveMinIndex: number;
  competitiveMaxIndex: number;
};

type GuardrailViolation = {
  key: "margin" | "cost" | "coherence" | "competitive";
  label: string;
  detail: string;
};

const STORAGE_KEY = "omni:indice-preco-ideal:v1";

const DEFAULT_GUARDRAILS: GuardrailConfig = {
  minMarginPct: 0.25,
  priceCoherenceTolerancePct: 0.35,
  competitiveMinIndex: 0.85,
  competitiveMaxIndex: 1.35,
};

const DIMENSIONS: Array<{
  key: PriceIndexDimension;
  title: string;
  description: string;
}> = [
  {
    key: "sabor",
    title: "Sabor",
    description: "Quanto cada sabor costuma valer em relação ao sabor de maior volume.",
  },
  {
    key: "faixaPeso",
    title: "Faixa de peso",
    description: "Relação observada entre tamanhos e gramaturas, ponderada pelo volume vendido.",
  },
  {
    key: "formato",
    title: "Formato",
    description: "Índice relativo por formato comercial, calibrado com preço médio real.",
  },
];

function loadStoredConfig(): StoredConfig {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as StoredConfig;
  } catch {
    return {};
  }
}

function valueFor(row: PricingRow, dimension: PriceIndexDimension): string {
  const value = String(row[dimension] ?? "").trim();
  return value || "Sem informação";
}

function referenceByVolume(rows: PricingRow[], dimension: PriceIndexDimension): string | undefined {
  const volumes = new Map<string, number>();
  for (const row of rows) {
    const value = valueFor(row, dimension);
    volumes.set(value, (volumes.get(value) ?? 0) + Math.max(0, row.volumeKg || 0));
  }
  return Array.from(volumes.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
}

function formatIndex(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "sem leitura";
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}x`;
}

function parseDecimal(value: string): number {
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoneyPerKg(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return formatBRL(value, { digits: 2 });
}

function formatDeltaPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${(value * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function formatPctPlain(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${(value * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

function formatSignedPp(value: number): string {
  return `${value >= 0 ? "+" : ""}${(value * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}pp`;
}

function targetGapClass(value: number | null): string {
  if (value === null) return "border-muted-foreground/25 bg-muted/20 text-muted-foreground";
  const abs = Math.abs(value);
  if (abs <= 0.01) return "border-success/35 bg-success/10 text-success";
  if (abs <= 0.03) return "border-warning/35 bg-warning/10 text-warning";
  return "border-destructive/35 bg-destructive/10 text-destructive";
}

function skuKey(row: PricingRow): string {
  return String(row.sku || row.skuDesc || "Sem SKU").trim() || "Sem SKU";
}

function skuName(row: PricingRow): string {
  const sku = String(row.sku || "").trim();
  const desc = String(row.skuDesc || "").trim();
  if (sku && desc && sku !== desc) return `${sku} - ${desc}`;
  return desc || sku || "Sem SKU";
}

function aggregateSkuOptions(rows: PricingRow[]): SkuOption[] {
  const map = new Map<string, { label: string; volumeKg: number; rol: number }>();
  for (const row of rows) {
    const sku = skuKey(row);
    const current = map.get(sku) ?? { label: skuName(row), volumeKg: 0, rol: 0 };
    current.volumeKg += row.volumeKg || 0;
    current.rol += row.rol || 0;
    map.set(sku, current);
  }
  return Array.from(map.entries())
    .map(([sku, value]) => ({
      sku,
      label: value.label,
      volumeKg: value.volumeKg,
      actualPrice: value.volumeKg > 0 ? value.rol / value.volumeKg : null,
    }))
    .sort((a, b) => b.volumeKg - a.volumeKg);
}

function buildEffectiveIndices(
  matrixData: Record<PriceIndexDimension, { calibration: CalibratedPriceIndex[] }>,
  config: StoredConfig,
): PriceIndexValues {
  return Object.fromEntries(
    DIMENSIONS.map((dimension) => {
      const overrides = config[dimension.key]?.manualOverrides ?? {};
      const values = Object.fromEntries(
        matrixData[dimension.key].calibration.map((item) => [
          item.value,
          Number.isFinite(overrides[item.value]) ? overrides[item.value] : item.index ?? 1,
        ]),
      );
      return [dimension.key, values];
    }),
  ) as PriceIndexValues;
}

function buildSkuSuggestions(
  rows: PricingRow[],
  anchorSuggestedPrice: number,
  indices: PriceIndexValues,
): SkuPriceSuggestion[] {
  const groups = new Map<string, PricingRow[]>();
  for (const row of rows) {
    const sku = skuKey(row);
    const bucket = groups.get(sku) ?? [];
    bucket.push(row);
    groups.set(sku, bucket);
  }

  return Array.from(groups.entries())
    .map(([sku, bucket]) => {
      const sample = bucket.reduce((best, row) => (row.volumeKg > best.volumeKg ? row : best), bucket[0]);
      const rol = bucket.reduce((sum, row) => sum + (row.rol || 0), 0);
      const volumeKg = bucket.reduce((sum, row) => sum + (row.volumeKg || 0), 0);
      const margin = bucket.reduce((sum, row) => sum + (row.contribMarginal || 0), 0);
      const totalCost = rol - margin;
      const actualPrice = volumeKg > 0 ? rol / volumeKg : null;
      const costPerKg = volumeKg > 0 ? totalCost / volumeKg : null;
      const suggestedPrice = predictIdealPrice({
        anchorSuggestedPrice,
        sabor: valueFor(sample, "sabor"),
        faixaPeso: valueFor(sample, "faixaPeso"),
        formato: valueFor(sample, "formato"),
        indices,
      });
      const delta = actualPrice !== null ? suggestedPrice - actualPrice : null;
      const suggestedMarginPct = costPerKg !== null && suggestedPrice > 0 ? (suggestedPrice - costPerKg) / suggestedPrice : null;

      return {
        sku,
        name: skuName(sample),
        category: String(sample.categoria || "Sem categoria").trim() || "Sem categoria",
        sabor: valueFor(sample, "sabor"),
        faixaPeso: valueFor(sample, "faixaPeso"),
        formato: valueFor(sample, "formato"),
        volumeKg,
        rol,
        actualPrice,
        costPerKg,
        suggestedMarginPct,
        targetMarginPct: null,
        targetGapPp: null,
        suggestedPrice,
        delta,
        deltaPct: delta !== null && actualPrice > 0 ? delta / actualPrice : null,
        guardrailViolations: [],
      };
    })
    .sort((a, b) => b.volumeKg - a.volumeKg);
}

function buildSkuTargetMap(
  currentRows: PricingRow[],
  historyRows: PricingRow[],
  budgetRows: PricingRow[],
  settings: TargetSettings,
): Map<string, number> {
  const periodOptions = getPeriodOptions(historyRows);
  const categoryTargets = buildCategoryTargets(currentRows, historyRows, budgetRows, settings, periodOptions);
  const targetBySku = new Map<string, number>();

  for (const category of categoryTargets) {
    const premise = resolvePremise(settings, category.key, periodOptions);
    const skuTargets = buildSkuTargetsForCategory({
      categoryRows: rowsForPath(currentRows, category.key),
      categoryTargetPct: category.baseTargetPct ?? category.targetPct,
      preservation: premise.preservation,
      periodOptions,
      recentStart: premise.recentStart,
      recentEnd: premise.recentEnd,
      overrides: settings.categories[category.key]?.skuOverrides,
    });

    for (const skuTarget of skuTargets) {
      targetBySku.set(skuTarget.key, skuTarget.targetPct);
      if (skuTarget.skuCode) targetBySku.set(skuTarget.skuCode, skuTarget.targetPct);
    }
  }

  return targetBySku;
}

function attachTargetMargins(
  rows: SkuPriceSuggestion[],
  targetBySku: Map<string, number>,
): SkuPriceSuggestion[] {
  return rows.map((row) => {
    const targetMarginPct = targetBySku.get(row.sku) ?? targetBySku.get(row.name) ?? null;
    return {
      ...row,
      targetMarginPct,
      targetGapPp: targetMarginPct !== null && row.suggestedMarginPct !== null
        ? row.suggestedMarginPct - targetMarginPct
        : null,
    };
  });
}

function median(values: number[]): number | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function applyGuardrails(
  rows: SkuPriceSuggestion[],
  config: GuardrailConfig,
  anchorSuggestedPrice: number,
): SkuPriceSuggestion[] {
  const categoryMedian = new Map<string, number | null>();
  for (const category of new Set(rows.map((row) => row.category))) {
    categoryMedian.set(category, median(rows.filter((row) => row.category === category).map((row) => row.suggestedPrice)));
  }

  return rows.map((row) => {
    const guardrailViolations: GuardrailViolation[] = [];

    if (row.suggestedMarginPct !== null && row.suggestedMarginPct < config.minMarginPct) {
      guardrailViolations.push({
        key: "margin",
        label: "Margem mínima",
        detail: `margem sugerida ${formatSignedPp(row.suggestedMarginPct - config.minMarginPct)} abaixo do mínimo`,
      });
    }

    if (row.costPerKg !== null && row.suggestedPrice < row.costPerKg) {
      guardrailViolations.push({
        key: "cost",
        label: "Abaixo do custo",
        detail: `${formatMoneyPerKg(row.costPerKg - row.suggestedPrice)} por kg abaixo do custo total`,
      });
    }

    const categoryReference = categoryMedian.get(row.category);
    if (categoryReference && categoryReference > 0) {
      const distance = row.suggestedPrice / categoryReference - 1;
      if (Math.abs(distance) > config.priceCoherenceTolerancePct) {
        guardrailViolations.push({
          key: "coherence",
          label: "Coerência R$/kg",
          detail: `${formatDeltaPct(distance)} vs mediana da categoria`,
        });
      }
    }

    if (anchorSuggestedPrice > 0) {
      const competitiveIndex = row.suggestedPrice / anchorSuggestedPrice;
      if (competitiveIndex < config.competitiveMinIndex || competitiveIndex > config.competitiveMaxIndex) {
        const boundary = competitiveIndex < config.competitiveMinIndex ? config.competitiveMinIndex : config.competitiveMaxIndex;
        guardrailViolations.push({
          key: "competitive",
          label: "Posicionamento competitivo",
          detail: `índice ${formatIndex(competitiveIndex)} fora do limite por ${formatIndex(Math.abs(competitiveIndex - boundary))}`,
        });
      }
    }

    return { ...row, guardrailViolations };
  });
}

function priceIndexFor(indices: PriceIndexValues, dimension: PriceIndexDimension, value: string): number {
  return indices[dimension]?.[value] ?? 1;
}

function buildSuggestedPricesExportRows(
  rows: SkuPriceSuggestion[],
  anchorSku: string,
  indices: PriceIndexValues,
): Record<string, unknown>[] {
  return rows.map((row) => ({
    sku: row.sku,
    descricao: row.name,
    skuAncora: row.sku === anchorSku ? "Sim" : "Não",
    categoria: row.category,
    sabor: row.sabor,
    faixaPeso: row.faixaPeso,
    formato: row.formato,
    indiceSabor: priceIndexFor(indices, "sabor", row.sabor),
    indiceFaixaPeso: priceIndexFor(indices, "faixaPeso", row.faixaPeso),
    indiceFormato: priceIndexFor(indices, "formato", row.formato),
    precoSugerido: row.suggestedPrice,
    precoAtual: row.actualPrice,
    cmSugeridaPct: row.suggestedMarginPct === null ? null : row.suggestedMarginPct * 100,
    margemTargetPct: row.targetMarginPct === null ? null : row.targetMarginPct * 100,
    gapTargetPp: row.targetGapPp === null ? null : row.targetGapPp * 100,
    guardrails: row.guardrailViolations.length
      ? row.guardrailViolations.map((violation) => `${violation.label}: ${violation.detail}`).join(" | ")
      : "OK",
  }));
}

function exportSuggestedPricesCsv(
  rows: SkuPriceSuggestion[],
  anchorSku: string,
  indices: PriceIndexValues,
): void {
  exportTableCsv(
    buildSuggestedPricesExportRows(rows, anchorSku, indices),
    [
      { key: "sku", label: "SKU" },
      { key: "descricao", label: "Descrição" },
      { key: "skuAncora", label: "SKU âncora" },
      { key: "categoria", label: "Categoria" },
      { key: "sabor", label: "Sabor" },
      { key: "faixaPeso", label: "Faixa de peso" },
      { key: "formato", label: "Formato" },
      { key: "indiceSabor", label: "Índice sabor" },
      { key: "indiceFaixaPeso", label: "Índice faixa de peso" },
      { key: "indiceFormato", label: "Índice formato" },
      { key: "precoSugerido", label: "Preço sugerido (R$/kg)" },
      { key: "precoAtual", label: "Preço praticado atual (R$/kg)" },
      { key: "cmSugeridaPct", label: "CM sugerida (%)" },
      { key: "margemTargetPct", label: "Margem target (%)" },
      { key: "gapTargetPp", label: "Gap vs target (p.p.)" },
      { key: "guardrails", label: "Guardrails violados" },
    ],
    `indice_preco_ideal_precos_sugeridos_${new Date().toISOString().slice(0, 10)}`,
  );
}

function summarizeResiduals(residuals: PricePredictionResidual[]): {
  avgAbsResidual: number;
  avgAbsResidualPct: number;
  label: string;
  worst?: PricePredictionResidual;
} {
  const valid = residuals.filter((item) => item.actualPrice !== null && item.volumeKg > 0);
  const totalVolume = valid.reduce((sum, item) => sum + item.volumeKg, 0) || 1;
  const avgAbsResidual = valid.reduce((sum, item) => sum + Math.abs(item.residual ?? 0) * item.volumeKg, 0) / totalVolume;
  const avgAbsResidualPct = valid.reduce((sum, item) => sum + Math.abs(item.residualPct ?? 0) * item.volumeKg, 0) / totalVolume;
  const label = avgAbsResidualPct <= 0.08 ? "Ajuste bom" : avgAbsResidualPct <= 0.18 ? "Ajuste moderado" : "Ajuste sensível";
  return { avgAbsResidual, avgAbsResidualPct, label, worst: valid[0] };
}

function confidenceOf(item: CalibratedPriceIndex, maxVolume: number): {
  label: string;
  className: string;
  progress: number;
} {
  const volumeShare = maxVolume > 0 ? item.volumeKg / maxVolume : 0;
  if (item.skuCount >= 6 || volumeShare >= 0.35) {
    return { label: "Alta confiança", className: "border-success/35 bg-success/10 text-success", progress: 100 };
  }
  if (item.skuCount >= 3 || volumeShare >= 0.15) {
    return { label: "Confiança média", className: "border-warning/35 bg-warning/10 text-warning", progress: 64 };
  }
  return { label: "Amostra pequena", className: "border-muted-foreground/30 bg-muted/30 text-muted-foreground", progress: 32 };
}

function renormalizeOverrides(
  previousOverrides: Record<string, number>,
  oldCalibration: CalibratedPriceIndex[],
  newReferenceValue: string,
): Record<string, number> {
  const newReferenceOldIndex = oldCalibration.find((item) => item.value === newReferenceValue)?.index;
  if (!newReferenceOldIndex || !Number.isFinite(newReferenceOldIndex)) return previousOverrides;
  return Object.fromEntries(
    Object.entries(previousOverrides).map(([value, manualIndex]) => [value, manualIndex / newReferenceOldIndex]),
  );
}

export default function IndicePrecoIdeal() {
  usePageTitle("Índice de Preço Ideal");
  const reportRef = useRef<HTMLElement | null>(null);
  const rows = usePricing((state) => state.rows);
  const filters = usePricing((state) => state.filters);
  const selectedPeriods = usePricing((state) => state.selectedPeriods);
  const budgetRowsRaw = useBudget((state) => state.rows);
  const [config, setConfig] = useState<StoredConfig>(() => loadStoredConfig());
  const [targetSettings, setTargetSettings] = useState<TargetSettings>(() => loadMarginTargetSettings());
  const [anchorSku, setAnchorSku] = useState("");
  const [anchorSkuSearch, setAnchorSkuSearch] = useState("");
  const anchorInitializedRef = useRef(false);
  const [anchorSuggestedPriceInput, setAnchorSuggestedPriceInput] = useState("");
  const [skuSearch, setSkuSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showOnlyViolations, setShowOnlyViolations] = useState(false);
  const [guardrailConfig, setGuardrailConfig] = useState<GuardrailConfig>(DEFAULT_GUARDRAILS);
  const [isExportingImage, setIsExportingImage] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  const scopedRows = useMemo(() => applyFilters(rows, filters, selectedPeriods), [filters, rows, selectedPeriods]);
  const historyRows = useMemo(() => applyFilters(rows, filters, null), [filters, rows]);
  const budgetRows = useMemo(() => budgetRowsAsPricingFiltered(budgetRowsRaw, "budget"), [budgetRowsRaw]);
  const latestBudgetFyNum = useMemo(
    () => budgetRows.reduce((latest, row) => Math.max(latest, row.fyNum || 0), 0),
    [budgetRows],
  );
  const budgetFiscalRows = useMemo(
    () => (latestBudgetFyNum ? budgetRows.filter((row) => row.fyNum === latestBudgetFyNum) : []),
    [budgetRows, latestBudgetFyNum],
  );
  const skuOptions = useMemo(() => aggregateSkuOptions(scopedRows), [scopedRows]);
  const anchorOption = skuOptions.find((option) => option.sku === anchorSku);

  useEffect(() => {
    const refreshTargetSettings = () => setTargetSettings(loadMarginTargetSettings());
    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key === MARGIN_TARGET_STORAGE_KEY) refreshTargetSettings();
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", refreshTargetSettings);
    window.addEventListener("omni:margem-target:changed", refreshTargetSettings);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", refreshTargetSettings);
      window.removeEventListener("omni:margem-target:changed", refreshTargetSettings);
    };
  }, []);

  const matrixData = useMemo(() => {
    return Object.fromEntries(
      DIMENSIONS.map((dimension) => {
        const fallbackReference = referenceByVolume(scopedRows, dimension.key);
        const reference = config[dimension.key]?.referenceValue ?? fallbackReference;
        const calibration = reference ? calibratePriceIndices(scopedRows, dimension.key, reference) : [];
        return [dimension.key, { reference, fallbackReference, calibration }];
      }),
    ) as Record<PriceIndexDimension, {
      reference?: string;
      fallbackReference?: string;
      calibration: CalibratedPriceIndex[];
    }>;
  }, [config, scopedRows]);

  const effectiveIndices = useMemo(() => buildEffectiveIndices(matrixData, config), [config, matrixData]);
  const anchorSuggestedPrice = parseDecimal(anchorSuggestedPriceInput);

  const rawSkuSuggestions = useMemo(
    () => buildSkuSuggestions(scopedRows, anchorSuggestedPrice, effectiveIndices),
    [anchorSuggestedPrice, effectiveIndices, scopedRows],
  );
  const skuSuggestions = useMemo(
    () => applyGuardrails(rawSkuSuggestions, guardrailConfig, anchorSuggestedPrice),
    [anchorSuggestedPrice, guardrailConfig, rawSkuSuggestions],
  );
  const targetBySku = useMemo(
    () => buildSkuTargetMap(scopedRows, historyRows, budgetFiscalRows, targetSettings),
    [budgetFiscalRows, historyRows, scopedRows, targetSettings],
  );
  const skuSuggestionsWithTarget = useMemo(
    () => attachTargetMargins(skuSuggestions, targetBySku),
    [skuSuggestions, targetBySku],
  );
  const guardrailViolationCount = useMemo(
    () => skuSuggestionsWithTarget.filter((item) => item.guardrailViolations.length > 0).length,
    [skuSuggestionsWithTarget],
  );
  const categoryOptions = useMemo(
    () => Array.from(new Set(skuSuggestionsWithTarget.map((item) => item.category))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [skuSuggestionsWithTarget],
  );
  const filteredSuggestionsForExport = useMemo(() => {
    const q = skuSearch.trim().toLowerCase();
    return skuSuggestionsWithTarget
      .filter((item) => categoryFilter === "all" || item.category === categoryFilter)
      .filter((item) => !showOnlyViolations || item.guardrailViolations.length > 0)
      .filter((item) => !q || `${item.sku} ${item.name} ${item.category}`.toLowerCase().includes(q));
  }, [categoryFilter, showOnlyViolations, skuSearch, skuSuggestionsWithTarget]);
  const filteredSuggestions = useMemo(() => filteredSuggestionsForExport.slice(0, 80), [filteredSuggestionsForExport]);
  const exportSuggestions = useMemo(() => {
    if (!anchorSku || filteredSuggestionsForExport.some((item) => item.sku === anchorSku)) return filteredSuggestionsForExport;
    const anchorRow = skuSuggestionsWithTarget.find((item) => item.sku === anchorSku);
    return anchorRow ? [anchorRow, ...filteredSuggestionsForExport] : filteredSuggestionsForExport;
  }, [anchorSku, filteredSuggestionsForExport, skuSuggestionsWithTarget]);

  const residuals = useMemo(
    () => calculatePricePredictionResiduals(scopedRows, {
      anchorSuggestedPrice,
      indices: effectiveIndices,
    }),
    [anchorSuggestedPrice, effectiveIndices, scopedRows],
  );
  const residualSummary = useMemo(() => summarizeResiduals(residuals), [residuals]);
  const targetCoverageCount = useMemo(
    () => skuSuggestionsWithTarget.filter((item) => item.targetMarginPct !== null).length,
    [skuSuggestionsWithTarget],
  );
  const avgTargetGapAbs = useMemo(() => {
    const rowsWithGap = skuSuggestionsWithTarget.filter((item) => item.targetGapPp !== null);
    if (rowsWithGap.length === 0) return null;
    return rowsWithGap.reduce((sum, item) => sum + Math.abs(item.targetGapPp ?? 0), 0) / rowsWithGap.length;
  }, [skuSuggestionsWithTarget]);
  const manualOverrideCount = useMemo(
    () => DIMENSIONS.reduce((sum, dimension) => sum + Object.keys(config[dimension.key]?.manualOverrides ?? {}).length, 0),
    [config],
  );

  const handleExportImage = async () => {
    if (!reportRef.current || isExportingImage) return;
    setIsExportingImage(true);
    try {
      const canvas = await html2canvas(reportRef.current, {
        backgroundColor: "#ffffff",
        logging: false,
        scale: Math.min(2, window.devicePixelRatio || 1.5),
        useCORS: true,
      });
      const link = document.createElement("a");
      link.download = `indice-preco-ideal-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } finally {
      setIsExportingImage(false);
    }
  };

  useEffect(() => {
    setConfig((current) => {
      let changed = false;
      const next: StoredConfig = { ...current };
      for (const dimension of DIMENSIONS) {
        const { fallbackReference, calibration } = matrixData[dimension.key];
        const currentReference = current[dimension.key]?.referenceValue;
        const currentStillExists = Boolean(currentReference && calibration.some((item) => item.value === currentReference));
        if (!currentStillExists && fallbackReference) {
          next[dimension.key] = {
            referenceValue: fallbackReference,
            manualOverrides: current[dimension.key]?.manualOverrides ?? {},
          };
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [matrixData]);

  useEffect(() => {
    if (anchorInitializedRef.current || skuOptions.length === 0) return;
    const first = skuOptions[0];
    anchorInitializedRef.current = true;
    setAnchorSku(first.sku);
    setAnchorSkuSearch(first.sku);
    if (!anchorSuggestedPriceInput && first.actualPrice !== null) {
      setAnchorSuggestedPriceInput(first.actualPrice.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }));
    }
  }, [anchorSuggestedPriceInput, skuOptions]);

  if (rows.length === 0) {
    return (
      <div>
        <Topbar title="Índice de Preço Ideal" subtitle="Calibre preços relativos a partir do histórico real." />
        <main className="p-4 md:p-8">
          <EmptyState
            icon={BarChart3}
            title="Nenhuma base carregada"
            description="Carregue a base Real para calibrar os índices de sabor, faixa de peso e formato."
          />
        </main>
      </div>
    );
  }

  return (
    <div>
      <Topbar
        title="Índice de Preço Ideal"
        subtitle="Matrizes calibradas por preço médio real, prontas para virar premissas de posicionamento."
      />
      <main ref={reportRef} className="space-y-8 p-4 md:p-8">
        <ExecutiveSummary
          skuCount={skuSuggestionsWithTarget.length}
          violationCount={guardrailViolationCount}
          residualSummary={residualSummary}
          avgTargetGapAbs={avgTargetGapAbs}
          targetCoverageCount={targetCoverageCount}
          manualOverrideCount={manualOverrideCount}
          onExportImage={handleExportImage}
          isExportingImage={isExportingImage}
        />

        <GlassCard surface="raised" className="overflow-hidden p-0 shadow-[var(--shadow-elevated)]">
          <div className="grid gap-0 md:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-3 p-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                Evidência primeiro, ajuste humano depois
              </div>
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-foreground">Matrizes de índice já nascem calibradas</h2>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  Cada índice usa ROL dividido por volume, ponderado pela venda real filtrada. Ao sobrescrever uma célula,
                  o valor calculado continua visível para separar leitura histórica de decisão de preço.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 border-t border-border/40 bg-background/30 md:border-l md:border-t-0">
              {DIMENSIONS.map((dimension) => (
                <div key={dimension.key} className="border-r border-border/30 p-4 transition-colors duration-200 hover:bg-background/40 last:border-r-0">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{dimension.title}</p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">
                    {matrixData[dimension.key].calibration.length}
                  </p>
                  <p className="text-xs text-muted-foreground">valores calibrados</p>
                </div>
              ))}
            </div>
          </div>
        </GlassCard>

        <SectionHeader
          eyebrow="Premissas"
          title="Configure a âncora e os limites antes de olhar a recomendação"
          description="A lista de SKUs responde automaticamente a estas decisões, preservando a leitura histórica como evidência."
        />

        <div className="grid gap-5 xl:grid-cols-[0.9fr_1.4fr]">
          <div className="space-y-5">
            <AnchorSetupCard
              skuOptions={skuOptions}
              anchorSku={anchorSku}
              anchorSkuSearch={anchorSkuSearch}
              onAnchorSkuChange={setAnchorSku}
              onAnchorSkuSearchChange={setAnchorSkuSearch}
              anchorSuggestedPriceInput={anchorSuggestedPriceInput}
              onAnchorSuggestedPriceChange={setAnchorSuggestedPriceInput}
              effectiveAnchorPrice={anchorSuggestedPrice}
              anchorOption={anchorOption}
            />
            <GuardrailConfigCard
              config={guardrailConfig}
              onChange={setGuardrailConfig}
              violationCount={guardrailViolationCount}
            />
          </div>
          <SuggestedPricesCard
            rows={filteredSuggestions}
            exportRows={exportSuggestions}
            totalRows={skuSuggestions.length}
            violationCount={guardrailViolationCount}
            anchorSku={anchorSku}
            indices={effectiveIndices}
            showOnlyViolations={showOnlyViolations}
            onShowOnlyViolationsChange={setShowOnlyViolations}
            search={skuSearch}
            onSearchChange={setSkuSearch}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={setCategoryFilter}
            categoryOptions={categoryOptions}
          />
        </div>

        <SectionHeader
          eyebrow="Qualidade"
          title="Confira onde o modelo explica bem a realidade"
          description="Os maiores resíduos mostram combinações onde sabor, peso e formato talvez precisem de leitura comercial adicional."
        />

        <FitQualityCard residuals={residuals.slice(0, 12)} summary={residualSummary} />

        <SectionHeader
          eyebrow="Matrizes"
          title="Ajuste os índices sem perder o rastro da evidência"
          description="Cada matriz nasce calibrada pelo histórico real. Valores manuais ficam destacados e podem voltar ao observado em um clique."
        />

        <div className="grid gap-5 xl:grid-cols-3">
          {DIMENSIONS.map((dimension) => (
            <IndexMatrix
              key={dimension.key}
              title={dimension.title}
              description={dimension.description}
              dimension={dimension.key}
              calibration={matrixData[dimension.key].calibration}
              referenceValue={matrixData[dimension.key].reference}
              manualOverrides={config[dimension.key]?.manualOverrides ?? {}}
              onReferenceChange={(nextReference) => {
                setConfig((current) => {
                  const currentDimension = current[dimension.key] ?? { manualOverrides: {} };
                  return {
                    ...current,
                    [dimension.key]: {
                      referenceValue: nextReference,
                      manualOverrides: renormalizeOverrides(
                        currentDimension.manualOverrides,
                        matrixData[dimension.key].calibration,
                        nextReference,
                      ),
                    },
                  };
                });
              }}
              onOverrideChange={(value, nextIndex) => {
                setConfig((current) => {
                  const currentDimension = current[dimension.key] ?? { manualOverrides: {} };
                  const manualOverrides = { ...currentDimension.manualOverrides };
                  if (nextIndex === null) delete manualOverrides[value];
                  else manualOverrides[value] = nextIndex;
                  return {
                    ...current,
                    [dimension.key]: {
                      referenceValue: currentDimension.referenceValue ?? matrixData[dimension.key].reference,
                      manualOverrides,
                    },
                  };
                });
              }}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-1 pt-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
      <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

function ExecutiveSummary({
  skuCount,
  violationCount,
  residualSummary,
  avgTargetGapAbs,
  targetCoverageCount,
  manualOverrideCount,
  onExportImage,
  isExportingImage,
}: {
  skuCount: number;
  violationCount: number;
  residualSummary: ReturnType<typeof summarizeResiduals>;
  avgTargetGapAbs: number | null;
  targetCoverageCount: number;
  manualOverrideCount: number;
  onExportImage: () => void;
  isExportingImage: boolean;
}) {
  const violationRate = skuCount > 0 ? violationCount / skuCount : 0;
  const attentionTone = violationRate <= 0.08 ? "text-success" : violationRate <= 0.2 ? "text-warning" : "text-destructive";
  const targetCoverage = skuCount > 0 ? targetCoverageCount / skuCount : null;

  return (
    <GlassCard surface="raised" className="overflow-hidden p-0 shadow-[var(--shadow-elevated)]">
      <div className="grid gap-0 xl:grid-cols-[1fr_1.35fr]">
        <div className="space-y-5 border-b border-border/40 p-6 xl:border-b-0 xl:border-r">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Resumo executivo
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2 transition-all duration-200 hover:-translate-y-0.5"
              onClick={onExportImage}
              disabled={isExportingImage}
            >
              <Camera className="h-4 w-4" />
              {isExportingImage ? "Gerando..." : "Exportar PNG"}
            </Button>
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              Índice de preço pronto para decisão
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              O modelo combina preço real, SKU âncora, guardrails comerciais e margem target para separar o que é
              evidência histórica do que precisa de decisão humana antes de ir para a liderança.
            </p>
          </div>
          <div className="rounded-xl border border-border/40 bg-background/35 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Leitura rápida</p>
            <p className="mt-2 text-sm leading-6 text-foreground">
              {formatNum(skuCount, 0)} SKUs analisados, {formatNum(violationCount, 0)} com algum ponto de atenção
              e ajuste do modelo classificado como <span className="font-semibold text-primary">{residualSummary.label.toLowerCase()}</span>.
            </p>
          </div>
        </div>

        <div className="grid gap-0 sm:grid-cols-2 xl:grid-cols-4">
          <ExecutiveMetric
            label="SKUs analisados"
            value={formatNum(skuCount, 0)}
            detail={`${formatPctPlain(targetCoverage)} com target conectado`}
            tone="primary"
          />
          <ExecutiveMetric
            label="Guardrails"
            value={formatNum(violationCount, 0)}
            detail={`${formatPctPlain(violationRate)} do catálogo precisa revisar`}
            tone={attentionTone}
          />
          <ExecutiveMetric
            label="Ajuste do modelo"
            value={residualSummary.label}
            detail={`${formatMoneyPerKg(residualSummary.avgAbsResidual)} por kg de erro médio`}
            tone="warning"
          />
          <ExecutiveMetric
            label="Gap médio vs target"
            value={avgTargetGapAbs === null ? "-" : formatSignedPp(avgTargetGapAbs)}
            detail={`${formatNum(manualOverrideCount, 0)} índices ajustados à mão`}
            tone={avgTargetGapAbs !== null && avgTargetGapAbs <= 0.02 ? "success" : "warning"}
          />
        </div>
      </div>
    </GlassCard>
  );
}

function ExecutiveMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "primary" | "success" | "warning" | "destructive" | string;
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "destructive" || tone === "text-destructive"
          ? "text-destructive"
          : tone === "text-warning"
            ? "text-warning"
            : tone === "text-success"
              ? "text-success"
              : "text-primary";

  return (
    <div className="min-h-[150px] border-b border-r border-border/30 p-5 transition-colors duration-200 hover:bg-background/35 sm:[&:nth-child(even)]:border-r-0 xl:border-b-0 xl:[&:nth-child(even)]:border-r xl:last:border-r-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-3 text-2xl font-semibold tracking-tight", toneClass)}>{value}</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

function AnchorSetupCard({
  skuOptions,
  anchorSku,
  anchorSkuSearch,
  onAnchorSkuChange,
  onAnchorSkuSearchChange,
  anchorSuggestedPriceInput,
  onAnchorSuggestedPriceChange,
  effectiveAnchorPrice,
  anchorOption,
}: {
  skuOptions: SkuOption[];
  anchorSku: string;
  anchorSkuSearch: string;
  onAnchorSkuChange: (value: string) => void;
  onAnchorSkuSearchChange: (value: string) => void;
  anchorSuggestedPriceInput: string;
  onAnchorSuggestedPriceChange: (value: string) => void;
  effectiveAnchorPrice: number;
  anchorOption?: SkuOption;
}) {
  const handleSkuSearchChange = (value: string) => {
    onAnchorSkuSearchChange(value);
    const normalized = value.trim().toLowerCase();

    if (!normalized) {
      onAnchorSkuChange("");
      return;
    }

    const exact = skuOptions.find(
      (option) => option.sku.toLowerCase() === normalized || option.label.toLowerCase() === normalized,
    );

    if (exact) {
      onAnchorSkuChange(exact.sku);
      if (exact.sku !== anchorSku && exact.actualPrice !== null) {
        onAnchorSuggestedPriceChange(
          exact.actualPrice.toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
        );
      }
    }
  };

  return (
    <GlassCard surface="raised" className="space-y-5 transition-all duration-200 hover:shadow-[var(--shadow-elevated)]">
      <div>
        <div className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-medium text-success">
          <Star className="h-3.5 w-3.5" />
          SKU âncora
        </div>
        <h2 className="mt-3 text-lg font-semibold text-foreground">Ponto de partida estratégico</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha o SKU referência e informe diretamente o preço médio sugerido da âncora em R$/kg.
        </p>
      </div>

      <div className="space-y-3">
        <label className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">SKU âncora</span>
          <Input
            list="ideal-price-anchor-skus"
            value={anchorSkuSearch}
            onChange={(event) => handleSkuSearchChange(event.target.value)}
            placeholder="Buscar SKU"
            className="h-10"
          />
          <datalist id="ideal-price-anchor-skus">
            {skuOptions.slice(0, 500).map((option) => (
              <option key={option.sku} value={option.sku}>
                {option.label}
              </option>
            ))}
          </datalist>
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Preço médio sugerido da âncora
          </span>
          <Input
            value={anchorSuggestedPriceInput}
            inputMode="decimal"
            onChange={(event) => onAnchorSuggestedPriceChange(event.target.value)}
            placeholder={anchorOption?.actualPrice ? `${formatMoneyPerKg(anchorOption.actualPrice)} por kg` : "R$/kg"}
            className="h-10 text-right font-semibold"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-border/40 bg-background/35">
        <div className="border-r border-border/35 p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Preço âncora usado</p>
          <p className="mt-1 text-xl font-semibold text-foreground">{formatMoneyPerKg(effectiveAnchorPrice)}</p>
          <p className="text-xs text-muted-foreground">base direta do modelo</p>
        </div>
        <div className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Âncora atual</p>
          <p className="mt-1 truncate text-sm font-semibold text-foreground" title={anchorOption?.label}>
            {anchorSku && anchorOption ? anchorOption.label : "Nenhum SKU selecionado"}
          </p>
          <p className="text-xs text-muted-foreground">{formatNum(anchorOption?.volumeKg ?? 0, 0)} kg no recorte</p>
        </div>
      </div>
    </GlassCard>
  );
}

function GuardrailConfigCard({
  config,
  onChange,
  violationCount,
}: {
  config: GuardrailConfig;
  onChange: (next: GuardrailConfig) => void;
  violationCount: number;
}) {
  const update = (key: keyof GuardrailConfig, value: number) => {
    onChange({ ...config, [key]: Math.max(0, value) });
  };

  return (
    <GlassCard className="space-y-4 transition-all duration-200 hover:shadow-[var(--shadow-elevated)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-xs font-medium text-warning">
            <ShieldCheck className="h-3.5 w-3.5" />
            Guardrails
          </div>
          <h2 className="mt-3 text-lg font-semibold text-foreground">Limites de revisão comercial</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Os limites não corrigem o preço automaticamente. Eles só sinalizam onde o modelo precisa de revisão.
          </p>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "shrink-0",
            violationCount > 0
              ? "border-warning/40 bg-warning/10 text-warning"
              : "border-success/35 bg-success/10 text-success",
          )}
        >
          {violationCount} atenção
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <GuardrailInput
          label="Margem mínima"
          value={config.minMarginPct}
          suffix="%"
          onChange={(value) => update("minMarginPct", parseDecimal(value) / 100)}
          displayValue={(config.minMarginPct * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
        />
        <GuardrailInput
          label="Tolerância R$/kg"
          value={config.priceCoherenceTolerancePct}
          suffix="%"
          onChange={(value) => update("priceCoherenceTolerancePct", parseDecimal(value) / 100)}
          displayValue={(config.priceCoherenceTolerancePct * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
        />
        <GuardrailInput
          label="Pos. mínimo"
          value={config.competitiveMinIndex}
          suffix="x"
          onChange={(value) => update("competitiveMinIndex", parseDecimal(value))}
          displayValue={config.competitiveMinIndex.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        />
        <GuardrailInput
          label="Pos. máximo"
          value={config.competitiveMaxIndex}
          suffix="x"
          onChange={(value) => update("competitiveMaxIndex", parseDecimal(value))}
          displayValue={config.competitiveMaxIndex.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        />
      </div>
    </GlassCard>
  );
}

function GuardrailInput({
  label,
  suffix,
  displayValue,
  onChange,
}: {
  label: string;
  value: number;
  suffix: string;
  displayValue: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="relative">
        <Input
          value={displayValue}
          inputMode="decimal"
          onChange={(event) => onChange(event.target.value)}
          className="h-9 pr-8 text-right text-sm font-semibold"
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {suffix}
        </span>
      </div>
    </label>
  );
}

function SuggestedPricesCard({
  rows,
  exportRows,
  totalRows,
  violationCount,
  anchorSku,
  indices,
  showOnlyViolations,
  onShowOnlyViolationsChange,
  search,
  onSearchChange,
  categoryFilter,
  onCategoryFilterChange,
  categoryOptions,
}: {
  rows: SkuPriceSuggestion[];
  exportRows: SkuPriceSuggestion[];
  totalRows: number;
  violationCount: number;
  anchorSku: string;
  indices: PriceIndexValues;
  showOnlyViolations: boolean;
  onShowOnlyViolationsChange: (value: boolean) => void;
  search: string;
  onSearchChange: (value: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  categoryOptions: string[];
}) {
  return (
    <GlassCard className="flex min-h-[520px] flex-col overflow-hidden p-0 transition-all duration-200 hover:shadow-[var(--shadow-elevated)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 p-5">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Catálogo sugerido</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Preço ideal por SKU</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
            {formatNum(totalRows, 0)} SKUs calculados
          </Badge>
          <Badge
            variant="outline"
            className={cn(
              violationCount > 0
                ? "border-warning/40 bg-warning/10 text-warning"
                : "border-success/35 bg-success/10 text-success",
            )}
          >
            {formatNum(violationCount, 0)} com guardrail
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-2"
            onClick={() => exportSuggestedPricesCsv(exportRows, anchorSku, indices)}
            disabled={exportRows.length === 0}
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
        </div>
      </div>
      <div className="grid gap-3 border-b border-border/30 p-4 lg:grid-cols-[1fr_220px_auto]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar por SKU, descrição ou categoria"
            className="h-10 pl-9"
          />
        </label>
        <Select value={categoryFilter} onValueChange={onCategoryFilterChange}>
          <SelectTrigger className="h-10">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {categoryOptions.map((category) => (
              <SelectItem key={category} value={category}>{category}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant={showOnlyViolations ? "default" : "outline"}
          className="h-10 gap-2"
          onClick={() => onShowOnlyViolationsChange(!showOnlyViolations)}
        >
          <AlertTriangle className="h-4 w-4" />
          Só revisar
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur">
            <tr className="border-b border-border/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-3 py-3 font-medium">Dimensões</th>
              <th className="px-3 py-3 text-right font-medium">Atual</th>
              <th className="px-3 py-3 text-right font-medium">Sugerido</th>
              <th className="px-3 py-3 text-right font-medium">CM sugerida</th>
              <th className="px-3 py-3 text-right font-medium">Target</th>
              <th className="px-3 py-3 text-right font-medium">Gap target</th>
              <th className="px-4 py-3 text-right font-medium">Gap</th>
              <th className="px-4 py-3 font-medium">Guardrail</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.sku} className="border-b border-border/25 transition-colors duration-150 hover:bg-muted/25">
                <td className="max-w-[260px] px-4 py-3">
                  <p className="truncate font-medium text-foreground" title={row.name}>{row.name}</p>
                  <p className="text-xs text-muted-foreground">{row.category} · {formatNum(row.volumeKg, 0)} kg</p>
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground">
                  {row.sabor} · {row.faixaPeso} · {row.formato}
                </td>
                <td className="px-3 py-3 text-right font-medium">{formatMoneyPerKg(row.actualPrice)}</td>
                <td className="px-3 py-3 text-right font-semibold text-primary">{formatMoneyPerKg(row.suggestedPrice)}</td>
                <td className="px-3 py-3 text-right font-semibold">
                  {formatPctPlain(row.suggestedMarginPct)}
                </td>
                <td className="px-3 py-3 text-right">
                  {row.targetMarginPct === null ? (
                    <span className="text-muted-foreground">-</span>
                  ) : (
                    <span className="font-medium">{formatPctPlain(row.targetMarginPct)}</span>
                  )}
                </td>
                <td className="px-3 py-3 text-right">
                  <Badge variant="outline" className={cn("justify-end", targetGapClass(row.targetGapPp))}>
                    {row.targetGapPp === null ? "sem target" : formatSignedPp(row.targetGapPp)}
                  </Badge>
                </td>
                <td className={cn(
                  "px-4 py-3 text-right font-semibold",
                  (row.delta ?? 0) >= 0 ? "text-success" : "text-destructive",
                )}>
                  {row.delta === null ? "-" : `${row.delta >= 0 ? "+" : ""}${formatMoneyPerKg(row.delta)}`}
                  <div className="text-[11px] font-normal text-muted-foreground">{formatDeltaPct(row.deltaPct)}</div>
                </td>
                <td className="min-w-[220px] px-4 py-3">
                  {row.guardrailViolations.length === 0 ? (
                    <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
                      OK
                    </Badge>
                  ) : (
                    <div className="space-y-1.5">
                      {row.guardrailViolations.map((violation) => (
                        <div
                          key={`${row.sku}-${violation.key}`}
                          className="rounded-lg border border-warning/35 bg-warning/10 px-2 py-1.5"
                        >
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-warning">
                            <AlertTriangle className="h-3 w-3" />
                            {violation.label}
                          </div>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{violation.detail}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}

function FitQualityCard({
  residuals,
  summary,
}: {
  residuals: PricePredictionResidual[];
  summary: ReturnType<typeof summarizeResiduals>;
}) {
  const maxResidual = Math.max(1, ...residuals.map((item) => Math.abs(item.residual ?? 0)));
  return (
    <GlassCard className="overflow-hidden p-0 transition-all duration-200 hover:shadow-[var(--shadow-elevated)]">
      <div className="grid gap-0 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-4 border-b border-border/40 p-5 lg:border-b-0 lg:border-r">
          <div className="inline-flex items-center gap-2 rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-xs font-medium text-warning">
            <Gauge className="h-3.5 w-3.5" />
            Qualidade do ajuste
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">{summary.label}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              O erro médio ponderado é de {formatMoneyPerKg(summary.avgAbsResidual)} por kg,
              equivalente a {formatPctPlain(summary.avgAbsResidualPct)} do preço real.
            </p>
          </div>
          {summary.worst && (
            <div className="rounded-xl border border-border/40 bg-background/35 p-4">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Maior desajuste</p>
              <p className="mt-1 font-semibold text-foreground">
                {summary.worst.sabor} · {summary.worst.faixaPeso} · {summary.worst.formato}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Modelo: {formatMoneyPerKg(summary.worst.predictedPrice)} · Real: {formatMoneyPerKg(summary.worst.actualPrice)}
              </p>
            </div>
          )}
        </div>

        <div className="overflow-auto p-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="pb-3 font-medium">Combinação</th>
                <th className="pb-3 text-right font-medium">Previsto</th>
                <th className="pb-3 text-right font-medium">Real</th>
                <th className="pb-3 text-right font-medium">Resíduo</th>
              </tr>
            </thead>
            <tbody>
              {residuals.map((item) => {
                const magnitude = Math.min(100, (Math.abs(item.residual ?? 0) / maxResidual) * 100);
                const negative = (item.residual ?? 0) < 0;
                return (
                  <tr key={`${item.sabor}-${item.faixaPeso}-${item.formato}`} className="border-b border-border/20 transition-colors duration-150 hover:bg-muted/25">
                    <td className="max-w-[320px] py-3 pr-3">
                      <p className="truncate font-medium text-foreground">
                        {item.sabor} · {item.faixaPeso} · {item.formato}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatNum(item.volumeKg, 0)} kg · {item.skuCount} SKUs</p>
                    </td>
                    <td className="px-3 py-3 text-right">{formatMoneyPerKg(item.predictedPrice)}</td>
                    <td className="px-3 py-3 text-right">{formatMoneyPerKg(item.actualPrice)}</td>
                    <td className="min-w-[150px] py-3 pl-3 text-right">
                      <div className={cn("font-semibold", negative ? "text-destructive" : "text-success")}>
                        {item.residual === null ? "-" : `${item.residual >= 0 ? "+" : ""}${formatMoneyPerKg(item.residual)}`}
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div
                          className={cn("h-full rounded-full", negative ? "bg-destructive" : "bg-success")}
                          style={{ width: `${magnitude}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </GlassCard>
  );
}

function IndexMatrix({
  title,
  description,
  dimension,
  calibration,
  referenceValue,
  manualOverrides,
  onReferenceChange,
  onOverrideChange,
}: {
  title: string;
  description: string;
  dimension: PriceIndexDimension;
  calibration: CalibratedPriceIndex[];
  referenceValue?: string;
  manualOverrides: Record<string, number>;
  onReferenceChange: (value: string) => void;
  onOverrideChange: (value: string, nextIndex: number | null) => void;
}) {
  const maxVolume = Math.max(0, ...calibration.map((item) => item.volumeKg));

  return (
    <GlassCard className="flex min-h-[560px] flex-col overflow-hidden p-0 transition-all duration-200 hover:shadow-[var(--shadow-elevated)]">
      <div className="border-b border-border/40 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Matriz</p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">{title}</h3>
          </div>
          <Badge variant="outline" className="border-primary/35 bg-primary/10 text-primary">
            ref. {referenceValue ?? "-"}
          </Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>

      {calibration.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          Sem dados suficientes para calibrar esta matriz nos filtros atuais.
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur">
              <tr className="border-b border-border/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">{title}</th>
                <th className="px-3 py-3 font-medium">Índice</th>
                <th className="px-3 py-3 font-medium">Amostra</th>
                <th className="px-4 py-3 text-right font-medium">Referência</th>
              </tr>
            </thead>
            <tbody>
              {calibration.map((item) => {
                const manualValue = manualOverrides[item.value];
                const hasManual = Number.isFinite(manualValue);
                const effectiveIndex = hasManual ? manualValue : item.index;
                const confidence = confidenceOf(item, maxVolume);
                const isReference = item.value === referenceValue;

                return (
                  <tr
                    key={`${dimension}-${item.value}`}
                    className={cn(
                      "border-b border-border/25 transition-colors duration-150 hover:bg-muted/25",
                      isReference && "bg-primary/5",
                    )}
                  >
                    <td className="max-w-[190px] px-4 py-3">
                      <div className="flex items-center gap-2">
                        {isReference && <Star className="h-3.5 w-3.5 fill-primary text-primary" />}
                        <span className="truncate font-medium text-foreground" title={item.value}>{item.value}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatNum(item.volumeKg, 0)} kg · {item.skuCount} SKUs
                      </p>
                    </td>
                    <td className="min-w-[150px] px-3 py-3">
                      <Input
                        value={effectiveIndex === null ? "" : String(Number(effectiveIndex.toFixed(3))).replace(".", ",")}
                        inputMode="decimal"
                        className={cn(
                          "h-8 text-right text-xs font-semibold transition-all duration-150",
                          hasManual && "border-primary/60 bg-primary/10 text-primary",
                        )}
                        onChange={(event) => {
                          const raw = event.target.value.replace(",", ".").trim();
                          if (!raw) {
                            onOverrideChange(item.value, null);
                            return;
                          }
                          const parsed = Number(raw);
                          if (Number.isFinite(parsed) && parsed > 0) onOverrideChange(item.value, parsed);
                        }}
                      />
                      <div className="mt-1 flex min-h-4 items-center gap-2 text-[11px]">
                        {hasManual ? (
                          <>
                            <Badge variant="outline" className="h-4 border-primary/40 px-1.5 text-[10px] text-primary">
                              Manual
                            </Badge>
                            <span className="text-muted-foreground line-through">{formatIndex(item.index)}</span>
                            <button
                              type="button"
                              className="inline-flex text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                              title="Voltar ao índice observado"
                              onClick={() => onOverrideChange(item.value, null)}
                            >
                              <RotateCcw className="h-3 w-3" />
                            </button>
                          </>
                        ) : (
                          <span className="text-muted-foreground">observado {formatIndex(item.index)}</span>
                        )}
                      </div>
                    </td>
                    <td className="min-w-[140px] px-3 py-3">
                      <Badge variant="outline" className={cn("mb-2 h-5 text-[10px]", confidence.className)}>
                        <BadgeCheck className="mr-1 h-3 w-3" />
                        {confidence.label}
                      </Badge>
                      <Progress value={confidence.progress} className="h-1.5" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant={isReference ? "secondary" : "ghost"}
                        className="h-8 gap-1.5 text-xs transition-all duration-150 hover:-translate-y-0.5"
                        disabled={isReference}
                        onClick={() => onReferenceChange(item.value)}
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                        {isReference ? "Atual" : "Usar"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </GlassCard>
  );
}
