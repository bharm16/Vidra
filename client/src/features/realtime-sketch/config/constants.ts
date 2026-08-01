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
/**
 * 7/8 steps — the only stop where sketch and prompt both reach the image.
 * Swept 2026-08-01 against the pinned relay model, varying sketch and prompt
 * independently: through bucket 6 the model traces the drawing and the prompt
 * is inert, at bucket 8 the drawing stops registering at all. The usable band
 * is one bucket wide, so this default is a measurement — re-measure with the
 * two-influence sweep before moving it.
 */
export const DEFAULT_STRENGTH = 0.875;
/**
 * 8 is the only supported step count. 4 was offered until 2026-08-01 and could
 * not work: its grid stops are 0.25/0.5/0.75/1.0, which step straight over the
 * (0.75, 0.875] blend band, so every setting was either a traced copy or a
 * discarded sketch. It bought no speed either — round-trips at 4 and 8 overlap
 * entirely at 512², queue variance swamping four denoising steps.
 */
export const DEFAULT_STEPS = 8;
export const DEFAULT_SEED = 42;

/**
 * How many of the schedule's steps the model actually denoises. i2i runs only
 * the tail, and the model takes the CEILING of steps × strength — measured
 * 2026-08-01 with a 0.001 probe: 0.750 comes back a traced copy (bucket 6)
 * while 0.751 blends (bucket 7). Rounding instead of ceiling understates the
 * bucket for most of each interval, so the label would disagree with the image.
 */
export function effectiveSteps(strength: number, steps: number): number {
  return Math.ceil(steps * strength);
}

/**
 * Clamp a strength onto the 1/steps grid — the only stops the model can tell
 * apart, since every strength in ((k-1)/steps, k/steps] denoises identically.
 * Ceiling, to match `effectiveSteps`: rounding pulled strengths down out of
 * their own bucket (0.80 became 0.75), landing the creator in a traced copy
 * one stop below the setting they chose.
 */
export function snapStrength(strength: number, steps: number): number {
  return Math.min(1, Math.max(0, Math.ceil(strength * steps) / steps));
}
