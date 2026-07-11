// Zustand + zundo store for the CustomSlideEditor.
// Wraps the slide config in a temporal store so every mutation is undoable.
//
// Architecture
// ------------
// • Module-level store (only one editor is ever mounted at a time).
// • Editor mounts → calls `bind(config, onChange, slideId)` which:
//     1. Loads the incoming config
//     2. Clears the undo/redo history
//     3. Stores the parent's onChange so subsequent mutations stream out.
// • Every action sets `lastActionLabel` then mutates `config`. zundo
//   snapshots the full state on each mutation. Tooltips read the label
//   from the most recent past/future state.
// • Stack size capped at 50 snapshots (zundo `limit` option).

import { create, useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { temporal } from "zundo";
import { useEffect, useState } from "react";
import { markSlidePerf, measureSlidePerf } from "@/lib/slidesPerfCounters";
import type {
  BlockGroup,
  CustomBlock,
  CustomBlockKind,
  CustomChartType,
  CustomSlideConfig,
} from "@/lib/customSlide";
import { newBlock, newChartBlock } from "@/lib/customSlide";

export type EditorActionLabel =
  | "Adicionar bloco"
  | "Excluir bloco"
  | "Excluir blocos"
  | "Mover bloco"
  | "Mover blocos"
  | "Redimensionar bloco"
  | "Redimensionar grupo"
  | "Alterar estilo"
  | "Alterar dados"
  | "Duplicar bloco"
  | "Duplicar blocos"
  | "Alterar ordem"
  | "Bloquear / Desbloquear"
  | "Alterar slide"
  | "Alinhar blocos"
  | "Agrupar blocos"
  | "Desagrupar blocos"
  | "Colar estilo"
  | "Reordenar camadas"
  | "Mostrar bloco"
  | "Ocultar bloco"
  | "Mostrar blocos"
  | "Desbloquear blocos"
  | "Redimensionar forma"
  | "Mover ponto da linha"
  | "Editar vértice"
  | "Ajustar geometria";

interface EditorState {
  config: CustomSlideConfig | null;
  slideId: string | undefined;
  lastActionLabel: EditorActionLabel | null;
  /** Multi-selection (B8.2). Empty means nothing selected. */
  selectedIds: string[];
  /** Group-edit mode: clicking a member dives into editing that single block. */
  groupEditMemberId: string | null;
}

// Mutations live outside the partialized state so zundo doesn't snapshot them.
let onChangeRef: ((next: CustomSlideConfig) => void) | null = null;
let suppressEmit = false;

const baseStore = create<EditorState>()(
  temporal(
    () => ({
      config: null,
      slideId: undefined,
      lastActionLabel: null,
      selectedIds: [],
      groupEditMemberId: null,
    }),
    {
      limit: 50,
      // Only track the slide config + label. selection / slideId not undoable.
      partialize: (s) => ({ config: s.config, lastActionLabel: s.lastActionLabel }),
      equality: (a, b) => a.config === b.config,
    },
  ),
);

function emit(next: CustomSlideConfig) {
  if (suppressEmit || !onChangeRef) return;
  onChangeRef(next);
}

function mutate(label: EditorActionLabel, updater: (cfg: CustomSlideConfig) => CustomSlideConfig) {
  const cur = baseStore.getState().config;
  if (!cur) return;
  const next = updater(cur);
  if (next === cur) return;
  baseStore.setState({ config: next, lastActionLabel: label });
  emit(next);
}

// ----- Public API ----------------------------------------------------------

/**
 * Bind the store to the parent's config + onChange. Called from the editor
 * effect on mount and whenever `slideId` changes.
 */
export function bindEditorStore(
  config: CustomSlideConfig,
  onChange: (next: CustomSlideConfig) => void,
  slideId: string | undefined,
) {
  onChangeRef = onChange;
  const prevSlide = baseStore.getState().slideId;
  // Suppress the emit caused by the initial load.
  suppressEmit = true;
  baseStore.setState({ config, slideId, lastActionLabel: null, selectedIds: [], groupEditMemberId: null });
  // Reset undo history when binding to a new slide (or first mount).
  if (prevSlide !== slideId) {
    baseStore.temporal.getState().clear();
  }
  suppressEmit = false;
}

/** Apply external config changes from parent without polluting the undo stack. */
export function syncFromParent(config: CustomSlideConfig) {
  if (baseStore.getState().config === config) return;
  suppressEmit = true;
  baseStore.setState({ config });
  suppressEmit = false;
}

// ----- Mutations ----------------------------------------------------------

export function setBackground(hex: string) {
  mutate("Alterar slide", (c) => ({ ...c, background: hex }));
}

export function setShowHaraldFooter(v: boolean) {
  mutate("Alterar slide", (c) => ({ ...c, showHaraldFooter: v }));
}

/** Aplica um tema: muda theme + background do slide automaticamente. */
export function setThemeAction(themeId: string, themeBg: string) {
  mutate("Alterar slide", (c) => ({ ...c, theme: themeId, background: themeBg }));
}

/** Define ou limpa a imagem de fundo do slide. Passe undefined para limpar. */
export function setBackgroundImageAction(src: string | undefined) {
  mutate("Alterar slide", (c) => ({ ...c, backgroundImage: src }));
}

export function setSpeakerNotesAction(notes: string) {
  mutate("Alterar slide", (c) => ({ ...c, speakerNotes: notes }));
}

export function addBlockAction(kind: CustomBlockKind): string | null {
  const cur = baseStore.getState().config;
  if (!cur) return null;
  const startMark = `slides:addBlock:${performance.now()}`;
  markSlidePerf(startMark);
  const zTop = cur.blocks.reduce((m, b) => Math.max(m, b.z), 0);
  const blk = newBlock(kind, zTop);
  mutate("Adicionar bloco", (c) => ({ ...c, blocks: [...c.blocks, blk] }));
  measureSlidePerf("slides.addBlockAction", startMark, undefined, {
    kind,
    blockId: blk.id,
    previousBlockCount: cur.blocks.length,
    nextBlockCount: cur.blocks.length + 1,
  });
  return blk.id;
}

export function addChartBlockAction(chartType: CustomChartType): string | null {
  const cur = baseStore.getState().config;
  if (!cur) return null;
  const startMark = `slides:addChartBlock:${performance.now()}`;
  markSlidePerf(startMark);
  const zTop = cur.blocks.reduce((m, b) => Math.max(m, b.z), 0);
  const blk = newChartBlock(chartType, zTop);
  mutate("Adicionar bloco", (c) => ({ ...c, blocks: [...c.blocks, blk] }));
  measureSlidePerf("slides.addChartBlockAction", startMark, undefined, {
    chartType,
    blockId: blk.id,
    previousBlockCount: cur.blocks.length,
    nextBlockCount: cur.blocks.length + 1,
  });
  return blk.id;
}

export function deleteBlockAction(id: string) {
  mutate("Excluir bloco", (c) => ({ ...c, blocks: c.blocks.filter((b) => b.id !== id) }));
}

export function duplicateBlockAction(id: string): string | null {
  const cur = baseStore.getState().config;
  if (!cur) return null;
  const orig = cur.blocks.find((b) => b.id === id);
  if (!orig) return null;
  const zTop = cur.blocks.reduce((m, b) => Math.max(m, b.z), 0);
  const clone = {
    ...JSON.parse(JSON.stringify(orig)),
    id: crypto.randomUUID(),
    x: orig.x + 20,
    y: orig.y + 20,
    z: zTop + 1,
    locked: false,
  } as CustomBlock;
  mutate("Duplicar bloco", (c) => ({ ...c, blocks: [...c.blocks, clone] }));
  return clone.id;
}

/**
 * Generic patch. The `label` decides which undo bucket the change falls into.
 * Move / resize / style / data / lock all funnel through here.
 */
/** Insert a fully-formed block (e.g. paste from clipboard). Returns the id used. */
export function insertBlockAction(blk: CustomBlock, label: EditorActionLabel = "Adicionar bloco"): string | null {
  const cur = baseStore.getState().config;
  if (!cur) return null;
  const startMark = `slides:insertBlock:${performance.now()}`;
  markSlidePerf(startMark);
  const zTop = cur.blocks.reduce((m, b) => Math.max(m, b.z), 0);
  const next = { ...blk, z: zTop + 1 } as CustomBlock;
  mutate(label, (c) => ({ ...c, blocks: [...c.blocks, next] }));
  measureSlidePerf("slides.insertBlockAction", startMark, undefined, {
    kind: next.kind,
    blockId: next.id,
    previousBlockCount: cur.blocks.length,
    nextBlockCount: cur.blocks.length + 1,
  });
  return next.id;
}

export function insertBlocksAction(blocks: CustomBlock[], label: EditorActionLabel = "Adicionar bloco"): string[] {
  const cur = baseStore.getState().config;
  if (!cur || blocks.length === 0) return [];
  const zTop = cur.blocks.reduce((m, b) => Math.max(m, b.z), 0);
  const next = blocks.map((blk, idx) => ({ ...blk, z: zTop + idx + 1 }) as CustomBlock);
  mutate(label, (c) => ({ ...c, blocks: [...c.blocks, ...next] }));
  return next.map((blk) => blk.id);
}

export function patchBlockAction(id: string, patch: Partial<CustomBlock>, label: EditorActionLabel) {
  mutate(label, (c) => ({
    ...c,
    blocks: c.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as CustomBlock) : b)),
  }));
}

