// Miniaturas compartilhadas da aba Slides.
//
// Antes, cada lista (esteira, tira do editor) desenhava a SUA cópia de cada
// slide: ao abrir o editor, a tira remontava todas as miniaturas de novo
// (~50-75 ms cada uma, com tabela e gráfico reais) e, ao fechar, jogava tudo
// fora — reabrir pagava o custo inteiro outra vez.
//
// Agora existe UMA miniatura viva por slide, desenhada uma vez num "host"
// (um <div> fora da árvore das listas) por <SlideThumbnailPoolHost/>, que fica
// montado com a página de Slides (que por sua vez continua viva ao trocar de
// aba). Cada lugar que mostra a miniatura é só um "encaixe": o host é movido
// para dentro dele (appendChild) — mover um nó já desenhado custa quase nada
// perto de renderizar o slide do zero. Quando dois encaixes do mesmo slide
// existem ao mesmo tempo (esteira por baixo + tira do editor por cima), fica
// com o da camada mais alta; sem nenhum encaixe, o host espera escondido no
// "estacionamento", ainda montado, pronto para voltar. O estado mora em
// lib/slideThumbnailPool.ts.
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CANVAS_H, CANVAS_W } from "@/lib/customSlide";
import type { SlideItem } from "@/lib/slidesFlow";
import { CustomCanvasReadOnly } from "@/components/pricing/custom/PresentationMode";
import { useEditorLiveConfig } from "@/components/pricing/custom/editorStore";
import { SlideFilterProvider } from "@/components/pricing/custom/SlideFilterContext";
import { useSlidesFlow } from "@/store/slidesFlow";
import { useSlidesSafety } from "@/store/slidesSafety";
import { isSlidePerfEnabled, recordSlideRender } from "@/lib/slidesPerfCounters";
import {
  attachPoolHost,
  isPoolRequested,
  markPoolHostRendered,
  poolHostElement,
  prunePool,
  registerPoolSlot,
  requestPooledThumbnail,
  setPoolReady,
  suspendPoolRequests,
  usePooledReady,
  type ThumbnailLayer,
} from "@/lib/slideThumbnailPool";

type CustomSlideItem = Extract<SlideItem, { kind: "custom" }>;
type CustomSlideConfigOf = CustomSlideItem["config"];

/**
 * Só re-renderiza quando o CONTEÚDO da config muda. A config de um slide que
 * não está sendo editado mantém a mesma referência (a store só troca o item
 * editado), então editar o slide A nunca redesenha B, C, D. Quando a
 * referência muda mas o conteúdo não — ex.: ao sair de um slide, a miniatura
 * passa da config ao vivo da store pra config gravada no item, que pode ser
 * um objeto novo com o mesmo conteúdo — a comparação por conteúdo (frações de
 * ms) evita um re-render inteiro do slide (~50ms com tabela/gráfico reais).
 */
// Texto da config guardado por objeto: um slide com imagens coladas tem MBs,
// e serializar as duas configs a cada comparação pesava a esteira inteira.
const configTextCache = new WeakMap<object, string>();
function configText(config: CustomSlideConfigOf): string {
  let text = configTextCache.get(config);
  if (text === undefined) {
    text = JSON.stringify(config);
    configTextCache.set(config, text);
  }
  return text;
}

export const ThumbnailCanvas = memo(
  function ThumbnailCanvas({ config, slideId }: { config: CustomSlideConfigOf; slideId: string }) {
    if (isSlidePerfEnabled()) recordSlideRender("ThumbnailCanvas", slideId);
    return <CustomCanvasReadOnly config={config} slideId={slideId} />;
  },
  (prev, next) => prev.slideId === next.slideId
    && (prev.config === next.config || configText(prev.config) === configText(next.config)),
);

export function SlideThumbnailPlaceholder({ width }: { width: number }) {
  return (
    <div
      aria-hidden
      className="flex items-center justify-center overflow-hidden rounded-lg border border-border/40 bg-muted/35"
      style={{ width, height: (CANVAS_H / CANVAS_W) * width }}
    >
      <div className="h-6 w-24 rounded-full bg-background/60" />
    </div>
  );
}

