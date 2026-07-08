import { describe, expect, it } from "vitest";
import {
  CollabCryptoError,
  createCollabRoomKeyBundle,
  decryptCollabComment,
  decryptCollabSnapshot,
  encryptCollabComment,
  encryptCollabSnapshot,
  unlockCollabContentKey,
  type JsonValue,
} from "@/lib/collabCrypto";

type TestSnapshot = {
  deckId: string;
  slides: Array<{ id: string; title: string; blocks: Array<{ id: string; kind: string }> }>;
};

type TestComment = {
  id: string;
  slideId: string;
  body: string;
  resolved: boolean;
};

describe("collabCrypto", () => {
  it("encrypts and decrypts snapshots with both editor and viewer codes", async () => {
    const { bundle, contentKey } = await createCollabRoomKeyBundle({
      roomPublicId: "room_public_123",
      editorCode: "ed_secret_code",
      viewerCode: "vw_secret_code",
    });
    const snapshot: TestSnapshot = {
      deckId: "deck-1",
      slides: [{ id: "slide-1", title: "Pricing Review", blocks: [{ id: "block-1", kind: "chart" }] }],
    };

    const encrypted = await encryptCollabSnapshot(contentKey, snapshot as unknown as JsonValue);
    const editorKey = await unlockCollabContentKey("ed_secret_code", bundle);
    const viewerKey = await unlockCollabContentKey("vw_secret_code", bundle);

    await expect(decryptCollabSnapshot<TestSnapshot>(editorKey, encrypted)).resolves.toEqual(snapshot);
    await expect(decryptCollabSnapshot<TestSnapshot>(viewerKey, encrypted)).resolves.toEqual(snapshot);
    expect(encrypted.ciphertext).not.toContain("Pricing Review");
    expect(encrypted.iv).toBeTruthy();
  });

  it("encrypts and decrypts comments using a unique iv per operation", async () => {
    const { bundle, contentKey } = await createCollabRoomKeyBundle({
      roomPublicId: "room_public_456",
      editorCode: "editor-code",
      viewerCode: "viewer-code",
    });
    const comment: TestComment = {
      id: "comment-1",
      slideId: "slide-1",
      body: "Rever margem",
      resolved: false,
    };

    const first = await encryptCollabComment(contentKey, comment as unknown as JsonValue);
    const second = await encryptCollabComment(contentKey, comment as unknown as JsonValue);
    const viewerKey = await unlockCollabContentKey("viewer-code", bundle);

    await expect(decryptCollabComment<TestComment>(viewerKey, first)).resolves.toEqual(comment);
    expect(first.iv).not.toEqual(second.iv);
    expect(first.ciphertext).not.toEqual(second.ciphertext);
  });

  it("fails with a wrong code without exposing payload details", async () => {
    const { bundle } = await createCollabRoomKeyBundle({
      roomPublicId: "room_public_789",
      editorCode: "right-editor-code",
      viewerCode: "right-viewer-code",
    });

    await expect(unlockCollabContentKey("wrong-code", bundle)).rejects.toMatchObject({
      name: "CollabCryptoError",
      code: "INVALID_CODE",
      message: "INVALID_CODE",
    } satisfies Partial<CollabCryptoError>);
  });

  it("rejects corrupted payloads with a generic error", async () => {
    const { contentKey } = await createCollabRoomKeyBundle({
      roomPublicId: "room_public_corrupt",
      editorCode: "editor",
      viewerCode: "viewer",
    });
    const encrypted = await encryptCollabSnapshot(contentKey, { ok: true });

    await expect(
      decryptCollabSnapshot(contentKey, {
        ...encrypted,
        ciphertext: `${encrypted.ciphertext.slice(0, -2)}xx`,
      }),
    ).rejects.toMatchObject({
      name: "CollabCryptoError",
      code: "CORRUPTED_PAYLOAD",
      message: "CORRUPTED_PAYLOAD",
    } satisfies Partial<CollabCryptoError>);
  });
});
