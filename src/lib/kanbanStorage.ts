// Persistência das Atividades — mesma proteção da esteira de Slides.
//
// No app instalado (Electron) o estado vive num ARQUIVO no disco, gravado pelo
// processo principal (electron/fileStore.js): escrita atômica, backups em
// rodízio e um instantâneo por dia. No navegador/dev-server cai no localStorage,
// agora também com backup e sem engolir falha.
//
// Regras que valem nos dois:
//  - falha de gravação nunca é silenciosa: o status real (salvando / salvo /
//    erro) é publicado e a tela mostra um aviso persistente;
//  - se o que está salvo NÃO pôde ser lido, nada é gravado por cima (começar
//    do zero e gravar apagaria as atividades de verdade);
//  - arquivo ilegível → volta sozinho do backup mais recente legível;
//  - quem ainda tem as atividades só no localStorage (versão anterior) migra
//    para o arquivo uma única vez, sem apagar a origem.
import { toast } from "sonner";
import type { KanbanState } from "./kanban";

export const KANBAN_STORAGE_KEY = "harald.kanban.v1";
const LOCAL_BACKUP_KEY = "harald.kanban.v1.backup";
const LOCAL_BACKUP_LIMIT = 3;
/** Mínimo entre dois backups no navegador (gravar a cada tecla não vira 3 cópias idênticas). */
const LOCAL_BACKUP_MIN_INTERVAL_MS = 60_000;
/** Quanto a abertura espera o disco responder antes de tratar a leitura como falha. */
const HYDRATE_TIMEOUT_MS = 8_000;

export interface ElectronKanbanAPI {
  ler: (key: string) => Promise<{ ok: boolean; value?: string | null; erro?: string }>;
  salvar: (key: string, value: string) => Promise<{ ok: boolean; erro?: string }>;
  remover: (key: string) => Promise<{ ok: boolean; erro?: string }>;
  ultimoBackup: (key: string) => Promise<{ ok: boolean; value?: string | null; erro?: string }>;
}

export type KanbanSaveStatus = "idle" | "saving" | "saved" | "error";
export type KanbanStorageMode = "disk" | "browser";

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------
let status: KanbanSaveStatus = "idle";
let statusError: string | null = null;
const listeners = new Set<(s: KanbanSaveStatus, error: string | null) => void>();

function report(next: KanbanSaveStatus, error: string | null = null): void {
  const changed = next !== status || error !== statusError;
  status = next;
  statusError = error;
  if (changed) listeners.forEach((cb) => cb(next, error));
}

export function getKanbanSaveStatus(): KanbanSaveStatus {
  return status;
}

export function getKanbanSaveInfo(): { status: KanbanSaveStatus; error: string | null; mode: KanbanStorageMode; blocked: boolean } {
  return { status, error: statusError, mode, blocked: blockedReason !== null };
}

/** Devolve uma função para cancelar a inscrição. */
export function subscribeKanbanSaveStatus(cb: (s: KanbanSaveStatus, error: string | null) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Há uma falha de gravação já avisada com toast e ainda sem nenhuma gravação boa depois dela. */
let failureAnnounced = false;

/** Avisa uma vez por sequência de falhas (o aviso fixo na tela cuida do resto). */
function announceFailure(mode_: KanbanStorageMode): void {
  if (failureAnnounced) return;
  failureAnnounced = true;
  toastSaveFailure(mode_);
}

function toastSaveFailure(mode_: KanbanStorageMode): void {
  toast.error("Não foi possível salvar as atividades", {
    description: mode_ === "disk"
      ? "As mudanças desta sessão podem se perder ao fechar o app. Baixe uma cópia pelo aviso na tela de Atividades."
      : "As mudanças desta sessão podem se perder ao fechar o app. Tente liberar espaço no navegador ou salvar de novo em instantes.",
    duration: 10000,
  });
}

// ---------------------------------------------------------------------------
// Leitura / validação
// ---------------------------------------------------------------------------
/** Estado válido ou null. Estrutura mínima — o suficiente para a tela não quebrar. */
export function parseKanbanState(raw: string | null | undefined): KanbanState | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { columns?: unknown; cards?: unknown } | null;
    if (!value || typeof value !== "object") return null;
    if (!Array.isArray(value.columns)) return null;
    if (!value.cards || typeof value.cards !== "object" || Array.isArray(value.cards)) return null;
    for (const column of value.columns as Array<{ id?: unknown; cardIds?: unknown } | null>) {
      if (!column || typeof column.id !== "string" || !Array.isArray(column.cardIds)) return null;
    }
    return value as KanbanState;
  } catch {
    return null;
  }
}

function safeLocalGet(key: string): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