/** Renormaliza z-indices para inteiros consecutivos 1..N preservando a ordem relativa. */
function normalizeZIndices(blocks: CustomBlock[]): CustomBlock[] {
  const sorted = [...blocks].sort((a, b) => a.z - b.z);
  const zMap = new Map(sorted.map((b, i) => [b.id, i + 1]));
  return blocks.map((b) => ({ ...b, z: zMap.get(b.id)! } as CustomBlock));
}

export function bringForwardAction(id: string) {
  const cur = baseStore.getState().config;
  if (!cur) return;
  const blk = cur.blocks.find((b) => b.id === id);
  if (!blk) return;
  const above = cur.blocks
    .filter((b) => b.id !== id && b.z > blk.z)
    .sort((a, b) => a.z - b.z)[0];
  if (!above) return;
  const map = new Map([[id, above.z], [above.id, blk.z]]);
  mutate("Alterar ordem", (c) => ({
    ...c,
    blocks: normalizeZIndices(
      c.blocks.map((b) => map.has(b.id) ? ({ ...b, z: map.get(b.id)! } as CustomBlock) : b)
    ),
  }));
}

export function sendBackAction(id: string) {
  const cur = baseStore.getState().config;
  if (!cur) return;
  const blk = cur.blocks.find((b) => b.id === id);
  if (!blk) return;
  const below = cur.blocks
    .filter((b) => b.id !== id && b.z < blk.z)
    .sort((a, b) => b.z - a.z)[0];
  if (!below) return;
  const map = new Map([[id, below.z], [below.id, blk.z]]);
  mutate("Alterar ordem", (c) => ({
    ...c,
    blocks: normalizeZIndices(
      c.blocks.map((b) => map.has(b.id) ? ({ ...b, z: map.get(b.id)! } as CustomBlock) : b)
    ),
  }));
}

