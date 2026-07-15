import type { AggRow } from "@/lib/analytics";
import { formatBRL, formatPct, formatTon } from "@/lib/format";
import { cn } from "@/lib/utils";

interface AbcBarProps {
  rows: AggRow[];
  variant: "hero" | "villain";
  limit?: number;
  sortBy?: "margem" | "volume" | "margemPct";
  /** Minimo de ROL para entrar no ranking de margem % (filtra ruido de SKUs marginais) */
  minRolForPct?: number;
}

export function AbcBar({ rows, variant, limit = 5, sortBy = "margem", minRolForPct }: AbcBarProps) {
  const pool = sortBy === "margemPct"
    ? rows.filter((r) => r.rol > (minRolForPct ?? 0) && r.volumeKg > 0)
    : rows;
  const sorted = [...pool].sort((a, b) => {
    if (sortBy === "volume") return b.volumeKg - a.volumeKg;
    if (sortBy === "margemPct") return variant === "hero" ? b.margemPct - a.margemPct : a.margemPct - b.margemPct;
    return variant === "hero" ? b.margem - a.margem : a.margem - b.margem;
  });
  const top = sorted.slice(0, limit);
  const totalVolumeKg = rows.reduce((sum, r) => sum + Math.max(0, r.volumeKg), 0);
  const max = Math.max(
    ...top.map((r) =>
      sortBy === "volume" ? Math.abs(r.volumeKg) : sortBy === "margemPct" ? Math.abs(r.margemPct) : Math.abs(r.margem),
    ),
    sortBy === "margemPct" ? 0.01 : 1,
  );

  const color = variant === "hero" ? "bg-success" : "bg-destructive";
  const text = variant === "hero" ? "text-success" : "text-destructive";

  return (
    <ul className="flex h-full min-h-0 flex-col justify-between gap-2">
      {top.map((r, i) => {
        const value =
          sortBy === "volume" ? r.volumeKg : sortBy === "margemPct" ? r.margemPct : r.margem;
        const pct = Math.abs(value) / max;
        const headline =
          sortBy === "volume"
            ? formatTon(r.volumeKg)
            : sortBy === "margemPct"
            ? formatPct(r.margemPct)
            : formatBRL(r.margem, { compact: true });
        const volumeShare = totalVolumeKg > 0 ? r.volumeKg / totalVolumeKg : 0;
        return (
          <li key={r.key} className="animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="mb-1 flex items-start justify-between gap-2 text-[11px]">
              <span
                className="min-w-0 flex-1 break-words font-medium text-foreground/90"
                style={{
                  display: "block",
                  lineHeight: 1.2,
                  maxHeight: "2.5em",
                  overflow: "hidden",
                }}
                title={r.key}
              >
                {r.key}
              </span>
              <span className={cn("shrink-0 tabular-nums font-semibold", text)}>{headline}</span>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-secondary/50">
              <div
                className={cn("absolute inset-y-0 left-0 rounded-full transition-all", color)}
                style={{ width: `${pct * 100}%`, opacity: 0.85 }}
              />
            </div>
            <div
              className={cn(
                "mt-1 text-[10px] text-muted-foreground",
                sortBy === "margemPct" ? "grid grid-cols-3 gap-2" : "flex items-center justify-between",
              )}
            >
              {sortBy === "margemPct" ? (
                <>
                  <span className="truncate" title={formatTon(r.volumeKg)}>
                    Vol: {formatTon(r.volumeKg)}
                  </span>
                  <span className="truncate text-center tabular-nums" title={`Importancia em volume: ${formatPct(volumeShare)}`}>
                    Imp. vol: {formatPct(volumeShare)}
                  </span>
                  <span className="truncate text-right" title={formatBRL(r.margem)}>
                    Mg: {formatBRL(r.margem, { compact: true })}
                  </span>
                </>
              ) : (
                <>
                  <span>Mg%: {formatPct(r.margemPct)}</span>
                  <span>
                    {sortBy === "volume"
                      ? `ROL: ${formatBRL(r.rol, { compact: true })}`
                      : `Vol: ${formatTon(r.volumeKg)}`}
                  </span>
                </>
              )}
            </div>
          </li>
        );
      })}
      {top.length === 0 && (
        <li className="text-center text-sm text-muted-foreground">Sem dados.</li>
      )}
    </ul>
  );
}
