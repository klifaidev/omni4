import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import { formatBRL, formatPct } from "@/lib/format";
import type { PricingRow, Metric } from "@/lib/types";

interface Props {
  rows: PricingRow[];
  metric: Metric;
}

interface SkuAgg {
  key: string;
  rol: number;
  volumeKg: number;
  custoVariavel: number;
  margem: number; // metric-aware (cm or mb)
}

export function PricingSimulator({ rows, metric }: Props) {
  const [open, setOpen] = useState(false);
  const [skuKey, setSkuKey] = useState<string | null>(null);
  const [dPrice, setDPrice] = useState(0); // %
  const [dCost, setDCost] = useState(0);
  const [dVol, setDVol] = useState(0);

  const skuMap = useMemo(() => {
    const m = new Map<string, SkuAgg>();
    for (const r of rows) {
      const key = r.skuDesc || r.sku || "—";
      const cur = m.get(key) ?? { key, rol: 0, volumeKg: 0, custoVariavel: 0, margem: 0 };
      cur.rol += r.rol;
      cur.volumeKg += r.volumeKg;
      cur.custoVariavel += r.custoVariavel;
      cur.margem += metric === "cm" ? r.contribMarginal : r.margemBruta;
      m.set(key, cur);
    }
    return m;
  }, [rows, metric]);

  const skuList = useMemo(
    () => Array.from(skuMap.values()).sort((a, b) => b.rol - a.rol),
    [skuMap],
  );

  const totalMargem = useMemo(
    () => Array.from(skuMap.values()).reduce((s, r) => s + r.margem, 0),
    [skuMap],
  );

  const selected = skuKey ? skuMap.get(skuKey) ?? null : null;

  const sim = useMemo(() => {
    if (!selected) return null;
    const { rol, volumeKg, custoVariavel, margem } = selected;
    if (volumeKg <= 0 || rol <= 0) return null;
    const precoUnit = rol / volumeKg;
    const custoUnit = custoVariavel / volumeKg;
    const novoPreco = precoUnit * (1 + dPrice / 100);
    const novoCustoUnit = custoUnit * (1 + dCost / 100);
    const novoVolume = volumeKg * (1 + dVol / 100);
    const novoROL = novoPreco * novoVolume;
    const novoCustoTotal = novoCustoUnit * novoVolume;
    const deltaROL = novoROL - rol;
    const deltaCusto = novoCustoTotal - custoVariavel;
    const novoMargem = margem + deltaROL - deltaCusto;
    const novaMargemPct = novoROL > 0 ? novoMargem / novoROL : 0;
    const delta = novoMargem - margem;
    const impactoTotal = totalMargem !== 0 ? (delta / totalMargem) : 0;
    return {
      baseline: margem,
      simulated: novoMargem,
      delta,
      novoPreco,
      novaMargemPct,
      impactoTotal,
      novoROL,
    };
  }, [selected, dPrice, dCost, dVol, totalMargem]);

  const reset = () => {
    setDPrice(0);
    setDCost(0);
    setDVol(0);
  };

  const chartData = sim
    ? [
        { name: "CM atual", value: sim.baseline, fill: "hsl(var(--muted-foreground))" },
        {
          name: "CM simulada",
          value: sim.simulated,
          fill: sim.delta >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))",
        },
      ]
    : [];

  const metricLabel = metric === "cm" ? "CM" : "MB";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr,1.1fr]">
      {/* Controles */}
      <div className="space-y-5">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">SKU</label>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-full justify-between font-normal"
              >
                <span className="truncate">{skuKey ?? "Selecione um SKU..."}</span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command>
                <CommandInput placeholder="Buscar SKU..." />
                <CommandList>
                  <CommandEmpty>Nenhum SKU encontrado.</CommandEmpty>
                  <CommandGroup>
                    {skuList.slice(0, 200).map((s) => (
                      <CommandItem
                        key={s.key}
                        value={s.key}
                        onSelect={() => {
                          setSkuKey(s.key);
                          setOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            skuKey === s.key ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <span className="truncate">{s.key}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <SliderField
          label="Ajuste de preço"
          value={dPrice}
          onChange={setDPrice}
          min={-20}
          max={20}
          step={0.5}
        />
        <SliderField
          label="Ajuste de custo variável"
          value={dCost}
          onChange={setDCost}
          min={-20}
          max={20}
          step={0.5}
        />
        <SliderField
          label="Ajuste de volume"
          value={dVol}
          onChange={setDVol}
          min={-30}
          max={30}
          step={0.5}
        />

        <Button variant="outline" size="sm" className="gap-2" onClick={reset}>
          <RotateCcw className="h-4 w-4" />
          Limpar simulação
        </Button>
      </div>

      {/* Resultado */}
      <div className="rounded-xl border border-border/40 bg-card/40 p-5">
        {!selected || !sim ? (
          <div className="flex h-full min-h-[280px] items-center justify-center text-sm text-muted-foreground">
            Selecione um SKU para iniciar a simulação.
          </div>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label={`${metricLabel} atual`} value={formatBRL(sim.baseline, { compact: true })} />
              <Stat
                label={`${metricLabel} simulada`}
                value={formatBRL(sim.simulated, { compact: true })}
                badge={
                  <Badge
                    variant="secondary"
                    className={cn(
                      "text-[10px] font-semibold",
                      sim.delta >= 0
                        ? "bg-success/15 text-success border border-success/30"
                        : "bg-destructive/15 text-destructive border border-destructive/30",
                    )}
                  >
                    {sim.delta >= 0 ? "+" : ""}
                    {formatBRL(sim.delta, { compact: true })}
                  </Badge>
                }
              />
              <Stat
                label="Impacto no portfólio"
                value={`${sim.delta >= 0 ? "+" : ""}${formatBRL(sim.delta, { compact: true })}`}
                hint={`${sim.impactoTotal >= 0 ? "+" : ""}${formatPct(sim.impactoTotal)} do total`}
              />
              <Stat label="Novo preço médio" value={`${formatBRL(sim.novoPreco, { digits: 2 })}/kg`} />
              <Stat label="Nova margem %" value={formatPct(sim.novaMargemPct)} />
              <Stat label="Novo ROL" value={formatBRL(sim.novoROL, { compact: true })} />
            </div>

            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                  <CartesianGrid stroke="hsl(var(--border) / 0.4)" strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <YAxis
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    tickFormatter={(v) => formatBRL(Number(v), { compact: true })}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover) / 0.95)",
                      border: "1px solid hsl(var(--border) / 0.6)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => [formatBRL(v, { compact: true }), metricLabel]}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {chartData.map((d, i) => (
                      <Cell key={i} fill={d.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <span
          className={cn(
            "text-xs font-semibold tabular-nums",
            value > 0 ? "text-success" : value < 0 ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {value > 0 ? "+" : ""}
          {value.toFixed(1)}%
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
      />
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{min}%</span>
        <span>0%</span>
        <span>+{max}%</span>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  badge,
  hint,
}: {
  label: string;
  value: string;
  badge?: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border/30 bg-background/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <div className="text-sm font-semibold tabular-nums">{value}</div>
        {badge}
      </div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
