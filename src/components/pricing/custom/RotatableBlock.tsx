import React, { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  clampFrameToBounds,
  resizeFrameFromPointerDelta,
  type BlockFrame,
  type ResizeDirection,
  type TransformBounds,
} from "./blockTransform";

const HANDLES = [
  { cursor: "nw-resize", top: -4, left: -4,                         dir: "nw" },
  { cursor: "n-resize",  top: -4, left: "calc(50% - 4px)",          dir: "n"  },
  { cursor: "ne-resize", top: -4, right: -4,                        dir: "ne" },
  { cursor: "e-resize",  top: "calc(50% - 4px)", right: -4,         dir: "e"  },
  { cursor: "se-resize", bottom: -4, right: -4,                     dir: "se" },
  { cursor: "s-resize",  bottom: -4, left: "calc(50% - 4px)",       dir: "s"  },
  { cursor: "sw-resize", bottom: -4, left: -4,                      dir: "sw" },
  { cursor: "w-resize",  top: "calc(50% - 4px)", left: -4,          dir: "w"  },
] as const;

type Direction = typeof HANDLES[number]["dir"];
type ResizeHandleMap = Partial<Record<Direction | "top" | "right" | "bottom" | "left" | "topLeft" | "topRight" | "bottomLeft" | "bottomRight", boolean>>;

const HANDLE_TO_RND_KEY: Record<Direction, keyof ResizeHandleMap> = {
  n: "top",
  ne: "topRight",
  e: "right",
  se: "bottomRight",
  s: "bottom",
  sw: "bottomLeft",
  w: "left",
  nw: "topLeft",
};

interface RotatableBlockProps extends React.HTMLAttributes<HTMLDivElement> {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  scale: number;
  isSelected: boolean;
  isLocked: boolean;
  isEditing?: boolean;
  showResizeHandles?: boolean;
  disableDragging?: boolean;
  enableResizing?: boolean | ResizeHandleMap;
  lockAspectRatio?: boolean;
  bounds?: TransformBounds | null;
  cancel?: string;
  onMoveStart?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onMove?: (x: number, y: number) => Partial<BlockFrame> | void;
  onMoveEnd?: (x: number, y: number, event: MouseEvent) => void;
  onResizeStart?: (event: React.MouseEvent<HTMLDivElement>, dir: Direction) => void;
  onResize?: (x: number, y: number, w: number, h: number) => Partial<BlockFrame> | void;
  onResizeEnd?: (x: number, y: number, w: number, h: number, event: MouseEvent) => void;
  onSelect: (additive?: boolean) => void;
  onDoubleClick?: () => void;
}

function resizeHandleEnabled(enableResizing: boolean | ResizeHandleMap | undefined, dir: Direction): boolean {
  if (enableResizing === false) return false;
  if (enableResizing == null || enableResizing === true) return true;
  return enableResizing[dir] !== false && enableResizing[HANDLE_TO_RND_KEY[dir]] !== false;
}

function targetMatchesCancel(target: EventTarget | null, cancel?: string): boolean {
  if (!cancel || !(target instanceof Element)) return false;
  return !!target.closest(cancel);
}

