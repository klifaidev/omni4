// Log de alterações da sala de colaboração: persistência local + descrição
// legível para cada CollabEvent recebido.
import type { CollabEvent } from "@/lib/collaboration";
import type { SlideItem } from "@/lib/slidesFlow";
import { metaOf } from "@/lib/slidesFlow";
import { useSlidesFlow } from "@/store/slidesFlow";

export interface ChangeLogEntry {
  eventId: string;
  type: string;
  userId: string;
  userName: string;
  userColor?: string;
  ts: number;
  description: string;
}

const STORAGE_KEY = "slides-change-log-v1";
const MAX_ENTRIES = 100;

const listeners = new Set<() => void>();

export function readLog(): ChangeLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as ChangeLogEntry[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function write(entries: ChangeLogEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    /* noop */
  }
  for (const l of listeners) l();
}

export function clearLog(): void {
  write([]);
}

export function subscribeLog(handler: () => void): () => void {
  listeners.add(handler);
  return () => { listeners.delete(handler); };
}

function describe(event: CollabEvent, userName: string): string {
  switch (event.type) {
    case "add_item": {
      const item = event.payload as SlideItem;
      const label = item?.label ?? (item?.kind ? metaOf(item.kind).title : "slide");
      return `${userName} adicionou ${label}`;
    }
    case "remove_item": {
      const p = event.payload as { id: string };
      const items = useSlidesFlow.getState().items;
      const idx = items.findIndex((i) => i.id === p.id);
      return `${userName} removeu slide ${idx >= 0 ? idx + 1 : ""}`.trim();
    }
    case "update_item":
      return `${userName} editou um slide`;
    case "update_custom_slide":
      return `${userName} editou um slide personalizado`;
    case "duplicate_item":
      return `${userName} duplicou um slide`;
    case "reorder_items":
      return `${userName} reordenou slides`;
    case "clear_items":
      return `${userName} limpou a esteira`;
    case "load_snapshot":
      return `${userName} carregou um snapshot`;
    case "comment_add":
      return `${userName} comentou em um slide`;
    case "comment_update":
      return `${userName} editou um comentário`;
    case "comment_resolve":
      return `${userName} resolveu um comentário`;
    case "comment_reopen":
      return `${userName} reabriu um comentário`;
    case "comment_delete":
      return `${userName} excluiu um comentário`;
    case "bring_to_slide":
      return `${userName} chamou participantes para um slide`;
    case "notify_host_update":
      return `${userName} notificou o host sobre versão`;
    case "update_transition": {
      const p = event.payload as { transition: string };
      return `${userName} mudou transição para ${p.transition}`;
    }
    default:
      return `${userName} fez uma alteração`;
  }
}

export function recordEvent(
  event: CollabEvent,
  userName: string,
  userColor?: string,
): void {
  const eventId = event.id ?? `${event.userId}-${event.ts}-${event.type}`;
  const entries = readLog();
  if (entries.some((e) => e.eventId === eventId)) return; // dedupe
  const entry: ChangeLogEntry = {
    eventId,
    type: event.type,
    userId: event.userId,
    userName,
    userColor,
    ts: event.ts,
    description: describe(event, userName),
  };
  write([...entries, entry]);
}
