// Espera compartilhada antes de capturar um slide via html2canvas — usada
// tanto pelo export de PPTX (exportCustomSlide.tsx) quanto pelo de PDF
// (exportPdf.ts). Extraído para um único lugar depois de notar que os dois
// caminhos tinham implementações divergentes: o PPTX já esperava fontes,
// imagens e o SVG do gráfico terminar de pintar antes de capturar; o PDF
// só dava um `setTimeout` fixo de 350ms, o que arrisca capturar um gráfico
// ainda em branco como se fosse sucesso (falha silenciosa pior que um erro
// pego pelo try/catch). Ver "Doutrina do Editor" — Fase 1, fidelidade de
// exportação.

/** Nunca deixa uma promessa pendurar o export pra sempre — rejeita com uma
 *  mensagem clara depois de `ms`. Usada em toda espera de rede/recurso
 *  externo do fluxo de export (ver `getHaraldFooterDataUri` em exportPpt.ts):
 *  sem isso, uma conexão instável trava o botão de exportar indefinidamente,
 *  sem toast de erro nenhum — o board esperando e ninguém sabe por quê. */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitForFonts(): Promise<void> {
  const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
  if (!fonts?.ready) return;
  try {
    // document.fonts.ready normalmente resolve mesmo com fonte 404, mas não
    // é garantido em todo engine — 5s de teto pra nunca travar o export.
    await withTimeout(fonts.ready, 5000, "Tempo esgotado esperando as fontes carregarem.");
  } catch {
    // Segue a captura mesmo assim — uma fonte não carregada é um problema
    // cosmético menor, travar o export inteiro por causa dela não vale a pena.
  }
}

async function waitForImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(images.map(async (img) => {
    if (img.complete && img.naturalWidth > 0) return;
    if (typeof img.decode === "function") {
      try {
        await img.decode();
        return;
      } catch {
        // Algumas imagens data/blob rejeitam decode, mas ainda pintam no browser.
      }
    }
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
      setTimeout(done, 1500);
    });
  }));
}

function hasRenderableSvgGeometry(root: HTMLElement): boolean {
  const svgs = Array.from(root.querySelectorAll("svg"));
  if (svgs.length === 0) return true;
  return svgs.every((svg) => {
    const box = svg.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return false;
    return !!svg.querySelector(
      "path[d], rect, circle, ellipse, line, polyline, polygon, text, tspan",
    );
  });
}

async function waitForChartPaint(root: HTMLElement): Promise<void> {
  // Recharts e blocos Omni dependem de ResizeObserver + paint assíncrono.
  for (let i = 0; i < 50; i++) {
    await nextFrame();
    if (hasRenderableSvgGeometry(root)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** Espera fontes, imagens e SVGs de gráfico estarem prontos pra captura.
 *  Sempre espera pelo menos um `baseDelayMs` inicial (o React precisa de um
 *  tick pra montar; workers/observers precisam de outro pra disparar). */
export async function waitForCaptureReady(root: HTMLElement, baseDelayMs = 500): Promise<void> {
  await new Promise((r) => setTimeout(r, baseDelayMs));
  await waitForFonts();
  await waitForImages(root);
  await waitForChartPaint(root);
  await nextFrame();
  await nextFrame();
}
