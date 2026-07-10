export type CollabDegradedReason =
  | "realtime_channel_error"
  | "realtime_reconnect_failed"
  | "realtime_join_refused"
  | "edge_function_quota";

export type CollabDegradedLogEntry = {
  at: string;
  action: "activated" | "recovered";
  reason: CollabDegradedReason;
  roomId: string | null;
  detail?: string;
};

const BACKOFF_MS = [30_000, 60_000, 5 * 60_000, 15 * 60_000] as const;
const LOG_KEY = "omni4.collab.degradedLog";

export function nextCollabReconnectDelayMs(attempt: number): number {
  return BACKOFF_MS[Math.min(Math.max(0, attempt), BACKOFF_MS.length - 1)];
}

export function collabDegradedReasonFromRealtimeStatus(status: string): CollabDegradedReason | null {
  if (status === "CHANNEL_ERROR") return "realtime_channel_error";
  if (status === "TIMED_OUT") return "realtime_reconnect_failed";
  if (status === "CLOSED") return "realtime_join_refused";
  return null;
}

export function isEdgeFunctionQuotaError(error: unknown): boolean {
  const candidate = error as {
    status?: unknown;
    context?: { status?: unknown };
    message?: unknown;
  } | null;
  return candidate?.status === 402
    || candidate?.context?.status === 402
    || (typeof candidate?.message === "string" && /\b402\b/.test(candidate.message));
}

export function recordCollabDegradedLog(entry: CollabDegradedLogEntry): void {
  try {
    const current = JSON.parse(localStorage.getItem(LOG_KEY) ?? "[]") as CollabDegradedLogEntry[];
    const next = [...current, entry].slice(-100);
    localStorage.setItem(LOG_KEY, JSON.stringify(next));
  } catch {
    /* Local logging is best-effort only. */
  }

  console.info("[omni4-collab-degraded]", entry);
}

export function getCollabDegradedLog(): CollabDegradedLogEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOG_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed as CollabDegradedLogEntry[] : [];
  } catch {
    return [];
  }
}
