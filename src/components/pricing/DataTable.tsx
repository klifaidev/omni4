import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronsUpDown, ChevronUp, Info, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export interface DataTableColumn<T> {
  key: keyof T & string;
  label: string;
  align?: "left" | "right";
  format?: (v: unknown, row: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
}

interface DataTableProps<T> {
  rows: T[];
  columns: DataTableColumn<T>[];
  searchable?: boolean;
  searchKeys?: (keyof T & string)[];
  maxRows?: number;
  pageSize?: number;
  emptyMessage?: string;
}

export function DataTable<T extends Record<string, unknown>>({
  rows,
  columns,
  searchable,
  searchKeys,
  maxRows = 300,
  pageSize,
  emptyMessage = "Sem dados para exibir.",
}: DataTableProps<T>) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [pageInput, setPageInput] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    let out = rows;
    if (query && searchKeys?.length) {
      const q = query.toLowerCase();
      out = out.filter((r) =>
        searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(q)),
      );
    }
    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      const isLeftAligned = col?.align !== "right";
      out = [...out].sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        // Coluna textual (esquerda) com valores string → alfabético pt-BR
        if (isLeftAligned && (typeof av === "string" || typeof bv === "string")) {
          const sa = String(av ?? "");
          const sb = String(bv ?? "");
          return sortDir === "asc"
            ? sa.localeCompare(sb, "pt-BR")
            : sb.localeCompare(sa, "pt-BR");
        }
        const numA = typeof av === "number" ? av : parseFloat(String(av)) || 0;
        const numB = typeof bv === "number" ? bv : parseFloat(String(bv)) || 0;
        return sortDir === "asc" ? numA - numB : numB - numA;
      });
    }
    return out;
  }, [rows, query, sortKey, sortDir, searchKeys, columns]);

  const totalPages = pageSize ? Math.max(1, Math.ceil(filtered.length / pageSize)) : 1;
  const safePage = Math.min(page, totalPages - 1);
  const visible = pageSize
    ? filtered.slice(safePage * pageSize, (safePage + 1) * pageSize)
    : filtered.slice(0, maxRows);

  // Reset da ordenação quando a fonte de dados muda (nova página / novo rows)
  useEffect(() => {
    setSortKey(null);
    setSortDir("desc");
    setPage(0);
  }, [rows]);

  // Reset de página quando a busca muda
  useEffect(() => {
    setPage(0);
  }, [query]);

  const toggleSort = (k: string) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  return (
    <div className="space-y-3">
      {searchable && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar..."
            className="h-9 border-border/50 bg-secondary/40 pl-9 text-xs"
          />
        </div>
      )}

      <div className="rounded-xl border border-border/40 bg-card/30">
        <Table>
          <TableHeader>
            <TableRow className="border-border/40 hover:bg-transparent">
              {columns.map((c) => (
                <TableHead
                  key={c.key}
                  className={cn(
                    "h-10 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
                    c.align === "right" && "text-right",
                    (c.sortable ?? true) && "cursor-pointer select-none hover:text-foreground",
                  )}
                  onClick={() => (c.sortable ?? true) && toggleSort(c.key)}
                >
                  <span className={cn("inline-flex items-center gap-1", c.align === "right" && "justify-end w-full")}>
                    {c.label}
                    {(c.sortable ?? true) && (
                      sortKey === c.key ? (
                        sortDir === "asc"
                          ? <ChevronUp className="h-3 w-3" />
                          : <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronsUpDown className="h-3 w-3 opacity-40" />
                      )
                    )}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-sm text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
            {visible.map((r, i) => (
              <TableRow key={i} className="border-border/30">
                {columns.map((c) => {
                  const v = r[c.key];
                  return (
                    <TableCell
                      key={c.key}
                      className={cn(
                        "py-2.5 text-xs tabular-nums",
                        c.align === "right" && "text-right",
                        c.className,
                      )}
                    >
                      {c.format ? c.format(v, r) : String(v ?? "")}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {pageSize ? (
        filtered.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-[11px] text-muted-foreground">
            <span>
              Mostrando {(safePage * pageSize + 1).toLocaleString("pt-BR")}–
              {Math.min((safePage + 1) * pageSize, filtered.length).toLocaleString("pt-BR")} de{" "}
              {filtered.length.toLocaleString("pt-BR")} resultados
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setPage(0)}
                disabled={safePage === 0}
                aria-label="Primeira página"
              >
                <ChevronsLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                aria-label="Página anterior"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="px-2 tabular-nums">
                {safePage + 1} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
                aria-label="Próxima página"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setPage(totalPages - 1)}
                disabled={safePage >= totalPages - 1}
                aria-label="Última página"
              >
                <ChevronsRight className="h-3.5 w-3.5" />
              </Button>
              {totalPages > 10 && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const n = parseInt(pageInput, 10);
                    if (!Number.isNaN(n) && n >= 1 && n <= totalPages) {
                      setPage(n - 1);
                      setPageInput("");
                    }
                  }}
                  className="ml-2 flex items-center gap-1"
                >
                  <span>Ir para</span>
                  <Input
                    value={pageInput}
                    onChange={(e) => setPageInput(e.target.value)}
                    className="h-7 w-14 border-border/50 bg-secondary/40 px-2 text-xs"
                    placeholder={`${safePage + 1}`}
                  />
                </form>
              )}
            </div>
          </div>
        )
      ) : (
        filtered.length > maxRows && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span>
              Exibindo {maxRows.toLocaleString("pt-BR")} de {filtered.length.toLocaleString("pt-BR")} registros. Use os filtros para refinar os resultados.
            </span>
          </div>
        )
      )}
    </div>
  );
}
