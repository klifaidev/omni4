import React from "react";
import { Topbar } from "@/components/pricing/Topbar";
import { GlassCard } from "@/components/pricing/GlassCard";
import { EmptyState } from "@/components/pricing/EmptyState";
import { PivotBuilder } from "@/components/pricing/PivotBuilder";
import { usePricing } from "@/store/pricing";
import { useBudget } from "@/store/budget";
import { applyFilters, clearApplyFiltersCache } from "@/lib/analytics";
import { applyBudgetFilters } from "@/lib/budget";
import { useEffect, useMemo, useRef, useState } from "react";
import { FileSpreadsheet, FilterX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePageTitle } from "@/hooks/use-page-title";
import { usePivotLayoutStore } from "@/store/pivotLayout";
import { reportRendererError } from "@/lib/rendererErrorReporting";

class PivotErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null; resetKey: number }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null, resetKey: 0 };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[PivotBuilder] Erro crítico:", error, info);
    reportRendererError("pivot.error-boundary", error, info.componentStack ?? undefined);
  }
  // "Tentar novamente" sozinho redesenhava a mesma montagem que acabou de
  // falhar — quase sempre falhava de novo. Esta opção esquece a montagem do
  // modo atual e remonta a tabela do zero (key nova).
  private startFresh = () => {
    const store = usePivotLayoutStore.getState();
    store.clearLayout(store.mode);
    this.setState((s) => ({ error: null, resetKey: s.resetKey + 1 }));
  };
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 p-16 text-center">
          <div className="text-4xl text-destructive">⚠</div>
          <h2 className="text-lg font-semibold">Erro na Tabela Dinâmica</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {this.state.error.message}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" onClick={this.startFresh}>
              Começar com a montagem padrão
            </Button>
            <Button type="button" variant="outline" onClick={() => this.setState({ error: null })}>
              Tentar novamente
            </Button>
          </div>
        </div>
      );
    }
    return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>;
  }
}

/**
 * Envolve a tabela pivot. Já foi um contêiner com `overflow-x-auto`, sombra de
 * "tem mais à direita" e regras de coluna fixa — mas a própria tabela já rola
 * (e fixa a 1ª coluna), então o contêiner de fora só criava uma segunda barra
 * de rolagem horizontal por cima da dela e aplicava `sticky` a toda tabela
 * dentro dele (inclusive a do painel de detalhe). Agora só garante que nada
 * dentro empurre a largura da página.
 */
function HorizontalScrollWrap({ children }: { children: React.ReactNode }) {
  return <div className="relative w-full min-w-0 max-w-full">{children}</div>;
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

  useEffect(() => {
    return () => clearApplyFiltersCache();
  }, []);
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
  // A SuperBase traz o Budget ("1.Budget Vendas") e o Real de fechamento
  // ("2.Real Vendas") no mesmo arquivo. As medidas de Budget do pivot só podem
  // somar o primeiro — somando os dois, o "ROL Budget" do Comparativo inflava
  // e o Δ% chegava a inverter o sinal. O Real do pivot vem da KE30.
  const budgetPlanRows = useMemo(
    () => budgetRows.filter((row) => row.kind === "budget"),
    [budgetRows],
  );
  const filteredBudget = useMemo(
    () => applyBudgetFilters(budgetPlanRows, filters, selected),
    [budgetPlanRows, filters, selected],
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

  // Achado 06 da análise de UX/UI: havia dados brutos carregados, mas os
  // filtros globais (outra aba/estado) zeraram o resultado — sem isso, a
  // tabela dinâmica renderizava vazia sem explicar o motivo.
  if (filteredReal.length === 0 && filteredBudget.length === 0) {
    return (
      <>
        <Topbar title="Tabela Dinâmica" />
        <div className="px-8 py-6">
          <EmptyState
            icon={FilterX}
            title="Nenhum resultado"
            message="Sem dados para os filtros aplicados. Ajuste os filtros ativos para ver a tabela dinâmica."
          />
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
        <GlassCard>
          <HorizontalScrollWrap>
            <PivotErrorBoundary>
              <PivotBuilder
                realRows={filteredReal}
                budgetRows={filteredBudget}
                onExportReady={handleExportReady}
                globalFilters={filters}
                globalPeriods={selected}
              />
            </PivotErrorBoundary>
          </HorizontalScrollWrap>
        </GlassCard>
      </div>
    </>
  );
}
