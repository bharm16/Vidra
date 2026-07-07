import { getParentCategory } from "./taxonomy";

/**
 * Motion categories (ADR-0010 S2).
 *
 * Camera movement and subject action describe how the shot moves — they "drive
 * the video, not the picture". These two taxonomy parents are the ones rendered
 * gold and marked "not in the picture" in the editor, and the ones whose span
 * clicks serve motion-vocabulary alternatives in the suggestions path (D6).
 *
 * Shared so the client (highlighting, the "not in the picture" note) and the
 * server (motion-vocabulary suggestion bias) decide motion membership the same
 * way — a taxonomy lookup on a span's declared parent category, never text
 * classification.
 */
export const MOTION_CATEGORIES = ["camera", "action"] as const;

export function isMotionCategory(category: string | null | undefined): boolean {
  const parent = getParentCategory(category);
  return (
    parent !== null && (MOTION_CATEGORIES as readonly string[]).includes(parent)
  );
}
