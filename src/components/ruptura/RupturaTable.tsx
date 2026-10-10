import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BarChart3, ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp, Download, Search, Table2 } from "lucide-react";
import { GlassCard } from "@/components/pricing/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatNum, formatPct } from "@/lib/format";
import { paretoCount, type RupturaGroupRow } from "@/lib/ruptura/metrics";
import { cn } from "@/lib/utils";

export interface RupturaColumn<T> {
  key: string;
  label: string;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
  /** Valor para ordenar; null vai para o fim. Sem isso, a coluna não ordena. */
  sortValue?: (row: T) => number | string | null;
  /** Valor exportado para a planilha. */
  exportValue?: (row: T) => string | number | null;
  className?: string;
  title?: string;
  /** Só na exportação (não aparece na tabela). */
  exportOnly?: boolean;
}

/** Colunas numéricas comuns a todos os rankings. */
export function metricColumns<T extends RupturaGroupRow>(opts: { withRate: boolean; storesLabel?: string }): RupturaColumn<T>[] {
  // Sem respostas "Não" a taxa seria "—" em todas as linhas: a coluna sai.
  const cols: RupturaColumn<T>[] = [
    {
      key: "storesAffected", label: opts.storesLabel ?? "Lojas afetadas", align: "right",
      render: (r) => formatNum(r.storesAffected), sortValue: (r) => r.storesAffected, exportValue: (r) => r.storesAffected,
    },
    {
      key: "occurrences", label: "Ocorrências", align: "right", title: "Combinações loja × SKU × mês em ruptura",
      render: (r) => formatNum(r.occurrences), sortValue: (r) => r.occurrences, exportValue: (r) => r.occurrences,
    },
    {
      key: "rate", label: "Taxa", align: "right", title: opts.withRate ? "Ocorrências ÷ avaliações" : "Disponível quando a base trouxer respostas “Não”",
      render: (r) => (r.rate === null ? <span className="text-muted-foreground">—</span> : formatPct(r.rate)),
      sortValue: (r) => r.rate, exportValue: (r) => (r.rate === null ? null : r.rate),
    },
    {
      key: "share", label: "Part.", align: "right", title: "Participação nas ocorrências do recorte",
      render: (r) => formatPct(r.share), sortValue: (r) => r.share, exportValue: (r) => r.share,
    },
    {
      key: "cumShare", label: "Acum.", align: "right", title: "Participação acumulada (Pareto)",
      render: (r) => <span className="text-muted-foreground">{formatPct(r.cumShare)}</span>, sortValue: (r) => r.cumShare, exportValue: (r) => r.cumShare,
    },
  ];
  return opts.withRate ? cols : cols.filter((c) => c.key !== "rate");
}

interface RupturaTableProps<T extends RupturaGroupRow> {
  title: string;
  subtitle?: ReactNode;
  rows: T[];
  columns: RupturaColumn<T>[];
  onRowClick?: (row: T) => void;
  isSelected?: (row: T) => boolean;
  searchable?: boolean;
  pageSize?: number;
  exportName?: string;
  bars?: boolean;
  /** Linha extra abaixo de uma linha (aprofundamento). */
  renderExpanded?: (row: T) => ReactNode;
  expandable?: (row: T) => boolean;
  emptyMessage?: string;
  className?: string;
}

