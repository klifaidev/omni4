// Comentários por slide — armazenamento local + sincronização opcional via
// Supabase Realtime broadcast no mesmo canal da sala de colaboração.
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface SlideComment {
  id: string;
  slideId: string;
  author: string;
  authorColor: string;
  text: string;
  createdAt: number;
  resolved: boolean;
}

const STORAGE_KEY = "slides-comments-v1";
type CommentMap = Record<string, SlideComment[]>;

const listeners = new Set<() => void>();

function read(): CommentMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CommentMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function write(map: CommentMap): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* noop */
  }
  for (const l of listeners) l();
}

export function getComments(slideId: string): SlideComment[] {
  const all = read();
  return [...(all[slideId] ?? [])].sort((a, b) => a.createdAt - b.createdAt);
}

export function getUnresolvedCount(slideId: string): number {
  return getComments(slideId).filter((c) => !c.resolved).length;
}

export function addComment(c: SlideComment): void {
  const map = read();
  const list = map[c.slideId] ?? [];
  if (list.some((x) => x.id === c.id)) return; // dedupe (broadcast echo)
  map[c.slideId] = [...list, c];
  write(map);
}

export function resolveComment(slideId: string, commentId: string): void {
  const map = read();
  const list = map[slideId];
  if (!list) return;
  map[slideId] = list.map((c) =>
    c.id === commentId ? { ...c, resolved: true } : c,
  );
  write(map);
}

export function subscribe(handler: () => void): () => void {
  listeners.add(handler);
  return () => { listeners.delete(handler); };
}

// ===== Sync via Supabase Realtime =====
export function broadcastComment(channel: RealtimeChannel, comment: SlideComment): void {
  channel.send({ type: "broadcast", event: "comment", payload: comment });
}

export function subscribeToComments(
  channel: RealtimeChannel,
  handler: (c: SlideComment) => void,
): void {
  channel.on("broadcast", { event: "comment" }, ({ payload }) => {
    handler(payload as SlideComment);
  });
}
