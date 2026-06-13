import React, { useRef } from "react";
import { cn } from "@/lib/utils";

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
  onMove: (x: number, y: number) => void;
  onResize: (x: number, y: number, w: number, h: number) => void;
  onSelect: (additive?: boolean) => void;
  onDoubleClick?: () => void;
}

export const RotatableBlock = React.forwardRef<HTMLDivElement, RotatableBlockProps>(
  function RotatableBlock(
    {
      x, y, w, h, rotation, scale, isSelected, isLocked, isEditing,
      onMove, onResize, onSelect, onDoubleClick,
      className, style, children, ...rest
    },
    ref,
  ) {
    const dragRef = useRef<{
      startX: number; startY: number; origX: number; origY: number;
    } | null>(null);

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0 || isLocked || isEditing) return;
      e.stopPropagation();
      onSelect(e.shiftKey);
      dragRef.current = { startX: e.clientX, startY: e.clientY, origX: x, origY: y };

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const dx = (ev.clientX - dragRef.current.startX) / scale;
        const dy = (ev.clientY - dragRef.current.startY) / scale;
        onMove(
          Math.round(dragRef.current.origX + dx),
          Math.round(dragRef.current.origY + dy),
        );
      };
      const onMouseUp = () => {
        dragRef.current = null;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
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
      const startX = e.clientX;
      const startY = e.clientY;
      const origX = x; const origY = y;
      const origW = w; const origH = h;
      const rad = (rotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      const onMouseMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        // Project screen delta into block's local (de-rotated) space
        const localDx = (dx * cos + dy * sin) / scale;
        const localDy = (-dx * sin + dy * cos) / scale;

        let nx = origX, ny = origY, nw = origW, nh = origH;

        if (dir.includes("e")) nw = Math.max(50, origW + localDx);
        if (dir.includes("s")) nh = Math.max(30, origH + localDy);
        if (dir.includes("w")) { nw = Math.max(50, origW - localDx); nx = origX + (origW - nw); }
        if (dir.includes("n")) { nh = Math.max(30, origH - localDy); ny = origY + (origH - nh); }

        onResize(Math.round(nx), Math.round(ny), Math.round(nw), Math.round(nh));
      };
      const onMouseUp = () => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    };

    return (
      <div
        ref={ref}
        {...rest}
        className={cn("group/block", className)}
        style={{
          position: "absolute",
          left: x,
          top: y,
          width: w,
          height: h,
          transform: `rotate(${rotation}deg)`,
          transformOrigin: "50% 50%",
          cursor: isLocked ? "default" : "grab",
          userSelect: "none",
          outline: isSelected ? "2px solid hsl(var(--primary))" : "1px solid transparent",
          outlineOffset: isSelected ? "1px" : "0",
          ...style,
        }}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
      >
        {children}

        {/* Resize handles — visible only when selected and not locked */}
        {isSelected && !isLocked && HANDLES.map((handle) => {
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
