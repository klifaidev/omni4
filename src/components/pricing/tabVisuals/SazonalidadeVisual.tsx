// Visão Geral · Sazonalidade — Margem % por mês × ano fiscal.
// O mesmo desenho na aba e no slide.
import { formatPct } from "@/lib/format";
import { FY_MONTH_ORDER, MES_NOMES, type SazonalidadeData } from "./visaoGeralData";
import type { TabVisualVariant } from "./visualTheme";

function heatColor(v: number | null, min: number, max: number): { bg: string; color: string } {
  if (v === null) return { bg: "hsl(var(--muted) / 0.4)", color: "hsl(var(--muted-foreground))" };
  const range = max - min;
  const t = range > 0 ? (v - min) / range : 0.5;
  // Matiz 0 (vermelho) → 158 (verde); saturação 84→64; luz 65→52.
  const h = 158 * t;
  const s = 84 + (64 - 84) * t;
  const l = 65 + (52 - 65) * t;
  return {
    bg: `hsl(${h.toFixed(0)} ${s.toFixed(0)}% ${l.toFixed(0)}%)`,
    // Texto branco quando a cor de fundo é escura.
    color: l < 58 ? "hsl(0 0% 100%)" : "hsl(220 30% 12%)",
  };
}

export function SazonalidadeVisual({ data, variant }: { data: SazonalidadeData; variant: TabVisualVariant }) {
  return (
    <>
      <div className={variant === "tab" ? "overflow-x-auto" : undefined}>
        <div
          className="grid min-w-[640px] gap-1"
          style={{ gridTemplateColumns: `90px repeat(12, minmax(48px, 1fr))` }}
        >
          <div />
          {FY_MONTH_ORDER.map((m) => (
            <div key={m} className="py-1 text-center text-[11px] font-medium text-muted-foreground">
              {MES_NOMES[m - 1]}
            </div>
          ))}
          {data.matrix.map((row) => (
            <div key={row.fy} className="contents">
              <div className="flex items-center pr-2 text-xs font-medium text-muted-foreground">
                {row.fy}
              </div>
              {row.cells.map((v, idx) => {
                const { bg, color } = heatColor(v, data.min, data.max);
                return (
                  <div
                    key={idx}
                    className="flex h-12 items-center justify-center rounded-md text-xs font-medium tabular-nums"
                    style={{ background: bg, color }}
                    title={`${row.fy} · ${MES_NOMES[FY_MONTH_ORDER[idx] - 1]}: ${v === null ? "sem dados" : formatPct(v)}`}
                  >
                    {v === null ? "—" : formatPct(v)}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {data.best && data.worst && data.best.mes !== data.worst.mes && (
        <div className="mt-4 rounded-lg border border-border/40 bg-muted/30 px-4 py-3 text-sm">
          <span className="font-medium">Padrão detectado: </span>
          Historicamente, <span className="font-semibold text-success">{MES_NOMES[data.best.mes - 1]}</span>{" "}
          é o melhor mês (média {formatPct(data.best.pct)}) e{" "}
          <span className="font-semibold text-destructive">{MES_NOMES[data.worst.mes - 1]}</span>{" "}
          é o mais fraco (média {formatPct(data.worst.pct)}).
        </div>
      )}
    </>
  );
}
