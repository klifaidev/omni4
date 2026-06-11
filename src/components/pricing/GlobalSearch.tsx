import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Layers, Network, Tag } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { usePricing } from "@/store/pricing";
import { aggregateBy, applyFilters } from "@/lib/analytics";
import { formatBRL, formatPct } from "@/lib/format";
import type { FilterKey } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Kind = "sku" | "marca" | "canal" | "categoria";

interface Hit {
  kind: Kind;
  filterKey: FilterKey;
  value: string;
  label: string;
  rol: number;
  margemPct: number;
}

const KIND_META: Record<Kind, { label: string; icon: typeof Box; toneClass: string }> = {
  sku: { label: "SKU", icon: Box, toneClass: "text-primary" },
  marca: { label: "Marca", icon: Tag, toneClass: "text-accent" },
  canal: { label: "Canal", icon: Network, toneClass: "text-warning" },
  categoria: { label: "Categoria", icon: Layers, toneClass: "text-muted-foreground" },
};

export function GlobalSearch({ open, onOpenChange }: Props) {
  const rows = usePricing((s) => s.rows);
  const filters = usePricing((s) => s.filters);
  const selected = usePricing((s) => s.selectedPeriods);
  const metric = usePricing((s) => s.metric);
  const setFilter = usePricing((s) => s.setFilter);
  const navigate = useNavigate();

  // Atalho global Ctrl+K / Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  // Base do período/filtros atuais para mostrar números contextuais
  const periodRows = useMemo(
    () => applyFilters(rows, {}, selected),
    [rows, selected],
  );

  const hits = useMemo<Hit[]>(() => {
    if (periodRows.length === 0) return [];

    const build = (kind: Kind, filterKey: FilterKey, keyFn: (r: typeof periodRows[number]) => string): Hit[] => {
      const agg = aggregateBy(periodRows, metric, keyFn);
      return agg
        .filter((a) => a.key && a.key !== "—")
        .map((a) => ({
          kind,
          filterKey,
          value: a.key,
          label: a.key,
          rol: a.rol,
          margemPct: a.margemPct,
        }));
    };

    return [
      ...build("sku", "sku", (r) => r.sku || r.skuDesc || "—"),
      ...build("marca", "marca", (r) => r.marca ?? "—"),
      ...build("canal", "canal", (r) => r.canal ?? "—"),
      ...build("categoria", "categoria", (r) => r.categoria ?? "—"),
    ];
  }, [periodRows, metric]);

  const grouped = useMemo(() => {
    const g: Record<Kind, Hit[]> = { sku: [], marca: [], canal: [], categoria: [] };
    for (const h of hits) g[h.kind].push(h);
    return g;
  }, [hits]);

  const handleSelect = (h: Hit) => {
    const current = filters[h.filterKey] ?? [];
    if (!current.includes(h.value)) {
      setFilter(h.filterKey, [...current, h.value]);
    }
    onOpenChange(false);
    navigate("/visao-geral");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-[560px]">
        <Command shouldFilter loop className="bg-transparent">
          <CommandInput placeholder="Buscar SKU, marca, canal ou categoria…" autoFocus />
          <CommandList className="max-h-[420px]">
            <CommandEmpty>
              {periodRows.length === 0
                ? "Carregue dados para buscar."
                : "Nenhum resultado."}
            </CommandEmpty>

            {(Object.keys(grouped) as Kind[]).map((kind) => {
              const items = grouped[kind].slice(0, 10);
              if (items.length === 0) return null;
              const meta = KIND_META[kind];
              return (
                <CommandGroup key={kind} heading={meta.label}>
                  {items.map((h) => {
                    const Icon = meta.icon;
                    return (
                      <CommandItem
                        key={`${kind}:${h.value}`}
                        value={`${meta.label} ${h.value}`}
                        onSelect={() => handleSelect(h)}
                        className="flex items-center gap-3"
                      >
                        <Icon className={`h-3.5 w-3.5 shrink-0 ${meta.toneClass}`} />
                        <span className="flex-1 truncate text-xs">{h.label}</span>
                        <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                          {meta.label}
                        </span>
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                          {formatBRL(h.rol)}
                        </span>
                        <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                          {formatPct(h.margemPct)}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
