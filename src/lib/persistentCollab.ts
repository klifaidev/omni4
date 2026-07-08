import { supabase } from "@/integrations/supabase/client";
import {
  createCollabInviteCode,
  createCollabRoomKeyBundle,
  encryptCollabSnapshot,
  hashCollabCode,
  normalizeCollabCode,
  type CollabInviteRole,
  type CollabRoomKeyBundle,
  type JsonValue,
} from "@/lib/collabCrypto";
import type { SlideItem } from "@/lib/slidesFlow";

export type PersistentCollabRole = "host" | CollabInviteRole;

export type SimpleCollabDeckSnapshot = {
  schema_version: 1;
  created_at: string;
  selected_slide_id: string | null;
  slides: Array<{
    id: string;
    kind: SlideItem["kind"];
    label?: string;
    notes?: string;
    config?: JsonValue;
  }>;
};

export type CreatePersistentRoomResult = {
  roomId: string;
  roomPublicId: string;
  editorCode: string;
  viewerCode: string;
  expiresAt: string;
  latestSnapshotVersion: number;
  role: "host";
};

export type JoinPersistentRoomResult = {
  roomId: string;
  roomPublicId: string;
  role: CollabInviteRole;
  realtimeChannel: string;
  token: string;
  tokenExpiresAt: string;
  latestSnapshotVersion: number;
};

type CreateRoomResponse = {
  room_id: string;
  room_public_id: string;
  expires_at: string;
  latest_snapshot_version: number;
};

type JoinRoomResponse = {
  room_id: string;
  room_public_id: string;
  role: CollabInviteRole;
  realtime_channel: string;
  token: string;
  token_expires_at: string;
  latest_snapshot_version: number;
};

function createRoomPublicId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 22);
  }
  return Math.random().toString(36).slice(2, 14) + Math.random().toString(36).slice(2, 12);
}

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as JsonValue;
}

async function hashPayload(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const bytes = new Uint8Array(digest);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function serializeSimpleCollabDeck(items: SlideItem[], selectedSlideId: string | null): SimpleCollabDeckSnapshot {
  return {
    schema_version: 1,
    created_at: new Date().toISOString(),
    selected_slide_id: selectedSlideId,
    slides: items.map((item) => ({
      id: item.id,
      kind: item.kind,
      label: item.label,
      notes: item.notes,
      config: toJsonValue(item.config),
    })),
  };
}

export async function createPersistentCollabRoom(params: {
  items: SlideItem[];
  selectedSlideId: string | null;
  appVersion: string;
}): Promise<CreatePersistentRoomResult> {
  const roomPublicId = createRoomPublicId();
  const editorCode = createCollabInviteCode("ED");
  const viewerCode = createCollabInviteCode("VW");
  const { bundle, contentKey } = await createCollabRoomKeyBundle({
    roomPublicId,
    editorCode,
    viewerCode,
  });
  const snapshot = serializeSimpleCollabDeck(params.items, params.selectedSlideId);
  const encryptedSnapshot = await encryptCollabSnapshot(contentKey, {
    key_bundle: bundle as unknown as JsonValue,
    snapshot: snapshot as unknown as JsonValue,
  });
  const encryptedPayload = JSON.stringify(encryptedSnapshot);

  const { data, error } = await supabase.functions.invoke<CreateRoomResponse>("create-collab-room", {
    body: {
      room_public_id: roomPublicId,
      editor_code_hash: await hashCollabCode(editorCode),
      viewer_code_hash: await hashCollabCode(viewerCode),
      encrypted_payload: encryptedPayload,
      payload_hash: await hashPayload(encryptedPayload),
      app_version: params.appVersion,
      collab_protocol_version: 1,
      expires_in_hours: 72,
    },
  });

  if (error || !data) {
    throw new Error("CREATE_ROOM_FAILED");
  }

  return {
    roomId: data.room_id,
    roomPublicId: data.room_public_id,
    editorCode,
    viewerCode,
    expiresAt: data.expires_at,
    latestSnapshotVersion: data.latest_snapshot_version,
    role: "host",
  };
}

export async function joinPersistentCollabRoom(code: string): Promise<JoinPersistentRoomResult> {
  const normalizedCode = normalizeCollabCode(code);
  if (!normalizedCode) throw new Error("EMPTY_CODE");

  const { data, error } = await supabase.functions.invoke<JoinRoomResponse>("join-collab-room", {
    body: {
      code_hash: await hashCollabCode(normalizedCode),
    },
  });

  if (error || !data) {
    throw new Error("INVALID_OR_EXPIRED_CODE");
  }

  return {
    roomId: data.room_id,
    roomPublicId: data.room_public_id,
    role: data.role,
    realtimeChannel: data.realtime_channel,
    token: data.token,
    tokenExpiresAt: data.token_expires_at,
    latestSnapshotVersion: data.latest_snapshot_version,
  };
}

export function getPersistentCollabRoleLabel(role: PersistentCollabRole | null): string {
  if (role === "host") return "Host";
  if (role === "editor") return "Editor";
  if (role === "viewer") return "Visualizador";
  return "Sem sala";
}

export type { CollabRoomKeyBundle };
export { normalizeCollabCode };
