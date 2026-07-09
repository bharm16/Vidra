/**
 * Realtime-sketch spike constants
 * (spec: docs/superpowers/specs/2026-07-09-realtime-sketch-spike-design.md).
 * The model is deliberately a constant, not a setting: the server's token
 * allowlist (ADR-0016) is the real enforcement; this must match it.
 */
export const SKETCH_MODEL_ENDPOINT =
  "fal-ai/fast-lightning-sdxl/image-to-image";
export const FAL_PROXY_URL = "/api/fal/proxy";

export const SNAPSHOT_INTERVAL_MS = 150;
export const SNAPSHOT_SIZE = 768;
export const SNAPSHOT_JPEG_QUALITY = 0.85;

export const DEFAULT_PROMPT =
  "4k product photography of an ergonomic desk lamp glowing, studio lighting";
export const DEFAULT_STRENGTH = 0.75;
export const DEFAULT_STEPS = 4;
export const STEP_OPTIONS = [4, 8] as const;
export const DEFAULT_SEED = 42;

/**
 * i2i denoises only the tail of the step schedule: the strength slider's
 * real positions are the 1/steps grid. The UI snaps and labels accordingly.
 */
export function effectiveSteps(strength: number, steps: number): number {
  return Math.round(steps * strength);
}