function localBackups(): Array<{ createdAt: number; value: string }> {
  try {
    const parsed = JSON.parse(safeLocalGet(LOCAL_BACKUP_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is { createdAt: number; value: string } =>
      !!entry && typeof entry.value === "string" && parseKanbanState(entry.value) !== null);
  } catch {
    return [];
  }
}

function pushLocalBackup(raw: string): void {
  try {
    const existing = localBackups();
    if (existing[0]?.value === raw) return;
    if (existing[0] && Date.now() - existing[0].createdAt < LOCAL_BACKUP_MIN_INTERVAL_MS) return;
    const next = [{ createdAt: Date.now(), value: raw }, ...existing].slice(0, LOCAL_BACKUP_LIMIT);
    for (let keep = next.length; keep > 0; keep -= 1) {
      try {
        localStorage.setItem(LOCAL_BACKUP_KEY, JSON.stringify(next.slice(0, keep)));
        return;
      } catch (error) {
        if (keep === 1) throw error;
      }
    }
  } catch (error) {
    console.warn("[kanban] Backup local não coube no armazenamento; atividades principais preservadas.", error);
  }
}

// ---------------------------------------------------------------------------
// Estado do motor
// ---------------------------------------------------------------------------
let mode: KanbanStorageMode = "browser";
let api: ElectronKanbanAPI | null = null;
/** Modo disco: o conteúdo atual (o que loadState lê, mesmo antes do IPC terminar). */
let cacheRaw: string | null = null;
/** Último conteúdo que sabemos estar salvo/enfileirado — para descartar gravações idênticas. */
let lastRaw: string | null = null;
/** Preenchido quando o que estava salvo não pôde ser lido: gravar por cima apagaria tudo. */
let blockedReason: string | null = null;
let hydrated = false;
let pendingRaw: string | null = null;
let flushing = false;

function getApi(): ElectronKanbanAPI | null {
  return typeof window !== "undefined" ? window.electronAPI?.kanban ?? null : null;
}

/** Texto salvo, para quem lê (loadState). */
export function readKanbanRaw(): string | null {
  if (mode === "disk") return cacheRaw;
  const raw = safeLocalGet(KANBAN_STORAGE_KEY);
  if (raw === null || parseKanbanState(raw)) return raw;
  // Presente, mas ilegível: volta do backup mais recente legível.
  const backup = localBackups()[0];
  if (!backup) return raw;
  try {
    localStorage.setItem(KANBAN_STORAGE_KEY, backup.value);
  } catch {
    /* só leitura nesta sessão */
  }
  console.warn("[kanban] Atividades ilegíveis no navegador; backup local restaurado automaticamente.");
  return backup.value;
}

// ---------------------------------------------------------------------------
// Abertura (modo disco)
// ---------------------------------------------------------------------------
async function hydrateFromDisk(a: ElectronKanbanAPI, isCurrent: () => boolean): Promise<void> {
  let read: Awaited<ReturnType<ElectronKanbanAPI["ler"]>>;
  try {
    read = await a.ler(KANBAN_STORAGE_KEY);
  } catch (error) {
    read = { ok: false, erro: describeError(error) };
  }
  if (!isCurrent()) return;

  if (read.ok && parseKanbanState(read.value)) {
    cacheRaw = read.value as string;
    lastRaw = cacheRaw;
    return;
  }

  if (!read.ok) {
    // Não sabemos o que há no disco: mostrar o que for possível (backup ou
    // versão antiga), mas NÃO gravar nada por cima.
    blockedReason = `Não foi possível ler as atividades salvas no disco (${read.erro ?? "erro desconhecido"}). Para não apagar nada, as mudanças não serão gravadas nesta sessão. Feche e abra o app de novo.`;
    console.error("[kanban] Falha ao ler as atividades do disco.", read.erro);
    const backup = await safeBackup(a);
    const legacy = safeLocalGet(KANBAN_STORAGE_KEY);
    cacheRaw = parseKanbanState(backup) ? backup : parseKanbanState(legacy) ? legacy : null;
    report("error", blockedReason);
    return;
  }

  // Arquivo ausente (primeira vez) ou ilegível. Ordem: backup em disco (é o
  // mais recente), depois a versão antiga do localStorage (migração única).
  const hadBrokenFile = typeof read.value === "string" && read.value.trim() !== "";
  if (hadBrokenFile) console.error("[kanban] Arquivo de atividades ilegível; procurando backup.");

  const backup = await safeBackup(a);
  if (!isCurrent()) return;
  if (parseKanbanState(backup)) {
    cacheRaw = backup as string;
    lastRaw = cacheRaw;
    const saved = await safeSave(a, cacheRaw);
    if (!isCurrent()) return;
    if (!saved.ok) report("error", saved.erro ?? "Falha ao regravar as atividades restauradas.");
    console.warn("[kanban] Atividades restauradas do backup em disco.");
    toast.info("Atividades restauradas do último backup", {
      description: "O arquivo salvo estava ilegível; voltamos para a cópia mais recente.",
      duration: 8000,
    });
    return;
  }

  const legacy = safeLocalGet(KANBAN_STORAGE_KEY);
  if (parseKanbanState(legacy)) {
    cacheRaw = legacy as string;
    lastRaw = cacheRaw;
    const saved = await safeSave(a, cacheRaw);
    if (!isCurrent()) return;
    if (saved.ok) {
      console.warn("[kanban] Atividades migradas do localStorage (armazenamento antigo) para arquivo em disco.");
    } else {
      lastRaw = null;
      report("error", saved.erro ?? "Falha ao migrar as atividades para o disco.");
    }
    return;
  }

  cacheRaw = null; // nada salvo ainda: começa do zero
  lastRaw = null;
}

async function safeBackup(a: ElectronKanbanAPI): Promise<string | null> {
  try {
    const result = await a.ultimoBackup(KANBAN_STORAGE_KEY);
    return result.ok ? result.value ?? null : null;
  } catch {
    return null;
  }
}

async function safeSave(a: ElectronKanbanAPI, value: string): Promise<{ ok: boolean; erro?: string }> {
  try {
    return await a.salvar(KANBAN_STORAGE_KEY, value);
  } catch (error) {
    return { ok: false, erro: describeError(error) };
  }
}

/**
 * Prepara o armazenamento antes do primeiro render. Nunca rejeita: qualquer
 * falha vira status de erro + gravação bloqueada, nunca perda silenciosa.
 */
export async function hydrateKanban(): Promise<void> {
  if (hydrated) return;
  const a = getApi();
  if (!a) {
    mode = "browser";
    hydrated = true;
    return;
  }
  api = a;
  mode = "disk";
  let abandoned = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      hydrateFromDisk(a, () => !abandoned),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("tempo esgotado ao ler do disco")), HYDRATE_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    abandoned = true;
    blockedReason = `Não foi possível ler as atividades salvas no disco (${describeError(error)}). Para não apagar nada, as mudanças não serão gravadas nesta sessão. Feche e abra o app de novo.`;
    console.error("[kanban] Abertura das atividades falhou.", error);
    report("error", blockedReason);
  } finally {
    clearTimeout(timer);
  }
  hydrated = true;
}

