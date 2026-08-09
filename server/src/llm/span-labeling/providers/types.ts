/**
 * Span-labeling provider profiles (ADR-0020).
 *
 * Everything provider-specific about a span-labeling request lives in one
 * profile. Before this, adding a provider meant editing six places — the
 * `ProviderType` union, a ten-boolean capability row, a bespoke schema
 * module, an if-chain in the schema factory, an `ILlmClient` subclass, and a
 * factory case — with nothing checking they agreed, and a wrong capability
 * row changed prompt text silently.
 *
 * The profile is looked up once, from the provider the router actually chose
 * (`aiService.resolveExecution()`), and never re-derived.
 */

import type { JSONSchema } from "@utils/provider/schemas/types";
import type { parseJson } from "../utils/jsonUtils";
import type { LabelSpansResult } from "../types";
import type { ProviderRequestOptions } from "../services/robust-llm-client/modelInvocation";
import type { LlmSpanParams } from "../services/ILlmClient";

export const SPAN_PROVIDER_IDS = [
  "openai",
  "groq",
  "gemini",
  "generic",
] as const;
export type SpanProviderId = (typeof SPAN_PROVIDER_IDS)[number];

/** Metadata the model invocation captured, handed to `postProcess`. */
export type SpanResponseMetadata = {
  averageConfidence?: number;
  optimizations?: string[];
  [key: string]: unknown;
};

export interface SpanProviderProfile {
  id: SpanProviderId;

  /**
   * The string handed to `buildSystemPrompt`, which selects the prompt arm.
   *
   * Deliberately separate from `id`: the generic profile asks for the Groq
   * prompt while sending the Gemini schema — see `generic.profile.ts`.
   */
  promptProviderName: string;

  /**
   * The JSON schema sent with the request, or `undefined` to send none.
   *
   * Replaces the old `strictJsonSchema || provider === "groq" || provider ===
   * "qwen"` expression plus a schema-factory if-chain. Each profile states
   * its own answer, and it is the same answer that expression produced.
   */
  jsonSchema: JSONSchema | undefined;

  /**
   * Per-provider request flags. These are deliberate overrides, not derived
   * capabilities — ADR-0001 called this out and ADR-0020 preserves it.
   */
  requestOptions: Omit<ProviderRequestOptions, "providerName">;

  /** Token ceiling override, for providers whose responses run long. */
  maxTokens?: number;

  /**
   * Send the raw prompt text as the user payload instead of the structured
   * task/policy envelope.
   */
  rawTextPayload: boolean;

  /**
   * Loosen validation for providers that return looser spans: drops the
   * non-technical word limit and lowers the confidence floor.
   */
  relaxValidation: boolean;

  /** Provider-specific parsing, for responses the generic parser can't read. */
  parseResponseText?: (text: string) => ReturnType<typeof parseJson>;

  /** Provider-specific reshaping of the parsed object before validation. */
  normalizeParsedResponse?: <T extends Record<string, unknown>>(value: T) => T;

  /** Provider-specific adjustment of the finished result. */
  postProcess?: (
    result: LabelSpansResult,
    metadata: SpanResponseMetadata,
  ) => LabelSpansResult;

  /**
   * Per-span streaming, when the provider can emit spans incrementally.
   * Absent means the caller falls back to a buffered call.
   */
  streamSpans?: (
    params: LlmSpanParams,
  ) => AsyncGenerator<Record<string, unknown>, void, unknown>;
}
