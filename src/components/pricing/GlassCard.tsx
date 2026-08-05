import { cn } from "@/lib/utils";
import * as React from "react";

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  glow?: "blue" | "green" | "red" | "none";
  hoverable?: boolean;
}

export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, glow = "none", hoverable = false, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "surface-panel rounded-2xl border border-border/40 p-6 backdrop-blur-xl",
        hoverable && "glass-hover",
        glow === "blue" && "glow-blue",
        glow === "green" && "glow-green",
        glow === "red" && "glow-red",
        className,
      )}
      {...props}
    />
  ),
);
GlassCard.displayName = "GlassCard";
