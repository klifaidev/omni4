import * as Y from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from "y-protocols/awareness";
import {
  CollabCryptoError,
  decryptCollabYjsAwareness,
  decryptCollabYjsUpdate,
  encryptCollabYjsAwareness,
  encryptCollabYjsUpdate,
  type CollabEncryptedYjsAwareness,
  type CollabEncryptedYjsUpdate,
} from "@/lib/collabCrypto";

type YjsUpdateBroadcastPayload = {
  id: string;
  senderId: string;
  sentAt: number;
  encrypted: CollabEncryptedYjsUpdate;
};

type YjsAwarenessBroadcastPayload = {
  id: string;
  senderId: string;
  sentAt: number;
  encrypted: CollabEncryptedYjsAwareness;
};

type BroadcastCallback = (message: { payload: unknown }) => void;

export type SupabaseYjsChannel = {
  send: (message: {
    type: "broadcast";
    event: string;
    payload: YjsUpdateBroadcastPayload | YjsAwarenessBroadcastPayload;
  }) => unknown;
  on: (
    type: "broadcast",
    filter: { event: string },
    callback: BroadcastCallback,
  ) => unknown;
};

export type SupabaseYjsProviderOptions = {
  doc: Y.Doc;
  channel: SupabaseYjsChannel;
  contentKey: CryptoKey;
  clientId: string;
  eventName?: string;
  awarenessEventName?: string;
  awareness?: Awareness;
  throttleMs?: number;
  onDiscardedUpdate?: (reason: "decrypt_failed" | "apply_failed" | "invalid_payload") => void;
  onDiscardedAwareness?: (reason: "decrypt_failed" | "apply_failed" | "invalid_payload") => void;
};

export type YjsTextAwarenessState = {
  id: string;
  name: string;
  color: string;
  slideId?: string | null;
  blockId?: string | null;
  field: string;
  anchor?: number;
  head?: number;
};

const DEFAULT_EVENT = "yjs-update";
const DEFAULT_AWARENESS_EVENT = "yjs-awareness";
const DEFAULT_THROTTLE_MS = 80;
// Security decision: Awareness does not carry slide text, but it does carry
// collaborator identity and cursor/selection metadata. Keep it encrypted so
// every Yjs collaboration message follows the same room-key policy.
const AWARENESS_POLICY = "encrypted";

export type YjsAwarenessSecurityPolicy = typeof AWARENESS_POLICY;

export function getYjsAwarenessSecurityPolicy(): YjsAwarenessSecurityPolicy {
  return AWARENESS_POLICY;
}

export function getTextAwarenessStates(awareness: Awareness, currentClientId?: number): YjsTextAwarenessState[] {
  const states: YjsTextAwarenessState[] = [];
  awareness.getStates().forEach((state, clientId) => {
    if (clientId === currentClientId) return;
    const user = (state as { user?: { name?: unknown; color?: unknown } }).user;
    const selection = (state as {
      textSelection?: {
        slideId?: unknown;
        blockId?: unknown;
        field?: unknown;
        anchor?: unknown;
        head?: unknown;
      };
    }).textSelection;
    if (!selection || typeof selection.field !== "string") return;
    states.push({
      id: String(clientId),
      name: typeof user?.name === "string" ? user.name : "Colaborador",
      color: typeof user?.color === "string" ? user.color : "#64748B",
      slideId: typeof selection.slideId === "string" ? selection.slideId : null,
      blockId: typeof selection.blockId === "string" ? selection.blockId : null,
      field: selection.field,
      anchor: typeof selection.anchor === "number" ? selection.anchor : undefined,
      head: typeof selection.head === "number" ? selection.head : undefined,
    });
  });
  return states;
}

function createMessageId(clientId: string): string {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 10);
  return `${clientId}-${Date.now()}-${suffix}`;
}

function isEncryptedUpdate(value: unknown): value is CollabEncryptedYjsUpdate {
  const candidate = value as Partial<CollabEncryptedYjsUpdate> | null;
  return !!candidate
    && candidate.schema_version === 1
    && candidate.algorithm === "AES-GCM-256"
    && candidate.payload_type === "yjs-update"
    && typeof candidate.iv === "string"
    && typeof candidate.ciphertext === "string";
}

