/**
 * Build the span-labeling client for the provider that will run the request.
 *
 * The provider is supplied by the caller, from `aiService.resolveExecution()`.
 * It is deliberately NOT re-derived here. This module used to resolve it from
 * `process.env` and `ModelConfig` through a five-tier cascade — neither of
 * which can see client availability or circuit state — so a Gemini-shaped
 * request could be built for a call the router had already rerouted to the
 * Groq-hosted fallback.
 *
 * There is one client class now (ADR-0020). What used to be four subclasses
 * is a profile looked up here; "changes to Groq must not affect OpenAI" is
 * enforced by each provider owning its own profile module rather than by
 * separate subclasses sharing a base.
 */

import { SpanLabelingClient } from "./SpanLabelingClient";
import { resolveSpanProviderProfile } from "../providers/registry";
import type { ProviderType } from "@utils/provider/ProviderDetector";
import type { ILlmClient } from "./ILlmClient";

export { spanProfileIdFor } from "../providers/registry";

/**
 * @param provider - From `aiService.resolveExecution("span_labeling").provider`
 */
export function createLlmClient(provider: ProviderType): ILlmClient {
  return new SpanLabelingClient(resolveSpanProviderProfile(provider));
}
