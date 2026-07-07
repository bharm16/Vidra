export type CategoryHighlightColor = {
  bg: string;
  border: string;
  ring: string;
};

const hexToRgba = (hex: string, alpha: number): string => {
  const cleaned = hex.replace("#", "").trim();
  if (cleaned.length !== 6) return `rgba(0,0,0,${alpha})`;
  const r = Number.parseInt(cleaned.slice(0, 2), 16);
  const g = Number.parseInt(cleaned.slice(2, 4), 16);
  const b = Number.parseInt(cleaned.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const build = (hex: string): CategoryHighlightColor => ({
  bg: hexToRgba(hex, 0.15),
  border: hexToRgba(hex, 0.35),
  ring: hexToRgba(hex, 0.18),
});

/**
 * Motion gold (ADR-0010 S2). The single source for the color that marks
 * camera/action phrases as "drives the video, not the picture" — shared by the
 * span highlight and the "not in the picture" note on the selection surface.
 */
export const MOTION_GOLD_HEX = "#d3a44e";

/**
 * Semantic warm/cool color mapping:
 * - WARM tones (amber, coral, rose) → human/creative categories
 * - COOL tones (steel blue, teal, indigo) → technical categories
 * - NEUTRAL tones (sage, lavender) → contextual categories
 */
export const categoryColors = {
  // Cool — technical
  shot: build("#3b82f6"), // Steel blue — framing is technical
  lighting: build("#06b6d4"), // Cyan/teal — light = cool spectrum

  // Gold — motion: drives the video, not the picture (M3, ADR-0010 S2)
  camera: build(MOTION_GOLD_HEX), // camera movement — gold "not in the picture"
  action: build(MOTION_GOLD_HEX), // subject action — gold "not in the picture"

  // Warm — human/creative
  subject: build("#f59e0b"), // Amber/gold — human element, warm
  style: build("#ec4899"), // Pink/rose — aesthetic, emotional

  // Neutral — contextual
  environment: build("#6b8a6b"), // Sage/olive — earth tones, grounding
  technical: build("#8b8baa"), // Muted lavender — technical metadata
  audio: build("#a78bfa"), // Soft violet — atmospheric, ambient
} as const;

export const DEFAULT_CATEGORY_COLOR = build("#94a3b8");
