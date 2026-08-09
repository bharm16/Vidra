/**
 * The text-provider adapter port.
 *
 * `LLMClient` owns the cross-provider concerns — circuit breaking, retries,
 * concurrency limiting, metrics — and delegates protocol-specific work to an
 * adapter. This is the contract between them.
 *
 * It used to live as a file-private `interface Adapter` inside LLMClient.ts.
 * Because it could not be named from outside, no adapter could declare
 * conformance, and LLMClient compensated by feature-detecting at runtime
 * (`typeof adapter.complete !== "function"`). A fifth adapter therefore got
 * no compile-time contract at all — the mistake surfaced at boot, or on the
 * first call to a method nobody implemented. Exporting the port removes the
 * need for both the guesswork and the runtime checks.
 */

import type {
  AIResponse,
  LLMAdapterOptions,
  LLMAdapterStreamOptions,
  LLMAdapterHealth,
} from "./IAIClient";

/**
 * Request options every adapter understands.
 *
 * Every member is optional: adapters read the subset their protocol supports
 * and ignore the rest. Provider-specific extras (Llama's `enablePrefill`,
 * Gemini's `thinkingBudget`) live on each adapter's own options type, which
 * extends this one.
 */
export interface LLMAdapter<
  TOptions extends LLMAdapterOptions = LLMAdapterOptions,
> {
  complete(systemPrompt: string, options?: TOptions): Promise<AIResponse>;

  streamComplete?(
    systemPrompt: string,
    options: LLMAdapterStreamOptions<TOptions>,
  ): Promise<string>;

  healthCheck?(): Promise<LLMAdapterHealth>;

  capabilities?: {
    streaming?: boolean;
    [key: string]: unknown;
  };
}
