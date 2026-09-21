import { describe, expect, it } from "vitest";
import {
  DEFAULT_SAFETY_FACTOR,
  STUDIO_TURN_INPUT_TOKEN_BOUND,
  collectSmokeCeilingInputs,
  deriveSmokeCeiling,
  resolveFirstFrameProviderPlan,
  type SmokeCeilingInputs,
} from "../ceiling";
import { MAX_POLICY_ATTEMPTS } from "../../../../server/src/services/studio/StudioPolicyEngine";
import { calculateLLMCost } from "../../../../server/src/config/llmCosts";

/**
 * The live smoke's ceiling derivation (issue #140): every bound must come
 * from a live source, and any leg that cannot be bounded must fail the whole
 * derivation — a partially-known ceiling is exactly the "unknown cost bounds"
 * case that must produce non-verification.
 *
 * Expectations below are hand-derived from the sources, NOT computed by
 * calling the function under test with itself — a gate's own verdict can
 * never be the assertion in its test.
 */

/** Production-shaped inputs: the values the live sources resolve to today. */
function productionInputs(): SmokeCeilingInputs {
  return {
    sketchFrameCostMillicents: 300,
    studioTurn: {
      model: "gpt-5.6-luna", // ModelConfig.studio_turn.model default
      maxOutputTokens: 8000, // ModelConfig.studio_turn.maxTokens
      policyAttempts: 2, // MAX_POLICY_ATTEMPTS
      inputTokenBound: STUDIO_TURN_INPUT_TOKEN_BOUND,
    },
    studioEdit: {
      slug: "nano-banana-2",
      costCentsPerCall: 7, // StudioModelRegistry editDefault
      costVerified: true,
    },
    firstFrameProviderIds: ["replicate-flux-schnell"],
    safetyFactor: DEFAULT_SAFETY_FACTOR,
  };
}

