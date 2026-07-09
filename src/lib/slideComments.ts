// Comentarios por slide: armazenamento local e cache de UI para salas persistentes.
import type { CollabEventType } from "@/lib/collaboration";

export interface SlideComment {
  id: string;
  slideId: string;
  blockId?: string | null;
  author: string;
  authorColor: string;
  text: string;
  createdAt: number;
  updatedAt?: number;
  resolved: boolean;
}

export type SlideCommentEventType = Extract<
  CollabEventType,
  "comment_add" | "comment_update" | "comment_resolve" | "comment_reopen" | "comment_delete"
>;

export interface SlideCommentEvent {
  type: SlideCommentEventType;
  comment: SlideComment;
  at: number;
}

const STORAGE_KEY = "slides-comments-v1";
let activeStorageKey = STORAGE_KEY;
type CommentMap = Record<string, SlideComment[]>;

const listeners = new Set<() => void>();

function read(): CommentMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(activeStorageKey);
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
    localStorage.setItem(activeStorageKey, JSON.stringify(map));
  } catch {
    /* noop */
  }
  for (const listener of listeners) listener();
}

export function setCommentStorageScope(roomPublicId: string | null): void {
  activeStorageKey = roomPublicId ? `${STORAGE_KEY}:room:${roomPublicId}` : STORAGE_KEY;
  for (const listener of listeners) listener();
}

export function getComments(slideId: string): SlideComment[] {
  const all = read();
  return [...(all[slideId] ?? [])].sort((a, b) => a.createdAt - b.createdAt);
}

export function getUnresolvedCount(slideId: string): number {
  return getComments(slideId).filter((comment) => !comment.resolved).length;
}

export function addComment(comment: SlideComment): void {
  const map = read();
  const list = map[comment.slideId] ?? [];
  if (list.some((item) => item.id === comment.id)) return;
  map[comment.slideId] = [...list, comment];
  write(map);
}

export function upsertComment(comment: SlideComment): void {
  const map = read();
  const list = map[comment.slideId] ?? [];
  map[comment.slideId] = list.some((item) => item.id === comment.id)
    ? list.map((item) => (item.id === comment.id ? { ...item, ...comment } : item))
    : [...list, comment];
  write(map);
}

export function replaceComments(comments: SlideComment[]): void {
  const map: CommentMap = {};
  for (const comment of comments) {
    if (!map[comment.slideId]) map[comment.slideId] = [];
    map[comment.slideId].push(comment);
  }
  write(map);
}

export function resolveComment(slideId: string, commentId: string): void {
  const map = read();
  const list = map[slideId];
  if (!list) return;
  map[slideId] = list.map((comment) =>
    comment.id === commentId ? { ...comment, resolved: true, updatedAt: Date.now() } : comment,
  );
  write(map);
}

export function reopenComment(slideId: string, commentId: string): void {
  const map = read();
  const list = map[slideId];
  if (!list) return;
  map[slideId] = list.map((comment) =>
    comment.id === commentId ? { ...comment, resolved: false, updatedAt: Date.now() } : comment,
  );
  write(map);
}

export function updateComment(slideId: string, commentId: string, text: string): void {
  const map = read();
  const list = map[slideId];
  if (!list) return;
  map[slideId] = list.map((comment) =>
    comment.id === commentId ? { ...comment, text, updatedAt: Date.now() } : comment,
  );
  write(map);
}

export function deleteComment(slideId: string, commentId: string): void {
  const map = read();
  const list = map[slideId];
  if (!list) return;
  map[slideId] = list.filter((comment) => comment.id !== commentId);
  write(map);
}

export function applyCommentEvent(event: SlideCommentEvent): void {
  switch (event.type) {
    case "comment_add":
    case "comment_update":
      upsertComment(event.comment);
      break;
    case "comment_resolve":
      upsertComment({ ...event.comment, resolved: true, updatedAt: event.at });
      break;
    case "comment_reopen":
      upsertComment({ ...event.comment, resolved: false, updatedAt: event.at });
      break;
    case "comment_delete":
      deleteComment(event.comment.slideId, event.comment.id);
      break;
  }
}

export function subscribe(handler: () => void): () => void {
  listeners.add(handler);
  return () => {
    listeners.delete(handler);
  };
}
