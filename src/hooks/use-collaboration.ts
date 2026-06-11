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
import { addComment as addLocalComment, subscribeToComments, type SlideComment } from "@/lib/slideComments";
import type { SlideItem } from "@/lib/slidesFlow";

interface UseCollabReturn {
  collaborators: CollabUser[];
  isConnected: boolean;
  broadcast: (e: CollabEvent) => void;
  updateCursor: (x: number, y: number) => void;
  updateSlideId: (slideId: string | null) => void;
  broadcastComment: (c: SlideComment) => void;
  userId: string | null;
}

export function useCollaboration(
  roomId: string | null,
  userName: string,
): UseCollabReturn {
  const [collaborators, setCollaborators] = useState<CollabUser[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const userIdRef = useRef<string | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const collaboratorsByIdRef = useRef<Map<string, CollabUser>>(new Map());
  const userMetaRef = useRef<CollabUser | null>(null);

  // Effect 1: cria/destrói o canal quando roomId muda.
  // userName NÃO é dependência — evita recriar o canal ao editar o nome.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!roomId) return;
    const userId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `u_${Math.random().toString(36).slice(2, 10)}`;
    userIdRef.current = userId;
    knownIdsRef.current = new Set([userId]);
    // Cor estável por hash do userId
    let h = 0;
    for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
    const color = CURSOR_COLORS[h % CURSOR_COLORS.length];

    const user: CollabUser = {
      id: userId,
      name: userName || "Convidado",
      color,
      slideId: null,
    };
    userMetaRef.current = user;

    const channel = createRoom(roomId, user);
    channelRef.current = channel;

    onPresenceChange(channel, (users) => {
      setCollaborators(users);
      // isConnected é gerido pelo callback de status do subscribe abaixo
      const currentIds = new Set(users.map((u) => u.id));
      const prev = knownIdsRef.current;
      for (const u of users) {
        if (u.id === userId) continue;
        if (!prev.has(u.id)) {
          toast.info(`${u.name} entrou na sala`, { icon: "👋", duration: 2500 });
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

    // onEvent retorna cleanup; garante que handlers não acumulem em Strict Mode.
    const offEvent = onEvent(channel, (event) => {
      if (event.userId === userId) return; // ignora ecos
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
        case "remove_item": {
          const p = event.payload as { id: string };
          store.removeItem(p.id);
          break;
        }
        case "reorder": {
          const p = event.payload as { activeId: string; overId: string };
          store.reorder(p.activeId, p.overId);
          break;
        }
        case "update_transition": {
          const p = event.payload as { transition: Parameters<typeof store.setTransition>[0] };
          store.setTransition(p.transition);
          break;
        }
        case "load_preset": {
          const p = event.payload as { items: SlideItem[] };
          store.loadPresetFromCollab(p.items);
          break;
        }
      }
    });

    subscribeToComments(channel, (c: SlideComment) => {
      if (c.author && userMetaRef.current && c.author === userMetaRef.current.name) {
        // ainda assim adiciona — addComment é idempotente por id
      }
      addLocalComment(c);
    });

    // Todos os `.on(...)` foram registrados acima; agora sim, subscribe.
    // O callback de status monitora conexão/desconexão explicitamente.
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
      userMetaRef.current = null;
    };
  }, [roomId]); // intencionalmente omite userName — Effect 2 atualiza só o presence

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
    broadcastEvent(ch, e);
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

  const broadcastComment = useCallback((c: SlideComment) => {
    const ch = channelRef.current;
    if (!ch) return;
    ch.send({ type: "broadcast", event: "comment", payload: c });
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
