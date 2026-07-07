import { isMotionCategory } from "#shared/motionCategories.ts";
import { getParentCategory } from "#shared/taxonomy.ts";

/**
 * Motion-vocabulary bias for the suggestions path (ADR-0011 D6).
 *
 * When a creator clicks a motion span (camera/action — the phrases that "drive
 * the video, not the picture"), the enhancement suggestions should offer motion
 * alternatives rather than still-frame rephrasings. This folds the motion
 * vocabulary into the suggestion prompt for those spans — the "rebirth" of the
 * motion ideas inside the one suggestions surface, no standalone panel.
 *
 * The gate trusts the span's declared taxonomy category (isMotionCategory) — a
 * taxonomy lookup, never text classification. The returned string is prompt
 * guidance the LLM draws vocabulary from, not a classifier.
 */
const CAMERA_MOTION_GUIDANCE =
  "This span describes camera motion. Prioritize camera-move vocabulary — how the camera travels: pan, tilt, dolly, track, crane, zoom, orbit, push-in, whip-pan, handheld, or locked/static. Describe the move, not the still framing.";

const SUBJECT_MOTION_GUIDANCE =
  "This span describes subject motion. Prioritize action vocabulary — how the subject moves: walking, running, turning, reaching, gesturing, leaning, collapsing, drifting, swaying. Describe the motion, not a static pose.";

export function buildMotionGuidance(
  categoryId: string | null | undefined,
): string | null {
  if (!isMotionCategory(categoryId)) return null;
  return getParentCategory(categoryId) === "action"
    ? SUBJECT_MOTION_GUIDANCE
    : CAMERA_MOTION_GUIDANCE;
}
