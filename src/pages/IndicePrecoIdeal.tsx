import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, BadgeCheck, BarChart3, RotateCcw, Sparkles, Star } from "lucide-react";
import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { EmptyState } from "@/components/pricing/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { usePageTitle } from "@/hooks/use-page-title";
import { usePricing } from "@/store/pricing";
import { applyFilters } from "@/lib/analytics";
import { formatNum } from "@/lib/format";
import {
  calibratePriceIndices,
  type CalibratedPriceIndex,
  type PriceIndexDimension,
} from "@/lib/priceIndexModel";
import type { PricingRow } from "@/lib/types";
import { cn } from "@/lib/utils";

type MatrixConfig = {
  referenceValue?: string;
  manualOverrides: Record<string, number>;
};

type StoredConfig = Partial<Record<PriceIndexDimension, MatrixConfig>>;

const STORAGE_KEY = "omni:indice-preco-ideal:v1";

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

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  const scopedRows = useMemo(() => applyFilters(rows, filters, selectedPeriods), [filters, rows, selectedPeriods]);

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
