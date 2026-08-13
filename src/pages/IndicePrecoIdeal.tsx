import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRightLeft, BadgeCheck, BarChart3, Gauge, RotateCcw, Search, ShieldCheck, Sparkles, Star } from "lucide-react";
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
import { applyFilters } from "@/lib/analytics";
import { formatBRL, formatNum } from "@/lib/format";
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

function formatSignedPp(value: number): string {
  return `${value >= 0 ? "+" : ""}${(value * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}pp`;
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
  competitorReferencePrice: number,
  anchorPositioningIndex: number,
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
        competitorReferencePrice,
        anchorPositioningIndex,
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
        suggestedPrice,
        delta,
        deltaPct: delta !== null && actualPrice > 0 ? delta / actualPrice : null,
        guardrailViolations: [],
      };
    })
    .sort((a, b) => b.volumeKg - a.volumeKg);
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
  competitorReferencePrice: number,
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

    if (competitorReferencePrice > 0) {
      const competitiveIndex = row.suggestedPrice / competitorReferencePrice;
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
  const rows = usePricing((state) => state.rows);
  const filters = usePricing((state) => state.filters);
  const selectedPeriods = usePricing((state) => state.selectedPeriods);
  const [config, setConfig] = useState<StoredConfig>(() => loadStoredConfig());
  const [anchorSku, setAnchorSku] = useState("");
  const [competitorPrice, setCompetitorPrice] = useState("");
  const [anchorPositioning, setAnchorPositioning] = useState("1,10");
  const [skuSearch, setSkuSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showOnlyViolations, setShowOnlyViolations] = useState(false);
  const [guardrailConfig, setGuardrailConfig] = useState<GuardrailConfig>(DEFAULT_GUARDRAILS);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  const scopedRows = useMemo(() => applyFilters(rows, filters, selectedPeriods), [filters, rows, selectedPeriods]);
  const skuOptions = useMemo(() => aggregateSkuOptions(scopedRows), [scopedRows]);
  const anchorOption = skuOptions.find((option) => option.sku === anchorSku);

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
  const competitorReferencePrice = parseDecimal(competitorPrice) || anchorOption?.actualPrice || 0;
  const anchorPositioningIndex = parseDecimal(anchorPositioning) || 1;

  const rawSkuSuggestions = useMemo(
    () => buildSkuSuggestions(scopedRows, competitorReferencePrice, anchorPositioningIndex, effectiveIndices),
    [anchorPositioningIndex, competitorReferencePrice, effectiveIndices, scopedRows],
  );
  const skuSuggestions = useMemo(
    () => applyGuardrails(rawSkuSuggestions, guardrailConfig, competitorReferencePrice),
    [competitorReferencePrice, guardrailConfig, rawSkuSuggestions],
  );
  const guardrailViolationCount = useMemo(
    () => skuSuggestions.filter((item) => item.guardrailViolations.length > 0).length,
    [skuSuggestions],
  );
  const categoryOptions = useMemo(
    () => Array.from(new Set(skuSuggestions.map((item) => item.category))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [skuSuggestions],
  );
  const filteredSuggestions = useMemo(() => {
    const q = skuSearch.trim().toLowerCase();
    return skuSuggestions
      .filter((item) => categoryFilter === "all" || item.category === categoryFilter)
      .filter((item) => !showOnlyViolations || item.guardrailViolations.length > 0)
      .filter((item) => !q || `${item.sku} ${item.name} ${item.category}`.toLowerCase().includes(q))
      .slice(0, 80);
  }, [categoryFilter, showOnlyViolations, skuSearch, skuSuggestions]);

  const residuals = useMemo(
    () => calculatePricePredictionResiduals(scopedRows, {
      competitorReferencePrice,
      anchorPositioningIndex,
      indices: effectiveIndices,
    }),
    [anchorPositioningIndex, competitorReferencePrice, effectiveIndices, scopedRows],
  );
  const residualSummary = useMemo(() => summarizeResiduals(residuals), [residuals]);

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
    if (anchorSku && skuOptions.some((option) => option.sku === anchorSku)) return;
    setAnchorSku(skuOptions[0]?.sku ?? "");
  }, [anchorSku, skuOptions]);

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
      <main className="space-y-6 p-4 md:p-8">
        <GlassCard surface="raised" className="overflow-hidden p-0">
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
                <div key={dimension.key} className="border-r border-border/30 p-4 last:border-r-0">
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

        <div className="grid gap-5 xl:grid-cols-[0.9fr_1.4fr]">
          <div className="space-y-5">
            <AnchorSetupCard
              skuOptions={skuOptions}
              anchorSku={anchorSku}
              onAnchorSkuChange={setAnchorSku}
              competitorPrice={competitorPrice}
              onCompetitorPriceChange={setCompetitorPrice}
              anchorPositioning={anchorPositioning}
              onAnchorPositioningChange={setAnchorPositioning}
              effectiveCompetitorPrice={competitorReferencePrice}
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
            totalRows={skuSuggestions.length}
            violationCount={guardrailViolationCount}
            showOnlyViolations={showOnlyViolations}
            onShowOnlyViolationsChange={setShowOnlyViolations}
            search={skuSearch}
            onSearchChange={setSkuSearch}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={setCategoryFilter}
            categoryOptions={categoryOptions}
          />
        </div>

        <FitQualityCard residuals={residuals.slice(0, 12)} summary={residualSummary} />

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

