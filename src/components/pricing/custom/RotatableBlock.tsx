import React, { useRef } from "react";
import { cn } from "@/lib/utils";

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
  onSelect: (additive?: boolean) => void;
  onDoubleClick?: () => void;
}

export const RotatableBlock = React.forwardRef<HTMLDivElement, RotatableBlockProps>(
  function RotatableBlock(
    {
      x, y, w, h, rotation, scale, isSelected, isLocked, isEditing,
      onMove, onSelect, onDoubleClick,
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
      </div>
    );
  },
);
