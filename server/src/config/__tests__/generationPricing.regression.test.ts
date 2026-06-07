import { describe, expect, it } from "vitest";
import { getGenerationCreditsPerSecond } from "@shared/generationPricing";
import { VIDEO_MODELS } from "../modelConfig";
import { getVideoCost, getVideoCreditsPerSecond } from "../modelCosts";

/**
 * Pricing seam regression guard.
 *
 * The shared GENERATION_PRICING table is meant to be the single source of truth
 * for per-second credit rates. But the server keys off VIDEO_MODELS values (full
 * provider/model ids), while the shared table historically only carried short
 * aliases — so most server lookups silently fell back to per-call literals.
 *
 * This test pins the effective rate and cost for every VIDEO_MODELS entry, and
 * asserts that the shared table now actually covers them (the literal is a dead
 * type-guard, not a live value). Any future drift — a model added without a
 * shared entry, or a rate changed in only one place — fails here.
 */
describe("generation pricing seam (regression)", () => {
  // Effective credits/second for every distinct VIDEO_MODELS value, pinned to
  // current behavior. Keys that collide (same model id) collapse to one entry.
  const EXPECTED_PER_SECOND: Record<string, number> = {
    [VIDEO_MODELS.DRAFT]: 5, // ⚠ collision with PRO — see dedicated test below
    [VIDEO_MODELS.DRAFT_I2V]: 3.5,
    [VIDEO_MODELS.DRAFT_I2V_LEGACY]: 3.5,
    [VIDEO_MODELS.DRAFT_I2V_WAN_2_5]: 3.5,
    [VIDEO_MODELS.PRO]: 5,
    [VIDEO_MODELS.SORA_2]: 6,
    [VIDEO_MODELS.SORA_2_PRO]: 14,
    [VIDEO_MODELS.KLING_V2_1]: 5,
    [VIDEO_MODELS.LUMA_RAY3]: 7,
    [VIDEO_MODELS.VEO_3]: 24,
    [VIDEO_MODELS.ARTISTIC]: 6,
    [VIDEO_MODELS.TIER_1]: 4,
    [VIDEO_MODELS.TIER_2]: 24,
  };

  it.each(Object.entries(EXPECTED_PER_SECOND))(
    "getVideoCreditsPerSecond(%s) === %d",
    (modelId, expected) => {
      expect(getVideoCreditsPerSecond(modelId)).toBe(expected);
    },
  );

  it.each(Object.entries(EXPECTED_PER_SECOND))(
    "getVideoCost(%s, 8s) === ceil(rate * 8)",
    (modelId, rate) => {
      expect(getVideoCost(modelId, 8)).toBe(Math.ceil(rate * 8));
    },
  );

  // The flagged DRAFT/PRO collision is the one model id the shared table does
  // not cover. Every other model must now resolve through the single seam.
  const COLLISION_KEY = VIDEO_MODELS.DRAFT; // identical string to VIDEO_MODELS.PRO

  it.each(
    Object.keys(EXPECTED_PER_SECOND).filter((id) => id !== COLLISION_KEY),
  )(
    "shared GENERATION_PRICING covers %s (no silent literal fallback)",
    (modelId) => {
      expect(getGenerationCreditsPerSecond(modelId)).not.toBeNull();
    },
  );

  it("flags the DRAFT/PRO collision rather than inventing a price", () => {
    // DRAFT and PRO are the same model id with different intended rates (3.5 vs
    // 5); as a duplicate object key, PRO (5) silently wins. Left uncovered in the
    // shared table on purpose — resolving it is a pricing decision, not a refactor.
    expect(VIDEO_MODELS.DRAFT).toBe(VIDEO_MODELS.PRO);
    expect(getGenerationCreditsPerSecond(VIDEO_MODELS.DRAFT)).toBeNull();
    expect(getVideoCreditsPerSecond(VIDEO_MODELS.DRAFT)).toBe(5);
  });
});
