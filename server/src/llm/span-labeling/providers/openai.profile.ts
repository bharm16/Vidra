import { logger } from "@infrastructure/Logger";
import { OPENAI_SPAN_LABELING_JSON_SCHEMA } from "../schemas/SpanLabelingSchema";
import type { LabelSpansResult } from "../types";
import type { SpanProviderProfile } from "./types";

/**
 * OpenAI / GPT-4o.
 *
 * Strict JSON schema (grammar-constrained decoding) guarantees format at
 * generation time, so the prompt stays minimal — the rules live in the schema
 * descriptions — and no confidence adjustment is needed afterwards.
 */
export const openAiSpanProfile: SpanProviderProfile = {
  id: "openai",
  promptProviderName: "openai",
  jsonSchema: OPENAI_SPAN_LABELING_JSON_SCHEMA,

  requestOptions: {
    // Repeat format instructions at the end; OpenAI benefits on long inputs.
    enableBookending: true,
    // Rich schema descriptions do the work few-shot examples would.
    useFewShot: false,
    useSeedFromConfig: true,
    /**
     * DELIBERATE, and load-bearing: OpenAI *is* logprobs-capable, but span
     * labeling does not ask for them. ADR-0001 flagged that deleting this
     * override would silently start requesting logprobs and exercise the
     * adapter's logprobs-rejection retry — a behavior change requiring a
     * live re-bless. ADR-0020 preserves it verbatim.
     */
    enableLogprobs: false,
  },

  rawTextPayload: false,
  relaxValidation: false,

  postProcess(result: LabelSpansResult): LabelSpansResult {
    logger.debug("openai span profile: returning result without adjustment", {
      spanCount: result.spans?.length || 0,
    });

    return {
      ...result,
      meta: {
        ...result.meta,
        _clientType: "openai",
        _providerOptimizations: {
          provider: "openai",
          strictSchema: true,
          logprobsAdjustment: false,
        },
      },
    };
  },
};