function AnchorSetupCard({
  skuOptions,
  anchorSku,
  onAnchorSkuChange,
  competitorPrice,
  onCompetitorPriceChange,
  anchorPositioning,
  onAnchorPositioningChange,
  effectiveCompetitorPrice,
  anchorOption,
}: {
  skuOptions: SkuOption[];
  anchorSku: string;
  onAnchorSkuChange: (value: string) => void;
  competitorPrice: string;
  onCompetitorPriceChange: (value: string) => void;
  anchorPositioning: string;
  onAnchorPositioningChange: (value: string) => void;
  effectiveCompetitorPrice: number;
  anchorOption?: SkuOption;
}) {
  return (
    <GlassCard surface="raised" className="space-y-5">
      <div>
        <div className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-medium text-success">
          <Star className="h-3.5 w-3.5" />
          SKU âncora
        </div>
        <h2 className="mt-3 text-lg font-semibold text-foreground">Ponto de partida estratégico</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha um SKU referência, informe o preço do concorrente e defina o posicionamento desejado da âncora.
        </p>
      </div>

      <div className="space-y-3">
        <label className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">SKU âncora</span>
          <Input
            list="ideal-price-anchor-skus"
            value={anchorSku}
            onChange={(event) => onAnchorSkuChange(event.target.value)}
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

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Preço concorrente</span>
            <Input
              value={competitorPrice}
              inputMode="decimal"
              onChange={(event) => onCompetitorPriceChange(event.target.value)}
              placeholder={anchorOption?.actualPrice ? formatMoneyPerKg(anchorOption.actualPrice) : "R$/kg"}
              className="h-10 text-right font-semibold"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Posicionamento</span>
            <Input
              value={anchorPositioning}
              inputMode="decimal"
              onChange={(event) => onAnchorPositioningChange(event.target.value)}
              className="h-10 text-right font-semibold"
            />
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-border/40 bg-background/35">
        <div className="border-r border-border/35 p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Preço usado</p>
          <p className="mt-1 text-xl font-semibold text-foreground">{formatMoneyPerKg(effectiveCompetitorPrice)}</p>
          <p className="text-xs text-muted-foreground">referência concorrente</p>
        </div>
        <div className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Âncora atual</p>
          <p className="mt-1 truncate text-sm font-semibold text-foreground" title={anchorOption?.label}>
            {anchorOption?.label ?? "Sem SKU"}
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
    <GlassCard className="space-y-4">
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
  totalRows,
  violationCount,
  showOnlyViolations,
  onShowOnlyViolationsChange,
  search,
  onSearchChange,
  categoryFilter,
  onCategoryFilterChange,
  categoryOptions,
}: {
  rows: SkuPriceSuggestion[];
  totalRows: number;
  violationCount: number;
  showOnlyViolations: boolean;
  onShowOnlyViolationsChange: (value: boolean) => void;
  search: string;
  onSearchChange: (value: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  categoryOptions: string[];
}) {
  return (
    <GlassCard className="flex min-h-[430px] flex-col p-0">
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
              <th className="px-4 py-3 text-right font-medium">Gap</th>
              <th className="px-4 py-3 font-medium">Guardrail</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.sku} className="border-b border-border/25 hover:bg-muted/25">
                <td className="max-w-[260px] px-4 py-3">
                  <p className="truncate font-medium text-foreground" title={row.name}>{row.name}</p>
                  <p className="text-xs text-muted-foreground">{row.category} · {formatNum(row.volumeKg, 0)} kg</p>
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground">
                  {row.sabor} · {row.faixaPeso} · {row.formato}
                </td>
                <td className="px-3 py-3 text-right font-medium">{formatMoneyPerKg(row.actualPrice)}</td>
                <td className="px-3 py-3 text-right font-semibold text-primary">{formatMoneyPerKg(row.suggestedPrice)}</td>
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
    <GlassCard className="p-0">
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
              equivalente a {formatDeltaPct(summary.avgAbsResidualPct).replace("+", "")} do preço real.
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
                  <tr key={`${item.sabor}-${item.faixaPeso}-${item.formato}`} className="border-b border-border/20">
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
    <GlassCard className="flex min-h-[560px] flex-col p-0">
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
                      "border-b border-border/25 transition-colors hover:bg-muted/25",
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
                          "h-8 text-right text-xs font-semibold",
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
                        className="h-8 gap-1.5 text-xs"
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
