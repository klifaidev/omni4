import { describe, expect, it } from "vitest";
import {
  collabDegradedReasonFromRealtimeStatus,
  isEdgeFunctionQuotaError,
  nextCollabReconnectDelayMs,
} from "@/lib/collabDegradedMode";

describe("collabDegradedMode", () => {
  it("uses growing realtime reconnect intervals with a 15 minute ceiling", () => {
    expect(nextCollabReconnectDelayMs(0)).toBe(30_000);
    expect(nextCollabReconnectDelayMs(1)).toBe(60_000);
    expect(nextCollabReconnectDelayMs(2)).toBe(5 * 60_000);
    expect(nextCollabReconnectDelayMs(3)).toBe(15 * 60_000);
    expect(nextCollabReconnectDelayMs(99)).toBe(15 * 60_000);
  });

  it("detects Edge Function quota failures from Supabase error shapes", () => {
    expect(isEdgeFunctionQuotaError({ status: 402 })).toBe(true);
    expect(isEdgeFunctionQuotaError({ context: { status: 402 } })).toBe(true);
    expect(isEdgeFunctionQuotaError(new Error("Function returned 402"))).toBe(true);
    expect(isEdgeFunctionQuotaError({ status: 500 })).toBe(false);
  });

  it("classifies realtime degraded-mode triggers without treating normal subscription as failure", () => {
    expect(collabDegradedReasonFromRealtimeStatus("CHANNEL_ERROR")).toBe("realtime_channel_error");
    expect(collabDegradedReasonFromRealtimeStatus("TIMED_OUT")).toBe("realtime_reconnect_failed");
    expect(collabDegradedReasonFromRealtimeStatus("CLOSED")).toBe("realtime_join_refused");
    expect(collabDegradedReasonFromRealtimeStatus("SUBSCRIBED")).toBeNull();
  });
});