// ---------------------------------------------------------------------------
// Gravação
// ---------------------------------------------------------------------------
async function flushToDisk(): Promise<void> {
  if (flushing || !api) return;
  flushing = true;
  try {
    while (pendingRaw !== null) {
      const value = pendingRaw;
      pendingRaw = null;
      const result = await safeSave(api, value);
      if (result.ok) {
        failureAnnounced = false;
        if (pendingRaw === null) report("saved");
        continue;
      }
      lastRaw = null; // a próxima gravação idêntica precisa tentar de novo
      if (pendingRaw === null) {
        console.error("[kanban] Falha ao salvar as atividades em disco — as alterações NÃO foram persistidas.", result.erro);
        report("error", result.erro ?? "Falha desconhecida ao salvar as atividades.");
        announceFailure("disk");
      }
    }
  } finally {
    flushing = false;
  }
}

function writeToBrowser(raw: string): boolean {
  try {
    const previous = localStorage.getItem(KANBAN_STORAGE_KEY);
    if (previous && previous !== raw && parseKanbanState(previous)) pushLocalBackup(previous);
    localStorage.setItem(KANBAN_STORAGE_KEY, raw);
    lastRaw = raw;
    failureAnnounced = false;
    report("saved");
    return true;
  } catch (error) {
    lastRaw = null;
    console.error("[kanban] falha ao salvar atividades:", error);
    report("error", describeError(error));
    announceFailure("browser");
    return false;
  }
}

/** Único ponto que grava as atividades. Devolve false se a gravação foi recusada/falhou de imediato. */
export function persistKanbanState(state: KanbanState): boolean {
  if (blockedReason) {
    report("error", blockedReason);
    return false;
  }
  const raw = JSON.stringify(state);
  if (raw === lastRaw && status !== "error") return true;
  if (mode === "disk" && api) {
    cacheRaw = raw;
    lastRaw = raw;
    pendingRaw = raw;
    report("saving");
    void flushToDisk();
    return true;
  }
  return writeToBrowser(raw);
}

/** "Tentar salvar de novo": regrava o estado mesmo que seja igual ao último. */
export function retryKanbanSave(state: KanbanState): boolean {
  lastRaw = null;
  return persistKanbanState(state);
}

/** Conteúdo para o usuário baixar como cópia de segurança. */
export function serializeKanbanForExport(state: KanbanState): string {
  return JSON.stringify(state, null, 2);
}

/** Só para testes: volta o motor ao estado de fábrica. */
export function resetKanbanStorageForTest(): void {
  status = "idle";
  statusError = null;
  mode = "browser";
  api = null;
  cacheRaw = null;
  lastRaw = null;
  blockedReason = null;
  hydrated = false;
  pendingRaw = null;
  flushing = false;
  failureAnnounced = false;
}
