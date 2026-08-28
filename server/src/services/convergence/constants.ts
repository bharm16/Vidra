/**
 * Constants for the Visual Convergence feature
 */

import type { Direction } from "./types";

// ============================================================================
// Direction Options (Task 1.5)
// ============================================================================

/**
 * Default aspect ratio for generated images
 */
export const DEFAULT_ASPECT_RATIO = "16:9";

/**
 * Available direction options for the direction fork
 * Each direction represents a high-level creative style
 */
export const DIRECTION_OPTIONS: Array<{ id: Direction; label: string }> = [
  { id: "cinematic", label: "Cinematic" },
  { id: "social", label: "Social Media" },
  { id: "artistic", label: "Artistic" },
  { id: "documentary", label: "Documentary" },
];

// ============================================================================
// Credit Cost Constants (Task 1.6)
// ============================================================================

/**
 * Credit costs for convergence operations
 * Used for credit reservation and display
 */
export const CONVERGENCE_COSTS = {
  /** Cost for generating 4 direction images (4 images × 1 credit each) */
  DIRECTION_IMAGES: 4,
  /** Cost for generating 4 dimension images (4 images × 1 credit each) */
  DIMENSION_IMAGES: 4,
  /** Cost for generating HQ final frame (Flux Pro) */
  FINAL_FRAME_HQ: 2,
  /** Cost for regenerating the HQ final frame */
  FINAL_FRAME_REGENERATE: 2,
  /** Cost for quick generate mode (single HQ image) */
  QUICK_GENERATE: 2,
  /** Cost for depth estimation using Depth Anything v2 */
  DEPTH_ESTIMATION: 1,
  /** Cost for Wan 2.2 video preview */
  WAN_PREVIEW: 5,
  /** Cost for regenerating dimension images (same as dimension images) */
  REGENERATION: 4,
  /** Estimated total cost for completing the full flow */
  ESTIMATED_TOTAL: 4 + 4 + 4 + 4 + 2 + 1 + 5, // 24 credits
} as const;

/**
 * Max number of allowed regenerations for the final frame
 */
export const MAX_FINAL_FRAME_REGENERATIONS = 3;

/**
 * Image generation providers for previews and HQ frames
 */
export const PREVIEW_PROVIDER = "replicate-flux-schnell";
export const FINAL_FRAME_PROVIDER = "replicate-flux-pro";

/**
 * Credit costs for final video generation by model
 * Used to display costs in the finalization step
 */
export const GENERATION_COSTS: Record<string, number> = {
  "sora-2": 80,
  "veo-3": 30,
  "kling-v2.1": 35,
  "luma-ray-3": 40,
  "wan-2.2": 15,
  "wan-2.5": 15,
  "runway-gen4": 50,
};

// ============================================================================
// Camera Path Constants (Task 1.7)
// ============================================================================

// The camera-path catalogue and its descriptions are a cross-layer contract;
// the canonical copies live in shared/cameraMotion.ts.
export {
  CAMERA_PATHS,
  CAMERA_MOTION_DESCRIPTIONS,
} from "#shared/cameraMotion";

// ============================================================================
// Regeneration Limits
// ============================================================================

/**
 * Maximum number of regenerations allowed per dimension per session
 * Requirement 14.4: Limit regeneration to 3 times per dimension
 */
export const MAX_REGENERATIONS_PER_DIMENSION = 3;

// ============================================================================
// Session Configuration
// ============================================================================

/**
 * Session TTL in hours
 * Requirement 1.4: Sessions inactive for 24 hours are marked as abandoned
 */
export const SESSION_TTL_HOURS = 24;

/**
 * Session TTL in milliseconds
 */
export const SESSION_TTL_MS = SESSION_TTL_HOURS * 60 * 60 * 1000;
