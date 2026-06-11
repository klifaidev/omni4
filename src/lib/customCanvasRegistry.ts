// Registry global de refs dos canvases dos Slides Personalizados.
// Populado pelo CustomSlideEditor quando montado e consumido pelo
// exportCustomSlide para capturar o DOM real (já com Recharts/SVG layout
// completo, dados dos stores, fontes, etc.).

const REGISTRY = new Map<string, HTMLDivElement>();

export function registerCustomCanvas(id: string, el: HTMLDivElement | null) {
  if (el) REGISTRY.set(id, el);
  else REGISTRY.delete(id);
}

export function getCustomCanvas(id: string): HTMLDivElement | undefined {
  return REGISTRY.get(id);
}