export function bringToFrontAction(id: string) {
  const cur = baseStore.getState().config;
  if (!cur) return;
  const zTop = cur.blocks.reduce((m, b) => Math.max(m, b.z), 0);
  mutate("Alterar ordem", (c) => ({
    ...c,
    blocks: normalizeZIndices(
      c.blocks.map((b) => b.id === id ? ({ ...b, z: zTop + 1 } as CustomBlock) : b)
    ),
  }));
}

export function sendToBackAction(id: string) {
  const cur = baseStore.getState().config;
  if (!cur) return;
  const minZ = cur.blocks.reduce((m, b) => Math.min(m, b.z), 0);
  mutate("Alterar ordem", (c) => ({
    ...c,
    blocks: normalizeZIndices(
      c.blocks.map((b) => b.id === id ? ({ ...b, z: minZ - 1 } as CustomBlock) : b)
    ),
  }));
}

export function toggleLockAction(id: string) {
  const cur = baseStore.getState().config;
  if (!cur) return;
  const blk = cur.blocks.find((b) => b.id === id);
  if (!blk) return;
  patchBlockAction(id, { locked: !blk.locked } as Partial<CustomBlock>, "Bloquear / Desbloquear");
}

// ----- Undo / redo --------------------------------------------------------

export function undo() {
  const t = baseStore.temporal.getState();
  if (t.pastStates.length === 0) return;
  t.undo();
  const cur = baseStore.getState().config;
  if (cur) emit(cur);
}

export function redo() {
  const t = baseStore.temporal.getState();
  if (t.futureStates.length === 0) return;
  t.redo();
  const cur = baseStore.getState().config;
  if (cur) emit(cur);
}

// ----- Hooks --------------------------------------------------------------

export function useEditorConfig(): CustomSlideConfig | null {
  return useStore(baseStore, (s) => s.config);
}

/** Returns { canUndo, canRedo, undoLabel, redoLabel }. Re-renders on changes. */
export function useUndoRedoState() {
  return useStore(
    baseStore.temporal,
    useShallow((t) => {
      const past = t.pastStates;
      const fut = t.futureStates;
      const undoLabel = past.length > 0
        ? (baseStore.getState().lastActionLabel ?? null)
        : null;
      const redoLabel = fut.length > 0
        ? ((fut[fut.length - 1] as { lastActionLabel?: EditorActionLabel | null })
            .lastActionLabel ?? null)
        : null;
      return {
        canUndo: past.length > 0,
        canRedo: fut.length > 0,
        undoLabel,
        redoLabel,
      };
    }),
  );
}

