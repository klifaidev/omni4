import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createCollabRoomKeyBundle } from "@/lib/collabCrypto";
import type { CustomSlideConfig } from "@/lib/customSlide";
import { customSlideConfigToYDoc, getCustomSlideYDocParts, yDocToCustomSlideConfig } from "@/lib/customSlideYjs";
import { createSupabaseYjsProvider, type SupabaseYjsChannel } from "@/lib/supabaseYjsProvider";

type BroadcastMessage = Parameters<SupabaseYjsChannel["send"]>[0];
type BroadcastCallback = Parameters<SupabaseYjsChannel["on"]>[2];

class MemoryChannel implements SupabaseYjsChannel {
  readonly sent: BroadcastMessage[] = [];
  private callbacks: Array<{ event: string; callback: BroadcastCallback }> = [];
  peers: MemoryChannel[] = [];

  send(message: BroadcastMessage): void {
    this.sent.push(message);
    this.peers.forEach((peer) => peer.receive(message));
  }

  on(_type: "broadcast", filter: { event: string }, callback: BroadcastCallback): void {
    this.callbacks.push({ event: filter.event, callback });
  }

  receive(message: BroadcastMessage): void {
    this.callbacks
      .filter((entry) => entry.event === message.event)
      .forEach((entry) => entry.callback({ payload: message.payload }));
  }
}

function connectChannels(...channels: MemoryChannel[]) {
  channels.forEach((channel) => {
    channel.peers = channels.filter((peer) => peer !== channel);
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const config: CustomSlideConfig = {
  background: "FFFFFF",
  showHaraldFooter: true,
  speakerNotes: "Nota inicial",
  blocks: [
    {
      id: "title-1",
      kind: "title",
      x: 40,
      y: 30,
      w: 900,
      h: 80,
      z: 1,
      text: "Titulo original",
      size: 44,
      bold: true,
      color: "C8102E",
      align: "left",
    },
  ],
};

async function createSharedKey(): Promise<CryptoKey> {
  const { contentKey } = await createCollabRoomKeyBundle({
    roomPublicId: "room-yjs-test",
    editorCode: "ED_ABCDEF-GHIJKL-MNPQRS-TUVWXY",
    viewerCode: "VW_ABCDEF-GHIJKL-MNPQRS-TUVWXY",
  });
  return contentKey;
}

function titleText(doc: Y.Doc): Y.Text {
  const { blocks } = getCustomSlideYDocParts(doc);
  return blocks.get("title-1")?.get("texts")?.get("text") as Y.Text;
}

describe("SupabaseYjsProvider", () => {
  it("broadcasts encrypted Yjs updates between two docs and preserves the merged config", async () => {
    const contentKey = await createSharedKey();
    const docA = customSlideConfigToYDoc(config);
    const docB = new Y.Doc();
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    const channelA = new MemoryChannel();
    const channelB = new MemoryChannel();
    connectChannels(channelA, channelB);
    const providerA = createSupabaseYjsProvider({ doc: docA, channel: channelA, contentKey, clientId: "client-a", throttleMs: 10 });
    const providerB = createSupabaseYjsProvider({ doc: docB, channel: channelB, contentKey, clientId: "client-b", throttleMs: 10 });

    const text = titleText(docA);
    text.delete(0, text.length);
    text.insert(0, "Titulo editado no cliente A");
    await wait(30);

    expect(yDocToCustomSlideConfig(docB).blocks[0]).toMatchObject({
      id: "title-1",
      text: "Titulo editado no cliente A",
    });
    expect(channelA.sent).toHaveLength(1);
    const serializedPayload = JSON.stringify(channelA.sent[0].payload);
    expect(serializedPayload).not.toContain("Titulo editado no cliente A");
    expect(serializedPayload).toContain("ciphertext");

    providerA.destroy();
    providerB.destroy();
  });

  it("groups frequent local updates before encrypting and sending", async () => {
    const contentKey = await createSharedKey();
    const docA = customSlideConfigToYDoc(config);
    const docB = new Y.Doc();
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    const channelA = new MemoryChannel();
    const channelB = new MemoryChannel();
    connectChannels(channelA, channelB);
    const providerA = createSupabaseYjsProvider({ doc: docA, channel: channelA, contentKey, clientId: "client-a", throttleMs: 25 });
    const providerB = createSupabaseYjsProvider({ doc: docB, channel: channelB, contentKey, clientId: "client-b", throttleMs: 25 });

    const text = titleText(docA);
    text.insert(text.length, " 1");
    text.insert(text.length, " 2");
    text.insert(text.length, " 3");
    await wait(60);

    expect(channelA.sent).toHaveLength(1);
    expect((yDocToCustomSlideConfig(docB).blocks[0] as { text: string }).text).toBe("Titulo original 1 2 3");

    providerA.destroy();
    providerB.destroy();
  });

  it("discards corrupted encrypted updates without breaking the local document", async () => {
    const contentKey = await createSharedKey();
    const doc = customSlideConfigToYDoc(config);
    const channel = new MemoryChannel();
    const discarded: string[] = [];
    const provider = createSupabaseYjsProvider({
      doc,
      channel,
      contentKey,
      clientId: "client-a",
      throttleMs: 10,
      onDiscardedUpdate: (reason) => discarded.push(reason),
    });

    channel.receive({
      type: "broadcast",
      event: "yjs-update",
      payload: {
        id: "bad-message",
        senderId: "client-b",
        sentAt: Date.now(),
        encrypted: {
          schema_version: 1,
          algorithm: "AES-GCM-256",
          payload_type: "yjs-update",
          iv: "bad",
          ciphertext: "bad",
        },
      },
    });
    await wait(10);

    expect(discarded).toEqual(["decrypt_failed"]);
    expect(yDocToCustomSlideConfig(doc)).toEqual(config);

    provider.destroy();
  });
});
