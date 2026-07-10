import { describe, expect, it } from "vitest";
import { createCollabRoomKeyBundle } from "@/lib/collabCrypto";
import {
  decryptCommentEventFromBroadcast,
  encryptCommentEventForBroadcast,
  isEncryptedCommentEventPayload,
} from "@/lib/collabCommentBroadcast";
import type { SlideCommentEvent } from "@/lib/slideComments";

async function createSharedKey(): Promise<CryptoKey> {
  const { contentKey } = await createCollabRoomKeyBundle({
    roomPublicId: "room-comment-test",
    editorCode: "ED_ABCDEF-GHIJKL-MNPQRS-TUVWXY",
    viewerCode: "VW_ABCDEF-GHIJKL-MNPQRS-TUVWXY",
  });
  return contentKey;
}

describe("collabCommentBroadcast", () => {
  it("encrypts live comment events before realtime broadcast and restores them with the room key", async () => {
    const contentKey = await createSharedKey();
    const event: SlideCommentEvent = {
      type: "comment_add",
      at: 1720000000000,
      comment: {
        id: "comment-1",
        slideId: "slide-1",
        blockId: "block-1",
        author: "Ana Silva",
        authorColor: "#C8102E",
        text: "Margem sensivel digitada no comentario",
        createdAt: 1720000000000,
        resolved: false,
      },
    };

    const encrypted = await encryptCommentEventForBroadcast(contentKey, event);
    const serialized = JSON.stringify(encrypted);

    expect(isEncryptedCommentEventPayload(encrypted)).toBe(true);
    expect(serialized).toContain("ciphertext");
    expect(serialized).not.toContain("Margem sensivel");
    expect(serialized).not.toContain("Ana Silva");

    await expect(decryptCommentEventFromBroadcast(contentKey, encrypted)).resolves.toEqual(event);
  });

  it("returns null for plaintext or malformed comment broadcast payloads", async () => {
    const contentKey = await createSharedKey();

    await expect(decryptCommentEventFromBroadcast(contentKey, {
      type: "comment_add",
      comment: { text: "nao pode ser aceito em claro" },
    })).resolves.toBeNull();
  });
});
