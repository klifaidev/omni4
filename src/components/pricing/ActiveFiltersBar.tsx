import { ChevronDown, ListFilter, X, SlidersHorizontal } from "lucide-react";
import { usePricing } from "@/store/pricing";
import { useMonthsInfo } from "@/store/selectors";
import type { FilterKey } from "@/lib/types";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { computeAvailableOptionsPerDimension } from "@/lib/filterOptions";
import { DIMENSION_GROUPS, DIMENSION_KEYS } from "@/lib/filterDimensions";
import { MultiSelectFilter } from "./MultiSelectFilter";

const FILTER_LABEL: Record<FilterKey, string> = {
  marca: "Marca",
  canal: "Canal",
  canalAjustado: "Canal Ajustado",
  categoria: "Categoria",
  subcategoria: "Subcategoria",
  formato: "Formato",
  sku: "SKU",
  regiao: "Região",
  uf: "UF",
  regional: "Regional",
  mercado: "Mercado",
  mercadoAjustado: "Mercado Ajustado",
  sabor: "Sabor",
  tecnologia: "Tecnologia",
  faixaPeso: "Faixa de Peso",
  inovacao: "Inovação",
  legado: "Legado",
};

export function ActiveFiltersBar() {
  const filters = usePricing((s) => s.filters);
  const selected = usePricing((s) => s.selectedPeriods);
  const setFilter = usePricing((s) => s.setFilter);
  const clearFilters = usePricing((s) => s.clearFilters);
  const setAllPeriods = usePricing((s) => s.setAllPeriods);
  const months = useMonthsInfo();
  const navigate = useNavigate();

  const activeFilters = useMemo(
    () =>
      (Object.entries(filters) as [FilterKey, string[] | undefined][])
        .filter(([, v]) => v && v.length > 0)
        .map(([k, v]) => ({ key: k, values: v as string[] })),
    [filters],
  );

  const periodChip = useMemo(() => {
    if (!selected || selected.length === 0) return null;
    if (months.length > 0 && selected.length === months.length) return null;
    const sortedSelected = [...selected].sort();
    const labelOf = (p: string) => months.find((m) => m.periodo === p)?.label ?? p;
    if (sortedSelected.length === 1) return labelOf(sortedSelected[0]);
    return `${labelOf(sortedSelected[0])} – ${labelOf(sortedSelected[sortedSelected.length - 1])}`;
  }, [selected, months]);

  const hasAny = activeFilters.length > 0 || periodChip !== null;
  // O painel aberto segura a barra na tela mesmo que o último filtro saia.
  const [moreOpen, setMoreOpen] = useState(false);

  if (!hasAny && !moreOpen) return null;

  return (
    <StickyFrame>
      <div className="flex h-9 items-center gap-1.5 px-4 md:px-8">
        {/* Atalho para página de filtros */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => navigate("/filtros")}
              className="mr-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-primary/10 hover:text-primary"
              aria-label="Abrir página de filtros"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Página de filtros: período e presets</TooltipContent>
        </Tooltip>

        <span className="mr-1 shrink-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
          Filtros ativos
        </span>

        {/* Só os chips rolam de lado: os botões da direita ficam sempre à mão. */}
        <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto whitespace-nowrap">
          {activeFilters.map(({ key, values }) => (
            <Chip
              key={key}
              label={`${FILTER_LABEL[key]}: ${values.length === 1 ? values[0] : `${values.length} valores`}`}
              onRemove={() => setFilter(key, [])}
            />
          ))}

          {periodChip && (
            <Chip label={periodChip} onRemove={() => setAllPeriods()} tone="period" />
          )}

          {!hasAny && <span className="text-[11px] text-muted-foreground/70">Nenhum filtro aplicado</span>}
        </div>

        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
          aria-controls="mais-filtros"
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
            moreOpen
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border/60 bg-card/40 text-muted-foreground hover:border-primary/40 hover:text-primary",
          )}
        >
          <ListFilter className="h-3 w-3" />
          Mais filtros
          <ChevronDown className={cn("h-3 w-3 transition-transform duration-200 motion-reduce:transition-none", moreOpen && "rotate-180")} />
        </button>

        {hasAny && (
          <button
            type="button"
            onClick={() => {
              clearFilters();
              setAllPeriods();
            }}
            className="shrink-0 rounded-full border border-border/60 bg-card/40 px-3 py-1 text-[11px] text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
          >
            Limpar todos
          </button>
        )}
      </div>

      <MoreFiltersPanel open={moreOpen} onClose={() => setMoreOpen(false)} />
    </StickyFrame>
  );
}

