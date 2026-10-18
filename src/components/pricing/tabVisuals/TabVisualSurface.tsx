// Superfície onde um visual da aba é desenhado no slide.
//
// - Tema: `.light` (o tema claro do app) + `.tab-visual-slide` (cor principal
//   da Harald, sem animação). O componente é o mesmo da aba; as cores vêm das
//   mesmas variáveis CSS, só que claras. A exportação (html2canvas) resolve
//   essas variáveis, inclusive em SVG.
// - Tamanho: gráficos (`fill`) ocupam o bloco inteiro. Visuais de grade/lista
//   (`fit`) são desenhados na largura da aba (`designWidth`) e reduzidos na
//   mesma proporção para caber no bloco — ficam iguais aos da aba em qualquer
//   tamanho de bloco, sem quebrar o layout.
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export type TabVisualLayout = "fill" | "fit";

export function TabVisualSurface({ layout, designWidth = 900, children }: {
  layout: TabVisualLayout;
  designWidth?: number;
  children: ReactNode;
}) {
  if (layout === "fill") {
    return <div className="light tab-visual-slide" style={{ width: "100%", height: "100%" }}>{children}</div>;
  }
  return <FitToBox designWidth={designWidth}>{children}</FitToBox>;
}

function FitToBox({ designWidth, children }: { designWidth: number; children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0, content: 0 });

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const measure = () => {
      const next = { w: outer.clientWidth, h: outer.clientHeight, content: inner.scrollHeight };
      setSize((prev) => (prev.w === next.w && prev.h === next.h && prev.content === next.content ? prev : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  const byWidth = size.w > 0 ? size.w / designWidth : 1;
  // A altura disponível na largura da aba; se o conteúdo for mais alto que
  // isso, reduz mais para caber inteiro.
  const minHeight = size.h > 0 ? size.h / byWidth : undefined;
  const scale = size.content > 0 && size.h > 0 ? Math.min(byWidth, size.h / size.content) : byWidth;
  const left = Math.max(0, (size.w - designWidth * scale) / 2);

  return (
    <div ref={outerRef} className="light tab-visual-slide" style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden" }}>
      <div
        ref={innerRef}
        style={{
          position: "absolute",
          top: 0,
          left,
          width: designWidth,
          minHeight,
          display: "flex",
          flexDirection: "column",
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          visibility: size.w > 0 ? "visible" : "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}