function isEncryptedAwareness(value: unknown): value is CollabEncryptedYjsAwareness {
  const candidate = value as Partial<CollabEncryptedYjsAwareness> | null;
  return !!candidate
    && candidate.schema_version === 1
    && candidate.algorithm === "AES-GCM-256"
    && candidate.payload_type === "yjs-awareness"
    && typeof candidate.iv === "string"
    && typeof candidate.ciphertext === "string";
}

function isUpdateBroadcastPayload(value: unknown): value is YjsUpdateBroadcastPayload {
  const candidate = value as Partial<YjsUpdateBroadcastPayload> | null;
  return !!candidate
    && typeof candidate.id === "string"
    && typeof candidate.senderId === "string"
    && typeof candidate.sentAt === "number"
    && isEncryptedUpdate(candidate.encrypted);
}

function isAwarenessBroadcastPayload(value: unknown): value is YjsAwarenessBroadcastPayload {
  const candidate = value as Partial<YjsAwarenessBroadcastPayload> | null;
  return !!candidate
    && typeof candidate.id === "string"
    && typeof candidate.senderId === "string"
    && typeof candidate.sentAt === "number"
    && isEncryptedAwareness(candidate.encrypted);
}

export class SupabaseYjsProvider {
  private readonly doc: Y.Doc;
  private readonly channel: SupabaseYjsChannel;
  private readonly contentKey: CryptoKey;
  private readonly clientId: string;
  private readonly eventName: string;
  private readonly awarenessEventName: string;
  private readonly awareness?: Awareness;
  private readonly throttleMs: number;
  private readonly onDiscardedUpdate?: SupabaseYjsProviderOptions["onDiscardedUpdate"];
  private readonly onDiscardedAwareness?: SupabaseYjsProviderOptions["onDiscardedAwareness"];
  private readonly localOrigin = {};
  private readonly remoteOrigin = {};
  private readonly seenMessageIds = new Set<string>();
  private readonly seenAwarenessMessageIds = new Set<string>();
  private pendingUpdates: Uint8Array[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(options: SupabaseYjsProviderOptions) {
    this.doc = options.doc;
    this.channel = options.channel;
    this.contentKey = options.contentKey;
    this.clientId = options.clientId;
    this.eventName = options.eventName ?? DEFAULT_EVENT;
    this.awarenessEventName = options.awarenessEventName ?? DEFAULT_AWARENESS_EVENT;
    this.awareness = options.awareness;
    this.throttleMs = options.throttleMs ?? DEFAULT_THROTTLE_MS;
    this.onDiscardedUpdate = options.onDiscardedUpdate;
    this.onDiscardedAwareness = options.onDiscardedAwareness;

    this.doc.on("update", this.handleLocalUpdate);
    this.channel.on("broadcast", { event: this.eventName }, this.handleRemoteMessage);
    if (this.awareness) {
      this.awareness.on("update", this.handleLocalAwarenessUpdate);
      this.channel.on("broadcast", { event: this.awarenessEventName }, this.handleRemoteAwarenessMessage);
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.doc.off("update", this.handleLocalUpdate);
    this.awareness?.off("update", this.handleLocalAwarenessUpdate);
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.pendingUpdates = [];
  }

  flush(): Promise<void> {
    return this.flushPendingUpdates();
  }

  private readonly handleLocalUpdate = (update: Uint8Array, origin: unknown) => {
    if (this.destroyed || origin === this.remoteOrigin || origin === this.localOrigin) return;
    this.pendingUpdates.push(update);
    if (this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flushPendingUpdates();
    }, this.throttleMs);
  };

  private readonly handleRemoteMessage = (message: { payload: unknown }) => {
    void this.applyRemotePayload(message.payload);
  };

  private readonly handleLocalAwarenessUpdate = (
    change: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (this.destroyed || !this.awareness || origin === this.remoteOrigin) return;
    const changedClients = [...change.added, ...change.updated, ...change.removed];
    if (changedClients.length === 0) return;
    const update = encodeAwarenessUpdate(this.awareness, changedClients);
    void this.sendAwarenessUpdate(update);
  };

  private readonly handleRemoteAwarenessMessage = (message: { payload: unknown }) => {
    void this.applyRemoteAwarenessPayload(message.payload);
  };

  private async flushPendingUpdates(): Promise<void> {
    if (this.destroyed || this.pendingUpdates.length === 0) return;
    const updates = this.pendingUpdates;
    this.pendingUpdates = [];
    const merged = updates.length === 1 ? updates[0] : Y.mergeUpdates(updates);
    const encrypted = await encryptCollabYjsUpdate(this.contentKey, merged);
    const payload: BroadcastPayload = {
      id: createMessageId(this.clientId),
      senderId: this.clientId,
      sentAt: Date.now(),
      encrypted,
    };
    this.seenMessageIds.add(payload.id);
    this.channel.send({ type: "broadcast", event: this.eventName, payload });
  }

  private async sendAwarenessUpdate(update: Uint8Array): Promise<void> {
    if (this.destroyed || !this.awareness) return;
    const encrypted = await encryptCollabYjsAwareness(this.contentKey, update);
    const payload: YjsAwarenessBroadcastPayload = {
      id: createMessageId(this.clientId),
      senderId: this.clientId,
      sentAt: Date.now(),
      encrypted,
    };
    this.seenAwarenessMessageIds.add(payload.id);
    this.channel.send({ type: "broadcast", event: this.awarenessEventName, payload });
  }

  private async applyRemotePayload(payload: unknown): Promise<void> {
    if (this.destroyed) return;
    if (!isUpdateBroadcastPayload(payload)) {
      this.onDiscardedUpdate?.("invalid_payload");
      return;
    }
    if (payload.senderId === this.clientId || this.seenMessageIds.has(payload.id)) return;
    this.seenMessageIds.add(payload.id);
    if (this.seenMessageIds.size > 500) {
      const recent = Array.from(this.seenMessageIds).slice(-250);
      this.seenMessageIds.clear();
      recent.forEach((id) => this.seenMessageIds.add(id));
    }

    let update: Uint8Array;
    try {
      update = await decryptCollabYjsUpdate(this.contentKey, payload.encrypted);
    } catch (error) {
      if (error instanceof CollabCryptoError) {
        this.onDiscardedUpdate?.("decrypt_failed");
        return;
      }
      this.onDiscardedUpdate?.("decrypt_failed");
      return;
    }

    try {
      Y.applyUpdate(this.doc, update, this.remoteOrigin);
    } catch {
      this.onDiscardedUpdate?.("apply_failed");
    }
  }

  private async applyRemoteAwarenessPayload(payload: unknown): Promise<void> {
    if (this.destroyed || !this.awareness) return;
    if (!isAwarenessBroadcastPayload(payload)) {
      this.onDiscardedAwareness?.("invalid_payload");
      return;
    }
    if (payload.senderId === this.clientId || this.seenAwarenessMessageIds.has(payload.id)) return;
    this.seenAwarenessMessageIds.add(payload.id);
    if (this.seenAwarenessMessageIds.size > 500) {
      const recent = Array.from(this.seenAwarenessMessageIds).slice(-250);
      this.seenAwarenessMessageIds.clear();
      recent.forEach((id) => this.seenAwarenessMessageIds.add(id));
    }

    let update: Uint8Array;
    try {
      update = await decryptCollabYjsAwareness(this.contentKey, payload.encrypted);
    } catch {
      this.onDiscardedAwareness?.("decrypt_failed");
      return;
    }

    try {
      applyAwarenessUpdate(this.awareness, update, this.remoteOrigin);
    } catch {
      this.onDiscardedAwareness?.("apply_failed");
    }
  }
}

export function createSupabaseYjsProvider(options: SupabaseYjsProviderOptions): SupabaseYjsProvider {
  return new SupabaseYjsProvider(options);
}
