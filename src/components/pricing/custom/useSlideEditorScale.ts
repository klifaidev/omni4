import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { fitCanvasScale } from "@/lib/canvasFit";
import { getEditorPrefs, setEditorPrefs, useEditorPrefs } from "./editorPrefs";

export function useSlideEditorScale(
  wrapperRef: RefObject<HTMLDivElement>,
  canvasShellRef: RefObject<HTMLDivElement>,
) {
  const prefs = useEditorPrefs();
  const [fitScale, setFitScale] = useState(1);

  useLayoutEffect(() => {
    function compute() {
      const el = wrapperRef.current;
      if (!el) return;
      const styles = getComputedStyle(el);
      const paddingX = parseFloat(styles.paddingLeft || "0") + parseFloat(styles.paddingRight || "0");
      const paddingY = parseFloat(styles.paddingTop || "0") + parseFloat(styles.paddingBottom || "0");
      const shellStyles = canvasShellRef.current ? getComputedStyle(canvasShellRef.current) : null;
      const shellMarginY = shellStyles
        ? parseFloat(shellStyles.marginTop || "0") + parseFloat(shellStyles.marginBottom || "0")
        : 24;
      const availW = Math.max(el.clientWidth - paddingX, 100);
      const availH = Math.max(el.clientHeight - paddingY - shellMarginY, 100);
      setFitScale(fitCanvasScale(availW, availH));
    }

    compute();
    const ro = new ResizeObserver(compute);
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, [canvasShellRef, wrapperRef]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const shell = canvasShellRef.current;
      const currentZoom = getEditorPrefs().zoom;
      const nextZoom = Math.min(1.5, Math.max(0.5, currentZoom + (e.deltaY > 0 ? -0.08 : 0.08)));
      if (nextZoom === currentZoom) return;

      const oldScale = fitScale * currentZoom;
      const nextScale = fitScale * nextZoom;
      const shellRect = shell?.getBoundingClientRect();
      const anchor = shellRect
        ? {
            x: (e.clientX - shellRect.left) / Math.max(0.001, oldScale),
            y: (e.clientY - shellRect.top) / Math.max(0.001, oldScale),
            clientX: e.clientX,
            clientY: e.clientY,
          }
        : null;

      setEditorPrefs({ zoom: nextZoom });

      if (!anchor || !shell) return;
      requestAnimationFrame(() => {
        const nextRect = shell.getBoundingClientRect();
        el.scrollLeft += (nextRect.left + anchor.x * nextScale) - anchor.clientX;
        el.scrollTop += (nextRect.top + anchor.y * nextScale) - anchor.clientY;
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [canvasShellRef, fitScale, wrapperRef]);

  const scale = fitScale * prefs.zoom;
  const scaleKey = Math.round(scale * 1000);

  return {
    fitScale,
    prefs,
    scale,
    scaleKey,
  };
}
