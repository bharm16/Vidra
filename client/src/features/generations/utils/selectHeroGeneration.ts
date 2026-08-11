import type { Generation } from "../types";

interface SelectHeroGenerationInput {
  generations: Generation[];
  activeGenerationId: string | null;
  heroOverrideGenerationId: string | null;
}

// Server hardcodes this model name on the storyboard route. Treat it as a
// stable legacy-data signal (per ISSUE-26 follow-up): storyboard records
// persisted before ISSUE-30 fixed the server to stamp `mediaType:
// "image-sequence"` carry undefined mediaType, but the model name remains.
const STORYBOARD_MODEL = "flux-kontext";

const isStoryboard = (generation: Generation): boolean => {
  if (generation.mediaType === "image-sequence") return true;
  // Legacy fallback: a flux-kontext record with no canonical mediaType is a
  // storyboard. Records that explicitly mark mediaType (e.g. "video") are
  // trusted — the canonical signal always wins over the heuristic.
  if (generation.model === STORYBOARD_MODEL && generation.mediaType == null) {
    return true;
  }
  return false;
};

/**
 * Choose the generation that should occupy the canvas hero slot.
 *
 * Selection precedence:
 *  1. Explicit override id (must point to a non-storyboard generation).
 *  2. Active selection id (must point to a non-storyboard generation).
 *  3. Default: latest non-storyboard generation, with render-tier preferred
 *     over draft-tier when both are present.
 *
 * Storyboards (mediaType === "image-sequence") never occupy the hero — they
 * surface only inside the storyboard viewer.
 */
export function selectHeroGeneration({
  generations,
  activeGenerationId,
  heroOverrideGenerationId,
}: SelectHeroGenerationInput): Generation | null {
  if (generations.length === 0) return null;

  const nonStoryboard = generations.filter((g) => !isStoryboard(g));
  if (nonStoryboard.length === 0) return null;

  if (heroOverrideGenerationId) {
    const overrideMatch = nonStoryboard.find(
      (g) => g.id === heroOverrideGenerationId,
    );
    if (overrideMatch) return overrideMatch;
  }

  if (activeGenerationId) {
    const activeMatch = nonStoryboard.find((g) => g.id === activeGenerationId);
    if (activeMatch) return activeMatch;
  }

  // Default fallback: prefer the latest render take, since users pay
  // materially more for render output than for draft output.
  //
  // A plain equality check is now sound. `tier` used to arrive straight off
  // the wire, where a legacy `"final"` could slip through the open generation
  // bag — hence the old allowlist. Since ADR-0021 the tier is derived from
  // `model` at the repository boundary, so only the two canonical values ever
  // reach here.
  const renders = nonStoryboard.filter((g) => g.tier === "render");
  if (renders.length > 0) {
    return renders[renders.length - 1] ?? null;
  }
  return nonStoryboard[nonStoryboard.length - 1] ?? null;
}
