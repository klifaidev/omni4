import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { createCollabRoomKeyBundle } from "@/lib/collabCrypto";
import type { CustomSlideConfig } from "@/lib/customSlide";
import { customSlideConfigToYDoc, getCustomSlideYDocParts, yDocToCustomSlideConfig } from "@/lib/customSlideYjs";
import {
  createSupabaseYjsProvider,
  getTextAwarenessStates,
  getYjsAwarenessSecurityPolicy,
  type SupabaseYjsChannel,
} from "@/lib/supabaseYjsProvider";

type BroadcastMessage = Parameters<SupabaseYjsChannel["send"]>[0];
type BroadcastCallback = Parameters<SupabaseYjsChannel["on"]>[2];

class MemoryChannel implements SupabaseYjsChannel {
  readonly sent: BroadcastMessage[] = [];
  private callbacks: Array<{ event: string; callback: BroadcastCallback }> = [];
  peers: MemoryChannel[] = [];
  failSend = false;

  send(message: BroadcastMessage): "ok" | "error" {
    if (this.failSend) return "error";
    this.sent.push(message);
    this.peers.forEach((peer) => peer.receive(message));
    return "ok";
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

async function waitFor(check: () => boolean, timeoutMs = 300): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) return;
    await wait(10);
  }
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
    await waitFor(() => (yDocToCustomSlideConfig(docB).blocks[0] as { text: string }).text === "Titulo editado no cliente A");

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
    await waitFor(() => (yDocToCustomSlideConfig(docB).blocks[0] as { text: string }).text === "Titulo original 1 2 3");

    expect(channelA.sent).toHaveLength(1);
    expect((yDocToCustomSlideConfig(docB).blocks[0] as { text: string }).text).toBe("Titulo original 1 2 3");

    providerA.destroy();
    providerB.destroy();
  });

  it("keeps local Yjs edits in memory when realtime send fails and merges through the provider after reconnection", async () => {
    const contentKey = await createSharedKey();
    const docA = customSlideConfigToYDoc(config);
    const docB = new Y.Doc();
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    const channelA = new MemoryChannel();
    const channelB = new MemoryChannel();
    connectChannels(channelA, channelB);
    channelA.failSend = true;
    const failures: string[] = [];
    const providerA = createSupabaseYjsProvider({
      doc: docA,
      channel: channelA,
      contentKey,
      clientId: "client-a",
      throttleMs: 10,
      onSendFailure: (reason) => failures.push(reason),
    });
    const providerB = createSupabaseYjsProvider({ doc: docB, channel: channelB, contentKey, clientId: "client-b", throttleMs: 10 });

    titleText(docA).insert(titleText(docA).length, " offline A");
    titleText(docB).insert(titleText(docB).length, " online B");
    await waitFor(() => failures.length > 0);

    expect(failures).toEqual(["send_failed"]);
    expect((yDocToCustomSlideConfig(docA).blocks[0] as { text: string }).text).toContain("offline A");
    expect((yDocToCustomSlideConfig(docB).blocks[0] as { text: string }).text).toContain("online B");

    channelA.failSend = false;
    await providerA.flush();
    await wait(30);

    expect(yDocToCustomSlideConfig(docA)).toEqual(yDocToCustomSlideConfig(docB));
    expect((yDocToCustomSlideConfig(docA).blocks[0] as { text: string }).text).toContain("offline A");
    expect((yDocToCustomSlideConfig(docA).blocks[0] as { text: string }).text).toContain("online B");

    providerA.destroy();
    providerB.destroy();
  });

  it("discards corrupted encrypted updates without breaking the local document", async () => {
    const contentKey = await createSharedKey();
    const doc = customSlideConfigToYDoc(config);
    const peerDoc = new Y.Doc();
    Y.applyUpdate(peerDoc, Y.encodeStateAsUpdate(doc));
    const channel = new MemoryChannel();
    const peerChannel = new MemoryChannel();
    connectChannels(channel, peerChannel);
    const discarded: string[] = [];
    const provider = createSupabaseYjsProvider({
      doc,
      channel,
      contentKey,
      clientId: "client-a",
      throttleMs: 10,
      onDiscardedUpdate: (reason) => discarded.push(reason),
    });
    const peerProvider = createSupabaseYjsProvider({
      doc: peerDoc,
      channel: peerChannel,
      contentKey,
      clientId: "client-b",
      throttleMs: 10,
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

    titleText(peerDoc).insert(titleText(peerDoc).length, " depois do payload invalido");
    await wait(30);

    expect((yDocToCustomSlideConfig(doc).blocks[0] as { text: string }).text)
      .toBe("Titulo original depois do payload invalido");

    provider.destroy();
    peerProvider.destroy();
  });

  it("broadcasts Yjs Awareness encrypted, including text cursor metadata", async () => {
    const contentKey = await createSharedKey();
    const docA = customSlideConfigToYDoc(config);
    const docB = new Y.Doc();
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    const awarenessA = new Awareness(docA);
    const awarenessB = new Awareness(docB);
    const channelA = new MemoryChannel();
    const channelB = new MemoryChannel();
    connectChannels(channelA, channelB);
    const providerA = createSupabaseYjsProvider({
      doc: docA,
      channel: channelA,
      contentKey,
      clientId: "client-a",
      awareness: awarenessA,
      throttleMs: 10,
    });
    const providerB = createSupabaseYjsProvider({
      doc: docB,
      channel: channelB,
      contentKey,
      clientId: "client-b",
      awareness: awarenessB,
      throttleMs: 10,
    });

    awarenessA.setLocalStateField("user", { name: "Ana", color: "#C8102E" });
    awarenessA.setLocalStateField("textSelection", {
      slideId: "slide-1",
      blockId: "title-1",
      field: "text",
      anchor: 2,
      head: 5,
    });
    await wait(30);

    const remoteState = Array.from(awarenessB.getStates().values())
      .find((state) => (state as { user?: { name?: string } }).user?.name === "Ana") as {
        user?: { name: string; color: string };
        textSelection?: { blockId: string; field: string; anchor: number; head: number };
      } | undefined;
    const awarenessMessages = channelA.sent.filter((message) => message.event === "yjs-awareness");

    expect(getYjsAwarenessSecurityPolicy()).toBe("encrypted");
    expect(awarenessMessages.length).toBeGreaterThan(0);
    expect(JSON.stringify(awarenessMessages[0].payload)).not.toContain("Ana");
    expect(remoteState?.user).toEqual({ name: "Ana", color: "#C8102E" });
    expect(remoteState?.textSelection).toMatchObject({ blockId: "title-1", field: "text", anchor: 2, head: 5 });
    expect(getTextAwarenessStates(awarenessB)).toEqual([
      expect.objectContaining({
        name: "Ana",
        color: "#C8102E",
        blockId: "title-1",
        field: "text",
        anchor: 2,
        head: 5,
      }),
    ]);

    providerA.destroy();
    providerB.destroy();
    awarenessA.destroy();
    awarenessB.destroy();
  });
});