export function RupturaTable<T extends RupturaGroupRow>({
  title,
  subtitle,
  rows,
  columns,
  onRowClick,
  isSelected,
  searchable,
  pageSize = 10,
  exportName,
  bars,
  renderExpanded,
  expandable,
  emptyMessage = "Sem ocorrências no recorte.",
  className,
}: RupturaTableProps<T>) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [page, setPage] = useState(0);
  const [mode, setMode] = useState<"table" | "bars">("table");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => setPage(0), [rows, query, sort]);

  const pareto80 = useMemo(() => paretoCount(rows, 0.8), [rows]);
  const paretoKeys = useMemo(() => new Set(rows.slice(0, pareto80).map((r) => r.key)), [rows, pareto80]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = q ? rows.filter((r) => r.label.toLowerCase().includes(q)) : rows;
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col?.sortValue) {
        const get = col.sortValue;
        out = [...out].sort((a, b) => {
          const va = get(a);
          const vb = get(b);
          if (va === null && vb === null) return 0;
          if (va === null) return 1;
          if (vb === null) return -1;
          const cmp = typeof va === "string" ? va.localeCompare(String(vb), "pt-BR") : va - (vb as number);
          return sort.dir === "asc" ? cmp : -cmp;
        });
      }
    }
    return out;
  }, [rows, query, sort, columns]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  const visible = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key === key ? (s.dir === "desc" ? { key, dir: "asc" } : null) : { key, dir: "desc" }));

  const exportXlsx = async () => {
    const XLSX = await import("xlsx");
    const data = filtered.map((r) => Object.fromEntries(columns.map((c) => [c.label, c.exportValue ? c.exportValue(r) : null])));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ruptura");
    XLSX.writeFile(wb, `${exportName ?? "ruptura"}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const maxOcc = rows[0]?.occurrences ?? 0;
  const shown = columns.filter((c) => !c.exportOnly);

  return (
    <GlassCard className={cn("flex min-w-0 flex-col gap-3 p-5", className)}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">{title}</h2>
          <p className="text-[11px] text-muted-foreground">
            {subtitle}
            {rows.length >= 5 && (
              <> {subtitle ? "· " : ""}<span className="tabular-nums">{formatNum(pareto80)}</span> de <span className="tabular-nums">{formatNum(rows.length)}</span> concentram 80% das ocorrências</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {searchable && (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar…" aria-label={`Buscar em ${title}`} className="h-8 w-44 border-border/50 bg-secondary/40 pl-8 text-xs" />
            </div>
          )}
          {bars && (
            <ToggleGroup type="single" value={mode} onValueChange={(v) => v && setMode(v as "table" | "bars")} className="gap-0.5">
              <ToggleGroupItem value="table" className="h-8 w-8 p-0" aria-label="Ver como tabela"><Table2 className="h-3.5 w-3.5" /></ToggleGroupItem>
              <ToggleGroupItem value="bars" className="h-8 w-8 p-0" aria-label="Ver como barras"><BarChart3 className="h-3.5 w-3.5" /></ToggleGroupItem>
            </ToggleGroup>
          )}
          {exportName && (
            <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={exportXlsx} disabled={filtered.length === 0}>
              <Download className="h-3.5 w-3.5" /> Exportar
            </Button>
          )}
        </div>
      </header>

      {mode === "bars" ? (
        <ol className="space-y-1.5">
          {filtered.slice(0, 15).map((r) => (
            <li key={r.key}>
              <button
                type="button"
                onClick={() => onRowClick?.(r)}
                className={cn("group grid w-full grid-cols-[minmax(0,38%)_1fr_auto] items-center gap-2 rounded-md px-1 py-0.5 text-left text-xs hover:bg-secondary/40", isSelected?.(r) && "bg-primary/10")}
              >
                <span className="truncate" title={r.label}>{r.label}</span>
                <span className="h-3 overflow-hidden rounded-sm bg-secondary/40">
                  <span className="block h-full rounded-sm" style={{ width: `${maxOcc ? (r.occurrences / maxOcc) * 100 : 0}%`, background: paretoKeys.has(r.key) ? "hsl(var(--destructive) / 0.75)" : "hsl(var(--muted-foreground) / 0.35)" }} />
                </span>
                <span className="w-24 text-right tabular-nums text-muted-foreground">{formatNum(r.occurrences)} · {formatPct(r.share, 0)}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/40 bg-card/30">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/40">
                {shown.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    title={c.title}
                    className={cn("h-9 whitespace-nowrap px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground", c.align === "right" ? "text-right" : "text-left")}
                    aria-sort={sort?.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                  >
                    {c.sortValue ? (
                      <button type="button" onClick={() => toggleSort(c.key)} className={cn("inline-flex items-center gap-1 hover:text-foreground", c.align === "right" && "flex-row-reverse")}>
                        {c.label}
                        {sort?.key === c.key ? (sort.dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
                      </button>
                    ) : c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr><td colSpan={shown.length} className="h-20 text-center text-muted-foreground">{emptyMessage}</td></tr>
              )}
              {visible.map((r) => {
                const canExpand = !!renderExpanded && (expandable?.(r) ?? true);
                const open = expanded.has(r.key);
                return (
                  <FragmentRow key={r.key}>
                    <tr
                      className={cn(
                        "border-b border-border/30 transition-colors",
                        onRowClick && "cursor-pointer hover:bg-secondary/40",
                        isSelected?.(r) && "bg-primary/10",
                      )}
                      onClick={() => onRowClick?.(r)}
                    >
                      {shown.map((c, ci) => (
                        <td key={c.key} className={cn("px-3 py-2 tabular-nums", c.align === "right" ? "text-right" : "text-left", c.className)}>
                          {ci === 0 ? (
                            <span className="flex min-w-0 items-center gap-1.5">
                              {canExpand && (
                                <button
                                  type="button"
                                  aria-expanded={open}
                                  aria-label={open ? `Recolher ${r.label}` : `Detalhar ${r.label}`}
                                  className="-ml-1 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpanded((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(r.key)) next.delete(r.key);
                                      else next.add(r.key);
                                      return next;
                                    });
                                  }}
                                >
                                  <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
                                </button>
                              )}
                              {paretoKeys.has(r.key) && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive/80" title="Entre os itens que somam 80% das ocorrências" />}
                              {c.render(r)}
                            </span>
                          ) : c.render(r)}
                        </td>
                      ))}
                    </tr>
                    {canExpand && open && (
                      <tr className="border-b border-border/30 bg-secondary/15">
                        <td colSpan={shown.length} className="px-3 py-2">{renderExpanded!(r)}</td>
                      </tr>
                    )}
                  </FragmentRow>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {mode === "table" && filtered.length > pageSize && (
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="tabular-nums">
            {formatNum(safePage * pageSize + 1)}–{formatNum(Math.min((safePage + 1) * pageSize, filtered.length))} de {formatNum(filtered.length)}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPage(safePage - 1)} disabled={safePage === 0} aria-label="Página anterior">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="tabular-nums">{safePage + 1}/{pages}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPage(safePage + 1)} disabled={safePage >= pages - 1} aria-label="Próxima página">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </GlassCard>
  );
}

function FragmentRow({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