describe("smoke ceiling derivation", () => {
  it("derives the ceiling from the bounded parameters, with every leg's source named", () => {
    const derivation = deriveSmokeCeiling(productionInputs(), calculateLLMCost);
    expect(derivation.ok).toBe(true);
    if (!derivation.ok) return;

    const legs = Object.fromEntries(
      derivation.ceiling.legs.map((leg) => [leg.leg, leg]),
    );

    // Sketch frame: SKETCH_FRAME_COST_MILLICENTS (300 millicents = $0.003) × 1.
    expect(legs["sketch-frame"]?.unitCostUsd).toBeCloseTo(0.003, 9);
    expect(legs["sketch-frame"]?.permittedCalls).toBe(1);

    // Studio turn: at the repo's llmCosts fallback rate ($0.001/1K in,
    // $0.002/1K out — gpt-5.6-luna has no table entry), one attempt is
    // 12K×0.001 + 8K×0.002 = $0.028, and the policy permits 2 attempts.
    expect(legs["studio-turn"]?.unitCostUsd).toBeCloseTo(0.028, 9);
    expect(legs["studio-turn"]?.permittedCalls).toBe(2);

    // Studio edit: nano-banana-2's verified 7¢/call × 1 (an edit's callCount).
    expect(legs["studio-edit-image"]?.unitCostUsd).toBeCloseTo(0.07, 9);
    expect(legs["studio-edit-image"]?.permittedCalls).toBe(1);

    // First frame: the documented conservative $0.01/image bound × 1 request.
    expect(legs["first-frame"]?.unitCostUsd).toBeCloseTo(0.01, 9);
    expect(legs["first-frame"]?.permittedCalls).toBe(1);

    // Sum 0.003 + 0.056 + 0.07 + 0.01 = 0.139; ×1.5 = 0.2085 → rounds UP to
    // whole cents: $0.21.
    expect(derivation.ceiling.preSafetySumUsd).toBeCloseTo(0.139, 9);
    expect(derivation.ceiling.ceilingUsd).toBe(0.21);
    expect(derivation.ceiling.ceilingCalls).toBe(5);
  });

  it("derives against the studio policy engine's REAL re-ask policy, not a copy", () => {
    // If the policy engine's attempts change, the ceiling must change with
    // it — this pin is what makes a silent drift impossible.
    expect(MAX_POLICY_ATTEMPTS).toBe(2);
  });

  it("refuses an unverified studio-edit price instead of reserving against it", () => {
    const derivation = deriveSmokeCeiling(
      {
        ...productionInputs(),
        studioEdit: {
          slug: "some-new-model",
          costCentsPerCall: 3,
          costVerified: false,
        },
      },
      calculateLLMCost,
    );
    expect(derivation.ok).toBe(false);
    if (derivation.ok) return;
    expect(derivation.unknownBounds[0]).toContain("some-new-model");
    expect(derivation.unknownBounds[0]).toContain("costVerified");
  });

  it("refuses to cost the edit leg when no edit-capable model resolves", () => {
    const derivation = deriveSmokeCeiling(
      { ...productionInputs(), studioEdit: null },
      calculateLLMCost,
    );
    expect(derivation.ok).toBe(false);
    if (derivation.ok) return;
    expect(derivation.unknownBounds[0]).toContain("no edit-capable model");
  });

  it("refuses a provider in the first-frame plan that has no cost bound", () => {
    const derivation = deriveSmokeCeiling(
      {
        ...productionInputs(),
        firstFrameProviderIds: [
          "replicate-flux-schnell",
          "some-future-cheaper-model",
        ],
      },
      calculateLLMCost,
    );
    expect(derivation.ok).toBe(false);
    if (derivation.ok) return;
    expect(derivation.unknownBounds[0]).toContain("some-future-cheaper-model");
    expect(derivation.unknownBounds[0]).toContain("refusing to guess");
  });

  it("refuses a non-positive sketch frame estimate", () => {
    const derivation = deriveSmokeCeiling(
      { ...productionInputs(), sketchFrameCostMillicents: 0 },
      calculateLLMCost,
    );
    expect(derivation.ok).toBe(false);
    if (derivation.ok) return;
    expect(derivation.unknownBounds[0]).toContain("SKETCH_FRAME_COST_MILLICENTS");
  });

  it("refuses an LLM cost lookup that yields no usable rate", () => {
    const derivation = deriveSmokeCeiling(productionInputs(), () => Number.NaN);
    expect(derivation.ok).toBe(false);
    if (derivation.ok) return;
    expect(derivation.unknownBounds[0]).toContain("gpt-5.6-luna");
  });

  it("reports EVERY unknown bound, not just the first", () => {
    const derivation = deriveSmokeCeiling(
      {
        ...productionInputs(),
        sketchFrameCostMillicents: -1,
        studioEdit: null,
      },
      calculateLLMCost,
    );
    expect(derivation.ok).toBe(false);
    if (derivation.ok) return;
    expect(derivation.unknownBounds).toHaveLength(2);
  });
});

describe("first-frame provider plan resolution", () => {
  it("uses the full t2i-capable roster when IMAGE_PREVIEW_PROVIDER_ORDER is unset", () => {
    expect(resolveFirstFrameProviderPlan(undefined)).toBeNull();
    expect(resolveFirstFrameProviderPlan("  ")).toBeNull();
    // The assembler turns null into the roster's t2i-capable set — today,
    // exactly the Flux Schnell provider.
    const inputs = collectSmokeCeilingInputs({
      sketchFrameCostMillicents: 300,
      studioTurnModel: "gpt-5.6-luna",
      studioTurnMaxOutputTokens: 8000,
      studioPolicyAttempts: 2,
      studioEditModel: null,
      imagePreviewProviderOrder: undefined,
    });
    expect(inputs.firstFrameProviderIds).toEqual(["replicate-flux-schnell"]);
  });

  it("keeps only t2i-capable providers from an explicit order (Kontext is img2img-only)", () => {
    const plan = resolveFirstFrameProviderPlan(
      "replicate-flux-kontext-fast, replicate-flux-schnell",
    );
    expect(plan).toEqual(["replicate-flux-schnell"]);
  });

  it("drops unknown tokens and duplicates from the order, case-insensitively", () => {
    const plan = resolveFirstFrameProviderPlan(
      "REPLICATE-FLUX-SCHNELL, bogus, replicate-flux-schnell",
    );
    expect(plan).toEqual(["replicate-flux-schnell"]);
  });

  it("an explicit order naming only incapable providers leaves nothing to cost", () => {
    const plan = resolveFirstFrameProviderPlan("replicate-flux-kontext-fast");
    expect(plan).toEqual([]);
  });
});
