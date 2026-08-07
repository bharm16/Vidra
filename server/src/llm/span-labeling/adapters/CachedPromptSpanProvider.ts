import { labelSpans } from "../SpanLabelingService";
import type { AIExecutionPort } from "@services/ai-model/ports/AIExecutionPort";
import type { SpanLabelingCacheService } from "@services/cache/SpanLabelingCacheService";
import type { PromptSpanProvider } from "../ports/PromptSpanProvider";
import type { LLMSpan, LabelSpansParams, LabelSpansResult } from "../types";

/**
 * Production adapter for the PromptSpanProvider port.
 *
 * Wraps `labelSpans` and consults `SpanLabelingCacheService.getOrCompute` so
 * the underlying LLM call is single-flight coalesced and cached. Falls back
 * to a direct `labelSpans` invocation when no cache is configured.
 */
export class CachedPromptSpanProvider implements PromptSpanProvider {
  constructor(
    private readonly aiService: AIExecutionPort,
    private readonly cache: SpanLabelingCacheService | null,
  ) {}

  async label(
    prompt: string,
    options: Omit<LabelSpansParams, "text"> = {},
  ): Promise<LLMSpan[]> {
    const result = await this.labelFull(prompt, options);
    return Array.isArray(result.spans) ? result.spans : [];
  }

  async labelFull(
    prompt: string,
    options: Omit<LabelSpansParams, "text"> = {},
  ): Promise<LabelSpansResult> {
    const params: LabelSpansParams = { text: prompt, ...options };

    if (!this.cache) {
      return labelSpans(params, this.aiService);
    }

    // The key must exist before the value does, so this is the router's
    // pre-flight answer rather than the produced provider. It is accurate
    // unless a circuit trips mid-call; the post-compute paths that CAN key on
    // the produced provider (see streamingHandler's backfill) do so.
    const provider = this.aiService.resolveExecution("span_labeling").provider;
    const ttl = prompt.length > 2000 ? 300 : 3600;

    const { value } = await this.cache.getOrCompute(
      prompt,
      options.policy ?? null,
      options.templateVersion ?? null,
      () => labelSpans(params, this.aiService),
      { ttl, provider },
    );

    return value as LabelSpansResult;
  }
}