/**
 * Barra presa no topo da área rolável. A altura dela vira `--filters-bar-h` no
 * <main>: o cabeçalho de cada aba (também preso) fica logo abaixo, não por baixo.
 */
function StickyFrame({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const main = el?.closest("main");
    if (!el || !main) return;
    const sync = () => main.style.setProperty("--filters-bar-h", `${el.offsetHeight}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      ro.disconnect();
      main.style.setProperty("--filters-bar-h", "0px");
    };
  }, []);

  return (
    <div
      ref={ref}
      className="sticky top-0 z-30 border-b border-border/40 bg-background/80 backdrop-blur-xl animate-fade-in"
    >
      {children}
    </div>
  );
}

/** Os filtros de dimensão da página Filtros, sem sair da aba. */
function MoreFiltersPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Continua montado durante o recolhimento, para a animação ter conteúdo.
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), 250);
    return () => window.clearTimeout(timer);
  }, [open]);

  // Esc fecha o painel antes de chegar ao atalho global (que limpa os filtros).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector('[role="dialog"][data-state="open"], [data-radix-popper-content-wrapper]')) return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  return (
    <div
      id="mais-filtros"
      className={cn(
        "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
      )}
    >
      <div className="min-h-0 overflow-hidden" aria-hidden={!open}>
        {mounted && <MoreFiltersContent />}
      </div>
    </div>
  );
}

function MoreFiltersContent() {
  const rows = usePricing((s) => s.rows);
  const filters = usePricing((s) => s.filters);
  const selectedPeriods = usePricing((s) => s.selectedPeriods);
  const setFilter = usePricing((s) => s.setFilter);

  const summary = useMemo(
    () => computeAvailableOptionsPerDimension(rows, filters, selectedPeriods, DIMENSION_KEYS),
    [rows, filters, selectedPeriods],
  );

  const groups = DIMENSION_GROUPS.map(({ title, fields }) => ({
    title,
    fields: fields.filter(({ key }) => summary.hasValuesByKey.get(key)),
  })).filter((group) => group.fields.length > 0);

  return (
    <div className="max-h-[min(55vh,440px)] overflow-y-auto border-t border-border/30 px-4 pb-4 pt-3 md:px-8">
      {groups.length === 0 ? (
        <p className="py-2 text-xs text-muted-foreground">Carregue uma base para filtrar por dimensão.</p>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group.title} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
                  {group.title}
                </span>
                <span className="h-px flex-1 bg-border/40" />
              </div>
              <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {group.fields.map(({ key, label }) => {
                  const selected = filters[key] ?? [];
                  return (
                    <div key={key} className="min-w-0">
                      <div className="mb-1 flex items-center justify-between text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        <span>{label}</span>
                        {selected.length > 0 && <span className="tabular-nums text-primary">{selected.length}</span>}
                      </div>
                      <MultiSelectFilter
                        options={summary.optionsByKey.get(key) ?? []}
                        selected={selected}
                        onChange={(next) => setFilter(key, next)}
                        placeholder="Todos"
                        variant={key === "sku" ? "sku" : undefined}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({
  label,
  onRemove,
  tone = "filter",
}: {
  label: string;
  onRemove: () => void;
  tone?: "filter" | "period";
}) {
  const toneCls =
    tone === "period"
      ? "border-accent/40 bg-accent/10 text-accent"
      : "border-primary/40 bg-primary/10 text-primary";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${toneCls}`}
        >
          {label}
          <button
            onClick={onRemove}
            className="-mr-0.5 ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full opacity-70 transition-opacity hover:bg-foreground/10 hover:opacity-100"
            aria-label="Remover filtro"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

/** Helper exposto para a Sidebar: indica se há qualquer filtro/período custom ativo. */
export function useHasActiveFilters(): boolean {
  const filters = usePricing((s) => s.filters);
  const selected = usePricing((s) => s.selectedPeriods);
  const monthsLen = useMonthsInfo().length;
  return useMemo(() => {
    const anyFilter = Object.values(filters).some((v) => v && v.length > 0);
    const anyPeriod = selected !== null && selected.length > 0 && selected.length !== monthsLen;
    return anyFilter || anyPeriod;
  }, [filters, selected, monthsLen]);
}
