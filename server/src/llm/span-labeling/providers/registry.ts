import { logger } from "@infrastructure/Logger";
import type { ProviderType } from "@utils/provider/ProviderDetector";
import { geminiSpanProfile } from "./gemini.profile";
import { genericSpanProfile } from "./generic.profile";
import { groqSpanProfile } from "./groq.profile";
import { openAiSpanProfile } from "./openai.profile";
import type { SpanProviderId, SpanProviderProfile } from "./types";

/**
 * The span-labeling profile registry.
 *
 * Adding a provider is: write one `*.profile.ts` module, add it here. That is
 * the whole change — no capability row, no schema-factory branch, no client
 * subclass, no factory case.
 */
export const SPAN_PROVIDER_PROFILES: Record<
  SpanProviderId,
  SpanProviderProfile
> = {
  openai: openAiSpanProfile,
  groq: groqSpanProfile,
  gemini: geminiSpanProfile,
  generic: genericSpanProfile,
};

/**
 * Map the provider that will actually run the request onto its profile.
 *
 * The provider comes from `aiService.resolveExecution()` and is deliberately
 * NOT re-derived here. Re-deriving it from `process.env` and `ModelConfig` —
 * neither of which can see client availability or circuit state — is how a
 * Gemini-shaped request got built for a call the router had already rerouted
 * to the Groq-hosted fallback.
 *
 * Qwen is Groq-hosted and shares Groq's JSON-mode handling, so it maps to the
 * Groq profile. Anything else gets the generic profile.
 */
export function spanProfileIdFor(provider: ProviderType): SpanProviderId {
  switch (provider) {
    case "openai":
      return "openai";
    case "gemini":
      return "gemini";
    case "groq":
    case "qwen":
      return "groq";
    default:
      return "generic";
  }
}

export function resolveSpanProviderProfile(
  provider: ProviderType,
): SpanProviderProfile {
  const id = spanProfileIdFor(provider);
  if (id === "generic") {
    logger.warn("No span profile for provider; using the generic profile", {
      operation: "resolveSpanProviderProfile",
      provider,
    });
  }
  return SPAN_PROVIDER_PROFILES[id];
}
