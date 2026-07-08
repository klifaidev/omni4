// Slides Flow store — itens em construção + presets persistidos em localStorage.
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { SlideItem, SlideKind } from "@/lib/slidesFlow";
import { defaultItem, newId } from "@/lib/slidesFlow";
import type { CollabEvent } from "@/lib/collaboration";
import { migrateDataSource } from "@/lib/customSlide";

export interface SlidesPreset {
  id: string;
  name: string;
  description?: string;
  items: SlideItem[];
  createdAt: number;
  updatedAt: number;
}

export type SlideTransition = "none" | "fade" | "slide-left" | "slide-up" | "zoom";

interface SlidesFlowState {
  items: SlideItem[];
  presets: SlidesPreset[];
  selectedId: string | null;
  transition: SlideTransition;

  // Colaboração — função opcional injetada pelo hook useCollaboration.
  _collabBroadcast: ((e: CollabEvent) => void) | null;
  _collabUserId: string | null;
  setCollabBroadcast: (fn: ((e: CollabEvent) => void) | null, userId?: string | null) => void;

  // Itens
  addItem: (kind: SlideKind) => void;
  removeItem: (id: string) => void;
  duplicateItem: (id: string) => void;
  updateItem: (id: string, patch: Partial<SlideItem> | ((s: SlideItem) => SlideItem)) => void;
  reorder: (sourceId: string, targetId: string) => void;
  clearItems: () => void;
  duplicateDeck: () => void;
  select: (id: string | null) => void;
  setTransition: (t: SlideTransition) => void;

  // Mutações vindas de colaboradores (não re-broadcast)
  addItemFromCollab: (item: SlideItem) => void;
  updateItemFromCollab: (payload: { id: string; patch: Partial<SlideItem> }) => void;
  loadPresetFromCollab: (items: SlideItem[]) => void;
  applySnapshotFromCollab: (payload: {
    items: SlideItem[];
    selectedId: string | null;
    transition: SlideTransition;
  }) => void;

  // Presets
  savePreset: (name: string, description?: string) => SlidesPreset;
  overwritePreset: (id: string) => void;
  loadPreset: (id: string) => void;
  deletePreset: (id: string) => void;
  renamePreset: (id: string, name: string, description?: string) => void;
}

