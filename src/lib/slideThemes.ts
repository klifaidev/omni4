// Sistema de temas visuais para slides personalizados.
// Cada tema define a paleta básica (fundo + cores principais) e um array
// de "swatches" — cores de atalho que aparecem no popover Paleta do editor.
// Cores em hex SEM '#'.

export interface SlideTheme {
  id: string;
  name: string;
  background: string;
  primaryColor: string;
  textColor: string;
  accentColor: string;
  footerColor?: string;
  /** 8 cores de atalho mostradas no popover Paleta. */
  swatches: string[];
}

export const SLIDE_THEMES: SlideTheme[] = [
  {
    id: "harold-classic",
    name: "Harald Clássico",
    background: "FFFFFF",
    primaryColor: "C8102E",
    textColor: "1C2430",
    accentColor: "667085",
    footerColor: "C8102E",
    swatches: ["C8102E", "1C2430", "667085", "F1F5F9", "16A34A", "F59E0B", "2563EB", "FFFFFF"],
  },
  {
    id: "harold-dark",
    name: "Harald Escuro",
    background: "1C2430",
    primaryColor: "C8102E",
    textColor: "FFFFFF",
    accentColor: "94A3B8",
    footerColor: "C8102E",
    swatches: ["C8102E", "FFFFFF", "94A3B8", "334155", "F87171", "FBBF24", "60A5FA", "1C2430"],
  },
  {
    id: "slate-clean",
    name: "Slate Clean",
    background: "F8FAFC",
    primaryColor: "334155",
    textColor: "1E293B",
    accentColor: "64748B",
    swatches: ["334155", "1E293B", "64748B", "CBD5E1", "0EA5E9", "10B981", "EF4444", "FFFFFF"],
  },
  {
    id: "navy-executive",
    name: "Navy Executive",
    background: "0F172A",
    primaryColor: "3B82F6",
    textColor: "FFFFFF",
    accentColor: "94A3B8",
    swatches: ["3B82F6", "FFFFFF", "94A3B8", "1E293B", "60A5FA", "FBBF24", "F472B6", "0F172A"],
  },
  {
    id: "forest-calm",
    name: "Forest Calm",
    background: "F0FDF4",
    primaryColor: "166534",
    textColor: "1A2E1A",
    accentColor: "65A30D",
    swatches: ["166534", "1A2E1A", "65A30D", "BBF7D0", "0E7490", "D97706", "B91C1C", "FFFFFF"],
  },
  {
    id: "amber-warm",
    name: "Amber Warm",
    background: "FFFBEB",
    primaryColor: "B45309",
    textColor: "1C1008",
    accentColor: "D97706",
    swatches: ["B45309", "1C1008", "D97706", "FDE68A", "92400E", "166534", "1E40AF", "FFFFFF"],
  },
  {
    id: "monochrome",
    name: "Monocromático",
    background: "FFFFFF",
    primaryColor: "111827",
    textColor: "374151",
    accentColor: "6B7280",
    swatches: ["111827", "374151", "6B7280", "9CA3AF", "D1D5DB", "E5E7EB", "F3F4F6", "FFFFFF"],
  },
];

export const DEFAULT_THEME_ID = "harold-classic";

export function getTheme(id?: string): SlideTheme {
  return SLIDE_THEMES.find((t) => t.id === id) ?? SLIDE_THEMES[0];
}
