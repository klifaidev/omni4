import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { RotateCw } from "lucide-react";

import {
  CANVAS_H,
  CANVAS_W,
  type CustomBlock,
  type CustomSlideConfig,
  type ImageBlock,
  type TextBlock,
  type TitleBlock,
} from "@/lib/customSlide";
import { snapToGrid, type GridSize } from "./editorPrefs";
import { boundsOf, computeSnap, groupBounds, type EqualSpacingGuide } from "./canvas/alignmentGuides";
import type { EditorActionLabel } from "./editorStore";

export type BlockFrame = { x: number; y: number; w: number; h: number };
export type TransformBounds = { w: number; h: number; bleed?: number };
export type ResizeDirection = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export type GuideState = { v: number[]; h: number[]; equalSpacing: EqualSpacingGuide[] };

export const TRANSFORM_BLEED = 24;
export const EMPTY_GUIDES: GuideState = { v: [], h: [], equalSpacing: [] };

function createLocalId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function equalSpacingGuidesEqual(a: EqualSpacingGuide[], b: EqualSpacingGuide[]): boolean {
  return a.length === b.length && a.every((guide, index) => {
    const other = b[index];
    return guide.axis === other.axis
      && guide.gap === other.gap
      && guide.start === other.start
      && guide.end === other.end
      && guide.anchorStart === other.anchorStart
      && guide.anchorEnd === other.anchorEnd
      && guide.movingStart === other.movingStart
      && guide.movingEnd === other.movingEnd
      && guide.crossStart === other.crossStart
      && guide.crossEnd === other.crossEnd;
  });
}

type BlockPatch = { id: string; patch: Partial<CustomBlock> };

type BlockTransformActions = {
  canEdit: () => boolean;
  insertBlocks: (blocks: CustomBlock[], label: EditorActionLabel) => string[];
  maxBlockZ: () => number;
  patchBlocks: (patches: BlockPatch[], label: EditorActionLabel) => void;
  resizeGroup: (
    ids: string[],
    origin: { x: number; y: number; w: number; h: number },
    next: { x: number; y: number; w: number; h: number },
  ) => void;
  selectBlock: (id: string, opts?: { additive?: boolean }) => void;
  setSelection: (ids: string[]) => void;
  updateBlock: (id: string, patch: Partial<CustomBlock>) => void;
};

export function resolveDraggableSiblings({
  id,
  blocks,
  groups,
  groupEditMemberId,
  selectedIds,
}: {
  id: string;
  blocks: CustomBlock[];
  groups: CustomSlideConfig["groups"] | undefined;
  groupEditMemberId: string | null;
  selectedIds: string[];
}): string[] {
  if (groupEditMemberId === id) return [id];
  const block = blocks.find((candidate) => candidate.id === id);
  if (!block) return [id];
  if (block.groupId) {
    const group = (groups ?? []).find((candidate) => candidate.id === block.groupId);
    if (group) return group.memberIds;
  }
  if (selectedIds.includes(id) && selectedIds.length > 1) return selectedIds;
  return [id];
}

export function buildAltDragClones({
  sourceIds,
  blocks,
  dx,
  dy,
  zTop,
  createId = createLocalId,
}: {
  sourceIds: string[];
  blocks: CustomBlock[];
  dx: number;
  dy: number;
  zTop: number;
  createId?: () => string;
}): CustomBlock[] {
  const groupIdMap = new Map<string, string>();
  return sourceIds
    .map((id, index) => {
      const orig = blocks.find((block) => block.id === id);
      if (!orig || orig.locked) return null;
      let groupId = orig.groupId;
      if (groupId) {
        if (!groupIdMap.has(groupId)) groupIdMap.set(groupId, createId());
        groupId = groupIdMap.get(groupId);
      }
      return {
        ...JSON.parse(JSON.stringify(orig)),
        id: createId(),
        x: orig.x + dx,
        y: orig.y + dy,
        z: zTop + index + 1,
        locked: false,
        groupId,
      } as CustomBlock;
    })
    .filter((block): block is CustomBlock => Boolean(block));
}

