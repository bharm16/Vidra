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

import {
  CANONICAL_PROMPT_MODEL_IDS,
  PROMPT_MODEL_ALIASES,
  resolveCanonicalPromptModelId,
  type CanonicalPromptModelId,
} from "@shared/videoModels";
import { TechStripper } from "../TechStripper";

const stripper = new TechStripper();

/** The canonical ids declared by KlingStrategy / VeoStrategy / SoraStrategy. */
const KEEP_MODEL_IDS: CanonicalPromptModelId[] = [
  "kling-2.1",
  "veo-3",
  "sora-2",
];

describe("TechStripper canonical model policy (regression)", () => {
  it.each(KEEP_MODEL_IDS)(
    "keeps placebo tokens for the canonical id %s",
    (modelId) => {
      const result = stripper.strip(
        "4k masterpiece cinematic wide shot",
        modelId,
      );

      expect(stripper.shouldStripTokens(modelId)).toBe(false);
      expect(result.text).toContain("4k");
      expect(result.text).toContain("masterpiece");
      expect(result.strippedTokens).toEqual([]);
      expect(result.tokensWereStripped).toBe(false);
    },
  );

  it("gives every canonical prompt model an explicit policy", () => {
    // A canonical id that falls through to the strip-by-default branch is the
    // signature of the original bug. An id with a registered policy and an
    // unregistered id must not be indistinguishable for keep-models.
    for (const modelId of CANONICAL_PROMPT_MODEL_IDS) {
      expect(resolveCanonicalPromptModelId(modelId)).toBe(modelId);
    }

    const keepModels = CANONICAL_PROMPT_MODEL_IDS.filter(
      (modelId) => !stripper.shouldStripTokens(modelId),
    );
    expect([...keepModels].sort()).toEqual([...KEEP_MODEL_IDS].sort());
  });

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
