// Inovação · os seis visuais enviáveis da aba. O mesmo desenho na aba e no
// slide (a aba põe o título, o selo e o cartão em volta).
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBRL, formatPct, formatTon } from "@/lib/format";
import {
  formatPp,
  INOV_PALETTE as PALETTE,
  type ChannelMixMonthlyData,
  type InnovationHeroesData,
  type InnovationMarginData,
  type InnovationMixData,
  type InnovationMixPoint,
  type InnovationPriceData,
  type MarginBridgeStep,
  type MaturityData,
} from "./inovacaoData";
import type { TabVisualVariant } from "./visualTheme";

const tick = (variant: TabVisualVariant) => ({ fill: "hsl(var(--muted-foreground))", fontSize: variant === "slide" ? 13 : 11 });
const legendStyle = (variant: TabVisualVariant) => ({ fontSize: variant === "slide" ? 13 : 11 });

// ---- Participação mensal de volume ----
export function InovMixVisual({ data, variant }: { data: InnovationMixData; variant: TabVisualVariant }) {
  const { trend } = data;
  const animate = variant === "tab";
  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="mb-4 text-xs text-muted-foreground">
        Mix de inovação saiu de <span className="font-semibold text-foreground">{trend.first.toFixed(1)}%</span> para{" "}
        <span className="font-semibold text-foreground">{trend.last.toFixed(1)}%</span>
        {trend.months > 1 && <>{" "}no período analisado ({formatPp(trend.deltaPp)}).</>}
      </p>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.monthlyMix} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
            <CartesianGrid stroke="hsl(var(--border) / 0.4)" strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={tick(variant)} />
            <YAxis tick={tick(variant)} tickFormatter={(value) => `${Number(value).toFixed(0)}%`} domain={[0, 100]} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="rounded-lg border border-border/60 bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
                    <div className="mb-1 font-semibold">{label}</div>
                    {payload.map((entry) => {
                      const name = entry.dataKey === "innovation" ? "Inovação" : "Regular";
                      const point = entry.payload as InnovationMixPoint;
                      const volume = entry.dataKey === "innovation" ? point.innovationVolumeKg : point.regularVolumeKg;
                      return (
                        <div key={String(entry.dataKey)} className="flex items-center justify-between gap-4">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: entry.color }} />
                            {name}
                          </span>
                          <span className="tabular-nums text-foreground">
                            {Number(entry.value).toFixed(1)}% · {formatTon(volume / 1000)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={legendStyle(variant)} />
            <Bar name="Inovação" dataKey="innovation" stackId="volumeMix" fill={PALETTE[0]} fillOpacity={0.9} isAnimationActive={animate}>
              <LabelList
                dataKey="innovation"
                position="inside"
                formatter={(v: number) => (v >= 6 ? `${v.toFixed(0)}%` : "")}
                fill="hsl(var(--background))"
                fontSize={11}
                fontWeight={600}
              />
            </Bar>
            <Bar name="Regular" dataKey="regular" stackId="volumeMix" fill={PALETTE[1]} fillOpacity={0.55} isAnimationActive={animate}>
              <LabelList
                dataKey="regular"
                position="inside"
                formatter={(v: number) => (v >= 6 ? `${v.toFixed(0)}%` : "")}
                fill="hsl(var(--background))"
                fontSize={11}
                fontWeight={600}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---- Margem Inovação vs Regular ----
function MarginBridge({ steps }: { steps: MarginBridgeStep[] }) {
  const values = steps.flatMap((step) => [step.start, step.end, 0]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = Math.max(1, range * 0.16);
  const yMin = min - pad;
  const yMax = max + pad;
  const W = 900;
  const H = 260;
  const padL = 56;
  const padR = 28;
  const padT = 28;
  const padB = 58;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const xStep = innerW / steps.length;
  const barW = xStep * 0.52;
  const yOf = (value: number) => padT + (1 - (value - yMin) / (yMax - yMin || 1)) * innerH;
  const zeroY = yOf(0);
  const ticks = [yMin, yMin + (yMax - yMin) / 2, yMax];

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Bridge de margem de inovação">
        {ticks.map((t, index) => (
          <g key={index}>
            <line
              x1={padL}
              x2={W - padR}
              y1={yOf(t)}
              y2={yOf(t)}
              stroke="hsl(var(--border))"
              strokeOpacity={0.32}
              strokeDasharray={Math.abs(t) < 0.001 ? "" : "3 4"}
            />
            <text x={padL - 8} y={yOf(t) + 4} textAnchor="end" fontSize="10" fill="hsl(var(--muted-foreground))">
              {t.toFixed(1)}%
            </text>
          </g>
        ))}
        {steps.slice(0, -1).map((step, index) => {
          const next = steps[index + 1];
          if (next.total) return null;
          const x1 = padL + index * xStep + xStep / 2 + barW / 2;
          const x2 = padL + (index + 1) * xStep + xStep / 2 - barW / 2;
          return (
            <line
              key={`connector-${step.label}`}
              x1={x1}
              x2={x2}
              y1={yOf(step.end)}
              y2={yOf(next.start)}
              stroke="hsl(var(--muted-foreground))"
              strokeOpacity={0.38}
              strokeDasharray="3 3"
            />
          );
        })}
        {steps.map((step, index) => {
          const x = padL + index * xStep + (xStep - barW) / 2;
          const top = yOf(Math.max(step.start, step.end));
          const height = Math.max(3, Math.abs(yOf(step.end) - yOf(step.start)));
          const rectY = step.total ? Math.min(zeroY, yOf(step.end)) : top;
          const rectH = step.total ? Math.max(3, Math.abs(yOf(step.end) - zeroY)) : height;
          const labelY = H - padB + 20;
          return (
            <g key={step.label}>
              <rect x={x} y={rectY} width={barW} height={rectH} rx={5} fill={step.color} opacity={step.total ? 0.92 : 0.82} />
              <text x={x + barW / 2} y={rectY - 8} textAnchor="middle" fontSize="11" fontWeight={700} fill="hsl(var(--foreground))">
                {step.total ? `${step.end.toFixed(1)}%` : formatPp(step.value)}
              </text>
              <text x={x + barW / 2} y={labelY} textAnchor="middle" fontSize="11" fill="hsl(var(--muted-foreground))">
                {step.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function InovMargemVisual({ data }: { data: InnovationMarginData }) {
  const d = data;
  return (
    <div>
      <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-border/50 bg-secondary/30 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Inovação</p>
          <p className="mt-2 text-2xl font-semibold">{formatPct(d.innovationMarginPct)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{formatPct(d.innovationRolShare)} do ROL filtrado</p>
        </div>
        <div className="rounded-xl border border-border/50 bg-secondary/30 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Regular</p>
          <p className="mt-2 text-2xl font-semibold">{formatPct(d.regularMarginPct)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{formatPct(1 - d.innovationRolShare)} do ROL filtrado</p>
        </div>
        <div className="rounded-xl border border-border/50 bg-secondary/30 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Prêmio de margem</p>
          <p className={`mt-2 text-2xl font-semibold ${d.marginDiffPp >= 0 ? "text-success" : "text-destructive"}`}>
            {formatPp(d.marginDiffPp)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Diferença Inovação - Regular</p>
        </div>
      </div>
      <MarginBridge steps={d.steps} />
      <p className="mt-3 text-xs text-muted-foreground">
        Leitura: se os SKUs de inovação tivessem a margem da linha Regular, a margem consolidada partiria de{" "}
        <span className="font-semibold text-foreground">{formatPct(d.regularMarginPct)}</span>. O mix de inovação adiciona{" "}
        <span className={d.innovationMixEffectPp >= 0 ? "font-semibold text-success" : "font-semibold text-destructive"}>{formatPp(d.innovationMixEffectPp)}</span>{" "}
        e leva o total para <span className="font-semibold text-foreground">{formatPct(d.totalMarginPct)}</span>.
      </p>
    </div>
  );
}

// ---- Curva de maturação por safra ----
export function InovMaturidadeVisual({ data, variant }: { data: MaturityData; variant: TabVisualVariant }) {
  if (data.cohorts.length < 2) {
    return (
      <div className="flex h-full min-h-[260px] items-center justify-center rounded-xl border border-dashed border-border/60 bg-secondary/20 px-6 text-center">
        <div>
          <p className="text-sm font-medium">Dados insuficientes para comparar safras</p>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            A curva aparece quando pelo menos duas safras de inovação têm volume no recorte atual.
          </p>
        </div>
      </div>
    );
  }
  const animate = variant === "tab";
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.data} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
            <CartesianGrid stroke="hsl(var(--border) / 0.4)" strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={tick(variant)} />
            <YAxis tick={tick(variant)} tickFormatter={(value) => formatTon(Number(value))} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="rounded-lg border border-border/60 bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
                    <div className="mb-1 font-semibold">{label}</div>
                    {payload.map((entry) => (
                      <div key={String(entry.dataKey)} className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: entry.color }} />
                          Safra {String(entry.dataKey)}
                        </span>
                        <span className="tabular-nums text-foreground">{formatTon(Number(entry.value))}</span>
                      </div>
                    ))}
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={legendStyle(variant)} formatter={(value) => `Safra ${value}`} />
            {data.cohorts.map((cohort, index) => (
              <Line
                key={cohort.safra}
                type="monotone"
                name={cohort.safra}
                dataKey={cohort.safra}
                stroke={PALETTE[index % PALETTE.length]}
                strokeWidth={2.5}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                connectNulls={false}
                isAnimationActive={animate}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Cada linha usa o primeiro mês vendido do SKU como M+1. Safras recentes podem parar antes das demais por ainda não terem meses suficientes.
      </p>
    </div>
  );
}

// ---- Heróis e ofensores de inovação ----
function HeroList({ items, tone, empty }: { items: InnovationHeroesData["heroes"]; tone: "success" | "destructive"; empty: string }) {
  return (
    <div className="space-y-2">
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        items.map((item) => (
          <div key={item.sku} className="rounded-lg border border-border/50 bg-background/40 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.label}</p>
                <p className="text-[11px] text-muted-foreground">{item.sku}</p>
              </div>
              <span className={`shrink-0 text-sm font-semibold ${tone === "success" ? "text-success" : "text-destructive"}`}>
                {formatTon(item.volumeDeltaKg / 1000)}
              </span>
            </div>
            <div className="mt-2 flex justify-between gap-3 text-[11px] text-muted-foreground">
              <span>Volume atual {formatTon(item.volumeKg / 1000)}</span>
              <span>{formatPp(item.margemDeltaPp * 100)} margem</span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/** `hideIntro`: a aba já mostra a frase no cabeçalho do cartão. */
export function InovHeroisVisual({ data, hideIntro }: { data: InnovationHeroesData; hideIntro?: boolean }) {
  return (
    <div>
      {!hideIntro && (
        <p className="mb-4 text-xs text-muted-foreground">
          Maiores altas e quedas entre SKUs de inovação ({data.comparisonLabel}).
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-success/25 bg-success/5 p-4">
          <h3 className="mb-3 text-sm font-medium text-success">Heróis</h3>
          <HeroList items={data.heroes} tone="success" empty="Sem altas relevantes no recorte." />
        </div>
        <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-4">
          <h3 className="mb-3 text-sm font-medium text-destructive">Ofensores</h3>
          <HeroList items={data.offenders} tone="destructive" empty="Sem quedas relevantes no recorte." />
        </div>
      </div>
    </div>
  );
}

// ---- Preço médio Inovação vs Regular ----
export function InovPrecoVisual({ data, variant }: { data: InnovationPriceData; variant: TabVisualVariant }) {
  const animate = variant === "tab";
  return (
    <div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="grid grid-cols-1 gap-3">
          <div className="rounded-xl border border-border/50 bg-secondary/30 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Inovação</p>
            <p className="mt-2 text-2xl font-semibold">{formatBRL(data.innovationPrice, { digits: 2 })}/kg</p>
          </div>
          <div className="rounded-xl border border-border/50 bg-secondary/30 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Regular</p>
            <p className="mt-2 text-2xl font-semibold">{formatBRL(data.regularPrice, { digits: 2 })}/kg</p>
          </div>
        </div>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.monthly} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
              <CartesianGrid stroke="hsl(var(--border) / 0.4)" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={tick(variant)} />
              <YAxis tick={tick(variant)} tickFormatter={(value) => formatBRL(Number(value), { digits: 2 })} />
              <Tooltip
                formatter={(value, name) => [
                  value == null ? "—" : `${formatBRL(Number(value), { digits: 2 })}/kg`,
                  name === "innovationPrice" ? "Inovação" : "Regular",
                ]}
              />
              <Legend wrapperStyle={legendStyle(variant)} formatter={(value) => (value === "innovationPrice" ? "Inovação" : "Regular")} />
              <Line type="monotone" name="innovationPrice" dataKey="innovationPrice" stroke={PALETTE[0]} strokeWidth={2.5} dot={{ r: 3 }} connectNulls isAnimationActive={animate} />
              <Line type="monotone" name="regularPrice" dataKey="regularPrice" stroke={PALETTE[1]} strokeWidth={2.5} dot={{ r: 3 }} connectNulls isAnimationActive={animate} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Diferença relativa: {formatPct(data.deltaPct)} vs. Regular (média do período filtrado).
      </p>
    </div>
  );
}

// ---- Mix de inovação por canal ----
export function InovCanalMixVisual({ data, variant }: { data: ChannelMixMonthlyData; variant: TabVisualVariant }) {
  if (data.canais.length === 0) {
    return (
      <div className="flex h-full min-h-[220px] items-center justify-center rounded-xl border border-dashed border-border/60 bg-secondary/20 px-6 text-center">
        <p className="text-sm text-muted-foreground">Sem canais com volume no recorte atual.</p>
      </div>
    );
  }
  const animate = variant === "tab";
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data.data} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
        <CartesianGrid stroke="hsl(var(--border) / 0.35)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={tick(variant)} />
        <YAxis domain={[0, 1]} tickFormatter={(value) => `${(Number(value) * 100).toFixed(0)}%`} tick={tick(variant)} />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return (
              <div className="rounded-lg border border-border/60 bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
                <div className="mb-1 font-semibold">{label}</div>
                <div className="space-y-1">
                  {payload.map((entry) => (
                    <div key={String(entry.dataKey)} className="flex items-center justify-between gap-4">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="inline-block h-2 w-2 rounded-sm" style={{ background: entry.color }} />
                        {String(entry.dataKey)}
                      </span>
                      <span className="tabular-nums text-foreground">
                        {entry.value == null ? "—" : formatPct(Number(entry.value))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          }}
        />
        <Legend wrapperStyle={legendStyle(variant)} />
        {data.canais.map((canal, index) => (
          <Bar key={canal} name={canal} dataKey={canal} fill={PALETTE[index % PALETTE.length]} radius={[3, 3, 0, 0]} isAnimationActive={animate} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
