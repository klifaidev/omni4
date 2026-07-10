import {
  decryptCollabComment,
  encryptCollabComment,
  type CollabEncryptedComment,
  type JsonValue,
} from "@/lib/collabCrypto";
import type { SlideCommentEvent } from "@/lib/slideComments";

export type EncryptedCommentEventPayload = {
  encrypted: CollabEncryptedComment;
};

export function isEncryptedCommentEventPayload(value: unknown): value is EncryptedCommentEventPayload {
  const candidate = value as Partial<EncryptedCommentEventPayload> | null;
  return !!candidate
    && !!candidate.encrypted
    && candidate.encrypted.schema_version === 1
    && candidate.encrypted.algorithm === "AES-GCM-256"
    && candidate.encrypted.payload_type === "comment"
    && typeof candidate.encrypted.iv === "string"
    && typeof candidate.encrypted.ciphertext === "string";
}

export async function encryptCommentEventForBroadcast(
  contentKey: CryptoKey,
  event: SlideCommentEvent,
): Promise<EncryptedCommentEventPayload> {
  return {
    encrypted: await encryptCollabComment(contentKey, event as unknown as JsonValue),
  };
}

export async function decryptCommentEventFromBroadcast(
  contentKey: CryptoKey,
  payload: unknown,
): Promise<SlideCommentEvent | null> {
  if (!isEncryptedCommentEventPayload(payload)) return null;
  return decryptCollabComment<SlideCommentEvent & JsonValue>(contentKey, payload.encrypted);
}