export function applyBlockMove(block: CustomBlock, x: number, y: number): BlockPatch {
  return { id: block.id, patch: { x, y } as Partial<CustomBlock> };
}

export function applyMultiBlockMove(blocks: CustomBlock[], ids: string[], dx: number, dy: number): BlockPatch[] {
  const idSet = new Set(ids);
  return blocks
    .filter((block) => idSet.has(block.id) && !block.locked)
    .map((block) => ({
      id: block.id,
      patch: { x: block.x + dx, y: block.y + dy } as Partial<CustomBlock>,
    }));
}

export function clampFrameToBounds(
  frame: BlockFrame,
  rotation: number,
  bounds?: TransformBounds | null,
): BlockFrame {
  if (!bounds) return frame;
  const bleed = bounds.bleed ?? 0;
  const rad = (rotation * Math.PI) / 180;
  const bboxW = Math.abs(frame.w * Math.cos(rad)) + Math.abs(frame.h * Math.sin(rad));
  const bboxH = Math.abs(frame.w * Math.sin(rad)) + Math.abs(frame.h * Math.cos(rad));
  const minCx = bboxW / 2 - bleed;
  const maxCx = Math.max(minCx, bounds.w - bboxW / 2 + bleed);
  const minCy = bboxH / 2 - bleed;
  const maxCy = Math.max(minCy, bounds.h - bboxH / 2 + bleed);
  const cx = Math.min(maxCx, Math.max(minCx, frame.x + frame.w / 2));
  const cy = Math.min(maxCy, Math.max(minCy, frame.y + frame.h / 2));
  return {
    ...frame,
    x: Math.round(cx - frame.w / 2),
    y: Math.round(cy - frame.h / 2),
  };
}

export function resizeFrameFromPointerDelta({
  origin,
  dir,
  clientDx,
  clientDy,
  scale,
  rotation,
  lockAspectRatio,
  minW = 40,
  minH = 30,
}: {
  origin: BlockFrame;
  dir: ResizeDirection;
  clientDx: number;
  clientDy: number;
  scale: number;
  rotation: number;
  lockAspectRatio: boolean;
  minW?: number;
  minH?: number;
}): BlockFrame {
  const aspect = origin.w / Math.max(1, origin.h);
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const localDx = (clientDx * cos + clientDy * sin) / scale;
  const localDy = (-clientDx * sin + clientDy * cos) / scale;
  const centerX = origin.x + origin.w / 2;
  const centerY = origin.y + origin.h / 2;
  let w = origin.w;
  let h = origin.h;
  if (dir.includes("e")) w = Math.max(minW, origin.w + localDx);
  if (dir.includes("s")) h = Math.max(minH, origin.h + localDy);
  if (dir.includes("w")) w = Math.max(minW, origin.w - localDx);
  if (dir.includes("n")) h = Math.max(minH, origin.h - localDy);
  if (lockAspectRatio) {
    if (dir.includes("e") || dir.includes("w")) h = Math.max(minH, w / aspect);
    else w = Math.max(minW, h * aspect);
  }
  return {
    x: Math.round(centerX - w / 2),
    y: Math.round(centerY - h / 2),
    w: Math.round(w),
    h: Math.round(h),
  };
}

export function snapBlockFrame(blocks: CustomBlock[], activeIds: string[], frame: BlockFrame) {
  return computeSnap(frame, boundsOf(blocks, new Set(activeIds)));
}

export function computeGroupResizePatches(
  blocks: CustomBlock[],
  ids: string[],
  origin: BlockFrame,
  next: BlockFrame,
): BlockPatch[] {
  if (ids.length === 0 || origin.w <= 0 || origin.h <= 0) return [];
  const scaleX = next.w / origin.w;
  const scaleY = next.h / origin.h;
  const fontScale = Math.max(0.5, Math.min(3, (scaleX + scaleY) / 2));
  const set = new Set(ids);
  return blocks
    .filter((block) => set.has(block.id) && !block.locked)
    .map((block) => {
      const dx = block.x - origin.x;
      const dy = block.y - origin.y;
      const textSizePatch =
        (block.kind === "title" || block.kind === "text") && typeof block.size === "number"
          ? { size: Math.max(8, Math.round(block.size * fontScale)) }
          : {};
      return {
        id: block.id,
        patch: {
          x: Math.round(next.x + dx * scaleX),
          y: Math.round(next.y + dy * scaleY),
          w: Math.round(Math.max(40, block.w * scaleX)),
          h: Math.round(Math.max(40, block.h * scaleY)),
          ...textSizePatch,
        } as Partial<CustomBlock>,
      };
    });
}

