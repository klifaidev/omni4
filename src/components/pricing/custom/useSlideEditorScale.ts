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
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setEditorPrefs({ zoom: Math.min(1.5, Math.max(0.5, getEditorPrefs().zoom + delta)) });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [wrapperRef]);

  const scale = fitScale * prefs.zoom;
  const scaleKey = Math.round(scale * 1000);

  return {
    fitScale,
    prefs,
    scale,
    scaleKey,
  };
}
