export type CollabInviteRole = "editor" | "viewer";

export type CollabEncryptedPayload = {
  schema_version: 1;
  algorithm: "AES-GCM-256";
  iv: string;
  ciphertext: string;
};

export type CollabKeyEnvelope = {
  role: CollabInviteRole;
  algorithm: "HKDF-SHA256+A256GCM";
  iv: string;
  encrypted_key: string;
};

export type CollabRoomKeyBundle = {
  schema_version: 1;
  room_public_id: string;
  info: "omni-slides-collab-v1";
  envelopes: CollabKeyEnvelope[];
};

export type CollabEncryptedSnapshot = CollabEncryptedPayload & {
  payload_type: "snapshot";
};

export type CollabEncryptedComment = CollabEncryptedPayload & {
  payload_type: "comment";
};

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

type CryptoLike = Crypto & {
  subtle: SubtleCrypto;
};

const INFO = "omni-slides-collab-v1" as const;
const AES_GCM = "AES-GCM";
const HKDF = "HKDF";
const CONTENT_KEY_BYTES = 32;
const IV_BYTES = 12;
const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class CollabCryptoError extends Error {
  constructor(
    public readonly code:
      | "UNSUPPORTED_SCHEMA"
      | "INVALID_CODE"
      | "CORRUPTED_PAYLOAD"
      | "CRYPTO_UNAVAILABLE",
  ) {
    super(code);
    this.name = "CollabCryptoError";
  }
}

function getCrypto(): CryptoLike {
  const candidate = globalThis.crypto as CryptoLike | undefined;
  if (!candidate?.subtle || typeof candidate.getRandomValues !== "function") {
    throw new CollabCryptoError("CRYPTO_UNAVAILABLE");
  }
  return candidate;
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  getCrypto().getRandomValues(bytes);
  return bytes;
}

export function normalizeCollabCode(code: string): string {
  return code.replace(/\s+/g, "").toUpperCase();
}

export function createCollabInviteCode(prefix: "ED" | "VW"): string {
  const bytes = randomBytes(24);
  let code = "";
  bytes.forEach((byte) => {
    code += INVITE_CODE_ALPHABET[byte % INVITE_CODE_ALPHABET.length];
  });
  return `${prefix}_${code.slice(0, 6)}-${code.slice(6, 12)}-${code.slice(12, 18)}-${code.slice(18, 24)}`;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  try {
    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  } catch {
    throw new CollabCryptoError("CORRUPTED_PAYLOAD");
  }
}

async function importContentKey(rawKey: Uint8Array, extractable = false): Promise<CryptoKey> {
  return getCrypto().subtle.importKey("raw", rawKey, AES_GCM, extractable, ["encrypt", "decrypt"]);
}

async function exportContentKey(key: CryptoKey): Promise<Uint8Array> {
  const raw = await getCrypto().subtle.exportKey("raw", key);
  return new Uint8Array(raw);
}

