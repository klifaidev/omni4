// "Foto" de um slide para o PowerPoint e o PDF.
//
// Antes a foto era tirada pelo html2canvas, que REDESENHA a página por conta
// própria num canvas — e erra justamente o que o editor mostra certo:
//   • ignora `object-fit`: imagens com "conter/cobrir" saíam esticadas;
//   • posiciona o texto pela métrica da fonte e não pela do navegador: textos
//     desciam alguns pixels e eram cortados em caixas com `overflow: hidden`
//     (nomes dos cartões, a fonte do rodapé);
//   • relayout num iframe com a largura do slide: os pontos de quebra de tela
//     mudavam e caixas/grades ficavam diferentes do editor.
// Agora quem desenha é o próprio navegador (SVG foreignObject, via
// html-to-image): é o MESMO layout e a MESMA tipografia do editor. As fontes da
// página (Inter) e as imagens vão embutidas na foto. Se algo falhar, cai no
// html2canvas como rede de segurança.
import { toCanvas } from "html-to-image";
import html2canvas from "html2canvas";

function isExportHidden(node: unknown): boolean {
  if (!(node instanceof HTMLElement)) return false;
  return node.dataset.exportHide === "true" || node.dataset.html2canvasIgnore === "true";
}

async function captureWithHtml2Canvas(host: HTMLElement, scale: number): Promise<HTMLCanvasElement> {
  return html2canvas(host, {
    scale,
    useCORS: true,
    backgroundColor: "#FFFFFF",
    width: host.offsetWidth,
    height: host.offsetHeight,
    windowWidth: host.offsetWidth,
    windowHeight: host.offsetHeight,
    logging: false,
    ignoreElements: isExportHidden,
  });
}

export interface SlideCaptureResult {
  canvas: HTMLCanvasElement;
  /** Qual motor desenhou (para diagnóstico). */
  engine: "browser" | "html2canvas";
}

/**
 * Fotografa `host` (o slide montado fora da tela) em `scale` vezes o tamanho.
 * `host` pode estar posicionado fora da tela: a foto ignora a posição dele.
 */
export async function captureSlideCanvas(host: HTMLElement, scale: number): Promise<SlideCaptureResult> {
  const width = host.offsetWidth;
  const height = host.offsetHeight;
  try {
    const canvas = await toCanvas(host, {
      width,
      height,
      pixelRatio: scale,
      backgroundColor: "#FFFFFF",
      // O slide fica montado fora da tela (top negativo / left distante): na foto ele começa em 0,0.
      style: { position: "static", left: "0", top: "0", margin: "0", transform: "none" },
      filter: (node) => !isExportHidden(node),
      cacheBust: false,
      skipAutoScale: true,
    });
    return { canvas, engine: "browser" };
  } catch (err) {
    console.warn("[slideCapture] captura pelo navegador falhou; usando html2canvas.", err);
    return { canvas: await captureWithHtml2Canvas(host, scale), engine: "html2canvas" };
  }
}

/** Fallback explícito (usado quando a foto principal sai em branco). */
export function captureSlideCanvasLegacy(host: HTMLElement, scale: number): Promise<HTMLCanvasElement> {
  return captureWithHtml2Canvas(host, scale);
}
