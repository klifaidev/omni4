// Slides Flow store — itens em construção + presets persistidos em localStorage.
import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import type { SlideItem, SlideKind } from "@/lib/slidesFlow";
import { defaultItem, newId } from "@/lib/slidesFlow";
import { migrateDataSource } from "@/lib/customSlide";

const SLIDES_FLOW_STORAGE_KEY = "pricing.slidesFlow.v1";
const SLIDES_FLOW_BACKUP_KEY = "pricing.slidesFlow.v1.backup";
const SLIDES_FLOW_BACKUP_LIMIT = 3;

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

  // Presets
  savePreset: (name: string, description?: string) => SlidesPreset;
  importPreset: (preset: SlidesPreset) => SlidesPreset;
  overwritePreset: (id: string) => void;
  loadPreset: (id: string) => void;
  deletePreset: (id: string) => void;
  renamePreset: (id: string, name: string, description?: string) => void;
}

function uniqueId(existing: Set<string>, candidate?: string): string {
  let id = candidate && !existing.has(candidate) ? candidate : newId();
  while (existing.has(id)) id = newId();
  existing.add(id);
  return id;
}

function sanitizeCustomSlideItem(item: Extract<SlideItem, { kind: "custom" }>): Extract<SlideItem, { kind: "custom" }> {
  if (!item.config || !Array.isArray(item.config.blocks)) return item;
  const blockIds = new Set<string>();
  const groupIds = new Set<string>();
  const blockReplacements = new Map<string, string[]>();
  let blocksChanged = false;

  const blocks = item.config.blocks.map((block) => {
    const id = uniqueId(blockIds, block.id);
    const replacements = blockReplacements.get(block.id) ?? [];
    replacements.push(id);
    blockReplacements.set(block.id, replacements);
    if (id === block.id) return block;
    blocksChanged = true;
    return { ...block, id };
  });

  const validBlockIds = new Set(blocks.map((block) => block.id));
  let groupsChanged = false;
  const groups = (item.config.groups ?? [])
    .map((group) => {
      const memberIds = Array.from(new Set(
        group.memberIds.flatMap((memberId) => blockReplacements.get(memberId) ?? [memberId]),
      )).filter((memberId) => validBlockIds.has(memberId));
      const id = uniqueId(groupIds, group.id);
      if (id !== group.id || memberIds.length !== group.memberIds.length
        || memberIds.some((memberId, index) => memberId !== group.memberIds[index])) {
        groupsChanged = true;
        return { ...group, id, memberIds };
      }
      return group;
    })
    .filter((group) => {
      const keep = group.memberIds.length > 1;
      if (!keep) groupsChanged = true;
      return keep;
    });
  const nextGroups = groups.length > 0 ? groups : undefined;
  const currentGroups = item.config.groups;
  const groupPresenceChanged = (currentGroups?.length ?? 0) !== (nextGroups?.length ?? 0);

  if (!blocksChanged && !groupsChanged && !groupPresenceChanged) return item;

  return {
    ...item,
    config: {
      ...item.config,
      blocks,
      groups: nextGroups,
    },
  };
}

export function sanitizeSlidesFlowItems(items: SlideItem[]): SlideItem[] {
  const slideIds = new Set<string>();
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const id = uniqueId(slideIds, item.id);
    const withUniqueSlideId = id === item.id ? item : ({ ...item, id } as SlideItem);
    return withUniqueSlideId.kind === "custom"
      ? sanitizeCustomSlideItem(withUniqueSlideId)
      : withUniqueSlideId;
  });
}

export function migrateSlidesFlowItemsDataSources(items: SlideItem[]): SlideItem[] {
  if (!Array.isArray(items)) return [];
  for (const item of items) {
    try {
      if (item.kind !== "custom") continue;
      if (!item.config || !Array.isArray(item.config.blocks)) continue;
      for (const blk of item.config.blocks) {
        const b = blk as { dataSource?: string };
        b.dataSource = migrateDataSource(b.dataSource);
      }
    } catch (error) {
      console.warn("[slidesFlow] Falha ao migrar item; preservando dados originais.", error);
    }
  }
  return items;
}

