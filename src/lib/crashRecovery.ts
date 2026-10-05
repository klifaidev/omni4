// Recuperação depois que o processo visual do Electron cai (ex.: falta de
// memória). O processo principal grava o estado do crash em arquivo; aqui ele
// é lido UMA vez, antes do primeiro render, e a Tabela Dinâmica consulta pra
// decidir se abre em modo seguro — sem isso, a montagem persistida que acabou
// de derrubar o app era restaurada e recalculada sozinha, derrubando de novo.

export type PivotCrashBreadcrumb = {
  area: "pivot";
  mode: string;
  rows: string[];
  cols: string[];
  measures: number;
  rowHeaders: number;
  colHeaders: number;
  cells: number;
  heapMB: number | null;
};

export type CrashState = {
  reason: string;
  exitCode: number | null;
  route: string;
  at: string;
  breadcrumb: PivotCrashBreadcrumb | null;
};

/** Crash mais velho que isso não vale mais modo seguro. */
const CRASH_STATE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CONSUME_TIMEOUT_MS = 1500;

let pendingPivotCrash: CrashState | null = null;

function isCrashState(value: unknown): value is CrashState {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<CrashState>;
  return typeof v.route === "string" && typeof v.at === "string" && typeof v.reason === "string";
}

/**
 * Lê (e apaga) o estado do último crash. Chamado em main.tsx antes de montar
 * o app; nunca segura a abertura por mais de CONSUME_TIMEOUT_MS.
 */
export async function loadCrashState(): Promise<void> {
  const consume = window.electronAPI?.app?.consumeCrashState;
  if (!consume) return;
  try {
    const state = await Promise.race([
      consume(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), CONSUME_TIMEOUT_MS)),
    ]);
    if (!isCrashState(state)) return;
    const age = Date.now() - new Date(state.at).getTime();
    if (!(age >= 0 && age <= CRASH_STATE_MAX_AGE_MS)) return;
    if (state.route === "/detalhe") pendingPivotCrash = state;
  } catch (error) {
    console.warn("[crash-recovery] Falha ao ler o estado do último crash", error);
  }
}

/** Crash da Tabela Dinâmica ainda não resolvido pela pessoa, se houver. */
export function getPendingPivotCrash(): CrashState | null {
  return pendingPivotCrash;
}

export function resolvePendingPivotCrash(): void {
  pendingPivotCrash = null;
}

/** Rastro do tamanho da montagem — vai pro log do Electron se o app cair. */
export function sendPivotBreadcrumb(breadcrumb: PivotCrashBreadcrumb | null): void {
  try {
    window.electronAPI?.app?.breadcrumb?.(breadcrumb);
  } catch {
    // Rastro é só diagnóstico; nunca pode quebrar a tela.
  }
}

export function currentHeapMB(): number | null {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return memory ? Math.round(memory.usedJSHeapSize / 1e6) : null;
}