export const useSlidesFlow = create<SlidesFlowState>()(
  persist(
    (set, get) => ({
      items: [],
      presets: [],
      selectedId: null,
      transition: "fade",

      _collabBroadcast: null,
      _collabUserId: null,
      setCollabBroadcast: (fn, userId = null) =>
        set({ _collabBroadcast: fn, _collabUserId: userId }),

      setTransition: (t) =>
        set((s) => {
          if (s._collabBroadcast) {
            s._collabBroadcast({
              type: "update_transition",
              payload: { transition: t },
              userId: s._collabUserId ?? "local",
              ts: Date.now(),
            });
          }
          return { transition: t };
        }),

      addItem: (kind) =>
        set((s) => {
          const item = defaultItem(kind);
          if (s._collabBroadcast) {
            s._collabBroadcast({
              type: "add_item",
              payload: item,
              userId: s._collabUserId ?? "local",
              ts: Date.now(),
            });
          }
          return { items: [...s.items, item], selectedId: item.id };
        }),

      addItemFromCollab: (item) =>
        set((s) => ({ items: [...s.items, item] })),

      loadPresetFromCollab: (items) =>
        set({ items, selectedId: items[0]?.id ?? null }),

      applySnapshotFromCollab: ({ items, selectedId, transition }) =>
        set({
          items,
          selectedId: selectedId && items.some((item) => item.id === selectedId)
            ? selectedId
            : items[0]?.id ?? null,
          transition,
        }),

      removeItem: (id) =>
        set((s) => {
          if (s._collabBroadcast) {
            s._collabBroadcast({
              type: "remove_item",
              payload: { id },
              userId: s._collabUserId ?? "local",
              ts: Date.now(),
            });
          }
          return {
            items: s.items.filter((i) => i.id !== id),
            selectedId: s.selectedId === id ? null : s.selectedId,
          };
        }),

      duplicateItem: (id) =>
        set((s) => {
          const idx = s.items.findIndex((i) => i.id === id);
          if (idx < 0) return {};
          const orig = s.items[idx];
          const clone = JSON.parse(JSON.stringify(orig)) as SlideItem;
          clone.id = newId();
          if (clone.label) clone.label = `${clone.label} (cópia)`;
          const items = [...s.items];
          items.splice(idx + 1, 0, clone);
          if (s._collabBroadcast) {
            s._collabBroadcast({
              type: "add_item",
              payload: clone,
              userId: s._collabUserId ?? "local",
              ts: Date.now(),
            });
          }
          return { items, selectedId: clone.id };
        }),

      updateItem: (id, patch) =>
        set((s) => {
          const next = s.items.map((i) => {
            if (i.id !== id) return i;
            return typeof patch === "function" ? patch(i) : ({ ...i, ...patch } as SlideItem);
          });
          if (s._collabBroadcast && typeof patch !== "function") {
            s._collabBroadcast({
              type: "update_item",
              payload: { id, patch },
              userId: s._collabUserId ?? "local",
              ts: Date.now(),
            });
          } else if (s._collabBroadcast) {
            // Para mutações funcionais transmitimos o item final completo.
            const updated = next.find((i) => i.id === id);
            if (updated) {
              s._collabBroadcast({
                type: "update_item",
                payload: { id, patch: updated },
                userId: s._collabUserId ?? "local",
                ts: Date.now(),
              });
            }
          }
          return { items: next };
        }),

      updateItemFromCollab: ({ id, patch }) =>
        set((s) => ({
          items: s.items.map((i) => (i.id === id ? ({ ...i, ...patch } as SlideItem) : i)),
        })),

      reorder: (sourceId, targetId) =>
        set((s) => {
          const from = s.items.findIndex((i) => i.id === sourceId);
          const to = s.items.findIndex((i) => i.id === targetId);
          if (from < 0 || to < 0 || from === to) return {};
          const items = [...s.items];
          const [moved] = items.splice(from, 1);
          items.splice(to, 0, moved);
          if (s._collabBroadcast) {
            s._collabBroadcast({
              type: "reorder",
              payload: { activeId: sourceId, overId: targetId },
              userId: s._collabUserId ?? "local",
              ts: Date.now(),
            });
          }
          return { items };
        }),

      clearItems: () => set({ items: [], selectedId: null }),

      duplicateDeck: () =>
        set((s) => {
          if (s.items.length === 0) return {};
          const clones = s.items.map((i) => {
            const c = JSON.parse(JSON.stringify(i)) as SlideItem;
            c.id = newId();
            return c;
          });
          const nextItems = [...s.items, ...clones];
          if (s._collabBroadcast) {
            s._collabBroadcast({
              type: "load_preset",
              payload: { items: nextItems },
              userId: s._collabUserId ?? "local",
              ts: Date.now(),
            });
          }
          return { items: nextItems, selectedId: clones[0]?.id ?? s.selectedId };
        }),
      select: (id) => set({ selectedId: id }),

      savePreset: (name, description) => {
        const now = Date.now();
        const preset: SlidesPreset = {
          id: newId(),
          name: name.trim() || "Pré-definição sem nome",
          description: description?.trim(),
          // deep clone para evitar mutações futuras vazarem para o preset
          items: JSON.parse(JSON.stringify(get().items)),
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({ presets: [...s.presets, preset] }));
        return preset;
      },

      overwritePreset: (id) =>
        set((s) => ({
          presets: s.presets.map((p) =>
            p.id === id
              ? { ...p, items: JSON.parse(JSON.stringify(s.items)), updatedAt: Date.now() }
              : p,
          ),
        })),

      loadPreset: (id) => {
        const state = get();
        const p = state.presets.find((x) => x.id === id);
        if (!p) return;
        // Deep clone + regenera ids dos itens para evitar conflito com a sessão atual
        const items = p.items.map((i) => ({
          ...JSON.parse(JSON.stringify(i)),
          id: newId(),
        })) as SlideItem[];
        set({ items, selectedId: items[0]?.id ?? null });
        if (state._collabBroadcast) {
          state._collabBroadcast({
            type: "load_preset",
            payload: { items },
            userId: state._collabUserId ?? "local",
            ts: Date.now(),
          });
        }
      },

      deletePreset: (id) =>
        set((s) => ({ presets: s.presets.filter((p) => p.id !== id) })),

      renamePreset: (id, name, description) =>
        set((s) => ({
          presets: s.presets.map((p) =>
            p.id === id
              ? { ...p, name: name.trim() || p.name, description: description?.trim(), updatedAt: Date.now() }
              : p,
          ),
        })),
    }),
    {
      name: "pricing.slidesFlow.v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ items: s.items, presets: s.presets, transition: s.transition }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const migrateItems = (items: SlideItem[]) => {
          for (const item of items) {
            if (item.kind !== "custom") continue;
            for (const blk of item.config.blocks) {
              const b = blk as { dataSource?: string };
              b.dataSource = migrateDataSource(b.dataSource);
            }
          }
        };
        migrateItems(state.items);
        for (const preset of state.presets) migrateItems(preset.items);
      },
    },
  ),
);
