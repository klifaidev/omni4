import { supabase } from "@/integrations/supabase/client";
import {
  createCollabInviteCode,
  createCollabRoomKeyBundle,
  decryptCollabSnapshot,
  encryptCollabSnapshot,
  hashCollabCode,
  normalizeCollabCode,
  unlockCollabContentKey,
  type CollabEncryptedSnapshot,
  type CollabInviteRole,
  type CollabRoomKeyBundle,
  type JsonValue,
} from "@/lib/collabCrypto";
import {
  serializePersistentCollabSnapshot,
  snapshotToSlidesState,
  validatePersistentCollabSnapshot,
  type PersistentCollabSnapshot,
} from "@/lib/persistentCollabSnapshot";
import type { SlideItem } from "@/lib/slidesFlow";
import type { SlideTransition } from "@/store/slidesFlow";

export type PersistentCollabRole = "host" | CollabInviteRole;

export type PersistentCollabStoredPayload = {
  schemaVersion: 1;
  keyBundle: CollabRoomKeyBundle;
  encryptedSnapshot: CollabEncryptedSnapshot;
};

export type CreatePersistentRoomResult = {
  roomId: string;
  roomPublicId: string;
  editorCode: string;
  viewerCode: string;
  expiresAt: string;
  latestSnapshotVersion: number;
  snapshot: PersistentCollabSnapshot;
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
  snapshot: PersistentCollabSnapshot;
  state: ReturnType<typeof snapshotToSlidesState>;
};

export type SavePersistentSnapshotResult = {
  version: number;
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

type SnapshotRow = {
  version: number;
  encrypted_payload: string;
};

type SaveSnapshotResponse = {
  version: number;
};

function createRoomPublicId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 22);
  }
  return Math.random().toString(36).slice(2, 14) + Math.random().toString(36).slice(2, 12);
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

function stringifyStoredPayload(payload: PersistentCollabStoredPayload): string {
  return JSON.stringify(payload);
}

function parseStoredPayload(value: string): PersistentCollabStoredPayload {
  try {
    const parsed = JSON.parse(value) as PersistentCollabStoredPayload;
    if (parsed.schemaVersion !== 1 || !parsed.keyBundle || !parsed.encryptedSnapshot) {
      throw new Error("UNSUPPORTED_COLLAB_PAYLOAD_SCHEMA");
    }
    return parsed;
  } catch {
    throw new Error("CORRUPTED_COLLAB_PAYLOAD");
  }
}

async function getLatestSnapshotRow(roomId: string): Promise<SnapshotRow> {
  const { data, error } = await supabase
    .from("collab_room_snapshots")
    .select("version, encrypted_payload")
    .eq("room_id", roomId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) throw new Error("SNAPSHOT_NOT_FOUND");
  return data;
}

async function decryptStoredSnapshot(code: string, encryptedPayload: string): Promise<PersistentCollabSnapshot> {
  const stored = parseStoredPayload(encryptedPayload);
  const contentKey = await unlockCollabContentKey(code, stored.keyBundle);
  const decrypted = await decryptCollabSnapshot<JsonValue>(contentKey, stored.encryptedSnapshot);
  return validatePersistentCollabSnapshot(decrypted);
}

async function buildEncryptedSnapshotPayload(params: {
  roomPublicId: string;
  editorCode: string;
  viewerCode: string;
  items: SlideItem[];
  selectedSlideId: string | null;
  transition: SlideTransition;
  appVersion: string;
  version: number;
}): Promise<{ payload: string; snapshot: PersistentCollabSnapshot }> {
  const { bundle, contentKey } = await createCollabRoomKeyBundle({
    roomPublicId: params.roomPublicId,
    editorCode: params.editorCode,
    viewerCode: params.viewerCode,
  });
  const snapshot = serializePersistentCollabSnapshot({
    items: params.items,
    selectedSlideId: params.selectedSlideId,
    transition: params.transition,
    appVersion: params.appVersion,
    version: params.version,
  });
  const encryptedSnapshot = await encryptCollabSnapshot(contentKey, snapshot as unknown as JsonValue);
  return {
    snapshot,
    payload: stringifyStoredPayload({
      schemaVersion: 1,
      keyBundle: bundle,
      encryptedSnapshot,
    }),
  };
}

export async function createPersistentCollabRoom(params: {
  items: SlideItem[];
  selectedSlideId: string | null;
  transition: SlideTransition;
  appVersion: string;
}): Promise<CreatePersistentRoomResult> {
  const roomPublicId = createRoomPublicId();
  const editorCode = createCollabInviteCode("ED");
  const viewerCode = createCollabInviteCode("VW");
  const { payload, snapshot } = await buildEncryptedSnapshotPayload({
    roomPublicId,
    editorCode,
    viewerCode,
    items: params.items,
    selectedSlideId: params.selectedSlideId,
    transition: params.transition,
    appVersion: params.appVersion,
    version: 1,
  });

  const { data, error } = await supabase.functions.invoke<CreateRoomResponse>("create-collab-room", {
    body: {
      room_public_id: roomPublicId,
      editor_code_hash: await hashCollabCode(editorCode),
      viewer_code_hash: await hashCollabCode(viewerCode),
      encrypted_payload: payload,
      payload_hash: await hashPayload(payload),
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
    snapshot,
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

  const latest = await getLatestSnapshotRow(data.room_id);
  const snapshot = await decryptStoredSnapshot(normalizedCode, latest.encrypted_payload);

  return {
    roomId: data.room_id,
    roomPublicId: data.room_public_id,
    role: data.role,
    realtimeChannel: data.realtime_channel,
    token: data.token,
    tokenExpiresAt: data.token_expires_at,
    latestSnapshotVersion: latest.version,
    snapshot,
    state: snapshotToSlidesState(snapshot),
  };
}

export async function savePersistentCollabSnapshot(params: {
  roomId: string;
  roomPublicId: string;
  editorCode: string;
  viewerCode: string;
  expectedPreviousVersion: number;
  items: SlideItem[];
  selectedSlideId: string | null;
  transition: SlideTransition;
  appVersion: string;
}): Promise<SavePersistentSnapshotResult> {
  const latest = await getLatestSnapshotRow(params.roomId);
  if (latest.version !== params.expectedPreviousVersion) {
    throw new Error("COLLAB_SNAPSHOT_VERSION_CONFLICT");
  }
  const nextVersion = latest.version + 1;
  const { payload } = await buildEncryptedSnapshotPayload({
    roomPublicId: params.roomPublicId,
    editorCode: params.editorCode,
    viewerCode: params.viewerCode,
    items: params.items,
    selectedSlideId: params.selectedSlideId,
    transition: params.transition,
    appVersion: params.appVersion,
    version: nextVersion,
  });

  const { data, error } = await supabase.functions.invoke<SaveSnapshotResponse>("save-collab-snapshot", {
    body: {
      room_id: params.roomId,
      code_hash: await hashCollabCode(params.editorCode),
      expected_previous_version: params.expectedPreviousVersion,
      encrypted_payload: payload,
      payload_hash: await hashPayload(payload),
      app_version: params.appVersion,
      collab_protocol_version: 1,
    },
  });

  if (error || !data) throw new Error("SAVE_COLLAB_SNAPSHOT_FAILED");
  return { version: data.version };
}

export function getPersistentCollabRoleLabel(role: PersistentCollabRole | null): string {
  if (role === "host") return "Host";
  if (role === "editor") return "Editor";
  if (role === "viewer") return "Visualizador";
  return "Sem sala";
}

export type { CollabRoomKeyBundle };
export { normalizeCollabCode };
