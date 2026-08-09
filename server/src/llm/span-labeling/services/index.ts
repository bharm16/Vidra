/**
 * Span Labeling Services - Index
 *
 * One extraction strategy, parameterised by a provider profile (ADR-0020).
 * Use `createLlmClient()` with the provider from
 * `aiService.resolveExecution("span_labeling")`.
 *
 * Architecture:
 * - SpanLabelingClient: the try/validate/repair cycle, shared by all providers
 * - providers/*.profile.ts: everything provider-specific, one module each
 * - LlmClientFactory: maps the router's resolved provider to its profile
 */

export {
  SpanLabelingClient,
  type ModelResponse,
  type ProviderRequestOptions,
} from "./SpanLabelingClient.js";
export { createLlmClient, spanProfileIdFor } from "./LlmClientFactory.js";
export type {
  ILlmClient,
  LlmSpanParams,
  LlmClientProvider,
} from "./ILlmClient.js";
export type {
  SpanProviderId,
  SpanProviderProfile,
} from "../providers/types.js";
export { SPAN_PROVIDER_PROFILES } from "../providers/registry.js";