function persistedSlidesStateHasContent(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as { state?: { items?: unknown[]; presets?: unknown[] } };
    const items = Array.isArray(parsed.state?.items) ? parsed.state.items.length : 0;
    const presets = Array.isArray(parsed.state?.presets) ? parsed.state.presets.length : 0;
    return items > 0 || presets > 0;
  } catch {
    return raw.trim().length > 0;
  }
}

function pushSlidesFlowBackupRaw(raw: string, storage: Pick<Storage, "getItem" | "setItem">) {
  if (!persistedSlidesStateHasContent(raw)) return;
  try {
    const existingRaw = storage.getItem(SLIDES_FLOW_BACKUP_KEY);
    const existing = existingRaw ? JSON.parse(existingRaw) : [];
    const backups = Array.isArray(existing) ? existing : [];
    if (backups[0]?.value === raw) return;
    const next = [{ createdAt: Date.now(), value: raw }, ...backups]
      .filter((entry) => entry && typeof entry.value === "string" && persistedSlidesStateHasContent(entry.value))
      .slice(0, SLIDES_FLOW_BACKUP_LIMIT);

    for (let keep = next.length; keep > 0; keep -= 1) {
      try {
        storage.setItem(SLIDES_FLOW_BACKUP_KEY, JSON.stringify(next.slice(0, keep)));
        return;
      } catch (error) {
        if (keep === 1) throw error;
      }
    }
  } catch (error) {
    console.warn("[slidesFlow] Backup local excedeu o limite de armazenamento; esteira principal preservada.", error);
  }
}

export function getLatestSlidesFlowBackupRaw(storage: Pick<Storage, "getItem"> | undefined = typeof localStorage !== "undefined" ? localStorage : undefined) {
  if (!storage) return null;
  try {
    const existingRaw = storage.getItem(SLIDES_FLOW_BACKUP_KEY);
    const existing = existingRaw ? JSON.parse(existingRaw) : [];
    if (!Array.isArray(existing)) return null;
    const backup = existing.find((entry) => entry && typeof entry.value === "string" && persistedSlidesStateHasContent(entry.value));
    return backup?.value ?? null;
  } catch (error) {
    console.warn("[slidesFlow] Falha ao ler backup da esteira.", error);
    return null;
  }
}

export function backupSlidesFlowRawState(storage: Pick<Storage, "getItem" | "setItem"> | undefined = typeof localStorage !== "undefined" ? localStorage : undefined) {
  if (!storage) return;
  try {
    const raw = storage.getItem(SLIDES_FLOW_STORAGE_KEY);
    if (!raw || !persistedSlidesStateHasContent(raw)) return;
    pushSlidesFlowBackupRaw(raw, storage);
  } catch (error) {
    console.warn("[slidesFlow] Falha ao criar backup preventivo da esteira.", error);
  }
}

export function restoreSlidesFlowRawStateFromBackup(storage: Pick<Storage, "getItem" | "setItem"> | undefined = typeof localStorage !== "undefined" ? localStorage : undefined) {
  if (!storage) return null;
  try {
    const backup = getLatestSlidesFlowBackupRaw(storage);
    if (!backup) return null;
    storage.setItem(SLIDES_FLOW_STORAGE_KEY, backup);
    return backup;
  } catch (error) {
    console.warn("[slidesFlow] Falha ao restaurar backup da esteira.", error);
    return null;
  }
}

export function createSlidesFlowStorage(storage: Storage | undefined = typeof localStorage !== "undefined" ? localStorage : undefined): StateStorage {
  return {
    getItem: (name) => {
      if (!storage) return null;
      const raw = storage.getItem(name);
      if (name !== SLIDES_FLOW_STORAGE_KEY) return raw;
      if (raw && persistedSlidesStateHasContent(raw)) return raw;
      const restored = restoreSlidesFlowRawStateFromBackup(storage);
      if (restored) console.warn("[slidesFlow] Esteira vazia detectada; backup local restaurado automaticamente.");
      return restored ?? raw;
    },
    setItem: (name, value) => {
      if (!storage) return;
      if (name === SLIDES_FLOW_STORAGE_KEY) {
        const previous = storage.getItem(name);
        if (previous && persistedSlidesStateHasContent(previous)) {
          pushSlidesFlowBackupRaw(previous, storage);
          if (!persistedSlidesStateHasContent(value)) {
            console.warn("[slidesFlow] Gravacao vazia bloqueada para preservar a esteira salva.");
            return;
          }
        }
      }
      storage.setItem(name, value);
    },
    removeItem: (name) => {
      if (!storage) return;
      if (name === SLIDES_FLOW_STORAGE_KEY) backupSlidesFlowRawState(storage);
      storage.removeItem(name);
    },
  };
}

