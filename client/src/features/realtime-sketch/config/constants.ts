/**
 * Realtime-sketch relay constants, used by Sketch in /app
 * (spec: docs/superpowers/specs/2026-07-09-realtime-sketch-spike-design.md).
 * The model is pinned SERVER-SIDE in fal-i2i.routes.ts (ADR-0016 as
 * amended); the client only knows the relay path. Speed matrix measured
 * 2026-07-09: z-image turbo i2i ≈ 190ms inference / ~600ms total at 512².
 */
export const FAL_I2I_PATH = "/api/fal/i2i";

export const SNAPSHOT_INTERVAL_MS = 150;
/**
 * A frame stuck in flight this long is declared lost: abort the request
 * (HTTP gives true cancel), surface a sticky error, promote the newest
 * drawing. ~13× the median warm round-trip.
 */
export const IN_FLIGHT_WATCHDOG_MS = 8_000;

/** What one relayed frame is generated with. */
export interface SketchSettings {
  prompt: string;
  strength: number;
  steps: number;
  seed: number;
}

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
