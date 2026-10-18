// Visão Geral · Heróis e Ofensores — Top 5 SKUs por Margem %.
// O mesmo desenho na aba e no slide (a aba põe o título e o cartão em volta).
import { AbcBar } from "@/components/pricing/AbcBar";
import { formatBRL } from "@/lib/format";
import type { HeroisData } from "./visaoGeralData";

export function HeroisVisual({ data, params }: { data: HeroisData; params: Record<string, unknown> }) {
  const villain = params.variant === "villain";
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="mb-4 text-[11px] text-muted-foreground">
        {villain ? "Menor" : "Maior"} margem % — apenas SKUs com ROL ≥ {formatBRL(data.minRolForPct, { compact: true })}
      </p>
      <div className="min-h-0 flex-1">
        <AbcBar rows={data.bySku} variant={villain ? "villain" : "hero"} sortBy="margemPct" minRolForPct={data.minRolForPct} />
      </div>
    </div>
  );
}