export const useSlidesFlow = create<SlidesFlowState>()(
  persist(
    (set, get) => ({
      items: [],
      presets: [],
      selectedId: null,
      transition: "fade",

      setTransition: (t) => set({ transition: t }),

      addItem: (kind) =>
        set((s) => {
          const item = defaultItem(kind);
          return { items: [...s.items, item], selectedId: item.id };
        }),

      removeItem: (id) =>
        set((s) => ({
          items: s.items.filter((i) => i.id !== id),
          selectedId: s.selectedId === id ? null : s.selectedId,
        })),

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
          return { items, selectedId: clone.id };
        }),

      updateItem: (id, patch) =>
        set((s) => ({
          items: sanitizeSlidesFlowItems(s.items.map((i) => {
            if (i.id !== id) return i;
            return typeof patch === "function" ? patch(i) : ({ ...i, ...patch } as SlideItem);
          })),
        })),

      reorder: (sourceId, targetId) =>
        set((s) => {
          const from = s.items.findIndex((i) => i.id === sourceId);
          const to = s.items.findIndex((i) => i.id === targetId);
          if (from < 0 || to < 0 || from === to) return {};
          const items = [...s.items];
          const [moved] = items.splice(from, 1);
          items.splice(to, 0, moved);
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

      importPreset: (preset) => {
        const now = Date.now();
        const safeItems = migrateSlidesFlowItemsDataSources(sanitizeSlidesFlowItems(
          JSON.parse(JSON.stringify(preset.items ?? [])) as SlideItem[],
        ));
        const imported: SlidesPreset = {
          id: preset.id && !get().presets.some((p) => p.id === preset.id) ? preset.id : newId(),
          name: preset.name?.trim() || "Modelo importado",
          description: preset.description?.trim(),
          items: safeItems,
          createdAt: Number.isFinite(preset.createdAt) ? preset.createdAt : now,
          updatedAt: now,
        };
        set((s) => ({ presets: [...s.presets, imported] }));
        return imported;
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
        const safeItems = sanitizeSlidesFlowItems(items);
        set({ items: safeItems, selectedId: safeItems[0]?.id ?? null });
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
      name: SLIDES_FLOW_STORAGE_KEY,
      storage: createJSONStorage(() => createSlidesFlowStorage()),
      partialize: (s) => ({ items: s.items, presets: s.presets, transition: s.transition }),
      onRehydrateStorage: () => {
        backupSlidesFlowRawState();
        return (state, error) => {
          if (error) {
            console.error("[slidesFlow] Falha ao reidratar esteira de slides.", error);
            return;
          }
          if (!state) return;
          try {
            const safeItems = sanitizeSlidesFlowItems(Array.isArray(state.items) ? state.items : []);
            state.items = migrateSlidesFlowItemsDataSources(safeItems);
          } catch (migrationError) {
            console.error("[slidesFlow] Falha ao migrar items; preservando estado reidratado.", migrationError);
            if (!Array.isArray(state.items)) state.items = [];
          }
          try {
            if (!Array.isArray(state.presets)) {
              state.presets = [];
            } else {
              for (const preset of state.presets) {
                try {
                  preset.items = migrateSlidesFlowItemsDataSources(sanitizeSlidesFlowItems(
                    Array.isArray(preset.items) ? preset.items : [],
                  ));
                } catch (presetError) {
                  console.error(`[slidesFlow] Falha ao migrar preset "${preset.name}"; preservando items originais.`, presetError);
                }
              }
            }
          } catch (presetMigrationError) {
            console.error("[slidesFlow] Falha ao migrar presets; preservando estado reidratado.", presetMigrationError);
          }
        };
      },
    },
  ),
);