/** Hook helper: bind store on mount + global Cmd/Ctrl+Z shortcuts. */
export function useEditorBinding(
  config: CustomSlideConfig,
  onChange: (next: CustomSlideConfig) => void,
  slideId: string | undefined,
) {
  useEffect(() => {
    bindEditorStore(config, onChange, slideId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideId]);

  // Keep onChange ref fresh.
  useEffect(() => {
    onChangeRef = onChange;
  }, [onChange]);

  // If parent pushes a new config (other than what we just emitted), sync.
  useEffect(() => {
    syncFromParent(config);
  }, [config]);
}

// ----- Selection (B8.2) ---------------------------------------------------

function rid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * If `id` belongs to a group, expand to all members of that group.
 * Used so that any selection action treats grouped blocks atomically
 * (unless the user is in group-edit mode for that specific id).
 */
function expandGroup(cfg: CustomSlideConfig, id: string): string[] {
  const blk = cfg.blocks.find((b) => b.id === id);
  if (!blk?.groupId) return [id];
  const grp = (cfg.groups ?? []).find((g) => g.id === blk.groupId);
  if (!grp) return [id];
  return grp.memberIds;
}

export function setSelection(ids: string[]) {
  baseStore.setState({ selectedIds: Array.from(new Set(ids)), groupEditMemberId: null });
}

export function clearSelection() {
  baseStore.setState({ selectedIds: [], groupEditMemberId: null });
}

export function selectBlock(id: string, opts?: { additive?: boolean }) {
  const cfg = baseStore.getState().config;
  if (!cfg) return;
  const groupEdit = baseStore.getState().groupEditMemberId;
  // If we're in group-edit mode for this id, just keep it.
  if (groupEdit === id) return;
  const expanded = expandGroup(cfg, id);
  const cur = baseStore.getState().selectedIds;
  if (opts?.additive) {
    // Shift+click toggles membership.
    const set = new Set(cur);
    const allIn = expanded.every((x) => set.has(x));
    if (allIn) expanded.forEach((x) => set.delete(x));
    else expanded.forEach((x) => set.add(x));
    baseStore.setState({ selectedIds: Array.from(set), groupEditMemberId: null });
  } else {
    baseStore.setState({ selectedIds: expanded, groupEditMemberId: null });
  }
}

/** Double-click member: enter group-edit mode for that single block. */
export function enterGroupEdit(id: string) {
  baseStore.setState({ selectedIds: [id], groupEditMemberId: id });
}

export function exitGroupEdit() {
  baseStore.setState({ groupEditMemberId: null });
}

export function selectAllOnSlide() {
  const cfg = baseStore.getState().config;
  if (!cfg) return;
  baseStore.setState({ selectedIds: cfg.blocks.map((b) => b.id), groupEditMemberId: null });
}

export function useSelection() {
  return useStore(
    baseStore,
    useShallow((s) => ({
      selectedIds: s.selectedIds,
      groupEditMemberId: s.groupEditMemberId,
    })),
  );
}

// ----- Multi-block actions ------------------------------------------------

export function deleteBlocksAction(ids: string[]) {
  if (ids.length === 0) return;
  if (ids.length === 1) { deleteBlockAction(ids[0]); clearSelection(); return; }
  const set = new Set(ids);
  mutate("Excluir blocos", (c) => ({
    ...c,
    blocks: c.blocks.filter((b) => !set.has(b.id)),
    groups: (c.groups ?? [])
      .map((g) => ({ ...g, memberIds: g.memberIds.filter((m) => !set.has(m)) }))
      .filter((g) => g.memberIds.length > 1),
  }));
  clearSelection();
}

export function duplicateBlocksAction(ids: string[]): string[] {
  const cur = baseStore.getState().config;
  if (!cur || ids.length === 0) return [];
  if (ids.length === 1) {
    const newId = duplicateBlockAction(ids[0]);
    return newId ? [newId] : [];
  }
  let zTop = cur.blocks.reduce((m, b) => Math.max(m, b.z), 0);
  const newIds: string[] = [];
  // For groups: regenerate groupId so duplicated set forms its own group.
  const groupIdMap = new Map<string, string>();
  const idMap = new Map<string, string>();
  const newBlocks: CustomBlock[] = [];
  for (const id of ids) {
    const orig = cur.blocks.find((b) => b.id === id);
    if (!orig) continue;
    zTop += 1;
    const newId = rid();
    idMap.set(id, newId);
    let newGroupId: string | undefined = undefined;
    if (orig.groupId) {
      if (!groupIdMap.has(orig.groupId)) groupIdMap.set(orig.groupId, rid());
      newGroupId = groupIdMap.get(orig.groupId);
    }
    const clone = {
      ...JSON.parse(JSON.stringify(orig)),
      id: newId,
      x: orig.x + 16,
      y: orig.y + 16,
      z: zTop,
      locked: false,
      groupId: newGroupId,
    } as CustomBlock;
    newBlocks.push(clone);
    newIds.push(newId);
  }
  const newGroups: BlockGroup[] = Array.from(groupIdMap.values()).map((gid) => ({
    id: gid,
    memberIds: newBlocks.filter((b) => b.groupId === gid).map((b) => b.id),
  }));
  mutate("Duplicar blocos", (c) => ({
    ...c,
    blocks: [...c.blocks, ...newBlocks],
    groups: [...(c.groups ?? []), ...newGroups],
  }));
  baseStore.setState({ selectedIds: newIds, groupEditMemberId: null });
  return newIds;
}

/**
 * Apply per-id position deltas / patches in a single undo step.
 * Used by multi-drag, alignment, distribute, and arrow-key nudge.
 */
export function patchBlocksAction(
  patches: { id: string; patch: Partial<CustomBlock> }[],
  label: EditorActionLabel,
) {
  if (patches.length === 0) return;
  const map = new Map(patches.map((p) => [p.id, p.patch]));
  mutate(label, (c) => ({
    ...c,
    blocks: c.blocks.map((b) => {
      const p = map.get(b.id);
      return p ? ({ ...b, ...p } as CustomBlock) : b;
    }),
  }));
}

/** Move a set of blocks by (dx, dy). Locked blocks are skipped. */
export function nudgeBlocksAction(ids: string[], dx: number, dy: number, label: EditorActionLabel) {
  const cur = baseStore.getState().config;
  if (!cur || ids.length === 0) return;
  const patches = ids
    .map((id) => cur.blocks.find((b) => b.id === id))
    .filter((b): b is CustomBlock => !!b && !b.locked)
    .map((b) => ({ id: b.id, patch: { x: b.x + dx, y: b.y + dy } as Partial<CustomBlock> }));
  if (patches.length) patchBlocksAction(patches, label);
}

// ----- Alignment ---------------------------------------------------------

export type AlignKind =
  | "left" | "centerH" | "right"
  | "top"  | "centerV" | "bottom"
  | "distH" | "distV";

export function alignBlocksAction(ids: string[], kind: AlignKind) {
  const cur = baseStore.getState().config;
  if (!cur || ids.length < 2) return;
  const blocks = ids
    .map((id) => cur.blocks.find((b) => b.id === id))
    .filter((b): b is CustomBlock => !!b);
  if (blocks.length < 2) return;
  const patches: { id: string; patch: Partial<CustomBlock> }[] = [];

  if (kind === "left") {
    const m = Math.min(...blocks.map((b) => b.x));
    blocks.forEach((b) => patches.push({ id: b.id, patch: { x: m } }));
  } else if (kind === "right") {
    const m = Math.max(...blocks.map((b) => b.x + b.w));
    blocks.forEach((b) => patches.push({ id: b.id, patch: { x: m - b.w } }));
  } else if (kind === "centerH") {
    const mean = blocks.reduce((s, b) => s + (b.x + b.w / 2), 0) / blocks.length;
    blocks.forEach((b) => patches.push({ id: b.id, patch: { x: Math.round(mean - b.w / 2) } }));
  } else if (kind === "top") {
    const m = Math.min(...blocks.map((b) => b.y));
    blocks.forEach((b) => patches.push({ id: b.id, patch: { y: m } }));
  } else if (kind === "bottom") {
    const m = Math.max(...blocks.map((b) => b.y + b.h));
    blocks.forEach((b) => patches.push({ id: b.id, patch: { y: m - b.h } }));
  } else if (kind === "centerV") {
    const mean = blocks.reduce((s, b) => s + (b.y + b.h / 2), 0) / blocks.length;
    blocks.forEach((b) => patches.push({ id: b.id, patch: { y: Math.round(mean - b.h / 2) } }));
  } else if (kind === "distH") {
    if (blocks.length < 3) return;
    const sorted = [...blocks].sort((a, b) => a.x - b.x);
    const first = sorted[0].x;
    const last = sorted[sorted.length - 1].x;
    const step = (last - first) / (sorted.length - 1);
    sorted.forEach((b, i) => patches.push({ id: b.id, patch: { x: Math.round(first + step * i) } }));
  } else if (kind === "distV") {
    if (blocks.length < 3) return;
    const sorted = [...blocks].sort((a, b) => a.y - b.y);
    const first = sorted[0].y;
    const last = sorted[sorted.length - 1].y;
    const step = (last - first) / (sorted.length - 1);
    sorted.forEach((b, i) => patches.push({ id: b.id, patch: { y: Math.round(first + step * i) } }));
  }
  patchBlocksAction(patches, "Alinhar blocos");
}

// ----- Group / Ungroup ---------------------------------------------------

export function groupBlocksAction(ids: string[]): string | null {
  const cur = baseStore.getState().config;
  if (!cur || ids.length < 2) return null;
  // Flatten any existing groups into the new one.
  const memberSet = new Set<string>();
  ids.forEach((id) => {
    const blk = cur.blocks.find((b) => b.id === id);
    if (!blk) return;
    if (blk.groupId) {
      const grp = (cur.groups ?? []).find((g) => g.id === blk.groupId);
      grp?.memberIds.forEach((m) => memberSet.add(m));
    } else {
      memberSet.add(id);
    }
  });
  if (memberSet.size < 2) return null;
  const newGroupId = rid();
  const memberIds = Array.from(memberSet);
  mutate("Agrupar blocos", (c) => ({
    ...c,
    blocks: c.blocks.map((b) => memberSet.has(b.id) ? ({ ...b, groupId: newGroupId } as CustomBlock) : b),
    groups: [
      ...((c.groups ?? []).filter((g) => !g.memberIds.some((m) => memberSet.has(m)))),
      { id: newGroupId, memberIds },
    ],
  }));
  baseStore.setState({ selectedIds: memberIds, groupEditMemberId: null });
  return newGroupId;
}

export function ungroupBlocksAction(ids: string[]) {
  const cur = baseStore.getState().config;
  if (!cur || ids.length === 0) return;
  const groupIds = new Set<string>();
  ids.forEach((id) => {
    const blk = cur.blocks.find((b) => b.id === id);
    if (blk?.groupId) groupIds.add(blk.groupId);
  });
  if (groupIds.size === 0) return;
  mutate("Desagrupar blocos", (c) => ({
    ...c,
    blocks: c.blocks.map((b) => (b.groupId && groupIds.has(b.groupId)) ? ({ ...b, groupId: undefined } as CustomBlock) : b),
    groups: (c.groups ?? []).filter((g) => !groupIds.has(g.id)),
  }));
}

// ----- Group resize-as-unit (B8 final) ------------------------------------

/**
 * Apply a uniform scale to every member of a group (or arbitrary set of ids).
 * Origin is the top-left of the original bounding box (origX/origY) and the
 * scale factors come from the new vs original group bbox dimensions.
 *
 * Each member is clamped to a minimum of 40×40 — collapsing scales are not
 * applied to that member; instead its dimension stays at the floor and its
 * position is still anchored to the scaled origin to keep layout coherent.
 */
export function resizeGroupAction(
  ids: string[],
  origin: { x: number; y: number; w: number; h: number },
  next: { x: number; y: number; w: number; h: number },
) {
  if (ids.length === 0 || origin.w <= 0 || origin.h <= 0) return;
  const scaleX = next.w / origin.w;
  const scaleY = next.h / origin.h;
  const cur = baseStore.getState().config;
  if (!cur) return;
  const set = new Set(ids);
  const patches = cur.blocks
    .filter((b) => set.has(b.id) && !b.locked)
    .map((b) => {
      const dx = b.x - origin.x;
      const dy = b.y - origin.y;
      const newX = next.x + dx * scaleX;
      const newY = next.y + dy * scaleY;
      const newW = Math.max(40, b.w * scaleX);
      const newH = Math.max(40, b.h * scaleY);
      return {
        id: b.id,
        patch: {
          x: Math.round(newX),
          y: Math.round(newY),
          w: Math.round(newW),
          h: Math.round(newH),
        } as Partial<CustomBlock>,
      };
    });
  if (patches.length) patchBlocksAction(patches, "Redimensionar grupo");
}

// ----- Chart style copy / paste (B8.6) ------------------------------------

import type { ChartStyle, SeriesStyle } from "@/components/pricing/custom/chart/types";

interface CopiedStyle {
  sourceType: import("@/lib/customSlide").CustomChartType;
  style: Partial<ChartStyle>;
  sourceId: string;
}

let _copiedStyle: CopiedStyle | null = null;
const copyListeners = new Set<() => void>();
function emitCopy() { copyListeners.forEach((fn) => fn()); }

export function getCopiedStyle(): CopiedStyle | null {
  return _copiedStyle;
}

export function copyChartStyleAction(blockId: string): boolean {
  const cur = baseStore.getState().config;
  if (!cur) return false;
  const blk = cur.blocks.find((b) => b.id === blockId);
  if (!blk || blk.kind !== "chart") return false;
  const cb = blk as unknown as { chartType: CopiedStyle["sourceType"]; style?: Partial<ChartStyle> };
  _copiedStyle = {
    sourceType: cb.chartType,
    style: JSON.parse(JSON.stringify(cb.style ?? {})),
    sourceId: blockId,
  };
  emitCopy();
  return true;
}

const CARTESIAN_TYPES: ReadonlyArray<string> = [
  "line", "area", "stackedArea", "bar", "column", "stackedColumn",
  "hbar", "stackedBar", "combo", "scatter", "bubble", "histogram",
];

/** Apply copied style to target. Returns true if pasted. */
export function pasteChartStyleAction(blockId: string): boolean {
  if (!_copiedStyle) return false;
  const cur = baseStore.getState().config;
  if (!cur) return false;
  const blk = cur.blocks.find((b) => b.id === blockId);
  if (!blk || blk.kind !== "chart") return false;
  const target = blk as unknown as { chartType: CopiedStyle["sourceType"]; style?: Partial<ChartStyle> };
  const same = target.chartType === _copiedStyle.sourceType;
  const src = _copiedStyle.style;

  let nextStyle: Partial<ChartStyle>;
  if (same) {
    nextStyle = JSON.parse(JSON.stringify(src));
  } else {
    // Cross-type: apply only the compatible subset.
    const cur = (target.style ?? {}) as Partial<ChartStyle>;
    const out: Partial<ChartStyle> = JSON.parse(JSON.stringify(cur));
    if (src.general) out.general = JSON.parse(JSON.stringify(src.general));
    if (src.grid) out.grid = JSON.parse(JSON.stringify(src.grid));
    if (src.dataLabels) out.dataLabels = JSON.parse(JSON.stringify(src.dataLabels));
    const bothCartesian = CARTESIAN_TYPES.includes(target.chartType)
      && CARTESIAN_TYPES.includes(_copiedStyle.sourceType);
    if (bothCartesian) {
      if (src.xAxis) out.xAxis = JSON.parse(JSON.stringify(src.xAxis));
      if (src.yAxis) out.yAxis = JSON.parse(JSON.stringify(src.yAxis));
    }
    // Series colors only — preserve marker/line/etc.
    if (src.series && Array.isArray(src.series)) {
      const tgtSeries = (cur.series ?? []) as SeriesStyle[];
      const merged: SeriesStyle[] = tgtSeries.map((s, i) => {
        const ss = src.series?.[i];
        return ss?.color ? { ...s, color: ss.color } : s;
      });
      // Keep extra source colors so the renderer uses them when target has fewer entries.
      if (src.series.length > tgtSeries.length) {
        for (let i = tgtSeries.length; i < src.series.length; i++) {
          const ss = src.series[i];
          merged.push({ key: ss.key ?? `s${i}`, color: ss.color });
        }
      }
      out.series = merged;
    }
    nextStyle = out;
  }

  patchBlockAction(
    blockId,
    { style: nextStyle } as Partial<CustomBlock>,
    "Colar estilo",
  );
  return true;
}

export function clearCopiedStyle() { _copiedStyle = null; emitCopy(); }

/** Hook: returns { hasCopy, sourceId } and re-renders when copy changes. */
export function useCopiedStyle() {
  const [, setT] = useState(0);
  useEffect(() => {
    const fn = () => setT((n) => n + 1);
    copyListeners.add(fn);
    return () => { copyListeners.delete(fn); };
  }, []);
  return { hasCopy: !!_copiedStyle, sourceId: _copiedStyle?.sourceId ?? null };
}

// ----- Element style copy / paste -----------------------------------------

type StyleGroup = "text" | "kpi" | "shape" | "chart" | "image" | "table" | "topSku" | "dre" | "omni";

interface CopiedElementStyle {
  sourceId: string;
  sourceKind: CustomBlockKind;
  group: StyleGroup;
  patch: Partial<CustomBlock>;
}

let _copiedElementStyle: CopiedElementStyle | null = null;
const elementStyleListeners = new Set<() => void>();
function emitElementStyleCopy() { elementStyleListeners.forEach((fn) => fn()); }

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function pickStylePatch(block: CustomBlock): { group: StyleGroup; patch: Partial<CustomBlock> } | null {
  const common = {
    enterAnimation: block.enterAnimation,
    hidden: block.hidden,
  } as Partial<CustomBlock>;

  if (block.kind === "title" || block.kind === "text") {
    const b = block as Extract<CustomBlock, { kind: "title" | "text" }>;
    return {
      group: "text",
      patch: {
        ...common,
        size: b.size,
        bold: "bold" in b ? b.bold : undefined,
        italic: b.italic,
        color: b.color,
        align: b.align,
        fontFamily: b.fontFamily,
        letterSpacing: b.letterSpacing,
        lineHeight: b.lineHeight,
        textShadow: b.textShadow,
        opacity: b.opacity,
        textTransform: b.textTransform,
        padding: b.padding,
        backgroundColor: b.backgroundColor,
        borderRadius: b.borderRadius,
      } as Partial<CustomBlock>,
    };
  }

  if (block.kind === "kpi") {
    const b = block as Extract<CustomBlock, { kind: "kpi" }>;
    return {
      group: "kpi",
      patch: {
        ...common,
        valueSize: b.valueSize,
        color: b.color,
        cardBg: b.cardBg,
        format: b.format,
      } as Partial<CustomBlock>,
    };
  }

  if (block.kind === "shape") {
    const b = block as Extract<CustomBlock, { kind: "shape" }>;
    return {
      group: "shape",
      patch: {
        ...common,
        fill: b.fill,
        fillOpacity: b.fillOpacity,
        strokeColor: b.strokeColor,
        strokeWidth: b.strokeWidth,
        strokeStyle: b.strokeStyle,
        radius: b.radius,
        lineThickness: b.lineThickness,
        arrowStart: b.arrowStart,
        arrowEnd: b.arrowEnd,
        shadowEnabled: b.shadowEnabled,
        shadowColor: b.shadowColor,
        shadowOpacity: b.shadowOpacity,
        shadowBlur: b.shadowBlur,
        shadowX: b.shadowX,
        shadowY: b.shadowY,
      } as Partial<CustomBlock>,
    };
  }

  if (block.kind === "chart") {
    const b = block as Extract<CustomBlock, { kind: "chart" }>;
    return {
      group: "chart",
      patch: {
        ...common,
        showGrid: b.showGrid,
        showLegend: b.showLegend,
        showLabels: b.showLabels,
        autoFit: b.autoFit,
        maxSeries: b.maxSeries,
        showOthers: b.showOthers,
        exportNote: b.exportNote,
        style: cloneValue(b.style ?? {}),
        budgetGap: cloneValue(b.budgetGap),
      } as Partial<CustomBlock>,
    };
  }

  if (block.kind === "image") {
    const b = block as Extract<CustomBlock, { kind: "image" }>;
    return {
      group: "image",
      patch: {
        ...common,
        fit: b.fit,
      } as Partial<CustomBlock>,
    };
  }

  if (block.kind === "table") {
    const b = block as Extract<CustomBlock, { kind: "table" }>;
    return {
      group: "table",
      patch: {
        ...common,
        autoFit: b.autoFit,
        maxRows: b.maxRows,
        showOthers: b.showOthers,
        exportNote: b.exportNote,
        valueAlign: b.valueAlign,
        conditionalFormats: cloneValue(b.conditionalFormats),
      } as Partial<CustomBlock>,
    };
  }

  if (block.kind === "topSku") {
    const b = block as Extract<CustomBlock, { kind: "topSku" }>;
    return {
      group: "topSku",
      patch: {
        ...common,
        topN: b.topN,
        showShare: b.showShare,
        title: b.title,
        autoFit: b.autoFit,
        showOthers: b.showOthers,
        exportNote: b.exportNote,
      } as Partial<CustomBlock>,
    };
  }

  if (block.kind === "dre") {
    const b = block as Extract<CustomBlock, { kind: "dre" }>;
    return {
      group: "dre",
      patch: {
        ...common,
        showBudget: b.showBudget,
        fontSize: b.fontSize,
        headerColor: b.headerColor,
        textColor: b.textColor,
        showTotal: b.showTotal,
        showVariacao: b.showVariacao,
        variacaoTipo: b.variacaoTipo,
        conditionalFormat: cloneValue(b.conditionalFormat),
      } as Partial<CustomBlock>,
    };
  }

  if (block.kind.startsWith("omni_")) {
    const b = block as CustomBlock & {
      showTitle?: boolean;
      showLegend?: boolean;
      title?: string;
      topN?: number;
      variant?: string;
      sortBy?: string;
      viewMode?: string;
      showCustoVariavel?: boolean;
      showCustoFixo?: boolean;
      showGauge?: boolean;
      showCaption?: boolean;
      showStats?: boolean;
      gaugeTheme?: string;
      gaugeScale?: number;
      showTable?: boolean;
    };
    return {
      group: "omni",
      patch: {
        ...common,
        showTitle: b.showTitle,
        showLegend: b.showLegend,
        title: b.title,
        topN: b.topN,
        variant: b.variant,
        sortBy: b.sortBy,
        viewMode: b.viewMode,
        showCustoVariavel: b.showCustoVariavel,
        showCustoFixo: b.showCustoFixo,
        showGauge: b.showGauge,
        showCaption: b.showCaption,
        showStats: b.showStats,
        gaugeTheme: b.gaugeTheme,
        gaugeScale: b.gaugeScale,
        showTable: b.showTable,
      } as Partial<CustomBlock>,
    };
  }

  return null;
}

function styleGroupOf(block: CustomBlock): StyleGroup | null {
  return pickStylePatch(block)?.group ?? null;
}

export function copyElementStyleAction(blockId: string): boolean {
  const cur = baseStore.getState().config;
  if (!cur) return false;
  const block = cur.blocks.find((b) => b.id === blockId);
  if (!block) return false;
  const style = pickStylePatch(block);
  if (!style) return false;
  _copiedElementStyle = {
    sourceId: blockId,
    sourceKind: block.kind,
    group: style.group,
    patch: cloneValue(style.patch),
  };
  emitElementStyleCopy();
  return true;
}

export function canPasteElementStyleAction(blockId: string): boolean {
  const cur = baseStore.getState().config;
  if (!_copiedElementStyle || !cur) return false;
  const target = cur.blocks.find((b) => b.id === blockId);
  if (!target) return false;
  return styleGroupOf(target) === _copiedElementStyle.group;
}

export function pasteElementStyleAction(blockId: string): boolean {
  if (!_copiedElementStyle || !canPasteElementStyleAction(blockId)) return false;
  patchBlockAction(blockId, cloneValue(_copiedElementStyle.patch), "Colar estilo");
  return true;
}

export function clearCopiedElementStyle() {
  _copiedElementStyle = null;
  emitElementStyleCopy();
}

export function useCopiedElementStyle() {
  const [, setT] = useState(0);
  useEffect(() => {
    const fn = () => setT((n) => n + 1);
    elementStyleListeners.add(fn);
    return () => { elementStyleListeners.delete(fn); };
  }, []);
  return {
    hasCopy: !!_copiedElementStyle,
    sourceId: _copiedElementStyle?.sourceId ?? null,
    group: _copiedElementStyle?.group ?? null,
    sourceKind: _copiedElementStyle?.sourceKind ?? null,
  };
}
