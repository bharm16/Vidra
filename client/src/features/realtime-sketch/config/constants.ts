/**
 * Realtime-sketch spike constants
 * (spec: docs/superpowers/specs/2026-07-09-realtime-sketch-spike-design.md).
 * The model is pinned SERVER-SIDE in fal-i2i.routes.ts (ADR-0016 as
 * amended); the client only knows the relay path. Speed matrix measured
 * 2026-07-09: z-image turbo i2i ≈ 190ms inference / ~600ms total at 512².
 */
export const FAL_I2I_PATH = "/api/fal/i2i";

export const SNAPSHOT_INTERVAL_MS = 150;
/** 512² halves z-image latency vs 768² with negligible sketch-fidelity loss. */
export const SNAPSHOT_SIZE = 512;
export const SNAPSHOT_JPEG_QUALITY = 0.85;
/**
 * A frame stuck in flight this long is declared lost: abort the request
 * (HTTP gives true cancel), surface a sticky error, promote the newest
 * drawing. ~13× the median warm round-trip.
 */
export const IN_FLIGHT_WATCHDOG_MS = 8_000;

export const DEFAULT_PROMPT =
  "4k product photography of an ergonomic desk lamp glowing, studio lighting";

/** Handoff ink palette — first entry is the default. */
export const SKETCH_INKS = [
  "#1e2c47",
  "#e8862e",
  "#f2c94c",
  "#3b82f6",
  "#f4f4f2",
] as const;
export const DEFAULT_INK = SKETCH_INKS[0];
/** Brush sizes with their popover dot diameters (handoff: 7/12/19 → 8/18/34). */
export const BRUSH_SIZES = [
  { size: 8, dot: 7 },
  { size: 18, dot: 12 },
  { size: 34, dot: 19 },
] as const;
export const DEFAULT_BRUSH_SIZE = 18;
/** The sketchpad's paper tone (handoff panel + eraser color). */
export const SKETCHPAD_BACKGROUND = "#e9e9e6";
/** 5/8 steps — sketch keeps real influence; 0.75+ let the prompt steamroll sparse strokes. */
export const DEFAULT_STRENGTH = 0.625;
export const DEFAULT_STEPS = 8;
export const STEP_OPTIONS = [4, 8] as const;
export const DEFAULT_SEED = 42;

/**
 * i2i denoises only the tail of the step schedule: the strength slider's
 * real positions are the 1/steps grid. The UI snaps and labels accordingly.
 */
export function effectiveSteps(strength: number, steps: number): number {
  return Math.round(steps * strength);
}
