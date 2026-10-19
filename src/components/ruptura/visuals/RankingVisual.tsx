// Ruptura · ranking (categoria, canal, rede ou SKU) como vai para o slide: as
// maiores linhas, em tabela ou em barras. A aba segue com a tabela completa
// (busca, ordenação, detalhe por rede); as contas são as mesmas (data.ts).
import { formatNum, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TabVisualVariant } from "@/components/pricing/tabVisuals/visualTheme";
import { RUPTURA_RANKING_DIMS, type RupturaRankingData } from "./data";
import { rupturaPalette } from "./theme";

export function RupturaRankingVisual({
  data,
  params,
  variant,
}: {
  data: RupturaRankingData;
  params: Record<string, unknown>;
  variant: TabVisualVariant;
}) {
  const slide = variant === "slide";
  const palette = rupturaPalette(variant);
  const { rows } = data;
  const bars = params.view === "bars";
  const max = rows[0]?.occurrences ?? 0;
  // Os itens que, juntos, chegam a 80% das ocorrências ficam em vermelho.
  const inPareto = (i: number) => i === 0 || rows[i - 1].cumShare < 0.8 - 1e-9;
  const nameLabel = RUPTURA_RANKING_DIMS[data.dim].nameLabel;
  const size = slide ? "text-[15px]" : "text-xs";
  const small = slide ? "text-[12px]" : "text-[10px]";
  const barFill = (i: number) => (inPareto(i) ? palette.danger : "hsl(var(--muted-foreground) / 0.35)");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {bars ? (
        <ol className={slide ? "space-y-3.5" : "space-y-2"}>
          {rows.map((r, i) => (
            <li key={r.label} className={cn("grid grid-cols-[minmax(0,34%)_1fr_auto] items-center gap-3", size)}>
              <span className="truncate" title={r.label}>{r.label}</span>
              <span className={cn("overflow-hidden rounded-sm bg-secondary/60", slide ? "h-5" : "h-4")}>
                <span className="block h-full rounded-sm" style={{ width: `${max ? (r.occurrences / max) * 100 : 0}%`, background: barFill(i), opacity: 0.85 }} />
              </span>
              <span className="w-28 text-right tabular-nums text-muted-foreground">{formatNum(r.occurrences)} · {formatPct(r.share, 0)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <table className={cn("w-full table-fixed border-collapse", size)}>
          <colgroup>
            <col style={{ width: data.withRate ? "36%" : "40%" }} />
            <col style={{ width: data.withRate ? "28%" : "32%" }} />
            <col style={{ width: "12%" }} />
            {data.withRate && <col style={{ width: "12%" }} />}
            <col style={{ width: data.withRate ? "12%" : "16%" }} />
          </colgroup>
          <thead>
            <tr className={cn("border-b border-border text-muted-foreground", small)}>
              <th scope="col" className="py-2 pr-3 text-left font-semibold uppercase tracking-wider">{nameLabel}</th>
              <th scope="col" className="px-3 py-2 text-left font-semibold uppercase tracking-wider">Ocorrências</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold uppercase tracking-wider">Lojas</th>
              {data.withRate && <th scope="col" className="px-3 py-2 text-right font-semibold uppercase tracking-wider">Taxa</th>}
              <th scope="col" className="py-2 pl-3 text-right font-semibold uppercase tracking-wider">Part.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.label} className="border-b border-border/60">
                <td className="py-2 pr-3">
                  <div className="truncate font-medium" title={r.label}>{r.label}</div>
                  {r.sub && <div className={cn("truncate text-muted-foreground", small)} title={r.sub}>{r.sub}</div>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="h-3 flex-1 overflow-hidden rounded-sm bg-secondary/60">
                      <span className="block h-full rounded-sm" style={{ width: `${max ? (r.occurrences / max) * 100 : 0}%`, background: barFill(i), opacity: 0.85 }} />
                    </span>
                    <span className="w-14 text-right tabular-nums">{formatNum(r.occurrences)}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNum(r.storesAffected)}</td>
                {data.withRate && <td className="px-3 py-2 text-right tabular-nums">{r.rate === null ? "—" : formatPct(r.rate)}</td>}
                <td className="py-2 pl-3 text-right tabular-nums text-muted-foreground">{formatPct(r.share)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data.totalRows >= 5 && (
        <p className={cn("text-muted-foreground", small)}>
          {rows.length < data.totalRows ? <>Top {formatNum(rows.length)} de {formatNum(data.totalRows)} · {formatPct(data.shownShare, 0)} das ocorrências · </> : null}
          <span className="tabular-nums">{formatNum(data.pareto80)}</span> de <span className="tabular-nums">{formatNum(data.totalRows)}</span> concentram 80% das ocorrências
        </p>
      )}
    </div>
  );
}
