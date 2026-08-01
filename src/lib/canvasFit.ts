import { CANVAS_H, CANVAS_W } from "./customSlide";

export function fitCanvasScale(
  availableWidth: number,
  availableHeight: number,
  options: { safetyMultiplier?: number; minScale?: number } = {},
): number {
  const safetyMultiplier = options.safetyMultiplier ?? 1;
  const minScale = options.minScale ?? 0.1;
  const widthScale = availableWidth / CANVAS_W;
  const heightScale = availableHeight / CANVAS_H;
  const scale = Math.min(widthScale, heightScale) * safetyMultiplier;
  return scale > 0 ? scale : minScale;
}