export function gestureLayerStyle(originalZ: number, active: boolean): { during: number; after: number } {
  return {
    during: active ? 9999998 : originalZ,
    after: originalZ,
  };
}

export type BlockTransformParams = {
  blocks: CustomBlock[];
  groups: CustomSlideConfig["groups"] | undefined;
  selectedIds: string[];
  groupEditMemberId: string | null;
  gridEnabled: boolean;
  gridSize: GridSize;
  actions: BlockTransformActions;
};

export type BlockTransformHandlers = {
  lockAspectRatio: boolean;
  isAltDragFlashing: boolean;
  zIndex: (isEditing: boolean) => number;
  onMoveStart: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onMove: (x: number, y: number) => { x: number; y: number } | void;
  onMoveEnd: (x: number, y: number) => void;
  onResizeStart: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onResize: (x: number, y: number, w: number, h: number) => void;
  onResizeEnd: (x: number, y: number, w: number, h: number) => void;
};

export function useBlockTransform({
  blocks,
  groups,
  selectedIds,
  groupEditMemberId,
  gridEnabled,
  gridSize,
  actions,
}: BlockTransformParams) {
  const [guides, setGuides] = useState<GuideState>(EMPTY_GUIDES);
  const guidesRef = useRef(guides);
  const pendingGuidesRef = useRef(guides);
  const guidesRafRef = useRef<number | null>(null);
  const [aspectResizeIds, setAspectResizeIds] = useState<Set<string>>(() => new Set());
  const altDragCloneRef = useRef<{ sourceId: string } | null>(null);
  const [altDragFlashIds, setAltDragFlashIds] = useState<Set<string>>(() => new Set());
  const [activeGestureIds, setActiveGestureIds] = useState<Set<string>>(() => new Set());

  const setGuidesImmediate = useCallback((next: GuideState) => {
    if (
      guidesRef.current.v.length === next.v.length
      && guidesRef.current.h.length === next.h.length
      && guidesRef.current.v.every((value, index) => value === next.v[index])
      && guidesRef.current.h.every((value, index) => value === next.h[index])
      && equalSpacingGuidesEqual(guidesRef.current.equalSpacing, next.equalSpacing)
    ) return;
    guidesRef.current = next;
    setGuides(next);
  }, []);

  const scheduleGuides = useCallback((next: GuideState) => {
    pendingGuidesRef.current = next;
    if (guidesRafRef.current !== null) return;
    guidesRafRef.current = requestAnimationFrame(() => {
      guidesRafRef.current = null;
      setGuidesImmediate(pendingGuidesRef.current);
    });
  }, [setGuidesImmediate]);

  const clearGuides = useCallback(() => {
    if (guidesRafRef.current !== null) {
      cancelAnimationFrame(guidesRafRef.current);
      guidesRafRef.current = null;
    }
    pendingGuidesRef.current = EMPTY_GUIDES;
    setGuidesImmediate(EMPTY_GUIDES);
  }, [setGuidesImmediate]);

  useEffect(() => () => {
    if (guidesRafRef.current !== null) {
      cancelAnimationFrame(guidesRafRef.current);
      guidesRafRef.current = null;
    }
  }, []);

  const draggableSiblings = useCallback((id: string): string[] => {
    return resolveDraggableSiblings({ id, blocks, groups, groupEditMemberId, selectedIds });
  }, [blocks, groups, groupEditMemberId, selectedIds]);

  const createAltDragCloneAtOffset = useCallback((sourceId: string, dx: number, dy: number): string[] => {
    if (!actions.canEdit()) return [];
    const ids = draggableSiblings(sourceId);
    const clones = buildAltDragClones({ sourceIds: ids, blocks, dx, dy, zTop: actions.maxBlockZ() });
    if (clones.length === 0) return [];

    const cloneIds = actions.insertBlocks(clones, "Duplicar blocos");
    if (cloneIds.length === 0) return [];

    actions.setSelection(cloneIds);
    setAltDragFlashIds(new Set(cloneIds));
    window.setTimeout(() => setAltDragFlashIds((current) => {
      const next = new Set(current);
      cloneIds.forEach((id) => next.delete(id));
      return next;
    }), 260);
    return cloneIds;
  }, [actions, blocks, draggableSiblings]);

  const computeGuides = useCallback((activeIds: string[], x: number, y: number, w: number, h: number) => {
    const snap = snapBlockFrame(blocks, activeIds, { x, y, w, h });
    scheduleGuides(snap.guides);
    return snap;
  }, [blocks, scheduleGuides]);

  const getBlockFrameHandlers = useCallback((block: CustomBlock, shapeLockAspect = false): BlockTransformHandlers => ({
    lockAspectRatio: shapeLockAspect || aspectResizeIds.has(block.id),
    isAltDragFlashing: altDragFlashIds.has(block.id),
    zIndex: (isEditing) => (isEditing ? 9999998 : gestureLayerStyle(block.z, activeGestureIds.has(block.id)).during),
    onResizeStart: (event) => {
      setActiveGestureIds(new Set([block.id]));
      if (event.shiftKey) {
        setAspectResizeIds((prev) => new Set(prev).add(block.id));
      }
    },
    onMoveStart: (event) => {
      setActiveGestureIds(new Set(draggableSiblings(block.id)));
      if (event.altKey) {
        altDragCloneRef.current = { sourceId: block.id };
        return;
      }
      altDragCloneRef.current = null;
      if (!selectedIds.includes(block.id)) actions.selectBlock(block.id);
    },
    onMove: (nextX, nextY) => {
      const ids = draggableSiblings(block.id);
      const snap = computeGuides(ids, nextX, nextY, block.w, block.h);
      if (snap.guides.v.length || snap.guides.h.length || snap.guides.equalSpacing.length) {
        return { x: snap.x, y: snap.y };
      }
      return { x: nextX, y: nextY };
    },
    onResize: (nextX, nextY, nextW, nextH) => {
      computeGuides([block.id], nextX, nextY, nextW, nextH);
    },
    onMoveEnd: (nextX, nextY) => {
      clearGuides();
      setActiveGestureIds(new Set());
      const altDrag = altDragCloneRef.current?.sourceId === block.id ? altDragCloneRef.current : null;
      const ids = draggableSiblings(block.id);
      let dx = nextX - block.x;
      let dy = nextY - block.y;
      if (gridEnabled) {
        const snappedX = snapToGrid(nextX, gridSize);
        const snappedY = snapToGrid(nextY, gridSize);
        dx = snappedX - block.x;
        dy = snappedY - block.y;
      }
      if (altDrag) {
        altDragCloneRef.current = null;
        createAltDragCloneAtOffset(block.id, dx, dy);
        return;
      }
      if (ids.length === 1) {
        actions.updateBlock(block.id, applyBlockMove(block, block.x + dx, block.y + dy).patch);
        return;
      }
      const patches = applyMultiBlockMove(blocks, ids, dx, dy);
      actions.patchBlocks(patches, "Mover blocos");
    },
    onResizeEnd: (nextX, nextY, nextW, nextH) => {
      setActiveGestureIds(new Set());
      setAspectResizeIds((prev) => {
        const next = new Set(prev);
        next.delete(block.id);
        return next;
      });
      clearGuides();
      let w = nextW;
      let h = nextH;
      let x = nextX;
      let y = nextY;
      if (gridEnabled) {
        x = snapToGrid(x, gridSize);
        y = snapToGrid(y, gridSize);
        w = Math.max(gridSize, snapToGrid(w, gridSize));
        h = Math.max(gridSize, snapToGrid(h, gridSize));
      }
      if (block.groupId && groupEditMemberId !== block.id) {
        const group = (groups ?? []).find((candidate) => candidate.id === block.groupId);
        const memberIds = group?.memberIds ?? [];
        const members = memberIds
          .map((id) => blocks.find((candidate) => candidate.id === id))
          .filter((candidate): candidate is CustomBlock => !!candidate);
        const origin = groupBounds(members);
        if (origin && block.w > 0 && block.h > 0) {
          const scaleX = w / block.w;
          const scaleY = h / block.h;
          const next = {
            x: Math.round(x - (block.x - origin.x) * scaleX),
            y: Math.round(y - (block.y - origin.y) * scaleY),
            w: Math.round(origin.w * scaleX),
            h: Math.round(origin.h * scaleY),
          };
          actions.resizeGroup(memberIds, origin, next);
          return;
        }
      }
      actions.updateBlock(block.id, { w, h, x, y });
    },
  }), [
    actions,
    activeGestureIds,
    altDragFlashIds,
    aspectResizeIds,
    blocks,
    clearGuides,
    computeGuides,
    createAltDragCloneAtOffset,
    draggableSiblings,
    gridEnabled,
    gridSize,
    groupEditMemberId,
    groups,
    selectedIds,
  ]);

  return {
    guides,
    clearGuides,
    computeGuides,
    getBlockFrameHandlers,
  };
}

