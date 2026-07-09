import * as Y from "yjs";
import {
  CollabCryptoError,
  decryptCollabYjsUpdate,
  encryptCollabYjsUpdate,
  type CollabEncryptedYjsUpdate,
} from "@/lib/collabCrypto";

type BroadcastPayload = {
  id: string;
  senderId: string;
  sentAt: number;
  encrypted: CollabEncryptedYjsUpdate;
};

type BroadcastCallback = (message: { payload: unknown }) => void;

export type SupabaseYjsChannel = {
  send: (message: { type: "broadcast"; event: string; payload: BroadcastPayload }) => unknown;
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
  throttleMs?: number;
  onDiscardedUpdate?: (reason: "decrypt_failed" | "apply_failed" | "invalid_payload") => void;
};

const DEFAULT_EVENT = "yjs-update";
const DEFAULT_THROTTLE_MS = 80;

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

function isBroadcastPayload(value: unknown): value is BroadcastPayload {
  const candidate = value as Partial<BroadcastPayload> | null;
  return !!candidate
    && typeof candidate.id === "string"
    && typeof candidate.senderId === "string"
    && typeof candidate.sentAt === "number"
    && isEncryptedUpdate(candidate.encrypted);
}

export class SupabaseYjsProvider {
  private readonly doc: Y.Doc;
  private readonly channel: SupabaseYjsChannel;
  private readonly contentKey: CryptoKey;
  private readonly clientId: string;
  private readonly eventName: string;
  private readonly throttleMs: number;
  private readonly onDiscardedUpdate?: SupabaseYjsProviderOptions["onDiscardedUpdate"];
  private readonly localOrigin = {};
  private readonly remoteOrigin = {};
  private readonly seenMessageIds = new Set<string>();
  private pendingUpdates: Uint8Array[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(options: SupabaseYjsProviderOptions) {
    this.doc = options.doc;
    this.channel = options.channel;
    this.contentKey = options.contentKey;
    this.clientId = options.clientId;
    this.eventName = options.eventName ?? DEFAULT_EVENT;
    this.throttleMs = options.throttleMs ?? DEFAULT_THROTTLE_MS;
    this.onDiscardedUpdate = options.onDiscardedUpdate;

    this.doc.on("update", this.handleLocalUpdate);
    this.channel.on("broadcast", { event: this.eventName }, this.handleRemoteMessage);
  }

  destroy(): void {
    this.destroyed = true;
    this.doc.off("update", this.handleLocalUpdate);
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

  private async applyRemotePayload(payload: unknown): Promise<void> {
    if (this.destroyed) return;
    if (!isBroadcastPayload(payload)) {
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
}

export function createSupabaseYjsProvider(options: SupabaseYjsProviderOptions): SupabaseYjsProvider {
  return new SupabaseYjsProvider(options);
}
