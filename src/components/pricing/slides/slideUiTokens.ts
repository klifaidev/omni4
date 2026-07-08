import { BookOpen, GitBranch, LayoutTemplate, Target } from "lucide-react";

export const SLIDE_ICON_MAP = { GitBranch, Target, BookOpen, LayoutTemplate } as const;

export const SLIDE_ACCENT_BG = {
  blue: "bg-primary/15 text-primary border-primary/30",
  amber: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  neutral: "bg-muted text-muted-foreground border-border/40",
} as const;

