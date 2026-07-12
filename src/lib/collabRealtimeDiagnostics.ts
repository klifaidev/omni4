export type CollabRealtimeSendKind =
  | "deck-op"
  | "presence-track"
  | "yjs-update"
  | "yjs-awareness";

type SendBucket = {
  second: number;
  counts: Partial<Record<CollabRealtimeSendKind, number>>;
  total: number;
};

type SendStats = {
  enabled: boolean;
  current: SendBucket | null;
  history: SendBucket[];
  totals: Partial<Record<CollabRealtimeSendKind, number>>;
  reset: () => void;
};

declare global {
  interface Window {
    __OMNI_COLLAB_SEND_DIAGNOSTICS__?: boolean;
    __OMNI_COLLAB_SEND_STATS__?: SendStats;
  }
}

function createStats(): SendStats {
  return {
    enabled: false,
    current: null,
    history: [],
    totals: {},
    reset() {
      this.current = null;
      this.history = [];
      this.totals = {};
    },
  };
}

function stats(): SendStats | null {
  if (typeof window === "undefined") return null;
  window.__OMNI_COLLAB_SEND_STATS__ ??= createStats();
  window.__OMNI_COLLAB_SEND_STATS__.enabled = window.__OMNI_COLLAB_SEND_DIAGNOSTICS__ === true;
  return window.__OMNI_COLLAB_SEND_STATS__;
}

export function recordCollabRealtimeSend(kind: CollabRealtimeSendKind): void {
  const target = stats();
  if (!target?.enabled) return;

  const second = Math.floor(Date.now() / 1000) * 1000;
  if (!target.current || target.current.second !== second) {
    if (target.current) {
      target.history.push(target.current);
      if (target.history.length > 120) target.history.shift();
      console.info("[omni4-collab-send/sec]", target.current);
    }
    target.current = { second, counts: {}, total: 0 };
  }

  target.current.counts[kind] = (target.current.counts[kind] ?? 0) + 1;
  target.current.total += 1;
  target.totals[kind] = (target.totals[kind] ?? 0) + 1;
}

export function getCollabRealtimeSendStats(): SendStats | null {
  return stats();
}
