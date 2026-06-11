import { create } from "zustand";
import { persist } from "zustand/middleware";

export type NotificationType = "alert" | "activity_due" | "activity_overdue" | "system";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  href?: string;
  read: boolean;
  createdAt: number;
}

interface NotificationsState {
  notifications: Notification[];
  addNotification: (n: Omit<Notification, "id" | "read" | "createdAt">) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
}

const MAX = 50;

function nid() {
  return `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export const useNotifications = create<NotificationsState>()(
  persist(
    (set) => ({
      notifications: [],
      addNotification: (n) =>
        set((s) => {
          const next: Notification = {
            ...n,
            id: nid(),
            read: false,
            createdAt: Date.now(),
          };
          const all = [next, ...s.notifications].slice(0, MAX);
          return { notifications: all };
        }),
      markRead: (id) =>
        set((s) => ({
          notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
        })),
      markAllRead: () =>
        set((s) => ({
          notifications: s.notifications.map((n) => ({ ...n, read: true })),
        })),
      clearAll: () => set({ notifications: [] }),
    }),
    { name: "app-notifications-v1" },
  ),
);
