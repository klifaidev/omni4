import React from "react";
import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { EmptyState } from "@/components/pricing/EmptyState";
import { PivotBuilder } from "@/components/pricing/PivotBuilder";
import { SendToSlideHover } from "@/components/pricing/SendToSlideHover";
import { usePricing } from "@/store/pricing";
import { useBudget } from "@/store/budget";
import { applyFilters } from "@/lib/analytics";
import { applyBudgetFilters } from "@/lib/budget";
import { useEffect, useMemo, useRef, useState } from "react";
import { MoveHorizontal, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePageTitle } from "@/hooks/use-page-title";

class PivotErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[PivotBuilder] Erro crítico:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 p-16 text-center">
          <div className="text-4xl text-destructive">⚠</div>
          <h2 className="text-lg font-semibold">Erro na Tabela Dinâmica</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {this.state.error.message}
          </p>
          <button
            className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
            onClick={() => this.setState({ error: null })}
          >
            Tentar novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Wrapper que dá overflow-x controlado à tabela pivot, com indicadores
 * visuais de scroll (sombra à direita) e sticky na primeira coluna.
 * Aplica os estilos sticky via seletores de arbitrary variant do Tailwind,
 * sem tocar na lógica interna do PivotBuilder.
 */
function HorizontalScrollWrap({ children }: { children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [isNarrow, setIsNarrow] = useState(
    typeof window !== "undefined" ? window.innerWidth < 1280 : false,
  );

  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 1280);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const over = el.scrollWidth > el.clientWidth + 1;
      setOverflowing(over);
      setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
    };
    update();
    const onScroll = () => {
      if (el.scrollLeft > 4) setHasScrolled(true);
      update();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, []);

  const showHint = overflowing && isNarrow && !hasScrolled;

  return (
    <div className="relative w-full">
      {showHint && (
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-secondary/50 px-3 py-1 text-[11px] text-muted-foreground animate-fade-in">
          <MoveHorizontal className="h-3 w-3" />
          ← → Role para ver mais colunas
        </div>
      )}
      <div className="relative">
        <div
          ref={scrollRef}
          className={cn(
            "w-full overflow-x-auto",
            // Sticky para primeira célula de cada linha (header e body)
            "[&_table_tr>th:first-child]:sticky [&_table_tr>th:first-child]:left-0 [&_table_tr>th:first-child]:z-20 [&_table_tr>th:first-child]:bg-[hsl(var(--card))]",
            "[&_table_tr>td:first-child]:sticky [&_table_tr>td:first-child]:left-0 [&_table_tr>td:first-child]:z-10 [&_table_tr>td:first-child]:bg-[hsl(var(--card))]",
          )}
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {children}
        </div>
        {/* Sombra gradiente indicando mais conteúdo à direita */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background/90 to-transparent transition-opacity duration-200",
            overflowing && !atEnd ? "opacity-100" : "opacity-0",
          )}
        />
      </div>
    </div>
  );
}

export default function Detalhe() {
  usePageTitle("Tabela Dinâmica");
  const realRows = usePricing((s) => s.rows);
  const filters = usePricing((s) => s.filters);
  const selected = usePricing((s) => s.selectedPeriods);
  const budgetRows = useBudget((s) => s.rows);
  const [exportFn, setExportFn] = useState<(() => void) | null>(null);
  const exportFnRef = useRef<(() => void) | null>(null);
  exportFnRef.current = exportFn;
  const handleExportReady = useMemo(
    () => (fn: () => void) => setExportFn(() => fn),
    [],
  );
  const excelAction = exportFn ? (
    <Button
      size="sm"
      onClick={() => exportFnRef.current?.()}
      className="h-9 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500"
    >
      <FileSpreadsheet className="h-4 w-4" />
      Exportar Excel
    </Button>
  ) : null;

  const filteredReal = useMemo(
    () => applyFilters(realRows, filters, selected),
    [realRows, filters, selected],
  );
  const filteredBudget = useMemo(
    () => applyBudgetFilters(budgetRows, filters, selected),
    [budgetRows, filters, selected],
  );

  if (realRows.length === 0 && budgetRows.length === 0) {
    return (
      <>
        <Topbar title="Tabela Dinâmica" />
        <div className="px-8 py-6">
          <EmptyState />
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar
        title="Tabela Dinâmica"
        subtitle={`${filteredReal.length.toLocaleString("pt-BR")} linhas Real · ${filteredBudget.length.toLocaleString("pt-BR")} linhas Budget`}
        actions={excelAction}
      />
      <div className="px-8 py-6">
        <SendToSlideHover
          payload={{
            source: { page: "Tabela Dinâmica", visualization: "Tabela dinâmica" },
            target: { blockKind: "table", blockLabel: "Tabela" },
            config: { table: "pivot", filters, selectedPeriods: selected, dataSources: ["ke30", "budget"] },
          }}
        >
        <GlassCard>
          <HorizontalScrollWrap>
            <PivotErrorBoundary>
              <PivotBuilder
                realRows={filteredReal}
                budgetRows={filteredBudget}
                onExportReady={handleExportReady}
              />
            </PivotErrorBoundary>
          </HorizontalScrollWrap>
        </GlassCard>
        </SendToSlideHover>
      </div>
    </>
  );
}
