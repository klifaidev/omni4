// Realtime collaboration — Supabase Presence + Broadcast.
// O canal por sala faz duas coisas:
//  - Presence: lista de colaboradores conectados (+ posição do cursor)
//  - Broadcast "deck-op": eventos de mutação no deck (add/update/remove/...)
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface CollabUser {
  id: string;
  clientId?: string;
  name: string;
  color: string;
  role?: "host" | "editor" | "viewer";
  appVersion?: string;
  collabProtocolVersion?: number;
  slideId: string | null;
  currentSlideId?: string | null;
  currentSlideIndex?: number | null;
  activity?: "editing" | "presenting" | "idle";
  isFollowingHost?: boolean;
  cursorX?: number;
  cursorY?: number;
}

export type CollabEventType =
  | "add_item"
  | "update_item"
  | "remove_item"
  | "duplicate_item"
  | "reorder_items"
  | "clear_items"
  | "update_transition"
  | "load_snapshot"
  | "update_custom_slide"
  | "comment_add"
  | "comment_update"
  | "comment_resolve"
  | "comment_reopen"
  | "comment_delete"
  | "bring_to_slide"
  | "notify_host_update";

export interface CollabEvent {
  id?: string;
  type: CollabEventType;
  payload: unknown;
  userId: string;
  ts: number;
  role?: "host" | "editor" | "viewer";
}

export const CURSOR_COLORS: string[] = [
  "#E63946",
  "#457B9D",
  "#2A9D8F",
  "#E9C46A",
  "#F4A261",
  "#A8DADC",
  "#8338EC",
  "#06D6A0",
  "#FFB703",
  "#FB8500",
  "#3A86FF",
  "#FF006E",
];

export function createRoom(roomId: string, user: CollabUser): RealtimeChannel {
  // Não fazemos subscribe aqui — todos os `.on(...)` listeners precisam ser
  // registrados antes do subscribe. O caller chama `subscribeRoom(channel, user)`
  // depois de adicionar listeners de presence/broadcast.
  const channel = supabase.channel(`deck:${roomId}`, {
    config: { presence: { key: user.id } },
  });
  return channel;
}

export function subscribeRoom(
  channel: RealtimeChannel,
  user: CollabUser,
  onStatus?: (status: string) => void,
): void {
  channel.subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      await channel.track(user);
    }
    onStatus?.(status);
  });
}

const customSlideEventState = new WeakMap<RealtimeChannel, { last: number; pending: number | null; nextEvent: CollabEvent | null }>();

function sendBroadcastEvent(channel: RealtimeChannel, event: CollabEvent): void {
  channel.send({ type: "broadcast", event: "deck-op", payload: event });
}

export function broadcastEvent(channel: RealtimeChannel, event: CollabEvent): void {
  if (event.type !== "update_custom_slide") {
    sendBroadcastEvent(channel, event);
    return;
  }

  const now = Date.now();
  let s = customSlideEventState.get(channel);
  if (!s) {
    s = { last: 0, pending: null, nextEvent: null };
    customSlideEventState.set(channel, s);
  }
  const send = (next: CollabEvent) => {
    s!.last = Date.now();
    sendBroadcastEvent(channel, next);
  };
  if (now - s.last >= 60) {
    send(event);
    return;
  }
  s.nextEvent = event;
  if (s.pending !== null) return;
  s.pending = window.setTimeout(() => {
    s!.pending = null;
    const next = s!.nextEvent;
    s!.nextEvent = null;
    if (next) send(next);
  }, 60 - (now - s.last));
}

export function onEvent(
  channel: RealtimeChannel,
  handler: (event: CollabEvent) => void,
): () => void {
  let active = true;
  channel.on("broadcast", { event: "deck-op" }, ({ payload }) => {
    if (!active) return;
    handler(payload as CollabEvent);
  });
  return () => { active = false; };
}

export function onPresenceChange(
  channel: RealtimeChannel,
  handler: (users: CollabUser[]) => void,
): void {
  channel.on("presence", { event: "sync" }, () => {
    const state = channel.presenceState<CollabUser>();
    const users = Object.values(state).flat() as CollabUser[];
    handler(users);
  });
}

// Throttle do cursor — 60ms é suficientemente fluido sem saturar o canal.
const cursorState = new WeakMap<RealtimeChannel, { last: number; pending: number | null; nextArgs: { x: number; y: number; userId: string } | null }>();

export function updateCursor(
  channel: RealtimeChannel,
  x: number,
  y: number,
  userId: string,
): void {
  const now = Date.now();
  let s = cursorState.get(channel);
  if (!s) {
    s = { last: 0, pending: null, nextArgs: null };
    cursorState.set(channel, s);
  }
  const send = (xx: number, yy: number) => {
    s!.last = Date.now();
    // mantém o restante do presence; precisamos passar todos os campos
    // pois track substitui o snapshot. Usamos presenceState para pegar.
    const state = channel.presenceState<CollabUser>();
    const mine = (state[userId]?.[0] ?? null) as CollabUser | null;
    const next: CollabUser = mine
      ? { ...mine, cursorX: xx, cursorY: yy }
      : { id: userId, name: "", color: "#888", slideId: null, cursorX: xx, cursorY: yy };
    channel.track(next);
  };
  if (now - s.last >= 60) {
    send(x, y);
    return;
  }
  s.nextArgs = { x, y, userId };
  if (s.pending !== null) return;
  s.pending = window.setTimeout(() => {
    s!.pending = null;
    const args = s!.nextArgs;
    s!.nextArgs = null;
    if (args) send(args.x, args.y);
  }, 60 - (now - s.last));
}

export function updatePresence(
  channel: RealtimeChannel,
  userId: string,
  patch: Partial<CollabUser>,
): void {
  const state = channel.presenceState<CollabUser>();
  const mine = (state[userId]?.[0] ?? null) as CollabUser | null;
  const next: CollabUser = mine
    ? { ...mine, ...patch }
    : {
      id: userId,
      clientId: userId,
      name: "",
      color: "#888",
      slideId: null,
      ...patch,
    };
  channel.track(next);
}

export function leaveRoom(channel: RealtimeChannel): void {
  try {
    channel.untrack();
  } catch {
    /* noop */
  }
  supabase.removeChannel(channel);
}
