import { useCallback, useEffect, useRef } from "react";
import type * as Y from "yjs";
import type { CustomBlock, CustomSlideConfig } from "@/lib/customSlide";
import {
  insertCustomSlideBlocks,
  patchCustomSlideBlock,
  replaceCustomSlideYDoc,
  yDocToCustomSlideConfig,
} from "@/lib/customSlideYjs";
import {
  commitExternalEditorChange,
  patchBlockAction,
  redo as redoAction,
  undo as undoAction,
  type EditorActionLabel,
} from "./editorStore";

type UseSlideCollaborationActionsArgs = {
  collabYDoc?: Y.Doc | null;
  config: CustomSlideConfig;
  canEdit: () => boolean;
  onChange: (config: CustomSlideConfig) => void;
  setSelection: (ids: string[]) => void;
};

export function useSlideCollaborationActions({
  collabYDoc,
  config,
  canEdit,
  onChange,
  setSelection,
}: UseSlideCollaborationActionsArgs) {
  const pendingYBlockPatchesRef = useRef(new Map<string, Partial<CustomBlock>>());
  const yBlockPatchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commitYDocConfig = useCallback((label: EditorActionLabel) => {
    if (!collabYDoc) return null;
    const next = yDocToCustomSlideConfig(collabYDoc);
    commitExternalEditorChange(label, next);
    onChange(next);
    return next;
  }, [collabYDoc, onChange]);

  const applyUndoRedoToYDoc = useCallback((next: CustomSlideConfig | null) => {
    if (!collabYDoc || !next) return;
    replaceCustomSlideYDoc(collabYDoc, next);
  }, [collabYDoc]);

  const handleUndo = useCallback(() => {
    applyUndoRedoToYDoc(undoAction());
  }, [applyUndoRedoToYDoc]);

  const handleRedo = useCallback(() => {
    applyUndoRedoToYDoc(redoAction());
  }, [applyUndoRedoToYDoc]);

  const maxBlockZ = useCallback(() => (
    config.blocks.reduce((max, block) => Math.max(max, block.z), 0)
  ), [config.blocks]);

  const insertYBlocks = useCallback((blocks: CustomBlock[], selectInserted = true) => {
    if (!collabYDoc || blocks.length === 0) return [];
    const zTop = maxBlockZ();
    const withZ = blocks.map((block, index) => ({ ...block, z: zTop + index + 1 }) as CustomBlock);
    const ids = insertCustomSlideBlocks(collabYDoc, withZ);
    commitYDocConfig("Adicionar bloco");
    if (selectInserted && ids.length > 0) setSelection(ids);
    return ids;
  }, [collabYDoc, commitYDocConfig, maxBlockZ, setSelection]);

  const flushYBlockPatches = useCallback(() => {
    if (!collabYDoc) return;
    const pending = pendingYBlockPatchesRef.current;
    if (pending.size === 0) return;
    pending.forEach((patch, id) => {
      patchCustomSlideBlock(collabYDoc, id, patch);
    });
    pending.clear();
    commitYDocConfig("Mover bloco");
  }, [collabYDoc, commitYDocConfig]);

  const queueYBlockPatch = useCallback((id: string, patch: Partial<CustomBlock>) => {
    const pending = pendingYBlockPatchesRef.current;
    pending.set(id, { ...(pending.get(id) ?? {}), ...patch });
    if (yBlockPatchTimerRef.current) return;
    yBlockPatchTimerRef.current = setTimeout(() => {
      yBlockPatchTimerRef.current = null;
      flushYBlockPatches();
    }, 60);
  }, [flushYBlockPatches]);

  useEffect(() => () => {
    if (yBlockPatchTimerRef.current) {
      clearTimeout(yBlockPatchTimerRef.current);
      yBlockPatchTimerRef.current = null;
    }
    pendingYBlockPatchesRef.current.clear();
  }, []);

  const updateBlock = useCallback((id: string, patch: Partial<CustomBlock>) => {
    if (!canEdit()) return;
    const keys = Object.keys(patch);
    const isMove = keys.every((k) => k === "x" || k === "y");
    const isResize = keys.some((k) => k === "w" || k === "h");
    const isOrder = keys.length === 1 && keys[0] === "z";
    const isLock = keys.length === 1 && keys[0] === "locked";
    const label = isLock ? "Bloquear / Desbloquear"
      : isOrder ? "Alterar ordem"
      : isResize ? "Redimensionar bloco"
      : isMove ? "Mover bloco"
      : "Alterar dados";
    if (collabYDoc) {
      if (isMove || isResize) {
        queueYBlockPatch(id, patch);
        return;
      }
      patchCustomSlideBlock(collabYDoc, id, patch);
      commitYDocConfig(label);
      return;
    }
    patchBlockAction(id, patch, label);
  }, [canEdit, collabYDoc, commitYDocConfig, queueYBlockPatch]);

  return {
    commitYDocConfig,
    handleRedo,
    handleUndo,
    insertYBlocks,
    maxBlockZ,
    updateBlock,
  };
}