export const RotatableBlock = React.forwardRef<HTMLDivElement, RotatableBlockProps>(
  function RotatableBlock(
    {
      x, y, w, h, rotation, scale, isSelected, isLocked, isEditing, showResizeHandles = true,
      disableDragging = false, enableResizing = true, lockAspectRatio = false, bounds, cancel,
      onMoveStart, onMove, onMoveEnd, onResizeStart, onResize, onResizeEnd, onSelect, onDoubleClick,
      className, style, children, ...rest
    },
    ref,
  ) {
    const rafRef = useRef<number | null>(null);
    const [draftFrame, setDraftFrame] = useState<BlockFrame | null>(null);
    const frameRef = useRef<BlockFrame>({ x, y, w, h });
    const gestureChangedRef = useRef(false);
    const visibleFrame = draftFrame ?? { x, y, w, h };

    useEffect(() => {
      if (!draftFrame) frameRef.current = { x, y, w, h };
    }, [draftFrame, h, w, x, y]);

    const effectiveHandles = useMemo(
      () => HANDLES.filter((handle) => resizeHandleEnabled(enableResizing, handle.dir)),
      [enableResizing],
    );

    const scheduleUpdate = (fn: () => void) => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        fn();
        rafRef.current = null;
      });
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0 || isEditing || targetMatchesCancel(e.target, cancel)) return;
      e.stopPropagation();
      onSelect(e.shiftKey);
      if (isLocked || disableDragging) return;
      onMoveStart?.(e);
      const startX = e.clientX;
      const startY = e.clientY;
      const origin = { x, y, w, h };
      frameRef.current = origin;
      gestureChangedRef.current = false;

      const onMouseMove = (ev: MouseEvent) => {
        const dx = (ev.clientX - startX) / scale;
        const dy = (ev.clientY - startY) / scale;
        if (Math.abs(ev.clientX - startX) > 1 || Math.abs(ev.clientY - startY) > 1) {
          gestureChangedRef.current = true;
        }
        scheduleUpdate(() => {
          const requested = clampFrameToBounds({
            ...origin,
            x: Math.round(origin.x + dx),
            y: Math.round(origin.y + dy),
          }, rotation, bounds);
          const override = onMove?.(requested.x, requested.y) ?? {};
          const next = clampFrameToBounds({ ...requested, ...override }, rotation, bounds);
          frameRef.current = next;
          setDraftFrame(next);
        });
      };
      const onMouseUp = (ev: MouseEvent) => {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        const finalFrame = frameRef.current;
        const changed = gestureChangedRef.current;
        setDraftFrame(null);
        gestureChangedRef.current = false;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        if (changed) onMoveEnd?.(finalFrame.x, finalFrame.y, ev);
      };
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      onDoubleClick?.();
    };

    const startResize = (e: React.MouseEvent, dir: Direction) => {
      e.stopPropagation();
      e.preventDefault();
      if (isLocked || isEditing || !resizeHandleEnabled(enableResizing, dir)) return;
      onResizeStart?.(e as React.MouseEvent<HTMLDivElement>, dir);
      const startX = e.clientX;
      const startY = e.clientY;
      const origX = x; const origY = y;
      const origW = w; const origH = h;
      const lockAspect = lockAspectRatio || e.shiftKey;
      frameRef.current = { x, y, w, h };
      gestureChangedRef.current = false;

      const onMouseMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          gestureChangedRef.current = true;
        }
        const frame = resizeFrameFromPointerDelta({
          origin: { x: origX, y: origY, w: origW, h: origH },
          dir: dir as ResizeDirection,
          clientDx: dx,
          clientDy: dy,
          scale,
          rotation,
          lockAspectRatio: lockAspect,
        });

        scheduleUpdate(() => {
          const requested = clampFrameToBounds(frame, rotation, bounds);
          const override = onResize?.(requested.x, requested.y, requested.w, requested.h) ?? {};
          const next = clampFrameToBounds({ ...requested, ...override }, rotation, bounds);
          frameRef.current = next;
          setDraftFrame(next);
        });
      };
      const onMouseUp = (ev: MouseEvent) => {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        const finalFrame = frameRef.current;
        const changed = gestureChangedRef.current;
        setDraftFrame(null);
        gestureChangedRef.current = false;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        if (changed) onResizeEnd?.(finalFrame.x, finalFrame.y, finalFrame.w, finalFrame.h, ev);
      };
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    };

    return (
      <div
        ref={ref}
        {...rest}
        className={cn("group/block transition-[outline,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background", className)}
        style={{
          position: "absolute",
          left: visibleFrame.x,
          top: visibleFrame.y,
          width: visibleFrame.w,
          height: visibleFrame.h,
          transform: `rotate(${rotation}deg)`,
          transformOrigin: "50% 50%",
          cursor: isLocked || disableDragging ? "default" : "grab",
          userSelect: "none",
          outline: isSelected ? "2px solid hsl(var(--primary))" : "1px solid transparent",
          outlineOffset: isSelected ? "1px" : "0",
          ...style,
        }}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
      >
        {children}

        {isSelected && !isLocked && showResizeHandles && effectiveHandles.map((handle) => {
          const { dir, cursor, ...pos } = handle;
          return (
            <div
              key={dir}
              style={{
                position: "absolute",
                width: 8,
                height: 8,
                background: "white",
                border: "1.5px solid hsl(var(--primary))",
                borderRadius: 1,
                cursor,
                zIndex: 10,
                ...pos,
              }}
              onMouseDown={(e) => startResize(e, dir)}
            />
          );
        })}
      </div>
    );
  },
);