async function deriveWrappingKey(code: string, roomPublicId: string): Promise<CryptoKey> {
  const crypto = getCrypto();
  const baseKey = await crypto.subtle.importKey("raw", utf8(normalizeCollabCode(code)), HKDF, false, ["deriveKey"]);

  return crypto.subtle.deriveKey(
    {
      name: HKDF,
      hash: "SHA-256",
      salt: utf8(roomPublicId),
      info: utf8(INFO),
    },
    baseKey,
    { name: AES_GCM, length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function hashCollabCode(code: string): Promise<string> {
  const digest = await getCrypto().subtle.digest("SHA-256", utf8(normalizeCollabCode(code)));
  return toBase64Url(new Uint8Array(digest));
}

async function aesEncrypt(key: CryptoKey, plainBytes: Uint8Array): Promise<CollabEncryptedPayload> {
  const iv = randomBytes(IV_BYTES);
  const ciphertext = await getCrypto().subtle.encrypt({ name: AES_GCM, iv }, key, plainBytes);

  return {
    schema_version: 1,
    algorithm: "AES-GCM-256",
    iv: toBase64Url(iv),
    ciphertext: toBase64Url(new Uint8Array(ciphertext)),
  };
}

async function aesDecrypt(key: CryptoKey, payload: CollabEncryptedPayload): Promise<Uint8Array> {
  if (payload.schema_version !== 1 || payload.algorithm !== "AES-GCM-256") {
    throw new CollabCryptoError("UNSUPPORTED_SCHEMA");
  }

  try {
    const plain = await getCrypto().subtle.decrypt(
      { name: AES_GCM, iv: fromBase64Url(payload.iv) },
      key,
      fromBase64Url(payload.ciphertext),
    );
    return new Uint8Array(plain);
  } catch (error) {
    if (error instanceof CollabCryptoError) throw error;
    throw new CollabCryptoError("CORRUPTED_PAYLOAD");
  }
}

async function encryptContentKey(
  contentKey: CryptoKey,
  role: CollabInviteRole,
  code: string,
  roomPublicId: string,
): Promise<CollabKeyEnvelope> {
  const wrappingKey = await deriveWrappingKey(code, roomPublicId);
  const wrapped = await aesEncrypt(wrappingKey, await exportContentKey(contentKey));

  return {
    role,
    algorithm: "HKDF-SHA256+A256GCM",
    iv: wrapped.iv,
    encrypted_key: wrapped.ciphertext,
  };
}

async function decryptContentKeyFromEnvelope(
  code: string,
  roomPublicId: string,
  envelope: CollabKeyEnvelope,
): Promise<CryptoKey> {
  if (envelope.algorithm !== "HKDF-SHA256+A256GCM") {
    throw new CollabCryptoError("UNSUPPORTED_SCHEMA");
  }

  const wrappingKey = await deriveWrappingKey(code, roomPublicId);
  const rawKey = await aesDecrypt(wrappingKey, {
    schema_version: 1,
    algorithm: "AES-GCM-256",
    iv: envelope.iv,
    ciphertext: envelope.encrypted_key,
  });

  if (rawKey.byteLength !== CONTENT_KEY_BYTES) {
    throw new CollabCryptoError("CORRUPTED_PAYLOAD");
  }

  return importContentKey(rawKey);
}

export async function createCollabRoomKeyBundle(params: {
  roomPublicId: string;
  editorCode: string;
  viewerCode: string;
}): Promise<{ bundle: CollabRoomKeyBundle; contentKey: CryptoKey }> {
  const contentKey = await importContentKey(randomBytes(CONTENT_KEY_BYTES), true);
  const envelopes = await Promise.all([
    encryptContentKey(contentKey, "editor", params.editorCode, params.roomPublicId),
    encryptContentKey(contentKey, "viewer", params.viewerCode, params.roomPublicId),
  ]);

  return {
    contentKey,
    bundle: {
      schema_version: 1,
      room_public_id: params.roomPublicId,
      info: INFO,
      envelopes,
    },
  };
}

export async function unlockCollabContentKey(code: string, bundle: CollabRoomKeyBundle): Promise<CryptoKey> {
  if (bundle.schema_version !== 1 || bundle.info !== INFO) {
    throw new CollabCryptoError("UNSUPPORTED_SCHEMA");
  }

  for (const envelope of bundle.envelopes) {
    try {
      return await decryptContentKeyFromEnvelope(code, bundle.room_public_id, envelope);
    } catch (error) {
      if (error instanceof CollabCryptoError && error.code === "UNSUPPORTED_SCHEMA") {
        throw error;
      }
    }
  }

  throw new CollabCryptoError("INVALID_CODE");
}

export async function encryptCollabJson<T extends JsonValue>(
  contentKey: CryptoKey,
  value: T,
): Promise<CollabEncryptedPayload> {
  return aesEncrypt(contentKey, utf8(JSON.stringify(value)));
}

export async function decryptCollabJson<T extends JsonValue>(
  contentKey: CryptoKey,
  payload: CollabEncryptedPayload,
): Promise<T> {
  const plainBytes = await aesDecrypt(contentKey, payload);

  try {
    return JSON.parse(new TextDecoder().decode(plainBytes)) as T;
  } catch {
    throw new CollabCryptoError("CORRUPTED_PAYLOAD");
  }
}

export async function encryptCollabSnapshot<T extends JsonValue>(
  contentKey: CryptoKey,
  snapshot: T,
): Promise<CollabEncryptedSnapshot> {
  return {
    ...(await encryptCollabJson(contentKey, snapshot)),
    payload_type: "snapshot",
  };
}

export async function decryptCollabSnapshot<T extends JsonValue>(
  contentKey: CryptoKey,
  payload: CollabEncryptedSnapshot,
): Promise<T> {
  if (payload.payload_type !== "snapshot") {
    throw new CollabCryptoError("UNSUPPORTED_SCHEMA");
  }
  return decryptCollabJson<T>(contentKey, payload);
}

export async function encryptCollabComment<T extends JsonValue>(
  contentKey: CryptoKey,
  comment: T,
): Promise<CollabEncryptedComment> {
  return {
    ...(await encryptCollabJson(contentKey, comment)),
    payload_type: "comment",
  };
}

export async function decryptCollabComment<T extends JsonValue>(
  contentKey: CryptoKey,
  payload: CollabEncryptedComment,
): Promise<T> {
  if (payload.payload_type !== "comment") {
    throw new CollabCryptoError("UNSUPPORTED_SCHEMA");
  }
  return decryptCollabJson<T>(contentKey, payload);
}
