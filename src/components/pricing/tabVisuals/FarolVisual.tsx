// Farol de Cadastro · Velocímetro de positivação (SKU comparado nos clientes
// do SKU de referência). O mesmo desenho na aba e no slide.
import { FarolGauge } from "@/components/farol/FarolGauge";
import { GlassCard } from "@/components/pricing/GlassCard";
import type { FarolComparacao } from "@/lib/farol";

export function FarolVisual({ data }: { data: FarolComparacao | null }) {
  if (!data) return null;
  return (
    <GlassCard
      glow={data.indicePositivacao >= 0.8 ? "green" : data.indicePositivacao >= 0.5 ? "none" : "red"}
      className="flex flex-col items-center justify-center px-6 py-8 lg:min-w-[260px]"
    >
      <FarolGauge value={data.indicePositivacao} size={220} />
      <p className="mt-3 max-w-[220px] text-center text-xs leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">{data.skuComp.skuDesc}</span>
        {" "}positivado nos clientes do{" "}
        <span className="font-medium text-foreground">{data.skuRef.skuDesc}</span>
      </p>
    </GlassCard>
  );
}
