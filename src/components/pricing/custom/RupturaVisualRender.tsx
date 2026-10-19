// Desenho de um visual da Ruptura no slide (RupturaVisualBlock): o mesmo
// componente da aba, com a base de ruptura, os filtros e o período do bloco,
// no tema claro do slide.
import { useMemo } from "react";
import { Link2, Lock } from "lucide-react";
import type { RupturaVisualBlock } from "@/lib/customSlide";
import { SLIDE_HEX } from "@/lib/slideColors";
import { useSlidesFlow } from "@/store/slidesFlow";
import { computeRupturaVisual, getRupturaVisual } from "@/components/ruptura/visuals/registry";
import { useRupturaModel } from "@/components/ruptura/visuals/useRupturaModel";
import { TabVisualSurface } from "@/components/pricing/tabVisuals/TabVisualSurface";
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

export function RupturaVisualRender({ block, readOnly }: { block: RupturaVisualBlock; readOnly?: boolean }) {
  const visual = getRupturaVisual(block.visualId);
  const { model, status } = useRupturaModel();
  const reference = useSlidesFlow((s) => s.referencePeriod);
  const data = useMemo(
    () => (visual && model ? computeRupturaVisual(visual, model, block, reference) : null),
    [visual, model, block, reference],
  );

  if (!visual) return <Message text="Este visual não existe nesta versão do app." />;
  if (!model) {
    return (
      <Message
        text={status === "loading" || status === "checking"
          ? "Abrindo a base de ruptura…"
          : "Base de ruptura não carregada. Abra a aba Ruptura e carregue o arquivo."}
      />
    );
  }

  const Visual = visual.Component;
  const live = block.period.mode === "live";
  const history = visual.scope?.(block.params) === "history";
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", position: "relative", fontFamily: FONT }}>
      {block.showTitle && block.title && (
        <div style={{ fontSize: 18, fontWeight: 700, color: SLIDE_HEX.chart2, padding: "2px 4px 8px" }}>
          <RichTextContent text={block.title} />
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0 }}>
        {data == null || visual.isEmpty(data as never)
          ? <Message text="Sem dados para os filtros e meses deste visual." />
          : (
            <TabVisualSurface layout={visual.layout} designWidth={visual.designWidth}>
              <Visual data={data as never} params={block.params} variant="slide" />
            </TabVisualSurface>
          )}
      </div>
      {!readOnly && (
        // Só no editor: de onde veio e se acompanha a base.
        <div
          data-export-hide="true"
          title={history || live ? "Acompanha o mês mais recente da base de ruptura" : "Travado nos meses escolhidos"}
          style={{
            position: "absolute", bottom: "100%", right: 0, marginBottom: 4, whiteSpace: "nowrap",
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "2px 8px", borderRadius: 999,
            background: "rgba(255,255,255,0.92)", border: `1px solid ${SLIDE_HEX.grid}`,
            color: SLIDE_HEX.slate500, fontSize: 11, fontWeight: 600, pointerEvents: "none",
          }}
        >
          {history || live ? <Link2 size={11} /> : <Lock size={11} />}
          {visual.page} · {history || live ? "ao vivo" : "travado"}
        </div>
      )}
    </div>
  );
}
