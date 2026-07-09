import { useEffect, useRef, useState, useCallback } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { toast } from "sonner";
import {
  createRoom,
  subscribeRoom,
  leaveRoom,
  broadcastEvent,
  onEvent,
  onPresenceChange,
  updateCursor as updateCursorRaw,
  CURSOR_COLORS,
  type CollabUser,
  type CollabEvent,
} from "@/lib/collaboration";
import { useSlidesFlow } from "@/store/slidesFlow";
import { recordEvent } from "@/lib/slideChangeLog";
import { applyCommentEvent, type SlideCommentEvent } from "@/lib/slideComments";
import type { SlideItem } from "@/lib/slidesFlow";
import type { PersistentCollabRole } from "@/lib/persistentCollab";
import type { SlideTransition } from "@/store/slidesFlow";

interface UseCollabReturn {
  collaborators: CollabUser[];
  isConnected: boolean;
  broadcast: (e: CollabEvent) => void;
  updateCursor: (x: number, y: number) => void;
  updateSlideId: (slideId: string | null) => void;
  broadcastComment: (event: SlideCommentEvent) => void;
  userId: string | null;
}

export function useCollaboration(
  roomId: string | null,
  userName: string,
  role: PersistentCollabRole | null = null,
): UseCollabReturn {
  const [collaborators, setCollaborators] = useState<CollabUser[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const userIdRef = useRef<string | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const collaboratorsByIdRef = useRef<Map<string, CollabUser>>(new Map());
  const userMetaRef = useRef<CollabUser | null>(null);
  const userNameRef = useRef(userName);
  const roleRef = useRef<PersistentCollabRole | null>(role);
  const seenEventIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    userNameRef.current = userName;
  }, [userName]);

  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  // Effect 1: cria/destroi o canal quando roomId muda.
  // userName nao e dependencia; evita recriar o canal ao editar o nome.
  useEffect(() => {
    if (!roomId) return;
    const userId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `u_${Math.random().toString(36).slice(2, 10)}`;
    userIdRef.current = userId;
    knownIdsRef.current = new Set([userId]);
    // Cor estavel por hash do userId
    let h = 0;
    for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
    const color = CURSOR_COLORS[h % CURSOR_COLORS.length];

    const user: CollabUser = {
      id: userId,
      name: userNameRef.current || "Convidado",
      color,
      slideId: null,
    };
    userMetaRef.current = user;

    const channel = createRoom(roomId, user);
    channelRef.current = channel;

    onPresenceChange(channel, (users) => {
      setCollaborators(users);
      const currentIds = new Set(users.map((u) => u.id));
      const prev = knownIdsRef.current;
      for (const u of users) {
        if (u.id === userId) continue;
        if (!prev.has(u.id)) {
          toast.info(`${u.name} entrou na sala`, { duration: 2500 });
        }
      }
      for (const id of prev) {
        if (id === userId) continue;
        if (!currentIds.has(id)) {
          const gone = collaboratorsByIdRef.current.get(id);
          toast.info(`${gone?.name ?? "Colaborador"} saiu`, { duration: 2000 });
        }
      }
      const byId = new Map<string, CollabUser>();
      for (const u of users) byId.set(u.id, u);
      collaboratorsByIdRef.current = byId;
      knownIdsRef.current = currentIds;
    });

    const offEvent = onEvent(channel, (event) => {
      if (event.userId === userId) return;
      if (event.role === "viewer") return;
      const eventId = event.id ?? `${event.userId}-${event.ts}-${event.type}`;
      if (seenEventIdsRef.current.has(eventId)) return;
      seenEventIdsRef.current.add(eventId);
      if (seenEventIdsRef.current.size > 500) {
        seenEventIdsRef.current = new Set(Array.from(seenEventIdsRef.current).slice(-250));
      }
      const peer = collaboratorsByIdRef.current.get(event.userId);
      recordEvent(event, peer?.name ?? "Colaborador", peer?.color);
      const store = useSlidesFlow.getState();
      switch (event.type) {
        case "add_item":
          store.addItemFromCollab(event.payload as SlideItem);
          break;
        case "update_item":
          store.updateItemFromCollab(event.payload as { id: string; patch: Partial<SlideItem> });
          break;
        case "update_custom_slide": {
          const p = event.payload as { id: string; item: SlideItem };
          store.updateItemFromCollab({ id: p.id, patch: p.item });
          break;
        }
        case "remove_item": {
          const p = event.payload as { id: string };
          store.removeItemFromCollab(p.id);
          break;
        }
        case "duplicate_item": {
          const p = event.payload as { sourceId: string; item: SlideItem };
          store.duplicateItemFromCollab(p);
          break;
        }
        case "reorder_items": {
          const p = event.payload as { activeId: string; overId: string };
          store.reorderFromCollab(p.activeId, p.overId);
          break;
        }
        case "clear_items":
          store.clearItemsFromCollab();
          break;
        case "update_transition": {
          const p = event.payload as { transition: SlideTransition };
          store.setTransitionFromCollab(p.transition);
          break;
        }
        case "load_snapshot": {
          const p = event.payload as { items: SlideItem[]; selectedId: string | null; transition: SlideTransition };
          store.applySnapshotFromCollab(p);
          break;
        }
        case "comment_add":
        case "comment_update":
        case "comment_resolve":
        case "comment_reopen":
        case "comment_delete":
          applyCommentEvent(event.payload as SlideCommentEvent);
          break;
      }
    });

    // Todos os `.on(...)` foram registrados acima; agora sim, subscribe.
    // O callback de status monitora conexao/desconexao explicitamente.
    subscribeRoom(channel, user, (status) => {
      if (status === "SUBSCRIBED") setIsConnected(true);
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setIsConnected(false);
      }
    });

    return () => {
      offEvent();
      setIsConnected(false);
      setCollaborators([]);
      leaveRoom(channel);
      channelRef.current = null;
      userIdRef.current = null;
      knownIdsRef.current = new Set();
      collaboratorsByIdRef.current = new Map();
      seenEventIdsRef.current = new Set();
      userMetaRef.current = null;
    };
  }, [roomId]); // intencionalmente omite userName; Effect 2 atualiza so o presence

  // Effect 2: atualiza o nome no presence sem recriar o canal.
  useEffect(() => {
    const ch = channelRef.current;
    const meta = userMetaRef.current;
    if (!ch || !meta) return;
    const nextName = userName || "Convidado";
    if (meta.name === nextName) return;
    const updated = { ...meta, name: nextName };
    userMetaRef.current = updated;
    try { ch.track(updated); } catch { /* noop */ }
  }, [userName]);

  const broadcast = useCallback((e: CollabEvent) => {
    const ch = channelRef.current;
    if (!ch) return;
    const currentRole = roleRef.current;
    if (currentRole === "viewer") return;
    broadcastEvent(ch, {
      ...e,
      id: e.id ?? `${e.userId}-${e.ts}-${e.type}-${Math.random().toString(36).slice(2, 8)}`,
      role: currentRole ?? undefined,
    });
  }, []);

  const updateCursor = useCallback((x: number, y: number) => {
    const ch = channelRef.current;
    const uid = userIdRef.current;
    if (!ch || !uid) return;
    updateCursorRaw(ch, x, y, uid);
  }, []);

  const updateSlideId = useCallback((slideId: string | null) => {
    const ch = channelRef.current;
    const meta = userMetaRef.current;
    if (!ch || !meta) return;
    if (meta.slideId === slideId) return;
    userMetaRef.current = { ...meta, slideId };
    try {
      ch.track(userMetaRef.current);
    } catch {
      /* noop */
    }
  }, []);

  const broadcastComment = useCallback((commentEvent: SlideCommentEvent) => {
    const ch = channelRef.current;
    if (!ch) return;
    const currentRole = roleRef.current;
    if (currentRole === "viewer") return;
    broadcastEvent(ch, {
      id: `${commentEvent.comment.id}-${commentEvent.at}-${commentEvent.type}`,
      type: commentEvent.type,
      payload: commentEvent,
      userId: userIdRef.current ?? "local",
      ts: commentEvent.at,
      role: currentRole ?? undefined,
    });
  }, []);

  return {
    collaborators,
    isConnected,
    broadcast,
    updateCursor,
    updateSlideId,
    broadcastComment,
    userId: userIdRef.current,
  };
}