function cssEscapeId(id: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(id);
  return id.replace(/["\\]/g, "\\$&");
}

function blockVisualElement(id: string, root: ParentNode | null): HTMLElement | null {
  return root?.querySelector<HTMLElement>(`[data-block-visual-id="${cssEscapeId(id)}"]`) ?? null;
}

export function BlockRotationHandle({
  block,
  onRotate,
}: {
  block: TitleBlock | TextBlock | ImageBlock;
  onRotate: (id: string, rotation: number) => void;
}) {
  const handleMouseDown = (event: ReactMouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    const canvasRoot = event.currentTarget.closest('[data-custom-slide-canvas="true"]');
    const visualEl = blockVisualElement(block.id, canvasRoot);
    const frameEl = (event.currentTarget as HTMLElement).parentElement;
    if (!frameEl) return;
    const rect = frameEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const startRot = block.rotation ?? 0;
    const startAngle = Math.atan2(event.clientY - cy, event.clientX - cx) * (180 / Math.PI);
    let raf: number | null = null;
    let finalRot = Math.round(startRot);

    const applyPreview = () => {
      if (!visualEl) return;
      const previewDelta = finalRot - startRot;
      visualEl.style.transformOrigin = "50% 50%";
      visualEl.style.transform = `rotate(${previewDelta}deg)`;
      visualEl.style.willChange = "transform";
    };

    const clearPreview = () => {
      if (!visualEl) return;
      visualEl.style.transform = "";
      visualEl.style.transformOrigin = "";
      visualEl.style.willChange = "";
    };

    const onMove = (moveEvent: MouseEvent) => {
      if (raf !== null) cancelAnimationFrame(raf);
      const evX = moveEvent.clientX;
      const evY = moveEvent.clientY;
      const shiftKey = moveEvent.shiftKey;
      raf = requestAnimationFrame(() => {
        const angle = Math.atan2(evY - cy, evX - cx) * (180 / Math.PI);
        let newRot = startRot + (angle - startAngle);
        if (shiftKey) newRot = Math.round(newRot / 15) * 15;
        newRot = ((newRot % 360) + 360) % 360;
        if (newRot > 180) newRot -= 360;
        finalRot = Math.round(newRot);
        applyPreview();
        raf = null;
      });
    };

    const onUp = () => {
      if (raf !== null) {
        cancelAnimationFrame(raf);
        raf = null;
      }
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      clearPreview();
      if (finalRot !== Math.round(startRot)) {
        onRotate(block.id, finalRot);
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      data-export-hide="true"
      style={{
        position: "absolute",
        top: -28,
        left: "50%",
        transform: "translateX(-50%)",
        width: 16,
        height: 16,
        borderRadius: "50%",
        background: "white",
        border: "2px solid hsl(var(--primary))",
        cursor: "crosshair",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 999995,
        pointerEvents: "all",
      }}
      onMouseDown={handleMouseDown}
    >
      <RotateCw style={{ width: 8, height: 8, color: "hsl(var(--primary))" }} />
    </div>
  );
}