function PooledThumbnailContent({ item }: { item: CustomSlideItem }) {
  // Segue a edição ao vivo (store do editor) do slide aberto — a esteira por
  // baixo do editor já fica em dia, sem redesenhar nada ao fechar.
  const config = useEditorLiveConfig(item.id, item.config);
  useLayoutEffect(() => {
    setPoolReady(item.id, true);
    return () => setPoolReady(item.id, false);
  }, [item.id]);
  return (
    // Provider próprio: filtros cruzados do editor ou do modo Apresentação
    // não vazam pra miniatura.
    <SlideFilterProvider slideKey={`thumbnail:${item.id}`}>
      <ThumbnailCanvas config={config} slideId={item.id} />
    </SlideFilterProvider>
  );
}

const PooledThumbnailPortal = memo(function PooledThumbnailPortal({ item }: { item: CustomSlideItem }) {
  return createPortal(<PooledThumbnailContent item={item} />, poolHostElement(item.id));
});

/**
 * Mantém as miniaturas vivas. Montado uma vez pela página de Slides.
 * Os pedidos chegam pela fila escalonada (dentro de startTransition), por isso
 * o estado aqui é useState e não useSyncExternalStore — este último forçaria
 * cada miniatura nova a renderizar de forma síncrona, travando o quadro.
 */
export function SlideThumbnailPoolHost() {
  markPoolHostRendered();
  const items = useSlidesFlow((s) => s.items);
  const paused = useSlidesSafety((s) => s.thumbnailsPaused);
  const [, setVersion] = useState(0);

  useEffect(() => {
    const detach = attachPoolHost(() => setVersion((v) => v + 1));
    setVersion((v) => v + 1);
    return detach;
  }, []);

  // Slide excluído: solta a miniatura dele.
  useEffect(() => {
    prunePool(new Set(items.map((item) => item.id)));
  }, [items]);

  // Modo seguro (memória no limite): desmonta tudo; ao sair dele, as
  // miniaturas voltam pela fila escalonada, uma por quadro.
  const pausedIdsRef = useRef<string[]>([]);
  useEffect(() => {
    if (paused) {
      pausedIdsRef.current = suspendPoolRequests();
      return;
    }
    const ids = pausedIdsRef.current;
    pausedIdsRef.current = [];
    ids.forEach((id) => requestPooledThumbnail(id));
  }, [paused]);

  if (paused) return null;
  return (
    <>
      {items.map((item) => (item.kind === "custom" && isPoolRequested(item.id)
        ? <PooledThumbnailPortal key={item.id} item={item} />
        : null))}
    </>
  );
}

/** Encaixe: o lugar da lista onde a miniatura compartilhada aparece. */
export function PooledSlideThumbnail({
  item,
  previewW,
  layer,
  priority,
}: {
  item: CustomSlideItem;
  previewW: number;
  layer: ThumbnailLayer;
  priority: boolean;
}) {
  const slotRef = useRef<HTMLDivElement>(null);
  const ready = usePooledReady(item.id);
  // Outro encaixe do mesmo slide pode estar com a miniatura (camada acima).
  const [owns, setOwns] = useState(false);
  const id = item.id;

  useLayoutEffect(() => {
    const el = slotRef.current;
    if (!el) return;
    return registerPoolSlot(id, el, layer, setOwns);
  }, [id, layer]);

  useEffect(() => {
    requestPooledThumbnail(id, priority);
  }, [id, priority]);

  const factor = previewW / CANVAS_W;
  return (
    <div
      className="overflow-hidden rounded-lg border border-border/40 bg-white"
      style={{
        width: previewW,
        height: CANVAS_H * factor,
        position: "relative",
        // O navegador pula layout/pintura de miniaturas fora da tela.
        contentVisibility: "auto",
      }}
    >
      {/* Sem filhos do React: o conteúdo é o host movido para cá. */}
      <div
        ref={slotRef}
        style={{
          width: CANVAS_W,
          height: CANVAS_H,
          transform: `scale(${factor})`,
          transformOrigin: "top left",
          position: "absolute",
          top: 0,
          left: 0,
          pointerEvents: "none",
        }}
      />
      {!(ready && owns) && (
        <div aria-hidden className="absolute inset-0 flex items-center justify-center bg-muted/35">
          <div className="h-6 w-24 rounded-full bg-background/60" />
        </div>
      )}
    </div>
  );
}
