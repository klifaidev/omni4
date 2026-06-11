import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Alert } from "@/lib/analytics";

export interface AlertRecord {
  id: string;
  detectedAt: number;
  resolvedAt?: number;
  status: "active" | "resolved" | "dismissed";
  severity: "high" | "medium" | "low";
  message: string;
  page: string;
  icon: string;
  dataSnapshot: string;
}

interface AlertHistoryState {
  records: AlertRecord[];
  syncAlerts: (currentAlerts: Alert[], dataSnapshot: string) => void;
  resolveAlert: (id: string) => void;
  dismissAlert: (id: string) => void;
  clearAll: () => void;
}

const MAX_RECORDS = 100;

export const useAlertHistory = create<AlertHistoryState>()(
  persist(
    (set, get) => ({
      records: [],
      syncAlerts: (currentAlerts, dataSnapshot) => {
        const now = Date.now();
        const existing = get().records;
        const byId = new Map(existing.map((r) => [r.id, r]));
        const currentIds = new Set(currentAlerts.map((a) => a.id));

        const next: AlertRecord[] = [];

        // Update existing + add new
        for (const a of currentAlerts) {
          const prev = byId.get(a.id);
          if (prev) {
            // If it was resolved/dismissed and reappeared, re-activate
            if (prev.status !== "active") {
              next.push({
                ...prev,
                status: "active",
                resolvedAt: undefined,
                detectedAt: now,
                message: a.message,
                severity: a.severity,
                page: a.page,
                icon: a.icon,
                dataSnapshot,
              });
            } else {
              // Keep existing detectedAt, refresh message/severity in case it changed
              next.push({
                ...prev,
                message: a.message,
                severity: a.severity,
                page: a.page,
                icon: a.icon,
              });
            }
          } else {
            next.push({
              id: a.id,
              detectedAt: now,
              status: "active",
              severity: a.severity,
              message: a.message,
              page: a.page,
              icon: a.icon,
              dataSnapshot,
            });
          }
        }

        // Carry over records not in current alerts
        for (const r of existing) {
          if (currentIds.has(r.id)) continue;
          if (r.status === "active") {
            next.push({ ...r, status: "resolved", resolvedAt: r.resolvedAt ?? now });
          } else {
            next.push(r);
          }
        }

        // Sort by detectedAt desc and cap
        next.sort((a, b) => b.detectedAt - a.detectedAt);
        set({ records: next.slice(0, MAX_RECORDS) });
      },
      resolveAlert: (id) =>
        set((s) => ({
          records: s.records.map((r) =>
            r.id === id ? { ...r, status: "resolved", resolvedAt: Date.now() } : r,
          ),
        })),
      dismissAlert: (id) =>
        set((s) => ({
          records: s.records.map((r) =>
            r.id === id ? { ...r, status: "dismissed", resolvedAt: Date.now() } : r,
          ),
        })),
      clearAll: () => set({ records: [] }),
    }),
    { name: "app-alert-history-v1" },
  ),
);

export const useActiveAlertCount = () =>
  useAlertHistory((s) => s.records.filter((r) => r.status === "active").length);
