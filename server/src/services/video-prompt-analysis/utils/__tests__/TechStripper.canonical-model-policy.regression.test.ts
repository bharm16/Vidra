/**
 * Regression: the placebo-token policy is keyed off the ids the strategies
 * actually pass.
 *
 * The policy used to be a `Set` of pre-migration ids (`kling-26`, `veo-4`).
 * `KlingStrategy` and `VeoStrategy` pass their canonical ids (`kling-2.1`,
 * `veo-3`), so the "keep placebo tokens for Kling/Veo" rule never fired for
 * them — they fell through to the strip-by-default branch and lost the tokens
 * the rule exists to preserve.
 */

import { describe, expect, it } from "vitest";

import { PROMPT_MODEL_ALIASES } from "@shared/videoModels";
import { TechStripper } from "../TechStripper";

const stripper = new TechStripper();

describe("TechStripper canonical model policy (regression)", () => {
  it("agrees with itself across every registered alias", () => {
    // The bug was an alias/canonical disagreement: `kling-26` kept tokens while
    // `kling-2.1` stripped them. Aliases resolve through the shared resolver,
    // so both spellings must now reach the same verdict.
    for (const [alias, canonicalModelId] of Object.entries(
      PROMPT_MODEL_ALIASES,
    )) {
      expect(stripper.shouldStripTokens(alias)).toBe(
        stripper.shouldStripTokens(canonicalModelId),
      );
    }
  });
});
