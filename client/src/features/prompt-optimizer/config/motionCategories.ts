import { getParentCategory } from "@shared/taxonomy";

/**
 * Motion categories (ADR-0010 S2).
 *
 * Camera movement and subject action describe how the shot moves — they "drive
 * the video, not the picture". These two taxonomy parents are rendered gold
 * (see {@link ./categoryColors}) and marked as "not in the picture" on the
 * selection surface.
 *
 * Membership is decided from a span's declared taxonomy category, resolved to
 * its parent — a taxonomy lookup, never text classification.
 */
export const MOTION_CATEGORIES = ["camera", "action"] as const;

export function isMotionCategory(category: string | null | undefined): boolean {
  const parent = getParentCategory(category);
  return (
    parent !== null && (MOTION_CATEGORIES as readonly string[]).includes(parent)
  );
}
