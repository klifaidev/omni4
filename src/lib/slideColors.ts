function stripHash(hex: string): string {
  return hex.startsWith("#") ? hex.slice(1) : hex;
}

function withHash(hex: string): string {
  return hex.startsWith("#") ? hex : `#${hex}`;
}

const HEX = {
  chart1: "#C8102E",
  chart2: "#1C2430",
  chart3: "#0F766E",
  chart4: "#EA580C",
  chart5: "#2563EB",
  chart6: "#7C3AED",
  chart7: "#16A34A",
  chart8: "#DB2777",
  black: "#000000",
  sky: "#0EA5E9",
  amber: "#CA8A04",
  slate: "#475569",
  purple: "#9333EA",
  white: "#FFFFFF",
  paper: "#F8FAFC",
  grid: "#E2E8F0",
  gridSoft: "#F1F5F9",
  slate300: "#CBD5E1",
  slate400: "#94A3B8",
  slate500: "#64748B",
  ink: "#0B1220",
  slate700: "#334155",
  danger: "#DC2626",
  dangerDark: "#991B1B",
  dangerSoft: "#FEE2E2",
  dangerWash: "#FEF2F2",
  dangerBorder: "#FCA5A5",
  success: "#16A34A",
  successDark: "#065F46",
  successSoft: "#D1FAE5",
  blue: "#3B82F6",
  blueDark: "#1D4ED8",
  blueSoft: "#BFDBFE",
  warningDark: "#D97706",
  cyanDark: "#0891B2",
  pinkDark: "#BE185D",
  neutralDark: "#111827",
  pptMuted: "#667085",
  pptLine: "#D0D5DD",
  pptSurfaceAlt: "#EEF2F6",
  haraldRedDark: "#8B0A1E",
  heatGreenStrong: "#63BE7B",
  heatGreen: "#A6D89A",
  heatYellow: "#F8E78D",
  heatOrange: "#F0A874",
  heatRedStrong: "#F8696B",
  commission: "#C2410C",
  others: "#6B7280",
} as const;

export const SLIDE_HEX = HEX;

export const SLIDE_PPT_HEX = Object.fromEntries(
  Object.entries(HEX).map(([key, value]) => [key, stripHash(value)]),
) as { [K in keyof typeof HEX]: string };

export const PPT_COLORS = {
  ink: SLIDE_PPT_HEX.chart2,
  muted: SLIDE_PPT_HEX.pptMuted,
  line: SLIDE_PPT_HEX.pptLine,
  surface: SLIDE_PPT_HEX.paper,
  surfaceAlt: SLIDE_PPT_HEX.pptSurfaceAlt,
  positive: SLIDE_PPT_HEX.success,
  negative: SLIDE_PPT_HEX.danger,
  base: SLIDE_PPT_HEX.blueDark,
  haraldRed: SLIDE_PPT_HEX.chart1,
  haraldRedDark: SLIDE_PPT_HEX.haraldRedDark,
  heatGreenStrong: SLIDE_PPT_HEX.heatGreenStrong,
  heatGreen: SLIDE_PPT_HEX.heatGreen,
  heatYellow: SLIDE_PPT_HEX.heatYellow,
  heatOrange: SLIDE_PPT_HEX.heatOrange,
  heatRedStrong: SLIDE_PPT_HEX.heatRedStrong,
  volume: SLIDE_PPT_HEX.chart3,
  price: SLIDE_PPT_HEX.chart6,
  cost: SLIDE_PPT_HEX.chart4,
  freight: SLIDE_PPT_HEX.chart5,
  commission: SLIDE_PPT_HEX.commission,
  others: SLIDE_PPT_HEX.others,
} as const;

export const SLIDE_PREVIEW_COLORS = {
  haraldRed: withHash(PPT_COLORS.haraldRed),
  ink: withHash(PPT_COLORS.ink),
  muted: withHash(PPT_COLORS.muted),
  black: SLIDE_HEX.black,
  white: SLIDE_HEX.white,
  heatGreen: withHash(PPT_COLORS.heatGreen),
  heatYellow: withHash(PPT_COLORS.heatYellow),
} as const;

export const SLIDE_CSS = {
  chart1: "hsl(var(--chart-1))",
  chart2: "hsl(var(--chart-2))",
  chart3: "hsl(var(--chart-3))",
  chart4: "hsl(var(--chart-4))",
  chart5: "hsl(var(--chart-5))",
  chart6: "hsl(var(--chart-6))",
  chart7: "hsl(var(--chart-7))",
  chart8: "hsl(var(--chart-8))",
  background: "hsl(var(--background))",
  foreground: "hsl(var(--foreground))",
  card: "hsl(var(--card))",
  border: "hsl(var(--border))",
  muted: "hsl(var(--muted))",
  mutedForeground: "hsl(var(--muted-foreground))",
  primary: "hsl(var(--primary))",
  success: "hsl(var(--success))",
  destructive: "hsl(var(--destructive))",
  editorSelection: "hsl(var(--editor-selection))",
  editorGuide: "hsl(var(--editor-guide))",
  editorPreflightError: "hsl(var(--editor-preflight-error))",
} as const;

export const SLIDE_RGBA = {
  editorSelectionBorder: "hsl(var(--editor-selection) / 0.55)",
  editorSelectionBorderSoft: "hsl(var(--editor-selection) / 0.35)",
  editorSelectionBg: "hsl(var(--editor-selection) / 0.08)",
  editorSelectionBadge: "hsl(var(--editor-selection) / 0.82)",
  editorSelectionBadgeStrong: "hsl(var(--editor-selection) / 0.92)",
  editorSelectionPillBg: "hsl(var(--editor-selection) / 0.12)",
  editorSelectionPillBorder: "hsl(var(--editor-selection) / 0.35)",
  incomingBadgeBg: "hsl(var(--editor-selection) / 0.85)",
  haraldWash: "hsl(var(--chart-1) / 0.08)",
  haraldGlow: "hsl(var(--chart-1) / 0.65)",
  darkOverlay: "hsl(0 0% 0% / 0.55)",
  darkOverlayStrong: "hsl(0 0% 0% / 0.72)",
  whiteOverlay: "hsl(0 0% 100% / 0.12)",
} as const;

export const SLIDE_CHART_PALETTE = [
  SLIDE_HEX.chart1,
  SLIDE_HEX.chart2,
  SLIDE_HEX.chart3,
  SLIDE_HEX.chart6,
  SLIDE_HEX.chart4,
  SLIDE_HEX.chart5,
  SLIDE_HEX.sky,
  SLIDE_HEX.chart7,
  SLIDE_HEX.chart8,
  SLIDE_HEX.amber,
  SLIDE_HEX.slate,
  SLIDE_HEX.purple,
];

export const SLIDE_BRAND_COLORS = [
  SLIDE_HEX.chart1,
  SLIDE_HEX.chart2,
  SLIDE_HEX.white,
  SLIDE_HEX.paper,
  SLIDE_HEX.slate500,
  SLIDE_HEX.chart3,
  SLIDE_HEX.chart5,
  SLIDE_HEX.chart4,
];

export const SLIDE_HARALD_PALETTE = [
  SLIDE_HEX.chart1,
  SLIDE_HEX.chart2,
  SLIDE_HEX.chart3,
  SLIDE_HEX.chart4,
  SLIDE_HEX.chart5,
  SLIDE_HEX.chart6,
  SLIDE_HEX.chart7,
  SLIDE_HEX.chart8,
];
