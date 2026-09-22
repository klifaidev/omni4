import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BlockRenderer } from "./BlockRenderer";
import { SlideFilterProvider, useSlideFilters } from "./SlideFilterContext";
import type { KpiBlock } from "@/lib/customSlide";
import type { PricingRow } from "@/lib/types";
import { usePricing } from "@/store/pricing";
import { useBudget } from "@/store/budget";

afterEach(() => {
  cleanup();
  usePricing.setState({ rows: [] });
  useBudget.setState({ rows: [] });
});

// Dois meses, cada um com clientes distintos, pra deixar claro qual período
// está de fato entrando na conta.
const rows = [
  { periodo: "007.2026", mes: 7, ano: 2026, fy: "FY26/27", cliente: "1 Cliente A", rol: 100, contribMarginal: 25, volumeKg: 100 },
  { periodo: "007.2026", mes: 7, ano: 2026, fy: "FY26/27", cliente: "2 Cliente B", rol: 100, contribMarginal: 25, volumeKg: 100 },
  { periodo: "008.2026", mes: 8, ano: 2026, fy: "FY26/27", cliente: "3 Cliente C", rol: 100, contribMarginal: 25, volumeKg: 400 },
] as PricingRow[];

function kpiBlock(): KpiBlock {
  return {
    id: "kpi-1",
    kind: "kpi",
    x: 0, y: 0, w: 280, h: 130, z: 1,
    label: "Volume Médio",
    valueSize: 36,
    color: "C8102E",
    source: "dynamic",
    measure: "ticketMedio",
    periodMode: "month",
    periodValue: "007.2026",
    periodSelectionMode: "fixed",
    filters: {},
    format: "auto",
    manualValue: "",
    dataSource: "ke30",
  };
}

/** Simula OUTRO bloco do slide emitindo um filtro cruzado de período — o
 *  mesmo mecanismo de um clique numa barra de gráfico com eixo "period". */
function EmitPeriodFilter({ values }: { values: string[] }) {
  const { setFilter } = useSlideFilters();
  React.useEffect(() => {
    setFilter({ sourceBlockId: "outro-bloco", dimension: "period", values });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

describe("KPI Card sob filtro cruzado de período", () => {
  it("sem filtro cruzado: rótulo mostra o período configurado no próprio card", () => {
    usePricing.setState({ rows });
    render(
      <SlideFilterProvider>
        <BlockRenderer block={kpiBlock()} readOnly />
      </SlideFilterProvider>,
    );
    expect(screen.getByText(/Jul\/26/)).toBeInTheDocument();
  });

  it("com filtro cruzado de outro bloco: rótulo avisa que está filtrado, não mente dizendo o período do card", async () => {
    usePricing.setState({ rows });
    render(
      <SlideFilterProvider>
        <EmitPeriodFilter values={["Ago/26"]} />
        <BlockRenderer block={kpiBlock()} readOnly />
      </SlideFilterProvider>,
    );

    // O rótulo do PRÓPRIO card era "Jul/26" (periodValue: "007.2026"), mas
    // o filtro cruzado de outro bloco está pedindo Ago/26 — o texto tem que
    // deixar isso claro em vez de continuar dizendo "Jul/26".
    await waitFor(() => {
      expect(screen.getByText(/Filtrado/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Relativo: Jul\/26/)).not.toBeInTheDocument();
  });

  it("bloco com participatesInCrossFilter=false ignora o filtro alheio e mantém seu próprio período", async () => {
    usePricing.setState({ rows });
    const block = { ...kpiBlock(), participatesInCrossFilter: false };
    render(
      <SlideFilterProvider>
        <EmitPeriodFilter values={["Ago/26"]} />
        <BlockRenderer block={block} readOnly />
      </SlideFilterProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText(/Jul\/26/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Filtrado/)).not.toBeInTheDocument();
  });
});
