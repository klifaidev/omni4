// Guarda de memória: impede que a tela chegue ao limite e caia.
//
// A cada poucos segundos olha a memória da tela (Chromium) e o tamanho do que
// está copiado no worker dos Slides. Perto do limite, libera sozinho o que dá
// para recalcular (cópias do worker, cálculos guardados, worker da Tabela
// Dinâmica) e avisa; no limite crítico, pausa as miniaturas da esteira — as
// maiores consumidoras — e oferece recarregar. Cada passo deixa um rastro que
// vai para o log do Electron se, mesmo assim, o app cair.
import { toast } from "sonner";
import { heapStats, sendRendererBreadcrumb, type SlidesCrashBreadcrumb } from "./crashRecovery";
import { releaseAllSlideWorkerRows, slideWorkerRowsHeld } from "./slideCalcWorkerClient";
import { clearSlideCalcCache } from "./slideCalcCache";
import { clearCustomTableCaches } from "./customTablePivot";
import { disposePivotWorker } from "./pivotWorkerClient";
import { useSlidesSafety } from "@/store/slidesSafety";
import { useSlidesFlow } from "@/store/slidesFlow";

export type MemoryLevel = "ok" | "high" | "critical";

/** Frações do limite da memória da tela. */
export const MEMORY_HIGH = 0.7;
export const MEMORY_CRITICAL = 0.85;
const CHECK_INTERVAL_MS = 4000;
const TOAST_COOLDOWN_MS = 2 * 60 * 1000;

export function memoryLevel(usedMB: number, limitMB: number): MemoryLevel {
  if (!(limitMB > 0)) return "ok";
  const ratio = usedMB / limitMB;
  if (ratio >= MEMORY_CRITICAL) return "critical";
  if (ratio >= MEMORY_HIGH) return "high";
  return "ok";
}

let started = false;
let lastLevel: MemoryLevel = "ok";
let lastToastAt = 0;

/** Rastro dos Slides para o log do Electron (vale também para ações pesadas). */
export function slidesBreadcrumb(action: string, extra?: Partial<SlidesCrashBreadcrumb>): void {
  const heap = heapStats();
  sendRendererBreadcrumb({
    area: "slides",
    action,
    heapMB: heap?.usedMB ?? null,
    heapLimitMB: heap?.limitMB ?? null,
    workerRows: slideWorkerRowsHeld(),
    slides: useSlidesFlow.getState().items.length,
    ...extra,
  });
}

/** Libera tudo que pode ser recalculado. Devolve uma frase do que foi feito. */
export function releaseRecomputableMemory(): string {
  const workerRows = slideWorkerRowsHeld();
  releaseAllSlideWorkerRows();
  clearSlideCalcCache();
  clearCustomTableCaches();
  // A Tabela Dinâmica aberta perderia o cálculo em andamento: só fora dela.
  if (!window.location.hash.startsWith("#/detalhe")) disposePivotWorker();
  return workerRows > 0
    ? `liberamos ${Math.round(workerRows / 1000).toLocaleString("pt-BR")} mil linhas copiadas e os cálculos guardados`
    : "liberamos os cálculos guardados";
}

function check() {
  const heap = heapStats();
  if (!heap) return;
  const level = memoryLevel(heap.usedMB, heap.limitMB);
  if (level === "ok") {
    lastLevel = level;
    return;
  }
  slidesBreadcrumb(`memória ${level}`);
  // Age só ao SUBIR de nível — não fica liberando a cada 4 s.
  if (level === lastLevel) return;
  lastLevel = level;
  const what = releaseRecomputableMemory();
  const now = Date.now();
  if (level === "critical") {
    useSlidesSafety.getState().pause("memory");
    toast.warning("Memória quase no limite", {
      description: `Para o app não fechar, ${what} e pausamos as miniaturas da esteira. Se continuar lento, recarregue.`,
      duration: 20000,
      action: { label: "Recarregar", onClick: () => window.location.reload() },
    });
    lastToastAt = now;
    return;
  }
  if (now - lastToastAt > TOAST_COOLDOWN_MS) {
    toast.info("Memória alta", { description: `Para manter o app estável, ${what}.`, duration: 8000 });
    lastToastAt = now;
  }
}

/** Liga o guarda (uma vez por sessão). Fora do Chromium, não faz nada. */
export function startMemoryGuard(): void {
  if (started || typeof window === "undefined" || !heapStats()) return;
  started = true;
  window.setInterval(check, CHECK_INTERVAL_MS);
}
