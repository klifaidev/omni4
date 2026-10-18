// Desenho de um visual enviado de uma aba (TabVisualBlock): o mesmo
// componente da aba, com as linhas do deck (já cortadas no mês de
// referência), os filtros e o período do bloco, no tema claro do slide.
import { useMemo } from "react";
import { Link2, Lock } from "lucide-react";
import type { TabVisualBlock } from "@/lib/customSlide";
import { applyFilters } from "@/lib/analytics";
import { getCachedRowsSignature, getOrComputeSlideCalc } from "@/lib/slideCalcCache";
import { localDataMissingMessage } from "@/lib/slideLocalDataStatus";
import { SLIDE_HEX } from "@/lib/slideColors";
import { resolveTabVisualPeriods } from "@/lib/tabVisualPeriod";
import { useDeckPricingRows } from "@/hooks/useDeckRows";
import { getTabVisual } from "@/components/pricing/tabVisuals/registry";
import { useCrossFilteredRows } from "./SlideFilterContext";
import { RichTextContent } from "./RichTextContent";

const FONT = "Calibri, Arial, sans-serif";

function Message({ text }: { text: string }) {
  return (
    <div style={{
      width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
      padding: 12, boxSizing: "border-box", textAlign: "center",
      background: SLIDE_HEX.paper, border: `1px dashed ${SLIDE_HEX.slate300}`,
      color: SLIDE_HEX.slate500, fontFamily: FONT, fontSize: 14,
    }}>
      {text}
    </div>
  );
}

export function TabVisualRender({ block, readOnly }: { block: TabVisualBlock; readOnly?: boolean }) {
  const visual = getTabVisual(block.visualId);
  const deckRows = useDeckPricingRows();
  const periods = useMemo(() => resolveTabVisualPeriods(deckRows, block.period), [deckRows, block.period]);
  // applyFilters guarda o recorte por linhas+filtros: blocos, miniatura e
  // apresentação do mesmo visual reaproveitam o mesmo recorte.
  const scoped = useMemo(() => applyFilters(deckRows, block.filters ?? {}, periods), [deckRows, block.filters, periods]);
  const cross = useCrossFilteredRows(block.id, block.participatesInCrossFilter !== false, scoped);
  const crossActive = cross.applied.length > 0;
  const data = useMemo(() => {
    if (!visual) return null;
    if (crossActive) return visual.compute(cross.rows, block.params);
    return getOrComputeSlideCalc({
      op: "tab-visual",
      blockId: block.id,
      shareAcrossBlocks: true,
      dataSource: "ke30",
      dataSignature: getCachedRowsSignature(deckRows),
      params: { id: visual.id, version: visual.version, params: block.params, filters: block.filters, periods },
    }, () => visual.compute(scoped, block.params));
  }, [visual, crossActive, cross.rows, block.params, block.id, block.filters, deckRows, periods, scoped]);

  if (!visual) return <Message text="Este visual não existe nesta versão do app." />;
  if (deckRows.length === 0) return <Message text={localDataMissingMessage("KE30")} />;

  const Visual = visual.Component;
  const live = block.period.mode === "live";
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", position: "relative", fontFamily: FONT }}>
      {block.showTitle && block.title && (
        <div style={{ fontSize: 18, fontWeight: 700, color: SLIDE_HEX.chart2, padding: "2px 4px 8px" }}>
          <RichTextContent text={block.title} />
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0 }}>
        {data == null || visual.isEmpty(data)
          ? <Message text="Sem dados para os filtros e meses deste visual." />
          : <Visual data={data} variant="slide" />}
      </div>
      {!readOnly && (
        // Só no editor: de onde veio e se acompanha o mês de referência.
        <div
          data-export-hide="true"
          title={live ? "Acompanha o mês de referência do deck" : "Travado nos meses escolhidos"}
          style={{
            position: "absolute", top: 0, right: 0,
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "2px 8px", borderRadius: 999,
            background: "rgba(255,255,255,0.92)", border: `1px solid ${SLIDE_HEX.grid}`,
            color: SLIDE_HEX.slate500, fontSize: 11, fontWeight: 600, pointerEvents: "none",
          }}
        >
          {live ? <Link2 size={11} /> : <Lock size={11} />}
          {visual.page} · {live ? "ao vivo" : "travado"}
        </div>
      )}
    </div>
  );
}
