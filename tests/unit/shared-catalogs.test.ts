import { describe, expect, it } from "vitest";

import {
  CANONICAL_PROMPT_MODEL_IDS,
  PROMPT_MODEL_ALIASES,
  PROMPT_MODEL_CONSTRAINTS,
} from "@shared/videoModels";
import {
  GENERATION_PRICING,
  getGenerationCreditsPerSecond,
} from "@shared/generationPricing";
import {
  GENERATION_ADAPTERS,
  GENERATION_ID_TO_ADAPTER,
  declaredPricingKeys,
} from "@shared/modelIdentity";
import { ModelConfig, VIDEO_MODELS } from "@server/config/modelConfig";
import { isRegisteredLlmClient } from "@server/config/llmClients";

// Hand-maintained catalogs in shared/ and server config must agree: a model id
// one table knows and another doesn't fails at runtime, not at compile time.

const canonical: readonly string[] = CANONICAL_PROMPT_MODEL_IDS;

describe("shared model catalogs", () => {
  it("gives every canonical model a self-alias and constraints", () => {
    expect(canonical.filter((id) => PROMPT_MODEL_ALIASES[id] !== id)).toEqual(
      [],
    );
    expect(canonical.filter((id) => !(id in PROMPT_MODEL_CONSTRAINTS))).toEqual(
      [],
    );
  });

  it("keys constraints and alias targets only by canonical ids", () => {
    expect(
      Object.keys(PROMPT_MODEL_CONSTRAINTS).filter(
        (key) => !canonical.includes(key),
      ),
    ).toEqual([]);
    expect(
      Object.entries(PROMPT_MODEL_ALIASES).filter(
        ([, target]) => !canonical.includes(target),
      ),
    ).toEqual([]);
  });

  it("prices every canonical model directly or through an alias", () => {
    const unpriced = canonical.filter(
      (id) =>
        getGenerationCreditsPerSecond(id) == null &&
        !Object.entries(PROMPT_MODEL_ALIASES).some(
          ([alias, target]) =>
            target === id && getGenerationCreditsPerSecond(alias) != null,
        ),
    );
    expect(unpriced).toEqual([]);
  });

  it("reaches every pricing key through a model id, alias or identity", () => {
    const reachable = new Set<string>([
      ...canonical,
      ...Object.keys(PROMPT_MODEL_ALIASES),
      ...declaredPricingKeys(),
      // Non-video pricing outside the model registry.
      "flux-kontext",
      "storyboard",
    ]);
    expect(
      Object.keys(GENERATION_PRICING).filter((key) => !reachable.has(key)),
    ).toEqual([]);
    expect(
      declaredPricingKeys().filter((key) => !(key in GENERATION_PRICING)),
    ).toEqual([]);
  });

  it("routes every generation model and configured video model to a real adapter", () => {
    const adapters: readonly string[] = GENERATION_ADAPTERS;
    expect(
      Object.entries(GENERATION_ID_TO_ADAPTER).filter(
        ([, adapter]) => !adapters.includes(adapter),
      ),
    ).toEqual([]);
    // An unknown id silently falls back to Replicate instead of failing.
    expect(
      Object.entries(VIDEO_MODELS).filter(
        ([, id]) => !GENERATION_ID_TO_ADAPTER[id],
      ),
    ).toEqual([]);
  });

  it("names only registered LLM clients in ModelConfig", () => {
    // An unregistered client is silently remapped, so the declared model never runs.
    const unregistered = Object.entries(ModelConfig).flatMap(
      ([operation, entry]) => {
        const fallback = (entry as { fallbackTo?: string }).fallbackTo;
        return [
          ...(isRegisteredLlmClient(entry.client)
            ? []
            : [`${operation}.client=${entry.client}`]),
          ...(fallback && !isRegisteredLlmClient(fallback)
            ? [`${operation}.fallbackTo=${fallback}`]
            : []),
        ];
      },
    );
    expect(unregistered).toEqual([]);
  });
});
